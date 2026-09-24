// buildDocumentPreview birim testleri (V1.4, D-045). Node'un yerleşik test çalıştırıcısı kullanılır; ek bağımlılık yok.
// Çalıştırma: frontend/ içinde `npm test`.
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { buildDocumentPreview } from '../src/documentPreview.ts'

// Backend'in döndürdüğü biçim: normalize edilmiş, satır sonu olmayan tek satır metin.
const TEMIZLIK_TEXT =
  '21.09.2026 ÇANKAYA BELEDİYE BAŞKANLIĞINA Temizlik İşleri Müdürlüğü Konu: Mahallede düzenli toplanmayan evsel ' +
  'atıklar hakkında Kavaklıdere Mahallesi Örnek Sokak üzerinde evsel atıklar iki haftadır düzenli olarak ' +
  'toplanmamaktadır. Konteynerlerin düzenli boşaltılması için gereğinin yapılmasını saygılarımla arz ederim. ' +
  'Ad Soyad: Ayşe Demir Adres: Kavaklıdere Mah. Örnek Sok. No: 12 Çankaya / Ankara Tel: 0555 000 00 00'

// tests/fixtures/ornek_dilekce.doc'tan backend'in çıkardığı metin: gönderen yalnız imza satırında, etiketsiz.
const DOC_FIXTURE_TEXT =
  'KADIKÖY BELEDİYE BAŞKANLIĞINA Konu: Sokağımızdaki çöp konteynerlerinin boşaltılmaması Caferağa Mahallesi, ' +
  'Moda Caddesi No: 114 adresinde ikamet etmekteyim. Sokağımızın girişindeki çöp konteynerleri iki haftadır ' +
  'boşaltılmamaktadır. Konteynerlerin düzenli olarak boşaltılmasını talep ediyorum. Gereğini bilgilerinize arz ' +
  'ederim. 21.09.2026 Ayşe Yıldırım'

function preview(text: string | null) {
  return buildDocumentPreview(text, 'belge.pdf')
}

describe('Konu', () => {
  test('açık "Konu:" etiketinden değeri alır; gövdenin başladığı satır sonu izinde durur', () => {
    assert.equal(preview(TEMIZLIK_TEXT).subject, 'Mahallede düzenli toplanmayan evsel atıklar hakkında')
  })

  // Adım 10 regresyonu: gerçek DOCX'te konu "hakkında" kelimesinde kesiliyordu.
  test('"hakkında" konu değerinin bitişi sayılmaz; değer tam alınır', () => {
    assert.equal(preview('Konu: Emlak vergisi borcu hakkında bilgi talebi').subject, 'Emlak vergisi borcu hakkında bilgi talebi')
    assert.equal(preview('Konu: Park ve bahçeler hakkında bakım talebi').subject, 'Park ve bahçeler hakkında bakım talebi')
  })

  test('tek satır metinde konu sonraki gerçek etikette kesilir', () => {
    const text =
      'MALİ HİZMETLER MÜDÜRLÜĞÜNE Konu: Emlak vergisi borcu hakkında bilgi talebi Tarih: 22.09.2026 Evrak No: 2026/4410'
    assert.equal(preview(text).subject, 'Emlak vergisi borcu hakkında bilgi talebi')
  })

  test('"hk." konu değerinin bitişi sayılmaz', () => {
    const text = 'Konu: Yol çukuru hk. ve kaldırım onarımı Tarih: 03.10.2026'
    assert.equal(preview(text).subject, 'Yol çukuru hk. ve kaldırım onarımı')
  })

  test('tek satır metinde satır sonu izinde (küçük harften sonra büyük harf) durur', () => {
    assert.equal(preview(DOC_FIXTURE_TEXT).subject, 'Sokağımızdaki çöp konteynerlerinin boşaltılmaması')
  })

  test('"Talep Konusu:" ve "Başvuru Konusu:" etiketleri', () => {
    assert.equal(preview('Talep Konusu: Park bankının onarımı. Sayın yetkili').subject, 'Park bankının onarımı')
    assert.equal(preview('BAŞVURU KONUSU: Kültür merkezi salonu. Gereğini arz ederim.').subject, 'Kültür merkezi salonu')
  })

  test('düzyazıdaki "konu" kelimesi etiket sayılmaz', () => {
    assert.equal(preview('Bu konu hakkında daha önce de başvurdum.').subject, null)
  })
})

