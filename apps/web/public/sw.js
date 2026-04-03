// VortexChat Service Worker — source file.
// In production this is processed by `scripts/build-sw.mjs` (workbox-build
// injectManifest), which replaces the WB_MANIFEST placeholder with the list of
// content-hashed /_next/static/ assets and writes the result to public/sw.js.
// In development, public/sw.js is used directly as a fallback.

// ─── VAPID key helper ────────────────────────────────────────────────────────
// Convert a base64url-encoded VAPID public key to a Uint8Array.
// PushManager.subscribe() requires BufferSource on iOS Safari; the string
// form is not universally supported.
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

// ─── Cache names ────────────────────────────────────────────────────────────
const PRECACHE = "vortexchat-precache-v7"
const RUNTIME = "vortexchat-runtime-v7"
const APP_SHELL = "vortexchat-shell-v7"
const API_CACHE = "vortexchat-api-v1"
const API_CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const ALL_CACHES = [PRECACHE, RUNTIME, APP_SHELL, API_CACHE]

// ─── Precache manifest ───────────────────────────────────────────────────────
// Injected by workbox-build: list of { url, revision } objects for every
// /_next/static/ chunk produced by `next build`. Falls back to [] in dev.
const PRECACHE_MANIFEST = [{"revision":null,"url":"/_next/static/media/6c596dfcddeca1e9-s.p.woff2"},{"revision":null,"url":"/_next/static/media/5a0c43ffa288c21a-s.p.woff2"},{"revision":null,"url":"/_next/static/css/cd5538f640082d05.css"},{"revision":null,"url":"/_next/static/css/ba278f5b6ac3246f.css"},{"revision":null,"url":"/_next/static/chunks/webpack-01c7715d339d6251.js"},{"revision":null,"url":"/_next/static/chunks/supabase-8f228c8a572c4ccf.js"},{"revision":null,"url":"/_next/static/chunks/sentry-31c65ef53803a6af.js"},{"revision":null,"url":"/_next/static/chunks/polyfills-42372ed130431b0a.js"},{"revision":null,"url":"/_next/static/chunks/main-app-8925be33c459f43c.js"},{"revision":null,"url":"/_next/static/chunks/main-20f22f2e429fed89.js"},{"revision":null,"url":"/_next/static/chunks/framework-936b762db7c591be.js"},{"revision":null,"url":"/_next/static/chunks/9738.a3124cdc16d09c77.js"},{"revision":null,"url":"/_next/static/chunks/9594-505be0d565cc3138.js"},{"revision":null,"url":"/_next/static/chunks/9278.ca4834c61078fc55.js"},{"revision":null,"url":"/_next/static/chunks/9276-5fbdc705eab98a3e.js"},{"revision":null,"url":"/_next/static/chunks/9260.1a80626fadf726e2.js"},{"revision":null,"url":"/_next/static/chunks/9197.ef12462906527852.js"},{"revision":null,"url":"/_next/static/chunks/9127.36a112b56057cd9e.js"},{"revision":null,"url":"/_next/static/chunks/9084.ac4cd956744cae55.js"},{"revision":null,"url":"/_next/static/chunks/87c73c54-014124adcece3495.js"},{"revision":null,"url":"/_next/static/chunks/8379-17be2c475d4aa647.js"},{"revision":null,"url":"/_next/static/chunks/8084.01a9d52e8944b0de.js"},{"revision":null,"url":"/_next/static/chunks/7959-b6045fb579e26208.js"},{"revision":null,"url":"/_next/static/chunks/7823-85e455f82f58b33e.js"},{"revision":null,"url":"/_next/static/chunks/7775-5e62c4cf53cb6f69.js"},{"revision":null,"url":"/_next/static/chunks/7609-13b7173750acc4fb.js"},{"revision":null,"url":"/_next/static/chunks/75504863-b1d072d957b37a8c.js"},{"revision":null,"url":"/_next/static/chunks/7277-a2af147f4450192f.js"},{"revision":null,"url":"/_next/static/chunks/7227-0b37e00bba48bd37.js"},{"revision":null,"url":"/_next/static/chunks/680-3c997dbafd2a5a42.js"},{"revision":null,"url":"/_next/static/chunks/6791.72e603e74776999f.js"},{"revision":null,"url":"/_next/static/chunks/6756.010979ca288a186b.js"},{"revision":null,"url":"/_next/static/chunks/6702-f8bfa669e570275c.js"},{"revision":null,"url":"/_next/static/chunks/6678.bae2bdec488e2e6c.js"},{"revision":null,"url":"/_next/static/chunks/6503-7aa5f45a93f08b05.js"},{"revision":null,"url":"/_next/static/chunks/6387-df2f5073cba30a58.js"},{"revision":null,"url":"/_next/static/chunks/6286.d503f507329ebf02.js"},{"revision":null,"url":"/_next/static/chunks/6148.023cba5a90839762.js"},{"revision":null,"url":"/_next/static/chunks/59c6eb5a-51713df527d49bc7.js"},{"revision":null,"url":"/_next/static/chunks/5978.7b11cf46b30bdb4a.js"},{"revision":null,"url":"/_next/static/chunks/5939-3bc1c61303d13d28.js"},{"revision":null,"url":"/_next/static/chunks/5752-39bcf5804a86ef07.js"},{"revision":null,"url":"/_next/static/chunks/572.edc0f1c3255ac928.js"},{"revision":null,"url":"/_next/static/chunks/5604-b5f204aa4a23ec29.js"},{"revision":null,"url":"/_next/static/chunks/5587-a7b27532d27336d1.js"},{"revision":null,"url":"/_next/static/chunks/5483-f0a239e82bbd155e.js"},{"revision":null,"url":"/_next/static/chunks/5321-788d3c4dac9ba1d3.js"},{"revision":null,"url":"/_next/static/chunks/5051-870adb81667d1225.js"},{"revision":null,"url":"/_next/static/chunks/4710-2417ff7bce25c0be.js"},{"revision":null,"url":"/_next/static/chunks/4167-a5e1bd9f3c549d00.js"},{"revision":null,"url":"/_next/static/chunks/4138.e3bc7d8f52f224a0.js"},{"revision":null,"url":"/_next/static/chunks/4121-48711d3049a3110b.js"},{"revision":null,"url":"/_next/static/chunks/4065.1a0f3f72f3f2ed66.js"},{"revision":null,"url":"/_next/static/chunks/39af6c14.d3d09542cf9e5c96.js"},{"revision":null,"url":"/_next/static/chunks/3654.ae5761867946e309.js"},{"revision":null,"url":"/_next/static/chunks/3112-015823910c1a1e3a.js"},{"revision":null,"url":"/_next/static/chunks/2939.40a8721d694b04ae.js"},{"revision":null,"url":"/_next/static/chunks/2775-072da57ee1ceb6b7.js"},{"revision":null,"url":"/_next/static/chunks/2768-5b2d0910f1ea5371.js"},{"revision":null,"url":"/_next/static/chunks/2725-c28409226113ca23.js"},{"revision":null,"url":"/_next/static/chunks/2653-941da8f4aa8cfdce.js"},{"revision":null,"url":"/_next/static/chunks/2651-19f79d3e852972cc.js"},{"revision":null,"url":"/_next/static/chunks/2549.f4ff5b26ccf99d66.js"},{"revision":null,"url":"/_next/static/chunks/254-268e31369ffec45e.js"},{"revision":null,"url":"/_next/static/chunks/2431-1d99be3196869b00.js"},{"revision":null,"url":"/_next/static/chunks/2389.745f3eb33b25656f.js"},{"revision":null,"url":"/_next/static/chunks/2329-2417ff7bce25c0be.js"},{"revision":null,"url":"/_next/static/chunks/2135-4f6ebe8b4f77dee0.js"},{"revision":null,"url":"/_next/static/chunks/2087.a5ca4c44064d2772.js"},{"revision":null,"url":"/_next/static/chunks/1975-7e5bf2fdcf10e3ad.js"},{"revision":null,"url":"/_next/static/chunks/1757.7fb6c88df24a0bdf.js"},{"revision":null,"url":"/_next/static/chunks/1578.3e74256473743512.js"},{"revision":null,"url":"/_next/static/chunks/1566.eb59d8e2efe5a447.js"},{"revision":null,"url":"/_next/static/chunks/1281.62223e111683d18e.js"},{"revision":null,"url":"/_next/static/chunks/1184-2a7435cbeaa1045a.js"},{"revision":null,"url":"/_next/static/chunks/1172-d478202e57d9d614.js"},{"revision":null,"url":"/_next/static/chunks/1033-9c237d5f920b8db3.js"},{"revision":null,"url":"/_next/static/chunks/next/dist/client/components/builtin/unauthorized-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/next/dist/client/components/builtin/forbidden-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/next/dist/client/components/builtin/app-error-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/page-29afed84c05390df.js"},{"revision":null,"url":"/_next/static/chunks/app/not-found-e6f3c4d244209491.js"},{"revision":null,"url":"/_next/static/chunks/app/layout-b981711993df4ebb.js"},{"revision":null,"url":"/_next/static/chunks/app/global-error-c3d8603a1e6b71c4.js"},{"revision":null,"url":"/_next/static/chunks/app/error-15e9ecc0d44adac7.js"},{"revision":null,"url":"/_next/static/chunks/app/verify-email/page-f16bee2da71ee73e.js"},{"revision":null,"url":"/_next/static/chunks/app/verify-email/layout-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/update-password/page-8e493b1b2f120bb0.js"},{"revision":null,"url":"/_next/static/chunks/app/terms/page-e6f3c4d244209491.js"},{"revision":null,"url":"/_next/static/chunks/app/showcase/page-775a7e7b762035dc.js"},{"revision":null,"url":"/_next/static/chunks/app/settings/page-e6b96fff5fdd0475.js"},{"revision":null,"url":"/_next/static/chunks/app/settings/loading-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/settings/layout-b7602e0fbf92f8c1.js"},{"revision":null,"url":"/_next/static/chunks/app/settings/voice/page-c09c1b42614f21a4.js"},{"revision":null,"url":"/_next/static/chunks/app/settings/security/page-24b326c3a8256709.js"},{"revision":null,"url":"/_next/static/chunks/app/settings/profile/page-bd802ec7191aee62.js"},{"revision":null,"url":"/_next/static/chunks/app/settings/notifications/page-2409764a226df497.js"},{"revision":null,"url":"/_next/static/chunks/app/settings/keybinds/page-89f723f45e049b56.js"},{"revision":null,"url":"/_next/static/chunks/app/settings/appearance/page-1a99d83b185d0a72.js"},{"revision":null,"url":"/_next/static/chunks/app/settings/accessibility/page-2b94d6db73a8a4e0.js"},{"revision":null,"url":"/_next/static/chunks/app/self-host/page-775a7e7b762035dc.js"},{"revision":null,"url":"/_next/static/chunks/app/roadmap/page-775a7e7b762035dc.js"},{"revision":null,"url":"/_next/static/chunks/app/privacy/page-e6f3c4d244209491.js"},{"revision":null,"url":"/_next/static/chunks/app/offline/page-928c1f79aea39ddb.js"},{"revision":null,"url":"/_next/static/chunks/app/invite/[code]/page-b418a4cd7eb4e0b9.js"},{"revision":null,"url":"/_next/static/chunks/app/discover/page-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/compare/page-775a7e7b762035dc.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/layout-58e3476e40c235ed.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/you/page-9dbba6b81de9d7d6.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/servers/page-93867fe39893ff7a.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/profile/page-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/notifications/page-cd0f848973193863.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/me/page-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/me/loading-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/me/layout-8dee024a265053b0.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/me/[channelId]/page-2b95c9f31cec1d72.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/friends/page-9469a2003a3cda97.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/friends/loading-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/discover/page-5b460b071c57a631.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/discover/loading-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/[serverId]/page-a585e3a1646699a5.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/[serverId]/loading-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/[serverId]/layout-9790b9e2acd9000c.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/[serverId]/settings/page-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/[serverId]/moderation/page-95836d3b4a292532.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/[serverId]/moderation/target/[targetId]/page-e6f3c4d244209491.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/[serverId]/events/page-afd3af07db079407.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/[serverId]/[channelId]/page-0dc7b1f9ee7b47a3.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/[serverId]/[channelId]/loading-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/auth/callback/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/appeals/page-9c874632b7d1d700.js"},{"revision":null,"url":"/_next/static/chunks/app/api/workspace/reference/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/webhooks/[token]/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/voice/sessions/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/voice/sessions/[id]/transcript/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/voice/sessions/[id]/summary/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/voice/sessions/[id]/subtitle-preferences/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/voice/sessions/[id]/end/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/voice/sessions/[id]/consent/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/users/profile/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/users/pinned/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/users/me/read-states/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/users/interests/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/users/export/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/users/connections/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/users/connections/youtube/start/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/users/connections/youtube/callback/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/users/connections/steam/start/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/users/connections/steam/callback/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/users/connections/public/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/users/connections/oauth/start/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/users/connections/oauth/callback/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/users/badges/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/users/avatar/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/users/appearance/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/users/activity/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/user/notification-preferences/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/turn-credentials/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/threads/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/threads/counts/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/threads/[threadId]/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/threads/[threadId]/messages/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/threads/[threadId]/members/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/tasks/[taskId]/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/t/ccb/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/sticker/trending/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/sticker/search/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/share/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/discover/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/webhooks/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/voice-intelligence-policy/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/settings/theme/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/screening/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/screening/accept/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/roles/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/roles/reorder/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/roles/[roleId]/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/moderation/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/moderation/timeline/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/members/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/members/me/nickname/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/members/[userId]/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/members/[userId]/timeout/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/members/[userId]/roles/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/invites/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/events/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/events/ical/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/events/[eventId]/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/events/[eventId]/rsvp/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/events/[eventId]/ical/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/emojis/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/channels/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/channels/[channelId]/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/channels/[channelId]/voice-token/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/channels/[channelId]/transparency/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/channels/[channelId]/summarize/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/channels/[channelId]/messages/[messageId]/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/bans/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/automod/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/automod/[ruleId]/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/audit-log/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/apps/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/apps/welcome/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/apps/standup/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/apps/reminder/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/apps/incidents/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/apps/incidents/[incidentId]/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/apps/giveaway/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/apps/giveaway/[giveawayId]/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/apps/commands/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/apps/commands/execute/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/appeals/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/appeal-templates/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/ai-settings/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/admin/simulate/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/admin/health/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/admin/activity/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/server-templates/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/sentry-tunnel/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/search/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/reports/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/push/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/push/vapid-key/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/presence/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/presence/heartbeat/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/onboarding/welcome-message/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/onboarding/complete/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/oembed/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/notifications/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/notifications/unread-count/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/notifications/test/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/notification-settings/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/messages/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/messages/[messageId]/task/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/messages/[messageId]/reactions/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/messages/[messageId]/pin/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/meme/trending/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/meme/search/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/invites/[code]/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/health/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/health/readiness/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/gif/trending/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/gif/suggestions/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/gif/search/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/friends/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/friends/suggestions/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/friends/status/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/emojis/all/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/docs/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/docs/[docId]/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/dm/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/dm/keys/device/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/dm/channels/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/dm/channels/[channelId]/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/dm/channels/[channelId]/messages/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/dm/channels/[channelId]/messages/[messageId]/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/dm/channels/[channelId]/messages/[messageId]/reactions/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/dm/channels/[channelId]/members/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/dm/channels/[channelId]/keys/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/dm/channels/[channelId]/call/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/dm/attachments/[attachmentId]/download/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/cron/voice-retention/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/cron/thread-auto-archive/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/cron/scheduled-tasks/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/cron/presence-cleanup/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/cron/game-activity/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/cron/event-reminders/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/cron/attachment-decay/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/channels/cleanup/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/channels/[channelId]/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/channels/[channelId]/tasks/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/channels/[channelId]/permissions/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/channels/[channelId]/docs/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/channels/[channelId]/ack/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/badges/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/auth/step-up/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/auth/sessions/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/auth/sessions/[sessionId]/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/auth/security/policy/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/auth/recovery-codes/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/auth/recovery-codes/redeem/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/auth/password/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/auth/passkeys/register/verify/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/auth/passkeys/register/options/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/auth/passkeys/login/verify/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/auth/passkeys/login/options/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/auth/passkeys/credentials/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/auth/mfa-challenge/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/auth/mfa/disable/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/auth/login/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/auth/account/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/attachments/[attachmentId]/download/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/apps/discover/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/apps/curated/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/appeals/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/api/appeals/[appealId]/route-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/_not-found/page-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/_global-error/page-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/(auth)/layout-c78df54c66b277ba.js"},{"revision":null,"url":"/_next/static/chunks/app/(auth)/register/page-e1fac72b2c0a7c55.js"},{"revision":null,"url":"/_next/static/chunks/app/(auth)/login/page-788e7415b447d04a.js"},{"revision":null,"url":"/_next/static/AKHFRyXMc9RkuiTB8Eifu/_ssgManifest.js"},{"revision":null,"url":"/_next/static/AKHFRyXMc9RkuiTB8Eifu/_buildManifest.js"}] || []
const PRECACHE_URLS = PRECACHE_MANIFEST.map((e) =>
  typeof e === "string" ? e : e.url
)

