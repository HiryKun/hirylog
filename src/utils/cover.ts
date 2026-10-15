import { IMAGE } from "../config";

/**
 * Absolute URL of an article cover.
 *
 * `heroImage` normally holds just a file name, which is resolved against
 * IMAGE.baseUrl. Absolute and protocol-relative values pass through untouched,
 * so a post can point somewhere else without touching the config. The URL
 * constructor also percent-encodes names containing spaces or CJK characters.
 */
export function coverUrl(value: string): string {
  if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(value)) return value;

  if (!IMAGE.baseUrl) return value;

  const base = IMAGE.baseUrl.endsWith("/")
    ? IMAGE.baseUrl
    : `${IMAGE.baseUrl}/`;

  return new URL(value.replace(/^\/+/, ""), base).href;
}
