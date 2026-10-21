# CURRENT_STATE

> **Son güncelleme:** 2026-10-21
>
> `main`'in güncel durumu (snapshot). Geliştirme günlüğü veya backlog değildir; geçmiş ayrıntılar Git geçmişindedir.
>
> Açık işler → `TODOS.md` · Kalıcı proje bilgisi ve mimari → `PROJECT_BRAIN.md` · Aktif kararlar → `DECISIONS.md` · Özellik davranışı ve sınırları → `docs/TEKNIK_SARTNAME.md` · Çalışma kuralları → `CLAUDE.md`

## Durum özeti

- Blocker veya high risk yok.
- Aktif workstream: F-04 "Metinde göster" (evidence ifadesini çıkarılan metinde vurgulama). Uygulama, birim testleri ve sahte API'li tarayıcı kontrolü tamam; kullanıcının gerçek ortam manuel testi bekleniyor. Son kapanan: geliştirme PostgreSQL host portunun 5434'e geçişi (D-051, 2026-10-21, masaüstü bilgisayar). Sıradaki ana iş `TODOS.md` → Now (T-01, T-02).
- Açık manuel doğrulama ve bakım işleri (PDF orijinal görünümünün Chrome/Edge kontrolü, rehearsal kayıt kararı, laptop'ta D-051 geçişi): `TODOS.md` → Maintenance / Minor (T-07, T-08, T-13).

## Ürün durumu (main)

- Çok formatlı yükleme ve metin çıkarımı: PDF, DOC, DOCX, JPG/JPEG, PNG. OCR gereken belgede Gemini 3.5 Flash Lite transkripsiyonu; Tesseract yalnız yedek (F-01, F-02; D-001, D-003, D-047).
- Tek Gemini sınıflandırma çağrısıyla belge türü, kurum, özet ve gönderen; belirsizlikte `needs_review` (F-03; D-008, D-010, D-044).
- Hazırla → önizle → sınıflandır akışı, arayüzde en fazla 5 dosya (V1.4; F-05; D-045, D-046).
- Kayıtlar: liste, detay ve indirme; istemci tarafı arama, filtre ve özet sayıları (F-07; D-043, D-048).
- Human Validation + Routing Correction (F-06; D-049).
- Evidence-backed Routing: "Belgedeki ilgili ifade" (F-04; D-050). "Metinde göster" ile ifadenin ilk birebir geçişi çıkarılan metinde vurgulanır (2026-10-21; manuel test bekliyor).

## Teknik baseline

Yerel Windows 11, Python 3.13.15, Node 24.20.0, npm 11.19.0.

- **Backend:** `pytest` **473 passed** (1 uyarı: `starlette.testclient` kaynaklı `StarletteDeprecationWarning`); `pip check` temiz. Son doğrulama 2026-10-20 · commit `8646480`; backend kodu o tarihten beri `b21ff28` ile aynı (sonraki değişiklikler doküman, geliştirme ortamı host portu D-051 ve frontend).
- **Frontend:** `npm test` **82 passed**; `npm run build` ve `npm run lint` temiz. Son doğrulama 2026-10-21, F-04 "Metinde göster" değişikliğiyle.
- **Veritabanı:** Tek `documents` tablosu. Alembic tek head `5ed883607e08` (dört migration). `alembic check` çalışan veritabanı ister; son sonucu temiz (2026-10-21, masaüstü bilgisayardaki geliştirme DB'si, `127.0.0.1:5434`).
- Otomatik testler gerçek Gemini API'si veya Docker PostgreSQL gerektirmez: endpoint testleri geçici SQLite, sahte sınıflandırma ve sahte transkripsiyon kullanır; Gemini retry/timeout davranışı gerçek SDK + `httpx.MockTransport` ile test edilir.
- **Test kapsamı:** Frontend'de bileşen/tarayıcı testi yoktur; yalnız `src/documentPreview.ts` ve `src/records.ts` birim testleri vardır (Node 22.18+). Endpoint testleri SQLite kullanır; PostgreSQL'e özgü davranış yalnız gerçek ortam testleriyle doğrulanır.

## Son gerçek ortam doğrulamaları

Otomatik testlerin kapsamadığı davranış (gerçek Gemini, PostgreSQL, tarayıcı) için Git geçmişindeki son kayıtlar; bu turda yeniden çalıştırılmadı.

- **2026-10-07 · D-050 (F-04):** migration zinciri ayrı geçici DB'de; laptop demo DB'sinde migration öncesi yedek ve restore kontrolü; gerçek backend, frontend ve Gemini ile entegrasyon ve rehearsal; blocker/high yok.
- **2026-10-06 · D-049 (F-06):** ayrı geçici PostgreSQL DB, gerçek Gemini ve headless tarayıcıyla onay, düzeltme, tekrar onay, Kayıtlar filtreleri ve sayaçları, yeniden başlatma sonrası kalıcılık; `alembic check` temiz; blocker/high yok.
- **2026-10-04 · Sunum preflight ve demo provası:** gerçek PostgreSQL ve Gemini; tek belge, OCR (taranmış PDF ve görüntü), `needs_review` dahil çoklu yükleme, Kayıtlar, yeniden başlatma sonrası kalıcılık.
- **2026-10-03 · V1.3 (F-02):** gerçek PostgreSQL, Gemini ve Tesseract; 21 sayfalık taranmış PDF 7 grup çağrısıyla okundu (~36 sn); zorlanmış 503'te yedek yol çalıştı ve sonuç `needs_review` oldu; loglarda belge metni, API anahtarı ve storage yolu yok.

## Yerel ortamlar

İki makinenin veritabanı ve storage içeriği farklıdır; birinin kayıtları diğerinin durumu sayılmaz.

- **Masaüstü bilgisayar (geliştirme, 2026-10-21):** PostgreSQL `127.0.0.1:5434` (D-051); `5433` aynı makinedeki `stok` projesinindir. Migration head `5ed883607e08` (`cedf33674167`'den yükseltildi). 6 sentetik kayıt: 2 `classified`, 1 `failed`, 3 `prepared`; onaylı kayıt ve evidence yok. Storage'da 6 belge.
  - Doğrulama: `alembic current` head, `alembic check` temiz; migration öncesi ve sonrası satır hash'leri ve storage SHA256 değerleri aynı; backend yeni şemayla salt okunur GET isteklerinde (liste, detay) çalıştı.
  - Yedek: migration öncesi volume ve storage yedeği alındı (kullanıcı bildirimi).
- **Laptop (demo, 2026-10-07 kaydı; sonrasında doğrulanmadı):** PostgreSQL `127.0.0.1:5433` (D-036); D-051 geçişi henüz yapılmadı (T-13). Migration head `5ed883607e08`. 17 kayıt: 11 eski (evidence `NULL`) + 6 D-050 rehearsal kaydı (`rehearsal-d050-*`: 5 evidence dolu, 1 `[]`); 2 onaylı; `failed` ve `prepared` yok. Storage'da 18 dosya.
  - Yedek: D-050 migration öncesi yedek repo dışındaki yerel yedek klasöründe (`demo-db-20261007-pre-d050`: `--clean` dump, storage kopyası, SHA256SUMS); restore doğrulandı.
  - Son prova (2026-10-07): D-050 sonrası gerçek backend, frontend ve Gemini ile entegrasyon ve rehearsal; blocker/high yok.

## Önemli mevcut sınırlar

Özellik sınırları ilgili kaydın "Sınırlar" bölümündedir: `docs/TEKNIK_SARTNAME.md` (F-01–F-08). Burada ürünün genel durumunu etkileyen sınır kalır.

- **Dağıtıma hazır değil:** Uygulama seviyesinde gövde sınırı yok (50 MB üstü yükleme önce geçici diske alınır), DOCX ZIP bomb koruması yok, authentication yok, CORS/reverse proxy kararı yok. Bunlar deployment adayının kapsamındadır (`TODOS.md` → Later / Candidate, T-12).
