// ============================================================
//  auth.js — Disabled auth handlers (sign-in/signup hidden)
//  This file intentionally disables interactive sign-in/signup flows
//  so the site can be used without authentication during demos.
// ============================================================

// If the auth pages are visited, replace the auth card with a simple notice
// and a button to continue to the dashboard.
function replaceAuthCard() {
  const card = document.querySelector('.auth-card');
  if (!card) return;
  card.innerHTML = `
    <div style="padding:28px;text-align:center;">
      <h2 style="margin-bottom:8px;">Sign-in Disabled</h2>
      <p style="color:var(--text-mid);margin-bottom:18px;">Authentication is temporarily disabled — continue to the dashboard without signing in.</p>
      <a class="btn btn-primary" href="dashboard.html">Continue to Dashboard</a>
    </div>
  `;
}

document.addEventListener('DOMContentLoaded', () => {
  replaceAuthCard();
  // Also convert any sign-in links on the page to point to dashboard
  document.querySelectorAll('a[href="login.html"], a[href="signup.html"]').forEach(a => a.href = 'dashboard.html');
  // Disable any forms accidentally left on the page
  document.querySelectorAll('form').forEach(f => f.addEventListener('submit', (e) => { e.preventDefault(); }));
});
