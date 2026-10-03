# dosya_sistemi

Kamu kurumlarına ve belediyelere gelen PDF, Word ve görüntü formatındaki belgeleri işleyen; içerikten metin çıkaran, taranmış, fotoğraflanmış ve el yazısı belgeleri Gemini ile okuyan; belge türünü ve ilgili kurumu Google Gemini ile belirleyen; belge özeti ile gönderen bilgilerini üreten ve sonuçları PostgreSQL üzerinde saklayan yapay zekâ destekli belge sınıflandırma modülü.

Python 3.13 · FastAPI · React · PostgreSQL · Gemini · Tesseract OCR

**Durum:** V1.0–V1.4 tamamlandı. Son kapatılan iş hattı: **V1.3** — El Yazısı ve Gelişmiş OCR Güvenilirliği (OCR/extraction). Şu anda açık iş hattı yok.

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

Kullanıcı bir belge yükler. Sistem önce dosyayı doğrular (uzantı, içerik imzası ve boyut), ardından türüne uygun yöntemle metnini çıkarır. Güvenilir dijital metni olmayan belgelerde (taranmış PDF, fotoğraf, el yazısı) metin Gemini multimodal transkripsiyonuyla okunur. Gemini'ye ulaşılamazsa yerel Tesseract OCR yedek olarak çalışır ve sonuç insan incelemesine düşer. Elde edilen metin tek bir Gemini sınıflandırma çağrısına gönderilir ve bu çağrıdan belge türü, ilgili kurum/birim, kısa bir özet ve (belgede açıkça yazıyorsa) gönderen kişi ile kurum bilgisi döner. Sonuç PostgreSQL'e kaydedilir, orijinal dosya ise uygulamanın storage klasöründe saklanır.

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

> Sürüm numaraları kapsam başlığıdır, teslim sırası değildir; V1.3 ve V1.4 birbirinden bağımsız ilerler.

### V1.3 — El Yazısı ve Gelişmiş OCR Güvenilirliği

**Tamamlandı.** OCR/extraction iş hattı (D-047). Teslim edilenler:

