// ============================================================
//  manifestation.js — Manifestation Journal
// ============================================================
import { supabase, requireAuth, signOut } from '../supabase.js';

// ---- Auth & UI init ----
let currentUser = null;
(async () => {
  currentUser = await requireAuth();
  loadEntries();
})();

document.getElementById('signoutBtn')?.addEventListener('click', signOut);
document.getElementById('hamburger')?.addEventListener('click', () => document.getElementById('sidebar')?.classList.toggle('open'));

// ---- Technique definitions ----
const TECHNIQUES = {
  '369': {
    info: '<strong>3-6-9 Method</strong> — Write your intention <strong>3 times</strong> in the morning, <strong>6 times</strong> in the afternoon, and <strong>9 times</strong> at night. Inspired by Nikola Tesla\'s sacred numbers.',
    goal: 18, label: 'of 18 entries today', icon: '🔢'
  },
  '555': {
    info: '<strong>5×55 Method</strong> — Write your affirmation <strong>55 times</strong> for <strong>5 consecutive days</strong>. A powerful reprogramming technique.',
    goal: 55, label: 'of 55 entries today', icon: '✍️'
  },
  'scripting': {
    info: '<strong>Scripting</strong> — Write in your journal as if your desires have already manifested. Use present tense, vivid detail, and gratitude.',
    goal: null, label: '', icon: '📜'
  },
  'affirmation': {
    info: '<strong>Affirmation</strong> — Write a short, powerful positive statement in the present tense. Repeat daily for 21+ days.',
    goal: null, label: '', icon: '💫'
  }
};

let activeTechnique = '369';

// ---- Render technique info ----
function updateTechniqueUI(key) {
  const t = TECHNIQUES[key];
  document.getElementById('techniqueInfo').innerHTML = t.info;
  const counterWrap = document.getElementById('counterWrap');
  if (t.goal) {
    counterWrap.style.display = 'block';
    document.getElementById('entryCounterLabel').textContent = t.label;
    refreshCounter(key);
  } else {
    counterWrap.style.display = 'none';
  }
}

function refreshCounter(key) {
  const today  = new Date().toDateString();
  const stored = JSON.parse(localStorage.getItem(`aa_manifest_${key}_${today}`) || '0');
  document.getElementById('entryCounter').textContent = stored;
}

// ---- Tab buttons ----
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeTechnique = btn.dataset.technique;
    updateTechniqueUI(activeTechnique);
  });
});

updateTechniqueUI(activeTechnique); // init

// ============================================================
//  SAVE ENTRY
// ============================================================
document.getElementById('manifestForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = document.getElementById('manifestText').value.trim();
  if (!text) return;

  const btn = document.getElementById('manifestBtn');
  btn.disabled = true;
  btn.textContent = 'Sealing…';

  // Save to Supabase
  const { error } = await supabase.from('manifestations').insert({
    user_id:   currentUser?.id,
    technique: activeTechnique,
    content:   text,
    created_at: new Date().toISOString()
  });

  if (error) {
    console.warn('Supabase save failed, saving locally:', error.message);
    saveLocally(text);
  }

  // Increment counter
  const today = new Date().toDateString();
  const key   = `aa_manifest_${activeTechnique}_${today}`;
  const count = parseInt(localStorage.getItem(key) || '0') + 1;
  localStorage.setItem(key, count);
  if (document.getElementById('entryCounter')) document.getElementById('entryCounter').textContent = count;

  // Stats
  const prev = parseInt(localStorage.getItem('aa_manifests') || '0');
  localStorage.setItem('aa_manifests', prev + 1);

  // Trigger sacred animation
  showSacredAnimation(activeTechnique);
  document.getElementById('manifestText').value = '';
  btn.disabled = false;
  btn.textContent = '✨ Seal My Intention';

  setTimeout(loadEntries, 500);
});

