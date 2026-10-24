import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Private order pages and their API: never indexed, and the URL (which can hold the private key) never leaks
  // to another site through the Referer header.
  async headers() {
    const privateHeaders = [
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
    ];
    return [
      { source: "/order/:id", headers: privateHeaders },
      { source: "/refer", headers: privateHeaders },
      { source: "/api/referrals/:path*", headers: privateHeaders },
      { source: "/api/orders/:path*", headers: privateHeaders },
    ];
  },
  partialPrefetching: true,
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
