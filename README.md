# Dosya Sistemi

Kamu kurumlarına ve belediyelere gelen PDF, Word ve görüntü belgelerinin metnini çıkaran, belge türünü ve ilgili kurumu Google Gemini ile belirleyen ve sonucu PostgreSQL'de saklayan yapay zekâ destekli belge sınıflandırma modülü.

Python 3.13 · FastAPI · React · PostgreSQL · Gemini · Tesseract OCR (yedek)

**Durum:** Ürün durumu, test baseline'ı ve riskler [`CURRENT_STATE.md`](CURRENT_STATE.md) dosyasındadır.

## Ne Yapıyor?

- Yüklenen belgeyi uzantı, içerik imzası ve boyut ile doğrular ve saklar.
- Metni çıkarır. Dijital metni olmayan belgeleri (taranmış PDF, fotoğraf, el yazısı) Gemini ile okur.
- Belge türünü ve ilgili kurumu kapalı kataloglardan seçer. Kısa bir özet ve belgede açıkça yazıyorsa gönderen bilgisini üretir.
- Belirsiz belgeyi zorla bir kuruma atamaz. Belgeyi `needs_review` olarak işaretler ve nedenini kaydeder.
- Yönlendirmeyi destekleyen ifadeleri belgenin kendi metninden gösterir.
- Kullanıcı sonucu onaylar veya katalog içinden düzeltir. AI sonucu korunur.
- Kayıtları listeler, filtreler ve orijinal dosyayı indirmeye izin verir.

> Amaç insan kararını kaldırmak değildir. Açık belgeler otomatik yönlendirilir; belirsiz belgeler insan incelemesine bırakılır.

## Desteklenen Dosyalar

| Format | Metin çıkarımı | Yedek |
|---|---|---|
| PDF (dijital) | PyMuPDF gömülü metin | — |
| PDF (taranmış / hybrid) | Gemini transkripsiyonu | Tesseract (yalnız OCR gereken sayfalar) |
| DOC (Word 97–2003) | `legacy-doc` (saf Python) | — |
| DOCX | `python-docx` (paragraflar ve tablolar) | — |
| JPG / JPEG / PNG | Gemini transkripsiyonu | Tesseract |

- Boyut sınırı dosya başına 50 MB'tır (`50 × 1024 × 1024` bayt). Sınırı aşan dosya `413` alır.
- Uzantı ile dosya imzası uyuşmalıdır. Desteklenmeyen format (GIF, TIFF, BMP, WebP, HEIC vb.) veya imza uyuşmazlığı `415` alır.
- DOC ve DOCX'te OCR yapılmaz. Header/footer ve gömülü görüntüler okunmaz.
- DOC için Microsoft Word, LibreOffice veya antiword gerekmez.

## Çalışma Akışı

```text
Yükle → Hazırla (doğrula, sakla, metni çıkar) → Önizle → Sınıflandır → Gerekirse insan kontrolü → Kayıt
```

Arayüzde en fazla 5 dosya seçilir ya da sürükle-bırakla eklenir ve sırayla işlenir. Hazırlama adımı sınıflandırma yapmaz. Sınıflandırma kayıttaki metni kullanır ve dosyayı tekrar okumaz. Önizlemede kaldırılan dosya, kaydıyla birlikte silinir.

İşleme senkrondur. Kuyruk, agent, RAG ve vector DB yoktur. Metin çıkarımı, OCR yedeği, sınıflandırma ve onay kuralları: [`docs/TEKNIK_SARTNAME.md`](docs/TEKNIK_SARTNAME.md) (F-01–F-06); akış: [`PROJECT_BRAIN.md`](PROJECT_BRAIN.md) §2.

## Teknoloji

Yığın ve seçim gerekçeleri: [`docs/TEKNIK_SARTNAME.md`](docs/TEKNIK_SARTNAME.md) "Ortak teknoloji ve yapılandırma". Sürümler [`backend/requirements.txt`](backend/requirements.txt) ve [`frontend/package.json`](frontend/package.json) dosyalarındadır.

