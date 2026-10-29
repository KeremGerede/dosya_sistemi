import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { buildDocumentPreview, extractionFailure } from './documentPreview'
import {
  NO_FILTERS,
  RECORD_DISPLAY_LABELS,
  UNDETERMINED,
  countRecords,
  deleteOutcome,
  effectiveRouting,
  filterOptions,
  filterRecords,
  findEvidenceInText,
  keepAvailableFilters,
  recordDisplayState,
  retryConflict,
  routingEvidenceSection,
} from './records'
import type { RecordFilters, RoutingEvidence } from './records'
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
const INSUFFICIENT_TEXT_MESSAGE = 'Sınıflandırma için yeterli metin çıkarılamadı.'
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
const CATALOGS_FAILED_MESSAGE = 'Seçenekler yüklenemedi. Lütfen tekrar deneyin.'
const VALIDATION_NOT_FOUND_MESSAGE = 'Belge bulunamadı; onay kaydedilemedi.'
const VALIDATION_CONFLICT_MESSAGE = 'Bu belge onaylanamaz; yalnız sınıflandırılmış belgeler onaylanabilir.'
const VALIDATION_INVALID_MESSAGE = 'Seçilen değer geçerli değil.'
const VALIDATION_FAILED_MESSAGE = 'Onay kaydedilemedi. Lütfen tekrar deneyin.'
const RETRY_BUSY_MESSAGE = 'Belge şu anda başka bir işlemde; biraz sonra tekrar deneyin.'
const RETRY_NOT_ALLOWED_MESSAGE = 'Bu belge yeniden sınıflandırılamaz; gerekirse belgeyi yeniden yükleyin.'
const RETRY_NOT_FOUND_MESSAGE = 'Belge bulunamadı. Lütfen kayıtları yenileyin.'
const RETRY_FAILED_MESSAGE = 'Tekrar deneme tamamlanamadı; birazdan yeniden deneyebilirsiniz.'
const RETRY_WAIT_MESSAGE = 'Analiz sürerken tekrar denenemez; işlem bitince yeniden deneyin.'
const RETRY_SUCCESS_MESSAGE = 'Belge yeniden sınıflandırıldı.'
const DELETE_BUSY_MESSAGE = 'Belge şu anda başka bir işlemde olduğu için silinmedi; biraz sonra tekrar deneyin.'
const DELETE_FAILED_MESSAGE = 'Belge silinemedi; kayıt yerinde duruyor. Lütfen tekrar deneyin.'
const DELETE_DISABLED_MESSAGE = 'Kalıcı silme bu ortamda kapalı; kayıt yerinde duruyor.'
const DELETE_UNVERIFIED_MESSAGE = 'Silme sonucu doğrulanamadı. Kayıtları yenileyip belgenin durumunu kontrol edin.'
const DELETE_WAIT_MESSAGE = 'Analiz sürerken belge silinemez; işlem bitince yeniden deneyin.'

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
  // D-050: backend'in kaynakta birebir doğruladığı ifadeler; [] = doğrulanan ifade yok, prepared/failed/eski kayıtta null.
  routing_evidence: RoutingEvidence[] | null
  status: DocumentStatus
  // D-049: kullanıcı onayı; onaysız kayıtta null. Adlar backend'de katalogdan çözülür.
  validated_document_type: string | null
  validated_document_type_name: string | null
  validated_institution_id: string | null
  validated_institution_name: string | null
  validated_at: string | null
  // D-053: sınıflandırması başarısız ve aynı metinle tekrar denenebilir; backend hesaplar.
  retryable: boolean
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
  retrying: boolean // D-053: sıradaki/çalışan istek classify değil, failed kaydın tekrar denenmesi
  prepared: PreparedDocument | null
  result: ClassifyResponse | null // prepare'in failed (422) gövdesi veya sınıflandırma sonucu
  error: string | null // yalnız genel Türkçe mesaj; teknik ayrıntı gösterilmez
  storedText?: string | null // prepare 422: kayda yazılan metin, detaydan okunur; okunamadıysa undefined (D-026)
}

type Notice = { kind: 'error' | 'info'; messages: string[] }

// Orijinal belge penceresi: object URL yalnız pencere açıkken yaşar.
type ViewerState = { key: number; name: string; fileType: string; url: string }

type RequestResult = { status: number | null; body: unknown; timedOut: boolean }

// GET /api/catalogs (D-049): düzeltme seçenekleri; frontend'de katalog kopyası yoktur.
type CatalogItem = { id: string; name: string }
type Catalogs = { document_types: CatalogItem[]; institutions: CatalogItem[] }

// Düzelt formu; kurumda UNDETERMINED "Belirlenemedi" (null) demektir.
type ValidationDraft = { documentType: string; institution: string }

