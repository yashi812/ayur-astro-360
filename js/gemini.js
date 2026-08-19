// ============================================================
//  gemini.js — Google Gemini AI integration + Chat UI
//  (now proxied through a Supabase Edge Function, so no API
//   key is ever exposed in the browser)
// ============================================================
import { requireAuth, signOut, supabase } from '../supabase.js';

// Point this at your deployed edge function.
// Format: https://<project-ref>.supabase.co/functions/v1/gemini-chat
const EDGE_FUNCTION_URL = 'https://okxhfskixhdvuoojeske.supabase.co/functions/v1/gemini-chat';

/**
 * Read the dosha result saved locally by health-quiz.js.
 * Returns null if the quiz hasn't been taken yet.
 */
function getLocalDoshaResult() {
  try {
    const stored = localStorage.getItem('aa_dosha');
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

/**
 * Send a prompt to the gemini-chat edge function and return the text response.
 * @param {string} prompt
 * @param {Array}  history  — [{role:'user'|'model', parts:[{text}]}]
 * @param {Object|null} doshaResult — { dominant, vata, pitta, kapha } or null
 */
export async function askGemini(prompt, history = [], doshaResult = null) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('You must be signed in to chat.');

  const res = await fetch(EDGE_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify({ prompt, history, doshaResult })
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.error || `Server error ${res.status}`);
  }

  return data.reply || 'I could not generate a response. Please try again.';
}

