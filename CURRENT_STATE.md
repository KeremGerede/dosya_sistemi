# CURRENT_STATE

> **Son güncelleme:** 2026-10-13
>
> `main`'in güncel durumu (snapshot). Geliştirme günlüğü veya backlog değildir; geçmiş ayrıntılar Git geçmişindedir.
>
> Açık işler → `TODOS.md` · Kalıcı proje bilgisi ve mimari → `PROJECT_BRAIN.md` · Aktif kararlar → `DECISIONS.md` · Çalışma kuralları → `CLAUDE.md`

## Durum özeti

- Blocker veya high risk yok.
- Aktif workstream yok. Yeni ana workstream seçilmedi; sıradaki iş `TODOS.md` → Now.
- Açık manuel doğrulama ve bakım işleri (PDF orijinal görünümünün Chrome/Edge kontrolü, rehearsal kayıt kararı): `TODOS.md` → Maintenance / Minor.

## Ürün durumu (main)

- Çok formatlı yükleme ve metin çıkarımı: PDF, DOC, DOCX, JPG/JPEG, PNG. OCR gereken belgede Gemini 3.5 Flash Lite transkripsiyonu; Tesseract yalnız yedek (D-001, D-003, D-047).
- Tek Gemini sınıflandırma çağrısıyla belge türü, kurum, özet ve gönderen; belirsizlikte `needs_review` (D-008, D-010, D-044).
- Hazırla → önizle → sınıflandır akışı, arayüzde en fazla 5 dosya (V1.4; D-045, D-046).
- Kayıtlar: liste, detay ve indirme; istemci tarafı arama, filtre ve özet sayıları (D-043, D-048).
- Human Validation + Routing Correction (D-049).
- Evidence-backed Routing: "Belgedeki ilgili ifade" (D-050). Workstream kapalı.

## Teknik baseline

- **Backend:** `pytest` **473 passed** (Starlette/anyio kaynaklı 2 bilinen deprecation uyarısıyla); `pip check` temiz.
- **Frontend:** `npm test` **73 passed**; `npm run build` ve `npm run lint` temiz.
- **Veritabanı:** Tek `documents` tablosu. Alembic tek head `5ed883607e08` (dört migration); `alembic check` temiz.
- Otomatik testler gerçek Gemini API'si veya Docker PostgreSQL gerektirmez: endpoint testleri geçici SQLite, sahte sınıflandırma ve sahte transkripsiyon kullanır; Gemini retry/timeout davranışı gerçek SDK + `httpx.MockTransport` ile test edilir.

## Demo ortamı

- **Demo DB:** migration head `5ed883607e08`. 17 kayıt: 11 eski (evidence `NULL`) + 6 D-050 rehearsal kaydı (`rehearsal-d050-*`: 5 evidence dolu, 1 `[]`); 2 onaylı; `failed` ve `prepared` yok. Storage'da 18 dosya.
- **Yedek:** D-050 migration öncesi yedek repo dışındaki yerel yedek klasöründe (`demo-db-20261007-pre-d050`: `--clean` dump, storage kopyası, SHA256SUMS); restore doğrulandı.
- **Son prova:** D-050 sonrası gerçek backend, frontend ve Gemini ile entegrasyon ve rehearsal; blocker/high yok.

## Önemli mevcut sınırlar

Sonraki geliştirmede bilinmesi gereken sınırlar. Kalıcı ayrıntılar ilgili D-xxx kararında ve `PROJECT_BRAIN.md`'dedir.

