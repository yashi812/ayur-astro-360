// ============================================================
//  kundli.js — Vedic Birth Chart generation & AI Insights
//  Planetary positions + ascendant + yogas + dasha, all powered by the
//  `generate-kundli` Supabase Edge Function, which now calls the
//  OpenKundali API (https://openkundali.com/api-docs) server-side.
//  The birth city is still geocoded client-side (Open-Meteo, free/no-key)
//  to get real lat/long + an IANA timezone, since the "City, Country"
//  form field alone isn't enough for chart calculation — OpenKundali
//  REQUIRES real coordinates (it has no name-based geocoding at all,
//  unlike the old VedAstro planet endpoint).
//  AI insights via Gemini (proxied through Supabase Edge Fn)
//
//  PERSISTENCE:
//  Every generated kundli — full birth inputs AND the complete
//  computed result (planet positions, ascendant, houses, yoga summary,
//  dasha, birth lat/long) — is saved to localStorage under
//  'aa_kundli_saves'. Opening a saved reading (via ?id=... or the
//  "Recent" sidebar list) replays it straight from cache: no
//  re-geocoding, no re-hitting generate-kundli for the natal chart —
//  though Gochar (being "today") is refetched live if lat/long was
//  persisted with the save.
//
//  HINDI/DEVANAGARI:
//  Planetary Positions table, Dasha panel, and Gochar panel all render
//  in Devanagari using PLANET_NAME_HI / SIGN_NAME_HI lookups keyed off
//  the same English planet key / _rawSign already used everywhere else
//  in this file.
//
//  DASHA PANEL:
//  Shows current Mahadasha → Antardasha → Pratyantardasha from
//  positions._dasha (already returned by generate-kundli — no new
//  network call). If dasha.period contains a parseable date range,
//  also renders a progress bar (% complete + years remaining in the
//  current Mahadasha). parseDashaPeriodDates() is intentionally
//  defensive — it tries a few common date-range string shapes and
//  silently skips the progress bar if nothing matches, rather than
//  guessing/fabricating a percentage from an unknown format.
//
//  GOCHAR PANEL:
//  Fetches TODAY's planetary positions (same birth lat/long, current
//  date/time) via a second generate-kundli call, then shows each
//  transiting planet's house counted FROM the natal Moon sign
//  (Chandra rashi) — the traditional way Gochar is read — tagged
//  शुभ/सामान्य/अशुभ per the classical per-planet house-effect rules in
//  GOCHAR_EFFECTS. Requires real birth lat/long, so it's skipped when
//  a fallback/estimated chart was used, or when replaying an older
//  saved reading that didn't persist coordinates.
// ============================================================
import { supabase, requireAuth, signOut } from '../supabase.js';
import { askGemini } from './gemini.js';
import { drawNorthIndianChart } from './chart-renderer.js';

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
  'Aries \u2648','Taurus \u2649','Gemini \u264a','Cancer \u264b','Leo \u264c','Virgo \u264d',
  'Libra \u264e','Scorpio \u264f','Sagittarius \u2650','Capricorn \u2651','Aquarius \u2652','Pisces \u2653'
];

// Fixed rashi order — index in this array = the sign's fixed box in the
// South-Indian-style wheel drawn by drawChart(). Used to place planets by
// their ACTUAL sign, not by house number (house number rotates with the
// Ascendant and has no fixed box in this layout).
const SIGN_ORDER = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
];

// Map English sign names returned by the API to our RASHIS labels
const SIGN_NAME_MAP = {
  Aries: 'Aries \u2648', Taurus: 'Taurus \u2649', Gemini: 'Gemini \u264a',
  Cancer: 'Cancer \u264b', Leo: 'Leo \u264c', Virgo: 'Virgo \u264d',
  Libra: 'Libra \u264e', Scorpio: 'Scorpio \u264f', Sagittarius: 'Sagittarius \u2650',
  Capricorn: 'Capricorn \u2651', Aquarius: 'Aquarius \u2652', Pisces: 'Pisces \u2653',
};

// ---- Devanagari labels for Planetary Positions / Dasha / Gochar panels ----
const PLANET_NAME_HI = {
  Sun: 'सूर्य', Moon: 'चंद्र', Mars: 'मंगल', Mercury: 'बुध',
  Jupiter: 'गुरु', Venus: 'शुक्र', Saturn: 'शनि', Rahu: 'राहु', Ketu: 'केतु',
};

const SIGN_NAME_HI = {
  Aries: 'मेष', Taurus: 'वृषभ', Gemini: 'मिथुन', Cancer: 'कर्क',
  Leo: 'सिंह', Virgo: 'कन्या', Libra: 'तुला', Scorpio: 'वृश्चिक',
  Sagittarius: 'धनु', Capricorn: 'मकर', Aquarius: 'कुंभ', Pisces: 'मीन',
};

const DEVANAGARI_DIGITS_KUNDLI = ['०','१','२','३','४','५','६','७','८','९'];
function toDevanagariNum(n) {
  return String(n).split('').map((d) => DEVANAGARI_DIGITS_KUNDLI[parseInt(d, 10)] ?? d).join('');
}

