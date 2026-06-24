import { supabase } from '../supabase.js';

function showFeedback(elementId, message, isError = false) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? '#c0392b' : 'var(--green-mid)';
  el.style.marginTop = '10px';
  el.style.fontSize = '14px';
  el.style.textAlign = 'center';
}

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  const googleLoginBtn = document.getElementById('googleLoginBtn');
  const googleSignupBtn = document.getElementById('googleSignupBtn');

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('loginEmail').value;
      const password = document.getElementById('loginPassword').value;
      const btn = document.getElementById('loginBtn');
      btn.disabled = true;
      btn.textContent = 'Signing In...';

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      
      if (error) {
        showFeedback('loginFeedback', error.message, true);
        btn.disabled = false;
        btn.textContent = 'Sign In';
      } else {
        window.location.href = 'dashboard.html';
      }
    });
  }

  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('signupEmail').value;
      const password = document.getElementById('signupPassword').value;
      const firstName = document.getElementById('signupFirstName').value;
      const lastName = document.getElementById('signupLastName').value;
      const btn = document.getElementById('signupBtn');
      btn.disabled = true;
      btn.textContent = 'Creating Account...';

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName
          }
        }
      });
      
      if (error) {
        showFeedback('signupFeedback', error.message, true);
        btn.disabled = false;
        btn.textContent = 'Create Account';
      } else {
        showFeedback('signupFeedback', 'Check your email to confirm your account!', false);
        btn.disabled = false;
        btn.textContent = 'Create Account';
      }
    });
  }

  const handleGoogleAuth = async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/dashboard.html'
      }
    });
    if (error) {
      alert('Error with Google Sign In: ' + error.message);
    }
  };

  if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', (e) => {
      e.preventDefault();
      handleGoogleAuth();
    });
  }

  if (googleSignupBtn) {
    googleSignupBtn.addEventListener('click', (e) => {
      e.preventDefault();
      handleGoogleAuth();
    });
  }
});
