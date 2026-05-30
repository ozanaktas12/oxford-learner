/* app.js — sayfa kontrolcüleri: dashboard, study, stats, settings */
const App = (() => {
  const LEVELS = ['A1', 'A2', 'B1', 'B2'];
  let WORDS = [];

  const keyOf = w => `${w.word}|${w.type}|${w.level}`;

  async function loadWords() {
    if (WORDS.length) return WORDS;
    const res = await fetch('data/oxford3000.json');
    WORDS = await res.json();
    WORDS.forEach(w => { w.key = keyOf(w); });
    return WORDS;
  }

  function el(id) { return document.getElementById(id); }

  // ---------------------------------------------------------------- Dashboard
  async function initDashboard() {
    await loadWords();
    const s = Storage.getSettings();
    const progress = Storage.getProgress();

    const active = WORDS.filter(w => s.levels.includes(w.level));
    let due = 0, learned = 0;
    active.forEach(w => {
      const c = progress[w.key];
      if (c) {
        learned++;
        if (SM2.isDue(c)) due++;
      }
    });
    el('due-count').textContent = due;
    el('today-count').textContent = Storage.reviewsToday();
    el('learned-count').textContent = learned;
    el('total-count').textContent = active.length;

    // Seviye + seri rozetleri
    const st = Storage.getStats();
    const info = Game.levelInfo(st.xp);
    el('hero-level').textContent = `⭐ Seviye ${info.level}`;
    el('hero-streak').textContent = `🔥 ${st.streak} gün`;

    // Pozitif/motive edici hero yazısı (azalan sayı framing'i yerine)
    const doneToday = Storage.reviewsToday();
    const goal = s.dailyGoal || 20;
    if (!learned) {
      el('hero-sub').textContent = 'İlk kelimelerini öğrenmeye hazırsın 🚀';
    } else if (doneToday >= goal) {
      el('hero-sub').textContent = `Bugünkü hedefini tamamladın, harikasın! 🎉 Dilersen devam et.`;
    } else {
      el('hero-sub').textContent = `${learned} kelime biliyorsun — böyle devam! 💪`;
    }

    // XP / seviye ilerleme çubuğu
    el('hero-xp-fill').style.width = info.pct + '%';
    el('hero-xp-text').textContent =
      `Seviye ${info.level} · ${info.into}/${info.span} XP (sonraki seviyeye ${info.toNext})`;

    // Günlük hedef halkası
    const gpct = Math.min(100, Math.round((doneToday / goal) * 100));
    const ring = el('ring-fg');
    const CIRC = 2 * Math.PI * 52;
    ring.style.strokeDasharray = CIRC;
    ring.style.strokeDashoffset = CIRC * (1 - gpct / 100);
    el('ring-pct').textContent = `${doneToday}/${goal}`;

    renderLevelBars(el('level-bars'), active, progress);
  }

  function renderLevelBars(container, words, progress) {
    container.innerHTML = '';
    LEVELS.forEach(lvl => {
      const all = words.filter(w => w.level === lvl);
      if (!all.length) return;
      const done = all.filter(w => progress[w.key]).length;
      const pct = all.length ? Math.round((done / all.length) * 100) : 0;
      const row = document.createElement('div');
      row.className = 'level-row';
      row.innerHTML = `
        <span class="level-tag">${lvl}</span>
        <span class="level-track"><span class="level-fill" style="width:${pct}%"></span></span>
        <span class="level-val">${done}/${all.length} (${pct}%)</span>`;
      container.appendChild(row);
    });
  }

  // -------------------------------------------------------------------- Study
  const session = { mode: null, queue: [], idx: 0, correct: 0, total: 0, xp: 0 };

  async function initStudy() {
    await loadWords();
    setupPicker();
  }

  /** Mod seçim ekranını (yeniden) hazırla. Oturumdan çıkışta da çağrılır. */
  function setupPicker() {
    const words = buildWordList();
    if (!words.length) {
      el('mode-picker').classList.add('hidden');
      el('session-wrap').classList.add('hidden');
      show('empty');
      return;
    }
    el('done').classList.add('hidden');
    el('empty').classList.add('hidden');
    el('session-wrap').classList.add('hidden');
    el('mode-picker').classList.remove('hidden');

    // Azalan "kalan kelime" yerine büyüyen/olumlu metrikler göster
    const s = Storage.getSettings();
    const st = Storage.getStats();
    const learned = Object.keys(Storage.getProgress()).length;
    const goal = s.dailyGoal || 20;
    const today = Storage.reviewsToday();
    el('mode-hint').textContent = learned
      ? `🔥 ${st.streak} günlük seri · 📚 ${learned} kelime öğrendin · Bugün ${today}/${goal} hedef`
      : 'Hadi başlayalım! İlk kelimelerini öğrenmeye hazırsın 🚀';

    el('mode-picker').querySelectorAll('.mode-card').forEach(btn => {
      btn.onclick = () => startSession(btn.dataset.mode, words);
    });
  }

  /** Oturumu yarıda bırakıp mod seçimine dön (ilerleme zaten kayıtlı). */
  function exitSession() {
    try { speechSynthesis.cancel(); } catch (_) {}
    setupPicker();
  }

  /** Oturuma girecek kelimeleri seç: tekrar zamanı gelenler + yeni kelimeler.
   *  Hiçbiri kalmadıysa kullanıcı yine de çalışabilsin diye serbest pratik. */
  function buildWordList() {
    const s = Storage.getSettings();
    const progress = Storage.getProgress();
    const active = WORDS.filter(w => s.levels.includes(w.level));
    const size = s.sessionSize || 20;

    const due = Quiz.shuffle(active.filter(w => progress[w.key] && SM2.isDue(progress[w.key])));
    const unlearned = Quiz.shuffle(active.filter(w => !progress[w.key]));

    // Tekrarlar önceliklidir; yeni kelime varsa oturumun ~%30'unu onlara ayır.
    const newQuota = unlearned.length ? Math.ceil(size * 0.3) : 0;
    const dueTake = Math.min(due.length, size - newQuota);
    let list = due.slice(0, dueTake);
    list = list.concat(unlearned.slice(0, size - list.length)); // yeni kelimelerle doldur
    if (list.length < size) list = list.concat(due.slice(dueTake)); // yeni bittiyse kalan tekrarlar

    // Hiçbiri yoksa kullanıcı yine de çalışabilsin → serbest pratik
    if (!list.length) {
      list = Quiz.shuffle(active.filter(w => progress[w.key]).concat(unlearned));
    }

    // Tekrar + yeni iç içe gelsin diye sırayı karıştır
    return Quiz.shuffle(list.slice(0, size));
  }

  function startSession(mode, words) {
    session.mode = mode;
    session.queue = words.map(w => ({ word: w, isNew: !Storage.getCard(w.key) }));
    session.idx = 0;
    session.correct = 0;
    session.total = words.length;
    session.xp = 0;
    session.goalNotified = false;

    el('session-wrap').classList.remove('hidden');
    el('goal-banner').classList.add('hidden');
    bindStudyControls();
    updateXpTag();
    updateProgress();

    if (mode === 'match') startMatchRound();
    else nextCard();
  }

  function updateProgress() {
    const done = session.idx;
    const pct = session.total ? Math.round((done / session.total) * 100) : 0;
    el('session-progress').style.width = pct + '%';
    el('session-meta').textContent = `${done} / ${session.total}`;
  }

  function updateXpTag() { el('xp-tag').textContent = `+${session.xp} XP`; }

  function show(id) {
    el('mode-picker').classList.add('hidden');
    ['quiz', 'match', 'done', 'empty'].forEach(p => el(p).classList.add('hidden'));
    const inSession = (id === 'quiz' || id === 'match');
    el('session-wrap').classList.toggle('hidden', !inSession);
    el(id).classList.remove('hidden');
  }

  // ---- Telaffuz (Web Speech) ----
  let preferredVoice = null;

  /** En doğal/insansı İngilizce sesi seç (varsayılan robotik sesten kaçın). */
  function pickVoice() {
    if (!('speechSynthesis' in window)) return null;
    const voices = speechSynthesis.getVoices();
    if (!voices.length) return null;
    // Kalite sırasına göre tercih edilen sesler (Chrome/Edge/Safari)
    const prefs = [
      'Google US English',
      'Microsoft Aria Online (Natural) - English (United States)',
      'Microsoft Jenny Online (Natural) - English (United States)',
      'Microsoft Guy Online (Natural) - English (United States)',
      'Samantha', 'Ava', 'Allison', 'Susan', 'Karen', 'Tessa', 'Daniel',
      'Microsoft Zira - English (United States)',
      'Google UK English Female',
    ];
    for (const name of prefs) {
      const v = voices.find(v => v.name === name);
      if (v) return v;
    }
    // Yedek: yerel (cihazda yüklü) en-US sesi, sonra herhangi İngilizce
    return voices.find(v => /en[-_]US/i.test(v.lang) && v.localService) ||
           voices.find(v => /en[-_]US/i.test(v.lang)) ||
           voices.find(v => /^en/i.test(v.lang)) || voices[0];
  }

  if ('speechSynthesis' in window) {
    preferredVoice = pickVoice();
    speechSynthesis.onvoiceschanged = () => { preferredVoice = pickVoice(); };
  }

  /** Tarayıcının sesiyle İngilizce kelimeyi oku (dinleme modu). */
  function speak(text) {
    try {
      if (!('speechSynthesis' in window)) return;
      if (!preferredVoice) preferredVoice = pickVoice();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      const rates = { slow: 0.7, normal: 0.95, fast: 1.2 };
      u.rate = rates[Storage.getSettings().speechRate] || 0.95;
      u.pitch = 1;
      if (preferredVoice) u.voice = preferredVoice;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch (e) { /* ses yoksa sessizce geç */ }
  }

  /** Tek bir cevabı kaydet: SM-2 + tekrar/XP/yeni-kelime sayacı. XP'yi döndürür. */
  function recordAnswer(item, correct, mode) {
    const prev = Storage.getCard(item.word.key);
    const card = SM2.review(prev, correct ? 4 : 2);
    Storage.saveCard(item.word.key, card);
    if (item.isNew) { Storage.recordNewWord(); item.isNew = false; }
    Storage.recordReview(correct);
    if (correct) session.correct++;
    const gained = Game.xpForAnswer(item.word, correct, mode);
    if (gained) { session.xp += gained; Storage.addXp(gained); }
    updateXpTag();

    // Günlük hedefi tam geçtiğin an bir kez kutla (sonra kendiliğinden kaybolur)
    const goal = Storage.getSettings().dailyGoal || 20;
    if (!session.goalNotified && Storage.reviewsToday() === goal) {
      session.goalNotified = true;
      showGoalBanner(goal);
    }
    return gained;
  }

  let goalBannerTimer = null;
  function showGoalBanner(goal) {
    const banner = el('goal-banner');
    banner.textContent = `🎉 Günlük hedefine ulaştın! (${goal} cevap) İstersen devam edebilirsin 💪`;
    banner.classList.remove('hidden');
    banner.onclick = () => banner.classList.add('hidden');   // dokununca da kapanır
    clearTimeout(goalBannerTimer);
    goalBannerTimer = setTimeout(() => banner.classList.add('hidden'), 4500);
  }

  let keysBound = false;

  function bindStudyControls() {
    el('q-submit').onclick = submitTyped;
    el('q-next').onclick = advanceCard;
    el('again-btn').onclick = () => setupPicker();
    el('exit-btn').onclick = exitSession;
    if (!keysBound) { document.addEventListener('keydown', handleKey); keysBound = true; }
  }

  function advanceCard() { session.idx++; nextCard(); }

  /** Klavye: 1-4 şık seçer, Enter/Space sonraki adıma geçer. */
  function handleKey(e) {
    if (e.target && e.target.id === 'q-input') return;          // yazarken araya girme
    const advanceKey = (e.key === 'Enter' || e.key === ' ');

    // Eşleştirme turu bittiyse Enter/Space ile devam
    if (!el('match').classList.contains('hidden')) {
      const next = el('match-next');
      if (advanceKey && !next.classList.contains('hidden')) { e.preventDefault(); next.onclick(); }
      return;
    }
    if (el('quiz').classList.contains('hidden')) return;        // sadece kart modunda

    // Cevap verildiyse Enter/Space ile devam
    if (!el('q-next').classList.contains('hidden')) {
      if (advanceKey) { e.preventDefault(); advanceCard(); }
      return;
    }
    // Çoktan seçmelide rakamla seç
    if (currentQ && currentQ.mode === 'mcq') {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= currentQ.options.length) {
        const btns = el('q-options').querySelectorAll('button');
        if (btns[n - 1] && !btns[n - 1].disabled) btns[n - 1].click();
      }
    }
  }

  // ---- Kart modları: çoktan seçmeli / yazarak / dinleme ----
  let currentQ = null;

  function nextCard() {
    updateProgress();
    if (session.idx >= session.queue.length) { finishSession(); return; }
    renderQuiz(session.queue[session.idx]);
  }

  function renderQuiz(item) {
    const word = item.word;
    show('quiz');
    el('q-level').textContent = word.level;
    el('q-feedback').classList.add('hidden');
    el('q-next').classList.add('hidden');

    currentQ = Quiz.generate(word, WORDS, session.mode);

    const audioBtn = el('q-audio');
    if (currentQ.audio) {
      audioBtn.classList.remove('hidden');
      audioBtn.onclick = () => speak(currentQ.audio);
      speak(currentQ.audio);
    } else {
      audioBtn.classList.add('hidden');
    }

    el('q-prompt').textContent = currentQ.prompt;

    const optBox = el('q-options');
    const input = el('q-input');
    const submit = el('q-submit');

    if (currentQ.mode === 'scramble') {
      renderScramble(currentQ);
    } else if (currentQ.mode === 'mcq') {
      optBox.classList.remove('hidden');
      input.classList.add('hidden');
      submit.classList.add('hidden');
      optBox.innerHTML = '';
      currentQ.options.forEach((opt, i) => {
        const b = document.createElement('button');
        b.className = 'option';
        b.dataset.val = opt;
        const num = document.createElement('span');
        num.className = 'opt-num';
        num.textContent = i + 1;
        b.appendChild(num);
        b.appendChild(document.createTextNode(opt));
        b.onclick = () => answerMcq(b, opt);
        optBox.appendChild(b);
      });
    } else {
      optBox.classList.add('hidden');
      input.classList.remove('hidden');
      submit.classList.remove('hidden');
      input.value = '';
      input.disabled = false;
      input.focus();
      input.onkeydown = (e) => { if (e.key === 'Enter') submitTyped(); };
    }
  }

  /** Kelime dizme: karışık harf taşlarından kelimeyi kur. */
  function renderScramble(q) {
    const target = (q.answer || '').toLowerCase();
    el('q-options').classList.remove('hidden');
    el('q-input').classList.add('hidden');
    el('q-submit').classList.add('hidden');

    const pool = Quiz.shuffle(target.split('')).map(ch => ({ ch, used: false }));
    const placed = [];     // yerleştirilen taşların pool indeksleri
    let answered = false;

    const box = el('q-options');
    box.innerHTML = '';
    const slotRow = document.createElement('div'); slotRow.className = 'scramble-slots';
    const poolRow = document.createElement('div'); poolRow.className = 'scramble-pool';
    box.appendChild(slotRow);
    box.appendChild(poolRow);

    const tiles = pool.map((p, i) => {
      const t = document.createElement('button');
      t.className = 'scramble-tile';
      t.textContent = p.ch;
      t.onclick = () => place(i);
      poolRow.appendChild(t);
      return t;
    });

    function redraw() {
      slotRow.innerHTML = '';
      for (let i = 0; i < target.length; i++) {
        const s = document.createElement('div');
        s.className = 'scramble-slot';
        if (i < placed.length) {
          s.textContent = pool[placed[i]].ch;
          s.classList.add('filled');
          const pos = i;
          s.onclick = () => remove(pos);
        }
        slotRow.appendChild(s);
      }
      pool.forEach((p, i) => tiles[i].classList.toggle('used', p.used));
    }

    function place(i) {
      if (answered || pool[i].used) return;
      pool[i].used = true;
      placed.push(i);
      redraw();
      if (placed.length === target.length) check();
    }

    function remove(pos) {
      if (answered) return;
      const i = placed.splice(pos, 1)[0];
      pool[i].used = false;
      redraw();
    }

    function check() {
      answered = true;
      const assembled = placed.map(i => pool[i].ch).join('');
      finishQuiz(assembled === target);
    }

    redraw();
  }

  function answerMcq(btn, choice) {
    const correct = choice === currentQ.answer;
    el('q-options').querySelectorAll('button').forEach(b => {
      b.disabled = true;
      if (b.dataset.val === currentQ.answer) b.classList.add('correct');
      else if (b === btn && !correct) b.classList.add('wrong');
    });
    finishQuiz(correct);
  }

  function submitTyped() {
    if (!currentQ) return;
    const val = el('q-input').value;
    const correct = Quiz.checkTyped(val, currentQ.answer);
    el('q-input').disabled = true;
    el('q-submit').classList.add('hidden');
    finishQuiz(correct);
  }

  function finishQuiz(correct) {
    const item = session.queue[session.idx];
    const gained = recordAnswer(item, correct, session.mode);

    const fb = el('q-feedback');
    fb.className = 'feedback ' + (correct ? 'ok' : 'no');
    fb.classList.remove('hidden');
    fb.innerHTML = correct
      ? `✅ Doğru! <strong>+${gained} XP</strong>`
      : `❌ Yanlış. Doğru cevap: <strong>${currentQ.answer}</strong>`;

    // Her durumda kelimeyi öğret: kelime + 🔊 + okunuş + Türkçe + tanım + örnek
    const w = item.word;
    const div = document.createElement('div');
    div.className = 'ai';

    const wordLine = document.createElement('div');
    wordLine.className = 'ai-word';
    const strong = document.createElement('strong');
    strong.textContent = w.word;
    wordLine.appendChild(strong);
    if (w.phon) {
      const ph = document.createElement('span');
      ph.className = 'muted';
      ph.textContent = w.phon;
      wordLine.appendChild(ph);
    }
    wordLine.appendChild(makeSpeakButton(w.word));
    div.appendChild(wordLine);

    const rest = document.createElement('div');
    rest.innerHTML =
      (w.tr ? `🇹🇷 <strong>${w.tr}</strong><br>` : '') +
      `<span class="muted small">${w.en}</span>` +
      (w.example ? `<br><span class="example">${w.example}</span>` : '');
    div.appendChild(rest);
    fb.appendChild(div);

    // Ayar açıksa kelimeyi otomatik seslendir (dinleme modunda zaten okundu)
    if (Storage.getSettings().autoSpeak && session.mode !== 'listen') speak(w.word);

    el('q-next').classList.remove('hidden');
  }

  /** Kelimenin okunuşunu dinleten küçük 🔊 buton. */
  function makeSpeakButton(word) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'speak-btn';
    b.textContent = '🔊';
    b.title = 'Okunuşunu dinle';
    b.onclick = () => speak(word);
    return b;
  }

  // ---- Eşleştirme modu ----
  let matchState = null;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function startMatchRound() {
    const group = session.queue.slice(session.idx, session.idx + 5);
    if (!group.length) { finishSession(); return; }

    matchState = { group, solved: 0, errored: new Set(), drag: null };
    show('match');
    el('match-feedback').classList.add('hidden');
    el('match-next').classList.add('hidden');

    const left = el('match-left');
    const right = el('match-right');
    left.innerHTML = '';
    right.innerHTML = '';
    el('match-lines').innerHTML = '';

    group.forEach(item => left.appendChild(makeMatchItem(item.word.word, item.word.key, 'left')));
    Quiz.shuffle(group).forEach(item =>
      right.appendChild(makeMatchItem(item.word.tr || item.word.en, item.word.key, 'right')));

    bindMatchDrag();
  }

  function makeMatchItem(text, key, side) {
    const d = document.createElement('div');
    d.className = 'match-item';
    d.textContent = text;
    d.dataset.key = key;
    d.dataset.side = side;
    return d;
  }

  /** Bir öğenin bağlantı noktası (sol öğe sağ kenarı, sağ öğe sol kenarı). */
  function itemAnchor(elm) {
    const ar = el('match-area').getBoundingClientRect();
    const r = elm.getBoundingClientRect();
    const x = elm.dataset.side === 'left' ? r.right - ar.left : r.left - ar.left;
    return { x, y: r.top - ar.top + r.height / 2 };
  }

  function bindMatchDrag() {
    const area = el('match-area');
    const svg = el('match-lines');

    function eventPoint(e) {
      const ar = area.getBoundingClientRect();
      return { x: e.clientX - ar.left, y: e.clientY - ar.top };
    }

    area.onpointerdown = (e) => {
      const item = e.target.closest('.match-item');
      if (!item || item.classList.contains('paired') || !matchState) return;
      e.preventDefault();
      const a = itemAnchor(item);
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('class', 'match-line temp');
      line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
      line.setAttribute('x2', a.x); line.setAttribute('y2', a.y);
      svg.appendChild(line);
      item.classList.add('selected');
      matchState.drag = { item, line };
      try { area.setPointerCapture(e.pointerId); } catch (_) {}
    };

    area.onpointermove = (e) => {
      const d = matchState && matchState.drag;
      if (!d) return;
      const p = eventPoint(e);
      d.line.setAttribute('x2', p.x);
      d.line.setAttribute('y2', p.y);
    };

    function endDrag(e) {
      const d = matchState && matchState.drag;
      if (!d) return;
      matchState.drag = null;
      d.item.classList.remove('selected');
      d.line.remove();
      const t = document.elementFromPoint(e.clientX, e.clientY);
      const target = t && t.closest && t.closest('.match-item');
      if (!target || target === d.item ||
          target.dataset.side === d.item.dataset.side ||
          target.classList.contains('paired')) {
        return; // geçersiz bırakma
      }
      attemptMatch(d.item, target);
    }
    area.onpointerup = endDrag;
    area.onpointercancel = endDrag;
  }

  function attemptMatch(a, b) {
    const byKey = k => matchState.group.find(g => g.word.key === k).word;
    const left = a.dataset.side === 'left' ? a : b;
    const right = a.dataset.side === 'left' ? b : a;
    const leftItem = matchState.group.find(g => g.word.key === left.dataset.key);
    const lw = byKey(left.dataset.key), rw = byKey(right.dataset.key);

    // Aynı kelime VEYA aynı anlam (eş anlamlı karşılıklar için) doğru sayılır
    const isMatch = lw.key === rw.key || (lw.tr && lw.tr === rw.tr);

    if (isMatch) {
      // doğru eşleşme → kalıcı çizgi
      [a, b].forEach(x => { x.classList.add('paired'); x.classList.remove('selected'); });
      drawPermanentLine(a, b);
      // İngilizce kelime taşına dokununca okunsun
      left.classList.add('speakable');
      left.title = 'Okunuşunu dinle';
      left.onclick = () => speak(lw.word);
      left.appendChild(Object.assign(document.createElement('span'), { className: 'tile-speak', textContent: ' 🔊' }));
      matchState.solved++;
      const correct = !matchState.errored.has(left.dataset.key);
      recordAnswer(leftItem, correct, 'match');

      if (matchState.solved >= matchState.group.length) {
        session.idx += matchState.group.length;
        updateProgress();
        const remaining = session.queue.length - session.idx;
        const fb = el('match-feedback');
        fb.className = 'feedback ok';
        fb.classList.remove('hidden');
        fb.textContent = remaining > 0 ? '✅ Tur tamam!' : '✅ Hepsi bitti!';
        const next = el('match-next');
        next.classList.remove('hidden');
        next.textContent = remaining > 0 ? 'Sonraki tur →' : 'Bitir →';
        next.onclick = remaining > 0 ? startMatchRound : finishSession;
      }
    } else {
      // yanlış eşleşme: işaretle + kısa kırmızı uyarı
      matchState.errored.add(a.dataset.key);
      matchState.errored.add(b.dataset.key);
      [a, b].forEach(x => {
        x.classList.add('shake-wrong');
        setTimeout(() => x.classList.remove('shake-wrong'), 450);
      });
    }
  }

  function drawPermanentLine(a, b) {
    const pa = itemAnchor(a), pb = itemAnchor(b);
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('class', 'match-line done');
    line.setAttribute('x1', pa.x); line.setAttribute('y1', pa.y);
    line.setAttribute('x2', pb.x); line.setAttribute('y2', pb.y);
    el('match-lines').appendChild(line);
  }

  // ---- Oturum sonu ----
  function finishSession() {
    const acc = session.total ? Math.round((session.correct / session.total) * 100) : 0;
    el('done-summary').textContent =
      `${session.total} kelime · ${session.correct} doğru (%${acc}).`;
    el('done-xp').textContent = `+${session.xp} XP kazandın!`;

    const stats = Storage.getStats();
    const progress = Storage.getProgress();
    const newBadges = Game.checkBadges(stats, progress, WORDS);
    const box = el('done-badges');
    box.innerHTML = '';
    if (newBadges.length) {
      const h = document.createElement('div');
      h.className = 'muted small';
      h.textContent = 'Yeni rozet açıldı! 🎖️';
      box.appendChild(h);
      newBadges.forEach(b => {
        const chip = document.createElement('span');
        chip.className = 'badge-chip';
        chip.textContent = `${b.icon} ${b.name}`;
        chip.title = b.desc;
        box.appendChild(chip);
      });
    }
    show('done');
  }

  // -------------------------------------------------------------------- Stats
  async function initStats() {
    await loadWords();
    const st = Storage.getStats();
    const progress = Storage.getProgress();
    const learned = Object.keys(progress).length;
    const acc = st.reviews ? Math.round((st.correct / st.reviews) * 100) : 0;

    // XP / seviye başlığı
    const info = Game.levelInfo(st.xp);
    el('xp-level').textContent = `Seviye ${info.level}`;
    el('xp-total').textContent = `${st.xp || 0} XP toplam`;
    el('xp-fill').style.width = info.pct + '%';
    el('xp-next').textContent = `Sonraki seviyeye ${info.toNext} XP`;

    el('s-learned').textContent = learned;
    el('s-reviews').textContent = st.reviews;
    el('s-accuracy').textContent = acc + '%';
    el('s-streak').textContent = st.streak;

    renderBadges(el('badge-grid'), st);
    renderLevelBars(el('level-bars'), WORDS, progress);
    renderHistory(el('history-chart'), st.history);

    el('reset-btn').onclick = () => {
      if (confirm('Tüm ilerleme ve istatistikler silinecek. Emin misin?')) {
        Storage.reset();
        location.reload();
      }
    };
  }

  function renderBadges(container, stats) {
    container.innerHTML = '';
    const owned = new Set(stats.badges || []);
    Game.allBadges().forEach(b => {
      const div = document.createElement('div');
      const has = owned.has(b.id);
      div.className = 'badge-tile' + (has ? ' earned' : ' locked');
      div.title = b.desc;
      div.innerHTML =
        `<span class="badge-tile-icon">${has ? b.icon : '🔒'}</span>` +
        `<span class="badge-tile-name">${b.name}</span>` +
        `<span class="badge-tile-desc">${b.desc}</span>`;
      container.appendChild(div);
    });
  }

  function renderHistory(container, history) {
    container.innerHTML = '';
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      days.push({ d, n: history[d] || 0 });
    }
    const max = Math.max(1, ...days.map(x => x.n));
    days.forEach(x => {
      const bar = document.createElement('div');
      bar.className = 'hist-bar';
      bar.style.height = Math.round((x.n / max) * 100) + '%';
      bar.title = `${x.d}: ${x.n} tekrar`;
      container.appendChild(bar);
    });
  }

  // ----------------------------------------------------------------- Settings
  function initSettings() {
    const s = Storage.getSettings();
    el('session-size').value = s.sessionSize;
    el('daily-goal').value = s.dailyGoal;
    el('speech-rate').value = s.speechRate;
    el('auto-speak').checked = s.autoSpeak;
    el('levels').querySelectorAll('input').forEach(cb => {
      cb.checked = s.levels.includes(cb.value);
    });

    el('save-btn').onclick = () => {
      const levels = [...el('levels').querySelectorAll('input:checked')].map(c => c.value);
      Storage.saveSettings({
        sessionSize: parseInt(el('session-size').value, 10) || 20,
        dailyGoal: parseInt(el('daily-goal').value, 10) || 20,
        speechRate: el('speech-rate').value,
        autoSpeak: el('auto-speak').checked,
        levels: levels.length ? levels : ['A1'],
      });
      const msg = el('save-msg');
      msg.textContent = '✓ Kaydedildi';
      setTimeout(() => (msg.textContent = ''), 2000);
    };
  }

  return { initDashboard, initStudy, initStats, initSettings, loadWords };
})();
