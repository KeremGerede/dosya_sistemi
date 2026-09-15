# Project Instructions

Bu dosya yalnızca bu projeye özel ek talimatları içerir; global `CLAUDE.md` talimatları geçerliliğini korur.

Bu repoda herhangi bir değişiklik yapmadan önce aşağıdaki dosyaları sırayla oku:

1. `PROJECT_BRAIN.md`
2. `CURRENT_STATE.md`
3. `DECISIONS.md`

Bu üç dosya projenin ana referansıdır.

## Çalışma Kuralları

- `PROJECT_BRAIN.md` içindeki proje amacı, mimari sınırlar ve MVP kapsamına uy.
- `DECISIONS.md` içindeki aktif kararlarla çelişen değişiklik yapma.
- Önemli yeni ürün veya teknik kararları `DECISIONS.md` dosyasına ekle.
- Bir karar değişirse `DECISIONS.md` içindeki ilgili kararı güncelle.
- `DECISIONS.md` yalnızca güncel ve aktif kararları içermelidir.
- Karar geçmişi Git üzerinden takip edilir.
- Geliştirme ilerledikçe `CURRENT_STATE.md` dosyasını güncelle.
- `CURRENT_STATE.md` içinde tamamlanan işleri, mevcut durumu, bilinen sorunları ve sıradaki adımı güncel tut.
- `PROJECT_BRAIN.md` dosyasını yalnızca projenin temel amacı, mimarisi veya kapsamı gerçekten değiştiğinde güncelle.

## Geliştirme Prensibi

Bu proje bilinçli olarak basit tutulmaktadır.

- MVP kapsamında olmayan özellikleri ekleme.
- Gereksiz abstraction oluşturma.
- Gereksiz mimari katman ekleme.
- Gereksiz altyapı oluşturma.
- Daha basit bir çözüm yeterliyse onu tercih et.
- Projenin mevcut ihtiyacından önce, gelecekteki varsayımsal ihtiyaçlar için mimari kurma.

Herhangi bir gereksinim mevcut proje dosyalarıyla çelişiyorsa implementasyona başlamadan önce bunu belirt.
