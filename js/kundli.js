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
//  ---- WHY THIS REVISION EXISTS -----------------------------------------
//  Switched the astrology data source from VedAstro to OpenKundali:
//    - One HTTP call now returns the whole chart (planets, ascendant,
//      yogas, dasha, shadbala) instead of 11 throttled VedAstro calls,
//      so the ~45-55s loading wait is gone — a fresh submit is now fast.
//    - OpenKundali has NO house/bhava calculator and NO name-based
//      geocoding, so: (a) lat/long are now mandatory — if client-side
//      geocoding fails, this file falls back to the estimated chart
//      instead of calling the edge function with missing coordinates;
//      (b) VedAstro's `HoroscopePredictions` (getRichPredictions) is
//      gone — the `yogas[]` array returned by generate-kundli is used
//      as the grounding text for the Gemini insights prompt instead.
//    - House numbers are still shown (edge function derives them
//      server-side via the standard whole-sign system from ascendant).
//
//  BIRTH TIME INPUT (fixed):
//  The Hour field is now a plain 24-hour input (0-23) — the old
//  12-hour + AM/PM select was dropped because it silently produced
//  invalid times like "29:40" whenever someone typed a 24-hour value
//  (e.g. 17) into the 12-hour field while AM/PM was also set, which
//  OpenKundali correctly rejected with an HTTP 400.
//
//  PERSISTENCE (unchanged):
//  Every generated kundli — full birth inputs AND the complete
//  computed result (planet positions, ascendant, houses, yoga summary) —
//  is saved to localStorage under 'aa_kundli_saves'. Opening a saved
//  reading (via ?id=... or the "Recent" sidebar list) replays it straight
//  from cache: no re-geocoding, no re-hitting generate-kundli, and the
//  chart/table/insights render identically to the first time.
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
 * (positions, ascendant, yoga summary, and whether a fallback chart
 * was used) so a saved reading can be replayed pixel-for-pixel with
 * zero re-fetching.
 */
function buildSaveRecord(inputs, positions, richSummary, usedFallback) {
  // Strip positions down to plain serialisable objects (arrays only
  // keep numeric-index entries under JSON.stringify, so the extra
  // _ascendant property has to be pulled out explicitly and stored
  // alongside, then re-attached on load).
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
      richSummary: richSummary || '',
      usedFallback: !!usedFallback,
    },
  };
}

