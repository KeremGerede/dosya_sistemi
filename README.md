# Dosya Sistemi

Kamu kurumlarına ve belediyelere gelen PDF, Word ve görüntü belgelerinin metnini çıkaran, belge türünü ve ilgili kurumu Google Gemini ile belirleyen ve sonucu PostgreSQL'de saklayan yapay zekâ destekli belge sınıflandırma modülü.

Python 3.13 · FastAPI · React · PostgreSQL · Gemini · Tesseract OCR (yedek)

**Durum:** V1.0–V1.4, arayüz iyileştirmeleri, Human Validation + Routing Correction ve Evidence-backed Routing tamamlandı. Açık iş hattı yok. Güncel durum: [`CURRENT_STATE.md`](CURRENT_STATE.md).

## Ne Yapıyor?

- Yüklenen belgeyi uzantı, içerik imzası ve boyut ile doğrular ve saklar.
- Metni çıkarır. Dijital metni olmayan belgeleri (taranmış PDF, fotoğraf, el yazısı) Gemini ile okur.
- Belge türünü ve ilgili kurumu kapalı kataloglardan seçer. Kısa bir özet ve belgede açıkça yazıyorsa gönderen bilgisini üretir.
- Belirsiz belgeyi zorla bir kuruma atamaz. Belgeyi `needs_review` olarak işaretler ve nedenini kaydeder.
- Yönlendirmeyi destekleyen ifadeleri belgenin kendi metninden gösterir.
- Kullanıcı sonucu onaylar veya katalog içinden düzeltir. AI sonucu korunur.
- Kayıtları listeler, filtreler ve orijinal dosyayı indirmeye izin verir.

> Amaç insan kararını kaldırmak değildir. Açık belgeler otomatik yönlendirilir; belirsiz belgeler insan incelemesine bırakılır.

## Temel Özellikler

- **Formatlar:** PDF, DOC, DOCX, JPG, JPEG, PNG; dosya başına en fazla 50 MB.
- **OCR / transkripsiyon:** Gemini multimodal transkripsiyonu (el yazısı dahil). Yerel Tesseract yalnız yedektir.
- **Sınıflandırma ve yönlendirme:** Tek Gemini çağrısı (structured output). Tür ve kurum kapalı katalogdan seçilir; backend sonucu tekrar doğrular.
- **`needs_review`:** Belirsiz sonuçta veya Tesseract yedeği kullanıldığında arayüz "Kontrol Öneriliyor" gösterir.
- **Human Validation:** Sonuç kartında ve Kayıtlar detayında "Sonucu Onayla" / "Düzelt". Onaylanan değerler ayrı saklanır ve arayüzde öncelikli gösterilir.
- **Evidence-backed Routing:** "Belgedeki ilgili ifade" bölümü. Sınıflandırma çağrısı en fazla 2 ifade önerir; backend yalnız çıkarılan metinde birebir geçenleri saklar. Ayrı LLM çağrısı yoktur.
- **Kayıtlar:** Liste, detay ve indirme. Dosya adında arama, tür/kurum/durum filtresi ve özet sayıları tarayıcıda çalışır.
- **Çoklu yükleme ve önizleme:** En fazla 5 dosya (arayüz sınırı) ve sürükle-bırak. Akış: hazırla → önizle → sınıflandır. Metin çıkarımı ve OCR dosya başına bir kez yapılır.

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

Hazırlama adımı sınıflandırma yapmaz. Sınıflandırma kayıttaki metni kullanır ve dosyayı tekrar okumaz. Önizlemede kaldırılan dosya, kaydıyla birlikte silinir.