// ============================================================
//  Classical Gochar (transit) house-effect rules, per planet,
//  counted from the natal Moon (Chandra rashi) = house 1.
//  'good' | 'neutral' | 'bad' — standard Jyotish guidance.
// ============================================================
const GOCHAR_EFFECTS = {
  Sun:     { good: [3, 6, 10, 11],                bad: [1, 4, 5, 7, 8, 9, 12] },
  Moon:    { good: [1, 3, 6, 7, 10, 11],           bad: [2, 4, 5, 8, 9, 12] },
  Mars:    { good: [3, 6, 11],                     bad: [1, 2, 4, 5, 7, 8, 9, 10, 12] },
  Mercury: { good: [2, 4, 6, 8, 10, 11],            bad: [1, 3, 5, 7, 9, 12] },
  Jupiter: { good: [2, 5, 7, 9, 11],                bad: [1, 3, 4, 6, 8, 10, 12] },
  Venus:   { good: [1, 2, 3, 4, 5, 8, 9, 11, 12],   bad: [6, 7, 10] },
  Saturn:  { good: [3, 6, 11],                     bad: [1, 2, 4, 5, 7, 8, 9, 10, 12] },
  Rahu:    { good: [3, 6, 11],                     bad: [1, 2, 4, 5, 7, 8, 9, 10, 12] },
  Ketu:    { good: [3, 6, 11],                     bad: [1, 2, 4, 5, 7, 8, 9, 10, 12] },
};

function getGocharTag(planetName, houseFromMoon) {
  const rule = GOCHAR_EFFECTS[planetName];
  if (!rule || !houseFromMoon) return null;
  if (rule.good.indexOf(houseFromMoon) !== -1) return { level: 'good', label: 'शुभ' };
  if (rule.bad.indexOf(houseFromMoon) !== -1) return { level: 'bad', label: 'अशुभ' };
  return { level: 'neutral', label: 'सामान्य' };
}

// ============================================================
//  Mahadasha progress — attempts to parse a date range out of
//  dasha.period (whatever shape generate-kundli/OpenKundali returns
//  it in — the edge function passes it through unmodified). Silently
//  returns null if no usable dates are found, rather than guessing.
// ============================================================
function parseDashaPeriodDates(dasha) {
  if (!dasha || typeof dasha.period !== 'string') return null;

  const patterns = [
    /(\d{1,2}\s+\w+\s+\d{4})\s*[-–to]+\s*(\d{1,2}\s+\w+\s+\d{4})/i,
    /(\d{4}-\d{2}-\d{2})\s*[-–to]+\s*(\d{4}-\d{2}-\d{2})/i,
    /(\d{1,2}\/\d{1,2}\/\d{4})\s*[-–to]+\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
  ];
  for (const re of patterns) {
    const m = dasha.period.match(re);
    if (m) {
      const start = new Date(m[1]);
      const end = new Date(m[2]);
      if (!isNaN(start) && !isNaN(end)) return { start, end };
    }
  }
  return null;
}

function computeDashaProgress(dates) {
  const now = new Date();
  const total = dates.end - dates.start;
  if (total <= 0) return null;
  const elapsed = now - dates.start;
  const pct = Math.max(0, Math.min(100, (elapsed / total) * 100));
  const yearsLeft = Math.max(0, (dates.end - now) / (1000 * 60 * 60 * 24 * 365.25));
  return { pct: Math.round(pct), yearsLeft: yearsLeft.toFixed(1) };
}

// Planet keys as OpenKundali / the generate-kundli edge function returns them
const PLANET_API_NAMES = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];

// Display labels (with Unicode symbol)
const PLANET_DISPLAY = {
  Sun: 'Sun \u2609', Moon: 'Moon \u263d', Mars: 'Mars \u2642', Mercury: 'Mercury \u263f',
  Jupiter: 'Jupiter \u2643', Venus: 'Venus \u2640', Saturn: 'Saturn \u2644',
  Rahu: 'Rahu \u260a', Ketu: 'Ketu \u260b',
};

// SVG symbol lookup
const PLANET_SYMBOLS = {
  Sun: '\u2609', Moon: '\u263d', Mars: '\u2642', Mercury: '\u263f',
  Jupiter: '\u2643', Venus: '\u2640', Saturn: '\u2644', Rahu: '\u260a', Ketu: '\u260b',
};

// Zodiac sign decorative emoji
const SIGN_EMOJI = {
  Aries: '\u2648', Taurus: '\u2649', Gemini: '\u264a', Cancer: '\u264b',
  Leo: '\u264c', Virgo: '\u264d', Libra: '\u264e', Scorpio: '\u264f',
  Sagittarius: '\u2650', Capricorn: '\u2651', Aquarius: '\u2652', Pisces: '\u2653',
};

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

// ============================================================
//  Persistence — full save/load of inputs + computed chart
// ============================================================
const SAVES_KEY = 'aa_kundli_saves';
const MAX_SAVES = 30;

