import { animate, springValue, styleEffect } from 'framer-motion/dom';

export default function cursor() {
    let releasePointer = () => {};
    let preferences = [];
    return {
        enabled: false,
        visible: false,
        variant: 'default',
        label: '',

        init() {
            preferences = [window.matchMedia('(hover: hover) and (pointer: fine)'), window.matchMedia('(prefers-reduced-motion: reduce)')];
            this.syncPreferences = () => {
                releasePointer();
                this.enabled = preferences[0].matches && !preferences[1].matches;
                if (this.enabled) releasePointer = this.bindPointer();
            };
            preferences.forEach(query => query.addEventListener('change', this.syncPreferences));
            this.syncPreferences();
        },

        bindPointer() {
            this.variant = 'default';
            this.label = '';
            Object.assign(this.$refs.ring.style, { width: '34px', height: '34px', opacity: '0.28' });
            Object.assign(this.$refs.dot.style, { width: '7px', height: '7px' });
            const ringOptions = { stiffness: 380, damping: 34, mass: 0.7 };
            const dotOptions = { stiffness: 1600, damping: 80, mass: 0.2 };
            const ringX = springValue(-100, ringOptions);
            const ringY = springValue(-100, ringOptions);
            const dotX = springValue(-100, dotOptions);
            const dotY = springValue(-100, dotOptions);
            const releaseRing = styleEffect(this.$refs.ringTrack, { x: ringX, y: ringY });
            const releaseDot = styleEffect(this.$refs.dotTrack, { x: dotX, y: dotY });
            let ringAnimation;
            let dotAnimation;
            let lastX = -100;
            let lastY = -100;

            const hide = () => {
                this.visible = false;
                document.documentElement.classList.remove('custom-cursor');
            };
            const updateVariant = target => {
                const interactive = target.closest('a, button, [data-hover], [role="button"], [data-cursor]');
                const view = target.closest('[data-cursor="view"]');
                const disabled = interactive?.matches(':disabled, [aria-disabled="true"]');
                const variant = disabled ? 'default' : view ? 'view' : interactive ? 'hover' : 'default';
                let label = '';
                if (variant === 'view') label = 'Ver';
                else if (variant === 'hover') {
                    const href = interactive.getAttribute('href') || '';
                    if (interactive.closest('.gallery-filters')) label = 'Filtrar';
                    else if (interactive.matches('.menu-toggle')) label = 'Menu';
                    else if (interactive.hasAttribute('download') || /\.pdf(?:[?#]|$)/i.test(href)) label = 'Baixar';
                    else if (href.startsWith('mailto:')) label = 'Enviar';
                    else if (href.startsWith('tel:')) label = 'Ligar';
                    else if (interactive.matches('a')) label = 'Abrir';
                    else label = 'Clicar';
                }
                const customLabel = target.closest('[data-cursor-label]')?.getAttribute('data-cursor-label')?.trim();
                if (variant !== 'default' && customLabel) label = customLabel.slice(0, 16);
                if (this.variant === variant && this.label === label) return;
                this.variant = variant;
                this.label = label;
                ringAnimation?.stop();
                dotAnimation?.stop();
                const size = variant === 'default' ? 34 : Math.max(86, label.length * 8 + 24);
                ringAnimation = animate(this.$refs.ring, { width: size, height: size, opacity: variant === 'default' ? 0.28 : 1 }, { type: 'spring', stiffness: 320, damping: 24 });
                dotAnimation = animate(this.$refs.dot, { width: variant === 'default' ? 7 : 0, height: variant === 'default' ? 7 : 0 }, { duration: 0.15 });
            };

            const updateTarget = target => {
                if (!(target instanceof Element) || document.querySelector('dialog[open]') || target.closest('iframe, input, textarea, select, [contenteditable="true"]')) {
                    hide();
                    return;
                }
                updateVariant(target);
                this.visible = true;
                document.documentElement.classList.add('custom-cursor');
            };

            const move = event => {
                if (event.pointerType === 'touch') return hide();
                lastX = event.clientX;
                lastY = event.clientY;
                if (!this.visible) {
                    ringX.jump(lastX); ringY.jump(lastY);
                    dotX.jump(lastX); dotY.jump(lastY);
                } else {
                    ringX.set(lastX); ringY.set(lastY);
                    dotX.set(lastX); dotY.set(lastY);
                }
                updateTarget(event.target);
            };

            const scroll = () => {
                if (this.visible) updateTarget(document.elementFromPoint(lastX, lastY));
            };

            const keydown = event => { if (event.key === 'Tab' || event.key === 'Escape') hide(); };

            const observer = new MutationObserver(() => { if (document.querySelector('dialog[open]')) hide(); });
            observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
            window.addEventListener('pointermove', move, { passive: true });
            window.addEventListener('pointerover', move, { passive: true });
            window.addEventListener('scroll', scroll, { passive: true });
            window.addEventListener('blur', hide);
            window.addEventListener('keydown', keydown);
            document.documentElement.addEventListener('pointerleave', hide);

            return () => {
                hide();
                observer.disconnect();
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerover', move);
                window.removeEventListener('scroll', scroll);
                window.removeEventListener('blur', hide);
                window.removeEventListener('keydown', keydown);
                document.documentElement.removeEventListener('pointerleave', hide);
                ringAnimation?.stop(); dotAnimation?.stop();
                releaseRing(); releaseDot();
                [ringX, ringY, dotX, dotY].forEach(value => value.destroy());
            };
        },

        destroy() {
            preferences.forEach(query => query.removeEventListener('change', this.syncPreferences));
            releasePointer();
        },
    };
}
