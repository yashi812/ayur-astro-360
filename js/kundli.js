// ============================================================
//  kundli.js — Vedic Birth Chart generation & AI Insights
//  Now powered by VedAstro API via Supabase Edge Function
// ============================================================
import { supabase, requireAuth, signOut } from '../supabase.js';
import { askGemini } from './gemini.js';

// ---- Sidebar / signout ----
document.getElementById('signoutBtn')?.addEventListener('click', signOut);
const sidebar = document.getElementById('sidebar');
const hamburger = document.getElementById('hamburger');
const sidebarBackdrop = document.getElementById('sidebarBackdrop');

hamburger?.addEventListener('click', () => {
  sidebar?.classList.toggle('open');
});

document.addEventListener('click', (event) => {
  if (!sidebar || !hamburger) return;
  const target = event.target;
  if (sidebar.classList.contains('open') && !sidebar.contains(target) && !hamburger.contains(target)) {
    sidebar.classList.remove('open');
  }
});

sidebar?.querySelectorAll('.nav-item').forEach((item) => {
  item.addEventListener('click', () => sidebar.classList.remove('open'));
});

sidebarBackdrop?.addEventListener('click', () => {
  sidebar?.classList.remove('open');
});

// ---- Zodiac data ----
const RASHIS = [
  'Aries ♈','Taurus ♉','Gemini ♊','Cancer ♋','Leo ♌','Virgo ♍',
  'Libra ♎','Scorpio ♏','Sagittarius ♐','Capricorn ♑','Aquarius ♒','Pisces ♓'
];
const PLANETS_LIST = ['Sun ☉','Moon ☽','Mars ♂','Mercury ☿','Jupiter ♃','Venus ♀','Saturn ♄','Rahu ☊','Ketu ☋'];

// ── Planet symbol lookup (for the SVG wheel) ──────────────────────────────────
const PLANET_SYMBOLS = {
  Sun: '☉', Moon: '☽', Mars: '♂', Mercury: '☿',
  Jupiter: '♃', Venus: '♀', Saturn: '♄', Rahu: '☊', Ketu: '☋',
};

// ── Month name → number ───────────────────────────────────────────────────────
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

// ============================================================
//  VedAstro Edge Function call
// ============================================================
/**
 * Calls the vedastro-predictions edge function.
 *
 * @param {string} location  City name, e.g. "Mumbai"
 * @param {string} time      HH:MM (24-hour)
 * @param {string} date      DD/MM/YYYY
 * @param {'raw'|'rich'} mode
 * @returns {Promise<{ positions: Array, richSummary: string }>}
 */
async function fetchVedAstroData(location, time, date, mode = 'raw') {
  const { data, error } = await supabase.functions.invoke('vedastro-predictions', {
    body: { location, time, date, timezone: '+05:30', maxPerCategory: 4, mode },
  });

  if (error) throw new Error(`Edge function error: ${error.message}`);

  if (mode === 'rich') {
    return { positions: [], richSummary: data.summary ?? '' };
  }

  // Parse raw VedAstro payload into the positions shape the UI expects
  const payload = data?.Payload ?? [];
  const positions = parsePositions(payload);
  return { positions, richSummary: '' };
}

/**
 * Parses the raw VedAstro Payload array into the flat positions array
 * the chart renderer and table expect.
 *
 * VedAstro prediction items don't directly give planet positions —
 * we pull them from the Name/Tags fields when available, or fall back
 * to deriving a minimal set so the wheel always renders something.
 *
 * If your edge function returns a richer structure (e.g. planet positions
 * as a separate endpoint), swap this function out.
 */
