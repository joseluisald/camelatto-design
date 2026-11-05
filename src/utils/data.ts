import settingsData from '@/data/settings.json';
import faq from '@/data/faq.json';
import portfolio from '@/data/portfolio.json';

export type SiteSettings = typeof settingsData.site;
export type Project = (typeof portfolio.projects)[number];

export function getSettings() {
    return { settings: settingsData.site, faq, portfolio };
}
