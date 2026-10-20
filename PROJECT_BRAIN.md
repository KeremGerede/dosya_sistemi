# PROJECT_BRAIN — Belge Sınıflandırma Modülü

> Projenin kalıcı referansı. Yalnızca projenin temel amacı, mimarisi veya kapsamı gerçekten değiştiğinde güncellenir.
> Güncel durum → `CURRENT_STATE.md` · Açık işler → `TODOS.md` · Aktif kararlar → `DECISIONS.md` · Özellik davranışı ve sözleşmeler → `docs/TEKNIK_SARTNAME.md` · Çalışma kuralları → `CLAUDE.md`
>
> Bu dosyayla çelişen bir değişiklik gerekiyorsa önce `DECISIONS.md` kurallarına göre yeni bir karar kaydı aç (değişen kararın eski kaydı "Yerini aldı" olur), sonra bu dosyayı ona göre düzelt.

## 1. Amaç

Kullanıcının yüklediği bir **PDF, DOC, DOCX, JPG/JPEG veya PNG** belgesinin metnini çıkaran (güvenilir dijital metni olmayan belgelerde Gemini multimodal transkripsiyonuyla), bu metni **tek bir Gemini sınıflandırma çağrısıyla** belge türü ve ilgili kurum/birim açısından sınıflandıran; orijinal dosyayı, çıkarılan metni ve sonucu saklayan küçük bir modül.
İleride başka sistemlerle entegre edilecek; bu yüzden API odaklı, bağımsız çalışabilen ve sade olmalı.

**Hedef kullanıcı ve problem:** Kamu kurumları ve belediyeler. Gelen belgeleri okumak, türünü ve ilgili birimi belirlemek bugün elle yapılan, yavaş ve kişiden kişiye değişen bir iştir.

**Kullanıcılar ve roller:** Belgeyi yükleyen, sonucu inceleyen ve onaylayan ya da düzelten kurum personeli. Kimlik doğrulama ve rol ayrımı yoktur (D-025); onaylayan kişi kaydedilmez (D-049). İleride entegre olacak dış sistemler aynı API'yi kullanır.

**Ürün sınırı:** Sistem tam bir EBYS, CİMER veya CRM yerine geçmez. Mevcut kurumsal sistemlerin önünde veya yanında çalışan, AI destekli bir belge kabul ve belge anlama (document intake / document intelligence) katmanıdır.

Ana hedefler: **basitlik · hızlı geliştirme · verimlilik · ileride genişletilebilirlik.**

## 2. Temel akış

1. İstemci dosyayı yükler (`multipart/form-data`). Legacy / tek-adımlı `POST /api/documents/classify` aşağıdaki adımların tamamını tek istekte yapar; V1.4 arayüzünün kullandığı iki adımlı akış bu listenin altında anlatılır.
2. Kabul kontrolü: dosya PDF, DOC, DOCX, JPG/JPEG veya PNG değilse ya da 50 MB'ı aşıyorsa **kayıt oluşturmadan** 4xx ile reddedilir.
3. Belge için `document_id` (UUID) üretilir; orijinal dosya `backend/storage/<document_id>.<uzanti>` olarak kaydedilir.
4. Metin çıkarılır (D-047):
   - Güvenilir dijital metni olan belgeler yerelde okunur: DOC → legacy-doc, DOCX → python-docx, PDF → PyMuPDF.
   - JPG/JPEG/PNG ve güvenilir dijital metni olmayan PDF'ler **Gemini multimodal transkripsiyonuyla** okunur.
