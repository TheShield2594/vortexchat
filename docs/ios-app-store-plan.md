# iOS App Store — Implementation Plan

> Plan for wrapping VortexChat in a native iOS shell via Capacitor and submitting to the App Store.
> Assumes: Apple Developer Program membership ($99/yr) is active.

---

## Architecture Decision: Hosted WebView via Capacitor

VortexChat is already a fully-featured PWA with offline support, push notifications, iOS splash screens, and mobile-optimized UI. Rather than rewriting in SwiftUI or React Native, we wrap the existing Vercel-hosted app in a native WKWebView shell using **Capacitor**.

**Why hosted (not bundled)?**
- Chat app needs live server connection anyway — no benefit to bundling static assets
- Deploy updates via Vercel instantly without App Store review cycles
- Supabase Realtime, Socket.IO, and LiveKit all work unchanged over HTTPS/WSS
- Bundled mode would require a new App Store release for every UI change

**Trade-off:** First load requires network. Acceptable for a chat app.

---

## Phase 1: Capacitor Setup & iOS Project Generation

### 1.1 Install Capacitor

```bash
# From monorepo root
cd apps/web
npm install @capacitor/core @capacitor/cli
npx cap init VortexChat com.vortexchat.app --web-dir=out
```

### 1.2 Configure `capacitor.config.ts`

```ts
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.vortexchat.app",
  appName: "VortexChat",
  // Hosted mode — load from Vercel
  server: {
    url: "https://vortexchat.com",       // Replace with actual production URL
    cleartext: false,                      // HTTPS only
    allowNavigation: [
      "*.supabase.co",                     // Supabase auth redirects
      "*.livekit.cloud",                   // LiveKit WebRTC
    ],
  },
  ios: {
    scheme: "VortexChat",
    contentInset: "automatic",             // Respects safe-area (already handled in CSS)
    preferredContentMode: "mobile",
    backgroundColor: "#1b1f31",            // Match manifest background
    allowsLinkPreview: false,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    SplashScreen: {
      launchAutoHide: true,
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      backgroundColor: "#1b1f31",
    },
  },
};

export default config;
```

### 1.3 Add iOS Platform

```bash
npm install @capacitor/ios
npx cap add ios
```

This generates `apps/web/ios/` — an Xcode project ready for signing.

---

## Phase 2: Native Plugin Integration

### 2.1 Push Notifications (APNs) — CRITICAL

App Store apps **cannot** use Web Push. Must use Apple Push Notification service (APNs).

**Client side:**

```bash
npm install @capacitor/push-notifications
```

```ts
// lib/native-push.ts
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";

export async function registerNativePush(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;

  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== "granted") return null;

  await PushNotifications.register();

  return new Promise((resolve) => {
    PushNotifications.addListener("registration", (token) => {
      resolve(token.value); // This is the APNs device token
    });
    PushNotifications.addListener("registrationError", () => {
      resolve(null);
    });
  });
}
```

**Server side — new API route:**

`POST /api/push/apns` — Stores APNs device tokens alongside existing Web Push subscriptions.

Push dispatch logic (`/api/push/route.ts`) needs a fork:
- If user has an APNs token → send via APNs (using `apns2` or `@parse/node-apn`)
- If user has a Web Push subscription → send via existing VAPID flow
- User can have both (web + native installed simultaneously)

**Apple Developer Portal:**
- Create an APNs Key (`.p8` file) under Certificates, Identifiers & Profiles
- Store as environment variables: `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_KEY` (base64-encoded .p8)

### 2.2 Status Bar & Splash Screen

```bash
npm install @capacitor/status-bar @capacitor/splash-screen
```

Configure status bar to match the dark theme:
```ts
import { StatusBar, Style } from "@capacitor/status-bar";

if (Capacitor.isNativePlatform()) {
  StatusBar.setStyle({ style: Style.Dark });
  StatusBar.setBackgroundColor({ color: "#1b1f31" });
}
```

### 2.3 Haptics (Optional Polish)

```bash
npm install @capacitor/haptics
```

Add haptic feedback on message send, reaction tap, voice channel join.

### 2.4 App Badge

```bash
npm install @capacitor/badge
```

Replace the existing `navigator.setAppBadge()` call with a platform check:
```ts
import { Capacitor } from "@capacitor/core";
import { Badge } from "@capacitor/badge";

export async function setUnreadBadge(count: number): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await Badge.set({ count });
  } else if ("setAppBadge" in navigator) {
    navigator.setAppBadge(count);
  }
}
```

### 2.5 Universal Links (Deep Linking)

So `vortexchat.com/invite/abc123` opens the native app if installed:

