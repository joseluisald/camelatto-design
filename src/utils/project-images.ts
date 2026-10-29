import mobile from '@/assets/projects/app-mobile.jpg';
import web from '@/assets/projects/plataforma-web.jpg';
import research from '@/assets/projects/pesquisa-ux.jpg';

export const projectImages = { mobile, web, research };
export function getProjectImage(key: string) {
    return projectImages[key as keyof typeof projectImages];
}
