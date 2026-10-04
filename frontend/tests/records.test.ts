// Kayıtlar arama/filtre/özet yardımcılarının birim testleri (D-048). Node'un yerleşik test çalıştırıcısı kullanılır.
// Çalıştırma: frontend/ içinde `npm test`.
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { NO_FILTERS, UNDETERMINED, countRecords, filterOptions, filterRecords } from '../src/records.ts'

const RECORDS = [
  { file_name: 'kaldirim-sikayeti.pdf', document_type: 'complaint', institution_id: 'fen_isleri', status: 'classified' },
  { file_name: 'Çöp Şikâyeti.docx', document_type: 'complaint', institution_id: 'temizlik_isleri', status: 'classified' },
  { file_name: 'PARK-TALEBİ.pdf', document_type: 'request', institution_id: 'park_bahceler', status: 'classified' },
  { file_name: 'el-yazisi.jpeg', document_type: 'other', institution_id: null, status: 'needs_review' },
  { file_name: 'bozuk.pdf', document_type: null, institution_id: null, status: 'failed' },
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
})
