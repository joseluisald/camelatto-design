import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";

const environment = process.argv[2] || "development";
const prefix = environment === "qa" ? "/camelatto-design" : "";
const canonicalOrigin =
  environment === "qa"
    ? "https://demos.jlacode.com.br"
    : environment === "production"
      ? "https://ericacamelatto.com.br"
      : "http://localhost:4321";
const content = JSON.parse(
  fs.readFileSync(
    new URL("../tests/fixtures/content.json", import.meta.url),
    "utf8"
  )
);
let fail = false;
let invalid = false;
let missingSeo = false;
let apiRequests = 0;
const upstream = http.createServer((request, response) => {
  apiRequests++;
  if (fail) {
    response.writeHead(500);
    response.end("private SQL exception");
    return;
  }
  response.setHeader("Content-Type", "application/json");
  if (request.url.startsWith("/private-upstream-marker/v1/content")) {
    response.end(JSON.stringify(invalid ? {} : content));
  } else if (request.url.startsWith("/private-upstream-marker/v1/seo")) {
    if (missingSeo) {
      response.writeHead(404);
      response.end("{}");
      return;
    }
    response.end(
      JSON.stringify({
        ...content.seo,
        path: "/projetos/projeto-01",
        title: "SEO específico via API",
      })
    );
  } else {
    response.writeHead(404);
    response.end("{}");
  }
});
upstream.listen(0, "127.0.0.1");
await once(upstream, "listening");
const probe = http.createServer();
probe.listen(0, "127.0.0.1");
await once(probe, "listening");
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const processHandle = spawn(process.execPath, ["dist/server/entry.mjs"], {
  env: {
    ...process.env,
    HOST: "127.0.0.1",
    PORT: String(port),
    API_URL:
      "http://127.0.0.1:" +
      upstream.address().port +
      "/private-upstream-marker",
    API_TIMEOUT_MS: "500",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
processHandle.stdout.on("data", (chunk) => {
  logs = (logs + chunk.toString()).slice(-20000);
});
processHandle.stderr.on("data", (chunk) => {
  logs = (logs + chunk.toString()).slice(-20000);
});
const origin = "http://127.0.0.1:" + port;
const get = (path, init) => fetch(origin + prefix + path, init);
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (processHandle.exitCode !== null)
      throw new Error("SSR encerrou: " + logs);
    try {
      const response = await get("/404/");
      if (response.status === 404) {
        ready = true;
        break;
      }
    } catch {}
    await delay(100);
  }
  assert.ok(ready, "SSR não iniciou: " + logs);
  let response = await get("/");
  assert.equal(response.status, 200);
  let html = await response.text();
  assert.ok(html.includes(content.portfolio.hero.title));
  assert.ok(html.includes(content.faq[0].question));
  assert.ok(html.includes("<title>" + content.seo.title + "</title>"));
  assert.ok(
    html.includes('rel="canonical" href="' + canonicalOrigin + prefix + '/"')
  );
  assert.ok(
    html.includes(
      'content="' +
        (environment === "production" ? "index, follow" : "noindex, nofollow") +
        '"'
    )
  );
  assert.ok(html.includes('href="' + prefix + '/#projetos"'));
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.ok(!html.includes("private-upstream-marker"));
  const stylesheet = [...html.matchAll(/href="([^"]+\.css)"/g)].map(
    (match) => match[1]
  )[0];
  assert.ok(stylesheet, "CSS ausente");
  const cssResponse = await fetch(new URL(stylesheet, origin));
  assert.equal(cssResponse.status, 200);
  const css = await cssResponse.text();
  const font = css.match(/url\(["']?([^)"']*portfolio-1\.ttf)["']?\)/)?.[1];
  assert.ok(font, "Fonte ausente no CSS");
  assert.equal((await fetch(new URL(font, origin))).status, 200);
  const imageSrc = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map(
    (match) => match[1]
  )[0];
  assert.ok(imageSrc, "Imagem ausente");
  assert.equal(
    (await fetch(new URL(imageSrc.replaceAll("&amp;", "&"), origin))).status,
    200
  );
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(
    (match) => match[1]
  );
  for (const src of scripts) {
    const script = await fetch(new URL(src, origin));
    assert.equal(script.status, 200);
    assert.ok(!(await script.text()).includes("private-upstream-marker"));
  }

  assert.ok(
    html.includes('property="og:title" content="' + content.seo.title + '"')
  );
  content.seo.ogImage = "/social-card.png";
  content.portfolio.hero.title = "Conteúdo atualizado sem rebuild";
  html = await (await get("/")).text();
  assert.ok(html.includes("Conteúdo atualizado sem rebuild"));
  assert.ok(
    html.includes(
      'property="og:image" content="' +
        canonicalOrigin +
        prefix +
        '/social-card.png"'
    )
  );
  content.settings.name = "</script><script>alert(1)</script>";
  html = await (await get("/")).text();
  const jsonLd = html.match(
    /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/
  )?.[1];
  assert.ok(jsonLd, "JSON-LD ausente");
  assert.equal(JSON.parse(jsonLd).name, content.settings.name);
  assert.ok(!jsonLd.includes("</script>"));
  assert.ok(!/<script>\s*alert\(1\)/.test(html.replace(/"[^"]*"/g, '""')));
  content.settings.name = "Érica Camelatto";
  response = await get("/projetos/projeto-01/");
  assert.equal(response.status, 200);
  html = await response.text();
  assert.ok(html.includes("<title>SEO específico via API</title>"));
  assert.ok(html.includes(content.portfolio.projects[0].challenge));
  assert.ok(
    html.includes(
      'rel="canonical" href="' +
        canonicalOrigin +
        prefix +
        '/projetos/projeto-01/"'
    )
  );
  missingSeo = true;
  assert.equal((await get("/projetos/projeto-01/")).status, 200);
  assert.equal((await get("/projetos/inexistente/")).status, 404);
  assert.equal((await get("/inexistente/")).status, 404);
  const before = apiRequests;
  assert.equal((await get("/404/")).status, 404);
  assert.equal(apiRequests, before);
  fail = true;
  response = await get("/");
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("retry-after"), "60");
  html = await response.text();
  assert.ok(!html.includes("private SQL"));
  assert.ok(html.includes("Voltamos em instantes."));
  assert.equal((await get("/404/")).status, 404);
  fail = false;
  invalid = true;
  assert.equal((await get("/")).status, 503);
  invalid = false;
  assert.equal((await get("/")).status, 200);
  console.log(
    "SSR " +
      environment +
      " OK: home, projetos, FAQ, SEO, assets, conteúdo atualizado sem rebuild, escape de JSON-LD, 404/503, recuperação e configuração restrita ao servidor."
  );
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  processHandle.kill();
  if (processHandle.exitCode === null) await once(processHandle, "exit");
  await new Promise((resolve) => upstream.close(resolve));
}
