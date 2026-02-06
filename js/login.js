// DOM elements
const loginBtn = document.getElementById('loginBtn');
const usernameEl = document.getElementById('username');
const passwordEl = document.getElementById('password');
const statusEl = document.getElementById('loginStatus');
const pandaEl = document.querySelector('.panda');
const loginEl = document.querySelector('.login');

// prevent duplicate submissions
let isSubmitting = false;

// simple toast helper: creates a temporary toast at the bottom center
function showToast(msg, type = 'error', duration = 3500) {
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.setAttribute('role', 'alert');
  t.textContent = msg;
  document.body.appendChild(t);
  // force reflow then show
  void t.offsetWidth;
  t.classList.add('show');
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, duration);
} 

// API_BASE helper
const API_BASE = (typeof window !== 'undefined' && window.API_BASE_URL) ? String(window.API_BASE_URL).replace(/\/$/, '') : '';
if (!API_BASE) {
  // keep behavior: show message when trying to login
}

// focus/blur: implement behavior similar to your jQuery snippet
function resetPositions(){
  const handl = document.querySelector('.handl');
  const handr = document.querySelector('.handr');
  const eyeball1 = document.querySelector('.eyeball1');
  const eyeball2 = document.querySelector('.eyeball2');
  [handl, handr].forEach(el=>{ if(el){ el.style.transform=''; el.style.bottom=''; el.style.left=''; el.style.height=''; el.style.width=''; } });
  if(eyeball1){ eyeball1.style.top=''; eyeball1.style.left=''; }
  if(eyeball2){ eyeball2.style.top=''; eyeball2.style.left=''; }
}

// clicking outside inputs should not trigger animations; clear when user clicks elsewhere
document.addEventListener('click', (e) => {
  const t = e.target;
  // allow clicks on the inputs themselves
  if (t === usernameEl || t === passwordEl) return;
  // allow clicks inside input/icon area
  if (t.closest && (t.closest('.inputs') || t.closest('.form'))) return;
  // otherwise remove hands-cover and reset inline styles
  document.body.classList.remove('hands-cover');
  resetPositions();
});

// text inputs focus (username): ensure hands are not covering and reset positions (no hand animation)
if (usernameEl) {
  usernameEl.addEventListener('focus', () => {
    // remove any cover state and reset inline styles so hands remain at rest
    document.body.classList.remove('hands-cover');
    resetPositions();
  });
  usernameEl.addEventListener('blur', resetPositions);
}

// password focus: hands move to cover eyes
if (passwordEl) {
  passwordEl.addEventListener('focus', () => {
    // Use CSS class to move hands; adjust eyeballs slightly for realism
    document.body.classList.add('hands-cover');
    const eyeball1 = document.querySelector('.eyeball1');
    const eyeball2 = document.querySelector('.eyeball2');
    if(eyeball1){ eyeball1.style.top='10px'; eyeball1.style.left='10px'; }
    if(eyeball2){ eyeball2.style.top='10px'; eyeball2.style.left='10px'; }
  });
  passwordEl.addEventListener('blur', () => { document.body.classList.remove('hands-cover'); resetPositions(); });
}

// cleanup after animations
loginEl && loginEl.addEventListener('animationend', (ev) => {
  if (ev.animationName === 'shake') loginEl.classList.remove('shake');
});
pandaEl && pandaEl.addEventListener('animationend', (ev) => {
  if (ev.animationName === 'nod' || ev.animationName === 'nod---') pandaEl.classList.remove('success');
  // some browsers report names differently; safe to remove
  pandaEl.classList.remove('success');
});

// login handler
loginBtn.onclick = async function() {
  if (isSubmitting) return;
  isSubmitting = true;
  loginBtn.disabled = true;
  const prevBtnText = loginBtn.textContent;
  loginBtn.textContent = 'Memproses...';

  const username = usernameEl.value.trim();
  const password = passwordEl.value.trim();

  // remove focus from inputs immediately to avoid hands staying in 'cover' state
  if (passwordEl) passwordEl.blur();
  if (usernameEl) usernameEl.blur();

  if (!API_BASE) {
    statusEl.textContent = 'API_BASE_URL belum dikonfigurasi. Periksa `genco/js/config.js`';
    return;
  }

  statusEl.textContent = 'Memproses login...';
  try {
    const res = await fetch(API_BASE + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (!res.ok) {
      let errMsg = 'Login gagal';
      try { const err = await res.json(); errMsg = err.error || err.message || `${res.status} ${res.statusText}`; } catch (parseErr) { errMsg = `${res.status} ${res.statusText}`; }
      statusEl.textContent = errMsg;
      document.body.classList.remove('hands-cover');
      resetPositions();
      showToast(errMsg, 'error');
      console.warn('Login failed', res.status, errMsg);
      return;
    }

    const data = await res.json();

    if (data.token) {
      // success: store token, nod animation then redirect
      localStorage.setItem('auth_token', data.token);
      if (pandaEl) pandaEl.classList.add('success');
      setTimeout(() => { window.location.href = 'index.html'; }, 700);
    } else {
      // show error and ensure hands reset (no unexpected position changes)
      const errMsg = data.error || 'Login gagal';
      statusEl.textContent = errMsg;
      document.body.classList.remove('hands-cover');
      resetPositions();
      showToast(errMsg, 'error');
    }
  } catch (e) {
    console.error('Network/login error', e);
    const errMsg = 'Terjadi kesalahan jaringan';
    statusEl.textContent = errMsg;
    document.body.classList.remove('hands-cover');
    resetPositions();
    showToast(errMsg, 'error');
  } finally {
    isSubmitting = false;
    loginBtn.disabled = false;
    loginBtn.textContent = prevBtnText || 'LOGIN';
  }
};