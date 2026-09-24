import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { buildDocumentPreview } from './documentPreview'
import './App.css'

// Kullanıcı deneyimi için ön kontroller; kabul kararı backend'e aittir (D-040).
const MAX_FILE_SIZE = 50 * 1024 * 1024
const MAX_BATCH_FILES = 5 // D-040: yalnız arayüz sınırı; backend'de toplu işlem kavramı yok
const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png']
const REQUEST_TIMEOUT_MS = 120_000 // D-039: her istek için ayrı

// Belge Görünümü yalnız bu türlerde açılır. Blob türü, sunucunun imza doğrulamasından geçen file_type'tan
// gelir; tarayıcının tahminine bırakılmaz (D-045). DOC/DOCX yalnız çıkarılan metinle önizlenir.
const PREVIEW_MEDIA_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
}

const UNSUPPORTED_FILE_MESSAGE = 'Yalnızca PDF, DOC, DOCX, JPG, JPEG veya PNG dosyaları desteklenir.'
const FILE_TOO_LARGE_MESSAGE = "Dosya boyutu 50 MB'ı aşamaz."
const NOT_SENT_MESSAGE = 'Dosya gönderilemedi. Lütfen bir PDF, DOC, DOCX, JPG, JPEG veya PNG dosyası seçip tekrar deneyin.'
const TEXT_FAILED_MESSAGE = 'Belge içeriği işlenemedi veya yeterli metin çıkarılamadı.'
const CLASSIFICATION_FAILED_MESSAGE = 'Belge şu anda sınıflandırılamadı. Lütfen daha sonra tekrar deneyin.'
const UNEXPECTED_MESSAGE = 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.'
const NETWORK_MESSAGE = 'Sunucuya ulaşılamadı. Lütfen bağlantıyı kontrol edip tekrar deneyin.'
const TIMEOUT_MESSAGE = 'İşlem zaman aşımına uğradı. Lütfen tekrar deneyin.'
const RECORDS_FAILED_MESSAGE = 'Kayıtlar yüklenemedi. Lütfen tekrar deneyin.'
const DETAIL_FAILED_MESSAGE = 'Belge ayrıntısı yüklenemedi. Lütfen tekrar deneyin.'
const DUPLICATE_FILE_MESSAGE = 'Bu dosya listede zaten var.'
const ANALYZE_RETRY_MESSAGE = 'Analiz tamamlanamadı; tekrar deneyebilirsiniz.'
const ANALYZE_CONFLICT_MESSAGE = 'Belge şu anda analiz edilemedi. Sorun sürerse dosyayı kaldırıp yeniden ekleyin.'
const RECOVERY_FAILED_MESSAGE = 'Analiz sonucu doğrulanamadı; tekrar deneyebilirsiniz.'
const EXPIRED_MESSAGE = 'Belge bulunamadı veya süresi doldu; dosyayı yeniden ekleyin.'
const DISCARD_FAILED_MESSAGE = 'Dosya kaldırılamadı. Lütfen tekrar deneyin.'
const ALREADY_PROCESSED_DISCARD_MESSAGE = "Belge zaten işlenmiş olduğu için sunucudan silinmedi; Kayıtlar'da görünür."
const PDF_UNSUPPORTED_MESSAGE = 'Bu tarayıcı PDF görüntülemeyi desteklemiyor; belgeyi "Çıkarılan Metni Gör" ile kontrol edebilirsiniz.'

const STATUS_LABELS: Record<DocumentStatus, string> = {
  classified: 'Sınıflandırıldı',
  needs_review: 'İnceleme gerekli',
  failed: 'Başarısız',
}

type DocumentStatus = 'classified' | 'needs_review' | 'failed'

type ClassifyResponse = {
  document_id: string
  file_name: string
  file_type: string
  document_type: string | null
  document_type_name: string | null
  institution_id: string | null
  institution_name: string | null
  needs_review: boolean
  review_reason: string | null
  // V1.2: sınıflandırmayla aynı çağrıdan gelir; failed kayıtlarda ve eski kayıtlarda null.
  summary: string | null
  sender_name: string | null
  sender_institution: string | null
  status: DocumentStatus
  message?: string
}

// GET /api/documents: classify alanları + created_at. extracted_text ve storage yolu dönmez.
type DocumentSummary = Omit<ClassifyResponse, 'message'> & { created_at: string }

// GET /api/documents/{id}: özet alanları + çıkarılan metnin tamamı.
type DocumentDetail = DocumentSummary & { extracted_text: string | null }

// POST /api/documents/prepare (200). prepared kalıcı bir kayıt statüsü değildir: DocumentStatus'a eklenmez,
// Kayıtlar'da görünmez (D-046). Yalnız arayüzün kullandığı alanlar tiplenir.
type PreparedDocument = {
  document_id: string
  file_name: string
  file_type: string
  status: 'prepared'
  extracted_text: string | null // backend şemasıyla aynı (nullable); prepared kayıtta pratikte dolu
  created_at: string
}

