export function siteHref(
  value: string,
  base = import.meta.env.BASE_URL
): string {
  if (!value || /[\u0000-\u0020\\\\]/.test(value) || value.startsWith("//"))
    return "";
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      return url.username || url.password ? "" : url.href;
    } catch {
      return "";
    }
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return "";
  const prefix = base.replace(/\/+$/, "");
  const path = value.startsWith("/") ? value : "/" + value;
  if (
    prefix &&
    (path === prefix ||
      path.startsWith(prefix + "/") ||
      path.startsWith(prefix + "#"))
  )
    return path;
  return prefix + path;
}

export function safeEmail(value: string): string {
  return /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value)
    ? "mailto:" + value
    : "";
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
