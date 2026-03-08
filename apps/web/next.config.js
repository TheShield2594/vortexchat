const { withSentryConfig } = require("@sentry/nextjs")
const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
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
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' blob: data: https:",
              "font-src 'self' data:",
              // Allow WebSocket connections (Supabase Realtime, Livekit) and external APIs
              "connect-src 'self' wss: https:",
              "media-src 'self' blob: https:",
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
}

module.exports = withBundleAnalyzer(withSentryConfig(nextConfig, {
  silent: true,
  // Only upload source maps in CI to avoid leaking them in local builds
  sourcemaps: {
    disable: !process.env.CI,
  },
  webpack: {
    autoInstrumentServerFunctions: true,
  },
}))
