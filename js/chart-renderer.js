// ============================================================
//  chart-renderer.js — Traditional North Indian Diamond Kundli
//  (Chandra Kundli / Moon Chart — Devanagari labels)
//  Standalone SVG renderer. Fixed houses, rotating signs.
//  House 1 is always the MOON's rashi (Chandra Kundli convention),
//  NOT the Ascendant — houses for every other planet are recounted
//  relative to the Moon's sign, not the Lagna.
// ============================================================

const SIGN_ORDER = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
];

const SIGN_NUMBER = SIGN_ORDER.reduce((acc, name, i) => {
  acc[name] = i + 1;
  return acc;
}, {});

// Devanagari numerals ०-९, used for rashi numbers inside houses
const DEVANAGARI_DIGITS = ['०','१','२','३','४','५','६','७','८','९'];
function toDevanagariNumber(n) {
  return String(n).split('').map((d) => DEVANAGARI_DIGITS[parseInt(d, 10)]).join('');
}

// Traditional Hindi/Sanskrit planet abbreviations as used in printed kundalis
const PLANET_ABBR_HI = {
  Sun: 'सू',      // सूर्य
  Moon: 'च',      // चंद्र
  Mars: 'मं',      // मंगल
  Mercury: 'बु',   // बुध
  Jupiter: 'गु',   // गुरु
  Venus: 'शु',     // शुक्र
  Saturn: 'श',     // शनि
  Rahu: 'रा',      // राहु
  Ketu: 'के',      // केतु
};

const RETRO_MARK_HI = '(व)'; // वक्री — retrograde

// Standard 12-region North Indian diamond geometry on a 300x300 grid.
const HOUSE_POLYGONS = {
  1:  [[75,75],[150,0],[225,75],[150,150]],
  2:  [[0,0],[150,0],[75,75]],
  3:  [[0,0],[75,75],[0,150]],
  4:  [[0,150],[75,75],[150,150],[75,225]],
  5:  [[0,150],[75,225],[0,300]],
  6:  [[0,300],[75,225],[150,300]],
  7:  [[75,225],[150,300],[225,225],[150,150]],
  8:  [[150,300],[225,225],[300,300]],
  9:  [[300,300],[225,225],[300,150]],
  10: [[300,150],[225,225],[150,150],[225,75]],
  11: [[300,150],[225,75],[300,0]],
  12: [[300,0],[225,75],[150,0]],
};

const HOUSE_LABEL_POS = {
  1: [150, 40], 2: [55, 22], 3: [22, 55], 4: [40, 150],
  5: [22, 245], 6: [55, 278], 7: [150, 260], 8: [245, 278],
  9: [278, 245], 10: [260, 150], 11: [278, 55], 12: [245, 22],
};

function centroid(points) {
  const n = points.length;
  const x = points.reduce((s, p) => s + p[0], 0) / n;
  const y = points.reduce((s, p) => s + p[1], 0) / n;
  return [x, y];
}

function polyToPath(points) {
  return points.map((p, i) => (i === 0 ? 'M' : 'L') + p[0] + ',' + p[1]).join(' ') + ' Z';
}

/**
 * Build the North Indian diamond chart (Devanagari labels) as an SVG element.
 * Uses CHANDRA KUNDLI convention: House 1 = Moon's rashi (not the Ascendant).
 *
 * @param {Array}  positions  [{ planet, sign, house, deg, _rawSign, _retrograde, _combust }, ...]
 *                             positions.find Moon by planet name — order-independent.
 * @param {Object|null} ascendant  { sign, degStr } — accepted for API symmetry with
 *                             the caller (kundli.js), not used for House 1 in this chart.
 * @returns {SVGElement}
 */
