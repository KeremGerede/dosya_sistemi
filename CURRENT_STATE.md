# CURRENT_STATE

> **Son güncelleme:** 2026-09-15
> Projenin şu anki durumu. Her anlamlı geliştirme adımından sonra güncellenir.
> Temel bilgiler → `PROJECT_BRAIN.md` · Aktif kararlar → `DECISIONS.md` · Çalışma kuralları → `CLAUDE.md`

## Mevcut aşama

**Aşama 2 — Veritabanı altyapısı tamamlandı.** PostgreSQL 18 Docker Compose ile çalışıyor. `documents` tablosunu oluşturan Alembic migration'ı gerçek veritabanında uygulandı; SQLAlchemy bağlantısı doğrulandı. İş mantığı yok: dosya işleme, Gemini ve classify endpoint'i sonraki aşamalarda gelecek.

## Repo durumu

- Git reposu, `main` dalı (remote: `origin`).
- Karar geçmişi `docs: define initial MVP architecture and decisions` commit'inden itibaren Git'te izlenir.
- Dosyalar:
  - `README.md` — proje dışından okuyanlar için özet: MVP kapsamı ve akışı, desteklenen dosya türleri, sınıflandırma, teknoloji yığını, temel kurallar, API, proje durumu, geliştirme ortamı, kapsam dışı. Mevcut durum olarak backend iskeleti, `GET /health` ve veritabanı altyapısı anlatılır; classify akışı ve API'si planlanan davranış olarak yer alır.
  - `CLAUDE.md`, `PROJECT_BRAIN.md`, `CURRENT_STATE.md`, `DECISIONS.md` — proje hafıza dosyaları.
  - `.gitignore` — Python önbellekleri, sanal ortam, `.env`, `backend/storage/` içeriği (`.gitkeep` hariç), `graphify-out/`.
  - `docker-compose.yml` — yalnızca yerel geliştirme PostgreSQL 18 servisi (D-036).
  - `backend/` — FastAPI iskeleti (Aşama 1) ve veritabanı altyapısı (Aşama 2).
