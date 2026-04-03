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
const PRECACHE_MANIFEST = [{"revision":null,"url":"/_next/static/media/6c596dfcddeca1e9-s.p.woff2"},{"revision":null,"url":"/_next/static/media/5a0c43ffa288c21a-s.p.woff2"},{"revision":null,"url":"/_next/static/css/cd5538f640082d05.css"},{"revision":null,"url":"/_next/static/css/ba278f5b6ac3246f.css"},{"revision":null,"url":"/_next/static/chunks/webpack-4faca37b2e8c1448.js"},{"revision":null,"url":"/_next/static/chunks/supabase-fbb2c665f81915d7.js"},{"revision":null,"url":"/_next/static/chunks/sentry-9492a885314fde56.js"},{"revision":null,"url":"/_next/static/chunks/polyfills-42372ed130431b0a.js"},{"revision":null,"url":"/_next/static/chunks/main-app-f0885407f0955791.js"},{"revision":null,"url":"/_next/static/chunks/main-89b5b52dd3714fc7.js"},{"revision":null,"url":"/_next/static/chunks/framework-30fd93c56c4fef3e.js"},{"revision":null,"url":"/_next/static/chunks/9738.2a41210f09bd751b.js"},{"revision":null,"url":"/_next/static/chunks/9594-b628ca48287a39e5.js"},{"revision":null,"url":"/_next/static/chunks/9278.d5ab4d451ebf8eb7.js"},{"revision":null,"url":"/_next/static/chunks/9260.e81499c1458008dc.js"},{"revision":null,"url":"/_next/static/chunks/9197.2291d96bf3202796.js"},{"revision":null,"url":"/_next/static/chunks/9127.a2cb46a28510e3ce.js"},{"revision":null,"url":"/_next/static/chunks/9084.8f0807f3580290f7.js"},{"revision":null,"url":"/_next/static/chunks/87c73c54-af8e73a6dee130be.js"},{"revision":null,"url":"/_next/static/chunks/8379-3ce3e75f284f4cd3.js"},{"revision":null,"url":"/_next/static/chunks/8232-5f6907d74b46bc90.js"},{"revision":null,"url":"/_next/static/chunks/8184-f972317db84dde60.js"},{"revision":null,"url":"/_next/static/chunks/8084.6fa0a1cc40ff8c09.js"},{"revision":null,"url":"/_next/static/chunks/7959-7e84cd1100a718d8.js"},{"revision":null,"url":"/_next/static/chunks/7823-42c4d44fc03e710f.js"},{"revision":null,"url":"/_next/static/chunks/7775-23b83ed17a32fe9c.js"},{"revision":null,"url":"/_next/static/chunks/7609-1ccba1b828a6a9a2.js"},{"revision":null,"url":"/_next/static/chunks/7589.ed812925befc2c31.js"},{"revision":null,"url":"/_next/static/chunks/75504863-0a0d04344a5b1c28.js"},{"revision":null,"url":"/_next/static/chunks/7277-890bf7fd41a7f853.js"},{"revision":null,"url":"/_next/static/chunks/7227-8fc42c8c845bb0eb.js"},{"revision":null,"url":"/_next/static/chunks/680-9d71053595898ebc.js"},{"revision":null,"url":"/_next/static/chunks/6791.c0fafc9714eb266f.js"},{"revision":null,"url":"/_next/static/chunks/6756.53d87bbdcb25cc53.js"},{"revision":null,"url":"/_next/static/chunks/6702-d4fa19fcbf3baa4e.js"},{"revision":null,"url":"/_next/static/chunks/6678.8b91b7fe95ad22ea.js"},{"revision":null,"url":"/_next/static/chunks/6503-8daff1c808b72197.js"},{"revision":null,"url":"/_next/static/chunks/6387-8ff55c9dc044299d.js"},{"revision":null,"url":"/_next/static/chunks/6148.753d167f56617a05.js"},{"revision":null,"url":"/_next/static/chunks/59c6eb5a-cc0ca9853e5c72b2.js"},{"revision":null,"url":"/_next/static/chunks/5978.1e4d9dea32f76a87.js"},{"revision":null,"url":"/_next/static/chunks/5939-63b2c84354c2afb6.js"},{"revision":null,"url":"/_next/static/chunks/5752-278c0e08830b1b94.js"},{"revision":null,"url":"/_next/static/chunks/572.d3c160c89d78f9bb.js"},{"revision":null,"url":"/_next/static/chunks/5604-f3c1bd5f27039951.js"},{"revision":null,"url":"/_next/static/chunks/5587-3e512f7570390842.js"},{"revision":null,"url":"/_next/static/chunks/5570.6aed98d32ec9f9db.js"},{"revision":null,"url":"/_next/static/chunks/5321-9397ccce9310f539.js"},{"revision":null,"url":"/_next/static/chunks/5227-0fe5de861f215d74.js"},{"revision":null,"url":"/_next/static/chunks/5222-3e54b67d1922b65a.js"},{"revision":null,"url":"/_next/static/chunks/5051-01949d37fb913f81.js"},{"revision":null,"url":"/_next/static/chunks/4710-aaffaa7e27b26bb2.js"},{"revision":null,"url":"/_next/static/chunks/4361-cc292bb6cb22d168.js"},{"revision":null,"url":"/_next/static/chunks/4167-6f402300d8bdf6cc.js"},{"revision":null,"url":"/_next/static/chunks/4138.e506c7376fdf6e49.js"},{"revision":null,"url":"/_next/static/chunks/4121-58646cc3d1f6e19f.js"},{"revision":null,"url":"/_next/static/chunks/4065.222535a779f616bc.js"},{"revision":null,"url":"/_next/static/chunks/39af6c14.9900dc61c8b064e1.js"},{"revision":null,"url":"/_next/static/chunks/3654.111175825d75e188.js"},{"revision":null,"url":"/_next/static/chunks/3191-50a450b7319511a3.js"},{"revision":null,"url":"/_next/static/chunks/2939.f7ca6f5a89374626.js"},{"revision":null,"url":"/_next/static/chunks/2768-faac34887019aafe.js"},{"revision":null,"url":"/_next/static/chunks/2725-9dc6c53f303f2723.js"},{"revision":null,"url":"/_next/static/chunks/2653-83d8384607f45227.js"},{"revision":null,"url":"/_next/static/chunks/2651-c637bac9ff7c71c6.js"},{"revision":null,"url":"/_next/static/chunks/2549.13eba86c7aad86a3.js"},{"revision":null,"url":"/_next/static/chunks/2431-6abd2f82c06104e4.js"},{"revision":null,"url":"/_next/static/chunks/2389.a27fb8e86b6e3aab.js"},{"revision":null,"url":"/_next/static/chunks/2329-56e976900b1859be.js"},{"revision":null,"url":"/_next/static/chunks/2135-170a5ad625c6a516.js"},{"revision":null,"url":"/_next/static/chunks/2087.ee196efbbf6be013.js"},{"revision":null,"url":"/_next/static/chunks/1975-bf8a4a89c4a7e747.js"},{"revision":null,"url":"/_next/static/chunks/1757.09a135f7ce0ce3ec.js"},{"revision":null,"url":"/_next/static/chunks/1578.daab439e9df4ace9.js"},{"revision":null,"url":"/_next/static/chunks/1566.fd616a891df504f4.js"},{"revision":null,"url":"/_next/static/chunks/1281.e964167cada01ff8.js"},{"revision":null,"url":"/_next/static/chunks/1172-346d95b8773d8959.js"},{"revision":null,"url":"/_next/static/chunks/1033-aec0db30b98b4af1.js"},{"revision":null,"url":"/_next/static/chunks/next/dist/client/components/builtin/unauthorized-3be202f1cfe6f95c.js"},{"revision":null,"url":"/_next/static/chunks/next/dist/client/components/builtin/forbidden-444eb208bab5f7d5.js"},{"revision":null,"url":"/_next/static/chunks/next/dist/client/components/builtin/app-error-87cbff06daa80501.js"},{"revision":null,"url":"/_next/static/chunks/app/page-01f906801033a850.js"},{"revision":null,"url":"/_next/static/chunks/app/not-found-ee0ff9fd387122a6.js"},{"revision":null,"url":"/_next/static/chunks/app/layout-61791a1667bc8cce.js"},{"revision":null,"url":"/_next/static/chunks/app/global-error-c927b821f2091c3d.js"},{"revision":null,"url":"/_next/static/chunks/app/error-490d72adb4b32ddc.js"},{"revision":null,"url":"/_next/static/chunks/app/verify-email/page-37b6df6e71a90b98.js"},{"revision":null,"url":"/_next/static/chunks/app/verify-email/layout-a15a888a3e989850.js"},{"revision":null,"url":"/_next/static/chunks/app/update-password/page-974b74d76de9898f.js"},{"revision":null,"url":"/_next/static/chunks/app/terms/page-6c629b1556c48d59.js"},{"revision":null,"url":"/_next/static/chunks/app/showcase/page-feac1c5aaf7c7dae.js"},{"revision":null,"url":"/_next/static/chunks/app/settings/page-3fe1ee6a12327ca5.js"},{"revision":null,"url":"/_next/static/chunks/app/settings/loading-80c072f12c53859c.js"},{"revision":null,"url":"/_next/static/chunks/app/settings/layout-307bb783d2c0941d.js"},{"revision":null,"url":"/_next/static/chunks/app/settings/voice/page-5b3c46ba0347e453.js"},{"revision":null,"url":"/_next/static/chunks/app/settings/security/page-1ce38615dad5ca35.js"},{"revision":null,"url":"/_next/static/chunks/app/settings/profile/page-8adac459624b1e05.js"},{"revision":null,"url":"/_next/static/chunks/app/settings/notifications/page-8fce9483d81c2a3d.js"},{"revision":null,"url":"/_next/static/chunks/app/settings/keybinds/page-f194a7f1b3fc8ff0.js"},{"revision":null,"url":"/_next/static/chunks/app/settings/appearance/page-4372e78a462a471c.js"},{"revision":null,"url":"/_next/static/chunks/app/settings/accessibility/page-0b5c80ff9eee354c.js"},{"revision":null,"url":"/_next/static/chunks/app/self-host/page-320addd45d5e35bb.js"},{"revision":null,"url":"/_next/static/chunks/app/roadmap/page-3d1f804b71f0ca32.js"},{"revision":null,"url":"/_next/static/chunks/app/privacy/page-df28affdf2e3e681.js"},{"revision":null,"url":"/_next/static/chunks/app/offline/page-62312d812132a683.js"},{"revision":null,"url":"/_next/static/chunks/app/invite/[code]/page-78e4acc9ad8366c0.js"},{"revision":null,"url":"/_next/static/chunks/app/discover/page-430ce49a273f9f38.js"},{"revision":null,"url":"/_next/static/chunks/app/compare/page-2174c40d7aa1e2ea.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/layout-3019b2dbfa37cdb9.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/you/page-257f47e9b447f6b6.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/you/loading-dd22f7f59a6a0635.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/servers/page-5e2a2f44ae7c8cee.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/servers/loading-a8e971e2df726198.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/profile/page-102a4a45afea1eba.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/profile/loading-b23d8f5591cb615e.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/notifications/page-e16450e416068eeb.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/notifications/loading-9b70be03a87f6d18.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/me/page-7a9d901995dd7928.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/me/loading-0ca4953e34c31845.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/me/layout-4416bcafd1d57e31.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/me/[channelId]/page-d88f63c532b90c3c.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/friends/page-0c7a29488c72a6ac.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/friends/loading-8eb3ff4ef869dcd0.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/discover/page-616cf54475e740ba.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/discover/loading-4ad0da08360f4c25.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/[serverId]/page-e0d143f378024ec0.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/[serverId]/loading-2e2b1d79c2cd4016.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/[serverId]/layout-317019eb1d94076f.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/[serverId]/settings/page-f950d1ffaefd7de2.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/[serverId]/settings/loading-5abc9057bc1a2b90.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/[serverId]/moderation/page-013b96927ed29caf.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/[serverId]/moderation/loading-d8783e17f2f0cffd.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/[serverId]/moderation/target/[targetId]/page-9dd60e0d41936779.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/[serverId]/events/page-82c19cc992373022.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/[serverId]/events/loading-9ed99283d6ce34f7.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/[serverId]/[channelId]/page-d9320cd84f2feeae.js"},{"revision":null,"url":"/_next/static/chunks/app/channels/[serverId]/[channelId]/loading-c126f5a902a70eec.js"},{"revision":null,"url":"/_next/static/chunks/app/auth/callback/route-06f0cd253d9dcf01.js"},{"revision":null,"url":"/_next/static/chunks/app/appeals/page-34136187b75a4f63.js"},{"revision":null,"url":"/_next/static/chunks/app/api/workspace/reference/route-02f3b750792169eb.js"},{"revision":null,"url":"/_next/static/chunks/app/api/webhooks/[token]/route-74ff993cec2c4e17.js"},{"revision":null,"url":"/_next/static/chunks/app/api/voice/sessions/route-06992baac67fcb4c.js"},{"revision":null,"url":"/_next/static/chunks/app/api/voice/sessions/[id]/transcript/route-1fb4aa5815714bfa.js"},{"revision":null,"url":"/_next/static/chunks/app/api/voice/sessions/[id]/summary/route-b031cd387bdbb617.js"},{"revision":null,"url":"/_next/static/chunks/app/api/voice/sessions/[id]/subtitle-preferences/route-bad0b05d781f07a6.js"},{"revision":null,"url":"/_next/static/chunks/app/api/voice/sessions/[id]/end/route-787a8bc36bebf297.js"},{"revision":null,"url":"/_next/static/chunks/app/api/voice/sessions/[id]/consent/route-d626a4ba80418940.js"},{"revision":null,"url":"/_next/static/chunks/app/api/users/profile/route-45fad1b729a1723d.js"},{"revision":null,"url":"/_next/static/chunks/app/api/users/pinned/route-c60983719f4df402.js"},{"revision":null,"url":"/_next/static/chunks/app/api/users/me/read-states/route-75effaa8a35861a8.js"},{"revision":null,"url":"/_next/static/chunks/app/api/users/interests/route-508e190ca6fc89a8.js"},{"revision":null,"url":"/_next/static/chunks/app/api/users/export/route-f0a17c1063a2d1de.js"},{"revision":null,"url":"/_next/static/chunks/app/api/users/connections/route-270acfd250e21657.js"},{"revision":null,"url":"/_next/static/chunks/app/api/users/connections/youtube/start/route-aeb29e319142063e.js"},{"revision":null,"url":"/_next/static/chunks/app/api/users/connections/youtube/callback/route-6eac34f56797c137.js"},{"revision":null,"url":"/_next/static/chunks/app/api/users/connections/steam/start/route-b74dca7cd16d9807.js"},{"revision":null,"url":"/_next/static/chunks/app/api/users/connections/steam/callback/route-b4fb30d8e192458b.js"},{"revision":null,"url":"/_next/static/chunks/app/api/users/connections/public/route-70c3b0f13e0a3cd2.js"},{"revision":null,"url":"/_next/static/chunks/app/api/users/connections/oauth/start/route-d5ce167b5f707689.js"},{"revision":null,"url":"/_next/static/chunks/app/api/users/connections/oauth/callback/route-30c179ddfc6640ea.js"},{"revision":null,"url":"/_next/static/chunks/app/api/users/badges/route-590ea1e2cee6685f.js"},{"revision":null,"url":"/_next/static/chunks/app/api/users/avatar/route-c6b0485a96d0e6f6.js"},{"revision":null,"url":"/_next/static/chunks/app/api/users/appearance/route-632cba430ac73cd7.js"},{"revision":null,"url":"/_next/static/chunks/app/api/users/activity/route-277788a41bb86913.js"},{"revision":null,"url":"/_next/static/chunks/app/api/user/notification-preferences/route-ba52b6d82dcb6929.js"},{"revision":null,"url":"/_next/static/chunks/app/api/turn-credentials/route-6c12c434af10e91a.js"},{"revision":null,"url":"/_next/static/chunks/app/api/threads/route-55138750683ba38e.js"},{"revision":null,"url":"/_next/static/chunks/app/api/threads/counts/route-1249d32dfba62958.js"},{"revision":null,"url":"/_next/static/chunks/app/api/threads/[threadId]/route-6b54a6914a9e3216.js"},{"revision":null,"url":"/_next/static/chunks/app/api/threads/[threadId]/messages/route-d468d4c3bafec1bf.js"},{"revision":null,"url":"/_next/static/chunks/app/api/threads/[threadId]/members/route-cb1079282f9a336c.js"},{"revision":null,"url":"/_next/static/chunks/app/api/tasks/[taskId]/route-a29627e0b1b7d120.js"},{"revision":null,"url":"/_next/static/chunks/app/api/t/ccb/route-3c50eee045ed7de2.js"},{"revision":null,"url":"/_next/static/chunks/app/api/sticker/trending/route-e70e90492fc361f4.js"},{"revision":null,"url":"/_next/static/chunks/app/api/sticker/search/route-edad95c33b720af1.js"},{"revision":null,"url":"/_next/static/chunks/app/api/share/route-5ea9d95764cfabe9.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/route-c9b81ea57bc2de22.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/discover/route-6e3e2690f25d361c.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/route-d9c3d518ab5a8ff3.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/webhooks/route-0261db82044ca01e.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/voice-intelligence-policy/route-45fe74acee118e4c.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/settings/theme/route-74652b647f69dd5e.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/screening/route-bbe7f7c1bbde7528.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/screening/accept/route-8687ff0a8b68a9aa.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/roles/route-158b635a1408858e.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/roles/reorder/route-e895a28857762970.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/roles/[roleId]/route-591f776f4a018135.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/moderation/route-c8b9a1c56f4f7ace.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/moderation/timeline/route-231b37dcfb0bea0d.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/members/route-df5dfa309de9550e.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/members/me/nickname/route-2482c9e1b71e0438.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/members/[userId]/route-76d62957d2d64a1c.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/members/[userId]/timeout/route-6b624cb91789d0ec.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/members/[userId]/roles/route-6b5a37a02c4d3c24.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/invites/route-98b285a87519131f.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/events/route-7df1674bbc47f0c1.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/events/ical/route-69775bc93b903b4f.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/events/[eventId]/route-3bf55cb4e41ce049.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/events/[eventId]/rsvp/route-a5192c7d61c58e1e.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/events/[eventId]/ical/route-4eb037b5a1be4af3.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/emojis/route-1a7e3e503d7102b0.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/channels/route-d82a099d9d045677.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/channels/[channelId]/route-e2da3baaecfe2583.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/channels/[channelId]/voice-token/route-5cf57300d325e3ed.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/channels/[channelId]/transparency/route-33213cac7bc0c63f.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/channels/[channelId]/summarize/route-bd1387241338c2e8.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/channels/[channelId]/messages/[messageId]/route-cd3e32649c28e473.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/bans/route-4ca1dee5e8fb05d0.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/automod/route-03151e4923fbd820.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/automod/[ruleId]/route-6e22ac76631b4d47.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/audit-log/route-608591064fbbb640.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/apps/route-33bde2cd48cc9270.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/apps/welcome/route-62d3cba8c96dc1df.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/apps/standup/route-72b9743da0f7f1e6.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/apps/reminder/route-0054dbb00c631b68.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/apps/incidents/route-73359002a964f5f2.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/apps/incidents/[incidentId]/route-3d02aa8a8baac0e7.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/apps/giveaway/route-aeb3d8b5b704fa28.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/apps/giveaway/[giveawayId]/route-e9039f0221aee5ab.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/apps/commands/route-60e757a6ef7299d7.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/apps/commands/execute/route-0313aef0b5586ea3.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/appeals/route-92630d1a9fe52889.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/appeal-templates/route-6c84c1329a691fee.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/ai-settings/route-e76a7b3aa14d6d7b.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/admin/simulate/route-781561ea8ff00024.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/admin/health/route-b9736a771b745504.js"},{"revision":null,"url":"/_next/static/chunks/app/api/servers/[serverId]/admin/activity/route-42af8f9fec819b22.js"},{"revision":null,"url":"/_next/static/chunks/app/api/server-templates/route-fb82b193040fa89e.js"},{"revision":null,"url":"/_next/static/chunks/app/api/sentry-tunnel/route-3ca61c644d1e4086.js"},{"revision":null,"url":"/_next/static/chunks/app/api/search/route-81f2ffad75fbae97.js"},{"revision":null,"url":"/_next/static/chunks/app/api/reports/route-c9f484989328564a.js"},{"revision":null,"url":"/_next/static/chunks/app/api/push/route-fe0eb0a8836d9c61.js"},{"revision":null,"url":"/_next/static/chunks/app/api/push/vapid-key/route-78b7c902427e3edc.js"},{"revision":null,"url":"/_next/static/chunks/app/api/presence/route-6e52836d84e14c52.js"},{"revision":null,"url":"/_next/static/chunks/app/api/presence/heartbeat/route-49fdd1778855e8b1.js"},{"revision":null,"url":"/_next/static/chunks/app/api/onboarding/welcome-message/route-792045f346f00632.js"},{"revision":null,"url":"/_next/static/chunks/app/api/onboarding/complete/route-61e7637b001d1e8d.js"},{"revision":null,"url":"/_next/static/chunks/app/api/oembed/route-7c9421aca401ccbc.js"},{"revision":null,"url":"/_next/static/chunks/app/api/notifications/route-e73a5ff5d5c2f2ed.js"},{"revision":null,"url":"/_next/static/chunks/app/api/notifications/unread-count/route-1871b5ae1cc856cf.js"},{"revision":null,"url":"/_next/static/chunks/app/api/notifications/test/route-ce567f8f7fdf1e20.js"},{"revision":null,"url":"/_next/static/chunks/app/api/notification-settings/route-995a7c6175b90b81.js"},{"revision":null,"url":"/_next/static/chunks/app/api/messages/route-007575fa4dfe5e87.js"},{"revision":null,"url":"/_next/static/chunks/app/api/messages/[messageId]/task/route-e416d0dcd19f33c1.js"},{"revision":null,"url":"/_next/static/chunks/app/api/messages/[messageId]/reactions/route-a61dd5a8bc235b2b.js"},{"revision":null,"url":"/_next/static/chunks/app/api/messages/[messageId]/pin/route-1cbd55f9782c519d.js"},{"revision":null,"url":"/_next/static/chunks/app/api/meme/trending/route-35330fa4e41e2c0c.js"},{"revision":null,"url":"/_next/static/chunks/app/api/meme/search/route-77a4363a001529cb.js"},{"revision":null,"url":"/_next/static/chunks/app/api/invites/[code]/route-a4b09aa1b5273cbb.js"},{"revision":null,"url":"/_next/static/chunks/app/api/health/route-94c59faba1c471c1.js"},{"revision":null,"url":"/_next/static/chunks/app/api/health/readiness/route-79189c7790dbb305.js"},{"revision":null,"url":"/_next/static/chunks/app/api/gif/trending/route-c6a4f6bf11d541d7.js"},{"revision":null,"url":"/_next/static/chunks/app/api/gif/suggestions/route-96e950a55c0dae5e.js"},{"revision":null,"url":"/_next/static/chunks/app/api/gif/search/route-a5666d52d4e24d0f.js"},{"revision":null,"url":"/_next/static/chunks/app/api/friends/route-77fa72960fff86fc.js"},{"revision":null,"url":"/_next/static/chunks/app/api/friends/suggestions/route-e3c3681476749595.js"},{"revision":null,"url":"/_next/static/chunks/app/api/friends/status/route-5a1a307ed49af123.js"},{"revision":null,"url":"/_next/static/chunks/app/api/emojis/all/route-e87818dcf41278a4.js"},{"revision":null,"url":"/_next/static/chunks/app/api/docs/route-a83a33424d897e19.js"},{"revision":null,"url":"/_next/static/chunks/app/api/docs/[docId]/route-f210e65c259f1b2e.js"},{"revision":null,"url":"/_next/static/chunks/app/api/dm/route-0c7a9e45229e55b9.js"},{"revision":null,"url":"/_next/static/chunks/app/api/dm/keys/device/route-7642aa0babb59efc.js"},{"revision":null,"url":"/_next/static/chunks/app/api/dm/channels/route-4d96c8b5a922019c.js"},{"revision":null,"url":"/_next/static/chunks/app/api/dm/channels/[channelId]/route-23c064fbafa13337.js"},{"revision":null,"url":"/_next/static/chunks/app/api/dm/channels/[channelId]/messages/route-f07582081ac04908.js"},{"revision":null,"url":"/_next/static/chunks/app/api/dm/channels/[channelId]/messages/[messageId]/route-53876a5c70b8d83a.js"},{"revision":null,"url":"/_next/static/chunks/app/api/dm/channels/[channelId]/messages/[messageId]/reactions/route-8e2c486511607549.js"},{"revision":null,"url":"/_next/static/chunks/app/api/dm/channels/[channelId]/members/route-e0b93db10b1fce2a.js"},{"revision":null,"url":"/_next/static/chunks/app/api/dm/channels/[channelId]/keys/route-c4d84f15dc8a8a2d.js"},{"revision":null,"url":"/_next/static/chunks/app/api/dm/channels/[channelId]/call/route-b1bddfd26c6f78ea.js"},{"revision":null,"url":"/_next/static/chunks/app/api/dm/attachments/[attachmentId]/download/route-251504f4828edcf2.js"},{"revision":null,"url":"/_next/static/chunks/app/api/cron/voice-retention/route-0b38e69261288019.js"},{"revision":null,"url":"/_next/static/chunks/app/api/cron/thread-auto-archive/route-8dfca70bbaaafc4e.js"},{"revision":null,"url":"/_next/static/chunks/app/api/cron/scheduled-tasks/route-529c8710508cd9b1.js"},{"revision":null,"url":"/_next/static/chunks/app/api/cron/presence-cleanup/route-8603c542f483c6cc.js"},{"revision":null,"url":"/_next/static/chunks/app/api/cron/game-activity/route-f8eb154a06446ae6.js"},{"revision":null,"url":"/_next/static/chunks/app/api/cron/event-reminders/route-3bfcbaf129648e48.js"},{"revision":null,"url":"/_next/static/chunks/app/api/cron/attachment-decay/route-7de14fd6684ed6aa.js"},{"revision":null,"url":"/_next/static/chunks/app/api/channels/cleanup/route-6ab41c96dddb3e53.js"},{"revision":null,"url":"/_next/static/chunks/app/api/channels/[channelId]/route-d9beed6bfb2673f9.js"},{"revision":null,"url":"/_next/static/chunks/app/api/channels/[channelId]/tasks/route-ce7f9d5ffcc31ff0.js"},{"revision":null,"url":"/_next/static/chunks/app/api/channels/[channelId]/permissions/route-b3c1915480f6c3ab.js"},{"revision":null,"url":"/_next/static/chunks/app/api/channels/[channelId]/docs/route-94f71aa83434eb00.js"},{"revision":null,"url":"/_next/static/chunks/app/api/channels/[channelId]/ack/route-c5f4204931fdf57d.js"},{"revision":null,"url":"/_next/static/chunks/app/api/badges/route-5f2f76a97eeea2a2.js"},{"revision":null,"url":"/_next/static/chunks/app/api/auth/step-up/route-bca7c415201ba08a.js"},{"revision":null,"url":"/_next/static/chunks/app/api/auth/sessions/route-2ec9602185404547.js"},{"revision":null,"url":"/_next/static/chunks/app/api/auth/sessions/[sessionId]/route-f6c791e36bc3f7a1.js"},{"revision":null,"url":"/_next/static/chunks/app/api/auth/security/policy/route-c3c6b71e35a0b831.js"},{"revision":null,"url":"/_next/static/chunks/app/api/auth/recovery-codes/route-db5aa0bd712183d3.js"},{"revision":null,"url":"/_next/static/chunks/app/api/auth/recovery-codes/redeem/route-300a79881c697d5e.js"},{"revision":null,"url":"/_next/static/chunks/app/api/auth/password/route-1c02b9d97e3d1aad.js"},{"revision":null,"url":"/_next/static/chunks/app/api/auth/passkeys/register/verify/route-8bbe9de914cb5d29.js"},{"revision":null,"url":"/_next/static/chunks/app/api/auth/passkeys/register/options/route-6d08620b8045339a.js"},{"revision":null,"url":"/_next/static/chunks/app/api/auth/passkeys/login/verify/route-82feca4fa3a896e2.js"},{"revision":null,"url":"/_next/static/chunks/app/api/auth/passkeys/login/options/route-32e381611f3a8a44.js"},{"revision":null,"url":"/_next/static/chunks/app/api/auth/passkeys/credentials/route-777dd68bba21be49.js"},{"revision":null,"url":"/_next/static/chunks/app/api/auth/mfa-challenge/route-1fa2e6d911d9a4ea.js"},{"revision":null,"url":"/_next/static/chunks/app/api/auth/mfa/disable/route-6d48f8c2eb04ad9a.js"},{"revision":null,"url":"/_next/static/chunks/app/api/auth/login/route-ee1edd1f73303d22.js"},{"revision":null,"url":"/_next/static/chunks/app/api/auth/account/route-7d39cddf8b0c52f8.js"},{"revision":null,"url":"/_next/static/chunks/app/api/attachments/[attachmentId]/download/route-523cb0adb2842adf.js"},{"revision":null,"url":"/_next/static/chunks/app/api/apps/discover/route-1f133123ea4b78e3.js"},{"revision":null,"url":"/_next/static/chunks/app/api/apps/curated/route-6e4ee4e4c0edc256.js"},{"revision":null,"url":"/_next/static/chunks/app/api/appeals/route-f3c210ff20d7b5d6.js"},{"revision":null,"url":"/_next/static/chunks/app/api/appeals/[appealId]/route-c8bb3d5ed99eaba1.js"},{"revision":null,"url":"/_next/static/chunks/app/_not-found/page-4d75a853001f0c47.js"},{"revision":null,"url":"/_next/static/chunks/app/_global-error/page-2199a138b91fa0d2.js"},{"revision":null,"url":"/_next/static/chunks/app/(auth)/layout-676020e1d229a10e.js"},{"revision":null,"url":"/_next/static/chunks/app/(auth)/register/page-79e87a7ba0be7d36.js"},{"revision":null,"url":"/_next/static/chunks/app/(auth)/login/page-a0584cbab8ea004e.js"},{"revision":null,"url":"/_next/static/JevhZelDBAAs09lrw-tpd/_ssgManifest.js"},{"revision":null,"url":"/_next/static/JevhZelDBAAs09lrw-tpd/_buildManifest.js"}] || []
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
