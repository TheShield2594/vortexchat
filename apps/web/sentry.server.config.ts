import * as Sentry from "@sentry/nextjs"

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Trace 5% of requests for performance monitoring
  tracesSampleRate: 0.05,
  enabled: process.env.NODE_ENV === "production",
})
