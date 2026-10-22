# TEKNIK_SARTNAME — Belge Sınıflandırma Modülü

> Özellik kataloğu: her özelliğin amacı, davranışı, kabul ölçütleri, sınırları ve referansları. Ortak teknoloji bölümü birçok özelliğin kullandığı yığını ve yapılandırmayı tutar.
> Mimari model, veri modeli ve kritik değişmezler → `PROJECT_BRAIN.md` · Kararlar → `DECISIONS.md` · İşler → `TODOS.md` · Güncel durum ve baseline → `CURRENT_STATE.md` · Çalışma kuralları → `CLAUDE.md`
>
> - Durumlar: **Planlandı** → **Geliştiriliyor** → **Uygulandı**. Bir özelliğin davranışı değişince kaydı aynı görevde güncellenir.
> - Kabul ölçütleri otomatik testlere bağlıdır; ölçüt, adı geçen testler geçtiğinde sağlanmış sayılır. Otomatik testi olmayan ölçütte doğrulama yöntemi yazılıdır.
> - Test kısaltmaları: `api::` → `backend/tests/test_documents_api.py`, `file::` → `backend/tests/test_file_service.py`, `llm::` → `backend/tests/test_classification_service.py`, `preview:` → `frontend/tests/documentPreview.test.ts`, `records:` → `frontend/tests/records.test.ts`.
> - Backend kod yolları `backend/app/` altına görelidir.

## Özellik kataloğu

| ID | Özellik | Durum | Ana kararlar |
|---|---|---|---|
| F-01 | Belge kabulü ve depolama | Uygulandı | D-001, D-004, D-017, D-028, D-029 |
| F-02 | Metin çıkarımı ve OCR | Uygulandı | D-002, D-003, D-026, D-042, D-047 |
| F-03 | Sınıflandırma, özet ve gönderen | Uygulandı | D-007–D-012, D-027, D-031, D-033, D-044 |
| F-04 | Belgedeki ilgili ifade | Uygulandı (2026-10-07) | D-050, D-052 |
| F-05 | Hazırla → önizle → sınıflandır | Uygulandı | D-020, D-039, D-040, D-045, D-046 |
| F-06 | Kullanıcı onayı ve yönlendirme düzeltmesi | Uygulandı (2026-10-06) | D-049 |
| F-07 | Kayıtlar | Uygulandı | D-043, D-048 |
| F-08 | API ve hata sözleşmesi | Uygulandı | D-019, D-032, D-034 |
| F-09 | Başarısız sınıflandırmayı tekrar deneme | Uygulandı (2026-10-22) | D-053 |
| F-10 | Kalıcı belge silme | Uygulandı (2026-10-23) | D-054 |

## Ortak teknoloji ve yapılandırma

Seçim gerekçeleri: D-005 (backend ve frontend), D-006 (PostgreSQL, senkron SQLAlchemy, psycopg 3), D-007 (Gemini), D-030 (Alembic), D-035 (yapılandırma), D-036 ve D-051 (geliştirme ortamı, host portu), D-037 (frontend), D-041 (bağlantı zaman aşımı). Bir özelliğe özgü teknoloji o özelliğin kaydındadır.

| Katman | Teknoloji |
|---|---|
| Backend | Python, FastAPI |
| PDF metin çıkarımı | PyMuPDF |
| DOC metin çıkarımı | legacy-doc (saf Python, Word/LibreOffice gerekmez) |
| DOCX metin çıkarımı | python-docx |
| OCR / transkripsiyon | Gemini multimodal transkripsiyonu (birincil); PyMuPDF'in yerleşik Tesseract'ı (acil durum yedeği) |
| LLM | Google Gemini API, `google-genai` SDK (sınıflandırma: structured output, Pydantic şema; transkripsiyon: düz metin) |
| Veri doğrulama | Pydantic |
| ORM / DB | SQLAlchemy, PostgreSQL |
| Migration | Alembic |
| Dosya depolama | Uygulamanın storage klasörü (dosya sistemi) |
| Frontend | React, Vite, TypeScript (npm, düz CSS) |
| Geliştirme veritabanı | PostgreSQL 18, Docker Compose (yalnızca yerel geliştirme) |
| Test ve kalite | pytest; Node yerleşik test çalıştırıcısı (`node:test`); oxlint |

Ortam değişkenleri, zorunlulukları ve şablon değerleri: `README.md` "Ortam Değişkenleri" (tek kaynak; şablon `backend/.env.example`).

Model adı kodda sabit yazılmaz ve kodda varsayılan model yoktur. `GEMINI_API_KEY` veya `GEMINI_MODEL` tanımlı değilse Gemini istemcisi yüklenirken (uygulama başlangıcı) açık bir yapılandırma hatası verilir (fail fast); sessizce bir modele düşülmez. `DATABASE_URL` `settings.py` yüklenirken kontrol edilir. `TESSDATA_PREFIX` opsiyoneldir ve yokluğu uygulamayı durdurmaz. `.env` ve yüklenen dosyalar repoya commit edilmez; `.env.example` commit edilir.

## F-01 — Belge kabulü ve depolama

**Durum:** Uygulandı

**Amaç:** Yalnız desteklenen ve içeriği doğrulanmış dosyayı kabul etmek; kabul edilen her belgeyi orijinal dosyası ve kaydıyla izlenebilir biçimde saklamak.

**Davranış**

| `file_type` | Uzantı | Metin çıkarımı |
|---|---|---|
| `pdf` | `.pdf` | PyMuPDF; güvenilir dijital metni yoksa Gemini transkripsiyonu (yedek: sayfa bazlı Tesseract) |
| `doc` | `.doc` | legacy-doc (Word 97–2003 binary, OCR yok) |
| `docx` | `.docx` | python-docx (OCR yok) |
| `jpg` | `.jpg` | Gemini transkripsiyonu (yedek: PyMuPDF + Tesseract) |
| `jpeg` | `.jpeg` | Gemini transkripsiyonu (yedek: PyMuPDF + Tesseract) |
| `png` | `.png` | Gemini transkripsiyonu (yedek: PyMuPDF + Tesseract) |

**Kabul kontrolü** — dosya storage'a yazılmadan ve kayıt oluşturulmadan önce yapılır:

- Maksimum dosya boyutu **50 MB**. Aşan dosya `413` ile reddedilir.
- Desteklenenler dışındaki tüm türler (GIF, TIFF, BMP, WebP, HEIC dahil) `415` ile reddedilir.
- Tür yalnızca istemcinin gönderdiği content-type'a bakılarak belirlenmez; uzantı ve dosya imzası (PDF: `%PDF`, DOC: OLE imzası `D0 CF 11 E0 A1 B1 1A E1` **ve** Word'e özgü `WordDocument` stream'i, DOCX: ZIP + WordprocessingML, JPEG: `FF D8 FF`, PNG: `89 50 4E 47 0D 0A 1A 0A`) birlikte kontrol edilir. Uzantısı doğru ama imzası uymayan dosya (ör. `.png` uzantılı düz metin) reddedilir.
- Reddedilen dosya saklanmaz, `documents` kaydı oluşturulmaz.

**Depolama:**

- Orijinal dosya PostgreSQL'e binary olarak **yazılmaz**; `backend/storage/` altında düz bir klasörde saklanır, veritabanında `file_reference` tutulur.
- Dosya adı `<document_id>.<uzanti>` formatındadır (ör. `3f6c2a9e-8b1d-4c7a-9e2f-5a4b6c7d8e9f.pdf`); uzantı `file_type`'tan gelir (`pdf` / `doc` / `docx` / `jpg` / `jpeg` / `png`; yüklenen uzantı korunur). Bu nedenle `document_id` dosya kaydedilmeden önce uygulama tarafında üretilir.
- Kullanıcının orijinal dosya adı yalnızca `file_name` alanında saklanır; disk yolu olarak kullanılmaz.
- `file_reference`, storage klasörüne göre göreli yoldur (`<document_id>.<uzanti>`).
- Çıkarılan metnin tamamı `documents.extracted_text` (TEXT) alanında saklanır. 50.000 karakter sınırı yalnızca Gemini çağrısı için geçerlidir.

**Kabul ölçütleri**

- 50 MB'ı aşan dosya `413` alır; kayıt ve storage dosyası oluşmaz. Tam 50 MB kabul edilir. Yükleme en fazla sınır + 1 bayt okunur; `Content-Length` değerine güvenilmez — `api::test_file_over_size_limit_returns_413_without_db_or_storage`, `api::test_file_exactly_at_size_limit_is_accepted`, `api::test_upload_is_read_with_size_limit_not_fully`, `file::test_file_size_limit_is_50_mb`.
- Desteklenmeyen tür ya da uzantı–imza uyuşmazlığı `415` alır; kayıt ve dosya oluşmaz — `api::test_unsupported_file_returns_415_without_db_or_storage`, `file::test_wrong_extension_or_mismatched_content_is_rejected`, `file::test_image_extension_and_signature_must_match`, `file::test_non_word_ole_with_doc_extension_is_rejected`, `file::test_docx_bytes_with_doc_extension_are_rejected`.
- `file` alanı olmayan istek FastAPI'nin standart `422` gövdesini alır; kayıt oluşmaz — `api::test_missing_file_returns_validation_error_without_db_or_storage`.
- Dosya `<document_id>.<file_type>` adıyla saklanır; kullanıcının dosya adı yol olarak kullanılmaz; var olan bir dosyanın üzerine yazılmaz — `file::test_storage_file_name_is_built_from_document_id`, `file::test_user_file_name_is_not_used_as_storage_path`, `file::test_existing_storage_file_is_never_overwritten_or_deleted`.
- Dosya ya da kayıt yazılamazsa `500` döner; yarım dosya veya kayıt kalmaz — `api::test_storage_write_failure_returns_500_without_partial_file_or_record`, `api::test_db_commit_failure_rolls_back_and_removes_orphan_file`.

**Sınırlar**

