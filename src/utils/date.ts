import { SITE } from "../config";

/** "5 August 2026" — used in prose contexts. */
export function formatDate(date: Date, lang: string = SITE.lang): string {
  return new Intl.DateTimeFormat(lang, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: SITE.timeZone,
  }).format(date);
}

/** "2026.08.05" — used in the monospace metadata rows. */
export function formatDateStamp(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: SITE.timeZone,
  }).formatToParts(date);
  const at = (type: string) => parts.find((p) => p.type === type)?.value ?? "";

  return `${at("year")}.${at("month")}.${at("day")}`;
}

/**
 * Value for <time datetime> and structured data. Kept in UTC on purpose:
 * machine-readable timestamps should be absolute, not local.
 */
export function isoDate(date: Date): string {
  return date.toISOString();
}
