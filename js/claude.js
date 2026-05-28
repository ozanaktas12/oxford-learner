/* claude.js — Anthropic API ile kısa açıklama + Türkçe anlam üretir.
 *
 * NOT: Tarayıcıdan doğrudan çağrı API anahtarını açığa çıkarır.
 * Üretimde bu isteği kendi sunucunuzdaki bir proxy üzerinden yapın.
 */
const Claude = (() => {
  const ENDPOINT = 'https://api.anthropic.com/v1/messages';
  const cache = {}; // word -> {explanation, tr}

  function buildPrompt(word) {
    return `İngilizce kelime: "${word.word}" (${word.type}, ${word.level})
Tanım: ${word.en}
Örnek: ${word.example || '-'}

Bir İngilizce öğrencisi bu kelimeyi quizde yanlış bildi.
Şu JSON formatında yanıt ver, başka hiçbir şey yazma:
{"tr":"<en yaygın Türkçe karşılığı, 1-3 kelime>","explanation":"<Türkçe, 1-2 cümle çok kısa hatırlatıcı ve bir mini ipucu>"}`;
  }

  async function explain(word) {
    if (cache[word.word]) return cache[word.word];

    const s = Storage.getSettings();
    if (!s.aiEnabled || !s.apiKey) {
      return { tr: word.tr || '', explanation: '', disabled: true };
    }

    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': s.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: s.model,
          max_tokens: 200,
          messages: [{ role: 'user', content: buildPrompt(word) }],
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error('API ' + res.status + ': ' + txt.slice(0, 120));
      }

      const data = await res.json();
      const text = (data.content && data.content[0] && data.content[0].text || '').trim();
      const parsed = parse(text);
      cache[word.word] = parsed;
      return parsed;
    } catch (e) {
      console.warn('Claude explain failed', e);
      return { tr: word.tr || '', explanation: '', error: e.message };
    }
  }

  function parse(text) {
    try {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) {
        const o = JSON.parse(m[0]);
        return { tr: o.tr || '', explanation: o.explanation || '' };
      }
    } catch (_) {}
    return { tr: '', explanation: text };
  }

  return { explain };
})();
