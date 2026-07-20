# 📗 Kelimix

İngilizcenin en sık kullanılan ~3800 kelimesini (Oxford 3000 listesi)
**aralıklı tekrar (SM-2)** ve oyunlarla öğreten saf HTML + CSS + JS bir web
uygulaması. Backend yok, API anahtarı yok; tüm ilerleme tarayıcının
`localStorage`'ında tutulur. Vercel'e statik olarak deploy edilir.

**🔗 Canlı demo:** https://oxford-learner.vercel.app

## Özellikler
- **Dashboard** — tekrar/yeni/öğrenilen sayıları, seviyeye göre ilerleme.
- **Çalışma akışı**
  - Yeni kelime → **flashcard** (anlam + örnek + Türkçe), kullanıcı zorluk derecesi verir.
  - Tekrar → **quiz** (4 tip): kelime→anlam, anlam→kelime, boşluk doldurma, yazarak cevap.
  - Yanlış cevapta → Türkçe karşılık + İngilizce tanım + örnek cümle gösterilir.
- **İstatistik** — doğruluk, seri (streak), son 14 gün grafiği.
- **Ayarlar** — günlük yeni kelime limiti, oturum boyutu, çalışılacak seviyeler.

## Dosya yapısı
```
index.html        # Dashboard
study.html        # Öğrenme ekranı
stats.html        # İstatistik
settings.html     # Ayarlar
css/style.css
js/
  storage.js      # localStorage katmanı
  sm2.js          # SM-2 aralıklı tekrar
  quiz.js         # 4 quiz tipi üretimi
  app.js          # sayfa kontrolcüleri
data/oxford3000.json
tools/fix_encoding.py
```

## Veri dosyası
`data/oxford3000.json` tam **3805 kelime** içerir (A1: 1076, A2: 990, B1: 902,
B2: 837). Her kaydın Türkçe karşılığı (`tr`) gömülüdür — uygulama tamamen
çevrimdışı/bedava çalışır, hiçbir API gerektirmez.

Her kayıt şu alanlara sahiptir:
`word, type, level, en, example, tr, phon`

Fonetik/tırnaklar bozuk görünürse (`/ËeÉªprÉl/` gibi) onar:
```bash
python3 tools/fix_encoding.py data/oxford3000.json
```

## Çalıştırma
Statik dosyalar `fetch` ile JSON okuduğu için bir HTTP sunucusu gerekir:
```bash
python3 -m http.server 8000
# http://localhost:8000
```

## Deploy (Vercel)
```bash
vercel        # veya GitHub reposunu Vercel'e bağla
```
Tamamen statik; ortam değişkeni veya sunucu yapılandırması gerekmez.
