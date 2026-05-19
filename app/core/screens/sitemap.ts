/**
 * Sitemap Generator Module
 *
 * This module dynamically generates an XML sitemap for the application by scanning
 * content directories and combining them with static routes. The sitemap helps search
 * engines discover and index the application's pages, improving SEO performance.
 *
 * The module automatically includes:
 * - Blog posts from MDX files in the blog directory
 * - Legal pages from MDX files in the legal directory
 * - Custom static routes defined in the code
 *
 * The sitemap is generated on-demand when the route is accessed, ensuring it always
 * contains the latest content without requiring a rebuild of the application.
 */
import { readdir } from "node:fs/promises";
import path from "node:path";

/**
 * Sitemap generator loader function
 * 
 * This React Router loader function dynamically generates an XML sitemap for the application.
 * It scans the filesystem for content files, combines them with static routes, and formats
 * them according to the sitemap protocol specification.
 * 
 * The function performs these steps:
 * 1. Gets the site domain from environment variables
 * 2. Scans the blog directory for MDX files and converts filenames to URLs
 * 3. Scans the legal directory for MDX files and converts filenames to URLs
 * 4. Combines these with static routes like homepage, login, and registration
 * 5. Formats all URLs according to the sitemap XML specification
 * 6. Returns an XML response with the proper content type header
 * 
 * @returns {Response} XML response containing the sitemap
 */
export async function loader() {
  // Get the site domain from environment variables
  const DOMAIN = process.env.SITE_URL;

  // 누락될 수 있는 콘텐츠 디렉토리를 안전하게 스캔 — 없으면 빈 목록.
  // (blog 디렉토리 미존재 시 readdir 가 throw → prerender 500 이 되던 문제 방지)
  const scanMdxSlugs = async (...segments: string[]): Promise<string[]> => {
    try {
      return (await readdir(path.join(process.cwd(), ...segments)))
        .filter((file) => file.endsWith(".mdx")) // Only include MDX files
        .map((file) => file.replace(".mdx", ""));
    } catch {
      return [];
    }
  };

  // Scan the blog / legal directories for MDX files and convert to URLs
  const blogUrls = (await scanMdxSlugs("app", "features", "blog", "docs")).map(
    (slug) => `/blog/${slug}`,
  );
  const legalUrls = (
    await scanMdxSlugs("app", "features", "legal", "docs")
  ).map((slug) => `/legal/${slug}`);

  // Define static routes that should be included in the sitemap
  const customUrls = ["/", "/login", "/join"];

  // Combine all URLs and format them according to sitemap protocol
  const sitemapUrls = [...blogUrls, ...legalUrls, ...customUrls].map((url) => {
    return `<url>
      <loc>${DOMAIN}${url}</loc>
      <lastmod>${new Date().toISOString()}</lastmod>
    </url>`;
  });

  // Return an XML response with the sitemap
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>
    <urlset
      xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9 http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd"
    >
      ${sitemapUrls.join("\n")}
    </urlset>
    `,
    {
      headers: { "Content-Type": "application/xml" }, // Set proper content type for XML
    },
  );
}
