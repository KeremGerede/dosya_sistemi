# Project Instructions

Bu dosya yalnız bu projeye özel talimatları içerir; global `CLAUDE.md` talimatları geçerliliğini korur.

## Source-of-truth dosyaları

- `CURRENT_STATE.md`: `main`'in güncel snapshot'ı: ürün durumu, teknik baseline, migration head, aktif blocker/high risk ve kabul edilmiş sınırlar, aktif workstream. Geliştirme günlüğü veya backlog değildir.
- `TODOS.md`: açık işler: aktif işler (Now), araştırmalar (Validate / Research), bakım (Maintenance / Minor) ve aday workstream'ler (Later / Candidate). Fikir havuzu değildir. Araştırma ve aday maddeleri onaylı iş sayılmaz; kabul edilmiş sınırlar TODO değildir.
- `DECISIONS.md`: yalnız güncel ve aktif kararlar (D-xxx) ve gerekçeleri. Yapılacak iş, roadmap veya checkpoint günlüğü tutmaz. Karar geçmişi Git'te izlenir.
- `PROJECT_BRAIN.md`: kalıcı proje hafızası: amaç, ürün sınırı, temel akışlar, mimari, veri modeli, AI/OCR yaklaşımı ve kapsam. Bunlara uyulur.
- `README.md`: kısa dış dokümantasyon (tanıtım, kurulum, temel API). Kısa tutulur.

Geçmiş ayrıntılar (checkpoint'ler, doğrulama günlükleri, eski baseline'lar) Git geçmişinde kalır.

## Context yükleme

- Yeni oturumda veya yeni bir workstream'de önce `CURRENT_STATE.md`'yi oku.
- Aktif bir görev varsa `TODOS.md` içindeki ilgili maddeyi oku.
- Görev bir D-xxx kararına dayanıyorsa veya onu etkiliyorsa, implementasyondan önce o kararı oku.
- Mimari, kapsam veya temel ürün davranışı değişecekse, ilgili `PROJECT_BRAIN.md` bölümünü önce oku.
- `PROJECT_BRAIN.md`, `DECISIONS.md` ve `TODOS.md`'yi her görevde baştan sona okuma; yalnız ilgili bölümleri oku.
- Çelişki, belirsizlik veya yetersiz context varsa okuma kapsamını kademeli olarak genişlet.
- Büyük MD dosyalarını, Git geçmişini, test loglarını ve repo genelini gereksiz yere context'e yükleme.

Görevden önce kendi içinde yanıtla ve yalnız gereken context'i yükle: Hangi ürün alanı etkileniyor? Hangi aktif D-xxx kararları ilgili? Hangi kaynak dosyalar gerçekten gerekli? Kod ilişkisi yeterince açık mı? Mimari veya kapsam değişiyor mu? Daha küçük bir çözüm yeterli mi?

## Graphify

Graphify proje hafızası değil; kod keşfi ve impact analysis aracıdır.

- **Kullan:** kod yolu belirsizse; değişiklik birden fazla modülü ya da katmanı (frontend/backend/DB) etkiliyorsa; etkilenen dosya veya symbol'ler belirsizse; eski bir özelliğe dönülüyorsa; bug'ın hangi katmanda olduğu net değilse.
- **Kullanma:** ilgili dosya zaten belliyse; tek dosyalık küçük bir değişiklikse; dokümantasyon, metin veya CSS gibi lokal bir işse.
- Kullanırken mevcut `graphify-out` grafiğinin yalnız görevle ilgili kısmını incele.
- **Refresh** (grafiği yeniden oluşturmak) kullanımdan ayrıdır ve pahalıdır; gerekmiyorsa çalıştırma.
  - Grafiğin yaşı ya da yeni oturum tek başına refresh sebebi değildir.
  - Refresh şu durumlarda düşünülür:
    - kod yapısında anlamlı değişiklik (yeni modül/servis, önemli endpoint/akış değişimi, klasör/mimari değişim, büyük refactor)
    - görevle ilgili, grafiğin eskidiğine dair somut bir işaret
  - Dokümantasyon, CSS/UI, küçük bugfix, test veya lokal değişiklikler için refresh yapılmaz.

## Görev büyüklüğüne göre çalışma

- **Küçük/lokal:** İlgili dosyayı doğrudan incele, minimum değişiklik yap, hedefli test çalıştır. Plan Mode ve Graphify varsayılan olarak kullanılmaz.
- **Orta:** İlgili CURRENT_STATE, TODOS ve D-xxx context'ini seç, gerekirse Graphify kullan. Kısa bir mini-plan çıkar; minimum implementasyonu ve ilgili testleri yap.
- **Büyük/mimari:** Plan Mode kullan, ilgili PROJECT_BRAIN ve DECISIONS bölümlerini incele. Gerekirse Graphify ile impact analysis yap; planı implementasyondan önce netleştir.

