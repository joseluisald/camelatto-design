import { initLenis, destroyLenis, scrollToSection, scrollToTop } from '@/lib/scroll.ts';
import { initPageMotion } from '@/lib/page-motion';

export default function app() {
    let cleanupMotion = () => {};
    let destroyed = false;
    return {
        menuOpen: false,
        headerScrolled: false,
        bannerTheme: 'light',

        init()
        {
            window.dataLayer = window.dataLayer || [];
            this.bannerTheme = document.documentElement.dataset.bannerTheme === 'dark' ? 'dark' : 'light';
            initLenis();
            this.$nextTick(() => { if (!destroyed) cleanupMotion = initPageMotion(this.$el); });
        },

        destroy() {
            destroyed = true;
            cleanupMotion();
            destroyLenis();
        },

        scrollToSection,
        scrollToTop,

        setBannerTheme(theme) {
            if (!['light', 'dark'].includes(theme)) return;
            this.bannerTheme = theme;
            document.documentElement.dataset.bannerTheme = theme;
            try { localStorage.setItem('camelatto-banner-theme', theme); } catch { /* The theme also works without storage. */ }
        },

        sendGtmWhatsappEvent()
        {
            window.dataLayer.push({
                'event': 'whatsapp_click',
                'page_url': window.location.href
            });
        }
    }
}
