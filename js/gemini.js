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
 * Send a prompt to the gemini-chat edge function and return the text response.
 * @param {string} prompt
 * @param {Array}  history  — [{role:'user'|'model', parts:[{text}]}]
 */
export async function askGemini(prompt, history = []) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('You must be signed in to chat.');

  const res = await fetch(EDGE_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify({ prompt, history })
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
  (async () => { await requireAuth(); })();
  document.getElementById('signoutBtn')?.addEventListener('click', signOut);
  document.getElementById('hamburger')?.addEventListener('click', () => document.getElementById('sidebar')?.classList.toggle('open'));

  let conversationHistory = [];
  let activeTopic = 'general';

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
      const reply = await askGemini(fullPrompt, conversationHistory);
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