# CURRENT_STATE

> **Son güncelleme:** 2026-09-15
> Projenin şu anki durumu. Her anlamlı geliştirme adımından sonra güncellenir.
> Temel bilgiler → `PROJECT_BRAIN.md` · Aktif kararlar → `DECISIONS.md` · Çalışma kuralları → `CLAUDE.md`

## Mevcut aşama

**Aşama 0 — Proje tanımı tamamlandı ve onaylandı.** Tüm ürün ve teknik kararlar dokümantasyona işlendi; açık teknik soru yok. Uygulama kodu yok. Backend geliştirmesine başlamak için kullanıcının onayı bekleniyor.

## Repo durumu

- Git reposu, `main` dalı (remote: `origin`).
- Commit'ler: `Initial commit` (README), `docs: define initial MVP architecture and decisions` (proje dokümantasyonu). Karar geçmişi bu commit'ten itibaren Git'te izlenir.
- Dosyalar: `README.md` (yalnızca başlık), `CLAUDE.md`, `PROJECT_BRAIN.md`, `CURRENT_STATE.md`, `DECISIONS.md`.
- `backend/` ve `frontend/` henüz yok.

## Tamamlanan işler

- [x] Proje klasörü incelendi; `PROJECT_BRAIN.md`, `CURRENT_STATE.md`, `DECISIONS.md` ve projeye özel `CLAUDE.md` oluşturuldu.
- [x] Ürün kararları işlendi: PDF + DOCX desteği, orijinal dosya ve çıkarılan metnin saklanması, 9 müdürlüklük kurum kataloğu, hatalı dosya davranışı.
- [x] Teknik kararlar işlendi:
  - minimum 10 karakter normalize metin (D-026)
  - Gemini'ye en fazla 50.000 karakter (D-027)
  - maksimum 50 MB dosya (D-028)
  - UUID `documents.id` (D-029)
  - Alembic migration (D-030)
  - `failed` kayıt davranışı (D-004)
  - classify yanıt alanları (D-032)
- [x] Kalan teknik sorular karara bağlandı:
  - `failed` yanıtı: `422` / `502` ve `message` alanlı gövde (D-034)
  - Retry: network, timeout, `429`, `5xx`; 30 sn timeout, 1 sn / 2 sn bekleme, en fazla 3 deneme (D-033)
  - `GEMINI_MODEL` zorunlu; tanımlı değilse fail fast (D-031)
  - Storage: `backend/storage/<document_id>.<uzanti>` (D-017)
- [x] Son teknik konu karara bağlandı:
  - Kalıcı Gemini hataları (`400`/`401`/`403`): retry yok → `failed` + `502`
  - Geçersiz model çıktısı (şemaya uymayan / katalog dışı): retry kapsamında → 3 deneme sonunda `failed` + `502` (D-033, D-034)
  - Dış hata ayrımı: `422` = belge içeriği işlenemedi, `502` = Gemini ile sınıflandırma tamamlanamadı

## Üzerinde çalışılan işler

- Yok. Backend geliştirmesine (adım 1) başlamak için onay bekleniyor.

## Bilinen problemler ve riskler

- Kod yok; teknik problem yok.
- Kurum açıklamaları ilk taslaktır; gerçek örnek belgelerle test edilip iyileştirilmeli.
- Katalogda olmayan birimlere ait belgeler (ör. ulaşım, veteriner hizmetleri, su/kanalizasyon) `needs_review`'a düşecektir. Bu beklenen davranıştır; sık görülürse katalog genişletilir.
- 50.000 karakteri aşan belgelerde yalnızca ilk 50.000 karakter değerlendirilir; belirleyici bilgi sonrasında yer alıyorsa sınıflandırma etkilenebilir.
- `gemini-3.5-flash-lite` model adının Gemini API'de kullanılabilir olduğu backend geliştirmesi sırasında doğrulanmalı.
- İşlem senkron: en kötü durumda Gemini aşaması yaklaşık 93 sn sürer (3 × 30 sn timeout + 1 sn + 2 sn bekleme). Frontend ve varsa reverse proxy istek zaman aşımları bundan uzun olmalı.

## Açık sorular

İlgili geliştirme adımına başlamadan önce kullanıcıyla netleştirilir; karara bağlananlar `DECISIONS.md`'ye işlenir ve buradan silinir.

Şu anda açık teknik soru yok.

## Sıradaki geliştirme adımları

Onay alındıktan sonra:

1. Backend iskeleti: FastAPI uygulaması, başlangıçta yapılandırma kontrolü (`GEMINI_MODEL` eksikse fail fast), `database.py`, UUID birincil anahtarlı `Document` modeli, Alembic kurulumu ve ilk migration, `.env.example`, `backend/storage/` klasörü.
2. Kataloglar: `document_types.json`, `institutions.json`.
3. `file_service`: kabul kontrolü (tür + 50 MB), `document_id` üretimi ve `backend/storage/<document_id>.<uzanti>` olarak kaydetme, PDF/DOCX metin çıkarımı, normalizasyon ve 10 karakter kontrolü.
4. `classification_service` + `gemini_client`: prompt, 50.000 karakter sınırı, structured output, katalog doğrulaması, 30 sn timeout, en fazla 3 denemeli retry (network, timeout, `429`, `5xx`, geçersiz çıktı; 1 sn / 2 sn bekleme; `400`/`401`/`403` retry'sız), `status` belirleme.
5. `POST /api/documents/classify` endpoint'i: başarılı yanıt, `413`/`415` red, `422` (belge içeriği) / `502` (Gemini) `failed` yanıtları; örnek PDF/DOCX belgelerle uçtan uca doğrulama.
6. Frontend: React + Vite ile yükleme ve sonuç ekranı.
