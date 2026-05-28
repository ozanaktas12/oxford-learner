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
  const session = { queue: [], idx: 0, correct: 0, total: 0 };

  async function initStudy() {
    await loadWords();
    buildSession();
    if (!session.queue.length) {
      show('empty');
      return;
    }
    nextCard();
    bindStudyControls();
  }

  function buildSession() {
    const s = Storage.getSettings();
    const progress = Storage.getProgress();
    const active = WORDS.filter(w => s.levels.includes(w.level));

    // 1) tekrar zamanı gelmiş kartlar
    const dueCards = active
      .filter(w => progress[w.key] && SM2.isDue(progress[w.key]))
      .map(w => ({ word: w, mode: 'quiz' }));

    // 2) yeni kelimeler (günlük limit dahilinde)
    const newLeft = Math.max(0, s.dailyNew - Storage.newWordsToday());
    const newCards = Quiz.shuffle(active.filter(w => !progress[w.key]))
      .slice(0, newLeft)
      .map(w => ({ word: w, mode: 'flash' }));

    let queue = Quiz.shuffle(dueCards).concat(newCards);
    queue = queue.slice(0, s.sessionSize);

    session.queue = queue;
    session.idx = 0;
    session.correct = 0;
    session.total = queue.length;
    updateProgress();
  }

  function updateProgress() {
    const done = session.idx;
    const pct = session.total ? Math.round((done / session.total) * 100) : 0;
    el('session-progress').style.width = pct + '%';
    el('session-meta').textContent = `${done} / ${session.total}`;
  }

  function show(id) {
    ['flashcard', 'quiz', 'done', 'empty'].forEach(p => el(p).classList.add('hidden'));
    el(id).classList.remove('hidden');
  }

  function nextCard() {
    updateProgress();
    if (session.idx >= session.queue.length) {
      el('done-summary').textContent =
        `${session.total} kart çalıştın · ${session.correct} doğru.`;
      show('done');
      return;
    }
    const item = session.queue[session.idx];
    if (item.mode === 'flash') renderFlashcard(item.word);
    else renderQuiz(item.word);
  }

  // ---- Flashcard ----
  function renderFlashcard(word) {
    show('flashcard');
    el('fc-level').textContent = word.level;
    el('fc-word').textContent = word.word;
    el('fc-phon').textContent = word.phon || '';
    el('fc-pos').textContent = word.type;
    el('fc-def').textContent = word.en;
    el('fc-example').textContent = word.example || '';
    el('fc-tr').textContent = word.tr || '';
    el('fc-back').classList.add('hidden');
    el('fc-show').classList.remove('hidden');
    el('fc-grade').classList.add('hidden');
  }

  function bindStudyControls() {
    el('fc-show').onclick = () => {
      el('fc-back').classList.remove('hidden');
      el('fc-show').classList.add('hidden');
      el('fc-grade').classList.remove('hidden');
    };
    el('fc-grade').querySelectorAll('button').forEach(btn => {
      btn.onclick = () => gradeFlashcard(parseInt(btn.dataset.q, 10));
    });
    el('q-submit').onclick = submitTyped;
    el('q-next').onclick = () => { session.idx++; nextCard(); };
  }

  function gradeFlashcard(q) {
    const item = session.queue[session.idx];
    const card = SM2.review(null, q);
    Storage.saveCard(item.word.key, card);
    Storage.recordNewWord();
    Storage.recordReview(q >= 3);
    if (q >= 3) session.correct++;
    session.idx++;
    nextCard();
  }

  // ---- Quiz ----
  let currentQ = null;

  function renderQuiz(word) {
    show('quiz');
    el('q-level').textContent = word.level;
    el('q-feedback').classList.add('hidden');
    el('q-next').classList.add('hidden');

    currentQ = Quiz.generate(word, WORDS);
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
    const q = correct ? 4 : 2;
    const prev = Storage.getCard(item.word.key);
    const card = SM2.review(prev, q);
    Storage.saveCard(item.word.key, card);
    Storage.recordReview(correct);
    if (correct) session.correct++;

    const fb = el('q-feedback');
    fb.className = 'feedback ' + (correct ? 'ok' : 'no');
    fb.classList.remove('hidden');
    fb.innerHTML = correct
      ? `✅ Doğru! <strong>${item.word.word}</strong> — ${item.word.en}`
      : `❌ Yanlış. Doğru cevap: <strong>${currentQ.answer}</strong>`;

    el('q-next').classList.remove('hidden');
    el('q-input').disabled = false;

    // Yanlış cevapta Türkçe karşılığı ve örneği göster
    if (!correct) {
      const div = document.createElement('div');
      div.className = 'ai';
      div.innerHTML =
        (item.word.tr ? `🇹🇷 <strong>${item.word.tr}</strong><br>` : '') +
        `<span class="muted small">${item.word.en}</span>` +
        (item.word.example ? `<br><span class="example">${item.word.example}</span>` : '');
      fb.appendChild(div);
    }
  }

  // -------------------------------------------------------------------- Stats
  async function initStats() {
    await loadWords();
    const st = Storage.getStats();
    const progress = Storage.getProgress();
    const learned = Object.keys(progress).length;
    const acc = st.reviews ? Math.round((st.correct / st.reviews) * 100) : 0;

    el('s-learned').textContent = learned;
    el('s-reviews').textContent = st.reviews;
    el('s-accuracy').textContent = acc + '%';
    el('s-streak').textContent = st.streak;

    renderLevelBars(el('level-bars'), WORDS, progress);
    renderHistory(el('history-chart'), st.history);

    el('reset-btn').onclick = () => {
      if (confirm('Tüm ilerleme ve istatistikler silinecek. Emin misin?')) {
        Storage.reset();
        location.reload();
      }
    };
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
    el('levels').querySelectorAll('input').forEach(cb => {
      cb.checked = s.levels.includes(cb.value);
    });

    el('save-btn').onclick = () => {
      const levels = [...el('levels').querySelectorAll('input:checked')].map(c => c.value);
      Storage.saveSettings({
        dailyNew: parseInt(el('daily-new').value, 10) || 0,
        sessionSize: parseInt(el('session-size').value, 10) || 20,
        levels: levels.length ? levels : ['A1'],
      });
      const msg = el('save-msg');
      msg.textContent = '✓ Kaydedildi';
      setTimeout(() => (msg.textContent = ''), 2000);
    };
  }

  return { initDashboard, initStudy, initStats, initSettings, loadWords };
})();
