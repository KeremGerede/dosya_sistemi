import { useState } from 'react'
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
  status: 'classified' | 'needs_review' | 'failed'
  message?: string
}

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

function App() {
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
      <h1>Belge Sınıflandırma</h1>
      <p>
        PDF veya DOCX belgesini yükleyin; belge türü ve ilgili müdürlük otomatik
        olarak belirlensin.
      </p>

      <form onSubmit={handleSubmit}>
        <input type="file" accept=".pdf,.docx" onChange={handleFileChange} disabled={loading} />
        {file !== null && (
          <p className="file-info">
            {file.name} — {formatSize(file.size)}
          </p>
        )}
        <button type="submit" disabled={!canSubmit}>
          Sınıflandır
        </button>
      </form>

      {loading && <p className="status">Belge sınıflandırılıyor...</p>}
      {error !== null && (
        <div className="notice error" role="alert">
          <p>{error.message}</p>
        </div>
      )}
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
          </dl>
          {result.needs_review && result.review_reason !== null && (
            <p className="review-reason">
              <strong>İnceleme nedeni:</strong> {result.review_reason}
            </p>
          )}
        </section>
      )}
    </main>
  )
}

export default App
