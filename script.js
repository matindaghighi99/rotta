const chapters = [
  { start: 0, end: 0.15 }, { start: 0.15, end: 0.35 },
  { start: 0.35, end: 0.55 }, { start: 0.55, end: 0.78 },
  { start: 0.78, end: 0.92 }, { start: 0.92, end: 1 }
];

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const story = document.querySelector('.story');
const sticky = document.querySelector('.story-sticky');
const video = document.querySelector('.hero-video');
const mediaStage = document.querySelector('[data-media-stage]');
const chapterNodes = [...document.querySelectorAll('[data-story-chapter]')];
const detailNodes = [...document.querySelectorAll('[data-detail-line]')];
const progressFill = document.querySelector('[data-progress-fill]');
const progressIndex = document.querySelector('.progress-index');
const progressAside = document.querySelector('.story-progress');
const openingLine = document.querySelector('[data-opening-line]');
const loader = document.querySelector('.loader');
const loaderBar = document.querySelector('.loader-track span');
const loaderOutput = document.querySelector('.loader output');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const VIDEO_SRC = 'media/Bag-scrub.mp4';
let duration = 15.041667;
let targetTime = 0;
let smoothTime = 0;
let progress = 0;
let last = performance.now();
let loadingValue = 0;

let loadingTimer = window.setInterval(() => {
  loadingValue = Math.min(94, loadingValue + Math.max(1, (94 - loadingValue) * 0.08));
  paintLoader();
}, 80);

function paintLoader() {
  loaderBar.style.width = `${loadingValue}%`;
  loaderOutput.textContent = `${Math.round(loadingValue).toString().padStart(2, '0')}%`;
}

function setRealProgress(fraction) {
  if (loadingTimer) { clearInterval(loadingTimer); loadingTimer = 0; }
  loadingValue = Math.max(loadingValue, Math.min(99, fraction * 100));
  paintLoader();
}

function revealExperience() {
  if (loader.classList.contains('is-hidden')) return;
  if (loadingTimer) { clearInterval(loadingTimer); loadingTimer = 0; }
  loadingValue = 100;
  paintLoader();
  window.setTimeout(() => loader.classList.add('is-hidden'), 180);
}

video.addEventListener('loadedmetadata', () => {
  if (Number.isFinite(video.duration) && video.duration > 0) duration = video.duration;
  video.pause();
});
video.addEventListener('canplay', revealExperience, { once: true });
window.setTimeout(revealExperience, 7000);

// Download the film into memory first so scrubbing never waits on the network,
// with real progress on the loader. Falls back to progressive streaming.
async function prefetchVideo() {
  try {
    const response = await fetch(VIDEO_SRC);
    if (!response.ok) throw new Error(String(response.status));
    const total = Number(response.headers.get('Content-Length'));
    if (!response.body || !total) {
      const blob = await response.blob();
      return URL.createObjectURL(blob);
    }
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      setRealProgress(received / total);
    }
    return URL.createObjectURL(new Blob(chunks, { type: 'video/mp4' }));
  } catch {
    return null;
  }
}

if (!reducedMotion) {
  prefetchVideo().then((blobURL) => {
    video.src = blobURL || VIDEO_SRC;
    if (!blobURL) video.preload = 'auto';
    video.load();
  });
} else {
  revealExperience();
}

const FPS = 24;
const FRAME = 1 / FPS;
let viewportWide = window.innerWidth > 900;
let lastMode = '';
let lastActive = -1;
let lastFeather = '';
let lastSeekTarget = -1;

function updateScrollProgress() {
  const rect = story.getBoundingClientRect();
  const scrollable = Math.max(1, story.offsetHeight - window.innerHeight);
  progress = clamp(-rect.top / scrollable);
  targetTime = progress * duration;
}

