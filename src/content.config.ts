import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const blog = defineCollection({
  // Files starting with an underscore are ignored, which makes drafts easy to
  // park outside the build entirely.
  loader: glob({ base: "./src/content/blog", pattern: "**/[^_]*.{md,mdx}" }),
  schema: z.object({
    title: z.string(),
    /** Used for the post list, meta description and the OG image. */
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    /** Hidden from production builds, still visible in `astro dev`. */
    draft: z.boolean().default(false),
    /**
     * Cover on the image host: a file name resolved against IMAGE.baseUrl in
     * src/config.ts, or a full URL used as written.
     */
    heroImage: z.string().min(1).optional(),
    heroImageAlt: z.string().optional(),
  }),
});

export const collections = { blog };
