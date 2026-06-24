// ============================================================
//  profile.js — User Profile management
// ============================================================
import { supabase, requireAuth, signOut } from '../supabase.js';

// ---- Toast ----
function toast(msg, type = 'info') {
  const c = document.getElementById('toast-container');
  if (!c) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => { t.style.animation = 'toastOut .35s ease forwards'; setTimeout(() => t.remove(), 350); }, 3500);
}

let currentUser = null;

// ---- Init ----
(async () => {
  currentUser = await requireAuth();
  initSidebar();
  document.getElementById('signoutBtn')?.addEventListener('click', signOut);
  await loadProfile();
  loadStats();
})();

function initSidebar() {
  document.getElementById('hamburger')?.addEventListener('click', () => document.getElementById('sidebar')?.classList.toggle('open'));
}

// ============================================================
//  LOAD PROFILE
// ============================================================
async function loadProfile() {
  if (!currentUser) return;

  // Basic info from auth
  const meta = currentUser.user_metadata || {};
  const name = meta.full_name || meta.first_name || currentUser.email?.split('@')[0] || 'Seeker';

  // Set header
  const avatarEl = document.getElementById('profileAvatar');
  const nameEl   = document.getElementById('profileName');
  const emailEl  = document.getElementById('profileEmail');
  const sinceEl  = document.getElementById('memberSince');

  if (avatarEl) avatarEl.textContent = name[0].toUpperCase();
  if (nameEl)   nameEl.textContent   = name;
  if (emailEl)  emailEl.textContent  = currentUser.email || '';
  if (sinceEl) {
    const d = new Date(currentUser.created_at);
    sinceEl.textContent = `Member since ${d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`;
  }

  // Set form defaults
  const pName  = document.getElementById('pName');
  const pEmail = document.getElementById('pEmail');
  if (pName)  pName.value  = name;
  if (pEmail) pEmail.value = currentUser.email || '';

  // ---- Try to load extended profile from Supabase ----
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();

  if (profile) {
    const phone  = document.getElementById('pPhone');
    const dob    = document.getElementById('pDob');
    const tob    = document.getElementById('pTob');
    const pob    = document.getElementById('pPob');
    const gender = document.getElementById('pGender');
    const dBadge = document.getElementById('doshaBadge');

    if (phone  && profile.phone)       phone.value  = profile.phone;
    if (dob    && profile.dob)         dob.value    = profile.dob;
    if (tob    && profile.tob)         tob.value    = profile.tob;
    if (pob    && profile.birth_place) pob.value    = profile.birth_place;
    if (gender && profile.gender)      gender.value = profile.gender;
    if (dBadge && profile.dominant_dosha) dBadge.textContent = `🌿 Dosha: ${profile.dominant_dosha}`;
  }
}

// ============================================================
//  SAVE PERSONAL INFO
// ============================================================
document.getElementById('profileForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn  = document.getElementById('saveProfileBtn');
  const name = document.getElementById('pName').value.trim();
  const phone = document.getElementById('pPhone').value.trim();

  if (!name) { toast('Name cannot be empty', 'error'); return; }

  btn.disabled = true;
  btn.textContent = 'Saving…';

  // Update auth metadata
  const { error: authErr } = await supabase.auth.updateUser({
    data: { full_name: name, first_name: name.split(' ')[0] }
  });

  // Upsert profile table
  await supabase.from('profiles').upsert({
    id: currentUser.id,
    full_name: name,
    phone: phone || null,
    updated_at: new Date().toISOString()
  });

  if (authErr) {
    toast('Could not save: ' + authErr.message, 'error');
  } else {
    toast('Profile updated ✓', 'success');
    document.getElementById('profileName').textContent = name;
    document.getElementById('profileAvatar').textContent = name[0].toUpperCase();
    document.getElementById('avatarBtn').textContent = name[0].toUpperCase();
  }

  btn.disabled = false;
  btn.textContent = 'Save Changes';
});

// ============================================================
//  SAVE BIRTH DETAILS
// ============================================================
document.getElementById('birthForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn  = document.getElementById('saveBirthBtn');
  const dob    = document.getElementById('pDob').value;
  const tob    = document.getElementById('pTob').value;
  const pob    = document.getElementById('pPob').value.trim();
  const gender = document.getElementById('pGender').value;

  btn.disabled = true;
  btn.textContent = 'Saving…';

  const { error } = await supabase.from('profiles').upsert({
    id: currentUser.id,
    dob:         dob    || null,
    tob:         tob    || null,
    birth_place: pob    || null,
    gender:      gender || null,
    updated_at:  new Date().toISOString()
  });

  if (error) {
    toast('Could not save: ' + error.message, 'error');
  } else {
    toast('Birth details saved ✓', 'success');
  }

  btn.disabled = false;
  btn.textContent = 'Save Birth Details';
});

// ============================================================
//  CHANGE PASSWORD
// ============================================================
document.getElementById('passwordForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn     = document.getElementById('changePasswordBtn');
  const newPwd  = document.getElementById('pNewPwd').value;
  const confirm = document.getElementById('pConfirmPwd').value;

  if (newPwd.length < 8) { toast('Password must be at least 8 characters.', 'error'); return; }
  if (newPwd !== confirm) { toast('Passwords do not match.', 'error'); return; }

  btn.disabled = true;
  btn.textContent = 'Updating…';

  const { error } = await supabase.auth.updateUser({ password: newPwd });

  if (error) {
    toast('Error: ' + error.message, 'error');
  } else {
    toast('Password updated ✓', 'success');
    document.getElementById('pNewPwd').value     = '';
    document.getElementById('pConfirmPwd').value = '';
  }

  btn.disabled = false;
  btn.textContent = 'Update Password';
});

// ============================================================
//  DELETE ACCOUNT
// ============================================================
document.getElementById('deleteAccountBtn')?.addEventListener('click', async () => {
  const confirmed = window.confirm('⚠ Are you absolutely sure? This will permanently delete your account and all data.');
  if (!confirmed) return;

  // Delete profile data
  await supabase.from('profiles').delete().eq('id', currentUser.id);
  await supabase.from('manifestations').delete().eq('user_id', currentUser.id);

  // Sign out (Supabase doesn't expose admin delete from client — user should contact support or use Edge Function)
  await supabase.auth.signOut();
  window.location.href = 'index.html';
});

// ============================================================
//  STATS from localStorage
// ============================================================
function loadStats() {
  const set = (id, key) => {
    const el = document.getElementById(id);
    if (el) el.textContent = localStorage.getItem(key) || '0';
  };
  set('psReadings', 'aa_readings');
  set('psManifest', 'aa_manifests');
  set('psChats',    'aa_chats');
}
