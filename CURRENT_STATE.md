# CURRENT_STATE

> **Son güncelleme:** 2026-10-22
>
> `main`'in güncel durumu (snapshot). Geliştirme günlüğü veya backlog değildir; geçmiş ayrıntılar Git geçmişindedir.
>
> Açık işler → `TODOS.md` · Kalıcı proje bilgisi ve mimari → `PROJECT_BRAIN.md` · Aktif kararlar → `DECISIONS.md` · Özellik davranışı ve sınırları → `docs/TEKNIK_SARTNAME.md` · Çalışma kuralları → `CLAUDE.md`

## Durum özeti

- Blocker veya high risk yok.
- Aktif workstream: F-09 başarısız sınıflandırmayı tekrar deneme (D-053). Özellik `0895dc0` ile `feature/failed-classification-retry` branch'ine commit edildi ve push edildi; `main`'e alınmadı. Kullanıcının manuel testleri geçti (Son gerçek ortam doğrulamaları). Manuel testte bulunan üç arayüz düzeltmesi aynı branch'te sürüyor, commit edilmedi: analiz listesinde işlem düğmelerinin taşması, "Tekrar Dene" görünümü, yetersiz metinli belgenin önizleme mesajı.
- Yeni kod migration `261a2937eb7c` ister: çalıştırmadan önce yerel DB'de `alembic upgrade head` gerekir. Masaüstü DB bu head'de (2026-10-22, `alembic current`). Laptop DB'si doğrulanmadı (Yerel ortamlar).
- Son kapanan: F-04 "Metinde göster" ve evidence arayüz iyileştirmeleri (ifade başlıkları D-052, onay/düzelt düğmeleri, dosya rozetleri, okunabilirlik; 2026-10-21). Kullanıcı bildirimi: PDF, taranmış PDF ve DOCX ile gerçek ortam manuel testleri geçti. Birim testleri ve sahte API'li tarayıcı kontrolleri tamam. Son görsel kontrol (`a2ade11` boşluk düzenlemesi dahil) gerçek ortamda yapılmadı; kullanıcı erteledi (T-14). Sıradaki ana iş `TODOS.md` → Now (T-01, T-02).
- Açık manuel doğrulama ve bakım işleri (PDF orijinal görünümünün Chrome/Edge kontrolü, rehearsal kayıt kararı, laptop'ta D-051 geçişi, evidence arayüzünün son görsel kontrolü): `TODOS.md` → Maintenance / Minor (T-07, T-08, T-13, T-14).

## Ürün durumu (main)

- Çok formatlı yükleme ve metin çıkarımı: PDF, DOC, DOCX, JPG/JPEG, PNG. OCR gereken belgede Gemini 3.5 Flash Lite transkripsiyonu; Tesseract yalnız yedek (F-01, F-02; D-001, D-003, D-047).
- Tek Gemini sınıflandırma çağrısıyla belge türü, kurum, özet ve gönderen; belirsizlikte `needs_review` (F-03; D-008, D-010, D-044).
- Hazırla → önizle → sınıflandır akışı, arayüzde en fazla 5 dosya (V1.4; F-05; D-045, D-046).
- Kayıtlar: liste, detay ve indirme; istemci tarafı arama, filtre ve özet sayıları (F-07; D-043, D-048).
- Human Validation + Routing Correction (F-06; D-049).
- Evidence-backed Routing: "Belgedeki ilgili ifade" (F-04; D-050, D-052). Her ifadenin üstünde `supports`'tan çevrilen başlık var; "Metinde göster" ile ifadenin ilk birebir geçişi çıkarılan metinde vurgulanır (2026-10-21).
- Başarısız sınıflandırmayı tekrar deneme: Gemini hatasıyla failed olan belge, yeniden yüklenmeden aynı kayıt ve metinle analiz listesinden ve Kayıtlar'dan tekrar sınıflandırılır (F-09; D-053; 2026-10-22, `0895dc0`; feature branch'te, `main`'e alınmadı).

## Teknik baseline

Yerel Windows 11, Python 3.13.15, Node 24.20.0, npm 11.19.0.

- **Backend:** `pytest` **495 passed** (1 uyarı: `starlette.testclient` kaynaklı `StarletteDeprecationWarning`); `pip check` temiz. Son doğrulama 2026-10-22, D-053 değişiklikleriyle (`0895dc0` commit'inden önce, çalışma ağacında).
- **Frontend:** `npm test` **92 passed**; `npm run build` ve `npm run lint` temiz. Son doğrulama 2026-10-22, `0895dc0` üzerindeki arayüz düzeltmeleri çalışma ağacıyla (commit edilmedi).
- **Veritabanı:** Tek `documents` tablosu. Alembic tek head `261a2937eb7c` (beş migration; D-053 `ocr_fallback`). `alembic check` çalışan veritabanı ister; son sonucu temiz (2026-10-22, aynı PostgreSQL sunucusunda geçici DB, upgrade/downgrade/upgrade sonrası). Masaüstü geliştirme DB'si `261a2937eb7c`'de; laptop doğrulanmadı (Yerel ortamlar).
- Otomatik testler gerçek Gemini API'si veya Docker PostgreSQL gerektirmez: endpoint testleri geçici SQLite, sahte sınıflandırma ve sahte transkripsiyon kullanır; Gemini retry/timeout davranışı gerçek SDK + `httpx.MockTransport` ile test edilir.
- **Test kapsamı:** Frontend'de bileşen/tarayıcı testi yoktur; yalnız `src/documentPreview.ts` ve `src/records.ts` birim testleri vardır (Node 22.18+). Endpoint testleri SQLite kullanır; PostgreSQL'e özgü davranış (ör. D-053 satır kilidi `FOR UPDATE NOWAIT`; SQLite'ta yok sayılır ve testte simüle edilir) yalnız gerçek ortam testleriyle doğrulanır.

## Son gerçek ortam doğrulamaları

Otomatik testlerin kapsamadığı davranış (gerçek Gemini, PostgreSQL, tarayıcı) için son kayıtlar; 2026-10-22 kayıtları dışındakiler bu turda yeniden çalıştırılmadı.

- **2026-10-22 · F-09 manuel test (kullanıcı bildirimi, laptop):** gerçek backend, frontend ve Gemini. Geçti: dijital PDF ve DOCX'te başarısız sınıflandırma → "Tekrar Dene" → başarılı; taranmış PDF'te Tesseract yedeği → "Tekrar Dene" → inceleme gerekli; yetersiz metinde düğme görünmüyor; Kayıtlar'dan tekrar deneme; bozuk Gemini anahtarıyla tekrar hata, anahtar düzelince başarılı deneme; orijinal belge görünümü. Laptop DB'sinin head'i ve portu bu kayıtla doğrulanmadı.
- **2026-10-22 · D-053 (F-09):** aynı PostgreSQL sunucusunda geçici `dosya_retry_test` DB (sonra silindi). Migration: kayıt varken upgrade → `alembic check` temiz → downgrade → upgrade; kayıtlar ve metinler korundu, eski kayıtlarda `ocr_fallback` NULL. Kilit: eşzamanlı iki retry'da ikincisi 0,03 sn'de `409`, Gemini (sahte, 3 sn) tek çağrı; çağrı sırasında satır ayrı bağlantıdan `NOWAIT` ile kilitli, sonrasında serbest; Gemini hatasında kayıt birebir aynı, sonraki deneme yedek OCR gerekçesiyle `needs_review`; migration öncesi kayıt `409`, Gemini 0 çağrı; açık "idle in transaction" bağlantı yok. Gerçek Gemini ile denenmedi.
- **2026-10-07 · D-050 (F-04):** migration zinciri ayrı geçici DB'de; laptop demo DB'sinde migration öncesi yedek ve restore kontrolü; gerçek backend, frontend ve Gemini ile entegrasyon ve rehearsal; blocker/high yok.
- **2026-10-06 · D-049 (F-06):** ayrı geçici PostgreSQL DB, gerçek Gemini ve headless tarayıcıyla onay, düzeltme, tekrar onay, Kayıtlar filtreleri ve sayaçları, yeniden başlatma sonrası kalıcılık; `alembic check` temiz; blocker/high yok.
- **2026-10-04 · Sunum preflight ve demo provası:** gerçek PostgreSQL ve Gemini; tek belge, OCR (taranmış PDF ve görüntü), `needs_review` dahil çoklu yükleme, Kayıtlar, yeniden başlatma sonrası kalıcılık.
- **2026-10-03 · V1.3 (F-02):** gerçek PostgreSQL, Gemini ve Tesseract; 21 sayfalık taranmış PDF 7 grup çağrısıyla okundu (~36 sn); zorlanmış 503'te yedek yol çalıştı ve sonuç `needs_review` oldu; loglarda belge metni, API anahtarı ve storage yolu yok.

## Yerel ortamlar

İki makinenin veritabanı ve storage içeriği farklıdır; birinin kayıtları diğerinin durumu sayılmaz.

- **Masaüstü bilgisayar (geliştirme, 2026-10-21):** PostgreSQL `127.0.0.1:5434` (D-051); `5433` aynı makinedeki `stok` projesinindir. Migration head `261a2937eb7c` (2026-10-22, `alembic current`; bu upgrade'in ayrıntıları kayıtlı değil, aşağıdaki kayıt sayıları ve doğrulama `5ed883607e08` dönemine aittir). 2026-10-22: container Docker yeniden başlatmasından sonra durmuştu (exit 255), `docker start` ile açıldı; head ve kayıt sayısı aynı. 6 sentetik kayıt: 2 `classified`, 1 `failed`, 3 `prepared`; onaylı kayıt ve evidence yok. Storage'da 6 belge.
  - Doğrulama: `alembic current` head, `alembic check` temiz; migration öncesi ve sonrası satır hash'leri ve storage SHA256 değerleri aynı; backend yeni şemayla salt okunur GET isteklerinde (liste, detay) çalıştı.
  - Yedek: migration öncesi volume ve storage yedeği alındı (kullanıcı bildirimi).
- **Laptop (demo, 2026-10-07 kaydı; sonrasında doğrulanmadı):** PostgreSQL `127.0.0.1:5433` (D-036); D-051 geçişi henüz yapılmadı (T-13). Migration head `5ed883607e08`. Kullanıcı bildirimi (2026-10-22): F-09 manuel testleri laptopta yapıldı; bu test migration `261a2937eb7c`'yi gerektirir, ancak laptop'un head'i, portu ve kayıtları doğrulanmadı. 17 kayıt: 11 eski (evidence `NULL`) + 6 D-050 rehearsal kaydı (`rehearsal-d050-*`: 5 evidence dolu, 1 `[]`); 2 onaylı; `failed` ve `prepared` yok. Storage'da 18 dosya.
  - Yedek: D-050 migration öncesi yedek repo dışındaki yerel yedek klasöründe (`demo-db-20261007-pre-d050`: `--clean` dump, storage kopyası, SHA256SUMS); restore doğrulandı.
  - Son prova (2026-10-07): D-050 sonrası gerçek backend, frontend ve Gemini ile entegrasyon ve rehearsal; blocker/high yok.

## Önemli mevcut sınırlar

Özellik sınırları ilgili kaydın "Sınırlar" bölümündedir: `docs/TEKNIK_SARTNAME.md` (F-01–F-08). Burada ürünün genel durumunu etkileyen sınır kalır.

- **Dağıtıma hazır değil:** Uygulama seviyesinde gövde sınırı yok (50 MB üstü yükleme önce geçici diske alınır), DOCX ZIP bomb koruması yok, authentication yok, CORS/reverse proxy kararı yok. Bunlar deployment adayının kapsamındadır (`TODOS.md` → Later / Candidate, T-12).
