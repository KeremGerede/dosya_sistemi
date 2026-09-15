# dosya_sistemi — Belge Sınıflandırma Modülü

Yüklenen **PDF** ve **DOCX** belgelerinden metni çıkarıp belgenin **türünü** ve ilgili **kurum/birimi** Google Gemini ile sınıflandıran küçük bir modül. Başka sistemlere entegre edilebilecek şekilde API odaklı ve bilinçli olarak sade tasarlanmıştır.

> **Durum:** MVP mimarisi ve kararları tamamlandı; henüz uygulama kodu yok. Aşağıdaki akış ve API **planlanan** davranışı anlatır.

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

**Backend:** Python · FastAPI · PyMuPDF · python-docx · Google Gemini API · Pydantic · SQLAlchemy · PostgreSQL · Alembic

**Frontend:** React · Vite

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

> Endpoint henüz **implementasyon aşamasındadır**; aşağıdakiler planlanan sözleşmedir.

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
- **Sıradaki aşama:** backend geliştirmesi (FastAPI iskeleti, veritabanı modeli ve Alembic migration'ları).
- Henüz çalıştırılabilir backend veya frontend bulunmuyor.

Ayrıntılı proje dokümantasyonu:

- [`PROJECT_BRAIN.md`](PROJECT_BRAIN.md) — amaç, mimari, kapsam
- [`DECISIONS.md`](DECISIONS.md) — aktif ürün ve teknik kararlar
- [`CURRENT_STATE.md`](CURRENT_STATE.md) — güncel durum ve sıradaki adımlar

## Kapsam Dışı (V1)

OCR · RAG · vector database · agent sistemleri / LangGraph · fine-tuning · microservice mimarisi · admin paneli · authentication / authorization
