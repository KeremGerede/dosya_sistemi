# CLAUDE.md — dosya_sistemi

Kamu kurumları ve belediyeler için AI destekli belge kabul ve sınıflandırma modülü: PDF, DOC, DOCX, JPG/JPEG veya PNG belgenin metnini çıkarır, tek Gemini çağrısıyla belge türünü ve hedef birimi belirler, belirsiz belgeyi insan incelemesine bırakır. EBYS, CİMER veya CRM'nin yerine geçmez; onların önünde veya yanında çalışır.

Bu dosya yalnız projeye özel yönlendirme ve kuralları içerir. Çalışma kuralları (fazlar, onaylar, doğrulama, karar ve ADR kriterleri) global `~/.claude/CLAUDE.md`'dedir. Doküman sorumlulukları, güncelleme zamanı ve arşivleme `~/.claude/standards/PROJECT_STRUCTURE.md`'dedir. Aşağıdaki proje kuralları global kuralları bu proje için daraltır veya tamamlar.

## Yönlendirme

| İhtiyaç | Dosya |
|---|---|
| Güncel durum, test baseline'ı ve test kapsamı, migration head, blocker, dağıtım durumu, demo ortamı | `CURRENT_STATE.md` |
| Açık işler, araştırmalar, adaylar, kapanan işler, kapsam dışı bulgular | `TODOS.md` |
| Kararlar ve geçerlilikleri (`D-xxx`) | `DECISIONS.md` |
| Amaç, kullanıcılar, ürün sınırı, temel akış, mimari, kataloglar, veri modeli, ilkeler, kritik değişmezler (INV-x), kapsam ve kapsam dışı | `PROJECT_BRAIN.md` §1, §2, §4, §6, §8, §10–§13 |
| Özellik davranışı, kabul ölçütleri ve sınırları (F-xx); ortak teknoloji ve yapılandırma; LLM ve OCR sözleşmesi; API ve hata kodları | `docs/TEKNIK_SARTNAME.md` |
| Kurulum, komutlar, ortam değişkenleri, API özeti | `README.md` |
| Önemli kararların gerekçesi ve alternatifleri | `docs/ADR/` (dizin: `docs/ADR/README.md`) |
| Geçmiş: checkpoint'ler, doğrulama günlükleri, eski baseline'lar | Git geçmişi |

Okuma sırası:

1. Yeni oturumda veya yeni bir workstream'de önce `CURRENT_STATE.md`.
2. Aktif bir görev varsa `TODOS.md` içindeki ilgili madde.
3. Mimari, kapsam veya temel ürün davranışı değişecekse ilgili `PROJECT_BRAIN.md` bölümü.
4. Çelişki, belirsizlik veya yetersiz context varsa okuma kapsamını kademeli olarak genişlet.

## Kırmızı çizgiler

Kritik değişmezlerin tam metni `PROJECT_BRAIN.md` §10 → "Kritik değişmezler"dedir; birini değiştirmek yeni bir karar kaydı gerektirir.

- **INV-1** Tek Gemini sınıflandırma çağrısı; transkripsiyon ayrı; agent, RAG, vector DB ve zincir yok.
- **INV-2** Kapalı katalog; belirsizlikte zorla atama yok, belge `needs_review` olur.
- **INV-3** Kullanıcı onayı AI sonucunu değiştirmez; onay `validated_*` alanlarındadır.
- **INV-4** "Belgedeki ilgili ifade" yalnız kaynakta birebir doğrulanmış alıntıdır.
- **INV-5** Kalıcı kayıtlar yalnız kalıcı silme endpoint'iyle, kayıt ve dosyasıyla birlikte silinir (D-054); başka hiçbir yol kalıcı kaydı silmez. Endpoint'te yetki yoktur: dış erişimden önce sunucu tarafında korunmalıdır (T-17).
- **INV-6** Teknik hata ayrıntısı ve storage yolu dışarı sızmaz; belge metni, dosya içeriği ve API anahtarı loglanmaz.
- Gerçek veya kişisel veri içeren belgeler, benchmark belgeleri ve verileri, ground truth ve ölçüm artefaktları repoya girmez; repo dışında tutulur. Gerçek kişi veya kurum verisi içermeyen sentetik test fixture'ları bu kuralın dışındadır.
- Mimari bilinçli olarak basittir: `PROJECT_BRAIN.md` §12'deki kapsam dışı bir öğe ya da yeni bir soyutlama katmanı ancak karar kaydıyla eklenir (D-024).

## Proje kuralları

**Workstream**

- Aynı anda mümkün olduğunca tek ana workstream yürüt. Bağımsız yeni bir ana workstream açmadan önce mevcut workstream'i doğrula ve tamamla ya da bilinçli olarak ertele.
- `TODOS.md` içindeki bir araştırma veya aday maddesi, kullanıcı açıkça seçmeden aktif ana workstream olmaz.
- Yalnız görev yürütmek için `D-xxx` kaydı açılmaz.
- Küçük bakım ve dokümantasyon işleri gerektiğinde yapılabilir; ana geliştirme hattını dağıtmamalıdır.
- Zaman baskısı nedeniyle test, doğrulama veya context kontrolü atlanmaz. Hız yerine minimum güvenli değişiklik ve doğrulama tercih edilir.

