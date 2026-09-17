# PROJECT_BRAIN — Belge Sınıflandırma Modülü

> Projenin kalıcı referansı. Yalnızca projenin temel amacı, mimarisi veya kapsamı gerçekten değiştiğinde güncellenir.
> Güncel durum → `CURRENT_STATE.md` · Aktif kararlar → `DECISIONS.md` · Çalışma kuralları → `CLAUDE.md`
>
> Bu dosyayla çelişen bir değişiklik gerekiyorsa önce `DECISIONS.md`'deki ilgili kararı güncelle, sonra bu dosyayı ona göre düzelt.

## 1. Amaç

Kullanıcının yüklediği metin tabanlı bir **PDF veya DOCX** belgesini **tek bir Gemini sınıflandırma çağrısıyla** belge türü ve ilgili kurum/birim açısından sınıflandıran; orijinal dosyayı, çıkarılan metni ve sonucu saklayan küçük bir modül.
İleride başka sistemlerle entegre edilecek; bu yüzden API odaklı, bağımsız çalışabilen ve sade olmalı.

Ana hedefler: **basitlik · hızlı geliştirme · verimlilik · ileride genişletilebilirlik.**

## 2. Temel akış

1. İstemci `POST /api/documents/classify` ile dosya yükler (`multipart/form-data`).
2. Kabul kontrolü: dosya PDF veya DOCX değilse ya da 50 MB'ı aşıyorsa **kayıt oluşturmadan** 4xx ile reddedilir.
3. Belge için `document_id` (UUID) üretilir; orijinal dosya `backend/storage/<document_id>.<uzanti>` olarak kaydedilir.
4. Metin çıkarılır: PDF → PyMuPDF, DOCX → python-docx.
5. PDF'te normalize edilmiş metin 10 karakterden kısaysa belge taranmış sayılır ve **OCR fallback** denenir (`tur+eng`, 300 dpi; D-003, D-042). Çıkarım hata verirse ya da OCR'dan sonra da metin 10 karakterden kısaysa belge Gemini'ye gönderilmeden `failed` olarak kaydedilir.
6. Metnin en fazla ilk 50.000 karakteri, belge türü ve kurum kataloglarıyla birlikte **tek bir** Gemini çağrısına gönderilir; yanıt Pydantic şemasına uygun structured output olarak alınır. Geçici hatalarda (network, timeout, `429`, `5xx`, geçersiz model çıktısı) aynı çağrı toplam en fazla 3 kez denenir.
7. Backend çıktıyı kataloglara karşı doğrular ve `status` değerini belirler. Gemini çağrısı sonuç vermezse belge `failed` olur.
8. Dosya referansı, çıkarılan metin ve sınıflandırma sonucu `documents` tablosuna yazılır.
9. API sonucu döndürür (`failed` durumunda `422` veya `502`). Teknik hata detayları istemciye gönderilmez, loglanır.

İşlem senkrondur: tek istek → tek yanıt. Kuyruk veya arka plan işi yoktur.

## 3. Teknoloji yığını

| Katman | Teknoloji |
|---|---|
| Backend | Python, FastAPI |
| PDF metin çıkarımı | PyMuPDF |
| DOCX metin çıkarımı | python-docx |
| LLM | Google Gemini API, `google-genai` SDK (structured output, Pydantic şema) |
| Veri doğrulama | Pydantic |
| ORM / DB | SQLAlchemy, PostgreSQL |
| Migration | Alembic |
| Dosya depolama | Uygulamanın storage klasörü (dosya sistemi) |
| Frontend | React, Vite, TypeScript (npm, düz CSS) |
| Geliştirme veritabanı | PostgreSQL 18, Docker Compose (yalnızca yerel geliştirme) |

Ortam değişkenleri:

| Değişken | Açıklama |
|---|---|
| `GEMINI_API_KEY` | **Zorunlu.** Gemini API anahtarı; yalnızca `.env`'de tutulur |
| `GEMINI_MODEL` | **Zorunlu.** Sınıflandırma modeli; `.env.example` değeri: `gemini-3.5-flash-lite` |
| `DATABASE_URL` | **Zorunlu.** PostgreSQL bağlantı adresi; yerel geliştirme: `postgresql+psycopg://postgres:postgres@127.0.0.1:5433/dosya_sistemi?connect_timeout=10` (bağlantı kurma en fazla 10 sn, D-041) |
| `TESSDATA_PREFIX` | **Opsiyonel.** Tesseract `tessdata` klasörü; taranmış PDF'lerde OCR fallback'i için gerekir (D-042). Tanımlı değilse OCR atlanır, uygulama normal çalışır |

