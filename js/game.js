/* game.js — oyunlaştırma: XP, seviye ve rozetler */
const Game = (() => {
  // ---- XP ----
  const LEVEL_BONUS = { A1: 0, A2: 3, B1: 6, B2: 9 };
  const MODE_BONUS = { mcq: 0, listen: 3, type: 5, match: 2 };

  /** Bir doğru cevabın kazandırdığı XP. Yanlış = 0. */
  function xpForAnswer(word, correct, mode) {
    if (!correct) return 0;
    return 10 + (LEVEL_BONUS[word.level] || 0) + (MODE_BONUS[mode] || 0);
  }

  // Seviye: xp = 100 * (level-1)^2  →  level = floor(sqrt(xp/100)) + 1
  function levelFromXp(xp) { return Math.floor(Math.sqrt((xp || 0) / 100)) + 1; }
  function xpForLevel(level) { return Math.pow(level - 1, 2) * 100; }

  /** Seviye ilerleme bilgisi (çubuk için). */
  function levelInfo(xp) {
    xp = xp || 0;
    const level = levelFromXp(xp);
    const cur = xpForLevel(level);
    const next = xpForLevel(level + 1);
    return {
      level,
      into: xp - cur,            // bu seviyede kazanılan
      span: next - cur,          // bu seviyenin toplam genişliği
      pct: Math.round(((xp - cur) / (next - cur)) * 100),
      toNext: next - xp,
    };
  }

  // ---- Rozetler ----
  const BADGES = [
    { id: 'first',      icon: '🌱', name: 'İlk Adım',        desc: 'İlk kelimeni öğren',
      check: (s, learned) => learned >= 1 },
    { id: 'words50',    icon: '📚', name: 'Kitap Kurdu',     desc: '50 kelime öğren',
      check: (s, learned) => learned >= 50 },
    { id: 'words250',   icon: '🎓', name: 'Bilgin',          desc: '250 kelime öğren',
      check: (s, learned) => learned >= 250 },
    { id: 'words1000',  icon: '👑', name: 'Kelime Ustası',   desc: '1000 kelime öğren',
      check: (s, learned) => learned >= 1000 },
    { id: 'reviews100', icon: '💯', name: 'Yüzler Kulübü',   desc: '100 tekrar yap',
      check: (s) => s.reviews >= 100 },
    { id: 'streak3',    icon: '🔥', name: 'Isınıyor',        desc: '3 gün üst üste çalış',
      check: (s) => s.streak >= 3 },
    { id: 'streak7',    icon: '🚀', name: 'Alev Aldı',       desc: '7 gün üst üste çalış',
      check: (s) => s.streak >= 7 },
    { id: 'streak30',   icon: '🏆', name: 'Azimli',          desc: '30 gün üst üste çalış',
      check: (s) => s.streak >= 30 },
    { id: 'sharp',      icon: '🎯', name: 'Keskin Nişancı',  desc: '≥%90 doğruluk (en az 20 cevap)',
      check: (s) => s.reviews >= 20 && (s.correct / s.reviews) >= 0.9 },
    { id: 'xp1000',     icon: '⭐', name: 'Yıldız',          desc: '1000 XP topla',
      check: (s) => (s.xp || 0) >= 1000 },
    { id: 'xp5000',     icon: '🌟', name: 'Süperstar',       desc: '5000 XP topla',
      check: (s) => (s.xp || 0) >= 5000 },
    { id: 'a1done',     icon: '🅰️', name: 'A1 Tamamlandı',   desc: 'Tüm A1 kelimelerini öğren',
      check: (s, learned, levelDone) => levelDone.A1 },
  ];

  /**
   * Mevcut duruma göre yeni açılan rozetleri bulur ve kaydeder.
   * Dönen: yeni açılan rozet nesneleri dizisi.
   */
  function checkBadges(stats, progress, words) {
    const learned = Object.keys(progress).length;
    const levelDone = {};
    ['A1', 'A2', 'B1', 'B2'].forEach(lvl => {
      const all = words.filter(w => w.level === lvl);
      levelDone[lvl] = all.length > 0 && all.every(w => progress[w.key]);
    });

    const owned = new Set(stats.badges || []);
    const newly = [];
    BADGES.forEach(b => {
      if (!owned.has(b.id) && b.check(stats, learned, levelDone)) {
        owned.add(b.id);
        newly.push(b);
      }
    });
    if (newly.length) {
      stats.badges = [...owned];
      Storage.saveStats(stats);
    }
    return newly;
  }

  function allBadges() { return BADGES; }
  function badgeById(id) { return BADGES.find(b => b.id === id); }

  return { xpForAnswer, levelFromXp, levelInfo, checkBadges, allBadges, badgeById };
})();
