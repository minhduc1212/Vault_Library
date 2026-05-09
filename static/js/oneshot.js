'use strict';

// These should be defined in the HTML before including this script:
// const dirIndex = ...;
// const oneshotPath = ...;

const oneshotName = decodeURIComponent(oneshotPath.split('/').pop());

// Set title immediately
const titleEl = document.getElementById('title');
if (titleEl) titleEl.textContent = oneshotName;
document.title = `${oneshotName} — Vault Library`;

async function load() {
  try {
    const res = await fetch(`/api/comic/${dirIndex}/${encodeURIComponent(oneshotPath)}`);
    if (!res.ok) throw new Error("Failed to load metadata");
    const comic = await res.json();

    // ── Title ──────────────────────────────────────
    if (titleEl) titleEl.textContent = comic.title;

    // ── Cover + background blur ──────────────────────
    const coverWrap = document.getElementById('cover-wrap');
    const heroBg    = document.getElementById('hero-bg');

    if (comic.cover) {
      const src = comic.cover;
      const img = new Image();
      img.onload = () => {
        if (coverWrap) coverWrap.innerHTML = `<img src="${src}" alt="Cover of ${escHtml(comic.title)}"/>`;
        if (heroBg) {
          heroBg.style.backgroundImage = `url('${src}')`;
          heroBg.classList.add('loaded');
        }
      };
      img.src = src;
    }

    // ── CTA link ────────────────────────────────────
    const btnRead = document.getElementById('btn-read');
    if (btnRead) {
      btnRead.href = `/read/${dirIndex}/${encodeURIComponent(oneshotPath)}`;
    }

    // ── Stats row ────────────────────────────────────
    const statsRow = document.getElementById('stats-row');
    if (statsRow) {
      let statsHtml = `
        <div class="stat-pill">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
          </svg>
          <strong>${comic.pages}</strong> Pages
        </div>
      `;
      if (comic.author) {
          statsHtml += `
            <div class="stat-pill">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
              <strong>${escHtml(comic.author)}</strong>
            </div>
          `;
      }
      statsRow.innerHTML = statsHtml;
    }

    // ── Genres ──────────────────────────────────────
    const genresWrap = document.getElementById('genres');
    if (genresWrap && comic.genres) {
        const genres = comic.genres.split(',').map(g => g.trim()).filter(g => g);
        genresWrap.innerHTML = genres.map(g => `<span class="genre-tag">${escHtml(g)}</span>`).join('');
    }

    // ── Description ─────────────────────────────────
    const descEl = document.getElementById('description');
    if (descEl) {
        if (comic.description) {
            descEl.textContent = comic.description;
            if (descEl.scrollHeight > descEl.clientHeight) {
                document.getElementById('read-more').style.display = 'inline-block';
            }
        } else {
            descEl.textContent = 'No description available for this one-shot.';
        }
    }

  } catch (e) {
    console.error("Failed to load oneshot metadata", e);
    if (titleEl) titleEl.textContent = "Error loading one-shot";
  }
}

function escHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Read more toggle
const readMoreBtn = document.getElementById('read-more');
if (readMoreBtn) {
    readMoreBtn.addEventListener('click', function() {
        const desc = document.getElementById('description');
        desc.classList.toggle('expanded');
        this.textContent = desc.classList.contains('expanded') ? 'Show Less' : 'Read More';
    });
}

load();