5. Güvenilir dijital metin kararı:
   - **PDF:** Her sayfa ayrı değerlendirilir (D-003). Kendi metni 10 karakterden kısa olan sayfa taranmış sayılır. Alanının en az %50'si görüntü olan ve gömülü metni en fazla 200 karakter kalan sayfa da OCR gerektirir (bozuk metin katmanı olasılığı). Böyle bir sayfa yoksa PDF gömülü metniyle okunur; varsa PDF'in tamamı transkripsiyona gider: 1–3 sayfa **tek** çağrıda, 4+ sayfa en fazla **3 sayfalık** sıralı gruplar hâlinde. Grup metinleri sayfa sırasıyla birleştirilir.
   - **Görüntü:** JPG/JPEG/PNG'de gömülü metin aranmaz; görüntü her zaman transkripsiyona gider.
   - **Transkripsiyon:** Her grubun sonucu normalize edilir. Bir grubun bile metni 10 karakterden kısaysa ya da çağrısı 3 denemede tamamlanamazsa kısmi sonuç kullanılmaz; belgenin tamamı mevcut yerel çıkarım + **Tesseract acil durum yedeği** yolundan yeniden çıkarılır (`tur`, 400 dpi; D-042):
     - Görüntü tek sayfa olarak OCR'lanır; PDF'te Tesseract yalnız D-003 koşulunu sağlayan sayfalarda çalışır, diğer sayfaların güvenilir gömülü metni korunur.
     - İkinci koşuldaki sayfalarda gömülü metin ile OCR metni karşılaştırılır: OCR metni gömülü metnin kelime benzeri parçalarının tamamını içeriyorsa yalnızca OCR metni, içermiyorsa ikisi birden kullanılır.
     - Sayfa metinleri belge sırasıyla birleştirilir.
     - Yedeğin metni yeterliyse belge yedek OCR işaretiyle (`needs_review = true` + `review_reason`) devam eder.
   - Çıkarım hata verirse ya da nihai metin 10 karakterden kısaysa belge Gemini sınıflandırmasına gönderilmeden `failed` olarak kaydedilir.
6. Metnin en fazla ilk 50.000 karakteri, belge türü ve kurum kataloglarıyla birlikte **tek bir** Gemini sınıflandırma çağrısına gönderilir; yanıt Pydantic şemasına uygun structured output olarak alınır. Aynı çağrı, yönlendirmeyi destekleyen en fazla 2 kısa belge ifadesi (`routing_evidence`, D-050) de önerir. Geçici hatalarda (network, timeout, `429`, `5xx`, geçersiz model çıktısı) aynı çağrı toplam en fazla 3 kez denenir.
7. Backend çıktıyı kataloglara karşı doğrular ve `status` değerini belirler; yedek OCR işareti varsa sonuç `needs_review` olur. Önerilen ifadeleri modelin gördüğü metinde birebir doğrular ve doğrulanamayanları atar (`docs/TEKNIK_SARTNAME.md` F-04); evidence hatası sınıflandırmayı başarısız yapmaz ve retry üretmez. Gemini sınıflandırması sonuç vermezse belge `failed` olur.
8. Dosya referansı, çıkarılan metin, sınıflandırma sonucu ve doğrulanmış ifadeler `documents` tablosuna yazılır.
9. API sonucu döndürür (`failed` durumunda `422` veya `502`). Teknik hata detayları istemciye gönderilmez, loglanır.

**İki adımlı akış (V1.4; D-045, D-046):**

- `POST /api/documents/prepare`, yukarıdaki 2–5. adımları yapar ve kaydı `status = prepared` olarak yazar. Gemini sınıflandırması çağrılmaz; OCR gereken belgede yalnız transkripsiyon çağrısı yapılır. Yanıt, çıkarılan metni de içerir. Kullanıcı bu aşamada belgeyi önizler.
- Kullanıcı onaylarsa `POST /api/documents/{document_id}/classify`, kayıttaki metinle 6–9. adımları yapar. Dosya yeniden okunmaz; transkripsiyon/OCR tekrar çalışmaz. Orijinal dosya storage'da yoksa sınıflandırma yapılmaz.
- Kullanıcı vazgeçerse `DELETE /api/documents/{document_id}/prepared` kaydı ve dosyasını siler. Sahipsiz kalan `prepared` kayıtlar 24 saatten eskiyse sonraki prepare çağrısında temizlenir.
- Arayüz en fazla 5 dosyayı listeler ve sırayla işler.

