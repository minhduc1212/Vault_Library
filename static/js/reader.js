'use strict';

const parts = readPath.split('/');
const title = decodeURIComponent(parts[parts.length - 1]);

const isChapter = parts.length > 1;
const seriesName = isChapter ? parts[0] : null;

const displayTitle = isChapter ? `${decodeURIComponent(seriesName)} — ${title}` : title;
const hudTitleEl = document.getElementById('hud-title');
if (hudTitleEl) hudTitleEl.textContent = displayTitle;

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

let pages = [];
let current = 0;
let mode = getCookie('reader_mode') || 'page';
let hudTimer;
let chapters = [];
let currentChapIndex = -1;
let scrollChapTimer = null;

const isEpub = readPath.toLowerCase().endsWith('.epub');
let currentEpubIndex = 0;
let epubFontSize = parseInt(getCookie('epub_font_size')) || 18;
let epubFontFamily = getCookie('epub_font_family') || "'Syne', sans-serif";
let rendition = null;
let book = null;

// ── CHAPTER LIST ────────────────────────────────────────────
function toggleChList() {
  const modal = document.getElementById('ch-list-modal');
  if (!modal) return;
  
  // Close font modal if open
  const fontModal = document.getElementById('font-list-modal');
  if (fontModal) fontModal.classList.remove('active');

  modal.classList.toggle('active');
  if (modal.classList.contains('active')) {
    setTimeout(() => {
      const activeItem = document.querySelector('.ch-item.active');
      if (activeItem) activeItem.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 100);
  }
}

// ── FONT SETTINGS ───────────────────────────────────────────
function toggleFontList() {
  const modal = document.getElementById('font-list-modal');
  if (!modal) return;

  // Close chapter modal if open
  const chModal = document.getElementById('ch-list-modal');
  if (chModal) chModal.classList.remove('active');

  modal.classList.toggle('active');
}

function selectFont(fontFamily, el) {
    epubFontFamily = fontFamily;
    setCookie('epub_font_family', fontFamily, 365);
    
    // Update active UI
    document.querySelectorAll('.font-option').forEach(opt => opt.classList.remove('active'));
    if (el) el.classList.add('active');
    
    applyEpubStyles();
    toggleFontList();
}

function buildChList() {
  if (chapters.length <= 0) return;
  const chListBtn = document.getElementById('ch-list-btn');
  if (chListBtn) chListBtn.style.display = '';
  const chListItems = document.getElementById('ch-list-items');
  if (chListItems) {
    if (isEpub) {
      const flatToc = [];
      const flatten = (items, depth = 0) => {
          items.forEach(i => {
              flatToc.push({...i, depth});
              if (i.subitems) flatten(i.subitems, depth + 1);
          });
      };
      flatten(chapters);
      
      chListItems.innerHTML = flatToc.map((ch, i) => `
        <div class="ch-item ${i === currentEpubIndex ? 'active' : ''}" onclick="rendition.display('${ch.href}'); toggleChList();">
          <span class="ch-item-name">${'— '.repeat(ch.depth)}${escHtml(ch.label)}</span>
        </div>
      `).join('');
    } else {
      chListItems.innerHTML = chapters.map((ch, i) => `
        <a href="/read/${dirIndex}/${ch.path}"
           class="ch-item ${i === currentChapIndex ? 'active' : ''}">
          <span class="ch-item-name">${escHtml(ch.name)}</span>
          <span class="ch-item-pages">${ch.pages} p</span>
        </a>
      `).join('');
    }
  }
}

// ── INIT ────────────────────────────────────────────────────
async function init() {
  if (isEpub) {
    return initEpub();
  }
  try {
    const res = await fetch(`/api/pages/${dirIndex}/${readPath}`);
    pages = await res.json();
    if (!pages.length) {
      if (hudTitleEl) hudTitleEl.textContent = 'No pages found';
      return;
    }

    if (isChapter) {
      try {
        const chRes = await fetch(`/api/chapters/${dirIndex}/${seriesName}`);
        chapters = await chRes.json();
        currentChapIndex = chapters.findIndex(ch => ch.name === title);
        buildChList();
      } catch (e) {
        console.error("Failed to load chapters", e);
      }
    }

    buildThumbs();
    goTo(0);
    preload(1);
    const keyHint = document.getElementById('key-hint');
    if (keyHint) {
      setTimeout(() => keyHint.classList.add('gone'), 3500);
    }
    setMode(mode);
  } catch (e) {
    console.error("Failed to initialize reader", e);
  }
}

async function initEpub() {
  const epubContent = document.getElementById('epub-content');
  const epubSettings = document.getElementById('epub-settings');
  const pageWrap = document.getElementById('page-wrap');
  const scrollWrap = document.getElementById('scroll-wrap');
  const bottomHud = document.getElementById('bottom-hud');
  const counter = document.getElementById('hud-counter');
  const canvas = document.getElementById('canvas');

  if (epubContent) {
    epubContent.style.display = 'block';
    epubContent.style.maxWidth = 'none';
    epubContent.innerHTML = '';
  }
  if (epubSettings) epubSettings.style.display = 'flex';
  if (pageWrap) pageWrap.style.display = 'none';
  if (scrollWrap) scrollWrap.style.display = 'none';
  if (bottomHud) bottomHud.style.display = 'none';
  if (counter) counter.style.display = 'flex';
  
  if (canvas) {
    canvas.style.cursor = 'default';
    canvas.classList.add('epub-mode');
  }

  const epubUrl = `/img/${dirIndex}/${readPath.split('/').map(encodeURIComponent).join('/')}`;
  book = ePub(epubUrl);
  
  const urlParams = new URLSearchParams(window.location.search);
  const targetHref = urlParams.get('href');
  const lastCfi = getCookie(`epub_cfi_${readPath}`);
  
  if (epubContent) {
      epubContent.innerHTML = '<div class="loading">Opening book...</div>';
  }

  rendition = book.renderTo("epub-content", {
    width: "100%",
    height: "100%",
    flow: mode === 'scroll' ? "scrolled" : "paginated",
    manager: mode === 'scroll' ? "continuous" : "default"
  });

  let displayPromise;
  if (targetHref) {
      displayPromise = rendition.display(targetHref);
  } else if (lastCfi) {
      displayPromise = rendition.display(lastCfi);
  } else {
      displayPromise = rendition.display();
  }

  displayPromise.then(() => {
    console.log("EPUB Rendered successfully");
    applyEpubStyles();
    // Remove loading indicator if it was there
    const loading = epubContent.querySelector('.loading');
    if (loading) loading.remove();
  }).catch(e => {
    console.error("Error in rendition.display:", e);
    // If targetHref or lastCfi fails, try to load start
    if (targetHref || lastCfi) {
        console.log("Falling back to default display");
        rendition.display().then(() => {
            applyEpubStyles();
            const loading = epubContent.querySelector('.loading');
            if (loading) loading.remove();
        }).catch(err => {
            console.error("Fallback display failed:", err);
            epubContent.innerHTML = `<div class="error">Failed to render book: ${err.message}</div>`;
        });
    } else {
        epubContent.innerHTML = `<div class="error">Failed to render book: ${e.message}</div>`;
    }
  });

  book.loaded.navigation.then((nav) => {
    chapters = nav.toc;
    buildChList();
  }).catch(e => console.error("Error loading navigation:", e));

  book.ready.then(() => {
      console.log("Book is ready");
  }).catch(e => {
      console.error("Book failed to load:", e);
      epubContent.innerHTML = `<div class="error">Failed to load EPUB file. Please check if the file is valid.</div>`;
  });

  rendition.on("relocated", (location) => {
    setCookie(`epub_cfi_${readPath}`, location.start.cfi, 365);
    updateHud();
    
    if (book.navigation && book.navigation.toc) {
        // Find current chapter by href
        const flatToc = [];
        const flatten = (items, depth = 0) => {
            items.forEach(i => {
                flatToc.push({...i, depth});
                if (i.subitems) flatten(i.subitems, depth + 1);
            });
        };
        flatten(book.navigation.toc);
        
        // Use canonicalize for more robust comparison
        const currentHref = book.canonicalize(location.start.href);
        const currentIndex = flatToc.findIndex(item => {
            return book.canonicalize(item.href).split('#')[0] === currentHref.split('#')[0];
        });

        if (currentIndex !== -1) {
            currentEpubIndex = currentIndex;
            buildChList();
        }
    }
  });

  // Handle clicks inside iframe to show/hide HUD
  rendition.on("rendered", (section, view) => {
    // Keyboard navigation within iframe
    view.document.documentElement.addEventListener('keydown', e => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') { 
            e.preventDefault(); 
            rendition.next(); 
        }
        if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')  { 
            e.preventDefault(); 
            rendition.prev(); 
        }
    });

    view.document.documentElement.addEventListener('click', (e) => {
        const x = e.clientX;
        const width = view.window.innerWidth;
        
        if (mode === 'page') {
            if (x < width * 0.3) {
                rendition.prev();
            } else if (x > width * 0.7) {
                rendition.next();
            } else {
                showHud();
            }
        } else {
            showHud();
        }
    });
    
    // Inject minimal scrollbar style into iframe
    const style = view.document.createElement('style');
    style.innerHTML = `
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.2); }
        body { 
            padding: 10px 370px !important; 
            margin: 0 !important;
            line-height: 1.5 !important;
        }
        img {
            max-width: 100% !important;
            height: auto !important;
            display: block;
            margin: 10px auto !important;
        }
        /* Remove potential large margins from containers often used in EPUBs */
        div, p {
            margin-top: 0.5em !important;
            margin-bottom: 0.5em !important;
        }
    `;
    view.document.head.appendChild(style);

    // Auto-chapter transition in scroll mode
    if (mode === 'scroll') {
        const scroller = view.document.scrollingElement || view.document.body;
        let lastScroll = 0;
        let transitionTimeout = null;

        view.window.addEventListener('scroll', () => {
            if (transitionTimeout) return;

            const st = scroller.scrollTop;
            const sh = scroller.scrollHeight;
            const ch = scroller.clientHeight;

            // At bottom -> next chapter
            if (st + ch >= sh - 10 && st > lastScroll) {
                transitionTimeout = setTimeout(() => {
                    rendition.next();
                    transitionTimeout = null;
                }, 300);
            }
            // At top -> prev chapter
            else if (st <= 10 && st < lastScroll && st === 0) {
                transitionTimeout = setTimeout(() => {
                    rendition.prev();
                    transitionTimeout = null;
                }, 300);
            }
            lastScroll = st;
        });
    }
  });

  const keyHint = document.getElementById('key-hint');
  if (keyHint) setTimeout(() => keyHint.classList.add('gone'), 3500);

  const nextBtn = document.getElementById('next-btn');
  const prevBtn = document.getElementById('prev-btn');
  if (nextBtn) nextBtn.onclick = () => { rendition.next(); };
  if (prevBtn) prevBtn.onclick = () => { rendition.prev(); };

  // Show HUD when mouse is near top
  document.addEventListener('mousemove', (e) => {
      if (e.clientY < 60) {
          showHud();
      }
  });
}