describe('OCR kaynaklı etiket yazımları', () => {
  const OCR_TEXT =
    'FEN İŞLERİ MÜDÜRLÜĞÜNE KONU: Yol çukuru hk. Sayın yetkili TARİH: 03/10/2026 EVRAK NO: 2026/5521 Başvuran: Nurdan ACAR'

  test('büyük harfli KONU, TARİH ve EVRAK NO etiketleri okunur', () => {
    const result = preview(OCR_TEXT)
    assert.equal(result.subject, 'Yol çukuru hk.')
    assert.equal(result.date, '03/10/2026')
    assert.equal(result.documentNo, '2026/5521')
  })

  test('OCR noktayı düşürdüğünde de (TARIH, MUDURLUGUNE) eşleşir', () => {
    const result = preview('FEN ISLERI MUDURLUGUNE KONU: Kaldırım onarımı hk. TARIH: 04-10-2026 EVRAK NO: E-2026-77')
    assert.equal(result.heading, 'FEN ISLERI MUDURLUGUNE')
    assert.equal(result.subject, 'Kaldırım onarımı hk.')
    assert.equal(result.date, '04-10-2026')
    assert.equal(result.documentNo, 'E-2026-77')
  })
})

describe('Tarih', () => {
  test('açık "Tarih:" etiketi metindeki diğer tarihlere göre önceliklidir', () => {
    const text = 'Başvurum 01.02.2026 tarihinde yapıldı. Tarih: 15.03.2026 Konu: İtiraz dilekçesi.'
    assert.equal(preview(text).date, '15.03.2026')
  })

  test('etiketsiz tek tarih kullanılır', () => {
    assert.equal(preview(DOC_FIXTURE_TEXT).date, '21.09.2026')
  })

  test('aynı tarih birden çok kez geçerse tek tarih sayılır', () => {
    assert.equal(preview('21.09.2026 tarihli dilekçem 21.09.2026 itibarıyla geçerlidir.').date, '21.09.2026')
  })

  test('birden fazla farklı etiketsiz tarih varsa tahmin etmez', () => {
    const text = 'Başvurum 01.02.2026 tarihinde yapılmış, 15.03.2026 tarihinde reddedilmiştir.'
    assert.equal(preview(text).date, null)
  })

  test('geçersiz gün/ay tarih sayılmaz', () => {
    assert.equal(preview('Tutar 45.13.2026 olarak hesaplandı.').date, null)
  })
})

describe('Evrak No', () => {
  test('açık "Evrak No:" etiketi', () => {
    assert.equal(preview('Evrak No: 2026/7421 Konu: Emlak vergisi itirazı.').documentNo, '2026/7421')
  })

  test('"Sayı:" ve iki noktasız büyük harfli etiket', () => {
    assert.equal(preview('T.C. Sayı: E-12345678-100 Konu: Bilgi talebi.').documentNo, 'E-12345678-100')
    assert.equal(preview('Ad Soyad Kadir Yalçın Evrak No 2026/7421 Tarih 21.09.2026').documentNo, '2026/7421')
  })

  test('etiket yoksa veya değer rakam içermiyorsa tahmin etmez', () => {
    assert.equal(preview('Dilekçe 2026/7421 numarası ile kaydedildi.').documentNo, null)
    assert.equal(preview('Evrak No: belirtilmedi.').documentNo, null)
    assert.equal(preview('Bu konuda toplam sayı 3 kez başvurdum.').documentNo, null)
  })
})

describe('Gönderen', () => {
  test('açık "Ad Soyad:" etiketi; adres etiketinde durur', () => {
    assert.equal(preview(TEMIZLIK_TEXT).sender, 'Ayşe Demir')
  })

  test('"Adı Soyadı", "Gönderen" ve "Başvuran" etiketleri', () => {
    assert.equal(preview('Adı Soyadı: Mehmet Kaya Tel: 0555').sender, 'Mehmet Kaya')
    assert.equal(preview('Gönderen: Zeynep Arslan Adres: Moda Cad.').sender, 'Zeynep Arslan')
    assert.equal(preview('Başvuran: Nurdan ACAR').sender, 'Nurdan ACAR')
  })

  test('imza satırındaki etiketsiz ad tahmin edilmez', () => {
    assert.equal(preview(DOC_FIXTURE_TEXT).sender, null)
    assert.equal(preview('Onarılmasını talep ediyorum. Mehmet Aksoy - 21.09.2026').sender, null)
    assert.equal(preview('Gereğini arz ederim. Saygılarımla, Ali Veli').sender, null)
  })

  test('"Gönderen Kurum:" etiketi kişi adı olarak okunmaz', () => {
    assert.equal(preview('Gönderen Kurum: Yeşilkent Sitesi Yönetimi').sender, null)
  })

  test('ad biçiminde olmayan değer kabul edilmez', () => {
    assert.equal(preview('Gönderen: belirtilmemiştir.').sender, null)
    assert.equal(preview('Bu belgeyi gönderen kişi belli değil.').sender, null)
  })
})