function genId() {
  return 'k_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function loadAllSaves() {
  try {
    const raw = localStorage.getItem(SAVES_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    console.warn('[loadAllSaves] corrupt store, resetting:', e);
    return [];
  }
}

function getSaveById(id) {
  if (!id) return null;
  return loadAllSaves().find(function (r) { return r.id === id; }) || null;
}

/**
 * Serialise the exact form inputs + the exact computed result
 * (positions, ascendant, dasha, yoga summary, birth lat/long, and
 * whether a fallback chart was used) so a saved reading can be
 * replayed pixel-for-pixel with zero re-fetching (except Gochar,
 * which is inherently "today" and refetched live when lat/long
 * was persisted).
 */
function buildSaveRecord(inputs, positions, richSummary, usedFallback, birthLatLng) {
  const plainPositions = positions.map(function (p) {
    return {
      planet: p.planet, sign: p.sign, house: p.house, deg: p.deg,
      _rawSign: p._rawSign, _retrograde: p._retrograde || false,
      _combust: p._combust || false,
    };
  });

  return {
    id: genId(),
    savedAt: new Date().toISOString(),
    inputs: inputs, // { name, day, month, monthName, year, hour, min, city, dateStr, timeStr }
    result: {
      positions: plainPositions,
      ascendant: positions._ascendant || null,
      dasha: positions._dasha || null,
      richSummary: richSummary || '',
      usedFallback: !!usedFallback,
      birthLatLng: birthLatLng || null,
    },
  };
}

async function saveKundliRecord(record) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return record.id;

  const { error } = await supabase.from('kundli_saves').insert({
    id: record.id,
    user_id: user.id,
    saved_at: record.savedAt,
    inputs: record.inputs,
    result: record.result,
  });
  if (error) console.warn('[saveKundliRecord] Supabase write failed:', error);
  return record.id;
}

async function getSaveById(id) {
  if (!id) return null;
  const { data, error } = await supabase
    .from('kundli_saves')
    .select('*')
    .eq('id', id)
    .single();
  if (error || !data) return null;
  return { id: data.id, savedAt: data.saved_at, inputs: data.inputs, result: data.result };
}

async function saveKundliRecord(record) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return record.id;

  const { error } = await supabase.from('kundli_saves').insert({
    id: record.id,
    user_id: user.id,
    saved_at: record.savedAt,
    inputs: record.inputs,
    result: record.result,
  });
  if (error) console.warn('[saveKundliRecord] Supabase write failed:', error);
  return record.id;
}

async function getSaveById(id) {
  if (!id) return null;
  const { data, error } = await supabase
    .from('kundli_saves')
    .select('*')
    .eq('id', id)
    .single();
  if (error || !data) return null;
  return { id: data.id, savedAt: data.saved_at, inputs: data.inputs, result: data.result };
}

async function loadAllSaves() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('kundli_saves')
    .select('*')
    .eq('user_id', user.id)
    .order('saved_at', { ascending: false })
    .limit(30);
  if (error || !data) return [];
  return data.map(r => ({ id: r.id, savedAt: r.saved_at, inputs: r.inputs, result: r.result }));
}

/** Rehydrate a saved record back into the `positions` shape the renderers expect. */
function hydratePositionsFromSave(record) {
  const positions = record.result.positions.map(function (p) { return Object.assign({}, p); });
  positions._ascendant = record.result.ascendant || null;
  positions._dasha = record.result.dasha || null;
  return positions;
}

/**
 * Search Open-Meteo for up to `count` city matches — used to populate the
 * autocomplete dropdown as the user types.
 */
