# TODOS

Açık işler: aktif işler, araştırmalar, bakım ve aday workstream'ler.

## Now

- Gerçek kullanıcı / kurum araştırması (sorular: Validate / Research).
- Araştırma sonucuna göre sıradaki ana workstream'in seçilmesi.

## Validate / Research

Araştırma sorularıdır; feature kararı değildir.

- Structured Operational Extraction ihtiyacını gerçek kullanıcıyla doğrula. Ana soru: "Sınıflandırmadan sonra personel belgeyi hangi 2–3 bilgi için tekrar açıyor?"
- Hangi operasyonel alanların gerçekten değer ürettiğini belirle.
- EBYS / CİMER / CRM entegrasyon ihtiyacını araştır: sistem bu sistemlerin önünde veya yanında hangi noktada, hangi veriyle çalışmalı?
- Kayıtlar deneyiminin gerçek operasyon hacminde yeterli olup olmadığını araştır (bugün sayfalama yok; arama ve filtre istemci tarafında — D-048).

## Maintenance / Minor

- PDF orijinal görünümünü gerçek Chrome/Edge tarayıcısında elle kontrol et (otomatik test tarayıcısında PDF görüntüleyici yok).
- Demo DB'deki 6 rehearsal kaydı (`rehearsal-d050-*`) ve 6 storage dosyası için karar ver: tut veya temizle.

## Later / Candidate

Doğrulanmamış adaylardır; onaylı iş değildir. Uzun vadeli ürün genişleme yönü: `PROJECT_BRAIN.md` §13.

- Structured Operational Extraction: araştırma sonucuna bağlı aday; onaylanmış sıradaki feature değildir. Araştırma gerçek değer göstermeden alan şeması oluşturulmaz.
- Gerçek kullanım verisiyle kurum açıklamalarının iyileştirilmesi.
- Otomatik döndürme / orientation.
- Deployment / production kararları: containerize etme, reverse proxy ve gövde boyutu sınırı, CORS (D-038), authentication.
