# DECISIONS

> Şu anda geçerli olan **aktif** ürün ve teknik kararlar. Gelecekteki Claude Code oturumları için güncel kararların tek ve net kaynağıdır.
>
> **Kurallar**
> - Yalnızca aktif kararlar tutulur; geçersiz hale gelen karar dosyada bırakılmaz.
> - Bir karar değişirse ilgili kayıt yerinde, güncel haliyle yeniden yazılır. Birbiriyle çelişen eski ve yeni karar aynı anda bulunmaz.
> - Karar geçmişi Git history üzerinden takip edilir.
> - Yeni karar ilgili bölüme sıradaki numarayla eklenir; kaldırılan kararın numarası yeniden kullanılmaz.
> - Her kayıt kısa tutulur: karar + gerekçe.

---

## Kapsam ve dosya işleme

### D-001 — Desteklenen dosya türleri: PDF ve DOCX
- **Karar:** Sistem yalnızca PDF ve DOCX dosyalarını kabul eder. PDF'te gömülü metin yoksa OCR fallback devreye girer (D-003), yani taranmış PDF'ler de desteklenir; DOCX'te OCR yapılmaz, dolayısıyla DOCX metin tabanlı olmalıdır. Eski `.doc` formatı ve diğer tüm dosya türleri desteklenmez ve reddedilir.
- **Gerekçe:** Dilekçe ve başvurularda yaygın iki format; ikisi de hafif Python kütüphaneleriyle doğrudan okunabilir. `.doc` eski ikili format olduğundan ek dönüştürme aracı gerektirir.

### D-002 — Metin çıkarımı: PDF için PyMuPDF, DOCX için python-docx
- **Karar:** PDF metni PyMuPDF ile, DOCX metni python-docx ile çıkarılır.
- **Gerekçe:** Hızlı, yaygın kullanılan ve ek sistem bağımlılığı gerektirmeyen kütüphaneler.

### D-003 — Taranmış PDF'ler için OCR fallback (V1.1)
- **Karar:** PDF'te OCR kararı **sayfa sayfa** verilir: kendi metni minimum uzunluğa (D-026) ulaşmayan her sayfa taranmış sayılıp yalnızca o sayfa OCR ile okunur, diğer sayfalar gömülü metniyle kalır (teknik ayrıntı: D-042). Sayfaların metni belge sırasıyla birleştirilir. DOCX'te OCR yapılmaz. Birleşik metin hâlâ kısaysa veya OCR kullanılamıyorsa belge `failed` olarak kaydedilir.
- **Gerekçe:** V1'de OCR kapsam dışıydı ve taranmış dilekçeler doğrudan `failed` oluyordu. Lokal OCR, ek servis ya da API maliyeti getirmeden bu belgeleri sınıflandırılabilir hale getirir; başarısız olduğunda akış V1'deki davranışa döner. Karar belge düzeyinde verildiğinde hybrid PDF'ler kaçıyordu: kapak/evrak sayfasının metni eşiği geçtiği için taranmış asıl dilekçe hiç okunmuyor ve belge emin şekilde yanlış kuruma atanabiliyordu (V1.2 benchmarkında kanıtlandı). Sayfa düzeyi karar bu kaybı kapatır ve tamamen metin tabanlı PDF'lerde hiç OCR çağrısı üretmez.

### D-042 — OCR fallback: PyMuPDF'in yerleşik Tesseract'ı, `tur`, 300 dpi
- **Karar:**
  - OCR, PyMuPDF'in `get_textpage_ocr` API'siyle **sayfa başına** yapılır (D-003). `pytesseract` veya ayrı bir `tesseract` süreci kullanılmaz; ayrı OCR servisi, kuyruk ya da soyutlama katmanı eklenmez.
  - Dil `tur`, çözünürlük 300 dpi. İkisi de `file_service` içinde tek yerde sabittir. Belgeler Türkçe olduğu için İngilizce model eklenmez: gerçekçi bozulma testlerinde `tur+eng` Türkçe karakterleri daha çok kaybediyordu (özellikle `Ç→C`) ve hiçbir senaryoda öne geçmedi.
  - Tesseract dil dosyalarının klasörü `TESSDATA_PREFIX` ortam değişkeninden okunur ve OCR çağrısına doğrudan geçilir. Değişken **opsiyoneldir**: tanımlı değilse OCR atlanır. Kodda platforma özel kurulum yolu yazılmaz.
  - OCR hatası yükseltilmez: loglanır ve **o sayfa** gömülü metniyle değerlendirilir; diğer sayfalar etkilenmez ve mevcut `failed` + `422` davranışı korunur.
