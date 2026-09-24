// Belge Önizlemesi (V1.4, D-045): prepare yanıtındaki extracted_text'ten tarayıcıda, deterministik olarak
// okunur alanlar çıkarır. Gemini, backend veya yeni bağımlılık kullanılmaz. Açıkça bulunamayan alan null kalır;
// tahmin edilmez ve başka alandan anlam çıkarılmaz.
//
// Not: Backend metni normalize ettiği için satır sonları yoktur (tüm metin tek satır). Değerler bu yüzden etiketten
// sonra; sonraki etikette, cümle sonunda veya satır sonu izinde (küçük harfle biten kelimeden sonra büyük harfle
// başlayan kelime) kesilir.

export type DocumentPreview = {
  fileName: string
  heading: string | null
  subject: string | null
  date: string | null
  documentNo: string | null
  sender: string | null
  senderInstitution: string | null
  content: string | null
}

const CONTENT_PREVIEW_LENGTH = 900 // Belge İçeriği alanında gösterilen yaklaşık karakter sayısı
const HEADING_SEARCH_LENGTH = 300 // hitap yalnız metnin başında aranır
const SUBJECT_MAX_WORDS = 30

const FOLD_MAP: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' }

// Karşılaştırma için Türkçe küçük harfe çevirip aksanları sadeleştirir. Uzunluk korunur (her karakter tek karaktere
// eşlenir), böylece katlanmış metindeki konumlar orijinal metinde de geçerlidir. OCR'ın İ→I, Ç→C kayıpları da eşleşir.
function fold(text: string): string {
  return text.toLocaleLowerCase('tr-TR').replace(/[çğıöşüâîû]/g, (char) => FOLD_MAP[char])
}

// Ad-soyad ve kurum okumasını durduran kelimeler (katlanmış biçim).
const STOP_WORDS = new Set([
  'adres', 'tel', 'telefon', 'gsm', 'e-posta', 'eposta', 'evrak', 'tarih', 'konu', 'sayi', 'tc', 't.c.', 'kimlik',
  'imza', 'belge', 'kurum', 'kurulus', 'firma', 'gonderen', 'basvuran', 'mah', 'mah.', 'mahallesi', 'cad', 'cad.',
  'caddesi', 'sok', 'sok.', 'sokak', 'no', 'tutar', 'talep', 'sayin',
])

