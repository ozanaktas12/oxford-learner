/* storage.js — localStorage tabanlı kalıcı veri katmanı */
const Storage = (() => {
  const KEYS = {
    progress: 'ol_progress',   // { [wordKey]: sm2card }
    settings: 'ol_settings',
    stats: 'ol_stats',         // { reviews, correct, history: {date:count}, streak, lastDay, newToday:{date,count} }
  };

  const DEFAULT_SETTINGS = {
    sessionSize: 20,
    dailyGoal: 20,        // günlük hedef (cevap sayısı)
    speechRate: 'normal', // 'slow' | 'normal' | 'fast'
    autoSpeak: false,     // cevaptan sonra kelimeyi otomatik seslendir
    levels: ['A1', 'A2', 'B1', 'B2'],
  };

  const DEFAULT_STATS = {
    reviews: 0,
    correct: 0,
    xp: 0,            // toplam kazanılan XP
    badges: [],       // açılan rozet id'leri
    history: {},      // 'YYYY-MM-DD' -> reviewed count
    streak: 0,
    lastDay: null,
    newToday: { date: null, count: 0 },
  };

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : structuredClone(fallback);
    } catch (e) {
      console.warn('Storage read failed', key, e);
      return structuredClone(fallback);
    }
  }
  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  // ---- Settings ----
  function getSettings() { return { ...DEFAULT_SETTINGS, ...read(KEYS.settings, DEFAULT_SETTINGS) }; }
  function saveSettings(s) { write(KEYS.settings, { ...getSettings(), ...s }); }

  // ---- Progress (SM-2 cards) ----
  function getProgress() { return read(KEYS.progress, {}); }
  function getCard(key) { return getProgress()[key] || null; }
  function saveCard(key, card) {
    const p = getProgress();
    p[key] = card;
    write(KEYS.progress, p);
  }

  // ---- Stats ----
  function getStats() { return { ...DEFAULT_STATS, ...read(KEYS.stats, DEFAULT_STATS) }; }
  function saveStats(s) { write(KEYS.stats, s); }

  function today() { return new Date().toISOString().slice(0, 10); }

  /** Yeni kelime gösterildiğinde günlük sayacı artır. */
  function recordNewWord() {
    const s = getStats();
    const d = today();
    if (s.newToday.date !== d) s.newToday = { date: d, count: 0 };
    s.newToday.count += 1;
    saveStats(s);
  }
  function newWordsToday() {
    const s = getStats();
    return s.newToday.date === today() ? s.newToday.count : 0;
  }

  /** Bir tekrar/cevap sonucu kaydet, seriyi güncelle. */
  function recordReview(correct) {
    const s = getStats();
    const d = today();
    s.reviews += 1;
    if (correct) s.correct += 1;
    s.history[d] = (s.history[d] || 0) + 1;

    if (s.lastDay !== d) {
      const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      s.streak = s.lastDay === yest ? s.streak + 1 : 1;
      s.lastDay = d;
    }
    saveStats(s);
  }

  /** XP ekle, güncel toplamı döndür. */
  function addXp(amount) {
    if (!amount) return getStats().xp;
    const s = getStats();
    s.xp = (s.xp || 0) + amount;
    saveStats(s);
    return s.xp;
  }

  /** Bugün verilen cevap sayısı (günlük hedef için). */
  function reviewsToday() {
    const s = getStats();
    return s.history[today()] || 0;
  }

  function reset() {
    localStorage.removeItem(KEYS.progress);
    localStorage.removeItem(KEYS.stats);
  }

  return {
    getSettings, saveSettings,
    getProgress, getCard, saveCard,
    getStats, saveStats, addXp,
    recordNewWord, newWordsToday, recordReview, reviewsToday,
    today, reset,
  };
})();