**Kullanıcı onayı (D-049):** davranış → `docs/TEKNIK_SARTNAME.md` F-06.

**Belgedeki ilgili ifade (D-050):** davranış → `docs/TEKNIK_SARTNAME.md` F-04.

İşlem senkrondur: her istek kendi işini tamamlayıp yanıt döner. Kuyruk veya arka plan işi yoktur.

## 3. Teknoloji yığını

Teknoloji yığını, ortam değişkenleri ve yapılandırma kuralları → `docs/TEKNIK_SARTNAME.md` "Ortak teknoloji ve yapılandırma".

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
    api/documents.py                    # classify (legacy), prepare, {id}/classify, {id}/prepared, {id}/validation (kullanıcı onayı) + salt okunur endpoint'ler; metin çıkarım sırası (transkripsiyon → yedek) ve status
    api/catalogs.py                     # salt okunur GET /api/catalogs: düzeltme seçenekleri (D-049)
    services/file_service.py            # kabul kontrolü, storage'a kaydetme, yerel metin çıkarımı, OCR gereksinimi kararı, Tesseract yedeği
    services/classification_service.py  # katalog yükleme, prompt, çıktı doğrulama, routing evidence doğrulaması (D-050), transkripsiyon çağrısı, retry politikası (D-033)
    llm/gemini_client.py                # google-genai ince sarmalayıcısı: sınıflandırma ve transkripsiyon için tek istek, 30 sn timeout, SDK retry kapalı
    schemas/classification.py           # LLM çıktı şeması + API yanıt şeması, onay isteği ve katalog yanıtı
    models/document.py                  # SQLAlchemy Document modeli
    config/document_types.json          # belge türü kataloğu
    config/institutions.json            # kurum kataloğu
  storage/                              # orijinal dosyalar: <document_id>.<uzanti> (git'e girmez)
frontend/                               # React + Vite: en fazla 5 dosya → önizle → seçilenleri sınıflandır → sonucu onayla/düzelt, belgedeki ilgili ifade; kayıtlar (tek sayfa)
```

Bu yapı yön gösterir, zorunlu değildir. Kurallar:

- Daha basit bir alternatif varsa tercih edilir (ör. `gemini_client.py` tek fonksiyondan ibaret kalırsa `classification_service.py` içine katlanabilir).
- Endpoint doğrudan SQLAlchemy session kullanabilir; repository, factory veya ek servis katmanı eklenmez.
- Yeni bir soyutlama katmanı için somut gerekçe ve `DECISIONS.md` kaydı gerekir.
- Sayısal sınırlar (50 MB, 10 karakter, %50 görüntü kapsaması, 200 karakter, 3 sayfalık transkripsiyon grubu, 50.000 karakter, 3 deneme, 30 sn timeout, 1/2 sn bekleme) kodda tek bir yerde tanımlanır. Tek istisna: 50 MB sınırı D-040 gereği frontend ön kontrolünde de tanımlıdır; ikisi birlikte güncellenir.

**Geliştirme ortamı** (D-036):

- PostgreSQL 18 Docker Compose ile çalışır. Tek servis; veriler Docker yönetimindeki `dosya_sistemi_pgdata` volume'unda kalır. Host portu `127.0.0.1:5433`.
- FastAPI backend yerel makinede çalışır (kurulum ve komutlar: `README.md` "Kurulum").
- React/Vite frontend de yerel makinede çalışır. İstekler `/api/...` göreli yollarına yapılır; Vite dev sunucusu bunları `http://127.0.0.1:8000` adresine proxy'ler, backend'e CORS middleware eklenmez (D-038).
- Backend ve frontend şimdilik containerize edilmez.