function applyEpubStyles() {
    if (!rendition) return;
    
    const fontFamily = epubFontFamily;
    const textColor = document.getElementById('text-color').value;
    const fontSizeVal = document.getElementById('font-size-val');
    
    // Update UI active state for font options
    document.querySelectorAll('.font-option').forEach(opt => {
        const isMatch = opt.getAttribute('onclick').includes(fontFamily);
        opt.classList.toggle('active', isMatch);
    });

    if (fontSizeVal) fontSizeVal.textContent = epubFontSize;
    
    rendition.themes.register("custom", {
      "body": {
        "font-family": `${fontFamily} !important`,
        "font-size": `${epubFontSize}px !important`,
        "color": `${textColor} !important`,
        "background": "transparent !important"
      },
      "p": {
        "font-family": `${fontFamily} !important`,
        "font-size": `${epubFontSize}px !important`,
        "color": `${textColor} !important`,
        "margin": "1em 0 !important"
      },
      "h1, h2, h3, h4, h5, h6": {
        "color": `${textColor} !important`,
        "font-family": `${fontFamily} !important`
      }
    });
    rendition.themes.select("custom");
    setCookie('epub_font_size', epubFontSize, 365);
}

function updateEpubStyle() {
    applyEpubStyles();
}

function changeFontSize(delta) {
    epubFontSize = Math.max(12, Math.min(48, epubFontSize + delta));
    applyEpubStyles();
}