- **Gerekçe:** PyMuPDF zaten bir bağımlılık ve Tesseract'ı derlenmiş olarak içeriyor; yeni Python paketi veya PATH'te `tesseract` binary'si gerekmiyor. OCR bir iyileştirme olduğu için başarısızlığı yeni bir hata sınıfı doğurmamalı. Ortam değişkeni, kurulum yolunun makineden makineye değişmesine izin verir.

### D-004 — Hatalı dosya ve `failed` kayıt davranışı
- **Karar:**
  - PDF veya DOCX olmayan dosyalar ve 50 MB'ı aşan dosyalar (D-028) sisteme kabul edilmez: storage'a yazılmaz, `documents` kaydı oluşturulmaz, 4xx ile reddedilir.
  - Kabul edilen PDF/DOCX için metin çıkarımı başarısız olursa, yeterli metin çıkarılamazsa (D-026) veya Gemini çağrısı başarısız olursa (D-033) belge `status = failed` olarak kaydedilir.
  - `failed` kayıtlarında `document_type = null`, `institution_id = null`, `needs_review = false`, `review_reason = null`.
  - Teknik hata detayları kullanıcıya gösterilmez; loglanır. Kullanıcıya genel bir mesaj döner (HTTP kodları ve yanıt gövdesi: D-034).
- **Gerekçe:** Kabul edilmeyen dosyalar gereksiz kayıt üretmez; işlenmeye alınmış belgeler izlenebilir kalır. Teknik detaylar kullanıcıya fayda sağlamaz ve sistemin iç yapısını açığa çıkarır.

### D-026 — Minimum metin uzunluğu: 10 karakter
- **Karar:** Normalize edilmiş (ardışık boşluklar tek boşluğa indirilmiş, baş ve son boşlukları kırpılmış) metin en az 10 karakter olmalıdır. Daha kısaysa PDF'te önce OCR fallback denenir (D-003); metin yine kısaysa belge sınıflandırmaya gönderilmez ve `status = failed` kaydedilir.
- **Gerekçe:** Boş veya neredeyse boş belgeler için anlamsız Gemini çağrısı ve maliyet önlenir; düşük eşik kısa ama geçerli metinleri dışarıda bırakmaz.

### D-028 — Maksimum dosya boyutu: 50 MB
- **Karar:** PDF ve DOCX yüklemeleri için sınır 50 MB'dır. Aşan dosya storage'a yazılmadan ve `documents` kaydı oluşturulmadan `413` ile reddedilir.
- **Gerekçe:** Sunucu kaynaklarını ve senkron istek süresini korur; metin tabanlı belgeler için yeterli pay bırakır.

## Teknoloji

### D-005 — Backend ve frontend yığını
- **Karar:** Backend: Python + FastAPI. Frontend: React + Vite (detaylar: D-037).
- **Gerekçe:** Hızlı geliştirme; FastAPI ve Pydantic doğal uyum sağlar; Vite hafif ve hızlı bir frontend kurulumu sunar.

### D-006 — PostgreSQL, senkron SQLAlchemy ve psycopg 3
- **Karar:** Veritabanı PostgreSQL'dir. Erişim senkron SQLAlchemy 2.x ile yapılır (`create_engine` + `sessionmaker`, async engine yok). Sürücü psycopg 3'tür (`postgresql+psycopg://` bağlantı adresi, `psycopg[binary]` paketi).
- **Gerekçe:** PostgreSQL güvenilir ve yaygın; ileride entegrasyon ve genişleme için sağlam temel. Senkron erişim, D-020'deki senkron işleme ile uyumlu ve MVP için en basit yol. psycopg 3, SQLAlchemy 2'nin desteklediği güncel PostgreSQL sürücüsü; binary paketi Windows'ta derleme gerektirmeden kurulur.

### D-030 — Alembic ile migration yönetimi
- **Karar:** Veritabanı şeması SQLAlchemy modelleriyle birlikte Alembic migration'larıyla yönetilir. `Base.metadata.create_all` kalıcı migration yöntemi olarak kullanılmaz.
- **Gerekçe:** Şema değişiklikleri baştan izlenebilir ve tekrarlanabilir olur; mevcut veri kaybedilmeden şema güncellenebilir.