const BATCH_LABELS: Record<BatchState, string> = {
  queued: 'Hazırlanıyor',
  preparing: 'Hazırlanıyor',
  ready: 'Önizlemeye Hazır',
  waiting: 'Bekliyor',
  analyzing: 'Analiz Ediliyor',
  done: 'Tamamlandı',
  review: 'Kontrol Öneriliyor',
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

type RetryOutcome = { record: ClassifyResponse | null; error: string | null }

// Tekrar deneme (D-053): kayıttaki metinle yeniden sınıflandırma. 409'da backend Gemini'yi çağırmadı; kaydın gerçek
// durumu mevcut detay endpoint'inden okunur (D-046 deseni). Mesajlar genel Türkçe metinlerdir, backend ayrıntısı
// gösterilmez. record null ise kayıt bilinmiyor ya da istek tamamlanamadı; çağıran eldeki kaydı korur.
async function retryClassification(documentId: string): Promise<RetryOutcome> {
  const result = await request(`/api/documents/${documentId}/retry-classification`, { method: 'POST' })
  if (result.status === 200) {
    return { record: result.body as ClassifyResponse, error: null }
  }
  if (result.status === 502) {
    return { record: isFailedBody(result.body) ? (result.body as ClassifyResponse) : null, error: errorMessage(502, result.body) }
  }
  if (result.status === 404) {
    return { record: null, error: RETRY_NOT_FOUND_MESSAGE }
  }
  if (result.status === 409) {
    const current = await request(`/api/documents/${documentId}`)
    if (current.status !== 200) {
      return { record: null, error: RETRY_BUSY_MESSAGE }
    }
    const record = current.body as DocumentDetail
    const conflict = retryConflict(record)
    return { record, error: conflict === null ? null : conflict === 'busy' ? RETRY_BUSY_MESSAGE : RETRY_NOT_ALLOWED_MESSAGE }
  }
  return { record: null, error: result.status === null ? requestProblem(result) : RETRY_FAILED_MESSAGE }
}

type DeleteResult = { deleted: boolean; error: string | null }

// Kalıcı silme (D-054). 409'da kayıt korunur. 500, ağ hatası ve zaman aşımında başarı varsayılmaz: backend silmeyi
// tamamlamış ya da dosyayı silip commit edememiş olabilir; kaydın gerçek durumu mevcut detay endpoint'inden okunur.
async function deleteDocument(documentId: string): Promise<DeleteResult> {
  const result = await request(`/api/documents/${documentId}`, { method: 'DELETE' })
  const outcome = deleteOutcome(result.status)
  if (outcome === 'deleted') {
    return { deleted: true, error: null }
  }
  if (outcome === 'busy') {
    return { deleted: false, error: DELETE_BUSY_MESSAGE }
  }
  if (outcome === 'disabled') {
    return { deleted: false, error: DELETE_DISABLED_MESSAGE }
  }
  const current = await request(`/api/documents/${documentId}`)
  if (current.status === 404) {
    return { deleted: true, error: null }
  }
  return { deleted: false, error: current.status === 200 ? DELETE_FAILED_MESSAGE : DELETE_UNVERIFIED_MESSAGE }
}

// Onay hatası (D-049): kısa Türkçe mesaj; FastAPI'nin 422 ayrıntısı gösterilmez.
function validationProblem(result: RequestResult): string {
  if (result.status === null) {
    return result.timedOut ? TIMEOUT_MESSAGE : NETWORK_MESSAGE
  }
  switch (result.status) {
    case 404:
      return VALIDATION_NOT_FOUND_MESSAGE
    case 409:
      return VALIDATION_CONFLICT_MESSAGE
    case 422:
      return VALIDATION_INVALID_MESSAGE
    default:
      return VALIDATION_FAILED_MESSAGE
  }
}

function isCatalogsBody(body: unknown): body is Catalogs {
  return (
    typeof body === 'object' &&
    body !== null &&
    'document_types' in body &&
    Array.isArray(body.document_types) &&
    'institutions' in body &&
    Array.isArray(body.institutions)
  )
}

// Kataloglar ilk "Düzelt"te istenir ve sayfa açık kaldıkça yeniden kullanılır.
// Başarısız istek saklanmaz: sonraki "Düzelt" yeniden ister.
let catalogsRequest: Promise<Catalogs | null> | null = null

function loadCatalogs(): Promise<Catalogs | null> {
  if (catalogsRequest === null) {
    catalogsRequest = request('/api/catalogs').then((result) => {
      if (result.status === 200 && isCatalogsBody(result.body)) {
        return result.body
      }
      catalogsRequest = null
      return null
    })
  }
  return catalogsRequest
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

// Dosya türü rozeti; ikon kütüphanesi yerine küçük satır içi SVG. Tür sınıfı yalnız görünüm içindir (ör. PDF kırmızı).
function FileTypeIcon({ fileType }: { fileType: string }) {
  return (
    <span className={`file-icon file-${fileType}`} aria-hidden="true">
      <svg viewBox="0 0 16 20" width="14" height="18" focusable="false">
        <path d="M2 1h7l5 5v13H2z" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M9 1v5h5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </svg>
      {fileType.toUpperCase()}
    </span>
  )
}

// "Tekrar Dene" döngü simgesi (D-053); FileTypeIcon gibi satır içi SVG. Erişilebilir ad düğme metninden gelir.
function RetryIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" focusable="false">
      <path d="M20 12a8 8 0 1 1-2.34-5.66L20 8.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path
        d="M20 3.5v5h-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// Kayıtlar'daki tekrar deneme durumu (D-053): hangi kayıt için, istek sürüyor mu, son mesaj.
type RecordRetryState = { documentId: string; pending: boolean; error: string | null; succeeded: boolean }

// Kayıtlar'daki kalıcı silme (D-054): hangi kayıt için, onay alanı açık mı, istek sürüyor mu, son hata.
type RecordDeleteState = { documentId: string; confirming: boolean; pending: boolean; error: string | null }

function RecordsView({
  onValidated,
  onRetry,
  onDelete,
  busy,
}: {
  onValidated: (updated: DocumentSummary) => void
  onRetry: (documentId: string) => Promise<RetryOutcome | null>
  onDelete: (documentId: string) => Promise<DeleteResult | null>
  busy: boolean // analiz listesinde istek sürüyor; tek istek kuralı (D-045)
}) {
  const [documents, setDocuments] = useState<DocumentSummary[] | null>(null)
  const [retryState, setRetryState] = useState<RecordRetryState | null>(null)
  const [deleteState, setDeleteState] = useState<RecordDeleteState | null>(null)
  const [deletedNotice, setDeletedNotice] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [detail, setDetail] = useState<DocumentDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [evidenceSelection, setEvidenceSelection] = useState<EvidenceSelection | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  // Arama ve filtre yalnız istemci tarafındadır (D-048); Yenile'de korunur.
  const [filters, setFilters] = useState<RecordFilters>(NO_FILTERS)

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
    setEvidenceSelection(null)
    setRetryState(null)
    setDeletedNotice(null)
    // Açık onay alanı başka kayda taşınmaz; süren silme ise sonucunu kendi kaydına yazar.
    setDeleteState((current) => (current?.pending === true ? current : null))
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

  // Tekrar deneme (D-053): yanıt yalnız ilgili kaydı değiştirir; created_at listedeki kayıttan korunur.
  async function retry(item: DocumentSummary) {
    setRetryState({ documentId: item.document_id, pending: true, error: null, succeeded: false })
    const outcome = await onRetry(item.document_id)
    if (outcome === null) {
      setRetryState({ documentId: item.document_id, pending: false, error: RETRY_WAIT_MESSAGE, succeeded: false })
      return
    }
    const record = outcome.record
    if (record !== null) {
      setDocuments((current) =>
        current === null
          ? current
          : current.map((existing) => (existing.document_id === record.document_id ? { ...existing, ...record } : existing)),
      )
    }
    const succeeded = record !== null && record.status !== 'failed' && outcome.error === null
    setRetryState({ documentId: item.document_id, pending: false, error: outcome.error, succeeded })
  }

  // Kalıcı silme (D-054): onay alanındaki "Evet, Kalıcı Olarak Sil" ile çağrılır; ilk tıklama istek göndermez.
  // Silinen kayıt listeden çıkar ve detayı kapanır; sayılar ve filtre seçenekleri kalan kayıtlardan yeniden hesaplanır.
  // Silinmediyse onay alanı kapanır, mesaj gösterilir ve kayıt listede kalır.
  async function remove(item: DocumentSummary) {
    const documentId = item.document_id
    setDeleteState({ documentId, confirming: true, pending: true, error: null })
    const outcome = await onDelete(documentId)
    if (outcome === null || !outcome.deleted) {
      setDeleteState({ documentId, confirming: false, pending: false, error: outcome?.error ?? DELETE_WAIT_MESSAGE })
      return
    }
    setDeleteState(null)
    setDocuments((current) => (current === null ? current : current.filter((existing) => existing.document_id !== documentId)))
    setOpenId((current) => (current === documentId ? null : current))
    setDetail((current) => (current?.document_id === documentId ? null : current))
    setEvidenceSelection(null)
    setDeletedNotice(`"${item.file_name}" kalıcı olarak silindi.`)
  }

  // Onay yanıtı yalnız ilgili kaydı değiştirir; liste, sayaçlar, filtre ve detay yeniden istek atmadan güncellenir.
  function applyValidation(updated: DocumentSummary) {
    setDocuments((current) =>
      current === null ? current : current.map((item) => (item.document_id === updated.document_id ? updated : item)),
    )
    onValidated(updated)
  }

  if (documents === null && message === null) {
    return <p className="status" role="status">Kayıtlar yükleniyor...</p>
  }

  const records = documents ?? []
  const counts = countRecords(records)
  const routings = records.map((item) => effectiveRouting(item))
  const typeOptions = filterOptions(routings.map((routing) => ({ id: routing.documentTypeId, name: routing.documentTypeName })))
  const institutionOptions = filterOptions(
    routings.map((routing) => ({ id: routing.institutionId, name: routing.institutionName })),
  )
  // Silmeyle seçeneği kalmayan tür/kurum filtresi "tümü" sayılır; liste ve açılır menü aynı şeyi gösterir (D-054).
  const activeFilters = keepAvailableFilters(filters, typeOptions, institutionOptions)
  // Tür, kurum ve durum tek kuraldan gelir: effective yönlendirme ve gösterim durumu (D-049).
  const rows = filterRecords(records, activeFilters).map((item) => ({
    item,
    routing: effectiveRouting(item),
    state: recordDisplayState(item),
  }))
  const filtering = Object.values(activeFilters).some((value) => value.trim() !== '')

  return (
    <section className="records">
      <div className="records-head">
        <h2>Kayıtlar</h2>
        <div className="records-actions">
          {filtering && (
            <button type="button" className="secondary" onClick={() => setFilters(NO_FILTERS)}>
              Filtreleri Temizle
            </button>
          )}
          <button type="button" className="secondary" onClick={() => void load()}>
            Yenile
          </button>
        </div>
      </div>

      {message !== null && (
        <div className="notice error" role="alert">
          <p>{message}</p>
        </div>
      )}

      {deletedNotice !== null && (
        <p className="delete-note" role="status">
          {deletedNotice}
        </p>
      )}

      {documents !== null && documents.length === 0 && (
        <p className="empty">Henüz sınıflandırılmış belge yok. İlk belgeyi "Belge Sınıflandırma" sekmesinden yükleyebilirsiniz.</p>
      )}

      {records.length > 0 && (
        <>
          {/* Sayılar tüm yüklü kayıtlardandır, filtreden etkilenmez (D-048). */}
          <ul className="record-stats" aria-label="Kayıt özeti">
            <li>
              <span className="stat-label">Toplam Kayıt</span>
              <span className="stat-value">{counts.total}</span>
            </li>
            <li className="stat-review">
              <span className="stat-label">İnceleme Gereken</span>
              <span className="stat-value">{counts.needsReview}</span>
            </li>
            <li className="stat-failed">
              <span className="stat-label">Başarısız</span>
              <span className="stat-value">{counts.failed}</span>
            </li>
          </ul>

          <div className="records-filters">
            <input
              type="search"
              placeholder="Belge adında ara"
              aria-label="Belge adında ara"
              value={activeFilters.query}
              onChange={(event) => setFilters({ ...activeFilters, query: event.target.value })}
            />
            <select
              aria-label="Belge türü"
              value={activeFilters.documentType}
              onChange={(event) => setFilters({ ...activeFilters, documentType: event.target.value })}
            >
              <option value="">Tüm türler</option>
              {typeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Gideceği kurum"
              value={activeFilters.institution}
              onChange={(event) => setFilters({ ...activeFilters, institution: event.target.value })}
            >
              <option value="">Tüm kurumlar</option>
              {institutionOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Durum"
              value={activeFilters.status}
              onChange={(event) => setFilters({ ...activeFilters, status: event.target.value })}
            >
              <option value="">Tüm durumlar</option>
              {Object.entries(RECORD_DISPLAY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {rows.length === 0 && <p className="empty">Filtrelerle eşleşen kayıt yok.</p>}
        </>
      )}

      {rows.length > 0 && (
        <table className="records-table">
          <thead>
            <tr>
              <th scope="col">Belge Adı</th>
              <th scope="col">Belge Türü</th>
              <th scope="col">Gideceği Kurum</th>
              <th scope="col">Durum</th>
              <th scope="col">Tarih</th>
              <th scope="col" className="col-file">Dosya</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ item, routing, state }) => (
              <Fragment key={item.document_id}>
                <tr className={openId === item.document_id ? 'open' : undefined}>
                  <td data-label="Belge Adı">
                    {/* Detayı yalnızca bu buton açar; indirme ayrı hücrede olduğundan tıklamalar çakışmaz. */}
                    {/* Tam ad DOM içinde kalır; kısaltma yalnızca görseldir. title fare kullanıcısı içindir ve düğmenin
                        kendisindedir: bazı tarayıcılar (ör. Firefox) düğme içindeki öğelerin title'ını göstermez. */}
                    <button
                      type="button"
                      className="record-main"
                      title={item.file_name}
                      onClick={() => void toggle(item.document_id)}
                      aria-expanded={openId === item.document_id}
                    >
                      <span className="chevron" aria-hidden="true" />
                      <span className="record-name">{item.file_name}</span>
                    </button>
                  </td>
                  <td data-label="Belge Türü" className="col-type">
                    {routing.documentTypeName ?? 'Belirlenemedi'}
                  </td>
                  <td data-label="Gideceği Kurum" className="col-institution">
                    {routing.institutionName ?? 'Belirlenemedi'}
                  </td>
                  <td data-label="Durum">
                    <span className={`badge ${state}`}>{RECORD_DISPLAY_LABELS[state]}</span>
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
                    <td colSpan={6}>
                      <div className="record-detail">
                        {item.summary !== null && <p className="record-summary">{item.summary}</p>}

                        <p className="record-type">
                          <strong>Belge Türü:</strong> {routing.documentTypeName ?? 'Belirlenemedi'}
                          {routing.typeChanged && (
                            <span className="ai-suggestion">AI önerisi: {item.document_type_name ?? 'Belirlenemedi'}</span>
                          )}
                        </p>
                        <p className="record-type">
                          <strong>Hedef Kurum:</strong> {routing.institutionName ?? 'Belirlenemedi'}
                          {routing.institutionChanged && (
                            <span className="ai-suggestion">AI önerisi: {item.institution_name ?? 'Belirlenemedi'}</span>
                          )}
                        </p>

                        {(item.sender_name !== null || item.sender_institution !== null) && (
                          <p className="record-sender">
                            <strong>Gönderen:</strong>{' '}
                            {[item.sender_name, item.sender_institution].filter((value) => value !== null).join(' · ')}
                          </p>
                        )}

                        {state === 'needs_review' && item.review_reason !== null && (
                          <p className="review-reason">
                            <strong>İnceleme nedeni:</strong> {item.review_reason}
                          </p>
                        )}
                        {/* Onaydan sonra AI'ın inceleme nedeni uyarı değil, soluk bir not olarak kalır (D-049). */}
                        {state === 'validated' && item.review_reason !== null && (
                          <p className="review-note">AI inceleme nedeni: {item.review_reason}</p>
                        )}

                        {item.status !== 'failed' && (
                          <ValidationControls
                            record={item}
                            onValidated={applyValidation}
                            locked={deleteState?.documentId === item.document_id && deleteState.pending}
                          />
                        )}
                        {/* D-053: yalnız backend'in retryable dediği failed kayıtta; aynı kayıt ve metin kullanılır. */}
                        {item.status === 'failed' && item.retryable && (
                          <div className="retry">
                            <button
                              type="button"
                              className="secondary retry-button"
                              onClick={() => void retry(item)}
                              disabled={busy || retryState?.pending === true}
                              title={busy ? RETRY_WAIT_MESSAGE : undefined}
                            >
                              <RetryIcon />
                              Tekrar Dene
                            </button>
                          </div>
                        )}
                        {retryState?.documentId === item.document_id && (
                          <>
                            {retryState.pending && (
                              <p className="status" role="status">
                                Yeniden sınıflandırılıyor...
                              </p>
                            )}
                            {retryState.succeeded && (
                              <p className="retry-note" role="status">
                                {RETRY_SUCCESS_MESSAGE}
                              </p>
                            )}
                            {retryState.error !== null && (
                              <p className="validation-error" role="alert">
                                {retryState.error}
                              </p>
                            )}
                          </>
                        )}
                        <RoutingEvidenceSection
                          record={item}
                          text={detail?.extracted_text ?? null}
                          onShowInText={(quote) => setEvidenceSelection({ quote })}
                        />

                        {detailLoading && (
                          <p className="status" role="status">
                            Belge metni yükleniyor...
                          </p>
                        )}
                        {detail !== null && (
                          <>
                            <h3>Çıkarılan metin</h3>
                            <ExtractedText
                              text={detail.extracted_text ?? 'Bu belgeden metin çıkarılamadı.'}
                              selection={evidenceSelection}
                            />
                          </>
                        )}

                        <RecordDeleteControls
                          item={item}
                          state={deleteState?.documentId === item.document_id ? deleteState : null}
                          busy={busy}
                          retrying={retryState?.pending === true}
                          onStart={() =>
                            setDeleteState({ documentId: item.document_id, confirming: true, pending: false, error: null })
                          }
                          onCancel={() => setDeleteState(null)}
                          onConfirm={() => void remove(item)}
                        />
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

// Kayıtlar detayındaki kalıcı silme (D-054): "Belgeyi Sil" yalnız onay alanını açar, istek göndermez. Silme
// "Evet, Kalıcı Olarak Sil" ile başlar. Analiz, tekrar deneme ya da silme sürerken düğmeler kilitlidir (D-045).
function RecordDeleteControls({
  item,
  state,
  busy,
  retrying,
  onStart,
  onCancel,
  onConfirm,
}: {
  item: DocumentSummary
  state: RecordDeleteState | null
  busy: boolean
  retrying: boolean
  onStart: () => void
  onCancel: () => void
  onConfirm: () => void
}) {
  const pending = state?.pending === true
  const questionId = `delete-question-${item.document_id}`
  return (
    <div className="record-delete">
      {state?.confirming === true ? (
        <div className="delete-confirm" role="group" aria-labelledby={questionId}>
          <p id={questionId} className="delete-question">
            Bu belgeyi silmek istediğinizden emin misiniz?
          </p>
          <p className="delete-file">{item.file_name}</p>
          <p className="delete-warning">
            Bu işlem belge kaydını, sınıflandırma ve onay bilgilerini ve orijinal dosyayı kalıcı olarak silecektir. İşlem
            geri alınamaz.
          </p>
          <div className="validation-row">
            <button type="button" className="secondary" onClick={onCancel} disabled={pending}>
              Vazgeç
            </button>
            <button
              type="button"
              className="secondary delete-confirm-button"
              onClick={onConfirm}
              disabled={pending || busy}
              title={busy && !pending ? DELETE_WAIT_MESSAGE : undefined}
            >
              Evet, Kalıcı Olarak Sil
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="secondary delete-button"
          onClick={onStart}
          disabled={busy || retrying}
          title={busy ? DELETE_WAIT_MESSAGE : undefined}
        >
          Belgeyi Sil
        </button>
      )}
      {pending && (
        <p className="status" role="status">
          Siliniyor...
        </p>
      )}
      {state?.error != null && (
        <p className="validation-error" role="alert">
          {state.error}
        </p>
      )}
    </div>
  )
}

// Kullanıcı onayı (D-049): sonuç kartında ve Kayıtlar detayında aynı bileşen. AI sonucu değişmez; onay ayrı alanlara yazılır.
function ValidationControls({
  record,
  onValidated,
  locked = false,
}: {
  record: ClassifyResponse
  onValidated: (updated: DocumentSummary) => void
  locked?: boolean // aynı kaydın kalıcı silinmesi sürüyor (D-054)
}) {
  const [draft, setDraft] = useState<ValidationDraft | null>(null)
  const [catalogs, setCatalogs] = useState<Catalogs | null>(null)
  const [busy, setBusy] = useState<'catalogs' | 'saving' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const aiDocumentType = record.document_type
  if (aiDocumentType === null) {
    return null // failed kayıt onaylanamaz
  }

  async function save(documentType: string, institutionId: string | null) {
    setBusy('saving')
    setError(null)
    const result = await request(`/api/documents/${record.document_id}/validation`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_type: documentType, institution_id: institutionId }),
    })
    setBusy(null)
    if (result.status === 200) {
      setDraft(null)
      onValidated(result.body as DocumentSummary)
    } else {
      setError(validationProblem(result)) // form açık kalır, seçimler korunur
    }
  }

  async function startEdit() {
    setBusy('catalogs')
    setError(null)
    const loaded = await loadCatalogs()
    setBusy(null)
    if (loaded === null) {
      setError(CATALOGS_FAILED_MESSAGE)
      return
    }
    // Form effective değerlerle açılır: onaylıysa onaylanan, değilse AI sonucu.
    const routing = effectiveRouting(record)
    setCatalogs(loaded)
    setDraft({ documentType: routing.documentTypeId ?? '', institution: routing.institutionId ?? UNDETERMINED })
  }

  const saving = busy === 'saving'

  return (
    <div className="validation">
      {draft === null || catalogs === null ? (
        <div className="validation-row">
          {record.validated_at !== null ? (
            <p className="validation-note">Son onay: {formatDate(record.validated_at)}</p>
          ) : (
            <button
              type="button"
              className="secondary approve"
              onClick={() => void save(aiDocumentType, record.institution_id)}
              disabled={busy !== null || locked}
            >
              Sonucu Onayla
            </button>
          )}
          {/* Onay öncesi ve sonrası aynı görünüm: onaydan hafif, amber çerçeveli ikincil aksiyon. */}
          <button
            type="button"
            className="secondary revise"
            onClick={() => void startEdit()}
            disabled={busy !== null || locked}
          >
            Düzelt
          </button>
        </div>
      ) : (
        <div className="validation-form">
          <label>
            Belge Türü
            <select
              value={draft.documentType}
              onChange={(event) => setDraft({ ...draft, documentType: event.target.value })}
              disabled={saving}
              autoFocus
            >
              {catalogs.document_types.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Hedef Kurum
            <select
              value={draft.institution}
              onChange={(event) => setDraft({ ...draft, institution: event.target.value })}
              disabled={saving}
            >
              {catalogs.institutions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
              <option value={UNDETERMINED}>Belirlenemedi</option>
            </select>
          </label>
          <div className="validation-row">
            <button
              type="button"
              className="secondary approve"
              onClick={() =>
                void save(draft.documentType, draft.institution === UNDETERMINED ? null : draft.institution)
              }
              disabled={saving || locked}
            >
              Kaydet ve Onayla
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setDraft(null)
                setError(null)
              }}
              disabled={saving}
            >
              Vazgeç
            </button>
          </div>
        </div>
      )}
      {error !== null && (
        <p className="validation-error" role="alert">
          {error}
        </p>
      )}
      <p className="status" role="status">
        {busy === 'saving' ? 'Kaydediliyor...' : busy === 'catalogs' ? 'Seçenekler yükleniyor...' : ''}
      </p>
    </div>
  )
}

// Belgedeki ilgili ifade (D-050): sonuç kartında ve Kayıtlar detayında aynı bölüm. İfadeler AI önerisine aittir ve
// backend'den geldiği gibi gösterilir; her ifadenin üstünde supports'tan çevrilen başlık vardır, ham değer gösterilmez
// (D-052). Kullanıcı türü veya kurumu değiştirdiyse küçük not eklenir.
// "Metinde göster" (F-04) yalnız çıkarılan metinde birebir bulunan ifadede görünür; metin henüz yoksa da görünmez.
function RoutingEvidenceSection({
  record,
  text,
  onShowInText,
}: {
  record: ClassifyResponse
  text: string | null
  onShowInText: (quote: string) => void
}) {
  const section = routingEvidenceSection(record)
  if (section === null) {
    return null // null veya []: bölüm ve boş durum mesajı yok
  }
  return (
    <div className="routing-evidence">
      <h3>Belgedeki ilgili ifade</h3>
      {section.aiBasis && <p className="routing-evidence-note">AI önerisinin dayanağı</p>}
      {section.items.map(({ quote, label }, index) => (
        <div key={index} className="evidence-item">
          <h4 className="evidence-label">{label}</h4>
          <blockquote className="evidence-quote">{quote}</blockquote>
          {findEvidenceInText(text, quote) !== null && (
            <button type="button" className="secondary small evidence-show" onClick={() => onShowInText(quote)}>
              {/* Satır içi SVG (FileTypeIcon ile aynı yaklaşım); erişilebilir ad düğme metninden gelir. */}
              <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false">
                <circle cx="6.5" cy="6.5" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.6" />
                <path d="M10 10l4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              Metinde göster
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

// "Metinde göster" seçimi. Her tıklama yeni bir nesnedir: aynı ifadeye tekrar basmak da yeniden kaydırır.
type EvidenceSelection = { quote: string }

// Çıkarılan metin (F-04): seçilen ifadenin yalnız ilk birebir geçişi vurgulanır, görünür alana kaydırılır ve odak oraya
// taşınır. Seçim yoksa veya ifade bulunamazsa metin bugünkü gibi, olduğu gibi gösterilir.
function ExtractedText({ id, text, selection }: { id?: string; text: string; selection: EvidenceSelection | null }) {
  const markRef = useRef<HTMLElement>(null)
  const match = selection === null ? null : findEvidenceInText(text, selection.quote)

  useEffect(() => {
    // block: 'center' vurguyu hem metin kutusunda hem sayfada ortalar; sabit analiz çubuğunun altında kalmaz.
    markRef.current?.scrollIntoView({ block: 'center' })
    markRef.current?.focus({ preventScroll: true })
  }, [selection])

  return (
    <pre className="extracted-text" id={id}>
      {match === null ? (
        text
      ) : (
        <>
          {match.before}
          <mark ref={markRef} className="evidence-mark" tabIndex={-1}>
            {match.quote}
          </mark>
          {match.after}
        </>
      )}
    </pre>
  )
}

// Analiz sonucu (D-045). Anlamsal kalite kapısı olmadığından kesinlik iddiası yoktur: başlık her durumda
// "Analiz tamamlandı"dır; onaysız needs_review'da "Kontrol Öneriliyor" gösterilir. Tür ve kurum birincil sonuçtur:
// onaylıysa onaylanan değer, AI önerisi yalnız farklıysa ikincil satırda (D-049).
function ResultCard({
  result,
  text,
  onShowInText,
  onViewOriginal,
  onValidated,
}: {
  result: ClassifyResponse
  text: string | null
  onShowInText: (quote: string) => void
  onViewOriginal: (() => void) | null
  onValidated: (updated: DocumentSummary) => void
}) {
  const routing = effectiveRouting(result)
  const activeReview = result.needs_review && !routing.validated
  const cardRef = useRef<HTMLElement>(null)

  // Kart açıldığında onay satırı sabit analiz çubuğunun altında kalıyorsa satır görünüme kaydırılır; html'deki
  // scroll-padding-bottom satırı çubuğun üstünde durdurur. Çubuk satırı örtmüyorsa (geniş ekran, dar ekranda akıştaki
  // çubuk) kaydırma yapılmaz.
  useEffect(() => {
    const row = cardRef.current?.querySelector('.validation')
    const bar = document.querySelector('.batch-actions')
    if (row && bar && row.getBoundingClientRect().bottom > bar.getBoundingClientRect().top) {
      row.scrollIntoView({ block: 'nearest' })
    }
  }, [])

  return (
    <section
      ref={cardRef}
      className={activeReview ? 'notice result review' : 'notice result'}
      aria-label="Analiz sonucu"
    >
      <div className="result-head">
        <div>
          <h2>Analiz tamamlandı</h2>
          <p className="result-file">{result.file_name}</p>
        </div>
        <span className={routing.validated ? 'badge validated' : activeReview ? 'badge needs_review' : 'badge neutral'}>
          {routing.validated ? 'Onaylandı' : activeReview ? 'Kontrol Öneriliyor' : 'Sınıflandırıldı'}
        </span>
      </div>

      <dl className="result-primary">
        <div>
          <dt>Belge Türü</dt>
          <dd>{routing.documentTypeName ?? 'Belirlenemedi'}</dd>
          {routing.typeChanged && (
            <dd className="ai-suggestion">AI önerisi: {result.document_type_name ?? 'Belirlenemedi'}</dd>
          )}
        </div>
        <div>
          <dt>Hedef Kurum</dt>
          <dd>{routing.institutionName ?? 'Belirlenemedi'}</dd>
          {routing.institutionChanged && (
            <dd className="ai-suggestion">AI önerisi: {result.institution_name ?? 'Belirlenemedi'}</dd>
          )}
        </div>
      </dl>

      {activeReview && (
        <p className="review-reason">
          {result.review_reason !== null ? (
            <>
              <strong>Kontrol nedeni:</strong> {result.review_reason}
            </>
          ) : (
            'Sonucu orijinal belgeyle karşılaştırmanız önerilir.'
          )}
        </p>
      )}

      <ValidationControls record={result} onValidated={onValidated} />

      {/* Onay kontrollerinin altında: "Sonucu Onayla" yerinde kalır (D-050). */}
      <RoutingEvidenceSection record={result} text={text} onShowInText={onShowInText} />

      {result.summary !== null && (
        <div className="result-summary">
          <h3>AI Özeti</h3>
          <p>{result.summary}</p>
        </div>
      )}

      {/* Gönderen alanları yalnızca belgede açıkça yazıyorsa gelir. */}
      {(result.sender_name !== null || result.sender_institution !== null) && (
        <p className="record-sender">
          <strong>Gönderen:</strong>{' '}
          {[result.sender_name, result.sender_institution].filter((value) => value !== null).join(' · ')}
        </p>
      )}

      <div className="result-actions">
        {onViewOriginal !== null && (
          <button type="button" className="secondary" onClick={onViewOriginal}>
            Orijinal Belgeyi Gör
          </button>
        )}
        <a className="secondary" href={`/api/documents/${result.document_id}/download`}>
          Orijinal Belgeyi İndir
        </a>
      </div>
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
  onValidated,
}: {
  id: string
  item: BatchItem
  textOpen: boolean
  onToggleText: () => void
  onViewOriginal: () => void
  onSelect: (selected: boolean) => void
  onValidated: (updated: DocumentSummary) => void
}) {
  const fileType = serverFileType(item)
  // Prepare'de metin çıkarımı başarısızsa (422) metin kayıttan gelir ve hata türü buna göre anlatılır (D-026).
  const failure = item.prepared === null && item.result?.status === 'failed' ? extractionFailure(item.storedText) : null
  const text = item.prepared?.extracted_text ?? item.storedText ?? null
  const preview = buildDocumentPreview(text, item.file.name)
  const titleId = `${id}-title`
  const textId = `${id}-text`
  const canViewOriginal = fileType !== null && fileType in PREVIEW_MEDIA_TYPES
  const canSelect = item.state === 'ready' || item.state === 'waiting'
  const result = item.state === 'done' || item.state === 'review' ? item.result : null
  const [evidenceSelection, setEvidenceSelection] = useState<EvidenceSelection | null>(null)
  const detailsRef = useRef<HTMLDetailsElement>(null)

  // "Metinde göster" (F-04): kapalı ikincil bölümü ve çıkarılan metni açar, sonra ifadeyi seçer. <details> React'e
  // bağlı değildir; yalnız açılır, kullanıcının aç/kapa davranışı değişmez. Panel kapanınca seçim de sıfırlanır.
  function showInText(quote: string) {
    if (detailsRef.current !== null) {
      detailsRef.current.open = true
    }
    if (!textOpen) {
      onToggleText()
    }
    setEvidenceSelection({ quote })
  }

  // Metni gizlemek seçimi de bitirir: metin yeniden açıldığında bugünkü gibi düz gösterilir, sayfa kaydırılmaz.
  function toggleText() {
    if (textOpen) {
      setEvidenceSelection(null)
    }
    onToggleText()
  }

  const previewSection = (
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
            <dd className="missing">{failure === 'unknown' ? TEXT_FAILED_MESSAGE : 'Bu belgeden metin çıkarılamadı.'}</dd>
          ) : (
            <FieldValue value={preview.content} className="content" />
          )}
        </div>
      </dl>
      {failure === 'insufficient' && <p className="hint">{INSUFFICIENT_TEXT_MESSAGE}</p>}
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
          <button type="button" className="secondary" onClick={toggleText} aria-expanded={textOpen} aria-controls={textId}>
            {textOpen ? 'Çıkarılan Metni Gizle' : 'Çıkarılan Metni Gör'}
          </button>
        )}
      </div>
      {(fileType === 'doc' || fileType === 'docx') && (
        <p className="hint">Word belgelerinin görünümü gösterilmez; önizleme çıkarılan metinden oluşturulur.</p>
      )}
      {textOpen && text !== null && <ExtractedText id={textId} text={text} selection={evidenceSelection} />}

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
  )

  // Analiz bittiyse sonuç kartı önce gelir; önizleme ve çıkarılan metin varsayılan kapalı ikincil bölüme iner.
  return (
    <div className="record-detail preview" id={id}>
      {result === null ? (
        previewSection
      ) : (
        <>
          <ResultCard
            result={result}
            text={text}
            onShowInText={showInText}
            onViewOriginal={canViewOriginal ? onViewOriginal : null}
            onValidated={onValidated}
          />
          <details className="result-details" ref={detailsRef}>
            <summary>Belge önizlemesi ve çıkarılan metin</summary>
            {previewSection}
          </details>
        </>
      )}
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

  // Onay yanıtı (D-049) yalnız aynı belgeyi gösteren satırın sonucunu değiştirir. Kayıtlar'da yapılan onay da buraya
  // yansır; analiz listesinde eski sonuç kalıp yeni bir "Sonucu Onayla" ile düzeltmenin üzerine yazılmasın.
  function applyValidation(updated: DocumentSummary) {
    commit(
      itemsRef.current.map((item) => (item.result?.document_id === updated.document_id ? { ...item, result: updated } : item)),
    )
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
          retrying: false,
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
        } else if (next.retrying) {
          await retryItem(next)
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
    if (failedBody !== null) {
      // Gövde metni taşımaz; kayda yazılan (yetersiz de olsa) metin önizlemede gösterilsin diye mevcut detay
      // endpoint'inden okunur. İstek çalıştırıcı içinde kalır, sıradaki dosya bundan sonra başlar.
      const detail = await request(`/api/documents/${failedBody.document_id}`)
      if (detail.status === 200) {
        patch(item.key, { storedText: (detail.body as DocumentDetail).extracted_text })
      }
    }
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

  // Tekrar deneme (D-053): kayıt failed kalır, yalnız sınıflandırma kayıttaki metinle yeniden çalışır. Satır sıralı
  // çalıştırıcıdan geçer; aynı anda tek istek kuralı (D-045) korunur. Sonuç yoksa eldeki failed sonuç korunur.
  async function retryItem(item: BatchItem) {
    const documentId = item.result?.document_id
    if (documentId === undefined) {
      patch(item.key, { state: 'failed', retrying: false, error: UNEXPECTED_MESSAGE })
      return
    }
    patch(item.key, { state: 'analyzing', error: null })
    const outcome = await retryClassification(documentId)
    const record = outcome.record ?? item.result
    patch(item.key, {
      state: record === null ? 'failed' : stateForStatus(record.status),
      result: record,
      error: outcome.error,
      retrying: false,
    })
  }

  function retryFailed(key: number) {
    const item = itemsRef.current.find((candidate) => candidate.key === key)
    if (item === undefined || item.removing || item.state !== 'failed' || item.result?.retryable !== true) {
      return
    }
    patch(key, { state: 'waiting', retrying: true, error: null })
    void runQueue()
  }

  // Kayıtlar'dan tekrar deneme de aynı tek istek kuralına uyar (D-045): çalıştırıcı meşgulken başlamaz, sürerken
  // çalıştırıcı bekler; arada eklenen dosyalar sonra sıradan devam eder. Başarılı sonuç analiz listesine de yansır.
  async function retryFromRecords(documentId: string): Promise<RetryOutcome | null> {
    if (runningRef.current) {
      return null
    }
    runningRef.current = true
    setRunning(true)
    try {
      const outcome = await retryClassification(documentId)
      if (outcome.record !== null && outcome.record.status !== 'failed') {
        applyRetried(outcome.record)
      }
      return outcome
    } finally {
      runningRef.current = false
      setRunning(false)
      void runQueue()
    }
  }

  // Kayıtlar'dan kalıcı silme de tek istek kuralına uyar (D-045, D-054): çalıştırıcı meşgulken başlamaz, sürerken
  // çalıştırıcı bekler. Silinen belge analiz listesinde de varsa oradan çıkar; iki görünüm aynı kalır.
  async function deleteFromRecords(documentId: string): Promise<DeleteResult | null> {
    if (runningRef.current) {
      return null
    }
    runningRef.current = true
    setRunning(true)
    try {
      const outcome = await deleteDocument(documentId)
      if (outcome.deleted) {
        drop(itemsRef.current.filter((item) => item.result?.document_id === documentId).map((item) => item.key))
      }
      return outcome
    } finally {
      runningRef.current = false
      setRunning(false)
      void runQueue()
    }
  }

  // Kayıtlar'da tekrar denenip sınıflandırılan belgeyi gösteren analiz satırı da güncellenir; listede failed kalmaz.
  function applyRetried(updated: ClassifyResponse) {
    commit(
      itemsRef.current.map((item) =>
        item.result?.document_id === updated.document_id && item.state === 'failed'
          ? { ...item, result: updated, state: stateForStatus(updated.status), error: null }
          : item,
      ),
    )
  }

  // Kaldır: sunucuda prepared kaydı olan satır discard edilir (D-046); sıradaki ve terminal satırlar yalnız listeden çıkar.
  // Tekrar denemeyi bekleyen satırın kaydı failed'dır (kalıcı): o da yalnız listeden çıkar.
  async function removeItem(key: number) {
    const item = itemsRef.current.find((candidate) => candidate.key === key)
    if (item === undefined || item.removing || item.state === 'preparing' || item.state === 'analyzing') {
      return
    }
    if (item.prepared === null || item.retrying || (item.state !== 'ready' && item.state !== 'waiting')) {
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
        <RecordsView onValidated={applyValidation} onRetry={retryFromRecords} onDelete={deleteFromRecords} busy={running} />
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
                    <th scope="col">
                      <span className="visually-hidden">İşlemler</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const isOpen = openKey === item.key
                    const panelId = `preview-${item.key}`
                    const routing = item.result !== null ? effectiveRouting(item.result) : null
                    const validated = routing !== null && routing.validated
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
                              {/* Analiz sonucu satırda özetlenir; ayrıntı "Sonucu Gör" panelindedir. */}
                              {routing !== null && (item.state === 'done' || item.state === 'review') && (
                                <span className="row-result">
                                  <strong>Tür:</strong> {routing.documentTypeName ?? 'Belirlenemedi'} ·{' '}
                                  <strong>Kurum:</strong> {routing.institutionName ?? 'Belirlenemedi'}
                                </span>
                              )}
                            </div>
                          </td>
                          <td data-label="Format · Boyut" className="col-meta">
                            <FileTypeIcon fileType={serverFileType(item) ?? extensionOf(item.file.name)} />
                            <span className="file-size">{formatSize(item.file.size)}</span>
                          </td>
                          <td data-label="Durum">
                            <span className={validated ? 'badge validated' : `badge batch-${item.state}`}>
                              {item.removing ? 'Kaldırılıyor' : validated ? 'Onaylandı' : BATCH_LABELS[item.state]}
                            </span>
                          </td>
                          <td data-label="İşlem">
                            <div className="row-actions">
                              <button
                                type="button"
                                className="secondary small"
                                onClick={() => togglePreview(item)}
                                disabled={serverFileType(item) === null}
                                aria-expanded={isOpen}
                                aria-controls={isOpen ? panelId : undefined}
                              >
                                {isOpen ? 'Kapat' : item.state === 'done' || item.state === 'review' ? 'Sonucu Gör' : 'Önizle'}
                              </button>
                              {/* D-053: yalnız backend'in retryable dediği failed satırda; metin çıkarımı hatasında yok. */}
                              {item.state === 'failed' && item.result?.retryable === true && !item.removing && (
                                <button
                                  type="button"
                                  className="secondary small retry-button"
                                  onClick={() => retryFailed(item.key)}
                                  aria-label={`${item.file.name} için tekrar dene`}
                                >
                                  <RetryIcon />
                                  Tekrar Dene
                                </button>
                              )}
                              <button
                                type="button"
                                className="secondary small"
                                onClick={() => void removeItem(item.key)}
                                disabled={item.removing || item.state === 'preparing' || item.state === 'analyzing'}
                                aria-label={`${item.file.name} dosyasını kaldır`}
                              >
                                Kaldır
                              </button>
                            </div>
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
                                onValidated={applyValidation}
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
