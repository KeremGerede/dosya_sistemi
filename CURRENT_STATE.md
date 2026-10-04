# CURRENT_STATE

> **Son güncelleme:** 2026-10-04
>
> Projenin güncel durumu (snapshot). Geliştirme günlüğü değildir: yalnız güncel durum, aktif riskler ve sıradaki adımlar tutulur. Geçmiş ayrıntılar Git geçmişinde, sürüm özetleri `README.md` "Sürüm Geçmişi" bölümündedir.
>
> Temel bilgiler → `PROJECT_BRAIN.md` · Aktif kararlar → `DECISIONS.md` · Çalışma kuralları → `CLAUDE.md`

## Mevcut aşama

**V1.0–V1.4 ve Kayıtlar deneyimi iyileştirmesi tamamlandı. Açık iş hattı yok.**

- **Kayıtlar deneyimi** (frontend; D-048): **tamamlandı**.
  - Listede ve detayda belge türü; dosya adında arama (büyük/küçük harf ve Türkçe karakter duyarsız); tür/kurum/durum filtresi; Toplam Kayıt / İnceleme Gereken / Başarısız sayıları.
  - Tamamen istemci tarafı; backend, API ve veritabanı değişmedi. Gerçek backend ve PostgreSQL ile 1366×768'de tarayıcıda doğrulandı.

- **V1.4 — Çoklu Belge Yükleme ve Önizleme** (UX/workflow; D-045, D-046): **tamamlandı**.
  - Hazırla → önizle → sınıflandır akışı. En fazla 5 dosya, sürükle-bırak, içerik merkezli önizleme, sıralı işleme.
  - `prepared` kayıt yaşam döngüsü: kaldırma (`DELETE …/prepared`), `409` kurtarma, sahipsiz kayıtlar için 24 saatlik yedek temizlik.
  - Analiz sonrası satırda tür/kurum, "Sonucu Gör" ile sonuç-önce panel ve masaüstünde sabit analiz çubuğu (2026-10-04).
  - Sonuç kartı: tür/kurum birincil, AI özeti, "Kontrol Öneriliyor" + kontrol nedeni, orijinal belgeyi gör/indir; önizleme ve çıkarılan metin varsayılan kapalı (2026-10-04).
  - Gerçek PostgreSQL, Gemini ve Tesseract ile uçtan uca doğrulandı. PDF görüntüleyici gerçek tarayıcıda elle doğrulandı.
- **V1.3 — El Yazısı ve Gelişmiş OCR Güvenilirliği** (OCR/extraction; D-047): **tamamlandı**.
  - OCR gereken belgelerde birincil OCR/transkripsiyon: Gemini 3.5 Flash Lite (`gemini-3.5-flash-lite`).
  - Gemini başarısız ya da yetersizse belge yerel çıkarım + Tesseract yedek yolundan yeniden çıkarılır. Yedek metin yeterliyse sonuç `needs_review` olur.
  - OCR gereken 4+ sayfalık PDF'ler en fazla 3 sayfalık sıralı gruplar hâlinde okunur.
  - Doğrulama:
    - El yazısı (9 örnek) ve basılı tarama (8 belge) benchmarkları.
    - Gerçek ortamda uçtan uca testler: 21 sayfalık taranmış PDF 7 grup çağrısıyla okundu, 21/21 sayfa geldi.

## Güncel mimari (özet)

Ayrıntılar: `PROJECT_BRAIN.md` §2, §5, §7. Kararlar: D-003, D-008, D-033, D-042, D-047.

**Yerel çıkarım** — güvenilir dijital metin varsa:
- PDF → PyMuPDF, DOC → legacy-doc, DOCX → python-docx.
- Bu belgeler Gemini transkripsiyonuna gitmez.

**OCR gereken belgeler** — JPG/JPEG/PNG ve en az bir sayfası D-003 koşulunu sağlayan PDF'ler; Gemini 3.5 Flash Lite multimodal transkripsiyonuyla okunur:
- Görüntü ve 1–3 sayfalık OCR PDF'i tek çağrıyla okunur.
- 4+ sayfalık OCR PDF'i en fazla 3 sayfalık sıralı gruplara bölünür. Grup metinleri sayfa sırasıyla birleştirilir.
- Her grubun metni normalize edilir ve en az 10 karakter olmalıdır.