// ============================================================
//  CHAT PAGE LOGIC
// ============================================================
const chatMessages = document.getElementById('chatMessages');
if (!chatMessages) {
  // gemini.js loaded from another page — skip UI init
} else {
  (async () => { await requireAuth(); initDoshaBadge(); })();
  document.getElementById('signoutBtn')?.addEventListener('click', signOut);
  document.getElementById('hamburger')?.addEventListener('click', () => document.getElementById('sidebar')?.classList.toggle('open'));

  let conversationHistory = [];
  let activeTopic = 'general';

  // ---- Show the user's dosha in the welcome bubble, if available ----
  function initDoshaBadge() {
    const badgeEl = document.getElementById('doshaBadgeInline');
    if (!badgeEl) return;

    const result = getLocalDoshaResult();
    if (result) {
      badgeEl.textContent = `🌿 Guidance personalised for your ${result.dominant} constitution`;
      badgeEl.style.display = 'block';
    } else {
      badgeEl.textContent = `🌿 Take the Dosha Quiz on Health & Dosha for personalised guidance`;
      badgeEl.style.display = 'block';
      badgeEl.style.cursor = 'pointer';
      badgeEl.addEventListener('click', () => { window.location.href = 'health.html'; });
    }
  }

  document.querySelectorAll('.chat-topic-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.chat-topic-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeTopic = btn.dataset.topic;
    });
  });

  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => sendMessage(chip.dataset.q));
  });

  function appendBubble(role, text) {
    const div = document.createElement('div');
    div.className = `chat-bubble ${role}`;
    if (role === 'ai') {
      div.innerHTML = `<div class="bubble-label">✦ AyurGuru</div>${escapeHtml(text).replace(/\n/g, '<br>')}`;
    } else {
      div.textContent = text;
    }
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return div;
  }

  function escapeHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function showTyping() {
    const div = document.createElement('div');
    div.className = 'chat-bubble ai';
    div.id = 'typingIndicator';
    div.innerHTML = `<div class="bubble-label">✦ AyurGuru</div><div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
  function hideTyping() {
    document.getElementById('typingIndicator')?.remove();
  }

  async function sendMessage(text) {
  text = text?.trim();
  if (!text) return;

    const input   = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');
    if (input) input.value = '';
    if (sendBtn) sendBtn.disabled = true;

    document.querySelector('.welcome-bubble')?.remove();

    appendBubble('user', text);

    const topicHint = activeTopic !== 'general' ? ` [Focus on: ${activeTopic}]` : '';
    const fullPrompt = text + topicHint;

    showTyping();

    try {
    const doshaResult = getLocalDoshaResult();
    const kundliContext = await buildKundliContext(); // NEW
    const reply = await askGemini(fullPrompt, conversationHistory, doshaResult, kundliContext);
    hideTyping();
    appendBubble('ai', reply);

      conversationHistory.push({ role: 'user',  parts: [{ text: fullPrompt }] });
      conversationHistory.push({ role: 'model', parts: [{ text: reply }] });

      if (conversationHistory.length > 20) conversationHistory = conversationHistory.slice(-20);

      const prev = parseInt(localStorage.getItem('aa_chats') || '0');
      localStorage.setItem('aa_chats', prev + 1);

    } catch (err) {
      hideTyping();
      appendBubble('ai', `🙏 I apologise — ${err.message}. Please try again in a moment.`);
    }

    if (sendBtn) sendBtn.disabled = false;
  }

  document.getElementById('sendBtn')?.addEventListener('click', () => {
    sendMessage(document.getElementById('chatInput')?.value);
  });

  document.getElementById('chatInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(e.target.value); }
  });

  document.getElementById('chatInput')?.addEventListener('input', (e) => {
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px';
  });

  document.getElementById('clearChatBtn')?.addEventListener('click', () => {
    conversationHistory = [];
    if (chatMessages) chatMessages.innerHTML = '<div style="color:var(--text-light);text-align:center;padding:32px;font-size:14px;">Chat cleared — start a new conversation 🌿</div>';
  });
}

// ---- Kundli context (ascendant, Moon sign, Mahadasha, yogas, live Gochar) ----
const KUNDLI_SIGN_ORDER = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
];

const KUNDLI_PLANETS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];

// Same classical rules used on the kundli page's Gochar panel
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

function getLatestKundliSave() {
  try {
    const raw = localStorage.getItem('aa_kundli_saves');
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) && arr.length > 0 ? arr[0] : null; // most recent is unshifted to index 0
  } catch {
    return null;
  }
}

async function fetchGocharSummary(natalMoonSign, latitude, longitude) {
  if (!natalMoonSign || typeof latitude !== 'number' || typeof longitude !== 'number') return null;

  const now = new Date();
  const isoToday = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  const timeNow = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

  try {
    const { data, error } = await supabase.functions.invoke('generate-kundli', {
      body: { date: isoToday, time: timeNow, latitude, longitude, name: 'Gochar' },
    });
    if (error || !data || !data.planets) return null;

    const moonIdx = KUNDLI_SIGN_ORDER.indexOf(natalMoonSign);
    const startIdx = moonIdx === -1 ? 0 : moonIdx;

    const lines = [];
    KUNDLI_PLANETS.forEach((planetName) => {
      const p = data.planets[planetName];
      if (!p || !p.sign) return;
      const signIdx = KUNDLI_SIGN_ORDER.indexOf(p.sign);
      const houseFromMoon = signIdx === -1 ? null : ((signIdx - startIdx + 12) % 12) + 1;

      let tag = 'neutral';
      const rule = GOCHAR_EFFECTS[planetName];
      if (rule && houseFromMoon) {
        if (rule.good.indexOf(houseFromMoon) !== -1) tag = 'favorable';
        else if (rule.bad.indexOf(houseFromMoon) !== -1) tag = 'challenging';
      }
      if (houseFromMoon) {
        lines.push(`${planetName} in ${p.sign} (house ${houseFromMoon} from natal Moon, ${tag})`);
      }
    });
    return lines.length ? lines.join('; ') : null;
  } catch (e) {
    console.warn('[fetchGocharSummary] failed:', e);
    return null;
  }
}

/**
 * Build a compact, factual text block from the user's most recently saved
 * kundli: ascendant, Moon sign, current Mahadasha/Antardasha, yogas, and a
 * freshly-fetched Gochar (transit) snapshot. Returns null if no kundli has
 * been saved yet, so the prompt degrades gracefully.
 */
async function buildKundliContext() {
  const record = getLatestKundliSave();
  if (!record || !record.result) return null;

  const { positions = [], ascendant, dasha, richSummary, birthLatLng, usedFallback } = record.result;
  if (usedFallback) return null; // don't ground the AI in an estimated/offline chart

  const moon = positions.find((p) => (p.planet || '').split(' ')[0] === 'Moon');
  const natalMoonSign = moon ? moon._rawSign : null;

  const lines = [];
  if (ascendant?.sign) lines.push(`Ascendant (Lagna): ${ascendant.sign}`);
  if (natalMoonSign) lines.push(`Moon sign (Rashi): ${natalMoonSign}`);
  if (dasha?.current) {
    lines.push(
      `Current Mahadasha: ${dasha.current}` +
      (dasha.sub ? `, Antardasha: ${dasha.sub}` : '') +
      (dasha.pratyantar ? `, Pratyantardasha: ${dasha.pratyantar}` : '') +
      (dasha.period ? ` (${dasha.period})` : '')
    );
  }
  if (richSummary) {
    const yogaLines = richSummary.split('\n').filter((l) => l.startsWith('- '));
    if (yogaLines.length) lines.push('Yogas: ' + yogaLines.map((l) => l.slice(2)).join('; '));
  }

  const gochar = await fetchGocharSummary(natalMoonSign, birthLatLng?.latitude, birthLatLng?.longitude);
  if (gochar) lines.push(`Today's Gochar (transits from natal Moon): ${gochar}`);

  return lines.length ? lines.join('\n') : null;
}

/**
 * Send a prompt to the gemini-chat edge function and return the text response.
 */
export async function askGemini(prompt, history = [], doshaResult = null, kundliContext = null) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('You must be signed in to chat.');

  const res = await fetch(EDGE_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify({ prompt, history, doshaResult, kundliContext })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Server error ${res.status}`);
  return data.reply || 'I could not generate a response. Please try again.';
}