# DECISIONS

> Geçerli ürün ve mimari kararların dizini: ne karar verildi ve hâlâ geçerli mi? Kararların tek kaynağıdır.
>
> **Kurallar** — ayrıntı: `~/.claude/standards/PROJECT_STRUCTURE.md` §5. Hangi kararın kaydedileceği ve ne zaman ADR yazılacağı: `~/.claude/CLAUDE.md` → "Architecture decisions and ADRs".
> - Kayıt alanları: ID (`D-xxx`), kısa karar, durum, tarih (yeni kayıtta kararın verildiği gün), referanslar (ADR, şartname bölümü, görev).
> - Durumlar: **Aktif**, **Açık** (kayıt cevaplanması gereken soruyu yazar), **Yerini aldı** (yerine geçen kararın ID'si yazılır).
> - Karar değişirse eski kayıt silinmez ve yeniden yazılmaz. Yeni karar ilgili bölüme sıradaki numarayla eklenir; eski kayıt "Yerini aldı → D-yyy" olarak işaretlenir. Birbiriyle çelişen iki aktif karar bulunmaz.
> - ID'ler kalıcıdır; bir numara yeniden kullanılmaz. Kod yorumları bu ID'lere başvurur.
> - Gerekçe ve değerlendirilen alternatifler, ADR koşullarını karşılayan kararda `docs/ADR/` altındaki ADR'ye yazılır; kayıt ADR'ye referans verir.
> - Bu dosya iş listesi, roadmap veya checkpoint günlüğü değildir (iş → `TODOS.md`).
>
> **Geçiş notu:** D-001–D-050 bu kurallardan önce "Karar + Gerekçe" biçiminde yazıldı; o zamanki kural, geçersizleşen kararın dosyadan çıkarılmasını ve değişen kararın yerinde yeniden yazılmasını istiyordu. Karar ve gerekçe metinleri değiştirilmedi; her kayda bir durum satırı eklendi:
> - **Aktif:** kararın ana kuralları 2026-10-20'de koda karşı kontrol edildi; 50 kaydın hiçbiri için yerini başka bir kararın aldığına dair kanıt bulunmadı. Sonra 2026-10-21'de D-036'nın yalnız host portu maddesinin yerini D-051 aldı; D-036 bu yüzden "Yerini aldı" durumundadır.
> - **Git:** "giriş" kaydın `DECISIONS.md`'ye ilk girdiği commit'in, "son değişiklik" karar ve gerekçe metninin son değiştiği commit'in tarihidir. İkisi de kararın verildiği tarih değildir; eski kayıtlarda o tarih bilinmiyor. Eski kurala göre metin yerinde değiştiği için ayrıntılar Git geçmişindedir.
> - **Referans:** F-xx ve "Ortak teknoloji" `docs/TEKNIK_SARTNAME.md` bölümleridir; INV-x `PROJECT_BRAIN.md` §10'daki değişmezlerdir; T-xx `TODOS.md` görevleridir.
> - D-049 ve D-050'deki eski "Uygulandı" tarihleri F-06 ve F-04'ün durumuna taşındı.

---

## Kapsam ve dosya işleme

### D-001 — Desteklenen dosya türleri: PDF, DOC, DOCX, JPG/JPEG ve PNG
- **Durum:** Aktif · **Git:** giriş 2026-09-15, son değişiklik 2026-10-03 · **Referans:** F-01, F-02
- **Karar:** Sistem PDF, DOC, DOCX, JPG/JPEG ve PNG dosyalarını kabul eder. Metin çıkarımı türe göre ayrışır:
  - **PDF** — gömülü metin okunur; güvenilir dijital metni olmayan PDF'ler (D-003) Gemini transkripsiyonuyla okunur (D-047), yani taranmış ve hybrid PDF'ler de desteklenir.
  - **DOC** — Word 97–2003 binary (OLE) belgesi; saf Python `legacy-doc` parser'ı ile doğrudan baytlardan okunur (D-002). Word, LibreOffice veya başka bir harici program gerekmez. OCR yapılmaz; gövde paragrafları ve tablo hücreleri alınır, gömülü görüntü, makro ve biçimlendirme kapsam dışıdır.
  - **DOCX** — python-docx ile okunur, OCR yapılmaz; dolayısıyla DOCX metin tabanlı olmalıdır.
  - **JPG/JPEG/PNG** — gömülü metin aranmaz; görüntünün metni **her zaman** Gemini transkripsiyonuyla okunur, gerekirse tek sayfalık belge olarak Tesseract yedeğine düşer (D-047, D-042). PDF'e özgü sayfa/yapı kararları (D-003) uygulanmaz.
  Kabulde uzantı tek başına yetmez: uzantı ile dosya imzası birlikte doğrulanır (PDF `%PDF`, DOCX ZIP + WordprocessingML, JPEG `FF D8 FF`, PNG `89 50 4E 47 0D 0A 1A 0A`); istemcinin gönderdiği content-type'a güvenilmez. DOC'ta OLE imzası (`D0 CF 11 E0 A1 B1 1A E1`) tek başına yetmez — XLS ve PPT de aynı imzayı taşır; bu yüzden OLE dizininde Word'e özgü `WordDocument` stream'i de aranır (metin çıkarmadan, yalnızca dizin okunarak). GIF, TIFF, BMP, WebP ve HEIC dahil diğer tüm türler desteklenmez ve reddedilir.
- **Gerekçe:** Vatandaş dilekçeleri sıklıkla telefonla fotoğraflanarak veya taranarak JPG/PNG olarak geliyordu ve bu belgeler sisteme hiç alınamıyordu. Görüntüler taranmış PDF'lerle aynı metin okuma yolunu kullanır (D-047); ayrı bir dosya türü hattı gerekmez. `.doc` başlangıçta kapsam dışıydı çünkü dönüştürme için Word veya LibreOffice gerekeceği varsayılmıştı; saf Python bir parser bu varsayımı ortadan kaldırdığı için kapsama alındı. Diğer görüntü formatları ise gerçek bir ihtiyaç doğmadan kapsamı genişletirdi.

### D-002 — Metin çıkarımı: PDF için PyMuPDF, DOCX için python-docx, DOC için legacy-doc
- **Durum:** Aktif · **Git:** giriş 2026-09-15, son değişiklik 2026-09-21 · **Referans:** F-02
- **Karar:** PDF metni PyMuPDF ile, DOCX metni python-docx ile, DOC (Word 97–2003) metni `legacy-doc` ile çıkarılır. Üçü de saf Python kütüphanesidir; harici program (Word, LibreOffice, antiword) çalıştırılmaz.
- **Gerekçe:** Hızlı, yaygın kullanılan ve ek sistem bağımlılığı gerektirmeyen kütüphaneler. `legacy-doc` bağımlılıksızdır ve doğrudan baytlardan çalışır; izole ortamda Python 3.13 ile gerçek `.doc` dosyalarında doğrulandı (Türkçe karakterler korunuyor, tablo hücreleri geliyor, Word olmayan OLE dosyaları reddediliyor).

### D-003 — PDF'te güvenilir dijital metin kararı: sayfa bazlı OCR koşulları (V1.1)
- **Durum:** Aktif · **Git:** giriş 2026-09-15, son değişiklik 2026-10-03 · **Referans:** F-02
- **Karar:** PDF'te metin katmanının güvenilirliği **sayfa sayfa** değerlendirilir (teknik ayrıntı: D-042). Bir sayfa iki durumda OCR gerektirir:
  1. Sayfanın kendi gömülü metni minimum uzunluğa (D-026) ulaşmıyorsa — sayfa taranmış sayılır.
  2. Sayfa **yapısal olarak görüntüye dayanıyorsa** (görüntülerin kapladığı alan sayfanın en az **%50**'si) **ve** gömülü metni **en fazla 200 karakter** ise — metin katmanı bozuk olabileceği için görüntü de okunur.
  - Hiçbir sayfa bu koşulları sağlamıyorsa PDF güvenilir dijital metin taşır ve tamamen gömülü metniyle okunur; Gemini transkripsiyonu veya OCR yapılmaz.
  - En az bir sayfa sağlıyorsa PDF'in **tamamı** Gemini transkripsiyonuyla okunur: 1–3 sayfa tek çağrıda, 4+ sayfa en fazla 3 sayfalık sıralı gruplar hâlinde (D-047).
  - Transkripsiyon başarısız veya yetersizse (tek bir grupta bile) Tesseract yedeği belgenin tamamında bu koşullarla sayfa sayfa çalışır: koşulu sağlayan sayfalar OCR'lanır, diğerleri gömülü metniyle kalır, sayfa metinleri belge sırasıyla birleştirilir.
  - DOCX'te OCR yapılmaz. Nihai metin hâlâ kısaysa belge `failed` olarak kaydedilir.
- **Aynı sayfada gömülü metin + OCR (Tesseract yedeği):** İkinci durumda iki metin deterministik olarak karşılaştırılır (ek LLM çağrısı yoktur): gömülü metnin kelime benzeri parçalarının tamamı OCR metninde de varsa yalnızca OCR metni kullanılır (aynı içerik iki kez yazılmaz), en az biri yoksa iki metin de sayfa sırasıyla korunur (bilgi kaybı olmaz). Kelime benzeri parçası olmayan bozuk katmanlar korunacak bilgi taşımadığı için OCR metnine bırakılır.
- **Gerekçe:** V1.3'te OCR motoru değişti (D-047); sayfa koşulları "güvenilir dijital metin yok" kararının ölçülmüş tanımı olarak korundu. V1'de OCR kapsam dışıydı ve taranmış dilekçeler doğrudan `failed` oluyordu. Karar belge düzeyinde verildiğinde hybrid PDF'ler kaçıyordu (P1): kapak/evrak sayfasının metni eşiği geçtiği için taranmış asıl dilekçe hiç okunmuyordu. Yalnızca uzunluğa bakmak da yetmiyordu (P2): benchmark senaryo 14'te görüntü tamamen okunabilirken 26–33 karakterlik bozuk bir metin katmanı eşiği geçtiği için OCR hiç çalışmıyor ve belge `other` / `needs_review` olarak kapanıyordu; yapısal koşul eklendikten sonra aynı belge `complaint` / `temizlik_isleri` / `classified` oldu. Eşikler ölçülerek seçildi: kapsama %30–%72 ve uzunluk 100–400 aralığının tamamı 30 sayfalık korpusta sapmasız çalıştı, %50 ve 200 bu aralıkların ortasıdır. İçerik temelli "% alfabetik karakter" gibi kurallar ölçümde elendi: gerçek tarih, TCKN/VKN, sayı tablosu, madde numarası ve kısa resmi form metinlerinin çoğunu bozuk sayıyorlardı. Yapısal koşul bu metinlere hiç bakmaz, çünkü dijital sayfalarda görüntü kapsaması sıfıra yakındır.

### D-047 — OCR gereken belgelerde Gemini multimodal transkripsiyon birincil, Tesseract acil durum yedeği (V1.3)
- **Durum:** Aktif · **Git:** giriş ve son değişiklik 2026-10-03 · **Referans:** F-02
- **Karar:**
  - Metin çıkarımı, belgenin güvenilir dijital metni olup olmadığına göre ayrışır:
    - **Var** — DOC, DOCX ve D-003 koşullarının hiçbirini sağlamayan PDF'ler: mevcut yerel çıkarım (PyMuPDF, legacy-doc, python-docx). Gemini transkripsiyonu yapılmaz.
    - **Yok** — JPG/JPEG/PNG ve en az bir sayfası D-003 koşulunu sağlayan PDF'ler (hybrid dahil): belgenin tamamı Gemini transkripsiyonuyla okunur:
      - Görüntü ve 1–3 sayfalık PDF: dosya olduğu gibi, baytları ve MIME türüyle **tek** bir çağrıya gönderilir.
      - 4+ sayfalık PDF: sayfa sırası korunarak en fazla **3 sayfalık** gruplara bölünür. Her grup aynı prompt ve ayarlarla ayrı bir çağrıda, sırayla okunur; ⌈sayfa / 3⌉ çağrı yapılır (21 sayfa = 7 çağrı).
      - Grup metinleri sayfa sırasıyla birleştirilir.
  - Her grubun (tek çağrıda belgenin) transkripsiyonu normalize edilir ve 10 karakter sınırına (D-026) tabidir. Tüm gruplar yeterliyse çıkarılan metin birleşik metindir.
  - Herhangi bir grup 3 denemede tamamlanamazsa (D-033) **ya da** normalize metni 10 karakterden kısa kalırsa transkripsiyon başarılı sayılmaz:
    - Kısmi Gemini sonucu kullanılmaz ve kalan gruplar gönderilmez.
    - Belgenin tamamı, mevcut yerel çıkarım + Tesseract acil durum yedeği yolundan (D-003, D-042) yeniden çıkarılır:
      - PDF'te Tesseract OCR yalnız D-003 koşulunu sağlayan sayfalarda çalışır; diğer sayfalarda güvenilir gömülü metin korunur.
      - Görüntü belgelerde görüntünün tamamı Tesseract ile OCR'lanır.
      - Yedeğin metni yeterliyse belge işlenmeye devam eder ama sonucu `needs_review` olur. `review_reason`, metnin yedek OCR ile okunduğunu söyleyen genel bir gerekçe taşır. İki adımlı akışta bu işaret `prepared` kayda yazılır ve sınıflandırma onu korur (D-046).
      - Yedeğin metni de yetersizse mevcut `failed` + `422` davranışı geçerlidir (D-004, D-034). Transkripsiyon hatası `502` üretmez.
  - Sınıflandırma, yalnız tüm gruplar başarıyla tamamlandıktan sonra (ya da yedek metinle) birleşik metin üzerinde **bir kez** çalışır.
  - Transkripsiyon çağrısı:
    - Model `GEMINI_MODEL`'dir; ayrı bir model değişkeni yoktur (D-031).
    - temperature 0, 30 sn timeout, SDK retry kapalı, toplam en fazla 3 gerçek deneme (D-033). Yanıt şeması yoktur, düz metin döner.
    - Prompt yalnız transkripsiyon ister (düzeltme, özetleme, tahmin ve yorum yasak) ve benchmarkta ölçüldüğü haliyle sabittir; değiştirilirse ölçüm tekrarlanır.
    - Modele Tesseract çıktısı veya başka bir metin verilmez. Kısa ama boş olmayan yanıt yeniden denenmez.
  - Transkripsiyon ve sınıflandırma ayrı çağrılardır ve birleştirilmez (D-008).
  - Yapılmayacaklar:
    - el yazısı dedektörü veya "belge el yazısı mı?" sınıflandırması
    - önce Tesseract sonra Gemini düzeltmesi
    - ek OCR modeli
    - 3 sayfalık sabit gruplar dışında chunking; grupların paralel gönderilmesi (D-020)
- **Gerekçe:**
  - **El yazısı:** İnsanın rahat okuduğu gerçek Türkçe el yazısında (manuel ground truth'lu 9 örnek) Tesseract kullanılamaz kaldı: CER %37,0, WER %80,7 (macro). Gemini CER %3,9, WER %6,1 ile 9/9 örnekte hem CER hem WER'de daha iyiydi.
  - **Basılı tarama:** 8 belgelik kontrol setinde gerileme yok. Gemini CER %0 / WER %0,24, Tesseract CER %3,8 / WER %4,5 (macro). 4 belgede iki motor eşit, 4'ünde Gemini daha iyi, hiçbirinde daha kötü değil. Gemini ~2,5× yavaş (8 belgede toplam ~24,0 sn, Tesseract ~9,7 sn).
  - **Tek yol:** Ayrı bir el yazısı dedektörü yeni bir hata kaynağı ve karar katmanı eklerdi. Basılı belgelerde gerileme olmadığı için OCR gereken her belgede tek yol daha basit.
  - **Yedek ve inceleme:** Tesseract'ın yedek olarak kalması, Gemini'ye ulaşılamadığında belgeyi okunur tutar. Daha zayıf bir okuma olduğu için sonucu insan incelemesine düşer.
  - **3 sayfalık gruplar:** Gerçek ortam ölçümünde tek çağrı 2–4 sayfalık taranmış PDF'i eksiksiz okudu. 5, 6, 12 ve 21 sayfada model hata vermeden yalnız 1. sayfayı döndürdü. Yanıt boş olmadığı için bu sessiz eksik okuma yedeğe de düşmüyordu. 3 sayfa, ölçülen güvenli aralığın (≤ 4) içinde pay bırakır. Prompt grup başına değişmeden kalır, böylece ölçülmüş davranış korunur. Kısmi sonucun reddedilmesi, eksik metinle güvenli görünen bir sınıflandırmayı önler.
  - **Ölçümün sınırları:** Set küçük (9 + 8 belge) ve çoğunlukla temiz tarama/render'lardan oluşuyor. Gerçek tarayıcı gürültüsü ve telefon fotoğrafı kapsamı sınırlı. Sayfa eşiği tek bir sentetik belge türüyle ölçüldü. Benchmark verileri repo dışında tutulur.
  - **Veri akışı değişti:** OCR gereken belgelerde dosyanın kendisi (görüntü/PDF) Gemini'ye gönderilir; önceden yalnız çıkarılan metin gidiyordu.

### D-042 — Acil durum OCR'ı: PyMuPDF'in yerleşik Tesseract'ı, `tur`, 400 dpi
- **Durum:** Aktif · **Git:** giriş 2026-09-17, son değişiklik 2026-10-03 · **Referans:** F-02
- **Karar:**
  - Tesseract birincil OCR değildir. Yalnız Gemini transkripsiyonu başarısız olduğunda ya da yetersiz metin döndürdüğünde çalışan acil durum yedeğidir (D-047).
  - OCR, PyMuPDF'in `get_textpage_ocr` API'siyle **sayfa başına** yapılır: PDF'te D-003 koşulunu sağlayan sayfalarda, JPG/JPEG/PNG'de tek sayfalık görüntünün tamamında. `pytesseract` veya ayrı bir `tesseract` süreci kullanılmaz; ayrı OCR servisi, kuyruk ya da soyutlama katmanı eklenmez.
  - Sayfanın "yapısal olarak görüntüye dayandığı", PyMuPDF'in `get_image_info` bilgisiyle ölçülür: sayfa dikdörtgeniyle kesişen görüntü alanlarının toplamı / sayfa alanı. Yeni kütüphane, sayfa render'ı veya ön işleme eklenmez; bu ölçüm yalnızca gömülü metni 10–200 karakter arasında olan sayfalarda yapılır.
  - Dil `tur`, çözünürlük 400 dpi. İkisi de `file_service` içinde tek yerde sabittir. Belgeler Türkçe olduğu için İngilizce model eklenmez: gerçekçi bozulma testlerinde `tur+eng` Türkçe karakterleri daha çok kaybediyordu (özellikle `Ç→C`) ve hiçbir senaryoda öne geçmedi. Çözünürlük 300'den 400'e ölçümle çıkarıldı: font tabanlı sentetik el yazısı proxy'si, bozulmuş tarama ve basılı belgelerden oluşan 12 senaryoluk korpusta ortalama CER 0,292 → 0,237, tamamen düşen satır 14 → 10, kayıp kritik alan 10 → 4, doğru okunan rakam 14/22 → 16/22; basılı/dijital belgelerde çıkarılan metin değişmedi. Bu korpus gerçek insan el yazısı içermiyordu. V1.3'te gerçek Türkçe el yazısıyla yapılan ölçümde Tesseract yetersiz kaldı (CER ~%37, WER ~%81) ve birincil rol Gemini transkripsiyonuna geçti (D-047). 600 dpi ölçüldü ve **geri adım** attığı için (CER 0,315; form senaryosunda rakamların tamamı bozuldu) kullanılmaz. PSM/OEM ayarlanmaz: PyMuPDF'in `get_textpage_ocr` API'si bu parametreleri kabul etmez ve ayrı bir Tesseract süreci bu kararın kapsamı dışındadır.
  - Tesseract dil dosyalarının klasörü `TESSDATA_PREFIX` ortam değişkeninden okunur ve OCR çağrısına doğrudan geçilir. Değişken **opsiyoneldir**: tanımlı değilse yedek OCR atlanır. Kodda platforma özel kurulum yolu yazılmaz.
  - OCR hatası yükseltilmez: loglanır ve **o sayfa** gömülü metniyle değerlendirilir; diğer sayfalar etkilenmez ve mevcut `failed` + `422` davranışı korunur.
- **Gerekçe:** PyMuPDF zaten bir bağımlılık ve Tesseract'ı derlenmiş olarak içeriyor; yeni Python paketi veya PATH'te `tesseract` binary'si gerekmiyor. Yerel bir yedek, Gemini'ye ulaşılamadığında da belgenin okunabilmesini sağlar. OCR bir iyileştirme olduğu için başarısızlığı yeni bir hata sınıfı doğurmamalı. Ortam değişkeni, kurulum yolunun makineden makineye değişmesine izin verir.

### D-004 — Hatalı dosya ve `failed` kayıt davranışı
- **Durum:** Aktif · **Git:** giriş 2026-09-15, son değişiklik 2026-10-03 · **Referans:** F-01, F-02, F-08; INV-6
- **Karar:**
  - Desteklenen türler (D-001: PDF, DOC, DOCX, JPG/JPEG, PNG) dışındaki dosyalar ve 50 MB'ı aşan dosyalar (D-028) sisteme kabul edilmez: storage'a yazılmaz, `documents` kaydı oluşturulmaz, 4xx ile reddedilir. Uzantısı doğru ama imzası uymayan dosyalar da (ör. `.png` uzantılı düz metin) kabul edilmez.
  - Kabul edilen belgede metin çıkarımı başarısız olursa, yeterli metin çıkarılamazsa (D-026) veya Gemini sınıflandırma çağrısı başarısız olursa (D-033) belge `status = failed` olarak kaydedilir. Görüntülerde Gemini transkripsiyonu ve Tesseract yedeği yeterli metin üretemezse (D-047), DOC parser'ı belgeyi çözemezse ya da dosya bozuk/eksikse akış aynı `failed` yoluna düşer; yeni hata sınıfı veya HTTP kodu eklenmez.
  - `failed` kayıtlarında `document_type = null`, `institution_id = null`, `needs_review = false`, `review_reason = null`.
  - Teknik hata detayları kullanıcıya gösterilmez; loglanır. Kullanıcıya genel bir mesaj döner (HTTP kodları ve yanıt gövdesi: D-034).
- **Gerekçe:** Kabul edilmeyen dosyalar gereksiz kayıt üretmez; işlenmeye alınmış belgeler izlenebilir kalır. Teknik detaylar kullanıcıya fayda sağlamaz ve sistemin iç yapısını açığa çıkarır.

### D-026 — Minimum metin uzunluğu: 10 karakter
- **Durum:** Aktif · **Git:** giriş 2026-09-15, son değişiklik 2026-10-03 · **Referans:** F-02
- **Karar:** Normalize edilmiş (ardışık boşluklar tek boşluğa indirilmiş, baş ve son boşlukları kırpılmış) metin en az 10 karakter olmalıdır. Aynı sınır Gemini transkripsiyonunun başarılı sayılması için de kullanılır: kısa transkript Tesseract yedeğine düşer (D-047). Nihai metin yine kısaysa belge sınıflandırmaya gönderilmez ve `status = failed` kaydedilir.
- **Gerekçe:** Boş veya neredeyse boş belgeler için anlamsız Gemini çağrısı ve maliyet önlenir; düşük eşik kısa ama geçerli metinleri dışarıda bırakmaz.

### D-028 — Maksimum dosya boyutu: 50 MB
- **Durum:** Aktif · **Git:** giriş 2026-09-15, son değişiklik 2026-09-27 · **Referans:** F-01, F-05
- **Karar:** Desteklenen tüm dosya türleri (D-001) için sınır dosya başına 50 MB'dır. Aşan dosya storage'a yazılmadan ve `documents` kaydı oluşturulmadan `413` ile reddedilir.
- **Gerekçe:** Sunucu kaynaklarını ve senkron istek süresini korur; metin tabanlı belgeler için yeterli pay bırakır.

## Teknoloji

### D-005 — Backend ve frontend yığını
- **Durum:** Aktif · **Git:** giriş 2026-09-15, son değişiklik 2026-09-16 · **Referans:** Ortak teknoloji
- **Karar:** Backend: Python + FastAPI. Frontend: React + Vite (detaylar: D-037).
- **Gerekçe:** Hızlı geliştirme; FastAPI ve Pydantic doğal uyum sağlar; Vite hafif ve hızlı bir frontend kurulumu sunar.

### D-006 — PostgreSQL, senkron SQLAlchemy ve psycopg 3
- **Durum:** Aktif · **Git:** giriş ve son değişiklik 2026-09-15 · **Referans:** Ortak teknoloji
- **Karar:** Veritabanı PostgreSQL'dir. Erişim senkron SQLAlchemy 2.x ile yapılır (`create_engine` + `sessionmaker`, async engine yok). Sürücü psycopg 3'tür (`postgresql+psycopg://` bağlantı adresi, `psycopg[binary]` paketi).
- **Gerekçe:** PostgreSQL güvenilir ve yaygın; ileride entegrasyon ve genişleme için sağlam temel. Senkron erişim, D-020'deki senkron işleme ile uyumlu ve MVP için en basit yol. psycopg 3, SQLAlchemy 2'nin desteklediği güncel PostgreSQL sürücüsü; binary paketi Windows'ta derleme gerektirmeden kurulur.

### D-030 — Alembic ile migration yönetimi
- **Durum:** Aktif · **Git:** giriş ve son değişiklik 2026-09-15 · **Referans:** Ortak teknoloji
- **Karar:** Veritabanı şeması SQLAlchemy modelleriyle birlikte Alembic migration'larıyla yönetilir. `Base.metadata.create_all` kalıcı migration yöntemi olarak kullanılmaz.
- **Gerekçe:** Şema değişiklikleri baştan izlenebilir ve tekrarlanabilir olur; mevcut veri kaybedilmeden şema güncellenebilir.

### D-035 — Yapılandırma: ortam değişkenleri + `backend/.env`, ayrı config katmanı yok
- **Durum:** Aktif · **Git:** giriş ve son değişiklik 2026-09-15 · **Referans:** Ortak teknoloji
- **Karar:**
  - Yapılandırma ortam değişkenlerinden okunur. `app/settings.py` değerleri modül düzeyinde okur. `backend/.env` varsa python-dotenv ile yüklenir; ortamda zaten tanımlı değişkenler ezilmez.
  - Zorunlu değişkenler `settings.require_env(name)` ile okunur; tanımlı değilse açık bir `RuntimeError` fırlatılır.
  - `DATABASE_URL`, `app.settings` import edilirken zorunludur. Alembic de aynı `DATABASE_URL`'i kullanır; `alembic.ini` içinde bağlantı adresi tutulmaz.
  - `GEMINI_API_KEY` ve `GEMINI_MODEL`, `app/llm/gemini_client.py` yüklenirken zorunludur (D-031). `settings.py` import'unda aranmazlar; böylece Alembic ve veritabanı araçları Gemini yapılandırması gerektirmez.
  - Config sınıfı, pydantic-settings veya ek soyutlama yoktur.
  - Modül adı `settings.py`'dir; `app/config/` katalog klasörüyle isim çakışmasını önler.
- **Gerekçe:** `.env.example` → `.env` akışıyla uyumlu en küçük çözüm. Değerler tek yerden, aynı yardımcıyla okunur. Eksik yapılandırma, sessizce yanlış bir bağlantıya veya modele düşmek yerine açık hatayla fark edilir. Her zorunlu değişken yalnızca onu kullanan modül yüklenirken istenir.

### D-036 — Geliştirme ortamı: PostgreSQL 18 Docker Compose'da, backend ve frontend yerelde
- **Durum:** Yerini aldı → D-051 (2026-10-21; yalnız host portu değişti, diğer maddeler D-051'de geçerli) · **Git:** giriş 2026-09-15, son değişiklik 2026-09-16 · **Referans:** Ortak teknoloji; `README.md` "Kurulum"
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
- **Durum:** Aktif · **Git:** giriş ve son değişiklik 2026-09-16 · **Referans:** Ortak teknoloji
- **Karar:**
  - Veritabanı bağlantısının kurulması en fazla 10 saniye bekler. Değer, libpq'nun `connect_timeout=10` parametresi olarak `DATABASE_URL` içinde verilir (`backend/.env.example` ve yerel `backend/.env`); kodda ayrıca tanımlanmaz.
  - Uygulama ve Alembic aynı `DATABASE_URL`'i kullandığı için (D-035) ikisine de uygulanır.
  - Yalnızca bağlantı kurma süresini sınırlar; sorgu/statement zaman aşımı eklenmez.
  - Parametresi olmayan eski bir `.env`, psycopg'un varsayılan bekleme süresine döner; yerel `.env` şablonla uyumlu tutulur.
- **Gerekçe:** PostgreSQL kapalıyken psycopg'un varsayılanıyla bağlantı denemesi yaklaşık 130 saniye sürüyor, bir backend thread'ini meşgul ediyor ve frontend'in 120 saniyelik zaman aşımından (D-039) uzun kalıyordu. 10 saniye, yerel ve kısa ağ gecikmelerine pay bırakırken hatayı hızlı ve genel `500` yanıtıyla sonuçlandırır. Değer yapılandırmada olduğu için kod değişmeden ayarlanabilir.

### D-051 — Geliştirme PostgreSQL host portu: `127.0.0.1:5434`
- **Durum:** Aktif · **Tarih:** 2026-10-21 · **Referans:** Ortak teknoloji; `README.md` "Kurulum"; D-036'nın yerini alır
- **Karar:**
  - Geliştirme PostgreSQL'inin host portu `127.0.0.1:5434`, container portu `5432`'dir. Port yalnızca localhost'a açıktır.
  - `DATABASE_URL`: `postgresql+psycopg://postgres:postgres@127.0.0.1:5434/dosya_sistemi?connect_timeout=10` (bağlantı zaman aşımı: D-041).
  - D-036'nın diğer maddeleri değişmeden geçerlidir: Compose'da yalnız `postgres` servisi (`postgres:18`, container `dosya-sistemi-postgres`, veritabanı `dosya_sistemi`), `dosya_sistemi_pgdata` volume'unun `/var/lib/postgresql` yoluna bağlanması, `localhost` yerine `127.0.0.1`, yalnız yerel geliştirme için `postgres` / `postgres`, backend ve frontend yerelde ve containerize edilmeden.
- **Gerekçe:** Aynı makinede `stok` projesinin PostgreSQL container'ı `127.0.0.1:5433`'ü kullanıyor. İki proje aynı host portunu isteyince `dosya_sistemi` container'ı başlayamıyor ve backend, `DATABASE_URL` ile diğer projenin sunucusuna bağlanma riski taşıyordu. Ayrı host portu iki projenin aynı anda çalışmasına izin verir; volume ve veri değişmez.

## LLM

### D-007 — LLM olarak Gemini API
- **Durum:** Aktif · **Git:** giriş 2026-09-15, son değişiklik 2026-10-03 · **Referans:** F-02, F-03
- **Karar:** Sınıflandırma ve OCR gereken belgelerde metin transkripsiyonu (D-047) Google Gemini API ile yapılır.
- **Gerekçe:** Şemaya bağlı structured output ve enum kısıtlı çıktı desteği; görüntü/PDF girdisi kabul eden multimodal model; hızlı ve düşük maliyetli model seçenekleri.

### D-008 — Belge başına tek sınıflandırma çağrısı; transkripsiyon ayrı çağrıdır
- **Durum:** Aktif · **Git:** giriş 2026-09-15, son değişiklik 2026-10-07 · **Referans:** F-03; INV-1
- **Karar:**
  - Belge türü, kurum, özet, gönderen bilgisi ve yönlendirmeyle ilgili belge ifadeleri (`routing_evidence`, D-050) tek bir Gemini sınıflandırma çağrısında belirlenir.
  - OCR gereken belgelerde (D-047) bundan önce ayrı transkripsiyon çağrısı yapılır: görüntüde ve 1–3 sayfalık PDF'te bir, 4+ sayfalık PDF'te 3 sayfalık grup başına bir çağrı. Sınıflandırma birleşik metinle yine bir kez çalışır.
  - Transkripsiyon ve sınıflandırma birleştirilmez: transkripsiyon yalnız metni okur, sınıflandırma yalnız çıkarılan metinle çalışır.
  - Retry (D-033) aynı çağrının tekrarıdır, ek adım sayılmaz.
- **Gerekçe:** Düşük gecikme ve maliyet; çok adımlı akışın getireceği karmaşıklıktan kaçınma. Transkripsiyonun ayrı kalması, çıkarılan metnin sınıflandırmadan önce önizlenip saklanmasını (D-045) ve sınıflandırma şemasının değişmemesini sağlar. Birleşik bir çağrı, ölçülmüş transkripsiyon davranışını da değiştirirdi.

### D-009 — Pydantic ile structured output
- **Durum:** Aktif · **Git:** giriş 2026-09-15, son değişiklik 2026-10-07 · **Referans:** F-03
- **Karar:** Model `document_type`, `institution_id`, `needs_review`, `review_reason` alanlarını, D-044'teki `summary`, `sender_name`, `sender_institution` alanlarını ve D-050'deki `routing_evidence` alanını Pydantic şemasına uygun döndürür.
  - Temel şema `app/schemas/classification.py` içindedir ve `needs_review` tutarlılık kurallarını doğrular.
  - İstisna: `routing_evidence` toleranslı doğrulanır. Eksik, `null`, yanlış tipli ya da bozuk evidence ve geçersiz öğeler doğrulamadan önce ayıklanır; yanıtın geri kalanı bu yüzden geçersiz sayılmaz (D-050).
  - İzinli `document_type` / `institution_id` değerleri çalışma zamanında katalog JSON'larından (`Literal`) üretilir; katalog ID'leri kodda ayrıca yazılmaz.
  - Aynı model hem Gemini'ye `response_schema` olarak verilir hem de backend'de yanıtı doğrular.
- **Gerekçe:** Serbest metin ayrıştırma yok; çıktı tipli ve doğrulanabilir. Kataloglar tek kaynak olarak kalır; şema ile doğrulama birbirinden ayrışamaz.

### D-010 — Model katalog dışına çıkamaz, belirsizlikte zorla atama yapılmaz
- **Durum:** Aktif · **Git:** giriş ve son değişiklik 2026-09-15 · **Referans:** F-03; INV-2
- **Karar:** Model yalnızca kataloglardaki ID'lerden seçer. Makul eşleşme yoksa `institution_id = null` ve `needs_review = true`. Backend katalog dışı değerleri kabul etmez; böyle bir yanıt geçersiz çıktı sayılır ve retry edilir (D-033).
- **Gerekçe:** Uydurulmuş ID'ler ve yanlış otomatik atamalar, incelemeye düşen bir belgeden daha maliyetlidir.

### D-027 — Gemini'ye en fazla 50.000 karakter gönderilir
- **Durum:** Aktif · **Git:** giriş ve son değişiklik 2026-09-15 · **Referans:** F-03, F-04
- **Karar:** Sınıflandırma çağrısına normalize edilmiş metnin en fazla ilk 50.000 karakteri gönderilir. Sınırı aşan belgeler için V1'de chunking, RAG veya karmaşık belge işleme eklenmez. `extracted_text` metnin tamamını saklamaya devam eder.
- **Gerekçe:** Maliyet ve gecikme sınırlanır; dilekçe ve başvurularda belge türü ve konu çoğunlukla metnin başında yer alır.

### D-031 — Gemini modeli ortam değişkeninden okunur, eksikse fail fast
- **Durum:** Aktif · **Git:** giriş 2026-09-15, son değişiklik 2026-10-03 · **Referans:** F-03; Ortak teknoloji
- **Karar:** Model adı `GEMINI_MODEL` ortam değişkeninden okunur; `.env.example` içindeki değer `gemini-3.5-flash-lite`. Aynı model transkripsiyon için de kullanılır (D-047); ayrı bir model değişkeni yoktur. Model adı kodda sabit yazılmaz ve kodda varsayılan model yoktur. `GEMINI_MODEL` (ve `GEMINI_API_KEY`) tanımlı değilse `app/llm/gemini_client.py` yüklenirken, yani uygulama başlangıcında, açık bir yapılandırma hatası verilir (D-035); sessizce varsayılan bir modele düşülmez.
- **Gerekçe:** Sınıflandırma için hızlı ve düşük maliyetli bir model yeterli; model kod değişikliği olmadan değiştirilebilir. Eksik yapılandırma istek sırasında değil başlangıçta fark edilir ve hangi modelin kullanıldığı her zaman açıktır.

### D-033 — Gemini çağrıları: 30 sn timeout, geçici hatalarda en fazla 3 deneme
- **Durum:** Aktif · **Git:** giriş 2026-09-15, son değişiklik 2026-10-07 · **Referans:** F-02, F-03
- **Karar:**
  - Her Gemini çağrısı için 30 saniye timeout; aynı istekle toplam en fazla 3 deneme. Politika sınıflandırma ve transkripsiyon (D-047) çağrılarına ayrı ayrı uygulanır; 4+ sayfalık PDF'te her grup çağrısı kendi 3 denemesine sahiptir.
  - Retry edilir: network hataları, timeout hataları, `429`, `5xx` ve geçersiz model çıktısı.
    - Sınıflandırmada structured output şemasına uymayan veya katalog dışı değer içeren yanıt geçici model hatası kabul edilir.
    - İstisna: `routing_evidence` hataları geçersiz çıktı sayılmaz; retry, `failed` veya `502` üretmez (D-050).
    - Transkripsiyonda boş yanıt geçersiz çıktı sayılır.
  - Retry edilmez: `400`, `401`, `403` gibi kalıcı istemci/yapılandırma hataları.
  - Bekleme: 1. başarısız denemeden sonra 1 saniye, 2. başarısız denemeden sonra 2 saniye.
  - **Sınıflandırma tamamlanamazsa** (kalıcı hata ya da 3 denemenin tamamı başarısız): belge `status = failed` kaydedilir, kullanıcıya genel bir hata mesajıyla `502` döner (D-034), teknik detaylar loglanır; ham Gemini/API hata detayları gösterilmez.
  - **Transkripsiyon tamamlanamazsa** hata yükseltilmez: belge Tesseract yedeğine düşer (D-047), `502` üretilmez.
  - Farklı bir Gemini modeline veya başka bir LLM'e fallback yoktur.
  - Retry politikası yalnızca `classification_service` içinde uygulanır (sınıflandırma ve transkripsiyon fonksiyonları orada). google-genai SDK'nın kendi retry'ı kapalıdır (`HttpRetryOptions(attempts=1)`), automatic function calling kapalıdır. Her deneme tam bir gerçek HTTP isteğidir; toplam 3'ü aşmaz. SDK sürümü yükseltilirse bu davranış yeniden doğrulanmalıdır.
  - Timeout SDK'ya `HttpOptions(timeout=30_000)` olarak verilir; birim milisaniyedir.
- **Gerekçe:** Geçici ağ/servis hatalarında ve tekrar denemede düzelebilecek geçersiz model çıktısında belge gereksiz yere `failed` olmaz; kalıcı hatalarda tekrar denemek yalnızca süreyi uzatır. Timeout ve kısa beklemeler senkron isteğin en kötü durum süresini sınırlar (her Gemini aşaması ~93 sn: 3 × 30 sn + 1 sn + 2 sn). Başka bir modele/LLM'e fallback MVP için gereksiz karmaşıklık getirir.

## Kataloglar

### D-011 — Kontrollü belge türü kataloğu
- **Durum:** Aktif · **Git:** giriş ve son değişiklik 2026-09-15 · **Referans:** F-03; `PROJECT_BRAIN.md` §6, `backend/app/config/document_types.json`
- **Karar:** Belge türleri `document_types.json` içinde tutulur. Başlangıç: `complaint`, `request`, `application`, `objection`, `information_request`, `other`.
- **Gerekçe:** Tutarlı, sorgulanabilir değerler; katalog kod değişmeden genişletilebilir.

### D-012 — Kurum kataloğu
- **Durum:** Aktif · **Git:** giriş ve son değişiklik 2026-09-15 · **Referans:** F-03; `PROJECT_BRAIN.md` §6, `backend/app/config/institutions.json`
- **Karar:** Kurumlar `institutions.json` içinde `id`, `name`, `description` alanlarıyla tutulur. `id` küçük harf, ASCII ve `snake_case`'tir. Başlangıç kataloğu 9 müdürlükten oluşur: Fen İşleri, Park ve Bahçeler, Temizlik İşleri, Zabıta, İmar ve Şehircilik, Sosyal Hizmetler, Kültür ve Sosyal İşler, Mali Hizmetler, Yazı İşleri (ID ve açıklamalar: `PROJECT_BRAIN.md` §6). MVP'de yönetim paneli ve veritabanından katalog yönetimi yoktur.
- **Gerekçe:** `description` modelin doğru birimi seçmesine yardım eder; dosya tabanlı katalog MVP için en basit çözüm; ASCII `snake_case` ID'ler veritabanında, kodda ve URL'lerde sorunsuz ve kararlıdır.

## Veri ve depolama

### D-013 — Tek `documents` tablosu
- **Durum:** Aktif · **Git:** giriş 2026-09-15, son değişiklik 2026-10-07 · **Referans:** `PROJECT_BRAIN.md` §8
- **Karar:** Başlangıçta yalnızca `documents` tablosu kullanılır. Alanlar: `id`, `file_name`, `file_type`, `file_reference`, `extracted_text`, `document_type`, `institution_id`, `needs_review`, `review_reason`, `summary`, `sender_name`, `sender_institution` (son üçü D-044), `validated_document_type`, `validated_institution_id`, `validated_at` (kullanıcı onayı, D-049), `routing_evidence` (D-050), `status`, `created_at`.
- **Gerekçe:** MVP akışı için yeterli; kataloglar dosyada olduğundan ek tabloya gerek yok.

### D-029 — `documents.id` UUID
- **Durum:** Aktif · **Git:** giriş ve son değişiklik 2026-09-15 · **Referans:** F-01; `PROJECT_BRAIN.md` §8
- **Karar:** `documents.id` UUID tipindedir; API yanıtında `document_id` olarak döner. Dosya adında kullanıldığı için (D-017) dosya kaydedilmeden önce uygulama tarafında üretilir.
- **Gerekçe:** Dışarıya açılan kimlik sıralı ve tahmin edilebilir değildir; başka sistemlerle entegrasyonda çakışma riski taşımaz.

### D-014 — `needs_review` veritabanında tutulur
- **Durum:** Aktif · **Git:** giriş ve son değişiklik 2026-09-15 · **Referans:** `PROJECT_BRAIN.md` §8
- **Karar:** `documents.needs_review` (boolean) saklanır.
- **Gerekçe:** İnsan incelemesi gereken belgeler filtrelenebilir; ileride inceleme akışının temeli.

### D-015 — `review_reason` veritabanında tutulur
- **Durum:** Aktif · **Git:** giriş ve son değişiklik 2026-09-15 · **Referans:** `PROJECT_BRAIN.md` §8
- **Karar:** `documents.review_reason` (nullable metin) saklanır.
- **Gerekçe:** İnceleyen kişi belgenin neden işaretlendiğini görür; prompt ve katalog iyileştirmesi için geri bildirim sağlar.

### D-016 — `status` veritabanında tutulur
- **Durum:** Aktif · **Git:** giriş 2026-09-15, son değişiklik 2026-09-24 · **Referans:** `PROJECT_BRAIN.md` §8
- **Karar:** `documents.status` saklanır. Kalıcı sonuç değerleri `classified`, `needs_review`, `failed`'dır. V1.4 ile ara durum `prepared` eklenir: metni çıkarılmış ama henüz sınıflandırılmamış belge (D-045, D-046). Değerler veritabanında CHECK/ENUM ile kısıtlanmaz; yalnızca uygulama kodu atar.
- **Gerekçe:** İşlem sonucu tek alanda sorgulanır; hatalı işlemler incelemeye düşenlerden ayrılır; yeni durumlarla genişletilebilir. Alan düz metin olduğu için yeni bir durum migration gerektirmez.

### D-017 — Orijinal belge `backend/storage/` altında saklanır
- **Durum:** Aktif · **Git:** giriş 2026-09-15, son değişiklik 2026-09-27 · **Referans:** F-01
- **Karar:** Yüklenen orijinal belge `backend/storage/` altında düz bir klasörde `<document_id>.<uzanti>` adıyla saklanır (uzantı `file_type` değeridir: `pdf`, `doc`, `docx`, `jpg`, `jpeg` veya `png`). PostgreSQL'e binary olarak yazılmaz; veritabanında dosyanın referansı `file_reference` alanında tutulur. Kullanıcının orijinal dosya adı yalnızca `file_name` alanında saklanır, disk yolu olarak kullanılmaz.
- **Gerekçe:** Belge sonradan incelenebilir ve yeniden işlenebilir (ör. OCR geldiğinde). Binary veriyi veritabanı dışında tutmak tabloyu küçük, yedeklemeyi ve sorguları hafif tutar. Kullanıcı girdisinin dosya yoluna girmemesi ad çakışmalarını ve path traversal riskini önler; kayıt ile dosya ID üzerinden birebir eşleşir.

### D-018 — Çıkarılan metin veritabanında saklanır
- **Durum:** Aktif · **Git:** giriş ve son değişiklik 2026-09-15 · **Referans:** F-02; `PROJECT_BRAIN.md` §8
- **Karar:** Belgeden çıkarılan metnin tamamı `documents.extracted_text` (TEXT) alanında saklanır.
- **Gerekçe:** İncelemede metin doğrudan görülür; yeniden sınıflandırma dosyayı tekrar işlemeden yapılabilir; ayrı tablo gerekmez.

## API ve mimari

### D-019 — Yazma endpoint'leri ve operasyonel `GET /health`
- **Durum:** Aktif (yalnız "kalıcı kayıtlar silinemez" hükmü 2026-10-22'de D-054 ile değişti: kalıcı kayıt yalnız `DELETE /api/documents/{document_id}` ile silinir; AI sonucunun değiştirilemezliği ve diğer hükümler geçerli) · **Git:** giriş 2026-09-15, son değişiklik 2026-10-06 · **Referans:** F-08; INV-5; D-054
- **Karar:**
  - Kayıt **oluşturan** iki endpoint vardır. İkisi de `multipart/form-data` içinde en fazla 50 MB'lık tek bir PDF, DOC, DOCX, JPG/JPEG veya PNG dosyası alır (D-001):
    - `POST /api/documents/classify` — legacy / tek-adımlı sınıflandırma: kabul, metin çıkarımı, Gemini sınıflandırması ve kayıt tek istekte yapılır. Geriye dönük uyumluluk için korunur.
    - `POST /api/documents/prepare` — V1.4 iki adımlı akışın ilk adımı; kaydı `prepared` olarak oluşturur, Gemini sınıflandırması çağırmaz (D-045; OCR gereken belgede yalnız transkripsiyon, D-047).
  - Yalnızca `prepared` kayda uygulanabilen iki geçiş vardır (D-046): `POST /api/documents/{document_id}/classify` (sınıflandırma sonucunu yazar) ve `DELETE /api/documents/{document_id}/prepared` (kaydı ve dosyasını siler).
  - Kalıcı kayıtlar (`classified`, `needs_review`, `failed`) silinemez ve AI sonucu değiştirilemez. Tek istisna `PUT /api/documents/{document_id}/validation`'dır: yalnız `classified` ve `needs_review` kayıtta kullanıcı onayı alanlarını yazar (D-049).
  - Kayıtları görüntülemeye yönelik salt okunur endpoint'ler D-043'te tanımlıdır. Bunlara ek olarak iş mantığı içermeyen operasyonel `GET /health` bulunur ve `{"status": "ok"}` döner. FastAPI'nin otomatik dokümantasyon sayfaları (`/docs`, `/openapi.json`) varsayılan haliyle açıktır.
- **Gerekçe:** Tek-adımlı endpoint mevcut entegrasyon sözleşmesi olarak kalır. İki adımlı akış, kullanıcının belgeyi analizden önce görebilmesini sağlar. Yazma yüzeyi `prepared` durumuyla sınırlı dar geçişlerle ve AI sonucundan ayrı tutulan kullanıcı onayıyla (D-049) sınırlıdır; kalıcı AI sonuçları değiştirilemez ve silinemez. Health check, uygulamanın ayakta olduğunun basitçe kontrol edilebilmesini sağlar.

### D-043 — Salt okunur kayıt endpoint'leri (V1.2)
- **Durum:** Aktif · **Git:** giriş 2026-09-18, son değişiklik 2026-10-06 · **Referans:** F-07, F-08
- **Karar:** Kayıtların görüntülenebilmesi için üç salt okunur endpoint eklenir:
  - `GET /api/documents` — kalıcı kayıtlar `created_at` azalan sırada; alanlar D-032'deki classify alanları + `created_at`. Henüz sınıflandırılmamış `prepared` kayıtlar listede yer almaz (V1.4, D-046).
  - `GET /api/documents/{document_id}` — aynı alanlar + `extracted_text`; `prepared` dahil her durumdaki kayıt ID ile okunabilir. Kayıt yoksa `404`.
  - `GET /api/documents/{document_id}/download` — orijinal dosya, kullanıcının yüklediği `file_name` ile ve `file_type`'a karşılık gelen media type ile döner; kayıt ya da fiziksel dosya yoksa ayrıntısız `404`.
  - `file_reference` ve storage yolu hiçbir yanıtta dönmez; indirilecek yol yalnızca veritabanındaki kayıttan türetilir ve storage klasörü dışına çıkan bir yol kabul edilmez.
  - Bu endpoint'lerde arama, filtre, sayfalama, silme, düzenleme ve authentication yoktur; kullanıcı onayı ayrı endpoint'tedir (D-049). Kayıtlar görünümündeki arama ve filtre istemci tarafındadır (D-048).
- **Gerekçe:** Sınıflandırma sonuçlarının ve orijinal belgenin görülebilmesi modülün ilk gerçek kullanım ihtiyacı. Endpoint'ler salt okunur olduğu için yeni tablo, migration veya yazma yüzeyi gerekmez; `file_reference`'ın gizli kalması iç depolama düzenini dışarı sızdırmaz.

### D-032 — Classify yanıt alanları
- **Durum:** Aktif · **Git:** giriş 2026-09-15, son değişiklik 2026-09-16 · **Referans:** F-08
- **Karar:** Başarılı yanıt en az `document_id`, `file_name`, `file_type`, `document_type`, `document_type_name`, `institution_id`, `institution_name`, `needs_review`, `review_reason`, `status` alanlarını içerir. `file_reference` ve `extracted_text` veritabanında saklanır ama bu endpoint'in yanıtında dönmez.
  - `document_type_name` ve `institution_name`, ID'ye karşılık gelen katalog `name` değerleridir; yanıt üretilirken backend'de zaten yüklü olan kataloglardan okunur, veritabanında saklanmaz.
  - `institution_id = null` ise `institution_name = null`. `failed` yanıtlarda (D-034) her iki ad alanı da `null`'dır.
  - ID alanlarının adı, anlamı ve davranışı değişmez; ad alanları yalnızca gösterim içindir.
- **Gerekçe:** `file_reference` iç depolama bilgisidir; `extracted_text` büyük olabilir ve sınıflandırma sonucunu kullanan istemcinin ihtiyacı değildir. Ad alanları sayesinde istemci Türkçe adları göstermek için katalogları kopyalamak zorunda kalmaz; kataloglar backend'de tek kaynak olarak kalır (D-012). Adlar ID'den türetilebildiği için veritabanına yazılmaz.

### D-034 — Kabul sonrası `failed` yanıtı ve HTTP durum kodları
- **Durum:** Aktif · **Git:** giriş 2026-09-15, son değişiklik 2026-10-03 · **Referans:** F-08; INV-6
- **Karar:**
  - Kabul edilmiş bir belge `failed` olduğunda kayıt ve storage dosyası saklanır; yanıt gövdesi D-032'deki alanları (`status = "failed"`, sınıflandırma alanları `null`, `needs_review = false`) ve genel bir `message` alanını içerir. HTTP kodu:
    - `422` → belge içeriği işlenemedi: metin çıkarılamadı veya yeterli metin yok.
    - `502` → Gemini ile sınıflandırma tamamlanamadı: geçici hata veya geçersiz çıktı nedeniyle 3 deneme tükendi ya da retry edilmeyen bir hata (ör. `400`/`401`/`403` ya da Gemini aşamasında beklenmeyen bir hata) oluştu.
  - Kabul sonrası dosya storage'a ya da kayıt veritabanına yazılamazsa (ör. disk hatası, veritabanı bağlantı/commit hatası) `failed` kaydı da oluşmaz: veritabanı işlemi geri alınır, bu isteğin storage dosyası (yarım yazılmışsa da) silinir ve ayrıntısız `500` (`Internal Server Error`) döner.
  - Diğer yanıtlar: başarılı sınıflandırma `200` (D-032; `status` `classified` veya `needs_review`). Kabul öncesi redlerde kayıt ve dosya oluşmaz (D-004): `413` (D-028) ve `415` (D-001) genel mesajlı `{"detail": "..."}` gövdesiyle, istek doğrulanamazsa (ör. `file` alanı yok) FastAPI'nin standart `422` gövdesiyle (`{"detail": [...]}`) döner. İki `422`, gövdedeki `status` alanıyla ayırt edilir.
  - Bu kodlar legacy `POST /api/documents/classify` içindir. V1.4 `POST /api/documents/prepare` aynı kabul redlerini (`413`, `415`, doğrulama `422`), metin yetersizliğinde `failed` + `422` davranışını ve `500` davranışını kullanır. Gemini sınıflandırması çağırmadığı için `502` üretmez; OCR gereken belgedeki transkripsiyon hatası da `502`'ye değil Tesseract yedeğine gider (D-047). `POST /api/documents/{document_id}/classify` ve `DELETE /api/documents/{document_id}/prepared` kodları D-046'dadır.
  - Endpoint bunların dışında HTTP kodu üretmez; çerçevenin standart yanıtları (ör. çok parçalı gövde ayrıştırılamazsa `400`, yanlış HTTP metodu için `405`) endpoint çalışmadan döner. Hatanın ayrıntılı nedeni yalnızca loglanır; iç hata ayrıntısı (exception, stack trace, Gemini/kütüphane mesajı) yanıta girmez.
- **Gerekçe:** Dışarıdan hata ayrımı basit kalır: sorun belgede mi yoksa sınıflandırma servisinde mi, HTTP kodundan anlaşılır. İstemci `failed` kaydının kimliğini alır; teknik hata detayları yanıta girmez. `500` bilinçli bir hata sınıfı değildir; kaydın yazılamadığı beklenmeyen durumda yarım kayıt veya yetim dosya bırakılmaz.

### D-044 — Özet ve gönderen bilgisi aynı Gemini çağrısında (V1.2)
- **Durum:** Aktif · **Git:** giriş 2026-09-18, son değişiklik 2026-10-03 · **Referans:** F-03
- **Karar:**
  - Sınıflandırma çıktısına üç alan eklenir: `summary` (belgenin amacını ve konusunu anlatan 1-3 kısa Türkçe cümle, her zaman dolu), `sender_name` ve `sender_institution` (yalnızca belgede açıkça yazıyorsa dolu, aksi hâlde `null`).
  - Bu alanlar **mevcut sınıflandırma çağrısından** gelir (D-008); özet veya gönderen için ayrı bir LLM çağrısı, ayrı bir çıkarım adımı, agent veya RAG eklenmez. Retry/timeout politikası (D-033) değişmez.
  - Model tahmin etmez: gönderen kişi/kurum açıkça yazmıyorsa `null` verir. Belgenin muhatabı olan belediye/müdürlük gönderen kurum sayılmaz.
  - Boş veya yalnızca boşluktan oluşan `summary` geçersiz model çıktısıdır ve D-033'e göre retry edilir.
  - `documents` tablosuna üç nullable TEXT kolonu eklenir (`summary`, `sender_name`, `sender_institution`); migration `cedf33674167`. Nullable olmaları migration öncesi kayıtlarla uyum içindir. `failed` kayıtlarda üçü de `null` kalır.
  - Alanlar classify yanıtına ve D-043'teki liste/detay yanıtlarına eklenir.
- **Gerekçe:** Kayıt listesinde belgenin ne hakkında olduğunu ve kimden geldiğini görmek, sınıflandırma sonucunun tek başına vermediği ilk pratik ihtiyaç. Aynı çağrıda üretildikleri için ek gecikme ve maliyet doğmaz. Uydurma isim/kurum yanlış yönlendirir; bu yüzden belirsizlikte boş bırakmak zorunludur.

### D-045 — Hazırla → önizle → sınıflandır akışı (V1.4)
- **Durum:** Aktif · **Git:** giriş 2026-09-24, son değişiklik 2026-10-06 · **Referans:** F-05
- **Karar:**
  - V1.4 arayüzü bir belgeyi iki adımda işler:
    1. `POST /api/documents/prepare` dosyayı kabul eder (D-001, D-028), storage'a yazar ve metni çıkarır (OCR gereken belgede Gemini transkripsiyonu, gerekirse Tesseract yedeği; D-047); kayıt `status = prepared` olur.
    2. Kullanıcı önizleyip onaylarsa `POST /api/documents/{document_id}/classify`, kayıttaki `extracted_text` ile tek bir Gemini sınıflandırma çağrısı yapar (D-008, D-033).
  - Aynı dosya için metin çıkarımı/transkripsiyon/OCR yalnızca bir kez yapılır; sınıflandırma adımı dosyayı yeniden okumaz.
  - V1.4 frontend prepare → preview → classify akışında Gemini sınıflandırması yalnız kullanıcı önizlemesi ve onayından sonra çağrılır. OCR gereken belgelerde prepare aşamasında yalnız transkripsiyon çağrısı yapılır (D-047). Mevcut `POST /api/documents/classify` geriye dönük uyumluluk için korunur ve tek-adımlı doğrudan sınıflandırma davranışını sürdürür. Yeni frontend bu legacy akışı kullanmaz.
  - Prepare'de kabul redleri ve metin yetersizliği bugünkü sözleşmeyle aynıdır: `413`/`415`'te kayıt ve dosya oluşmaz; metin yetersizse `failed` kaydı + `422` döner (D-004, D-034). Başarılı prepare yanıtı, `GET /api/documents/{document_id}` detay yanıtıyla aynı şekildedir (`status = prepared`, `extracted_text` dahil, `file_reference` yok); yeni yanıt şeması eklenmez.
  - Arayüz:
    - Çoklu seçim ve sürükle-bırak; listede en fazla 5 dosya (D-040).
    - Her dosyada ad, format, boyut, önizleme, kaldırma ve analiz seçimi.
    - Analizi biten satırda belge türü ve kurum (effective değer; onaylıysa "Onaylandı" rozeti — D-049) kısa bir satırda görünür; satır düğmesi "Sonucu Gör" olur ve panel sonuç kartıyla başlar. Masaüstünde analiz düğmesi ekranın altında sabit kalır.
    - Sonuç kartı: "Analiz tamamlandı" başlığı ve dosya adı; birincil belge türü ve hedef kurum (effective değer — D-049); onay kontrolleri (D-049); AI özeti; orijinal belgeyi görme/indirme. Onaysız `needs_review`'da "Kontrol Öneriliyor" ve kontrol nedeni gösterilir; onaylı sonuçta "Onaylandı" rozeti görünür, kontrol nedeni uyarı olarak gösterilmez. Anlamsal kalite kapısı olmadığından kesinlik ya da doğruluk iddiası taşıyan ifade kullanılmaz. Analizden sonra önizleme formu ve çıkarılan metin varsayılan kapalı bir bölüme iner.
    - Önizleme içerik merkezlidir. Varsayılan görünüm, çıkarılan metinden tarayıcıda deterministik olarak oluşturulan yapılandırılmış "Belge Önizlemesi" formudur: dosya adı, hitap/başlık, konu, tarih, evrak no, gönderen, gönderen kurum ve belge içeriği. Açıkça bulunamayan alan boş (`—`) kalır; tahmin edilmez. Önizleme alanları saklanmaz; yeni endpoint veya DB alanı eklenmez.
    - Orijinal belge (PDF ve JPG/JPEG/PNG) ile ham çıkarılan metin yardımcı görünümlerdir. Orijinal belge kullanıcının tarayıcısındaki dosyadan ayrı bir pencerede gösterilir ve yalnızca backend imza doğrulamasından geçmiş dosyalarda açılır; sunucuda ayrı bir önizleme endpoint'i yoktur.
    - DOC/DOCX'te yapılandırılmış önizleme ve çıkarılan metin gösterilir; Word render'ı, dönüştürücü veya yeni bağımlılık eklenmez.
  - İşleme sıralıdır: istemci aynı anda tek bir prepare veya classify isteği gönderir. Worker, kuyruk veya paralel işleme yoktur (D-020). Bir dosyanın hatası diğerlerinin işlenmesini durdurmaz.
- **Gerekçe:** Kullanıcı analize gönderdiği belgenin doğru belge olduğunu Gemini sınıflandırması çalışmadan önce görebilmelidir. Önizleme için ayrı bir yükleme veya ikinci bir OCR, süreyi uzatır ve önizlenen metinle sınıflandırılan metnin ayrışmasına yol açabilir. Mevcut `documents` tablosu ve düz metin `status` alanı ara durumu migration gerektirmeden taşıyabilir. Tek-adımlı endpoint, mevcut entegrasyonları bozmamak için korunur. Büyük bir PDF/görüntü görüntüleyicisi yerine okunur bir form, belgenin doğru olup olmadığını daha hızlı gösterir ve DOC/DOCX'te de aynı biçimde çalışır. Tarayıcı dosyanın baytlarına zaten sahip olduğundan orijinal belge için sunucuda yeni bir dosya sunma yüzeyi açılmaz.

### D-046 — `prepared` kayıt yaşam döngüsü (V1.4)
- **Durum:** Aktif (gerekçedeki "kalıcı kayıtları silmek kapsam dışıdır" ifadesi 2026-10-22'de D-054 ile değişti; `DELETE /{document_id}/prepared` ve temizlik kalıcı kayda dokunmamaya devam eder, diğer hükümler geçerli) · **Git:** giriş 2026-09-24, son değişiklik 2026-10-03 · **Referans:** F-05; INV-5; D-054
- **Karar:**
  - **Tutulduğu yer:** `prepared` kayıt `documents` tablosunda tutulur; ayrı tablo, staging alanı veya migration yoktur. Sınıflandırma alanları `null`, `created_at` hazırlık anıdır. Kayıt `GET /api/documents` listesinde görünmez (D-043); detay ve indirme ID ile çalışır.
  - **Yedek OCR işareti:** `prepared` kayıtta `needs_review = false`'tur. Tek istisna, metni Tesseract yedeğiyle çıkarılan belgedir (D-047): `needs_review = true` ve `review_reason` yedek OCR gerekçesini taşır. Sınıflandırma bu işareti korur, sonuç `needs_review` olur ve model gerekçesi varsa yedek OCR gerekçesine eklenir. Sınıflandırma başarısız olursa işaret temizlenir (D-004).
  - **Sınıflandırma (`POST /api/documents/{document_id}/classify`):** Yalnızca `prepared` durumdaki ve orijinal dosyası storage'da mevcut olan kayıtta çalışır.
    - Kayıt yoksa `404`.
    - Kayıt `prepared` değilse ya da orijinal dosya storage'da yoksa `409` döner; Gemini ve metin çıkarımı çağrılmaz, kayıt değişmez. Böylece orijinali indirilemeyen bir sonuç kaydı oluşmaz. Storage yolu yanıtta ve logda yer almaz.
    - Gemini hatasında kayıt `failed` olur ve `502` döner (D-034).
    - Kayıt yazılamazsa `500` döner; kayıt `prepared` kalır ve dosya silinmez.
  - **409 sonrası kurtarma:** İstemci sınıflandırma isteğine `409` alırsa (ör. istemci zaman aşımına uğradı ama backend işlemi tamamladı) mevcut `GET /api/documents/{document_id}` ile kaydın gerçek durumunu okur. İkinci bir Gemini çağrısı yapılmaz.
  - **Kaldırma (`DELETE /api/documents/{document_id}/prepared`):** Kullanıcının "Kaldır" işlemidir ve yalnızca `prepared` kaydı siler.
    - Önce storage dosyası silinir (dosya zaten yoksa da güvenlidir), sonra kayıt; başarıda `204`.
    - Kayıt yoksa `404`. Kayıt `classified`, `needs_review` veya `failed` ise `409` döner ve hiçbir şeye dokunulmaz.
    - Silme yarıda kalırsa `500` döner; kayıt `prepared` kalır ve işlem tekrar denenebilir.
  - **Yedek temizlik (TTL):** `created_at` değeri 24 saatten eski `prepared` kayıtlar, bir sonraki `POST /api/documents/prepare` çağrısının başında dosyalarıyla birlikte silinir.
    - Zamanlayıcı, cron, worker veya arka plan işi yoktur; yeni bir prepare çağrısı gelmezse kayıt yerinde kalır.
    - Dosyası silinemeyen kayıt atlanır ve bir sonraki temizlikte yeniden denenir.
    - Temizlik hatası prepare isteğini düşürmez.
  - **Kapsam dışı:** Terminal kayıtlar (`classified`, `needs_review`, `failed`) ne bu temizliğin ne de `DELETE` endpoint'inin kapsamındadır.
- **Gerekçe:** Yanlışlıkla yüklenen dosya, kullanıcı kaldırdığında hemen ve tamamen silinmelidir; tekrarlanan "hazırla + kaldır" döngüleri sunucuda birikmemelidir. Sekme kapanması, ağ kopması veya tarayıcı çökmesi gibi anormal çıkışlarda kalan kayıtları zamanlayıcı kurmadan sınırlamanın en basit yolu, temizliği hazırlık isteğinde yapmaktır. Dosyanın kayıttan önce silinmesi, yarım kalan her işlemde geride TTL'in bulabileceği bir kayıt bırakır; ters sırada kaydı olmayan ve hiçbir temizliğin göremeyeceği bir dosya kalabilirdi. Silme endpoint'i dar tutulur: kalıcı kayıtları silmek kapsam dışıdır. Orijinal dosya kontrolü, indirilemeyen bir belgenin sınıflandırılmış kayıt olarak kalıcılaşmasını önler.

### D-049 — Human Validation + Routing Correction: kullanıcı onayı AI sonucundan ayrı tutulur
- **Durum:** Aktif · **Git:** giriş ve son değişiklik 2026-10-06 · **Referans:** F-06; INV-3
- **Karar:**
  - **Veri:** `documents` tablosunda 3 nullable kolon: `validated_document_type`, `validated_institution_id`, `validated_at`. AI alanları (`document_type`, `institution_id`) üzerine yazılmaz.
    - `validated_at` doluysa `validated_document_type` da doludur; tersi de geçerlidir. `validated_institution_id` `null` olabilir.
    - Bu kural DB CHECK ile değil, tek yazma yolu olan onay endpoint'inde korunur: üç alan birlikte yazılır.
    - Mevcut kayıtlar onaysızdır (`null`); veri taşıma yoktur. Onaylayan kişi ve onay geçmişi tutulmaz.
  - **Effective yönlendirme:** `validated_at` doluysa onaylanan çift, değilse AI çifti (`document_type`, `institution_id`) geçerlidir.
  - **`PUT /api/documents/{document_id}/validation`** — gövde `{"document_type": "<katalog id>", "institution_id": "<katalog id>" | null}`:
    - İki alan zorunludur; ek alan kabul edilmez. İzinli ID'ler kataloglardan üretilir (D-009). Katalog dışı, eksik ya da fazla alan FastAPI'nin standart `422` gövdesini döndürür.
    - Kayıt yoksa `404`. Yalnız `classified` ve `needs_review` kayıtlar onaylanır; `prepared` ve `failed` kayıtta `409` döner, kayıt değişmez.
    - Başarıda `200` ve liste öğesi biçimi (`DocumentSummary`). Yalnız üç onay alanı yazılır; `validated_at` sunucu zamanıdır (UTC).
    - AI sonucu, `needs_review`, `review_reason`, `status`, `summary` ve gönderen alanları değişmez; Gemini çağrılmaz.
    - Tekrar onay serbesttir; son onay geçerlidir.
  - **Yanıt alanları:** Classify, prepare, liste, detay ve onay yanıtları `validated_document_type`, `validated_document_type_name`, `validated_institution_id`, `validated_institution_name` ve `validated_at` alanlarını da içerir; onaysız kayıtta `null`. Adlar D-032'deki gibi katalogdan çözülür, saklanmaz.
  - **`GET /api/catalogs`:** Salt okunur. Belge türü ve kurum kataloglarını (`id`, `name`) katalog dosyasındaki sırayla döndürür; kurum açıklaması dönmez. Kaynak, sınıflandırmanın kullandığı bellekteki kataloglardır (D-012). Frontend katalog kopyası tutmaz; katalog yönetimi yoktur.
  - **Arayüz:** Onay ve düzeltme sonuç kartında ve Kayıtlar detayında aynı bileşenle yapılır; yeni sayfa ya da modal yoktur.
    - Onaysız kayıtta "Sonucu Onayla" (AI değerlerini gönderir) ve "Düzelt"; "Düzelt" kart/detay içinde tür ve kurum seçimlerini açar ("Kaydet ve Onayla", "Vazgeç"). Kurumda "Belirlenemedi" `null` gönderir. Onaylı kayıtta "Onaylandı" rozeti ve "Son onay" zamanı görünür; "Düzelt" tekrar kullanılabilir.
    - Katalog yalnız "Düzelt" ilk açıldığında istenir ve sayfa açık kaldıkça yeniden kullanılır; başarısız istek sonraki denemede tekrarlanır.
    - Effective değer (`effectiveRouting`) sonuç kartında, analiz satırı özetinde, Kayıtlar listesi/detayında ve tür/kurum filtrelerinde aynıdır. AI önerisi yalnız değeri onaylanandan farklı olan alanda ikincil satırda gösterilir.
    - Onaylı kayıtta aktif inceleme uyarısı kalkar; AI inceleme nedeni yalnız Kayıtlar detayında soluk not olarak kalır.
    - "İnceleme Gereken" sayısı yalnız onaylanmamış `needs_review` kayıtlarını sayar. Kayıtlar'daki Durum ve Durum filtresi yalnız arayüzde türetilen bir gösterimdir (`recordDisplayState`): `failed` → Başarısız, onaylı → Onaylandı, `needs_review` → İnceleme gerekli, `classified` → Sınıflandırıldı. Bu bir business status değildir; DB'ye yazılmaz.
    - Onay yanıtı yalnız ilgili kaydı yerelde günceller; aynı belge analiz listesinde de açıksa orada da güncellenir. Liste yeniden istenmez.
    - Onay hatalarında (404, 409, 422, ağ, zaman aşımı) kısa Türkçe mesaj gösterilir; FastAPI'nin 422 ayrıntısı gösterilmez, formdaki seçimler korunur.
  - **Kapsam dışı:** Authentication/RBAC, onaylayan kişinin kaydı, onay geçmişi veya ek tablo, workflow, SLA, business status, toplu onay, onayı geri alma.
- **Gerekçe:** Kullanıcı düzeltmesi AI çıktısını silmez; iki sonuç karşılaştırılabildiği için AI doğruluğu ölçülebilir kalır. Tek tablo kuralı (D-013) korunur; nullable kolonlar mevcut kayıtları ve API sözleşmesini bozmaz. Authentication olmadığından (D-025) onaylayan kişi bilinemez; geçmiş tutmak MVP için gereksiz karmaşıklıktır. `needs_review` ve `status`, AI işleme sonucunun kaydı olarak kalır (D-014, D-016).

### D-050 — Evidence-backed Routing: kaynakta birebir doğrulanmış "belgedeki ilgili ifade"
- **Durum:** Aktif (yalnız "`supports` arayüzde öğe bazında gösterilmez" hükmü 2026-10-21'de D-052 ile değişti; diğer hükümler geçerli) · **Git:** giriş ve son değişiklik 2026-10-07 · **Referans:** F-04; INV-4; D-052
- **Kısıt:** Prompt v4 sabittir (frozen); gerekmedikçe değiştirilmez.
- **Karar:**
  - **Aynı çağrı:** Evidence mevcut sınıflandırma çağrısında üretilir (D-008). Ayrı Gemini çağrısı, ayrı çıkarım adımı, agent veya RAG yoktur.
  - **Model output:** `routing_evidence: [{"quote": "...", "supports": "document_type" | "institution" | "both"}]`; boş liste geçerlidir. Alan şemadaki son alandır; sınıflandırma alanları evidence'tan önce üretilir.
    - Prompt, belge türü veya hedef kurum açısından ayırt edici, belgeden birebir ve kesintisiz alınmış en fazla 2 ifade ister: tercihen en fazla 200, hiçbir zaman 300 karakterden uzun değil. Yeniden yazma, düzeltme, özetleme, "..." ile kısaltma ve farklı bölümleri birleştirme yasaktır. Selamlama, imza, tarih, standart kapanış ve tek başına anlam taşımayan genel ifadeler istenmez. Ayırt edici ifade yoksa boş liste beklenir.
    - Evidence açıklama, gerekçe veya akıl yürütme değildir; yalnız kaynaktan alıntıdır.
  - **Evidence sınıflandırmanın başarısını belirlemez:** Eksik, `null`, yanlış tipli veya bozuk `routing_evidence` ve geçersiz öğeler, nested doğrulamadan önce model düzeyinde ayıklanır; sonuç boş listedir. Bu durum retry, `failed` veya `502` üretmez (D-009 ve D-033 istisnası). Sınıflandırma alanlarının doğrulaması değişmez.
  - **Kaynakta birebir doğrulama:** Modelin önerdiği ifade güvenilir kabul edilmez; backend doğrular, yalnız doğrulananlar kalır.
    - Kaynak penceresi modelin gördüğü metindir: `extracted_text[:50_000]` (D-027).
    - Kaynağa ve ifadeye Unicode NFC ve mevcut whitespace normalizasyonu uygulanır. İfadeden yalnız tek bir eşleşen dış tırnak çifti silinebilir.
    - Boş ifade ve 300 karakteri aşan ifade atılır. Eşleşme büyük/küçük harfe duyarlı, birebir substring'dir.
    - Yasak: lowercase/casefold, Türkçe karakter katlama (ş→s, ı→i), ASCII katlama, fuzzy eşleşme, edit distance, embedding, RAG ve yeni LLM çağrısı.
    - Adaylar sırayla doğrulanır; ilk 2 geçerli ifadede durulur. Daha önce doğrulanmış bir ifadeyle aynı normalize ifade atılır.
    - `institution_id` `null` iken `supports` değeri `institution` veya `both` olan ifade atılır.
    - Backend anlamsal filtre veya boilerplate kara listesi uygulamaz; genel ifadelerden kaçınmak prompt'un sorumluluğudur.
    - İfade metni belge metnidir ve loglanmaz; yalnız aday ve doğrulanan sayıları loglanır.
  - **`needs_review`, `review_reason`, `status`:** Evidence bunları değiştirmez ve güven skoru değildir. Evidence bulunmaması tek başına `needs_review` sebebi değildir.
  - **Persistence:** `documents.routing_evidence` nullable kolon, SQLAlchemy generic `JSON` (PostgreSQL'e özgü JSONB değil); migration `5ed883607e08`. Ayrı tablo, ifade başına kolon, server default, index, constraint ve backfill yoktur.
    - `NULL`: evidence hiç üretilmedi (eski kayıt, `prepared` veya `failed`).
    - `[]`: sınıflandırma başarıyla çalıştı, doğrulanan ifade yok.
    - `[{"quote", "supports"}, ...]`: yalnız backend birebir doğrulamasından geçmiş ifadeler.
    - Değer yalnız başarılı sınıflandırmada yazılır (D-045 akışında `/{id}/classify`, legacy classify). Onay endpoint'i (D-049) bu alana yazmaz.
  - **API:** Classify (legacy ve `/{id}/classify`), prepare, liste, detay ve onay yanıtları `routing_evidence: [{"quote", "supports"}] | null` alanını içerir; `prepared`, `failed` ve eski kayıtlarda `null`. Ayrı evidence endpoint'i yoktur; `GET /api/catalogs` değişmez.
  - **Human Validation (D-049):** Evidence AI önerisine aittir; kullanıcı düzenlemez, onay endpoint'i değiştirmez. Arayüz bölüm düzeyinde davranır: AI belge türü ve kurumu kullanıcı tarafından değiştirilmediyse yalnız "Belgedeki ilgili ifade" başlığı görünür; ikisinden biri değiştirildiyse başlık aynı kalır ve küçük ikincil "AI önerisinin dayanağı" etiketi eklenir. `supports` saklanır ama arayüzde öğe bazında gösterilmez.
  - **Arayüz:** Başlık "Belgedeki ilgili ifade"; "Kanıt", "Gerekçe" gibi akıl yürütme çağrıştıran adlar kullanılmaz. Evidence yoksa bölüm görünmez. Sonuç kartında `ValidationControls` altında ve AI Özeti üstünde, Kayıtlar detayında da gösterilir. Yeni sayfa, modal veya liste kolonu yoktur. OCR kaynağına özel not yoktur.
  - **Kapsam dışı:** Ayrı çıkarım çağrısı, RAG, vector DB, agent, güven skoru, evidence düzenleme veya kullanıcı tarafından evidence ekleme, hukuki değerlendirme, açıklama üretimi, tekrar tespiti, workflow/SLA, Structured Operational Extraction.
- **Gerekçe:** Kullanıcı yönlendirme sonucunu belgenin kendi ifadesiyle hızlıca kontrol eder. Aynı çağrı ek gecikme ve maliyet getirmez (D-044 emsali). Birebir doğrulama, modelin uydurduğu veya değiştirdiği bir ifadenin belge ifadesi gibi gösterilmesini önler; uyuşmazlığın bedeli yalnız evidence kaybıdır. Toleranslı doğrulama, ikincil bir alanın sınıflandırma güvenilirliğini düşürmesini engeller.

### D-052 — Belgedeki ilgili ifadenin başlığı `supports`'tan gelir
- **Durum:** Aktif · **Tarih:** 2026-10-21 · **Referans:** F-04; D-050'nin `supports` gösterim hükmüne dar istisna
- **Karar:**
  - Her doğrulanmış ifadenin üstünde küçük bir başlık gösterilir. Başlık yalnız backend'in döndürdüğü `supports` değerinden çevrilir: `document_type` → "Belge türüne dayanak", `institution` → "Hedef kuruma dayanak", `both` → "Belge türü ve hedef kuruma dayanak". Tanımsız bir değer nötr "İlgili ifade" başlığına düşer.
  - Ham `supports` değeri kullanıcıya gösterilmez. Başlık ifade sırasından veya ifade metninden tahmin edilmez; yeni AI çıkarımı yoktur.
  - Kullanıcı AI belge türünü veya kurumunu düzeltse de başlıklar değişmez; bağlamı bölüm düzeyindeki "AI önerisinin dayanağı" notu verir (D-050).
  - D-050'nin diğer hükümleri (aynı çağrı, kaynakta birebir doğrulama, persistence, API, bölüm başlığı ve yeri, kapsam dışı öğeler) değişmeden geçerlidir. Backend, API ve DB değişmez.
- **Gerekçe:** İki ifade gösterildiğinde kullanıcı hangisinin belge türüne, hangisinin hedef kuruma ilişkin olduğunu ayırt edemiyordu (manuel test geri bildirimi). `supports` kapalı bir enum'dur; şema tanımsız değeri atar ve backend kurum `null` iken yalnız `document_type` kabul eder, bu yüzden başlık eşlemesi deterministiktir. İfadenin neyi desteklediği modelin önerisidir; başlıklar bu yüzden AI önerisinin parçası olan bölümde, "dayanak" diliyle gösterilir.

### D-053 — Sınıflandırması başarısız olan belgenin tekrar denenmesi
- **Durum:** Aktif · **Tarih:** 2026-10-22 · **Referans:** F-09, F-08; D-004, D-034, D-045, D-046, D-047; INV-5
- **Karar:**
  - **Metin kaynağı kalıcıdır:** `documents.ocr_fallback` nullable boolean; migration `261a2937eb7c`, backfill/default/index/constraint yok. Metin çıkarımı başarılıysa yazılır: `true` Tesseract yedeği (D-047), `false` dijital metin veya Gemini transkripsiyonu. `NULL`: çıkarım tamamlanmadı (422) ya da kayıt bu alandan önce oluştu. Sınıflandırma hatası `needs_review`/`review_reason`'ı temizlemeye devam eder (D-004, D-046); bilgi yalnız bu kolonda kalır.
  - **Tek uygunluk kuralı:** Kayıt tekrar denenebilir ⇔ `status = failed` ∧ `ocr_fallback` dolu ∧ kayıttaki metin ≥ 10 karakter (D-026). Kural backend'de tek fonksiyondadır; yanıtlar bunu `retryable: bool` olarak taşır (classify, prepare, liste, detay, onay ve failed gövdeleri). Metin kaynağı bilinmeyen eski kayıtlar tahminle uygun sayılmaz.
  - **Ayrı endpoint:** `POST /api/documents/{document_id}/retry-classification`. `/{id}/classify` değişmez; failed kayda `409` vermeye devam eder (D-046 kurtarma sözleşmesi).
    - Kayıt `SELECT … FOR UPDATE NOWAIT` ile okunur; kilit Gemini cevabı ve commit/rollback'e kadar tutulur. Kilit alınamazsa (`55P03`) rollback + `409`; Gemini çağrılmaz. Uygunluk kilit altında kontrol edilir.
    - Uygun değilse `409` (`classified`/`needs_review`: "zaten işlenmiş"; diğerleri: "yeniden sınıflandırılamaz"); orijinal dosya yoksa `409`. Hepsinde Gemini çağrılmaz, kayıt değişmez.
    - Uygunsa yedek OCR işareti `ocr_fallback`'ten yalnız bellekte kurulur ve mevcut `_classify_into` çalışır: tek Gemini çağrısı (D-033), metin çıkarımı/OCR tekrar çalışmaz, aynı kayıt ID'si, dosya ve metin kullanılır.
    - Başarıda `200` ve commit. Gemini yine başarısızsa hiçbir alan yazılmaz (rollback), `502` ve kayıt önceki failed hâliyle kalır. Commit hatasında rollback + `500`; diğer veritabanı hataları da `500`. Teknik ayrıntı dönmez (INV-6).
    - Kayıt hiçbir durumda `prepared`'a çekilmez: prepared TTL temizliği kalıcı kayda dokunmamalıdır (INV-5). Yeni ara durum, kuyruk, worker ve otomatik retry yoktur.
  - **Arayüz:** "Tekrar Dene" yalnız `retryable` kayıtta görünür: analiz listesinde failed satırda ve Kayıtlar'da failed kayıt detayında. İstek sıralı çalıştırıcıdan geçer; analiz sürerken Kayıtlar'daki düğme kilitlidir (D-045). `409`'da kaydın güncel durumu detay endpoint'inden okunur; mesajlar frontend'in genel Türkçe metinleridir. Kayıtlar'da başarılı sonuç analiz listesine de yansır.
- **Gerekçe:** Geçici Gemini hatasında kullanıcı belgeyi yeniden yüklemek zorunda kalıyordu; metin, dosya ve kayıt zaten saklıydı. Tek `failed` durumu çıkarım ve sınıflandırma hatalarını ayırmadığı ve sınıflandırma hatası yedek OCR işaretini sildiği için, kalıcı bir metin kaynağı alanı olmadan yapılan retry taranmış belgeyi incelemesiz sınıflandırabilirdi (D-047 ihlali). Satır kilidi, eşzamanlı iki isteğin hem çift Gemini çağrısını hem de "failed ama sonuç dolu" tutarsız kaydı önler; kilit tek belge satırındadır ve NOWAIT ile bekleyen istek birikmez. Bilinen sınırlar: kilit yalnız PostgreSQL'de çalışır (SQLite testleri sınamaz; gerçek PostgreSQL'de doğrulandı) ve migration öncesi failed kayıtlar yeniden yüklenmelidir.

### D-054 — Kayıtlar'dan kalıcı belge silme
- **Durum:** Aktif · **Tarih:** 2026-10-22 · **Referans:** F-10, F-07, F-08; INV-5; ADR-001; D-019, D-025, D-046, D-049, D-053; T-15, T-17
- **Karar:**
  - **Kapsam:** Kalıcı kayıtlar (`classified`, `needs_review`, `failed`; kullanıcı onaylı olanlar dahil) Kayıtlar detayından silinebilir. `prepared` kayıt bu yolla silinmez; Kaldır ve 24 saatlik temizlik D-046'daki gibi kalır.
  - **Fiziksel silme:** Kayıt (AI sonucu, onay alanları, evidence ve çıkarılan metin dahil) ve orijinal storage dosyası silinir. Soft delete, arşiv, çöp kutusu, geri alma ve silme geçmişi yoktur. Tek iz, uygulamanın belge ID'sini içeren log satırıdır; uygulama logları dosya adı, belge metni ve storage yolu içermez (INV-6). Beklenmeyen bir hatada (ör. dosya silinemezse) sunucunun traceback'i storage yolunu (`<document_id>.<uzantı>`) içerebilir; bu yalnız sunucu logundadır, yanıta girmez ve diğer endpoint'lerin beklenmeyen hata davranışıyla aynıdır. Alınmış veritabanı ve storage yedekleri bu silmenin kapsamında değildir.
  - **`DELETE /api/documents/{document_id}`:**
    - Kayıt `SELECT … FOR UPDATE NOWAIT` ile okunur; D-053'teki kilit yardımcısı ortak kullanılır. Kilit alınamazsa (`55P03`) rollback ve `409`; hiçbir şeye dokunulmaz. Diğer veritabanı hataları `500`.
    - Kayıt yoksa `404`; geçersiz ID'de FastAPI'nin standart `422` gövdesi. Kayıt `prepared` ise `409`; kayıt ve dosya değişmez.
    - Sıra: önce storage dosyası silinir (dosya yoksa ya da yol storage dışına çıkıyorsa bu adım atlanır), sonra kayıt; ardından commit. Başarıda `204`, gövde yoktur.
    - Dosya silinemezse rollback ve `500`; kayıt ve dosya yerinde kalır. Teknik ayrıntı yanıta girmez (D-034).
  - **Dosya silme ve commit atomik değildir:** İkisi tek bir atomik işlem olarak yapılamaz. Dosya silindikten sonra commit başarısız olursa ya da süreç kesilirse kayıt kalır, dosya kalmaz. Bu ara durum görünürdür (indirme `404`, tekrar deneme `409`) ve aynı silme isteği tekrarlandığında tamamlanır. Ters sıra (önce commit, sonra dosya) seçilmedi: dosya silinemezse kaydı olmayan ve hiçbir yüzeyin göremediği bir dosya kalırdı (ADR-001).
  - **Eşzamanlılık:** Her çakışma ayrı değerlendirilir; bir çakışma için kabul edilen sınır diğerlerini kapsamaz.
    - Retry (D-053) ile: ikisi aynı satır kilidini kullanır. Kilidi tutan işlem sürerken diğeri `409` alır; silme tamamlandıktan sonra retry `404` alır.
    - Onay (D-049) satır kilidi kullanmaz. Onay ile silme aynı anda gelirse onay isteği hata (`500`) alabilir; gerçek PostgreSQL'de onay silmenin commit'ini bekler, sonra `500` alır (2026-10-22). Bu, yerel MVP için kabul edilen sınırdır ve yalnız onay–silme çakışmasına aittir.
    - `prepared` kayıt üzerindeki sınıflandırma, Kaldır ve temizlik silmeyle çakışmaz: silme `prepared` kayda `409` verir, temizlik yalnız `prepared` kayıtları seçer.
    - İndirme satır kilidi kullanmaz. İndirme sürerken işletim sistemi açık dosyanın silinmesine izin vermezse (ör. Windows) silme `500` alır ve kayıt korunur.
  - **Yetki:** Endpoint'te authentication ve authorization yoktur (D-025); API'ye erişebilen herkes her kalıcı kaydı silebilir. Arayüzdeki onay adımı, sunucunun yerel adreste dinlemesi ve CORS middleware'inin olmaması yetkilendirme değildir. Dış erişim (T-17 AWS staging veya başka bir yol) açılmadan önce bu endpoint sunucu tarafında yetkilendirilmeli ya da kapatılmalıdır; bu, T-17'nin zorunlu ön koşuludur.
  - **Saklama:** Modül resmî kayıt veya saklama sistemi sayılmaz; belgelerin başka bir sistemde (ör. EBYS) saklandığı da doğrulanmış kabul edilmez. Silme ilk aşamada yalnız yerel geliştirme ve silinmesine izin verilen sentetik/demo belgelerle kullanılır. Gerçek kurum verisinde kullanılmadan önce saklama, silme ve yedek politikaları ayrıca doğrulanır.
  - **Arayüz:** Kayıtlar detayında silme iki aşamalıdır; modal ve dosya adını yeniden yazdırma yoktur.
    - "Belgeyi Sil" ilk tıklamada istek göndermez. Detay içinde "Bu belgeyi silmek istediğinizden emin misiniz?" sorusu, dosya adı, "Bu işlem belge kaydını, sınıflandırma ve onay bilgilerini ve orijinal dosyayı kalıcı olarak silecektir. İşlem geri alınamaz." uyarısı ve "Vazgeç" / "Evet, Kalıcı Olarak Sil" seçenekleri görünür. "Vazgeç" hiçbir şeyi değiştirmez.
    - İstek sürerken düğmeler kilitlidir; analiz listesinde istek sürerken "Belgeyi Sil" kilitlidir (D-045).
    - `204` ve `404`'te kayıt listeden çıkar, detay kapanır, sayılar ve filtre seçenekleri güncellenir; aynı belge analiz listesindeyse oradan da çıkar. `409`'da kısa Türkçe mesaj gösterilir, kayıt listede kalır. `500`, ağ hatası ve zaman aşımında başarı varsayılmaz: kaydın durumu detay endpoint'inden okunur; kayıt yoksa silinmiş sayılır, varsa ya da okunamazsa mesaj gösterilir ve kayıt listede kalır.
  - **Kapsam dışı:** Toplu silme, analiz listesinden kalıcı silme, çöp kutusu ve geri alma, silme geçmişi, kullanıcı yönetimi, yedeklerden silme, worker ve kuyruk.
- **Gerekçe:** Yanlış, test ya da demo amacıyla yüklenmiş kalıcı kayıtları temizlemenin bir yolu yoktu (INV-5). Kalıcı silme, kişisel veri içerebilen orijinal dosyanın gerçekten silinmesini gerektirir; soft delete bunu karşılamaz. Satır kilidi D-053'te zaten vardır ve retry ile silmenin aynı kaydı aynı anda değiştirmesini önler. Alternatifler ve sonuçlar ADR-001'dedir.

### D-020 — Senkron işleme
- **Durum:** Aktif · **Git:** giriş 2026-09-15, son değişiklik 2026-10-03 · **Referans:** F-05; `PROJECT_BRAIN.md` §2
- **Karar:**
  - Her istek kendi işini aynı istek içinde tamamlayıp sonucu döndürür; kuyruk veya arka plan işi yoktur.
  - Legacy `POST /api/documents/classify` dosyayı kaydetme, metin çıkarımı (gerekirse Gemini transkripsiyonu), Gemini sınıflandırma çağrısı (retry dahil) ve veritabanı kaydını tek istekte yapar.
  - V1.4 akışında aynı iş iki senkron isteğe bölünür: `prepare` (kaydetme + metin çıkarımı/transkripsiyon) ve `/{document_id}/classify` (Gemini sınıflandırması + sonucun yazılması) (D-045).
  - Birden fazla belge istemcide sırayla işlenir; worker, kuyruk veya paralel işleme eklenmez.
- **Gerekçe:** "API sonucu döndürür" akışının en basit karşılığı. Paralellik ölçüm ve somut ihtiyaç olmadan eklenmez; sıralı işleme OCR'ın CPU yükünü ve Gemini çağrılarını öngörülebilir tutar.

### D-021 — Agent sistemi kullanılmayacak
- **Durum:** Aktif · **Git:** giriş 2026-09-15, son değişiklik 2026-10-03 · **Referans:** `PROJECT_BRAIN.md` §10, §12; INV-1
- **Karar:** LangGraph dahil agent veya çok adımlı LLM orkestrasyonu yok.
- **Gerekçe:** Görev bir sınıflandırma çağrısı ve gerektiğinde tek amaçlı bir transkripsiyon çağrısından ibaret (D-008); agent yapısı gereksiz karmaşıklık ve maliyet getirir.

### D-022 — RAG kullanılmayacak
- **Durum:** Aktif · **Git:** giriş ve son değişiklik 2026-09-15 · **Referans:** `PROJECT_BRAIN.md` §12; INV-1
- **Karar:** Retrieval-augmented generation yok; kataloglar doğrudan prompt'a eklenir.
- **Gerekçe:** Katalog prompt'a sığacak kadar küçük; retrieval katmanı fayda sağlamadan karmaşıklık ekler.

### D-023 — Vector database kullanılmayacak
- **Durum:** Aktif · **Git:** giriş ve son değişiklik 2026-09-15 · **Referans:** `PROJECT_BRAIN.md` §12; INV-1
- **Karar:** Vektör veritabanı ve embedding altyapısı yok.
- **Gerekçe:** RAG ve benzerlik araması olmadığından ihtiyaç yok.

### D-024 — Mimari bilinçli olarak basit tutulacak
- **Durum:** Aktif · **Git:** giriş ve son değişiklik 2026-09-15 · **Referans:** `PROJECT_BRAIN.md` §10, §12
- **Karar:** Microservice, repository pattern (gerçekten gerekmedikçe), factory pattern, gereksiz service katmanları, workflow engine ve fine-tuning yok. Yeni soyutlama ancak güçlü gerekçe ve bu dosyada bir kararla eklenir.
- **Gerekçe:** Öncelik hızlı ve anlaşılır bir MVP; soyutlamalar gerçek ihtiyaç ortaya çıktığında eklenir.

### D-025 — MVP'de authentication ve admin paneli yok
- **Durum:** Aktif · **Git:** giriş ve son değişiklik 2026-09-15 · **Referans:** F-06, F-08; T-12
- **Karar:** Kimlik doğrulama/yetkilendirme ve admin paneli kapsam dışı.
- **Gerekçe:** MVP sınıflandırma akışını kanıtlamaya odaklanır; auth ihtiyacı entegrasyon gereksinimleriyle birlikte belirlenecek.

## Frontend

### D-037 — Frontend yığını: React + Vite + TypeScript, npm, düz CSS
- **Durum:** Aktif · **Git:** giriş 2026-09-16, son değişiklik 2026-09-24 · **Referans:** Ortak teknoloji
- **Karar:** Frontend React + Vite ile **TypeScript** kullanılarak yazılır. Paket yöneticisi **npm**. Stil için **düz CSS** kullanılır. Tailwind, UI bileşen kütüphanesi, Redux veya ek state management kütüphanesi eklenmez; gereken durum React'in kendi state'iyle tutulur. Saf yardımcılar (ör. önizleme alanı çıkarımı) Node'un yerleşik test çalıştırıcısıyla (`node:test`, `npm test`) test edilir; test kütüphanesi eklenmez.
- **Gerekçe:** Tek sayfalık yükleme ve sonuç ekranı için ek kütüphane gereksiz katman olur (D-024). TypeScript, API yanıt alanlarındaki uyuşmazlığı çalışma zamanı yerine derleme zamanında yakalar.

### D-038 — Geliştirmede frontend–backend iletişimi Vite proxy ile, CORS middleware yok
- **Durum:** Aktif · **Git:** giriş ve son değişiklik 2026-09-16 · **Referans:** F-08; T-12
- **Karar:** Frontend istekleri `/api/...` göreli yollarına yapılır; Vite dev sunucusu bu yolları `http://127.0.0.1:8000` adresine proxy'ler. Frontend kodunda backend adresi sabit yazılmaz. Bu aşamada FastAPI'ye CORS middleware eklenmez. Proxy hedefinde `localhost` değil `127.0.0.1` kullanılır (D-036 ile aynı gerekçe).
- **Gerekçe:** Tarayıcı için istekler aynı origin'den gider, bu yüzden CORS gerekmez ve backend değişmeden kalır. Dağıtımda frontend ile backend ayrı origin'lerde sunulacaksa bu karar güncellenerek CORS ele alınır.

### D-039 — Frontend istek zaman aşımı: 120 saniye
- **Durum:** Aktif · **Git:** giriş 2026-09-16, son değişiklik 2026-10-06 · **Referans:** F-05
- **Karar:** Frontend her backend isteği (hazırlama, sınıflandırma, kaldırma, onay ve katalog — D-049) için ayrı ayrı 120 saniye zaman aşımı uygular. Süre dolarsa istek iptal edilir ve kullanıcıya genel bir hata mesajı gösterilir.
- **Gerekçe:** Sınıflandırma isteğinin en kötü durumu yaklaşık 93 saniyedir (D-033). OCR gereken belgede prepare'in en kötü durumu, başarılı transkripsiyon gruplarının süresine başarısız grubun ~93 sn'si ve Tesseract yedeğinin süresi eklenerek bulunur; 120 saniyeye yaklaşabilir (D-047). 120 saniye bu durumlara pay bırakırken asılı kalan isteği sınırsız beklemeyi önler. Zaman aşımı yalnızca istemci tarafındadır: backend işlemi tamamlayıp kaydı yazmış olabilir. Sınıflandırmada bu durum, D-046'daki `409` → detay okuma akışıyla kurtarılır.

### D-040 — Frontend'de dosya ön kontrolü ve en fazla 5 dosya; otorite backend'de
- **Durum:** Aktif · **Git:** giriş 2026-09-16, son değişiklik 2026-09-24 · **Referans:** F-05
- **Karar:**
  - Kullanıcı birden fazla dosyayı seçerek veya sürükle-bırakla ekleyebilir; listede aynı anda en fazla **5** dosya bulunur (V1.4, D-045).
  - Frontend her dosyada uzantının `.pdf`, `.doc`, `.docx`, `.jpg`, `.jpeg` veya `.png` olduğunu ve boyutun 50 MB'ı aşmadığını kontrol eder. Uymayan dosyalar ve 5 dosya sınırını aşanlar listeye eklenmez; kullanıcıya uyarı gösterilir.
  - 5 dosya sınırı yalnızca arayüz sınırıdır: backend'de toplu işlem kavramı ve toplam boyut sınırı yoktur, dosya başına 50 MB sınırı korunur.
  - Bu kontroller yalnızca kullanıcı deneyimi içindir: kabul kararı backend'e aittir (D-001, D-028), backend doğrulamaları kaldırılmaz ve `413` / `415` yanıtları frontend'de ayrıca işlenir.
- **Gerekçe:** Kullanıcı yanlış veya büyük dosyada anında geri bildirim alır; gereksiz yükleme ve sunucu işi önlenir. İstemci kontrolü atlatılabileceği için güvenlik sınırı sayılmaz. 5 dosya, sıralı işlemede bekleme süresini ve tek ekranda gözden geçirmeyi yönetilebilir tutar. 50 MB sınırı bu nedenle frontend'de de yazılır; sınır değişirse iki yer birlikte güncellenmelidir.

### D-048 — Kayıtlar görünümü: belge türü, istemci tarafı arama/filtre ve özet sayıları
- **Durum:** Aktif (arama hükümleri 2026-10-23'te D-055 ile genişledi: istemci araması gönderen ve özeti de kapsar, belge metni `POST /api/documents/text-search` ile sunucuda aranır; filtre, sayaç ve "sayfalama yok" hükümleri geçerli) · **Git:** giriş 2026-10-04, son değişiklik 2026-10-06 · **Referans:** F-07; T-06; D-055
- **Karar:**
  - Kayıtlar listesinde ve kayıt detayında effective belge türü gösterilir (D-049: onaylıysa onaylanan, değilse AI türü; yoksa "Belirlenemedi").
  - Arama ve filtre yalnız istemci tarafındadır ve `GET /api/documents`'ın döndürdüğü kayıtlar üzerinde çalışır:
    - Dosya adında arama büyük/küçük harfe duyarsızdır; Türkçe karakterler sade eşleriyle eşleşir (ş/s, ğ/g, ü/u, ö/o, ç/c, ı/i; önizlemedeki katlamayla aynı). Bulanık arama yoktur.
    - Belge türü, hedef kurum ve durum filtreleri birlikte uygulanır. Tür ve kurum effective değerle, durum türetilmiş gösterim durumuyla (Sınıflandırıldı / İnceleme gerekli / Onaylandı / Başarısız; D-049) filtrelenir. Tür ve kurum seçenekleri yüklü kayıtların effective değerlerinden türetilir; türü ya da kurumu olmayan kayıtlar "Belirlenemedi" seçeneğinde toplanır.
  - Üç özet sayısı gösterilir: Toplam Kayıt, İnceleme Gereken (onaylanmamış `needs_review`: `needs_review` doğru ve `validated_at` boş — D-049), Başarısız (`failed`). Sayılar tüm yüklü kayıtlardandır; filtreden etkilenmez.
  - Backend, API, şema ve veritabanı değişmez. Endpoint'lerde arama, filtre ve sayfalama yoktur (D-043); kayıt sayısı istemcide işlenemeyecek kadar büyürse sunucu tarafı filtre/sayfalama ayrı bir karardır.
- **Gerekçe:** Liste endpoint'i gereken bütün alanları sayfalamasız döndürdüğü için yeni endpoint, sorgu katmanı veya analytics altyapısı gerekmez (D-024). "Sınıflandırıldı" sayısı gösterilmez: `needs_review` belgeler de sınıflandırılmıştır; seçilen üç sayı birbiriyle çakışmaz ve aksiyon gerektiren kayıtları öne çıkarır. Saf yardımcılar `node:test` ile test edilir (D-037).

### D-055 — Kayıtlar'da gelişmiş arama: kayıt bilgileri istemcide, belge metni sunucuda
- **Durum:** Aktif · **Tarih:** 2026-10-23 · **Referans:** F-07, F-08; D-043, D-048, D-025; INV-6; T-16, T-06, T-17
- **Karar:**
  - **İstemci araması (anlık):** Kayıtlar'daki arama kutusu dosya adında, gönderen kişide (`sender_name`), gönderen kurumda (`sender_institution`) ve AI özetinde (`summary`) arar. Alanlar `GET /api/documents` yanıtında zaten vardır; yeni istek yoktur. Değeri `null` olan alan eşleşmez. En az karakter sınırı yoktur; dosya adı araması bugünkü gibi çalışır.
  - **Sunucu araması (isteğe bağlı):** "Belge metninde de ara" kutusu işaretliyse çıkarılan metin (`extracted_text`) sunucuda aranır. Kutu varsayılan olarak kapalıdır.
  - **`POST /api/documents/text-search`:** Salt okunurdur; kayda yazmaz.
    - Gövde `{"query": "..."}`; ek alan kabul edilmez. Sorgu URL'de taşınmaz: arama metni kişisel veri içerebilir ve standart erişim loglarına girmemelidir.
    - Normalleştirilmiş sorgu 3–200 karakter olmalıdır; aksi hâlde FastAPI'nin standart `422` gövdesi döner.
    - Yanıt `{"document_ids": [...]}`: yalnız eşleşen kalıcı kayıtların ID'leri, `created_at` azalan sırada. `prepared` kayıtlar dahil değildir. Metin, alıntı veya eşleşme konumu dönmez.
    - Arama metni ve belge metni loglanmaz (INV-6); log yalnız sonuç sayısını içerebilir.
    - Route, `/{document_id}` route'larıyla çakışmayacak şekilde tanımlanır.
  - **Eşleşme kuralı (iki tarafta aynı):**
    - Boşluk normalleştirmesi: ardışık boşluk karakterleri tek boşluğa indirilir, baş ve sondaki boşluk atılır (backend `normalize_text` ile aynı kural). Sorguya istemcide ve sunucuda, aranan alanlara istemcide uygulanır; `extracted_text` zaten bu kuralla saklanır.
    - Türkçe karakter katlama: büyük/küçük harf farkı yoktur; ç/c, ğ/g, ı/i, İ/i, I/i, ö/o, ş/s, ü/u, â/a, î/i, û/u eşleşir. İstemcide mevcut `fold` kullanılır; sunucuda aynı eşleme `lower(translate(...))` ile yapılır.
    - Kısmi ve bütün ifade eşleşmesi: normalleştirilmiş ve katlanmış sorgu, alanın içinde kesintisiz geçmelidir. Çok kelimeli sorgu kelimelere bölünmez. Bulanık eşleşme, kök bulma ve sıralama puanı yoktur. Sunucuda `%`, `_` ve `\` joker karakter olarak değil, harfiyen aranır.
  - **Sonuç:** Liste "kayıt bilgisi eşleşmesi VEYA belge metni eşleşmesi" ile oluşur; tür, hedef kurum ve durum filtreleri bunun üstüne uygulanır (D-048). Özet sayıları filtreden ve aramadan etkilenmez.
  - **Arayüz:** Arama kutusu "Belge adı, gönderen veya özette ara" olur; altında "Belge metninde de ara" kutusu vardır.
    - Kutu açıkken sorgu 3 karakterden kısaysa sunucuya istek gitmez, kısa bir ipucu gösterilir; kayıt bilgisi araması çalışmaya devam eder.
    - Yazma bittikten kısa süre sonra istek gider. Yalnız en son sorgunun yanıtı uygulanır; eski yanıtlar yeni sonucun üzerine yazılmaz.
    - İstek sürerken "Belge metninde aranıyor…" gösterilir. Hata ya da zaman aşımında "Belge metninde arama yapılamadı" mesajı gösterilir ve kayıt bilgisi sonuçları görünmeye devam eder.
    - Eşleşen satırda neden küçük bir satırla gösterilir (ör. "Eşleşme: gönderen · özet · belge metni"); dosya adı eşleşmesi ayrıca yazılmaz. Belge metninden alıntı gösterilmez.
    - Arama bir okuma isteğidir; tek istek çalıştırıcısına (D-045) bağlanmaz.
  - **Performans:** İndeks, `pg_trgm`, full-text search altyapısı, arama motoru, vektör veritabanı, yeni LLM çağrısı ve migration yoktur; arama tam tablo taramasıdır. Gerçek PostgreSQL'de 1.000 sentetik kayıtta (kayıt başına ~50 bin karakter) sorgu süresi ölçülür; 1 saniye bir ölçüm kriteridir. Aşılırsa bu durum kaydedilir; indeks veya mimari değişikliği ancak ayrı bir kararla eklenir. Ölçüm (2026-10-23, gerçek PostgreSQL): 1.000 kayıt × ~50.000 karakterde sorgu başına ~3,8 sn; kriter aşıldı. Kullanıcı kararıyla bu süre MVP için kabul edilen sınırdır: metin araması isteğe bağlı kutuyla açılır, arama sürerken durum gösterilir ve gerçek belge metinleri bu en kötü durumdan çok kısadır. Gerçek hacimde ihtiyaç görülürse indeks ayrı karardır (T-06).
  - **Yetki:** Endpoint'te yetki yoktur (D-025). Detay endpoint'i aynı metni zaten açtığı için yeni bir veri açığı yaratmaz, ama dış erişimden (T-17) önce diğer endpoint'lerle birlikte korunmalıdır.
  - **Kapsam dışı:** Sunucu tarafı filtre ve sayfalama (T-06), metinden alıntı, sonuç sıralaması, kelime bazlı veya bulanık arama, aramanın kaydedilmesi.
- **Gerekçe:** Kullanıcı belge adını bilmeden gönderen, özet veya belge metniyle kayıt bulabilmelidir. Gönderen ve özet liste yanıtında zaten olduğu için istemcide aranır; arama anlık kalır ve D-048'in liste, filtre ve sayaç modeli korunur. Belge metni sınırsız uzunluktadır ve kişisel veri içerebilir: tüm kayıtların metnini tarayıcıya göndermek büyük veri aktarımı ve toplu veri açığı demektir. Bu yüzden metin sunucuda aranır ve yalnız ID'ler döner. POST gövdesi, sorgunun erişim loglarına girmesini önler. Katlama `translate` ile yapıldığı için veritabanının dil ayarından bağımsızdır.
