/**
 * Sumi — site configuration
 *
 * This is the only file you need to edit to make the theme yours. Everything
 * else reads from here: metadata, navigation, OG images and the pixel
 * field on the home page.
 */

export interface NavItem {
  label: string;
  href: string;
}

export interface SocialLink {
  /** Shown as the link text, so keep it short. */
  label: string;
  href: string;
}

export const SITE = {
  /** Absolute origin of the deployed site. No trailing slash. */
  url: "https://www.hirykun.top",
  title: "HiryLog",
  /**
   * Short mark used for the vertical rail and the loading screen.
   * Set to an empty string to drop the accent entirely.
   */
  titleMark: "",
  tagline: "兴趣使然",
  description:
    "分享有用的嵌入式软硬件、计算机技术，以及生活中有趣的事物",
  /** BCP 47 language tag, written to <html lang>. */
  lang: "zh-CN",
  /** Used for og:locale. */
  locale: "zh_CN",
  /** IANA time zone used when rendering dates. */
  timeZone: "Asia/Shanghai",
  /** Fallback OG image, relative to public/. Used for pages without one. */
  defaultOgImage: "/og-default.png",
} as const;

export const AUTHOR = {
  name: "HiryKun",
  url: "https://space.bilibili.com/50496994",
  /** One or two sentences. Shown on /about and in structured data. */
  bio: "你好，我是HiryKun，嵌入式软硬件开发者，兴趣广泛",
} as const;

export const NAV: NavItem[] = [
  { label: "Blog", href: "/blog/" },
  { label: "Tags", href: "/tags/" },
  { label: "About", href: "/about/" },
];

export const SOCIAL: SocialLink[] = [
  { label: "GitHub", href: "https://github.com/HiryKun" },
  { label: "Bilibili", href: "https://space.bilibili.com/50496994" },
];

export const BLOG = {
  /** Posts per page on /blog and the tag archives. 8–12 suits a real archive. */
  postsPerPage: 10,
  /** Latest posts shown on the home page. */
  postsOnHome: 4,
  /** Estimated reading speed used for the reading-time label. */
  wordsPerMinute: 220,
  showReadingTime: false,
  /** Render the table of contents on article pages. */
  showTableOfContents: true,
  /** Minimum number of headings before the table of contents appears. */
  tocMinHeadings: 3,
} as const;

/**
 * Article covers.
 *
 * Covers live on an image host rather than in the repository, so a post only
 * stores a file name. `heroImage` may also hold a full URL — anything starting
 * with http(s):// or // is used verbatim, which keeps one-off externals and
 * builds without a configured host working.
 */
export const IMAGE = {
  /**
   * Image host prefix, with or without a trailing slash. Leave it empty to
   * accept absolute URLs only.
   */
  baseUrl: "https://imgbed.hirykun.top/file/",
  /** Cover box ratio, in `aspect-ratio` syntax. Covers are cropped to fit. */
  coverAspect: "16 / 9",
} as const;

/**
 * The WebGL pixel field.
 *
 * A single full-screen shader draws a grid of flat pixels. The cursor spreads
 * the pixels around it apart and tints the seams between them, so the field
 * looks like it lifts wherever the pointer goes. The pixels themselves never
 * change colour.
 *
 * It only ever loads on the home page, is skipped entirely when the visitor
 * prefers reduced motion or the browser lacks WebGL2, and pauses when scrolled
 * out of view. Turn both flags off for a completely JavaScript-free site.
 */
/** Tile shapes the field can draw. Each one is implemented in the pattern table
 *  in src/scripts/pixel-field.ts. */
export type PixelPattern = "hexagon" | "triangle" | "square";

export const PIXEL = {
  /** Full-bleed field behind the hero. */
  hero: true,
  /** Narrow field band used as a section transition. */
  divider: true,
  /** Tile size in CSS px: a square's side, a triangle's base, a hexagon's width
   *  across flats. The busier the grid, the smaller this gets. Sensible range
   *  is 18 – 40. */
  cell: 50,
  /** Magnification at the centre of the lift. Small on purpose: this is a
   *  lift, not a lens. Sensible range is 0 – 0.25. */
  zoom: 0.02,
  /** How far the lift reaches, in CSS px. Sensible range is 160 – 340. */
  radius: 300,
  /** Tile shape: "square", "hexagon", or "triangle". */
  pattern: "hexagon",
  /** Let the field drift on its own instead of only reacting to the cursor. */
  auto: true,
} as const;

/** Generate a per-article OG image at build time with satori. */
export const OG = {
  enabled: true,
  width: 1200,
  height: 630,
} as const;