- **OCR kalitesi (D-047):** Gemini'nin akıcı ama yanlış okumalarını yakalayan bir kalite kapısı yok; koruma önizleme ve `needs_review`'dır. Ölçüm seti küçük ve çoğunlukla temiz (9 el yazısı + 8 basılı belge). Döndürülmüş, gürültülü, tablo/form içeren taramalar ve telefon fotoğrafları ayrıca ölçülmedi; Tesseract yedeği bu belgelerde zayıf.
- **Veri akışı ve maliyet:** OCR gereken belgede dosyanın kendisi Gemini'ye gönderilir ve en az iki Gemini çağrısı yapılır. Inline istek sınırını aşan büyük dosyalar Tesseract yedeğine düşer. Aynı dosya tekrar yüklenirse yeni kayıt ve yeni Gemini çağrıları oluşur (tekilleştirme yok).
- **Süre ve kapasite (D-020, D-039):** İşleme senkrondur ve eşzamanlı kapasite thread pool ile sınırlıdır. Her Gemini çağrısı en kötü ~93 sn sürebilir; uzun taranmış PDF'te süre sayfa sayısıyla artar (21 sayfa ~36 sn). Yavaş API'de uzun belgede prepare, frontend'in 120 sn sınırını aşabilir.
- **Sınıflandırma (D-010, D-027):** `temperature=0`'da bile tam deterministik değildir. Yalnız ilk 50.000 karakter değerlendirilir. Katalog dışı birimlere ait belgeler `needs_review` olur; kurum açıklamaları ilk taslaktır.
- **Belgedeki ilgili ifade (D-050):** Zaman zaman genel bir kapanış ifadesi veya kısmen örtüşen iki ifade görülebilir; kabul edilmiş sınırdır, anlamsal filtre veya tekilleştirme yoktur. İfade yalnız çıkarılan metinde doğrulanır; taranmış belgede görüntünün doğru okunduğunu kanıtlamaz.
- **Kullanıcı onayı (D-049, D-025):** Yetki ve onay geçmişi yoktur; eşzamanlı onaylarda son yazan kazanır. Dış entegrasyonda `document_type` ve `institution_id` her zaman AI sonucudur; kullanıcı düzeltmesi `validated_*` alanlarındadır.
- **Kayıtlar (D-048):** Liste sayfalamasız tek istekte gelir; arama ve filtre istemci tarafındadır. Kayıt sayısı çok artarsa sunucu tarafı sayfalama/filtre ayrı karar gerektirir.
- **`prepared` akışı (D-040, D-046):** 5 dosya sınırı yalnız arayüzdedir. Sahipsiz `prepared` kayıt yalnız sonraki prepare çağrısında temizlenir. Aynı kayıt için eşzamanlı classify ve classify sırasında silme nadir kenar durumlarıdır.
- **Dağıtıma hazır değil:** Uygulama seviyesinde gövde sınırı yok (50 MB üstü yükleme önce geçici diske alınır), DOCX ZIP bomb koruması yok, authentication yok, CORS/reverse proxy kararı yok. Bunlar deployment adayının kapsamındadır (`TODOS.md` → Later / Candidate).

## Geliştirmede dikkat edilecekler

- **Yerel ortam:** Port ve adres kuralları (5433, `127.0.0.1`, arayüzde `localhost`) D-036 ve `README.md` "Kurulum" bölümündedir. `docker-compose.yml` sabit container adı, port ve volume kullanır; aynı makinede ikinci bir klonun stack'i çakışır.
- **Elle senkron tutulanlar:** 50 MB sınırı frontend'de de tanımlıdır ve backend ile birlikte güncellenmelidir. Frontend `ClassifyResponse` tipi backend şemasıyla elle eşleştirilir.
- **Katalog:** Katalog değişikliği uygulama yeniden başlatılmadan etkili olmaz. `other` türü katalogdan çıkarılırsa servis yüklenmez. Katalog değişirse, arayüzde açık kalan eski katalogla yapılan onay `422` alır.
- **SDK yükseltmesi:** google-genai yükseltilirse retry/timeout testleri (gerçek SDK + `MockTransport`) yeniden çalıştırılmalıdır.
- **Test kapsamı:** Frontend'de bileşen/tarayıcı testi yoktur; yalnız `src/documentPreview.ts` ve `src/records.ts` birim testleri vardır (Node 22.18+). Endpoint testleri SQLite kullanır; PostgreSQL'e özgü davranış yalnız gerçek ortam testleriyle doğrulanır.