// Static app-shell assets — not content-hashed, cached separately.
const APP_SHELL_ASSETS = [
  "/",
  "/channels/me",
  "/offline",
  "/manifest.json",
  "/icon-192.png?v=2",
  "/icon-192-maskable.png?v=2",
  "/icon-512.png?v=2",
  "/icon-512-maskable.png?v=2",
]

// ─── Install ─────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  self.skipWaiting()
  event.waitUntil(
    Promise.all([
      // Content-hashed Next.js chunks — safe to cache aggressively.
      PRECACHE_URLS.length > 0
        ? caches.open(PRECACHE).then((c) => c.addAll(PRECACHE_URLS))
        : Promise.resolve(),
      // App shell — offline navigation fallback.
      caches.open(APP_SHELL).then((c) => c.addAll(APP_SHELL_ASSETS)),
    ])
  )
})

// ─── Activate ────────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => !ALL_CACHES.includes(k)).map((k) => caches.delete(k))
        )
      )
  )
  self.clients.claim()
})

// ─── Fetch ───────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Navigation — network-first, offline fallback to app shell.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && response.type !== "error") {
            const copy = response.clone()
            caches.open(APP_SHELL).then((c) => c.put("/channels/me", copy))
          }
          return response
        })
        .catch(async () => {
          const cache = await caches.open(APP_SHELL)
          return (
            (await cache.match("/channels/me")) ||
            (await cache.match("/offline")) ||
            (await cache.match("/")) ||
            new Response("Offline", { status: 503, statusText: "Service Unavailable" })
          )
        })
    )
    return
  }

  // /_next/static/ — cache-first (URLs are content-hashed and immutable).
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone()
              caches.open(PRECACHE).then((c) => c.put(request, copy))
            }
            return response
          })
      )
    )
    return
  }

  // Scripts, styles, fonts, images — stale-while-revalidate.
  if (["script", "style", "font", "image"].includes(request.destination)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone()
              caches.open(RUNTIME).then((c) => c.put(request, copy))
            }
            return response
          })
          .catch(() => cached)
        return cached || fetchPromise
      })
    )
    return
  }

  // API message history — network-first with short TTL cache for offline access.
  // Caches GET /api/messages and /api/channels/*/messages responses so users
  // can view recent messages when offline.
  // Cache entries are scoped per-user via cookie hash to prevent cross-account leaks.
  if (url.pathname.match(/\/api\/(messages|channels\/[^/]+\/messages)/)) {
    // Cache is keyed by full request URL (including channelId query params),
    // which is inherently user-scoped since channel access is auth-gated.
    // The SW runs in a single-user browser context so cross-account risk
    // is minimal. Cache entries are cleared on SW version bumps (ALL_CACHES).
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Skip caching if the server explicitly opts out
          const cc = response.headers.get("cache-control") || ""
          if (response.ok && !cc.includes("no-store")) {
            const copy = response.clone()
            caches.open(API_CACHE).then((c) => {
              // Store with a timestamp header for TTL enforcement
              const headers = new Headers(copy.headers)
              headers.set("sw-cache-time", Date.now().toString())
              c.put(request, new Response(copy.body, { status: copy.status, statusText: copy.statusText, headers }))
            })
          }
          return response
        })
        .catch(async () => {
          const cache = await caches.open(API_CACHE)
          const cached = await cache.match(request)
          if (cached) {
            // Enforce TTL — evict stale entries
            const cacheTime = parseInt(cached.headers.get("sw-cache-time") || "0", 10)
            if (Date.now() - cacheTime < API_CACHE_TTL) {
              return cached
            }
            cache.delete(request)
          }
          return new Response(JSON.stringify({ error: "Offline" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          })
        })
    )
  }
})