Model adı kodda sabit yazılmaz ve kodda varsayılan model yoktur. `GEMINI_API_KEY` veya `GEMINI_MODEL` tanımlı değilse Gemini istemcisi yüklenirken (uygulama başlangıcı) açık bir yapılandırma hatası verilir (fail fast); sessizce bir modele düşülmez. `DATABASE_URL` `settings.py` yüklenirken kontrol edilir. `TESSDATA_PREFIX` opsiyoneldir ve yokluğu uygulamayı durdurmaz. `.env` ve yüklenen dosyalar repoya commit edilmez; `.env.example` commit edilir.

## 4. Mimari ve klasör yapısı

```text
docker-compose.yml                      # yalnızca yerel geliştirme PostgreSQL'i (tek servis)
backend/
  .env.example                          # ortam değişkeni şablonu (GEMINI_MODEL varsayılanı dahil)
  alembic.ini
  alembic/                              # Alembic migration'ları
  app/
    main.py                             # FastAPI uygulaması, router kaydı
    settings.py                         # ortam değişkenleri (backend/.env), require_env(); DATABASE_URL zorunlu
    database.py                         # engine, session
    api/documents.py                    # POST /api/documents/classify — akışı sırayla çağırır, status belirler
    services/file_service.py            # kabul kontrolü, storage'a kaydetme, PDF/DOCX metin çıkarımı
    services/classification_service.py  # katalog yükleme, prompt, çıktı doğrulama, retry politikası (D-033)
    llm/gemini_client.py                # google-genai ince sarmalayıcısı: tek istek, 30 sn timeout, SDK retry kapalı
    schemas/classification.py           # LLM çıktı şeması + API yanıt şeması
    models/document.py                  # SQLAlchemy Document modeli
    config/document_types.json          # belge türü kataloğu
    config/institutions.json            # kurum kataloğu
  storage/                              # orijinal dosyalar: <document_id>.<uzanti> (git'e girmez)
frontend/                               # React + Vite: dosya seç → yükle → sonucu göster (tek sayfa)
```

Bu yapı yön gösterir, zorunlu değildir. Kurallar:

- Daha basit bir alternatif varsa tercih edilir (ör. `gemini_client.py` tek fonksiyondan ibaret kalırsa `classification_service.py` içine katlanabilir).
- Endpoint doğrudan SQLAlchemy session kullanabilir; repository, factory veya ek servis katmanı eklenmez.
- Yeni bir soyutlama katmanı için somut gerekçe ve `DECISIONS.md` kaydı gerekir.
- Sayısal sınırlar (50 MB, 10 karakter, 50.000 karakter, 3 deneme, 30 sn timeout, 1/2 sn bekleme) kodda tek bir yerde tanımlanır. Tek istisna: 50 MB sınırı D-040 gereği frontend ön kontrolünde de tanımlıdır; ikisi birlikte güncellenir.

**Geliştirme ortamı** (D-036):

- PostgreSQL 18 Docker Compose ile çalışır. Tek servis; veriler Docker yönetimindeki `dosya_sistemi_pgdata` volume'unda kalır. Host portu `127.0.0.1:5433`.
- FastAPI backend yerel makinede çalışır (`backend/.venv`, `alembic upgrade head`, `uvicorn app.main:app --reload`).
- React/Vite frontend de yerel makinede çalışır. İstekler `/api/...` göreli yollarına yapılır; Vite dev sunucusu bunları `http://127.0.0.1:8000` adresine proxy'ler, backend'e CORS middleware eklenmez (D-038).
- Backend ve frontend şimdilik containerize edilmez.

## 5. Dosya işleme ve depolama

| `file_type` | Uzantı | Metin çıkarımı |
|---|---|---|
| `pdf` | `.pdf` | PyMuPDF |
| `docx` | `.docx` | python-docx |

**Kabul kontrolü** — dosya storage'a yazılmadan ve kayıt oluşturulmadan önce yapılır:

- Maksimum dosya boyutu **50 MB**. Aşan dosya `413` ile reddedilir.
- `.doc` ve PDF/DOCX dışındaki tüm türler `415` ile reddedilir.
- Tür yalnızca istemcinin gönderdiği content-type'a bakılarak belirlenmez; uzantı ve dosya imzası (PDF: `%PDF`, DOCX: ZIP) birlikte kontrol edilir.
- Reddedilen dosya saklanmaz, `documents` kaydı oluşturulmaz.

