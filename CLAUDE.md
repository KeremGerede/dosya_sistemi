# Project Instructions

Bu dosya yalnız bu projeye özel talimatları içerir; global `CLAUDE.md` talimatları geçerliliğini korur.

## Source-of-truth dosyaları

- `CURRENT_STATE.md`: güncel durum, aktif riskler ve sıradaki hedefler. Geliştirme günlüğü değildir; geçmiş ayrıntılar Git geçmişinde kalır.
- `DECISIONS.md`: yalnız güncel ve aktif kararlar (D-xxx). Karar geçmişi Git'te izlenir.
- `PROJECT_BRAIN.md`: proje amacı, mimari sınırlar ve MVP kapsamı. Bunlara uyulur.

## Context yükleme

- Yeni oturumda veya yeni bir workstream'de önce `CURRENT_STATE.md`'yi oku.
- `PROJECT_BRAIN.md` ve `DECISIONS.md`'yi her görevde baştan sona okuma; yalnız görevle ilgili bölümleri ve D-xxx kararlarını oku.
- Okunması gereken durumlar:
  - `CURRENT_STATE.md` görevle ilgili bir D-xxx kararına işaret ediyorsa, implementasyondan önce o kararı incele.
  - Mimari, kapsam veya temel ürün davranışı değişecekse, ilgili `PROJECT_BRAIN.md` bölümünü önce oku.
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
- **Orta:** İlgili CURRENT_STATE ve D-xxx context'ini seç, gerekirse Graphify kullan. Kısa bir mini-plan çıkar; minimum implementasyonu ve ilgili testleri yap.
- **Büyük/mimari:** Plan Mode kullan, ilgili PROJECT_BRAIN ve DECISIONS bölümlerini incele. Gerekirse Graphify ile impact analysis yap; planı implementasyondan önce netleştir.

## Geliştirme prensibi

Bu proje bilinçli olarak basit tutulur.

Akış: ölç/test et → minimum değişiklik → doğrula → gerekirse dokümante et → commit/push (kullanıcı onayıyla).

- MVP dışı özellik ekleme.
- Gereksiz abstraction, mimari katman veya altyapı ekleme; gereksiz refactor yapma.
- Ölçüm olmadan yeni mimari karmaşıklık ekleme; varsayımsal gelecek ihtiyaçlar için mimari kurma.
- Mevcut davranışı sebepsiz değiştirme; en küçük güvenli çözümü tercih et.
- `DECISIONS.md`'deki aktif kararlarla çelişen değişiklik yapma.
- Bir gereksinim proje dosyalarıyla çelişiyorsa bunu implementasyondan önce belirt.

## Dokümantasyon güncelleme

MD dosyalarını her görev sonunda otomatik güncelleme. Bir dosyayı yalnız aşağıdaki durumda güncelle:

- `CURRENT_STATE.md`: güncel ürün durumu, aktif risk veya sıradaki hedef gerçekten değiştiyse.
- `DECISIONS.md`: yeni kalıcı bir ürün/teknik karar alındıysa ekle; aktif bir karar değiştiyse ilgili kaydı yerinde güncelle.
- `PROJECT_BRAIN.md`: temel amaç, kapsam veya mimari gerçekten değiştiyse.
- `README.md`: kullanıcının ya da geliştiricinin bilmesi gereken dış davranış, kurulum veya kullanım değiştiyse.

Küçük/lokal değişikliklerde hiçbir source-of-truth dosyasının güncellenmemesi normaldir. Aynı bilgiyi birden fazla MD dosyasında ayrıntılı tekrarlama.

## Context ve çıktı disiplini

- Gereksiz uzun plan, terminal çıktısı veya test logu üretme; büyük çıktıları sohbete dökme.
- Başarılı testlerde özet yeterlidir (ör. "368 passed"). Hata varsa yalnız teşhis için gereken bölümü göster.
- Normal geliştirme sonunda mümkünse kısa format kullan: **Bulgu** · **Değişiklik** · **Doğrulama** · **Risk / açık nokta**.

## Session sınırı

- Doğal bir workstream'i mümkün olduğunca tek oturumda tamamla.
- Workstream doğrulanıp gerekiyorsa dokümante edildi ve commit/push ile kapatıldıysa, bağımsız büyük bir yeni workstream için yeni oturum tercih et.
- Eski sohbet context'ini yalnız gerçekten devam eden iş varsa taşı.
