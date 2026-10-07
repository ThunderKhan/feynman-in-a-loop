import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * cacheComponents is disabled for this build. Every page in this app is
   * auth-dependent and therefore inherently dynamic (cookies() / getClaims()),
   * and forcing partial prerendering around that adds Suspense ceremony
   * without buying anything at proof-of-concept scale. Re-enable later if
   * caching becomes a real need.
   */
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;