**Graphify** (global kural, graphify'ın ne zaman kullanılacağını bu dosyaya bırakır)

- **Kullan:** kod yolu belirsizse; değişiklik birden fazla modülü ya da katmanı (frontend/backend/DB) etkiliyorsa; etkilenen dosya veya symbol'ler belirsizse; eski bir özelliğe dönülüyorsa; bug'ın hangi katmanda olduğu net değilse.
- **Kullanma:** ilgili dosya zaten belliyse; tek dosyalık küçük bir değişiklikse; dokümantasyon, metin veya CSS gibi lokal bir işse.
- Kullanırken mevcut `graphify-out` grafiğinin yalnız görevle ilgili kısmını incele.
- **Refresh** (grafiği yeniden oluşturmak) kullanımdan ayrıdır ve pahalıdır; gerekmiyorsa çalıştırma.
  - Grafiğin yaşı ya da yeni oturum tek başına refresh sebebi değildir.
  - Refresh şu durumlarda düşünülür:
    - kod yapısında anlamlı değişiklik (yeni modül/servis, önemli endpoint/akış değişimi, klasör/mimari değişim, büyük refactor)
    - görevle ilgili, grafiğin eskidiğine dair somut bir işaret
  - Dokümantasyon, CSS/UI, küçük bugfix, test veya lokal değişiklikler için refresh yapılmaz.

**Oturum**

- Doğal bir workstream'i mümkün olduğunca tek oturumda tamamla.
- Workstream doğrulanıp gerekiyorsa dokümante edildi ve commit/push ile kapatıldıysa, bağımsız büyük bir yeni workstream için yeni oturum tercih et.
- Eski sohbet context'ini yalnız gerçekten devam eden iş varsa taşı.

**Çıktı**

- Gereksiz uzun plan, terminal çıktısı veya test logu üretme; büyük çıktıları sohbete dökme.
- Başarılı testlerde özet yeterlidir (ör. "368 passed"). Hata varsa yalnız teşhis için gereken bölümü göster.
- Normal geliştirme sonunda mümkünse kısa format kullan: **Bulgu** · **Değişiklik** · **Doğrulama** · **Risk / açık nokta**.

## Konvansiyonlar

- Dokümanlar, arayüz metinleri ve kod yorumları Türkçe; kod tanımlayıcıları, API alanları ve commit mesajları İngilizce.
- Commit mesajı: Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `style:`, `chore:`), kısa.
- Kod yorumları dayandıkları kararı `D-xxx` ID'siyle anar.
- `README.md` kısa tutulur; kurulum, kullanım veya dışarıdan görülen davranış değişince güncellenir.
- ADR'ler `docs/ADR/` altına yazılır; klasör ilk ADR ile oluşturulur. Ne zaman yazılacağı: global `CLAUDE.md` → "Architecture decisions and ADRs" (dört koşulun hepsi). Biçim ve indeks: `~/.claude/standards/PROJECT_STRUCTURE.md` §5.

## Doğrulama

- Komutlar: `README.md` → "Test ve Kalite".
- Bitti kontrolü: değişen katmanın baseline kontrolleri geçer. Backend: `python -m pytest`, `pip check`, `alembic check` (çalışan veritabanı ister). Frontend: `npm test`, `npm run build`, `npm run lint`. Baseline değişirse `CURRENT_STATE.md` güncellenir.
- Otomatik testlerin kapsamı ve kapsamadığı davranış (arayüz, PostgreSQL'e özgü davranış, gerçek Gemini çağrıları): `CURRENT_STATE.md` → "Teknik baseline".

## Ortam tuzakları

Geliştirmede dikkat edilecekler:

- **Yerel ortam:** Port ve adres kuralları (5434, `127.0.0.1`, arayüzde `localhost`) D-051 ve `README.md` "Kurulum" bölümündedir. 5433 aynı makinedeki `stok` projesine aittir. `docker-compose.yml` sabit container adı, port ve volume kullanır; aynı makinede ikinci bir klonun stack'i çakışır.
- **Elle senkron tutulanlar:** 50 MB sınırı frontend'de de tanımlıdır ve backend ile birlikte güncellenmelidir. Frontend `ClassifyResponse` tipi backend şemasıyla elle eşleştirilir.
- **Katalog:** Katalog değişikliği uygulama yeniden başlatılmadan etkili olmaz. `other` türü katalogdan çıkarılırsa servis yüklenmez. Katalog değişirse, arayüzde açık kalan eski katalogla yapılan onay `422` alır.
- **SDK yükseltmesi:** google-genai yükseltilirse retry/timeout testleri (gerçek SDK + `MockTransport`) yeniden çalıştırılmalıdır.
