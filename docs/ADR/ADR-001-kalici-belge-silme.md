# ADR-001 — Kalıcı kayıtların fiziksel olarak silinmesi

- **Durum:** Kabul edildi (2026-10-22)
- **Karar kaydı:** D-054 · **İlgili:** INV-5, D-019, D-046, D-049, D-053 · **Özellik:** F-10 · **Görev:** T-15, T-17

## Bağlam

INV-5, kalıcı kayıtların (`classified`, `needs_review`, `failed`) silinmesini yasaklıyordu; tek silme yolu `prepared` kayda özgüydü (D-046). Yanlış, test ya da demo amacıyla yüklenmiş kalıcı kayıtları ve orijinal dosyalarını temizlemenin bir yolu yoktu.

Kısıtlar:
- Tek `documents` tablosu (D-013); orijinal dosya veritabanı dışında, `backend/storage/` altında (D-017).
- Authentication yok (D-025).
- Failed kaydın tekrar denenmesi aynı satırı `FOR UPDATE NOWAIT` ile kilitler (D-053).
- Modül resmî kayıt veya saklama sistemi sayılmaz; belgelerin başka bir sistemde saklandığı doğrulanmış değildir.

## Karar

Kalıcı kayıtlar, açık kullanıcı onayıyla ve tek bir endpoint'le (`DELETE /api/documents/{document_id}`) fiziksel olarak silinir: kayıt ve orijinal dosya birlikte. Kayıt D-053'teki satır kilidiyle alınır; önce dosya, sonra kayıt silinir ve commit yapılır. Ayrıntılı sözleşme D-054 ve F-10'dadır.

## Değerlendirilen alternatifler

- **Soft delete (`deleted_at` kolonu, kayıt ve dosya yerinde):** Reddedildi. "Kalıcı silme" sözünü karşılamaz; kişisel veri içerebilen dosya diskte kalır. Ayrıca her okuma sorgusuna filtre ve bir migration gerektirir.
- **Arşiv veya çöp kutusu (geri alınabilir silme):** Reddedildi. Ek durum, ek ekran ve temizlik zamanlaması gerektirir; kullanıcı geri alma istemedi.
- **Önce commit, sonra dosya silme:** Reddedildi. Dosya silinemezse kaydı olmayan ve hiçbir yüzeyin göremediği bir dosya kalır; bu artık hiçbir akışla bulunamaz.
- **Tombstone tablosu veya silme günlüğü:** Reddedildi. Tek tablo kuralını (D-013) bozar; authentication olmadığı için "kim sildi" bilgisi zaten tutulamaz.
- **Kilitsiz silme:** Reddedildi. Retry Gemini çağrısı sürerken kaydı silebilir ya da sonucu silinmiş kayda yazmaya çalışabilirdi.

## Sonuçlar

- Silinen kayıt ve dosya geri getirilemez. Daha önce alınmış veritabanı ve storage yedekleri bu silmenin kapsamında değildir.
- **Dosya silme ile veritabanı commit'i atomik değildir.** Dosya silindikten sonra commit başarısız olursa ya da süreç kesilirse kayıt kalır, dosya kalmaz. Bu ara durum görünürdür (indirme `404`, tekrar deneme `409`) ve aynı silme isteği tekrarlandığında tamamlanır.
- Retry ile silme aynı kilidi kullandığı için birbirini `409` ile reddeder. Onay endpoint'i kilit kullanmaz: onay ile silme aynı anda gelirse onay hata alabilir. Bu, yalnız onay–silme çakışması için kabul edilen yerel MVP sınırıdır.
- API'ye erişebilen herkes silebilir. Arayüz onayı, yerel adreste dinleme ve CORS'un olmaması yetkilendirme değildir. Dış erişimden (T-17) önce endpoint sunucu tarafında yetkilendirilmeli ya da kapatılmalıdır.
- Gerçek kurum verisinde kullanılmadan önce saklama, silme ve yedek politikaları ayrıca doğrulanmalıdır.
- `prepared` yaşam döngüsü (Kaldır, 24 saatlik temizlik) değişmez ve kalıcı kayda dokunmaz.
