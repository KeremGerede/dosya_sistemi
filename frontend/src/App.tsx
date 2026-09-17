import { useCallback, useEffect, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import './App.css'

// Kullanıcı deneyimi için ön kontroller; kabul kararı backend'e aittir (D-040).
const MAX_FILE_SIZE = 50 * 1024 * 1024
const ALLOWED_EXTENSIONS = ['.pdf', '.docx']
const REQUEST_TIMEOUT_MS = 120_000 // D-039

const UNSUPPORTED_FILE_MESSAGE = 'Yalnızca PDF veya DOCX dosyaları desteklenir.'
const FILE_TOO_LARGE_MESSAGE = "Dosya boyutu 50 MB'ı aşamaz."
const NOT_SENT_MESSAGE = 'Dosya gönderilemedi. Lütfen bir PDF veya DOCX dosyası seçip tekrar deneyin.'
const TEXT_FAILED_MESSAGE = 'Belge içeriği işlenemedi veya yeterli metin çıkarılamadı.'
const CLASSIFICATION_FAILED_MESSAGE = 'Belge şu anda sınıflandırılamadı. Lütfen daha sonra tekrar deneyin.'
const UNEXPECTED_MESSAGE = 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.'
const NETWORK_MESSAGE = 'Sunucuya ulaşılamadı. Lütfen bağlantıyı kontrol edip tekrar deneyin.'
const TIMEOUT_MESSAGE = 'İşlem zaman aşımına uğradı. Lütfen tekrar deneyin.'
const RECORDS_FAILED_MESSAGE = 'Kayıtlar yüklenemedi. Lütfen tekrar deneyin.'
const DETAIL_FAILED_MESSAGE = 'Belge ayrıntısı yüklenemedi. Lütfen tekrar deneyin.'

const STATUS_LABELS: Record<DocumentStatus, string> = {
  classified: 'Sınıflandırıldı',
  needs_review: 'İnceleme gerekiyor',
  failed: 'İşlenemedi',
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

// Kullanıcıya yalnızca message gösterilir; httpStatus ve body teşhis için saklanır, ekrana basılmaz.
type ClassifyError = {
  message: string
  httpStatus: number | null
  body: unknown
}

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

      <ul className="record-list">
        {(documents ?? []).map((item) => (
          <li key={item.document_id} className="record">
            <div className="record-row">
              <button
                type="button"
                className="record-main"
                onClick={() => void toggle(item.document_id)}
                aria-expanded={openId === item.document_id}
              >
                <span className="record-name">{item.file_name}</span>
                <span className="record-meta">
                  {item.document_type_name ?? 'Tür belirlenemedi'} · {item.institution_name ?? 'Kurum belirlenemedi'}
                </span>
                <span className="record-date">{formatDate(item.created_at)}</span>
              </button>
              <div className="record-actions">
                <span className={`badge ${item.status}`}>{STATUS_LABELS[item.status]}</span>
                <a
                  className="download"
                  href={`/api/documents/${item.document_id}/download`}
                  title={`${item.file_name} dosyasını indir`}
                >
                  <FileTypeIcon fileType={item.file_type} />
                  <span className="visually-hidden">{item.file_name} dosyasını indir</span>
                </a>
              </div>
            </div>

            {(item.summary !== null ||
              item.sender_name !== null ||
              item.sender_institution !== null ||
              (item.status === 'needs_review' && item.review_reason !== null)) && (
              <div className="record-body">
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
              </div>
            )}

            {openId === item.document_id && (
              <div className="record-detail">
                {detailLoading && <p className="status" role="status">Belge metni yükleniyor...</p>}
                {detail !== null && (
                  <>
                    <h3>Çıkarılan metin</h3>
                    <pre className="extracted-text">{detail.extracted_text ?? 'Bu belgeden metin çıkarılamadı.'}</pre>
                  </>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function App() {
  const [view, setView] = useState<'classify' | 'records'>('classify')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ClassifyResponse | null>(null)
  const [error, setError] = useState<ClassifyError | null>(null)

  const canSubmit = file !== null && !loading && fileProblem(file) === null

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null
    const problem = selected === null ? null : fileProblem(selected)
    setFile(selected)
    setResult(null)
    setError(problem === null ? null : { message: problem, httpStatus: null, body: null })
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (file === null || loading || fileProblem(file) !== null) {
      return
    }

    setLoading(true)
    setResult(null)
    setError(null)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    const body = new FormData()
    body.append('file', file) // Content-Type header'ı elle verilmez; boundary'yi tarayıcı üretir.

    try {
      // Göreli yol: istek Vite proxy üzerinden backend'e gider (D-038).
      const response = await fetch('/api/documents/classify', { method: 'POST', body, signal: controller.signal })
      const payload: unknown = await response.json().catch(() => null)

      if (!response.ok) {
        setError({ message: errorMessage(response.status, payload), httpStatus: response.status, body: payload })
        return
      }
      setResult(payload as ClassifyResponse)
    } catch (caught) {
      const timedOut = caught instanceof DOMException && caught.name === 'AbortError'
      setError({ message: timedOut ? TIMEOUT_MESSAGE : NETWORK_MESSAGE, httpStatus: null, body: null })
    } finally {
      clearTimeout(timeout)
      setLoading(false)
    }
  }

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
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="document-file">Belge dosyası</label>
          <p id="document-file-hint" className="hint">
            PDF veya DOCX, en fazla 50 MB.
          </p>
        </div>
        <input
          id="document-file"
          type="file"
          accept=".pdf,.docx"
          aria-describedby="document-file-hint"
          onChange={handleFileChange}
          disabled={loading}
        />
        {file !== null && (
          <p className="file-info">
            <strong>{file.name}</strong> · {formatSize(file.size)}
          </p>
        )}
        <button type="submit" disabled={!canSubmit}>
          {loading ? 'Sınıflandırılıyor...' : 'Sınıflandır'}
        </button>
      </form>

      {/* Canlı bölgeler her zaman DOM'da durur; içerik değişince ekran okuyucu duyurur. */}
      <p className="status" role="status">
        {loading ? 'Belge sınıflandırılıyor...' : ''}
      </p>
      {error !== null && (
        <div className="notice error" role="alert">
          <p>{error.message}</p>
        </div>
      )}
      <div aria-live="polite">
        {result !== null && (
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
        )}
      </div>
        </>
      )}
    </main>
  )
}

export default App