### D-035 — Yapılandırma: ortam değişkenleri + `backend/.env`, ayrı config katmanı yok
- **Karar:**
  - Yapılandırma ortam değişkenlerinden okunur. `app/settings.py` değerleri modül düzeyinde okur. `backend/.env` varsa python-dotenv ile yüklenir; ortamda zaten tanımlı değişkenler ezilmez.
  - Zorunlu değişkenler `settings.require_env(name)` ile okunur; tanımlı değilse açık bir `RuntimeError` fırlatılır.
  - `DATABASE_URL`, `app.settings` import edilirken zorunludur. Alembic de aynı `DATABASE_URL`'i kullanır; `alembic.ini` içinde bağlantı adresi tutulmaz.
  - `GEMINI_API_KEY` ve `GEMINI_MODEL`, `app/llm/gemini_client.py` yüklenirken zorunludur (D-031). `settings.py` import'unda aranmazlar; böylece Alembic ve veritabanı araçları Gemini yapılandırması gerektirmez.
  - Config sınıfı, pydantic-settings veya ek soyutlama yoktur.
  - Modül adı `settings.py`'dir; `app/config/` katalog klasörüyle isim çakışmasını önler.
- **Gerekçe:** `.env.example` → `.env` akışıyla uyumlu en küçük çözüm. Değerler tek yerden, aynı yardımcıyla okunur. Eksik yapılandırma, sessizce yanlış bir bağlantıya veya modele düşmek yerine açık hatayla fark edilir. Her zorunlu değişken yalnızca onu kullanan modül yüklenirken istenir.

### D-036 — Geliştirme ortamı: PostgreSQL 18 Docker Compose'da, backend ve frontend yerelde
- **Karar:**
  - Geliştirme ortamında PostgreSQL, repo kökündeki `docker-compose.yml` ile çalışır. Compose'da yalnızca `postgres` servisi vardır:
    - image `postgres:18`, container `dosya-sistemi-postgres`, veritabanı `dosya_sistemi`
    - Docker tarafından yönetilen `dosya_sistemi_pgdata` volume'u, `/var/lib/postgresql` yoluna bağlanır (PostgreSQL 18+ image düzeni)
  - Host portu `127.0.0.1:5433`, container portu `5432`. Bu makinede 5432'yi yerel bir Windows PostgreSQL servisi kullandığı için 5433 seçildi; port yalnızca localhost'a açıktır.
  - `DATABASE_URL` host olarak `127.0.0.1` kullanır (`postgresql+psycopg://postgres:postgres@127.0.0.1:5433/dosya_sistemi?connect_timeout=10`; bağlantı zaman aşımı: D-041). `localhost` önce IPv6 (`::1`) olarak denendiğinde bağlantı asılı kalıyor.
  - `postgres` / `postgres` kullanıcı ve parolası yalnızca yerel geliştirme içindir.
  - FastAPI backend ve React/Vite frontend yerel makinede çalışır; şimdilik containerize edilmez. Compose'a başka servis (FastAPI, frontend, pgAdmin vb.) eklenmez.
- **Gerekçe:** Veritabanı makineye kurulum gerektirmeden, tek komutla ve tekrarlanabilir şekilde ayağa kalkar; veriler container kaldırılsa da volume'da kalır. Backend ve frontend yerelde hot reload ile hızlı geliştirilir; bunları containerize etmek MVP'de gereksiz katman ekler. Ayrı host portu, yerel PostgreSQL servisiyle çakışmayı ve yanlış veritabanına bağlanma riskini önler.

### D-041 — PostgreSQL bağlantı kurma zaman aşımı: 10 saniye
- **Karar:**
  - Veritabanı bağlantısının kurulması en fazla 10 saniye bekler. Değer, libpq'nun `connect_timeout=10` parametresi olarak `DATABASE_URL` içinde verilir (`backend/.env.example` ve yerel `backend/.env`); kodda ayrıca tanımlanmaz.
  - Uygulama ve Alembic aynı `DATABASE_URL`'i kullandığı için (D-035) ikisine de uygulanır.
  - Yalnızca bağlantı kurma süresini sınırlar; sorgu/statement zaman aşımı eklenmez.
  - Parametresi olmayan eski bir `.env`, psycopg'un varsayılan bekleme süresine döner; yerel `.env` şablonla uyumlu tutulur.
- **Gerekçe:** PostgreSQL kapalıyken psycopg'un varsayılanıyla bağlantı denemesi yaklaşık 130 saniye sürüyor, bir backend thread'ini meşgul ediyor ve frontend'in 120 saniyelik zaman aşımından (D-039) uzun kalıyordu. 10 saniye, yerel ve kısa ağ gecikmelerine pay bırakırken hatayı hızlı ve genel `500` yanıtıyla sonuçlandırır. Değer yapılandırmada olduğu için kod değişmeden ayarlanabilir.

## LLM