## 5. Dosya işleme ve depolama

Kabul kontrolü ve depolama → `docs/TEKNIK_SARTNAME.md` F-01; metin çıkarımı, OCR ve metin yeterliliği → F-02.

## 6. Kataloglar

Kataloglar kod değil, **veridir**: yeni tür veya kurum eklemek kod değişikliği gerektirmemelidir. Uygulama başlarken JSON'dan yüklenir. Güncel kataloğun tek kaynağı JSON dosyalarıdır; burada kopyası tutulmaz.

**`document_types.json`** — `[{ "id": "...", "name": "..." }]` · güncel liste: `backend/app/config/document_types.json`

**`institutions.json`** — `[{ "id": "...", "name": "...", "description": "..." }]` · güncel liste ve açıklamalar: `backend/app/config/institutions.json`

- `id` formatı: küçük harf, ASCII, `snake_case`.
- `id` değerleri veritabanında saklandığı için kararlıdır: mevcut bir ID'nin anlamı değiştirilmez, gerekiyorsa yeni ID eklenir.
- `description`, Gemini'nin doğru birimi seçmesi için kısa ve ayırt edici yazılır: birimin sorumluluk alanı ve hangi konulardaki belgelerin ona gideceği.
- MVP'de kurum yönetim paneli ve veritabanından katalog yönetimi yoktur; değişiklik = JSON dosyasını düzenleyip uygulamayı yeniden başlatmak.

## 7. LLM sözleşmesi

Transkripsiyon sözleşmesi → `docs/TEKNIK_SARTNAME.md` F-02; sınıflandırma çağrısı, structured output alanları, `needs_review` kuralları ve retry → F-03; routing evidence doğrulaması → F-04. Tek çağrı ve kapalı katalog değişmezleri: §10 (INV-1, INV-2).

## 8. Veritabanı

Tek tablo: **`documents`**. Şema Alembic migration'larıyla yönetilir; `Base.metadata.create_all` kalıcı migration yöntemi olarak kullanılmaz.

| Sütun | Tip | Not |
|---|---|---|
| `id` | UUID, birincil anahtar | API yanıtında `document_id` olarak döner |
| `file_name` | string, not null | Yüklenen dosyanın orijinal adı |
| `file_type` | string, not null | `pdf` \| `doc` \| `docx` \| `jpg` \| `jpeg` \| `png` |
| `file_reference` | string, not null | Saklanan dosyanın `backend/storage/` klasörüne göre göreli yolu (`<document_id>.<uzanti>`) |
| `extracted_text` | text, null | Çıkarılan metnin tamamı; hiç metin çıkmadıysa `null` |
| `document_type` | string, null | Katalog `id`; `failed` ise `null` |
| `institution_id` | string, null | Katalog `id`; eşleşme yoksa veya `failed` ise `null` |
| `needs_review` | boolean, not null | |
| `review_reason` | text, null | Modelin inceleme gerekçesi ve/veya yedek OCR gerekçesi (D-047); teknik hata detayı yazılmaz |
| `summary` | text, null | Belge özeti (D-044); `failed` ise `null` |
| `sender_name` | text, null | Gönderen kişi (D-044); belirtilmemişse veya `failed` ise `null` |
| `sender_institution` | text, null | Gönderen kurum (D-044); belirtilmemişse veya `failed` ise `null` |
| `validated_document_type` | string, null | Kullanıcının onayladığı belge türü (katalog `id`, D-049); onaysız kayıtta `null` |
| `validated_institution_id` | string, null | Kullanıcının onayladığı kurum (katalog `id`); onaylı kayıtta da `null` olabilir ("Belirlenemedi") |
| `validated_at` | timestamp (tz), null | Son onay zamanı; doluysa `validated_document_type` da doludur |
| `routing_evidence` | json, null | Kaynakta doğrulanmış ifadeler `[{quote, supports}]` (D-050). `NULL`: evidence üretilmedi (eski kayıt, `prepared`, `failed`); `[]`: sınıflandırma çalıştı, doğrulanan ifade yok. Yalnız başarılı sınıflandırma yazar |
| `status` | string, not null | `classified` \| `needs_review` \| `failed` (kalıcı) · `prepared` (V1.4 ara durumu) |
| `created_at` | timestamp (tz), not null | |

