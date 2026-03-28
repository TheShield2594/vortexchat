const { withSentryConfig } = require("@sentry/nextjs")
const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // Service worker must always be fresh — no caching
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        // Long-lived cache for PWA icons and splash screens
        source: "/icon-:size(\\d+).png",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/apple-touch-icon.png",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/startup/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        // Manifest should refresh periodically
        source: "/manifest.json",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400" },
        ],
      },
      {
        // Apply security headers to all routes
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            // Allow microphone for voice channels; deny camera, geolocation, payment
            value: "camera=(), microphone=(self), geolocation=(), payment=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // Next.js requires unsafe-inline/unsafe-eval for its runtime
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' blob: data: https:",
              "font-src 'self' data: https://fonts.gstatic.com",
              // Allow WebSocket connections (Supabase Realtime, Livekit) and external APIs
              "connect-src 'self' wss: https:",
              "media-src 'self' blob: https:",
              // Allow blob: workers for WebRTC voice processing
              "worker-src 'self' blob:",
              // Allow embedded YouTube streams for Stage channels
              "frame-src 'self' https://www.youtube.com https://youtube.com https://www.youtube-nocookie.com",
              // Prevent <frame>/<iframe> embedding
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ]
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.in',
      },
    ],
  },
  eslint: {
    // ESLint linting is run separately via `eslint .` — skip during `next build`
    // to avoid a workspace hoisting issue with minimatch versions
    ignoreDuringBuilds: true,
  },
  transpilePackages: ['@vortex/shared'],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Split heavy client-side dependencies into separate chunks
      // so the initial bundle stays small on low-end mobile devices
      config.optimization.splitChunks = {
        ...config.optimization.splitChunks,
        cacheGroups: {
          ...config.optimization.splitChunks?.cacheGroups,
          livekit: {
            test: /[\\/]node_modules[\\/](livekit-client|@livekit)[\\/]/,
            name: "livekit",
            chunks: "all",
            priority: 30,
          },
          supabase: {
            test: /[\\/]node_modules[\\/]@supabase[\\/]/,
            name: "supabase",
            chunks: "all",
            priority: 25,
          },
          sentry: {
            test: /[\\/]node_modules[\\/]@sentry[\\/]/,
            name: "sentry",
            chunks: "all",
            priority: 20,
          },
        },
      }
    }
    return config
  },
}

module.exports = withBundleAnalyzer(withSentryConfig(nextConfig, {
  silent: true,
  // Only upload source maps in CI to avoid leaking them in local builds
  sourcemaps: {
    disable: !process.env.CI,
  },
  webpack: {
    autoInstrumentServerFunctions: false,
  },
}))
