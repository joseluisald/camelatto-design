import { defineMiddleware } from "astro:middleware";
import { SITE_ENV } from "astro:env/server";
import { getSettings, getSeo } from "./utils/data";
import { ContentApiError } from "./server/api";

export const onRequest = defineMiddleware(async (context, next) => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const path =
    context.url.pathname.slice(base.length).replace(/\/$/, "") || "/";
  const isProject = path.startsWith("/projetos/");
  if (path === "/" || isProject) {
    const slug = isProject ? path.slice("/projetos/".length) : undefined;
    if (slug !== undefined && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return context.rewrite(base + "/404/");
    }
    try {
      const content = await getSettings();
      context.locals.content = content;
      context.locals.seo = content.seo;
      if (slug) {
        const project = content.portfolio.projects.find(
          (item) => item.slug === slug
        );
        if (!project) return context.rewrite(base + "/404/");
        context.locals.project = project;
        try {
          context.locals.seo = await getSeo("/projetos/" + slug);
        } catch (error) {
          if (
            !(error instanceof ContentApiError) ||
            error.reason !== "not-found"
          )
            throw error;
          context.locals.seo = {
            ...content.seo,
            path: "/projetos/" + slug,
            title: project.title + " — " + content.settings.title,
            description: project.description,
            ogImage: "",
          };
        }
      }
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "content_unavailable",
          reason: error instanceof ContentApiError ? error.reason : "internal",
        })
      );
      return context.rewrite(base + "/503/");
    }
  }
  const response = await next();
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Cache-Control", "no-store");
  if (SITE_ENV !== "production")
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
});
