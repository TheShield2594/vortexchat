export async function register() {
  // Only validate on the server (Node.js runtime), not in the Edge runtime or browser
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("./lib/env-validation")
    validateEnv()
  }
}
