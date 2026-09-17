# dosya_sistemi — Belge Sınıflandırma Modülü

Yüklenen **PDF** ve **DOCX** belgelerinden metni çıkarıp belgenin **türünü** ve ilgili **kurum/birimi** Google Gemini ile sınıflandıran küçük bir modül. Başka sistemlere entegre edilebilecek şekilde API odaklı ve bilinçli olarak sade tasarlanmıştır.

> **Durum: V1 tamamlandı.** `POST /api/documents/classify` aşağıdaki akışı uçtan uca çalıştırıyor. Frontend (React + Vite + TypeScript) üzerinden belge yüklenip sonuç Türkçe tür ve kurum adlarıyla gösteriliyor; incelemeye düşen belgeler ve hatalar kullanıcıya anlaşılır mesajlarla bildiriliyor. Gerçek belgelerle yapılan manuel doğrulamada 11 senaryonun 11'i de beklenen sonucu verdi.

## MVP Akışı

```text
Dosya yükleme
  → doğrulama (tür, boyut)
  → storage'a kaydetme
  → metin çıkarma
  → Gemini ile sınıflandırma
  → veritabanına kaydetme
  → API yanıtı
```

## Desteklenen Dosya Türleri

- PDF (metin tabanlı)
- PDF (taranmış / yalnızca görüntü) — OCR fallback ile, Tesseract kuruluysa
- DOCX

Şimdilik desteklenmeyen:

