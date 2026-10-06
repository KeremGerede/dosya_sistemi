// Kayıtlar görünümü (D-048): yüklü kayıtlar üzerinde istemci tarafı arama, filtre ve özet sayıları.
// Backend'e istek atılmaz; yalnız GET /api/documents yanıtındaki alanlar kullanılır.
import { fold } from './documentPreview.ts'

// Effective yönlendirmenin okuduğu alanlar (D-049); App'teki ClassifyResponse bu şekle uyar.
type RoutingFields = {
  document_type: string | null
  document_type_name: string | null
  institution_id: string | null
  institution_name: string | null
  validated_document_type: string | null
  validated_document_type_name: string | null
  validated_institution_id: string | null
  validated_institution_name: string | null
  validated_at: string | null
}

// Yardımcıların okuduğu alanlar; App'teki DocumentSummary bu şekle uyar.
type RecordFields = RoutingFields & {
  file_name: string
  needs_review: boolean
  status: string
}

export type EffectiveRouting = {
  documentTypeId: string | null
  documentTypeName: string | null
  institutionId: string | null
  institutionName: string | null
  validated: boolean
  typeChanged: boolean // onaylanan tür AI türünden farklı
  institutionChanged: boolean // onaylanan kurum AI kurumundan farklı
}

// Tek kural (D-049): onaylı kayıtta onaylanan çift, değilse AI çifti. Onaylanan kurum null olabilir.
export function effectiveRouting(record: RoutingFields): EffectiveRouting {
  if (record.validated_at === null) {
    return {
      documentTypeId: record.document_type,
      documentTypeName: record.document_type_name,
      institutionId: record.institution_id,
      institutionName: record.institution_name,
      validated: false,
      typeChanged: false,
      institutionChanged: false,
    }
  }
  return {
    documentTypeId: record.validated_document_type,
    documentTypeName: record.validated_document_type_name,
    institutionId: record.validated_institution_id,
    institutionName: record.validated_institution_name,
    validated: true,
    typeChanged: record.validated_document_type !== record.document_type,
    institutionChanged: record.validated_institution_id !== record.institution_id,
  }
}

export type RecordDisplayState = 'classified' | 'needs_review' | 'validated' | 'failed'

// Durum filtresindeki sıra da budur.
export const RECORD_DISPLAY_LABELS: Record<RecordDisplayState, string> = {
  classified: 'Sınıflandırıldı',
  needs_review: 'İnceleme gerekli',
  validated: 'Onaylandı',
  failed: 'Başarısız',
}

// Yalnız arayüz gösterimi (D-049): business status değildir, DB'deki status değişmez.
export function recordDisplayState(record: { status: string; validated_at: string | null }): RecordDisplayState {
  if (record.status === 'failed') {
    return 'failed'
  }
  if (record.validated_at !== null) {
    return 'validated'
  }
  return record.status === 'needs_review' ? 'needs_review' : 'classified'
}

// Boş değer "tümü" demektir.
export type RecordFilters = { query: string; documentType: string; institution: string; status: string }

export type FilterOption = { value: string; label: string }

export const NO_FILTERS: RecordFilters = { query: '', documentType: '', institution: '', status: '' }

// Türü ya da kurumu belirlenemeyen kayıtların filtre değeri; katalog ID'leriyle çakışmaz.
export const UNDETERMINED = 'none'

// Arama yalnız dosya adındadır; büyük/küçük harf ve Türkçe karakter farkı (ş/s, ı/i ...) gözetilmez, bulanık değildir.
// Tür ve kurum effective değerle, durum gösterim durumuyla filtrelenir (D-049).
export function filterRecords<T extends RecordFields>(records: T[], filters: RecordFilters): T[] {
  const query = fold(filters.query.trim())
  return records.filter((record) => {
    const routing = effectiveRouting(record)
    return (
      fold(record.file_name).includes(query) &&
      (filters.documentType === '' || (routing.documentTypeId ?? UNDETERMINED) === filters.documentType) &&
      (filters.institution === '' || (routing.institutionId ?? UNDETERMINED) === filters.institution) &&
      (filters.status === '' || recordDisplayState(record) === filters.status)
    )
  })
}

// Seçenekler yüklü kayıtların effective değerlerinden türetilir; ID'si olmayanlar sondaki tek "Belirlenemedi" seçeneğidir.
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
// İnceleme Gereken yalnız onaylanmamış needs_review kayıtlardır (D-049); DB'deki needs_review değişmez.
export function countRecords(
  records: { status: string; needs_review: boolean; validated_at: string | null }[],
): { total: number; needsReview: number; failed: number } {
  return {
    total: records.length,
    needsReview: records.filter((record) => record.needs_review && record.validated_at === null).length,
    failed: records.filter((record) => record.status === 'failed').length,
  }
}
