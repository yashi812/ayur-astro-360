// ============================================================
//  health-quiz.js — Dosha quiz & remedies (non-module, standalone)
// ============================================================
(function () {
  const QUESTIONS = [
    {
      q: 'What is your natural body frame?',
      options: [
        { text: 'Thin, light, hard to gain weight, weak joints', v: 2, p: 0, k: 0 },
        { text: 'Medium, muscular, moderate weight', v: 0, p: 2, k: 0 },
        { text: 'Large frame, tends to gain weight easily', v: 0, p: 0, k: 2 },
      ]
    },
    {
      q: 'How is your skin naturally?',
      options: [
        { text: 'Dry, rough, thin, cold to the touch', v: 2, p: 0, k: 0 },
        { text: 'Oily, sensitive, prone to redness or rashes', v: 0, p: 2, k: 0 },
        { text: 'Smooth, thick, moist, soft', v: 0, p: 0, k: 2 },
      ]
    },
    {
      q: 'How is your digestion?',
      options: [
        { text: 'Irregular — sometimes strong, sometimes not, prone to gas', v: 2, p: 0, k: 0 },
        { text: 'Strong — sharp appetite, prone to acidity if I skip meals', v: 0, p: 2, k: 0 },
        { text: 'Slow but steady — rarely feel starving', v: 0, p: 0, k: 2 },
      ]
    },
    {
      q: 'How do you handle stress?',
      options: [
        { text: 'Tend to worry, overthink, and feel anxious', v: 2, p: 0, k: 0 },
        { text: 'Irritated, critical, frustrated — need to fix it now', v: 0, p: 2, k: 0 },
        { text: 'Stay calm but may withdraw or get complacent', v: 0, p: 0, k: 2 },
      ]
    },
    {
      q: 'How is your sleep?',
      options: [
        { text: 'Light, interrupted, or restless — racing mind at night', v: 2, p: 0, k: 0 },
        { text: 'Moderate — I wake up easily if disturbed', v: 0, p: 2, k: 0 },
        { text: 'Deep, long, and heavy — hard to wake up', v: 0, p: 0, k: 2 },
      ]
    },
    {
      q: 'What is your natural temperament?',
      options: [
        { text: 'Creative, enthusiastic, quick learner, but easily distracted', v: 2, p: 0, k: 0 },
        { text: 'Focused, driven, opinionated, natural leader', v: 0, p: 2, k: 0 },
        { text: 'Calm, loving, patient, and supportive', v: 0, p: 0, k: 2 },
      ]
    },
    {
      q: 'How do you prefer the weather?',
      options: [
        { text: 'Love warmth — hate cold, wind, and dryness', v: 2, p: 0, k: 0 },
        { text: 'Love cool air — dislike heat and strong sun', v: 0, p: 2, k: 0 },
        { text: 'Like most weather but dislike damp, humid, cold days', v: 0, p: 0, k: 2 },
      ]
    },
    {
      q: 'What best describes your memory and thinking style?',
      options: [
        { text: 'Quick to learn, quick to forget; weaker willpower', v: 2, p: 0, k: 0 },
        { text: 'Sharp, precise memory; strong decision-making', v: 0, p: 2, k: 0 },
        { text: 'Slower to learn but rarely forget once I do', v: 0, p: 0, k: 2 },
      ]
    },
  ];

  const REMEDIES = {
    Vata: [
      { icon: '🌻', title: 'Warm Sesame Oil Massage', text: 'Daily abhyanga with warm sesame oil calms Vata\'s dry, cold, restless qualities and soothes the nervous system.' },
      { icon: '🍲', title: 'Warm, Cooked, Grounding Foods', text: 'Favour warm soups, ghee-cooked grains, and sweet, sour, or heavy fruits like bananas and avocados. Avoid raw, cold, or dry foods.' },
      { icon: '🌙', title: 'Consistent Daily Routine', text: 'Rise with the sunrise, keep steady times for meals and sleep, and never skip breakfast — regularity is the strongest medicine for Vata.' },
      { icon: '📿', title: 'Warming Herbal Teas', text: 'Cardamom, cumin, ginger, and cinnamon teas after meals aid digestion and counter Vata\'s tendency toward gas and cramping.' },
      { icon: '🧘', title: 'Gentle Yoga & Meditation', text: 'Slow, grounding yoga and calm meditation quiet the overactive mind and ease the worry and sleeplessness Vata is prone to.' },
      { icon: '☕', title: 'Stay Warm, Avoid Stimulants', text: 'Keep warm in cold weather, reduce caffeine and other stimulants, and get plenty of rest to protect the sensitive Vata digestion.' },
    ],
    Pitta: [
      { icon: '🥥', title: 'Coconut Oil Cooling Massage', text: 'Daily massage with coconut or sunflower oil cools Pitta\'s internal heat and eases irritation and skin rashes.' },
      { icon: '🥗', title: 'Cool, Sweet, Bitter Foods', text: 'Favour juicy fruits like melon and plums, bitter greens like kale and asparagus, and cooling spices like coriander and fennel. Reduce spicy, fried, and fermented foods.' },
      { icon: '🌸', title: 'Cool Water & Moon-Bathing', text: 'A cool swim or bath, and moonlight instead of direct sun, help calm Pitta\'s fiery, workaholic intensity.' },
      { icon: '🌿', title: 'Reduce Caffeine & Alcohol', text: 'Both are hot and sharp in nature and tend to aggravate Pitta — cutting back helps prevent acidity and hyper-acidity.' },
      { icon: '🏊', title: 'Exercise in Cool Hours', text: 'Work out in the cool of morning or evening rather than midday heat, and avoid exposure to fumes or chemicals.' },
      { icon: '🧊', title: 'Early, Regular Sleep', text: 'Aim to be asleep before 10pm, since Pitta runs high from 10pm–2am; a steady meal schedule also keeps digestive fire balanced.' },
    ],
    Kapha: [
      { icon: '🌶', title: 'Warming, Pungent Spices', text: 'Ginger, black pepper, turmeric, cumin, and fenugreek stimulate the slower Kapha digestion and appetite.' },
      { icon: '🏃', title: 'Vigorous Daily Exercise', text: 'Kapha types benefit most from consistent, energetic movement to counter a tendency toward heaviness and lethargy.' },
      { icon: '🍯', title: 'Light, Dry, Warm Foods', text: 'Favour honey, light meals, salads, and pungent, bitter, or astringent foods. Reduce dairy, oil, ghee, sugar, and heavy fried food.' },
      { icon: '🌱', title: 'Warm Herbal & Spice Teas', text: 'Ginger tea stimulates appetite, and spice teas support digestion and help clear the toxins Kapha tends to accumulate.' },
      { icon: '☀️', title: 'Early Rising', text: 'Wake before sunrise and get moving early — Kapha is naturally slower to start, so an active morning ritual lifts energy for the day.' },
      { icon: '🫚', title: 'Dry Brushing (Garshana)', text: 'A brisk dry massage with raw silk gloves before bathing stimulates circulation and helps invigorate sluggish Kapha energy.' },
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

  // Short descriptive blurb + governs list, drawn from the reference material
  const DOSHA_INFO = {
    Vata: {
      sub: 'Air & Ether — Creative, Quick, Changeable',
      blurb: 'Vata governs movement in the body and mind — circulation, breathing, the nervous system, and elimination. Balanced Vata brings creativity and enthusiasm; out of balance it shows up as anxiety, dry skin, and irregular digestion.'
    },
    Pitta: {
      sub: 'Fire & Water — Passionate, Sharp, Driven',
      blurb: 'Pitta governs transformation — digestion, metabolism, and how the eyes and mind process the world. Balanced Pitta brings sharp intellect and leadership; out of balance it shows up as irritability, acidity, and skin inflammation.'
    },
    Kapha: {
      sub: 'Earth & Water — Calm, Stable, Nurturing',
      blurb: 'Kapha governs structure and lubrication — muscle, joints, and the body\'s fluids and immunity. Balanced Kapha brings patience and stability; out of balance it shows up as weight gain, congestion, and sluggishness.'
    }
  };

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

    const info = DOSHA_INFO[dominant];

    const { data: { user } } = await supabase.auth.getUser();
if (user) {
  await supabase.from('dosha_results').upsert({
    user_id: user.id, dominant, vata: vataPct, pitta: pittaPct, kapha: kaphaPct, updated_at: new Date().toISOString(),
  });
}
    // Show result
    document.getElementById('quizCard').style.display      = 'none';
    document.getElementById('healthResult').style.display  = 'block';
    document.getElementById('retakeBtn').style.display     = 'inline-flex';

    document.getElementById('doshaName').textContent = dominant;
    document.getElementById('doshaSub').textContent  = info.sub;
    document.getElementById('doshaBadge').textContent = `🌿 You are ${dominant} dominant`;

    const blurbEl = document.getElementById('doshaBlurb');
    if (blurbEl) blurbEl.textContent = info.blurb;

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