// ── NAVIGATION ──────────────────────────────────────────────
function goTo(idx) {
  if (idx < 0 || idx >= pages.length) return;
  current = idx;
  updateHud();
  if (mode === 'page') loadPage(idx);
  updateThumbs();
  preload(idx + 1);
}

function loadPage(idx) {
  const img = document.getElementById('main-img');
  if (!img) return;
  img.classList.add('loading');
  const src = pages[idx];
  const tmp = new Image();
  tmp.onload = () => {
    img.src = src;
    img.classList.remove('loading');
  };
  tmp.src = src;
}

function preload(idx) {
  if (idx < pages.length) { const p = new Image(); p.src = pages[idx]; }
  if (idx + 1 < pages.length) { const p = new Image(); p.src = pages[idx + 1]; }
}

function next() {
  if (isEpub) {
    if (rendition) rendition.next();
    return;
  }
  if (current < pages.length - 1) { goTo(current + 1); }
  else if (currentChapIndex >= 0 && currentChapIndex < chapters.length - 1) { navigateToChapter(currentChapIndex + 1); }
}

function prev() {
  if (isEpub) {
    if (rendition) rendition.prev();
    return;
  }
  if (current > 0) { goTo(current - 1); }
  else if (currentChapIndex > 0) { navigateToChapter(currentChapIndex - 1); }
}

