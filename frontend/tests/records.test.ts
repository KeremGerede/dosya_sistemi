// Kayıtlar arama/filtre/özet yardımcılarının birim testleri (D-048). Node'un yerleşik test çalıştırıcısı kullanılır.
// Çalıştırma: frontend/ içinde `npm test`.
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  NEUTRAL_EVIDENCE_LABEL,
  NO_FILTERS,
  RECORD_DISPLAY_LABELS,
  UNDETERMINED,
  countRecords,
  effectiveRouting,
  filterOptions,
  findEvidenceInText,
  filterRecords,
  recordDisplayState,
  routingEvidenceSection,
} from '../src/records.ts'
import type { RoutingEvidence } from '../src/records.ts'

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

// Belgedeki ilgili ifade (D-050)

const TYPE_EVIDENCE: RoutingEvidence = {
  quote: 'Gül Sokak üzerindeki kaldırım taşları kırık ve yerinden çıkmış durumdadır.',
  supports: 'document_type',
}
const INSTITUTION_EVIDENCE: RoutingEvidence = { quote: 'T.C. ÖRNEK BELEDİYESİ FEN İŞLERİ MÜDÜRLÜĞÜNE', supports: 'institution' }
const BOTH_EVIDENCE: RoutingEvidence = { quote: 'Kaldırımın onarılmasını talep ediyorum.', supports: 'both' }

// AI sonucu complaint / fen_isleri olan kayıt; evidence backend yanıtındaki gibi verilir.
function withEvidence(routing_evidence: RoutingEvidence[] | null, fields: Partial<TestRecord> = {}) {
  return { ...record({ file_name: 'a.pdf', ...AI_RESULT, ...fields }), routing_evidence }
}

