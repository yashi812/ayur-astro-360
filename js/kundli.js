// ============================================================
//  kundli.js — Vedic Birth Chart generation & AI Insights
// ============================================================
import { supabase, requireAuth, signOut } from '../supabase.js';
import { askGemini } from './gemini.js';

// ---- Sidebar / signout ----
document.getElementById('signoutBtn')?.addEventListener('click', signOut);
document.getElementById('hamburger')?.addEventListener('click', () => document.getElementById('sidebar')?.classList.toggle('open'));

// ---- Zodiac data ----
const RASHIS = ['Aries ♈','Taurus ♉','Gemini ♊','Cancer ♋','Leo ♌','Virgo ♍','Libra ♎','Scorpio ♏','Sagittarius ♐','Capricorn ♑','Aquarius ♒','Pisces ♓'];
const PLANETS_LIST = ['Sun ☉','Moon ☽','Mars ♂','Mercury ☿','Jupiter ♃','Venus ♀','Saturn ♄','Rahu ☊','Ketu ☋'];

// ---- Derive a pseudo-chart from birth data (placeholder for real API) ----
function deriveChart(day, month, year, hour, min) {
  const seed = day + month * 31 + year + hour * 5 + min;
  const rand = (n) => (seed * 9301 + 49297) % 233280 / 233280 * n | 0;

  return PLANETS_LIST.map((planet, i) => ({
    planet,
    sign:  RASHIS[(seed + i * 7) % 12],
    house: ((seed + i * 3) % 12) + 1,
    deg:   `${(seed * (i + 1)) % 30}° ${(seed * (i + 2)) % 60}'`
  }));
}

// ---- Draw SVG Kundli Wheel ----
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
  bg.setAttribute('r', r + 10); bg.setAttribute('fill', '#f8f4ed'); bg.setAttribute('stroke', '#c87d2f'); bg.setAttribute('stroke-width', '1.5');
  svg.appendChild(bg);

  // Inner circles
  [r * 0.75, r * 0.5, r * 0.25].forEach(ir => {
    const c = document.createElementNS(ns, 'circle');
    c.setAttribute('cx', cx); c.setAttribute('cy', cy);
    c.setAttribute('r', ir); c.setAttribute('fill', 'none');
    c.setAttribute('stroke', '#c87d2f'); c.setAttribute('stroke-width', '0.6'); c.setAttribute('opacity', '0.5');
    svg.appendChild(c);
  });

  // 12 house lines
  for (let i = 0; i < 12; i++) {
    const angle = (i * 30 - 90) * Math.PI / 180;
    const x1 = cx + Math.cos(angle) * r * 0.25;
    const y1 = cy + Math.sin(angle) * r * 0.25;
    const x2 = cx + Math.cos(angle) * (r + 10);
    const y2 = cy + Math.sin(angle) * (r + 10);
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', x1); line.setAttribute('y1', y1);
    line.setAttribute('x2', x2); line.setAttribute('y2', y2);
    line.setAttribute('stroke', '#c87d2f'); line.setAttribute('stroke-width', '0.8'); line.setAttribute('opacity', '0.6');
    svg.appendChild(line);

    // Rashi label
    const labelAngle = ((i * 30 + 15 - 90) * Math.PI) / 180;
    const lx = cx + Math.cos(labelAngle) * r * 0.88;
    const ly = cy + Math.sin(labelAngle) * r * 0.88;
    const txt = document.createElementNS(ns, 'text');
    txt.setAttribute('x', lx); txt.setAttribute('y', ly);
    txt.setAttribute('text-anchor', 'middle'); txt.setAttribute('dominant-baseline', 'middle');
    txt.setAttribute('font-size', '9'); txt.setAttribute('fill', '#1e5c2e'); txt.setAttribute('font-family', 'DM Sans, sans-serif');
    txt.textContent = RASHIS[i].split(' ')[1]; // just the symbol
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
    circle.setAttribute('r', 11); circle.setAttribute('fill', '#2d7a3e');
    svg.appendChild(circle);

    const sym = document.createElementNS(ns, 'text');
    sym.setAttribute('x', px); sym.setAttribute('y', py);
    sym.setAttribute('text-anchor', 'middle'); sym.setAttribute('dominant-baseline', 'middle');
    sym.setAttribute('font-size', '9'); sym.setAttribute('fill', '#fff'); sym.setAttribute('font-family', 'DM Sans, sans-serif');
    sym.textContent = p.planet.split(' ')[1] || p.planet[0]; // symbol
    svg.appendChild(sym);
  });

  // Center label
  const ct = document.createElementNS(ns, 'text');
  ct.setAttribute('x', cx); ct.setAttribute('y', cy);
  ct.setAttribute('text-anchor', 'middle'); ct.setAttribute('dominant-baseline', 'middle');
  ct.setAttribute('font-size', '18'); ct.setAttribute('fill', '#c87d2f');
  ct.textContent = '✦';
  svg.appendChild(ct);

  return svg;
}