**Yedek yol:**
- Bir grup bile 3 denemede tamamlanamaz ya da yetersiz kalırsa kısmi Gemini sonucu kullanılmaz.
- Belgenin tamamı mevcut yerel çıkarım + Tesseract yedek yolundan yeniden çıkarılır.
- PDF'te Tesseract (`tur`, 400 dpi) yalnız D-003 koşulunu sağlayan sayfalarda çalışır; diğer sayfaların güvenilir gömülü metni korunur.
- Yedek metin yeterliyse sonuç `needs_review` olur; değilse `failed` + `422`.

**Sınıflandırma:** Transkripsiyondan ayrı, tek bir Gemini çağrısıdır (structured output). Metnin ilk 50.000 karakterini kullanır; tür, kurum, özet ve gönderen aynı çağrıda belirlenir.

**Gemini çağrıları:**
- 30 sn timeout, SDK retry kapalı; çağrı başına en fazla 3 gerçek deneme (1 sn / 2 sn bekleme).
- Transkripsiyon hatası `502` üretmez. Sınıflandırma hatası `failed` + `502` üretir.

**Akışlar:**
- Legacy, tek adımlı `POST /api/documents/classify`.
- V1.4 iki adımlı akış: `prepare` → `/{id}/classify`; vazgeçmek için `DELETE /{id}/prepared`.
- Salt okunur liste, detay ve indirme; ayrıca `GET /health`.

**Bilinçli olarak yok:**
- El yazısı dedektörü, Tesseract → Gemini düzeltme zinciri, ek OCR motoru.
- 3 sayfalık sabit gruplar dışında dinamik/gelişmiş chunking; grupların paralel gönderilmesi.
- Agent/RAG/vector DB, kuyruk/worker, authentication.

## Repo ve geliştirme ortamı

**Backend** (`backend/app/`):
- `api/documents.py` — endpoint'ler; metin çıkarım sırası (transkripsiyon → yedek) ve `status`.
- `services/file_service.py` — kabul kontrolü, storage, yerel metin çıkarımı, OCR gereksinimi kararı (`needs_ocr`), PDF grupları (`transcription_parts`), Tesseract yedeği.
- `services/classification_service.py` — sınıflandırma ve transkripsiyon çağrıları, prompt'lar, çıktı doğrulama, retry politikası.
- `llm/gemini_client.py` — google-genai ince sarmalayıcısı (`generate_json`, `transcribe`).
- `schemas/`, `models/`, `config/` (belge türü ve kurum katalogları), `alembic/`.

**Veritabanı:** Tek `documents` tablosu. Alembic head `cedf33674167` (iki migration).

**Frontend** (`frontend/`): React + Vite + TypeScript, tek sayfa.
- `src/App.tsx` — sınıflandırma ve kayıtlar görünümleri.
- `src/documentPreview.ts` — önizleme alanlarının deterministik çıkarımı.
- `src/records.ts` — Kayıtlar arama, filtre ve özet sayıları için saf yardımcılar (D-048).

**Geliştirme ortamı** (D-036):
- PostgreSQL 18 Docker Compose ile `127.0.0.1:5433`'te çalışır.
- Backend (`uvicorn`) ve frontend (Vite; `/api` proxy → `127.0.0.1:8000`) yerelde çalışır, containerize edilmez.
- Kurulum ve günlük komutlar: `README.md` "Kurulum" ve "Çalıştırma".

**Ortam değişkenleri:**
- Zorunlu: `GEMINI_API_KEY`, `GEMINI_MODEL` (`gemini-3.5-flash-lite`), `DATABASE_URL`.
- Opsiyonel: `TESSDATA_PREFIX` (yalnız Tesseract yedeği için).

**Benchmark verileri** repo dışında tutulur; repoya örnek belge, ground truth veya ölçüm artefaktı girmez.

## Test baseline