function render(now) {
  const delta = Math.min(50, now - last);
  last = now;
  const ease = 1 - Math.pow(0.002, delta / 1000);
  smoothTime += (targetTime - smoothTime) * ease;
  if (Math.abs(targetTime - smoothTime) < 0.0004) smoothTime = targetTime;

  if (video.readyState >= 1 && !video.seeking) {
    const seekTo = clamp(Math.round(smoothTime * FPS) / FPS, 0, Math.max(0, duration - FRAME));
    if (Math.abs(seekTo - lastSeekTarget) > FRAME / 2) {
      lastSeekTarget = seekTo;
      video.currentTime = seekTo;
    }
  }

  const sp = clamp(smoothTime / duration);

  const mode = sp >= 0.55 ? 'red' : 'white';
  if (mode !== lastMode) { lastMode = mode; sticky.dataset.mode = mode; }

  let active = 0;
  chapters.forEach((chapter, index) => {
    const local = clamp((sp - chapter.start) / (chapter.end - chapter.start));
    const fadeIn = index === 0 ? 1 : clamp(local / 0.18);
    const fadeOut = index === chapters.length - 1 ? 1 : clamp((1 - local) / 0.2);
    const opacity = fadeIn * fadeOut;
    chapterNodes[index].style.opacity = opacity.toFixed(3);
    chapterNodes[index].style.setProperty('--fade-y', `${((1 - fadeIn) * 28 - (1 - fadeOut) * 20).toFixed(2)}px`);
    chapterNodes[index].style.pointerEvents = opacity > 0.75 ? 'auto' : 'none';
    if (sp >= chapter.start && (sp < chapter.end || index === chapters.length - 1)) active = index;
  });

  detailNodes.forEach((node, index) => {
    const local = clamp((sp - 0.59 - index * 0.045) / 0.035);
    node.style.opacity = local.toFixed(3);
    node.style.transform = `translate3d(${((1 - local) * 16).toFixed(2)}px, 0, 0)`;
  });

  const focusLocal = clamp((sp - 0.35) / 0.2);
  const zoomBoost = sp < 0.35 ? 0 : focusLocal * focusLocal * (3 - 2 * focusLocal);

  const scale = 1 + Math.sin(sp * Math.PI) * 0.017 + zoomBoost * 0.95;
  let offset = 0;
  if (viewportWide) {
    if (sp < 0.35) {
      const blend = clamp((sp - 0.3) / 0.05);
      offset = 8 - 16 * blend * blend * (3 - 2 * blend);
    }
    else if (sp < 0.55) offset = -8 * (1 - zoomBoost);
    else if (sp < 0.78) offset = 8 * (1 - zoomBoost);
    else if (sp < 0.92) offset = -8 * (1 - zoomBoost);
  }
  mediaStage.style.transform = `translate3d(${offset.toFixed(3)}vw,0,0) scale(${scale.toFixed(4)})`;
  sticky.style.setProperty('--zoom-boost', zoomBoost.toFixed(3));
  const feather = (100 - zoomBoost * 30).toFixed(1);
  if (feather !== lastFeather) {
    lastFeather = feather;
    const edgeMask = `radial-gradient(ellipse 75% 75% at 50% 50%, #000 ${feather}%, transparent 100%)`;
    video.style.webkitMaskImage = edgeMask;
    video.style.maskImage = edgeMask;
  }
  progressFill.style.transform = `scaleY(${sp.toFixed(4)})`;
  if (active !== lastActive) {
    lastActive = active;
    progressIndex.textContent = String(active + 1).padStart(2, '0');
    progressAside.setAttribute('aria-label', `Chapter ${active + 1} of 6`);
  }
  openingLine.style.transform = `scaleX(${clamp((sp - 0.39) / 0.11).toFixed(4)})`;
  openingLine.style.opacity = (1 - clamp((sp - 0.53) / 0.07)).toFixed(3);
  requestAnimationFrame(render);
}

window.addEventListener('scroll', updateScrollProgress, { passive: true });
window.addEventListener('resize', () => {
  viewportWide = window.innerWidth > 900;
  updateScrollProgress();
}, { passive: true });
updateScrollProgress();
smoothTime = targetTime;
if (!reducedMotion) requestAnimationFrame(render);

function unlockVideo() {
  const play = video.play();
  if (!play) return;
  play.then(() => {
    video.pause();
    window.removeEventListener('pointerdown', unlockVideo);
    window.removeEventListener('touchstart', unlockVideo);
  }).catch(() => {});
}
window.addEventListener('pointerdown', unlockVideo, { passive: true });
window.addEventListener('touchstart', unlockVideo, { passive: true });

const nav = document.querySelector('.nav');
const menuButton = document.querySelector('.menu-button');
const navLinks = document.querySelector('.nav-links');
window.addEventListener('scroll', () => nav.classList.toggle('nav-scrolled', window.scrollY > 30), { passive: true });
menuButton.addEventListener('click', () => {
  const open = navLinks.classList.toggle('is-open');
  menuButton.setAttribute('aria-expanded', String(open));
});
navLinks.addEventListener('click', () => {
  navLinks.classList.remove('is-open');
  menuButton.setAttribute('aria-expanded', 'false');
});

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });
document.querySelectorAll('.reveal-on-scroll').forEach((element) => {
  element.style.opacity = '0';
  element.style.transform = 'translateY(38px)';
  element.style.transition = 'opacity 1.1s ease, transform 1.1s cubic-bezier(.22,1,.36,1)';
  observer.observe(element);
});