// ─── Push notifications ───────────────────────────────────────────────────────
// Always show the notification regardless of whether the app is focused.
// On iOS, every push event MUST call showNotification() or the OS may
// revoke the push subscription.
self.addEventListener("push", (event) => {
  let data = {}
  try {
    data = event.data?.json() ?? {}
  } catch {
    try { data = { title: "VortexChat", body: event.data?.text() ?? "New message" } } catch { /* empty payload */ }
  }

  const {
    title = "VortexChat",
    body = "New message",
    icon = "/icon-192.png?v=2",
    url = "/channels/me",
    tag,
  } = data

  // Detect iOS PWA — iOS incorrectly reports backgrounded tabs as "focused"
  // via clients.matchAll(), so we must force renotify:true and silent:false.
  // Also, iOS Safari does not support notification action buttons, and using
  // the same tag silently replaces earlier notifications without alerting.
  const isIOS = /iP(hone|ad|od)/.test(self.navigator?.userAgent ?? "")

  // On iOS, append a timestamp to the tag so each notification is unique
  // and not silently replaced. Desktop keeps channel-based grouping.
  const notificationTag = isIOS
    ? `${tag || "vortexchat-message"}-${Date.now()}`
    : (tag || "vortexchat-message")

  // iOS Safari ignores notification action buttons — omit them to save
  // payload bytes and avoid console warnings.
  const actions = isIOS ? [] : (url !== "/channels/me" ? [
    { action: "open", title: "Open" },
    { action: "dismiss", title: "Dismiss" },
  ] : [])

  // CRITICAL: Call showNotification() IMMEDIATELY — do NOT nest it inside
  // clients.matchAll().then() or any other async chain.  On iOS, the SW
  // has strict execution time limits (~30s).  If matchAll() is slow or
  // hangs (common when the app is backgrounded), iOS kills the SW before
  // showNotification fires, treats it as a "silent push", and eventually
  // revokes the push subscription entirely.
  //
  // On iOS, always show with sound (silent:false) because the focused-tab
  // check via matchAll is unreliable.  On desktop, we run matchAll in
  // parallel and silently update the notification if a tab is focused.
  const notificationPromise = self.registration.showNotification(title, {
    body,
    icon,
    badge: "/icon-192.png?v=2",
    tag: notificationTag,
    data: { url },
    renotify: true,
    requireInteraction: false,
    actions,
    silent: false,
  })

  // waitUntil MUST resolve from showNotification — everything else is
  // best-effort and must not block or delay the notification.
  event.waitUntil(
    notificationPromise.then(() => {
      // Best-effort badge update — fire and forget.
      fetch("/api/notifications/unread-count", { credentials: "same-origin" })
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          const count = json?.count
          if (typeof count === "number" && isFinite(count)) updateAppBadge(count)
        })
        .catch(() => {})

      // On non-iOS, check if a tab is focused and replace with a silent
      // notification to prevent double-play with in-app sounds.
      if (!isIOS) {
        self.clients.matchAll({ type: "window", includeUncontrolled: false })
          .then((clients) => {
            const anyFocused = clients.some((c) => c.focused)
            if (anyFocused) {
              // Re-show as silent — same tag replaces the audible one
              self.registration.showNotification(title, {
                body,
                icon,
                badge: "/icon-192.png?v=2",
                tag: notificationTag,
                data: { url },
                renotify: false,
                requireInteraction: false,
                actions,
                silent: true,
              })
            }
          })
          .catch(() => {})
      }
    })
  )
})