1. Add Associated Domains entitlement in Xcode: `applinks:vortexchat.com`
2. Host `/.well-known/apple-app-site-association` on Vercel:

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAM_ID.com.vortexchat.app",
        "paths": ["/invite/*", "/channels/*"]
      }
    ]
  }
}
```

Add as a static file in `apps/web/public/.well-known/apple-app-site-association`.

---

## Phase 3: Platform Detection & Conditional Code

### 3.1 Detect Native vs Web

```ts
// lib/platform.ts
import { Capacitor } from "@capacitor/core";

export const isNative = Capacitor.isNativePlatform();
export const isIOS = Capacitor.getPlatform() === "ios";
export const isWeb = !isNative;
```

### 3.2 Key Conditional Behaviors

| Behavior | Web (PWA) | Native (Capacitor) |
|---|---|---|
| Push registration | Web Push VAPID | APNs via Capacitor plugin |
| App badge | `navigator.setAppBadge()` | `@capacitor/badge` |
| Install prompt | `beforeinstallprompt` banner | N/A (already installed) |
| SW update toast | Show "New version" toast | N/A (WebView auto-refreshes) |
| Share | `navigator.share()` | `@capacitor/share` (same API, better integration) |
| External links | `window.open()` | `@capacitor/browser` (in-app browser) |

### 3.3 Hide PWA-Only UI

Hide the install prompt, SW update toast, and "Add to Home Screen" hints when running inside Capacitor.

---

## Phase 4: Xcode Configuration & Signing

### 4.1 Xcode Project Settings

After `npx cap open ios`, configure in Xcode:

- **Bundle Identifier:** `com.vortexchat.app`
- **Display Name:** VortexChat
- **Deployment Target:** iOS 16.0 (minimum for good WKWebView push support)
- **Team:** Select your Apple Developer team
- **Signing:** Automatic signing with your developer certificate

### 4.2 Required Capabilities (Entitlements)

Enable in Xcode → Target → Signing & Capabilities:

- **Push Notifications** — Required for APNs
- **Associated Domains** — For Universal Links (`applinks:vortexchat.com`)
- **Background Modes** → Remote notifications — To receive silent pushes
- **Background Modes** → Audio — For voice channels continuing in background (if desired)

### 4.3 Info.plist Additions

```xml
<!-- Microphone access for voice channels -->
<key>NSMicrophoneUsageDescription</key>
<string>VortexChat needs microphone access for voice channels and calls.</string>

