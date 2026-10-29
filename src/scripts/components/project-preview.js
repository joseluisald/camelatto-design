import portfolio from '../../data/portfolio.json';
import { stopScroll, startScroll } from '@/lib/scroll.ts';

export function getPreviewUrl(preview, baseUrl) {
    if (!preview?.url?.trim()) return '';

    try {
        const url = new URL(preview.url, baseUrl);
        if (!['http:', 'https:'].includes(url.protocol)) return '';
        if (preview.type === 'pdf' && !url.hash) url.hash = 'view=FitH';
        return url.href;
    } catch {
        return '';
    }
}

export default function projectPreview() {
    let previousOverflow = '';

    return {
        projects: portfolio.projects,
        activeProject: null,
        previewUrl: '',
        previewLoading: false,
        previewSlow: false,
        loadingTimer: null,

        get currentIndex() {
            return this.projects.findIndex(project => project.id === this.activeProject?.id);
        },
        get caseUrl() {
            return `${import.meta.env.BASE_URL}projetos/${this.activeProject?.slug}/`;
        },

        openPreview(id) {
            const project = this.projects.find(item => item.id === id);
            if (!project) return;
            this.setPreview(project);
            if (!this.$refs.previewDialog.open) {
                previousOverflow = document.body.style.overflow;
                this.$refs.previewDialog.showModal();
                stopScroll('project-preview');
                document.body.style.overflow = 'hidden';
            }
        },

        setPreview(project) {
            clearTimeout(this.loadingTimer);
            this.activeProject = project;
            this.previewUrl = getPreviewUrl(project.preview, window.location.href);
            this.previewLoading = Boolean(this.previewUrl);
            this.previewSlow = false;
            if (this.previewLoading) {
                this.loadingTimer = setTimeout(() => { this.previewSlow = true; }, 12000);
            }
        },

        previewLoaded() {
            clearTimeout(this.loadingTimer);
            this.previewLoading = false;
            this.previewSlow = false;
        },

        movePreview(direction) {
            const index = (this.currentIndex + direction + this.projects.length) % this.projects.length;
            this.setPreview(this.projects[index]);
        },

        closePreview() {
            this.$refs.previewDialog.close();
        },

        onPreviewClosed() {
            startScroll('project-preview');
            clearTimeout(this.loadingTimer);
            document.body.style.overflow = previousOverflow;
            this.activeProject = null;
            this.previewUrl = '';
            this.previewLoading = false;
            this.previewSlow = false;
        },

        closeOnBackdrop(event) {
            if (event.target !== this.$refs.previewDialog) return;
            const rect = this.$refs.previewDialog.getBoundingClientRect();
            if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) this.closePreview();
        },

        destroy() {
            startScroll('project-preview');
            clearTimeout(this.loadingTimer);
            if (this.$refs.previewDialog?.open) {
                this.$refs.previewDialog.close();
                document.body.style.overflow = previousOverflow;
            }
        },
    };
}
