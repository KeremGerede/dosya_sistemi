# dosya_sistemi — Belge Sınıflandırma Modülü

Yüklenen **PDF** ve **DOCX** belgelerinden metni çıkarıp belgenin **türünü** ve ilgili **kurum/birimi** Google Gemini ile sınıflandıran küçük bir modül. Başka sistemlere entegre edilebilecek şekilde API odaklı ve bilinçli olarak sade tasarlanmıştır.

> **Durum:** Backend'in ana MVP akışı tamamlandı: `POST /api/documents/classify` aşağıdaki akışı uçtan uca çalıştırıyor. Frontend (React + Vite + TypeScript) üzerinden belge yüklenip sonuç Türkçe tür ve kurum adlarıyla gösteriliyor; incelemeye düşen belgeler ve hatalar kullanıcıya anlaşılır mesajlarla bildiriliyor. V1 final doğrulaması (gerçek belgelerle manuel test) devam ediyor.

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
- DOCX

Şimdilik desteklenmeyen:

- DOC
- diğer dosya türleri
- OCR gerektiren taranmış belgeler

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

- Maksimum dosya boyutu **50 MB**.
- Çıkarılan metin (boşlukları normalize edilmiş) en az **10 karakter** olmalı; daha kısaysa belge sınıflandırılmaz ve `failed` olarak kaydedilir (OCR denenmez).
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
| `413` | Dosya 50 MB sınırını aşıyor (kayıt oluşturulmaz) |
| `415` | Desteklenmeyen dosya türü (kayıt oluşturulmaz) |
| `422` | İki durum: (1) belge içeriği işlenemedi / yeterli metin çıkarılamadı — `failed` kaydı, gövdede `status: "failed"` ve `message`; (2) istek doğrulanamadı, ör. `file` alanı gönderilmedi — FastAPI'nin `{"detail": [...]}` gövdesi, kayıt oluşturulmaz |
| `502` | Gemini ile sınıflandırma tamamlanamadı (`failed` kaydı) |
| `500` | Beklenmeyen sunucu hatası, ör. kayıt veritabanına yazılamadı (ayrıntı dönmez; kayıt oluşmaz, yüklenen dosya silinir) |

Teknik hata detayları kullanıcıya gösterilmez, yalnızca loglanır. OpenAPI şeması `/docs` ve `/openapi.json` adreslerindedir; 422 için iki gövde de belgelenmiştir.

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
- **Aşama 6 — son adımda:** frontend ve V1 doğrulaması.
  - Adım 1 tamamlandı: classify yanıtı katalog adlarını (`document_type_name`, `institution_name`) da döndürüyor.
  - Adım 2 tamamlandı: `frontend/` iskeleti (React + Vite + TypeScript), `/api` isteklerini backend'e ileten Vite proxy'si.
  - Adım 3 tamamlandı: yükleme ekranı — dosya seçimi, PDF/DOCX ve 50 MB ön kontrolü, 120 sn zaman aşımlı classify isteği, yükleniyor durumu.
  - Adım 4 tamamlandı: sonuç ekranı (belge türü ve kurum adı; incelemeye düşen belgeler için "İnsan incelemesi gerekiyor" ve inceleme nedeni) ve HTTP koduna göre kullanıcı dostu hata mesajları.
  - Adım 5 devam ediyor: V1 öncesi audit ve polish pass (OpenAPI 422 belgesi, log güvenliği, erişilebilirlik) tamamlandı; gerçek belgelerle manuel test bekleniyor.
- **Sıradaki adım:** manuel test sonuçlarının değerlendirilmesi, final kontroller ve V1 final commit'i.

### Geliştirme ortamı

- **PostgreSQL 18** repo kökündeki `docker-compose.yml` ile çalışır. Host portu `5433`'tür (5432 kullanan yerel PostgreSQL kurulumlarıyla çakışmaması için) ve yalnızca `127.0.0.1`'e açıktır.
- **Backend** ve **frontend** yerel makinede çalışır; ikisi de container'da değildir.
- Frontend, backend'e `/api/...` göreli yollarıyla istek atar. Vite dev sunucusu bu istekleri `http://127.0.0.1:8000` adresine proxy'ler, bu yüzden backend'de CORS ayarı yoktur ve frontend kodunda backend adresi yazılı değildir.

İlk kurulum (bir kez, `backend/` içinde):

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

Frontend için ilk kurulum (bir kez, `frontend/` içinde):

```bash
npm install
```

`.env.example`'daki `DATABASE_URL` Docker Compose veritabanına göre hazırdır; `postgres`/`postgres` bilgileri yalnızca yerel geliştirme içindir. `.env` içinde `GEMINI_API_KEY` alanına kendi Gemini API anahtarınızı yazın (`GEMINI_MODEL` şablondaki değeri: `gemini-3.5-flash-lite`). Uygulama bu üç değişken olmadan başlamaz. `.env` Git'e girmez.

Günlük geliştirme akışı:

1. Docker Desktop'ı başlat.
2. Repo kökünde `docker compose up -d`.
3. `backend/` içinde sanal ortamı aktif et: `.venv\Scripts\activate`.
4. `alembic upgrade head`.
5. `uvicorn app.main:app --reload` → kontrol: `http://127.0.0.1:8000/health` adresi `{"status": "ok"}` döndürür.
6. Belge sınıflandırma: `curl -F "file=@dilekce.pdf" http://127.0.0.1:8000/api/documents/classify` (ya da `http://127.0.0.1:8000/docs`).
7. Frontend için ayrı bir terminalde, `frontend/` içinde: `npm run dev` → `http://localhost:5173`. Backend'in 5. adımda çalışıyor olması gerekir; proxy sayesinde `http://localhost:5173/api/documents/classify` isteği backend'e ulaşır. Arayüzden PDF veya DOCX seçip **Sınıflandır** ile gönderebilirsiniz. Adres olarak `localhost` kullanın; Vite varsayılan ayarla `127.0.0.1:5173` üzerinden erişilemiyor.

Frontend production derlemesi `frontend/` içinde `npm run build` ile alınır (çıktı: `dist/`, Git'e girmez). Lint: `npm run lint` (oxlint).

Testler `backend/` içinde `pytest` ile çalışır; Docker PostgreSQL veya gerçek Gemini API gerektirmez (endpoint testleri geçici SQLite veritabanı ve sahte sınıflandırma kullanır). Frontend'de henüz test yoktur.

PostgreSQL'i durdurmak için repo kökünde `docker compose down` çalıştırılır. Bu komut container'ı durdurup kaldırır ama veriler Docker volume'unda (`dosya_sistemi_pgdata`) kalır; sonraki `docker compose up -d` aynı veritabanıyla devam eder.

Komutlar Windows içindir; macOS/Linux'ta `source .venv/bin/activate` ve `cp .env.example .env` kullanılır.

Ayrıntılı proje dokümantasyonu:

- [`PROJECT_BRAIN.md`](PROJECT_BRAIN.md) — amaç, mimari, kapsam
- [`DECISIONS.md`](DECISIONS.md) — aktif ürün ve teknik kararlar
- [`CURRENT_STATE.md`](CURRENT_STATE.md) — güncel durum ve sıradaki adımlar

## Kapsam Dışı (V1)

OCR · RAG · vector database · agent sistemleri / LangGraph · fine-tuning · microservice mimarisi · admin paneli · authentication / authorization