### D-007 — LLM olarak Gemini API
- **Karar:** Sınıflandırma Google Gemini API ile yapılır.
- **Gerekçe:** Şemaya bağlı structured output ve enum kısıtlı çıktı desteği; hızlı ve düşük maliyetli model seçenekleri.

### D-008 — Her belge için tek LLM çağrısı
- **Karar:** Belge türü ve kurum aynı Gemini çağrısında belirlenir. Retry (D-033) aynı çağrının tekrarıdır, ek sınıflandırma adımı sayılmaz.
- **Gerekçe:** Düşük gecikme ve maliyet; çok adımlı akışın getireceği karmaşıklıktan kaçınma.

### D-009 — Pydantic ile structured output
- **Karar:** Model `document_type`, `institution_id`, `needs_review`, `review_reason` alanlarını Pydantic şemasına uygun döndürür.
  - Temel şema `app/schemas/classification.py` içindedir ve `needs_review` tutarlılık kurallarını doğrular.
  - İzinli `document_type` / `institution_id` değerleri çalışma zamanında katalog JSON'larından (`Literal`) üretilir; katalog ID'leri kodda ayrıca yazılmaz.
  - Aynı model hem Gemini'ye `response_schema` olarak verilir hem de backend'de yanıtı doğrular.
- **Gerekçe:** Serbest metin ayrıştırma yok; çıktı tipli ve doğrulanabilir. Kataloglar tek kaynak olarak kalır; şema ile doğrulama birbirinden ayrışamaz.

### D-010 — Model katalog dışına çıkamaz, belirsizlikte zorla atama yapılmaz
- **Karar:** Model yalnızca kataloglardaki ID'lerden seçer. Makul eşleşme yoksa `institution_id = null` ve `needs_review = true`. Backend katalog dışı değerleri kabul etmez; böyle bir yanıt geçersiz çıktı sayılır ve retry edilir (D-033).
- **Gerekçe:** Uydurulmuş ID'ler ve yanlış otomatik atamalar, incelemeye düşen bir belgeden daha maliyetlidir.

### D-027 — Gemini'ye en fazla 50.000 karakter gönderilir
- **Karar:** Sınıflandırma çağrısına normalize edilmiş metnin en fazla ilk 50.000 karakteri gönderilir. Sınırı aşan belgeler için V1'de chunking, RAG veya karmaşık belge işleme eklenmez. `extracted_text` metnin tamamını saklamaya devam eder.
- **Gerekçe:** Maliyet ve gecikme sınırlanır; dilekçe ve başvurularda belge türü ve konu çoğunlukla metnin başında yer alır.

### D-031 — Gemini modeli ortam değişkeninden okunur, eksikse fail fast
- **Karar:** Model adı `GEMINI_MODEL` ortam değişkeninden okunur; `.env.example` içindeki değer `gemini-3.5-flash-lite`. Model adı kodda sabit yazılmaz ve kodda varsayılan model yoktur. `GEMINI_MODEL` (ve `GEMINI_API_KEY`) tanımlı değilse `app/llm/gemini_client.py` yüklenirken, yani uygulama başlangıcında, açık bir yapılandırma hatası verilir (D-035); sessizce varsayılan bir modele düşülmez.
- **Gerekçe:** Sınıflandırma için hızlı ve düşük maliyetli bir model yeterli; model kod değişikliği olmadan değiştirilebilir. Eksik yapılandırma istek sırasında değil başlangıçta fark edilir ve hangi modelin kullanıldığı her zaman açıktır.

### D-033 — Gemini çağrısı: 30 sn timeout, geçici hatalarda en fazla 3 deneme
- **Karar:**
  - Her Gemini çağrısı için 30 saniye timeout; aynı istekle toplam en fazla 3 deneme.
  - Retry edilir: network hataları, timeout hataları, `429`, `5xx` ve geçersiz model çıktısı. Structured output şemasına uymayan veya katalog dışı değer içeren yanıt geçici model hatası kabul edilir.
  - Retry edilmez: `400`, `401`, `403` gibi kalıcı istemci/yapılandırma hataları. Belge hemen `status = failed` kaydedilir, `502` döner (D-034), teknik detaylar loglanır.
  - Bekleme: 1. başarısız denemeden sonra 1 saniye, 2. başarısız denemeden sonra 2 saniye.
  - 3 denemenin tamamı başarısızsa (hata veya hâlâ geçersiz çıktı) belge `status = failed` kaydedilir, kullanıcıya genel bir hata mesajıyla `502` döner (D-034), teknik detaylar loglanır; ham Gemini/API hata detayları gösterilmez.
  - Farklı bir Gemini modeline veya başka bir LLM'e fallback yoktur.
  - Retry politikası yalnızca `classification_service` içinde uygulanır. google-genai SDK'nın kendi retry'ı kapalıdır (`HttpRetryOptions(attempts=1)`), automatic function calling kapalıdır. Her deneme tam bir gerçek HTTP isteğidir; toplam 3'ü aşmaz. SDK sürümü yükseltilirse bu davranış yeniden doğrulanmalıdır.
  - Timeout SDK'ya `HttpOptions(timeout=30_000)` olarak verilir; birim milisaniyedir.
