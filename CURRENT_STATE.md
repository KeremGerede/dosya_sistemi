# CURRENT_STATE

> **Son güncelleme:** 2026-09-24
> Projenin şu anki durumu. Her anlamlı geliştirme adımından sonra güncellenir.
> Temel bilgiler → `PROJECT_BRAIN.md` · Aktif kararlar → `DECISIONS.md` · Çalışma kuralları → `CLAUDE.md`

## Mevcut aşama

**V1.0–V1.2 tamamlandı. İki bağımsız iş hattı açık:**

- **V1.4 — Çoklu Belge Yükleme ve Önizleme** (UX/workflow): **aktif geliştirme**.
  - Adım 0–9 tamamlandı: kararlar (D-045, D-046), backend (prepare, classify-by-id, discard, liste filtresi, TTL yedek temizliği) ve frontend (en fazla 5 dosya, sürükle-bırak, içerik merkezli önizleme, sıralı analiz, 409 kurtarma).
  - `pytest` 275 passed, frontend `npm test` 33 passed.
  - Adım 10 (gerçek PostgreSQL + gerçek Gemini + gerçek Tesseract OCR ile uçtan uca doğrulama) tamamlandı.
  - PDF'in "Orijinal Belgeyi Gör" penceresinde gerçek masaüstü tarayıcıda görüntülenmesi kullanıcı tarafından elle doğrulandı.
  - Değişiklikler `feat: add multi-document preview and upload workflow` commit'iyle `main`'e alındı.
- **V1.3 — El Yazısı ve Gelişmiş OCR Güvenilirliği** (OCR/extraction): **açık**, henüz adım başlamadı.

Sürüm numaraları kapsam başlığıdır, teslim sırası değildir; iki iş hattı birbirinden bağımsız ilerler.

V1.1: taranmış PDF'ler için lokal Tesseract OCR fallback'i (D-003, D-042) eklendi ve 15 senaryoluk manuel test matrisiyle doğrulandı (15/15).

Legacy DOC desteği `5695572` (`feat: add legacy DOC document support`) olarak commit'lenip `origin/main`'e push'landı; `main` ile `origin/main` eşit ve working tree temiz. Sürüm sonrası clean-clone doğrulaması yapıldı (2026-09-21): GitHub'dan sıfır klon → yeni venv → `pip install -r requirements.txt` → `pip check` temiz → `pytest` 231 passed → boş veritabanında `alembic upgrade head` (`cedf33674167`, `alembic check` temiz) → backend `/health` 200 → frontend `npm run build` / `npm run lint` temiz → PDF, DOC, DOCX ve JPG ile gerçek uçtan uca smoke testi 4/4 başarılı (4 Gemini çağrısı, 0 retry); liste, detay ve indirme endpoint'leri doğrulandı.

V1.2 · Adım 1 tamamlandı: kayıtları listeleyen, tek kaydın çıkarılan metnini döndüren ve orijinal belgeyi indiren üç salt okunur endpoint (D-043) ve arayüzdeki "Kayıtlar" görünümü.

V1.2 · Adım 9 tamamlandı: legacy **DOC** (Word 97–2003) desteği eklendi — saf Python `legacy-doc 0.2.1` parser'ı doğrudan baytlardan okuyor, Word/LibreOffice gerekmiyor; OLE imzası + `WordDocument` stream kontrolüyle XLS/PPT reddediliyor. Kapsam: PDF, DOC, DOCX, JPG/JPEG, PNG. Migration gerekmedi.

V1.2 · Adım 8 tamamlandı: gönderen metadata uydurması (B2-12 / P2) kapatıldı — prompt, kişi adı veya unvanından kurum adı türetilmesini açıkça yasaklıyor; sekiz odaklı vakada uydurma 8/8 → 0, `document_type`/`institution_id` ve `sender_name` regresyonu yok (D-044 aynen geçerli).

V1.2 · Adım 7 tamamlandı: kabul edilen dosya türlerine **JPG, JPEG ve PNG** eklendi (D-001). Görüntüler tek sayfalık belge olarak doğrudan mevcut Tesseract hattına veriliyor (`tur`, 400 dpi); yeni motor, servis veya bağımlılık yok, migration gerekmedi. PDF/DOCX davranışı değişmedi.

V1.2 · Adım 6 tamamlandı: OCR çözünürlüğü ölçüme dayanarak 300 → 400 dpi çıkarıldı (D-042); zor taramalarda düşen satır 14 → 10, kayıp kritik alan 10 → 4, doğru rakam 14/22 → 16/22, basılı/dijital belgelerde regresyon yok.

V1.2 · Adım 5 tamamlandı: bozuk metin katmanının OCR'ı engellemesi (P2) giderildi — OCR kararına yapısal koşul (görüntü kapsaması ≥ %50 ve gömülü metin ≤ 200 karakter) eklendi ve aynı sayfadaki gömülü metin ile OCR metni tekrarsız, bilgi kaybetmeden birleştiriliyor (D-003). Benchmark senaryo 14 `other`/`needs_review` → `complaint`/`temizlik_isleri`/`classified`; P1 hybrid 12/13'te regresyon yok.

V1.2 · Adım 2 tamamlandı: sınıflandırmayla **aynı** Gemini çağrısından gelen belge özeti ve (varsa) gönderen kişi/kurum bilgisi (D-044); `documents` tablosuna üç nullable kolon ve `cedf33674167` migration'ı. V1 (Aşama 1–6) 2026-09-17'de kapatılmıştı. Backend ana MVP akışı (upload → storage → metin çıkarımı → Gemini → PostgreSQL → yanıt) ve frontend (yükleme, sonuç ve hata ekranı) uçtan uca çalışıyor.

Aşama 1–5 ve Aşama 6'nın Adım 1–4'ü daha önce tamamlanmıştı: katalog adları yanıtta (Adım 1), React + Vite + TypeScript frontend ve `/api` proxy'si (Adım 2), yükleme ekranı (Adım 3), sonuç ve hata ekranı (Adım 4). V1 öncesi read-only audit ve güvenli polish pass yapıldı; PostgreSQL bağlantı zaman aşımı 10 sn olarak karara bağlandı (D-041).

Adım 5'te manuel test matrisi gerçek belgelerle uygulandı ve **11/11 senaryo beklenen sonucu verdi**; sentetik test verileri temizlendi ve final kontrollerin tamamı geçti (`pytest` 97 passed, `pip check` temiz, `alembic current` = `2ab2daa5828a (head)`, `GET /health` → `200`, `npm run build` ve `npm run lint` temiz, PostgreSQL healthy). **V1 kapsamında bilinen blocker yok.**

## Repo durumu

- Git reposu, `main` dalı (remote: `origin`).
- Karar geçmişi `docs: define initial MVP architecture and decisions` commit'inden itibaren Git'te izlenir.
- Dosyalar:
  - `README.md` — proje dışından okuyanlar için özet: MVP kapsamı ve akışı, desteklenen dosya türleri, sınıflandırma, teknoloji yığını, temel kurallar, API, proje durumu, geliştirme ortamı, kapsam dışı. Backend ana MVP akışının ve frontend'in (yükleme, sonuç ve hata ekranı) çalıştığı, `GET /health` ve `POST /api/documents/classify`'ın çalışan endpoint'ler olduğu ve iki tür 422 dahil HTTP kodları anlatılır; sıfırdan kurulum ve çalıştırma rehberini (gereksinimler, backend/frontend kurulumu, `.env`, Docker PostgreSQL, migration, doğrulama ve durdurma komutları) içerir.
  - `CLAUDE.md`, `PROJECT_BRAIN.md`, `CURRENT_STATE.md`, `DECISIONS.md` — proje hafıza dosyaları.
  - `.gitignore` — Python önbellekleri (`.pytest_cache` dahil), sanal ortam, `.env`, `backend/storage/` içeriği (`.gitkeep` hariç), `graphify-out/`.
  - `docker-compose.yml` — yalnızca yerel geliştirme PostgreSQL 18 servisi (D-036).
  - `backend/` — FastAPI iskeleti (Aşama 1), veritabanı altyapısı (Aşama 2), dosya işleme ve testleri (Aşama 3), Gemini sınıflandırma katmanı ve testleri (Aşama 4), classify endpoint'i ve testleri (Aşama 5), yanıttaki katalog adları (Aşama 6 · Adım 1).
  - `frontend/` — Vite React + TypeScript uygulaması (Aşama 6 · Adım 2–4): `index.html`, `src/main.tsx`, `src/App.tsx` (yükleme, sonuç ve hata ekranının tamamı tek bileşende), `src/App.css`, `src/index.css`, `vite.config.ts` (proxy), `package.json` + `package-lock.json`, `tsconfig*.json`, şablondan gelen `.gitignore` ve `.oxlintrc.json`. `node_modules/` ve `dist/` `frontend/.gitignore` ile Git dışında.