function saveKundliRecord(record) {
  const all = loadAllSaves();
  all.unshift(record);
  const trimmed = all.slice(0, MAX_SAVES);
  try {
    localStorage.setItem(SAVES_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.warn('[saveKundliRecord] localStorage write failed (quota?):', e);
    // Drop oldest half and retry once
    try {
      localStorage.setItem(SAVES_KEY, JSON.stringify(trimmed.slice(0, Math.ceil(trimmed.length / 2))));
    } catch (e2) { /* give up silently, chart still renders this session */ }
  }
  return record.id;
}

/** Rehydrate a saved record back into the `positions` shape the renderers expect. */
function hydratePositionsFromSave(record) {
  const positions = record.result.positions.map(function (p) { return Object.assign({}, p); });
  positions._ascendant = record.result.ascendant || null;
  return positions;
}

/**
 * Search Open-Meteo for up to `count` city matches — used to populate the
 * autocomplete dropdown as the user types. Unlike geocodeCity() (which
 * returns a single best guess for a full, already-typed name), this is
 * meant to be called on partial/in-progress input.
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

// Exact-match cache of user-selected suggestions, keyed by the resolved
// display name that gets written into the input. When resolveBirthLocation()
// sees this exact string it skips geocoding entirely — the user already
// confirmed the place from a real list, so there's no ambiguity/typo risk.
const _selectedPlaceCache = new Map();

/**
 * Wire a debounced autocomplete dropdown onto the birth-place input, so
 * typos never reach submission — the user picks from real Open-Meteo
 * matches instead of typing a free-text guess that may fail to geocode.
 */
function setupPlaceAutocomplete() {
  const input = document.getElementById('kPlace');
  if (!input) return;

  const dropdown = document.createElement('ul');
  dropdown.setAttribute('role', 'listbox');
  dropdown.style.cssText =
    'position:absolute;z-index:50;list-style:none;margin:2px 0 0;padding:4px 0;' +
    'background:#fff;border:1px solid #e2d9c8;border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,0.12);' +
    'max-height:220px;overflow-y:auto;display:none;font-size:14px;min-width:220px;';

  // Position the dropdown relative to the input — wrap the input in a
  // positioned container if it isn't already inside one.
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
        // mousedown (not click) so it fires before the input's blur handler
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
    // Any manual edit invalidates a previously-selected exact match.
    _selectedPlaceCache.delete(input.value);
    const query = input.value;
    if (debounceId) clearTimeout(debounceId);
    if (query.trim().length < 2) {
      hideDropdown();
      return;
    }
    debounceId = setTimeout(async function () {
      const results = await searchCitySuggestions(query);
      // Guard against stale responses if the input changed while in flight.
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
    // Small delay so a mousedown-driven selectResult() above still fires
    // before the dropdown is torn down.
    setTimeout(hideDropdown, 100);
  });
}

// ============================================================
//  Geocoding: "City, Country" -> { latitude, longitude, timezone }
//  Uses Open-Meteo's free geocoding API (no key, CORS-enabled).
//  This is now REQUIRED, not just nice-to-have — OpenKundali's /chart
//  endpoint has no name-based lookup, only lat/lon. If this fails, the
//  caller falls back to the estimated pseudo-chart (deriveChart below).
//  Cached in sessionStorage to avoid repeat lookups.
// ============================================================
async function geocodeCity(city) {
  // If the user picked this exact string from the autocomplete dropdown,
  // reuse those coordinates directly — no risk of a mismatched geocode.
  if (_selectedPlaceCache.has(city)) {
    return _selectedPlaceCache.get(city);
  }

  const cacheKey = 'geo_' + city.toLowerCase().trim();
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) { /* fall through to re-fetch */ }
  }

  // Open-Meteo works best with just the city name, not "City, Country"
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
      timezone: hit.timezone || null, // IANA name, e.g. "Asia/Kolkata"
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

/**
 * Resolve a birth city to real coordinates. Unlike the old VedAstro
 * integration, there's no name-based fallback path anymore — OpenKundali
 * needs real lat/lon — so this simply returns null when geocoding fails,
 * and the caller degrades to the estimated chart.
 *
 * Returns { latitude, longitude, resolvedName } or null.
 */
async function resolveBirthLocation(city) {
  const geo = await geocodeCity(city);
  if (!geo) return null;
  return { latitude: geo.latitude, longitude: geo.longitude, resolvedName: geo.resolvedName };
}

/**
 * Trim a decimal-degree-derived string like "18° 8'" — no-op helper kept
 * for symmetry with the old trimDegStr; the edge function already returns
 * degrees pre-formatted as "12° 34'".
 */
function trimDegStr(degStr) {
  return degStr || "0\u00b0 0'";
}

// ============================================================
//  Planetary positions + ascendant via the generate-kundli Edge Function
//  (which now calls OpenKundali server-side). One call gets all 9
//  grahas, the Ascendant, yogas, and dasha — no batching/throttling
//  needed since OpenKundali has no rate cap.
// ============================================================

/**
 * Fetch all 9 planet positions plus the Ascendant, yogas, and dasha via
 * the `generate-kundli` Supabase Edge Function.
 *
 * [location]   city name (label only — used for the saved-record display)
 * [time]       HH:MM (24-hour)
 * [isoDate]    YYYY-MM-DD
 * [latitude]   required
 * [longitude]  required
 *
 * Returns an array shaped like the old client-side parser output:
 *   [{ planet, sign, house, deg, _rawSign }, ...]
 * with an extra `_ascendant` property and a `_yogas` array stashed on
 * it, so the rest of this file (chart drawing, table, insights) needs
 * no further changes.
 */