- `frontend/` henüz yok.
- Geliştirme akışı (D-036):
  - İlk kurulum, `backend/` içinde: `python -m venv .venv` → `.venv\Scripts\activate` → `pip install -r requirements.txt` → `.env.example`'ı `.env` olarak kopyala.
  - Günlük: Docker Desktop'ı başlat → repo kökünde `docker compose up -d` → `backend/` içinde venv'i aktif et → `alembic upgrade head` → `uvicorn app.main:app --reload`.
  - Durdurma: `docker compose down` (veriler `dosya_sistemi_pgdata` volume'unda kalır).

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
- [x] `requirements.txt`: `fastapi==0.141.1` ve `uvicorn==0.53.0`.
- [x] `backend/.env.example` ve kök `.gitignore`.
- [x] D-019 güncellendi: tek iş endpoint'ine ek olarak operasyonel `GET /health`.
- [x] Doğrulama (Python 3.13, `backend/.venv`): katalog JSON'ları geçerli, ID'ler `snake_case`; `app.main` import ediliyor; uvicorn ile başlatılan uygulamada `GET /health` → `200 {"status": "ok"}`; `.gitignore` kuralları kontrol edildi.
- [x] `README.md` gerçek duruma göre güncellendi: backend iskeleti, `GET /health` ve yerel çalıştırma komutları eklendi; henüz yapılmayanlar ayrıca listelendi.

**Aşama 2 — Veritabanı altyapısı**

- [x] `app/settings.py`: `backend/.env` (varsa) python-dotenv ile yüklenir; `DATABASE_URL` zorunlu, yoksa açık `RuntimeError` (D-035).
- [x] `app/database.py`: senkron `engine`, `SessionLocal` ve `Base` (`DeclarativeBase`); PostgreSQL + psycopg 3 (D-006).
- [x] `app/models/document.py`: `Document` modeli, `documents` tablosu:
  - `id` UUID PK, uygulamada üretilir; DB varsayılanı yok (D-029).
  - NOT NULL: `file_name`, `file_type`, `file_reference`, `needs_review`, `status`, `created_at` (`DEFAULT now()`).
  - NULL olabilir: `extracted_text` (TEXT), `document_type`, `institution_id`, `review_reason` (TEXT).
- [x] Alembic: `alembic.ini`, `alembic/env.py` (`DATABASE_URL` ve `Base.metadata` kullanır), ilk migration `2ab2daa5828a_create_documents_table.py`. Yalnızca `documents` tablosunu oluşturur, downgrade'de siler. `create_all` kullanılmadı. Migration modele göre elle yazıldı; `alembic check` ile gerçek veritabanına karşı doğrulandı.
- [x] `requirements.txt`: `sqlalchemy==2.0.53`, `alembic==1.20.0`, `psycopg[binary]==3.3.5`, `python-dotenv==1.2.3` eklendi.
- [x] `docker-compose.yml`:
  - tek `postgres` servisi: `postgres:18`, container `dosya-sistemi-postgres`, veritabanı `dosya_sistemi`
  - `postgres`/`postgres` kullanıcı ve parolası (yalnızca yerel geliştirme)
  - host `127.0.0.1:5433` → container `5432`
  - `dosya_sistemi_pgdata` volume'u (`/var/lib/postgresql`); `pg_isready` healthcheck
- [x] `.env.example`: `DATABASE_URL=postgresql+psycopg://postgres:postgres@127.0.0.1:5433/dosya_sistemi`. Yerel `backend/.env` bundan oluşturuldu (Git'e girmez).
- [x] Kararlar: D-006 (senkron SQLAlchemy 2.x + psycopg 3), D-035 (yapılandırma yaklaşımı), D-036 (geliştirme ortamı). `PROJECT_BRAIN.md` §3–4 geliştirme ortamıyla güncellendi.
- [x] Doğrulama (gerçek Docker PostgreSQL):
  - `docker compose config` geçerli; container `Up (healthy)`; `pg_isready` bağlantı kabul ediyor; sunucu PostgreSQL 18.6.
  - `alembic downgrade base` → `alembic upgrade head` başarılı. `alembic current` = `2ab2daa5828a (head)`. `alembic check`: "No new upgrade operations detected".
  - Veritabanında `alembic_version` ve `documents` tabloları var; kolonlar ve nullable değerleri modelle aynı.
  - SQLAlchemy (`backend/.env` üzerinden): `engine.connect()` ile `SELECT 1` ve `SessionLocal()` sorgusu çalışıyor. Bağlanılan sunucu Docker instance'ı (`data_directory=/var/lib/postgresql/18/docker`). `Document` INSERT + flush + ROLLBACK testi başarılı; kalıcı kayıt yok (0 satır).
  - `uvicorn app.main:app` ile `GET /health` → `200 {"status": "ok"}`.
  - Önceki offline kontroller: `DATABASE_URL` yoksa açık hata; offline SQL, model DDL'i ile birebir aynı.
- [x] `README.md` geliştirme ortamı ve proje durumuna göre güncellendi.

## Üzerinde çalışılan işler

- Yok. Sıradaki aşamaya (dosya işleme) başlamak için onay bekleniyor.

## Bilinen problemler ve riskler

- Bilinen teknik problem yok.
- Bu makinede host 5432'yi yerel bir Windows PostgreSQL 18 servisi (`postgresql-x64-18`) kullanıyor. Docker PostgreSQL bu yüzden 5433'te; `DATABASE_URL`'deki port 5433 olmalı, aksi halde yanlış veritabanına bağlanılabilir.
- `DATABASE_URL`'de `localhost` kullanılmamalı: port yalnızca IPv4 `127.0.0.1`'e açık ve `localhost` önce `::1` olarak denendiğinde bağlantı asılı kalıyor (Aşama 2'de `alembic current` bu yüzden takıldı). `127.0.0.1` kullanılıyor.
- PostgreSQL 18 image'ında volume `/var/lib/postgresql` yoluna bağlanır. Eski sürümlerdeki `/var/lib/postgresql/data` yolu kullanılmamalı.
- Backend ve migration komutları için Docker Desktop çalışıyor ve `docker compose up -d` yapılmış olmalı.
- `DATABASE_URL` zorunluluğu `app.settings` / `app.database` import edildiğinde devreye girer. `main.py` henüz veritabanını import etmediği için `/health` `DATABASE_URL` olmadan da çalışır; classify endpoint'i eklendiğinde uygulama başlangıcında zorunlu hale gelecek.
- `status` ve `file_type` değerleri veritabanında CHECK/ENUM ile kısıtlanmadı (PROJECT_BRAIN §8: string). Geçerli değerler uygulama katmanında kontrol edilecek.
- Şu anda yalnızca `DATABASE_URL` okunuyor. `GEMINI_MODEL` için başlangıç kontrolü (D-031) Gemini aşamasında eklenecek.
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

1. `file_service`: kabul kontrolü (tür + 50 MB), `document_id` üretimi ve `backend/storage/<document_id>.<uzanti>` olarak kaydetme, PDF/DOCX metin çıkarımı, normalizasyon ve 10 karakter kontrolü.
2. `classification_service` + `gemini_client`:
   - başlangıçta `GEMINI_MODEL` kontrolü (fail fast)
   - prompt, 50.000 karakter sınırı, structured output, katalog doğrulaması
   - 30 sn timeout; en fazla 3 denemeli retry (network, timeout, `429`, `5xx`, geçersiz çıktı; 1 sn / 2 sn bekleme; `400`/`401`/`403` retry'sız)
   - `status` belirleme
3. `POST /api/documents/classify` endpoint'i: veritabanı session kullanımı, başarılı yanıt, `413`/`415` red, `422` (belge içeriği) / `502` (Gemini) `failed` yanıtları; örnek PDF/DOCX belgelerle Docker PostgreSQL üzerinde uçtan uca doğrulama.
4. Frontend: React + Vite ile yükleme ve sonuç ekranı.
