// ============================================================
//  kundli.js — Vedic Birth Chart generation & AI Insights
//  Powered by VedAstro REST API (vedastro.org)
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

// Map English sign names returned by the API → our RASHIS labels
const SIGN_NAME_MAP = {
  Aries: 'Aries ♈', Taurus: 'Taurus ♉', Gemini: 'Gemini ♊',
  Cancer: 'Cancer ♋', Leo: 'Leo ♌', Virgo: 'Virgo ♍',
  Libra: 'Libra ♎', Scorpio: 'Scorpio ♏', Sagittarius: 'Sagittarius ♐',
  Capricorn: 'Capricorn ♑', Aquarius: 'Aquarius ♒', Pisces: 'Pisces ♓',
};

// Planet keys as the VedAstro API expects them
const PLANET_API_NAMES = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];

// Display labels (with Unicode symbol)
const PLANET_DISPLAY = {
  Sun: 'Sun ☉', Moon: 'Moon ☽', Mars: 'Mars ♂', Mercury: 'Mercury ☿',
  Jupiter: 'Jupiter ♃', Venus: 'Venus ♀', Saturn: 'Saturn ♄',
  Rahu: 'Rahu ☊', Ketu: 'Ketu ☋',
};

// SVG symbol lookup
const PLANET_SYMBOLS = {
  Sun: '☉', Moon: '☽', Mars: '♂', Mercury: '☿',
  Jupiter: '♃', Venus: '♀', Saturn: '♄', Rahu: '☊', Ketu: '☋',
};

// Zodiac sign → decorative emoji
const SIGN_EMOJI = {
  Aries: '♈', Taurus: '♉', Gemini: '♊', Cancer: '♋',
  Leo: '♌', Virgo: '♍', Libra: '♎', Scorpio: '♏',
  Sagittarius: '♐', Capricorn: '♑', Aquarius: '♒', Pisces: '♓',
};

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

// ============================================================
//  VedAstro API helpers
// ============================================================
const VEDASTRO_BASE = 'https://api.vedastro.org/api/Calculate';

/**
 * Build the standard VedAstro URL segment for a birth time.
 * date format expected: DD/MM/YYYY (already pre-formatted)
 * time format expected: HH:MM  (24-hour, already pre-formatted)
 */
function buildTimeSegment(location, time, date, timezone = '+05:30') {
  const encLocation = encodeURIComponent(location);
  const encTz = timezone.replace(/\+/g, '%2B');
  // date may contain slashes — no extra encoding needed for the path
  return `Location/${encLocation}/Time/${time}/${date}/${encTz}`;
}

/**
 * Fetch a single planet's sign (Rasi D1).
 * Returns { sign: 'Sagittarius', degStr: '18° 8\' 17' } or null.
 */
async function fetchPlanetSign(planetName, timeSegment) {
  const url = `${VEDASTRO_BASE}/PlanetRasiD1Sign/Planet/${planetName}/${timeSegment}/Ayanamsa/RAMAN`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (data?.Status !== 'Pass') return null;
  const p = data?.Payload?.PlanetRasiD1Sign;
  if (!p) return null;
  return {
    sign: p.Name,
    degStr: p.DegreesIn?.DegreeMinuteSecond ?? '0° 0\' 0',
  };
}

/**
 * Fetch which house a planet occupies.
 * Returns a number 1-12 or null.
 */
async function fetchPlanetHouse(planetName, timeSegment) {
  const url = `${VEDASTRO_BASE}/HousePlanetOccupiesBasedOnSign/Planet/${planetName}/${timeSegment}/Ayanamsa/RAMAN`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (data?.Status !== 'Pass') return null;
  const houseStr = data?.Payload?.HousePlanetOccupiesBasedOnSign ?? '';
  // e.g. "House5" → 5
  const match = houseStr.match(/(\d+)/);
  return match ? parseInt(match[1]) : null;
}

/**
 * Fetch the Ascendant (Lagna) sign from VedAstro using LagnaSignName.
 * Returns { sign: 'Sagittarius', degStr: '' } or null.
 */
async function fetchAscendantSign(timeSegment) {
  // LagnaSignName returns the rising sign name as a plain string
  const url = `${VEDASTRO_BASE}/LagnaSignName/${timeSegment}/Ayanamsa/RAMAN`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.Status !== 'Pass') return null;
    const signName = data?.Payload?.LagnaSignName;
    if (!signName) return null;
    return { sign: signName, degStr: '' };
  } catch {
    return null;
  }
}