- **Gerekçe:** Geçici ağ/servis hatalarında ve tekrar denemede düzelebilecek geçersiz model çıktısında belge gereksiz yere `failed` olmaz; kalıcı hatalarda tekrar denemek yalnızca süreyi uzatır. Timeout ve kısa beklemeler senkron isteğin en kötü durum süresini sınırlar (Gemini aşaması ~93 sn). Fallback MVP için gereksiz karmaşıklık getirir.

## Kataloglar

### D-011 — Kontrollü belge türü kataloğu
- **Karar:** Belge türleri `document_types.json` içinde tutulur. Başlangıç: `complaint`, `request`, `application`, `objection`, `information_request`, `other`.
- **Gerekçe:** Tutarlı, sorgulanabilir değerler; katalog kod değişmeden genişletilebilir.

### D-012 — Kurum kataloğu
- **Karar:** Kurumlar `institutions.json` içinde `id`, `name`, `description` alanlarıyla tutulur. `id` küçük harf, ASCII ve `snake_case`'tir. Başlangıç kataloğu 9 müdürlükten oluşur: Fen İşleri, Park ve Bahçeler, Temizlik İşleri, Zabıta, İmar ve Şehircilik, Sosyal Hizmetler, Kültür ve Sosyal İşler, Mali Hizmetler, Yazı İşleri (ID ve açıklamalar: `PROJECT_BRAIN.md` §6). MVP'de yönetim paneli ve veritabanından katalog yönetimi yoktur.
- **Gerekçe:** `description` modelin doğru birimi seçmesine yardım eder; dosya tabanlı katalog MVP için en basit çözüm; ASCII `snake_case` ID'ler veritabanında, kodda ve URL'lerde sorunsuz ve kararlıdır.

## Veri ve depolama

### D-013 — Tek `documents` tablosu
- **Karar:** Başlangıçta yalnızca `documents` tablosu kullanılır. Alanlar: `id`, `file_name`, `file_type`, `file_reference`, `extracted_text`, `document_type`, `institution_id`, `needs_review`, `review_reason`, `status`, `created_at`.
- **Gerekçe:** MVP akışı için yeterli; kataloglar dosyada olduğundan ek tabloya gerek yok.

### D-029 — `documents.id` UUID
- **Karar:** `documents.id` UUID tipindedir; API yanıtında `document_id` olarak döner. Dosya adında kullanıldığı için (D-017) dosya kaydedilmeden önce uygulama tarafında üretilir.
- **Gerekçe:** Dışarıya açılan kimlik sıralı ve tahmin edilebilir değildir; başka sistemlerle entegrasyonda çakışma riski taşımaz.

### D-014 — `needs_review` veritabanında tutulur
- **Karar:** `documents.needs_review` (boolean) saklanır.
- **Gerekçe:** İnsan incelemesi gereken belgeler filtrelenebilir; ileride inceleme akışının temeli.

### D-015 — `review_reason` veritabanında tutulur
- **Karar:** `documents.review_reason` (nullable metin) saklanır.
- **Gerekçe:** İnceleyen kişi belgenin neden işaretlendiğini görür; prompt ve katalog iyileştirmesi için geri bildirim sağlar.

### D-016 — `status` veritabanında tutulur
- **Karar:** `documents.status` saklanır; başlangıç değerleri `classified`, `needs_review`, `failed`.
- **Gerekçe:** İşlem sonucu tek alanda sorgulanır; hatalı işlemler incelemeye düşenlerden ayrılır; yeni durumlarla genişletilebilir.

### D-017 — Orijinal belge `backend/storage/` altında saklanır
- **Karar:** Yüklenen orijinal belge `backend/storage/` altında düz bir klasörde `<document_id>.<uzanti>` adıyla saklanır (uzantı `pdf` veya `docx`). PostgreSQL'e binary olarak yazılmaz; veritabanında dosyanın referansı `file_reference` alanında tutulur. Kullanıcının orijinal dosya adı yalnızca `file_name` alanında saklanır, disk yolu olarak kullanılmaz.
- **Gerekçe:** Belge sonradan incelenebilir ve yeniden işlenebilir (ör. OCR geldiğinde). Binary veriyi veritabanı dışında tutmak tabloyu küçük, yedeklemeyi ve sorguları hafif tutar. Kullanıcı girdisinin dosya yoluna girmemesi ad çakışmalarını ve path traversal riskini önler; kayıt ile dosya ID üzerinden birebir eşleşir.