**Metin çıkarımı ve yeterlilik:**

- PDF'te gömülü metin yetersizse OCR fallback devreye girer (D-003, D-042); böylece taranmış ve yalnızca görselden oluşan PDF'ler de okunabilir. DOCX'te OCR yapılmaz.
- OCR, `TESSDATA_PREFIX` tanımlı değilse veya hata verirse atlanır; belge bu durumda V1'deki gibi "yeterli metin yok" sayılır.
- DOCX'te paragrafların yanında tablo hücrelerindeki metin de alınır (python-docx `paragraphs` tabloları kapsamaz).
- Normalizasyon: ardışık boşluk karakterleri (boşluk, sekme, satır sonu) tek boşluğa indirilir, baştaki ve sondaki boşluklar kırpılır.
- Normalize edilmiş metin **en az 10 karakter** olmalıdır. Daha kısaysa veya çıkarım hata verirse (bozuk, şifreli dosya vb.) belge Gemini'ye gönderilmez ve `failed` kaydedilir.

**Depolama:**

- Orijinal dosya PostgreSQL'e binary olarak **yazılmaz**; `backend/storage/` altında düz bir klasörde saklanır, veritabanında `file_reference` tutulur.
- Dosya adı `<document_id>.<uzanti>` formatındadır (ör. `3f6c2a9e-8b1d-4c7a-9e2f-5a4b6c7d8e9f.pdf`); uzantı `file_type`'tan gelir (`pdf` / `docx`). Bu nedenle `document_id` dosya kaydedilmeden önce uygulama tarafında üretilir.
- Kullanıcının orijinal dosya adı yalnızca `file_name` alanında saklanır; disk yolu olarak kullanılmaz.
- `file_reference`, storage klasörüne göre göreli yoldur (`<document_id>.<uzanti>`).
- Çıkarılan metnin tamamı `documents.extracted_text` (TEXT) alanında saklanır. 50.000 karakter sınırı yalnızca Gemini çağrısı için geçerlidir.

## 6. Kataloglar

Kataloglar kod değil, **veridir**: yeni tür veya kurum eklemek kod değişikliği gerektirmemelidir. Uygulama başlarken JSON'dan yüklenir.

**`document_types.json`** — `[{ "id": "...", "name": "..." }]`

| id | name |
|---|---|
| `complaint` | Şikayet |
| `request` | Talep Dilekçesi |
| `application` | Başvuru |
| `objection` | İtiraz |
| `information_request` | Bilgi Edinme |
| `other` | Diğer |

**`institutions.json`** — `[{ "id": "...", "name": "...", "description": "..." }]`

- `id` formatı: küçük harf, ASCII, `snake_case`.
- `id` değerleri veritabanında saklandığı için kararlıdır: mevcut bir ID'nin anlamı değiştirilmez, gerekiyorsa yeni ID eklenir.
- `description`, Gemini'nin doğru birimi seçmesi için kısa ve ayırt edici yazılır: birimin sorumluluk alanı ve hangi konulardaki belgelerin ona gideceği.
- MVP'de kurum yönetim paneli ve veritabanından katalog yönetimi yoktur; değişiklik = JSON dosyasını düzenleyip uygulamayı yeniden başlatmak.

Başlangıç kurum kataloğu (kod oluşturulduktan sonra tek kaynak `institutions.json` olur):

| id | name | description |
|---|---|---|
| `fen_isleri` | Fen İşleri Müdürlüğü | Yol, kaldırım, asfalt, parke taşı, merdiven ve istinat duvarı gibi altyapı ve üstyapıların yapım, bakım ve onarımı. |
| `park_bahceler` | Park ve Bahçeler Müdürlüğü | Park, yeşil alan, çocuk oyun alanı ve açık hava spor aletleri; ağaç dikimi, budama, kesimi ve peyzaj bakımı. |
| `temizlik_isleri` | Temizlik İşleri Müdürlüğü | Çöp ve atık toplama, çöp konteynerleri, sokak ve cadde süpürme/yıkama, moloz ve iri atık kaldırma. |
| `zabita` | Zabıta Müdürlüğü | İşyeri denetimi, seyyar satıcı, kaldırım ve yol işgali, gürültü ve çevre rahatsızlığı, pazar yeri düzeni, belediye kurallarına aykırılıklar. |
| `imar_sehircilik` | İmar ve Şehircilik Müdürlüğü | İmar planı ve imar durumu, yapı ruhsatı ve iskân, ruhsatsız/kaçak yapı, parselasyon ve numarataj işlemleri. |
| `sosyal_hizmetler` | Sosyal Hizmetler Müdürlüğü | İhtiyaç sahibi, yaşlı, engelli ve dezavantajlı kişilere yönelik gıda, nakdi yardım, evde bakım ve sosyal destek talepleri. |
| `kultur_sosyal_isler` | Kültür ve Sosyal İşler Müdürlüğü | Kültür-sanat etkinlikleri, konser, festival, kurs ve atölyeler; kültür merkezi ve salon kullanım talepleri. |
| `mali_hizmetler` | Mali Hizmetler Müdürlüğü | Emlak vergisi, çevre temizlik vergisi, belediye harç ve borçları; ödeme, borç sorgulama, taksitlendirme ve iade işlemleri. |
| `yazi_isleri` | Yazı İşleri Müdürlüğü | Evrak kayıt ve resmi yazışmalar; belediye meclisi ve encümen kararları, karar örneği ve resmi belge talepleri. |

