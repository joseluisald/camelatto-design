import { describe, expect, test } from "bun:test";
import { createContentClient, ContentApiError } from "../src/server/api";
import { siteHref, safeEmail, serializeJsonLd } from "../src/utils/urls";
import content from "./fixtures/content.json";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("cliente de conteúdo no servidor", () => {
  test("preserva o contrato completo da LP", async () => {
    const client = createContentClient(
      "http://127.0.0.1:3000",
      5000,
      async () => json(content)
    );
    expect(await client.content()).toEqual(content);
  });
  test("preserva o prefixo externo da API em QA e não encaminha cookies", async () => {
    let request;
    const client = createContentClient(
      "https://demos.jlacode.com.br/camelatto-design/api",
      5000,
      async (url, options) => {
        request = { url: url.href, options };
        return json(content);
      }
    );
    await client.content();
    expect(request.url).toBe(
      "https://demos.jlacode.com.br/camelatto-design/api/v1/content"
    );
    expect(request.options.headers).toEqual({ Accept: "application/json" });
    expect(request.options.redirect).toBe("error");
    expect(request.options.cache).toBe("no-store");
  });
  test("codifica o caminho SEO como parâmetro", async () => {
    let url;
    const client = createContentClient(
      "http://127.0.0.1:3000/",
      5000,
      async (value) => {
        url = value;
        return json(content.seo);
      }
    );
    await client.seo("/projetos/projeto-01");
    expect(url.searchParams.get("path")).toBe("/projetos/projeto-01");
    expect(url.pathname).toBe("/v1/seo");
  });
  test("rejeita configuração com credenciais, query e protocolos não HTTP", () => {
    for (const url of [
      "file:///etc/passwd",
      "https://user:password@example.com",
      "https://example.com/?url=x",
      "https://example.com/#x",
    ]) {
      expect(() => createContentClient(url)).toThrow();
    }
  });
  test("rejeita resposta incompatível com o contrato", async () => {
    const client = createContentClient("http://localhost", 5000, async () =>
      json({ settings: {} })
    );
    await expect(client.content()).rejects.toMatchObject({
      reason: "invalid-response",
    });
  });
  test("oculta erros e corpo do servidor upstream", async () => {
    const client = createContentClient(
      "http://localhost",
      5000,
      async () => new Response("SELECT password FROM private", { status: 500 })
    );
    try {
      await client.content();
      throw new Error("Expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(ContentApiError);
      expect(error.message).not.toContain("SELECT");
      expect(error.reason).toBe("unavailable");
    }
  });
  test("distingue 404 para permitir fallback apenas de SEO opcional", async () => {
    const client = createContentClient("http://localhost", 5000, async () =>
      json({}, 404)
    );
    await expect(client.seo("/inexistente")).rejects.toMatchObject({
      reason: "not-found",
    });
  });
  test("não aceita HTML no lugar de JSON", async () => {
    const client = createContentClient(
      "http://localhost",
      5000,
      async () => new Response("<html>erro</html>")
    );
    await expect(client.content()).rejects.toMatchObject({
      reason: "invalid-response",
    });
  });
  test("aplica timeout à consulta", async () => {
    const client = createContentClient(
      "http://localhost",
      100,
      async (_url, { signal }) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          })
        )
    );
    await expect(client.content()).rejects.toMatchObject({
      reason: "unavailable",
    });
  });
  test("recusa corpos maiores que o limite antes de decodificar", async () => {
    const client = createContentClient(
      "http://localhost",
      5000,
      async () =>
        new Response("a".repeat(2 * 1024 * 1024 + 1), {
          headers: { "content-type": "application/json" },
        })
    );
    await expect(client.content()).rejects.toMatchObject({
      reason: "invalid-response",
    });
  });
});

describe("links e metadados editoriais", () => {
  test("respeita os caminhos de QA sem duplicar o prefixo", () => {
    expect(siteHref("/#projetos", "/camelatto-design/")).toBe(
      "/camelatto-design/#projetos"
    );
    expect(
      siteHref("/camelatto-design/_astro/image.webp", "/camelatto-design/")
    ).toBe("/camelatto-design/_astro/image.webp");
    expect(siteHref("/#contato", "/")).toBe("/#contato");
  });
  test("bloqueia protocolos executáveis, caminhos ambíguos e credenciais", () => {
    for (const href of [
      "javascript:alert(1)",
      "data:text/html,test",
      "//evil.invalid/path",
      "https://user:secret@example.com",
      "/\\evil.invalid",
      "java\nscript:alert(1)",
    ])
      expect(siteHref(href, "/")).toBe("");
    expect(safeEmail("contato@example.com")).toBe("mailto:contato@example.com");
    expect(safeEmail("bad\n@example.com")).toBe("");
  });
  test("JSON-LD escapa fechamento de script sem alterar o conteúdo", () => {
    const data = { name: "</script><script>alert(1)</script>" };
    const result = serializeJsonLd(data);
    expect(result).not.toContain("</script>");
    expect(JSON.parse(result)).toEqual(data);
  });
});