- Aynı dosya tekrar yüklenirse yeni kayıt ve yeni Gemini çağrıları oluşur (tekilleştirme yok).
- Desteklenenler dışındaki formatlar (GIF, TIFF, BMP, WebP, HEIC) kapsam dışıdır (`PROJECT_BRAIN.md` §12).
- Uygulama seviyesinde gövde sınırı ve DOCX ZIP bomb koruması yoktur; dağıtım eksiği olarak `CURRENT_STATE.md` ve T-12'de izlenir.

**Referanslar:** D-001, D-004, D-017, D-028, D-029 · Kod: `services/file_service.py` (`check_file_size`, `detect_file_type`, `save_file`), `api/documents.py` (`_create_document`) · Görev: T-12

## F-02 — Metin çıkarımı ve OCR

**Durum:** Uygulandı

**Amaç:** Desteklenen her belgeden sınıflandırılabilir metni çıkarmak. Güvenilir dijital metni olmayan belgeyi (taranmış PDF, fotoğraf, el yazısı) Gemini ile okumak; Gemini okuyamazsa Tesseract yedeğiyle devam edip sonucu incelemeye işaretlemek.

**Teknoloji ve gerekçe:** PyMuPDF, python-docx ve saf Python `legacy-doc` (D-002); OCR gereken belgede Gemini multimodal transkripsiyonu (D-047); acil durum yedeği olarak PyMuPDF'in yerleşik Tesseract'ı, `tur`, 400 dpi (D-042).

**Davranış**

Akıştaki yeri: `PROJECT_BRAIN.md` §2, 4. ve 5. adım.

**Metin çıkarımı ve yeterlilik:**

- PDF'te bir sayfanın gömülü metni yetersizse ya da sayfa yapısal olarak taranmışken (alanının en az %50'si görüntü) gömülü metni 200 karakterin altında kalıyorsa PDF güvenilir dijital metin taşımıyor sayılır. Bu durumda PDF'in tamamı Gemini transkripsiyonuna gider; 4+ sayfalık PDF en fazla 3 sayfalık gruplar hâlinde okunur (D-003, D-047). Böylece taranmış PDF'ler, hybrid PDF'ler ve bozuk metin katmanı taşıyan taramalar da okunabilir. Tamamen metin tabanlı PDF'lerde transkripsiyon veya OCR yapılmaz. DOCX'te OCR yapılmaz.
- Transkripsiyon başarısız ya da yetersizse Tesseract yedeği yalnız koşulu sağlayan sayfaları OCR'lar (D-042). Aynı sayfada hem gömülü metin hem OCR metni varsa ikisi deterministik olarak karşılaştırılır (D-003): OCR metni gömülü metnin kelime benzeri parçalarının tamamını içeriyorsa aynı içerik tekrar yazılmaz, içermiyorsa iki metin de korunur. Karşılaştırma için ek LLM çağrısı yapılmaz.
- DOC (Word 97–2003) belgelerde gövde paragrafları ve tablo hücreleri saf Python `legacy-doc` parser'ıyla okunur; OCR yapılmaz ve harici program çalıştırılmaz. Gömülü görüntü, makro ve biçimlendirme kapsam dışıdır.
- JPG/JPEG/PNG belgelerde gömülü metin aranmaz; dosya Gemini transkripsiyonuna gönderilir, yedekte tek sayfalık görüntü olarak Tesseract ile OCR'lanır (D-001, D-042, D-047). PDF'e özgü sayfa/yapı kararları uygulanmaz.
- Gemini transkripsiyonu 3 denemede tamamlanamazsa ya da normalize metni 10 karakterden kısa kalırsa Tesseract yedeği çalışır. Yedeğin metni yeterliyse belge `needs_review` olarak işaretlenir.
- Tesseract, `TESSDATA_PREFIX` tanımlı değilse veya hata verirse atlanır; o durumda yeterli metin yoksa belge `failed` + `422` olur.
- DOCX'te paragrafların yanında tablo hücrelerindeki metin de alınır (python-docx `paragraphs` tabloları kapsamaz).
- Normalizasyon: ardışık boşluk karakterleri (boşluk, sekme, satır sonu) tek boşluğa indirilir, baştaki ve sondaki boşluklar kırpılır.
- Normalize edilmiş metin **en az 10 karakter** olmalıdır; aynı sınır transkripsiyonun başarılı sayılması için de kullanılır. Nihai metin daha kısaysa veya çıkarım hata verirse (bozuk, şifreli dosya vb.) belge Gemini sınıflandırmasına gönderilmez ve `failed` kaydedilir.

**Transkripsiyon sözleşmesi (D-047):**

