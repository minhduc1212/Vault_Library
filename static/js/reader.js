'use strict';

// These should be defined in the HTML before including this script:
// const dirIndex = ...;
// const readPath = ...;

const parts = readPath.split('/');
const title = decodeURIComponent(parts[parts.length - 1]);

// Figure out whether this is a chapter-based read (series) or a one-shot
const isChapter = parts.length > 1;
const seriesName = isChapter ? parts[0] : null;

// Display title in HUD
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

// ── CHAPTER LIST ────────────────────────────────────────────
function toggleChList() {
  const modal = document.getElementById('ch-list-modal');
  if (!modal) return;
  modal.classList.toggle('active');
  if (modal.classList.contains('active')) {
    // Scroll active into view
    setTimeout(() => {
      const activeItem = document.querySelector('.ch-item.active');
      if (activeItem) activeItem.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 100);
  }
}

function buildChList() {
  if (chapters.length <= 1) return;
  const chListBtn = document.getElementById('ch-list-btn');
  if (chListBtn) chListBtn.style.display = '';
  const chListItems = document.getElementById('ch-list-items');
  if (chListItems) {
    chListItems.innerHTML = chapters.map((ch, i) => `
      <a href="/read/${dirIndex}/${ch.path}"
         class="ch-item ${i === currentChapIndex ? 'active' : ''}">
        <span class="ch-item-name">${escHtml(ch.name)}</span>
        <span class="ch-item-pages">${ch.pages} p</span>
      </a>
    `).join('');
  }
}

// ── INIT ────────────────────────────────────────────────────
async function init() {
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
  if (current < pages.length - 1) { goTo(current + 1); }
  else if (currentChapIndex >= 0 && currentChapIndex < chapters.length - 1) { navigateToChapter(currentChapIndex + 1); }
}
function prev() {
  if (current > 0) { goTo(current - 1); }
  else if (currentChapIndex > 0) { navigateToChapter(currentChapIndex - 1); }
}

function navigateToChapter(idx) {
  const ch = chapters[idx];
  if (ch) window.location = `/read/${dirIndex}/${ch.path}`;
}

// ── HUD ─────────────────────────────────────────────────────
function updateHud() {
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
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); if (mode==='page') next(); }
  if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')  { e.preventDefault(); if (mode==='page') prev(); }
});

// custom cursor
const cursor = document.getElementById('cursor');
document.addEventListener('mousemove', e => {
  if (!cursor) return;
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
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

window.toggleChList = toggleChList;
window.setMode = setMode;
window.goTo = goTo;

init();
