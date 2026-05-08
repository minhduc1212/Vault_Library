'use strict';

/* ── SKELETON ────────────────────────────────── */
(function renderSkeletons() {
  const grids = ['grid-local-library', 'grid-mangadex'];
  grids.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.innerHTML = Array(6).fill(0).map(() => `
        <div role="listitem" aria-hidden="true">
          <div class="sk-cover sk-pulse"></div>
          <div class="sk-body">
            <div class="sk-line sk-line--md sk-pulse"></div>
            <div class="sk-line sk-line--sm sk-pulse"></div>
          </div>
        </div>`).join('');
    }
  });
})();

/* ── STATE ───────────────────────────────────── */
let allComics   = [];
let mangadexComics = [];

/* ── LOAD ────────────────────────────────────── */
async function loadLibrary() {
  try {
    const [libRes, mdRes] = await Promise.all([
      fetch('/api/library'),
      fetch('/api/mangadex/popular')
    ]);
    allComics = await libRes.json();
    mangadexComics = await mdRes.json();
  } catch (e) {
    console.error("Failed to load library or mangadex", e);
  }

  /* update hero stat */
  const countEl = document.getElementById('stat-count');
  if (countEl) {
    countEl.textContent = allComics.length;
    countEl.classList.add('is-loaded');
  }

  render();
}

/* ── RENDER ──────────────────────────────────── */
function render() {
  renderGrid('grid-local-library', allComics);
  renderGrid('grid-mangadex', mangadexComics);
}

function renderGrid(gridId, list) {
  const grid = document.getElementById(gridId);
  if (!grid) return;

  if (!list.length) {
    grid.innerHTML = `
      <div class="empty-state" role="listitem">
        <div class="empty-state__icon">📂</div>
        <h2 class="empty-state__heading">Nothing here yet.</h2>
      </div>`;
    return;
  }

  grid.innerHTML = list.map(c => {
    let href, meta, badgeClass, badgeLabel, cover;

    if (c.type === 'mangadex') {
      href = `https://mangadex.org/title/${c.id}`;
      meta = 'MangaDex';
      badgeClass = 'card__badge card__badge--series';
      badgeLabel = 'MangaDex';
      cover = c.cover 
        ? `<img src="${c.cover}" referrerpolicy="no-referrer" alt="" loading="lazy"/>`
        : `<div class="no-cover" aria-hidden="true">📖</div>`;
    } else {
      href = c.type === 'series'
        ? `/series/${c.dir_index}/${encodeURIComponent(c.rel_path)}`
        : `/read/${c.dir_index}/${encodeURIComponent(c.rel_path)}`;

      meta = c.type === 'series'
        ? `${c.chapters} ch.`
        : `${c.pages} pg.`;

      badgeClass = c.type === 'series'
        ? 'card__badge card__badge--series'
        : 'card__badge';
      badgeLabel = c.type === 'series' ? 'Series' : 'One-shot';

      cover = c.cover
        ? `<img src="${c.cover}" alt="" loading="lazy"/>`
        : `<div class="no-cover" aria-hidden="true">📖</div>`;
    }

    return `
      <article class="card" role="listitem">
        <a href="${href}" ${c.type === 'mangadex' ? 'target="_blank"' : ''} aria-label="${escHtml(c.title || c.name)}">
          <div class="card__cover">
            ${cover}
            <span class="${badgeClass}" aria-hidden="true">${badgeLabel}</span>
          </div>
          <div class="card__body">
            <div class="card__title">${escHtml(c.title || c.name)}</div>
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
