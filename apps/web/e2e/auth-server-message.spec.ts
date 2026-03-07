/**
 * E2E test: full user journey
 *
 * Covers:
 *   1. User registration (via UI form)
 *   2. Server creation (via "Add a Server" modal)
 *   3. Message send  (via chat composer)
 *   4. Real-time delivery (second browser context observing the same channel)
 *   5. Persistence after page refresh
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
const TEST_EMAIL = `e2e-${stamp}@vortex-test.local`
const TEST_PASSWORD = "TestPassword123!"
const TEST_USERNAME = `e2euser${stamp}`
const TEST_SERVER_NAME = `E2E Server ${stamp}`
const TEST_MESSAGE = `Hello from Playwright – ${stamp}`

function buildAdminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * Log in through the actual UI login form and return the resulting page.
 * We use the `/login` route (email + password) which exercises the full
 * `/api/auth/login` server action and cookie-based session creation.
 */
async function loginViaUI(page: Page, email: string, password: string) {
  await page.goto("/login")
  // The login form may have a fallback-toggle that shows email+password fields.
  // Click "Log In with Password" button to ensure the form is visible.
  const passwordFormVisible = await page.locator('input[type="email"]').isVisible()
  if (!passwordFormVisible) {
    // Some variants render a "Use password" toggle first
    const toggle = page.getByRole("button", { name: /password|use password/i })
    if (await toggle.isVisible()) await toggle.click()
  }

  await page.locator('input[id="email"]').fill(email)
  await page.locator('input[id="password"]').fill(password)
  await page.getByRole("button", { name: /log in with password/i }).click()

  // Wait for redirect to /channels/me (or any /channels path) and for the
  // page to finish loading so client-side components are interactive.
  await page.waitForURL(/\/channels/, { timeout: 20_000 })
  await page.waitForLoadState("domcontentloaded")
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe("user journey: register → server → message → realtime → refresh", () => {
  let admin: SupabaseClient
  let userId: string | undefined

  test.beforeAll(async () => {
    admin = buildAdminClient()
  })

  test.afterAll(async () => {
    // Clean up: delete the test user (cascades to server, channels, messages)
    if (userId) {
      await admin.auth.admin.deleteUser(userId)
    }
  })

  test("full journey", async ({ browser }) => {
    // ── 1. Register via the UI form ─────────────────────────────────────────
    const context: BrowserContext = await browser.newContext()
    const page = await context.newPage()

    await page.goto("/register")
    await page.locator('input[type="email"]').fill(TEST_EMAIL)
    // Username field: identified by placeholder
    await page.locator('input[placeholder="cooluser123"]').fill(TEST_USERNAME)
    // Display name field (optional — skip)
    await page.locator('input[type="password"]').nth(0).fill(TEST_PASSWORD)
    await page.locator('input[type="password"]').nth(1).fill(TEST_PASSWORD)
    await page.getByRole("button", { name: /create account|continue/i }).click()

    // Registration redirects to /login?registered=true and shows a success toast.
    await page.waitForURL(/\/login/, { timeout: 15_000 })

    // ── 2. Confirm email via admin API (local Supabase requires confirmation) ─
    // Request up to 1000 users to avoid pagination cutting off the new user.
    const { data: listResult } = await admin.auth.admin.listUsers({ perPage: 1000 })
    const testUser = listResult?.users?.find((u) => u.email === TEST_EMAIL)
    expect(testUser, "Test user should exist after registration").toBeTruthy()
    userId = testUser!.id

    // Confirm the email so the user can log in
    await admin.auth.admin.updateUserById(userId, { email_confirm: true })

    // ── 3. Log in via the UI ────────────────────────────────────────────────
    await loginViaUI(page, TEST_EMAIL, TEST_PASSWORD)

    // ── 4. Create a server via the "Add a Server" modal ─────────────────────
    await page.getByRole("button", { name: /add a server/i }).click()
    await page.waitForSelector('[role="dialog"]', { timeout: 5_000 })

    // Scope all modal interactions to the dialog element.
    const dialog = page.locator('[role="dialog"]')

    // Ensure "Create New" mode is active (it is the default, but click the tab
    // explicitly so the test is robust against modal state changes).
    const createTab = dialog.getByRole("button", { name: "Create New" })
    if (await createTab.isVisible()) await createTab.click()

    // Type server name
    await dialog.locator('input[type="text"]').first().fill(TEST_SERVER_NAME)
    await dialog.getByRole("button", { name: /^create server$/i }).click()

    // Wait for redirect to the newly created server's first channel
    await page.waitForURL(/\/channels\/[0-9a-f-]{36}\/[0-9a-f-]{36}/, {
      timeout: 15_000,
    })

    const channelUrl = page.url()

    // ── 5. Open a second browser context (real-time observer) ───────────────
    // Share cookies/storage so the observer is logged in as the same user.
    const storageState = await context.storageState()
    const observerContext = await browser.newContext({ storageState })
    const observer = await observerContext.newPage()
    await observer.goto(channelUrl)

    // Wait for the observer's message input to be ready.
    // (The send button only renders when there is content, so we wait for
    // the textarea instead — it is always present on a loaded channel page.)
    await observer.waitForSelector('textarea', { timeout: 15_000 })

    // ── 6. Send a message from the primary tab ───────────────────────────────
    // Use .first() to avoid strict-mode errors if other textareas are present.
    const textarea = page.locator("textarea").first()
    await textarea.click()
    await textarea.fill(TEST_MESSAGE)
    await page.getByRole("button", { name: /send message/i }).click()

    // ── 7. Verify the message appears in the OBSERVER tab (real-time) ────────
    await expect(
      observer.getByText(TEST_MESSAGE, { exact: false })
    ).toBeVisible({ timeout: 15_000 })

    // ── 8. Verify persistence: message still there after a full page refresh ─
    await page.reload()
    await page.waitForURL(/\/channels\/[0-9a-f-]{36}\/[0-9a-f-]{36}/, {
      timeout: 15_000,
    })
    await expect(
      page.getByText(TEST_MESSAGE, { exact: false })
    ).toBeVisible({ timeout: 10_000 })

    // Clean up secondary context
    await observerContext.close()
    await context.close()
  })
})
