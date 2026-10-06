// Kayıtlar arama/filtre/özet yardımcılarının birim testleri (D-048). Node'un yerleşik test çalıştırıcısı kullanılır.
// Çalıştırma: frontend/ içinde `npm test`.
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  NO_FILTERS,
  RECORD_DISPLAY_LABELS,
  UNDETERMINED,
  countRecords,
  effectiveRouting,
  filterOptions,
  filterRecords,
  recordDisplayState,
} from '../src/records.ts'

type TestRecord = {
  file_name: string
  document_type: string | null
  document_type_name: string | null
  institution_id: string | null
  institution_name: string | null
  needs_review: boolean
  status: string
  validated_document_type: string | null
  validated_document_type_name: string | null
  validated_institution_id: string | null
  validated_institution_name: string | null
  validated_at: string | null
}

// Varsayılan: onaysız, sınıflandırılmış kayıt. Yalnız testin ilgilendiği alanlar verilir.
function record(fields: Partial<TestRecord> & { file_name: string }): TestRecord {
  return {
    document_type: null,
    document_type_name: null,
    institution_id: null,
    institution_name: null,
    needs_review: false,
    status: 'classified',
    validated_document_type: null,
    validated_document_type_name: null,
    validated_institution_id: null,
    validated_institution_name: null,
    validated_at: null,
    ...fields,
  }
}

// Kullanıcı onayı alanları (D-049).
function validatedAs(typeId: string, typeName: string, institutionId: string | null, institutionName: string | null) {
  return {
    validated_document_type: typeId,
    validated_document_type_name: typeName,
    validated_institution_id: institutionId,
    validated_institution_name: institutionName,
    validated_at: '2026-10-06T09:15:00+00:00',
  }
}

const AI_RESULT = {
  document_type: 'complaint',
  document_type_name: 'Şikayet',
  institution_id: 'fen_isleri',
  institution_name: 'Fen İşleri Müdürlüğü',
}

const RECORDS = [
  record({ file_name: 'kaldirim-sikayeti.pdf', document_type: 'complaint', institution_id: 'fen_isleri' }),
  record({ file_name: 'Çöp Şikâyeti.docx', document_type: 'complaint', institution_id: 'temizlik_isleri' }),
  record({ file_name: 'PARK-TALEBİ.pdf', document_type: 'request', institution_id: 'park_bahceler' }),
  record({ file_name: 'el-yazisi.jpeg', document_type: 'other', needs_review: true, status: 'needs_review' }),
  record({ file_name: 'bozuk.pdf', status: 'failed' }),
]

const names = (records: { file_name: string }[]) => records.map((record) => record.file_name)

describe('filterRecords', () => {
  test('filtre yoksa tüm kayıtlar sırası korunarak döner', () => {
    assert.deepEqual(filterRecords(RECORDS, NO_FILTERS), RECORDS)
    assert.deepEqual(filterRecords(RECORDS, { ...NO_FILTERS, query: '   ' }), RECORDS)
  })

  test('dosya adı araması büyük/küçük harfe duyarsızdır', () => {
    assert.deepEqual(names(filterRecords(RECORDS, { ...NO_FILTERS, query: 'KALDIRIM' })), ['kaldirim-sikayeti.pdf'])
    assert.deepEqual(names(filterRecords(RECORDS, { ...NO_FILTERS, query: 'park-talebi' })), ['PARK-TALEBİ.pdf'])
  })

  test('Türkçe karakterler sade eşleriyle iki yönde eşleşir', () => {
    // ş/s ve ı/i: Türkçe yazılan sorgu ASCII dosya adını, ASCII sorgu Türkçe dosya adını bulur.
    assert.deepEqual(names(filterRecords(RECORDS, { ...NO_FILTERS, query: 'şikayet' })), [
      'kaldirim-sikayeti.pdf',
      'Çöp Şikâyeti.docx',
    ])
    assert.deepEqual(names(filterRecords(RECORDS, { ...NO_FILTERS, query: 'kaldırım' })), ['kaldirim-sikayeti.pdf'])
    assert.deepEqual(names(filterRecords(RECORDS, { ...NO_FILTERS, query: 'cop' })), ['Çöp Şikâyeti.docx'])
    assert.deepEqual(names(filterRecords(RECORDS, { ...NO_FILTERS, query: 'yazısı' })), ['el-yazisi.jpeg'])
  })

  test('bulanık arama yapılmaz: harf eksik ya da yanlışsa eşleşmez', () => {
    assert.deepEqual(filterRecords(RECORDS, { ...NO_FILTERS, query: 'kaldrim' }), [])
  })

  test('tür, kurum ve durum filtreleri birlikte uygulanır', () => {
    assert.deepEqual(names(filterRecords(RECORDS, { ...NO_FILTERS, documentType: 'complaint' })), [
      'kaldirim-sikayeti.pdf',
      'Çöp Şikâyeti.docx',
    ])
    assert.deepEqual(
      names(filterRecords(RECORDS, { ...NO_FILTERS, documentType: 'complaint', institution: 'temizlik_isleri' })),
      ['Çöp Şikâyeti.docx'],
    )
    assert.deepEqual(names(filterRecords(RECORDS, { ...NO_FILTERS, status: 'needs_review' })), ['el-yazisi.jpeg'])
    assert.deepEqual(filterRecords(RECORDS, { ...NO_FILTERS, documentType: 'request', status: 'failed' }), [])
  })

  test('türü ya da kurumu olmayan kayıtlar "Belirlenemedi" değeriyle filtrelenir', () => {
    assert.deepEqual(names(filterRecords(RECORDS, { ...NO_FILTERS, documentType: UNDETERMINED })), ['bozuk.pdf'])
    assert.deepEqual(names(filterRecords(RECORDS, { ...NO_FILTERS, institution: UNDETERMINED })), [
      'el-yazisi.jpeg',
      'bozuk.pdf',
    ])
  })
})

