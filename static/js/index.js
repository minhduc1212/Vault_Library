'use strict';

/* ── SKELETON ────────────────────────────────── */
const grid = document.getElementById('grid');

if (grid) {
  (function renderSkeletons() {
    grid.innerHTML = Array(12).fill(0).map(() => `
      <div role="listitem" aria-hidden="true">
        <div class="sk-cover sk-pulse"></div>
        <div class="sk-body">
          <div class="sk-line sk-line--md sk-pulse"></div>
          <div class="sk-line sk-line--sm sk-pulse"></div>
        </div>
      </div>`).join('');
  })();
}

/* ── STATE ───────────────────────────────────── */
let allComics   = [];
let activeFilter = 'all';

/* ── LOAD ────────────────────────────────────── */
async function loadLibrary() {
  try {
    const res  = await fetch('/api/library');
    allComics  = await res.json();
  } catch (e) {
    allComics  = [];
  }

  /* update hero stat — single source of truth */
  const countEl = document.getElementById('stat-count');
  if (countEl) {
    countEl.textContent = allComics.length;
    countEl.classList.add('is-loaded');
  }

  render();
}

/* ── RENDER ──────────────────────────────────── */
function render() {
  if (!grid) return;

  const list   = activeFilter === 'all'
    ? allComics
    : allComics.filter(c => c.type === activeFilter);

  const shown  = list.length;
  const total  = allComics.length;

  /* filter count: only visible when a filter reduces the set */
  const countEl = document.getElementById('filter-count');
  if (countEl) {
    if (activeFilter !== 'all') {
      countEl.textContent = `${shown} of ${total}`;
      countEl.classList.add('is-visible');
    } else {
      countEl.textContent = '';
      countEl.classList.remove('is-visible');
    }
  }

  /* empty state */
  if (!list.length) {
    grid.innerHTML = `
      <div class="empty-state" role="listitem">
        <div class="empty-state__icon">📂</div>
        <h2 class="empty-state__heading">Nothing here yet.</h2>
        <p class="empty-state__body">
          One-shot → <code>comics/my-comic/</code> (images inside)<br>
          Series &nbsp;→ <code>comics/my-series/Ch.1/</code> (chapters)
        </p>
      </div>`;
    return;
  }

  /* cards */
  grid.innerHTML = list.map(c => {
    const href  = c.type === 'series'
      ? `/series/${c.dir_index}/${encodeURIComponent(c.rel_path)}`
      : `/read/${c.dir_index}/${encodeURIComponent(c.rel_path)}`;

    const meta   = c.type === 'series'
      ? `${c.chapters} ch.`
      : `${c.pages} pg.`;

    const badgeClass = c.type === 'series'
      ? 'card__badge card__badge--series'
      : 'card__badge';
    const badgeLabel = c.type === 'series' ? 'Series' : 'One-shot';

    const cover = c.cover
      ? `<img src="${c.cover}" alt="" loading="lazy"/>`
      : `<div class="no-cover" aria-hidden="true">📖</div>`;

    return `
      <article class="card" role="listitem">
        <a href="${href}" aria-label="${escHtml(c.name)} — ${badgeLabel}, ${meta}">
          <div class="card__cover">
            ${cover}
            <span class="${badgeClass}" aria-hidden="true">${badgeLabel}</span>
          </div>
          <div class="card__body">
            <div class="card__title">${escHtml(c.name)}</div>
            <div class="card__meta">${meta}</div>
          </div>
        </a>
      </article>`;
  }).join('');

  /* stagger-reveal */
  grid.querySelectorAll('.card').forEach((el, i) => {
    el.style.opacity   = '0';
    el.style.transform = 'translateY(8px)';
    el.style.transition = `opacity .24s ease ${i * 20}ms, transform .24s ease ${i * 20}ms`;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.opacity   = '1';
      el.style.transform = 'none';
    }));
  });
}

/* ── FILTER CHIPS ────────────────────────────── */
document.querySelectorAll('.chip').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.chip').forEach(b => {
      b.classList.remove('is-active');
      b.setAttribute('aria-pressed', 'false');
    });
    btn.classList.add('is-active');
    btn.setAttribute('aria-pressed', 'true');
    activeFilter = btn.dataset.filter;
    render();
  });
});

/* ── UTIL ────────────────────────────────────── */
function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── QR POPOVER ───────────────────────────────── */
(function() {
  const qrBtn = document.querySelector('.site-header__qr');
  if (!qrBtn) return;
  const qrImg = qrBtn.querySelector('.qr-popover__img');
  const qrErr = qrBtn.querySelector('.qr-popover__error');
  const qrLabel = qrBtn.querySelector('.qr-popover__label');
  let loaded = false;
  let polling = false;

  function loadQr() {
    if (loaded || polling) return;
    polling = true;
    (function tryLoad() {
      fetch('/api/tunnel-qr')
        .then(res => {
          if (res.ok) return res.blob();
          throw new Error('not ready');
        })
        .then(blob => {
          qrImg.src = URL.createObjectURL(blob);
          qrImg.style.display = 'block';
          qrErr.style.display = 'none';
          qrLabel.style.display = 'block';
          loaded = true;
          polling = false;
        })
        .catch(() => {
          if (qrErr) qrErr.style.display = 'block';
          if (qrImg) qrImg.style.display = 'none';
          if (qrLabel) qrLabel.style.display = 'none';
          polling = false;
          setTimeout(function() {
            if (!loaded) {
              polling = true;
              tryLoad();
            }
          }, 3000);
        });
    })();
  }

  qrBtn.addEventListener('mouseenter', loadQr);
  qrBtn.addEventListener('focus', loadQr);
})();

// Initialize
loadLibrary();