function navigateToChapter(idx) {
  const ch = chapters[idx];
  if (ch) window.location = `/read/${dirIndex}/${ch.path}`;
}

// ── HUD ─────────────────────────────────────────────────────
function updateHud() {
  if (isEpub) {
    if (rendition && rendition.location) {
        const counter = document.getElementById('hud-counter');
        if (counter) {
            const loc = rendition.location;
            if (loc.atStart) {
                counter.textContent = "Start";
            } else {
                const percent = book.locations && book.locations.length() > 0 
                    ? Math.round(book.locations.percentageFromCfi(loc.start.cfi) * 100)
                    : 0;
                counter.textContent = percent > 0 ? `${percent}%` : "Reading";
            }
        }
    }
    showHud();
    return;
  }
  const counter = document.getElementById('hud-counter');
  if (counter) counter.textContent = `${current + 1} / ${pages.length}`;

  const hasPrev = current > 0 || currentChapIndex > 0;
  const hasNext = current < pages.length - 1 || (currentChapIndex >= 0 && currentChapIndex < chapters.length - 1);
  
  ['prev-btn', 'next-btn', 'prev-btn2', 'next-btn2'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = (id.includes('prev') ? !hasPrev : !hasNext);
  });

  if (chapters.length > 1) {
    const prevChBtn = document.getElementById('prev-ch-btn');
    const nextChBtn = document.getElementById('next-ch-btn');
    if (prevChBtn) {
      prevChBtn.style.display = '';
      prevChBtn.disabled = currentChapIndex <= 0;
    }
    if (nextChBtn) {
      nextChBtn.style.display = '';
      nextChBtn.disabled = currentChapIndex >= chapters.length - 1;
    }
  }

  const pct = pages.length > 1 ? (current / (pages.length - 1)) * 100 : 100;
  document.documentElement.style.setProperty('--progress', pct + '%');
  showHud();
}

function showHud() {
  const hud = document.getElementById('hud');
  const bottomHud = document.getElementById('bottom-hud');
  if (hud) hud.classList.remove('hidden');
  
  if (bottomHud) {
    if (mode === 'page') {
      bottomHud.classList.remove('hidden');
    } else {
      bottomHud.classList.add('hidden');
    }
  }

  clearTimeout(hudTimer);
  if (mode === 'page') {
    hudTimer = setTimeout(() => {
      if (hud) hud.classList.add('hidden');
      if (bottomHud) bottomHud.classList.add('hidden');
    }, 2800);
  }
}

