import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { Resvg } from "@resvg/resvg-js";
import satori from "satori";

import { OG, SITE } from "../config";

/**
 * Build-time social preview images.
 *
 * Two fonts are registered with satori:
 *
 * - JetBrains Mono is a static single-weight cut of the webfont in public/.
 *   satori reads TrueType, not woff2, and the opentype parser it bundles
 *   chokes on the fvar table of a variable font, hence the separate static cut.
 * - Source Han Sans CN supplies the CJK glyphs. Without it satori has no
 *   ideograph coverage and every Chinese character renders as a tofu box.
 *
 * Both live in src/assets so they are never served to visitors. Cached, since
 * every post wants them.
 */
let latinFontPromise: Promise<Buffer> | undefined;
let cjkFontPromise: Promise<Buffer> | undefined;

function loadLatinFont(): Promise<Buffer> {
  latinFontPromise ??= readFile(
    // Relative to the project root: this module is bundled into dist/ during a
    // build, so import.meta.url would point at the wrong tree.
    join(process.cwd(), "src/assets/fonts/jetbrains-mono-latin-400.ttf"),
  );

  return latinFontPromise;
}

function loadCjkFont(): Promise<Buffer> {
  cjkFontPromise ??= readFile(
    join(process.cwd(), "src/assets/fonts/SourceHanSansCN-Regular.otf"),
  );

  return cjkFontPromise;
}

const INK = "#0b0c0e";
const PAPER = "#e9e7e1";
const FAINT = "rgba(233,231,225,0.45)";
const ACCENT = "#c85a52";

interface OgOptions {
  title: string;
  /** Monospace stamp under the rule, e.g. "2026.05.08". */
  stamp?: string;
  tags?: string[];
}

/** satori takes a React-shaped tree; these keep the literals readable. */
const node = (
  type: string,
  style: Record<string, unknown>,
  children?: unknown,
) => ({ type, props: { style, children } });

const text = (value: string, style: Record<string, unknown>) =>
  node("div", style, value);

export async function renderOgImage(options: OgOptions): Promise<Buffer> {
  const { title, stamp, tags = [] } = options;
  const [latinFont, cjkFont] = await Promise.all([
    loadLatinFont(),
    loadCjkFont(),
  ]);

  const footer = [stamp, tags.join(" · ")].filter(Boolean).join("  —  ");

  const markup = node(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      width: "100%",
      height: "100%",
      padding: "72px 80px",
      backgroundColor: INK,
      fontFamily: "JetBrains Mono, Source Han Sans CN",
      color: PAPER,
    },
    [
      text(SITE.title.toUpperCase(), {
        fontSize: 24,
        letterSpacing: "0.34em",
        color: FAINT,
      }),

      node("div", { display: "flex", flexDirection: "column", gap: 40 }, [
        text(title, {
          fontSize: title.length > 46 ? 56 : 68,
          lineHeight: 1.18,
          letterSpacing: "-0.01em",
        }),
        node("div", {
          display: "flex",
          width: 96,
          height: 3,
          backgroundColor: ACCENT,
        }),
      ]),

      text(footer, {
        fontSize: 22,
        letterSpacing: "0.14em",
        color: FAINT,
      }),
    ],
  );

  const svg = await satori(markup as never, {
    width: OG.width,
    height: OG.height,
    fonts: [
      {
        name: "JetBrains Mono",
        data: latinFont,
        weight: 400,
        style: "normal",
      },
      {
        name: "Source Han Sans CN",
        data: cjkFont,
        weight: 400,
        style: "normal",
      },
    ],
  });

  return Buffer.from(
    new Resvg(svg, {
      fitTo: { mode: "width", value: OG.width },
    })
      .render()
      .asPng(),
  );
}