**Metin çıkarımı.** PDF'te OCR kararı sayfa sayfa verilir. Bir sayfanın gömülü metni 10 karakterden kısaysa ya da sayfanın en az yarısı görüntüyken metni 200 karakteri geçmiyorsa sayfa OCR gerektirir. Bir sayfa bile OCR gerektiriyorsa PDF'in tamamı Gemini ile okunur: 1–3 sayfa tek çağrıda, 4+ sayfa en fazla 3 sayfalık sıralı gruplarda. Görüntüler her zaman Gemini'ye gider. Dijital PDF, DOC ve DOCX Gemini transkripsiyonuna gönderilmez.

**Tesseract yedeği.** Gemini transkripsiyonu başarısız olursa veya yetersiz metin döndürürse kısmi Gemini sonucu kullanılmaz. Belge yerel çıkarım + Tesseract (`tur`, 400 dpi) ile yeniden okunur ve sonuç `needs_review` olur. Yedek metin de yetersizse belge `failed` olur.

**Sınıflandırma.** Normalize edilmiş metnin ilk 50.000 karakteri, iki katalogla birlikte tek bir Gemini çağrısına gider. Yanıt tür, kurum, inceleme işareti, özet, gönderen ve ilgili ifade adaylarını içerir. Geçici hata veya geçersiz çıktıda aynı çağrı en fazla 3 kez denenir. Sınıflandırma tamamlanamazsa kayıt `failed` olur. İlgili ifade hataları sınıflandırmayı başarısız yapmaz.

İşleme senkrondur. Kuyruk, agent, RAG ve vector DB yoktur. Ayrıntılar: [`PROJECT_BRAIN.md`](PROJECT_BRAIN.md) §2, §5 ve §7.

## Teknoloji

| Katman | Teknoloji |
|---|---|
| Backend | Python 3.13, FastAPI, Pydantic |
| Veritabanı | PostgreSQL 18 (Docker Compose), SQLAlchemy 2 + psycopg 3, Alembic |
| AI / OCR | Google Gemini (`google-genai`); yedek OCR: Tesseract (PyMuPDF üzerinden) |
| Belge işleme | PyMuPDF, python-docx, legacy-doc |
| Frontend | React, TypeScript, Vite (düz CSS) |
| Test ve kalite | pytest, Node yerleşik test çalıştırıcısı, oxlint |

Sürümler [`backend/requirements.txt`](backend/requirements.txt) ve [`frontend/package.json`](frontend/package.json) dosyalarındadır.

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

`docker compose ps` çıktısında `dosya-sistemi-postgres` `healthy` olmalıdır. Veritabanı `127.0.0.1:5433` adresindedir.

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

> **Uyarı:** `docker compose down -v` yerel veritabanı volume'unu (`dosya_sistemi_pgdata`) siler. Yalnız bilerek kullanın.

## Ortam Değişkenleri

Değerler `backend/.env` dosyasındadır; bu dosya Git'e girmez. Şablon ve açıklamalar: [`backend/.env.example`](backend/.env.example).

| Değişken | Zorunlu | Açıklama |
|---|---|---|
| `GEMINI_API_KEY` | Evet | Gemini API anahtarı |
| `GEMINI_MODEL` | Evet | Transkripsiyon ve sınıflandırma modeli. Şablon değeri `gemini-3.5-flash-lite`; kodda varsayılan yoktur |
| `DATABASE_URL` | Evet | PostgreSQL adresi (psycopg 3). Şablon değeri yerel Docker veritabanını gösterir (`127.0.0.1:5433`, `connect_timeout=10`) |
| `TESSDATA_PREFIX` | Hayır | Tesseract `tessdata` klasörü; `tur.traineddata` içermelidir. Tanımlı değilse yedek OCR atlanır |

Zorunlu değişkenlerden biri eksikse backend başlamaz. `DATABASE_URL` içinde `localhost` yerine `127.0.0.1` kullanın.

## API

İnteraktif dokümantasyon: `/docs` (Swagger UI), `/redoc`.