// ── THUMBNAILS ───────────────────────────────────────────────
function buildThumbs() {
  const strip = document.getElementById('thumb-strip');
  if (!strip) return;
  strip.innerHTML = pages.slice(0, 20).map((src, i) =>
    `<div class="thumb" onclick="goTo(${i})">
       <img src="${src}" loading="lazy" alt="p${i+1}"/>
     </div>`
  ).join('');
}

function updateThumbs() {
  document.querySelectorAll('.thumb').forEach((t, i) => {
    t.classList.toggle('active', i === current);
  });
  const active = document.querySelector('.thumb.active');
  if (active) active.scrollIntoView({ block:'nearest', inline:'center', behavior:'smooth' });
}

// ── SCROLL MODE ──────────────────────────────────────────────
function buildScrollMode() {
  const wrap = document.getElementById('scroll-wrap');
  if (!wrap) return;
  wrap.innerHTML = pages.map((src, i) =>
    `<img class="scroll-page" src="${src}" alt="page ${i+1}" loading="lazy"/>`
  ).join('');
  
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) e.target.classList.add('visible');
    });
  }, { threshold: 0.05 });
  document.querySelectorAll('.scroll-page').forEach(el => obs.observe(el));

  const pages_els = document.querySelectorAll('.scroll-page');
  const obs2 = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const idx = [...pages_els].indexOf(e.target);
        if (idx >= 0) { current = idx; updateHud(); }
      }
    });
  }, { threshold: 0.5 });
  pages_els.forEach(el => obs2.observe(el));
}

// ── MODE SWITCHING ───────────────────────────────────────────
function setMode(m) {
  mode = m;
  setCookie('reader_mode', m, 365);
  
  if (isEpub) {
      const btnPage = document.getElementById('btn-page');
      const btnScroll = document.getElementById('btn-scroll');
      if (btnPage) btnPage.classList.toggle('active', m === 'page');
      if (btnScroll) btnScroll.classList.toggle('active', m === 'scroll');
      
      if (rendition) {
          rendition.flow(m === 'scroll' ? "scrolled" : "paginated");
          rendition.manager(m === 'scroll' ? "continuous" : "default");
          const loc = rendition.currentLocation();
          if (loc && loc.start) {
              rendition.display(loc.start.cfi);
          }
      }
      return;
  }

  const pageWrap   = document.getElementById('page-wrap');
  const scrollWrap = document.getElementById('scroll-wrap');
  const canvas     = document.getElementById('canvas');
  if (!pageWrap || !scrollWrap || !canvas) return;

  const targetIndex = current;

  const btnPage = document.getElementById('btn-page');
  const btnScroll = document.getElementById('btn-scroll');
  if (btnPage) btnPage.classList.toggle('active', m === 'page');
  if (btnScroll) btnScroll.classList.toggle('active', m === 'scroll');

  if (m === 'page') {
    pageWrap.classList.remove('scroll-mode');
    scrollWrap.classList.remove('active');
    canvas.classList.remove('scroll-mode');
    loadPage(current);
    showHud();
  } else {
    pageWrap.classList.add('scroll-mode');
    scrollWrap.classList.add('active');
    canvas.classList.add('scroll-mode');
    if (!scrollWrap.children.length) buildScrollMode();
    setTimeout(() => {
      if (targetIndex > 0) {
        const el = scrollWrap.querySelectorAll('.scroll-page')[targetIndex];
        if (el) el.scrollIntoView({ behavior:'smooth' });
      }
    }, 100);
    const hud = document.getElementById('hud');
    const bottomHud = document.getElementById('bottom-hud');
    if (hud) hud.classList.remove('hidden');
    if (bottomHud) bottomHud.classList.add('hidden');
    attachScrollChapterDetect(scrollWrap);
  }

  if (m === 'page') {
    detachScrollChapterDetect();
  }
}

// ── SCROLL CHAPTER DETECT ──────────────────────────────────
let scrollDetectActive = false;

function attachScrollChapterDetect(wrap) {
  detachScrollChapterDetect();
  if (currentChapIndex < 0 || chapters.length <= 1) return;
  
  scrollDetectActive = false;
  const canvas = document.getElementById('canvas');
  if (canvas) canvas.addEventListener('scroll', onScrollChapter);

  setTimeout(() => { scrollDetectActive = true; }, 1000);
}

