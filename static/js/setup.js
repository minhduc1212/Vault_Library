'use strict';

const COOKIE_KEY = 'vault_comics_dirs';

/* ── COOKIE HELPERS ──────────────────────────── */
function setCookie(name, value, days) {
  const d = new Date();
  d.setTime(d.getTime() + days * 86400000);
  document.cookie = name + '=' + encodeURIComponent(value) +
    ';expires=' + d.toUTCString() + ';path=/;SameSite=Lax';
}

function getCookie(name) {
  const m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
  return m ? decodeURIComponent(m[2]) : null;
}

/* ── STATE ───────────────────────────────────── */
let dirs = [];

/* ── RENDER PATH LIST ────────────────────────── */
function render() {
  const list = document.getElementById('path-list');
  const countEl = document.getElementById('path-count');
  
  if (!list || !countEl) return;

  countEl.textContent = dirs.length === 0
    ? '0 folders configured'
    : dirs.length === 1 ? '1 folder' : dirs.length + ' folders';

  if (!dirs.length) {
    list.innerHTML = `
      <div class="path-item" style="justify-content:center;">
        <div class="empty-folder-list">
          <div class="empty-folder-list__icon">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/>
            </svg>
          </div>
          <div class="empty-folder-list__text">No folders added yet.<br>Add a comics folder above to get started.</div>
        </div>
      </div>`;
    return;
  }

  list.innerHTML = dirs.map((d, i) => `
    <div class="path-item">
      <div class="path-item__icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <path d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/>
        </svg>
      </div>
      <div class="path-item__info">
        <div class="path-item__label">Folder ${i + 1}</div>
        <div class="path-item__path">${escHtml(d)}</div>
      </div>
      <button class="path-item__remove" data-index="${i}" title="Remove this folder" aria-label="Remove folder ${i+1}">×</button>
    </div>
  `).join('');

  /* wire remove buttons */
  list.querySelectorAll('.path-item__remove').forEach(btn => {
    btn.addEventListener('click', () => removePath(parseInt(btn.dataset.index)));
  });
}

/* ── ADD PATH ────────────────────────────────── */
async function addPath() {
  const input   = document.getElementById('path-input');
  const errorEl = document.getElementById('error-msg');
  if (!input) return;
  const val     = input.value.trim();

  if (!val) {
    showError('Please enter a folder path.');
    return;
  }

  const addBtn = document.getElementById('add-btn');
  if (addBtn) {
    addBtn.textContent = 'Adding…';
    addBtn.disabled = true;
  }
  hideError();

  try {
    const res = await fetch('/api/config/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: val })
    });
    const data = await res.json();
    if (!res.ok) {
      showError(data.error || 'Failed to add folder.');
    } else {
      dirs = data.comics_dirs;
      persistCookie();
      render();
      input.value = '';
      input.focus();
    }
  } catch {
    showError('Network error. Is the server running?');
  } finally {
    if (addBtn) {
      addBtn.textContent = '+ Add folder';
      addBtn.disabled = false;
    }
  }
}

/* ── REMOVE PATH ─────────────────────────────── */
async function removePath(index) {
  try {
    const res = await fetch('/api/config/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ index: index })
    });
    const data = await res.json();
    if (res.ok) {
      dirs = data.comics_dirs;
      persistCookie();
      render();
    } else {
      showError(data.error || 'Failed to remove folder.');
    }
  } catch {
    showError('Network error. Is the server running?');
  }
}

/* ── ERROR ───────────────────────────────────── */
function showError(msg) {
  const el = document.getElementById('error-msg');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('is-visible');
}
function hideError() {
  const el = document.getElementById('error-msg');
  if (!el) return;
  el.textContent = '';
  el.classList.remove('is-visible');
}

/* ── COOKIE PERSISTENCE ──────────────────────── */
function persistCookie() {
  setCookie(COOKIE_KEY, JSON.stringify(dirs), 365);
}