- Geliştirme akışı (D-036):
  - İlk kurulum, `backend/` içinde: `python -m venv .venv` → `.venv\Scripts\activate` → `pip install -r requirements.txt` → `.env.example`'ı `.env` olarak kopyala.
  - Günlük: Docker Desktop'ı başlat → repo kökünde `docker compose up -d` → `backend/` içinde venv'i aktif et → `alembic upgrade head` → `uvicorn app.main:app --reload`.
  - Durdurma: `docker compose down` (veriler `dosya_sistemi_pgdata` volume'unda kalır).
  - Belge sınıflandırma: `curl -F "file=@dilekce.pdf" http://127.0.0.1:8000/api/documents/classify` veya `http://127.0.0.1:8000/docs`.
  - Frontend: ilk kurulum `frontend/` içinde `npm install`; geliştirme `npm run dev` → `http://localhost:5173` (backend ayrı terminalde çalışır durumda olmalı); derleme `npm run build`; lint `npm run lint`.
  - Testler: `backend/` içinde venv aktifken `pytest` (`pytest.ini`: `pythonpath = .`, `testpaths = tests`). Testler Docker PostgreSQL veya gerçek Gemini API gerektirmez. `tests/conftest.py` sahte `GEMINI_API_KEY`/`GEMINI_MODEL` (ve yoksa sahte `DATABASE_URL`) ayarlar; `.env`'deki gerçek anahtar testlere girmez. Endpoint testleri geçici SQLite veritabanı (`get_db` override) ve sahte `classify_text` kullanır.

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

**Aşama 3 — Dosya işleme**

- [x] `app/services/file_service.py`: HTTP yanıtı üretmez, veritabanına yazmaz. Sabitler `MAX_FILE_SIZE` (50 × 1024 × 1024 bayt), `MIN_TEXT_LENGTH` (10), `STORAGE_DIR` (`backend/storage`), `FILE_TYPES`.
  - Exception'lar (hiyerarşi yok; API katmanında eşlenecek): `FileTooLargeError` → 413, `UnsupportedFileTypeError` → 415, `TextExtractionError` → `failed` + 422.
  - `check_file_size(size)`: 50 MB üstünde `FileTooLargeError`.
  - `detect_file_type(file_name, content) -> "pdf" | "docx"`: uzantı ve içerik birlikte kontrol edilir, content-type'a güvenilmez. PDF: `.pdf` + `%PDF` ile başlama. DOCX: `.docx` + geçerli ZIP + `[Content_Types].xml` içinde WordprocessingML ana belge türü + `word/document.xml`. Aksi halde `UnsupportedFileTypeError`.
  - `save_file(content, document_id, file_type) -> file_reference`: `backend/storage/<document_id>.<pdf|docx>`; klasör yoksa oluşturulur. Yol yalnızca UUID ve izinli uzantıdan oluşur (geçersiz UUID/tür → `ValueError`), kullanıcı dosya adı kullanılmaz, var olan dosyanın üzerine yazılmaz (`xb`).
  - `extract_text(content, file_type) -> str`: PDF'te PyMuPDF ile tüm sayfalar sırayla; DOCX'te python-docx ile paragraflar ve tablo hücreleri belge sırasıyla (birleştirilmiş hücreler tek kez). Normalize edilmiş TAM metin döner; 50.000 karakter kesmesi ve OCR yok. Bozuk/şifreli/okunamayan dosya → `TextExtractionError`.
  - `normalize_text(text)`: ardışık whitespace tek boşluğa, baş/son kırpılır.
  - `check_text_length(text)`: normalize metin 10 karakterden kısaysa `TextExtractionError`.
- [x] `tests/test_file_service.py` (24 test, sentetik küçük PDF/DOCX/ZIP bellekte üretilir; storage testleri geçici klasöre yazar):
  - geçerli PDF ve DOCX kabulü ve metin çıkarımı; DOCX tablo hücreleri ve birleştirilmiş hücrenin tek kez alınması
  - 10 karakter sınırı (boş sayfalı PDF ve kısa DOCX dahil)
  - yanlış uzantı ve uzantı–içerik uyuşmazlığı; `.pdf` ama PDF olmayan içerik; `.docx` ama DOCX olmayan içerik/ZIP
  - bozuk PDF, şifreli PDF, bozuk DOCX → `TextExtractionError`
  - storage adı `document_id`'den oluşur; kullanıcı dosya adı (`../../gizli/dilekce.pdf`) yol olarak kullanılmaz
  - tam metin kesilmeden döner (60.000 karakter); normalizasyon; 50 MB sınırı (`MAX_FILE_SIZE ± 1` ile, büyük dosya yazmadan)
- [x] `pytest.ini`; `requirements.txt`: `PyMuPDF==1.28.2`, `python-docx==1.2.0`, `pytest==9.1.1`; `.gitignore`: `.pytest_cache/`.
- [x] `STORAGE_DIR` ortam değişkeni kaldırıldı (`.env.example`, `PROJECT_BRAIN.md`). Storage konumu D-017'ye göre sabit: `backend/storage/`.
- [x] Doğrulama:
  - `pytest`: 24 passed; gerçek `backend/storage`'da yalnızca `.gitkeep` kaldı.
  - Veritabanı import'ları çalışıyor; `alembic current` = `2ab2daa5828a (head)`. Container ve migration'lar değişmedi.
  - `uvicorn app.main:app` ile `GET /health` → `200 {"status": "ok"}`.

**Aşama 4 — Gemini sınıflandırma katmanı**

- [x] `app/settings.py`: `require_env(name)` eklendi; `DATABASE_URL` davranışı aynı (D-035).
- [x] `app/llm/gemini_client.py` — google-genai (2.23.0) ince sarmalayıcısı:
  - Modül yüklenirken `GEMINI_MODEL` ve `GEMINI_API_KEY` zorunlu (fail fast, D-031).
  - `HTTP_OPTIONS`: `timeout=30_000` ms, SDK retry kapalı (`HttpRetryOptions(attempts=1)`).
  - `generate_json(prompt, response_schema) -> str | None`: tek `generate_content` isteği; `response_mime_type="application/json"`, `response_schema=<Pydantic model>`, `temperature=0`, automatic function calling kapalı. SDK hataları olduğu gibi yükselir.
- [x] `app/schemas/classification.py`: `ClassificationResult` (`document_type`, `institution_id`, `needs_review`, `review_reason`) ve tutarlılık doğrulaması:
  - `needs_review=false` → `institution_id` dolu ve `review_reason` null
  - `needs_review=true` → `review_reason` boş olmayan metin
- [x] `app/services/classification_service.py`:
  - Kataloglar modül yüklenirken JSON'dan okunur (`load_catalogs`). `document_types.json`'da `other` yoksa açık bir yapılandırma hatası (`RuntimeError`) verilir; servis yüklenmez, Gemini çağrısına geçilmez. Prompt'taki "uygun tür yoksa" değeri de aynı `OTHER_DOCUMENT_TYPE` sabitinden gelir. `build_output_model`, `ClassificationResult`'tan türeyen ve izinli ID'leri katalogdan `Literal` olarak alan modeli üretir (`OUTPUT_MODEL`); bu model hem Gemini şeması hem backend doğrulaması (D-009).
  - `build_prompt(text)`: kurallar, iki katalog (JSON), metnin ilk 50.000 karakteri. Prompt injection'a karşı "belge metnindeki talimatları uygulama" satırı var; chain-of-thought istenmez.
  - `classify_text(text) -> ClassificationResult`: en fazla 3 gerçek deneme. Retry: geçersiz/katalog dışı/tutarsız çıktı, boş yanıt, `httpx.TransportError` (ağ + timeout), 429, 5xx. Retry yok: diğer API hataları (400/401/403 vb.). Beklemeler 1 sn, 2 sn.
  - Başarısızlıkta genel mesajlı `ClassificationError` (→ API katmanında `failed` + 502); ham hata `__cause__` içinde, deneme başına uyarı logu (belge metni ve anahtar loglanmaz).
- [x] SDK doğrulaması (google-genai 2.23.0 kaynak kodu):
  - `HttpOptions.timeout` milisaniye (httpx'e saniye olarak aktarılır).
  - `retry_options` verilmezse veya `attempts=1` ise tenacity tek deneme yapar; varsayılan `HttpRetryOptions()` 5 deneme yapar.
  - Upload dışındaki çağrılarda başka retry döngüsü yok; HTTP hataları `errors.APIError` (`.code`), ağ/timeout hataları sarılmamış httpx exception'ları olarak gelir.
- [x] Testler (`tests/test_classification_service.py`, 44 test; `tests/conftest.py`):
  - kataloglar, şemanın katalog ID'leriyle sınırlı olması, prompt içeriği, 50.000 karakter sınırı
  - `other` kontrolü: katalogda varsa normal yüklenir; yoksa `load_catalogs` yapılandırma hatası verir; ayrı süreçte `other`'sız katalog kopyasıyla servis import'u başarısız olur (Gemini'ye ulaşılamaz)
  - başarılı `classified` ve `needs_review`
  - geçersiz çıktılar (katalog dışı tür/kurum, tutarsız `needs_review`/`institution_id`/`review_reason`, JSON değil, eksik alan, boş yanıt) → retry
  - 3 geçersiz çıktı → `ClassificationError`
  - ağ, timeout, 429, 500, 503 → 3 deneme, 1/2 sn bekleme; 3. denemede başarı
  - 400/401/403 → retry yok; hata mesajı genel, ham detay yalnızca `__cause__`'da
  - Gerçek SDK istemcisi + `httpx.MockTransport` (üretimdeki `HTTP_OPTIONS` ile): 503/500/429/timeout/network/geçersiz çıktıda tam 3, 400/401/403'te 1 HTTP isteği; anahtar URL'de ve loglarda yok; istek timeout'u 30 sn; `generationConfig` şemasındaki enum'lar katalog ID'leri
  - Kontrol: aynı senaryoda SDK varsayılan retry'ı açık olsaydı 15 HTTP isteği giderdi
- [x] Gerçek API smoke testi (tek çağrı, `backend/.env` anahtarıyla; anahtar gösterilmedi, DB'ye yazılmadı): `gemini-3.5-flash-lite` erişilebilir. Sentetik çöp şikayeti → `complaint` / `temizlik_isleri` / `needs_review=false`; 1 deneme, ~1 sn.
- [x] `requirements.txt`: `google-genai==2.23.0` ve `httpx==0.28.1`. `classification_service` httpx'i doğrudan kullandığı için doğrudan bağımlılık yapıldı; venv'de google-genai ile çalışan sürüm sabitlendi (google-genai: `httpx>=0.28.1,<1.0.0`, `pip check` temiz). `.env.example`: üç değişkenin zorunlu olduğu notu (secret yok).
- [x] Kararlar: D-009 (katalogdan üretilen structured output modeli), D-031 ve D-035 (Gemini değişkenleri `gemini_client` yüklenirken zorunlu), D-033 (retry tek yerde, SDK retry/AFC kapalı, timeout birimi). `PROJECT_BRAIN.md` §3, §4 ve §7'de ilgili satırlar güncellendi.
- [x] Doğrulama: `pytest` 68 passed (24 dosya servisi + 44 sınıflandırma); `GET /health` 200; `alembic current` = `2ab2daa5828a (head)`.

**Aşama 5 — `POST /api/documents/classify` endpoint'i**

- [x] `app/api/documents.py` (router `main.py`'ye eklendi). Senkron `def` endpoint; FastAPI thread pool'da çalıştırır (D-020). Akış:
  1. Upload'dan en fazla `MAX_FILE_SIZE + 1` bayt okunur (Content-Length'e güvenilmez).
  2. `check_file_size` → 413; `detect_file_type` → 415. Bu iki durumda kayıt ve storage dosyası yok.
  3. `uuid4()` → `save_file` → `extract_text` → `check_text_length`.
  4. `classification_service.classify_text(tam metin)`; `needs_review` → `status` = `needs_review` / `classified`.
  5. `Document` kaydı yazılır, commit başarılıysa yanıt döner.
  - `TextExtractionError` → `failed` kaydı (`extracted_text` = kısa metin varsa o, yoksa null) + 422. `ClassificationError` → `failed` kaydı (tam metin) + 502. İki durumda da dosya storage'da kalır.
  - Beklenmeyen hata (ör. commit hatası): bu isteğin storage dosyası silinir, `rollback`, exception yükselir → standart 500 (`Internal Server Error`, detay yok).
  - Loglar: belge kimliği, status ve hata türü; belge metni, dosya içeriği ve API anahtarı loglanmaz.
- [x] `app/schemas/classification.py`: `ClassifyResponse` (D-032 alanları; `file_reference`/`extracted_text` yok) ve `FailedClassifyResponse` (+ `message`). Mesajlar: 422 "Belgeden sınıflandırma için yeterli metin çıkarılamadı.", 502 "Belge şu anda sınıflandırılamadı. Lütfen daha sonra tekrar deneyin."; 413/415 FastAPI `{"detail": ...}` ile genel mesaj.
- [x] `app/database.py`: `get_db()` dependency (istek başına session, sonunda kapanır); engine `hide_parameters=True` (SQL hatalarında parametre değerleri, ör. belge metni, log/mesajlara girmez).
- [x] `app/services/file_service.py`: `delete_file(file_reference)` (orphan dosya temizliği için).
- [x] `app/main.py`: `logging.basicConfig(level=INFO)` ve documents router kaydı.
- [x] `requirements.txt`: `python-multipart==0.0.32` (FastAPI dosya yükleme için; venv'de çalışan sürüm, `pip check` temiz).
- [x] Testler (`tests/test_documents_api.py`, 22 test; SQLite + `get_db` override, geçici storage, sahte `classify_text`; beklenmeyen gerçek sınıflandırma çağrısı testi düşürür):
  - PDF ve DOCX → 200 `classified`; `needs_review` → 200; yanıtta `file_reference`/`extracted_text` yok; DB'de tam metin ve `file_reference`; storage dosyası yüklenenle aynı; 60.000 karakter tam metin DB'ye ve sınıflandırmaya gider
  - 413 (sınır üstü) ve sınırda kabul; upload yalnızca `MAX_FILE_SIZE + 1` bayt okunur; 415 (txt, doc, sahte PDF/DOCX); dosya yok → FastAPI 422 doğrulama hatası. Hepsinde kayıt ve dosya yok
  - 422 (kısa metin / metinsiz PDF / bozuk PDF) ve 502: `failed` kaydı, sınıflandırma alanları null, `needs_review=false`, dosya storage'da, genel mesaj, ham hata detayı yanıtta yok
  - Kötü amaçlı dosya adı (`../../gizli/dilekce.pdf`) yalnızca `file_name`'de; storage adı `document_id` ile eşleşir
  - Commit hatası (classified / text-failed / classification-failed akışlarında): 500, rollback, DB'de kayıt yok, orphan dosya silinmiş; loglarda belge metni yok
  - Production engine `hide_parameters=True`
- [x] Gerçek uçtan uca smoke testi (Docker PostgreSQL + gerçek Gemini, tek sentetik DOCX, anahtar ve metin gösterilmedi):
  - `uvicorn` + HTTP upload → `200` / `classified` / `request` / `park_bahceler`, 1,61 sn, 1 gerçek Gemini isteği
  - DB kaydında tam metin ve `file_reference` doğru, storage dosyası yüklenenle aynı; loglarda anahtar ve belge metni yok
  - Kayıt ve dosya test sonunda silindi (DB 0 satır, storage yalnızca `.gitkeep`; psql ile bağımsız kontrol)
- [x] `README.md`: classify çalışan endpoint, backend ana MVP akışı tamamlandı, sıradaki aşama frontend.
- [x] Doğrulama: `pytest` 90 passed (24 + 44 + 22); `GET /health` 200; `alembic current` = `2ab2daa5828a (head)`; Docker PostgreSQL healthy.

**Aşama 6 öncesi kararlar (yalnızca dokümantasyon)**

- [x] `DECISIONS.md`: `## Frontend` bölümü eklendi — D-037 (React + Vite + TypeScript, npm, düz CSS; Tailwind/Redux/UI kütüphanesi yok), D-038 (Vite proxy `/api` → `http://127.0.0.1:8000`, CORS middleware yok), D-039 (frontend isteğinde 120 sn zaman aşımı), D-040 (frontend'de uzantı ve 50 MB ön kontrolü; otorite backend).
- [x] `DECISIONS.md`: D-032 güncellendi — yanıta `document_type_name` ve `institution_name` eklenir; adlar katalog `name` değerlerinden türetilir, veritabanında saklanmaz; `institution_id = null` ve `failed` durumunda ad alanları `null`; mevcut ID alanları değişmez. D-005'e D-037 referansı eklendi.
- [x] `PROJECT_BRAIN.md`: §3 frontend yığını, §4 geliştirme ortamında proxy notu, §9 başarılı ve `failed` yanıt örnekleri + adların kaynağı, §11 frontend satırı güncellendi.
- [x] Kararlar alındığında kod ve testler değiştirilmedi; uygulama Aşama 6 · Adım 1'de yapıldı.

**Aşama 6 · Adım 1 — Classify yanıtına katalog adları (D-032)**

- [x] `app/services/classification_service.py`: kataloglar yüklendikten sonra `DOCUMENT_TYPE_NAMES` ve `INSTITUTION_NAMES` (ID → `name`) sözlükleri. Yeni servis, repository veya soyutlama eklenmedi.
- [x] `app/schemas/classification.py`: `ClassifyResponse`'a `document_type_name` ve `institution_name` (`str | None`). `FailedClassifyResponse` miras aldığı için ayrıca değişmedi.
- [x] `app/api/documents.py`: `_response_body` adları bu sözlüklerden `.get(...)` ile okur; ID `null` ise ad da `null` olur, `failed` yanıtlarda iki alan da `null`.
- [x] Veritabanı modeli, migration ve `documents` tablosu değişmedi; adlar saklanmaz, her yanıtta katalogdan okunur.
- [x] Testler (2 yeni test, mevcut beş test yeni sözleşmeye göre güncellendi):
  - `tests/test_documents_api.py` (23): classified yanıtta adlar doğru; `needs_review` + `institution_id = null` → `institution_name = null`, tür adı yine dolu; `failed` 422 ve 502'de iki ad da `null`; ID alanlarının davranışı değişmedi; yanıtta hâlâ `file_reference` ve `extracted_text` yok; adlar katalog sözlüğünden okunuyor (sözlük değiştirilince yanıt değişiyor) ve `Document` kaydında ad alanı yok.
  - `tests/test_classification_service.py` (45): ad sözlükleri katalog JSON'larıyla birebir aynı.
- [x] `README.md` yanıt alanları güncellendi.
- [x] Doğrulama: `pytest` 92 passed (24 + 45 + 23); `GET /health` → `200 {"status": "ok"}`; `/openapi.json` içinde `ClassifyResponse` ve `FailedClassifyResponse` yeni alanları içeriyor; `alembic current` = `2ab2daa5828a (head)`; Docker PostgreSQL `Up (healthy)`. Gerçek Gemini smoke testi tekrarlanmadı: değişiklik yalnızca yanıt ve katalog eşlemesi seviyesinde.

**Aşama 6 · Adım 2 — Frontend iskeleti ve Vite proxy (D-037, D-038)**

- [x] `frontend/` standart Vite React + TypeScript şablonuyla oluşturuldu (`npm create vite@latest frontend -- --template react-ts`). Node v26.7.0, npm 11.19.0; `package-lock.json`'da React 19.3.0, Vite 8.3.0, TypeScript 6.0.3. Uygulama bağımlılıkları yalnızca `react` ve `react-dom`; router, state kütüphanesi, UI kütüphanesi, Tailwind veya HTTP istemcisi eklenmedi.
- [x] Vite demo içeriği temizlendi: `src/assets/`, `public/` (demo ikonları ve favicon) ve şablon `README.md` silindi; `App.tsx` sade bir başlangıç ekranı (başlık + kısa açıklama), `App.css` ve `index.css` düz CSS. `index.html` başlığı "Belge Sınıflandırma", `lang="tr"`.
- [x] `vite.config.ts`: `server.proxy` ile `/api` → `http://127.0.0.1:8000` (D-038). Uygulama kodunda backend adresi yok; FastAPI'ye CORS middleware eklenmedi, backend kodu değişmedi.
- [x] `npm install` (0 güvenlik açığı) ve `npm run build` (`tsc -b && vite build`) başarılı: 17 modül, ~0,5 sn, `dist/` çıktısı.
- [x] Proxy smoke testi (gerçek zincir: curl → Vite 5173 → `/api` proxy → FastAPI 8000 → metin çıkarımı → Gemini → PostgreSQL → yanıt): geçici sentetik DOCX ile `200`, `status = classified`, `document_type = complaint` / `document_type_name = Şikayet`, `institution_id = temizlik_isleri` / `institution_name = Temizlik İşleri Müdürlüğü`, `needs_review = false`, `review_reason = null`; 1 gerçek Gemini isteği, 1,29 sn.
- [x] Smoke testi temizliği: `documents` kaydı ve storage dosyası silindi (tabloda 0 satır, `backend/storage/` içinde yalnızca `.gitkeep`), geçici belge scratch alanından kaldırıldı. Repoda test dosyası bırakılmadı.
- [x] Backend regresyonu: `pytest` 92 passed, `GET /health` → `200`. Alembic ve şema değişmedi (`2ab2daa5828a (head)`).
- [x] `README.md` güncellendi: frontend artık mevcut, kurulum/çalıştırma komutları ve proxy anlatımı eklendi, "frontend henüz yok" ifadeleri kaldırıldı.

**Aşama 6 · Adım 3 — Yükleme ekranı (D-039, D-040)**

- [x] `src/App.tsx`: tek bileşende dosya seçimi → ön kontrol → classify isteği → yükleniyor → sade sonuç/hata. Yeni bağımlılık eklenmedi; yerleşik `fetch`, `FormData` ve `AbortController` kullanıldı.
  - Dosya seçimi: `accept=".pdf,.docx"`, tek dosya; seçilen dosyanın adı ve boyutu ekranda gösterilir.
  - Ön kontrol (D-040): uzantı `.pdf`/`.docx` değilse "Yalnızca PDF veya DOCX dosyaları desteklenir.", boyut sınırı aşılırsa "Dosya boyutu 50 MB'ı aşamaz." Geçersiz dosyada gönder butonu kapalı kalır ve istek atılmaz. `MAX_FILE_SIZE` tek sabit olarak tanımlı; backend doğrulamaları (413/415) olduğu gibi duruyor.
  - İstek: `POST /api/documents/classify`, `FormData` içinde `file` alanı, göreli yol (backend adresi kodda yok), `Content-Type` elle verilmiyor.
  - Zaman aşımı (D-039): `REQUEST_TIMEOUT_MS = 120_000`, `AbortController` + `setTimeout`; `finally` içinde `clearTimeout` ve `loading = false`. Zaman aşımında "İşlem zaman aşımına uğradı. Lütfen tekrar deneyin."
  - Yükleniyor: "Belge sınıflandırılıyor...", gönder butonu ve dosya seçici devre dışı; istek bitince ikisi de tekrar açılıyor.
  - Yanıt tipi: `ClassifyResponse` (D-032'nin 10 alanı + opsiyonel `message`). Sonuç `result` state'inde saklanıyor; ekranda şimdilik "Sınıflandırma tamamlandı." ve tek satır tür/kurum/status.
  - Hata state'i: `ClassifyError { message, httpStatus, body }` — kullanıcıya yalnızca genel Türkçe mesaj gösterilir, backend gövdesi Adım 4 için saklanır. Ayrım: zaman aşımı / ağ hatası / backend non-2xx.
- [x] `src/App.css`: form, buton, dosya bilgisi, durum, hata ve sonuç için düz CSS. Kütüphane eklenmedi (ikon, toast, modal, drag-drop, router yok).
- [x] Doğrulama — `npm run build` başarılı (`tsc -b` hatasız, 205 ms). Tarayıcıda gerçek UI ile:
  - `.txt` seçimi → "Yalnızca PDF veya DOCX dosyaları desteklenir.", buton kapalı, istek gitmedi.
  - 51 MB `.pdf` seçimi → "Dosya boyutu 50 MB'ı aşamaz.", buton kapalı, istek gitmedi.
  - Geçerli sentetik PDF → yükleniyor durumu göründü, ardından `200`: "Talep Dilekçesi · Fen İşleri Müdürlüğü · classified" (1 gerçek Gemini isteği). Zincir: UI → `/api` → Vite proxy → FastAPI → Gemini → PostgreSQL → yanıt.
- [x] Smoke temizliği: `documents` kaydı ve storage dosyası silindi (0 satır, yalnızca `.gitkeep`), geçici PDF scratch alanından kaldırıldı. Backend regresyonu: `pytest` 92 passed, `GET /health` → `200`. Backend kodu değişmedi.

**Aşama 6 · Adım 4 — Sonuç ve hata ekranı (D-032, D-034, D-039)**

- [x] `src/App.tsx` (yardımcılar aynı dosyada; yeni katman, klasör veya bağımlılık yok):
  - Başarılı sonuç (`needs_review = false`): yeşil kutu, "Belge başarıyla sınıflandırıldı." başlığı; Dosya, Belge Türü (`document_type_name`), Gönderileceği Kurum (`institution_name`). Teknik ID'ler (`document_type`, `institution_id`, `document_id`) ve `status` ekranda gösterilmez.
  - `needs_review = true`: sarı kutu (hata gibi görünmez), "İnsan incelemesi gerekiyor" başlığı ve kısa açıklama; tür ve kurum adları, ad `null` ise "Belirlenemedi"; `review_reason` varsa "İnceleme nedeni: …".
  - Hata eşlemesi (`errorMessage(httpStatus, body)`): 413 → "Dosya boyutu 50 MB'ı aşamaz."; 415 → "Yalnızca PDF veya DOCX dosyaları desteklenir."; 422 gövdesi `status = "failed"` ise backend'in genel `message`'ı (yoksa "Belge içeriği işlenemedi veya yeterli metin çıkarılamadı."), değilse FastAPI doğrulama hatası sayılır → "Dosya gönderilemedi. Lütfen bir PDF veya DOCX dosyası seçip tekrar deneyin."; 502 → failed `message`'ı ya da "Belge şu anda sınıflandırılamadı. Lütfen daha sonra tekrar deneyin."; diğer kodlar (500 dahil) → "Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin."; ağ hatası → "Sunucuya ulaşılamadı. Lütfen bağlantıyı kontrol edip tekrar deneyin."; zaman aşımı → D-039 mesajı. Ekrana yalnızca bu mesajlar basılır; `detail` ve diğer gövde alanları gösterilmez.
  - Mesajlar tek yerde sabit; 413/415 mesajları ön kontrolle ortak. `ClassifyResponse.status` gerçek değerlerle tiplendi (`classified | needs_review | failed`). Yeni dosya seçilince önceki sonuç/hata temizlenir; sayfa yenilemeden yeni belge gönderilebilir.
- [x] `src/App.css`: başarı/inceleme/hata kutuları, `dl` ızgarası; 30rem altında tek sütun; uzun dosya adları sarılır (mobilde form içi taşma düzeltildi).
- [x] Doğrulama — `npm run build` başarılı; `pytest` 92 passed; `GET /health` → `200`; backend kodu değişmedi. Tarayıcıda gerçek UI ile:
  - A: `.txt` ve 51 MB `.pdf` → doğru uyarılar, buton kapalı, `/api` isteği yok.
  - B: sentetik şikayet PDF'i → `200`, yeşil kutu, "Şikayet" / "Zabıta Müdürlüğü", teknik ID görünmüyor (1 gerçek Gemini isteği, 1,3 sn).
  - C: 4 karakterlik metinli PDF → `422` `failed`, ekranda "Belgeden sınıflandırma için yeterli metin çıkarılamadı." (Gemini çağrısı yok).
  - Zaman aşımı: test sırasında Docker Desktop kapalıydı; istek PostgreSQL bağlantısında bekledi ve frontend 120 sn'de gerçekten "İşlem zaman aşımına uğradı…" gösterdi, kontroller tekrar açıldı. Backend ~130 sn sonra 500 döndü ve yetim storage dosyasını sildi.
  - `needs_review` (kurum var/yok), 413, 415, doğrulama 422, `failed` 422 (mesajlı/mesajsız), 502 (failed gövdeli/JSON'suz), 500 ve ağ hatası: backend'e dokunmadan tarayıcıda `fetch` taklit edilerek gerçek bileşen üzerinden doğrulandı; hiçbir durumda teknik içerik ekrana çıkmadı. Doğrulama 422'sinin ve 415'in gerçek gövde şekli proxy üzerinden ayrıca kontrol edildi.
- [x] Temizlik: 2 test kaydı (`failed` + `classified`) ve storage dosyaları silindi (0 satır, yalnızca `.gitkeep`); geçici PDF'ler kaldırıldı.

**V1 öncesi audit ve polish pass (Aşama 6 · Adım 5 hazırlığı)**

- [x] Read-only audit: kritik sorun yok. Kod aktif kararlarla uyumlu; sınırlar (50 MB, 10 karakter, 50.000 karakter, 3 deneme, 30 sn, 120 sn) kod ve kararlarda aynı; kapsam dışı özellik yok; kataloglar `PROJECT_BRAIN.md` §6 ile birebir aynı.
- [x] Graphify ile kod/doküman graph'ı çıkarıldı (`graphify-out/`, Git dışında): backend bağımlılıkları yalnızca aşağı yönlü, import döngüsü ve Python↔TypeScript kenarı yok. Sağlık uyarıları (dış paket importları, `App.tsx`/`App.css` kimlik çakışması) graph kaynaklı false positive.
- [x] OpenAPI 422 sözleşmesi: `app/api/documents.py` 422 yanıtını `FailedClassifyResponse | ValidationErrorResponse` olarak belgeliyor; `app/schemas/classification.py`'e yalnızca belge için `ValidationErrorResponse` (`detail` listesi) eklendi. Runtime davranışı değişmedi; canlı `/openapi.json`'da 422 için `anyOf` iki gövdeyi gösteriyor.
- [x] Log güvenliği (`app/services/classification_service.py`): başarısız Gemini denemesinin uyarı logu artık ham API yanıtını (`APIError.details`) ve pydantic `input_value`'yu (model çıktısı, ör. `review_reason`) içermiyor. Kalan bağlam: deneme numarası, hata türü, API hatalarında HTTP kodu, geçersiz çıktıda alan:hata türü özeti. Sınıflandırma, retry ve hata eşlemesi değişmedi.
- [x] Frontend erişilebilirlik (`src/App.tsx`, `src/App.css`): dosya seçici için görünür etiket ("Belge dosyası") ve `aria-describedby` ile bağlı sınır açıklaması ("PDF veya DOCX, en fazla 50 MB."); her zaman DOM'da duran `role="status"` bölgesi ("Belge sınıflandırılıyor..."); sonuç `aria-live="polite"` bölgesinde. Tasarım ve bağımlılıklar değişmedi.
- [x] `backend/tests/.gitkeep` kaldırıldı (klasörde test dosyaları var). `oxlint` ve `.oxlintrc.json` korunuyor.
- [x] Dokümantasyon temizliği: `CURRENT_STATE.md`, `README.md` ve `PROJECT_BRAIN.md`'deki eski ifadeler (frontend yok, yükleme ekranı yok, frontend gelecekte çalışacak, onay bekleniyor) güncellendi; API hata tablolarına doğrulama 422'si ve 500 eklendi. `DECISIONS.md` değişmedi.
- [x] Testler: 2 yeni regresyon testi — başarısız deneme loglarında model çıktısı, ham API gövdesi ve belge metni yok (`test_classification_service.py`, 46); OpenAPI 422 iki gövdeyi belgeliyor (`test_documents_api.py`, 24).
- [x] Doğrulama: `pytest` 94 passed (24 + 46 + 24); `pip check` temiz; `GET /health` → `200`; `npm run build` ve `npm run lint` (oxlint) temiz; tarayıcıda etiket, açıklama, `role="status"` ve `aria-live` davranışı doğrulandı (backend'e istek atılmadan). Gerçek Gemini çağrısı yapılmadı; `documents` tablosu 0 satır, `backend/storage/` içinde yalnızca `.gitkeep`.

**PostgreSQL bağlantı zaman aşımı (D-041)**

- [x] Karar: bağlantı kurma en fazla 10 sn. `DATABASE_URL`'e libpq parametresi `connect_timeout=10` eklendi (`backend/.env.example` ve yerel `backend/.env`; yerel dosyada yalnızca bu satır değişti). Kod değişmedi; SQLAlchemy parametreyi psycopg'a iletiyor, uygulama ve Alembic aynı adresi kullanıyor. Sorgu/statement zaman aşımı eklenmedi.
- [x] `DECISIONS.md`: D-041 eklendi, D-036'daki adres örneği güncellendi. `PROJECT_BRAIN.md` §3 ve `README.md` geliştirme ortamı notu senkronize edildi.
- [x] PostgreSQL açıkken: `pytest` 94 passed; `alembic current` = `2ab2daa5828a (head)`; uygulama engine'iyle `SELECT 1` 0,06 sn; `GET /health` → `200`.
- [x] PostgreSQL kontrollü durdurulduğunda (`docker compose stop postgres`): yeni bağlantı denemesi iki ölçümde 10,04 sn ve 10,07 sn'de `OperationalError` (`psycopg.errors.ConnectionTimeout: connection timeout expired`) verdi; `alembic current` ~10 sn'de aynı hatayla çıktı (Python açılışı dahil 11,57 sn). Önceki davranış ~130 sn idi. Classify ve Gemini isteği yapılmadı.
- [x] `docker compose start postgres` sonrası container 5 sn'de healthy; `alembic current` head, `SELECT 1` 0,05 sn, `documents` 0 satır, `backend/storage` yalnızca `.gitkeep`, `GET /health` → `200`. Backend yeni ayarla yeniden başlatıldı.
- [x] Commit hatasında rollback, yetim dosya silme ve ayrıntısız `500` davranışı kod olarak değişmedi; `test_db_commit_failure_rolls_back_and_removes_orphan_file` bunu doğrulamaya devam ediyor.

**D-034 HTTP durum kodu sözleşmesi netleştirildi (yalnızca dokümantasyon)**

- [x] D-034, gerçek runtime davranışıyla hizalandı: kabul sonrası kayıt yazılamazsa ayrıntısız `500`; Gemini aşamasındaki beklenmeyen hatalar da `502`; `200`, `413`, `415`, doğrulama `422` ve çerçevenin standart yanıtları (`400`, `405`). Eski "kabul sonrası başka HTTP hata kodu kullanılmaz" ifadesi kaldırıldı. `PROJECT_BRAIN.md` §9 senkronize edildi; kod ve testler değişmedi.
- [x] Doğrulama: endpoint kodu ve testler okundu; süreç içinde sahte ortam ve geçici SQLite ile yanlış metot → `405`, boundary'siz çok parçalı gövde → `400`, dosya yok → `422`, `.txt` → `415` (kayıt ve dosya yok), Gemini aşamasında beklenmeyen hata → `502` + `failed` kaydı (ham ayrıntı yanıtta yok). `pytest` 94 passed.

**Storage yazma hatasında yarım dosya temizliği ve README kurulum rehberi**

- [x] Risk doğrulandı: `save_file` dosyayı `open("xb")` ile oluşturup yazıyordu; yazma (veya kapanıştaki flush) yarıda hata verirse kısmi dosya storage'da kalıyordu. Endpoint'te `save_file` çağrısı commit temizliğinin `try` bloğu dışında olduğu için istek `500` dönüyor ama yarım dosya (testte 8 baytlık `%PDF-1.7`) yetim kalıyordu.
- [x] Düzeltme (`app/services/file_service.py`): dosya bu çağrıda oluşturulduktan sonra yazma/kapatma hata verirse, dosya kapandıktan sonra silinir ve özgün hata aynen yükselir (silme hatası özgün hatayı gizlemez). Dosya açılamazsa (ör. zaten varsa) hiçbir dosyaya dokunulmaz. Başarılı yazma, endpoint ve commit hatası temizliği değişmedi; yeni bağımlılık yok.
- [x] Testler (3 yeni): `tests/conftest.py`'de gerçek diski doldurmadan yazmayı yarıda kesen `failing_storage_write` fixture'ı; `test_failed_write_removes_partial_file_and_reraises` ve `test_existing_storage_file_is_never_overwritten_or_deleted` (`test_file_service.py`, 26); `test_storage_write_failure_returns_500_without_partial_file_or_record` (`test_documents_api.py`, 25) — `500`, gövde yalnızca `Internal Server Error`, kayıt ve dosya yok. İki regresyon testi düzeltmeden önce yetim dosya nedeniyle kırıldı.
- [x] D-034 ve `PROJECT_BRAIN.md` §9'daki `500` tanımına storage yazma hatası eklendi (yeni karar açılmadı).
- [x] `README.md`: sıfırdan kurulum için "Kurulum ve Çalıştırma" bölümü (gereksinimler, klonlama, backend ortamı, `.env`, Docker PostgreSQL, migration, backend, frontend, kullanım, doğrulama komutları, durdurma/başlatma). Komutlar repo yapısı ve bu makinede doğrulandı; teknik boyut sınırı 50 MiB olarak yazıldı, çerçevenin `400`/`405` yanıtları API bölümüne eklendi.
- [x] Doğrulama: `pytest` 97 passed (26 + 46 + 25); `pip check` temiz; `npm run build` ve `npm run lint` temiz; `GET /health`, `/docs`, `/redoc`, `/openapi.json` → `200`; `alembic current` head; PostgreSQL healthy. Gerçek Gemini çağrısı yapılmadı. Backend düzeltilmiş kodla yeniden başlatıldı.

**Aşama 6 · Adım 5 — Manuel V1 doğrulaması (gerçek belgelerle test)**

- [x] 11 senaryoluk manuel test matrisi arayüz üzerinden uygulandı (tarayıcı → Vite proxy → FastAPI → Gemini → PostgreSQL); sonuçlar veritabanından salt-okuma kontrolüyle doğrulandı. **11/11 senaryo beklenen sonucu verdi.**

| # | Senaryo | Sonuç |
|---|---|---|
| 01 | Yol çukuru şikayeti | `complaint` · `fen_isleri` · `classified` |
| 02 | Park bankı talebi | `request` · `park_bahceler` · `classified` |
| 03 | Emlak vergisi bilgi edinme | `information_request` · `mali_hizmetler` · `classified` |
| 04 | Kültür merkezi salon başvurusu | `application` · `kultur_sosyal_isler` · `classified` |
| 05 | Ağaç + kaldırım, belirsiz kurum | `complaint` · `institution_id = null` · `needs_review`; `review_reason` dolu ve anlamlı |
| 06 | Sokak hayvanı (katalog dışı birim) | `request` · `institution_id = null` · `needs_review`; `review_reason` dolu ve anlamlı |
| 07 | Tablo ağırlıklı sosyal yardım (DOCX) | `application` · `sosyal_hizmetler` · `classified` |
| 08 | Taranmış / yalnızca görüntü PDF | `failed`; Gemini çağrısı yapılmadan, metin çıkarılamadığı için durdu |
| 09 | 6 karakterlik kısa metin PDF | `failed`; Gemini çağrısı yapılmadan, 10 karakter kuralında durdu (D-026) |
| 10 | Çok sayfalı zabıta şikayeti | `complaint` · `zabita` · `classified` |
| 11 | `.txt` dosya | Frontend ön kontrolü gönderimi engelledi; DB kaydı ve storage dosyası oluşmadı (D-040) |

- [x] `failed` kayıtlarında (08, 09) `document_type`, `institution_id` ve `review_reason` `null`, `needs_review = false`; `extracted_text` 08'de `null`, 09'da 6 karakter.
- [x] Toplam 10 kayıt: `classified` 6, `needs_review` 2, `failed` 2. `.txt` senaryosu kayıt üretmedi.
- [x] DB ↔ storage: `file_reference` değerleriyle 10/10 birebir eşleşme; orphan dosya 0, eksik storage dosyası 0, `.gitkeep` dışında beklenmeyen giriş yok.
- [x] Altı tutarlılık kontrolünde sapma yok: `classified` + `institution_id` null; `needs_review = false` + `review_reason` dolu; `needs_review = true` + `status ≠ needs_review`; `failed` + sınıflandırma alanı dolu; katalog dışı `document_type`; `file_reference ≠ <id>.<uzantı>`.
- [x] Test oturumundan sonra bilgisayar yeniden başladı ve PostgreSQL container'ı düzgün kapanmadan sonlandı (exit 255). Yeniden başlatmada otomatik crash recovery sorunsuz tamamlandı (`redo done`, `database system is ready to accept connections`); **veri kaybı olmadı**, 10 kaydın ve storage dosyalarının tamamı yerinde kaldı.
- [x] Manuel test sonucunda prompt, katalog veya kod değişikliği gerektiren **V1 blocker bulunmadı**. Tek gözlem: 05'in inceleme gerekçesi park/bahçeler ↔ zabıta ikilemini gösteriyor ("kaldırım" hem `fen_isleri` hem `zabita` açıklamasında geçiyor). Davranış doğru (zorla atama yapılmadı); kurum açıklamalarının netleştirilmesi V1 sonrasına bırakıldı.

**V1 final temizliği ve doğrulaması (2026-09-17)**

- [x] Sentetik manuel test verileri temizlendi: silme öncesi tablodaki kayıtların tam olarak bu 10 sentetik test belgesinden ibaret olduğu doğrulandı, ardından 10 `documents` kaydı id listesiyle silindi ve yalnızca bunlara karşılık gelen 10 storage dosyası kaldırıldı. `TRUNCATE`, volume silme veya `docker compose down` kullanılmadı; `.gitkeep` korundu.
- [x] Temizlik sonrası durum: `documents` 0 satır, `backend/storage/` içinde yalnızca `.gitkeep`; orphan dosya ve beklenmeyen giriş yok.
- [x] Final kontroller: `pytest` 97 passed (26 + 46 + 25; 2 bilinen deprecation uyarısı); `pip check` → "No broken requirements found"; `alembic current` = `2ab2daa5828a (head)`; Docker PostgreSQL `Up (healthy)`; `GET /health` → `200 {"status": "ok"}`; `npm run build` başarılı (17 modül, ~0,6 sn); `npm run lint` (oxlint) temiz (exit 0).
- [x] Doğrulama sırasında `/api/documents/classify` çağrılmadı ve gerçek Gemini isteği gönderilmedi. Kod, mimari, `DECISIONS.md` ve `PROJECT_BRAIN.md` değişmedi; yalnızca `CURRENT_STATE.md` ve `README.md` güncellendi.

**V1.1 — Taranmış PDF'ler için OCR fallback (2026-09-17)**

- [x] `app/settings.py`: opsiyonel `TESSDATA_PREFIX` (`os.getenv`, `require_env` değil). Tanımlı değilse uygulama normal başlar.
- [x] `app/services/file_service.py`: `OCR_LANGUAGE = "tur"` (başlangıçta `tur+eng` idi; aşağıdaki OCR dili kararına bakın), `OCR_DPI = 300` sabitleri ve `_ocr_pdf_text`. `extract_text` yalnızca **PDF** için, normalize metin `MIN_TEXT_LENGTH`'in altındaysa OCR'ı dener; sonuç boşsa gömülü metin olduğu gibi döner. Yeni servis, katman veya bağımlılık eklenmedi.
- [x] OCR, PyMuPDF'in yerleşik `get_textpage_ocr`'ı ile yapılır; `tessdata` çağrıya doğrudan geçilir. `pytesseract` eklenmedi, `tesseract` binary'sinin PATH'te olması gerekmiyor (Tesseract MuPDF'e derlenmiş durumda) — yalnızca `tessdata` klasörü gerekiyor.
- [x] Hata yolu: `TESSDATA_PREFIX` yoksa veya OCR hata verirse uyarı loglanır ve boş metin döner; `check_text_length` mevcut `TextExtractionError` → `failed` + `422` davranışını üretir. Yeni hata sınıfı, yeni HTTP kodu veya yanıt alanı yok.
- [x] Endpoint, şema, model, migration, storage ve frontend değişmedi. Gemini retry/timeout mantığına dokunulmadı.
- [x] Testler (8 yeni, `test_file_service.py` 26 → 34): yeterli metni olan PDF OCR çağırmaz; yetersiz PDF fallback kullanır; OCR metni yeterliyse başarılı; yine kısaysa `TextExtractionError`; OCR hatası güvenli başarısızlığa düşer; `TESSDATA_PREFIX` yokken OCR denenmez; OCR `tur` / 300 dpi / doğru `tessdata` ile çağrılır; DOCX asla OCR kullanmaz.
- [x] Doğrulama: `pytest` **105 passed** (34 + 46 + 25); `pip check` temiz; `alembic current` = `2ab2daa5828a (head)`; `npm run build` ve `npm run lint` temiz; `GET /health` → `200`.
- [x] Gerçek smoke testi (`test_08_taranmis_goruntu_pdf.pdf`, V1'de `422 failed` veren belge): gömülü metin 0 karakter → OCR 349 karakter → `200`, `classified`, `complaint` / **Şikayet**, `fen_isleri` / **Fen İşleri Müdürlüğü**, `needs_review = false`; uçtan uca 2,43 sn, 1 gerçek Gemini isteği. Loglarda API anahtarı ve belge metni yok.
- [x] Smoke testi temizliği: kayıt ve storage dosyası silindi (`documents` 0 satır, `backend/storage/` yalnızca `.gitkeep`).
- [x] Dokümantasyon: D-003 OCR fallback'ine göre yeniden yazıldı, D-042 eklendi, D-026'daki "OCR uygulanmaz" ifadesi düzeltildi; `PROJECT_BRAIN.md` §2/§3/§5/§11/§12/§13 ve `README.md` (desteklenen türler, temel kurallar, gereksinimler, `.env` tablosu, kullanım notu, kapsam) güncellendi; `backend/.env.example`'a opsiyonel `TESSDATA_PREFIX` eklendi.

**OCR dili `tur` olarak sabitlendi (2026-09-17)**

- [x] `OCR_LANGUAGE` `tur+eng` → **`tur`**. Gerçek taranmış belge ve ondan türetilen 8 bozulma varyantı (gölge, soluk toner, speckle, perspektif, eğim+blur, düşük JPEG, birleşik gürültü, kötü fotokopi) üzerinde yapılan ölçümde `tur` 5 senaryoda kazandı, 4'ünde eşitti, hiçbirinde geride kalmadı: Türkçe karakter hatası 45 vs 63 (`Ç→C` yalnızca `tur+eng`'de), kritik kelime recall 62/72 vs 60/72, en kötü senaryoda ~2× hızlı. Belgeler Türkçe olduğu için İngilizce model bir yetenek eklemiyor.
- [x] Değişiklik tek sabit + bir test beklentisi; preprocessing, yeni bağımlılık, yeni OCR motoru veya `tessdata_best` eklenmedi. Benchmark dosyaları repo dışında tutuldu.

**V1.1 manuel doğrulaması (2026-09-17)**

- [x] 15 senaryoluk manuel test matrisi arayüz üzerinden uygulandı; **15/15 beklenen davranışı verdi.** Kapsam: normal metin PDF ve DOCX, temiz ve bozulmuş (soluk, gürültülü, eğik, kötü fotokopi) taranmış OCR PDF'leri, Türkçe karakter yoğun belge, çok sayfalı taranmış PDF, `needs_review` düşen iki belge, metin çıkarılamayan iki `failed` belge ve frontend'in engellediği desteklenmeyen format.
- [x] Veritabanı denetimi: 14 kayıt (10 `classified`, 2 `needs_review`, 2 `failed`); tür ve kurum atamalarının tamamı beklenenle eşleşti, 12 invariant kontrolünde sapma yok. `.txt` senaryosu frontend'de durduğu için kayıt ve dosya oluşturmadı (D-040).
- [x] Storage denetimi: `file_reference` ↔ dosya eşleşmesi 14/14; eksik dosya, orphan ve yinelenen referans yok.
- [x] Test verileri denetimden sonra id listesiyle temizlendi (`TRUNCATE` kullanılmadı): `documents` 0 satır, `backend/storage/` yalnızca `.gitkeep`.

**V1.2 · Adım 1 — Kayıt görünürlüğü (2026-09-17)**

- [x] `app/api/documents.py`: üç salt okunur endpoint (D-043) — `GET /api/documents` (`created_at` DESC), `GET /api/documents/{document_id}` ve `GET /api/documents/{document_id}/download`. Ortak alan üretimi `_classify_fields` / `_record_fields` içinde toplandı; `_response_body` aynı yardımcıyı kullandığı için alan tekrarı kalmadı.
- [x] `app/schemas/classification.py`: `DocumentSummary` (`ClassifyResponse` + `created_at`) ve `DocumentDetail` (+ `extracted_text`). Alanlar mirasla gelir; `file_reference` hiçbir şemada yok.
- [x] `app/services/file_service.py`: `MEDIA_TYPES` sabiti (PDF / DOCX). İndirmede yol yalnızca kayıttaki `file_reference`'tan türetilir ve storage klasörü dışına çıkan yol reddedilir; kayıt veya dosya yoksa ayrıntısız `404`.
- [x] Yeni tablo, migration, bağımlılık, servis katmanı veya yazma endpoint'i eklenmedi.
- [x] `frontend/src/App.tsx`: router bağımlılığı olmadan iki görünüm ("Belge Sınıflandırma" / "Kayıtlar"). Kayıtlar görünümü listeyi çeker, durum rozeti gösterir (classified yeşil, needs_review sarı, failed kırmızı), `review_reason`'ı basar, kayda tıklanınca detay endpoint'inden `extracted_text` yükler ve sağdaki PDF/DOCX aksiyonu orijinal dosyayı indirir. İkon kütüphanesi yerine küçük satır içi SVG; stil mevcut düz CSS'e eklendi.
- [x] Testler (12 yeni, `test_documents_api.py` 25 → 37): liste sırası ve boş liste, katalog adları ve alan kümesi, `extracted_text`/`file_reference` sızmaması, `needs_review` alanları, detayda metin ve `failed` kaydın `null` metni, bilinmeyen id'de `404`, PDF ve DOCX indirmede byte-for-byte eşitlik + doğru media type + orijinal dosya adı, kaydı olmayan ve dosyası silinmiş belgede ayrıntısız `404`.
- [x] Doğrulama: `pytest` **117 passed**; `pip check` temiz; `npm run build` ve `npm run lint` temiz. Gerçek PostgreSQL + gerçek storage ile smoke test: liste sırası doğru, detayda metin geldi, üç indirmede de byte-for-byte eşitlik ve doğru `Content-Disposition`, 404'ler ayrıntısız. Tarayıcıda Kayıtlar görünümü, rozetler, detay açma/kapama ve indirme bağlantıları konsol hatasız çalıştı. Gemini çağrısı yapılmadı; smoke verileri silindi (`documents` 0, storage yalnız `.gitkeep`).

**V1.2 · Adım 2 — Özet ve gönderen bilgisi (2026-09-18)**

- [x] `schemas/classification.py`: `ClassificationResult`'a `summary` (zorunlu, boş olamaz), `sender_name` ve `sender_institution` (`str | None`) eklendi; `ClassifyResponse`'a aynı üç alan girdiği için `DocumentSummary`, `DocumentDetail` ve `FailedClassifyResponse` bunları mirasla aldı.
- [x] `classification_service.py`: prompt'a üç alanın kuralları eklendi (özet 1-3 cümle ve yalnızca belgedeki bilgiyle; gönderen kişi/kurum yalnızca açıkça yazıyorsa, tahmin yok; muhatap müdürlük gönderen kurum değil). **Tek çağrı korundu** — yeni istek, ayrı çıkarım adımı, agent veya RAG yok; retry/timeout politikası (D-033) değişmedi. Boş `summary` geçersiz çıktı sayılıp retry ediliyor.
- [x] `models/document.py` + migration `cedf33674167`: `summary`, `sender_name`, `sender_institution` nullable TEXT. Eski kayıtlarla uyumlu; `failed` kayıtlarda üçü de `null` kalır.
- [x] `api/documents.py`: sonuç kayda yazılıyor ve üç alan classify, liste ve detay yanıtlarında dönüyor. `file_reference` ve storage yolu yine hiçbir yanıtta yok.
- [x] `frontend/src/App.tsx`: sınıflandırma kartında Belge Özeti ile — yalnızca doluysa — Gönderen Kişi / Gönderen Kurum satırları; kayıtlar listesinde özet ve varsa gönderen bilgisi. Boş alanlar için "belirlenemedi" satırı basılmıyor. Durum rozeti, `review_reason`, detay açma ve indirme davranışı değişmedi; yeni UI bağımlılığı yok.
- [x] Testler (16 yeni, toplam 105 → **133**): özet + gönderen dolu senaryo, gönderen bilgisi olmayan belge, `needs_review`'da özetin korunması, iki `failed` yolunda üç alanın `null` kalması, DB'ye doğru yazılma, liste/detay yanıtları, migration öncesi yazılmış `null` alanlı kayıt, şema alanları, prompt kuralları, tek çağrıda dönmesi, boş/eksik `summary`'nin retry edilmesi ve retry/timeout politikasının değişmediği, model-migration kolon uyumu.
- [x] Doğrulama: `pytest` **133 passed**; `pip check` temiz; gerçek PostgreSQL'de `alembic upgrade head` → `cedf33674167 (head)`, `alembic check` "No new upgrade operations detected"; `npm run build` ve `npm run lint` temiz.
- [x] Gerçek Gemini smoke testi (2 belge): (A) açık kişi + kurum içeren dilekçe → `sender_name = "Ayşe Yılmaz"`, `sender_institution = "Çiğdem Mahallesi Muhtarlığı"` — muhatap müdürlükle karıştırılmadı; (B) gönderen bilgisi içermeyen dilekçe → iki alan da `null`, **isim/kurum uydurulmadı**. İki belgede de özet tek cümlelik, belgedeki bilgiyle sınırlı ve doğru; sınıflandırma `complaint` / `fen_isleri` / `classified`. Tarayıcıda kayıtlar görünümü konsol hatasız doğrulandı. Test verileri silindi (`documents` 0, storage yalnız `.gitkeep`).

**V1.2 · Adım 2 kalite doğrulaması (2026-09-18)**

- [x] Migration round-trip gerçek PostgreSQL'de: `cedf33674167` → `downgrade 2ab2daa5828a` → `upgrade head`. Downgrade yalnızca üç yeni kolonu düşürdü, 11 eski kolonun tipi ve nullable değeri korundu; upgrade'den sonra üçü de `text NULL`, tablo 14 kolon, `alembic check` temiz. Başka tablo/kolon değişmedi, veri kaybı riski görülmedi.
- [x] Gerçek Gemini ile 10 senaryoluk metadata matrisi (kişi+kurum, yalnız kişi, yalnız kurum, ikisi de yok, birden fazla isim, muhatap kurum var/gönderen yok, antetli kurum belgesi, `needs_review`, OCR'lı taranmış PDF, DOCX): **10/10 beklenen davranış**. İsim veya kurum uydurma yok; muhatap müdürlük hiçbir senaryoda gönderen kurum sayılmadı; birden fazla isim geçen belgede yalnızca başvuran seçildi; metadata yüzünden `failed` olan belge olmadı. Özetler 1-2 cümle ve belgedeki bilgiyle sınırlı kaldı.
- [x] 10 belge için tam 10 gerçek Gemini isteği; retry yok (D-033 davranışı değişmemiş).
- [x] Log güvenliği: benzersiz gönderen adı, kurum adı ve belge işaretiyle yapılan gerçek çalıştırmada loglarda `sender_name`, `sender_institution`, `summary`, belge metni, ham model çıktısı ve API anahtarı **bulunmadı**. Operasyonel loglar çalışmaya devam ediyor (belge kimliği + status).
- [x] Doğrulama: `pytest` 133 passed; `pip check` temiz; `alembic current` = `cedf33674167 (head)`; `npm run build` ve `npm run lint` temiz. Test kayıtları ve dosyaları silindi (`documents` 0, storage yalnız `.gitkeep`). Ürün kodu değişmedi.
- [x] Otomatik log regresyon coverage'ı tamamlandı: mevcut log güvenliği testine (`test_failed_attempt_logs_hide_model_output_raw_api_body_and_document_text`) `summary`, `sender_name` ve `sender_institution` için benzersiz değerler ve bunların `caplog`'da bulunmadığını doğrulayan assertion'lar eklendi. Belge metni, `review_reason`, ham API gövdesi ve API anahtarı kontrolleri korundu; ürün kodu değişmedi.

**V1.2 · Adım 3 — Frontend polish (2026-09-18)**

- [x] Yalnızca görünüm çalışması: backend, API sözleşmesi, DB, migration, prompt, sınıflandırma ve OCR'a dokunulmadı. Yeni bağımlılık, router, UI/CSS framework veya icon kütüphanesi eklenmedi; React + TypeScript + düz CSS korundu.
- [x] `src/index.css`: tasarım token'ları (`:root` içinde yüzey/metin/kenarlık/aksan/durum renkleri, yarıçap, gölge) ve genel `:focus-visible` odak halkası. Sayfa zemini hafif griye alındı, kartlar beyaz yüzey olarak ayrışıyor.
- [x] `src/App.css` yeniden düzenlendi (sınıf adları değişmedi): içerik genişliği 40 → 48 rem; başlık alanı `page-header` + açıklama satırı; sekmeler belirgin aktif durumlu sekme şeridi; form kart görünümü ve `::file-selector-button` ile düzenlenmiş native dosya alanı; birincil aksiyon vurgulandı; `status` satırına dönen yükleniyor göstergesi (`prefers-reduced-motion` ile kapanır); sonuç/uyarı kutularına sol renk şeridi; kayıt kartlarında ad → tür/kurum → tarih → özet → gönderen hiyerarşisi; rozet ve indirme aksiyonu sağda üste hizalı `record-actions` grubunda; açılan detay ayrı zeminli panel ve monospace, kaydırılabilir metin; boş liste için `empty` yer tutucu.
- [x] `src/App.tsx` (minimum): `header` + açıklama satırı; rozet ve indirme `record-actions` içine, özet/gönderen/inceleme nedeni `record-body` içine alındı; boş liste mesajı `empty` sınıfına geçti; seçilen dosya adı vurgulandı; gönder butonu yüklenirken "Sınıflandırılıyor..." yazıyor; tarih saniyesiz gösteriliyor. Sınıflandırma görünümündeki tanıtım paragrafı kaldırıldı (aynı bilgi form etiketi ve ipucunda duruyor).
- [x] Düzeltilen hata: genel `button` kuralı sekmelere ve kayıt satırlarına sızıyordu (`button:hover:not(:disabled)` specificity'si `.view-tab.active`'i geçiyordu); aktif sekme hover'da mavi dolgu alıyordu. Dolgulu görünüm artık yalnızca `form button[type='submit']` ve `.secondary` için tanımlı.
- [x] Davranış değişmedi: PDF/DOCX ve 50 MB ön kontrolleri, 120 sn zaman aşımı, hata mesajı eşlemesi, `extracted_text` detay davranışı, indirme adresi, teknik ID/status gizleme ve null gönderen alanlarının hiç gösterilmemesi aynı.
- [x] Erişilebilirlik korundu: `label`/`for`, `aria-describedby`, `role="status"`, `aria-live="polite"`, sekmelerde `aria-current`, kayıtlarda `aria-expanded`, indirme bağlantısında ekran okuyucu metni, `h1 → h2 → h3` sırası.
- [x] Doğrulama: `npm run build` ve `npm run lint` temiz; `pytest` 133 passed; `git diff --check` temiz. Tarayıcıda boş ekran, dosya seçimi, yükleniyor, `classified`, `needs_review`, hata (502), kayıt listesi, detay aç/kapat, gerçek indirme (200 · `application/pdf` · orijinal dosya adı), boş liste ve 375 px dar ekran kontrol edildi; konsol hatası yok, dar ekranda yatay kaydırma yok (375 = 375). Uzun dosya adı, uzun özet ve uzun çıkarılan metin taşma yapmıyor. Gerçek Gemini çağrısı yapılmadı; sentetik kayıtlar silindi (`documents` 0, storage yalnız `.gitkeep`).

**V1.2 · Adım 3 devamı — Kayıtlar tablo düzeni (2026-09-18)**

- [x] Yalnızca `RecordsView` görünümü: kart listesi gerçek bir tabloya çevrildi. Sütunlar: Belge Adı · Gideceği Kurum · Durum · Tarih · Dosya. Backend, API, DB, prompt ve OCR'a dokunulmadı; yeni bağımlılık, router veya UI kütüphanesi eklenmedi.
- [x] Belge adı hücresindeki buton detayı açar (`aria-expanded`, açılış yönünü gösteren ok); indirme ayrı hücrede olduğu için tıklamalar çakışmıyor — doğrulandı, indirmeye tıklamak `aria-expanded` değerlerini değiştirmiyor.
- [x] Uzun dosya adları `table-layout: fixed` + ellipsis ile kısaltılıyor; tam ad DOM'da kaldığı için ekran okuyucuya eksiksiz geçiyor, fare için `title` var. Kurum boşsa "Belirlenemedi".
- [x] Durum etiketleri güncellendi: `classified` → "Sınıflandırıldı" (yeşil), `needs_review` → "İnceleme gerekli" (sarı), `failed` → "Başarısız" (kırmızı).
- [x] Detay, satırın altında tam genişlikte genişleyen ayrı bir satır. Özet, gönderen bilgisi, inceleme nedeni ve çıkarılan metin artık bu panelde toplandı (önceden özet/gönderen/inceleme nedeni satırda hep görünüyordu; tablo düzeninde sütun olmadığı için detaya taşındı).
- [x] Dar ekranda (≤ 45 rem) satırlar etiketli dikey bloklara dönüşüyor; masaüstünde tablo korunuyor.
- [x] Düzeltilen iki hata: uzun dosya adı `nowrap` ile tabloyu konteynerin dışına taşırıyordu (1242 px > 816 px, sayfada yatay kayma) — `table-layout: fixed` ve yüzdelik sütun genişlikleriyle giderildi; DOCX indirme rozeti PDF'ten geniş olduğu için dosya sütununu 3 px taşıyordu — sütun %9'dan %13'e çıkarıldı.
- [x] Doğrulama: `npm run build`, `npm run lint`, `pytest` 133 passed, `git diff --check` temiz. Tarayıcıda 5 kayıtla `classified`/`needs_review`/`failed`, uzun dosya adı, kurumu boş kayıt, detay aç/kapat, PDF ve DOCX indirme (200 · doğru media type) ve 375 px dar ekran kontrol edildi; konsol hatası yok, yatay kayma yok. Sınıflandırma görünümü ve erişilebilirlik özellikleri değişmedi. Gerçek Gemini çağrısı yapılmadı.

**V1.2 · Adım 4 — Gerçek hayat benchmarkı ve hybrid PDF P1 düzeltmesi (2026-09-18)**

- [x] 24 senaryoluk gerçek hayat benchmarkı (normal PDF/DOCX, temiz ve bozulmuş taramalar, döndürülmüş sayfalar, çok sayfalı tarama, hybrid PDF'ler, 50.000 karakter üstü belgeler, belirsizlik/katalog dışı senaryolar, tablo ve antetli DOCX, yardımcı alan senaryoları) gerçek endpoint ve gerçek Gemini ile çalıştırıldı. Beklentiler belgeler çalıştırılmadan önce manifest olarak sabitlendi. **İlk sonuç: 17/24.**
- [x] **Kanıtlanan P1 — hybrid PDF'te OCR hiç tetiklenmiyordu.** OCR kararı belge geneli için veriliyordu: kapak/evrak sayfasının 175 karakterlik metni eşiği geçtiği için taranmış asıl dilekçe hiç okunmadı. Sonuç `needs_review` bile olmadı; belge **emin şekilde yanlış** kuruma atandı (`other` / `yazi_isleri`). Çok sayfalı hybrid'de de aynı davranış görüldü.
- [x] Uygulanan minimum düzeltme (`app/services/file_service.py`): OCR kararı **sayfa düzeyine** indirildi. `_extract_pdf_text` sayfaları belge sırasıyla okur; `_page_text` sayfanın kendi normalize metni `MIN_TEXT_LENGTH` altındaysa `_ocr_page_text` ile yalnızca o sayfayı OCR'lar. Sabitler (`OCR_LANGUAGE = "tur"`, `OCR_DPI = 300`), `TESSDATA_PREFIX` davranışı, hata yolu ve `check_text_length` akışı değişmedi; yeni hata sınıfı, HTTP kodu, bağımlılık, servis veya preprocessing eklenmedi.
- [x] Testler (`test_file_service.py` 34 → 41): mevcut 5 OCR testi yeni sayfa-düzeyi API'ye uyarlandı; yeni testler tüm sayfaları metinli PDF'te hiç OCR çağrılmadığını, tek sayfalık image-only PDF'in V1.1 gibi OCR'landığını, hybrid PDF'te yalnızca görüntü sayfasının OCR'landığını ve belge sırasının korunduğunu, çok sayfalı hybrid'de yalnızca görüntü sayfalarının (doğru sayfa numaralarıyla) OCR'landığını, eşiğin sayfa başına 9/10 karakterde doğru çalıştığını ve sayfa OCR'ı hata verdiğinde belgenin kapak metniyle güvenle devam edip ham hatanın loglara sızmadığını doğruluyor. DOCX'in asla OCR kullanmadığı testi korundu.
- [x] Hedefli doğrulama (gerçek PostgreSQL + gerçek Gemini): normal text PDF ve temiz image-only PDF'te regresyon yok; **hybrid senaryo `other`/`yazi_isleri` → `complaint`/`temizlik_isleri`**, çok sayfalı hybrid aynı şekilde düzeldi (çıkarılan metin 175 → 426 ve 160 → 451 karakter, kapak + OCR'lanan dilekçe, sıra korunmuş); 12 sayfalık taramada süre 7,56 sn ile aynı kaldı.
- [x] Re-benchmark: **19/24** (17/24'ten). Kapsam içi tek kalan sapma 08 (speckle gürültüsü başlığı silince tür `complaint` yerine `request`; kurum doğru, `classified`). Bu adımın kapsamı dışında bırakılanlar: 09/10 döndürülmüş sayfalar, 14 bozuk 10+ karakterlik text layer, 16 ilk 50.000 karakter stratejisi.
- [x] 24 belgede toplam 24 gerçek Gemini isteği, **0 retry**, **0 `failed`**. Yardımcı alanlar (`summary`, `sender_*`) hiçbir belgeyi `failed` yapmadı.
- [x] Test verileri id listesiyle temizlendi (`TRUNCATE` kullanılmadı); benchmark belgeleri repo dışında tutuldu ve silindi.

**V1.2 · Adım 5 — Bozuk metin katmanı (P2) ve aynı sayfada gömülü metin + OCR (2026-09-18)**

- [x] **Kanıtlanan P2 kök neden.** `_page_text` OCR kararını yalnızca uzunluğa bakarak veriyordu: sayfanın normalize gömülü metni `MIN_TEXT_LENGTH`'i geçiyorsa OCR hiç çalışmıyordu. Benchmark senaryo 14 yeniden üretildi (tam sayfa okunabilir tarama + görünmez, kelime içermeyen 26–33 karakterlik bozuk katman): OCR çağrılan sayfa `[]`, çıkarılan metin 26 karakter çöp, `check_text_length` geçiyor ve belge bu çöple Gemini'ye gidiyordu. Aynı sayfa OCR'landığında 497–526 karakter gerçek dilekçe metni çıkıyor (0,6 sn).
- [x] **Eşikler ölçümle seçildi, kafadan değil.** 30 sayfalık korpus (normal text, image-only, P1 hybrid 2/çok sayfa, kısa dijital tarih/TCKN-VKN/sayı tablosu/madde numarası/sayfa numarası/kod, kısa antet, küçük imza görüntüsü, yarım sayfa fotoğraf, tam sayfa filigran, kenar boşluklu tarama, şerit şerit gömülü tarama, sağlıklı uzun/kısa katmanlı tarama, bozuk katmanın sembol ve harf aileleri, M1–M4) ölçüldü. Ayrım net: gerçek dijital sayfalarda görüntü kapsaması 0,00–0,25; taranmış sayfalarda 0,72–1,00. Sağlıklı tam sayfa tarama katmanı 526 karakter, tetiklenmesi gereken en uzun gömülü metin 87 karakter. Sweep'te kapsama %30–%72 × uzunluk 100–400 aralığının tamamı **sapmasız**; seçilen değerler bu aralıkların ortası: `OCR_COVERAGE_MIN = 0.5`, `OCR_SHORT_TEXT_MAX = 200`.
- [x] **İçerik temelli heuristikler ölçümle elendi.** 13 gerçek kısa metin + 8 bozuk katman ailesiyle test edildi: "%50 alfabetik karakter" kuralı 13 gerçek metnin **9'unu** bozuk sayıyordu (tarih, TCKN/VKN, sayı tablosu, madde numarası, kısa resmi form, imza satırı, EK kodu, sayfa numarası, evrak damgası). Kelime sayısı kuralı 3 yanlış pozitif verdi. Yapısal kural bu metinlere hiç bakmıyor: görüntüsü olmayan dijital sayfada kapsama 0,00 olduğu için içerik ne olursa olsun OCR tetiklenmiyor.
- [x] **Aynı sayfada gömülü metin + OCR.** Ölçümde belirleyici bulgu: `get_textpage_ocr(full=True)` sayfanın tamamını render ettiği için **görünür** dijital metin OCR çıktısında da yer alıyor (M1'de evrak bilgisi, M4'te müdürlük adı OCR metninde çıktı). Üç aday karşılaştırma yöntemi ölçüldü: `difflib` oran (M1/M3/M4'te 0,11–0,22 ile çöpten ayrışmıyor — **elendi**), `difflib` eşleşen blok oranı (gerçek 0,97–1,00 / sembol çöp 0,28 / harf çöpü 0,63) ve **token kapsanması** (gerçek metinlerin tamamı 1,00; sembol/kontrol/PUA çöpü hiç token üretmiyor; harf çöpü 0,00). Token kapsanması eşik ayarı gerektirmediği için seçildi.
- [x] Uygulanan minimum düzeltme (`app/services/file_service.py`, tek dosya): `_page_text` sırayla (1) metni 10 karakterin altındaki sayfayı eskisi gibi OCR'lar, (2) metni 200 karakterden uzun **veya** görüntü kapsaması %50'nin altındaki sayfayı değiştirmeden bırakır, (3) kalan sayfada OCR'ı çalıştırıp `_merge_page_text` ile birleştirir. Yeni `_image_coverage` (PyMuPDF `get_image_info`), `_merge_page_text` ve `_comparison_tokens` yardımcıları eklendi; `OCR_LANGUAGE`, `OCR_DPI`, `TESSDATA_PREFIX` davranışı, hata yolu, log güvenliği ve `check_text_length` akışı değişmedi. Yeni bağımlılık, servis, soyutlama katmanı, OCR motoru, rotation/OSD, preprocessing veya chunking eklenmedi; DOCX yolu ve 50.000 karakter stratejisi ile Gemini prompt/retry/timeout/katalogları ellenmedi.
- [x] Birleştirme kuralı: gömülü metnin kelime benzeri parçalarının **tamamı** OCR metninde varsa yalnızca OCR metni kullanılır (duplicate yok); en az biri yoksa iki metin de sayfa sırasıyla korunur (bilgi kaybı yok). Kelime benzeri parçası olmayan bozuk katman korunacak bilgi taşımadığı için kendiliğinden düşer — ayrı bir "çöp dedektörü" yazılmadı. Karşılaştırmada Türkçe harfler sadeleştirilir, böylece OCR'ın `İ→I`, `Ç→C` kayıpları aynı içeriği farklı göstermez.
- [x] Testler (`test_file_service.py` 41 → 62, toplam süit 133 → **161 passed**): senaryo 14, M1 (hem OCR'ın gördüğü hem görmediği durum), M2, M3, M4, kapsama eşiğinin alt/üstü (0,45 / 0,55), uzunluk eşiğinin alt/üstü (200 / 201, gerçek çıkarılan uzunluk doğrulanarak), filigran yanlış pozitifinde bilgi kaybı olmaması, görüntüsüz kısa dijital içerikler (tarih, TCKN/VKN, sayı tablosu, madde numarası, sayfa numarası, kod) için OCR'ın hiç çağrılmaması, harf görünümlü bozuk katmanın bilinen davranışı, sağlıklı uzun katmanlı taramanın yeniden OCR'lanmaması, yapısal OCR hatasında gömülü metne güvenli düşüş ve ham hatanın loglara sızmaması, çok sayfalı belgede sıra korunması. Mevcut 41 testin tamamı değişmeden geçti.
- [x] Gerçek Tesseract ile 30 sayfalık korpus doğrulaması: 25 senaryonun tamamında beklenen içerik nihai metinde mevcut, bozuk katman sızıntısı yok, M1/M3/M4'te tekrar yok (M3 başlığı tam 1 kez).
- [x] **Hedefli gerçek doğrulama** (gerçek endpoint + gerçek PostgreSQL + gerçek Gemini, 8 senaryo): A senaryo 14 → `complaint`/`temizlik_isleri`/`classified` (2,9 sn), B hybrid 2 sayfa → `complaint`/`temizlik_isleri` (2,2 sn), C çok sayfalı hybrid → `needs_review` (belge iki farklı konu taşıyor; beklenen), D M1 → evrak no + tarih + dilekçe konusu birlikte, tekrar yok (2,3 sn), E M3 → başlık 1 kez (1,9 sn), F normal text PDF → OCR çağrısı yok (1,5 sn), G image-only → V1.1 davranışı (2,2 sn), H filigran + kısa dijital metin → OCR tetiklendi (0,2 sn ek), gömülü bilgi korundu. 8 belgede 8 Gemini isteği, **0 retry**, 0 `failed`.
- [x] **Re-benchmark, 24 senaryo** (gerçek endpoint + gerçek Gemini): **kapsam içi 19/21, toplam 22/24.** Senaryo 14 düzeldi; P1 hybrid 12 ve 13'te regresyon yok. Kapsam dışı 3 bilinen sınır beklendiği gibi davrandı (09/10 döndürülmüş sayfalar ve 16 ilk 50.000 karakter → `needs_review`). Kalan 2 sapma: 04 gölgeli tarama ve 15 kötü fotokopi — ikisinde de metnin üçte ikisi bozulmadan kaybolduğu için tür `complaint` yerine `request`; **kurum doğru**, `classified`. Bu, daha önce de kayıtlı olan P3 sınıfıdır (bozulmuş taramada tür kayması). 24 belgede 24 istek, **0 retry**, 0 `failed`.
- [x] Senaryo 14 before → after (aynı belge, aynı Gemini yolu): **önce** 26 karakter çöp metin → `other` / kurum `None` / `needs_review` ("Belge metni anlamsız karakterlerden oluştuğu için sınıflandırma yapılamamaktadır"); **sonra** 497 karakter gerçek metin → `complaint` / `temizlik_isleri` / `classified`, özet belgenin gerçek konusunu anlatıyor.
- [x] Performans: tamamen metin tabanlı PDF'lerde ek maliyet yok — yapısal ölçüm yalnızca gömülü metni 10–200 karakter arasında olan sayfalarda yapılır, uzun metinli sayfa daha koşula girmeden döner. Yeni tetiklenen sayfada maliyet sayfa başına ~0,2 sn (dijital sayfa) – ~0,7 sn (tam sayfa tarama). 24 senaryoluk benchmarkta endpoint süreleri 0,9–2,9 sn.
- [x] Eski/yeni çıkarım farkı 24 belgenin **yalnızca 14 numaralısında** oluştu (26 → 497 karakter); diğer 23 belgede çıkarılan metin baytı baytına aynı kaldı.
- [x] Temizlik: bu adımda oluşturulan 32 kaydın tamamı id listesiyle silindi, storage dosyaları kaldırıldı; kullanıcının önceden var olan 2 kaydına (`22ab921f…`, `48d852a0…`) ve dosyalarına dokunulmadı. Benchmark belgeleri repo dışında üretildi ve temizlendi.

**V1.2 · Adım 6 — OCR çözünürlüğü 300 → 400 dpi (2026-09-21)**

- [x] Tek ürün değişikliği: `app/services/file_service.py` içinde `OCR_DPI = 300` → `400`. `OCR_LANGUAGE = "tur"`, `full=True`, `tessdata`, PyMuPDF `get_textpage_ocr` çağrı yolu, P1/P2 karar mantığı, birleştirme kuralı, hata yolu ve log güvenliği değişmedi. Yeni bağımlılık, OCR motoru, preprocessing veya PSM/OEM ayarı eklenmedi; Gemini, DB, frontend ve 50.000 karakter stratejisine dokunulmadı.
- [x] Gerekçe ölçümle sabitlendi (synthetic handwriting proxy + bozulmuş tarama + basılı belge korpusu, 12 senaryo): ortalama CER 0,292 → **0,237**, WER 0,449 → **0,400**, tamamen düşen satır 14 → **10**, kayıp kritik alan 10 → **4**, doğru okunan rakam 14/22 → **16/22**. Zor vakalarda kritik satırlar geri geldi (H06 düşen satır 4/6 → 1/6, kurum ipucu tekrar okunur oldu). Uçtan uca iki belge türü yanlıştan doğruya döndü: H04 `request` → `application`, H06 `request` → `information_request`.
- [x] 600 dpi de ölçüldü ve **geri adım** attığı için reddedildi: ortalama CER 0,315, düşen satır 16, form senaryosunda rakamların tamamı bozuldu (3/3 → 0/3). PSM/OEM ayarlanmadı: PyMuPDF'in OCR API'si bu parametreleri kabul etmiyor (imza `flags, language, dpi, full, tessdata`) ve ayrı Tesseract süreci D-042 kapsamı dışında; ayrıca `tur.traineddata` legacy bileşen içermediği için OEM 0/2 zaten desteklenmiyor, OEM 1 ile 3 aynı çıktıyı veriyor.
- [x] Testler (`test_file_service.py` 62 → 63, süit 161 → **162 passed**): mevcut `test_ocr_is_called_with_turkish_and_300_dpi` 400 dpi'ye güncellendi ve `OCR_DPI == 400` doğrulaması eklendi; yeni `test_ocr_dpi_is_the_same_on_hybrid_and_structural_pages` P1 hybrid ve P2 yapısal yolda OCR'ın yalnız gereken sayfada (`page.number` doğrulanarak) ve `("tur", 400)` ile çağrıldığını kontrol ediyor. Text-only PDF ve DOCX'in OCR çağırmadığı, OCR hatasında gömülü metne güvenli düşüldüğü ve ham hatanın loglanmadığı mevcut testler değişmeden geçti.
- [x] Gerçek regresyon (gerçek PostgreSQL + gerçek Gemini, 5 senaryo): normal text PDF, image-only matbu PDF, P1 hybrid ve P2 bozuk metin katmanı senaryolarında çıkarılan metin uzunluğu **dpi300 ile birebir aynı** (497 / 497 / 616 / 497) ve sonuçlar değişmedi (`complaint` / `temizlik_isleri` / `classified`). H08 mixed-content da 311 karakterde kaldı; `Evrak No: 2026/5521` bir kez geçiyor, duplicate ve bilgi kaybı yok. Tek fark **iyileşme yönünde**: el yazısı imza satırındaki tarih dpi300'de bozuk okunurken 400 dpi'de `19.09.2026` olarak doğru çıktı.
- [x] Performans: 5 belgede endpoint süreleri 1,7–2,2 sn. Ölçülen genel maliyet sayfa başına 0,47 → 0,70 sn; 12 sayfalık tarama 7,46 → 10,17 sn. 120 sn frontend zaman aşımı (D-039) için pay geniş kaldı.
- [x] 5 belgede 5 Gemini isteği, **0 retry**, 0 `failed`, 0 uyarı.
- [x] Temizlik: bu adımda oluşturulan 5 kayıt id listesiyle silindi, storage dosyaları kaldırıldı; kullanıcının önceden var olan 2 kaydına dokunulmadı.

**V1.2 · Adım 7 — JPG/JPEG/PNG desteği (2026-09-21)**

- [x] Kapsam PDF + DOCX'ten PDF, DOCX, JPG, JPEG ve PNG'ye genişletildi (D-001). Yeni OCR motoru, servis, soyutlama katmanı veya bağımlılık eklenmedi; mevcut PyMuPDF + yerleşik Tesseract hattı yeniden kullanıldı. GIF/TIFF/BMP/WebP/HEIC ve `.doc` hâlâ kapsam dışı.
- [x] Değişen ürün kodu iki dosya: `app/services/file_service.py` (`FILE_TYPES`, `MEDIA_TYPES`, yeni `IMAGE_SIGNATURES`, `detect_file_type`, `extract_text` dağıtımı ve yeni `_extract_image_text`) ve `app/api/documents.py` (yalnızca 415 mesaj metni). `save_file`, `delete_file`, download endpoint'i, `_page_text`, `_merge_page_text`, OCR sabitleri, hata sınıfları ve HTTP kodları değişmedi.
- [x] **Migration oluşturulmadı:** `documents.file_type` zaten `string`; şema değişikliği gerekmedi. `alembic current` = `cedf33674167 (head)`, `alembic check` "No new upgrade operations detected".
- [x] Doğrulama: uzantı **ve** dosya imzası birlikte kontrol edilir (JPEG `FF D8 FF`, PNG `89 50 4E 47 0D 0A 1A 0A`); istemcinin content-type'ına güvenilmez. `.png` uzantılı düz metin, `.jpg` uzantılı PNG baytı, `.png` uzantılı JPEG baytı ve `.gif`/`.bmp` reddediliyor (415). Bozuk/kesik görüntü kabul aşamasını geçerse mevcut `TextExtractionError` → `failed` + `422` yoluna düşüyor; yeni hata sınıfı veya HTTP kodu yok.
- [x] Görüntü çıkarımı: `pymupdf.open(stream=..., filetype=<jpg|jpeg|png>)` ile tek sayfalık belge açılıp mevcut `_ocr_page_text` çağrılıyor (`tur`, 400 dpi, `TESSDATA_PREFIX`). Gömülü metin aranmıyor; PDF'e özgü P1/P2 yapısal kararları (D-003) görüntülere uygulanmıyor.
- [x] `file_type` yüklenen uzantıyı koruyor (`jpg` / `jpeg` / `png`), storage `<uuid>.<uzantı>` olarak yazılıyor; kullanıcının dosya adı yalnızca `file_name` alanında kalıyor ve `file_reference` hiçbir API yanıtında dönmüyor. Download endpoint'i `jpg`/`jpeg` → `image/jpeg`, `png` → `image/png` döndürüyor, orijinal dosya adı korunuyor.
- [x] Frontend (yalnız metin ve liste): `ALLOWED_EXTENSIONS` ve `accept` değerine `.jpg`, `.jpeg`, `.png` eklendi; kullanıcı mesajları "PDF, DOCX, JPG, JPEG veya PNG" oldu. 50 MB ön kontrolü, 120 sn zaman aşımı, tasarım ve kayıtlar tablosu değişmedi. `FileTypeIcon` biçimden bağımsız olduğu için (genel belge simgesi + tür etiketi) değiştirilmedi.
- [x] Testler (162 → **202 passed**): `test_file_service.py` 44 → 63, `test_documents_api.py` 36 → 46. Kapsam: uzantı/imza eşleşmesi ve sahte dosyaların reddi, büyük harfli uzantılar, üç türde OCR'ın `tur` + 400 dpi ile çağrılması, görüntüde gömülü metin aranmadığının doğrulanması, kısa OCR sonucunda `failed` + 422, OCR hatasında güvenli düşüş ve log sızıntısı olmaması, `TESSDATA_PREFIX` yokken OCR denenmemesi, kesik görüntüde `TextExtractionError`, storage uzantısı, indirme media type'ı ve dosya adı, liste/detay yanıtlarında `file_reference` ve `extracted_text` gizliliği, 413 ve 415 davranışları. Mevcut PDF/DOCX testleri değişmeden geçti (yalnız 415 mesaj metni güncellendi).
- [x] Gerçek uçtan uca doğrulama (gerçek PostgreSQL + gerçek Gemini, 7 senaryo): temiz JPG dilekçe → `complaint`/`temizlik_isleri`, aynı belgenin `.jpeg` hâli → aynı sonuç, temiz PNG → `request`/`fen_isleri`, telefon fotoğrafı benzeri JPEG (gölge + perspektif + düşük kalite) → `complaint`/`temizlik_isleri`, el yazısı proxy PNG → `complaint`/`zabita`, tablo/form PNG → `objection`/`mali_hizmetler`. Hepsi `classified`, `needs_review = false`, özet ve gönderen adı doğru; 13 belgede 13 Gemini isteği, **0 retry**, 0 `failed`. Belge başına hâlâ tek sınıflandırma çağrısı yapılıyor. Süreler 1,6–2,2 sn.
- [x] **EXIF orientation:** PyMuPDF EXIF `Orientation` etiketini kendisi uyguluyor — 90° döndürülmüş ve `Orientation=6` etiketli JPEG'de sayfa 842×595'e dönüyor ve metin doğru okunuyor (450 karakter, `classified`). Aynı pikseller etiketsiz verildiğinde metin anlamsız çıkıyor (357 karakter çöp). Yani **etiketli** fotoğraflar doğru işleniyor; etiketsiz döndürülmüş görüntüler daha önce de kayıtlı olan rotation/OSD sınırına tabi. Bu adımda otomatik döndürme eklenmedi.
- [x] PDF/DOCX regresyonu (gerçek endpoint): normal text PDF (497), image-only matbu PDF (497), P1 hybrid (616), P2 bozuk metin katmanı (497), DOCX (231) ve DOCX tablo (129) — çıkarılan metin uzunlukları ve sınıflandırma sonuçları önceki turla birebir aynı.
- [x] Temizlik: bu adımda oluşturulan 13 kayıt id listesiyle silindi, storage dosyaları kaldırıldı; kullanıcının önceden var olan 2 kaydına dokunulmadı. Geçici görüntü ve script dosyaları repo dışında tutuldu.

**V1.2 · Adım 8 — Gönderen metadata uydurmasının kapatılması (P2, 2026-09-21)**

- [x] **Kanıtlanan sorun (B2+B3 benchmarkı, B2-12).** DOCX header/footer çıkarım kapsamında olmadığı için gerçek gönderen kurum `extracted_text`'e ulaşmıyor; model boşluğu gövdedeki imzadan **uydurarak** dolduruyordu: `sender_name="Serkan"`, `sender_institution="Beyaz Proje"`, `needs_review=false`. Bu, D-044'ün "açıkça yazmıyorsa null" kuralıyla çelişiyordu. Sorun kuralın eksikliği değil, modelin kişi adı/unvanından kurum türetmesiydi; mevcut promptta "tahmin etme", "çıkarım yapma", "isim üretme" ve "muhatap gönderen değildir" ifadeleri zaten vardı.
- [x] Sekiz odaklı vaka dondurulmuş beklentilerle ölçüldü (açık gönderen kurum, kurum yok + kişi/unvan, soyadı kurum gibi görünen ad, yalnız muhatap kurum, metinde konu olarak geçen üçüncü kurum, kurum + kişi, üç kurumlu belge, B2-12 regresyon metni). **Baseline: 7/8, 1 uydurma** — B2-12 metni `sender_institution="Proje Müdürü"` üretti (benchmarktaki "Beyaz Proje" ile aynı hata biçimi). Kök neden: normalize metinde imza satırı gövdeye yapışınca unvan bağımsız bir kurum gibi görünüyor.
- [x] Aday prompt varyantı ölçüldü: **8/8, 0 uydurma**. Ancak gerçek endpoint regresyonunda B2-04'te `sender_name` kayboldu; A/B ile izole edildi (eski prompt 2/2 doğru, aday 1/2). Regresyon, eklenen "tam adı açıkça yazmıyorsa null ver" ifadesinden geliyordu. Bu tek cümle çıkarılıp yalnız `sender_institution` sıkılaştırması bırakıldı (varyant C): **8/8, 0 uydurma** ve B2-04 3/3 kararlı.
- [x] Uygulanan değişiklik yalnız `classification_service.PROMPT_TEMPLATE` içindeki iki kural maddesi: `sender_name` için "kişinin adını parçalama ve yeni bir isim oluşturma"; `sender_institution` için "metinde kurum adı olarak açıkça ve doğrudan yazılıysa", "kişi adı/soyadı/unvan/görev adından kurum adı TÜRETME" (örnekle birlikte), "yalnızca konu olarak geçen üçüncü kurumlar da gönderen değildir" ve "tam adı metinde açıkça yoksa null". Şema, API, DB, frontend, katalog, retry/timeout ve ek çağrı yok; belge başına hâlâ tek Gemini çağrısı.
- [x] Testler (202 → **204 passed**): `test_classification_service.py` içine promptun (1) kurumun metinde açıkça yazılı olması, (2) kişi adı/unvanından kurum türetme yasağı, (3) açık kurum yoksa null, (4) kişi adını parçalamama/türetmeme kurallarını içerdiğini doğrulayan iki test eklendi. Yeni test altyapısı veya snapshot eklenmedi.
- [x] Gerçek regresyon (gerçek PostgreSQL + gerçek Gemini, 14 belge): sekiz S vakası + önceki benchmarktan kişi+kurum, kişi var kurum yok, kurum var kişi yok, ikisi de yok, birden fazla kişi ve muhatap kurum var/sender yok vakaları → **14/14 geçti, uydurma 0**. `document_type` ve `institution_id` sonuçlarında regresyon yok; 14 istek, **0 retry**, 0 `failed`.
- [x] Kapsam dışı bırakılanlar (bu adımda yapılmadı): DOCX header/footer çıkarımı, OCR/tablo düzeltmeleri, summary hallucination düzeltmesi, deterministik backend guard, yeni validator veya LLM çağrısı.
- [x] Temizlik: bu adımda oluşturulan 14 kayıt id listesiyle silindi, storage dosyaları kaldırıldı; kullanıcının önceden var olan 2 kaydına dokunulmadı.

**V1.2 · Adım 9 — Legacy DOC (Word 97-2003) desteği (2026-09-21)**

- [x] Kabul edilen türlere `.doc` (Word 97–2003 binary/OLE) eklendi; kapsam artık PDF, DOC, DOCX, JPG/JPEG, PNG (D-001). GIF, TIFF, BMP, WebP ve HEIC hâlâ kapsam dışı.
- [x] **Parser izole ortamda değerlendirildi, sonra üretime alındı.** Ayrı bir venv'de `legacy-doc 0.2.1` kuruldu (saf Python, **sıfır bağımlılık**, 11 KB wheel) ve `extract_text(bytes) -> DocExtractionResult` API'si doğrudan baytlarla çalıştığı doğrulandı. Word 97–2003 dosyalarında metin, Türkçe karakterler ve tablo hücreleri kayıpsız çıktı; düz metin, PDF, DOCX, PNG, JPEG, boş, kesik OLE ve bozuk gövde girdilerinin tamamı `LegacyDocError` ile reddedildi. Word, LibreOffice veya antiword gerekmiyor. Sürüm `requirements.txt`'ye pinlendi.
- [x] Doğrulama: OLE imzası (`D0 CF 11 E0 A1 B1 1A E1`) tek başına yetmiyor — XLS ve PPT de aynı imzayı taşıyor. Bu yüzden `_is_doc`, OLE dizinini okuyup Word'e özgü `WordDocument` stream'ini arıyor (`OleReader.has_stream`, ~1 ms, metin çıkarmadan). Sistemdeki gerçek XLS/PPT dosyalarıyla doğrulandı: `Required OLE stream 'WordDocument' not found`.
- [x] Değişen ürün kodu iki dosya: `app/services/file_service.py` (`FILE_TYPES`, `MEDIA_TYPES["doc"] = "application/msword"`, `_OLE_SIGNATURE`, `_DOC_OPTIONS`, `_is_doc`, `detect_file_type` ve `extract_text` dağıtımı, yeni `_extract_doc_text`) ve `app/api/documents.py` (yalnızca 415 mesaj metni). Yeni servis, soyutlama katmanı veya OCR yolu eklenmedi; DOC'ta OCR yapılmıyor ve Gemini çağrı mantığı değişmedi.
- [x] **Migration oluşturulmadı:** `documents.file_type` zaten `string`. `alembic current` = `cedf33674167 (head)`, `alembic check` temiz.
- [x] Testler (204 → **231 passed**): `tests/fixtures/` altına kişisel veri içermeyen 4 gerçek `.doc` fixture'ı eklendi (dilekçe, tablo/form, kısa, uzun; Word'ün gömdüğü yazar adı sentetik değerle değiştirildi). Kapsam: geçerli/büyük harfli `.doc` kabulü; düz metin, PDF, DOCX, görüntü, boş, yalnız-imza ve Word olmayan OLE için 415; Türkçe karakterler; tablo hücreleri; uzun belgede kesilme olmaması; <10 karakterde `failed` + 422; DOC'un OCR çağırmaması; `<uuid>.doc` storage; `application/msword` indirme; byte-for-byte dosya; liste/detayda `file_reference` gizliliği; 413; parser hatasının `TextExtractionError`'a dönüşmesi.
- [x] Frontend (yalnız metin ve liste): `ALLOWED_EXTENSIONS` ve `accept` değerine `.doc` eklendi, kullanıcı mesajları "PDF, DOC, DOCX, JPG, JPEG veya PNG" oldu. 50 MB ön kontrolü, zaman aşımı, tasarım ve kayıtlar görünümü değişmedi; `FileTypeIcon` biçimden bağımsız olduğu için DOC etiketi kendiliğinden görünüyor.
- [x] **Gerçek doğrulama** (gerçek PostgreSQL + gerçek Gemini): 3 gerçek `.doc` — dilekçe (`complaint`/`temizlik_isleri`, Ayşe Yıldırım), tablo/form (`objection`/`mali_hizmetler`; `2026/7421`, `21.09.2026`, `12.450,75 TL` dahil **9/9 kritik değer** metinde), kurum antetli üst yazı (`request`/`park_bahceler`, Nurdan Acar + YEŞİLKENT SİTESİ YÖNETİMİ). **DOC vs DOCX:** aynı içeriğin iki sürümü **birebir aynı `extracted_text`** (540 karakter) ve aynı sınıflandırmayı verdi — format yönlendirmeyi değiştirmiyor.
- [x] Format regresyonu (gerçek endpoint): text PDF, hybrid PDF, DOCX, JPG ve PNG hepsi `complaint`/`temizlik_isleri`/`classified`. Sender hallucination regresyonu ("Serkan Beyaz / Proje Müdürü", açık kurum yok) → `sender_institution = null`. Belge başına tek Gemini çağrısı; 0 retry, 0 `failed`.
- [x] Bilinen sınır: bir koşuda model `sender_institution` değerini `Yeşkent Sitesi Yönetimi` olarak döndürdü (doğrusu `YEŞİLKENT SİTESİ YÖNETİMİ`). Çıkarılan metinde ad doğru yazıyordu ve aynı metinle 3/3 tekrarda doğru sonuç geldi; DOC çıkarımıyla ilgisi olmayan, modele ait tek seferlik yazım sapması.
- [x] Temizlik: bu adımda oluşturulan 20 kayıt id listesiyle silindi, storage dosyaları kaldırıldı; kullanıcının önceden var olan 3 kaydına dokunulmadı.

**V1.4 · Adım 0 — Kararlar ve dokümantasyon (2026-09-23)**

- [x] Plan onaylandı: hazırla → önizle → sınıflandır akışı. Mevcut `documents` tablosuna yeni bir `prepared` durumu eklenir; migration, yeni tablo, yeni şema, scheduler ve worker yok.
- [x] `DECISIONS.md`:
  - **D-045 (yeni):** Akış; aynı dosyada extraction/OCR yalnız bir kez; V1.4 frontend'inde Gemini yalnız kullanıcı önizlemesi ve onayından sonra çağrılır; legacy `POST /api/documents/classify` tek-adımlı davranışıyla geriye dönük uyumluluk için korunur ve yeni frontend onu kullanmaz; tarayıcıdaki dosyadan belge görünümü; DOC/DOCX'te yalnız metin; en fazla 5 dosya; sıralı işleme.
  - **D-046 (yeni):** `prepared` yaşam döngüsü:
    - Classify yalnız `prepared` kayıtta ve orijinal dosya storage'da mevcutken çalışır; aksi halde `409`, Gemini çağrılmaz.
    - `409` sonrası istemci, sonucu mevcut detay endpoint'inden okuyarak kurtarır.
    - "Kaldır" için `DELETE /api/documents/{id}/prepared` kullanılır: önce dosya, sonra kayıt silinir; kalıcı kayıtlarda `409`.
    - TTL yedek temizliği: 24 saatten eski sahipsiz `prepared` kayıtlar sonraki prepare çağrısında temizlenir; zamanlayıcı yok.
  - **Güncellenen:**
    - D-016: `prepared` durumu eklendi.
    - D-019: yazma endpoint'leri; kalıcı kayıtlar için güncelleme ve silme hâlâ yok.
    - D-020: istek başına senkron işleme; istemcide sıralı.
    - D-034: kod kapsamı.
    - D-039: istek başına 120 sn.
    - D-040: çoklu seçim, sürükle-bırak, 5 dosya.
    - D-043: liste `prepared` kayıtları içermez.
- [x] `PROJECT_BRAIN.md`:
  - §2 iki adımlı akış anlatıldı.
  - §4 endpoint ve frontend açıklamaları güncellendi.
  - §8 `prepared` durumu eklendi.
  - §9'da legacy / tek-adımlı `POST /classify` ile V1.4 endpoint tablosu ayrıldı.
  - §11 kapsama çoklu yükleme ve önizleme eklendi.
  - §12'de kalıcı kayıtlar için güncelleme/silme hâlâ kapsam dışı; klasör/ZIP yükleme, 5'ten fazla dosya, worker/WebSocket, Word render'ı, annotation, sıralama ve bulut depolama kapsam dışı listesine eklendi.
- [x] `README.md`:
  - Durum satırı iki bağımsız iş hattını gösteriyor.
  - Sürüm geçmişi ve yol haritasında V1.3 "açık", V1.4 "aktif geliştirme" olarak yer alıyor.
  - API tablosunda `/classify` legacy / tek-adımlı sınıflandırma olarak işaretlendi.
  - V1.4 endpoint'leri uygulandıkça API tablosuna eklenecek.
- [x] Kod, test, migration ve frontend değişmedi.

**V1.4 · Adım 1–6 — Backend (2026-09-23)**

- [x] **Refactor** (`app/api/documents.py`, davranış değişmedi): `_process_document` → `_extract_into` + `_classify_into`. Legacy `/classify` ile `/prepare` ortak `_create_document` yolunu kullanır. Refactor sonrasında mevcut 231 test değişmeden geçti.
- [x] **Endpoint'ler** (D-045, D-046):
  - `POST /api/documents/prepare` — kabul, storage, metin çıkarımı; kayıt `prepared` olur, yanıt `DocumentDetail` (yeni şema yok). Gemini çağrılmaz.
  - `POST /api/documents/{id}/classify` — kayıttaki metinle tek Gemini çağrısı yapar, dosyayı yeniden okumaz.
    - `prepared` değilse `409`.
    - Orijinal dosya storage'da yoksa ya da yol storage dışına çıkıyorsa `409`; Gemini ve extraction çağrılmaz.
    - Commit hatasında kayıt `prepared` kalır, dosya silinmez.
  - `DELETE /api/documents/{id}/prepared` — önce dosya, sonra kayıt silinir (`204`). Kalıcı kayıtlarda `409`. Dosya zaten yoksa da güvenli. Yol storage dışına çıkıyorsa dışarıdaki dosyaya dokunulmaz, yalnız kayıt silinir.
- [x] **Liste ve yardımcılar:**
  - `GET /api/documents` artık `prepared` kayıtları döndürmüyor.
  - Download'daki yol kontrolü `_stored_file_path` yardımcısına çıkarıldı; download ve classify birlikte kullanıyor.
- [x] **TTL yedek temizliği** (`_delete_expired_prepared`): Her prepare isteğinin başında 24 saatten eski `prepared` kayıtları dosyalarıyla siler.
  - Dosyası silinemeyen kayıt atlanır.
  - Temizlik hatası prepare'i düşürmez.
  - Başka hiçbir çağrı temizlik tetiklemez.
- [x] Migration, model, servis, şema ve bağımlılık değişmedi.
- [x] **Testler** (`tests/test_documents_api.py`, 44 yeni; her grup önce kırmızı, sonra yeşil):
  - Prepare: 14.
  - Classify-by-id: 11. Kaynak dosya kuralı ve "extraction tekrar çalışmadı" spy'ı dahil.
  - Discard: 13. OpenAPI kontrolü dahil.
  - Liste/TTL: 6. "Zamanlayıcı yok" testi dahil.
- [x] **Doğrulama:** `pytest` **275 passed**; `pip check` temiz. `/openapi.json` üç yeni endpoint'i beklenen kodlarla gösteriyor; prepare'de 502 yok.
- [x] **Çalıştırılamayanlar:** `alembic check` bu oturumda çalıştırılamadı (Docker Desktop kapalı, `backend/.env` yok). `models/` ve `alembic/` dosyaları değişmedi.

**V1.4 · Adım 7–9 — Frontend (2026-09-23)**

- [x] **Tipler** (`src/App.tsx`): `DocumentStatus` değişmedi. Yeni tipler: `PreparedDocument` (`status: 'prepared'`), yalnız arayüzde kullanılan `BatchState` / `BatchItem`, `isPreparedBody` guard'ı.
- [x] **Liste ve ekleme:**
  - Çoklu seçim (`multiple`) ve sürükle-bırak alanı.
  - Pencere düzeyinde `drop` engeli: alan dışına bırakılan dosya sayfayı terk ettirmez.
  - En fazla 5 dosya; uzantı/boyut ön kontrolü; tekrar eden dosya reddi (ad + boyut + `lastModified`).
- [x] **Sıralı çalıştırıcı:** Tek ref kilidiyle çalışır, aynı anda backend'e yalnız bir prepare veya classify isteği gider. Her istek kendi 120 sn zaman aşımını uygular.
- [x] **Önizleme:**
  - PDF/JPG/JPEG/PNG'de "Belge Görünümü" (tarayıcıdaki dosyadan object URL; MIME türü sunucunun doğruladığı `file_type`'tan) ve "Çıkarılan Metin".
  - DOC/DOCX'te yalnız metin.
  - PDF görüntüleyicisi olmayan tarayıcıda (`navigator.pdfViewerEnabled === false`) kısa bir yedek mesaj gösterilir.
  - Object URL panel kapanınca veya satır kaldırılınca serbest bırakılır.
- [x] **Kaldır:** `ready`/`waiting` satırda `DELETE …/prepared` çağrılır. `204`/`404` → satır çıkar ve slot hemen boşalır. `409` → satır çıkar ve bilgi notu gösterilir. Hata → satır kalır, genel mesaj gösterilir. Sıradaki ve terminal satırlar yalnız arayüzden çıkar. `preparing`/`analyzing` satırda Kaldır pasif. "Tamamlananları Temizle" yalnız terminal satırları arayüzden çıkarır.
- [x] **Analiz:** Seçili satırlar sırayla sınıflandırılır; sonuç satır panelinde `ResultCard` ile gösterilir.
  - `409` → `GET /api/documents/{id}` ile kurtarma yapılır. Gerçek sonuç gösterilir; `prepared` dönerse satır tekrar denenebilir kalır.
  - `404`/`502` terminaldir.
  - `500`/ağ hatası/zaman aşımında satır tekrar denenebilir kalır.
- [x] **CSS** (`src/App.css`): Eski form kuralları `.uploader` / `button.primary` olarak taşındı. Toplu tablo, satır rozetleri, önizleme ve mobil düzen eklendi.
- [x] `npm run build` ve `npm run lint` temiz.
- [x] **Tarayıcı doğrulaması** (gstack headless Chromium; SQLite + scratchpad storage + sahte sınıflandırıcı; repoya dosya yazılmadı, gerçek Gemini çağrısı yok):
  - Sıralı prepare: 5 dosyada 200/422/200/200/415 döndü, prepare aşamasında Gemini çağrısı olmadı.
  - Önizleme: PDF metni, DOC yalnız metin, PNG görüntüsü; PDF yedek mesajı çalıştı.
  - Kaldır ve 5 dosya sınırı: terminal satırda DELETE gitmedi; hazır satırda `204` döndü, storage dosyası silindi ve slot yeniden kullanılabildi. 6. dosya, `.txt` ve tekrar eden dosya uyarıyla reddedildi.
  - Analiz turu: 3 seçili dosyada tam 3 sınıflandırma çağrısı yapıldı (200 / 200 needs_review / 502). Seçimden çıkarılan dosya analiz edilmedi. Analiz sırasında sekme değiştirmek listeyi korudu.
  - Kayıtlar: liste yalnız kalıcı kayıtları gösterdi.
  - 409 kurtarma: aynı belge curl ile sınıflandırıldıktan sonra arayüzde 409 → GET → "Tamamlandı" oldu; toplam 1 sınıflandırma çağrısı yapıldı.
  - Kaynak dosya silindiğinde: 409 → çakışma mesajı, Gemini çağrısı yok → Kaldır `204` döndü.
  - `fetch` taklidiyle doğrulanan dallar: 409 + failed/404/ağ hatası, classify ağ hatası, discard 500/409.
  - TTL: liste, detay ve download 25 saatlik kayıtları silmedi; prepare sildi. DB ↔ storage birebir eşleşti.
  - 375 px'te yatay kaydırma yok. Konsolda yalnız beklenen 422 yanıtlarının tarayıcı ağ logu var.
- [x] **Doğrulamada bulunup düzeltilen iki görünüm hatası:**
  - Toplu tabloda dosya adları gereksiz kısalıyordu. Sütun genişlikleri daraltıldı, ad artık alt satıra geçiyor.
  - Mobilde dosya adı ile hata mesajı yan yana dizilip ad harf harf kırılıyordu. İkisi tek bir sarmalayıcıya alındı.

**V1.4 · İçerik merkezli önizleme (2026-09-23)**

- [x] Ürün kararı: Önizleme içerik merkezlidir; varsayılan görünüm yapılandırılmış "Belge Önizlemesi" formudur. Orijinal belge ve çıkarılan metin yardımcı görünümlerdir. Önizleme aşamasında Gemini kullanılmaz. D-045'teki önizleme maddesi yerinde güncellendi; yeni karar açılmadı.
- [x] Backend, endpoint sözleşmeleri, DB, migration, prompt ve bağımlılıklar değişmedi.
- [x] **Yeni saf yardımcı** `frontend/src/documentPreview.ts` — `buildDocumentPreview(extractedText, fileName)`. Deterministik çalışır. Açıkça bulunamayan alan `null` kalır (arayüzde `—`); tahmin yapılmaz.
  - **Neden etiket temelli:** Backend metni tek satıra normalize ettiği için (satır sonu yok) değerler etiketten sonra okunur. Değer sonraki etikette, cümle sonunda veya satır sonu izinde (küçük harfle biten kelimeden sonra büyük harfle başlayan kelime) kesilir.
  - **Etiket eşleşmesi:** Türkçe küçük harfe çevrilip aksanları sadeleştirilmiş metinde yapılır. Böylece OCR'ın `TARIH`, `KONU`, `MUDURLUGUNE` gibi yazımları da eşleşir.
  - **Hitap / Başlık:** Metnin ilk 300 karakterinde, büyük harfli ve yönelme ekiyle biten (`…NA`/`…NE`/`…YA`/`…YE`) 2–8 kelimelik ifade. Örnek: "ÇANKAYA BELEDİYE BAŞKANLIĞINA".
  - **Konu:** `Talep Konusu:`, `Başvuru Konusu:`, `Konusu:` veya `Konu:`; iki nokta zorunlu. Açık etiketin değeri mümkün olduğunca tam alınır; "hakkında"/"hk." bitiş sayılmaz.
    - Değer sonraki gerçek etikette (`Tarih:` gibi), "Sayın" hitabında, `!`/`?` ile biten kelimede veya satır sonu izinde (küçük harfle ya da noktayla biten kelimeden sonra büyük harfle başlayan kelime) biter.
    - En fazla 30 kelime.
  - **Tarih:** Önce `Tarih` etiketinin hemen ardındaki GG.AA.YYYY / GG/AA/YYYY / GG-AA-YYYY. Etiket yoksa metinde yalnız tek bir farklı tarih geçiyorsa o kullanılır. Birden fazla farklı tarih varsa boş kalır.
  - **Evrak No:** `Evrak No`, `Evrak Numarası`, `Belge No`, `Sayı` etiketinin ardındaki, rakam içeren tek değer. İki nokta yoksa etiketin büyük harfle başlaması gerekir. Etiket yoksa tahmin yapılmaz.
  - **Gönderen:** Yalnız açık `Ad Soyad`, `Adı Soyadı`, `Gönderen`, `Başvuran` etiketinden sonraki 2–3 kelimelik ad. Adres, telefon ve etiket kelimelerinde durur. Etiket yoksa `null` kalır; imza satırındaki etiketsiz ad tahmin edilmez (kişi adı nihai Gemini sonucundaki `sender_name` ile gelir).
  - **Gönderen Kurum:** Yalnız `Gönderen Kurum:`, `Kurum Adı:`, `Kurum:`, `Kuruluş:`, `Firma:` etiketleriyle. "Muhatap/Alıcı Kurum" etiketleri ve hitap gibi biten (`…Başkanlığına`) ya da hitapla aynı olan değerler reddedilir.
  - **Belge İçeriği:** Hitaptan sonraki metnin ilk ~900 karakteri, kelime sınırında kesilir.
- [x] **Arayüz** (`src/App.tsx`, `src/App.css`):
  - "Önizle" artık satırın altında "Belge Önizlemesi" kartını açar: Dosya, Hitap / Başlık, Konu, Tarih + Evrak No, Gönderen + Gönderen Kurum, Belge İçeriği. Masaüstünde iki kolon, dar ekranda tek kolon.
  - "Orijinal Belgeyi Gör" (PDF/JPG/JPEG/PNG), yerel `<dialog>` penceresi açar: odak pencerede kalır, Esc/Kapat/arka plan tıklamasıyla kapanır, en fazla 85vh. Object URL yalnız pencere açıkken yaşar. PDF görüntüleyicisi yoksa yedek mesaj gösterilir.
  - "Çıkarılan Metni Gör" ham metni aç/kapa bölümde gösterir.
  - Kartta satır checkbox'ına bağlı "Analize dahil et" seçeneği var.
  - Tamamlanan satırda form ve altında mevcut sonuç kartı görünür; formda sınıflandırma bilgisi yoktur.
  - Büyük inline PDF/görüntü görünümü kaldırıldı.
- [x] **Doğrulama:** `npm run build` ve `npm run lint` temiz. Yardımcı 10 örnek metinle (Node, scratchpad) sınandı: gerçek DOC fixture'ları, sentetik dilekçeler, muhatap kurum, iki tarihli ve boş metin; uydurma değer yok.
- [x] **Kalıcı birim testleri:** `frontend/tests/documentPreview.test.ts` eklendi (9 grup, 33 test; Adım 10 konu regresyonunun 3 testi dahil). Node'un yerleşik `node:test` çalıştırıcısı kullanılır, yeni bağımlılık yoktur; komut `npm test`.
  - Kapsam: açık `Konu:`, `Talep/Başvuru Konusu:`; OCR yazımları (`KONU`, `TARİH`/`TARIH`, `EVRAK NO`, `MUDURLUGUNE`); `Tarih:` önceliği, etiketsiz tek tarih, birden fazla tarihte `null`; açık Evrak No / Sayı; açık Ad Soyad / Adı Soyadı / Gönderen / Başvuran; imza satırındaki etiketsiz adın tahmin edilmemesi; Gönderen Kurum / Firma; muhatap belediyenin gönderen kurum sayılmaması; eksik alanların `null` olması; düzyazıdan alan uydurulmaması; satır sonlu ve tek satır metnin aynı sonucu vermesi; gerçek DOC fixture metni.
  - Test-first: önce yazılan testlerde, imza yedeği nedeniyle 2 test kırmızıydı. Yedek kaldırıldı ve 30/30 yeşil.
- [x] **Gönderen imza yedeği kaldırıldı:** Önizleme aşamasında kişi adı tahmini yapılmaz. Örneğin DOC fixture'ında imza satırındaki ad artık `—` gösterilir.
- [x] **Tarayıcı doğrulaması** (gstack headless Chromium; SQLite + sahte sınıflandırıcı; bu makinede Tesseract olmadığı için JPG OCR'ı sahte metinle taklit edildi):
  - PDF, JPG, DOC, eksik alanlı PDF ve metni çıkarılamayan PDF senaryoları.
  - Orijinal belge penceresi; satırlar arası geçişte veri karışmaması.
  - 5 dosya sınırı ve Kaldır (`DELETE …/prepared` `204`).
  - Önizleme sırasında Gemini çağrısı yok; yalnız seçili 3 dosya sırayla sınıflandırıldı.
  - 375 px'te yatay taşma yok; pencere ekrana sığıyor.

**V1.4 · Adım 10 — Gerçek ortam uçtan uca doğrulaması (2026-09-23)**

- [x] **Ortam:**
  - Docker PostgreSQL 18 healthy; `pip check` temiz; `alembic current` = `cedf33674167 (head)`; `alembic check` temiz; `GET /health` → 200.
  - `backend/.env` içinde `GEMINI_API_KEY`, `GEMINI_MODEL`, `DATABASE_URL` ve `TESSDATA_PREFIX` dolu (değerler yazdırılmadı); `tur.traineddata` erişilebilir.
- [x] **Yöntem:**
  - Gerçek backend, yalnız sayım için `extract_text`, sayfa OCR'ı ve Gemini isteğini log satırıyla saran bir scratchpad başlatıcısıyla çalıştırıldı; davranış ve repo değişmedi.
  - Arayüz gstack headless Chromium ile, Vite proxy üzerinden sürüldü.
  - Kullanıcının mevcut 4 kaydı (3 `prepared`, 1 `failed`) ve 4 storage dosyası baseline olarak kaydedildi ve dokunulmadı.
- [x] **5 gerçek dosya:**
  - Belgeler: metin PDF, metin katmanı olmayan taranmış PDF (200 dpi görüntü), DOCX, gerçek Word 97–2003 DOC fixture'ı ve JPG.
  - Prepare: 5/5 `200`, istekler sırayla gitti. Çıkarılan metin uzunlukları 468 / 314 / 345 / 540 / 293.
  - OCR yalnız taranmış PDF'te ve JPG'de, birer kez çalıştı; Türkçe karakterler kayıpsız okundu.
  - Prepare aşamasında Gemini isteği **0**. `prepared` kayıtlar Kayıtlar listesinde görünmedi.
- [x] **Önizleme** (gerçek OCR metniyle):
  - Hitap, konu, tarih ve gönderen alanları 5 belgede de belgede yazanla aynı. Evrak No yalnız DOCX'te (`2026/4410`). Gönderen Kurum her belgede `—`.
  - DOC'ta etiketsiz imza adı `—` gösterildi.
  - DOC/DOCX'te "Orijinal Belgeyi Gör" yok.
  - JPG'de orijinal görüntü penceresi açıldı; PDF'te headless tarayıcı nedeniyle yedek mesaj çıktı. "Çıkarılan Metni Gör" çalıştı.
- [x] **Sınıflandırma** (gerçek Gemini):
  - Seçimden çıkarılan belge analiz edilmedi. Seçili 4 belge sırayla işlendi; her Gemini isteği bir önceki belge kaydedildikten sonra başladı.
  - Belge başına 1 istek; toplam **5 Gemini isteği, 0 retry**. Classify sırasında extract/OCR **0**.
  - Sonuçlar:
    - metin PDF → Şikayet / Temizlik İşleri
    - taranmış PDF → Talep Dilekçesi / Park ve Bahçeler
    - DOCX → Bilgi Edinme / Mali Hizmetler
    - JPG → Şikayet / Zabıta
    - DOC → Şikayet / Temizlik İşleri
  - Hepsi `classified` oldu ve DB'ye yazıldı; indirmelerin tamamı bayt bayt orijinalle aynı ve media type doğru.
- [x] **Yaşam döngüsü:**
  - 6. dosya reddedildi.
  - Kaldır → `204`; kayıt `404` veriyor, storage dosyası silinmiş; slot hemen yeniden kullanıldı.
  - 409 kurtarma: curl ile sınıflandırılan belge arayüzde `409` → `GET` detay → sonuç gösterildi; ek Gemini isteği yok.
  - Kaynak dosya eksik: `409`, Gemini/extract/OCR 0, kayıt `prepared` kaldı, logda storage yolu yok; Kaldır → `204`.
  - TTL: yalnız test kaydı 25 saat geri alındı. Liste, detay, download ve terminal kayda classify/discard (`409`) çağrıları kaydı silmedi; bir sonraki prepare sildi. Terminal kayıtlar ve kullanıcı kayıtları korundu.
- [x] **Log güvenliği:** Belge metni, API anahtarı ve storage yolu logda yok; hata satırı yok.
- [x] **Temizlik:**
  - Yalnız testte oluşturulan kayıtlar açık ID listesiyle silindi: 5 `classified` ve 1 `prepared` (discard endpoint'iyle). Diğer 3 test kaydı test sırasında discard ve TTL ile zaten silinmişti.
  - `TRUNCATE` veya toplu silme kullanılmadı.
  - Sonuç: kullanıcı kayıtları 4/4 ve dosyaları 4/4 yerinde; test kaydı ve kaydı olmayan test dosyası yok.
- [x] **Bulgu → düzeltildi:** DOCX'te konu "Emlak vergisi borcu hakkında bilgi talebi" iken önizlemede "Emlak vergisi borcu hakkında" olarak kısalıyordu. Neden: konu okuması "hakkında" kelimesinde duruyordu.
  - Test-first düzeltme: 3 regresyon testi önce kırmızıydı. "hakkında" ve "hk." bitiş sinyali olmaktan çıkarıldı; değer sonraki gerçek etikette ya da satır sonu izinde kesiliyor.
  - Sonuç: 33/33 yeşil. Adım 10'un gerçek metinleriyle konular tam okunuyor (DOCX: "Emlak vergisi borcu hakkında bilgi talebi"; taranmış PDF ve JPG değişmedi).
  - Sınıflandırma bu hatadan etkilenmemişti.
- [x] **PDF görüntüleyici:** Headless Chromium'da `pdfViewerEnabled = false` olduğu ve gstack'in görünür (headed) modu bu Windows ortamında başlatılamadığı için otomatik doğrulanamadı.
  - Kullanıcı gerçek masaüstü tarayıcısında elle doğruladı (2026-09-24): Belge Önizlemesi formu açılıyor; "Orijinal Belgeyi Gör" gerçek PDF'i düzgün boyutlu ve kaydırılabilir bir pencerede gösteriyor; pencere Kapat, Esc ve dışarı tıklamayla kapanıyor; "Çıkarılan Metni Gör" çalışıyor.
- [x] **Son kontroller:** `npm test` 33 passed (konu düzeltmesi sonrası); `npm run build` ve `npm run lint` temiz; `pytest` 275 passed; `pip check` temiz; `alembic current` head; `alembic check` temiz; `git diff --check` temiz.

## Üzerinde çalışılan işler

**V1.4 — Çoklu Belge Yükleme ve Önizleme**

- Adım 0–10 tamamlandı: dokümantasyon, backend, frontend ve gerçek ortamda uçtan uca doğrulama. Gerçek tarayıcıda PDF kontrolü elle yapıldı.
- Değişiklikler tek commit olarak `main`'e alındı. Açık V1.4 işi yok.

**V1.3 — El Yazısı ve Gelişmiş OCR Güvenilirliği (açık, başlamadı)**

- Planlanan kapsam `README.md`'deki başlıklardır: el yazısı benchmarkı, OCR quality gate, taranmış tablo ve form dayanıklılığı, düşük kaliteli çıkarımda `needs_review`, OCR kaynaklı özet ve gönderen güvenilirliği.
- Henüz iş olarak açılmadı. V1.4 bu başlıklara dokunmaz.

**Diğer**

- Benchmarkta açık kalan P3 başlıkları (döndürülmüş sayfalar, ilk 50.000 karakter stratejisi, bozulmuş taramada tür kayması) henüz iş olarak açılmadı.

## Bilinen problemler ve riskler

- V1 için bilinen bir blocker yok. Aşağıdakiler kabul edilmiş riskler ve dikkat edilmesi gereken noktalardır.
- Bu makinede host 5432'yi yerel bir Windows PostgreSQL 18 servisi (`postgresql-x64-18`) kullanıyor. Docker PostgreSQL bu yüzden 5433'te; `DATABASE_URL`'deki port 5433 olmalı, aksi halde yanlış veritabanına bağlanılabilir.
- `DATABASE_URL`'de `localhost` kullanılmamalı: port yalnızca IPv4 `127.0.0.1`'e açık ve `localhost` önce `::1` olarak denendiğinde bağlantı asılı kalıyor (Aşama 2'de `alembic current` bu yüzden takıldı). `127.0.0.1` kullanılıyor.
- PostgreSQL 18 image'ında volume `/var/lib/postgresql` yoluna bağlanır. Eski sürümlerdeki `/var/lib/postgresql/data` yolu kullanılmamalı.
- `docker-compose.yml` sabit `container_name: dosya-sistemi-postgres`, sabit host portu `127.0.0.1:5433`, sabit `dosya_sistemi_pgdata` volume'u ve klasör adından gelen aynı compose proje kimliğini kullanır. Bu yüzden **aynı makinede** aynı projenin ikinci bir klonu, ana proje PostgreSQL'i çalışırken kendi compose stack'ini yan yana başlatamaz (container/port/volume çakışması); başlatılabilseydi de aynı volume'u, yani aynı veritabanını paylaşırdı. Normal fresh-clone kullanımı için blocker değildir: temiz bir makinede tek klon `docker compose up -d` ile çalışır ve clean-clone testinde klonun `docker compose config` çıktısı geçerli doğrulandı. Clean-clone smoke testinde bu nedenle mevcut container korunup ayrı bir `dosya_sistemi_cleantest` veritabanı kullanıldı. Yalnızca yerel geliştirme/test sınırıdır; `docker-compose.yml` değiştirilmedi.
- Backend ve migration komutları için Docker Desktop çalışıyor ve `docker compose up -d` yapılmış olmalı; kapalıyken yapılan classify isteği aşağıda anlatıldığı gibi yaklaşık 10 sn sonra `500` ile biter.
- `main.py` artık documents router'ını import ettiği için `DATABASE_URL`, `GEMINI_API_KEY` ve `GEMINI_MODEL` uygulama başlangıcında zorunludur; biri eksikse uygulama (ve `/health`) başlamaz (D-031, D-035).
- `status` ve `file_type` değerleri veritabanında CHECK/ENUM ile kısıtlanmadı (PROJECT_BRAIN §8: string). Geçerli değerleri uygulama katmanı belirliyor: `file_type` yalnızca `file_service.FILE_TYPES` değerlerinden, `status` yalnızca endpoint kodunda atanıyor.
- Retry/timeout davranışı google-genai 2.23.0 kaynak koduna göre doğrulandı. SDK sürümü yükseltilirse `tests/test_classification_service.py` içindeki gerçek SDK + MockTransport testleri mutlaka çalıştırılmalı.
- `temperature=0` kullanılıyor; V1 ve V1.1 manuel testlerinde (11/11 ve 15/15) sınıflandırma kalitesi beklendiği gibi çıktı.
- Log yapılandırması `main.py`'de tek satır `basicConfig(INFO)`; httpx istek satırları (URL, anahtar yok) da INFO'da görünür. Başarısız Gemini denemelerinin uyarı logunda yalnızca deneme numarası, hata türü, HTTP kodu ve şema hata türü bulunur; ham API yanıtı, model çıktısı ve belge metni loglanmaz. Metin çıkarımı hatalarında PDF/DOCX kütüphanesinin hata mesajı loglanır (belge metni değil). SQL hatalarında parametreler gizlidir.
- Kataloglar modül yüklenirken okunur; katalog değişikliği için uygulama yeniden başlatılmalı. `other` belge türü katalogdan çıkarılırsa servis yapılandırma hatasıyla yüklenmez.
- Storage konumu için ortam değişkeni yok. `file_service`, D-017'ye göre `backend/storage/` yolunu kod içinde kullanır (çalışma dizininden bağımsız).
- DOCX metin çıkarımı V1'de header/footer, textbox, iç içe tablolar ve gömülü nesneleri kapsamaz; bu alanlardaki metin alınmaz. DOCX'te OCR da yapılmaz.
- DOC (Word 97–2003) çıkarımı gövde paragraflarını ve tablo hücrelerini kapsar; gömülü görüntülerdeki metin, makrolar, header/footer ve biçimlendirme alınmaz. DOC'ta OCR yapılmaz; şifreli veya bozuk `.doc` dosyaları `failed` olur.
- Benchmarkta açık kalan noktalar: 90°/180° döndürülmüş taramalarda OCR anlamsız metin üretiyor ve belge `needs_review`'a düşüyor (otomatik döndürme/OSD kullanılmıyor); belirleyici içerik ilk 50.000 karakterden sonra yer alıyorsa (D-027) Gemini'ye hiç gitmiyor. İkisinde de sonuç `needs_review` olduğu için yanlış atama değil, sınıflandırılamama yaşanıyor. Yoğun gürültülü veya gölgeli taramada belge türü kayabiliyor (kurum doğru kalıyor; re-benchmarkta 04 ve 15). Bozuk text layer sorunu (P2) V1.2 · Adım 5'te kapatıldı.
- P2 düzeltmesinin bilinen sınırı: bozuk metin katmanı **harf görünümlü** ise (ör. `qwzxk jvbnm`) kelime benzeri parça ürettiği için korunacak bilgi sayılır ve OCR metninin yanında kalır. Sembol, kontrol karakteri, U+FFFD ve PUA aileleri (benchmark senaryo 14 bu aileden) düşer. Kalan gürültü en fazla 200 karakterle sınırlıdır ve yanında belgenin tam OCR metni bulunur. Ayırt etmek Türkçe sözlük/dil modeli gerektireceği için kapsam dışı bırakıldı.
- Yapısal OCR koşulunun bilinen yanlış pozitifi: tam sayfa arka plan/filigran görüntüsü olan **dijital** bir sayfada gömülü metin 200 karakterin altındaysa OCR gereksiz yere çalışır. Ölçülen maliyet ~0,2 sn; gömülü bilgi kaybolmuyor (birleştirme kuralı koruyor). Aynı durumda OCR metni gömülü metnin yerine geçtiği için, paylaşılan kısımda Tesseract'ın Türkçe karakter kayıpları (`İ→I`, `Ç→C`) nihai metne yansıyabilir; ölçülen senaryoların hiçbirinde görülmedi.
- Görüntü belgelerinde (JPG/JPEG/PNG) OCR her zaman çalışır: dosya tek sayfalık belge olarak doğrudan okunur, gömülü metin aranmaz. Tesseract kurulu değilse bu belgeler `failed` olur.
- EXIF `Orientation` etiketi taşıyan döndürülmüş fotoğraflar PyMuPDF tarafından doğru yönlendirilir. Etiketsiz döndürülmüş görüntülerde metin anlamsız çıkar (otomatik döndürme/OSD yok); bu, kayıtlı rotation sınırının devamıdır.
- PDF'te OCR iki koşuldan birine bağlıdır: sayfanın kendi gömülü metni 10 karakterin altında olmalı, ya da sayfa alanının en az %50'si görüntüyken metni 200 karakteri geçmemeli. Normal metin PDF'lerinde ek maliyet yoktur — uzun metinli sayfa yapısal ölçüme hiç girmez. Tek sayfalık temiz bir taramada 400 dpi'de ~0,7 sn sürdü, ancak süre sayfa sayısı ve tarama kalitesiyle artar ve senkron isteğin toplam süresine eklenir.
- Tesseract büyük harf Türkçe metinde noktalı **İ**'yi noktasız I, **Ç**'yi C okuyabiliyor (smoke testinde "ŞİKAYET DİLEKÇESİ" → "ŞIKAYET DILEKCESI"). Gövde metni doğru çıktığı için sınıflandırma etkilenmedi; başlığa dayanan belgelerde dikkat edilmeli.
- OCR kalitesi gerçek bir taranmış belge ve ondan türetilen 8 bozulma varyantı (gölge, soluk toner, speckle gürültü, perspektif, eğim+blur, düşük JPEG, birleşik gürültü, kötü fotokopi) ile ölçüldü; ayrıca 15 senaryoluk manuel testte normal, temiz taranmış ve bozulmuş belgeler uçtan uca doğrulandı. Tablo ağırlıklı taranmış belgeler hâlâ denenmedi.
- Çok gürültülü taramalarda Tesseract kağıt dokusunu karakter sanıp beklenenden çok daha uzun metin üretebiliyor (ölçülen en kötü durumda 349 karakterlik belgeden 4282 karakter, süre ~5×). Üretilen fazlalık apaçık çöp parçalarıdır, akıcı ama yanlış metin değildir; ölçülen durumda sınıflandırma yine doğru sonuçlandı ve 50.000 karakter sınırının %8,6'sı kullanıldı. Çok sayfalı çok kötü taramalarda süre birikebilir.
- `TESSDATA_PREFIX` yerel `backend/.env` dosyasındadır ve Git'e girmez; yeni bir makinede OCR istenirse Tesseract kurulup bu değişken ayarlanmalıdır (`README.md` 3. adım).
- DOCX için ZIP bomb koruması yok (V1). Doğrulama ve python-docx arşivi açarken içeriği tamamen açar; 50 MB giriş sınırı dışında ek sınır yok.
- Endpoint upload'dan en fazla `MAX_FILE_SIZE + 1` bayt okur. Ancak Starlette/python-multipart, endpoint çalışmadan önce multipart gövdesini geçici dosyaya aktarır; yani 50 MB üstü bir yükleme yine de ağdan alınıp geçici diske yazılır. Uygulama seviyesinde gövde boyutu sınırı yok; gerçek dağıtımda sunucu/reverse proxy seviyesinde gövde sınırı konmalı.
- Dosya gönderilmediğinde FastAPI'nin standart 422 doğrulama yanıtı (`{"detail": [...]}`) döner; bu, kabul sonrası `failed` 422 gövdesinden (`status = "failed"` + `message`) farklıdır. İkisi gövdedeki `status` alanıyla ayırt edilir (frontend böyle yapıyor); OpenAPI'de 422 için iki gövde de belgelenir (`FailedClassifyResponse`, `ValidationErrorResponse`).
- Endpoint senkron ve thread pool'da çalışır; Gemini aşaması en kötü durumda ~93 sn bir thread'i meşgul eder. Eşzamanlı istek kapasitesi thread pool boyutuyla sınırlıdır (MVP için kabul edilebilir).
- Commit sunucuda başarılı olup istemci tarafında hata gibi görünürse (ör. bağlantı commit sırasında koparsa) dosya silinip kayıt kalabilir; nadir bir durum, MVP'de ayrıca ele alınmadı.
- Endpoint testleri SQLite kullanır (`create_all` yalnızca testte); PostgreSQL'e özgü davranış gerçek smoke testle doğrulandı, otomatik testlerde yoktur.
- `pytest` çalışırken Starlette/anyio kaynaklı 2 deprecation uyarısı çıkıyor (TestClient için `httpx2` önerisi); testleri etkilemiyor.
- `pytest`, ayrı bir dev requirements dosyası olmadığı için `requirements.txt` içinde.
- Kurum açıklamaları ilk taslaktır; gerçek örnek belgelerle test edilip iyileştirilmeli.
- Katalogda olmayan birimlere ait belgeler (ör. ulaşım, veteriner hizmetleri, su/kanalizasyon) `needs_review`'a düşecektir. Bu beklenen davranıştır; sık görülürse katalog genişletilir.
- 50.000 karakteri aşan belgelerde yalnızca ilk 50.000 karakter değerlendirilir; belirleyici bilgi sonrasında yer alıyorsa sınıflandırma etkilenebilir.
- İşlem senkron: en kötü durumda Gemini aşaması yaklaşık 93 sn sürer (3 × 30 sn timeout + 1 sn + 2 sn bekleme). Frontend ve varsa reverse proxy istek zaman aşımları bundan uzun olmalı.
- Katalog dosyaları değiştirilirse görünen adlar da değişir; kataloglar modül yüklenirken okunduğu için uygulama yeniden başlatılmalıdır. Veritabanındaki eski kayıtlar ID tuttuğu için bu kayıtların adı da yeni katalogdan üretilir.
- Frontend'in 120 sn zaman aşımı (D-039) yalnızca istemci tarafını keser; backend işlemeye devam edip kaydı yazabilir, yani kullanıcı hata görse de belge sınıflandırılmış olabilir. Ayrıca yükleme süresi 93 sn'lik en kötü duruma eklenir; sınıra yakın büyük dosyalarda 120 sn yetmeyebilir.
- 50 MB sınırı D-040 gereği frontend'de de yer alıyor (`frontend/src/App.tsx` `MAX_FILE_SIZE`); sınır değişirse `file_service.MAX_FILE_SIZE` ile birlikte güncellenmelidir.
- Frontend `ClassifyResponse` tipi backend şemasıyla elle eşleştiriliyor; otomatik sözleşme testi yok. Yanıt alanları değişirse iki taraf birlikte güncellenmelidir.
- PDF kabulünde `%PDF` imzası dosyanın ilk baytında aranıyor. İmzadan önce ek bayt bulunan nadir gerçek PDF'ler `415` alır; manuel testte gerçek bir PDF reddedilirse ilk şüphe bu.
- Gemini yanıtı boş gelirse (ör. içerik güvenlik filtresine takılırsa) geçersiz çıktı sayılır, 3 kez denenir ve `502` ile biter; böyle bir belge `needs_review` yerine `failed` olur.
- Arayüzde aynı dosyayla tekrar "Sınıflandır" denmesi yeni bir kayıt ve yeni bir Gemini çağrısı üretir (tekilleştirme yok).
- Frontend'de favicon yok; geliştirmede `/favicon.ico` isteği 404 döner (kozmetik).
- Vite proxy yalnızca geliştirme ortamı içindir (D-038). Frontend ve backend ayrı origin'lerde dağıtılacaksa CORS veya reverse proxy kararı ayrıca verilmelidir.
- Vite dev sunucusu varsayılan ayarla yalnızca IPv6 `::1` (yani `localhost`) üzerinde dinliyor; `http://127.0.0.1:5173` bağlantı kuramıyor. Tarayıcı ve komut satırı testlerinde `http://localhost:5173` kullanılmalı. Gerekirse `vite.config.ts` içinde `server.host` sabitlenebilir (şimdilik yapılmadı).
- Frontend'de şablondan gelen `oxlint` dev bağımlılığı ve `.oxlintrc.json` duruyor (`npm run lint`). Backend tarafında karşılık gelen bir linter yok; istenirse kaldırılabilir.
- Frontend'de bileşen/tarayıcı testi yok. Yalnız saf yardımcılar (`src/documentPreview.ts`) `npm test` (Node `node:test`) ile birim test ediliyor. Arayüz akışı build ve tarayıcıda doğrulanıyor.
- `npm test`, TypeScript dosyalarını Node'un yerleşik tip ayıklamasıyla çalıştırır: Node 22.18+ (veya 23.6+) gerekir. Bu makinede Node 24.20 ile doğrulandı. Test dosyası `tsc -b` kapsamında değildir; tipleri derleme sırasında denetlenmez.
- PostgreSQL kapalıyken bağlantı denemesi `connect_timeout=10` (D-041) ile yaklaşık 10 sn'de `ConnectionTimeout` veriyor; classify isteği bu durumda kaydı yazamadığı için genel `500` döner ve yetim storage dosyası silinir (düz TCP bağlantısı daha erken reddedilebilse de — bu makinedeki ölçümde ~2 sn — psycopg bu durumda kendi `connect_timeout` süresi dolana kadar bekleyebiliyor; ölçülen hata süresi bu yüzden ~10 sn oldu). Metin çıkarımı ve Gemini aşaması veritabanından önce çalıştığı için toplam süre bunlara ek olarak uzar. `GET /health` veritabanına bakmadığı için bu durumda da `200` döner.
- `connect_timeout` yalnızca `DATABASE_URL` içinde tanımlı. Parametresi olmayan eski bir yerel `.env`, psycopg'un varsayılan ~130 sn beklemesine döner; `.env` şablonla uyumlu tutulmalıdır.
- Geliştirmede backend kapalıyken Vite proxy'si boş gövdeli `502` döndürüyor; kullanıcı "Sunucuya ulaşılamadı" yerine "Belge şu anda sınıflandırılamadı…" mesajını görüyor. Yalnızca geliştirme ortamını etkiler.
- **V1.4 (D-045, D-046) bilinen sınırlar:**
  - **TTL temizliği tembeldir:** Zamanlayıcı yok. Sahipsiz `prepared` kayıt 24 saat dolunca kendiliğinden silinmez, sonraki prepare çağrısında temizlenir. Yeni prepare gelmezse kayıt kalır ama Kayıtlar'da görünmez.
  - **Çift classify:** İki sekmeden ya da API'den aynı `prepared` kayıt için eşzamanlı classify gelirse iki Gemini çağrısı yapılabilir ve son yazan kazanır. Arayüz sıralı çalıştığı için bunu engeller; kilit eklenmedi.
  - **Discard / TTL ile classify yarışı:** Classify sürerken aynı kayıt discard edilir ya da TTL ile silinirse classify'ın commit'i `500` alır. Arayüzde `analyzing` satırda Kaldır pasif.
  - **Kaynak dosya kontrolünün zaman penceresi:** Kontrol Gemini çağrısından önce yapılır. Dosya Gemini çağrısı sürerken elle silinirse orijinali olmayan bir sonuç kaydı oluşabilir.
  - **5 dosya sınırı yalnız arayüzde:** Backend'de toplu işlem kavramı yok; API istemcileri sınırsız prepare yapabilir.
  - **Sıralama:** Kayıtlar'daki `created_at`, sınıflandırma değil hazırlık anıdır.
  - **Sayfa yenileme:** Liste kaybolur, hazırlanmış kayıtlar sunucuda sahipsiz kalır ve TTL ile temizlenir. Sekme kapanırken otomatik discard (`pagehide`/`keepalive`) bilinçli olarak eklenmedi.
  - **Mobil PDF:** PDF görüntüleyicisi olmayan tarayıcılarda (çoğu mobil) "Orijinal Belgeyi Gör" penceresinde yedek mesaj çıkar. Yapılandırılmış önizleme ve çıkarılan metin her zaman çalışır.
  - **Word önizlemesi:** DOC/DOCX'te orijinal belge görünümü yok; yapılandırılmış önizleme ve çıkarılan metin var.
  - **Önizleme alanları sezgiseldir:** Metin tek satıra normalize edildiği için özel ad içeren bir konu (ör. "… Park ve Bahçeler …") satır sonu izinde erken kesilebilir.
  - **İki noktasız etiketler:** Tablo biçimli belgelerde konu etiketi iki noktasız yazıldıysa konu boş kalır. Tarih, evrak no ve gönderen etiketleri iki noktasız da okunur.
  - **Tarih yedeği:** Etiketsiz ve birden fazla farklı tarih içeren belgede tarih boş kalır.
  - **Kapsam:** Önizleme alanları yalnız görüntülemeye yöneliktir; saklanmaz ve sınıflandırmayı etkilemez.
  - **Kalite uyarısı yok:** Düşük kaliteli OCR metni de `prepared` olur ve V1.4 bunun için uyarı vermez; bu V1.3'ün konusu.

## Açık sorular

İlgili geliştirme adımına başlamadan önce kullanıcıyla netleştirilir; karara bağlananlar `DECISIONS.md`'ye işlenir ve buradan silinir.

- Açık soru yok. Manuel test kayıtlarının ve storage dosyalarının V1 final öncesi silinmesi kararlaştırıldı ve uygulandı; kalıcı bir ürün/teknik karar değiştirmediği için `DECISIONS.md`'ye yeni kayıt açılmadı.

## Sıradaki geliştirme adımları

**V1.4** — Adım 0–10 tamamlandı ve commit'lendi. Adım 10 konu kısalması düzeltildi (bkz. Adım 10 bulgusu). Yeni V1.4 işi açılmadı.

**V1.3 (açık)** — Henüz adım açılmadı; başlatılırken kapsam bu dosyada ayrı başlık altında izlenir.

Aşağıdakiler **açılmış iş değildir**; biri ele alınacaksa önce `DECISIONS.md` (ve gerekiyorsa `PROJECT_BRAIN.md`) güncellenir:

- Gerçek kullanım verisiyle kurum açıklamalarının iyileştirilmesi (manuel testte 05 senaryosunda görülen park/bahçeler ↔ zabıta ikilemi gibi durumlar).
- Deployment / production kararları: containerize etme, reverse proxy ve gövde boyutu sınırı, CORS (D-038), authentication.