// ---- Populate planet table ----
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

// ---- Build insight prompt & render ----
async function renderInsights(name, positions) {
  const insightsList = document.getElementById('insightsList');
  if (!insightsList) return;
  insightsList.innerHTML = '<div style="color:var(--text-light);font-size:13px;padding:12px 0;">✨ Generating insights from the cosmos…</div>';

  const posStr = positions.map(p => `${p.planet} in ${p.sign} (House ${p.house})`).join(', ');
  const prompt = `You are an expert Vedic astrologer. Based on this birth chart for ${name}: ${posStr}. Give 4 concise, personalised insights covering personality, career, health, and relationships. Each insight should be 1-2 sentences. Format as JSON array: [{"title":"...","text":"..."}]`;

  try {
    const raw = await askGemini(prompt);
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('No JSON');
    const items = JSON.parse(match[0]);
    insightsList.innerHTML = items.map(item => `
      <div class="insight-item">
        <strong>${item.title}</strong><br>${item.text}
      </div>
    `).join('');
  } catch {
    insightsList.innerHTML = positions.slice(0, 4).map((p, i) => {
      const texts = [
        `Your ${p.planet} in ${p.sign} (House ${p.house}) brings a unique energetic influence to your core identity and self-expression.`,
        `This placement in House ${p.house} suggests significant growth opportunities in the areas governed by this house.`,
        `The presence of ${p.planet} in ${p.sign} indicates a karmic pattern calling for conscious development.`,
        `Overall, your chart suggests a soul journey emphasising wisdom, service, and spiritual evolution.`
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
    const name  = document.getElementById('kName').value.trim();
    const day   = parseInt(document.getElementById('kDay').value);
    const month = ['January','February','March','April','May','June','July','August','September','October','November','December']
                    .indexOf(document.getElementById('kMonth').value) + 1;
    const year  = parseInt(document.getElementById('kYear').value);
    const hour  = parseInt(document.getElementById('kHour').value) || 12;
    const min   = parseInt(document.getElementById('kMin').value)  || 0;

    if (!name || !day || !month || !year) return;

    // Show loading
    document.getElementById('kundliFormCard').style.display = 'none';
    document.getElementById('kundliLoading').style.display  = 'flex';

    await new Promise(r => setTimeout(r, 1200)); // UX pause

    const positions = deriveChart(day, month, year, hour, min);

    // Render
    document.getElementById('kundliLoading').style.display  = 'none';
    document.getElementById('kundliResult').style.display   = 'block';
    document.getElementById('resetChart').style.display     = 'inline-flex';

    const svgWrap = document.getElementById('chartSvgWrap');
    if (svgWrap) { svgWrap.innerHTML = ''; svgWrap.appendChild(drawChart(positions)); }

    renderPlanetTable(positions);
    renderInsights(name, positions);

    // Persist stat
    const prev = parseInt(localStorage.getItem('aa_readings') || '0');
    localStorage.setItem('aa_readings', prev + 1);

    // Recent activity
    const recent = JSON.parse(localStorage.getItem('aa_recent') || '[]');
    recent.unshift({ icon: '⭐', title: `Kundli for ${name}`, meta: new Date().toLocaleDateString(), url: 'kundli.html' });
    localStorage.setItem('aa_recent', JSON.stringify(recent.slice(0, 10)));
  });
}

// Reset chart
document.getElementById('resetChart')?.addEventListener('click', () => {
  document.getElementById('kundliFormCard').style.display = 'block';
  document.getElementById('kundliResult').style.display   = 'none';
  document.getElementById('resetChart').style.display     = 'none';
  document.getElementById('kundliForm').reset();
});

// Auth guard
(async () => { await requireAuth(); })();
