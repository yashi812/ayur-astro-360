// ============================================================
//  dashboard.js — Dashboard page logic
// ============================================================
import { supabase, getCurrentUser, signOut } from '../supabase.js';

// ---- Shared: toast ----
export function toast(msg, type = 'info') {
  const c = document.getElementById('toast-container');
  if (!c) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => { t.style.animation = 'toastOut .35s ease forwards'; setTimeout(() => t.remove(), 350); }, 3500);
}

// ---- Shared: sidebar hamburger ----
export function initSidebar() {
  const hamburger = document.getElementById('hamburger');
  const sidebar   = document.getElementById('sidebar');
  const backdrop  = document.getElementById('sidebarBackdrop');

  if (!hamburger || !sidebar) return;

  const open  = () => { sidebar.classList.add('open');    backdrop?.classList.add('open'); };
  const close = () => { sidebar.classList.remove('open'); backdrop?.classList.remove('open'); };

  hamburger.addEventListener('click', () =>
    sidebar.classList.contains('open') ? close() : open()
  );

  // Tap backdrop to close
  backdrop?.addEventListener('click', close);

  // Tap any nav link to close (good for same-page or mobile)
  document.querySelectorAll('.nav-item').forEach(l => l.addEventListener('click', close));
}

// ---- Shared: sign out ----
export function initSignout() {
  const btn = document.getElementById('signoutBtn');
  if (btn) btn.addEventListener('click', signOut);
}

// ---- Planets / cosmic forecast ----
const PLANETS = [
  { name: '☉ Sun in Gemini', desc: 'Communication and intellect are highlighted. Express your truth with clarity today.' },
  { name: '☽ Moon in Scorpio', desc: 'Deep emotions surface. Trust your intuition and avoid conflict.' },
  { name: '♂ Mars in Aries', desc: 'High energy and drive. Channel it into purposeful action.' },
  { name: '♀ Venus in Taurus', desc: 'Beauty and sensual pleasures are favoured. Enjoy nature and nourishment.' },
  { name: '☿ Mercury in Cancer', desc: 'Emotional intelligence guides your conversations. Listen before speaking.' },
];

// ---- Greeting ----
function renderGreeting(user) {
  const nameEl = document.getElementById('greetingText');
  const dateEl = document.getElementById('greetingDate');
  if (!nameEl || !dateEl) return;

  const name = user?.user_metadata?.first_name || user?.email?.split('@')[0] || 'Seeker';
  const hour = new Date().getHours();
  const part = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';
  nameEl.textContent = `Good ${part}, ${name} ✨`;

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  dateEl.textContent = `${today} — Your cosmic snapshot awaits`;

  const avatarBtn = document.getElementById('avatarBtn');
  if (avatarBtn) avatarBtn.textContent = name[0].toUpperCase();
}

// ---- Cosmic Forecast ----
function renderForecast() {
  const planet = PLANETS[new Date().getDay() % PLANETS.length];
  const el  = document.getElementById('todayPlanet');
  const sub = document.getElementById('todayDesc');
  if (el)  el.textContent  = planet.name;
  if (sub) sub.textContent = planet.desc;
}

// ---- Dosha bars ----
function renderDoshaBars(profile) {
  const vata  = profile?.vata  || 40;
  const pitta = profile?.pitta || 35;
  const kapha = profile?.kapha || 25;
  const total = vata + pitta + kapha;

  setTimeout(() => {
    ['vata','pitta','kapha'].forEach(d => {
      const pct   = Math.round((({ vata, pitta, kapha })[d] / total) * 100);
      const bar   = document.getElementById(`${d}Bar`);
      const label = document.getElementById(`${d}Pct`);
      if (bar)   bar.style.width   = pct + '%';
      if (label) label.textContent = pct + '%';
    });
  }, 300);
}

// ---- Stats from localStorage ----
function renderStats() {
  const readings = parseInt(localStorage.getItem('aa_readings')  || '0');
  const manifest = parseInt(localStorage.getItem('aa_manifests') || '0');
  const chats    = parseInt(localStorage.getItem('aa_chats')     || '0');

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('statReadings', readings);
  set('statManifest', manifest);
  set('statChats',    chats);
}

// ---- Recent activity from localStorage ----
function renderRecent() {
  const container = document.getElementById('recentList');
  if (!container) return;
  const items = JSON.parse(localStorage.getItem('aa_recent') || '[]').slice(0, 5);
  if (!items.length) return;
  container.innerHTML = items.map(item => `
    <a href="${item.url || '#'}" class="recent-item">
      <span class="recent-icon">${item.icon}</span>
      <div class="recent-text">
        <div class="recent-title">${item.title}</div>
        <div class="recent-meta">${item.meta}</div>
      </div>
      <span class="recent-arrow">›</span>
    </a>
  `).join('');
}

// ============================================================
//  INIT
// ============================================================
(async () => {
  const user = await getCurrentUser();
  initSidebar();
  initSignout();
  renderGreeting(user);
  renderForecast();
  renderStats();
  renderRecent();

  // If there's an authenticated user, try to load dosha from profile table.
  if (user && user.id) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('vata, pitta, kapha')
      .eq('id', user.id)
      .single();

    renderDoshaBars(profile || {});
  } else {
    // No user — render default/sample dosha values without requiring sign-in
    renderDoshaBars({});
  }
})();