/**
 * Fetch all 9 planet positions in parallel.
 * Returns an array of position objects: { planet, sign, house, deg }
 */
async function fetchAllPlanetPositions(location, time, date, timezone = '+05:30') {
  const timeSegment = buildTimeSegment(location, time, date, timezone);

  // Fetch planet data + ascendant simultaneously
  const [planetResults, ascendant] = await Promise.all([
    Promise.all(
      PLANET_API_NAMES.map(async (planetName, i) => {
        try {
          const [signData, house] = await Promise.all([
            fetchPlanetSign(planetName, timeSegment),
            fetchPlanetHouse(planetName, timeSegment),
          ]);

          const signLabel = signData
            ? (SIGN_NAME_MAP[signData.sign] ?? signData.sign)
            : RASHIS[i % 12];

          // Convert "18° 8' 17" to "18° 8'"
          const degFormatted = signData?.degStr
            ? signData.degStr.replace(/(\d+°\s*\d+').*/, '$1')
            : '0° 0\'';

          return {
            planet:    PLANET_DISPLAY[planetName],
            sign:      signLabel,
            house:     house ?? ((i % 12) + 1),
            deg:       degFormatted,
            _rawSign:  signData?.sign ?? '',   // raw English name for emoji lookup
          };
        } catch {
          return {
            planet:   PLANET_DISPLAY[planetName],
            sign:     RASHIS[i % 12],
            house:    (i % 12) + 1,
            deg:      '0° 0\'',
            _rawSign: '',
          };
        }
      })
    ),
    fetchAscendantSign(timeSegment),
  ]);

  // Attach ascendant info to the result set so the banner can use it
  planetResults._ascendant = ascendant;
  return planetResults;
}

// ============================================================
//  VedAstro predictions (for AI context)
// ============================================================
const _kUsefulTags = [
  'Personality', 'General', 'Career', 'Finance', 'Relationships',
  'Marriage', 'Family', 'Education', 'Spirituality', 'Travel',
  'Luck', 'Character', 'Health', 'Mind', 'Intelligence',
];

const _kBlockList = [
  'Deformity', 'Disease', 'Evil', 'Poison', 'Punishment',
  'Imprisonment', 'Death', 'Accident',
];

async function getRichPredictions({ location, time, date, maxPerCategory = 4, timezone = '+05:30' }) {
  try {
    const encLocation = encodeURIComponent(location);
    const encTz = timezone.replace(/\+/g, '%2B');
    const urlStr =
      `${VEDASTRO_BASE}/HoroscopePredictions/` +
      `Location/${encLocation}/Time/${time}/${date}/${encTz}/Ayanamsa/RAMAN`;

    const response = await fetch(urlStr);
    if (!response.ok) return '';
    const data = await response.json();
    const payload = data?.Payload;
    if (!payload || !Array.isArray(payload) || payload.length === 0) return '';

    const grouped = {};
    for (const item of payload) {
      const weight = typeof item.Weight === 'number' ? item.Weight : 0.0;
      if (weight < 0) continue;

      const name = item.Name || '';
      if (_kBlockList.some(b => name.includes(b))) continue;

      const tags = Array.isArray(item.Tags) ? item.Tags : [];
      const desc = (item.Description || '').trim();
      if (desc.length < 20) continue;

      const bucket = tags.find(t => _kUsefulTags.includes(t)) || 'General';
      if (!grouped[bucket]) grouped[bucket] = [];
      if (grouped[bucket].length < maxPerCategory) {
        grouped[bucket].push(desc);
      }
    }

    if (Object.keys(grouped).length === 0) return '';

    let result = '';
    for (const [key, value] of Object.entries(grouped)) {
      result += `[${key}]\n`;
      for (const d of value) result += `- ${d}\n`;
    }
    return result.trim();
  } catch (e) {
    console.error('getRichPredictions error:', e);
    return '';
  }
}

// ============================================================
//  Fallback: derive pseudo-chart when API is unreachable
// ============================================================
function deriveChart(day, month, year, hour, min) {
  const seed = day + month * 31 + year + hour * 5 + min;
  return PLANET_API_NAMES.map((key, i) => ({
    planet: PLANET_DISPLAY[key],
    sign:   RASHIS[(seed + i * 7) % 12],
    house:  ((seed + i * 3) % 12) + 1,
    deg:    `${(seed * (i + 1)) % 30}° ${(seed * (i + 2)) % 60}'`,
  }));
}

// ============================================================
//  SVG Kundli Wheel
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
    const houseIdx = Math.max(0, (p.house || 1) - 1);
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
//  AI Insights
// ============================================================
async function renderInsights(name, positions, richSummary = '') {
  const insightsList = document.getElementById('insightsList');
  if (!insightsList) return;
  insightsList.innerHTML = '<div style="color:var(--text-light);font-size:13px;padding:12px 0;">✨ Generating insights from the cosmos…</div>';

  const posStr = positions.map(p => `${p.planet} in ${p.sign} (House ${p.house})`).join(', ');
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
//  Sun Sign Banner (Big Three: Sun · Moon · Ascendant)
// ============================================================

/**
 * Populate the three sign pills above the chart.
 * @param {Array}       positions  — fetched planet positions array
 * @param {object|null} ascendant  — { sign, degStr } from fetchAscendantSign
 */
function renderSunSignBanner(positions, ascendant) {
  // Sun is always index 0, Moon is index 1 in PLANET_API_NAMES order
  const sun  = positions[0];  // Sun ☉
  const moon = positions[1];  // Moon ☽

  const sunSign  = sun?._rawSign  || '';
  const moonSign = moon?._rawSign || '';
  const lagnaSign = ascendant?.sign || '';

  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  // Sun pill
  setEl('sunEmoji',    SIGN_EMOJI[sunSign]  || '☉');
  setEl('sunSignName', sunSign  || sun?.sign  || '—');
  setEl('sunDeg',      sun?.deg ? `${sun.deg} in ${sunSign}` : '');

  // Moon pill
  setEl('moonEmoji',    SIGN_EMOJI[moonSign] || '☽');
  setEl('moonSignName', moonSign || moon?.sign || '—');
  setEl('moonDeg',      moon?.deg ? `${moon.deg} in ${moonSign}` : '');

  // Lagna / Ascendant pill
  const lagnaLabel = SIGN_NAME_MAP[lagnaSign] ?? lagnaSign;
  const lagnaDegStr = ascendant?.degStr
    ? ascendant.degStr.replace(/(\d+°\s*\d+').*/, '$1')
    : '';
  setEl('lagnaEmoji',    SIGN_EMOJI[lagnaSign] || '⬆');
  setEl('lagnaSignName', lagnaSign || '—');
  setEl('lagnaDeg',      lagnaDegStr ? `${lagnaDegStr} Rising` : 'Ascendant');
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
    let   hour     = parseInt(document.getElementById('kHour').value) || 12;
    const min      = parseInt(document.getElementById('kMin').value)  || 0;
    const ampm     = document.getElementById('kAmpm')?.value ?? 'AM';
    const city     = document.getElementById('kPlace')?.value.trim() || 'Mumbai';

    if (!name || !day || !month || !year) return;

    // Convert 12-hour AM/PM → 24-hour
    if (ampm === 'AM') {
      if (hour === 12) hour = 0;      // 12 AM = midnight = 00:xx
    } else {
      if (hour !== 12) hour += 12;    // PM: add 12 except for 12 PM
    }

    // Build date/time strings for VedAstro  (DD/MM/YYYY  HH:MM)
    const dateStr = `${String(day).padStart(2,'0')}/${String(month).padStart(2,'0')}/${year}`;
    const timeStr = `${String(hour).padStart(2,'0')}:${String(min).padStart(2,'0')}`;

    // Show loading
    document.getElementById('kundliFormCard').style.display = 'none';
    document.getElementById('kundliLoading').style.display  = 'flex';

    let positions    = [];
    let richSummary  = '';
    let usedFallback = false;

    try {
      // Fetch real planetary positions AND predictions in parallel
      const [posResult, richResult] = await Promise.all([
        fetchAllPlanetPositions(city, timeStr, dateStr),
        getRichPredictions({ location: city, time: timeStr, date: dateStr }),
      ]);
      positions   = posResult;
      richSummary = richResult;
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
      const notice = document.createElement('p');
      notice.style.cssText = 'font-size:11px;color:var(--text-light);text-align:center;margin-top:4px;';
      notice.textContent = '⚠ Using estimated chart positions (API unavailable)';
      svgWrap?.after(notice);
    }

    renderSunSignBanner(positions, positions._ascendant ?? null);
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