describe('Gönderen Kurum', () => {
  test('açık "Gönderen Kurum:" etiketi; ilk küçük harfli kelimede durur', () => {
    const text = 'Gönderen Kurum: Yeşilkent Sitesi Yönetimi olarak başvuruyoruz.'
    assert.equal(preview(text).senderInstitution, 'Yeşilkent Sitesi Yönetimi')
  })

  test('"Firma:" etiketi ve bağlaçlı kurum adı', () => {
    assert.equal(preview('Firma: Park ve Bahçe Peyzaj Ltd. Adres: Ankara').senderInstitution, 'Park ve Bahçe Peyzaj Ltd')
  })

  test('muhatap belediye gönderen kurum sayılmaz', () => {
    assert.equal(preview('ÇANKAYA BELEDİYE BAŞKANLIĞINA Konu: Çöp toplama hk.').senderInstitution, null)
    assert.equal(preview('Muhatap Kurum: Çankaya Belediyesi Konu: Yol').senderInstitution, null)
    assert.equal(preview('Kurum: Çankaya Belediye Başkanlığına iletilmek üzere.').senderInstitution, null)
  })

  test('muhatap etiketi atlanır, açık gönderen kurum yine bulunur', () => {
    const text = 'Muhatap Kurum: Çankaya Belediyesi Gönderen Kurum: Yeşilkent Sitesi Yönetimi olarak'
    assert.equal(preview(text).senderInstitution, 'Yeşilkent Sitesi Yönetimi')
  })
})

describe('Hitap / Başlık ve Belge İçeriği', () => {
  test('metnin başındaki büyük harfli hitap', () => {
    assert.equal(preview(TEMIZLIK_TEXT).heading, 'ÇANKAYA BELEDİYE BAŞKANLIĞINA')
    assert.equal(preview(DOC_FIXTURE_TEXT).heading, 'KADIKÖY BELEDİYE BAŞKANLIĞINA')
  })

  test('içerik hitaptan sonra başlar ve uzun metinde kelime sınırında kısaltılır', () => {
    const result = preview(`ÇANKAYA BELEDİYE BAŞKANLIĞINA ${'Uzun dilekçe metni '.repeat(100)}`)
    assert.ok(result.content?.startsWith('Uzun dilekçe metni'))
    assert.ok(result.content?.endsWith(' …'))
    assert.ok((result.content?.length ?? 0) <= 910)
  })
})

describe('Eksik alanlar ve uydurmama', () => {
  test('etiketsiz kısa dilekçede içerik dışındaki tüm alanlar null', () => {
    const result = preview('Sayin yetkili, sokagimizdaki copler toplanmiyor. Geregini arz ederim.')
    assert.deepEqual(result, {
      fileName: 'belge.pdf',
      heading: null,
      subject: null,
      date: null,
      documentNo: null,
      sender: null,
      senderInstitution: null,
      content: 'Sayin yetkili, sokagimizdaki copler toplanmiyor. Geregini arz ederim.',
    })
  })

  test('boş veya null metinde her alan null; dosya adı korunur', () => {
    for (const text of [null, '', '   ']) {
      const result = buildDocumentPreview(text, 'bos.pdf')
      assert.equal(result.fileName, 'bos.pdf')
      assert.deepEqual(
        [result.heading, result.subject, result.date, result.documentNo, result.sender, result.senderInstitution, result.content],
        [null, null, null, null, null, null, null],
      )
    }
  })

  test('düzyazıdaki etiket benzeri kelimelerden hiçbir alan uydurulmaz', () => {
    const result = preview('Bu konu hakkında toplam sayı 3 kez başvurdum; gönderen kişi ve kurum belli değil.')
    assert.deepEqual(
      [result.heading, result.subject, result.date, result.documentNo, result.sender, result.senderInstitution],
      [null, null, null, null, null, null],
    )
  })
})

describe('Normalize edilmiş tek satır metin', () => {
  test('satır sonlu metin, backend normalizasyonu sonrası tek satırla aynı sonucu verir', () => {
    const multiline = TEMIZLIK_TEXT.replace(' Konu:', '\nKonu:').replace(' Ad Soyad:', '\n\nAd Soyad:')
    assert.deepEqual(preview(multiline), preview(TEMIZLIK_TEXT))
  })

  test('gerçek DOC fixture metninden açıkça yazan alanlar okunur', () => {
    const result = preview(DOC_FIXTURE_TEXT)
    assert.equal(result.heading, 'KADIKÖY BELEDİYE BAŞKANLIĞINA')
    assert.equal(result.subject, 'Sokağımızdaki çöp konteynerlerinin boşaltılmaması')
    assert.equal(result.date, '21.09.2026')
    assert.equal(result.documentNo, null)
    assert.equal(result.sender, null)
    assert.equal(result.senderInstitution, null)
  })
})
