// ============================================================
//  gemini.js — Google Gemini AI integration + Chat UI
// ============================================================
import { requireAuth, signOut } from '../supabase.js';

const GEMINI_API_KEY = 'YOUR_GEMINI_API_KEY';
const GEMINI_URL     = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

const SYSTEM_CONTEXT = `You are AyurGuru — a wise, compassionate guide specialising in Ayurveda, Vedic astrology, holistic wellness, and Indian spirituality. 
You give personalised, practical guidance rooted in ancient wisdom. 
Keep responses warm, insightful, and concise (2-4 paragraphs max). 
Use relevant Sanskrit terms with brief explanations. 
Always encourage self-care and spiritual growth.`;

/**
 * Send a prompt to Gemini and return the text response.
 * @param {string} prompt
 * @param {Array}  history  — [{role:'user'|'model', parts:[{text}]}]
 */
export async function askGemini(prompt, history = []) {
  const contents = [
    ...history,
    { role: 'user', parts: [{ text: prompt }] }
  ];

  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_CONTEXT }] },
      contents
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gemini error ${res.status}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'I could not generate a response. Please try again.';
}

// ============================================================
//  CHAT PAGE LOGIC
// ============================================================
const chatMessages = document.getElementById('chatMessages');
if (!chatMessages) {
  // gemini.js loaded from another page (e.g. kundli.js import) — skip UI init
} else {
  // ---- Auth guard ----
  (async () => { await requireAuth(); })();
  document.getElementById('signoutBtn')?.addEventListener('click', signOut);
  document.getElementById('hamburger')?.addEventListener('click', () => document.getElementById('sidebar')?.classList.toggle('open'));

  // ---- State ----
  let conversationHistory = [];
  let activeTopic = 'general';

  // ---- Topic sidebar ----
  document.querySelectorAll('.chat-topic-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.chat-topic-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeTopic = btn.dataset.topic;
    });
  });

  // ---- Suggested chips ----
  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => sendMessage(chip.dataset.q));
  });

  // ---- Append bubble ----
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

  // ---- Typing indicator ----
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

  // ---- Send message ----
  async function sendMessage(text) {
    text = text?.trim();
    if (!text) return;

    const input   = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');
    if (input) input.value = '';
    if (sendBtn) sendBtn.disabled = true;

    // Hide suggested chips after first message
    document.querySelector('.welcome-bubble')?.remove();

    appendBubble('user', text);

    const topicHint = activeTopic !== 'general' ? ` [Focus on: ${activeTopic}]` : '';
    const fullPrompt = text + topicHint;

    showTyping();

    try {
      const reply = await askGemini(fullPrompt, conversationHistory);
      hideTyping();
      appendBubble('ai', reply);

      conversationHistory.push({ role: 'user',  parts: [{ text: fullPrompt }] });
      conversationHistory.push({ role: 'model', parts: [{ text: reply }] });

      // Trim history to last 20 turns
      if (conversationHistory.length > 20) conversationHistory = conversationHistory.slice(-20);

      // Stats
      const prev = parseInt(localStorage.getItem('aa_chats') || '0');
      localStorage.setItem('aa_chats', prev + 1);

    } catch (err) {
      hideTyping();
      appendBubble('ai', `🙏 I apologise — ${err.message}. Please check your Gemini API key in gemini.js.`);
    }

    if (sendBtn) sendBtn.disabled = false;
  }

  // ---- Send button ----
  document.getElementById('sendBtn')?.addEventListener('click', () => {
    sendMessage(document.getElementById('chatInput')?.value);
  });

  // ---- Enter key ----
  document.getElementById('chatInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(e.target.value); }
  });

  // ---- Auto-resize textarea ----
  document.getElementById('chatInput')?.addEventListener('input', (e) => {
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px';
  });

  // ---- Clear chat ----
  document.getElementById('clearChatBtn')?.addEventListener('click', () => {
    conversationHistory = [];
    if (chatMessages) chatMessages.innerHTML = '<div style="color:var(--text-light);text-align:center;padding:32px;font-size:14px;">Chat cleared — start a new conversation 🌿</div>';
  });
}