async function searchCitySuggestions(query, count) {
  if (count === undefined) count = 5;
  const term = query.split(',')[0].trim();
  if (term.length < 2) return [];

  try {
    const res = await fetch(
      'https://geocoding-api.open-meteo.com/v1/search?name=' +
        encodeURIComponent(term) + '&count=' + count + '&language=en&format=json',
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const results = (data && Array.isArray(data.results)) ? data.results : [];
    return results
      .filter(function (hit) { return typeof hit.latitude === 'number' && typeof hit.longitude === 'number'; })
      .map(function (hit) {
        return {
          latitude: hit.latitude,
          longitude: hit.longitude,
          timezone: hit.timezone || null,
          resolvedName: [hit.name, hit.admin1, hit.country].filter(Boolean).join(', '),
        };
      });
  } catch (e) {
    console.warn('[searchCitySuggestions] lookup failed:', e);
    return [];
  }
}

const _selectedPlaceCache = new Map();

function setupPlaceAutocomplete() {
  const input = document.getElementById('kPlace');
  if (!input) return;

  const dropdown = document.createElement('ul');
  dropdown.setAttribute('role', 'listbox');
  dropdown.style.cssText =
    'position:absolute;z-index:50;list-style:none;margin:2px 0 0;padding:4px 0;' +
    'background:#fff;border:1px solid #e2d9c8;border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,0.12);' +
    'max-height:220px;overflow-y:auto;display:none;font-size:14px;min-width:220px;';

  const parent = input.parentElement;
  if (parent && getComputedStyle(parent).position === 'static') {
    parent.style.position = 'relative';
  }
  (parent || input).appendChild(dropdown);

  let debounceId = null;
  let activeIndex = -1;
  let currentResults = [];

  function hideDropdown() {
    dropdown.style.display = 'none';
    dropdown.innerHTML = '';
    activeIndex = -1;
    currentResults = [];
  }

  function selectResult(result) {
    input.value = result.resolvedName;
    _selectedPlaceCache.set(result.resolvedName, result);
    hideDropdown();
  }

  function renderResults(results) {
    currentResults = results;
    activeIndex = -1;
    if (results.length === 0) {
      hideDropdown();
      return;
    }
    dropdown.innerHTML = results.map(function (r, i) {
      return '<li data-idx="' + i + '" style="padding:8px 12px;cursor:pointer;">' +
        r.resolvedName.replace(/</g, '&lt;') + '</li>';
    }).join('');
    dropdown.style.display = 'block';
    Array.from(dropdown.children).forEach(function (li, i) {
      li.addEventListener('mouseenter', function () { setActive(i); });
      li.addEventListener('mousedown', function (e) {
        e.preventDefault();
        selectResult(results[i]);
      });
    });
  }

  function setActive(idx) {
    activeIndex = idx;
    Array.from(dropdown.children).forEach(function (li, i) {
      li.style.background = i === idx ? '#f3ead9' : '';
    });
  }

  input.addEventListener('input', function () {
    _selectedPlaceCache.delete(input.value);
    const query = input.value;
    if (debounceId) clearTimeout(debounceId);
    if (query.trim().length < 2) {
      hideDropdown();
      return;
    }
    debounceId = setTimeout(async function () {
      const results = await searchCitySuggestions(query);
      if (input.value === query) renderResults(results);
    }, 300);
  });

  input.addEventListener('keydown', function (e) {
    if (dropdown.style.display === 'none' || currentResults.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(Math.min(activeIndex + 1, currentResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(Math.max(activeIndex - 1, 0));
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0) {
        e.preventDefault();
        selectResult(currentResults[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      hideDropdown();
    }
  });

  input.addEventListener('blur', function () {
    setTimeout(hideDropdown, 100);
  });
}

async function geocodeCity(city) {
  if (_selectedPlaceCache.has(city)) {
    return _selectedPlaceCache.get(city);
  }

  const cacheKey = 'geo_' + city.toLowerCase().trim();
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) { /* fall through to re-fetch */ }
  }

  const primaryTerm = city.split(',')[0].trim();

  try {
    const res = await fetch(
      'https://geocoding-api.open-meteo.com/v1/search?name=' +
        encodeURIComponent(primaryTerm) + '&count=1&language=en&format=json',
      { signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const hit = data && Array.isArray(data.results) && data.results[0];
    if (!hit || typeof hit.latitude !== 'number' || typeof hit.longitude !== 'number') {
      return null;
    }
    const result = {
      latitude: hit.latitude,
      longitude: hit.longitude,
      timezone: hit.timezone || null,
      resolvedName: [hit.name, hit.admin1, hit.country].filter(Boolean).join(', '),
    };
    sessionStorage.setItem(cacheKey, JSON.stringify(result));
    return result;
  } catch (e) {
    console.warn('[geocodeCity] lookup failed:', e);
    return null;
  }
}

setupPlaceAutocomplete();

async function resolveBirthLocation(city) {
  const geo = await geocodeCity(city);
  if (!geo) return null;
  return { latitude: geo.latitude, longitude: geo.longitude, resolvedName: geo.resolvedName };
}

function trimDegStr(degStr) {
  return degStr || "0\u00b0 0'";
}

// ============================================================
//  Planetary positions + ascendant via the generate-kundli Edge Function
// ============================================================
async function fetchAllPlanetPositions(location, time, isoDate, latitude, longitude, name) {
  const { data, error } = await supabase.functions.invoke('generate-kundli', {
    body: { date: isoDate, time, latitude, longitude, name },
  });

  if (error) {
    let detail = error.message;
    try {
      if (error.context && typeof error.context.json === 'function') {
        const body = await error.context.clone().json();
        if (body && body.error) detail = body.error;
      }
    } catch (e) { /* body wasn't JSON or already consumed — keep generic message */ }
    console.error('[generate-kundli] edge function error detail:', detail, error);
    throw new Error('generate-kundli edge function error: ' + detail);
  }
  if (!data || !data.planets) {
    console.error('[generate-kundli] malformed response body:', data);
    throw new Error('generate-kundli: malformed response');
  }

  const planetResults = PLANET_API_NAMES.map(function (planetName, i) {
    const p = data.planets[planetName];
    if (!p) {
      console.warn('[generate-kundli] missing entry for', planetName);
      const fallbackSignName = SIGN_ORDER[i % 12];
      return {
        planet: PLANET_DISPLAY[planetName],
        sign: RASHIS[i % 12],
        house: (i % 12) + 1,
        deg: "0\u00b0 0'",
        _rawSign: fallbackSignName,
      };
    }

    const rawSign = p.sign || '';
    const sign = SIGN_NAME_MAP[rawSign] || rawSign || RASHIS[i % 12];
    const deg = trimDegStr(p.signDegrees);
    const house = typeof p.house === 'number' ? p.house : (i % 12) + 1;

    return {
      planet: PLANET_DISPLAY[planetName],
      sign,
      house,
      deg,
      _rawSign: rawSign,
      _retrograde: !!p.isRetrograde,
      _combust: !!p.isCombust,
    };
  });

  let ascendant = null;
  if (data.lagna) {
    const rawLagnaSign = data.lagna.sign || '';
    ascendant = { sign: rawLagnaSign, degStr: trimDegStr(data.lagna.signDegrees) };
  }
  planetResults._ascendant = ascendant;
  planetResults._yogas = Array.isArray(data.yogas) ? data.yogas : [];
  planetResults._dasha = data.dasha || null;

  return planetResults;
}

function buildRichSummary(yogas, dasha) {
  const lines = [];
  if (Array.isArray(yogas) && yogas.length > 0) {
    lines.push('[Yogas]');
    yogas.forEach(function (y) { lines.push('- ' + y); });
  }
  if (dasha && dasha.current) {
    lines.push('[Current Dasha]');
    lines.push(
      '- Mahadasha: ' + dasha.current +
      (dasha.sub ? ', Antardasha: ' + dasha.sub : '') +
      (dasha.pratyantar ? ', Pratyantardasha: ' + dasha.pratyantar : '') +
      (dasha.period ? ' (' + dasha.period + ')' : '')
    );
  }
  return lines.join('\n').trim();
}

// ============================================================
//  Fallback: derive pseudo-chart when the API / geocoding is unreachable
// ============================================================
function deriveChart(day, month, year, hour, min) {
  const seed = day + month * 31 + year + hour * 5 + min;
  return PLANET_API_NAMES.map(function(key, i) {
    const signIdx = (seed + i * 7) % 12;
    return {
      planet: PLANET_DISPLAY[key],
      sign:   RASHIS[signIdx],
      house:  ((seed + i * 3) % 12) + 1,
      deg:    ((seed * (i + 1)) % 30) + '\u00b0 ' + ((seed * (i + 2)) % 60) + "'",
      _rawSign: SIGN_ORDER[signIdx],
    };
  });
}

// ============================================================
//  SVG Kundli Wheel (legacy South-Indian style — kept for reference,
//  not currently called; drawNorthIndianChart from chart-renderer.js
//  is used instead)
// ============================================================
function drawChart(positions) {
  const ns = 'http://www.w3.org/2000/svg';
  const size = 340;
  const cx = size / 2, cy = size / 2, r = 140;
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Vedic Birth Chart');

  const bg = document.createElementNS(ns, 'circle');
  bg.setAttribute('cx', cx); bg.setAttribute('cy', cy);
  bg.setAttribute('r', r + 10);
  bg.setAttribute('fill', '#f8f4ed');
  bg.setAttribute('stroke', '#c87d2f');
  bg.setAttribute('stroke-width', '1.5');
  svg.appendChild(bg);

  [r * 0.75, r * 0.5, r * 0.25].forEach(function(ir) {
    const c = document.createElementNS(ns, 'circle');
    c.setAttribute('cx', cx); c.setAttribute('cy', cy);
    c.setAttribute('r', ir);
    c.setAttribute('fill', 'none');
    c.setAttribute('stroke', '#c87d2f');
    c.setAttribute('stroke-width', '0.6');
    c.setAttribute('opacity', '0.5');
    svg.appendChild(c);
  });

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
    txt.textContent = RASHIS[i].split(' ')[1];
    svg.appendChild(txt);
  }

  const bySignIdx = {};
  positions.forEach(function(p) {
    const signIdx = p._rawSign && SIGN_ORDER.indexOf(p._rawSign) !== -1
      ? SIGN_ORDER.indexOf(p._rawSign)
      : Math.max(0, (p.house || 1) - 1);
    if (!bySignIdx[signIdx]) bySignIdx[signIdx] = [];
    bySignIdx[signIdx].push(p);
  });

  Object.keys(bySignIdx).forEach(function(key) {
    const signIdx = parseInt(key, 10);
    const group = bySignIdx[key];
    const pr = r * 0.58;
    group.forEach(function(p, j) {
      const spread = group.length > 1 ? (j - (group.length - 1) / 2) * 9 : 0;
      const angle = ((signIdx * 30 + 15 + spread - 90) * Math.PI) / 180;
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
      sym.textContent = PLANET_SYMBOLS[planetKey] || p.planet[0];
      svg.appendChild(sym);
    });
  });

  const ct = document.createElementNS(ns, 'text');
  ct.setAttribute('x', cx); ct.setAttribute('y', cy);
  ct.setAttribute('text-anchor', 'middle');
  ct.setAttribute('dominant-baseline', 'middle');
  ct.setAttribute('font-size', '18');
  ct.setAttribute('fill', '#c87d2f');
  ct.textContent = '\u2736';
  svg.appendChild(ct);

  return svg;
}

// ============================================================
//  Planet table — Devanagari (ग्रह / राशि / भाव)
// ============================================================
function renderPlanetTable(positions) {
  const tbody = document.getElementById('planetTableBody');
  if (!tbody) return;
  tbody.innerHTML = positions.map(function(p) {
    const planetKey = p.planet.split(' ')[0];
    const planetHi = PLANET_NAME_HI[planetKey] || planetKey;
    const signHi = SIGN_NAME_HI[p._rawSign] || p.sign;
    const houseHi = 'भाव ' + toDevanagariNum(p.house);

    const retro = p._retrograde ? ' <span title="वक्री">\u211e</span>' : '';
    const combust = p._combust ? ' <span title="अस्त">\u2600</span>' : '';

    return '<tr><td>' + planetHi + retro + combust + '</td><td>' + signHi + '</td><td>' + houseHi + '</td><td>' + p.deg + '</td></tr>';
  }).join('');
}

// ============================================================
//  Vimshottari Dasha panel — current period + progress bar if
//  dasha.period contains a parseable date range.
// ============================================================
function renderDashaPanel(dasha) {
  const el = document.getElementById('dashaPanel');
  if (!el) return;

  if (!dasha || !dasha.current) {
    el.innerHTML = '<div style="color:var(--text-light);font-size:13px;padding:8px 0;">दशा जानकारी उपलब्ध नहीं है</div>';
    return;
  }

  function hiName(en) {
    return PLANET_NAME_HI[en] || en;
  }

  const rows = [];
  rows.push({ label: 'महादशा (Mahadasha)', value: hiName(dasha.current) });
  if (dasha.sub) rows.push({ label: 'अंतर्दशा (Antardasha)', value: hiName(dasha.sub) });
  if (dasha.pratyantar) rows.push({ label: 'प्रत्यंतर्दशा (Pratyantardasha)', value: hiName(dasha.pratyantar) });

  let progressHtml = '';
  const dates = parseDashaPeriodDates(dasha);
  if (dates) {
    const progress = computeDashaProgress(dates);
    if (progress) {
      progressHtml =
        '<div class="dasha-progress-wrap">' +
          '<div class="dasha-progress-track"><div class="dasha-progress-fill" style="width:' + progress.pct + '%"></div></div>' +
          '<div class="dasha-progress-label">' + progress.pct + '% पूर्ण \u2014 लगभग ' + progress.yearsLeft + ' वर्ष शेष</div>' +
        '</div>';
    }
  }

  el.innerHTML =
    '<div class="dasha-current">' +
      rows.map(function (r) {
        return '<div class="dasha-current-label">' + r.label + '</div><div class="dasha-current-value">' + r.value + '</div>';
      }).join('<div style="height:8px;"></div>') +
      (dasha.period ? '<div class="dasha-current-period">' + dasha.period + '</div>' : '') +
      progressHtml +
    '</div>';
}

// ============================================================
//  Gochar (transit) panel
// ============================================================
async function renderGocharPanel(natalMoonSignName, latitude, longitude) {
  const el = document.getElementById('gocharPanel');
  if (!el) return;

  if (!natalMoonSignName || typeof latitude !== 'number' || typeof longitude !== 'number') {
    el.innerHTML = '<div style="color:var(--text-light);font-size:13px;padding:8px 0;">गोचर हेतु सटीक जन्म स्थान चाहिए</div>';
    return;
  }

  el.innerHTML = '<div style="color:var(--text-light);font-size:13px;padding:8px 0;">गोचर लोड हो रहा है…</div>';

  const now = new Date();
  const isoToday = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  const timeNow = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

  try {
    const { data, error } = await supabase.functions.invoke('generate-kundli', {
      body: { date: isoToday, time: timeNow, latitude, longitude, name: 'Gochar' },
    });

    if (error || !data || !data.planets) {
      throw new Error('gochar fetch failed');
    }

    const moonIdx = SIGN_ORDER.indexOf(natalMoonSignName);
    const startIdx = moonIdx === -1 ? 0 : moonIdx;

    const rowsHtml = PLANET_API_NAMES.map(function (planetName) {
      const p = data.planets[planetName];
      if (!p || !p.sign) return '';
      const signIdx = SIGN_ORDER.indexOf(p.sign);
      const houseFromMoon = signIdx === -1 ? null : ((signIdx - startIdx + 12) % 12) + 1;
      const nameHi = PLANET_NAME_HI[planetName] || planetName;
      const signHi = SIGN_NAME_HI[p.sign] || p.sign;
      const houseLabel = houseFromMoon ? 'भाव ' + toDevanagariNum(houseFromMoon) : '—';

      const tag = getGocharTag(planetName, houseFromMoon);
      const tagHtml = tag ? '<span class="gochar-tag gochar-tag-' + tag.level + '">' + tag.label + '</span>' : '';

      return '<div class="gochar-row"><span class="gochar-planet">' + nameHi + ' \u2014 ' + signHi + '</span><span style="display:flex;align-items:center;"><span class="gochar-house">' + houseLabel + '</span>' + tagHtml + '</span></div>';
    }).join('');

    el.innerHTML = rowsHtml || '<div style="color:var(--text-light);font-size:13px;padding:8px 0;">गोचर डेटा उपलब्ध नहीं</div>';
  } catch (err) {
    console.warn('[renderGocharPanel] failed:', err);
    el.innerHTML = '<div style="color:var(--text-light);font-size:13px;padding:8px 0;">गोचर लोड नहीं हो सका</div>';
  }
}

// ============================================================
//  AI Insights, powered by Gemini via askGemini()
// ============================================================
async function renderInsights(name, positions, richSummary) {
  if (richSummary === undefined) richSummary = '';
  const insightsList = document.getElementById('insightsList');
  if (!insightsList) return;
  insightsList.innerHTML = '<div style="color:var(--text-light);font-size:13px;padding:12px 0;">\u2728 Generating insights from the cosmos\u2026</div>';

  const posStr = positions
    .map(function(p) { return p.planet + ' in ' + p.sign + ' (House ' + p.house + ', ' + p.deg + ')'; })
    .join(', ');

  const groundingContext = richSummary
    ? '\n\nComputed Jyotish yogas and current dasha for this chart (use these as your primary source):\n' + richSummary
    : '';

  const prompt =
    'You are an expert Vedic astrologer with deep knowledge of Jyotish (Indian astrology). ' +
    'The following is the birth chart for ' + name + ':\n' +
    'Planetary positions: ' + posStr + '.' +
    groundingContext + '\n\n' +
    'Based on the actual planetary positions and the yogas/dasha above, ' +
    'give exactly 4 concise, personalised insights covering: ' +
    '1) Personality & Character, 2) Career & Finance, 3) Relationships & Marriage, 4) Spirituality & Life Path. ' +
    'Each insight should be 2-3 sentences, grounded in the specific planetary placements. ' +
    'Do NOT make up planetary positions, use only what is provided. ' +
    'Format response as a JSON array: [{"title":"...","text":"..."}]';

  try {
    const raw = await askGemini(prompt);
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('No JSON array in response');
    const items = JSON.parse(match[0]);
    insightsList.innerHTML = items.map(function(item) {
      return '<div class="insight-item"><strong>' + item.title + '</strong><br>' + item.text + '</div>';
    }).join('');
  } catch (err) {
    console.warn('Gemini insight error:', err);
    insightsList.innerHTML = positions.slice(0, 4).map(function(p, i) {
      const texts = [
        'Your ' + p.planet + ' in ' + p.sign + ' (House ' + p.house + ') shapes your core identity and self-expression in profound ways.',
        'This placement in House ' + p.house + ' opens significant opportunities in domains governed by that house.',
        'The positioning of ' + p.planet + ' in ' + p.sign + ' suggests a karmic path calling for conscious growth.',
        'Overall, your chart reveals a soul journey emphasising wisdom, service, and spiritual evolution.',
      ];
      return '<div class="insight-item"><strong>' + p.planet + ' \u2014 ' + p.sign + '</strong><br>' + texts[i] + '</div>';
    }).join('');
  }
}

// ============================================================
//  Sun Sign Banner (Big Three: Sun, Moon, Ascendant)
// ============================================================
function renderSunSignBanner(positions, ascendant) {
  const moon = positions[1];

  const moonSign  = (moon && moon._rawSign) || '';
  const lagnaSign = (ascendant && ascendant.sign) || '';

  function setEl(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  setEl('moonEmoji',    SIGN_EMOJI[moonSign] || '\u263d');
  setEl('moonSignName', moonSign || (moon && moon.sign) || '\u2014');
  setEl('moonDeg',      (moon && moon.deg) ? moon.deg + ' in ' + moonSign : '');

  const lagnaDegStr = (ascendant && ascendant.degStr)
    ? ascendant.degStr.replace(/(\d+\u00b0\s*\d+')\s*.*/, '$1')
    : '';
  setEl('lagnaEmoji',    SIGN_EMOJI[lagnaSign] || '\u2b06');
  setEl('lagnaSignName', lagnaSign || '\u2014');
  setEl('lagnaDeg',      lagnaDegStr ? lagnaDegStr + ' Rising' : 'Ascendant');
}

// ============================================================
//  Shared render step — used by BOTH a fresh submit and a cache
//  replay, so a saved reading looks identical to a live one.
// ============================================================
function renderKundliResult(name, positions, richSummary, usedFallback, birthLatLng) {
  stopLoadingTicker();
  document.getElementById('kundliFormCard').style.display = 'none';
  document.getElementById('kundliLoading').style.display  = 'none';
  document.getElementById('kundliResult').style.display   = 'block';
  document.getElementById('resetChart').style.display     = 'inline-flex';

  const svgWrap = document.getElementById('chartSvgWrap');
  if (svgWrap) {
    svgWrap.innerHTML = '';
    svgWrap.appendChild(drawNorthIndianChart(positions, positions._ascendant || null));

    const existingNotice = svgWrap.parentElement?.querySelector('.kundli-data-notice');
    if (existingNotice) existingNotice.remove();

    let noticeText = null;
    if (usedFallback) {
      noticeText = '\u26a0 Using estimated chart positions — please re-enter the birth place and pick a suggestion from the dropdown';
    }
    if (noticeText) {
      const notice = document.createElement('p');
      notice.className = 'kundli-data-notice';
      notice.style.cssText = 'font-size:11px;color:var(--text-light);text-align:center;margin-top:4px;';
      notice.textContent = noticeText;
      svgWrap.after(notice);
    }
  }

  renderSunSignBanner(positions, positions._ascendant || null);
  renderPlanetTable(positions);
  renderInsights(name, positions, richSummary);

  renderDashaPanel(positions._dasha || null);

  const moon = positions.find(function (p) { return p.planet.split(' ')[0] === 'Moon'; });
  const natalMoonSign = moon ? moon._rawSign : null;
  if (birthLatLng && !usedFallback) {
    renderGocharPanel(natalMoonSign, birthLatLng.latitude, birthLatLng.longitude);
  } else {
    const gEl = document.getElementById('gocharPanel');
    if (gEl) gEl.innerHTML = '<div style="color:var(--text-light);font-size:13px;padding:8px 0;">गोचर हेतु सटीक जन्म स्थान चाहिए</div>';
  }
}

// ============================================================
//  Loading progress ticker
// ============================================================
const LOADING_STEPS = [
  'Locating the birth place\u2026',
  'Calculating planetary positions\u2026',
  'Reading the Sun \u2609 and Moon \u263d\u2026',
  'Mapping the houses from the Ascendant\u2026',
  'Gathering yogas and dasha periods\u2026',
  'Almost there\u2026',
];

let _loadingTickerId = null;

function startLoadingTicker() {
  const el = document.getElementById('kundliLoadingText');
  if (!el) return;
  let i = 0;
  el.textContent = LOADING_STEPS[0];
  stopLoadingTicker();
  _loadingTickerId = setInterval(function () {
    i = Math.min(i + 1, LOADING_STEPS.length - 1);
    el.textContent = LOADING_STEPS[i];
  }, 2500);
}

function stopLoadingTicker() {
  if (_loadingTickerId !== null) {
    clearInterval(_loadingTickerId);
    _loadingTickerId = null;
  }
}

function loadSavedReading(id) {
  const record = getSaveById(id);
  if (!record) return false;

  document.getElementById('kundliLoading').style.display = 'none';
  const positions = hydratePositionsFromSave(record);
  const birthLatLng = record.result.birthLatLng || null;
  renderKundliResult(record.inputs.name, positions, record.result.richSummary, record.result.usedFallback, birthLatLng);
  return true;
}

// ============================================================
//  FORM SUBMIT
// ============================================================
const kundliForm = document.getElementById('kundliForm');
if (kundliForm) {
  kundliForm.addEventListener('submit', async function(e) {
    e.preventDefault();

    const name     = document.getElementById('kName').value.trim();
    const day      = parseInt(document.getElementById('kDay').value);
    const monthStr = document.getElementById('kMonth').value;
    const month    = MONTHS.indexOf(monthStr) + 1;
    const year     = parseInt(document.getElementById('kYear').value);

    const hour24   = parseInt(document.getElementById('kHour').value) || 0;
    const min      = parseInt(document.getElementById('kMin').value)  || 0;

    const kPlace   = document.getElementById('kPlace');
    const city     = kPlace ? kPlace.value.trim() : 'Mumbai';

    if (!name || !day || !month || !year) return;

    const dateStr = String(day).padStart(2,'0') + '/' + String(month).padStart(2,'0') + '/' + year;
    const isoDate = year + '-' + String(month).padStart(2,'0') + '-' + String(day).padStart(2,'0');
    const timeStr = String(hour24).padStart(2,'0') + ':' + String(min).padStart(2,'0');

    document.getElementById('kundliFormCard').style.display = 'none';
    document.getElementById('kundliLoading').style.display  = 'flex';
    startLoadingTicker();

    let positions    = [];
    let richSummary  = '';
    let usedFallback = false;
    let birthLatLng  = null;

    try {
      const loc = await resolveBirthLocation(city);
      if (!loc) {
        throw new Error('Could not geocode birth place "' + city + '"');
      }
      birthLatLng = { latitude: loc.latitude, longitude: loc.longitude };

      positions = await fetchAllPlanetPositions(city, timeStr, isoDate, loc.latitude, loc.longitude, name);
      richSummary = buildRichSummary(positions._yogas, positions._dasha);

      renderKundliResult(name, positions, richSummary, usedFallback, birthLatLng);
    } catch (err) {
      console.warn('generate-kundli edge function unavailable, using fallback chart:', err);
      toast('Error: ' + err.message + '. Using offline fallback chart.', 'error');
      positions    = deriveChart(day, month, year, hour24, min);
      usedFallback = true;
      birthLatLng  = null;
      renderKundliResult(name, positions, richSummary, usedFallback, birthLatLng);
    }

    const inputs = {
      name, day, month, monthName: monthStr, year,
      hour: hour24, min, city, dateStr, timeStr,
    };
    const record = buildSaveRecord(inputs, positions, richSummary, usedFallback, birthLatLng);
    const savedId = saveKundliRecord(record);

    const prev = parseInt(localStorage.getItem('aa_readings') || '0');
    localStorage.setItem('aa_readings', prev + 1);

    const recent = JSON.parse(localStorage.getItem('aa_recent') || '[]');
    recent.unshift({
      icon: '\u2b50',
      title: 'Kundli for ' + name,
      meta: new Date().toLocaleDateString(),
      url: 'kundli.html?id=' + encodeURIComponent(savedId),
    });
    localStorage.setItem('aa_recent', JSON.stringify(recent.slice(0, 10)));

    try {
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('id', savedId);
      window.history.replaceState({}, '', newUrl.toString());
    } catch (e) { /* non-fatal */ }
  });
}

function toast(msg, type = 'info') {
  const c = document.getElementById('toast-container');
  if (!c) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => {
    t.style.animation = 'toastOut .35s ease forwards';
    setTimeout(() => t.remove(), 350);
  }, 4500);
}

// ---- Reset chart ----
const resetChartBtn = document.getElementById('resetChart');
if (resetChartBtn) {
  resetChartBtn.addEventListener('click', function() {
    document.getElementById('kundliFormCard').style.display = 'block';
    document.getElementById('kundliResult').style.display   = 'none';
    document.getElementById('resetChart').style.display     = 'none';
    document.getElementById('kundliForm').reset();
    try {
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('id');
      window.history.replaceState({}, '', newUrl.toString());
    } catch (e) { /* non-fatal */ }
  });
}

// ---- Auth guard + cache-replay on load (?id=...) ----
(async function() {
  await requireAuth();
  const params = new URLSearchParams(window.location.search);
  const savedId = params.get('id');
  if (savedId) {
    document.getElementById('kundliFormCard').style.display = 'none';
    document.getElementById('kundliLoading').style.display  = 'flex';
    const loaded = loadSavedReading(savedId);
    if (!loaded) {
      stopLoadingTicker();
      document.getElementById('kundliLoading').style.display  = 'none';
      document.getElementById('kundliFormCard').style.display = 'block';
    }
  }
})();