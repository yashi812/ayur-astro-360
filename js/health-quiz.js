// ============================================================
//  health-quiz.js — Dosha quiz & remedies (non-module, standalone)
// ============================================================
(function () {
  const QUESTIONS = [
    {
      q: 'What is your natural body frame?',
      options: [
        { text: 'Thin, light, hard to gain weight', v: 2, p: 0, k: 0 },
        { text: 'Medium, muscular, moderate weight', v: 0, p: 2, k: 0 },
        { text: 'Large frame, tends to gain weight easily', v: 0, p: 0, k: 2 },
      ]
    },
    {
      q: 'How is your skin naturally?',
      options: [
        { text: 'Dry, rough, thin', v: 2, p: 0, k: 0 },
        { text: 'Oily, sensitive, prone to redness', v: 0, p: 2, k: 0 },
        { text: 'Smooth, thick, moist', v: 0, p: 0, k: 2 },
      ]
    },
    {
      q: 'How is your digestion?',
      options: [
        { text: 'Irregular — sometimes strong, sometimes not', v: 2, p: 0, k: 0 },
        { text: 'Strong — I feel hungry at regular times', v: 0, p: 2, k: 0 },
        { text: 'Slow but steady — rarely starving', v: 0, p: 0, k: 2 },
      ]
    },
    {
      q: 'How do you handle stress?',
      options: [
        { text: 'Tend to worry and feel anxious', v: 2, p: 0, k: 0 },
        { text: 'Irritated, frustrated — need to solve it', v: 0, p: 2, k: 0 },
        { text: 'Stay calm but may become withdrawn', v: 0, p: 0, k: 2 },
      ]
    },
    {
      q: 'How is your sleep?',
      options: [
        { text: 'Light, interrupted, or restless', v: 2, p: 0, k: 0 },
        { text: 'Moderate — I wake up easily if disturbed', v: 0, p: 2, k: 0 },
        { text: 'Deep, long, and heavy — hard to wake up', v: 0, p: 0, k: 2 },
      ]
    },
    {
      q: 'What is your natural temperament?',
      options: [
        { text: 'Creative, enthusiastic, but easily distracted', v: 2, p: 0, k: 0 },
        { text: 'Focused, driven, opinionated', v: 0, p: 2, k: 0 },
        { text: 'Calm, loving, supportive', v: 0, p: 0, k: 2 },
      ]
    },
    {
      q: 'How do you prefer the weather?',
      options: [
        { text: 'Love warmth — hate cold and wind', v: 2, p: 0, k: 0 },
        { text: 'Love cool air — dislike heat and sun', v: 0, p: 2, k: 0 },
        { text: 'Like any weather but dislike humidity', v: 0, p: 0, k: 2 },
      ]
    },
  ];

  const REMEDIES = {
    Vata: [
      { icon: '🌻', title: 'Warm Sesame Oil Massage', text: 'Daily abhyanga with warm sesame oil grounds and nourishes Vata, calming the nervous system.' },
      { icon: '🍲', title: 'Warm, Cooked Foods', text: 'Favour warm soups, ghee-cooked grains, and root vegetables. Avoid raw, cold, or dry foods.' },
      { icon: '🌙', title: 'Consistent Routine', text: 'A stable daily schedule for sleep, meals, and meditation deeply balances Vata energy.' },
      { icon: '📿', title: 'Brahmi & Ashwagandha', text: 'These adaptogens calm the mind, reduce anxiety, and strengthen the nervous system.' },
      { icon: '🧘', title: 'Gentle Yoga & Pranayama', text: 'Slow, grounding yoga poses and Nadi Shodhana breathing soothe scattered Vata energy.' },
      { icon: '☕', title: 'Warm Herbal Teas', text: 'Ginger, licorice, and cardamom tea after meals aids digestion and warms the body.' },
    ],
    Pitta: [
      { icon: '🥥', title: 'Coconut Oil Cooling', text: 'Coconut oil massage and consumption cools Pitta fire, soothing inflammation and irritation.' },
      { icon: '🥗', title: 'Cool, Fresh Foods', text: 'Favour sweet fruits, leafy greens, cucumber, and dairy. Reduce spicy, salty, and fermented foods.' },
      { icon: '🌸', title: 'Rose & Sandalwood', text: 'Rose water and sandalwood paste cool and calm Pitta both physically and emotionally.' },
      { icon: '🌿', title: 'Aloe Vera & Neem', text: 'These bitter herbs purify the blood and reduce excess heat (Pitta) from the system.' },
      { icon: '🏊', title: 'Cooling Exercise', text: 'Swimming, walking in nature at dawn or dusk, and moon-gazing pacify fiery Pitta.' },
      { icon: '🧊', title: 'Coriander & Fennel Tea', text: 'A cooling herbal tea after meals balances digestive fire without overheating.' },
    ],
    Kapha: [
      { icon: '🌶', title: 'Warming Spices', text: 'Use ginger, black pepper, and turmeric generously to stimulate sluggish Kapha digestion.' },
      { icon: '🏃', title: 'Vigorous Exercise', text: 'Daily brisk walks, dancing, or cardio energise and decongest heavy Kapha energy.' },
      { icon: '🍯', title: 'Light, Dry Foods', text: 'Favour legumes, leafy greens, and light grains. Reduce dairy, sweets, and heavy foods.' },
      { icon: '🌱', title: 'Trikatu Formula', text: 'A traditional Ayurvedic blend of ginger, black pepper, and pippali that kindles digestive fire.' },
      { icon: '☀️', title: 'Morning Sun Ritual', text: 'Rise early (before 6am), exercise, and expose yourself to morning sunlight to lift Kapha.' },
      { icon: '🫚', title: 'Dry Brushing', text: 'Dry garshana massage with raw silk gloves stimulates lymph and invigorates Kapha energy.' },
    ]
  };

  let scores = { v: 0, p: 0, k: 0 };
  let current = 0;
  const answers = {};

  const stepsEl     = document.getElementById('quizSteps');
  const progressFill = document.getElementById('quizProgressFill');
  const stepLabel   = document.getElementById('quizStepLabel');
  const prevBtn     = document.getElementById('prevBtn');
  const nextBtn     = document.getElementById('nextBtn');

  if (!stepsEl) return; // not on health page

  // ---- Build steps ----
  function buildSteps() {
    stepsEl.innerHTML = QUESTIONS.map((q, i) => `
      <div class="quiz-step ${i === 0 ? 'active' : ''}" id="step-${i}">
        <div style="font-size:17px;font-weight:500;color:var(--text-dark);margin-bottom:16px;line-height:1.4;">${q.q}</div>
        <div class="quiz-options">
          ${q.options.map((opt, j) => `
            <button class="quiz-option" data-step="${i}" data-idx="${j}" data-v="${opt.v}" data-p="${opt.p}" data-k="${opt.k}" type="button">
              ${opt.text}
            </button>
          `).join('')}
        </div>
      </div>
    `).join('');

    stepsEl.querySelectorAll('.quiz-option').forEach(btn => {
      btn.addEventListener('click', () => selectOption(btn));
    });
  }

  function selectOption(btn) {
    const step = parseInt(btn.dataset.step);
    stepsEl.querySelectorAll(`[data-step="${step}"]`).forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    answers[step] = { v: parseInt(btn.dataset.v), p: parseInt(btn.dataset.p), k: parseInt(btn.dataset.k) };
    if (nextBtn) nextBtn.disabled = false;
  }

  function updateProgress() {
    const pct = ((current + 1) / QUESTIONS.length) * 100;
    if (progressFill) progressFill.style.width = pct + '%';
    if (stepLabel) stepLabel.textContent = `Question ${current + 1} of ${QUESTIONS.length}`;
    if (prevBtn) prevBtn.style.display = current > 0 ? 'inline-flex' : 'none';
    if (nextBtn) {
      nextBtn.textContent = current === QUESTIONS.length - 1 ? 'See My Dosha ✦' : 'Next →';
      nextBtn.disabled = !answers[current];
    }
  }

  function goTo(idx) {
    stepsEl.querySelector('.quiz-step.active')?.classList.remove('active');
    stepsEl.querySelector(`#step-${idx}`)?.classList.add('active');
    current = idx;
    updateProgress();
  }

  nextBtn?.addEventListener('click', () => {
    if (!answers[current]) { toast('Please select an option', 'info'); return; }
    if (current < QUESTIONS.length - 1) {
      goTo(current + 1);
    } else {
      computeResult();
    }
  });

  prevBtn?.addEventListener('click', () => { if (current > 0) goTo(current - 1); });

  function computeResult() {
    scores = { v: 0, p: 0, k: 0 };
    Object.values(answers).forEach(a => { scores.v += a.v; scores.p += a.p; scores.k += a.k; });

    const total   = scores.v + scores.p + scores.k || 1;
    const vataPct  = Math.round((scores.v / total) * 100);
    const pittaPct = Math.round((scores.p / total) * 100);
    const kaphaPct = Math.round((scores.k / total) * 100);

    const dominant = scores.v >= scores.p && scores.v >= scores.k ? 'Vata'
                   : scores.p >= scores.v && scores.p >= scores.k ? 'Pitta'
                   : 'Kapha';

    const subs = { Vata: 'Air & Ether — Creative, Quick, Changeable', Pitta: 'Fire & Water — Passionate, Sharp, Driven', Kapha: 'Earth & Water — Calm, Stable, Nurturing' };

    // Save to localStorage & Supabase
    localStorage.setItem('aa_dosha', JSON.stringify({ dominant, vata: vataPct, pitta: pittaPct, kapha: kaphaPct }));

    // Show result
    document.getElementById('quizCard').style.display      = 'none';
    document.getElementById('healthResult').style.display  = 'block';
    document.getElementById('retakeBtn').style.display     = 'inline-flex';

    document.getElementById('doshaName').textContent = dominant;
    document.getElementById('doshaSub').textContent  = subs[dominant];
    document.getElementById('doshaBadge').textContent = `🌿 You are ${dominant} dominant`;

    setTimeout(() => {
      document.getElementById('vataBar').style.width   = vataPct  + '%';
      document.getElementById('pittaBar').style.width  = pittaPct + '%';
      document.getElementById('kaphaBar').style.width  = kaphaPct + '%';
      document.getElementById('vataVal').textContent   = vataPct  + '%';
      document.getElementById('pittaVal').textContent  = pittaPct + '%';
      document.getElementById('kaphaVal').textContent  = kaphaPct + '%';
    }, 300);

    // Remedies
    const grid = document.getElementById('remedyGrid');
    if (grid) {
      grid.innerHTML = (REMEDIES[dominant] || []).map(r => `
        <div class="remedy-card">
          <div class="remedy-icon">${r.icon}</div>
          <div class="remedy-title">${r.title}</div>
          <div class="remedy-text">${r.text}</div>
        </div>
      `).join('');
    }
  }

  function toast(msg, type) {
    const c = document.getElementById('toast-container');
    if (!c) return;
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  // Retake
  document.getElementById('retakeBtn')?.addEventListener('click', () => {
    Object.keys(answers).forEach(k => delete answers[k]);
    scores = { v: 0, p: 0, k: 0 };
    current = 0;
    buildSteps();
    updateProgress();
    document.getElementById('healthResult').style.display = 'none';
    document.getElementById('quizCard').style.display     = 'block';
    document.getElementById('retakeBtn').style.display    = 'none';
  });

  buildSteps();
  updateProgress();
})();