// Yalnız arayüz durumu; backend'e gitmez.
type BatchState = 'queued' | 'preparing' | 'ready' | 'waiting' | 'analyzing' | 'done' | 'review' | 'failed'

type BatchItem = {
  key: number
  file: File
  state: BatchState
  selected: boolean
  removing: boolean // discard isteği sürüyor
  prepared: PreparedDocument | null
  result: ClassifyResponse | null // prepare'in failed (422) gövdesi veya sınıflandırma sonucu
  error: string | null // yalnız genel Türkçe mesaj; teknik ayrıntı gösterilmez
}

type Notice = { kind: 'error' | 'info'; messages: string[] }

// Orijinal belge penceresi: object URL yalnız pencere açıkken yaşar.
type ViewerState = { key: number; name: string; fileType: string; url: string }

type RequestResult = { status: number | null; body: unknown; timedOut: boolean }

const BATCH_LABELS: Record<BatchState, string> = {
  queued: 'Hazırlanıyor',
  preparing: 'Hazırlanıyor',
  ready: 'Önizlemeye Hazır',
  waiting: 'Bekliyor',
  analyzing: 'Analiz Ediliyor',
  done: 'Tamamlandı',
  review: 'İnceleme Gerekiyor',
  failed: 'Başarısız',
}

const TERMINAL_STATES: BatchState[] = ['done', 'review', 'failed']

function fileProblem(file: File): string | null {
  const name = file.name.toLowerCase()
  if (!ALLOWED_EXTENSIONS.some((extension) => name.endsWith(extension))) {
    return UNSUPPORTED_FILE_MESSAGE
  }
  if (file.size > MAX_FILE_SIZE) {
    return FILE_TOO_LARGE_MESSAGE
  }
  return null
}

// Kabul sonrası failed gövdesi (D-034) status = "failed" taşır; FastAPI doğrulama hatası yalnızca "detail" içerir.
function isFailedBody(body: unknown): body is { status: 'failed'; message?: unknown } {
  return typeof body === 'object' && body !== null && 'status' in body && body.status === 'failed'
}

function errorMessage(httpStatus: number, body: unknown): string {
  // Backend'in failed mesajı genel ve kullanıcıya yöneliktir; başka hiçbir gövde içeriği gösterilmez.
  const backendMessage =
    isFailedBody(body) && typeof body.message === 'string' && body.message.trim() !== '' ? body.message : null

  switch (httpStatus) {
    case 413:
      return FILE_TOO_LARGE_MESSAGE
    case 415:
      return UNSUPPORTED_FILE_MESSAGE
    case 422:
      return isFailedBody(body) ? (backendMessage ?? TEXT_FAILED_MESSAGE) : NOT_SENT_MESSAGE
    case 502:
      return backendMessage ?? CLASSIFICATION_FAILED_MESSAGE
    default:
      return UNEXPECTED_MESSAGE
  }
}

function isPreparedBody(body: unknown): body is PreparedDocument {
  return typeof body === 'object' && body !== null && 'status' in body && body.status === 'prepared'
}

function stateForStatus(status: DocumentStatus): BatchState {
  if (status === 'classified') {
    return 'done'
  }
  return status === 'needs_review' ? 'review' : 'failed'
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
}

// Sunucunun doğruladığı tür; yalnız backend'in kabul ettiği (kaydı olan) dosyalarda vardır.
function serverFileType(item: BatchItem): string | null {
  return item.prepared?.file_type ?? item.result?.file_type ?? null
}

// Her istek kendi zaman aşımını uygular (D-039). Göreli yol Vite proxy üzerinden backend'e gider (D-038).
async function request(url: string, init: RequestInit = {}): Promise<RequestResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    const body: unknown = await response.json().catch(() => null)
    return { status: response.status, body, timedOut: false }
  } catch (caught) {
    return { status: null, body: null, timedOut: caught instanceof DOMException && caught.name === 'AbortError' }
  } finally {
    clearTimeout(timeout)
  }
}

function requestProblem(result: RequestResult): string {
  if (result.status === null) {
    return result.timedOut ? TIMEOUT_MESSAGE : NETWORK_MESSAGE
  }
  return errorMessage(result.status, result.body)
}