`status` belirleme:

- `classified` — sınıflandırma başarılı, `needs_review = false`
- `needs_review` — sınıflandırma başarılı, `needs_review = true` (model işaretledi ya da metin Tesseract yedeğiyle çıkarıldı)
- `failed` — kabul edilen belgede metin çıkarımı başarısız, normalize edilmiş metin 10 karakterden kısa, Gemini ile sınıflandırma tamamlanamadı (geçici hata veya geçersiz çıktı nedeniyle 3 deneme tükendi ya da retry edilmeyen kalıcı hata). Bu kayıtlarda `document_type`, `institution_id`, `review_reason`, `summary`, `sender_name`, `sender_institution` ve `routing_evidence` `null`, `needs_review = false`.
- `prepared` (V1.4; D-046) — metin çıkarıldı ve yeterli, ama belge henüz sınıflandırılmadı. Sınıflandırma alanları `null`, `created_at` hazırlık anıdır. `needs_review = false`; metin Tesseract yedeğiyle çıkarıldıysa `needs_review = true` ve `review_reason` doludur (D-047), sınıflandırma bu işareti korur.
  - Kayıt listesinde görünmez.
  - Yalnızca `/{document_id}/classify` ile sonuca geçer ya da `DELETE /{document_id}/prepared` ile silinir.
  - Sahipsiz kalırsa 24 saat sonra, sonraki prepare çağrısında temizlenir.

Kullanıcı onayı (D-049) `status`, `needs_review` ve AI alanlarını değiştirmez; `status` AI işleme sonucunu gösterir. Onay alanları yalnız onay endpoint'iyle ve birlikte yazılır.

Kabul edilmeyen dosyalar (desteklenmeyen tür, 50 MB üstü) için satır oluşturulmaz.

## 9. API

Endpoint'ler, yanıt alanları ve hata sözleşmesi → `docs/TEKNIK_SARTNAME.md` F-08.

## 10. Proje prensipleri

1. **Önce basitlik.** En az dosya, en az katman. Soyutlama ancak somut ihtiyaç doğduğunda.
2. **Tek sınıflandırma çağrısı.** Tür, kurum, özet, gönderen ve yönlendirmeyi destekleyen belge ifadeleri aynı çağrıda belirlenir. OCR gereken belgede yalnız metni okuyan ayrı bir transkripsiyon çağrısı vardır; ikisi birleştirilmez. Zincir, agent veya çok adımlı akış yok. Retry yalnızca aynı çağrının tekrarıdır.
3. **Kapalı katalog.** Model seçer, üretmez; backend doğrular.
4. **Emin değilsen incelemeye gönder.** Yanlış otomatik atama yerine `needs_review`.
5. **Katalog veridir.** Genişletme JSON üzerinden, kod değişmeden.
6. **Entegrasyona hazır.** Net API sözleşmesi; backend frontend'den bağımsız çalışır; teknik hata detayı dışarı sızmaz.

### Kritik değişmezler

Birini değiştirmek yeni bir karar kaydı gerektirir. `CLAUDE.md` "Kırmızı çizgiler" bu listeye işaret eder.