## 7. LLM sözleşmesi

- **Model:** `GEMINI_MODEL` ortam değişkeninden okunur (`.env.example`: `gemini-3.5-flash-lite`). Tanımlı değilse uygulama başlamaz. Farklı bir modele veya başka bir LLM'e fallback yoktur.
- **Girdi:** Normalize edilmiş metnin en fazla ilk 50.000 karakteri + her iki katalog (id, name, description). Sınırı aşan kısım gönderilmez; chunking, RAG veya çok parçalı işleme yoktur.
- **Tek çağrı:** Belge türü ve kurum aynı çağrıda belirlenir. Şemadaki enum değerleri kataloglardan üretilir.
- **Timeout ve retry:** Retry aynı çağrının tekrarıdır, ek bir sınıflandırma adımı değildir.
  - Retry politikası yalnızca `classification_service`'te uygulanır; SDK'nın kendi retry'ı kapalıdır. Toplam gerçek API isteği 3'ü aşmaz.
  - Her Gemini çağrısı için 30 sn timeout; toplam en fazla 3 deneme.
  - Retry edilir: network hataları, timeout, `429`, `5xx` ve geçersiz model çıktısı (structured output şemasına uymayan veya katalog dışı değer içeren yanıt — geçici model hatası sayılır).
  - Retry edilmez: `400`, `401`, `403` gibi kalıcı istemci/yapılandırma hataları. Belge hemen `failed` kaydedilir, `502` döner.
  - Bekleme: 1. başarısız denemeden sonra 1 sn, 2. başarısız denemeden sonra 2 sn. En kötü durumda Gemini aşaması yaklaşık 93 sn sürer.
  - Tüm denemeler başarısızsa (3. denemede de hata veya geçersiz çıktı) belge `failed` kaydedilir, `502` ile genel bir mesaj döner, teknik detaylar loglanır; ham Gemini/API hataları gösterilmez.

Structured output alanları:

| Alan | Tip | Kural |
|---|---|---|
| `document_type` | katalogdaki bir `id` | Her zaman dolu; hiçbiri uymuyorsa `other` |
| `institution_id` | katalogdaki bir `id` \| `null` | Makul eşleşme yoksa veya belirsizse `null` — zorla atama yapılmaz |
| `needs_review` | boolean | Aşağıdaki durumlarda `true` |
| `review_reason` | string \| `null` | `needs_review = true` ise dolu, `false` ise `null` |

`needs_review = true` olmalı:

- belgeyi sınıflandırmak için yeterli bilgi yoksa,
- kurum kataloğundaki hiçbir kurum makul şekilde eşleşmiyorsa,
- birden fazla kurum arasında ciddi belirsizlik varsa,
- belge beklenen sınıflandırma kapsamının belirgin biçimde dışındaysa.

Tutarlılık kuralı: `needs_review = false` ise `institution_id` dolu ve `review_reason` `null` olmalıdır.

Model yalnızca katalogdan seçer; yeni belge türü veya kurum ID'si üretemez. Backend bunu yine de doğrular: şemaya uymayan veya katalog dışı değer içeren yanıt `classified` ya da `needs_review` olarak kaydedilmez, çağrı yukarıdaki retry kuralıyla yeniden denenir; 3 denemenin sonunda hâlâ geçersizse belge `failed` olur ve `502` döner.

## 8. Veritabanı

Tek tablo: **`documents`**. Şema Alembic migration'larıyla yönetilir; `Base.metadata.create_all` kalıcı migration yöntemi olarak kullanılmaz.