describe('routingEvidenceSection', () => {
  test('evidence null ise bölüm yoktur', () => {
    assert.equal(routingEvidenceSection(withEvidence(null)), null)
  })

  test('evidence boş liste ise bölüm yoktur (boş durum mesajı üretilmez)', () => {
    assert.equal(routingEvidenceSection(withEvidence([])), null)
  })

  test('başarısız kayıtta evidence null olduğu için bölüm yoktur', () => {
    const failed = withEvidence(null, { status: 'failed', document_type: null, document_type_name: null, institution_id: null })
    assert.equal(routingEvidenceSection(failed), null)
  })

  test('tek ifade birebir ve başlığıyla döner', () => {
    assert.deepEqual(routingEvidenceSection(withEvidence([TYPE_EVIDENCE])), {
      items: [{ quote: TYPE_EVIDENCE.quote, label: 'Belge türüne dayanak' }],
      aiBasis: false,
    })
  })

  test('iki ifade backend sırasıyla döner', () => {
    assert.deepEqual(routingEvidenceSection(withEvidence([INSTITUTION_EVIDENCE, TYPE_EVIDENCE]))?.items, [
      { quote: INSTITUTION_EVIDENCE.quote, label: 'Hedef kuruma dayanak' },
      { quote: TYPE_EVIDENCE.quote, label: 'Belge türüne dayanak' },
    ])
  })

  test('ham supports değeri kullanıcıya sızmaz: yalnız ifade metni ve Türkçe başlık döner', () => {
    const section = routingEvidenceSection(withEvidence([TYPE_EVIDENCE, INSTITUTION_EVIDENCE, BOTH_EVIDENCE]))
    assert.ok(section !== null)
    assert.deepEqual(Object.keys(section), ['items', 'aiBasis'])
    assert.ok(section.items.every((item) => Object.keys(item).join() === 'quote,label'))
    assert.deepEqual(
      section.items.map((item) => item.quote),
      [TYPE_EVIDENCE.quote, INSTITUTION_EVIDENCE.quote, BOTH_EVIDENCE.quote],
    )
    assert.doesNotMatch(JSON.stringify(section), /document_type|institution|both|supports/)
  })

  test('uzun ifade kısaltılmadan ve değiştirilmeden döner', () => {
    const long = `Mahallemizdeki Gülpınar Sokak ile Şehit Öğretmen Caddesi kesişiminde bulunan yaya kaldırımının yaklaşık on beş metrelik bölümü çökmüş, "parke" taşları yerinden çıkmıştır; ızgara kırıktır (İ/ı, Ş/ş, Ğ/ğ korunur) ${'ve '.repeat(20)}son.`
    const section = routingEvidenceSection(withEvidence([{ quote: long, supports: 'both' }]))
    assert.ok(section !== null)
    assert.equal(section.items[0].quote, long)
    assert.equal(section.items[0].quote.length, long.length)
    assert.ok(!section.items[0].quote.endsWith('…') && !section.items[0].quote.endsWith('...'))
  })

  test('örtüşen veya kapsayan ifadeler tekilleştirilmez', () => {
    const short = { quote: 'asfalt yenileme çalışmalarının listesi', supports: 'document_type' } as const
    const containing = { quote: '2025 yılında yapılan asfalt yenileme çalışmalarının listesi', supports: 'institution' } as const
    assert.deepEqual(
      routingEvidenceSection(withEvidence([short, containing]))?.items.map((item) => item.quote),
      [short.quote, containing.quote],
    )
  })

  describe('ifade başlıkları (D-052)', () => {
    const labels = (evidence: RoutingEvidence[]) => routingEvidenceSection(withEvidence(evidence))?.items.map((item) => item.label)

    test('her supports değeri kendi başlığına çevrilir', () => {
      assert.deepEqual(labels([TYPE_EVIDENCE]), ['Belge türüne dayanak'])
      assert.deepEqual(labels([INSTITUTION_EVIDENCE]), ['Hedef kuruma dayanak'])
      assert.deepEqual(labels([BOTH_EVIDENCE]), ['Belge türü ve hedef kuruma dayanak'])
    })

    test('başlık sıradan tahmin edilmez: sıra değişince başlık ifadesiyle birlikte gider', () => {
      assert.deepEqual(labels([TYPE_EVIDENCE, INSTITUTION_EVIDENCE]), ['Belge türüne dayanak', 'Hedef kuruma dayanak'])
      assert.deepEqual(labels([INSTITUTION_EVIDENCE, TYPE_EVIDENCE]), ['Hedef kuruma dayanak', 'Belge türüne dayanak'])
      assert.deepEqual(labels([INSTITUTION_EVIDENCE, BOTH_EVIDENCE]), ['Hedef kuruma dayanak', 'Belge türü ve hedef kuruma dayanak'])
    })

    test('başlık ifade metninden tahmin edilmez', () => {
      // Metin kurum adı içerse de supports document_type ise başlık belge türüdür.
      const quote = { quote: 'FEN İŞLERİ MÜDÜRLÜĞÜNE kaldırım şikayeti', supports: 'document_type' } as const
      assert.deepEqual(labels([quote]), ['Belge türüne dayanak'])
    })

    test('tanımsız supports değeri nötr başlığa düşer ve ham değer görünmez', () => {
      const unknown = [
        { quote: 'a', supports: 'sender' },
        { quote: 'b', supports: '' },
        { quote: 'c', supports: 'toString' },
      ] as unknown as RoutingEvidence[]
      assert.deepEqual(labels(unknown), [NEUTRAL_EVIDENCE_LABEL, NEUTRAL_EVIDENCE_LABEL, NEUTRAL_EVIDENCE_LABEL])
      assert.equal(NEUTRAL_EVIDENCE_LABEL, 'İlgili ifade')
    })
  })

  describe('Human Validation bağlamı (bölüm düzeyinde)', () => {
    const aiBasis = (fields: Partial<TestRecord>) => routingEvidenceSection(withEvidence([TYPE_EVIDENCE], fields))?.aiBasis

    test('onaysız kayıtta not yoktur', () => {
      assert.equal(aiBasis({}), false)
    })

    test('AI sonucu değiştirilmeden onaylandıysa not yoktur', () => {
      assert.equal(aiBasis(validatedAs('complaint', 'Şikayet', 'fen_isleri', 'Fen İşleri Müdürlüğü')), false)
    })

    test('belge türü düzeltildiyse "AI önerisinin dayanağı" notu gerekir', () => {
      assert.equal(aiBasis(validatedAs('request', 'Talep Dilekçesi', 'fen_isleri', 'Fen İşleri Müdürlüğü')), true)
    })

    test('kurum düzeltildiyse not gerekir', () => {
      assert.equal(aiBasis(validatedAs('complaint', 'Şikayet', 'zabita', 'Zabıta Müdürlüğü')), true)
    })

    test('tür ve kurum birlikte düzeltildiyse not gerekir', () => {
      assert.equal(aiBasis(validatedAs('request', 'Talep Dilekçesi', 'zabita', 'Zabıta Müdürlüğü')), true)
    })

    test('kurum "Belirlenemedi" (null) olarak onaylandıysa not gerekir', () => {
      assert.equal(aiBasis(validatedAs('complaint', 'Şikayet', null, null)), true)
    })

    test('AI kurumu null iken kurum yine null onaylandıysa not yoktur', () => {
      const fields = { institution_id: null, institution_name: null, ...validatedAs('complaint', 'Şikayet', null, null) }
      assert.equal(aiBasis(fields), false)
    })

    test('tekrar onayda son onay geçerlidir: düzeltme sonrası AI değerlerine dönülürse not kalkar', () => {
      assert.equal(aiBasis(validatedAs('request', 'Talep Dilekçesi', 'zabita', 'Zabıta Müdürlüğü')), true)
      assert.equal(aiBasis(validatedAs('complaint', 'Şikayet', 'fen_isleri', 'Fen İşleri Müdürlüğü')), false)
    })

    test('not ifadelerin metnini ve başlıklarını değiştirmez', () => {
      const section = routingEvidenceSection(
        withEvidence(
          [TYPE_EVIDENCE, INSTITUTION_EVIDENCE],
          validatedAs('request', 'Talep Dilekçesi', 'zabita', 'Zabıta Müdürlüğü'),
        ),
      )
      assert.deepEqual(section, {
        items: [
          { quote: TYPE_EVIDENCE.quote, label: 'Belge türüne dayanak' },
          { quote: INSTITUTION_EVIDENCE.quote, label: 'Hedef kuruma dayanak' },
        ],
        aiBasis: true,
      })
    })
  })
})

