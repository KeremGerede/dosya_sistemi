# dosya_sistemi

Kamu kurumlarına ve belediyelere gelen PDF, Word ve görüntü formatındaki belgeleri işleyen; içerikten metin çıkaran veya gerektiğinde OCR uygulayan; belge türünü ve ilgili kurumu Google Gemini ile belirleyen; belge özeti ile gönderen bilgilerini üreten ve sonuçları PostgreSQL üzerinde saklayan yapay zekâ destekli belge sınıflandırma modülü.

Python 3.13 · FastAPI · React · PostgreSQL · Gemini · Tesseract OCR

**Durum: V1.3 geliştiriliyor** — V1.0, V1.1 ve V1.2 tamamlandı.

## İçindekiler

- [Proje Özeti](#proje-özeti)
- [Sürüm Geçmişi](#sürüm-geçmişi)
- [Projenin Amacı](#projenin-amacı)
- [Temel Özellikler](#temel-özellikler)
- [Kapsam](#kapsam)
- [Desteklenen Belge Türleri](#desteklenen-belge-türleri)
- [Nasıl Çalışır](#nasıl-çalışır)
- [Mimari](#mimari)
- [Teknolojiler](#teknolojiler)
- [API](#api)
- [Kurulum](#kurulum)
- [Çalıştırma](#çalıştırma)
- [Ortam Değişkenleri](#ortam-değişkenleri)
- [Yararlı Geliştirme Komutları](#yararlı-geliştirme-komutları)
- [Test ve Kalite](#test-ve-kalite)
- [Bilinen Sınırlar](#bilinen-sınırlar)
- [Yol Haritası](#yol-haritası)

## Proje Özeti

Kullanıcı bir belge yükler. Sistem önce dosyayı doğrular (uzantı, içerik imzası ve boyut), ardından türüne uygun yöntemle metnini çıkarır; taranmış sayfalarda ve görüntü belgelerinde OCR devreye girer. Elde edilen metin tek bir Gemini çağrısına gönderilir ve bu çağrıdan belge türü, ilgili kurum/birim, kısa bir özet ve (belgede açıkça yazıyorsa) gönderen kişi ile kurum bilgisi döner. Sonuç PostgreSQL'e kaydedilir, orijinal dosya ise uygulamanın storage klasöründe saklanır.

Sınıflandırma kapalı kataloglar üzerinden yapılır: model yeni belge türü veya kurum üretemez, backend çıktıyı ayrıca doğrular. Belge belirsizse zorla bir kuruma atanmaz; `needs_review` olarak işaretlenir ve gerekçesi kaydedilir. Böylece yanlış otomatik yönlendirme yerine kontrollü bir insan incelemesi tercih edilir.

Ayrıntılı dokümantasyon: [`PROJECT_BRAIN.md`](PROJECT_BRAIN.md) (amaç, mimari, kapsam) · [`DECISIONS.md`](DECISIONS.md) (aktif ürün ve teknik kararlar) · [`CURRENT_STATE.md`](CURRENT_STATE.md) (güncel durum ve geliştirme geçmişi).

## Sürüm Geçmişi

### V1.0 — Temel Belge Sınıflandırma

- PDF ve DOCX belge işleme
- Uzantı ve içerik imzasına dayalı dosya doğrulama, 50 MiB boyut sınırı
- Gemini structured output entegrasyonu (Pydantic şeması, katalogdan üretilen değerler)
- Belge türü sınıflandırması ve ilgili kuruma yönlendirme
- PostgreSQL üzerinde `documents` kaydı ve Alembic migration'ları
- `POST /api/documents/classify` endpoint'i
- React + Vite + TypeScript temel arayüz (yükleme, sonuç ve hata ekranı)

### V1.1 — OCR ve Taranmış PDF Desteği

- PyMuPDF'in yerleşik Tesseract desteğiyle lokal OCR fallback
- Taranmış (yalnızca görüntüden oluşan) PDF desteği
- OCR dilinin `tur` olarak sabitlenmesi
- İlk gerçek OCR doğrulama matrisi (15 senaryo)

### V1.2 — Belge Yönetimi ve Genişletilmiş Belge İşleme

- Arayüzde "Kayıtlar" görünümü
- Salt okunur liste, detay ve indirme endpoint'leri
- Sınıflandırmayla aynı çağrıdan gelen belge özeti (`summary`)
- Gönderen kişi ve kurum bilgisi (`sender_name`, `sender_institution`)
- Frontend iyileştirmeleri (sonuç ekranı ve kayıtlar tablo düzeni)
- Hybrid PDF'ler için sayfa bazlı OCR kararı
- Kısa veya bozuk metin katmanı taşıyan taramalar için yapısal OCR koşulu
- Aynı sayfadaki gömülü metin ile OCR metninin tekrarsız birleştirilmesi
- OCR çözünürlüğünün ölçüme dayanarak 300 → 400 dpi'a çıkarılması
- JPG / JPEG / PNG desteği (doğrudan OCR)
- Legacy DOC (Word 97–2003) desteği; Word'e özgü OLE stream doğrulamasıyla XLS/PPT reddi
- Kişi adı veya unvanından kurum adı türetilmesine karşı koruma (sender hallucination guard)
- Clean-clone doğrulaması (sıfırdan kurulum, migration ve uçtan uca smoke test)

### V1.3 — El Yazısı ve Gelişmiş OCR Güvenilirliği

**Geliştiriliyor.** Aşağıdaki başlıklar henüz tamamlanmadı; planlanan kapsamdır:

- Gerçek insan el yazısı benchmarkı
- El yazısı OCR kalitesinin iyileştirilmesi
- OCR çıktısı için deterministik kalite kapısı (quality gate)
- Taranmış tablo ve form belgelerinde OCR dayanıklılığı
- Düşük kaliteli metin çıkarımında `needs_review` davranışının güçlendirilmesi
- OCR kaynaklı özet ve gönderen bilgisi güvenilirliğinin artırılması

## Projenin Amacı

Kurumlara gelen belgeler tek tip değildir: dijital PDF, Word dosyası, taranmış evrak, telefonla çekilmiş fotoğraf, Word 97–2003'ten kalma legacy DOC ve birbirinden farklı sayfa düzenleri aynı gelen kutusunda bulunur.

Geleneksel süreçte her belge için bir personelin belgeyi okuması, türünü anlaması, ilgili birimi belirlemesi, kaydetmesi ve yönlendirmesi gerekir. Bu; yavaş, tekrarlayan ve kişiden kişiye değişen bir iştir.

Projenin amacı bu adımları mümkün olduğunca otomatik, standart ve izlenebilir hale getirmektir. Belge bir kez yüklendiğinde metni çıkarılır, türü ve ilgili birimi belirlenir, özeti üretilir ve sonuç kalıcı olarak kaydedilir.

> Sistem insan kararını tamamen ortadan kaldırmayı değil; açık belgeleri otomatik yönlendirirken belirsiz durumları insan incelemesine bırakmayı amaçlar.

Bu prensibin ürün karşılığı `needs_review` alanıdır. Belgeyi sınıflandırmak için yeterli bilgi yoksa, katalogdaki hiçbir kurum makul şekilde eşleşmiyorsa, birden fazla kurum arasında ciddi belirsizlik varsa veya belge beklenen kapsamın dışındaysa model zorla atama yapmaz: kayıt `needs_review` durumuna düşer ve gerekçesi `review_reason` alanına yazılır. Yanlış bir otomatik yönlendirme, incelemeye düşen bir belgeden daha maliyetlidir.

## Temel Özellikler

- Çok formatlı belge yükleme (PDF, DOC, DOCX, JPG, JPEG, PNG)
- Dosya uzantısı ve içerik imzasının birlikte doğrulanması; istemcinin content-type bilgisine güvenilmez
- PyMuPDF ile PDF metin çıkarımı
- Saf Python parser ile legacy DOC metin çıkarımı
- python-docx ile DOCX metin çıkarımı (paragraflar ve tablo hücreleri)
- JPG/JPEG/PNG belgelerde doğrudan OCR
- Taranmış ve hybrid PDF'lerde sayfa bazlı OCR fallback
- Belge türü sınıflandırması (kapalı katalog)
- İlgili kurum/birim yönlendirmesi (kapalı katalog)
- Belgenin amacını anlatan kısa Türkçe özet
- Gönderen kişi ve kurum bilgisinin çıkarımı (yalnızca belgede açıkça yazıyorsa)
- Belirsizlikte `needs_review` ile insan incelemesine yönlendirme
- PostgreSQL üzerinde kalıcı kayıt, Alembic ile şema yönetimi
- Kayıt listesi, detay görüntüleme ve orijinal dosyayı indirme
- Gemini çağrısı için timeout ve geçici hatalarda sınırlı retry
- Güvenli loglama: belge metni, API anahtarı ve ham model çıktısı loglanmaz

## Kapsam

### Kapsam Dahil

- PDF, DOC, DOCX, JPG, JPEG ve PNG belgelerin yüklenmesi ve işlenmesi
- Taranmış PDF, hybrid PDF ve görüntü belgeler için Tesseract OCR
- Belge başına tek Gemini sınıflandırma işlemi
- Belge türü, kurum, özet ve gönderen bilgisinin üretilmesi
- Belirsiz belgelerin `needs_review` olarak işaretlenmesi
- Sonuçların ve çıkarılan metnin PostgreSQL'de, orijinal dosyanın dosya sisteminde saklanması
- Kayıtların listelenmesi, detayının görüntülenmesi ve orijinal dosyanın indirilmesi
- Tek sayfalık React arayüzü (yükleme, sonuç, kayıtlar)

### Şu Anda Kapsam Dışı

Aşağıdakiler bilinçli olarak kapsam dışındadır; gelecekte kesin yapılacak özellikler değildir:

- Authentication / authorization
- Admin paneli ve kurum kataloğunun arayüzden yönetimi
- Agent sistemleri ve LangGraph
- RAG
- Vector database
- Kuyruk / arka plan işleri ve asenkron workflow
- Production deployment mimarisi (containerize etme, reverse proxy, CORS kararı)
- Desteklenmeyen dosya formatları (GIF, TIFF, BMP, WebP, HEIC)

## Desteklenen Belge Türleri

| Format | İşleme Yöntemi | OCR |
|---|---|---|
| PDF | PyMuPDF | Gerektiğinde, sayfa bazlı |
| DOC | legacy-doc | Hayır |
| DOCX | python-docx | Hayır |
| JPG / JPEG | PyMuPDF + Tesseract | Evet |
| PNG | PyMuPDF + Tesseract | Evet |

- **DOC**, Word 97–2003 binary (OLE) formatıdır. Saf Python bir parser ile doğrudan baytlardan okunur; Microsoft Word, LibreOffice veya antiword kurulu olmasına gerek yoktur.
- **DOC ve DOCX** belgelerde OCR yapılmaz; gömülü görüntülerdeki metin, makrolar, header/footer ve biçimlendirme alınmaz.
- **PDF**'lerde dijital ve taranmış sayfaların birlikte bulunduğu hybrid belgeler desteklenir; OCR kararı her sayfa için ayrı verilir.
- **Desteklenmeyen formatlar:** GIF, TIFF, BMP, WebP, HEIC ve diğerleri `415` ile reddedilir.
- Görüntü belgelerinde ve taranmış PDF sayfalarında OCR için Tesseract ve `tur` dil paketi gerekir; kurulu değilse bu belgeler `failed` olur.

## Nasıl Çalışır

### Ana Pipeline

```mermaid
flowchart LR
    A[Belge Yükleme] --> B[Dosya Doğrulama]
    B --> C[Storage]
    C --> D[Metin Çıkarma / OCR]
    D --> E[Metin Normalizasyonu]
    E --> F[Gemini]
    F --> G[Belge Türü]
    F --> H[Kurum]
    F --> I[Özet ve Gönderen]
    G --> J[PostgreSQL]
    H --> J
    I --> J
    J --> K[API / Frontend]
```

Belge `multipart/form-data` ile yüklenir ve önce kabul kontrolünden geçer: boyut 50 MiB'ı aşmamalı, uzantı ile dosya imzası birbirini doğrulamalıdır. Kabul edilmeyen dosya saklanmaz ve kayıt oluşturulmaz. Kabul edilen belgeye bir UUID verilir, orijinal dosya bu UUID ile storage klasörüne yazılır ve türüne uygun yöntemle metni çıkarılır. Metin normalize edilir (ardışık boşluklar tek boşluğa indirilir) ve en az 10 karakter olmalıdır; aksi halde belge Gemini'ye hiç gönderilmeden `failed` kaydedilir. Yeterli metin varsa ilk 50.000 karakter, iki katalogla birlikte tek bir Gemini çağrısına gönderilir; yanıt structured output olarak alınır ve backend tarafından kataloglara karşı yeniden doğrulanır. Sonuç `documents` tablosuna yazılır ve aynı istekte istemciye döndürülür; işlem baştan sona senkrondur.

### Dosya İşleme Pipeline'ı

```mermaid
flowchart TD
    A[Belge] --> B{Dosya Formatı}

    B -->|PDF| C[PyMuPDF]
    B -->|DOC| D[legacy-doc]
    B -->|DOCX| E[python-docx]
    B -->|JPG / JPEG / PNG| F[Doğrudan OCR]

    C --> G{Sayfada yeterli gömülü metin var mı?}
    G -->|Evet| H[Gömülü Metni Kullan]
    G -->|Hayır / Yapısal OCR Gerekli| I[Tesseract OCR]

    H --> J[Normalize Edilmiş Metin]
    I --> J
    D --> J
    E --> J
    F --> J
```

PDF'te bir sayfa iki durumda OCR'lanır: kendi gömülü metni 10 karakterin altındaysa (sayfa taranmış sayılır) ya da sayfa alanının en az %50'si görüntüyken gömülü metni 200 karakteri geçmiyorsa (metin katmanı bozuk olabilir). İkinci durumda gömülü metin ile OCR metni deterministik olarak karşılaştırılır: aynı içerik iki kez yazılmaz, farklı bilgi taşıyorlarsa ikisi de korunur. Tamamen metin tabanlı PDF'lerde hiç OCR çağrısı yapılmaz. Görüntü belgelerinde gömülü metin aranmaz; dosya tek sayfalık belge olarak doğrudan OCR'lanır. OCR yapılandırılmamışsa veya hata verirse ilgili sayfa gömülü metniyle değerlendirilir: OCR bir iyileştirmedir, başarısızlığı yeni bir hata sınıfı doğurmaz.

## Mimari

| Bileşen | Sorumluluk |
|---|---|
| React + Vite frontend | Belge yükleme, sonuç gösterimi, kayıtlar görünümü |
| FastAPI backend | HTTP sözleşmesi, akış sıralaması, durum belirleme |
| Dosya işleme katmanı | Kabul kontrolü, storage, metin çıkarımı ve OCR |
| Gemini sınıflandırma | Prompt, structured output, çıktı doğrulama, retry politikası |
| PostgreSQL | `documents` tablosu; sınıflandırma sonucu ve çıkarılan metin |
| Dosya sistemi storage | Orijinal belgeler (`backend/storage/<uuid>.<uzantı>`) |

Mimari bilinçli olarak sade tutulur:

- Tek bir monolit uygulama; microservice yoktur.
- İşleme senkrondur: tek istek → tek yanıt; kuyruk veya arka plan işi yoktur.
- Belge başına **tek** sınıflandırma işlemi yapılır; retry yalnızca aynı çağrının tekrarıdır.
- Agent sistemi, RAG ve vector database kullanılmaz.
- Repository/factory gibi ek soyutlama katmanları eklenmez; yeni katman ancak somut gerekçe ve `DECISIONS.md` kaydıyla gelir.

Geliştirme ortamında PostgreSQL Docker Compose ile çalışır; backend ve frontend yerel makinede çalışır ve containerize edilmez.

## Teknolojiler

| Katman | Teknoloji |
|---|---|
| Backend | Python 3.13, FastAPI |
| LLM | Google Gemini (`google-genai`) |
| PDF | PyMuPDF |
| OCR | Tesseract OCR (PyMuPDF'in yerleşik desteği) |
| DOC | legacy-doc |
| DOCX | python-docx |
| Database | PostgreSQL 18 |
| ORM | SQLAlchemy 2 (senkron, psycopg 3) |
| Migration | Alembic |
| Validation | Pydantic |
| Frontend | React, TypeScript, Vite (düz CSS) |
| Local Database | Docker Compose |

Sürümler `backend/requirements.txt` ve `frontend/package.json` dosyalarında pinlenmiştir.

## API

| Method | Endpoint | Açıklama |
|---|---|---|
| GET | `/health` | Uygulama sağlık kontrolü → `{"status": "ok"}` |
| POST | `/api/documents/classify` | Belge yükleme ve sınıflandırma |
| GET | `/api/documents` | Kayıtları en yeniden eskiye listeler |
| GET | `/api/documents/{document_id}` | Belge detayı; çıkarılan metnin tamamını içerir |
| GET | `/api/documents/{document_id}/download` | Orijinal belgeyi yüklendiği adla indirir |

Kayıt endpoint'leri salt okunurdur: güncelleme, silme, arama, filtre, sayfalama ve authentication yoktur. Dosyanın storage yolu (`file_reference`) hiçbir yanıtta dönmez.

**Classify yanıtının alanları:** `document_id`, `file_name`, `file_type`, `document_type`, `document_type_name`, `institution_id`, `institution_name`, `needs_review`, `review_reason`, `summary`, `sender_name`, `sender_institution`, `status` (`classified` | `needs_review` | `failed`).

`summary` başarılı sonuçlarda her zaman doludur. `sender_name` ve `sender_institution` yalnızca belgede açıkça yazıyorsa dolar; yazmıyorsa `null` kalır ve belgenin muhatabı olan müdürlük gönderen sayılmaz. Üç alan da sınıflandırmayla aynı Gemini çağrısından gelir. `document_type_name` ve `institution_name` katalog adlarıdır; ID `null` ise ilgili ad da `null` olur.

**HTTP sözleşmesi:**

| Kod | Anlamı |
|---|---|
| `200` | Sınıflandırıldı (`classified` veya `needs_review`) |
| `413` | Dosya 50 MiB sınırını aşıyor; kayıt oluşturulmaz |
| `415` | Desteklenmeyen dosya türü veya imza uyuşmazlığı; kayıt oluşturulmaz |
| `422` | Belge içeriği işlenemedi (`failed` kaydı + `message`) veya istek doğrulanamadı (kayıt oluşmaz) |
| `500` | Beklenmeyen sunucu hatası; kayıt oluşmaz, yarım kalan dosya silinir |
| `502` | Gemini ile sınıflandırma tamamlanamadı (`failed` kaydı) |

İki farklı `422` gövdesi, gövdedeki `status` alanıyla ayırt edilir. Teknik hata detayları istemciye gönderilmez, yalnızca loglanır.

İnteraktif dokümantasyon: `/docs` (Swagger UI), `/redoc` (ReDoc), `/openapi.json` (OpenAPI şeması).

## Kurulum

Komutlar Windows PowerShell içindir; macOS/Linux farkları bölümün sonundadır.

### Gereksinimler

- **Git**
- **Python 3.13** — proje bu sürümle geliştirildi ve test edildi.
- **Node.js ve npm** — Vite 8'in desteklediği bir sürüm (`^20.19.0 || >=22.12.0`). Node.js 26.7 ve npm 11.19 ile doğrulandı.
- **Docker Desktop** — yalnızca yerel PostgreSQL 18 için.
- **Gemini API anahtarı** — sınıflandırma gerçek API'yi çağırır; anahtar olmadan backend başlamaz. Otomatik testler anahtar gerektirmez.
- **`.doc` için ek kurulum gerekmez** — Word 97–2003 belgeleri `requirements.txt` içindeki saf Python `legacy-doc` paketiyle okunur; Microsoft Word, LibreOffice veya antiword gerekmez.
- **Tesseract OCR (opsiyonel)** — taranmış PDF'ler ve görüntü belgeleri için, **`tur` dil paketiyle**. Kurulu değilse uygulama normal çalışır, yalnızca bu belgeler `failed` olur. Ayrı bir Python paketi veya PATH'te `tesseract` komutu gerekmez; yalnızca `tessdata` klasörü gerekir.
  - Windows: `winget install --id tesseract-ocr.tesseract` (kurulum sihirbazında **Turkish** bileşenini seçin)
  - Debian/Ubuntu: `sudo apt install tesseract-ocr tesseract-ocr-tur`
  - macOS: `brew install tesseract tesseract-lang`
  - Doğrulama: `tesseract --list-langs` çıktısında `tur` görünmelidir.

### Repoyu Klonlama

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

### Backend Kurulumu

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Ardından ortam değişkeni şablonunu kopyalayın (mevcut bir `.env` varsa üzerine yazmaz) ve değerleri [Ortam Değişkenleri](#ortam-değişkenleri) bölümüne göre doldurun:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

- PowerShell betik çalıştırmayı engelliyorsa sanal ortamı etkinleştirmeden komutları doğrudan çalıştırabilirsiniz: `.\.venv\Scripts\python.exe -m pip install -r requirements.txt`, `.\.venv\Scripts\python.exe -m alembic upgrade head`, `.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload`.
- `cmd.exe` kullanıyorsanız etkinleştirme komutu `.venv\Scripts\activate.bat`'tır.

### PostgreSQL

Docker Desktop açıkken, repo kökünde:

```powershell
docker compose up -d
docker compose ps
```

- Beklenen: `dosya-sistemi-postgres` container'ı için `Up ... (healthy)`. İlk açılışta birkaç saniye `starting` görünebilir.
- Port eşlemesi `127.0.0.1:5433 → 5432`'dir ve yalnızca localhost'a açıktır; makinedeki yerel bir PostgreSQL servisi (5432) etkilenmez.
- Veriler Docker'ın yönettiği `dosya_sistemi_pgdata` volume'unda kalır.

Şemayı oluşturmak için `backend/` içinde, sanal ortam etkinken:

```powershell
alembic upgrade head
alembic current
```

`alembic current` çıktısı `(head)` ile bitmelidir. Bu komutlar `alembic.ini` ve `app` paketi nedeniyle `backend/` klasöründen çalıştırılmalıdır.

### Frontend Kurulumu

```powershell
cd frontend
npm install
```

**macOS/Linux farkları:** sanal ortam için `python3 -m venv .venv` ve `source .venv/bin/activate`, şablon için `cp .env.example .env`, sağlık kontrolü için `curl http://127.0.0.1:8000/health`. Diğer komutlar aynıdır.

## Çalıştırma

Proje kuruluysa günlük kullanım üç terminalden oluşur.

### Terminal 1 — PostgreSQL

Repo kökünde (Docker Desktop açık olmalı):

```powershell
docker compose up -d
```

### Terminal 2 — Backend

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
alembic upgrade head
uvicorn app.main:app --reload
```

### Terminal 3 — Frontend

```powershell
cd frontend
npm run dev
```

Adresler:

- Frontend: http://localhost:5173
- Backend: http://127.0.0.1:8000
- Health: http://127.0.0.1:8000/health
- Swagger: http://127.0.0.1:8000/docs

Arayüz adresinde `localhost` kullanın; Vite dev sunucusu varsayılan ayarla `127.0.0.1:5173` üzerinden erişilebilir olmayabilir. Frontend `/api/...` isteklerini Vite proxy'si ile `http://127.0.0.1:8000` adresine iletir, bu yüzden backend çalışıyor olmalıdır; ayrı bir CORS ayarı gerekmez.

Belgeyi arayüzden yükleyebilir ya da API'yi doğrudan çağırabilirsiniz:

```powershell
curl.exe -F "file=@dilekce.pdf" http://127.0.0.1:8000/api/documents/classify
```

Her sınıflandırma gerçek Gemini API'sine istek gönderir; yüklenen dosya `backend/storage/` altına, sonuç ve çıkarılan metin veritabanına yazılır.

## Ortam Değişkenleri

Değerler `backend/.env` dosyasında tutulur. `.env` Git'e girmez; `.env.example` şablon olarak commit edilir. Gerçek anahtarı başka bir dosyaya yazmayın.

| Değişken | Zorunlu | Açıklama |
|---|---|---|
| `GEMINI_API_KEY` | Evet | Google Gemini API anahtarı. Şablonda boştur; kendi anahtarınızı yazın |
| `GEMINI_MODEL` | Evet | Sınıflandırma modeli. Şablondaki değer `gemini-3.5-flash-lite`; kodda varsayılan yoktur |
| `DATABASE_URL` | Evet | PostgreSQL bağlantı adresi (psycopg 3). Şablondaki değer yerel Docker veritabanına aittir: `postgresql+psycopg://postgres:postgres@127.0.0.1:5433/dosya_sistemi?connect_timeout=10` |
| `TESSDATA_PREFIX` | Hayır | Tesseract `tessdata` klasörünün yolu. Taranmış PDF'lerde OCR fallback'i ve JPG/JPEG/PNG belgelerinde doğrudan OCR için kullanılır |

- İlk üç değişkenden biri eksikse backend (ve `/health`) başlamaz; eksik yapılandırma sessizce bir varsayılana düşmez.
- `TESSDATA_PREFIX` tanımlı değilse uygulama normal başlar, yalnızca OCR atlanır ve OCR'a bağımlı belgeler `failed` olur. Windows'ta tipik değer: `C:\Program Files\Tesseract-OCR\tessdata`. Klasörde `tur.traineddata` bulunmalıdır.
- `DATABASE_URL`'de `localhost` yerine `127.0.0.1` kullanın; port yalnızca IPv4 localhost'a açıktır.
- `connect_timeout=10`, veritabanına ulaşılamadığında bağlantı denemesini 10 saniyede sonlandırır. Daha önce oluşturulmuş bir `.env`'de bu parametre yoksa adresin sonuna `?connect_timeout=10` ekleyin.
- `postgres`/`postgres` kullanıcı bilgileri yalnızca yerel geliştirme içindir.

## Yararlı Geliştirme Komutları

### Backend

`backend/` içinde, sanal ortam etkinken:

| Komut | Amaç |
|---|---|
| `python -m pytest` | Otomatik test paketini çalıştırır (Docker veya Gemini gerekmez) |
| `python -m pip check` | Bağımlılık çakışması olup olmadığını kontrol eder |
| `alembic current` | Veritabanının hangi migration sürümünde olduğunu gösterir |
| `alembic check` | Modeller ile şema arasında fark olup olmadığını kontrol eder |
| `uvicorn app.main:app --reload` | Backend'i geliştirme modunda başlatır |

### Frontend

`frontend/` içinde:

| Komut | Amaç |
|---|---|
| `npm run dev` | Vite dev sunucusunu başlatır |
| `npm run build` | TypeScript derlemesi ve production build (`dist/`) |
| `npm run lint` | oxlint ile statik analiz |

### Docker

Repo kökünde:

| Komut | Amaç |
|---|---|
| `docker compose up -d` | PostgreSQL container'ını başlatır |
| `docker compose ps` | Container durumunu gösterir |
| `docker compose stop` | Container'ı durdurur |
| `docker compose down` | Container'ı kaldırır; veriler volume'da kalır |

> **Uyarı:** `docker compose down -v` komutu `dosya_sistemi_pgdata` volume'unu da siler ve tüm yerel veritabanı içeriği kaybolur. Yalnızca bilerek kullanın.

### Git / Kalite

| Komut | Amaç |
|---|---|
| `git status` | Çalışma ağacının durumu |
| `git diff` | Commit'lenmemiş değişiklikler |
| `git diff --check` | Whitespace ve satır sonu sorunları |

## Test ve Kalite

### Otomatik Testler

Doğrulanmış baseline: **231 passed**. Testler gerçek Gemini API'sine veya Docker PostgreSQL'e ihtiyaç duymaz; endpoint testleri geçici SQLite veritabanı ve sahte sınıflandırma kullanır.

Kapsanan alanlar:

- Dosya türü ve imza doğrulaması, boyut sınırı
- PDF metin çıkarımı ve sayfa bazlı OCR kararı
- DOC metin çıkarımı (gerçek `.doc` fixture'ları ile)
- DOCX metin çıkarımı, tablo hücreleri ve birleştirilmiş hücreler
- JPG/JPEG/PNG kabulü ve OCR yolu
- API sözleşmesi ve HTTP durum kodları
- Liste, detay ve indirme endpoint'leri
- Gemini retry ve timeout davranışı
- Structured output doğrulaması ve katalog kısıtları
- Özet ve gönderen metadata kuralları
- Log ve güvenlik davranışı (belge metni ve anahtar loglanmaz)

### Gerçek / Uçtan Uca Doğrulamalar

- Gerçek PostgreSQL üzerinde çalışma
- Gerçek Gemini API ile sınıflandırma
- Boş veritabanında sıfırdan Alembic migration
- Clean-clone smoke test (GitHub'dan sıfır klon → kurulum → çalıştırma)
- PDF, DOC, DOCX ve JPG ile uçtan uca smoke test
- Hybrid PDF senaryoları
- DOC ↔ DOCX format eşdeğerliği
- OCR çözünürlük ve bozulma benchmarkları

Ayrıntılı test geçmişi ve ölçüm sonuçları için: [`CURRENT_STATE.md`](CURRENT_STATE.md)

## Bilinen Sınırlar

- Gerçek insan el yazısı henüz güvenilir biçimde desteklenmiyor; bu başlık V1.3 kapsamında geliştiriliyor.
- Taranmış çizgili tablo ve formlarda OCR bazı satırları düşürebilir.
- EXIF bilgisi olmayan 90°/180° döndürülmüş görüntülerde OCR anlamsız metin üretebilir; otomatik döndürme/OSD yoktur.
- Gemini yalnızca metnin ilk 50.000 karakterini değerlendirir; belirleyici bilgi sonrasında yer alıyorsa sınıflandırma etkilenebilir.
- DOC ve DOCX belgelerde header/footer metni çıkarılmaz.
- DOC ve DOCX içindeki gömülü görüntüler OCR edilmez.
- Authentication ve authorization yoktur.
- İşlem senkrondur; Gemini aşaması en kötü durumda retry'larla birlikte yaklaşık 93 saniye sürebilir.
- Kurum yönlendirmesi mevcut katalogla sınırlıdır; katalogda olmayan birimlere ait belgeler `needs_review` olur.
- OCR için Tesseract ve `tur` dil paketi gerekir; kurulu değilse taranmış PDF'ler ve görüntü belgeleri `failed` olur.
- Frontend'in classify isteği için zaman aşımı 120 saniyedir; süre dolsa da backend işlemeyi tamamlamış olabilir.
- Aynı makinede aynı projeden ikinci bir Docker Compose stack'i başlatmak container adı, port ve volume çakışmasına yol açar; temiz bir makinede tek klon sorunsuz çalışır.

Daha ayrıntılı teknik sınırlar ve edge-case listesi için: [`CURRENT_STATE.md`](CURRENT_STATE.md)

## Yol Haritası

### V1.3 — El Yazısı ve Gelişmiş OCR Güvenilirliği

**Geliştiriliyor.** Planlanan kapsam:

- Gerçek insan el yazısı benchmarkı
- El yazısı OCR kalitesinin iyileştirilmesi
- OCR çıktısı için kalite kapısı
- Taranmış tablo ve form belgelerinde OCR dayanıklılığı
- Düşük kaliteli metin çıkarımında `needs_review` davranışının güçlendirilmesi
- OCR kaynaklı özet ve gönderen bilgisi güvenilirliği

### Daha Sonra Değerlendirilebilecekler

Aşağıdakiler taahhüt değildir; ihtiyaç doğarsa `DECISIONS.md` üzerinden karara bağlanır:

- Authentication / authorization
- Production deployment kararları
- Kurum kataloğunun genişletilmesi ve açıklamalarının iyileştirilmesi
- Otomatik döndürme / orientation iyileştirmeleri
- 50.000 karakteri aşan belgeler için gelişmiş metin seçimi stratejisi