## Workstream disiplini

- Aynı anda mümkün olduğunca tek ana workstream yürüt.
- Bağımsız yeni bir ana workstream açmadan önce mevcut workstream'i doğrula ve tamamla ya da bilinçli olarak ertele.
- `TODOS.md` içindeki bir araştırma veya aday maddesi, kullanıcı açıkça seçmeden aktif ana workstream olmaz.
- Ana workstream seçildiğinde kapsam ve başarı kriteri netleştirilir.
- Workstream kalıcı bir ürün, davranış, mimari veya teknik karar oluşturuyorsa `DECISIONS.md`'de D-xxx kaydı açılır ya da ilgili mevcut karar güncellenir. Yalnız görev yürütmek için D-xxx oluşturulmaz; `DECISIONS.md` backlog veya workstream günlüğü değildir.
- Küçük bakım ve dokümantasyon işleri gerektiğinde yapılabilir; ana geliştirme hattını dağıtmamalıdır.
- Zaman baskısı nedeniyle test, doğrulama veya context kontrolü atlanmaz. Hız yerine minimum güvenli değişiklik ve doğrulama tercih edilir.

## Geliştirme prensibi

Bu proje bilinçli olarak basit tutulur.

Akış: incele/ölç → minimum değişiklik → doğrula → gerekirse dokümante et → commit/push (kullanıcı onayıyla).

- MVP dışı özellik ekleme.
- Gereksiz abstraction, mimari katman veya altyapı ekleme; gereksiz refactor yapma.
- Ölçüm olmadan yeni mimari karmaşıklık ekleme; varsayımsal gelecek ihtiyaçlar için mimari kurma.
- Mevcut davranışı sebepsiz değiştirme; en küçük güvenli çözümü tercih et.
- `DECISIONS.md`'deki aktif kararlarla çelişen değişiklik yapma.
- Bir gereksinim proje dosyalarıyla çelişiyorsa bunu implementasyondan önce belirt.
- Benchmark verileri, örnek belgeler, ground truth ve ölçüm artefaktları repoya girmez; repo dışında tutulur.

## Dokümantasyon güncelleme

MD dosyalarını her görev sonunda otomatik güncelleme. Bir dosyayı yalnız aşağıdaki durumda güncelle:

- `CURRENT_STATE.md`: ürün durumu, teknik baseline, migration head, aktif blocker/high risk, kabul edilmiş sınır veya aktif workstream gerçekten değiştiyse.
- `TODOS.md`: açık iş eklendi, önceliği değişti, ertelendi veya tamamlandıysa. Tamamlanan iş TODOS'tan çıkarılır; ürün durumu değiştiyse `CURRENT_STATE.md` güncellenir. Ayrıntılar Git geçmişindedir.
- `DECISIONS.md`: yeni kalıcı bir ürün/teknik karar alındıysa ekle; aktif bir karar değiştiyse ilgili kaydı yerinde güncelle.
- `PROJECT_BRAIN.md`: temel amaç, ürün sınırı, kapsam veya mimari gerçekten değiştiyse.
- `README.md`: kullanıcının ya da geliştiricinin bilmesi gereken dış davranış, kurulum veya kullanım değiştiyse.

Küçük/lokal değişikliklerde hiçbir source-of-truth dosyasının güncellenmemesi normaldir. Aynı bilgiyi birden fazla MD dosyasında ayrıntılı tekrarlama.

## ADR

`docs/adr/` yalnız aşağıdaki durumlarda kullanılır:

- birden fazla ciddi mimari alternatif varsa,
- kararın uzun vadeli trade-off'u önemliyse,
- `DECISIONS.md`'deki kısa D-xxx kaydı yetersiz kalıyorsa.

Her karar için ADR yazılmaz. ADR yazılırsa ilgili D-xxx kaydı ona bağlantı verir.

## Context ve çıktı disiplini

- Gereksiz uzun plan, terminal çıktısı veya test logu üretme; büyük çıktıları sohbete dökme.
- Başarılı testlerde özet yeterlidir (ör. "368 passed"). Hata varsa yalnız teşhis için gereken bölümü göster.
- Normal geliştirme sonunda mümkünse kısa format kullan: **Bulgu** · **Değişiklik** · **Doğrulama** · **Risk / açık nokta**.

## Session sınırı

- Doğal bir workstream'i mümkün olduğunca tek oturumda tamamla.
- Workstream doğrulanıp gerekiyorsa dokümante edildi ve commit/push ile kapatıldıysa, bağımsız büyük bir yeni workstream için yeni oturum tercih et.
- Eski sohbet context'ini yalnız gerçekten devam eden iş varsa taşı.
