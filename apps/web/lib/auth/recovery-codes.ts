import crypto from "node:crypto"

const RECOVERY_CODE_COUNT = 10
const RECOVERY_CODE_LENGTH = 8 // 8 hex chars = 4 bytes of entropy per code

/**
 * Generate a set of plaintext recovery codes.
 * Format: XXXX-XXXX (hex, grouped for readability)
 */
export function generateRecoveryCodes(): string[] {
  const codes: string[] = []
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    const raw = crypto.randomBytes(4).toString("hex").toUpperCase()
    // Format as XXXX-XXXX for readability
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4)}`)
  }
  return codes
}

/**
 * Hash a recovery code using scrypt (Node.js built-in, no external dependency).
 * Returns "salt:hash" format.
 */
export async function hashRecoveryCode(code: string): Promise<string> {
  const normalized = code.replace(/-/g, "").toUpperCase()
  const salt = crypto.randomBytes(16).toString("hex")
  return new Promise((resolve, reject) => {
    crypto.scrypt(normalized, salt, 32, (err, derivedKey) => {
      if (err) reject(err)
      else resolve(`${salt}:${derivedKey.toString("hex")}`)
    })
  })
}

/**
 * Verify a plaintext recovery code against a stored "salt:hash".
 */
export async function verifyRecoveryCode(code: string, storedHash: string): Promise<boolean> {
  const normalized = code.replace(/-/g, "").toUpperCase()
  const [salt, hash] = storedHash.split(":")
  if (!salt || !hash) return false
  return new Promise((resolve, reject) => {
    crypto.scrypt(normalized, salt, 32, (err, derivedKey) => {
      if (err) reject(err)
      else resolve(crypto.timingSafeEqual(Buffer.from(hash, "hex"), derivedKey))
    })
  })
}
