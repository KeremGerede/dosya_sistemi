// Kayıtlar görünümü (D-048): yüklü kayıtlar üzerinde istemci tarafı arama, filtre ve özet sayıları.
// Backend'e istek atılmaz; yalnız GET /api/documents yanıtındaki alanlar kullanılır.
import { fold } from './documentPreview.ts'

// Yardımcıların okuduğu alanlar; App'teki DocumentSummary bu şekle uyar.
type RecordFields = {
  file_name: string
  document_type: string | null
  institution_id: string | null
  status: string
}

// Boş değer "tümü" demektir.
export type RecordFilters = { query: string; documentType: string; institution: string; status: string }

export type FilterOption = { value: string; label: string }

export const NO_FILTERS: RecordFilters = { query: '', documentType: '', institution: '', status: '' }

// Türü ya da kurumu belirlenemeyen kayıtların filtre değeri; katalog ID'leriyle çakışmaz.
export const UNDETERMINED = 'none'

// Arama yalnız dosya adındadır; büyük/küçük harf ve Türkçe karakter farkı (ş/s, ı/i ...) gözetilmez, bulanık değildir.
export function filterRecords<T extends RecordFields>(records: T[], filters: RecordFilters): T[] {
  const query = fold(filters.query.trim())
  return records.filter(
    (record) =>
      fold(record.file_name).includes(query) &&
      (filters.documentType === '' || (record.document_type ?? UNDETERMINED) === filters.documentType) &&
      (filters.institution === '' || (record.institution_id ?? UNDETERMINED) === filters.institution) &&
      (filters.status === '' || record.status === filters.status),
  )
}

// Seçenekler yüklü kayıtlardan türetilir (katalog endpoint'i yok); ID'si olmayanlar sondaki tek "Belirlenemedi" seçeneğidir.
export function filterOptions(values: { id: string | null; name: string | null }[]): FilterOption[] {
  const labels = new Map<string, string>()
  for (const { id, name } of values) {
    labels.set(id ?? UNDETERMINED, id === null ? 'Belirlenemedi' : (name ?? id))
  }
  return [...labels]
    .map(([value, label]) => ({ value, label }))
    .sort(
      (a, b) =>
        Number(a.value === UNDETERMINED) - Number(b.value === UNDETERMINED) || a.label.localeCompare(b.label, 'tr'),
    )
}

// Tüm yüklü kayıtlardan sayılır; needs_review kayıtlar da sınıflandırılmış olduğu için "Sınıflandırıldı" sayılmaz.
export function countRecords(records: { status: string }[]): { total: number; needsReview: number; failed: number } {
  return {
    total: records.length,
    needsReview: records.filter((record) => record.status === 'needs_review').length,
    failed: records.filter((record) => record.status === 'failed').length,
  }
}