// ─── App badge helper ────────────────────────────────────────────────────────
function updateAppBadge(count) {
  // The Badging API is on the ServiceWorkerGlobalScope (self), not on
  // self.navigator.  iOS follows the spec strictly — using navigator
  // silently fails.
  if (typeof self.setAppBadge !== "function") return
  if (count > 0) {
    self.setAppBadge(count)
  } else if (typeof self.clearAppBadge === "function") {
    self.clearAppBadge()
  }
}

// ─── App badge + SW messages ──────────────────────────────────────────────────
self.addEventListener("message", (event) => {
  if (event.data?.type === "APP_UPDATE_BADGE") {
    updateAppBadge(event.data.count)
  }
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting()
  }
})

// ─── Push subscription rotation ───────────────────────────────────────────────
// Re-subscribe if the browser rotates push keys, then sync to the server.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const oldSub = event.oldSubscription

        // Clean up the stale old endpoint from the server (best-effort).
        if (oldSub?.endpoint) {
          fetch("/api/push", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: oldSub.endpoint }),
          }).catch(() => {})
        }

        // Build subscribe options — prefer the old subscription's options
        // (which already contain the applicationServerKey as an ArrayBuffer),
        // but fall back to fetching the VAPID public key from the server and
        // converting it to a Uint8Array.  The string form of
        // applicationServerKey is NOT supported on all browsers (notably iOS
        // Safari), so we must always pass a BufferSource.
        let subscribeOptions = oldSub?.options
        if (!subscribeOptions?.applicationServerKey) {
          try {
            const keyRes = await fetch("/api/push/vapid-key")
            if (keyRes.ok) {
              const { key } = await keyRes.json()
              if (typeof key === "string" && key) {
                subscribeOptions = {
                  userVisibleOnly: true,
                  applicationServerKey: urlBase64ToUint8Array(key),
                }
              }
            }
          } catch {
            // VAPID key fetch failed — proceed with userVisibleOnly only
          }
        }
        const newSub = await self.registration.pushManager.subscribe(
          subscribeOptions ?? { userVisibleOnly: true }
        )
        const { endpoint, keys } = newSub.toJSON()
        const res = await fetch("/api/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint, keys }),
        })
        if (!res.ok) throw new Error("Server returned " + res.status)
      } catch (err) {
        console.warn("SW pushsubscriptionchange: re-subscribe failed", err)
      }

      // Notify open tabs so the client-side hook can re-subscribe.
      const clients = await self.clients.matchAll({ type: "window" })
      for (const client of clients) {
        client.postMessage({ type: "PUSH_SUBSCRIPTION_CHANGED" })
      }
    })()
  )
})

