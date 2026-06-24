// ============================================================
//  auth.js — Login & Signup logic
// ============================================================
import { supabase } from '../supabase.js';

// ---- Toast utility ----
function toast(msg, type = 'info') {
  const c = document.getElementById('toast-container');
  if (!c) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => { t.style.animation = 'toastOut .35s ease forwards'; setTimeout(() => t.remove(), 350); }, 3500);
}

function setFeedback(id, msg, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = `auth-feedback ${type}`;
}

// ============================================================
//  LOGIN
// ============================================================
const loginForm = document.getElementById('loginForm');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email    = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const btn      = document.getElementById('loginBtn');

    if (!email || !password) { setFeedback('loginFeedback', 'Please fill in all fields.', 'error'); return; }

    btn.disabled = true;
    btn.textContent = 'Signing in…';

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setFeedback('loginFeedback', error.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Sign In';
    } else {
      setFeedback('loginFeedback', '✓ Welcome back! Redirecting…', 'success');
      setTimeout(() => window.location.href = 'dashboard.html', 900);
    }
  });
}

// Google OAuth login
const googleLoginBtn = document.getElementById('googleLoginBtn');
if (googleLoginBtn) {
  googleLoginBtn.addEventListener('click', async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/dashboard.html` }
    });
  });
}

// ============================================================
//  SIGNUP
// ============================================================
const signupForm = document.getElementById('signupForm');
if (signupForm) {
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const firstName = document.getElementById('signupFirstName').value.trim();
    const lastName  = document.getElementById('signupLastName').value.trim();
    const email     = document.getElementById('signupEmail').value.trim();
    const password  = document.getElementById('signupPassword').value;
    const btn       = document.getElementById('signupBtn');

    if (!firstName || !email || !password) { setFeedback('signupFeedback', 'Please fill in all required fields.', 'error'); return; }
    if (password.length < 8) { setFeedback('signupFeedback', 'Password must be at least 8 characters.', 'error'); return; }

    btn.disabled = true;
    btn.textContent = 'Creating account…';

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: `${firstName} ${lastName}`, first_name: firstName, last_name: lastName }
      }
    });

    if (error) {
      setFeedback('signupFeedback', error.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Create Account';
    } else {
      setFeedback('signupFeedback', '✓ Account created! Check your email to confirm.', 'success');
      btn.textContent = '✓ Done!';
      setTimeout(() => window.location.href = 'login.html', 2000);
    }
  });
}

// Google OAuth signup
const googleSignupBtn = document.getElementById('googleSignupBtn');
if (googleSignupBtn) {
  googleSignupBtn.addEventListener('click', async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/dashboard.html` }
    });
  });
}

// ---- Redirect logged-in users away from auth pages ----
(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) window.location.href = 'dashboard.html';
})();
