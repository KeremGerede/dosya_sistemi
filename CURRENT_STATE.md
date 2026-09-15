# CURRENT_STATE

> **Son güncelleme:** 2026-09-15
> Projenin şu anki durumu. Her anlamlı geliştirme adımından sonra güncellenir.
> Temel bilgiler → `PROJECT_BRAIN.md` · Aktif kararlar → `DECISIONS.md` · Çalışma kuralları → `CLAUDE.md`

## Mevcut aşama

**Aşama 1 — Backend iskeleti tamamlandı ve onaylandı.** FastAPI iskeleti, `GET /health`, kataloglar, `.env.example` ve `.gitignore` hazır. İş mantığı yok: veritabanı, dosya işleme, Gemini ve classify endpoint'i sonraki adımlarda gelecek.

## Repo durumu

- Git reposu, `main` dalı (remote: `origin`).
- Karar geçmişi `docs: define initial MVP architecture and decisions` commit'inden itibaren Git'te izlenir; tüm dokümantasyon `origin/main`'e push edildi.
- Dosyalar:
  - `README.md` — proje dışından okuyanlar için özet: MVP kapsamı ve akışı, desteklenen dosya türleri, sınıflandırma, teknoloji yığını, temel kurallar, API, proje durumu, backend'i yerelde çalıştırma, kapsam dışı. Mevcut durum olarak yalnızca backend iskeleti ve `GET /health` anlatılır; classify akışı ve API'si planlanan davranış olarak yer alır.
  - `CLAUDE.md`, `PROJECT_BRAIN.md`, `CURRENT_STATE.md`, `DECISIONS.md` — proje hafıza dosyaları.
  - `.gitignore` — Python önbellekleri, sanal ortam, `.env`, `backend/storage/` içeriği (`.gitkeep` hariç).
  - `backend/` — FastAPI iskeleti.
- `frontend/` henüz yok.
- Yerel çalıştırma (`backend/` içinden): `python -m venv .venv` → `.venv\Scripts\activate` → `pip install -r requirements.txt` → `uvicorn app.main:app --reload`.

## Tamamlanan işler

**Aşama 0 — Proje tanımı**

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
- [x] `README.md` MVP kapsamı ve proje durumuna göre güncellendi.

**Aşama 1 — Backend iskeleti**

- [x] `backend/app/main.py`: minimal FastAPI uygulaması, yalnızca `GET /health` → `{"status": "ok"}`.
- [x] Boş paketler: `app/api`, `app/services`, `app/llm`, `app/schemas`, `app/models`. Ayrıca `storage/.gitkeep` ve `tests/.gitkeep` (boş klasörlerin Git'te kalması için).
- [x] Kataloglar: `app/config/document_types.json` (6 tür) ve `app/config/institutions.json` (9 müdürlük; `PROJECT_BRAIN.md` §6 ile birebir aynı).
- [x] `requirements.txt`: yalnızca `fastapi==0.141.1` ve `uvicorn==0.53.0`.
- [x] `backend/.env.example` (secret yok; değişkenler henüz okunmuyor) ve kök `.gitignore`.
- [x] D-019 güncellendi: tek iş endpoint'ine ek olarak operasyonel `GET /health`.
- [x] Doğrulama (Python 3.13, `backend/.venv`): katalog JSON'ları geçerli, ID'ler `snake_case`; `app.main` import ediliyor; uvicorn ile başlatılan uygulamada `GET /health` → `200 {"status": "ok"}`; `.gitignore` kuralları kontrol edildi.
- [x] `README.md` gerçek duruma göre güncellendi: backend iskeleti, `GET /health` ve yerel çalıştırma komutları eklendi; henüz yapılmayanlar ayrıca listelendi.

## Üzerinde çalışılan işler

- Yok. Sıradaki adıma (veritabanı) başlamak için onay bekleniyor.

## Bilinen problemler ve riskler

- Bilinen teknik problem yok.
- `.env.example`'daki değişkenler henüz okunmuyor. `GEMINI_MODEL` için başlangıç kontrolü (D-031) Gemini adımında eklenecek.
- `STORAGE_DIR=storage` değeri `backend/` klasörüne göre göreli; uygulama `backend/` içinden çalıştırılmalı.
- `tests/` şimdilik boş; test bağımlılıkları (ör. pytest) ilk test yazıldığında eklenecek.
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

1. Veritabanı: ortam değişkenlerinin okunması, `database.py`, UUID birincil anahtarlı `Document` modeli, Alembic kurulumu ve ilk migration. SQLAlchemy, Alembic ve PostgreSQL sürücüsü bu adımda eklenir.
2. `file_service`: kabul kontrolü (tür + 50 MB), `document_id` üretimi ve `backend/storage/<document_id>.<uzanti>` olarak kaydetme, PDF/DOCX metin çıkarımı, normalizasyon ve 10 karakter kontrolü.
3. `classification_service` + `gemini_client`:
   - başlangıçta `GEMINI_MODEL` kontrolü (fail fast)
   - prompt, 50.000 karakter sınırı, structured output, katalog doğrulaması
   - 30 sn timeout; en fazla 3 denemeli retry (network, timeout, `429`, `5xx`, geçersiz çıktı; 1 sn / 2 sn bekleme; `400`/`401`/`403` retry'sız)
   - `status` belirleme
4. `POST /api/documents/classify` endpoint'i: başarılı yanıt, `413`/`415` red, `422` (belge içeriği) / `502` (Gemini) `failed` yanıtları; örnek PDF/DOCX belgelerle uçtan uca doğrulama.
5. Frontend: React + Vite ile yükleme ve sonuç ekranı.