describe('findEvidenceInText ("Metinde göster", F-04)', () => {
  const TEXT = 'Sayın Başkanlık, Gülpınar Sokak üzerindeki kaldırım çökmüştür. Gülpınar Sokak için onarım talep ediyorum.'

  test('ilk birebir geçişi bulur; parçalar birleşince metnin kendisi olur', () => {
    const match = findEvidenceInText(TEXT, 'kaldırım çökmüştür')
    assert.ok(match !== null)
    assert.equal(match.quote, 'kaldırım çökmüştür')
    assert.equal(match.before, 'Sayın Başkanlık, Gülpınar Sokak üzerindeki ')
    assert.equal(match.before + match.quote + match.after, TEXT)
  })

  test('ifade birden fazla geçiyorsa yalnız ilk geçiş döner', () => {
    const match = findEvidenceInText(TEXT, 'Gülpınar Sokak')
    assert.ok(match !== null)
    assert.equal(match.before, 'Sayın Başkanlık, ')
    assert.ok(match.after.includes('Gülpınar Sokak için'))
  })

  test('metinde geçmeyen ifade null döner', () => {
    assert.equal(findEvidenceInText(TEXT, 'asfalt yenileme'), null)
  })

  test('büyük/küçük harf farkı eşleşmez', () => {
    assert.equal(findEvidenceInText(TEXT, 'gülpınar sokak'), null)
    assert.equal(findEvidenceInText(TEXT, 'KALDIRIM ÇÖKMÜŞTÜR'), null)
  })

  test('Türkçe karakter farkı eşleşmez (katlama yok)', () => {
    assert.equal(findEvidenceInText(TEXT, 'Gulpinar Sokak'), null)
    assert.equal(findEvidenceInText(TEXT, 'kaldirim cokmustur'), null)
  })

  test('whitespace farkı katlanmaz', () => {
    assert.equal(findEvidenceInText(TEXT, 'Gülpınar  Sokak'), null)
  })

  test('NFC kanonik eşdeğerlik eşleşir: NFD metin ve NFC ifade', () => {
    const nfdText = 'Konu: Şikayet dilekçesi üzerine'
    const match = findEvidenceInText(nfdText, 'Şikayet dilekçesi')
    assert.ok(match !== null)
    assert.equal(match.quote, 'Şikayet dilekçesi')
    assert.equal(match.before + match.quote + match.after, nfdText.normalize('NFC'))
  })

  test('NFC kanonik eşdeğerlik eşleşir: NFC metin ve NFD ifade', () => {
    assert.ok(findEvidenceInText('Şikayet dilekçesi', 'Şikayet') !== null)
  })

  test('metin null veya ifade boşsa null döner', () => {
    assert.equal(findEvidenceInText(null, 'kaldırım'), null)
    assert.equal(findEvidenceInText(TEXT, ''), null)
  })
})