function parsePositions(payload) {
  // Build a planet → {sign, house, deg} map from prediction Names like
  // "Sun in Aries" or tags that include planet names.
  const found = new Map();

  for (const item of payload) {
    const name = item.Name ?? '';
    // Match patterns like "Sun in Aries" or "Moon in 5th House"
    const signMatch  = name.match(/^(\w+)\s+in\s+([A-Z][a-z]+)/);
    const houseMatch = name.match(/House\s+(\d+)/i);

    if (signMatch) {
      const planetName = signMatch[1];
      const signName   = signMatch[2];
      const rashi = RASHIS.find(r => r.startsWith(signName));
      if (rashi && !found.has(planetName)) {
        found.set(planetName, {
          sign:  rashi,
          house: houseMatch ? parseInt(houseMatch[1]) : 1,
          deg:   '0° 0\'',
        });
      }
    }
  }

  // Map to UI shape; fill any missing planets with placeholder data
  return PLANETS_LIST.map((label, i) => {
    const key = label.split(' ')[0]; // e.g. "Sun" from "Sun ☉"
    const pos = found.get(key);
    return {
      planet: label,
      sign:   pos?.sign  ?? RASHIS[i % 12],
      house:  pos?.house ?? (i % 12) + 1,
      deg:    pos?.deg   ?? '0° 0\'',
    };
  });
}

// ============================================================
//  Fallback: derive pseudo-chart when API is unreachable
// ============================================================
function deriveChart(day, month, year, hour, min) {
  const seed = day + month * 31 + year + hour * 5 + min;
  return PLANETS_LIST.map((planet, i) => ({
    planet,
    sign:  RASHIS[(seed + i * 7) % 12],
    house: ((seed + i * 3) % 12) + 1,
    deg:   `${(seed * (i + 1)) % 30}° ${(seed * (i + 2)) % 60}'`,
  }));
}

// ============================================================
//  SVG Kundli Wheel  (unchanged from original)
// ============================================================
function drawChart(positions) {
  const ns = 'http://www.w3.org/2000/svg';
  const size = 340;
  const cx = size / 2, cy = size / 2, r = 140;
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Vedic Birth Chart');

  // Background
  const bg = document.createElementNS(ns, 'circle');
  bg.setAttribute('cx', cx); bg.setAttribute('cy', cy);
  bg.setAttribute('r', r + 10);
  bg.setAttribute('fill', '#f8f4ed');
  bg.setAttribute('stroke', '#c87d2f');
  bg.setAttribute('stroke-width', '1.5');
  svg.appendChild(bg);

  // Inner circles
  [r * 0.75, r * 0.5, r * 0.25].forEach(ir => {
    const c = document.createElementNS(ns, 'circle');
    c.setAttribute('cx', cx); c.setAttribute('cy', cy);
    c.setAttribute('r', ir);
    c.setAttribute('fill', 'none');
    c.setAttribute('stroke', '#c87d2f');
    c.setAttribute('stroke-width', '0.6');
    c.setAttribute('opacity', '0.5');
    svg.appendChild(c);
  });

  // 12 house lines + rashi labels
  for (let i = 0; i < 12; i++) {
    const angle = (i * 30 - 90) * Math.PI / 180;
    const x1 = cx + Math.cos(angle) * r * 0.25;
    const y1 = cy + Math.sin(angle) * r * 0.25;
    const x2 = cx + Math.cos(angle) * (r + 10);
    const y2 = cy + Math.sin(angle) * (r + 10);
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', x1); line.setAttribute('y1', y1);
    line.setAttribute('x2', x2); line.setAttribute('y2', y2);
    line.setAttribute('stroke', '#c87d2f');
    line.setAttribute('stroke-width', '0.8');
    line.setAttribute('opacity', '0.6');
    svg.appendChild(line);

    const labelAngle = ((i * 30 + 15 - 90) * Math.PI) / 180;
    const lx = cx + Math.cos(labelAngle) * r * 0.88;
    const ly = cy + Math.sin(labelAngle) * r * 0.88;
    const txt = document.createElementNS(ns, 'text');
    txt.setAttribute('x', lx); txt.setAttribute('y', ly);
    txt.setAttribute('text-anchor', 'middle');
    txt.setAttribute('dominant-baseline', 'middle');
    txt.setAttribute('font-size', '9');
    txt.setAttribute('fill', '#1e5c2e');
    txt.setAttribute('font-family', 'DM Sans, sans-serif');
    txt.textContent = RASHIS[i].split(' ')[1]; // symbol only
    svg.appendChild(txt);
  }

  // Planet dots
  positions.slice(0, 7).forEach((p, i) => {
    const houseIdx = p.house - 1;
    const angle = ((houseIdx * 30 + 10 + i * 3 - 90) * Math.PI) / 180;
    const pr = r * 0.58;
    const px = cx + Math.cos(angle) * pr;
    const py = cy + Math.sin(angle) * pr;

    const circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('cx', px); circle.setAttribute('cy', py);
    circle.setAttribute('r', 11);
    circle.setAttribute('fill', '#2d7a3e');
    svg.appendChild(circle);

    const sym = document.createElementNS(ns, 'text');
    sym.setAttribute('x', px); sym.setAttribute('y', py);
    sym.setAttribute('text-anchor', 'middle');
    sym.setAttribute('dominant-baseline', 'middle');
    sym.setAttribute('font-size', '9');
    sym.setAttribute('fill', '#fff');
    sym.setAttribute('font-family', 'DM Sans, sans-serif');
    // Use known symbol, or first char of label as fallback
    const planetKey = p.planet.split(' ')[0];
    sym.textContent = PLANET_SYMBOLS[planetKey] ?? p.planet[0];
    svg.appendChild(sym);
  });

  // Center star
  const ct = document.createElementNS(ns, 'text');
  ct.setAttribute('x', cx); ct.setAttribute('y', cy);
  ct.setAttribute('text-anchor', 'middle');
  ct.setAttribute('dominant-baseline', 'middle');
  ct.setAttribute('font-size', '18');
  ct.setAttribute('fill', '#c87d2f');
  ct.textContent = '✦';
  svg.appendChild(ct);

  return svg;
}