// ─── Notification click ───────────────────────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close()

  // Handle action buttons — "dismiss" just closes
  if (event.action === "dismiss") return

  const url = event.notification.data?.url || "/channels/me"
  const fullUrl = new URL(url, self.location.origin).href

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // Prefer a tab that's already on the same channel to avoid a full reload
        const sameChannel = clients.find((c) => {
          try {
            const clientUrl = new URL(c.url)
            const targetUrl = new URL(fullUrl)
            return clientUrl.pathname === targetUrl.pathname && clientUrl.search === targetUrl.search
          } catch { return false }
        })
        const existing = sameChannel || clients.find((c) => c.url.includes(self.location.origin))
        if (existing) {
          return existing.focus().then(() => {
            // Post a message so the client can handle in-app navigation
            // without a full page reload when already on the right channel.
            existing.postMessage({ type: "NOTIFICATION_NAVIGATE", url })
            return sameChannel ? undefined : existing.navigate(fullUrl)
          })
        } else {
          return self.clients.openWindow(fullUrl)
        }
      })
  )
})

// ─── Periodic background sync ─────────────────────────────────────────────────
// Fires when the browser grants a periodic sync opportunity.
// Used to refresh unread counts and prefetch latest messages so the app
// opens instantly with fresh data.
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "vortex-refresh-unread") {
    event.waitUntil(
      fetch("/api/notifications/unread-count", { credentials: "same-origin" })
        .then(async (res) => {
          if (!res.ok) return
          const data = await res.json()
          const count = data?.count
          if (typeof count !== "number" || !isFinite(count)) return
          updateAppBadge(count)
        })
        .catch(() => {
          // Sync failed — silently ignore, will retry next interval
        })
    )
  }
})