## Kurulum

**Gereksinimler**

- Python 3.13
- Node.js 22.18+ (`npm test` bu sürümü ister)
- Docker Desktop (yalnız yerel PostgreSQL için)
- Gemini API anahtarı. Backend anahtar olmadan başlamaz; otomatik testler anahtar istemez.
- Tesseract + `tur` dil paketi (opsiyonel, yalnız yedek OCR için):
  - Windows: `winget install --id tesseract-ocr.tesseract` (kurulumda **Turkish** bileşenini seçin)
  - Debian/Ubuntu: `sudo apt install tesseract-ocr tesseract-ocr-tur`
  - macOS: `brew install tesseract tesseract-lang`

```text
dosya_sistemi/
  docker-compose.yml   # yalnız yerel geliştirme PostgreSQL'i
  backend/             # FastAPI, Alembic, testler, .env.example
  frontend/            # React + Vite + TypeScript
```

Komutlar PowerShell içindir. macOS/Linux'ta `python3 -m venv .venv`, `source .venv/bin/activate` ve `cp .env.example .env` kullanın.

**1. PostgreSQL** (repo kökünde, Docker Desktop açıkken):

```powershell
docker compose up -d
```

`docker compose ps` çıktısında `dosya-sistemi-postgres` `healthy` olmalıdır. Veritabanı `127.0.0.1:5434` adresindedir.

**2. Ortam dosyası** (mevcut `.env` dosyasının üzerine yazmaz):

```powershell
cd backend
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

`.env` içinde en az `GEMINI_API_KEY` değerini doldurun. Bkz. [Ortam Değişkenleri](#ortam-değişkenleri).

**3. Python ortamı** (`backend/` içinde):

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

**4. Veritabanı şeması** (`backend/` içinde):

```powershell
alembic upgrade head
```

**5. Backend:**

```powershell
uvicorn app.main:app --reload
```

PowerShell betik çalıştırmayı engelliyorsa sanal ortamı etkinleştirmeden `.\.venv\Scripts\python.exe -m <komut>` kullanın (ör. `-m alembic upgrade head`, `-m uvicorn app.main:app --reload`).

**6. Frontend** (ayrı terminalde):

```powershell
cd frontend
npm install
npm run dev
```

**Adresler**

- Arayüz: http://localhost:5173 (`127.0.0.1` değil, `localhost` kullanın)
- Backend: http://127.0.0.1:8000 · Health: `/health` · Swagger: `/docs`

Vite, `/api` isteklerini `http://127.0.0.1:8000` adresine proxy'ler. Bu nedenle arayüz için backend çalışıyor olmalıdır.

Günlük kullanımda `docker compose up -d`, `alembic upgrade head`, `uvicorn` ve `npm run dev` yeterlidir.

**Windows'ta tek tıkla başlatma:** Kurulum bir kez tamamlandıktan sonra repo kökündeki `Dosya_Sistemi_Baslat.bat` dosyasına çift tıklayın. Dosya önce Docker, `backend/.env` (`DATABASE_URL` 5434), backend sanal ortamı, Node/npm ve `frontend/node_modules` varlığını kontrol eder; ardından PostgreSQL'i `docker compose up -d` ile başlatıp hazır olmasını bekler, şemanın en güncel migration'da olduğunu doğrular, backend ve frontend'i ayrı pencerelerde açar ve ikisi yanıt verince `http://localhost:5173` adresini tarayıcıda açar. Zaten çalışan backend veya frontend ikinci kez açılmaz; 8000 ya da 5173 portu başka bir uygulamadaysa o uygulamaya dokunmadan durur. Migration, bağımlılık kurulumu, `.env` değişikliği ve veritabanı silme yapmaz. Durdurmak için backend ve frontend pencerelerini kapatın; PostgreSQL Docker'da çalışmaya devam eder.

> **Uyarı:** `docker compose down -v` yerel veritabanı volume'unu (`dosya_sistemi_pgdata`) siler. Yalnız bilerek kullanın.

