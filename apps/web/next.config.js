const { withSentryConfig } = require("@sentry/nextjs")

/** @type {import('next').NextConfig} */
const nextConfig = {
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

module.exports = withSentryConfig(nextConfig, {
  silent: true,
  // Only upload source maps in CI to avoid leaking them in local builds
  sourcemaps: {
    disable: !process.env.CI,
  },
  autoInstrumentServerFunctions: true,
})