describe('filterOptions', () => {
  test('tekil seçenekler Türkçe sıralanır, "Belirlenemedi" sonda tek seçenektir', () => {
    const options = filterOptions([
      { id: 'zabita', name: 'Zabıta Müdürlüğü' },
      { id: null, name: null },
      { id: 'imar', name: 'İmar ve Şehircilik Müdürlüğü' },
      { id: 'zabita', name: 'Zabıta Müdürlüğü' },
      { id: 'fen_isleri', name: 'Fen İşleri Müdürlüğü' },
      { id: null, name: null },
    ])
    assert.deepEqual(options, [
      { value: 'fen_isleri', label: 'Fen İşleri Müdürlüğü' },
      { value: 'imar', label: 'İmar ve Şehircilik Müdürlüğü' },
      { value: 'zabita', label: 'Zabıta Müdürlüğü' },
      { value: UNDETERMINED, label: 'Belirlenemedi' },
    ])
  })

  test('katalog adı yoksa ID gösterilir', () => {
    assert.deepEqual(filterOptions([{ id: 'eski_tur', name: null }]), [{ value: 'eski_tur', label: 'eski_tur' }])
  })
})

describe('countRecords', () => {
  test('toplam, inceleme gereken ve başarısız sayıları çakışmaz', () => {
    assert.deepEqual(countRecords(RECORDS), { total: 5, needsReview: 1, failed: 1 })
    assert.deepEqual(countRecords([]), { total: 0, needsReview: 0, failed: 0 })
  })

  test('onaylanan needs_review kaydı İnceleme Gereken sayısına girmez', () => {
    const records = [
      record({ file_name: 'acik.pdf', needs_review: true, status: 'needs_review' }),
      record({ file_name: 'onayli.pdf', needs_review: true, status: 'needs_review', ...validatedAs('other', 'Diğer', null, null) }),
      record({ file_name: 'onayli-normal.pdf', ...AI_RESULT, ...validatedAs('request', 'Talep Dilekçesi', 'fen_isleri', 'Fen İşleri Müdürlüğü') }),
      record({ file_name: 'bozuk.pdf', status: 'failed' }),
    ]
    assert.deepEqual(countRecords(records), { total: 4, needsReview: 1, failed: 1 })
  })
})

// Human Validation + Routing Correction (D-049)

describe('effectiveRouting', () => {
  test('onaysız kayıtta AI değerleri kullanılır', () => {
    assert.deepEqual(effectiveRouting(record({ file_name: 'a.pdf', ...AI_RESULT })), {
      documentTypeId: 'complaint',
      documentTypeName: 'Şikayet',
      institutionId: 'fen_isleri',
      institutionName: 'Fen İşleri Müdürlüğü',
      validated: false,
      typeChanged: false,
      institutionChanged: false,
    })
  })

  test('değiştirmeden onaylanan kayıtta onaylanan değerler kullanılır, değişiklik işareti yoktur', () => {
    const routing = effectiveRouting(
      record({ file_name: 'a.pdf', ...AI_RESULT, ...validatedAs('complaint', 'Şikayet', 'fen_isleri', 'Fen İşleri Müdürlüğü') }),
    )
    assert.deepEqual(routing, {
      documentTypeId: 'complaint',
      documentTypeName: 'Şikayet',
      institutionId: 'fen_isleri',
      institutionName: 'Fen İşleri Müdürlüğü',
      validated: true,
      typeChanged: false,
      institutionChanged: false,
    })
  })

  test('düzeltilen tür onaylanan türü ve tür değişikliğini döndürür', () => {
    const routing = effectiveRouting(
      record({ file_name: 'a.pdf', ...AI_RESULT, ...validatedAs('request', 'Talep Dilekçesi', 'fen_isleri', 'Fen İşleri Müdürlüğü') }),
    )
    assert.equal(routing.documentTypeId, 'request')
    assert.equal(routing.documentTypeName, 'Talep Dilekçesi')
    assert.equal(routing.typeChanged, true)
    assert.equal(routing.institutionChanged, false)
  })

  test('düzeltilen kurum onaylanan kurumu ve kurum değişikliğini döndürür', () => {
    const routing = effectiveRouting(
      record({ file_name: 'a.pdf', ...AI_RESULT, ...validatedAs('complaint', 'Şikayet', 'zabita', 'Zabıta Müdürlüğü') }),
    )
    assert.equal(routing.institutionId, 'zabita')
    assert.equal(routing.institutionName, 'Zabıta Müdürlüğü')
    assert.equal(routing.institutionChanged, true)
    assert.equal(routing.typeChanged, false)
  })

  test('kurumu null onaylanan kayıtta AI kurumu kullanılmaz', () => {
    const routing = effectiveRouting(record({ file_name: 'a.pdf', ...AI_RESULT, ...validatedAs('complaint', 'Şikayet', null, null) }))
    assert.equal(routing.institutionId, null)
    assert.equal(routing.institutionName, null)
    assert.equal(routing.validated, true)
    assert.equal(routing.institutionChanged, true)
  })
})

