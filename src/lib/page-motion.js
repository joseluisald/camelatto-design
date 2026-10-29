import { animate, inView, scroll } from 'framer-motion/dom';

const EASE = [0.22, 1, 0.36, 1];

export function initPageMotion(root) {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const elements = [...root.querySelectorAll('[data-motion]')];
    const animatedElements = [...elements, ...root.querySelectorAll('[data-motion-spin], [data-hero-parallax]')];
    const originalStyles = new Map(animatedElements.map(element => [element, {
        opacity: element.style.opacity,
        transform: element.style.transform,
    }]));
    const revealed = new WeakSet();
    let cleanups = [];
    let animations = new Set();
    let loops = [];

    const restore = element => {
        const original = originalStyles.get(element);
        if (!original) return;
        element.style.opacity = original.opacity;
        element.style.transform = original.transform;
    };
    const track = animation => {
        animations.add(animation);
        animation.then(() => animations.delete(animation));
        return animation;
    };
    const reset = () => {
        cleanups.forEach(cleanup => cleanup());
        cleanups = [];
        animations.forEach(animation => animation.stop());
        animations.clear();
        loops = [];
        animatedElements.forEach(restore);
    };
    const setup = () => {
        reset();
        if (preference.matches) return;

        elements.forEach(element => {
            if (revealed.has(element)) return;
            cleanups.push(inView(element, () => {
                revealed.add(element);
                // Keep all content visible until its animation actually starts.
                // No CSS hides the page if JavaScript is unavailable.
                if (element.contains(document.activeElement)) return;
                const delay = Math.min(Math.max(Number(element.dataset.motionDelay) || 0, 0), 0.5);
                const keyframes = element.dataset.motion === 'scale'
                    ? { opacity: [0, 1], scale: [0.96, 1] }
                    : { opacity: [0, 1], y: [element.dataset.motion === 'down' ? -16 : 28, 0] };
                const animation = track(animate(element, keyframes, { duration: 0.85, delay, ease: EASE }));
                // Keyboard users should never wait for an entrance animation.
                const focus = () => { animation.complete(); };
                element.addEventListener('focusin', focus);
                cleanups.push(() => element.removeEventListener('focusin', focus));
                animation.then(() => restore(element));
            }, { margin: '0px 0px -32px 0px', amount: 'some' }));
        });

        root.querySelectorAll('[data-motion-spin]').forEach(element => {
            const seconds = Number(element.dataset.motionSpin) || 90;
            const animation = animate(element, { rotate: [0, seconds < 0 ? -360 : 360] }, { duration: Math.abs(seconds), repeat: Infinity, ease: 'linear', autoplay: false });
            animations.add(animation);
            const loop = { animation, visible: false };
            loops.push(loop);
            cleanups.push(inView(element, () => {
                loop.visible = true;
                if (!document.hidden) animation.play();
                return () => { loop.visible = false; animation.pause(); };
            }));
        });

        const hero = root.querySelector('#hero');
        if (hero) root.querySelectorAll('[data-hero-parallax]').forEach(element => {
            const animation = animate(element, { y: [0, -100] }, { ease: 'linear', autoplay: false });
            animations.add(animation);
            cleanups.push(scroll(animation, { target: hero, offset: ['start start', 'end start'] }));
        });
    };
    const visibility = () => loops.forEach(({ animation, visible }) => {
        if (document.hidden || !visible) animation.pause();
        else animation.play();
    });
    preference.addEventListener('change', setup);
    document.addEventListener('visibilitychange', visibility);
    setup();
    return () => {
        preference.removeEventListener('change', setup);
        document.removeEventListener('visibilitychange', visibility);
        reset();
    };
}