| Sütun | Tip | Not |
|---|---|---|
| `id` | UUID, birincil anahtar | API yanıtında `document_id` olarak döner |
| `file_name` | string, not null | Yüklenen dosyanın orijinal adı |
| `file_type` | string, not null | `pdf` \| `docx` |
| `file_reference` | string, not null | Saklanan dosyanın `backend/storage/` klasörüne göre göreli yolu (`<document_id>.<uzanti>`) |
| `extracted_text` | text, null | Çıkarılan metnin tamamı; hiç metin çıkmadıysa `null` |
| `document_type` | string, null | Katalog `id`; `failed` ise `null` |
| `institution_id` | string, null | Katalog `id`; eşleşme yoksa veya `failed` ise `null` |
| `needs_review` | boolean, not null | |
| `review_reason` | text, null | Yalnızca modelin inceleme gerekçesi; teknik hata detayı yazılmaz |
| `status` | string, not null | `classified` \| `needs_review` \| `failed` |
| `created_at` | timestamp (tz), not null | |

`status` belirleme:

- `classified` — sınıflandırma başarılı, `needs_review = false`
- `needs_review` — sınıflandırma başarılı, `needs_review = true`
- `failed` — kabul edilen belgede metin çıkarımı başarısız, normalize edilmiş metin 10 karakterden kısa, Gemini ile sınıflandırma tamamlanamadı (geçici hata veya geçersiz çıktı nedeniyle 3 deneme tükendi ya da retry edilmeyen kalıcı hata). Bu kayıtlarda `document_type`, `institution_id` ve `review_reason` `null`, `needs_review = false`.

Kabul edilmeyen dosyalar (desteklenmeyen tür, 50 MB üstü) için satır oluşturulmaz.

## 9. API

**`POST /api/documents/classify`** — girdi: `multipart/form-data` içinde en fazla 50 MB boyutunda tek bir PDF veya DOCX dosyası.

Ayrıca iş mantığı içermeyen operasyonel **`GET /health`** → `{"status": "ok"}`.

Başarılı yanıt en az şu alanları içerir:

```json
{
  "document_id": "3f6c2a9e-8b1d-4c7a-9e2f-5a4b6c7d8e9f",
  "file_name": "dilekce.docx",
  "file_type": "docx",
  "document_type": "complaint",
  "document_type_name": "Şikayet",
  "institution_id": "temizlik_isleri",
  "institution_name": "Temizlik İşleri Müdürlüğü",
  "needs_review": false,
  "review_reason": null,
  "status": "classified"
}
```

`document_type_name` ve `institution_name`, ID'ye karşılık gelen katalog `name` değerleridir; yanıt üretilirken kataloglardan okunur, veritabanında saklanmaz. `institution_id` `null` ise `institution_name` de `null` olur. İstemci gösterim için katalogları kopyalamaz (D-032).

`file_reference` ve `extracted_text` veritabanında saklanır ama bu endpoint'in yanıtında **dönmez**.

Hata ve red davranışı:

