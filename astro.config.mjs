// @ts-check
import { defineConfig, envField } from "astro/config";
import { loadEnv } from "vite";
import node from "@astrojs/node";
import tailwindcss from "@tailwindcss/vite";
import alpinejs from "@astrojs/alpinejs";
import compress from "astro-compress";

const env = {
  ...loadEnv(process.env.NODE_ENV || "development", process.cwd(), ""),
  ...process.env,
};
const siteEnvironment = env.SITE_ENV || "development";
const sites = {
  development: { site: "http://localhost:4321", base: "/" },
  qa: { site: "https://demos.jlacode.com.br", base: "/camelatto-design/" },
  production: { site: "https://ericacamelatto.com.br", base: "/" },
};
if (!(siteEnvironment in sites))
  throw new Error("SITE_ENV deve ser development, qa ou production.");
const deployment = sites[/** @type {keyof typeof sites} */ (siteEnvironment)];

export default defineConfig({
  ...deployment,
  output: "server",
  session: false,
  adapter: node({ mode: "standalone" }),
  trailingSlash: "always",
  env: {
    schema: {
      API_URL: envField.string({
        context: "server",
        access: "secret",
        url: true,
        default: "http://127.0.0.1:3000",
      }),
      API_TIMEOUT_MS: envField.number({
        context: "server",
        access: "secret",
        int: true,
        min: 100,
        max: 30000,
        default: 5000,
      }),
      SITE_ENV: envField.enum({
        context: "server",
        access: "public",
        values: ["development", "qa", "production"],
        default: /** @type {keyof typeof sites} */ (siteEnvironment),
      }),
    },
  },
  vite: {
    plugins: [tailwindcss()],
    build: {
      target: "es2022",
      minify: "esbuild",
      cssMinify: "lightningcss",
      sourcemap: false,
      reportCompressedSize: false,
    },
  },
  build: { inlineStylesheets: "auto" },
  integrations: [
    alpinejs({ entrypoint: "/src/entrypoint" }),
    compress({ HTML: false, CSS: true, JavaScript: true, Image: true }),
  ],
});