### D-018 — Çıkarılan metin veritabanında saklanır
- **Karar:** Belgeden çıkarılan metnin tamamı `documents.extracted_text` (TEXT) alanında saklanır.
- **Gerekçe:** İncelemede metin doğrudan görülür; yeniden sınıflandırma dosyayı tekrar işlemeden yapılabilir; ayrı tablo gerekmez.

## API ve mimari

### D-019 — Tek yazma endpoint'i: `POST /api/documents/classify`, ayrıca operasyonel `GET /health`
- **Karar:** Kayıt **oluşturan** tek endpoint `POST /api/documents/classify`'dır; girdi `multipart/form-data` içinde en fazla 50 MB'lık tek bir PDF veya DOCX dosyası. Kayıtları görüntülemeye yönelik salt okunur endpoint'ler ayrıca tanımlıdır (D-043). Bunlara ek olarak iş mantığı içermeyen operasyonel `GET /health` bulunur ve `{"status": "ok"}` döner. Güncelleme ve silme endpoint'i yoktur. FastAPI'nin otomatik dokümantasyon sayfaları (`/docs`, `/openapi.json`) varsayılan haliyle açıktır.
- **Gerekçe:** Sınıflandırma akışının tamamı tek çağrıda karşılanır; yazma yüzeyi tek noktada kalır. Health check, uygulamanın ayakta olduğunun basitçe kontrol edilebilmesini sağlar.

### D-043 — Salt okunur kayıt endpoint'leri (V1.2)
- **Karar:** Kayıtların görüntülenebilmesi için üç salt okunur endpoint eklenir:
  - `GET /api/documents` — kayıtlar `created_at` azalan sırada; alanlar D-032'deki classify alanları + `created_at`.
  - `GET /api/documents/{document_id}` — aynı alanlar + `extracted_text`; kayıt yoksa `404`.
  - `GET /api/documents/{document_id}/download` — orijinal dosya, kullanıcının yüklediği `file_name` ile ve `file_type`'a karşılık gelen media type ile döner; kayıt ya da fiziksel dosya yoksa ayrıntısız `404`.
  - `file_reference` ve storage yolu hiçbir yanıtta dönmez; indirilecek yol yalnızca veritabanındaki kayıttan türetilir ve storage klasörü dışına çıkan bir yol kabul edilmez.
  - Bu aşamada arama, filtre, sayfalama, silme, düzenleme ve authentication yoktur.
- **Gerekçe:** Sınıflandırma sonuçlarının ve orijinal belgenin görülebilmesi modülün ilk gerçek kullanım ihtiyacı. Endpoint'ler salt okunur olduğu için yeni tablo, migration veya yazma yüzeyi gerekmez; `file_reference`'ın gizli kalması iç depolama düzenini dışarı sızdırmaz.

### D-032 — Classify yanıt alanları
- **Karar:** Başarılı yanıt en az `document_id`, `file_name`, `file_type`, `document_type`, `document_type_name`, `institution_id`, `institution_name`, `needs_review`, `review_reason`, `status` alanlarını içerir. `file_reference` ve `extracted_text` veritabanında saklanır ama bu endpoint'in yanıtında dönmez.
  - `document_type_name` ve `institution_name`, ID'ye karşılık gelen katalog `name` değerleridir; yanıt üretilirken backend'de zaten yüklü olan kataloglardan okunur, veritabanında saklanmaz.
  - `institution_id = null` ise `institution_name = null`. `failed` yanıtlarda (D-034) her iki ad alanı da `null`'dır.
  - ID alanlarının adı, anlamı ve davranışı değişmez; ad alanları yalnızca gösterim içindir.
- **Gerekçe:** `file_reference` iç depolama bilgisidir; `extracted_text` büyük olabilir ve sınıflandırma sonucunu kullanan istemcinin ihtiyacı değildir. Ad alanları sayesinde istemci Türkçe adları göstermek için katalogları kopyalamak zorunda kalmaz; kataloglar backend'de tek kaynak olarak kalır (D-012). Adlar ID'den türetilebildiği için veritabanına yazılmaz.

