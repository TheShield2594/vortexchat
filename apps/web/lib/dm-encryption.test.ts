import { describe, expect, it } from "vitest"
import {
  decryptDmContent,
  encryptDmContent,
  exportPublicKey,
  generateConversationKey,
  generateDeviceKeyPair,
  importPublicKey,
  nextKeyVersion,
  unwrapConversationKey,
  wrapConversationKey,
} from "./dm-encryption"

describe("dm-encryption", () => {
  it("encrypts and decrypts message payloads", async () => {
    const conversationKey = generateConversationKey()
    const envelope = await encryptDmContent("hello encrypted world", conversationKey, 1)
    const plaintext = await decryptDmContent(envelope, conversationKey)
    expect(plaintext).toBe("hello encrypted world")
  })

  it("wraps and unwraps per-recipient conversation key", async () => {
    const alice = await generateDeviceKeyPair()
    const bob = await generateDeviceKeyPair()
    const sharedConversationKey = generateConversationKey()

    const bobPublic = await exportPublicKey(bob.publicKey)
    const wrapped = await wrapConversationKey(sharedConversationKey, alice.privateKey, await importPublicKey(bobPublic))
    const unwrapped = await unwrapConversationKey(wrapped, bob.privateKey, alice.publicKey)

    expect(Buffer.from(unwrapped).toString("hex")).toBe(Buffer.from(sharedConversationKey).toString("hex"))
  })

  it("increments key version for rotations (membership changes)", () => {
    expect(nextKeyVersion(1)).toBe(2)
    expect(nextKeyVersion(9)).toBe(10)
  })
})
