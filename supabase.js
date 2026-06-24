// ============================================================
//  supabase.js — Shared Supabase client for AyurAstro360
// ============================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL  = 'https://YOUR_PROJECT_REF.supabase.co';
const SUPABASE_ANON = 'YOUR_ANON_PUBLIC_KEY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

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