function formatSize(bytes: number): string {
  const megabytes = bytes / (1024 * 1024)
  if (megabytes >= 1) {
    return `${megabytes.toFixed(1)} MB`
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '-'
  }
  return date.toLocaleString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

// Dosya türü rozeti; ikon kütüphanesi yerine küçük satır içi SVG.
function FileTypeIcon({ fileType }: { fileType: string }) {
  return (
    <span className="file-icon" aria-hidden="true">
      <svg viewBox="0 0 16 20" width="14" height="18" focusable="false">
        <path d="M2 1h7l5 5v13H2z" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M9 1v5h5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </svg>
      {fileType.toUpperCase()}
    </span>
  )
}

function RecordsView() {
  const [documents, setDocuments] = useState<DocumentSummary[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [detail, setDetail] = useState<DocumentDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  // Durum yalnızca istek sonuçlandığında güncellenir; efekt içinde senkron setState yapılmaz.
  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/documents')
      if (!response.ok) {
        setMessage(RECORDS_FAILED_MESSAGE)
        return
      }
      setDocuments((await response.json()) as DocumentSummary[])
      setMessage(null)
    } catch {
      setMessage(RECORDS_FAILED_MESSAGE)
    }
  }, [])

  useEffect(() => {
    // Kurulumda kayıtları backend'den çeker: kuralın istisna saydığı "dış sistemle senkronizasyon".
    // setState çağrıları await'ten sonra olur, render döngüsü tetiklemez.
    // oxlint-disable-next-line react/set-state-in-effect
    void load()
  }, [load])

  async function toggle(documentId: string) {
    if (openId === documentId) {
      setOpenId(null)
      setDetail(null)
      return
    }
    setOpenId(documentId)
    setDetail(null)
    setDetailLoading(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/documents/${documentId}`)
      if (!response.ok) {
        setMessage(DETAIL_FAILED_MESSAGE)
        return
      }
      setDetail((await response.json()) as DocumentDetail)
    } catch {
      setMessage(DETAIL_FAILED_MESSAGE)
    } finally {
      setDetailLoading(false)
    }
  }

  if (documents === null && message === null) {
    return <p className="status" role="status">Kayıtlar yükleniyor...</p>
  }

  return (
    <section className="records">
      <div className="records-head">
        <h2>Kayıtlar</h2>
        <button type="button" className="secondary" onClick={() => void load()}>
          Yenile
        </button>
      </div>

      {message !== null && (
        <div className="notice error" role="alert">
          <p>{message}</p>
        </div>
      )}

      {documents !== null && documents.length === 0 && (
        <p className="empty">Henüz sınıflandırılmış belge yok. İlk belgeyi "Belge Sınıflandırma" sekmesinden yükleyebilirsiniz.</p>
      )}

      {(documents ?? []).length > 0 && (
        <table className="records-table">
          <thead>
            <tr>
              <th scope="col">Belge Adı</th>
              <th scope="col">Gideceği Kurum</th>
              <th scope="col">Durum</th>
              <th scope="col">Tarih</th>
              <th scope="col" className="col-file">Dosya</th>
            </tr>
          </thead>
          <tbody>
            {(documents ?? []).map((item) => (
              <Fragment key={item.document_id}>
                <tr className={openId === item.document_id ? 'open' : undefined}>
                  <td data-label="Belge Adı">
                    {/* Detayı yalnızca bu buton açar; indirme ayrı hücrede olduğundan tıklamalar çakışmaz. */}
                    <button
                      type="button"
                      className="record-main"
                      onClick={() => void toggle(item.document_id)}
                      aria-expanded={openId === item.document_id}
                    >
                      <span className="chevron" aria-hidden="true" />
                      {/* Tam ad DOM içinde kalır; kısaltma yalnızca görseldir, title fare kullanıcısı içindir. */}
                      <span className="record-name" title={item.file_name}>
                        {item.file_name}
                      </span>
                    </button>
                  </td>
                  <td data-label="Gideceği Kurum" className="col-institution">
                    {item.institution_name ?? 'Belirlenemedi'}
                  </td>
                  <td data-label="Durum">
                    <span className={`badge ${item.status}`}>{STATUS_LABELS[item.status]}</span>
                  </td>
                  <td data-label="Tarih" className="record-date">
                    {formatDate(item.created_at)}
                  </td>
                  <td data-label="Dosya" className="col-file">
                    <a
                      className="download"
                      href={`/api/documents/${item.document_id}/download`}
                      title={`${item.file_name} dosyasını indir`}
                    >
                      <FileTypeIcon fileType={item.file_type} />
                      <span className="visually-hidden">{item.file_name} dosyasını indir</span>
                    </a>
                  </td>
                </tr>

                {openId === item.document_id && (
                  <tr className="detail-row">
                    <td colSpan={5}>
                      <div className="record-detail">
                        {item.summary !== null && <p className="record-summary">{item.summary}</p>}

                        {(item.sender_name !== null || item.sender_institution !== null) && (
                          <p className="record-sender">
                            <strong>Gönderen:</strong>{' '}
                            {[item.sender_name, item.sender_institution].filter((value) => value !== null).join(' · ')}
                          </p>
                        )}

                        {item.status === 'needs_review' && item.review_reason !== null && (
                          <p className="review-reason">
                            <strong>İnceleme nedeni:</strong> {item.review_reason}
                          </p>
                        )}

                        {detailLoading && (
                          <p className="status" role="status">
                            Belge metni yükleniyor...
                          </p>
                        )}
                        {detail !== null && (
                          <>
                            <h3>Çıkarılan metin</h3>
                            <pre className="extracted-text">
                              {detail.extracted_text ?? 'Bu belgeden metin çıkarılamadı.'}
                            </pre>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

function ResultCard({ result }: { result: ClassifyResponse }) {
  return (
    <section className={result.needs_review ? 'notice review' : 'notice success'}>
      <h2>{result.needs_review ? 'İnsan incelemesi gerekiyor' : 'Belge başarıyla sınıflandırıldı.'}</h2>
      {result.needs_review && <p>Belge işlendi; sonucun bir kişi tarafından kontrol edilmesi gerekiyor.</p>}
      <dl>
        <dt>Dosya</dt>
        <dd>{result.file_name}</dd>
        <dt>Belge Türü</dt>
        <dd>{result.document_type_name ?? 'Belirlenemedi'}</dd>
        <dt>Gönderileceği Kurum</dt>
        <dd>{result.institution_name ?? 'Belirlenemedi'}</dd>
        {/* Gönderen alanları yalnızca belgede açıkça yazıyorsa gösterilir. */}
        {result.sender_name !== null && (
          <>
            <dt>Gönderen Kişi</dt>
            <dd>{result.sender_name}</dd>
          </>
        )}
        {result.sender_institution !== null && (
          <>
            <dt>Gönderen Kurum</dt>
            <dd>{result.sender_institution}</dd>
          </>
        )}
        {result.summary !== null && (
          <>
            <dt>Belge Özeti</dt>
            <dd className="summary">{result.summary}</dd>
          </>
        )}
      </dl>
      {result.needs_review && result.review_reason !== null && (
        <p className="review-reason">
          <strong>İnceleme nedeni:</strong> {result.review_reason}
        </p>
      )}
    </section>
  )
}

// Bulunamayan alan hata değildir: "—" gösterilir, ekran okuyucuya anlamı söylenir.
function FieldValue({ value, className }: { value: string | null; className?: string }) {
  if (value === null) {
    return (
      <dd className="missing">
        <span aria-hidden="true">—</span>
        <span className="visually-hidden">Belgede açıkça bulunamadı</span>
      </dd>
    )
  }
  return <dd className={className}>{value}</dd>
}

// Satırın altında açılan önizleme (D-045). Varsayılan görünüm, çıkarılan metinden tarayıcıda oluşturulan yapılandırılmış
// "Belge Önizlemesi" formudur; orijinal belge ve ham metin yardımcı görünümlerdir. Gemini çağrılmaz.
function PreviewPanel({
  id,
  item,
  textOpen,
  onToggleText,
  onViewOriginal,
  onSelect,
}: {
  id: string
  item: BatchItem
  textOpen: boolean
  onToggleText: () => void
  onViewOriginal: () => void
  onSelect: (selected: boolean) => void
}) {
  const fileType = serverFileType(item)
  const text = item.prepared?.extracted_text ?? null
  const preview = buildDocumentPreview(text, item.file.name)
  const titleId = `${id}-title`
  const textId = `${id}-text`
  const canViewOriginal = fileType !== null && fileType in PREVIEW_MEDIA_TYPES
  const canSelect = item.state === 'ready' || item.state === 'waiting'

  return (
    <div className="record-detail preview" id={id}>
      <section className="doc-preview" aria-labelledby={titleId}>
        <h3 id={titleId}>Belge Önizlemesi</h3>
        <dl className="preview-fields">
          <div className="field wide">
            <dt>Dosya</dt>
            <dd>{preview.fileName}</dd>
          </div>
          <div className="field wide">
            <dt>Hitap / Başlık</dt>
            <FieldValue value={preview.heading} />
          </div>
          <div className="field wide">
            <dt>Konu</dt>
            <FieldValue value={preview.subject} />
          </div>
          <div className="field">
            <dt>Tarih</dt>
            <FieldValue value={preview.date} />
          </div>
          <div className="field">
            <dt>Evrak No</dt>
            <FieldValue value={preview.documentNo} />
          </div>
          <div className="field">
            <dt>Gönderen</dt>
            <FieldValue value={preview.sender} />
          </div>
          <div className="field">
            <dt>Gönderen Kurum</dt>
            <FieldValue value={preview.senderInstitution} />
          </div>
          <div className="field wide">
            <dt>Belge İçeriği</dt>
            {text === null ? (
              <dd className="missing">Bu belgeden metin çıkarılamadı.</dd>
            ) : (
              <FieldValue value={preview.content} className="content" />
            )}
          </div>
        </dl>
        {text !== null && canSelect && (
          <p className="hint">"—": belgede açıkça bulunamadı. Bu bir hata değildir; belge yine analiz edilebilir.</p>
        )}

        <div className="preview-actions">
          {canViewOriginal && (
            <button type="button" className="secondary" onClick={onViewOriginal}>
              Orijinal Belgeyi Gör
            </button>
          )}
          {text !== null && (
            <button type="button" className="secondary" onClick={onToggleText} aria-expanded={textOpen} aria-controls={textId}>
              {textOpen ? 'Çıkarılan Metni Gizle' : 'Çıkarılan Metni Gör'}
            </button>
          )}
        </div>
        {(fileType === 'doc' || fileType === 'docx') && (
          <p className="hint">Word belgelerinin görünümü gösterilmez; önizleme çıkarılan metinden oluşturulur.</p>
        )}
        {textOpen && text !== null && (
          <pre className="extracted-text" id={textId}>
            {text}
          </pre>
        )}

        {canSelect && (
          <label className="include-toggle">
            <input
              type="checkbox"
              checked={item.selected}
              disabled={item.state !== 'ready' || item.removing}
              onChange={(event) => onSelect(event.target.checked)}
            />
            Analize dahil et
          </label>
        )}
      </section>

      {item.result !== null && (item.state === 'done' || item.state === 'review') && <ResultCard result={item.result} />}
    </div>
  )
}

// Orijinal belge, ikincil görünüm olarak ayrı bir pencerede açılır (PDF: tarayıcının PDF görüntüleyicisi, görüntü: <img>).
// Yerel <dialog>: odak pencerede kalır, Esc kapatır, arka plan tıklaması da kapatır.
function OriginalDocumentModal({ viewer, onClose }: { viewer: ViewerState; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog !== null && !dialog.open) {
      dialog.showModal()
    }
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className="viewer-dialog"
      aria-labelledby="viewer-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div className="viewer-head">
        <div className="viewer-title">
          <h2 id="viewer-title">Orijinal Belge</h2>
          <p>{viewer.name}</p>
        </div>
        <button type="button" className="secondary" onClick={onClose} autoFocus>
          Kapat
        </button>
      </div>
      <div className="viewer-body">
        {viewer.fileType === 'pdf' && navigator.pdfViewerEnabled === false && <p className="hint">{PDF_UNSUPPORTED_MESSAGE}</p>}
        {viewer.fileType === 'pdf' && navigator.pdfViewerEnabled !== false && (
          <object className="preview-frame" data={viewer.url} type="application/pdf" aria-label={`${viewer.name} orijinal belge`}>
            <p className="hint">{PDF_UNSUPPORTED_MESSAGE}</p>
          </object>
        )}
        {viewer.fileType !== 'pdf' && <img className="preview-image" src={viewer.url} alt={`${viewer.name} orijinal belge`} />}
      </div>
    </dialog>
  )
}

function App() {
  const [view, setView] = useState<'classify' | 'records'>('classify')

  // Toplu işlem durumu App'te tutulur: Kayıtlar'a geçmek listeyi ve çalışan turu bozmaz.
  // itemsRef tek doğruluk kaynağıdır (sıralı çalıştırıcı await sonrasında güncel listeyi okur); state onun yansımasıdır.
  const itemsRef = useRef<BatchItem[]>([])
  const [items, setItems] = useState<BatchItem[]>([])
  const nextKeyRef = useRef(1)
  const runningRef = useRef(false)
  const [running, setRunning] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [dragActive, setDragActive] = useState(false)
  // Tek açık önizleme paneli; içerik her render'da o satırın kendi verisinden türetilir, satırlar arasında karışmaz.
  const [openKey, setOpenKey] = useState<number | null>(null)
  const [textOpen, setTextOpen] = useState(false)
  const viewerRef = useRef<ViewerState | null>(null)
  const [viewer, setViewerState] = useState<ViewerState | null>(null)

  useEffect(() => {
    // Bırakma alanı dışına bırakılan dosya tarayıcıyı sayfadan çıkarıp listeyi kaybettirmesin.
    const prevent = (event: Event) => event.preventDefault()
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    return () => {
      window.removeEventListener('dragover', prevent)
      window.removeEventListener('drop', prevent)
    }
  }, [])

  useEffect(() => {
    return () => {
      const url = viewerRef.current?.url
      if (url) {
        URL.revokeObjectURL(url)
      }
    }
  }, [])

  function commit(next: BatchItem[]) {
    itemsRef.current = next
    setItems(next)
  }

  function patch(key: number, changes: Partial<BatchItem>) {
    commit(itemsRef.current.map((item) => (item.key === key ? { ...item, ...changes } : item)))
  }

  // Önceki object URL, yerine yenisi geçtiğinde ya da pencere kapandığında serbest bırakılır.
  function setViewer(next: ViewerState | null) {
    const currentUrl = viewerRef.current?.url
    if (currentUrl && currentUrl !== next?.url) {
      URL.revokeObjectURL(currentUrl)
    }
    viewerRef.current = next
    setViewerState(next)
  }

  function drop(keys: number[]) {
    if (viewerRef.current !== null && keys.includes(viewerRef.current.key)) {
      setViewer(null)
    }
    setOpenKey((current) => (current !== null && keys.includes(current) ? null : current))
    commit(itemsRef.current.filter((item) => !keys.includes(item.key)))
  }

  function addFiles(files: File[]) {
    const current = itemsRef.current
    const accepted: BatchItem[] = []
    const problems: string[] = []
    let overLimit = 0
    for (const file of files) {
      const problem = fileProblem(file)
      const duplicate = [...current, ...accepted].some(
        (item) => item.file.name === file.name && item.file.size === file.size && item.file.lastModified === file.lastModified,
      )
      if (problem !== null) {
        problems.push(`${file.name}: ${problem}`)
      } else if (duplicate) {
        problems.push(`${file.name}: ${DUPLICATE_FILE_MESSAGE}`)
      } else if (current.length + accepted.length >= MAX_BATCH_FILES) {
        overLimit += 1
      } else {
        accepted.push({
          key: nextKeyRef.current++,
          file,
          state: 'queued',
          selected: false,
          removing: false,
          prepared: null,
          result: null,
          error: null,
        })
      }
    }
    if (overLimit > 0) {
      problems.push(`En fazla ${MAX_BATCH_FILES} dosya eklenebilir; ${overLimit} dosya eklenmedi.`)
    }
    setNotice(problems.length > 0 ? { kind: 'error', messages: problems } : null)
    if (accepted.length > 0) {
      commit([...current, ...accepted])
      void runQueue()
    }
  }

  // Tek çalıştırıcı: backend'e aynı anda yalnız bir prepare veya classify isteği gider (D-045).
  async function runQueue() {
    if (runningRef.current) {
      return
    }
    runningRef.current = true
    setRunning(true)
    try {
      for (;;) {
        // Liste sırasındaki ilk bekleyen satır; kaldırılmakta olanlar atlanır.
        const next = itemsRef.current.find((item) => !item.removing && (item.state === 'queued' || item.state === 'waiting'))
        if (next === undefined) {
          break
        }
        if (next.state === 'queued') {
          await prepareItem(next)
        } else {
          await analyzeItem(next)
        }
      }
    } finally {
      runningRef.current = false
      setRunning(false)
    }
  }

  async function prepareItem(item: BatchItem) {
    patch(item.key, { state: 'preparing', error: null })
    const body = new FormData()
    body.append('file', item.file) // Content-Type header'ı elle verilmez; boundary'yi tarayıcı üretir.
    const result = await request('/api/documents/prepare', { method: 'POST', body })
    if (result.status === 200 && isPreparedBody(result.body)) {
      patch(item.key, { state: 'ready', selected: true, prepared: result.body })
      return
    }
    // 422 failed gövdesi kabul edilmiş bir dosyadır (D-004): Belge Görünümü için türü saklanır.
    const failedBody = isFailedBody(result.body) ? (result.body as ClassifyResponse) : null
    patch(item.key, { state: 'failed', result: failedBody, error: requestProblem(result) })
  }

  async function analyzeItem(item: BatchItem) {
    const documentId = item.prepared?.document_id
    if (documentId === undefined) {
      patch(item.key, { state: 'failed', error: UNEXPECTED_MESSAGE })
      return
    }
    patch(item.key, { state: 'analyzing', error: null })
    const result = await request(`/api/documents/${documentId}/classify`, { method: 'POST' })
    if (result.status === 200) {
      const body = result.body as ClassifyResponse
      patch(item.key, { state: stateForStatus(body.status), result: body })
    } else if (result.status === 409) {
      await recoverAfterConflict(item.key, documentId)
    } else if (result.status === 404) {
      patch(item.key, { state: 'failed', error: EXPIRED_MESSAGE })
    } else if (result.status === 502) {
      const failedBody = isFailedBody(result.body) ? (result.body as ClassifyResponse) : null
      patch(item.key, { state: 'failed', result: failedBody, error: errorMessage(502, result.body) })
    } else {
      // 500 / ağ hatası / zaman aşımı: kayıt hâlâ prepared olabilir; seçili kalır ve tekrar denenebilir.
      patch(item.key, { state: 'ready', selected: true, error: ANALYZE_RETRY_MESSAGE })
    }
  }

  // 409: istemci zaman aşımına uğramışken backend işlemi bitirmiş olabilir. Gerçek durum mevcut detay
  // endpoint'inden okunur; Gemini tekrar çağrılmaz (D-046).
  async function recoverAfterConflict(key: number, documentId: string) {
    const result = await request(`/api/documents/${documentId}`)
    if (result.status === 200 && isPreparedBody(result.body)) {
      patch(key, { state: 'ready', selected: true, error: ANALYZE_CONFLICT_MESSAGE })
    } else if (result.status === 200) {
      const detail = result.body as DocumentDetail
      patch(key, {
        state: stateForStatus(detail.status),
        result: detail,
        error: detail.status === 'failed' ? CLASSIFICATION_FAILED_MESSAGE : null,
      })
    } else if (result.status === 404) {
      patch(key, { state: 'failed', error: EXPIRED_MESSAGE })
    } else {
      patch(key, { state: 'ready', selected: true, error: RECOVERY_FAILED_MESSAGE })
    }
  }

  // Kaldır: sunucuda prepared kaydı olan satır discard edilir (D-046); sıradaki ve terminal satırlar yalnız listeden çıkar.
  async function removeItem(key: number) {
    const item = itemsRef.current.find((candidate) => candidate.key === key)
    if (item === undefined || item.removing || item.state === 'preparing' || item.state === 'analyzing') {
      return
    }
    if (item.prepared === null || (item.state !== 'ready' && item.state !== 'waiting')) {
      drop([key])
      return
    }
    patch(key, { removing: true, error: null })
    const result = await request(`/api/documents/${item.prepared.document_id}/prepared`, { method: 'DELETE' })
    if (result.status === 204 || result.status === 404) {
      drop([key]) // 404: kayıt zaten yok; hedeflenen durum sağlanmış
    } else if (result.status === 409) {
      drop([key])
      setNotice({ kind: 'info', messages: [ALREADY_PROCESSED_DISCARD_MESSAGE] })
    } else {
      patch(key, { removing: false, state: 'ready', error: DISCARD_FAILED_MESSAGE })
    }
  }

  function analyzeSelected() {
    if (runningRef.current) {
      return
    }
    commit(
      itemsRef.current.map((item) =>
        item.state === 'ready' && item.selected && !item.removing ? { ...item, state: 'waiting', error: null } : item,
      ),
    )
    void runQueue()
  }

  function clearFinished() {
    drop(itemsRef.current.filter((item) => TERMINAL_STATES.includes(item.state) && !item.removing).map((item) => item.key))
  }

  function togglePreview(item: BatchItem) {
    setOpenKey(openKey === item.key ? null : item.key)
    setTextOpen(false)
  }

  function openViewer(item: BatchItem) {
    const fileType = serverFileType(item)
    const mediaType = fileType === null ? undefined : PREVIEW_MEDIA_TYPES[fileType]
    if (fileType === null || mediaType === undefined) {
      return
    }
    const url = URL.createObjectURL(new Blob([item.file], { type: mediaType }))
    setViewer({ key: item.key, name: item.file.name, fileType, url })
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(event.target.files ?? []))
    event.target.value = '' // aynı dosya kaldırıldıktan sonra yeniden seçilebilsin
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setDragActive(true)
  }

  function handleDragLeave(event: DragEvent<HTMLElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setDragActive(false)
    }
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    setDragActive(false)
    addFiles(Array.from(event.dataTransfer.files))
  }

  const selectedCount = items.filter((item) => item.state === 'ready' && item.selected && !item.removing).length
  const hasFinished = items.some((item) => TERMINAL_STATES.includes(item.state) && !item.removing)
  const active = items.find((item) => item.state === 'preparing' || item.state === 'analyzing')
  const waitingCount = items.filter((item) => item.state === 'queued' || item.state === 'waiting').length
  const progress =
    active === undefined
      ? ''
      : `${active.file.name} ${active.state === 'preparing' ? 'hazırlanıyor' : 'analiz ediliyor'}...` +
        (waitingCount > 0 ? ` (${waitingCount} dosya sırada)` : '')

  return (
    <main>
      <header className="page-header">
        <h1>Belge Sınıflandırma</h1>
        <p className="tagline">
          Yüklenen dilekçe ve başvuruları belge türüne ve ilgili müdürlüğe göre otomatik sınıflandırır.
        </p>
      </header>

      {/* Router yok: iki görünüm arasında sade geçiş. */}
      <nav className="views">
        <button
          type="button"
          className={view === 'classify' ? 'view-tab active' : 'view-tab'}
          aria-current={view === 'classify'}
          onClick={() => setView('classify')}
        >
          Belge Sınıflandırma
        </button>
        <button
          type="button"
          className={view === 'records' ? 'view-tab active' : 'view-tab'}
          aria-current={view === 'records'}
          onClick={() => setView('records')}
        >
          Kayıtlar
        </button>
      </nav>

      {view === 'records' ? (
        <RecordsView />
      ) : (
        <>
          <section
            className={dragActive ? 'uploader drag-active' : 'uploader'}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div>
              <label htmlFor="document-files">Belge dosyaları</label>
              <p id="document-files-hint" className="hint">
                Dosyaları bu alana sürükleyip bırakın ya da seçin. En fazla {MAX_BATCH_FILES} dosya; PDF, DOC, DOCX,
                JPG, JPEG veya PNG, dosya başına en fazla 50 MB.
              </p>
            </div>
            <input
              id="document-files"
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              aria-describedby="document-files-hint"
              onChange={handleFileChange}
            />
          </section>

          {notice !== null && (
            <div className={notice.kind === 'error' ? 'notice error' : 'notice review'} role={notice.kind === 'error' ? 'alert' : 'status'}>
              {notice.messages.map((message, index) => (
                <p key={index}>{message}</p>
              ))}
            </div>
          )}

          {items.length > 0 && (
            <section className="batch" aria-label="Yüklenen dosyalar">
              <table className="records-table batch-table">
                <thead>
                  <tr>
                    <th scope="col" className="col-select">
                      <span className="visually-hidden">Analize dahil</span>
                    </th>
                    <th scope="col">Dosya</th>
                    <th scope="col">Format · Boyut</th>
                    <th scope="col">Durum</th>
                    <th scope="col" className="col-actions">
                      <span className="visually-hidden">İşlemler</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const isOpen = openKey === item.key
                    const panelId = `preview-${item.key}`
                    return (
                      <Fragment key={item.key}>
                        <tr className={isOpen ? 'open' : undefined}>
                          <td data-label="Analiz" className="col-select">
                            <input
                              type="checkbox"
                              checked={item.selected}
                              disabled={item.state !== 'ready' || item.removing}
                              onChange={(event) => patch(item.key, { selected: event.target.checked })}
                              aria-label={`${item.file.name} analize dahil`}
                            />
                          </td>
                          <td data-label="Dosya" className="col-name">
                            {/* Dar ekranda hücre flex olur; ad ve hata tek blokta alt alta kalır. */}
                            <div className="name-cell">
                              <span className="record-name">{item.file.name}</span>
                              {item.error !== null && <span className="row-error">{item.error}</span>}
                            </div>
                          </td>
                          <td data-label="Format · Boyut" className="col-meta">
                            <FileTypeIcon fileType={serverFileType(item) ?? extensionOf(item.file.name)} />
                            <span className="file-size">{formatSize(item.file.size)}</span>
                          </td>
                          <td data-label="Durum">
                            <span className={`badge batch-${item.state}`}>
                              {item.removing ? 'Kaldırılıyor' : BATCH_LABELS[item.state]}
                            </span>
                          </td>
                          <td data-label="İşlem" className="col-actions">
                            <button
                              type="button"
                              className="secondary small"
                              onClick={() => togglePreview(item)}
                              disabled={serverFileType(item) === null}
                              aria-expanded={isOpen}
                              aria-controls={isOpen ? panelId : undefined}
                            >
                              {isOpen ? 'Kapat' : 'Önizle'}
                            </button>
                            <button
                              type="button"
                              className="secondary small"
                              onClick={() => void removeItem(item.key)}
                              disabled={item.removing || item.state === 'preparing' || item.state === 'analyzing'}
                              aria-label={`${item.file.name} dosyasını kaldır`}
                            >
                              Kaldır
                            </button>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="detail-row">
                            <td colSpan={5}>
                              <PreviewPanel
                                id={panelId}
                                item={item}
                                textOpen={textOpen}
                                onToggleText={() => setTextOpen(!textOpen)}
                                onViewOriginal={() => openViewer(item)}
                                onSelect={(selected) => patch(item.key, { selected })}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>

              <div className="batch-actions">
                <button type="button" className="primary" onClick={analyzeSelected} disabled={running || selectedCount === 0}>
                  Seçilen Dosyaları Analiz Et ({selectedCount})
                </button>
                <button type="button" className="secondary" onClick={clearFinished} disabled={!hasFinished}>
                  Tamamlananları Temizle
                </button>
              </div>
            </section>
          )}

          {/* Canlı bölge her zaman DOM'da durur; içerik değişince ekran okuyucu duyurur. */}
          <p className="status" role="status">
            {progress}
          </p>
        </>
      )}

      {viewer !== null && <OriginalDocumentModal viewer={viewer} onClose={() => setViewer(null)} />}
    </main>
  )
}

export default App
