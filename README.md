# 📘 Oxford Learner

Oxford 3000 kelimelerini **aralıklı tekrar (SM-2)** ile öğreten, saf
HTML + CSS + JS bir web uygulaması. Backend yok; tüm ilerleme tarayıcının
`localStorage`'ında tutulur. Vercel'e statik olarak deploy edilir.

## Özellikler
- **Dashboard** — tekrar/yeni/öğrenilen sayıları, seviyeye göre ilerleme.
- **Çalışma akışı**
  - Yeni kelime → **flashcard** (anlam + örnek + TR), kullanıcı zorluk derecesi verir.
  - Tekrar → **quiz** (4 tip): kelime→anlam, anlam→kelime, boşluk doldurma, yazarak cevap.
  - Yanlış cevapta → **Anthropic API** ile kısa Türkçe açıklama + anlam (opsiyonel).
- **İstatistik** — doğruluk, seri (streak), son 14 gün grafiği.
- **Ayarlar** — günlük yeni kelime limiti, oturum boyutu, seviyeler, API anahtarı.

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
  claude.js       # Anthropic API çağrısı
  app.js          # sayfa kontrolcüleri
data/oxford3000.json
tools/fix_encoding.py
```

## Veri dosyası (önemli)
`data/oxford3000.json` şu an **örnek bir alt küme** (40 kelime) içerir; uygulama
hemen çalışsın diye eklendi. Tam 3805 kelimelik listeni koymak için:

1. Kendi `oxford3000.json` dosyanı `data/oxford3000.json` olarak kopyala.
2. Eğer fonetik/tırnaklar bozuk görünüyorsa (`/ËeÉªprÉl/` gibi) onar:
   ```bash
   python3 tools/fix_encoding.py data/oxford3000.json
   ```

Her kayıt şu alanlara sahip olmalı:
`word, type, level, en, example, tr, phon`

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

## Anthropic API hakkında ⚠️
`js/claude.js` tarayıcıdan **doğrudan** Anthropic API'ye istek atar
(`anthropic-dangerous-direct-browser-access`). Bu, API anahtarını istemcide
açığa çıkarır ve yalnızca kişisel/demo kullanım içindir. Üretim için isteği
kendi sunucundaki bir proxy üzerinden yapmalısın.
