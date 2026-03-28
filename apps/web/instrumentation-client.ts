import * as Sentry from "@sentry/nextjs"

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Route envelopes through a first-party endpoint so ad blockers
  // don't intercept requests to sentry.io
  tunnel: "/api/sentry-tunnel",
  tracesSampleRate: 0.05,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  integrations: [
    Sentry.replayIntegration(),
    Sentry.browserTracingIntegration({
      enableLongTask: true,
      enableInp: true,
    }),
  ],
  enabled: process.env.NODE_ENV === "production",
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
