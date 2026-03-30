import { test, expect } from "@playwright/test"
import { hasSupabase } from "./utils"

/**
 * E2E tests for the authentication flow.
 *
 * Prerequisites:
 *   - Next.js dev server running on PLAYWRIGHT_BASE_URL (default localhost:3000)
 *   - Local Supabase instance running (supabase start)
 *
 * Tests that require a real Supabase backend are skipped when
 * NEXT_PUBLIC_SUPABASE_URL is missing or set to a placeholder value.
 */

const TEST_EMAIL = `e2e-${Date.now()}@test.local`
const TEST_PASSWORD = "Test1234!@#$"
const TEST_USERNAME = `e2euser${Date.now()}`

test.describe("Authentication", () => {
  test("register page loads and shows form", async ({ page }) => {
    await page.goto("/register")
    await expect(page.locator("input[type='email']")).toBeVisible()
    await expect(page.locator("input[type='password']").first()).toBeVisible()
    await expect(page.getByRole("button", { name: /create account|sign up|register|continue/i })).toBeVisible()
  })

  test("login page loads and shows form", async ({ page }) => {
    await page.goto("/login")
    await expect(page.locator("input[type='email']")).toBeVisible()
    await expect(page.locator("input[type='password']")).toBeVisible()
    await expect(page.getByRole("button", { name: /log in|sign in/i })).toBeVisible()
  })

  test("login with invalid credentials shows error", async ({ page }) => {
    test.skip(!hasSupabase, "Requires a real Supabase backend")

    await page.goto("/login")
    await page.locator("input[type='email']").fill("nonexistent@test.local")
    await page.locator("input[type='password']").fill("wrongpassword")
    await page.getByRole("button", { name: /log in|sign in/i }).click()

    // Should show an error message, not navigate away
    await expect(page.locator("text=/invalid|incorrect|error/i")).toBeVisible({ timeout: 10_000 })
  })

  test("register form validates required fields", async ({ page }) => {
    await page.goto("/register")

    // Try submitting empty form
    const submitButton = page.getByRole("button", { name: /create account|sign up|register|continue/i })
    await submitButton.click()

    // HTML5 validation should prevent submission — email should be invalid
    const emailInput = page.locator("input[type='email']")
    const isInvalid = await emailInput.evaluate(
      (el: HTMLInputElement) => !el.validity.valid
    )
    expect(isInvalid).toBe(true)
  })

  test("register and login flow", async ({ page }) => {
    test.skip(!hasSupabase, "Requires a real Supabase backend")

    // Register
    await page.goto("/register")
    await page.locator("input[type='email']").fill(TEST_EMAIL)
    await page.locator("input[type='text']").first().fill(TEST_USERNAME)
    await page.locator("input[type='password']").first().fill(TEST_PASSWORD)
    await page.locator("input[type='password']").last().fill(TEST_PASSWORD)
    await page.getByRole("button", { name: /create account|sign up|register/i }).click()

    // Should redirect to login or auto-login
    await page.waitForURL(/\/(login|servers|$)/, { timeout: 15_000 })

    // If redirected to login, log in
    if (page.url().includes("/login")) {
      await page.locator("input[type='email']").fill(TEST_EMAIL)
      await page.locator("input[type='password']").fill(TEST_PASSWORD)
      await page.getByRole("button", { name: /log in|sign in/i }).click()
      await page.waitForURL(/\/servers/, { timeout: 15_000 })
    }

    // Should be on the app now
    await expect(page).toHaveURL(/\/servers/)
  })

  test("login form has correct autocomplete attributes", async ({ page }) => {
    await page.goto("/login")

    const emailInput = page.locator("input[type='email']")
    await expect(emailInput).toHaveAttribute("autocomplete", "email")

    const passwordInput = page.locator("input[type='password']")
    await expect(passwordInput).toHaveAttribute("autocomplete", "current-password")
  })

  test("skip-to-content link is keyboard accessible", async ({ page }) => {
    await page.goto("/login")

    // Wait for the splash screen overlay to fade out (it has pointer-events: auto
    // and covers the viewport for ~500ms, intercepting Tab key presses)
    await page.waitForSelector("[aria-hidden='true'][style*='opacity']", { state: "hidden", timeout: 5_000 }).catch(() => {})

    // Tab to reach the skip link
    await page.keyboard.press("Tab")
    const skipLink = page.locator(".skip-nav-link")
    await expect(skipLink).toBeFocused()
  })
})