## Ortam Değişkenleri

Değerler `backend/.env` dosyasındadır; bu dosya Git'e girmez. Şablon ve açıklamalar: [`backend/.env.example`](backend/.env.example).

| Değişken | Zorunlu | Açıklama |
|---|---|---|
| `GEMINI_API_KEY` | Evet | Gemini API anahtarı |
| `GEMINI_MODEL` | Evet | Transkripsiyon ve sınıflandırma modeli. Şablon değeri `gemini-3.5-flash-lite`; kodda varsayılan yoktur |
| `DATABASE_URL` | Evet | PostgreSQL adresi (psycopg 3). Şablon değeri yerel Docker veritabanını gösterir (`127.0.0.1:5434`, `connect_timeout=10`) |
| `TESSDATA_PREFIX` | Hayır | Tesseract `tessdata` klasörü; `tur.traineddata` içermelidir. Tanımlı değilse yedek OCR atlanır |
| `OCR_ENABLED` | Hayır | `true` (varsayılan) veya `false`. `false` iken OCR gereken belge OCR'a girmeden `422` alır (D-055); production Compose `false` verir |
| `PERMANENT_DELETE_ENABLED` | Hayır | `true` (varsayılan) veya `false`. `false` iken kalıcı silme `403` alır (D-057); production Compose `false` verir |

Zorunlu değişkenlerden biri eksikse backend başlamaz. `DATABASE_URL` içinde `localhost` yerine `127.0.0.1` kullanın.

## API

İnteraktif dokümantasyon: `/docs` (Swagger UI), `/redoc`.

| Method | Endpoint | Açıklama |
|---|---|---|
| GET | `/health` | Sağlık kontrolü (`{"status": "ok"}`) |
| POST | `/api/documents/prepare` | Belgeyi doğrular, saklar ve metnini çıkarır (`status = prepared`); sınıflandırma yapmaz |
| POST | `/api/documents/{document_id}/classify` | Hazırlanmış belgeyi kayıttaki metinle sınıflandırır |
| DELETE | `/api/documents/{document_id}/prepared` | Sınıflandırılmamış belgeyi ve dosyasını siler |
| POST | `/api/documents/{document_id}/retry-classification` | Sınıflandırması başarısız belgeyi yeniden yüklemeden, kayıttaki metinle tekrar sınıflandırır |
| POST | `/api/documents/classify` | Legacy tek adımlı akış (yükleme + sınıflandırma); arayüz kullanmaz |
| GET | `/api/documents` | Kayıt listesi; en yeni önce, `prepared` kayıtlar hariç |
| GET | `/api/documents/{document_id}` | Belge detayı; çıkarılan metin dahil |
| GET | `/api/documents/{document_id}/download` | Orijinal dosyayı indirir |
| PUT | `/api/documents/{document_id}/validation` | Tür ve kurum sonucunu onaylar veya katalog içinden düzeltir; AI sonucu değişmez |
| DELETE | `/api/documents/{document_id}` | Kalıcı kaydı ve orijinal dosyasını geri alınamaz şekilde siler; `prepared` kayda uygulanmaz |
| GET | `/api/catalogs` | Belge türü ve kurum katalogları |

Belge yanıtları AI sonucunu (`document_type`, `institution_id`), kullanıcı onayını (`validated_*`) ve doğrulanmış ifadeleri (`routing_evidence`) ayrı alanlarda döndürür.

**Güvenlik notu:** API'de yetkilendirme yoktur; API'ye erişebilen herkes kalıcı silme dahil her endpoint'i çağırabilir. Yerel adreste dinleme ve CORS'un olmaması yetkilendirme değildir. Dış erişime açmadan önce silme endpoint'i sunucu tarafında korunmalı ya da kapatılmalıdır (D-054); production Compose onu kapatır (D-057).