- DOC
- diğer dosya türleri
- DOCX içindeki görüntüler (DOCX'te OCR yapılmaz)

## Sınıflandırma

Model yalnızca kontrollü kataloglardan seçim yapar; yeni belge türü veya kurum üretmez.

**Belge türleri:** Şikayet · Talep Dilekçesi · Başvuru · İtiraz · Bilgi Edinme · Diğer

**Kurum/birim:** Kontrollü bir kurum kataloğu (`id`, `name`, `description`) üzerinden belirlenir. Başlangıç kataloğunda 9 müdürlük var: Fen İşleri, Park ve Bahçeler, Temizlik İşleri, Zabıta, İmar ve Şehircilik, Sosyal Hizmetler, Kültür ve Sosyal İşler, Mali Hizmetler, Yazı İşleri.

Bilgi yetersizse, hiçbir kurum makul şekilde eşleşmiyorsa ya da kurumlar arasında ciddi belirsizlik varsa belge zorla bir kuruma atanmaz; `needs_review` olarak işaretlenir ve nedeni `review_reason` alanına yazılır.

## Teknoloji Yığını

**Backend:** Python · FastAPI · PyMuPDF · python-docx · Google Gemini API (`google-genai`) · Pydantic · SQLAlchemy · PostgreSQL · Alembic

**Frontend:** React · Vite · TypeScript (npm, düz CSS)

**Geliştirme ortamı:** PostgreSQL 18 Docker Compose ile çalışır; backend ve frontend yerel makinede çalışır.

## Temel MVP Kuralları

- Maksimum dosya boyutu **50 MiB** (50 × 1024 × 1024 bayt; arayüzde "50 MB" olarak gösterilir).
- Çıkarılan metin (boşlukları normalize edilmiş) en az **10 karakter** olmalı. PDF'te bu sınırın altında kalınırsa belge taranmış sayılır ve **OCR fallback** devreye girer (`tur`, 300 dpi). OCR'dan sonra da 10 karakterin altındaysa belge `failed` olarak kaydedilir.
- Gemini'ye en fazla **50.000 karakter** gönderilir.
- Her belge için **tek** Gemini sınıflandırma işlemi yapılır; belge türü ve kurum aynı çağrıda belirlenir.
- Geçici Gemini hatalarında ve geçersiz model çıktısında toplam en fazla **3 deneme** yapılır.
- Belirsiz sınıflandırmalar `needs_review` olarak işaretlenebilir.
- Orijinal dosya storage alanında saklanır (veritabanında binary olarak tutulmaz).
- Çıkarılan metin veritabanında saklanır.

## API

Çalışan endpoint'ler: **`GET /health`** → `{"status": "ok"}` ve **`POST /api/documents/classify`**.

**`POST /api/documents/classify`** — `multipart/form-data` içinde `file` alanında tek bir PDF veya DOCX dosyası.

Yanıt alanları: `document_id`, `file_name`, `file_type`, `document_type`, `document_type_name`, `institution_id`, `institution_name`, `needs_review`, `review_reason`, `status` (`classified` | `needs_review` | `failed`). `422` ve `502` yanıtlarında ayrıca genel bir `message` alanı bulunur. `document_type_name` ve `institution_name` katalog dosyalarındaki `name` değerleridir; ID `null` ise ilgili ad da `null` olur. Dosyanın storage yolu ve çıkarılan metin veritabanında saklanır, yanıtta dönmez.

| HTTP kodu | Anlamı |
|---|---|
| `200` | Sınıflandırıldı (`status`: `classified` veya `needs_review`) |
| `413` | Dosya 50 MiB sınırını aşıyor (kayıt oluşturulmaz) |
| `415` | Desteklenmeyen dosya türü (kayıt oluşturulmaz) |
| `422` | İki durum: (1) belge içeriği işlenemedi / yeterli metin çıkarılamadı — `failed` kaydı, gövdede `status: "failed"` ve `message`; (2) istek doğrulanamadı, ör. `file` alanı gönderilmedi — FastAPI'nin `{"detail": [...]}` gövdesi, kayıt oluşturulmaz |
| `502` | Gemini ile sınıflandırma tamamlanamadı (`failed` kaydı) |
| `500` | Beklenmeyen sunucu hatası, ör. dosya storage'a ya da kayıt veritabanına yazılamadı (ayrıntı dönmez; kayıt oluşmaz, yüklenen ya da yarım yazılmış dosya silinir) |

Endpoint çalışmadan önce çerçevenin standart yanıtları da dönebilir (bozuk çok parçalı gövde için `400`, yanlış HTTP metodu için `405`); bu isteklerde kayıt oluşmaz. Teknik hata detayları kullanıcıya gösterilmez, yalnızca loglanır. OpenAPI şeması `/docs` ve `/openapi.json` adreslerindedir; 422 için iki gövde de belgelenmiştir.

## Proje Durumu

- **Tamamlandı:** MVP mimarisi ve ürün/teknik kararlar.
- **Aşama 1 — tamamlandı:** FastAPI backend iskeleti; `GET /health` çalışıyor, belge türü ve kurum katalogları eklendi.
- **Aşama 2 — tamamlandı:** PostgreSQL 18 (Docker Compose), SQLAlchemy `Document` modeli ve `documents` tablosunu oluşturan Alembic migration'ı.
- **Aşama 3 — tamamlandı:** PDF/DOCX dosya işleme. Tür ve 50 MB doğrulaması, `backend/storage/`'a kaydetme, metin çıkarımı, normalizasyon ve 10 karakter kontrolü mevcut.
- **Aşama 4 — tamamlandı:** Gemini sınıflandırma katmanı.
  - Structured output entegrasyonu mevcut; izinli ID'ler kataloglardan gelir.
  - Belge türü ve kurum aynı çağrıda sınıflandırılır.
  - Retry/timeout politikası uygulanmış: 30 sn timeout, en fazla 3 deneme, 1 sn / 2 sn bekleme.
  - `gemini-3.5-flash-lite` gerçek API smoke testiyle doğrulandı.
- **Aşama 5 — tamamlandı:** `POST /api/documents/classify` endpoint'i; backend ana MVP akışı tamamlandı. Upload → storage → metin çıkarımı → Gemini → PostgreSQL → yanıt akışı, gerçek Docker PostgreSQL ve gerçek Gemini ile uçtan uca doğrulandı.
- **Aşama 6 — tamamlandı:** frontend ve V1 doğrulaması.
  - Adım 1 tamamlandı: classify yanıtı katalog adlarını (`document_type_name`, `institution_name`) da döndürüyor.
  - Adım 2 tamamlandı: `frontend/` iskeleti (React + Vite + TypeScript), `/api` isteklerini backend'e ileten Vite proxy'si.
  - Adım 3 tamamlandı: yükleme ekranı — dosya seçimi, PDF/DOCX ve 50 MB ön kontrolü, 120 sn zaman aşımlı classify isteği, yükleniyor durumu.
  - Adım 4 tamamlandı: sonuç ekranı (belge türü ve kurum adı; incelemeye düşen belgeler için "İnsan incelemesi gerekiyor" ve inceleme nedeni) ve HTTP koduna göre kullanıcı dostu hata mesajları.
  - Adım 5 tamamlandı: V1 öncesi audit ve polish pass (OpenAPI 422 belgesi, log güvenliği, erişilebilirlik); ardından gerçek belgelerle 11 senaryoluk manuel test matrisi (11/11 beklenen sonuç), sentetik test verilerinin temizlenmesi ve final kontroller — `pytest` 97 passed, `pip check` temiz, `alembic current` head, `GET /health` → `200`, `npm run build` ve `npm run lint` temiz.
- **V1.1 — tamamlandı:** taranmış / yalnızca görüntüden oluşan PDF'ler için lokal Tesseract OCR fallback'i. Kurum açıklamalarının gerçek kullanım verisiyle iyileştirilmesi ve deployment/production kararları hâlâ kapsam dışıdır; ayrıntı için [`CURRENT_STATE.md`](CURRENT_STATE.md).

## Kurulum ve Çalıştırma

Komutlar Windows PowerShell içindir (macOS/Linux farkları en sonda). Kurulum üç terminal kullanır: repo kökü (Docker), `backend/` (API) ve `frontend/` (arayüz).

### Gereksinimler

- **Git**
- **Python 3.13** — proje Python 3.13 ile geliştirildi ve test edildi; repoda ayrıca bir sürüm kısıtı tanımlı değil.
- **Node.js ve npm** — Vite 8'in desteklediği bir Node.js sürümü (`vite` paketinin `engines` alanı: `^20.19.0 || >=22.12.0`). Proje Node.js 26.7 ve npm 11.19 ile doğrulandı.
- **Docker Desktop** — `docker compose` komutuyla; yalnızca yerel PostgreSQL 18 için kullanılır.
- **Gemini API anahtarı** — sınıflandırma gerçek Google Gemini API'sini çağırır; anahtar olmadan backend başlamaz. Testler anahtar gerektirmez.
- **Tesseract OCR (opsiyonel)** — yalnızca taranmış PDF'ler için gerekir; **`tur` dil paketiyle** kurulmalıdır. Kurulu değilse uygulama normal çalışır, taranmış PDF'ler `failed` olur. Ayrı bir Python paketi gerekmez: OCR, PyMuPDF'in yerleşik Tesseract desteğiyle yapılır ve yalnızca `tessdata` klasörüne ihtiyaç duyar (`tesseract` komutunun PATH'te olması gerekmez).
  - Windows: `winget install --id tesseract-ocr.tesseract`, kurulum sihirbazında **Turkish** dil bileşenini seçin.
  - Debian/Ubuntu: `sudo apt install tesseract-ocr tesseract-ocr-tur`
  - macOS: `brew install tesseract tesseract-lang`
  - Doğrulama: `tesseract --list-langs` çıktısında `tur` görünmelidir.