/* ── UTIL ────────────────────────────────────── */
function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ── SINGLE COMIC FORM ────────────────────────── */
function toggleComicForm() {
  const form = document.getElementById('comic-form');
  const toggle = document.getElementById('comic-form-toggle');
  if (!form || !toggle) return;
  const visible = form.style.display !== 'none';
  form.style.display = visible ? 'none' : 'flex';
  toggle.classList.toggle('is-active', !visible);
  const err = document.getElementById('comic-error-msg');
  if (err) err.classList.remove('is-visible');
}

async function addComic() {
  const title    = document.getElementById('sc-title').value.trim();
  const path     = document.getElementById('sc-path').value.trim();
  const author   = document.getElementById('sc-author').value.trim();
  const genres   = document.getElementById('sc-genres').value.trim();
  const cover    = document.getElementById('sc-cover').value.trim();
  const desc     = document.getElementById('sc-desc').value.trim();
  const errorEl  = document.getElementById('comic-error-msg');
  const submitBtn = document.getElementById('sc-submit');

  if (!title || !path) {
    if (errorEl) {
      errorEl.textContent = 'Title and folder path are required.';
      errorEl.classList.add('is-visible');
    }
    return;
  }

  if (submitBtn) {
    submitBtn.textContent = 'Saving…';
    submitBtn.disabled = true;
  }
  if (errorEl) errorEl.classList.remove('is-visible');

  try {
    const res = await fetch('/api/comics/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, path, author, genres, cover_image: cover, description: desc })
    });
    const data = await res.json();
    if (!res.ok) {
      if (errorEl) {
        errorEl.textContent = data.error || 'Failed to add comic.';
        errorEl.classList.add('is-visible');
      }
    } else {
      /* clear form */
      document.getElementById('sc-title').value = '';
      document.getElementById('sc-path').value = '';
      document.getElementById('sc-author').value = '';
      document.getElementById('sc-genres').value = '';
      document.getElementById('sc-cover').value = '';
      document.getElementById('sc-desc').value = '';
      if (errorEl) {
        errorEl.textContent = 'Comic "' + escHtml(title) + '" added!';
        errorEl.style.color = 'var(--green)';
        errorEl.classList.add('is-visible');
        setTimeout(() => {
          errorEl.style.color = '';
          errorEl.classList.remove('is-visible');
        }, 3000);
      }
    }
  } catch {
    if (errorEl) {
      errorEl.textContent = 'Network error. Is the server running?';
      errorEl.classList.add('is-visible');
    }
  } finally {
    if (submitBtn) {
      submitBtn.textContent = 'Save Comic';
      submitBtn.disabled = false;
    }
  }
}

/* ── INIT ────────────────────────────────────── */
async function init() {
  hideError();

  /* try server first */
  try {
    const res = await fetch('/api/config');
    const cfg = await res.json();
    if (cfg.comics_dirs && cfg.comics_dirs.length) {
      dirs = cfg.comics_dirs;
    }
  } catch { /* server not available */ }

  /* fall back to cookie */
  if (!dirs.length) {
    const raw = getCookie(COOKIE_KEY);
    if (raw) {
      try { dirs = JSON.parse(raw); } catch { dirs = []; }
    }
  }

  render();

  /* wire up add */
  const addBtn = document.getElementById('add-btn');
  if (addBtn) addBtn.addEventListener('click', addPath);
  
  const pathInput = document.getElementById('path-input');
  if (pathInput) {
    pathInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') addPath();
    });
  }

  /* wire up single comic form */
  const formToggle = document.getElementById('comic-form-toggle');
  if (formToggle) formToggle.addEventListener('click', toggleComicForm);
  
  const scSubmit = document.getElementById('sc-submit');
  if (scSubmit) scSubmit.addEventListener('click', addComic);

  /* Go to library */
  const goBtn = document.getElementById('go-btn');
  if (goBtn) {
    goBtn.addEventListener('click', () => {
      if (dirs.length) {
        /* ensure server has the latest */
        setCookie(COOKIE_KEY, JSON.stringify(dirs), 365);
      }
      window.location.href = '/';
    });
  }
}

init();
