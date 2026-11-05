import settingsData from '@/data/settings.json';
import faq from '@/data/faq.json';
import portfolio from '@/data/portfolio.json';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type SiteSettings = typeof settingsData.site & { robots?: string };
export type Project = (typeof portfolio.projects)[number] & { displayId?: string; featured?: number | null; phoneImage?: string; stages?: string[]; results?: string; seoTitle?: string; seoDescription?: string; externalUrl?: string; gallery?: { image: string; alt: string }[] };
export type SiteContent = { settings: SiteSettings; faq: typeof faq; portfolio: Omit<typeof portfolio, 'projects' | 'contact'> & { projects: Project[]; projectsHeading?: { title: string }; contact: typeof portfolio.contact & { formEnabled?: boolean; privacyNotice?: string; privacyVersion?: string } }; redirects?: { from: string; to: string }[] };

// A build consumes one immutable snapshot. Invalid configured snapshots fail the build.
const snapshotFile = process.env.CONTENT_SNAPSHOT_FILE || resolve('.content/published.json');
let content: SiteContent = { settings: settingsData.site, faq, portfolio };
if (process.env.CONTENT_SNAPSHOT_FILE) {
    const snapshot = JSON.parse(readFileSync(snapshotFile, 'utf8'));
    if (snapshot.schemaVersion !== 1 || !snapshot.settings || !snapshot.portfolio || !Array.isArray(snapshot.portfolio.projects) || !Array.isArray(snapshot.faq)) throw new Error('Snapshot de conteúdo inválido.');
    content = snapshot;
}

export function getSettings() {
    // Astro's development server renders pages per request, without a rebuild.
    if (import.meta.env.DEV && process.env.CONTENT_SNAPSHOT_FILE && existsSync(snapshotFile)) {
        const snapshot = JSON.parse(readFileSync(snapshotFile, 'utf8'));
        if (snapshot.schemaVersion !== 1 || !snapshot.portfolio?.projects) throw new Error('Snapshot de conteúdo inválido.');
        return snapshot as SiteContent;
    }
    return content;
}