### 1. Repoyu klonlama

```powershell
git clone https://github.com/KeremGerede/dosya_sistemi.git
cd dosya_sistemi
```

```text
dosya_sistemi/
  docker-compose.yml   # yalnızca yerel geliştirme PostgreSQL'i
  backend/             # FastAPI uygulaması, Alembic, testler, .env.example
  frontend/            # React + Vite + TypeScript arayüzü
```

### 2. Backend ortamını hazırlama

Repo kökünden:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

- `python --version` 3.13 göstermelidir. Bağımlılıklar `backend/requirements.txt` içindedir (`pytest` dahil).
- PowerShell betik çalıştırmayı engelliyorsa sanal ortamı etkinleştirmeden aynı komutları `.\.venv\Scripts\python.exe` ile çalıştırabilirsiniz; ör. `.\.venv\Scripts\python.exe -m pip install -r requirements.txt`, `.\.venv\Scripts\python.exe -m alembic upgrade head`, `.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload`.
- `cmd.exe` kullanıyorsanız etkinleştirme komutu `.venv\Scripts\activate.bat`'tır.

### 3. Environment ayarları

`backend/` içinde şablonu kopyalayın (mevcut bir `.env`'nin üzerine yazmaz):

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Ardından `backend/.env` dosyasını düzenleyin:

| Değişken | Değer |
|---|---|
| `GEMINI_API_KEY` | Kendi Gemini API anahtarınız (şablonda boştur) |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` (şablondaki değer) |
| `DATABASE_URL` | `postgresql+psycopg://postgres:postgres@127.0.0.1:5433/dosya_sistemi?connect_timeout=10` (şablondaki değer) |
| `TESSDATA_PREFIX` | **Opsiyonel.** Tesseract `tessdata` klasörünün yolu; taranmış PDF'lerde OCR için. Boş bırakılırsa OCR atlanır |

- İlk üç değişken zorunludur; biri eksikse backend (ve `/health`) başlamaz. Model adının kodda varsayılanı yoktur.
- `TESSDATA_PREFIX` opsiyoneldir ve yalnızca OCR fallback'ini etkiler; tanımlı değilse uygulama normal başlar. Windows'ta tipik değer: `C:\Program Files\Tesseract-OCR\tessdata`. Klasörde `tur.traineddata` ve `eng.traineddata` bulunmalıdır.
- `127.0.0.1:5433`, Docker PostgreSQL'in hosttaki portudur; container içinde PostgreSQL 5432'de çalışır. `localhost` yerine `127.0.0.1` kullanın.
- `connect_timeout=10`: veritabanına ulaşılamazsa bağlantı denemesi 10 sn'de sonlanır. Daha önce oluşturulmuş bir `.env`'de bu parametre yoksa `DATABASE_URL`'in sonuna `?connect_timeout=10` ekleyin; aksi halde bekleme ~130 sn sürer.
- `postgres`/`postgres` bilgileri yalnızca yerel geliştirme içindir. `.env` Git'e girmez; gerçek anahtarı başka bir dosyaya yazmayın.

### 4. PostgreSQL'i başlatma

Docker Desktop açık olmalı. Repo kökünde:

```powershell
docker compose up -d
docker compose ps
docker inspect -f '{{.State.Health.Status}}' dosya-sistemi-postgres
```

- Beklenen: `docker compose ps` çıktısında `Up … (healthy)`, son komutta `healthy`. İlk açılışta birkaç saniye `starting` görünebilir.
- Compose yalnızca `dosya-sistemi-postgres` container'ını (`postgres:18`, veritabanı `dosya_sistemi`) çalıştırır; port eşlemesi `127.0.0.1:5433 → 5432`'dir ve yalnızca localhost'a açıktır.
- Makinede 5432'yi kullanan yerel bir Windows PostgreSQL servisi olabilir; ona dokunulmaz. Proje yalnızca Docker PostgreSQL'e, hosttaki 5433 portundan bağlanır.
- Veriler Docker'ın yönettiği `dosya_sistemi_pgdata` volume'unda kalır.

### 5. Migration

`backend/` içinde, sanal ortam etkinken:

```powershell
alembic upgrade head
alembic current
```

- `alembic current` çıktısı `(head)` ile bitmelidir (şu an `2ab2daa5828a (head)`).
- Alembic `alembic.ini` dosyasını ve `app` paketini çalışma dizininden bulduğu için bu komutlar `backend/` içinden çalıştırılmalıdır. Bağlantı adresi `.env`'deki `DATABASE_URL`'den okunur.

### 6. Backend'i başlatma

`backend/` içinde, sanal ortam etkinken:

```powershell
uvicorn app.main:app --reload
```

| Adres | İçerik |
|---|---|
| http://127.0.0.1:8000 | API |
| http://127.0.0.1:8000/health | Sağlık kontrolü → `{"status":"ok"}` |
| http://127.0.0.1:8000/docs | Swagger UI |
| http://127.0.0.1:8000/redoc | ReDoc |
| http://127.0.0.1:8000/openapi.json | OpenAPI şeması |

Başka bir PowerShell penceresinden kontrol:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
```

`/health` yalnızca uygulamanın ayakta olduğunu gösterir, veritabanını kontrol etmez; veritabanı için 4. ve 5. adımdaki komutları kullanın.

### 7. Frontend'i hazırlama ve başlatma

Yeni bir terminalde, repo kökünden:

```powershell
cd frontend
npm install
npm run dev
```

- Arayüz: **http://localhost:5173**. Adres olarak `localhost` kullanın; Vite varsayılan ayarla bu makinede yalnızca `localhost` (IPv6 `::1`) üzerinden erişilebiliyor.
- Frontend `/api/...` isteklerini Vite proxy'si ile `http://127.0.0.1:8000` adresine iletir (`frontend/vite.config.ts`). Bu yüzden 6. adımdaki backend çalışıyor olmalıdır; CORS ayarı gerekmez.

### 8. Sistemi kullanma

1. http://localhost:5173 adresinde **Belge dosyası** alanından bir PDF veya DOCX seçin.
2. Backend'in teknik sınırı 50 MiB'dir (50 × 1024 × 1024 bayt). Arayüz bu sınırı "50 MB" olarak gösterir; daha büyük dosyaları ve PDF/DOCX dışındaki dosyaları göndermez.
3. **Sınıflandır**'a basın. İşlem senkrondur ve genellikle birkaç saniye sürer; Gemini aşaması en kötü durumda (retry'larla) ~93 sn sürebilir, arayüz 120 sn sonra zaman aşımı gösterir.
4. Sonuçta **Belge Türü** ve **Gönderileceği Kurum** görünür. Belge belirsizse "İnsan incelemesi gerekiyor" başlığıyla inceleme nedeni (`needs_review`, `review_reason`) gösterilir.

