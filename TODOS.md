# TODOS

Yaşayan backlog: aktif işler, araştırmalar, bakım, aday workstream'ler, kapanan işler ve kapsam dışı bulgular. Fikir havuzu değildir; kabul edilmiş sınırlar TODO değildir (→ `docs/TEKNIK_SARTNAME.md` "Sınırlar", `CURRENT_STATE.md`). Kararlar burada tutulmaz (→ `DECISIONS.md`).

- Görev ID'leri kalıcıdır (`T-xx`); bir numara yeniden kullanılmaz.
- Öncelik bölüm sırasıdır: Now → Validate / Research → Maintenance / Minor → Later / Candidate.
- Durumlar: `Açık`, `Devam ediyor`, `Ertelendi`, `Aday` (onaylanmamış aday), `Kapandı`.
- Kapanan görev silinmez: kanıtıyla (tarih ve commit veya doğrulama sonucu) "Kapanan" bölümüne taşınır.

## Now

- **T-01** · Açık · Gerçek kullanıcı / kurum araştırması (sorular: Validate / Research).
- **T-02** · Açık · Araştırma sonucuna göre sıradaki ana workstream'in seçilmesi.

## Validate / Research

Araştırma sorularıdır; feature kararı değildir.

- **T-03** · Açık · Structured Operational Extraction ihtiyacını gerçek kullanıcıyla doğrula. Ana soru: "Sınıflandırmadan sonra personel belgeyi hangi 2–3 bilgi için tekrar açıyor?"
- **T-04** · Açık · Hangi operasyonel alanların gerçekten değer ürettiğini belirle.
- **T-05** · Açık · EBYS / CİMER / CRM entegrasyon ihtiyacını araştır: sistem bu sistemlerin önünde veya yanında hangi noktada, hangi veriyle çalışmalı?
- **T-06** · Açık · Kayıtlar deneyiminin gerçek operasyon hacminde yeterli olup olmadığını araştır (bugün sayfalama yok; arama ve filtre istemci tarafında — D-048).

## Maintenance / Minor

- **T-07** · Açık · PDF orijinal görünümünü gerçek Chrome/Edge tarayıcısında elle kontrol et (otomatik test tarayıcısında PDF görüntüleyici yok).
- **T-08** · Açık · Demo DB'deki 6 rehearsal kaydı (`rehearsal-d050-*`) ve 6 storage dosyası için karar ver: tut veya temizle.

## Later / Candidate

Doğrulanmamış adaylardır; onaylı iş değildir. Uzun vadeli ürün genişleme yönü: `PROJECT_BRAIN.md` §13.

- **T-09** · Aday · Structured Operational Extraction: araştırma sonucuna bağlı aday; onaylanmış sıradaki feature değildir. Araştırma gerçek değer göstermeden alan şeması oluşturulmaz.
- **T-10** · Aday · Gerçek kullanım verisiyle kurum açıklamalarının iyileştirilmesi.
- **T-11** · Aday · Otomatik döndürme / orientation.
- **T-12** · Aday · Deployment / production kararları: containerize etme, reverse proxy ve gövde boyutu sınırı, CORS (D-038), authentication.

## Kapanan

Kayıt: görev ID'si, kapanış tarihi, kanıt (commit veya doğrulama sonucu). Henüz kapanan görev yok; bu bölüm açılmadan önce kapanan işler Git geçmişindedir.

## Kapsam Dışı Bulgular

Bir görev sırasında fark edilen, o görevin kapsamı dışındaki bulgular. Bulgu onaylı iş değildir; ele alınacaksa göreve dönüştürülür. Kayıt: tarih, bulgu, fark edildiği görev.
