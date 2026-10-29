import { initLenis, destroyLenis, scrollToSection, scrollToTop } from '@/lib/scroll.ts';
import { initPageMotion } from '@/lib/page-motion';

export default function app() {
    let cleanupMotion = () => {};
    let destroyed = false;
    return {
        menuOpen: false,

        init()
        {
            window.dataLayer = window.dataLayer || [];
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

        sendGtmWhatsappEvent()
        {
            window.dataLayer.push({
                'event': 'whatsapp_click',
                'page_url': window.location.href
            });
        }
    }
}
