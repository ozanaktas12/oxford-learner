/* quiz.js — tekrar kartları için 4 farklı soru tipi üretir */
const Quiz = (() => {

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function sample(arr, n) { return shuffle(arr).slice(0, n); }

  /** Aynı seviye + tip içinden, hedef kelimeden farklı çeldiriciler seç. */
  function pickDistractors(target, pool, n = 3) {
    let cands = pool.filter(w =>
      w.word !== target.word &&
      w.level === target.level &&
      w.type === target.type &&
      w.en);
    if (cands.length < n) {
      cands = pool.filter(w => w.word !== target.word && w.en);
    }
    return sample(cands, n);
  }

  function blankExample(word, example) {
    if (!example) return null;
    // tüm geçişleri boşalt (yoksa ikinci geçiş cevabı ele verir)
    const re = new RegExp('\\b' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
    if (!re.test(example)) return null;
    return example.replace(re, '_____');
  }

  /** Türkçe karşılık çeldiricileri (dinleme modu için). */
  function pickTrDistractors(target, pool, n = 3) {
    let cands = pool.filter(w =>
      w.word !== target.word &&
      w.level === target.level &&
      w.tr && w.tr !== target.tr);
    if (cands.length < n) {
      cands = pool.filter(w => w.word !== target.word && w.tr && w.tr !== target.tr);
    }
    return sample(cands, n);
  }

  /**
   * Bir soru nesnesi üretir.
   * studyMode: 'mcq' | 'type' | 'listen' | undefined(karışık)
   * dönen: { type, prompt, options[], answer, mode:'mcq'|'type', word, audio? }
   */
  function generate(target, pool, studyMode) {
    // Dinleme modu: kelime sesli okunur, Türkçe anlamı seçilir
    if (studyMode === 'listen') {
      const distractors = pickTrDistractors(target, pool);
      const options = shuffle([target, ...distractors].map(w => w.tr));
      return {
        type: 'listen', mode: 'mcq', word: target, audio: target.word,
        prompt: '🔊 Duyduğun kelimenin anlamı nedir?',
        options, answer: target.tr,
      };
    }

    // Yazarak modu: her zaman tanımdan kelimeyi yaz
    if (studyMode === 'type') {
      return {
        type: 'type', mode: 'type', word: target,
        prompt: `Tanıma uyan kelimeyi yaz:\n“${target.en}”`,
        options: [], answer: target.word,
      };
    }

    // Boşluk doldurma: örnek cümlede kelime boş bırakılır, doğru kelime seçilir.
    // Örnekte kelime yoksa tanımdan kelime seçmeye düşülür.
    if (studyMode === 'fill') {
      const distractors = pickDistractors(target, pool);
      const options = shuffle([target, ...distractors].map(w => w.word));
      const blanked = blankExample(target.word, target.example);
      if (blanked) {
        return {
          type: 'fill', mode: 'mcq', word: target,
          prompt: `Boşluğu doldur:\n“${blanked}”`,
          options, answer: target.word,
        };
      }
      return {
        type: 'm2w', mode: 'mcq', word: target,
        prompt: `Bu tanıma uyan kelime hangisi?\n“${target.en}”`,
        options, answer: target.word,
      };
    }

    // Kelime dizme: karışık harflerden kelimeyi kur (anlam ipucu verilir)
    if (studyMode === 'scramble') {
      return {
        type: 'scramble', mode: 'scramble', word: target, answer: target.word,
        prompt: `Harfleri dizerek kelimeyi oluştur:\n🇹🇷 ${target.tr || target.en}`,
        options: [],
      };
    }

    // Çoktan seçmeli mod: w2m / m2w / fill arasından
    // (mod belirtilmemişse 'type' de dahil karışık)
    const types = studyMode === 'mcq'
      ? ['w2m', 'm2w', 'fill']
      : ['w2m', 'm2w', 'fill', 'type'];
    let type = types[Math.floor(Math.random() * types.length)];

    // fill yalnızca örnek cümlede kelime geçiyorsa kullanılabilir
    if (type === 'fill' && !blankExample(target.word, target.example)) {
      type = 'm2w';
    }

    if (type === 'w2m') {
      const distractors = pickDistractors(target, pool);
      const options = shuffle([target, ...distractors].map(w => w.en));
      return {
        type, mode: 'mcq', word: target,
        prompt: `“${target.word}” (${target.type}) ne anlama gelir?`,
        options, answer: target.en,
      };
    }

    if (type === 'm2w') {
      const distractors = pickDistractors(target, pool);
      const options = shuffle([target, ...distractors].map(w => w.word));
      return {
        type, mode: 'mcq', word: target,
        prompt: `Bu tanım hangi kelimeye ait?\n“${target.en}”`,
        options, answer: target.word,
      };
    }

    if (type === 'fill') {
      const blanked = blankExample(target.word, target.example);
      const distractors = pickDistractors(target, pool);
      const options = shuffle([target, ...distractors].map(w => w.word));
      return {
        type, mode: 'mcq', word: target,
        prompt: `Boşluğu doldur:\n“${blanked}”`,
        options, answer: target.word,
      };
    }

    // type: tanımdan kelimeyi yaz
    return {
      type: 'type', mode: 'type', word: target,
      prompt: `Tanıma uyan kelimeyi yaz:\n“${target.en}”`,
      options: [], answer: target.word,
    };
  }

  function checkTyped(input, answer) {
    const norm = s => s.trim().toLowerCase().replace(/\s+/g, ' ');
    return norm(input) === norm(answer);
  }

  return { generate, checkTyped, shuffle };
})();