- **Backend:** `pytest` **368 passed** (Starlette/anyio kaynaklı 2 bilinen deprecation uyarısıyla); `pip check` temiz.
- **Frontend:** `npm test` **42 passed**; `npm run build` ve `npm run lint` temiz.
- **Otomatik testler** gerçek Gemini API'si veya Docker PostgreSQL gerektirmez:
  - Endpoint testleri geçici SQLite, sahte sınıflandırma ve sahte transkripsiyon kullanır.
  - Gemini retry/timeout davranışı gerçek SDK + `httpx.MockTransport` ile test edilir.

**Son gerçek ortam doğrulaması** (2026-10-03; PostgreSQL + Gemini + Tesseract):
- **Basılı kontrol seti (8 belge):** Production transkripti, benchmark çıktısıyla normalize edilmiş haliyle 8/8 aynı.
- **Dijital PDF/DOCX/DOC:** Transkripsiyon yok; çıkarılan metin değişmedi.
- **Hybrid ve bozuk metin katmanlı PDF:** Tek transkripsiyon; tüm içerik okundu, bozuk katman sızmadı.
- **OCR gereken 3–21 sayfalık taranmış PDF'ler:** Tüm sayfalar okundu; 21 sayfa = 7 grup çağrısı, ~36 sn.
- **Zorlanmış 503:** Yedek yol çalıştı ve sonuç `needs_review` oldu. Bir grup başarısız olduğunda kısmi Gemini metni kullanılmadı.
- **Loglar:** Belge metni, API anahtarı ve storage yolu yok.

## Bilinen problemler ve riskler

Bilinen blocker yok. Aşağıdakiler kabul edilmiş sınırlar ve dikkat edilmesi gereken noktalardır.

**OCR / transkripsiyon**

- **Kalite kapısı yok:** Gemini'nin akıcı ama yanlış okumaları yakalanmaz. Yedek yol yalnız API hatasını ve boş ya da 10 karakterden kısa çıktıyı yakalar. Koruma: kullanıcı önizlemesi ve `needs_review` mantığı.
- **Ölçüm seti küçük:**
  - 9 el yazısı + 8 basılı belge, çoğunlukla temiz. Gerçek tarayıcı gürültüsü ve telefon fotoğrafı kapsamı sınırlı.
  - Sayfa eşiği ve 3 sayfalık grubun yeterliliği tek bir sentetik belge türüyle ölçüldü. Çok yoğun sayfalarda bir grubun eksik dönmesi yakalanmaz.
