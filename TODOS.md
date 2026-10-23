# TODOS

Yaşayan backlog: aktif işler, araştırmalar, bakım, aday workstream'ler, kapanan işler ve kapsam dışı bulgular. Fikir havuzu değildir; kabul edilmiş sınırlar TODO değildir (→ `docs/TEKNIK_SARTNAME.md` "Sınırlar", `CURRENT_STATE.md`). Kararlar burada tutulmaz (→ `DECISIONS.md`).

- Görev ID'leri kalıcıdır (`T-xx`); bir numara yeniden kullanılmaz.
- Öncelik bölüm sırasıdır: Now → Next → Validate / Research → Maintenance / Minor → Later / Candidate.
- Durumlar: `Açık`, `Devam ediyor`, `Ertelendi`, `Aday` (onaylanmamış aday), `Kapandı`.
- Kapanan görev silinmez: kanıtıyla (tarih ve commit veya doğrulama sonucu) "Kapanan" bölümüne taşınır.

## Now

- **T-16** · Devam ediyor · Kayıtlar'da gelişmiş arama (yol haritası 2; D-055, F-07). Branch `feature/records-advanced-search`. PLAN onaylandı (hibrit arama: kayıt bilgileri istemcide, belge metni `POST /api/documents/text-search` ile sunucuda). S1 (karar ve dokümantasyon), S2 (backend endpoint'i ve testleri) ve S3 (gerçek PostgreSQL doğrulaması ve ölçümü; 1 sn kriteri aşıldı, ~3,8 sn / 1.000 × 50 bin karakter; kullanıcı kararıyla MVP sınırı) ve S4 (Kayıtlar arayüzü, sahte API'li tarayıcı kontrolü) yapıldı; sonraki dilimler (kullanıcının laptop testi, kapanış) her biri ayrı onay bekler. Sayfalama ve sunucu tarafı filtre T-06'da kalır.

## Next

Kullanıcının 2026-10-22'de onayladığı sıra: T-15 (kapandı) → T-16 → T-17 → T-18 → T-01. Her madde başlamadan önce kendi PLAN onayını alır; hiçbiri için BUILD onayı yoktur.

- **T-17** · Açık · AWS staging / canlı demo (yol haritası 3). Ön koşul kararları T-12'dedir (`CURRENT_STATE.md` → "Dağıtıma hazır değil"). **Zorunlu ön koşul (D-054):** dış erişim açılmadan önce kalıcı silme endpoint'i (`DELETE /api/documents/{document_id}`) sunucu tarafında yetkilendirilmeli ya da kapatılmalıdır; arayüz onayı, CORS ve yerel adres bunun yerine geçmez. Belge metni araması (`POST /api/documents/text-search`, D-055) da diğer endpoint'lerle birlikte korunmalıdır.
- **T-18** · Açık · OCR ve dashboard iyileştirmelerinin değerlendirilmesi (yol haritası 4). T-11 bu değerlendirmenin adaylarındandır.

## Validate / Research

Araştırma sorularıdır; feature kararı değildir.

- **T-01** · Açık · Gerçek kullanıcı / kurum araştırması. Yol haritasında 5. sırada; yapılandırılmış bilgi çıkarımı ihtiyacına odaklanır (T-03, T-04). Diğer sorular: T-05, T-06.
- **T-03** · Açık · Structured Operational Extraction ihtiyacını gerçek kullanıcıyla doğrula. Ana soru: "Sınıflandırmadan sonra personel belgeyi hangi 2–3 bilgi için tekrar açıyor?"
- **T-04** · Açık · Hangi operasyonel alanların gerçekten değer ürettiğini belirle.
- **T-05** · Açık · EBYS / CİMER / CRM entegrasyon ihtiyacını araştır: sistem bu sistemlerin önünde veya yanında hangi noktada, hangi veriyle çalışmalı?
- **T-06** · Açık · Kayıtlar deneyiminin gerçek operasyon hacminde yeterli olup olmadığını araştır (bugün sayfalama yok; arama ve filtre istemci tarafında — D-048).

## Maintenance / Minor

- **T-07** · Açık · PDF orijinal görünümünü gerçek Chrome/Edge tarayıcısında elle kontrol et (otomatik test tarayıcısında PDF görüntüleyici yok).
- **T-08** · Açık · Laptop demo DB'sindeki 6 rehearsal kaydı (`rehearsal-d050-*`) ve 6 storage dosyası için karar ver: tut veya temizle.
- **T-13** · Açık · Laptop'ta D-051 geçişi: değişiklik çekildikten sonra container'ı `docker compose up -d` ile 5434 portuyla yeniden oluştur, laptop'taki `backend/.env` içinde `DATABASE_URL` portunu 5434 yap; bağlantıyı, migration head'ini ve kayıt sayısını doğrula.
- **T-14** · Ertelendi · Evidence arayüzünün son görsel kontrolünü gerçek ortamda yap: sonuç kartı ve Kayıtlar detayı; `a2ade11` boşluk düzenlemesi dahil. Sahte API'li tarayıcı kontrolü yapıldı; gerçek belgeyle kontrol kullanıcı tarafından ertelendi.

## Later / Candidate

Doğrulanmamış adaylardır; onaylı iş değildir. Uzun vadeli ürün genişleme yönü: `PROJECT_BRAIN.md` §13.

- **T-09** · Aday · Structured Operational Extraction: araştırma sonucuna bağlı aday; onaylanmış sıradaki feature değildir. Araştırma gerçek değer göstermeden alan şeması oluşturulmaz.
- **T-10** · Aday · Gerçek kullanım verisiyle kurum açıklamalarının iyileştirilmesi.
- **T-11** · Aday · Otomatik döndürme / orientation.
- **T-12** · Aday · Deployment / production kararları: containerize etme, reverse proxy ve gövde boyutu sınırı, CORS (D-038), authentication; kalıcı silme endpoint'inin sunucu tarafında korunması veya kapatılması (D-054, T-17 için zorunlu).

## Kapanan

Kayıt: görev ID'si, kapanış tarihi, kanıt (commit veya doğrulama sonucu). Bu bölüm açılmadan önce kapanan işler Git geçmişindedir.

- **T-02** · Kapandı · 2026-10-22 · Sıradaki ana workstream'in seçilmesi: kullanıcı yol haritasını onayladı (T-15 → T-16 → T-17 → T-18 → T-01). Seçim araştırma sonucu beklenmeden yapıldı; T-01 açık kalır.
- **T-15** · Kapandı · 2026-10-23 · Kayıtlar'dan kontrollü ve kalıcı belge silme (D-054, ADR-001, F-10). Kanıt: `37f3337`; backend 507 ve frontend 98 test; gerçek PostgreSQL ve dosya sistemi kontrolü 24/24 (geçici DB); sahte API'li tarayıcı kontrolü (masaüstü, 375px); kullanıcının laptop testi (S5: Vazgeç, kalıcı silme, onay alanı yerleşimi). Açık koşul: T-17 öncesi silme endpoint'inin sunucu tarafında korunması.

## Kapsam Dışı Bulgular

Bir görev sırasında fark edilen, o görevin kapsamı dışındaki bulgular. Bulgu onaylı iş değildir; ele alınacaksa göreve dönüştürülür. Kayıt: tarih, bulgu, fark edildiği görev.

- 2026-10-22 · Kayıtlar detayında metin çıkarımı başarısız (yetersiz metin) kaydın başarısızlık nedeni gösterilmiyor; yalnız çıkarılan metin görünüyor. Fark edildiği görev: F-09 arayüz düzeltmeleri.
- 2026-10-22 · Beklenmeyen hatada (ör. kalıcı silmede dosya kilitliyken) sunucunun uvicorn traceback'i storage yolunu (`<document_id>.<uzantı>` dahil) sunucu loguna yazıyor; yanıta girmiyor, belge adı ve metni yok. Bütün endpoint'lerin beklenmeyen hata davranışıdır; D-054 ve F-10 metni buna göre yazıldı, genel log düzenlemesi yapılmadı. Fark edildiği görev: T-15 S3.