- **Taranmış PDF'ler:** gömülü metin yetersizse OCR fallback devreye girer; bunun için Tesseract ve `TESSDATA_PREFIX` gerekir (aşağıdaki 3. adım). Tesseract kurulu değilse ya da OCR'dan sonra da yeterli metin çıkmazsa belge `failed` kaydedilir ve arayüzde "Belgeden sınıflandırma için yeterli metin çıkarılamadı." görünür. DOCX'te OCR yapılmaz.
- Her sınıflandırma gerçek Gemini API'sine istek gönderir. Yüklenen dosya `backend/storage/` altına, sonuç ve çıkarılan metin veritabanına yazılır.
- API'yi doğrudan denemek için Swagger UI'ı ya da şu komutu kullanabilirsiniz: `curl.exe -F "file=@dilekce.pdf" http://127.0.0.1:8000/api/documents/classify`

### 9. Geliştirici doğrulama komutları

`backend/` içinde, sanal ortam etkinken:

```powershell
python -m pytest
python -m pip check
alembic current
Invoke-RestMethod http://127.0.0.1:8000/health
```

- `pytest` gerçek Gemini API'sine veya Docker PostgreSQL'e ihtiyaç duymaz; endpoint testleri geçici SQLite veritabanı ve sahte sınıflandırma kullanır.