### D-034 — Kabul sonrası `failed` yanıtı ve HTTP durum kodları
- **Karar:**
  - Kabul edilmiş bir belge `failed` olduğunda kayıt ve storage dosyası saklanır; yanıt gövdesi D-032'deki alanları (`status = "failed"`, sınıflandırma alanları `null`, `needs_review = false`) ve genel bir `message` alanını içerir. HTTP kodu:
    - `422` → belge içeriği işlenemedi: metin çıkarılamadı veya yeterli metin yok.
    - `502` → Gemini ile sınıflandırma tamamlanamadı: geçici hata veya geçersiz çıktı nedeniyle 3 deneme tükendi ya da retry edilmeyen bir hata (ör. `400`/`401`/`403` ya da Gemini aşamasında beklenmeyen bir hata) oluştu.
  - Kabul sonrası dosya storage'a ya da kayıt veritabanına yazılamazsa (ör. disk hatası, veritabanı bağlantı/commit hatası) `failed` kaydı da oluşmaz: veritabanı işlemi geri alınır, bu isteğin storage dosyası (yarım yazılmışsa da) silinir ve ayrıntısız `500` (`Internal Server Error`) döner.
  - Diğer yanıtlar: başarılı sınıflandırma `200` (D-032; `status` `classified` veya `needs_review`). Kabul öncesi redlerde kayıt ve dosya oluşmaz (D-004): `413` (D-028) ve `415` (D-001) genel mesajlı `{"detail": "..."}` gövdesiyle, istek doğrulanamazsa (ör. `file` alanı yok) FastAPI'nin standart `422` gövdesiyle (`{"detail": [...]}`) döner. İki `422`, gövdedeki `status` alanıyla ayırt edilir.
  - Endpoint bunların dışında HTTP kodu üretmez; çerçevenin standart yanıtları (ör. çok parçalı gövde ayrıştırılamazsa `400`, yanlış HTTP metodu için `405`) endpoint çalışmadan döner. Hatanın ayrıntılı nedeni yalnızca loglanır; iç hata ayrıntısı (exception, stack trace, Gemini/kütüphane mesajı) yanıta girmez.
- **Gerekçe:** Dışarıdan hata ayrımı basit kalır: sorun belgede mi yoksa sınıflandırma servisinde mi, HTTP kodundan anlaşılır. İstemci `failed` kaydının kimliğini alır; teknik hata detayları yanıta girmez. `500` bilinçli bir hata sınıfı değildir; kaydın yazılamadığı beklenmeyen durumda yarım kayıt veya yetim dosya bırakılmaz.

### D-044 — Özet ve gönderen bilgisi aynı Gemini çağrısında (V1.2)
- **Karar:**
  - Sınıflandırma çıktısına üç alan eklenir: `summary` (belgenin amacını ve konusunu anlatan 1-3 kısa Türkçe cümle, her zaman dolu), `sender_name` ve `sender_institution` (yalnızca belgede açıkça yazıyorsa dolu, aksi hâlde `null`).
  - Bu alanlar **mevcut tek sınıflandırma çağrısından** gelir (D-008); ikinci bir LLM çağrısı, ayrı bir çıkarım adımı, agent veya RAG eklenmez. Retry/timeout politikası (D-033) değişmez.
  - Model tahmin etmez: gönderen kişi/kurum açıkça yazmıyorsa `null` verir. Belgenin muhatabı olan belediye/müdürlük gönderen kurum sayılmaz.
  - Boş veya yalnızca boşluktan oluşan `summary` geçersiz model çıktısıdır ve D-033'e göre retry edilir.
  - `documents` tablosuna üç nullable TEXT kolonu eklenir (`summary`, `sender_name`, `sender_institution`); migration `cedf33674167`. Nullable olmaları migration öncesi kayıtlarla uyum içindir. `failed` kayıtlarda üçü de `null` kalır.
  - Alanlar classify yanıtına ve D-043'teki liste/detay yanıtlarına eklenir.
- **Gerekçe:** Kayıt listesinde belgenin ne hakkında olduğunu ve kimden geldiğini görmek, sınıflandırma sonucunun tek başına vermediği ilk pratik ihtiyaç. Aynı çağrıda üretildikleri için ek gecikme ve maliyet doğmaz. Uydurma isim/kurum yanlış yönlendirir; bu yüzden belirsizlikte boş bırakmak zorunludur.

### D-020 — Senkron işleme
- **Karar:** Endpoint dosyayı kaydetme, metin çıkarımı, Gemini çağrısı (retry dahil) ve veritabanı kaydını aynı istek içinde yapıp sonucu döndürür; kuyruk veya arka plan işi yok.
- **Gerekçe:** "API sınıflandırma sonucunu döndürür" akışının en basit karşılığı.

