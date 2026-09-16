import { useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import './App.css'

// Kullanıcı deneyimi için ön kontroller; kabul kararı backend'e aittir (D-040).
const MAX_FILE_SIZE = 50 * 1024 * 1024
const ALLOWED_EXTENSIONS = ['.pdf', '.docx']
const REQUEST_TIMEOUT_MS = 120_000 // D-039

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
  status: string
  message?: string
}

// Kullanıcıya yalnızca message gösterilir; httpStatus ve body ayrıntılı hata ekranı için saklanır (Adım 4).
type ClassifyError = {
  message: string
  httpStatus: number | null
  body: unknown
}

function fileProblem(file: File): string | null {
  const name = file.name.toLowerCase()
  if (!ALLOWED_EXTENSIONS.some((extension) => name.endsWith(extension))) {
    return 'Yalnızca PDF veya DOCX dosyaları desteklenir.'
  }
  if (file.size > MAX_FILE_SIZE) {
    return "Dosya boyutu 50 MB'ı aşamaz."
  }
  return null
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
        setError({
          message: 'Belge sınıflandırılamadı. Lütfen tekrar deneyin.',
          httpStatus: response.status,
          body: payload,
        })
        return
      }
      setResult(payload as ClassifyResponse)
    } catch (caught) {
      const timedOut = caught instanceof DOMException && caught.name === 'AbortError'
      setError({
        message: timedOut
          ? 'İşlem zaman aşımına uğradı. Lütfen tekrar deneyin.'
          : 'Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.',
        httpStatus: null,
        body: null,
      })
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
      {error !== null && <p className="error">{error.message}</p>}
      {result !== null && (
        <div className="result">
          <p>Sınıflandırma tamamlandı.</p>
          <p>
            {result.document_type_name ?? '—'} · {result.institution_name ?? 'Kurum atanmadı'} ·{' '}
            {result.status}
          </p>
        </div>
      )}
    </main>
  )
}

export default App