`frontend/` içinde:

```powershell
npm run build
npm run lint
```

- `npm run build`, `tsc -b && vite build` çalıştırır; çıktı `frontend/dist/` klasörüne yazılır ve Git'e girmez. `npm run lint` oxlint'i çalıştırır. Frontend'de otomatik test yoktur.

### 10. Durdurma ve tekrar başlatma

- Backend ve frontend: çalıştıkları terminalde `Ctrl+C`.
- PostgreSQL, repo kökünde:

```powershell
docker compose stop     # container'ı durdurur
docker compose start    # durdurulmuş container'ı yeniden başlatır
docker compose down     # container'ı kaldırır; veriler dosya_sistemi_pgdata volume'unda kalır
docker compose up -d    # container'ı yeniden oluşturup başlatır
```

- `docker compose down -v` volume'u da siler ve tüm yerel veriler kaybolur; yalnızca bilerek kullanın.
- PostgreSQL kapalıyken yapılan classify isteği ~10 sn sonra `500` ile biter; `/health` bu durumda da `200` döner.

Sonraki çalıştırmalarda kısa sıra:

1. Docker Desktop'ı açın; repo kökünde `docker compose up -d`.
2. `backend/` içinde `.\.venv\Scripts\Activate.ps1`, `alembic upgrade head`, `uvicorn app.main:app --reload`.
3. Ayrı bir terminalde `frontend/` içinde `npm run dev`, ardından http://localhost:5173.

**macOS/Linux:** sanal ortam için `python3 -m venv .venv` ve `source .venv/bin/activate`, şablon için `cp .env.example .env`, sağlık kontrolü için `curl http://127.0.0.1:8000/health` kullanın; diğer komutlar aynıdır.

## Ayrıntılı Proje Dokümantasyonu

- [`PROJECT_BRAIN.md`](PROJECT_BRAIN.md) — amaç, mimari, kapsam
- [`DECISIONS.md`](DECISIONS.md) — aktif ürün ve teknik kararlar
- [`CURRENT_STATE.md`](CURRENT_STATE.md) — güncel durum ve sıradaki adımlar

## Kapsam Dışı (V1)

DOCX için OCR · RAG · vector database · agent sistemleri / LangGraph · fine-tuning · microservice mimarisi · admin paneli · authentication / authorization
