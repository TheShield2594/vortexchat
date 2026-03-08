/**
 * E2E test: full user journey
 *
 * Covers:
 *   1. Login via the UI form
 *   2. Server creation (via "Add a Server" modal)
 *   3. Message send  (via chat composer)
 *   4. Real-time delivery (second browser context observing the same channel)
 *   5. Persistence after page refresh
 *
 * The test user is created programmatically via the Supabase admin API in
 * beforeAll so that CI reliability does not depend on the registration UI
 * or on email-confirmation timing.
 *
 * Prerequisites:
 *   - Local Supabase running:  supabase start
 *   - Next.js dev server:      npm run dev --workspace=apps/web
 *
 * Environment variables (all have local-Supabase defaults):
 *   NEXT_PUBLIC_SUPABASE_URL         – Supabase API URL   (default: http://localhost:54321)
 *   SUPABASE_SERVICE_ROLE_KEY        – Service-role JWT   (default: local-dev well-known key)
 *   PLAYWRIGHT_BASE_URL              – App URL            (default: http://localhost:3000)
 */

import { test, expect, type BrowserContext, type Page } from "@playwright/test"
import { createClient } from "@supabase/supabase-js"
import type { SupabaseClient } from "@supabase/supabase-js"

// ── Local Supabase defaults ───────────────────────────────────────────────────
// The service-role key below is the standard, publicly-known key used by
// `supabase start` for local development. It is safe to commit.
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321"
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
    "eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0." +
    "EGIM96RAZx35lJzdJsyH-qQwv8Hj04zWl196z2-SBc8"

// ── Test-scoped fixtures ──────────────────────────────────────────────────────
const stamp = Date.now()
const TEST_EMAIL = `e2e${stamp}@vortex-test.local`
const TEST_PASSWORD = "TestPassword123!"
const TEST_SERVER_NAME = `E2E Server ${stamp}`
const TEST_MESSAGE = `Hello from Playwright – ${stamp}`

function buildAdminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * Log in through the actual UI login form.
 */
async function loginViaUI(page: Page, email: string, password: string) {
  await page.goto("/login")

  // Some variants of the login form hide email+password behind a toggle.
  const emailVisible = await page.locator('input[id="email"]').isVisible()
  if (!emailVisible) {
    const toggle = page.getByRole("button", { name: /password|use password/i })
    if (await toggle.isVisible()) await toggle.click()
  }

  await page.locator('input[id="email"]').fill(email)
  await page.locator('input[id="password"]').fill(password)
  await page.getByRole("button", { name: /log in with password/i }).click()

  await page.waitForURL(/\/channels/, { timeout: 20_000 })
  await page.waitForLoadState("domcontentloaded")
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe("user journey: login → server → message → realtime → refresh", () => {
  let admin: SupabaseClient
  let userId = ""

  test.beforeAll(async () => {
    admin = buildAdminClient()

    // Create a confirmed test user via the admin API.
    // This is more reliable than driving the registration UI and avoids
    // any email-confirmation timing issues.
    const { data, error } = await admin.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
    })
    if (error) throw new Error(`Admin createUser failed: ${error.message}`)
    userId = data.user!.id
  })

  test.afterAll(async () => {
    // Clean up: delete the test user (cascades to server, channels, messages)
    if (userId) {
      await admin.auth.admin.deleteUser(userId)
    }
  })

  test("full journey", async ({ browser }) => {
    test.setTimeout(120_000)

    const context: BrowserContext = await browser.newContext()
    const page = await context.newPage()

    // ── 1. Log in via the UI ──────────────────────────────────────────────────
    await test.step("login", async () => {
      await loginViaUI(page, TEST_EMAIL, TEST_PASSWORD)
    })

    // ── 2. Create a server via the "Add a Server" modal ───────────────────────
    let channelUrl = ""
    await test.step("create server", async () => {
      await page.getByRole("button", { name: /add a server/i }).click()
      await page.waitForSelector('[role="dialog"]', { timeout: 10_000 })

      const dialog = page.locator('[role="dialog"]')

      // "Create New" is the default tab — click it explicitly for robustness.
      const createTab = dialog.getByRole("button", { name: "Create New" })
      if (await createTab.isVisible()) await createTab.click()

      await dialog.locator('input[type="text"]').first().fill(TEST_SERVER_NAME)
      await dialog.getByRole("button", { name: /^create server$/i }).click()

      // The server handler creates a default "general" channel and redirects.
      await page.waitForURL(/\/channels\/[0-9a-f-]{36}\/[0-9a-f-]{36}/, {
        timeout: 20_000,
      })

      channelUrl = page.url()
    })

    // ── 3. Open observer + 4. Send message + 5. Verify realtime ──────────────
    await test.step("open observer", async () => {
      // Share cookies/storage so the observer is authenticated as the same user.
      const storageState = await context.storageState()
      const observerContext = await browser.newContext({ storageState })
      const observer = await observerContext.newPage()

      // Navigate and wait until the page is fully rendered and React hydrated.
      // networkidle: no HTTP requests for 500 ms (the channel page is SSR so
      // there is no client-side messages fetch on initial load).
      await observer.goto(channelUrl)
      await observer.waitForLoadState("networkidle", { timeout: 20_000 })
      await observer.waitForSelector("textarea", { timeout: 10_000 })

      await test.step("send message", async () => {
        const textarea = page.locator("textarea").first()
        await textarea.click()
        // keyboard.type() fires per-character events that React's controlled
        // textarea picks up reliably (fill() may not trigger onChange in prod).
        await page.keyboard.type(TEST_MESSAGE)
        await page.keyboard.press("Enter")
      })

      await test.step("verify realtime delivery", async () => {
        await expect(
          observer.getByText(TEST_MESSAGE, { exact: false })
        ).toBeVisible({ timeout: 20_000 })
      })

      await observerContext.close()
    })

    // ── 6. Verify persistence: message survives a full page reload ────────────
    await test.step("verify persistence after reload", async () => {
      await page.reload()
      await page.waitForURL(/\/channels\/[0-9a-f-]{36}\/[0-9a-f-]{36}/, {
        timeout: 20_000,
      })
      await expect(
        page.getByText(TEST_MESSAGE, { exact: false })
      ).toBeVisible({ timeout: 15_000 })
    })

    await context.close()
  })
})