| Durum | Veritabanı | İstemciye |
|---|---|---|
| Dosya gönderilmemiş (istek doğrulama hatası) | Kayıt yok | `422`, FastAPI'nin standart `{"detail": [...]}` gövdesi |
| PDF/DOCX değil (`.doc` dahil) | Kayıt yok, dosya saklanmaz | `415`, genel mesaj |
| 50 MB'ı aşıyor | Kayıt yok, dosya saklanmaz | `413`, genel mesaj |
| Metin çıkarımı başarısız veya normalize metin < 10 karakter | `failed` kaydı | `422`, `failed` gövdesi |
| Gemini geçici hatası (network, timeout, `429`, `5xx`) veya geçersiz model çıktısı, 3 deneme de başarısız | `failed` kaydı | `502`, `failed` gövdesi |
| Gemini kalıcı hatası (`400`/`401`/`403`) veya Gemini aşamasında beklenmeyen hata, retry yok | `failed` kaydı | `502`, `failed` gövdesi |
| Beklenmeyen sunucu hatası (ör. dosya storage'a ya da kayıt veritabanına yazılamadı) | Kayıt yok, bu isteğin storage dosyası (yarım yazılmışsa da) silinir | `500`, ayrıntı dönmez |

Kabul sonrası `failed` yanıt gövdesi, başarılı yanıttaki alanları ve genel bir `message` alanını içerir:

```json
{
  "document_id": "3f6c2a9e-8b1d-4c7a-9e2f-5a4b6c7d8e9f",
  "file_name": "dilekce.pdf",
  "file_type": "pdf",
  "document_type": null,
  "document_type_name": null,
  "institution_id": null,
  "institution_name": null,
  "needs_review": false,
  "review_reason": null,
  "status": "failed",
  "message": "Belge şu anda sınıflandırılamadı. Lütfen daha sonra tekrar deneyin."
}
```

Teknik hata detayları (exception, stack trace, kütüphane veya Gemini hata mesajları) istemciye gönderilmez; loglanır.

Dışarıdan bakıldığında kabul sonrası hata ayrımı basit tutulur:

- **`422`** → belge içeriği işlenemedi / yeterli metin çıkarılamadı (gövdede `status = "failed"`). Gövdesinde `status` olmayan 422, istek doğrulama hatasıdır; OpenAPI'de iki gövde de belgelenir.
- **`502`** → Gemini ile sınıflandırma tamamlanamadı (nedeni ne olursa olsun; ayrıntı yalnızca loglarda).
- **`500`** → dosya ya da kayıt yazılamadı (beklenmeyen sunucu hatası); `failed` kaydı oluşmaz, ayrıntı dönmez (D-034).

## 10. Proje prensipleri

1. **Önce basitlik.** En az dosya, en az katman. Soyutlama ancak somut ihtiyaç doğduğunda.
2. **Tek LLM çağrısı.** Tür ve kurum aynı çağrıda belirlenir; zincir, agent veya çok adımlı akış yok. Retry yalnızca aynı çağrının tekrarıdır.
3. **Kapalı katalog.** Model seçer, üretmez; backend doğrular.
4. **Emin değilsen incelemeye gönder.** Yanlış otomatik atama yerine `needs_review`.
5. **Katalog veridir.** Genişletme JSON üzerinden, kod değişmeden.
6. **Entegrasyona hazır.** Net API sözleşmesi; backend frontend'den bağımsız çalışır; teknik hata detayı dışarı sızmaz.

## 11. MVP kapsamı

- En fazla 50 MB metin tabanlı PDF ve DOCX yükleme; PyMuPDF ve python-docx ile metin çıkarımı
- Normalize edilmiş metin için 10 karakter alt sınırı; PDF'te sınırın altında kalınırsa `tur+eng` / 300 dpi OCR fallback
- Orijinal dosyanın storage alanında, çıkarılan metnin veritabanında saklanması
- Metnin ilk 50.000 karakteriyle tek Gemini çağrısı; 30 sn timeout, geçici hatalarda toplam en fazla 3 deneme
- Belge türü + kurum sınıflandırması (structured output), `needs_review` / `review_reason` üretimi
- JSON dosyalarında belge türü ve kurum katalogları
- UUID birincil anahtarlı `documents` tablosu, Alembic migration'ları
- Tek iş endpoint'i: `POST /api/documents/classify` (ayrıca operasyonel `GET /health`)
- Basit React + Vite + TypeScript yükleme ve sonuç ekranı (Vite proxy ile `/api`, 120 sn istek zaman aşımı)

## 12. Açıkça kapsam dışı

DOCX için OCR · `.doc` ve PDF/DOCX dışındaki dosya türleri · 50 MB üstü dosyalar · uzun belgeler için chunking veya karmaşık belge işleme · farklı Gemini modeline ya da başka LLM'e fallback · dosyaların veritabanında binary saklanması · LangGraph · agent sistemleri · RAG · vector database · fine-tuning · microservice mimarisi · repository pattern (gerçekten gerekmedikçe) · factory pattern · gereksiz service katmanları · karmaşık workflow engine · authentication / authorization · admin paneli · kurum yönetim paneli · kataloğun veritabanından yönetimi · ek iş endpoint'leri · ek tablolar · kuyruk / arka plan işleri

Bunlardan birini eklemek için önce `DECISIONS.md`'de ilgili karar güncellenmelidir.

## 13. Gelecekteki genişleme yönü (taahhüt değil)

- `.doc` ve diğer dosya formatları
- Gerçek ihtiyaç görülürse 50.000 karakteri aşan uzun belgeler için daha kapsamlı işleme
- Belge türü ve kurum kataloglarının genişletilmesi; gerekirse veritabanına taşınıp yönetim arayüzü eklenmesi
- Başka sistemlerle entegrasyon
- `needs_review` belgeleri için manuel inceleme / düzeltme akışı
- Gerekirse dosya sisteminden nesne depolamaya geçiş
- Entegrasyon gerektirdiğinde authentication