// ============================================================
//  Planet table
// ============================================================
function renderPlanetTable(positions) {
  const tbody = document.getElementById('planetTableBody');
  if (!tbody) return;
  tbody.innerHTML = positions.map(p => `
    <tr>
      <td>${p.planet}</td>
      <td>${p.sign}</td>
      <td>House ${p.house}</td>
      <td>${p.deg}</td>
    </tr>
  `).join('');
}

// ============================================================
//  AI Insights  — prefers richSummary from VedAstro when available
// ============================================================
async function renderInsights(name, positions, richSummary = '') {
  const insightsList = document.getElementById('insightsList');
  if (!insightsList) return;
  insightsList.innerHTML = '<div style="color:var(--text-light);font-size:13px;padding:12px 0;">✨ Generating insights from the cosmos…</div>';

  // Build chart context for Gemini
  const posStr = positions.map(p => `${p.planet} in ${p.sign} (House ${p.house})`).join(', ');

  // Use real VedAstro predictions in the prompt when available
  const vedAstroContext = richSummary
    ? `\n\nVedAstro predictions for this chart:\n${richSummary}`
    : '';

  const prompt =
    `You are an expert Vedic astrologer with deep knowledge of Jyotish. ` +
    `Based on this birth chart for ${name}: ${posStr}.${vedAstroContext} ` +
    `Give 4 concise, personalised insights covering personality, career, health, and relationships. ` +
    `Each insight should be 1-2 sentences. ` +
    `Format as JSON array: [{"title":"...","text":"..."}]`;

  try {
    const raw = await askGemini(prompt);
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('No JSON array in response');
    const items = JSON.parse(match[0]);
    insightsList.innerHTML = items.map(item => `
      <div class="insight-item">
        <strong>${item.title}</strong><br>${item.text}
      </div>
    `).join('');
  } catch {
    // Graceful fallback
    insightsList.innerHTML = positions.slice(0, 4).map((p, i) => {
      const texts = [
        `Your ${p.planet} in ${p.sign} (House ${p.house}) brings a unique energetic influence to your core identity and self-expression.`,
        `This placement in House ${p.house} suggests significant growth opportunities in the areas governed by this house.`,
        `The presence of ${p.planet} in ${p.sign} indicates a karmic pattern calling for conscious development.`,
        `Overall, your chart suggests a soul journey emphasising wisdom, service, and spiritual evolution.`,
      ];
      return `<div class="insight-item"><strong>${p.planet} — ${p.sign}</strong><br>${texts[i]}</div>`;
    }).join('');
  }
}

