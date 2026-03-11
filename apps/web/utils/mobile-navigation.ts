/**
 * Mobile back-button history management.
 *
 * On mobile PWAs, the hardware back button pops from the browser history stack.
 * Without explicit management, pressing back exits the PWA entirely.
 *
 * This utility pushes a two-entry history stack (base → channel) so that
 * back navigates to the channel list instead of leaving the app.
 * Inspired by Fluxer's MobileNavigation pattern.
 */

/**
 * Navigate to a channel while building a proper back-stack so the
 * Android hardware back button returns to the channel list (baseUrl)
 * instead of exiting the PWA.
 */
export function navigateToWithMobileHistory(
  router: { push: (url: string) => void; replace: (url: string) => void },
  targetUrl: string,
  baseUrl: string,
) {
  // Only apply the two-entry stack trick on mobile
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768

  if (!isMobile) {
    router.push(targetUrl)
    return
  }

  // Replace current entry with the base (channel list), then push the target.
  // This means: back → channel list, back again → previous page or home.
  router.replace(baseUrl)
  // Use setTimeout to ensure the replace settles before pushing
  setTimeout(() => {
    router.push(targetUrl)
  }, 0)
}

/**
 * Set up a popstate listener that prevents exiting the PWA when the
 * history stack is exhausted. Pushes a synthetic entry so the user
 * stays in the app.
 */
export function setupMobileBackGuard(fallbackUrl: string) {
  if (typeof window === "undefined") return () => {}

  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true

  if (!isStandalone) return () => {}

  // Push an initial entry so there's always something to go back to
  window.history.pushState({ vortexGuard: true }, "", window.location.href)

  function onPopState(e: PopStateEvent) {
    if (e.state?.vortexGuard) return
    // Re-push the guard so we don't exit
    window.history.pushState({ vortexGuard: true }, "", window.location.href)
  }

  window.addEventListener("popstate", onPopState)
  return () => window.removeEventListener("popstate", onPopState)
}