- OCR gereken belgelerde (görüntüler, taranmış/hybrid PDF'ler) birincil OCR/transkripsiyon: Gemini 3.5 Flash Lite (`gemini-3.5-flash-lite`).
- Tesseract acil durum yedeği: Gemini başarısız olursa ya da yetersiz metin döndürürse belgenin tamamında çalışır; sonuç `needs_review` olur.
- 4+ sayfalık PDF'lerin en fazla 3 sayfalık sıralı gruplar hâlinde okunması.
- El yazısı ve basılı tarama benchmark doğrulaması (repo dışında):
  - El yazısı, 9 örnek: Tesseract CER ~%37, Gemini CER ~%4.
  - Basılı tarama, 8 belge: gerileme yok.
- Gerçek PostgreSQL, Gemini ve Tesseract ile uçtan uca doğrulama. 21 sayfalık taranmış PDF 7 grup çağrısıyla okundu, 21/21 sayfa geldi.
- Backend `pytest` 368, frontend `npm test` 33 test; production implementasyonu ve E2E doğrulaması tamamlandı.

### V1.4 — Çoklu Belge Yükleme ve Önizleme

**Tamamlandı.** UX/workflow iş hattı (D-045, D-046). Teslim edilenler:

- Aynı anda en fazla 5 dosya; çoklu seçim ve sürükle-bırak
- Analizden önce içerik merkezli önizleme. Varsayılan görünüm, çıkarılan metinden oluşturulan yapılandırılmış belge formudur: hitap/başlık, konu, tarih, evrak no, gönderen, gönderen kurum ve belge içeriği. Belgede açıkça bulunmayan alan boş kalır. Orijinal belge (PDF/JPG/JPEG/PNG) ve çıkarılan metin yardımcı görünümlerdir. Önizleme aşamasında Gemini sınıflandırması çalışmaz.
- Dosya başına seçim ve kaldırma; yalnız seçilen dosyalar sınıflandırılır
- Aynı dosyada metin çıkarımı/OCR yalnız bir kez (hazırla → önizle → sınıflandır)
- Dosyaların sırayla işlenmesi; bir dosyanın hatası diğerlerini durdurmaz
- Dosya başına durum ve sonuç gösterimi
- İki adımlı API (`prepare`, `/{document_id}/classify`, `DELETE /{document_id}/prepared`), `409` kurtarma ve sahipsiz hazırlıklar için 24 saatlik yedek temizlik
- Gerçek PostgreSQL, Gemini ve Tesseract OCR ile metin PDF, taranmış PDF, DOCX, DOC ve JPG üzerinde uçtan uca doğrulama

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
- Görüntü belgelerde ve güvenilir dijital metni olmayan PDF'lerde (taranmış, hybrid) Gemini multimodal transkripsiyonu; el yazısı dahil
- Gemini'ye ulaşılamazsa yerel Tesseract OCR yedeği; bu belgeler `needs_review` olarak işaretlenir
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
- Taranmış PDF, hybrid PDF ve görüntü belgeler için Gemini transkripsiyonu, yedekte Tesseract OCR
- Belge başına tek Gemini sınıflandırma çağrısı (OCR gereken belgede ayrıca bir transkripsiyon çağrısı)
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

| Format | Metin Çıkarımı | Yedek |
|---|---|---|
| PDF (dijital) | PyMuPDF | — |
| PDF (taranmış / hybrid) | Gemini transkripsiyonu (1–3 sayfa tek çağrı, 4+ sayfa 3 sayfalık gruplar) | Sayfa bazlı Tesseract OCR |
| DOC | legacy-doc | — |
| DOCX | python-docx | — |
| JPG / JPEG / PNG | Gemini transkripsiyonu | Tesseract OCR |

- **DOC**, Word 97–2003 binary (OLE) formatıdır. Saf Python bir parser ile doğrudan baytlardan okunur; Microsoft Word, LibreOffice veya antiword kurulu olmasına gerek yoktur.
- **DOC ve DOCX** belgelerde OCR yapılmaz; gömülü görüntülerdeki metin, makrolar, header/footer ve biçimlendirme alınmaz.
- **PDF**'te güvenilir dijital metin kararı sayfa sayfa verilir. Tek bir sayfa bile OCR gerektiriyorsa (taranmış, hybrid veya bozuk metin katmanlı belge) PDF'in tamamı Gemini'ye gönderilir; 4 sayfa ve üzeri PDF'ler en fazla 3 sayfalık gruplar hâlinde sırayla okunur.
- **Desteklenmeyen formatlar:** GIF, TIFF, BMP, WebP, HEIC ve diğerleri `415` ile reddedilir.
- Tesseract ve `tur` dil paketi yalnız yedek OCR için gerekir. Kurulu değilse ve Gemini transkripsiyonu da başarısız olursa bu belgeler `failed` olur.

## Nasıl Çalışır

### Ana Pipeline

```mermaid
flowchart LR
    A[Belge Yükleme] --> B[Dosya Doğrulama]
    B --> C[Storage]
    C --> D[Metin Çıkarma / Gemini Transkripsiyonu]
    D --> E[Metin Normalizasyonu]
    E --> F[Gemini Sınıflandırma]
    F --> G[Belge Türü]
    F --> H[Kurum]
    F --> I[Özet ve Gönderen]
    G --> J[PostgreSQL]
    H --> J
    I --> J
    J --> K[API / Frontend]
```

Belge `multipart/form-data` ile yüklenir ve önce kabul kontrolünden geçer: boyut 50 MiB'ı aşmamalı, uzantı ile dosya imzası birbirini doğrulamalıdır. Kabul edilmeyen dosya saklanmaz ve kayıt oluşturulmaz. Kabul edilen belgeye bir UUID verilir, orijinal dosya bu UUID ile storage klasörüne yazılır ve türüne uygun yöntemle metni çıkarılır (güvenilir dijital metni yoksa Gemini transkripsiyonuyla). Metin normalize edilir (ardışık boşluklar tek boşluğa indirilir) ve en az 10 karakter olmalıdır; aksi halde belge Gemini sınıflandırmasına hiç gönderilmeden `failed` kaydedilir. Yeterli metin varsa ilk 50.000 karakter, iki katalogla birlikte tek bir Gemini sınıflandırma çağrısına gönderilir; yanıt structured output olarak alınır ve backend tarafından kataloglara karşı yeniden doğrulanır. Sonuç `documents` tablosuna yazılır ve aynı istekte istemciye döndürülür; işlem baştan sona senkrondur.

### Dosya İşleme Pipeline'ı

```mermaid
flowchart TD
    A[Belge] --> B{Dosya Formatı}

    B -->|DOC| D[legacy-doc]
    B -->|DOCX| E[python-docx]
    B -->|PDF| C{Tüm sayfalarda güvenilir<br/>dijital metin var mı?}
    B -->|JPG / JPEG / PNG| G[Gemini Transkripsiyonu<br/>4+ sayfa: 3 sayfalık gruplar]

    C -->|Evet| H[PyMuPDF Gömülü Metin]
    C -->|Hayır| G
    G --> K{Tüm gruplar başarılı ve<br/>en az 10 karakter mi?}
    K -->|Evet| J[Normalize Edilmiş Metin]
    K -->|Hayır| T[Tesseract OCR Yedeği<br/>→ needs_review]

    H --> J
    D --> J
    E --> J
    T --> J
```

PDF'te bir sayfa iki durumda OCR gerektirir: kendi gömülü metni 10 karakterin altındaysa (sayfa taranmış sayılır) ya da sayfa alanının en az %50'si görüntüyken gömülü metni 200 karakteri geçmiyorsa (metin katmanı bozuk olabilir). Böyle bir sayfa yoksa PDF gömülü metniyle okunur ve hiç Gemini transkripsiyonu veya OCR yapılmaz; varsa PDF'in tamamı Gemini'ye gönderilir: 1–3 sayfa tek çağrıda, 4+ sayfa en fazla 3 sayfalık sıralı gruplar hâlinde (21 sayfa = 7 çağrı). Grup metinleri sayfa sırasıyla birleştirilir. Görüntü belgelerinde gömülü metin aranmaz; dosya her zaman Gemini'ye gider.

Bir grup bile 3 denemede tamamlanamazsa ya da normalize metni 10 karakterden kısa kalırsa kısmi sonuç kullanılmaz; Tesseract yedeği belgenin tamamında çalışır. Görüntü tek sayfa olarak, PDF'te yalnız koşulu sağlayan sayfalar OCR'lanır. Aynı sayfadaki gömülü metin ile OCR metni deterministik olarak karşılaştırılır: aynı içerik iki kez yazılmaz, farklı bilgi taşıyorlarsa ikisi de korunur. Yedekle okunan belge işlenmeye devam eder ama sonucu `needs_review` olur. Yedeğin metni de yetersizse belge `failed` olur.

## Mimari

| Bileşen | Sorumluluk |
|---|---|
| React + Vite frontend | Belge yükleme, sonuç gösterimi, kayıtlar görünümü |
| FastAPI backend | HTTP sözleşmesi, akış sıralaması, durum belirleme |
| Dosya işleme katmanı | Kabul kontrolü, storage, yerel metin çıkarımı, OCR gereksinimi kararı ve Tesseract yedeği |
| Gemini katmanı | Transkripsiyon ve sınıflandırma çağrıları, structured output, çıktı doğrulama, retry politikası |
| PostgreSQL | `documents` tablosu; sınıflandırma sonucu ve çıkarılan metin |
| Dosya sistemi storage | Orijinal belgeler (`backend/storage/<uuid>.<uzantı>`) |

Mimari bilinçli olarak sade tutulur:

- Tek bir monolit uygulama; microservice yoktur.
- İşleme senkrondur: her istek kendi işini tamamlayıp yanıt döner; kuyruk veya arka plan işi yoktur.
- Belge başına **tek** sınıflandırma çağrısı yapılır; OCR gereken belgede metni okuyan ayrı bir transkripsiyon çağrısı vardır, iki çağrı birleştirilmez. Retry yalnızca aynı çağrının tekrarıdır.
- Agent sistemi, RAG ve vector database kullanılmaz.
- Repository/factory gibi ek soyutlama katmanları eklenmez; yeni katman ancak somut gerekçe ve `DECISIONS.md` kaydıyla gelir.

Geliştirme ortamında PostgreSQL Docker Compose ile çalışır; backend ve frontend yerel makinede çalışır ve containerize edilmez.

## Teknolojiler

| Katman | Teknoloji |
|---|---|
| Backend | Python 3.13, FastAPI |
| LLM | Google Gemini (`google-genai`) |
| PDF | PyMuPDF |
| OCR | Gemini multimodal transkripsiyonu; yedek: Tesseract OCR (PyMuPDF'in yerleşik desteği) |
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
| POST | `/api/documents/classify` | Legacy / tek-adımlı sınıflandırma: belge yükleme ve sınıflandırma tek istekte. Geriye dönük uyumluluk için korunur; V1.4 arayüzü bunu kullanmaz |
| POST | `/api/documents/prepare` | V1.4: belgeyi doğrular, saklar ve metnini çıkarır (`status = prepared`); Gemini çağırmaz. Yanıt, önizleme için çıkarılan metni içerir |
| POST | `/api/documents/{document_id}/classify` | V1.4: hazırlanmış belgeyi kayıttaki metinle sınıflandırır; dosya yeniden okunmaz. Belge hazırlık durumunda değilse ya da orijinal dosya yoksa `409` |
| DELETE | `/api/documents/{document_id}/prepared` | V1.4: henüz sınıflandırılmamış belgeyi ve dosyasını siler (`204`); kalıcı kayıtlarda `409` |
| GET | `/api/documents` | Kayıtları en yeniden eskiye listeler |
| GET | `/api/documents/{document_id}` | Belge detayı; çıkarılan metnin tamamını içerir |
| GET | `/api/documents/{document_id}/download` | Orijinal belgeyi yüklendiği adla indirir |

Kayıt endpoint'leri salt okunurdur: kalıcı kayıtlar (`classified`, `needs_review`, `failed`) için güncelleme ve silme, ayrıca arama, filtre, sayfalama ve authentication yoktur. Henüz sınıflandırılmamış `prepared` kayıtlar listede görünmez. Sahipsiz kalanlar 24 saatten eskiyse bir sonraki prepare çağrısında temizlenir (zamanlayıcı yok). Dosyanın storage yolu (`file_reference`) hiçbir yanıtta dönmez.

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
- **Gemini API anahtarı** — sınıflandırma ve transkripsiyon gerçek API'yi çağırır; anahtar olmadan backend başlamaz. Otomatik testler anahtar gerektirmez.
- **`.doc` için ek kurulum gerekmez** — Word 97–2003 belgeleri `requirements.txt` içindeki saf Python `legacy-doc` paketiyle okunur; Microsoft Word, LibreOffice veya antiword gerekmez.
- **Tesseract OCR (opsiyonel)** — yalnız Gemini transkripsiyonu başarısız olduğunda çalışan yedek OCR için, **`tur` dil paketiyle**. Kurulu değilse uygulama normal çalışır; Gemini transkripsiyonu da başarısız olan taranmış PDF'ler ve görüntü belgeleri `failed` olur. Ayrı bir Python paketi veya PATH'te `tesseract` komutu gerekmez; yalnızca `tessdata` klasörü gerekir.
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

Her sınıflandırma gerçek Gemini API'sine istek gönderir; OCR gereken belgelerde hazırlık aşamasında ayrıca bir transkripsiyon isteği gider; yüklenen dosya `backend/storage/` altına, sonuç ve çıkarılan metin veritabanına yazılır.

## Ortam Değişkenleri

Değerler `backend/.env` dosyasında tutulur. `.env` Git'e girmez; `.env.example` şablon olarak commit edilir. Gerçek anahtarı başka bir dosyaya yazmayın.

| Değişken | Zorunlu | Açıklama |
|---|---|---|
| `GEMINI_API_KEY` | Evet | Google Gemini API anahtarı. Şablonda boştur; kendi anahtarınızı yazın |
| `GEMINI_MODEL` | Evet | Sınıflandırma ve transkripsiyon modeli. Şablondaki değer `gemini-3.5-flash-lite`; kodda varsayılan yoktur |
| `DATABASE_URL` | Evet | PostgreSQL bağlantı adresi (psycopg 3). Şablondaki değer yerel Docker veritabanına aittir: `postgresql+psycopg://postgres:postgres@127.0.0.1:5433/dosya_sistemi?connect_timeout=10` |
| `TESSDATA_PREFIX` | Hayır | Tesseract `tessdata` klasörünün yolu. Gemini transkripsiyonu başarısız olduğunda çalışan yedek OCR için kullanılır |

- İlk üç değişkenden biri eksikse backend (ve `/health`) başlamaz; eksik yapılandırma sessizce bir varsayılana düşmez.
- `TESSDATA_PREFIX` tanımlı değilse uygulama normal başlar, yalnızca yedek OCR atlanır; Gemini transkripsiyonu da başarısız olan belgeler `failed` olur. Windows'ta tipik değer: `C:\Program Files\Tesseract-OCR\tessdata`. Klasörde `tur.traineddata` bulunmalıdır.
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
| `npm test` | Önizleme alanı çıkarımının birim testleri (Node'un yerleşik test çalıştırıcısı; Node 22.18+ gerekir) |

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

Doğrulanmış baseline: backend `pytest` **368 passed**, frontend `npm test` **33 passed**. Testler gerçek Gemini API'sine veya Docker PostgreSQL'e ihtiyaç duymaz; endpoint testleri geçici SQLite veritabanı, sahte sınıflandırma ve sahte transkripsiyon kullanır. Frontend testleri önizleme alanı çıkarımının (`src/documentPreview.ts`) birim testleridir.

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
- İki adımlı akış: prepare, hazırlanmış belgeyi sınıflandırma (dosya yeniden okunmadan), kaldırma, `409` durumları ve 24 saatlik yedek temizlik
- Gemini transkripsiyonu: retry/timeout, boş ve kısa yanıt, 3 sayfalık gruplar, Tesseract yedeğine düşüş ve `needs_review` işaretinin korunması
- Önizleme alanlarının deterministik çıkarımı (konu, tarih, evrak no, gönderen; açıkça yazmayan alan boş kalır)

### Gerçek / Uçtan Uca Doğrulamalar

- Gerçek PostgreSQL üzerinde çalışma
- Gerçek Gemini API ile sınıflandırma
- Boş veritabanında sıfırdan Alembic migration
- Clean-clone smoke test (GitHub'dan sıfır klon → kurulum → çalıştırma)
- PDF, DOC, DOCX ve JPG ile uçtan uca smoke test
- Hybrid PDF senaryoları
- DOC ↔ DOCX format eşdeğerliği
- Tesseract OCR çözünürlük ve bozulma benchmarkları (font tabanlı sentetik el yazısı proxy'siyle)
- Gerçek Türkçe el yazısı (9 örnek) ve basılı tarama (8 belge) üzerinde Tesseract ile Gemini transkripsiyonunun karşılaştırması (V1.3, repo dışında)
- V1.4 çoklu yükleme ve önizleme akışının gerçek PostgreSQL, Gemini ve Tesseract ile uçtan uca doğrulaması
- V1.3 Gemini transkripsiyonunun gerçek PostgreSQL, Gemini ve Tesseract ile uçtan uca doğrulaması. Kapsam: basılı kontrol seti, dijital belgeler, hybrid ve bozuk metin katmanlı PDF, zorlanmış 503 ile Tesseract yedeği, 3–21 sayfalık taranmış PDF'ler

Ayrıntılı test geçmişi ve ölçüm sonuçları için: [`CURRENT_STATE.md`](CURRENT_STATE.md)

## Bilinen Sınırlar

- El yazısı ve taranmış belgeler Gemini transkripsiyonuyla okunur, ancak ölçüm küçük ve temiz bir sette yapıldı (9 el yazısı + 8 basılı belge). Gerçek tarayıcı gürültüsü, telefon fotoğrafı ve uzun çok sayfalı tarama kapsamı sınırlı.
- Gemini'nin akıcı ama yanlış okumalarını yakalayan ayrı bir kalite kapısı yoktur; yalnız Tesseract yedeğine düşen belgeler otomatik olarak `needs_review` olur.
- OCR gereken belgelerde dosyanın kendisi (görüntü/PDF) Gemini'ye gönderilir. Belge başına en az iki Gemini çağrısı yapılır (transkripsiyon + sınıflandırma); 4+ sayfalık PDF'te 3 sayfalık grup başına bir transkripsiyon çağrısı eklenir.
- Taranmış çizgili tablo ve formlar ölçülmedi; Tesseract yedeğinde bazı satırlar düşebilir.
- Tesseract yedeğinde EXIF bilgisi olmayan 90°/180° döndürülmüş görüntüler anlamsız metin üretebilir; otomatik döndürme/OSD yoktur.
- Gemini yalnızca metnin ilk 50.000 karakterini değerlendirir; belirleyici bilgi sonrasında yer alıyorsa sınıflandırma etkilenebilir.
- DOC ve DOCX belgelerde header/footer metni çıkarılmaz.
- DOC ve DOCX içindeki gömülü görüntüler OCR edilmez.
- Authentication ve authorization yoktur.
- İşlem senkrondur; her Gemini aşaması (transkripsiyon, sınıflandırma) en kötü durumda retry'larla birlikte yaklaşık 93 saniye sürebilir. Uzun taranmış PDF'lerde gruplar sırayla okunduğu için süre sayfa sayısıyla artar; bir grup zaman aşımına uğrarsa Tesseract yedeği belgenin tamamında çalışır.
- Kurum yönlendirmesi mevcut katalogla sınırlıdır; katalogda olmayan birimlere ait belgeler `needs_review` olur.
- Tesseract yalnız yedektir; kurulu değilse ve Gemini transkripsiyonu da başarısız olursa taranmış PDF'ler ve görüntü belgeleri `failed` olur.
- Frontend'in classify isteği için zaman aşımı 120 saniyedir; süre dolsa da backend işlemeyi tamamlamış olabilir.
- Aynı makinede aynı projeden ikinci bir Docker Compose stack'i başlatmak container adı, port ve volume çakışmasına yol açar; temiz bir makinede tek klon sorunsuz çalışır.

Daha ayrıntılı teknik sınırlar ve edge-case listesi için: [`CURRENT_STATE.md`](CURRENT_STATE.md)

## Yol Haritası

Şu anda açık iş hattı yok. V1.3 ve V1.4 tamamlandı; teslim edilenler [Sürüm Geçmişi](#sürüm-geçmişi) bölümündedir.

### Daha Sonra Değerlendirilebilecekler

Aşağıdakiler taahhüt değildir; ihtiyaç doğarsa `DECISIONS.md` üzerinden karara bağlanır:

- Authentication / authorization
- Production deployment kararları
- Kurum kataloğunun genişletilmesi ve açıklamalarının iyileştirilmesi
- Otomatik döndürme / orientation iyileştirmeleri
- 50.000 karakteri aşan belgeler için gelişmiş metin seçimi stratejisi
- Taranmış tablo ve form belgelerinde okuma dayanıklılığı
- OCR kaynaklı özet ve gönderen bilgisi güvenilirliği