// ---- Local fallback ----
function saveLocally(text) {
  const entries = JSON.parse(localStorage.getItem('aa_manifest_entries') || '[]');
  entries.unshift({ technique: activeTechnique, content: text, created_at: new Date().toISOString() });
  localStorage.setItem('aa_manifest_entries', JSON.stringify(entries.slice(0, 50)));
}

// ============================================================
//  LOAD ENTRIES
// ============================================================
async function loadEntries() {
  const list = document.getElementById('entryList');
  if (!list) return;

  list.innerHTML = '<div style="color:var(--text-light);font-size:13px;padding:16px 0;text-align:center;">Loading…</div>';

  let entries = [];

  if (currentUser) {
    const { data } = await supabase
      .from('manifestations')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(20);
    entries = data || [];
  }

  // Merge with local
  const local = JSON.parse(localStorage.getItem('aa_manifest_entries') || '[]');
  if (!entries.length && local.length) entries = local;

  if (!entries.length) {
    list.innerHTML = '<div style="color:var(--text-light);font-size:14px;padding:32px 0;text-align:center;">No entries yet — begin your journey 🌿</div>';
    return;
  }

  list.innerHTML = entries.map(e => {
    const t   = TECHNIQUES[e.technique] || { icon: '✨' };
    const date = new Date(e.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
    return `
      <div class="entry-row">
        <span class="entry-icon">${t.icon}</span>
        <div class="entry-body">
          <div class="entry-text">${escapeHtml(e.content)}</div>
          <div class="entry-meta">${e.technique?.toUpperCase() || ''} · ${date}</div>
        </div>
      </div>
    `;
  }).join('');
}

function escapeHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ============================================================
//  SACRED ANIMATION
// ============================================================
const SACRED_CONFIGS = {
  '369': { icon: '🔢', title: 'Numbers Aligned!', sub: '3 · 6 · 9 — Tesla\'s sacred frequency is sealed ✨' },
  '555': { icon: '✍️', title: '55 Times!', sub: 'Your affirmation is being woven into reality 🌌' },
  'scripting': { icon: '📜', title: 'Story Sealed!', sub: 'The universe has received your script ✨' },
  'affirmation': { icon: '💫', title: 'Affirmation Sent!', sub: 'Your intention radiates into the cosmos 🌟' },
};

function showSacredAnimation(technique) {
  const cfg     = SACRED_CONFIGS[technique] || SACRED_CONFIGS['affirmation'];
  const overlay = document.getElementById('sacredOverlay');
  const title   = document.getElementById('sacredTitle');
  const sub     = document.getElementById('sacredSub');
  const mandala = overlay?.querySelector('.sacred-mandala');
  const particles = document.getElementById('sacredParticles');

  if (!overlay) return;

  if (mandala)  mandala.textContent = cfg.icon;
  if (title)    title.textContent   = cfg.title;
  if (sub)      sub.textContent     = cfg.sub;

  // Generate star particles
  if (particles) {
    particles.innerHTML = '';
    for (let i = 0; i < 30; i++) {
      const span = document.createElement('span');
      const x = Math.random() * 100, y = Math.random() * 100;
      const size = Math.random() * 14 + 6;
      const dur  = Math.random() * 2 + 1.5;
      const del  = Math.random() * 1.5;
      span.style.cssText = `
        position:absolute;left:${x}%;top:${y}%;
        font-size:${size}px;opacity:0;
        animation:sacredStar ${dur}s ease ${del}s forwards;
        pointer-events:none;
      `;
      span.textContent = ['✦','⭐','🌟','✨','💫'][Math.floor(Math.random()*5)];
      particles.appendChild(span);
    }
  }

  overlay.classList.add('show');
  setTimeout(() => overlay.classList.remove('show'), 3200);
}

// Inject particle keyframe
const sacredStyle = document.createElement('style');
sacredStyle.textContent = `@keyframes sacredStar { 0%{opacity:0;transform:scale(.5) translateY(20px)} 40%{opacity:1;transform:scale(1.2) translateY(-10px)} 100%{opacity:0;transform:scale(.8) translateY(-40px)} }`;
document.head.appendChild(sacredStyle);
