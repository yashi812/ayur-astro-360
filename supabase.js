// ============================================================
//  supabase.js — Shared Supabase client for AyurAstro360
// ============================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL  = 'https://okxhfskixhdvuoojeske.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9reGhmc2tpeGhkdnVvb2plc2tlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyOTg5NTUsImV4cCI6MjA5Nzg3NDk1NX0.yXxTDC9rflN8g84lAHiglVHMYwJQgK2TN4EIih8p6tc';

// Basic config validation to catch placeholder values like "your_project_ref.supabase.co".
function _isPlaceholderUrl(url) {
  if (!url) return true;
  const lowered = url.toLowerCase();
  return lowered.includes('your_project_ref') || lowered.includes('your-project-ref') || lowered.includes('<project>') || lowered.includes('replace_me');
}

const _isInvalidConfig = _isPlaceholderUrl(SUPABASE_URL) || !SUPABASE_ANON || SUPABASE_ANON.includes('REPLACE_ME');

let supabase;
if (_isInvalidConfig) {
  // Create a light stub that surfaces helpful errors instead of letting the browser follow a broken DNS.
  console.error('Supabase not configured. Please set SUPABASE_URL and SUPABASE_ANON in supabase.js with values from your Supabase project.');

  // Show an in-page banner so the user sees a clear error in the browser UI.
  try {
    if (typeof document !== 'undefined') {
      const _showBanner = () => {
        const banner = document.createElement('div');
        banner.style.cssText = 'background:#fff3cd;color:#663c00;padding:12px 16px;border-left:4px solid #ffecb5;font-family:inherit;position:fixed;left:16px;right:16px;top:16px;z-index:9999;border-radius:6px;box-shadow:0 6px 20px rgba(0,0,0,0.06);';
        banner.innerHTML = '<strong>Supabase not configured</strong> — open <em>supabase.js</em> and set your project URL and anon key (see README).';
        document.body.prepend(banner);
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _showBanner);
      else _showBanner();
    }
  } catch (e) {
    // ignore DOM errors in non-browser environments
  }

  // Very small stub client that returns an error object consistent with Supabase calls.
  const makeErr = (msg) => ({ data: null, error: { message: msg || 'Supabase not configured' } });
  supabase = {
    auth: {
      signInWithPassword: async () => makeErr('Supabase not configured'),
      signUp: async () => makeErr('Supabase not configured'),
      signInWithOAuth: async () => makeErr('Supabase not configured'),
      getUser: async () => ({ data: { user: null }, error: { message: 'Supabase not configured' } }),
      signOut: async () => ({ error: { message: 'Supabase not configured' } })
    },
    from: () => ({ select: async () => makeErr('Supabase not configured') })
  };
} else {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON);
}

export { supabase };

/**
 * Returns the currently authenticated user, or null.
 */
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/**
 * Redirect to login if not authenticated.
 * Call this at the top of any protected page script.
 */
export async function requireAuth() {
  // No redirect: allow pages to call requireAuth() without forcing a login redirect.
  // Returns the current user or null.
  const user = await getCurrentUser();
  return user;
}

/**
 * Sign out and redirect to login.
 */
export async function signOut() {
  await supabase.auth.signOut();
  // After sign-out, send user to the public index page.
  window.location.href = 'index.html';
}