describe('recordDisplayState', () => {
  test('failed kayıt Başarısız gösterilir', () => {
    assert.equal(recordDisplayState(record({ file_name: 'a.pdf', status: 'failed' })), 'failed')
  })

  test('onaylı kayıt AI durumundan bağımsız olarak Onaylandı gösterilir', () => {
    const approval = validatedAs('complaint', 'Şikayet', null, null)
    assert.equal(recordDisplayState(record({ file_name: 'a.pdf', ...approval })), 'validated')
    assert.equal(recordDisplayState(record({ file_name: 'b.pdf', needs_review: true, status: 'needs_review', ...approval })), 'validated')
  })

  test('onaysız needs_review kaydı İnceleme gerekli gösterilir', () => {
    assert.equal(recordDisplayState(record({ file_name: 'a.pdf', needs_review: true, status: 'needs_review' })), 'needs_review')
  })

  test('onaysız classified kaydı Sınıflandırıldı gösterilir', () => {
    assert.equal(recordDisplayState(record({ file_name: 'a.pdf' })), 'classified')
  })

  test('gösterim etiketleri Türkçedir', () => {
    assert.deepEqual(RECORD_DISPLAY_LABELS, {
      classified: 'Sınıflandırıldı',
      needs_review: 'İnceleme gerekli',
      validated: 'Onaylandı',
      failed: 'Başarısız',
    })
  })
})

describe('filterRecords (effective değerler)', () => {
  const CORRECTED = [
    record({ file_name: 'tur-duzeltildi.pdf', ...AI_RESULT, ...validatedAs('request', 'Talep Dilekçesi', 'fen_isleri', 'Fen İşleri Müdürlüğü') }),
    record({ file_name: 'kurum-kaldirildi.pdf', ...AI_RESULT, ...validatedAs('complaint', 'Şikayet', null, null) }),
    record({ file_name: 'onaysiz.pdf', ...AI_RESULT }),
    record({ file_name: 'acik-inceleme.pdf', ...AI_RESULT, needs_review: true, status: 'needs_review' }),
    record({ file_name: 'onayli-inceleme.pdf', ...AI_RESULT, needs_review: true, status: 'needs_review', ...validatedAs('complaint', 'Şikayet', 'fen_isleri', 'Fen İşleri Müdürlüğü') }),
  ]

  test('tür filtresi onaylanan türü kullanır', () => {
    assert.deepEqual(names(filterRecords(CORRECTED, { ...NO_FILTERS, documentType: 'request' })), ['tur-duzeltildi.pdf'])
    assert.ok(!names(filterRecords(CORRECTED, { ...NO_FILTERS, documentType: 'complaint' })).includes('tur-duzeltildi.pdf'))
  })

  test('kurum filtresi onaylanan kurumu kullanır', () => {
    assert.deepEqual(names(filterRecords(CORRECTED, { ...NO_FILTERS, institution: UNDETERMINED })), ['kurum-kaldirildi.pdf'])
    assert.ok(!names(filterRecords(CORRECTED, { ...NO_FILTERS, institution: 'fen_isleri' })).includes('kurum-kaldirildi.pdf'))
  })

  test('durum filtresi gösterim durumunu kullanır', () => {
    assert.deepEqual(names(filterRecords(CORRECTED, { ...NO_FILTERS, status: 'validated' })), [
      'tur-duzeltildi.pdf',
      'kurum-kaldirildi.pdf',
      'onayli-inceleme.pdf',
    ])
    assert.deepEqual(names(filterRecords(CORRECTED, { ...NO_FILTERS, status: 'needs_review' })), ['acik-inceleme.pdf'])
    assert.deepEqual(names(filterRecords(CORRECTED, { ...NO_FILTERS, status: 'classified' })), ['onaysiz.pdf'])
  })
})