function detachScrollChapterDetect() {
  const canvas = document.getElementById('canvas');
  if (canvas) canvas.removeEventListener('scroll', onScrollChapter);
  clearTimeout(scrollChapTimer);
  scrollDetectActive = false;
}

function onScrollChapter() {
  if (!scrollDetectActive) return;

  const canvas = document.getElementById('canvas');
  if (!canvas) return;
  clearTimeout(scrollChapTimer);
  scrollChapTimer = setTimeout(() => {
    const atTop = canvas.scrollTop <= 5;
    const atBottom = canvas.scrollTop + canvas.clientHeight >= canvas.scrollHeight - 50;

    if (atBottom && currentChapIndex < chapters.length - 1) {
      navigateToChapter(currentChapIndex + 1);
    } else if (atTop && currentChapIndex > 0) {
      navigateToChapter(currentChapIndex - 1);
    }
  }, 600);
}

// ── EVENTS ───────────────────────────────────────────────────
['prev-btn', 'next-btn', 'prev-btn2', 'next-btn2', 'prev-ch-btn', 'next-ch-btn'].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    if (id === 'prev-btn' || id === 'prev-btn2') el.onclick = prev;
    if (id === 'next-btn' || id === 'next-btn2') el.onclick = next;
    if (id === 'prev-ch-btn') el.onclick = () => { if (currentChapIndex > 0) navigateToChapter(currentChapIndex - 1); };
    if (id === 'next-ch-btn') el.onclick = () => { if (currentChapIndex < chapters.length - 1) navigateToChapter(currentChapIndex + 1); };
  }
});

const zonePrev = document.getElementById('zone-prev');
const zoneNext = document.getElementById('zone-next');
if (zonePrev) zonePrev.onclick = prev;
if (zoneNext) zoneNext.onclick = next;

document.addEventListener('keydown', e => {
  if (isEpub) return; // EPUB has its own listeners

  if (mode === 'scroll') {
    const canvas = document.getElementById('canvas');
    if (!canvas) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      canvas.scrollBy({ top: 100, behavior: 'smooth' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      canvas.scrollBy({ top: -100, behavior: 'smooth' });
    } else if (e.key === 'ArrowRight') {
      if (currentChapIndex >= 0 && currentChapIndex < chapters.length - 1) {
        e.preventDefault();
        navigateToChapter(currentChapIndex + 1);
      }
    } else if (e.key === 'ArrowLeft') {
      if (currentChapIndex > 0) {
        e.preventDefault();
        navigateToChapter(currentChapIndex - 1);
      }
    }
  } else {
    // Page mode
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') { 
      e.preventDefault(); 
      next(); 
    }
    if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')  { 
      e.preventDefault(); 
      prev(); 
    }
  }
});

// custom cursor
const cursor = document.getElementById('cursor');
document.addEventListener('mousemove', e => {
  if (!cursor || isEpub) return;
  cursor.style.left = e.clientX + 'px';
  cursor.style.top  = e.clientY + 'px';
  const el = document.elementFromPoint(e.clientX, e.clientY);
  if (el === zonePrev || (zonePrev && zonePrev.contains(el))) {
    cursor.className = 'prev';
  } else if (el === zoneNext || (zoneNext && zoneNext.contains(el))) {
    cursor.className = 'next';
  } else {
    cursor.className = 'default';
  }
  showHud();
});
document.addEventListener('mouseleave', () => { if (cursor) cursor.className = 'default'; });

// touch swipe
let touchX = 0;
document.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; });
document.addEventListener('touchend', e => {
  const dx = e.changedTouches[0].clientX - touchX;
  if (Math.abs(dx) > 40 && mode === 'page') {
    if (dx < 0) next(); else prev();
  }
});

function escHtml(str) {
  if (!str) return "";
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

window.toggleChList = toggleChList;
window.setMode = setMode;
window.goTo = goTo;
window.changeFontSize = changeFontSize;
window.updateEpubStyle = updateEpubStyle;

init();