- **Ne zaman:** Yalnız güvenilir dijital metni olmayan belgelerde (JPG/JPEG/PNG ve D-003 koşulunu sağlayan PDF'ler).
- **Girdi:** Dosyanın baytları ve MIME türü ile sabit transkripsiyon prompt'u. Prompt metni olduğu gibi aktarmayı ister; düzeltme, özetleme, tahmin ve yorum yasaktır. Prompt benchmarkta ölçüldüğü haliyle kullanılır.
- **Çıktı:** Yanıt şeması yoktur; düz metin döner, normalize edilir.
- **Çağrı ayarları:** temperature 0, 30 sn timeout, SDK retry kapalı.
- **Retry:** Sınıflandırmayla aynı politika, en fazla 3 gerçek deneme. Boş yanıt geçersiz çıktı sayılır ve yeniden denenir. `400`/`401`/`403` yeniden denenmez.
- **Gruplar** (yalnız OCR gereken belgelerde; güvenilir dijital metni olan PDF transkripsiyona gitmez): Görüntü ve 1–3 sayfalık PDF dosya olduğu gibi tek çağrıyla okunur. 4+ sayfalık PDF sayfa sırası korunarak en fazla 3 sayfalık gruplara bölünür; her grup aynı prompt ve ayarlarla ayrı bir çağrıda, sırayla okunur. Grup metinleri sayfa sırasıyla birleştirilir ve sınıflandırma birleşik metinle bir kez çalışır.
- **Başarısızlık:** Bir grup bile tamamlanamaz ya da normalize metni 10 karakterden kısa kalırsa kısmi sonuç kullanılmaz, kalan gruplar gönderilmez. Hata yükseltilmez ve `502` üretilmez. Belgenin tamamı yerel çıkarım + Tesseract yedek yolundan yeniden çıkarılır; PDF'te Tesseract yalnız D-003 koşulunu sağlayan sayfalarda çalışır, diğer sayfaların güvenilir gömülü metni korunur. Kısa ama boş olmayan yanıt yeniden denenmez.
- **Yasak girdiler:** Modele Tesseract çıktısı, ground truth veya başka bir metin verilmez.

**Kabul ölçütleri**

- Güvenilir dijital metni olan PDF, DOC ve DOCX Gemini transkripsiyonuna gitmez — `api::test_documents_with_reliable_digital_text_are_never_transcribed`, `file::test_pdf_with_enough_text_does_not_use_ocr`, `file::test_docx_never_uses_ocr`, `file::test_doc_never_uses_ocr`.
- OCR kararı sayfa bazlıdır: gömülü metni 10 karakterden kısa sayfa ya da alanının en az %50'si görüntü olup metni 200 karakteri geçmeyen sayfa OCR gerektirir — `file::test_needs_ocr_for_pdf_follows_page_level_conditions`, `file::test_page_level_threshold_is_min_text_length`, `file::test_image_coverage_threshold_decides_structural_ocr`, `file::test_short_text_threshold_decides_structural_ocr`.
- Görüntü ve OCR gereken PDF Gemini ile okunur: 1–3 sayfa tek çağrıda, 4+ sayfa en fazla 3 sayfalık sıralı gruplarda; sınıflandırma bir kez çalışır — `api::test_document_without_reliable_text_uses_gemini_transcription_without_tesseract`, `api::test_pdf_with_three_pages_is_sent_unchanged_in_one_call`, `api::test_long_pdf_is_transcribed_in_ordered_groups_and_classified_once`, `file::test_longer_pdf_is_split_into_ordered_groups_of_at_most_three_pages`.
- Bir grup bile tamamlanamaz ya da yetersiz kalırsa kısmi sonuç kullanılmaz; belgenin tamamı Tesseract yedeğiyle okunur ve sonuç `needs_review` olur; model gerekçesi yedek OCR gerekçesine eklenir — `api::test_failed_or_short_group_falls_back_to_tesseract_for_the_whole_document`, `api::test_failed_or_short_transcription_falls_back_to_tesseract_and_needs_review`, `api::test_fallback_reason_is_combined_with_model_review_reason`.
- Tesseract `tur` ve 400 dpi ile yalnız koşulu sağlayan sayfalarda çalışır; gömülü metin ile OCR metni tekrarsız birleşir ve benzersiz bilgi korunur — `file::test_ocr_is_called_with_turkish_and_400_dpi`, `file::test_hybrid_pdf_ocrs_only_the_image_page_and_keeps_order`, `file::test_embedded_text_already_read_by_ocr_is_not_duplicated`, `file::test_valuable_embedded_text_is_kept_when_ocr_does_not_contain_it`.
- Transkripsiyonda boş yanıt yeniden denenir; kısa ama boş olmayan yanıt ve kalıcı hata yeniden denenmez; en fazla 3 gerçek istek yapılır — `llm::test_empty_transcription_is_invalid_output_and_retried`, `llm::test_short_but_non_empty_transcription_is_returned_without_retry`, `llm::test_transcription_permanent_client_errors_are_not_retried`, `llm::test_real_sdk_transcription_sends_at_most_three_http_requests`.
- Nihai metin 10 karakterden kısaysa ya da çıkarım hata verirse belge `failed` olur ve `422` döner — `api::test_text_extraction_failure_returns_422_with_failed_record`, `api::test_short_tesseract_fallback_text_is_failed_with_422`, `file::test_text_shorter_than_10_characters_is_rejected`, `file::test_corrupt_or_encrypted_documents_raise_text_extraction_error`.
- `TESSDATA_PREFIX` tanımlı değilse yedek OCR atlanır — `file::test_ocr_is_skipped_when_tessdata_prefix_is_not_configured`.
- Çıkarılan metnin tamamı saklanır; 50.000 karakter sınırı yalnız Gemini çağrısı içindir — `file::test_full_text_is_returned_without_truncation`, `api::test_full_extracted_text_is_stored_and_passed_to_classification`.
- Transkripsiyon logları transkripti, dosya baytlarını ve ham API gövdesini içermez — `llm::test_transcription_logs_hide_transcript_file_bytes_and_raw_api_body`.

**Sınırlar**

- **OCR kalitesi (D-047):** Gemini'nin akıcı ama yanlış okumalarını yakalayan bir kalite kapısı yok; koruma önizleme ve `needs_review`'dır. Ölçüm seti küçük ve çoğunlukla temiz (9 el yazısı + 8 basılı belge). Döndürülmüş, gürültülü, tablo/form içeren taramalar ve telefon fotoğrafları ayrıca ölçülmedi; Tesseract yedeği bu belgelerde zayıf.
- **Veri akışı ve maliyet:** OCR gereken belgede dosyanın kendisi Gemini'ye gönderilir ve en az iki Gemini çağrısı yapılır. Inline istek sınırını aşan büyük dosyalar Tesseract yedeğine düşer. Kodda ayrı bir boyut kontrolü yoktur; transkripsiyon çağrısının herhangi bir hatası belgeyi yedek yola gönderir (`api/documents.py`, `_transcribe`).
- DOC ve DOCX'te OCR yapılmaz; header/footer, gömülü görüntü, makro ve biçimlendirme okunmaz (`PROJECT_BRAIN.md` §12; `services/file_service.py`).
- Görüntüler için otomatik döndürme ve ön işleme yoktur (`PROJECT_BRAIN.md` §12; aday: T-11).

**Referanslar:** D-002, D-003, D-026, D-033, D-042, D-047 · Kod: `services/file_service.py` (`needs_ocr`, `transcription_parts`, `extract_text`, `_merge_page_text`), `api/documents.py` (`_extract_into`, `_transcribe`), `services/classification_service.py` (`transcribe_document`, `TRANSCRIPTION_PROMPT`) · Görev: T-11

## F-03 — Sınıflandırma, özet ve gönderen

**Durum:** Uygulandı

**Amaç:** Çıkarılan metinden tek Gemini çağrısıyla belge türünü ve hedef birimi kapalı katalogdan seçmek; kısa bir özet ve belgede açıkça yazıyorsa gönderen bilgisini üretmek. Belirsiz belgeyi zorla bir kuruma atamak yerine `needs_review` olarak işaretlemek.

**Davranış**

Katalogların yapısı ve ID kuralları `PROJECT_BRAIN.md` §6'dadır. Tek çağrı ve kapalı katalog kuralları INV-1 ve INV-2'dir (`PROJECT_BRAIN.md` §10).

- **Model:** `GEMINI_MODEL` ortam değişkeninden okunur (`.env.example`: `gemini-3.5-flash-lite`); aynı model transkripsiyon için de kullanılır. Tanımlı değilse uygulama başlamaz. Farklı bir modele veya başka bir LLM'e fallback yoktur.
- **Girdi:** Normalize edilmiş metnin en fazla ilk 50.000 karakteri + her iki katalog (id, name, description). Sınırı aşan kısım gönderilmez; sınıflandırma girdisi için chunking, RAG veya çok parçalı işleme yoktur.
- **Tek sınıflandırma çağrısı:** Belge türü, kurum, özet ve gönderen aynı çağrıda belirlenir. Şemadaki enum değerleri kataloglardan üretilir. OCR gereken belgede bundan önce ayrı bir transkripsiyon çağrısı yapılır; iki çağrı birleştirilmez (D-008).
- **Timeout ve retry:** Retry aynı çağrının tekrarıdır, ek bir sınıflandırma adımı değildir.
  - Retry politikası yalnızca `classification_service`'te uygulanır; SDK'nın kendi retry'ı kapalıdır. Toplam gerçek API isteği 3'ü aşmaz.
  - Her Gemini çağrısı için 30 sn timeout; toplam en fazla 3 deneme.
  - Retry edilir: network hataları, timeout, `429`, `5xx` ve geçersiz model çıktısı (structured output şemasına uymayan veya katalog dışı değer içeren yanıt — geçici model hatası sayılır). İstisna: `routing_evidence` hataları geçersiz çıktı sayılmaz (D-050).
  - Retry edilmez: `400`, `401`, `403` gibi kalıcı istemci/yapılandırma hataları. Belge hemen `failed` kaydedilir, `502` döner.
  - Bekleme: 1. başarısız denemeden sonra 1 sn, 2. başarısız denemeden sonra 2 sn. En kötü durumda her Gemini çağrısı (her transkripsiyon grubu ve sınıflandırma) yaklaşık 93 sn sürer.
  - Tüm denemeler başarısızsa (3. denemede de hata veya geçersiz çıktı) belge `failed` kaydedilir, `502` ile genel bir mesaj döner, teknik detaylar loglanır; ham Gemini/API hataları gösterilmez.

Structured output alanları:

| Alan | Tip | Kural |
|---|---|---|
| `document_type` | katalogdaki bir `id` | Her zaman dolu; hiçbiri uymuyorsa `other` |
| `institution_id` | katalogdaki bir `id` \| `null` | Makul eşleşme yoksa veya belirsizse `null` — zorla atama yapılmaz |
| `needs_review` | boolean | Aşağıdaki durumlarda `true` |
| `review_reason` | string \| `null` | `needs_review = true` ise dolu, `false` ise `null` |
| `summary` | string | Her zaman dolu: belgenin amacını ve konusunu anlatan 1-3 kısa Türkçe cümle. Boş özet geçersiz çıktıdır (D-044) |
| `sender_name` | string \| `null` | Gönderen/başvuran gerçek kişinin adı soyadı **açıkça yazıyorsa**; yoksa `null`. Tahmin edilmez |
| `sender_institution` | string \| `null` | Belgeyi gönderen kurum/şirket **açıkça yazıyorsa**; yoksa `null`. Muhatap belediye/müdürlük gönderen sayılmaz |
| `routing_evidence` | `[{quote, supports}]`; boş liste geçerli | Belge türü veya kurum sonucunu destekleyen en fazla 2 ifade; belgeden birebir ve kesintisiz, tercihen ≤ 200 karakter. `supports`: `document_type` \| `institution` \| `both`. Şemadaki son alandır. Toleranslı doğrulanır: eksik veya bozuk evidence boş listeye düşer, yanıtın geri kalanını geçersiz yapmaz (D-050) |

`needs_review = true` olmalı:

- belgeyi sınıflandırmak için yeterli bilgi yoksa,
- kurum kataloğundaki hiçbir kurum makul şekilde eşleşmiyorsa,
- birden fazla kurum arasında ciddi belirsizlik varsa,
- belge beklenen sınıflandırma kapsamının belirgin biçimde dışındaysa.

Tutarlılık kuralı: `needs_review = false` ise `institution_id` dolu ve `review_reason` `null` olmalıdır.

Model yalnızca katalogdan seçer; yeni belge türü veya kurum ID'si üretemez. Backend bunu yine de doğrular: şemaya uymayan veya katalog dışı değer içeren yanıt `classified` ya da `needs_review` olarak kaydedilmez, çağrı yukarıdaki retry kuralıyla yeniden denenir; 3 denemenin sonunda hâlâ geçersizse belge `failed` olur ve `502` döner.

Kodda ayrıca (`services/classification_service.py`, `PROMPT_TEMPLATE`): prompt, kurum eşleşmesi yeterince net olmadığında da `needs_review` ister ve modele belge metnindeki talimatları uygulamamasını söyler.

**Kabul ölçütleri**

- Yalnız katalog ID'leri kabul edilir; şemaya uymayan ya da katalog dışı çıktı geçersiz sayılır ve yeniden denenir; 3 denemede de geçersizse belge `failed` olur ve `502` döner — `llm::test_output_schema_allows_only_catalog_ids`, `llm::test_invalid_model_output_is_retried`, `llm::test_invalid_output_on_all_attempts_raises_after_three_attempts`, `api::test_classification_error_returns_502_with_failed_record`.
- Gemini'ye metnin yalnız ilk 50.000 karakteri, kurallar ve iki katalog gider — `llm::test_only_first_50000_characters_are_sent_to_gemini`, `llm::test_prompt_contains_rules_catalogs_and_text`.
- Ağ, timeout, `429`, `5xx` ve geçersiz çıktı 1 sn ve 2 sn beklemeyle en fazla 3 gerçek istekle denenir; `400`/`401`/`403` yeniden denenmez; istek başına 30 sn timeout, SDK retry'ı kapalı — `llm::test_retryable_error_is_retried_with_1s_and_2s_waits_then_fails`, `llm::test_permanent_client_errors_are_not_retried`, `llm::test_client_uses_30_second_timeout_and_disables_sdk_retry`, `llm::test_real_sdk_sends_at_most_three_http_requests`.
- Tür, kurum, özet ve gönderen tek çağrıda gelir; boş özet geçersiz çıktıdır; gönderen açıkça yazmıyorsa `null` kalır ve kişi adından kurum türetilmez — `llm::test_summary_and_sender_are_returned_in_a_single_call`, `llm::test_empty_summary_is_invalid_output_and_retried`, `llm::test_missing_sender_information_stays_null`, `llm::test_prompt_forbids_deriving_sender_institution_from_a_person`.
- `needs_review` sonucu `200` ile döner; inceleme nedeni korunur, kurum `null` olabilir — `api::test_needs_review_result_returns_200_with_needs_review_status`, `api::test_needs_review_item_keeps_review_reason_and_null_institution`.
- Hata logları model çıktısını, ham API gövdesini ve belge metnini içermez; kullanıcı mesajı geneldir — `llm::test_failed_attempt_logs_hide_model_output_raw_api_body_and_document_text`, `llm::test_error_message_is_generic_and_hides_raw_api_details`.
- `other` türü katalogda yoksa servis yüklenmez ve Gemini çağrılmaz — `llm::test_catalog_without_other_raises_configuration_error`, `llm::test_service_does_not_load_without_other_so_gemini_is_never_called`.

**Sınırlar**

- **Sınıflandırma (D-010, D-027):** `temperature=0`'da bile tam deterministik değildir. Yalnız ilk 50.000 karakter değerlendirilir. Katalog dışı birimlere ait belgeler `needs_review` olur; kurum açıklamaları ilk taslaktır.

**Referanslar:** D-007, D-008, D-009, D-010, D-011, D-012, D-027, D-031, D-033, D-044 · Kod: `services/classification_service.py` (`classify_text`, `build_prompt`, `_is_retryable`, `load_catalogs`), `llm/gemini_client.py`, `schemas/classification.py` (`ClassificationResult`) · Görev: T-10

## F-04 — Belgedeki ilgili ifade

**Durum:** Uygulandı (2026-10-07)

**Amaç:** Kullanıcının yönlendirme sonucunu belgenin kendi ifadesiyle hızlıca kontrol etmesi. İfade açıklama veya gerekçe değildir; kaynaktan birebir alıntıdır.

**Davranış**

İfadeler sınıflandırma çağrısının `routing_evidence` alanından gelir (F-03 alan tablosu).

**Routing evidence doğrulaması (D-050):** Modelin önerdiği ifade güvenilir kabul edilmez; yalnız backend doğrulamasından geçenler saklanır.

- Kaynak, modelin gördüğü metindir: `extracted_text[:50_000]`. Kaynağa ve ifadeye Unicode NFC ve mevcut whitespace normalizasyonu uygulanır; ifadeden yalnız tek bir eşleşen dış tırnak çifti silinir.
- Boş ve 300 karakteri aşan ifade atılır. Eşleşme büyük/küçük harfe duyarlı, birebir substring'dir; Türkçe karakter veya ASCII katlama, fuzzy eşleşme, embedding ya da yeni LLM çağrısı yoktur.
- Adaylar sırayla denenir ve ilk 2 geçerli ifadede durulur. Daha önce doğrulanmış ifadenin tekrarı atılır; `institution_id` `null` iken kurumu destekleyen (`institution` / `both`) ifade atılır.
- Evidence `needs_review`, `review_reason` ve `status`'u değiştirmez ve güven skoru değildir. İfade metni loglanmaz.

**Belgedeki ilgili ifade (D-050):**

- Doğrulanmış ifadeler sonuç kartında (onay kontrollerinin altında, AI özetinin üstünde) ve Kayıtlar detayında "Belgedeki ilgili ifade" başlığıyla, birebir gösterilir. Kayıtlar listesinde gösterilmez. Evidence `null` veya `[]` ise bölüm render edilmez.
- Her ifadenin üstünde `supports`'tan çevrilen küçük bir başlık görünür (D-052): `document_type` → "Belge türüne dayanak", `institution` → "Hedef kuruma dayanak", `both` → "Belge türü ve hedef kuruma dayanak", tanımsız değer → "İlgili ifade". Ham `supports` değeri gösterilmez; başlık ifade sırasından veya metninden tahmin edilmez.
- Evidence AI önerisine aittir: onay ve düzeltme onu değiştirmez, onaylanan yönlendirme için yeni ifade üretilmez. Kullanıcı AI belge türünü veya kurumunu değiştirdiyse bölümde küçük "AI önerisinin dayanağı" notu görünür; ifade başlıkları değişmez.

**Metinde göster:**

- Çıkarılan metinde birebir bulunan her ifadenin altında "Metinde göster" düğmesi görünür; sonuç kartında ve Kayıtlar detayında aynı davranış. İfade bulunamazsa veya metin henüz yüklenmediyse düğme görünmez; ifade yine gösterilir, hata mesajı yoktur.
- Eşleşme backend doğrulamasıyla aynı kuraldır: metne ve ifadeye yalnız Unicode NFC uygulanır, büyük/küçük harfe duyarlı birebir substring aranır. Türkçe veya ASCII katlama, whitespace katlaması ve bulanık eşleşme yoktur.
- Tıklanınca sonuç kartında kapalı "Belge önizlemesi ve çıkarılan metin" bölümü ve çıkarılan metin açılır. Seçilen ifadenin yalnız ilk geçişi vurgulanır, görünür alana kaydırılır ve odak oraya taşınır. Başka ifadeye tıklamak vurguyu oraya taşır; aynı ifadeye tekrar tıklamak yeniden kaydırır.
- Seçim yokken metin değiştirilmeden gösterilir. Kayıt detayı veya önizleme paneli kapanınca ve sonuç kartında metin gizlenince seçim sıfırlanır.
- Yeni API, DB alanı veya LLM çağrısı yoktur; ifade metni değişmez ve ham `supports` değeri gösterilmez.

**Kabul ölçütleri**

- Yalnız kaynakta (ilk 50.000 karakter, NFC ve whitespace normalizasyonu sonrası) birebir geçen ifadeler, modelin sırasıyla ve en fazla 2 tane tutulur. Boş, 300 karakteri aşan, daha önce doğrulanmış olanla aynı ve büyük/küçük harf ya da Türkçe karakter farkı taşıyan ifade atılır — `llm::test_valid_exact_quote_is_returned`, `llm::test_only_first_two_valid_evidence_are_kept`, `llm::test_quote_over_300_characters_is_discarded_and_300_is_kept`, `llm::test_empty_quote_is_discarded`, `llm::test_duplicate_normalized_quote_is_discarded`, `llm::test_case_and_turkish_character_differences_are_discarded`, `llm::test_nfc_canonical_equivalence_matches`, `llm::test_quote_after_first_50000_characters_is_discarded`.
- Kurum `null` iken kurumu destekleyen ifade atılır — `llm::test_institution_evidence_is_discarded_when_institution_is_null`.
- Bozuk ya da eksik evidence boş listeye düşer; retry, `failed` veya `502` üretmez; sınıflandırma alanları ve `needs_review` değişmez — `llm::test_malformed_evidence_becomes_empty_list_without_retry`, `llm::test_missing_evidence_field_becomes_empty_list_without_retry`, `llm::test_evidence_does_not_change_classification_fields`, `llm::test_missing_verified_evidence_does_not_set_needs_review`, `api::test_evidence_does_not_change_status_needs_review_or_reason`.
- Başarılı sınıflandırma ifadeleri ya da `[]` yazar; `prepared`, `failed` ve eski kayıtta değer `NULL` kalır; onay evidence'ı değiştirmez — `api::test_empty_evidence_is_persisted_as_empty_list_not_null`, `api::test_prepared_record_has_null_evidence_until_classified`, `api::test_failed_classification_leaves_evidence_null`, `api::test_old_record_without_evidence_returns_null_in_list_and_detail`, `api::test_validation_never_changes_routing_evidence`.
- İfade metni loglanmaz — `llm::test_evidence_quotes_are_not_logged`.
- Arayüz: evidence `null` veya `[]` ise bölüm görünmez; ifadeler backend sırasıyla ve değiştirilmeden gösterilir; ham `supports` gösterilmez; AI türü veya kurumu değiştirilerek onaylandıysa "AI önerisinin dayanağı" notu görünür — `records:` "evidence null ise bölüm yoktur", "iki ifade backend sırasıyla döner", "ham supports değeri kullanıcıya sızmaz: yalnız ifade metni ve Türkçe başlık döner", "kurum düzeltildiyse not gerekir".
- İfade başlıkları (D-052): her `supports` değeri kendi başlığına çevrilir; başlık sıradan veya ifade metninden tahmin edilmez; tanımsız değer nötr "İlgili ifade" olur; düzeltilmiş onayda başlıklar değişmez — `records:` "her supports değeri kendi başlığına çevrilir", "başlık sıradan tahmin edilmez: sıra değişince başlık ifadesiyle birlikte gider", "başlık ifade metninden tahmin edilmez", "tanımsız supports değeri nötr başlığa düşer ve ham değer görünmez", "not ifadelerin metnini ve başlıklarını değiştirmez".
- Metinde göster: yalnız ilk birebir geçiş bulunur; büyük/küçük harf, Türkçe karakter ve whitespace farkı eşleşmez; NFC kanonik eşdeğerlik eşleşir; metin yoksa veya ifade bulunamazsa sonuç yoktur (düğme görünmez) — `records:` "ilk birebir geçişi bulur; parçalar birleşince metnin kendisi olur", "ifade birden fazla geçiyorsa yalnız ilk geçiş döner", "büyük/küçük harf farkı eşleşmez", "Türkçe karakter farkı eşleşmez (katlama yok)", "whitespace farkı katlanmaz", "NFC kanonik eşdeğerlik eşleşir: NFD metin ve NFC ifade", "metinde geçmeyen ifade null döner". Açma, kaydırma, odak ve seçimin sıfırlanması otomatik testte değil, tarayıcıda doğrulanır (bileşen testi yok).

**Sınırlar**

- Kabul edilmiş sınırlar: anlamsal filtre ve tekilleştirme yoktur; zaman zaman genel bir kapanış ifadesi ya da kısmen örtüşen iki ifade görülebilir. Doğrulama çıkarılan metne göredir; OCR/transkripsiyonla okunan belgede görüntünün doğru okunduğunu kanıtlamaz ve metin kaynağı arayüzde gösterilmez.
- "Metinde göster" çıkarılan metin üzerinde çalışır; orijinal belge görünümünde (PDF, görüntü) konum gösterilmez. Yalnız seçilen ifadenin ilk geçişi vurgulanır; sonraki geçişler vurgulanmaz.
- Kapsam dışı öğeler (ayrı çıkarım çağrısı, güven skoru, evidence düzenleme, anlamsal filtre, OCR kaynağı etiketi): D-050 ve `PROJECT_BRAIN.md` §12.

**Referanslar:** D-050, D-052, D-049 · Kod: `services/classification_service.py` (`verify_routing_evidence`), `schemas/classification.py` (`drop_invalid_routing_evidence`), `frontend/src/records.ts` (`routingEvidenceSection`, `findEvidenceInText`), `frontend/src/App.tsx` (`RoutingEvidenceSection`, `ExtractedText`)

## F-05 — Hazırla → önizle → sınıflandır

**Durum:** Uygulandı

**Amaç:** Kullanıcının analize gönderdiği belgenin doğru belge olduğunu Gemini sınıflandırması çalışmadan önce görmesi; metin çıkarımı ve OCR'ın dosya başına bir kez yapılması.

**Davranış**

Sunucu tarafındaki akış `PROJECT_BRAIN.md` §2 "İki adımlı akış"ta, ayrıntılı kurallar D-045 ve D-046'dadır. Arayüz davranışı:

- En fazla 5 dosya çoklu seçim veya sürükle-bırakla eklenir. Uzantı ve 50 MB ön kontrolü yalnız kullanıcı deneyimi içindir; kabul kararı backend'indir (D-040).
- İstemci aynı anda tek bir prepare veya classify isteği gönderir; bir dosyanın hatası diğerlerinin işlenmesini durdurmaz (D-045, D-020).
- Önizlemenin varsayılanı, çıkarılan metinden tarayıcıda deterministik olarak oluşturulan "Belge Önizlemesi" formudur: dosya adı, hitap/başlık, konu, tarih, evrak no, gönderen, gönderen kurum ve belge içeriği. Açıkça bulunamayan alan `—` kalır; form saklanmaz ve Gemini kullanmaz.
- Metin çıkarımı başarısız (`422`) satırın önizlemesi kayıttaki metni detay endpoint'inden okur: metin varsa gösterilir ve "Sınıflandırma için yeterli metin çıkarılamadı." notu eklenir (D-026); metin yoksa "Bu belgeden metin çıkarılamadı." yazar.
- Orijinal belge (PDF, JPG/JPEG/PNG) tarayıcıdaki dosyadan, ayrı bir görüntüleme penceresinde (modal `<dialog>`) açılır; sunucuda önizleme endpoint'i yoktur. DOC/DOCX'te önizleme formu ve çıkarılan metin gösterilir.
- Sınıflandırma, kullanıcı analizi başlattıktan sonra çalışır. Sonuç kartında sırasıyla belge türü ve hedef kurum (effective değer, F-06), inceleme nedeni, onay kontrolleri (F-06), belgedeki ilgili ifade (F-04), AI özeti, gönderen ve orijinal belgeyi görme/indirme bulunur. Analizden sonra önizleme ve çıkarılan metin kapalı bir bölüme iner.
- Her istek için ayrı 120 sn zaman aşımı uygulanır (D-039). Sınıflandırmada `409` alınırsa kaydın gerçek durumu detay endpoint'inden okunur; Gemini tekrar çağrılmaz.
- "Kaldır", `prepared` kaydı ve dosyasını siler; sahipsiz `prepared` kayıtlar 24 saatten eskiyse sonraki prepare çağrısında temizlenir (D-046).
- Sınıflandırması Gemini hatasıyla başarısız olan satırda "Tekrar Dene" görünür; belge yeniden yüklenmez (F-09, D-053).

**Kabul ölçütleri**

- Prepare dosyayı ve metni saklar, Gemini sınıflandırmasını çağırmaz — `api::test_prepare_stores_file_and_text_without_calling_gemini`.
- Classify kayıttaki metni kullanır, dosyayı yeniden okumaz — `api::test_classify_prepared_document_uses_stored_text_without_reextracting`.
- `prepared` olmayan kayıt ya da storage'da olmayan orijinal dosya `409` alır; kayıt değişmez — `api::test_classify_rejects_non_prepared_document_with_409`, `api::test_classify_without_source_file_returns_409_and_keeps_prepared_record`.
- "Kaldır" yalnız `prepared` kaydı ve dosyasını siler; kalıcı kayıtlar `409` alır — `api::test_discard_prepared_document_deletes_record_and_file`, `api::test_discard_rejects_permanent_records_with_409`.
- 24 saatten eski sahipsiz `prepared` kayıtlar sonraki prepare'de temizlenir; taze `prepared` ve kalıcı kayıtlar korunur; temizlik hatası prepare'i düşürmez — `api::test_prepare_cleans_up_expired_orphan_prepared_documents`, `api::test_cleanup_keeps_fresh_prepared_and_all_permanent_records`, `api::test_cleanup_failure_does_not_break_prepare`.
- Yedek OCR işareti `prepared` kayıtta tutulur, sınıflandırmada korunur, sınıflandırma başarısızsa temizlenir — `api::test_prepare_with_fallback_marks_prepared_record_and_classify_keeps_it`, `api::test_classify_prepared_fallback_document_error_clears_review_flag`.
- Önizleme formu yalnız açıkça yazan alanları okur, tahmin etmez — `preview:` "birden fazla farklı etiketsiz tarih varsa tahmin etmez", "muhatap belediye gönderen kurum sayılmaz", "düzyazıdaki etiket benzeri kelimelerden hiçbir alan uydurulmaz".
- `422` önizlemesinde kayıttaki metin yetersiz metin sayılır, "metin çıkarılamadı" sayılmaz — `preview:` "kayıtta metin varsa sınıflandırma için yetersizdir; "metin çıkarılamadı" sayılmaz", "kayıtta metin yoksa hiç çıkarılamamıştır".
- Arayüz kuralları (5 dosya sınırı, ön kontrol, sıralı işleme, 120 sn zaman aşımı, sonuç kartı düzeni) için otomatik test yoktur; gerçek tarayıcıda elle doğrulanır (`CURRENT_STATE.md` → "Teknik baseline", test kapsamı). Kod: `frontend/src/App.tsx` (`MAX_BATCH_FILES`, `MAX_FILE_SIZE`, `REQUEST_TIMEOUT_MS`, `runQueue`, `recoverAfterConflict`).

**Sınırlar**

- **Süre ve kapasite (D-020, D-039):** İşleme senkrondur ve eşzamanlı kapasite thread pool ile sınırlıdır. Her Gemini çağrısı en kötü ~93 sn sürebilir; uzun taranmış PDF'te süre sayfa sayısıyla artar (21 sayfa ~36 sn). Yavaş API'de uzun belgede prepare, frontend'in 120 sn sınırını aşabilir.
- **`prepared` akışı (D-040, D-046):** 5 dosya sınırı yalnız arayüzdedir. Sahipsiz `prepared` kayıt yalnız sonraki prepare çağrısında temizlenir. Aynı kayıt için eşzamanlı classify ve classify sırasında silme nadir kenar durumlarıdır.
- PDF orijinal görünümü tarayıcının yerleşik PDF görüntüleyicisine bağlıdır (çoğu mobil tarayıcıda yoktur); DOC/DOCX için orijinal görünüm yoktur.

**Referanslar:** D-020, D-039, D-040, D-045, D-046 · Kod: `api/documents.py` (`prepare_document`, `classify_prepared_document`, `discard_prepared_document`, `_delete_expired_prepared`), `frontend/src/App.tsx`, `frontend/src/documentPreview.ts` (`buildDocumentPreview`, `extractionFailure`) · Görev: T-07

## F-06 — Kullanıcı onayı ve yönlendirme düzeltmesi

**Durum:** Uygulandı (2026-10-06)

**Amaç:** Kullanıcının AI'ın belge türü ve kurum sonucunu olduğu gibi onaylaması ya da katalog içinden düzeltmesi. AI sonucu korunur; böylece AI ile kullanıcı kararı karşılaştırılabilir ve AI doğruluğu ölçülebilir kalır.

**Davranış**

**Kullanıcı onayı (D-049):**

- Sınıflandırılmış (`classified` / `needs_review`) belgenin belge türü ve kurum sonucu, sonuç kartında veya Kayıtlar detayında olduğu gibi onaylanabilir ya da katalog içinden düzeltilebilir (`PUT /api/documents/{document_id}/validation`). Kurum "Belirlenemedi" (`null`) olarak onaylanabilir; tekrar onay serbesttir, son onay geçerlidir.
- AI sonucu (`document_type`, `institution_id`), `needs_review`, `review_reason` ve `status` değişmez; onaylanan değerler ayrı `validated_*` alanlarında tutulur. Gemini çağrılmaz.
- Arayüz onaylı kayıtta onaylanan değerleri gösterir (effective yönlendirme); AI önerisi yalnız farklıysa ikincil satırda görünür.

Endpoint sözleşmesi F-08'dedir (`PUT /api/documents/{document_id}/validation`, `GET /api/catalogs`). Arayüz ayrıntıları (düğmeler, katalog isteği, hata mesajları, "İnceleme Gereken" sayımı) D-049'dadır.

**Kabul ölçütleri**

- Değiştirmeden onay AI değerlerini kopyalar ve `validated_at` yazar; düzeltme AI sonucunu korur; kurum "Belirlenemedi" (`null`) olarak onaylanabilir; tekrar onayda son değerler geçerlidir — `api::test_unchanged_approval_copies_ai_result_and_sets_validated_at`, `api::test_corrected_approval_keeps_ai_result`, `api::test_approval_with_null_institution`, `api::test_repeated_validation_keeps_last_values`.
- `validated_at` ile `validated_document_type` birlikte yazılır — `api::test_validated_at_and_validated_document_type_are_written_together`.
- AI sonucu, `needs_review`, `review_reason` ve `status` değişmez; Gemini çağrılmaz — `api::test_validation_keeps_ai_result_review_flag_and_status`, `api::test_validation_does_not_call_gemini`.
- `prepared` ve `failed` kayıt `409`, bilinmeyen kayıt `404`, katalog dışı, eksik ya da fazla alan `422` alır ve kayıt değişmez — `api::test_prepared_and_failed_documents_cannot_be_validated`, `api::test_validation_returns_404_for_unknown_document`, `api::test_invalid_validation_body_returns_422_without_change`.
- Effective yönlendirme ve gösterim durumu tek kuraldan türetilir; onaylı `needs_review` kaydı "İnceleme Gereken" sayısına girmez — `records:` "onaysız kayıtta AI değerleri kullanılır", "düzeltilen kurum onaylanan kurumu ve kurum değişikliğini döndürür", "onaylanan needs_review kaydı İnceleme Gereken sayısına girmez".

**Sınırlar**

- **Kullanıcı onayı (D-049, D-025):** Yetki ve onay geçmişi yoktur; eşzamanlı onaylarda son yazan kazanır. Dış entegrasyonda `document_type` ve `institution_id` her zaman AI sonucudur; kullanıcı düzeltmesi `validated_*` alanlarındadır.
- Kapsam dışı öğeler (authentication/RBAC, onaylayan kişi, onay geçmişi, workflow, SLA, toplu onay, onayı geri alma): D-049.

**Referanslar:** D-049, D-025 · Kod: `api/documents.py` (`validate_document`), `api/catalogs.py`, `frontend/src/records.ts` (`effectiveRouting`, `recordDisplayState`), `frontend/src/App.tsx` (`ValidationControls`)

## F-07 — Kayıtlar

**Durum:** Uygulandı

**Amaç:** Sınıflandırma sonuçlarını ve orijinal belgeyi görmek; kayıtları belge türü, hedef kurum ve duruma göre bulmak.

**Davranış**

- Liste kalıcı kayıtları en yeni önce gösterir; `prepared` kayıtlar listede yoktur. Satırda dosya adı, effective belge türü ve hedef kurum (F-06), durum, tarih ve indirme bağlantısı bulunur.
- Detayda özet, effective tür ve kurum (onaylanan değer AI önerisinden farklıysa AI önerisi ikincil satırda), gönderen, inceleme nedeni, onay kontrolleri (F-06), belgedeki ilgili ifade (F-04) ve çıkarılan metin bulunur. Kalıcı silme detaydan yapılır (F-10).
- Arama ve filtre yalnız istemci tarafındadır ve `GET /api/documents` yanıtı üzerinde çalışır. Arama dosya adındadır; büyük/küçük harf ve Türkçe karakter farkını gözetmez, bulanık değildir. Belge türü, hedef kurum ve durum filtreleri birlikte uygulanır: tür ve kurum effective değerle, durum gösterim durumuyla (Sınıflandırıldı / İnceleme gerekli / Onaylandı / Başarısız) filtrelenir. Türü ya da kurumu olmayan kayıtlar "Belirlenemedi" seçeneğindedir.
- Üç özet sayısı tüm yüklü kayıtlardan hesaplanır ve filtreden etkilenmez: Toplam Kayıt, İnceleme Gereken (onaylanmamış `needs_review`), Başarısız.
- Endpoint'ler F-08'dedir (liste, detay, indirme); ayrıntılı kurallar D-043 ve D-048'dedir.

**Kabul ölçütleri**

- Liste en yeni önce gelir; `extracted_text` ve `file_reference` dönmez; `prepared` kayıt listelenmez ama detay ve indirme çalışır — `api::test_list_returns_documents_newest_first`, `api::test_list_hides_extracted_text_and_file_reference`, `api::test_list_hides_prepared_documents_but_detail_and_download_work`.
- Detay çıkarılan metni döndürür, `file_reference` döndürmez; bilinmeyen kayıt `404` alır — `api::test_detail_returns_extracted_text_but_not_file_reference`, `api::test_detail_returns_404_for_unknown_document`.
- İndirme orijinal baytları özgün dosya adı ve doğru media type ile döndürür; dosya yoksa ayrıntısız `404` döner — `api::test_download_returns_original_pdf_bytes_with_original_file_name`, `api::test_download_returns_docx_with_correct_media_type`, `api::test_download_returns_404_without_details_when_stored_file_is_missing`.
- Arama, filtre ve sayılar — `records:` "dosya adı araması büyük/küçük harfe duyarsızdır", "Türkçe karakterler sade eşleriyle iki yönde eşleşir", "bulanık arama yapılmaz: harf eksik ya da yanlışsa eşleşmez", "tür, kurum ve durum filtreleri birlikte uygulanır", "toplam, inceleme gereken ve başarısız sayıları çakışmaz".

**Sınırlar**

- **Kayıtlar (D-048):** Liste sayfalamasız tek istekte gelir; arama ve filtre istemci tarafındadır. Kayıt sayısı çok artarsa sunucu tarafı sayfalama/filtre ayrı karar gerektirir.

**Referanslar:** D-043, D-048, D-049, D-054 · Kod: `api/documents.py` (`list_documents`, `get_document`, `download_document`), `frontend/src/records.ts` (`filterRecords`, `filterOptions`, `countRecords`), `frontend/src/App.tsx` · Görev: T-06

## F-08 — API ve hata sözleşmesi

**Durum:** Uygulandı

**Amaç:** Backend'in frontend'den bağımsız, net bir sözleşmeyle entegrasyona hazır olması; teknik hata ayrıntısının dışarı sızmaması (`PROJECT_BRAIN.md` §10, 6. ilke; INV-6).

**Davranış**

**`POST /api/documents/classify`** — legacy / tek-adımlı sınıflandırma. Girdi: `multipart/form-data` içinde en fazla 50 MB boyutunda tek bir PDF, DOC, DOCX, JPG/JPEG veya PNG dosyası. Geriye dönük uyumluluk için korunur; V1.4 arayüzü bu endpoint'i kullanmaz. Aşağıdaki yanıt ve hata sözleşmesi bu endpoint içindir.

V1.4 iki adımlı akış (D-045, D-046):

| Endpoint | Yanıt |
|---|---|
| **`POST /api/documents/prepare`** | Girdi legacy endpoint'le aynı. Başarıda `200` ve detay yanıtıyla aynı şekil (`status = "prepared"`, `extracted_text` dahil). `413` / `415` / doğrulama `422` / `failed` + `422` / `500` legacy endpoint'le aynıdır. Gemini sınıflandırması çağrılmaz, `502` yoktur (OCR gereken belgede transkripsiyon çağrısı yapılır; hatası Tesseract yedeğine gider) |
| **`POST /api/documents/{document_id}/classify`** | Kayıttaki metinle sınıflandırır. `200` (`classified` / `needs_review`) · `502` (`failed`) · `404` (kayıt yok) · `409` (kayıt `prepared` değil ya da orijinal dosya storage'da yok; Gemini çağrılmaz, kayıt değişmez) · `500` (kayıt `prepared` kalır) |
| **`DELETE /api/documents/{document_id}/prepared`** | Yalnızca `prepared` kaydı ve dosyasını siler. `204` · `404` · `409` (kalıcı kayıt; dokunulmaz) · `500` (kayıt `prepared` kalır) |
| **`POST /api/documents/{document_id}/retry-classification`** | Sınıflandırması başarısız kaydı kayıttaki metinle yeniden sınıflandırır (F-09, D-053). `200` (`classified` / `needs_review`) · `502` (yine başarısız; kayıt değişmez) · `404` · `409` (başka istek işliyor, kayıt uygun değil ya da orijinal dosya yok; Gemini çağrılmaz, kayıt değişmez) · `500` (kayıt değişmez) |
| **`DELETE /api/documents/{document_id}`** | Kalıcı kaydı ve orijinal dosyasını siler (F-10, D-054). `204` · `404` · `409` (kayıt `prepared` ya da başka bir istek kaydı işliyor; hiçbir şeye dokunulmaz) · `422` (geçersiz ID) · `500` (dosya silinemedi: kayıt ve dosya yerinde; ya da commit başarısız: kayıt kalır, dosya silinmiş olabilir, aynı istek tekrarlanınca tamamlanır). Yetki yoktur; dış erişimden önce sunucu tarafında korunmalıdır (T-17) |

Kayıtları görüntülemek için salt okunur endpoint'ler (D-043):

| Endpoint | Yanıt |
|---|---|
| **`GET /api/documents`** | Kalıcı kayıtlar `created_at` azalan sırada; aşağıdaki alanlar + `created_at`. `prepared` kayıtlar listelenmez; `extracted_text` ve `file_reference` dönmez |
| **`GET /api/documents/{document_id}`** | Aynı alanlar + `extracted_text`; `prepared` dahil her durum. Kayıt yoksa `404` |
| **`GET /api/documents/{document_id}/download`** | Orijinal dosya, kullanıcının yüklediği adla ve `file_type`'a uygun media type ile; kayıt ya da dosya yoksa ayrıntısız `404` |

Kullanıcı onayı ve katalog (D-049):

| Endpoint | Yanıt |
|---|---|
| **`PUT /api/documents/{document_id}/validation`** | Gövde `{"document_type": "<katalog id>", "institution_id": "<katalog id>" \| null}`; iki alan zorunlu, ek alan kabul edilmez. Yalnız `classified` / `needs_review` kayıtta üç onay alanını yazar; AI sonucu, `needs_review`, `review_reason`, `status` ve `routing_evidence` değişmez, Gemini çağrılmaz. Tekrar onay serbest, son onay geçerli. `200` (liste öğesi biçimi) · `404` · `409` (`prepared` / `failed`; kayıt değişmez) · `422` (katalog dışı, eksik ya da fazla alan; FastAPI'nin standart gövdesi) |
| **`GET /api/catalogs`** | Salt okunur: belge türü ve kurum kataloglarının `id` ve `name` değerleri, katalog dosyasındaki sırayla; kurum açıklaması dönmez |

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
  "summary": "Mahalledeki kaldırım taşlarının yerinden çıktığı bildirilerek onarım talep edilmektedir.",
  "sender_name": "Ayşe Yılmaz",
  "sender_institution": null,
  "status": "classified"
}
```

`document_type_name` ve `institution_name`, ID'ye karşılık gelen katalog `name` değerleridir; yanıt üretilirken kataloglardan okunur, veritabanında saklanmaz. `institution_id` `null` ise `institution_name` de `null` olur. İstemci gösterim için katalogları kopyalamaz (D-032).

Yanıtlar ayrıca kullanıcı onayı alanlarını içerir: `validated_document_type`, `validated_document_type_name`, `validated_institution_id`, `validated_institution_name`, `validated_at`. Onaysız kayıtta hepsi `null`'dır; adlar aynı kuralla katalogdan çözülür (D-049). `document_type` ve `institution_id` her zaman AI sonucudur.

Yanıtlar ayrıca `routing_evidence` alanını içerir: `[{"quote": "...", "supports": "document_type" | "institution" | "both"}]`. Doğrulanan ifade yoksa `[]`; `prepared`, `failed` ve migration öncesi kayıtlarda `null` (D-050). Ayrı evidence endpoint'i yoktur.

Yanıtlar ayrıca `retryable: bool` alanını içerir: kayıt sınıflandırma aşamasında başarısız oldu ve aynı metinle tekrar denenebilir (F-09, D-053). Backend tek kuraldan hesaplar; `failed` olmayan, metin çıkarımı başarısız olan ve metin kaynağı bilinmeyen eski kayıtlarda `false`.

`file_reference` ve `extracted_text` veritabanında saklanır ama bu endpoint'in yanıtında **dönmez**.

Hata ve red davranışı:

| Durum | Veritabanı | İstemciye |
|---|---|---|
| Dosya gönderilmemiş (istek doğrulama hatası) | Kayıt yok | `422`, FastAPI'nin standart `{"detail": [...]}` gövdesi |
| Desteklenen tür değil (GIF, TIFF, BMP, WebP, HEIC vb.) veya imza uyuşmuyor | Kayıt yok, dosya saklanmaz | `415`, genel mesaj |
| 50 MB'ı aşıyor | Kayıt yok, dosya saklanmaz | `413`, genel mesaj |
| Metin çıkarımı başarısız veya normalize metin < 10 karakter | `failed` kaydı | `422`, `failed` gövdesi |
| Gemini sınıflandırma çağrısında geçici hata (network, timeout, `429`, `5xx`) veya geçersiz model çıktısı, 3 deneme de başarısız | `failed` kaydı | `502`, `failed` gövdesi |
| Gemini sınıflandırma çağrısında kalıcı hata (`400`/`401`/`403`) veya beklenmeyen hata, retry yok | `failed` kaydı | `502`, `failed` gövdesi |
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
  "summary": null,
  "sender_name": null,
  "sender_institution": null,
  "status": "failed",
  "message": "Belge şu anda sınıflandırılamadı. Lütfen daha sonra tekrar deneyin."
}
```

Teknik hata detayları (exception, stack trace, kütüphane veya Gemini hata mesajları) istemciye gönderilmez; loglanır.

Dışarıdan bakıldığında kabul sonrası hata ayrımı basit tutulur:

- **`422`** → belge içeriği işlenemedi / yeterli metin çıkarılamadı (gövdede `status = "failed"`). Gövdesinde `status` olmayan 422, istek doğrulama hatasıdır; OpenAPI'de iki gövde de belgelenir.
- **`502`** → Gemini ile sınıflandırma tamamlanamadı (nedeni ne olursa olsun; ayrıntı yalnızca loglarda).
- **`500`** → dosya ya da kayıt yazılamadı (beklenmeyen sunucu hatası); `failed` kaydı oluşmaz, ayrıntı dönmez (D-034).

**Kabul ölçütleri**

- `GET /health` `{"status": "ok"}` döner — `api::test_health_still_works`.
- Başarılı sınıflandırma `200` ve D-032 alanlarıyla döner; ad alanları kataloglardan çözülür, veritabanında saklanmaz — `api::test_valid_document_is_classified`, `api::test_response_names_are_read_from_catalogs_and_not_stored`.
- İki farklı `422` gövdesi ve V1.4 endpoint'leri OpenAPI'de belgelenir — `api::test_openapi_documents_both_422_bodies`, `api::test_openapi_documents_v14_endpoints`.
- `GET /api/catalogs` ID ve adları katalog dosyasındaki sırayla döndürür — `api::test_catalogs_return_ids_and_names_in_catalog_order`.
- Veritabanı hata mesajları ve logları SQL parametrelerini (ör. belge metni) göstermez — `api::test_production_engine_hides_sql_parameters`.
- Endpoint'e özgü durum kodları ilgili özelliğin kabul ölçütlerindedir: kabul redleri F-01, metin yetersizliği F-02, Gemini hatası F-03, `prepared` geçişleri F-05, onay F-06, salt okunur endpoint'ler F-07.

**Sınırlar**

- Authentication ve yetkilendirme yoktur (D-025): API'ye erişebilen herkes, kalıcı silme dahil her endpoint'i çağırabilir. CORS middleware yoktur; geliştirmede Vite proxy kullanılır (D-038). CORS'un olmaması ve yerel adreste dinleme yetkilendirme değildir. Dağıtım kararları T-12'dedir; dış erişimden önce silme endpoint'i sunucu tarafında yetkilendirilmeli ya da kapatılmalıdır (D-054, T-17).
- Endpoint'lerde arama, filtre ve sayfalama yoktur (D-043, D-048).

**Referanslar:** D-019, D-032, D-034, D-043, D-046, D-049, D-050, D-053, D-054 · Kod: `api/documents.py`, `api/catalogs.py`, `main.py`, `schemas/classification.py`, `database.py` · Görev: T-05, T-12, T-17

## F-09 — Başarısız sınıflandırmayı tekrar deneme

**Durum:** Uygulandı (2026-10-22)

**Amaç:** Gemini/API kaynaklı geçici bir hatayla sınıflandırılamayan belgenin, yeniden yüklenmeden, aynı kayıt, dosya ve çıkarılan metinle tekrar sınıflandırılabilmesi.

**Davranış**

- Kayıt yalnız sınıflandırma aşamasında başarısız olduysa tekrar denenebilir: `status = failed`, metin kaynağı (`ocr_fallback`) biliniyor ve metin ≥ 10 karakter. Metin çıkarımı hatası (422) ve metin kaynağı bilinmeyen migration öncesi kayıt tekrar denenemez; belge yeniden yüklenir. Kural backend'de tektir ve yanıtlarda `retryable` olarak döner (D-053).
- `POST /api/documents/{document_id}/retry-classification` kaydı PostgreSQL satır kilidiyle (`FOR UPDATE NOWAIT`) okur; aynı belgeye eşzamanlı ikinci istek Gemini çağrılmadan `409` alır. Uygunluk kilit altında kontrol edilir; orijinal dosya storage'da olmalıdır.
- Metin çıkarımı, OCR ve transkripsiyon tekrar çalışmaz. Tesseract yedeğiyle okunmuş belgenin sonucu yine `needs_review` olur ve yedek OCR gerekçesini taşır (D-047).
- Gemini yine başarısızsa kayda hiçbir alan yazılmaz (rollback); yanıt `502`, kayıt önceki failed hâliyle kalır ve tekrar denenebilir. Kayıt hiçbir durumda `prepared`'a çekilmez (INV-5).
- Arayüz: "Tekrar Dene" analiz listesinde `retryable` failed satırda ve Kayıtlar'da `retryable` failed kayıt detayında görünür. İstek sıralı çalıştırıcıdan geçer; analiz sürerken Kayıtlar'daki düğme kilitlidir (D-045). `409`'da kaydın güncel durumu detay endpoint'inden okunur; kullanıcıya genel Türkçe mesaj gösterilir. Kayıtlar'da başarı mesajı gösterilir; sonuç analiz listesindeki aynı belgeye de yansır.

**Kabul ölçütleri**

- Metin kaynağı çıkarımda yazılır: dijital ve Gemini `false`, Tesseract yedeği `true`, çıkarım hatası `NULL` — `api::test_extraction_records_ocr_fallback_source`.
- Başarılı tekrar deneme aynı kaydı, dosyayı ve metni kullanır, metin çıkarımı/OCR tekrar çalışmaz, yedek OCR işareti geri kurulur; sonrasında onay çalışır — `api::test_retry_classification_success_uses_same_record_without_reextracting`.
- Gemini yine başarısızsa yalnız rollback yapılır, kayıt birebir aynı kalır ve sonraki deneme kilide takılmaz — `api::test_retry_classification_error_rolls_back_and_keeps_failed_record`.
- `classified`, `needs_review`, `prepared`, metin kaynağı bilinmeyen, çıkarımı başarısız ve metni yetersiz kayıt `409` alır; Gemini çağrılmaz, kayıt değişmez — `api::test_retry_rejects_non_retryable_record_with_409`; dosya yoksa `409` — `api::test_retry_without_source_file_returns_409_and_keeps_record`; bilinmeyen/geçersiz ID `404`/`422` — `api::test_retry_unknown_or_invalid_document`.
- Commit hatası `500` ve kayıt değişmez — `api::test_retry_commit_failure_returns_500_and_keeps_failed_record`. Kilit çakışması (`55P03`) `409`, diğer veritabanı hataları `500`; ikisinde de Gemini çağrılmaz ve rollback yapılır — `api::test_retry_lock_conflict_returns_409_without_gemini_call`, `api::test_retry_other_database_error_is_500_not_busy` (SQLite'ta simülasyon).
- Legacy ve iki adımlı akışta sınıflandırma hatası D-004 alanlarını değiştirmez ve `retryable = true` döner; `/{id}/classify` failed kayda `409` vermeye devam eder; çıkarım hatası `retryable = false` — `api::test_classification_failures_are_retryable_and_keep_d004_fields`, `api::test_extraction_failure_is_not_retryable`.
- `409` sonrası mesaj seçimi — `records:` "kayıt başka bir istekte sınıflandırıldıysa mesaj yoktur", "kayıt hâlâ failed ve uygunsa başka bir istek sürüyordur", "kayıt failed ama uygun değilse belge yeniden yüklenmelidir".
- Gerçek PostgreSQL'de (2026-10-22, geçici DB): eşzamanlı iki istekte ikincisi Gemini beklemeden `409` alır ve Gemini tek kez çağrılır; çağrı sırasında satır kilitli, sonrasında serbesttir; Gemini hatasında kayıt birebir aynı kalır; açık transaction kalmaz. Migration upgrade/downgrade mevcut kayıtları korur; `alembic check` temiz.

**Sınırlar**

- Satır kilidi yalnız PostgreSQL'de çalışır; otomatik testler SQLite kullandığı için kilit çakışması orada simüle edilir, gerçek davranış gerçek ortamda doğrulanır.
- Kilit Gemini çağrısı boyunca (en kötü ~93 sn, D-033) tek belge satırında tutulur.
- Migration öncesi failed kayıtlar (`ocr_fallback` NULL) tekrar denenemez; backfill yoktur. Otomatik veya zamanlanmış tekrar deneme yoktur.
- Arayüz davranışı (düğmenin görünmesi, kilitlenmesi, mesajlar) için bileşen testi yoktur; gerçek tarayıcıda elle doğrulanır.

**Referanslar:** D-053, D-004, D-034, D-045, D-046, D-047 · Kod: `api/documents.py` (`retry_classification`, `_lock_document`, `_is_classification_retryable`, `_extract_into`), `models/document.py` (`ocr_fallback`), `alembic/versions/261a2937eb7c_add_ocr_fallback.py`, `frontend/src/App.tsx` (`retryClassification`, `retryItem`, `retryFromRecords`), `frontend/src/records.ts` (`retryConflict`)

## F-10 — Kalıcı belge silme

**Durum:** Uygulandı (2026-10-23)

**Amaç:** Yanlış, test ya da demo amacıyla yüklenmiş kalıcı kaydın Kayıtlar'dan, açık kullanıcı onayıyla, orijinal dosyasıyla birlikte geri alınamaz şekilde silinebilmesi.

**Davranış**

- Silinebilen kayıtlar: `classified`, `needs_review`, `failed` ve kullanıcı onaylı kayıtlar. `prepared` kayıt bu yolla silinmez (`409`); Kaldır ve 24 saatlik temizlik F-05'teki gibidir.
- `DELETE /api/documents/{document_id}` kaydı satır kilidiyle (`FOR UPDATE NOWAIT`, F-09 ile aynı kilit) okur. Önce orijinal dosyayı, sonra kaydı siler ve commit eder; başarıda `204` döner. Hata kodları F-08'dedir.
- Kayıtla birlikte AI sonucu, onay alanları, evidence ve çıkarılan metin silinir. Soft delete, arşiv, çöp kutusu ve geri alma yoktur. Uygulama logu yalnız belge ID'sini içerir; dosya adı, belge metni ve storage yolu loglanmaz. Beklenmeyen bir hatada sunucunun traceback'i storage yolunu içerebilir; bu yalnız sunucu logundadır, yanıta girmez.
- **Dosya silme ile veritabanı commit'i atomik değildir.** Dosya silinemezse kayıt ve dosya yerinde kalır (`500`). Dosya silindikten sonra commit başarısız olursa ya da süreç kesilirse kayıt kalır, dosya kalmaz; indirme `404`, tekrar deneme `409` döner ve aynı silme isteği tekrarlanınca silme tamamlanır.
- Arayüz (Kayıtlar detayı):
  - "Belgeyi Sil" ilk tıklamada istek göndermez. Detay içinde "Bu belgeyi silmek istediğinizden emin misiniz?" sorusu, dosya adı, "Bu işlem belge kaydını, sınıflandırma ve onay bilgilerini ve orijinal dosyayı kalıcı olarak silecektir. İşlem geri alınamaz." uyarısı ve "Vazgeç" / "Evet, Kalıcı Olarak Sil" seçenekleri görünür. Modal yoktur. "Vazgeç" hiçbir şeyi değiştirmez.
  - İstek sürerken "Vazgeç", "Evet, Kalıcı Olarak Sil" ve aynı kaydın onay/düzeltme düğmeleri kilitlidir. Silme istek çalıştırıcısından geçer (D-045): analiz listesinde istek sürerken "Belgeyi Sil" kilitlidir; silme sürerken analiz ve tekrar deneme beklenir.
  - `204` veya `404` sonrası kayıt listeden çıkar, detay kapanır, "kalıcı olarak silindi" bilgisi gösterilir, sayılar ve filtre seçenekleri güncellenir; seçeneği kalmayan tür/kurum filtresi "tümü" sayılır. Aynı belge analiz listesindeyse oradan da çıkar.
  - `409`'da "başka bir işlemde" mesajı gösterilir, kayıt listede kalır. `500`, ağ hatası ve zaman aşımında başarı varsayılmaz: kaydın durumu detay endpoint'inden okunur. Kayıt yoksa (`404`) silinmiş sayılır; varsa "kayıt yerinde duruyor", okunamazsa "sonuç doğrulanamadı, kayıtları yenileyin" mesajı gösterilir. Hata sonrası onay alanı kapanır; tekrar silme yeniden onay ister.

**Kabul ölçütleri**

Arayüz davranışı için bileşen testi yoktur; tarayıcıda sahte API'yle ve kullanıcının gerçek ortam testinde doğrulanır.

- Dört kalıcı durumda (onaylı dahil) kayıt ve dosya silinir, başka kayıt etkilenmez; sonrasında liste, detay, indirme, tekrar deneme ve ikinci silme kaydı bulamaz (`404`). Uygulama logu yalnız belge ID'sini taşır; dosya adı, belge metni ve storage yolu loglanmaz — `api::test_delete_permanent_document_removes_record_and_file`.
- `prepared` kayıt `409` alır, kayıt ve dosya değişmez; Kaldır çalışmaya devam eder — `api::test_delete_rejects_prepared_document_and_discard_still_works`.
- Bilinmeyen kayıt `404`, geçersiz ID `422` alır — `api::test_delete_unknown_or_invalid_document`.
- Dosyası olmayan kayıt silinir — `api::test_delete_works_when_storage_file_is_already_missing`.
- Dosya silinemezse `500`; kayıt ve dosya yerinde kalır, tekrar silme tamamlanır — `api::test_delete_file_error_keeps_record_and_file`.
- Commit hatasında `500` ve rollback; kayıt kalır, dosya silinmiş olur, tekrar silme tamamlanır — `api::test_delete_commit_failure_keeps_record_and_repeated_delete_completes`.
- Storage klasörü dışına çıkan bir yol silinmez — `api::test_delete_never_deletes_files_outside_storage`.
- Kilit çakışması (`55P03`) `409`, diğer veritabanı hataları `500`; ikisinde de hiçbir şey değişmez — `api::test_delete_lock_conflict_returns_409_and_keeps_record_and_file`, `api::test_delete_other_database_error_is_500_and_keeps_record_and_file` (SQLite'ta simülasyon).
- Arayüzde yanıt yorumu: `204`/`404` silindi, `409` meşgul, diğerlerinde durum ayrıca okunur — `records:` "204 ve 404 silinmiş sayılır: kayıt artık yok", "409 meşguldür; kayıt korunur", "500, ağ hatası ve zaman aşımında başarı varsayılmaz; durum ayrıca okunur". Silme sonrası seçeneği kalmayan filtre "tümü" sayılır — `records:` "seçeneği kalmayan tür ve kurum filtresi sıfırlanır, diğerleri korunur".
- Gerçek PostgreSQL ve dosya sisteminde (2026-10-22, geçici DB ve geçici storage; 24/24 kontrol): tekrar deneme kilidi tutarken silme beklemeden `409` alır, kayıt değişmez ve Gemini tek kez çağrılır; silme sürerken tekrar deneme ve ikinci silme beklemeden `409` alır; Windows'ta açık dosya `500` verir ve kayıt ile dosya korunur; dosya silindikten sonra bağlantı kesilirse kayıt kalır ve tekrar silme tamamlanır; silme sonrası satır ve dosya kalmaz; açık transaction ve bekleyen kilit kalmaz (`CURRENT_STATE.md` → "Son gerçek ortam doğrulamaları").
- Tarayıcıda (2026-10-22, sahte API, masaüstü ve 375px): ilk tıklamada ve "Vazgeç"te DELETE isteği gitmez; onayla tek istek gider; istek ve analiz sürerken düğmeler kilitli; `204`, `409`, `500` (kayıt duruyor) ve `500` (kayıt silinmiş, uzlaştırmayla) doğru gösterilir; başarıda liste, sayaçlar, filtreler, detay ve analiz listesi güncel; onay, düzeltme ve tekrar deneme çalışmaya devam eder.
- Kullanıcının laptop testinde (2026-10-23, gerçek backend, sentetik belgeler): "Vazgeç" kaydı korur, onaylı kalıcı silme kaydı kaldırır; onay alanı ve düğme yerleşimi kabul edildi.

**Sınırlar**

- **Yetki yok (D-025):** API'ye erişebilen herkes her kalıcı kaydı silebilir. Arayüzdeki onay adımı, sunucunun yerel adreste dinlemesi ve CORS middleware'inin olmaması yetkilendirme değildir. Dış erişimden (T-17 veya başka bir yol) önce endpoint sunucu tarafında yetkilendirilmeli ya da kapatılmalıdır.
- Dosya silme ve commit atomik değildir (yukarıdaki "dosyasız kayıt" ara durumu).
- Onay endpoint'i kilit kullanmaz: onay ile silme aynı anda gelirse onay hata (`500`) alabilir; gerçek PostgreSQL'de onay silmenin commit'ini bekler, sonra `500` alır. Bu, yalnız onay–silme çakışması için kabul edilen yerel MVP sınırıdır; diğer çakışmalar kendi kurallarıyla korunur (tekrar deneme: satır kilidi; `prepared` işlemleri: durum kontrolü).
- İndirme kilit kullanmaz: indirme sürerken işletim sistemi açık dosyanın silinmesine izin vermezse (ör. Windows) silme `500` alır ve kayıt korunur.
- Satır kilidi yalnız PostgreSQL'de çalışır; otomatik testler SQLite kullandığı için kilit çakışması simüle edilir.
- Alınmış veritabanı ve storage yedekleri silinmez. Modül resmî saklama sistemi sayılmaz; gerçek kurum verisinde kullanılmadan önce saklama, silme ve yedek politikaları ayrıca doğrulanmalıdır. İlk kullanım yerel geliştirme ve sentetik/demo belgelerle sınırlıdır.

**Referanslar:** D-054, ADR-001, D-019, D-025, D-046, D-049, D-053 · Kod: `api/documents.py` (`delete_document`, `_lock_document`, `_delete_with_file`), `frontend/src/App.tsx` (`deleteDocument`, `deleteFromRecords`, `RecordDeleteControls`), `frontend/src/records.ts` (`deleteOutcome`, `keepAvailableFilters`) · Görev: T-15, T-17