- **INV-1** Belge başına tek Gemini sınıflandırma çağrısı; OCR gereken belgede yalnız ayrı bir transkripsiyon çağrısı. Agent, RAG, vector DB ve çok adımlı zincir yok (D-008, D-021, D-022, D-023).
- **INV-2** Model yalnız kataloglardan seçer, backend doğrular; belirsizlikte zorla atama yapılmaz, belge `needs_review` olur (D-010).
- **INV-3** Kullanıcı onayı AI sonucunu değiştirmez; onay yalnız `validated_*` alanlarına yazılır (D-049).
- **INV-4** "Belgedeki ilgili ifade" yalnız kaynak metinde birebir doğrulanmış alıntıdır; evidence hatası sınıflandırmayı başarısız yapmaz (D-050).
- **INV-5** Kalıcı kayıtlar (`classified`, `needs_review`, `failed`) silinmez; silme yalnız `prepared` kayıtta yapılır (D-019, D-046).
- **INV-6** Teknik hata ayrıntısı istemciye gitmez; storage yolu yanıtta dönmez; belge metni, dosya içeriği ve API anahtarı loglanmaz (D-004, D-034, D-043, D-050; `backend/app/api/documents.py`, `backend/app/database.py`).

## 11. MVP kapsamı

- En fazla 50 MB PDF, DOC, DOCX, JPG/JPEG ve PNG yükleme.
- Metin çıkarımı:
  - PyMuPDF, legacy-doc ve python-docx ile yerel çıkarım.
  - Güvenilir dijital metni olmayan belgelerde Gemini multimodal transkripsiyonu; yedekte Tesseract OCR.
- Metin kuralları:
  - Normalize edilmiş metin için 10 karakter alt sınırı.
  - PDF'te sayfa bazlı güvenilir metin kararı: sınırın altında kalan sayfalar ve görüntüye dayalı olup metni 200 karakteri geçmeyen sayfalar.
  - Tesseract yedeğinde (`tur` / 400 dpi) aynı sayfadaki gömülü metin ile OCR metninin tekrarsız birleştirilmesi.
  - Yedekle okunan belgelerin `needs_review` olarak işaretlenmesi.
- Orijinal dosyanın storage alanında, çıkarılan metnin veritabanında saklanması
- Metnin ilk 50.000 karakteriyle tek Gemini sınıflandırma çağrısı; her Gemini çağrısında 30 sn timeout, geçici hatalarda toplam en fazla 3 deneme
- Belge türü + kurum sınıflandırması (structured output), `needs_review` / `review_reason` üretimi
- Aynı çağrıda belge özeti ve (varsa) gönderen kişi/kurum bilgisi (D-044)
- Aynı çağrıda yönlendirmeyi destekleyen, kaynakta birebir doğrulanmış en fazla 2 ifade; sonuç kartında ve Kayıtlar detayında "Belgedeki ilgili ifade" olarak gösterilir (D-050)
- JSON dosyalarında belge türü ve kurum katalogları
- UUID birincil anahtarlı `documents` tablosu, Alembic migration'ları
- Yazma endpoint'leri: legacy / tek-adımlı `POST /api/documents/classify` ve V1.4 iki adımlı akış (`prepare`, `/{document_id}/classify`, `DELETE /{document_id}/prepared` — D-019, D-045, D-046) ve kullanıcı onayı (`PUT /{document_id}/validation` — D-049). Kayıtları görmek için üç salt okunur endpoint (liste, detay, indirme — D-043), salt okunur `GET /api/catalogs` ve operasyonel `GET /health`
- Basit React + Vite + TypeScript arayüz (Vite proxy ile `/api`, istek başına 120 sn zaman aşımı):
  - Sınıflandırma ekranı: en fazla 5 dosyayı çoklu seçim veya sürükle-bırakla ekleme, analizden önce içerik merkezli önizleme (varsayılan: çıkarılan metinden oluşturulan yapılandırılmış belge formu; yardımcı: orijinal belge ve çıkarılan metin; önizleme formu Gemini kullanmaz, sınıflandırma onaydan sonra), seçilen dosyaları sırayla sınıflandırma ve dosya başına durum/sonuç; sonuç kartında sonucu onaylama veya katalog içinden düzeltme (D-049).
  - Kayıtlar görünümü: kayıtları effective belge türü ve kurumuyla (onaylıysa onaylanan değer) listeler, orijinal belgeyi indirir, detayda onay/düzeltme sunar; dosya adında arama, tür/kurum/durum filtresi ve üç özet sayısı istemci tarafındadır (D-048, D-049).

