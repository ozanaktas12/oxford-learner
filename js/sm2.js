/* sm2.js — SuperMemo-2 aralıklı tekrar algoritması
 *
 * Kart yapısı:
 *   { ef, interval, reps, due (ISO date), lapses, status, seen }
 *   status: 'new' | 'learning' | 'review'
 *   quality (q): 0–5 kullanıcı performansı (3+ doğru sayılır)
 */
const SM2 = (() => {
  const MIN_EF = 1.3;

  function newCard() {
    return {
      ef: 2.5,
      interval: 0,
      reps: 0,
      lapses: 0,
      due: new Date().toISOString().slice(0, 10),
      status: 'new',
      seen: 0,
    };
  }

  /** SM-2 güncellemesi. q: 0–5. Yeni kartı da kabul eder. */
  function review(card, q) {
    const c = card ? { ...card } : newCard();
    c.seen = (c.seen || 0) + 1;

    if (q < 3) {
      // Başarısız: baştan, kısa süre sonra tekrar
      c.reps = 0;
      c.interval = 1;
      c.lapses = (c.lapses || 0) + 1;
      c.status = 'learning';
    } else {
      c.reps += 1;
      if (c.reps === 1) c.interval = 1;
      else if (c.reps === 2) c.interval = 6;
      else c.interval = Math.round(c.interval * c.ef);

      // EF güncelle
      c.ef = c.ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
      if (c.ef < MIN_EF) c.ef = MIN_EF;

      c.status = c.reps >= 2 ? 'review' : 'learning';
    }

    c.due = addDays(new Date(), c.interval).toISOString().slice(0, 10);
    return c;
  }

  function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  function isDue(card, refDate) {
    if (!card) return false;
    const ref = (refDate || new Date().toISOString().slice(0, 10));
    return card.due <= ref;
  }

  return { newCard, review, isDue };
})();