export function drawNorthIndianChart(positions, ascendant) {
  const ns = 'http://www.w3.org/2000/svg';
  const size = 300;

  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'चंद्र कुंडली');

  const bg = document.createElementNS(ns, 'rect');
  bg.setAttribute('x', 0); bg.setAttribute('y', 0);
  bg.setAttribute('width', size); bg.setAttribute('height', size);
  bg.setAttribute('fill', '#f8f4ed');
  svg.appendChild(bg);

  const outer = document.createElementNS(ns, 'rect');
  outer.setAttribute('x', 0); outer.setAttribute('y', 0);
  outer.setAttribute('width', size); outer.setAttribute('height', size);
  outer.setAttribute('fill', 'none');
  outer.setAttribute('stroke', '#c87d2f');
  outer.setAttribute('stroke-width', '2');
  svg.appendChild(outer);

  [[[0,0],[300,300]], [[300,0],[0,300]]].forEach(([a, b]) => {
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', a[0]); line.setAttribute('y1', a[1]);
    line.setAttribute('x2', b[0]); line.setAttribute('y2', b[1]);
    line.setAttribute('stroke', '#c87d2f');
    line.setAttribute('stroke-width', '1.5');
    svg.appendChild(line);
  });

  const diamond = document.createElementNS(ns, 'polygon');
  diamond.setAttribute('points', '150,0 300,150 150,300 0,150');
  diamond.setAttribute('fill', 'none');
  diamond.setAttribute('stroke', '#c87d2f');
  diamond.setAttribute('stroke-width', '1.5');
  svg.appendChild(diamond);

  // ---- CHANDRA KUNDLI: House 1 = Moon's rashi, not the Ascendant ----
  const moon = positions.find((p) => p.planet.split(' ')[0] === 'Moon');
  const moonSignName = (moon && moon._rawSign) || SIGN_ORDER[0];
  const moonIdx = SIGN_ORDER.indexOf(moonSignName);
  const startIdx = moonIdx === -1 ? 0 : moonIdx;

  // Houses are counted relative to the Moon's sign — recompute each
  // planet's house-from-Moon instead of using p.house (which the
  // edge function returns as house-from-Ascendant).
  const byHouse = {};
  positions.forEach((p) => {
    const pSignIdx = p._rawSign ? SIGN_ORDER.indexOf(p._rawSign) : -1;
    const houseFromMoon = pSignIdx === -1
      ? (p.house >= 1 && p.house <= 12 ? p.house : 1) // fallback if sign data missing
      : ((pSignIdx - startIdx + 12) % 12) + 1;
    if (!byHouse[houseFromMoon]) byHouse[houseFromMoon] = [];
    byHouse[houseFromMoon].push(p);
  });

  for (let house = 1; house <= 12; house++) {
    const poly = HOUSE_POLYGONS[house];

    const region = document.createElementNS(ns, 'path');
    region.setAttribute('d', polyToPath(poly));
    region.setAttribute('fill', 'transparent');
    svg.appendChild(region);

    // Sign number label — Devanagari numeral, rotated from Moon's sign
    const signIdx = (startIdx + house - 1) % 12;
    const signName = SIGN_ORDER[signIdx];
    const [lx, ly] = HOUSE_LABEL_POS[house];
    const label = document.createElementNS(ns, 'text');
    label.setAttribute('x', lx); label.setAttribute('y', ly);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('dominant-baseline', 'middle');
    label.setAttribute('font-size', '12');
    label.setAttribute('font-weight', house === 1 ? '700' : '500');
    label.setAttribute('fill', house === 1 ? '#c87d2f' : '#8a9b8e');
    label.setAttribute('font-family', '"Noto Sans Devanagari", "DM Sans", sans-serif');
    label.textContent = toDevanagariNumber(SIGN_NUMBER[signName] || signIdx + 1);
    svg.appendChild(label);

    const planetsHere = byHouse[house] || [];
    if (planetsHere.length === 0) continue;

    const [cx, cy] = centroid(poly);
    const lineHeight = 14;
    const totalHeight = planetsHere.length * lineHeight;
    const startY = cy - totalHeight / 2 + lineHeight / 2;

    planetsHere.forEach((p, i) => {
      const planetKey = p.planet.split(' ')[0];
      const abbrHi = PLANET_ABBR_HI[planetKey] || planetKey.slice(0, 2);
      const retro = p._retrograde ? ' ' + RETRO_MARK_HI : '';

      const txt = document.createElementNS(ns, 'text');
      txt.setAttribute('x', cx);
      txt.setAttribute('y', startY + i * lineHeight);
      txt.setAttribute('text-anchor', 'middle');
      txt.setAttribute('dominant-baseline', 'middle');
      txt.setAttribute('font-size', '12');
      txt.setAttribute('font-weight', '600');
      txt.setAttribute('fill', '#2d7a3e');
      txt.setAttribute('font-family', '"Noto Sans Devanagari", "DM Sans", sans-serif');
      txt.textContent = abbrHi + retro;
      svg.appendChild(txt);
    });
  }

  return svg;
}