<!-- Camera access if video calls are added later -->
<key>NSCameraUsageDescription</key>
<string>VortexChat needs camera access for video calls.</string>
```

### 4.4 App Icons

Generate the full iOS icon set from your existing `icon-512.png`:

- 1024x1024 (App Store)
- 180x180 (iPhone @3x)
- 120x120 (iPhone @2x)
- 167x167 (iPad Pro @2x)
- 152x152 (iPad @2x)

Tool: Use Xcode's asset catalog or a generator like `capacitor-assets`.

```bash
npm install -D @capacitor/assets
npx capacitor-assets generate --ios
```

---

## Phase 5: App Store Preparation

### 5.1 App Store Connect Setup

1. Log into [App Store Connect](https://appstoreconnect.apple.com)
2. Create a new app:
   - **Platform:** iOS
   - **Name:** VortexChat
   - **Bundle ID:** `com.vortexchat.app`
   - **SKU:** `vortexchat-ios-v1`
   - **Primary Language:** English (U.S.)

### 5.2 Required Metadata

| Field | Value |
|---|---|
| **Category** | Social Networking |
| **Subtitle** | Chat for teams & communities |
| **Description** | Full App Store description (up to 4000 chars) |
| **Keywords** | chat, voice, community, team, messaging, discord alternative |
| **Support URL** | Link to support/help page |
| **Privacy Policy URL** | Link to privacy policy (REQUIRED) |
| **Age Rating** | Fill out the content questionnaire (likely 12+ for user-generated content) |

### 5.3 Privacy Nutrition Labels

Apple requires disclosure of all data collected. For VortexChat:

| Data Type | Collected | Used for Tracking | Linked to Identity |
|---|---|---|---|
| Email Address | Yes | No | Yes |
| Display Name | Yes | No | Yes |
| User Content (messages) | Yes | No | Yes |
| Identifiers (user ID) | Yes | No | Yes |
| Usage Data | Yes (Sentry) | No | Yes |
| Diagnostics (crash logs) | Yes (Sentry) | No | No |
| Push notification token | Yes | No | Yes |

### 5.4 Screenshots

Required device sizes:
- **6.7" iPhone** (iPhone 15 Pro Max) — 1290 x 2796 px
- **6.5" iPhone** (iPhone 11 Pro Max) — 1242 x 2688 px (if supporting older layout)
- **5.5" iPhone** (iPhone 8 Plus) — 1242 x 2208 px (if supporting older layout)
- **12.9" iPad Pro** — 2048 x 2732 px (if supporting iPad)

Minimum 3 screenshots per device size. Show:
1. Channel/server view
2. Voice channel active
3. DM conversation
4. Server discovery / onboarding

### 5.5 TestFlight (Beta Testing)

Before App Store submission:

```bash
# Build in Xcode
npx cap sync ios
# Open Xcode
npx cap open ios
# Archive → Distribute → App Store Connect → TestFlight
```

1. Upload build via Xcode → Organizer → Distribute
2. Add internal testers in App Store Connect
3. Test push notifications, voice, auth flow, deep links on real devices

---

## Phase 6: App Review Compliance

### 6.1 Common Rejection Reasons to Avoid

| Guideline | Risk | Mitigation |
|---|---|---|
| **4.2 Minimum Functionality** | "This is just a website" | Ensure native push, haptics, deep links work; app must feel native |
| **2.1 Performance** | WebView-based apps can feel slow | Already optimized (code splitting, skeleton screens); test on older devices |
| **5.1.1 Data Collection** | Missing privacy labels | Fill out nutrition labels accurately (see 5.3) |
| **2.5.1 Software Requirements** | Missing usage descriptions | Add `NSMicrophoneUsageDescription` etc. in Info.plist |
| **3.1.1 In-App Purchase** | Selling digital goods without IAP | If VortexChat sells server boosts/perks, Apple's 30% IAP is required |
| **4.0 Design** | Not using standard iOS patterns | Safe-area insets already handled; test status bar, gestures |

### 6.2 Login Credential for Review

Apple reviewers need a test account to review the app. Create a dedicated review account:
- Email: `review@vortexchat.com` (or similar)
- Pre-populate with some servers, messages, and channels so reviewers see content

---

## Phase 7: CI/CD (Optional but Recommended)

### 7.1 Fastlane for Automated Builds

```bash
# In apps/web/ios/App/
fastlane init
```

Key lanes:
- `fastlane beta` — Build + upload to TestFlight
- `fastlane release` — Build + submit for App Store review

### 7.2 GitHub Actions Integration

```yaml
# .github/workflows/ios-build.yml
name: iOS Build
on:
  push:
    branches: [main]
    paths: ['apps/web/**']
jobs:
  build:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: cd apps/web && npx cap sync ios
      - uses: yukiarrr/ios-build-action@v1
        with:
          project-path: apps/web/ios/App/App.xcodeproj
          p12-base64: ${{ secrets.IOS_P12_BASE64 }}
          mobileprovision-base64: ${{ secrets.IOS_MOBILEPROVISION_BASE64 }}
          certificate-password: ${{ secrets.IOS_CERTIFICATE_PASSWORD }}
```

---

## Task Checklist

### Must-Do (App Store Submission Blockers)

- [ ] Install Capacitor + generate iOS project
- [ ] Configure `capacitor.config.ts` for hosted mode
- [ ] APNs push notification implementation (client + server)
- [ ] APNs key creation in Apple Developer Portal
- [ ] `POST /api/push/apns` route for device token registration
- [ ] Update push dispatch to support both VAPID and APNs
- [ ] Platform detection utility (`lib/platform.ts`)
- [ ] Hide PWA-only UI in native shell (install prompt, SW update toast)
- [ ] App icons generated for all iOS sizes
- [ ] `NSMicrophoneUsageDescription` in Info.plist
- [ ] Xcode signing + capabilities configured
- [ ] Privacy policy page published
- [ ] App Store Connect listing created with all metadata
- [ ] Privacy nutrition labels filled out
- [ ] Screenshots captured for required device sizes
- [ ] TestFlight build uploaded and tested
- [ ] Review test account created
- [ ] Submit for App Review

### Should-Do (Polish)

- [ ] Universal Links (`apple-app-site-association`)
- [ ] Haptic feedback on key interactions
- [ ] Native badge count via `@capacitor/badge`
- [ ] Status bar styling for dark theme
- [ ] Launch splash screen matching current branding
- [ ] Background audio mode for voice channels
- [ ] In-app browser for external links

### Nice-to-Have (Post-Launch)

- [ ] CallKit integration (incoming call UI for DM voice calls)
- [ ] Fastlane CI/CD pipeline
- [ ] GitHub Actions automated builds
- [ ] iPad-optimized layout
- [ ] Siri Shortcuts ("Send a message on VortexChat")
- [ ] Widget for unread counts (WidgetKit)
