import { Value } from "@sinclair/typebox/value";
import type { Static, TSchema } from "@sinclair/typebox";
import { contentSchema, seoSchema } from "../models/content";

export class ContentApiError extends Error {
  constructor(
    public readonly reason: "unavailable" | "invalid-response" | "not-found"
  ) {
    super("Não foi possível carregar o conteúdo.");
  }
}

export function createContentClient(
  baseUrl: string,
  timeoutMs = 5000,
  transport: typeof fetch = fetch
) {
  const base = new URL(baseUrl);
  if (
    !["http:", "https:"].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  ) {
    throw new Error(
      "API_URL deve ser uma URL HTTP sem credenciais, query ou fragmento."
    );
  }
  base.pathname = base.pathname.replace(/\/+$/, "") + "/";
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000)
    throw new Error("Timeout inválido.");

  async function request<T extends TSchema>(
    path: string,
    schema: T
  ): Promise<Static<T>> {
    try {
      const response = await transport(new URL("v1/" + path, base), {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "error",
        cache: "no-store",
      });
      if (response.status === 404) throw new ContentApiError("not-found");
      if (!response.ok) throw new ContentApiError("unavailable");
      if (!response.headers.get("content-type")?.includes("application/json"))
        throw new ContentApiError("invalid-response");
      // Limita o corpo antes de decodificar um documento potencialmente inválido.
      const reader = response.body?.getReader();
      if (!reader) throw new ContentApiError("invalid-response");
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 2 * 1024 * 1024) {
            await reader.cancel();
            throw new ContentApiError("invalid-response");
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      const body = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const data: unknown = JSON.parse(new TextDecoder().decode(body));
      if (!Value.Check(schema, data))
        throw new ContentApiError("invalid-response");
      return data;
    } catch (error) {
      if (error instanceof ContentApiError) throw error;
      throw new ContentApiError("unavailable");
    }
  }

  return {
    content: () => request("content", contentSchema),
    seo: (path: string) =>
      request("seo?path=" + encodeURIComponent(path), seoSchema),
  };
}