const NAME_WORD = /^(?:\p{Lu}\p{Ll}+|\p{Lu}{2,})$/u
const INSTITUTION_WORD = /^\p{Lu}[\p{L}'’.&-]*$/u
const INSTITUTION_CONNECTORS = new Set(['ve', 'ile', '&', '-'])
const DATE_PATTERN = /(?<!\d)(\d{1,2})([./-])(\d{1,2})\2(\d{4})(?!\d)/gu
const DOCUMENT_NO_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}/._-]*$/u
// Metnin başındaki büyük harfli hitap: "ÇANKAYA BELEDİYE BAŞKANLIĞINA", "MALİ HİZMETLER MÜDÜRLÜĞÜNE".
const HEADING_PATTERN = /(?:^|\s)((?:\p{Lu}[\p{Lu}.'’&-]*\s+){1,7}\p{Lu}[\p{Lu}'’]*(?:NA|NE|YA|YE))(?=[\s,.:;]|$)/u

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Etiketin (katlanmış biçimde verilir) her geçişi için değerin başladığı konumu sırayla döndürür.
// requireColon=false iken etiket orijinal metinde büyük harfle başlamalıdır (düzyazıdaki "sayı" gibi kelimeler elenir).
function* labelValueStarts(text: string, folded: string, label: string, requireColon: boolean): Generator<number> {
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])${escapeRegex(label).replace(/ /g, '\\s+')}(?![\\p{L}\\p{N}])\\s*(:)?\\s*`,
    'gu',
  )
  for (const match of folded.matchAll(pattern)) {
    const hasColon = match[1] !== undefined
    if (requireColon && !hasColon) {
      continue
    }
    if (!hasColon && !/^\p{Lu}/u.test(text.slice(match.index))) {
      continue
    }
    yield match.index + match[0].length
  }
}

// Etiketleri öncelik sırasıyla dener; ilk geçerli değeri döndürür.
function labeledValue(
  text: string,
  folded: string,
  labels: string[],
  requireColon: boolean,
  read: (rest: string, start: number) => string | null,
): string | null {
  for (const label of labels) {
    for (const start of labelValueStarts(text, folded, label, requireColon)) {
      const value = read(text.slice(start), start)
      if (value !== null) {
        return value
      }
    }
  }
  return null
}

function stripTrailingPunctuation(word: string): string {
  return word.replace(/[,;:.)]+$/u, '')
}

// 2-3 kelimelik ad-soyad; etiket, adres/iletişim kelimesi veya ad biçiminde olmayan kelimede durur.
function readName(rest: string): string | null {
  const name: string[] = []
  for (const raw of rest.split(' ')) {
    const word = stripTrailingPunctuation(raw)
    if (name.length === 3 || raw.endsWith(':') || !NAME_WORD.test(word) || STOP_WORDS.has(fold(word))) {
      break
    }
    name.push(word)
    if (word !== raw) {
      break // noktalama adın bittiğini gösterir
    }
  }
  return name.length >= 2 ? name.join(' ') : null
}

function readDocumentNo(rest: string): string | null {
  const token = stripTrailingPunctuation(rest.split(' ')[0] ?? '')
  return token.length <= 40 && DOCUMENT_NO_PATTERN.test(token) && /\d/u.test(token) ? token : null
}

function readLeadingDate(rest: string): string | null {
  const match = rest.match(/^(\d{1,2})([./-])(\d{1,2})\2(\d{4})(?!\d)/u)
  return match !== null && isValidDate(match) ? match[0] : null
}

function isValidDate(match: RegExpMatchArray): boolean {
  const day = Number(match[1])
  const month = Number(match[3])
  return day >= 1 && day <= 31 && month >= 1 && month <= 12
}

// Konu: açık etiketin değeri mümkün olduğunca tam alınır. "hakkında"/"hk." bitiş sayılmaz. Değer sonraki etikette
// ("Tarih:"), "Sayın" hitabında, "!"/"?" ile biten kelimede ya da satır sonu izinde (küçük harfle veya noktayla biten
// kelimeden sonra büyük harfle başlayan kelime: gövdenin başladığı yer) kesilir.
function readSubject(rest: string): string | null {
  const words: string[] = []
  for (const word of rest.split(' ')) {
    const previous = words[words.length - 1]
    if (word === '' || word.endsWith(':') || fold(word) === 'sayin' || words.length === SUBJECT_MAX_WORDS) {
      break
    }
    if (previous !== undefined && /^\p{Lu}/u.test(word) && /\p{Ll}\.?$/u.test(previous)) {
      break
    }
    words.push(word)
    if (/[!?]$/u.test(word)) {
      break
    }
  }
  const subject = words.join(' ').replace(/[,;:]+$/u, '')
  const cleaned = subject.endsWith('hk.') ? subject : subject.replace(/[.!?]+$/u, '')
  return cleaned.length >= 3 ? cleaned : null
}

// Kurum adı: büyük harfle başlayan kelimeler ve bağlaçlar ("ve", "ile") dizisi; ilk küçük harfli kelimede durur.
function readInstitution(rest: string): string | null {
  const words: string[] = []
  for (const raw of rest.split(' ')) {
    const word = stripTrailingPunctuation(raw)
    const connector = INSTITUTION_CONNECTORS.has(fold(word))
    if (words.length === 8 || raw.endsWith(':') || (!connector && !INSTITUTION_WORD.test(word))) {
      break
    }
    words.push(word)
    if (word !== raw) {
      break
    }
  }
  while (words.length > 0 && INSTITUTION_CONNECTORS.has(fold(words[words.length - 1]))) {
    words.pop()
  }
  return words.length > 0 && words.join(' ').length >= 2 ? words.join(' ') : null
}

function findHeading(text: string): { value: string; end: number } | null {
  const head = text.slice(0, HEADING_SEARCH_LENGTH)
  const match = head.match(HEADING_PATTERN)
  if (match === null || match.index === undefined) {
    return null
  }
  const value = match[1]
  return { value, end: match.index + match[0].length }
}

function findDate(text: string, folded: string): string | null {
  const labeled = labeledValue(text, folded, ['tarih'], false, readLeadingDate)
  if (labeled !== null) {
    return labeled
  }
  // Etiket yoksa yalnız metinde tek bir farklı tarih geçiyorsa kullanılır; birden fazlaysa seçim yapılmaz.
  const dates = new Set([...text.matchAll(DATE_PATTERN)].filter(isValidDate).map((match) => match[0]))
  return dates.size === 1 ? [...dates][0] : null
}

export function buildDocumentPreview(extractedText: string | null, fileName: string): DocumentPreview {
  const text = (extractedText ?? '').replace(/\s+/gu, ' ').trim()
  const empty = {
    fileName, heading: null, subject: null, date: null, documentNo: null, sender: null, senderInstitution: null, content: null,
  }
  if (text === '') {
    return empty
  }
  const folded = fold(text)
  const heading = findHeading(text)

  const senderInstitution = labeledValue(
    text, folded, ['gonderen kurum', 'kurum adi', 'kurum', 'kurulus', 'firma'], true,
    (rest, start) => {
      // Muhatap/alıcı kurum gönderen sayılmaz: etiketten önce "muhatap"/"alıcı" varsa ya da değer hitap gibiyse atlanır.
      const before = folded.slice(Math.max(0, start - 30), start)
      const value = readInstitution(rest)
      if (value === null || /(?:muhatap|alici|ilgili)\s+kurum/u.test(before)) {
        return null
      }
      const addressee = /(?:na|ne|ya|ye)$/u.test(fold(value)) || (heading !== null && fold(heading.value) === fold(value))
      return addressee ? null : value
    },
  )

  const contentStart = heading?.end ?? 0
  let content = text.slice(contentStart).trim()
  if (content.length > CONTENT_PREVIEW_LENGTH) {
    content = `${content.slice(0, CONTENT_PREVIEW_LENGTH).replace(/\s+\S*$/u, '')} …`
  }

  return {
    fileName,
    heading: heading?.value ?? null,
    subject: labeledValue(text, folded, ['talep konusu', 'basvuru konusu', 'konusu', 'konu'], true, readSubject),
    date: findDate(text, folded),
    documentNo: labeledValue(text, folded, ['evrak no', 'evrak numarasi', 'belge no', 'sayi'], false, readDocumentNo),
    // Gönderen yalnız açık etiketten okunur; imza satırındaki etiketsiz ad tahmin edilmez (kişi adı Gemini sonucunda gelir).
    sender: labeledValue(text, folded, ['ad soyad', 'adi soyadi', 'gonderen', 'basvuran'], false, readName),
    senderInstitution,
    content: content === '' ? null : content,
  }
}