Bu liste kapsam özetidir; özelliklerin davranışı, kabul ölçütleri ve sınırları için tek kaynak `docs/TEKNIK_SARTNAME.md`'dir.

## 12. Açıkça kapsam dışı

DOCX ve DOC için OCR · desteklenenler dışındaki dosya türleri (GIF, TIFF, BMP, WebP, HEIC) · DOC'ta gömülü görüntü, makro ve biçimlendirme · görüntüler için otomatik döndürme/OSD ve ön işleme · el yazısı dedektörü veya belge türüne göre OCR motoru seçimi · Tesseract çıktısının Gemini ile düzeltilmesi · ek OCR modeli · transkripsiyon ile sınıflandırmanın tek çağrıda birleştirilmesi · dinamik veya gelişmiş chunking ve karmaşık uzun belge işleme (sınıflandırmada ilk 50.000 karakter kuralı, D-027; transkripsiyonda yalnız OCR gereken PDF'ler için 3 sayfalık sabit gruplar, D-047) · transkripsiyon gruplarının paralel gönderilmesi · 50 MB üstü dosyalar · farklı Gemini modeline ya da başka LLM'e fallback · dosyaların veritabanında binary saklanması · LangGraph · agent sistemleri · RAG · vector database · fine-tuning · microservice mimarisi · repository pattern (gerçekten gerekmedikçe) · factory pattern · gereksiz service katmanları · karmaşık workflow engine · authentication / authorization · admin paneli · kurum yönetim paneli · kataloğun veritabanından yönetimi · kalıcı kayıtların silinmesi ve AI sonucunun değiştirilmesi (yalnız `prepared` kayda özgü geçişler ve kullanıcı onayı alanlarını yazan onay endpoint'i vardır — D-046, D-049) · onay geçmişi, onaylayan kişinin kaydı, iş akışı / SLA ve business status · ayrı evidence/çıkarım çağrısı, evidence düzenleme veya kullanıcı tarafından evidence ekleme, anlamsal evidence filtresi ve tekilleştirme, evidence güven skoru ve OCR kaynağı (provenance) etiketi (D-050) · kayıtlar için sunucu tarafı arama, filtre ve sayfalama (Kayıtlar görünümünde yalnız istemci tarafı arama/filtre vardır — D-048) · ek tablolar · kuyruk / arka plan işleri / worker / zamanlayıcı · WebSocket · klasör veya ZIP yükleme · 5'ten fazla dosyalık toplu yükleme · paralel belge işleme · Word belgelerinin tarayıcıda birebir render'ı · belge düzenleme ve PDF annotation · listede sürükle-bırakla sıralama · bulut nesne depolama

Bunlardan birini eklemek için önce `DECISIONS.md` kurallarına göre yeni bir karar kaydı açılmalıdır (değişen kararın eski kaydı "Yerini aldı" olur).

## 13. Gelecekteki genişleme yönü (taahhüt değil)

- Hâlen kapsam dışı olan dosya formatları (GIF, TIFF, BMP, WebP, HEIC)
- Taranmış tablo ve form belgelerinde okuma dayanıklılığı; OCR kaynaklı özet ve gönderen bilgisinin güvenilirliği
- Gerçek ihtiyaç görülürse 50.000 karakteri aşan uzun belgeler için daha kapsamlı işleme
- Belge türü ve kurum kataloglarının genişletilmesi; gerekirse veritabanına taşınıp yönetim arayüzü eklenmesi
- Başka sistemlerle entegrasyon
- Gerekirse dosya sisteminden nesne depolamaya geçiş
- Entegrasyon gerektirdiğinde authentication
