'use strict';

// These should be defined in the HTML before including this script:
// const dirIndex = ...;
// const seriesPath = ...;

const seriesName = decodeURIComponent(seriesPath.split('/').pop());

// Set title immediately
const titleEl = document.getElementById('title');
if (titleEl) titleEl.textContent = seriesName;
document.title = `${seriesName} — Vault Library`;

// Render skeleton cards
(function skeletons() {
  const grid = document.getElementById('grid');
  if (!grid) return;
  grid.innerHTML = Array(6).fill(0).map(() => `
    <div role="listitem" aria-hidden="true" style="
      display:flex;align-items:center;gap:16px;
      padding:14px 16px;background:var(--surface);
      border:1px solid var(--border-lt);border-radius:6px;">
      <div style="flex:1;display:flex;flex-direction:column;gap:8px;">
        <div class="sk" style="height:12px;width:70%;"></div>
        <div class="sk" style="height:10px;width:40%;"></div>
      </div>
    </div>`).join('');
})();

async function load() {
  try {
    const res      = await fetch(`/api/chapters/${dirIndex}/${encodeURIComponent(seriesPath)}`);
    const chapters = await res.json();

    // ── Cover + background blur ──────────────────────
    const coverWrap = document.getElementById('cover-wrap');
    const heroBg    = document.getElementById('hero-bg');

    if (chapters.length && chapters[0].cover) {
      const src = chapters[0].cover;
      const img = new Image();
      img.onload = () => {
        if (coverWrap) coverWrap.innerHTML = `<img src="${src}" alt="Cover of ${escHtml(seriesName)}"/>`;
        if (heroBg) {
          heroBg.style.backgroundImage = `url('${src}')`;
          heroBg.classList.add('loaded');
        }
      };
      img.src = src;

      // CTA link
      const btnRead = document.getElementById('btn-read');
      if (btnRead) {
        btnRead.href = `/read/${dirIndex}/${encodeURIComponent(seriesPath)}/${encodeURIComponent(chapters[0].name)}`;
      }
    }

    // ── Stats row ────────────────────────────────────
    const totalPages = chapters.reduce((s, c) => s + c.pages, 0);
    const statsRow = document.getElementById('stats-row');
    if (statsRow) {
      statsRow.innerHTML = `
        <div class="stat-pill">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
          <strong>${chapters.length}</strong> Chapters
        </div>
        <div class="stat-pill">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
          </svg>
          <strong>${totalPages}</strong> Pages
        </div>
      `;
    }

    const chCount = document.getElementById('ch-count');
    if (chCount) {
      chCount.textContent = `${chapters.length} chapter${chapters.length !== 1 ? 's' : ''}`;
    }

    // ── Chapter cards ────────────────────────────────
    const grid = document.getElementById('grid');
    if (grid) {
      grid.innerHTML = chapters.map((ch, i) => {
        const href   = `/read/${dirIndex}/${encodeURIComponent(seriesPath)}/${encodeURIComponent(ch.name)}`;

        return `
          <article class="ch-card" role="listitem">
            <a href="${href}" aria-label="${escHtml(ch.name)}, ${ch.pages} pages" style="display:contents">
              <div class="ch-card__info">
                <div class="ch-card__name">${escHtml(ch.name)}</div>
                <div class="ch-card__meta">${ch.pages} pages</div>
              </div>
              <span class="ch-card__arrow" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </span>
            </a>
          </article>`;
      }).join('');

      // stagger-reveal
      grid.querySelectorAll('.ch-card').forEach((el, i) => {
        el.style.opacity   = '0';
        el.style.transform = 'translateY(6px)';
        el.style.transition = `opacity .22s ease ${i * 30}ms, transform .22s ease ${i * 30}ms`;
        requestAnimationFrame(() => requestAnimationFrame(() => {
          el.style.opacity   = '1';
          el.style.transform = 'none';
        }));
      });
    }
  } catch (e) {
    console.error("Failed to load chapters", e);
  }
}

function escHtml(str) {
  return str
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

load();