Başlıca hata kodları: `404` kayıt yok, `409` kaydın durumu işleme uygun değil, `413` boyut, `415` format veya imza, `422` içerik işlenemedi ya da istek geçersiz, `502` Gemini sınıflandırması tamamlanamadı. Yanıt alanları ve tam HTTP sözleşmesi: [`docs/TEKNIK_SARTNAME.md`](docs/TEKNIK_SARTNAME.md) F-08.

## Test ve Kalite

```powershell
# backend/ içinde
python -m pytest
alembic check

# frontend/ içinde
npm test
npm run build
npm run lint
```

Otomatik testler gerçek Gemini API'si veya Docker PostgreSQL gerektirmez; geçici SQLite ve sahte Gemini yanıtları kullanır. `alembic check` çalışan bir veritabanı ister.

Son doğrulanmış baseline (tarih, commit, ortam ve sonuçlar): [`CURRENT_STATE.md`](CURRENT_STATE.md) → "Teknik baseline".

## Production Docker

Linux sunucu (ilk hedef AWS Lightsail staging, `/opt/citech/dosya`) için düzen: D-056. **Uygulamada kimlik doğrulama yok; S3 korumaları tamamlanmadan internete açmayın** (D-025, D-054). OCR kapalıdır (D-055); kalıcı silme kapalıdır (D-057); DOCX açılım sınırları uygulanır (D-058).

```bash
cp deploy/.env.example deploy/.env   # değerleri doldurun; parolalar: openssl rand -hex 32
docker compose -f deploy/docker-compose.prod.yml build
docker compose -f deploy/docker-compose.prod.yml up -d --wait db
docker compose -f deploy/docker-compose.prod.yml --profile migrate run --rm migrate   # alembic upgrade head
docker compose -f deploy/docker-compose.prod.yml up -d --wait
```

- Host portu yayınlanmaz. Dış erişim ayrı aşamada Caddy ile verilir: Caddy `citech-dosya_edge` ağına harici ağ olarak katılır ve `dosya-web:8080`'e yönlendirir. Genel `web` adı kullanılmaz: Caddy başka projelerin ağlarına da katıldığında aynı adlı servisle karışabilir.
- Migration yalnız `migrate` servisiyle, `dosya_migrator` rolüyle çalışır; `api` şema değiştiremez. `alembic check` için: `... --profile migrate run --rm migrate alembic check`.
- Veritabanı rolleri ve parolaları yalnız boş `pgdata` volume'üyle ilk başlatmada oluşturulur. Parola değiştirmek için önce `deploy/.env`'yi güncelleyin, sonra: `docker compose -f deploy/docker-compose.prod.yml exec db psql -U dosya_admin -d dosya_sistemi -c "ALTER ROLE dosya_app PASSWORD '<yeni>'"` ve servisi yeniden oluşturun.
- Kalıcı veri: `citech-dosya_pgdata` ve `citech-dosya_storage` volume'leri. `down -v` ikisini de siler.

## Bilinen Sınırlar

Her özelliğin sınırları [`docs/TEKNIK_SARTNAME.md`](docs/TEKNIK_SARTNAME.md) içinde ilgili kaydın "Sınırlar" bölümündedir. Dağıtım durumu (authentication, CORS, gövde sınırı) ve güncel riskler: [`CURRENT_STATE.md`](CURRENT_STATE.md).

## Dokümantasyon

- [`PROJECT_BRAIN.md`](PROJECT_BRAIN.md) — ürün amacı, mimari, veri modeli, kritik değişmezler ve kapsam
- [`docs/TEKNIK_SARTNAME.md`](docs/TEKNIK_SARTNAME.md) — özellik davranışı, kabul ölçütleri, sınırlar, LLM ve API sözleşmesi
- [`DECISIONS.md`](DECISIONS.md) — ürün ve teknik kararlar (D-xxx)
- [`CURRENT_STATE.md`](CURRENT_STATE.md) — güncel durum, test baseline'ı ve riskler
- [`TODOS.md`](TODOS.md) — açık işler, araştırmalar ve adaylar

Sürüm ve değişiklik geçmişi Git geçmişindedir.
