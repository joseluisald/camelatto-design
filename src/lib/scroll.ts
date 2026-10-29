import Lenis from "lenis";

let lenis: Lenis | null = null;
let motionPreference: MediaQueryList | null = null;
const scrollLocks = new Set<string>();

function syncMotionPreference() {
  if (motionPreference?.matches) {
    lenis?.destroy();
    lenis = null;
    return;
  }
  if (lenis) return;
  lenis = new Lenis({
    duration: 1.15,
    easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
    touchMultiplier: 1.4,
    autoRaf: true,
    anchors: { duration: 1.5 },
  });
  if (scrollLocks.size) lenis.stop();
}

export function initLenis() {
  if (typeof window === 'undefined') return null;
  if (!motionPreference) {
    motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    motionPreference.addEventListener('change', syncMotionPreference);
    syncMotionPreference();
  }
  return lenis;
}

export function scrollToSection(href: string) {
  if (typeof window === 'undefined' || !href.startsWith('#')) return;
  let id: string;
  try { id = decodeURIComponent(href.slice(1)); } catch { return; }
  const target = document.getElementById(id);
  if (!target) return;
  if (lenis) {
    lenis.scrollTo(target, { duration: 1.5 });
  } else {
    target.scrollIntoView({ behavior: motionPreference?.matches ? 'instant' : 'smooth' });
  }
}

export function scrollToTop() {
  if (typeof window === 'undefined') return;
  if (lenis) lenis.scrollTo(0, { immediate: true });
  else window.scrollTo({ top: 0, behavior: 'instant' });
}

export function stopScroll(reason = 'manual') {
  scrollLocks.add(reason);
  lenis?.stop();
}

export function startScroll(reason = 'manual') {
  scrollLocks.delete(reason);
  if (!scrollLocks.size) lenis?.start();
}

export function destroyLenis() {
  lenis?.destroy();
  lenis = null;
  motionPreference?.removeEventListener('change', syncMotionPreference);
  motionPreference = null;
  scrollLocks.clear();
}