- **Süre:** Sayfa sayısıyla artar (grup başına ~5 sn; 21 sayfa ~36 sn). Her Gemini çağrısı en kötü ~93 sn sürebilir. Yavaş API'de uzun belgelerde prepare, frontend'in 120 sn sınırını aşabilir.
- **Büyük dosyalar:** Inline istek sınırını aşan dosyalar API'den kalıcı hata alır. Retry olmadan yedek yola düşer ve sonuç `needs_review` olur.
- **Maliyet ve veri akışı:**
  - OCR gereken belgede en az iki Gemini çağrısı yapılır (4+ sayfalık PDF'te grup başına bir transkripsiyon).
  - Basılı belgede transkripsiyon Tesseract'tan ~2,5× yavaş.
  - Dosyanın kendisi (görüntü/PDF) Gemini'ye gönderilir.
- **Çıktı biçimi:** El yazısında LaTeX ok işareti ve sütun okuma sırası farkı görülebilir; önizleme alanları etkilenebilir. Prompt ölçüldüğü haliyle sabittir.
- **Kısa transkript:** 10 karakterden kısa transkript yedek yola düşer. Gerçekten boş ya da okunmaz belgede `422`'den önce bir Tesseract çalıştırması eklenir.
- **Önizlemede yedek OCR uyarısı yok:** İşaret `prepared` yanıtında bulunur; arayüzde yalnız sınıflandırma sonucunda "Kontrol nedeni" olarak görünür.
- **Filigranlı dijital sayfa:** Tam sayfa arka plan/filigran görüntüsü olan bir dijital sayfada metin 200 karakterin altındaysa belge gereksiz yere transkripsiyona gider (ek çağrı ve süre).
- **Ölçülmeyenler:** Döndürülmüş görüntüler, gürültülü taramalar ve taranmış tablo/formlar Gemini ile ayrıca ölçülmedi.
- **Tesseract yedeğinin sınırları:**
  - EXIF etiketi olmayan döndürülmüş görüntüde anlamsız metin üretir (OSD yok).
  - Büyük harfte `İ→I`, `Ç→C` hataları yapar.
  - Çok gürültülü taramada çöp metin üretir ve uzun sürer.
  - Harf görünümlü bozuk metin katmanı OCR metninin yanında kalır.
- **`TESSDATA_PREFIX` yoksa:** Yedek OCR çalışmaz. Gemini de başarısızsa OCR gereken belgeler `failed` olur.

**Sınıflandırma ve LLM**

- **Tam deterministik değil:** `temperature=0`'da aynı metin bir kez `request`, bir kez `information_request` döndü (kurum aynı).
- **50.000 karakter sınırı:** Yalnız metnin ilk 50.000 karakteri değerlendirilir; belirleyici bilgi sonrasındaysa sonuç etkilenebilir.
- **Boş Gemini yanıtı** (ör. güvenlik filtresi): Geçersiz çıktı sayılır; 3 denemeden sonra `failed` + `502` olur.
- **Katalog:**
  - Katalogda olmayan birimlere ait belgeler `needs_review`'a düşer; kurum açıklamaları ilk taslaktır.
  - Katalog değişikliği uygulama yeniden başlatılmadan etkili olmaz.
  - `other` türü katalogdan çıkarılırsa servis yüklenmez.
- **SDK yükseltmesi:** google-genai yükseltilirse retry/timeout testleri (gerçek SDK + MockTransport) mutlaka yeniden çalıştırılmalı.
- **Tekilleştirme yok:** Aynı dosya tekrar sınıflandırılırsa yeni kayıt açılır ve yeni Gemini çağrıları yapılır.

**API ve backend**

- **Senkron işleme:** İstekler thread pool'da çalışır; her Gemini çağrısı en kötü ~93 sn bir thread'i meşgul eder. Eşzamanlı kapasite thread pool ile sınırlı.
- **Gövde boyutu:**
  - Uygulama seviyesinde gövde sınırı yok: 50 MB üstü yükleme reddedilse de önce geçici diske alınır. Dağıtımda reverse proxy sınırı gerekir.
  - DOCX için ZIP bomb koruması yok.
- **PDF imzası:** `%PDF` ilk baytta aranır; öncesinde ek bayt olan nadir PDF'ler `415` alır.
- **İki farklı `422` gövdesi** var (istek doğrulama ve `failed`); gövdedeki `status` alanıyla ayrılır.
- **Commit kenar durumu:** Commit sunucuda başarılı olup istemcide hata gibi görünürse dosya silinip kayıt kalabilir (nadir).
- **Kısıtsız alanlar:** `status` ve `file_type` veritabanında CHECK/ENUM ile kısıtlı değil; değerleri uygulama atar.
- **Word çıkarım kapsamı:**
  - DOCX: header/footer, textbox, iç içe tablo ve gömülü nesneler alınmaz.
  - DOC: gömülü görüntü, makro ve header/footer alınmaz.
  - DOC/DOCX'te OCR yapılmaz.
- **Loglama:** Belge metni, model çıktısı ve API anahtarı loglanmaz; metin çıkarımı hatalarında kütüphanenin hata mesajı loglanır.

**V1.4 akışı**

- **TTL temizliği tembeldir:** Sahipsiz `prepared` kayıt yalnız sonraki prepare çağrısında silinir.
- **Eşzamanlı classify:** Aynı `prepared` kayıt için iki classify (ör. iki sekme) iki Gemini çağrısı yapabilir; son yazan kazanır.
- **Silme yarışları:**
  - Classify sürerken kayıt silinirse (kaldırma/TTL) commit `500` alır.
  - Kaynak dosya Gemini çağrısı sürerken silinirse orijinali olmayan bir sonuç kaydı oluşabilir.
- **5 dosya sınırı yalnız arayüzde:** API istemcileri sınırsız prepare yapabilir.
- **Zaman ve yenileme:** Kayıtlar'daki `created_at` hazırlık anıdır. Sayfa yenilenirse liste kaybolur; hazırlanmış kayıtlar TTL ile temizlenir.
- **Orijinal görünüm:** PDF görüntüleyicisi olmayan tarayıcılarda (çoğu mobil) orijinal belge yerine yedek mesaj çıkar. DOC/DOCX için orijinal görünüm yok.
- **Önizleme alanları sezgiseldir:**
  - Konu erken kesilebilir; iki noktasız konu etiketi okunmaz.
  - Etiketsiz ve birden fazla tarih geçen belgede tarih boş kalır.
  - Alanlar saklanmaz ve sınıflandırmayı etkilemez.
- **120 sn zaman aşımı** (D-039) yalnız istemciyi keser; backend işlemi tamamlamış olabilir. Sınıflandırmada `409` → detay okuma ile kurtarılır.

**Kayıtlar görünümü**

- **İstemci tarafı filtre:** Liste sayfalamasız tek istekte gelir; arama, filtre ve özet sayıları yüklü liste üzerinde çalışır. Tür/kurum seçenekleri yalnız mevcut kayıtlardakilerdir. Kayıt sayısı çok artarsa sunucu tarafı sayfalama/filtre ayrı karar gerektirir (D-048).

**Geliştirme ortamı**

- **Port ve adres:** Bu makinede 5432'yi yerel bir Windows PostgreSQL servisi kullanıyor; Docker PostgreSQL `127.0.0.1:5433`'te. `DATABASE_URL`'de `localhost` değil `127.0.0.1` kullanılmalı (IPv6 `::1` bağlantısı asılı kalıyor).
- **PostgreSQL kapalıyken:** İstekler `connect_timeout=10` ile ~10 sn sonra `500` döner; `GET /health` veritabanına bakmaz. Bu parametre olmayan eski bir `.env` ~130 sn bekler.
- **Compose çakışması:** `docker-compose.yml` sabit container adı, port ve volume kullanır; aynı makinede ikinci bir klonun stack'i çakışır.
- **Zorunlu değişkenler:** `DATABASE_URL`, `GEMINI_API_KEY` ve `GEMINI_MODEL` başlangıçta zorunlu; biri eksikse uygulama (ve `/health`) başlamaz.
- **Vite:**
  - Dev sunucusu varsayılan olarak yalnız `localhost` (`::1`) üzerinde dinler.
  - Backend kapalıyken proxy boş gövdeli `502` döner.
  - Proxy yalnız geliştirme içindir; ayrı origin dağıtımında CORS/reverse proxy kararı gerekir.
- **Elle senkron tutulanlar:** 50 MB sınırı frontend'de de tanımlı ve backend ile birlikte güncellenmeli. Frontend `ClassifyResponse` tipi backend şemasıyla elle eşleştirilir.
- **Test kapsamı boşlukları:**
  - Frontend'de bileşen/tarayıcı testi yok; yalnız `src/documentPreview.ts` ve `src/records.ts` birim testleri var (`npm test`, Node 22.18+).
  - Endpoint testleri SQLite kullanır; PostgreSQL'e özgü davranış yalnız gerçek ortam testleriyle doğrulanır.
- **Küçük notlar:** Frontend'de favicon yok (geliştirmede `/favicon.ico` 404). Backend için linter yok. Ayrı dev requirements olmadığı için `pytest` `requirements.txt` içinde.

## Açık sorular

- Açık soru yok.

## Sıradaki geliştirme hedefleri

Açık iş hattı yok; V1.3 ve V1.4 tamamlandı. Aşağıdakiler **açılmış iş değildir**. Biri ele alınacaksa önce `DECISIONS.md` (gerekiyorsa `PROJECT_BRAIN.md`) güncellenir:

- Gerçek kullanım verisiyle kurum açıklamalarının iyileştirilmesi
- Taranmış tablo ve form belgelerinde okuma dayanıklılığı
- OCR kaynaklı özet ve gönderen bilgisi güvenilirliği
- Otomatik döndürme / orientation
- 50.000 karakteri aşan belgeler için metin seçimi stratejisi
- Deployment / production kararları: containerize etme, reverse proxy ve gövde boyutu sınırı, CORS (D-038), authentication