### D-021 — Agent sistemi kullanılmayacak
- **Karar:** LangGraph dahil agent veya çok adımlı LLM orkestrasyonu yok.
- **Gerekçe:** Görev tek çağrılık bir sınıflandırma; agent yapısı gereksiz karmaşıklık ve maliyet getirir.

### D-022 — RAG kullanılmayacak
- **Karar:** Retrieval-augmented generation yok; kataloglar doğrudan prompt'a eklenir.
- **Gerekçe:** Katalog prompt'a sığacak kadar küçük; retrieval katmanı fayda sağlamadan karmaşıklık ekler.

### D-023 — Vector database kullanılmayacak
- **Karar:** Vektör veritabanı ve embedding altyapısı yok.
- **Gerekçe:** RAG ve benzerlik araması olmadığından ihtiyaç yok.

### D-024 — Mimari bilinçli olarak basit tutulacak
- **Karar:** Microservice, repository pattern (gerçekten gerekmedikçe), factory pattern, gereksiz service katmanları, workflow engine ve fine-tuning yok. Yeni soyutlama ancak güçlü gerekçe ve bu dosyada bir kararla eklenir.
- **Gerekçe:** Öncelik hızlı ve anlaşılır bir MVP; soyutlamalar gerçek ihtiyaç ortaya çıktığında eklenir.

### D-025 — MVP'de authentication ve admin paneli yok
- **Karar:** Kimlik doğrulama/yetkilendirme ve admin paneli kapsam dışı.
- **Gerekçe:** MVP sınıflandırma akışını kanıtlamaya odaklanır; auth ihtiyacı entegrasyon gereksinimleriyle birlikte belirlenecek.

## Frontend

### D-037 — Frontend yığını: React + Vite + TypeScript, npm, düz CSS
- **Karar:** Frontend React + Vite ile **TypeScript** kullanılarak yazılır. Paket yöneticisi **npm**. Stil için **düz CSS** kullanılır. Tailwind, UI bileşen kütüphanesi, Redux veya ek state management kütüphanesi eklenmez; gereken durum React'in kendi state'iyle tutulur.
- **Gerekçe:** Tek sayfalık yükleme ve sonuç ekranı için ek kütüphane gereksiz katman olur (D-024). TypeScript, API yanıt alanlarındaki uyuşmazlığı çalışma zamanı yerine derleme zamanında yakalar.

### D-038 — Geliştirmede frontend–backend iletişimi Vite proxy ile, CORS middleware yok
- **Karar:** Frontend istekleri `/api/...` göreli yollarına yapılır; Vite dev sunucusu bu yolları `http://127.0.0.1:8000` adresine proxy'ler. Frontend kodunda backend adresi sabit yazılmaz. Bu aşamada FastAPI'ye CORS middleware eklenmez. Proxy hedefinde `localhost` değil `127.0.0.1` kullanılır (D-036 ile aynı gerekçe).
- **Gerekçe:** Tarayıcı için istekler aynı origin'den gider, bu yüzden CORS gerekmez ve backend değişmeden kalır. Dağıtımda frontend ile backend ayrı origin'lerde sunulacaksa bu karar güncellenerek CORS ele alınır.

### D-039 — Frontend istek zaman aşımı: 120 saniye
- **Karar:** Frontend, classify isteği için 120 saniye zaman aşımı uygular. Süre dolarsa istek iptal edilir ve kullanıcıya genel bir hata mesajı gösterilir.
- **Gerekçe:** Senkron akışın en kötü durumu yaklaşık 93 saniyedir (D-033); 120 saniye bunun üzerine pay bırakırken asılı kalan isteği sınırsız beklemeyi önler. Zaman aşımı yalnızca istemci tarafındadır: backend işlemi tamamlayıp kaydı yazmış olabilir.

### D-040 — Frontend'de dosya ön kontrolü; otorite backend'de
- **Karar:** Dosya seçildiğinde frontend uzantının `.pdf` veya `.docx` olduğunu ve boyutun 50 MB'ı aşmadığını kontrol eder; uymayan dosya gönderilmeden kullanıcıya uyarı gösterilir. Bu kontrol yalnızca kullanıcı deneyimi içindir: kabul kararı backend'e aittir (D-001, D-028), backend doğrulamaları kaldırılmaz ve `413` / `415` yanıtları frontend'de ayrıca işlenir.
- **Gerekçe:** Kullanıcı yanlış veya büyük dosyada anında geri bildirim alır; gereksiz yükleme ve sunucu işi önlenir. İstemci kontrolü atlatılabileceği için güvenlik sınırı sayılmaz. 50 MB sınırı bu nedenle frontend'de de yazılır; sınır değişirse iki yer birlikte güncellenmelidir.
