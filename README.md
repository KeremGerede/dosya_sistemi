# dosya_sistemi — Belge Sınıflandırma Modülü

Yüklenen **PDF** ve **DOCX** belgelerinden metni çıkarıp belgenin **türünü** ve ilgili **kurum/birimi** Google Gemini ile sınıflandıran küçük bir modül. Başka sistemlere entegre edilebilecek şekilde API odaklı ve bilinçli olarak sade tasarlanmıştır.

> **Durum:** Backend'de veritabanı altyapısı, PDF/DOCX dosya işleme ve Gemini sınıflandırma katmanı hazır ve testli. Bunları uçtan uca bağlayan `POST /api/documents/classify` endpoint'i ve frontend **henüz yok**. Aşağıdaki akış ve classify API'si **planlanan** uçtan uca davranışı anlatır.

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

**Frontend:** React · Vite

**Geliştirme ortamı:** PostgreSQL 18 Docker Compose ile çalışır; backend (ve ileride frontend) yerel makinede çalışır.

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

Şu anda çalışan tek endpoint: **`GET /health`** → `{"status": "ok"}`.

> Classify endpoint'i **henüz implement edilmedi**; aşağıdakiler planlanan sözleşmedir.

**`POST /api/documents/classify`** — `multipart/form-data` içinde tek bir PDF veya DOCX dosyası.

Planlanan yanıt alanları: `document_id`, `file_name`, `file_type`, `document_type`, `institution_id`, `needs_review`, `review_reason`, `status` (`classified` | `needs_review` | `failed`).

| HTTP kodu | Anlamı |
|---|---|
| `413` | Dosya 50 MB sınırını aşıyor (kayıt oluşturulmaz) |
| `415` | Desteklenmeyen dosya türü (kayıt oluşturulmaz) |
| `422` | Belge içeriği işlenemedi / yeterli metin çıkarılamadı |
| `502` | Gemini ile sınıflandırma tamamlanamadı |

Teknik hata detayları kullanıcıya gösterilmez, yalnızca loglanır.

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
- **Henüz yok:** `POST /api/documents/classify` endpoint'i (dosya işleme ve sınıflandırma henüz API'ye ve veritabanına bağlı değil) ve frontend.
- **Sıradaki aşama:** `POST /api/documents/classify` endpoint'i.

### Geliştirme ortamı

- **PostgreSQL 18** repo kökündeki `docker-compose.yml` ile çalışır. Host portu `5433`'tür (5432 kullanan yerel PostgreSQL kurulumlarıyla çakışmaması için) ve yalnızca `127.0.0.1`'e açıktır.
- **Backend** yerel makinede çalışır; **frontend** de ileride yerel makinede çalışacaktır. Şimdilik ikisi de container'da değildir.

İlk kurulum (bir kez, `backend/` içinde):

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

`.env.example`'daki `DATABASE_URL` Docker Compose veritabanına göre hazırdır; `postgres`/`postgres` bilgileri yalnızca yerel geliştirme içindir. `.env` içinde `GEMINI_API_KEY` alanına kendi Gemini API anahtarınızı yazın (`GEMINI_MODEL` şablondaki değeri: `gemini-3.5-flash-lite`). `.env` Git'e girmez.

Günlük geliştirme akışı:

1. Docker Desktop'ı başlat.
2. Repo kökünde `docker compose up -d`.
3. `backend/` içinde sanal ortamı aktif et: `.venv\Scripts\activate`.
4. `alembic upgrade head`.
5. `uvicorn app.main:app --reload` → kontrol: `http://127.0.0.1:8000/health` adresi `{"status": "ok"}` döndürür.

Testler `backend/` içinde `pytest` ile çalışır; veritabanı, Docker veya gerçek Gemini API gerektirmez.

PostgreSQL'i durdurmak için repo kökünde `docker compose down` çalıştırılır. Bu komut container'ı durdurup kaldırır ama veriler Docker volume'unda (`dosya_sistemi_pgdata`) kalır; sonraki `docker compose up -d` aynı veritabanıyla devam eder.

Komutlar Windows içindir; macOS/Linux'ta `source .venv/bin/activate` ve `cp .env.example .env` kullanılır.

Ayrıntılı proje dokümantasyonu:

- [`PROJECT_BRAIN.md`](PROJECT_BRAIN.md) — amaç, mimari, kapsam
- [`DECISIONS.md`](DECISIONS.md) — aktif ürün ve teknik kararlar
- [`CURRENT_STATE.md`](CURRENT_STATE.md) — güncel durum ve sıradaki adımlar

## Kapsam Dışı (V1)

OCR · RAG · vector database · agent sistemleri / LangGraph · fine-tuning · microservice mimarisi · admin paneli · authentication / authorization