// ============================================================
//  FORM SUBMIT
// ============================================================
const kundliForm = document.getElementById('kundliForm');
if (kundliForm) {
  kundliForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name     = document.getElementById('kName').value.trim();
    const day      = parseInt(document.getElementById('kDay').value);
    const monthStr = document.getElementById('kMonth').value;
    const month    = MONTHS.indexOf(monthStr) + 1;   // 1-based
    const year     = parseInt(document.getElementById('kYear').value);
    const hour     = parseInt(document.getElementById('kHour').value) || 12;
    const min      = parseInt(document.getElementById('kMin').value)  || 0;
    const city     = document.getElementById('kCity')?.value.trim() || 'Mumbai';

    if (!name || !day || !month || !year) return;

    // Build date / time strings for VedAstro
    const dateStr = `${String(day).padStart(2,'0')}/${String(month).padStart(2,'0')}/${year}`;
    const timeStr = `${String(hour).padStart(2,'0')}:${String(min).padStart(2,'0')}`;

    // Show loading
    document.getElementById('kundliFormCard').style.display = 'none';
    document.getElementById('kundliLoading').style.display  = 'flex';

    let positions   = [];
    let richSummary = '';
    let usedFallback = false;

    try {
      // 1. Fetch raw positions for the wheel + table
      const rawResult  = await fetchVedAstroData(city, timeStr, dateStr, 'raw');
      positions = rawResult.positions;

      // 2. Fetch rich summary in parallel for the insights prompt
      const richResult = await fetchVedAstroData(city, timeStr, dateStr, 'rich');
      richSummary = richResult.richSummary;
    } catch (err) {
      console.warn('VedAstro API unavailable, using fallback chart:', err);
      positions    = deriveChart(day, month, year, hour, min);
      usedFallback = true;
    }

    // Render
    document.getElementById('kundliLoading').style.display  = 'none';
    document.getElementById('kundliResult').style.display   = 'block';
    document.getElementById('resetChart').style.display     = 'inline-flex';

    const svgWrap = document.getElementById('chartSvgWrap');
    if (svgWrap) {
      svgWrap.innerHTML = '';
      svgWrap.appendChild(drawChart(positions));
    }

    if (usedFallback) {
      // Subtle notice — doesn't block the user experience
      const notice = document.createElement('p');
      notice.style.cssText = 'font-size:11px;color:var(--text-light);text-align:center;margin-top:4px;';
      notice.textContent = '⚠ Using estimated chart positions (API unavailable)';
      svgWrap?.after(notice);
    }

    renderPlanetTable(positions);
    renderInsights(name, positions, richSummary);

    // Persist stats
    const prev = parseInt(localStorage.getItem('aa_readings') || '0');
    localStorage.setItem('aa_readings', prev + 1);

    const recent = JSON.parse(localStorage.getItem('aa_recent') || '[]');
    recent.unshift({
      icon: '⭐',
      title: `Kundli for ${name}`,
      meta: new Date().toLocaleDateString(),
      url: 'kundli.html',
    });
    localStorage.setItem('aa_recent', JSON.stringify(recent.slice(0, 10)));
  });
}

// ---- Reset chart ----
document.getElementById('resetChart')?.addEventListener('click', () => {
  document.getElementById('kundliFormCard').style.display = 'block';
  document.getElementById('kundliResult').style.display   = 'none';
  document.getElementById('resetChart').style.display     = 'none';
  document.getElementById('kundliForm').reset();
});

// ---- Auth guard ----
(async () => { await requireAuth(); })();