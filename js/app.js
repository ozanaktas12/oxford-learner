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
    const newLeft = Math.max(0, s.dailyNew - Storage.newWordsToday());

    el('due-count').textContent = due;
    el('new-count').textContent = newLeft;
    el('learned-count').textContent = learned;
    el('total-count').textContent = active.length;
    el('hero-sub').textContent =
      `${due} tekrar + ${newLeft} yeni kelime seni bekliyor.`;

    // Seviye + XP rozeti
    const st = Storage.getStats();
    const info = Game.levelInfo(st.xp);
    el('hero-level').textContent = `⭐ Seviye ${info.level}`;
    el('hero-streak').textContent = `🔥 ${st.streak} gün`;

    // Günlük hedef
    const doneToday = Storage.reviewsToday();
    const goal = s.dailyGoal || 20;
    const gpct = Math.min(100, Math.round((doneToday / goal) * 100));
    el('goal-fill').style.width = gpct + '%';
    el('goal-text').textContent = doneToday >= goal
      ? `🎉 Günlük hedef tamam! (${doneToday}/${goal})`
      : `Günlük hedef: ${doneToday}/${goal} cevap`;

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
    const words = buildWordList();
    if (!words.length) {
      el('mode-picker').classList.add('hidden');
      show('empty');
      return;
    }
    const due = words.filter(w => Storage.getCard(w.key)).length;
    el('mode-hint').textContent =
      `${words.length} kelime hazır (${due} tekrar + ${words.length - due} yeni). Bir mod seç:`;
    el('mode-picker').querySelectorAll('.mode-card').forEach(btn => {
      btn.onclick = () => startSession(btn.dataset.mode, words);
    });
  }

  /** Oturuma girecek kelimeleri seç: tekrar zamanı gelenler + yeni kelimeler. */
  function buildWordList() {
    const s = Storage.getSettings();
    const progress = Storage.getProgress();
    const active = WORDS.filter(w => s.levels.includes(w.level));

    const due = active.filter(w => progress[w.key] && SM2.isDue(progress[w.key]));
    const newLeft = Math.max(0, s.dailyNew - Storage.newWordsToday());
    const fresh = Quiz.shuffle(active.filter(w => !progress[w.key])).slice(0, newLeft);

    return Quiz.shuffle(due).concat(fresh).slice(0, s.sessionSize);
  }

  function startSession(mode, words) {
    session.mode = mode;
    session.queue = words.map(w => ({ word: w, isNew: !Storage.getCard(w.key) }));
    session.idx = 0;
    session.correct = 0;
    session.total = words.length;
    session.xp = 0;

    el('session-wrap').classList.remove('hidden');
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

  /** Tarayıcının sesiyle İngilizce kelimeyi oku (dinleme modu). */
  function speak(text) {
    try {
      if (!('speechSynthesis' in window)) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = 0.9;
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
    return gained;
  }

  function bindStudyControls() {
    el('q-submit').onclick = submitTyped;
    el('q-next').onclick = () => { session.idx++; nextCard(); };
    el('again-btn').onclick = () => location.reload();
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

    if (currentQ.mode === 'mcq') {
      optBox.classList.remove('hidden');
      input.classList.add('hidden');
      submit.classList.add('hidden');
      optBox.innerHTML = '';
      currentQ.options.forEach(opt => {
        const b = document.createElement('button');
        b.className = 'option';
        b.textContent = opt;
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

  function answerMcq(btn, choice) {
    const correct = choice === currentQ.answer;
    el('q-options').querySelectorAll('button').forEach(b => {
      b.disabled = true;
      if (b.textContent === currentQ.answer) b.classList.add('correct');
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

    // Her durumda kelimeyi öğret: kelime + okunuş + Türkçe + tanım + örnek
    const w = item.word;
    const div = document.createElement('div');
    div.className = 'ai';
    div.innerHTML =
      `<strong>${w.word}</strong> <span class="muted">${w.phon || ''}</span><br>` +
      (w.tr ? `🇹🇷 <strong>${w.tr}</strong><br>` : '') +
      `<span class="muted small">${w.en}</span>` +
      (w.example ? `<br><span class="example">${w.example}</span>` : '');
    fb.appendChild(div);

    el('q-next').classList.remove('hidden');
  }

  // ---- Eşleştirme modu ----
  let matchState = null;

  function startMatchRound() {
    const group = session.queue.slice(session.idx, session.idx + 5);
    if (!group.length) { finishSession(); return; }

    matchState = { group, selectedLeft: null, solved: 0, errored: new Set() };
    show('match');
    el('match-feedback').classList.add('hidden');
    el('match-next').classList.add('hidden');

    const left = el('match-left');
    const right = el('match-right');
    left.innerHTML = '';
    right.innerHTML = '';

    group.forEach(item => {
      const b = document.createElement('button');
      b.className = 'match-item';
      b.textContent = item.word.word;
      b.onclick = () => selectLeft(b, item);
      left.appendChild(b);
    });
    Quiz.shuffle(group).forEach(item => {
      const b = document.createElement('button');
      b.className = 'match-item';
      b.textContent = item.word.tr || item.word.en;
      b.onclick = () => selectRight(b, item);
      right.appendChild(b);
    });
  }

  function selectLeft(btn, item) {
    if (btn.classList.contains('paired')) return;
    el('match-left').querySelectorAll('.match-item').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    matchState.selectedLeft = { btn, item };
  }

  function selectRight(btn, item) {
    if (btn.classList.contains('paired')) return;
    const sel = matchState.selectedLeft;
    if (!sel) return;

    if (sel.item.word.key === item.word.key) {
      // doğru eşleşme
      [sel.btn, btn].forEach(b => {
        b.classList.add('paired'); b.classList.remove('selected'); b.disabled = true;
      });
      matchState.selectedLeft = null;
      matchState.solved++;
      const correct = !matchState.errored.has(item.word.key);
      recordAnswer(item, correct, 'match');

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
      // yanlış eşleşme: ilgili kelimeleri işaretle, kısa kırmızı uyarı
      matchState.errored.add(sel.item.word.key);
      matchState.errored.add(item.word.key);
      btn.classList.add('shake-wrong');
      sel.btn.classList.add('shake-wrong');
      const a = sel.btn;
      setTimeout(() => {
        btn.classList.remove('shake-wrong');
        a.classList.remove('shake-wrong', 'selected');
      }, 450);
      matchState.selectedLeft = null;
    }
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
    el('daily-new').value = s.dailyNew;
    el('session-size').value = s.sessionSize;
    el('daily-goal').value = s.dailyGoal;
    el('levels').querySelectorAll('input').forEach(cb => {
      cb.checked = s.levels.includes(cb.value);
    });

    el('save-btn').onclick = () => {
      const levels = [...el('levels').querySelectorAll('input:checked')].map(c => c.value);
      Storage.saveSettings({
        dailyNew: parseInt(el('daily-new').value, 10) || 0,
        sessionSize: parseInt(el('session-size').value, 10) || 20,
        dailyGoal: parseInt(el('daily-goal').value, 10) || 20,
        levels: levels.length ? levels : ['A1'],
      });
      const msg = el('save-msg');
      msg.textContent = '✓ Kaydedildi';
      setTimeout(() => (msg.textContent = ''), 2000);
    };
  }

  return { initDashboard, initStudy, initStats, initSettings, loadWords };
})();
