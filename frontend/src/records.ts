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

// Belgedeki ilgili ifade (D-050): backend'in kaynakta birebir doğruladığı ifade. Ham supports değeri arayüzde
// gösterilmez; yalnız ifade başlığına çevrilir (D-052).
export type RoutingEvidence = { quote: string; supports: 'document_type' | 'institution' | 'both' }

export type EvidenceItem = { quote: string; label: string }

export type EvidenceSection = {
  items: EvidenceItem[]
  aiBasis: boolean // kullanıcı türü veya kurumu AI önerisinden farklı onayladı: ifadeler AI önerisinin dayanağıdır
}

// İfade başlığı (D-052) yalnız supports'tan gelir; ifade sırasından veya metninden tahmin edilmez. Değer API'den
// geldiği için tanımsız bir değer (ör. ileride eklenen) nötr başlığa düşer.
const EVIDENCE_LABELS = new Map<string, string>([
  ['document_type', 'Belge türüne dayanak'],
  ['institution', 'Hedef kuruma dayanak'],
  ['both', 'Belge türü ve hedef kuruma dayanak'],
])
export const NEUTRAL_EVIDENCE_LABEL = 'İlgili ifade'

// Bölüm yalnız doğrulanmış ifade varsa görünür; null ve [] aynıdır, boş durum mesajı yoktur. İfadeler backend'in
// sırasıyla ve birebir döner: kısaltma, tekilleştirme veya filtre yapılmaz. Onay bağlamı bölüm düzeyindedir (D-050):
// kullanıcı türü veya kurumu düzeltse de başlıklar değişmez.
export function routingEvidenceSection(
  record: RoutingFields & { routing_evidence: RoutingEvidence[] | null },
): EvidenceSection | null {
  const evidence = record.routing_evidence ?? []
  if (evidence.length === 0) {
    return null
  }
  const routing = effectiveRouting(record)
  return {
    items: evidence.map((item) => ({
      quote: item.quote,
      label: EVIDENCE_LABELS.get(item.supports) ?? NEUTRAL_EVIDENCE_LABEL,
    })),
    aiBasis: routing.typeChanged || routing.institutionChanged,
  }
}

// Çıkarılan metinde ifadenin ilk birebir geçişi; parçalar metnin NFC biçimindendir ve birleşince onu verir.
export type EvidenceMatch = { before: string; quote: string; after: string }

// "Metinde göster" (F-04): backend doğrulamasıyla aynı kural (D-050). Yalnız NFC uygulanır; eşleşme büyük/küçük harfe
// duyarlıdır. fold(), Türkçe/ASCII katlama, whitespace katlaması ve bulanık eşleşme yoktur: kayıttaki metin zaten
// normalize edilmiştir. Metin yoksa, ifade boşsa veya bulunamazsa null döner.
export function findEvidenceInText(text: string | null, quote: string): EvidenceMatch | null {
  if (text === null || quote === '') {
    return null
  }
  const source = text.normalize('NFC')
  const target = quote.normalize('NFC')
  const start = source.indexOf(target)
  if (start === -1) {
    return null
  }
  const end = start + target.length
  return { before: source.slice(0, start), quote: source.slice(start, end), after: source.slice(end) }
}

// Tekrar denemede 409 (D-053): backend Gemini'yi çağırmadan reddetti; kaydın güncel durumu okunduktan sonra kullanıcıya
// ne söyleneceği. İşlenmişse (başka sekme bitirmiş) mesaj yok; hâlâ uygunsa başka bir istek sürüyordur; uygun değilse
// belge yeniden yüklenmelidir. Backend'in 409 metni gösterilmez.
export type RetryConflict = 'busy' | 'not_allowed' | null

export function retryConflict(record: { status: string; retryable: boolean }): RetryConflict {
  if (record.status !== 'failed') {
    return null
  }
  return record.retryable ? 'busy' : 'not_allowed'
}

// Kalıcı silme yanıtı (D-054). 204 ve 404 aynı sonuçtur: kayıt artık yok (404'te kaydı başka bir istek ya da zaman
// aşımına uğramış önceki deneme silmiş olabilir). 409'da kayıt korunur. Diğer yanıtlarda (500, ağ hatası, zaman aşımı)
// sonuç bilinmez: başarı varsayılmaz, kaydın gerçek durumu detay endpoint'inden okunur. 403: kalıcı silme bu ortamda
// kapalıdır (D-057); backend kayda dokunmaz, tekrar denemenin anlamı yoktur.
export type DeleteOutcome = 'deleted' | 'busy' | 'disabled' | 'unknown'

export function deleteOutcome(status: number | null): DeleteOutcome {
  if (status === 204 || status === 404) {
    return 'deleted'
  }
  if (status === 403) {
    return 'disabled'
  }
  return status === 409 ? 'busy' : 'unknown'
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

// Silinen kayıt bir tür ya da kurumun son kaydıysa o seçenek listeden kalkar (D-054). Seçili kalan değer artık hiçbir
// seçenekle eşleşmez: liste boş görünürken açılır menü "tümü" gösterirdi. Bu yüzden yalnız o filtre "tümü" sayılır.
export function keepAvailableFilters(
  filters: RecordFilters,
  typeOptions: FilterOption[],
  institutionOptions: FilterOption[],
): RecordFilters {
  const available = (value: string, options: FilterOption[]) =>
    value === '' || options.some((option) => option.value === value) ? value : ''
  return {
    ...filters,
    documentType: available(filters.documentType, typeOptions),
    institution: available(filters.institution, institutionOptions),
  }
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
