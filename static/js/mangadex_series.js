'use strict';

async function load() {
  try {
    // Load metadata
    const metaRes = await fetch(`/api/mangadex/manga/${mangaId}`);
    const meta = await metaRes.json();

    document.getElementById('title').textContent = meta.title;
    document.getElementById('description').textContent = meta.description;
    document.title = `${meta.title} — Vault Library`;

    const coverWrap = document.getElementById('cover-wrap');
    const heroBg = document.getElementById('hero-bg');
    if (meta.cover) {
      coverWrap.innerHTML = `<img src="${meta.cover}" referrerpolicy="no-referrer" alt="Cover"/>`;
      heroBg.style.backgroundImage = `url('${meta.cover}')`;
      heroBg.classList.add('loaded');
    }

    // Load chapters
    const chRes = await fetch(`/api/mangadex/chapters/${mangaId}`);
    const chapters = await chRes.json();

    const statsRow = document.getElementById('stats-row');
    if (statsRow) {
      statsRow.innerHTML = `
        <div class="stat-pill">
          <strong>${chapters.length}</strong> Chapters
        </div>
      `;
    }

    const chCount = document.getElementById('ch-count');
    if (chCount) {
      chCount.textContent = `${chapters.length} chapter${chapters.length !== 1 ? 's' : ''}`;
    }

    const grid = document.getElementById('grid');
    if (grid) {
      grid.innerHTML = chapters.map((ch, i) => {
        const href = `/mangadex/read/${mangaId}/${ch.id}`;
        return `
          <article class="ch-card" role="listitem">
            <a href="${href}" style="display:contents">
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
    }

    const btnRead = document.getElementById('btn-read');
    if (btnRead && chapters.length > 0) {
      btnRead.href = `/mangadex/read/${mangaId}/${chapters[0].id}`;
    }

  } catch (e) {
    console.error("Failed to load MangaDex series", e);
  }
}

function escHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

load();