async function fetchAllPlanetPositions(location, time, isoDate, latitude, longitude, name) {
  const { data, error } = await supabase.functions.invoke('generate-kundli', {
    body: { date: isoDate, time, latitude, longitude, name },
  });

  if (error) {
    // supabase-js's `error.message` for a non-2xx response is just a generic
    // "Edge Function returned a non-2xx status code" — the actual reason
    // (e.g. OpenKundali fetch failure, bad params) is in the response body,
    // reachable via error.context (a Response object in supabase-js v2).
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

/**
 * Build a human-readable summary from OpenKundali's `yogas[]` (used as
 * the grounding text for the Gemini insights prompt, in place of
 * VedAstro's old HoroscopePredictions call). Also folds in the current
 * dasha period when available, since that's high-value context Gemini
 * previously didn't have in this exact form.
 */
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
//  SVG Kundli Wheel
// ============================================================
function drawChart(positions) {
  const ns = 'http://www.w3.org/2000/svg';
  const size = 340;
  const cx = size / 2, cy = size / 2, r = 140;
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
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

  // 12 house lines + rashi labels.
  // NOTE: this wheel is a fixed-sign layout (South-Indian style) — box i
  // always belongs to SIGN_ORDER[i], regardless of the Ascendant. Planets
  // must therefore be placed by SIGN, not by house number (see below).
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

  // Group ALL planets (not just the first 7) by their fixed sign box so
  // conjunctions (multiple grahas in the same rashi) fan out within that
  // box instead of overlapping or landing in the wrong box entirely.
  const bySignIdx = {};
  positions.forEach(function(p) {
    const signIdx = p._rawSign && SIGN_ORDER.indexOf(p._rawSign) !== -1
      ? SIGN_ORDER.indexOf(p._rawSign)
      // Fallback ONLY if sign data is missing — approximate via house,
      // which is wrong in general but better than nothing.
      : Math.max(0, (p.house || 1) - 1);
    if (!bySignIdx[signIdx]) bySignIdx[signIdx] = [];
    bySignIdx[signIdx].push(p);
  });

  Object.keys(bySignIdx).forEach(function(key) {
    const signIdx = parseInt(key, 10);
    const group = bySignIdx[key];
    const pr = r * 0.58;
    group.forEach(function(p, j) {
      // Spread planets sharing a sign across a small arc within that box.
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

  // Center star
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
//  Planet table
// ============================================================
function renderPlanetTable(positions) {
  const tbody = document.getElementById('planetTableBody');
  if (!tbody) return;
  tbody.innerHTML = positions.map(function(p) {
    const retro = p._retrograde ? ' <span title="Retrograde">\u211e</span>' : '';
    const combust = p._combust ? ' <span title="Combust">\u2600</span>' : '';
    return '<tr><td>' + p.planet + retro + combust + '</td><td>' + p.sign + '</td><td>House ' + p.house + '</td><td>' + p.deg + '</td></tr>';
  }).join('');
}

// ============================================================
//  AI Insights, powered by Gemini via askGemini()
//  The OpenKundali yoga/dasha summary is injected verbatim into the
//  prompt so Gemini has real Jyotish grounding to elaborate on, rather
//  than hallucinating.
// ============================================================
async function renderInsights(name, positions, richSummary) {
  if (richSummary === undefined) richSummary = '';
  const insightsList = document.getElementById('insightsList');
  if (!insightsList) return;
  insightsList.innerHTML = '<div style="color:var(--text-light);font-size:13px;padding:12px 0;">\u2728 Generating insights from the cosmos\u2026</div>';

  const posStr = positions
    .map(function(p) { return p.planet + ' in ' + p.sign + ' (House ' + p.house + ', ' + p.deg + ')'; })
    .join(', ');

  // Inject OpenKundali yogas/dasha as grounding context, same strategy
  // as the Dart guidance_screen.dart which passes richSummary to the LLM.
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
    // Graceful fallback using actual positions
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

/**
 * Populate the three sign pills above the chart.
 * @param {Array}       positions  fetched planet positions array
 * @param {object|null} ascendant  { sign, degStr } from the generate-kundli lagna field
 */
function renderSunSignBanner(positions, ascendant) {
  const moon = positions[1];  // Moon

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
function renderKundliResult(name, positions, richSummary, usedFallback) {
  stopLoadingTicker();
  document.getElementById('kundliFormCard').style.display = 'none';
  document.getElementById('kundliLoading').style.display  = 'none';
  document.getElementById('kundliResult').style.display   = 'block';
  document.getElementById('resetChart').style.display     = 'inline-flex';

  const svgWrap = document.getElementById('chartSvgWrap');
  if (svgWrap) {
    svgWrap.innerHTML = '';
    svgWrap.appendChild(drawChart(positions));

    // Clear any previously-appended notices before adding the current one
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
}

// ============================================================
//  Loading progress ticker
//  OpenKundali returns the whole chart from a single request (no more
//  batched/throttled VedAstro calls), so a fresh submit is fast — this
//  ticker mostly covers geocoding + the one chart request + Gemini.
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

/** Replay a saved reading straight from localStorage — no network calls. */
function loadSavedReading(id) {
  const record = getSaveById(id);
  if (!record) return false;

  document.getElementById('kundliLoading').style.display = 'none';
  const positions = hydratePositionsFromSave(record);
  renderKundliResult(record.inputs.name, positions, record.result.richSummary, record.result.usedFallback);
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
    const month    = MONTHS.indexOf(monthStr) + 1;   // 1-based
    const year     = parseInt(document.getElementById('kYear').value);

    // Hour is now entered directly as 24-hour (0-23) — no AM/PM
    // conversion needed, and no risk of an invalid "29:40"-style time.
    const hour24   = parseInt(document.getElementById('kHour').value) || 0;
    const min      = parseInt(document.getElementById('kMin').value)  || 0;

    const kPlace   = document.getElementById('kPlace');
    const city     = kPlace ? kPlace.value.trim() : 'Mumbai';

    if (!name || !day || !month || !year) return;

    // Build date/time strings.
    // dateStr (DD/MM/YYYY) is kept for the saved-record display/inputs;
    // isoDate (YYYY-MM-DD) is what OpenKundali (via generate-kundli) expects.
    const dateStr = String(day).padStart(2,'0') + '/' + String(month).padStart(2,'0') + '/' + year;
    const isoDate = year + '-' + String(month).padStart(2,'0') + '-' + String(day).padStart(2,'0');
    const timeStr = String(hour24).padStart(2,'0') + ':' + String(min).padStart(2,'0');

    // Show loading
    document.getElementById('kundliFormCard').style.display = 'none';
    document.getElementById('kundliLoading').style.display  = 'flex';
    startLoadingTicker();

    let positions    = [];
    let richSummary  = '';
    let usedFallback = false;

    try {
      // 1. Resolve the birth city to real coordinates. OpenKundali has no
      //    name-based geocoding, so this is mandatory — if it fails we
      //    fall through to the estimated pseudo-chart below.
      const loc = await resolveBirthLocation(city);
      if (!loc) {
        throw new Error('Could not geocode birth place "' + city + '"');
      }

      // 2. Fetch the full chart (planets + ascendant + yogas + dasha)
      //    from the generate-kundli edge function in one call.
      positions = await fetchAllPlanetPositions(city, timeStr, isoDate, loc.latitude, loc.longitude, name);
      richSummary = buildRichSummary(positions._yogas, positions._dasha);
    } catch (err) {
      console.warn('generate-kundli edge function unavailable, using fallback chart:', err);
      positions    = deriveChart(day, month, year, hour24, min);
      usedFallback = true;
    }

    // Render (shared with the cache-replay path)
    renderKundliResult(name, positions, richSummary, usedFallback);

    // ---- Persist: full inputs + full computed result, so this exact
    //      reading can be reopened instantly with zero recompute ----
    const inputs = {
      name, day, month, monthName: monthStr, year,
      hour: hour24, min, city, dateStr, timeStr,
    };
    const record = buildSaveRecord(inputs, positions, richSummary, usedFallback);
    const savedId = saveKundliRecord(record);

    // Legacy stats/recent-list counters, now linked to the saved record
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

    // Reflect the id in the address bar too, so refreshing/sharing
    // the URL reopens this exact reading from cache.
    try {
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('id', savedId);
      window.history.replaceState({}, '', newUrl.toString());
    } catch (e) { /* non-fatal */ }
  });
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
      // Saved record not found (e.g. cleared storage / different device) —
      // fall back to the empty form.
      stopLoadingTicker();
      document.getElementById('kundliLoading').style.display  = 'none';
      document.getElementById('kundliFormCard').style.display = 'block';
    }
  }
})();