| Method | Endpoint | Açıklama |
|---|---|---|
| GET | `/health` | Sağlık kontrolü (`{"status": "ok"}`) |
| POST | `/api/documents/prepare` | Belgeyi doğrular, saklar ve metnini çıkarır (`status = prepared`); sınıflandırma yapmaz |
| POST | `/api/documents/{document_id}/classify` | Hazırlanmış belgeyi kayıttaki metinle sınıflandırır |
| DELETE | `/api/documents/{document_id}/prepared` | Sınıflandırılmamış belgeyi ve dosyasını siler |
| POST | `/api/documents/classify` | Legacy tek adımlı akış (yükleme + sınıflandırma); arayüz kullanmaz |
| GET | `/api/documents` | Kayıt listesi; en yeni önce, `prepared` kayıtlar hariç |
| GET | `/api/documents/{document_id}` | Belge detayı; çıkarılan metin dahil |
| GET | `/api/documents/{document_id}/download` | Orijinal dosyayı indirir |
| PUT | `/api/documents/{document_id}/validation` | Tür ve kurum sonucunu onaylar veya katalog içinden düzeltir; AI sonucu değişmez |
| GET | `/api/catalogs` | Belge türü ve kurum katalogları |

Belge yanıtları AI sonucunu (`document_type`, `institution_id`), kullanıcı onayını (`validated_*`) ve doğrulanmış ifadeleri (`routing_evidence`) ayrı alanlarda döndürür.

Başlıca hata kodları: `404` kayıt yok, `409` kaydın durumu işleme uygun değil, `413` boyut, `415` format veya imza, `422` içerik işlenemedi ya da istek geçersiz, `502` Gemini sınıflandırması tamamlanamadı. Yanıt alanları ve tam HTTP sözleşmesi: [`PROJECT_BRAIN.md`](PROJECT_BRAIN.md) §9.

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

Son doğrulanmış baseline: backend **473 passed**, frontend **73 passed**; build ve lint temiz. Güncel değer [`CURRENT_STATE.md`](CURRENT_STATE.md) dosyasındadır.

## Bilinen Sınırlar

- Authentication ve yetkilendirme yoktur. Onaylayan kişi ve onay geçmişi tutulmaz.
- İşleme senkron ve sıralıdır. Her Gemini çağrısı en kötü durumda ~93 sn sürebilir; uzun taranmış PDF'lerde süre sayfa sayısıyla artar. Frontend her istek için 120 sn zaman aşımı uygular. 5 dosya sınırı yalnız arayüzdedir.
- Gemini'nin akıcı ama yanlış okumalarını yakalayan bir kalite kapısı yoktur. Tesseract yalnız yedektir ve döndürülmüş, gürültülü veya tablo içeren taramalarda zayıftır.
- Yalnız metnin ilk 50.000 karakteri sınıflandırılır. Kurum yönlendirmesi mevcut katalogla sınırlıdır; katalog dışı belgeler `needs_review` olur.
- "Belgedeki ilgili ifade" yalnız çıkarılan metinde doğrulanır; taranmış belgede görüntünün doğru okunduğunu kanıtlamaz. Zaman zaman genel bir kapanış ifadesi veya kısmen örtüşen iki ifade görünebilir.
- PDF orijinal görünümü tarayıcının yerleşik PDF görüntüleyicisine bağlıdır (çoğu mobil tarayıcıda yoktur); DOC/DOCX için orijinal görünüm yoktur.

Tüm teknik sınırlar ve riskler: [`CURRENT_STATE.md`](CURRENT_STATE.md).

## Dokümantasyon

- [`PROJECT_BRAIN.md`](PROJECT_BRAIN.md) — ürün amacı, mimari, kapsam, LLM ve API sözleşmesi
- [`DECISIONS.md`](DECISIONS.md) — aktif ürün ve teknik kararlar (D-xxx)
- [`CURRENT_STATE.md`](CURRENT_STATE.md) — güncel durum, test baseline'ı, riskler ve sıradaki adaylar

Sürüm ve değişiklik geçmişi Git geçmişindedir.
