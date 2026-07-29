// Shared (client-safe) slug rules for spotlight routes. The param matcher and
// the server data layer must agree on these, so they live outside lib/server.

/** Slugs that can never be assets (route collisions). */
export const RESERVED_SLUGS = new Set([
  "terminal",
  "login",
  "news",
  "app",
  "api",
  "og",
  "settings",
  "checkout",
  "onboarding",
  "tokensxyz",
  "deepseek",
  "jupiter",
  "yahoo",
  "gdelt",
  // "/discord" stays reserved after the community server's removal: old
  // links in the wild must 404 honestly, not resolve to an asset page.
  "discord",
  "token",
  "equities",
  "pre-ipo",
  "crypto",
  "assets",
  "share",
  "sitemap.xml",
  "robots.txt",
  "llms.txt",
  "favicon.ico",
  // Open WebUI (and other local tools) share localhost:3000 in some setups
  // and soft-navigate to /error|/auth — those must not hit the asset loader.
  "error",
  "auth",
  "admin",
  "signin",
  "signup",
]);

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;

export function isAssetSlug(value: string): boolean {
  return SLUG_PATTERN.test(value) && !RESERVED_SLUGS.has(value);
}
