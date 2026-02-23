function decodeBase64Url(input: string): ArrayBuffer {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/")
  const pad = "=".repeat((4 - (base64.length % 4)) % 4)
  const str = atob(base64 + pad)
  const bytes = new Uint8Array(str.length)
  for (let i = 0; i < str.length; i += 1) bytes[i] = str.charCodeAt(i)
  return bytes.buffer
}

function encodeBuffer(input: ArrayBuffer): string {
  const bytes = new Uint8Array(input)
  let str = ""
  bytes.forEach((b) => {
    str += String.fromCharCode(b)
  })
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export function supportsPasskeys() {
  return typeof window !== "undefined" && !!window.PublicKeyCredential && !!navigator.credentials
}

export async function startPasskeyRegistration(emailLabel?: string) {
  const optionsRes = await fetch("/api/auth/passkeys/register/options", { method: "POST" })
  const options = await optionsRes.json()
  if (!optionsRes.ok) throw new Error(options.error || "Could not initialize passkey setup")

  const credential = await navigator.credentials.create({
    publicKey: {
      ...options,
      challenge: decodeBase64Url(options.challenge),
      user: {
        ...options.user,
        id: decodeBase64Url(options.user.id),
      },
      excludeCredentials: (options.excludeCredentials || []).map((cred: { id: string; type: string }) => ({
        ...cred,
        id: decodeBase64Url(cred.id),
      })),
    },
  }) as PublicKeyCredential

  const authResp = credential.response as AuthenticatorAttestationResponse

  const verifyRes = await fetch("/api/auth/passkeys/register/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      challenge: options.challenge,
      credentialId: credential.id,
      name: emailLabel || "This device",
      response: {
        attestationObject: encodeBuffer(authResp.attestationObject),
        clientDataJSON: encodeBuffer(authResp.clientDataJSON),
      },
      transports: authResp.getTransports?.() || [],
    }),
  })

  const verified = await verifyRes.json()
  if (!verifyRes.ok) throw new Error(verified.error || "Passkey registration failed")
}

export async function startPasskeyLogin(email?: string, trustedDeviceLabel?: string) {
  const optionsRes = await fetch("/api/auth/passkeys/login/options", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  })
  const options = await optionsRes.json()
  if (!optionsRes.ok) throw new Error(options.error || "Could not initialize passkey login")

  const assertion = await navigator.credentials.get({
    publicKey: {
      ...options,
      challenge: decodeBase64Url(options.challenge),
      allowCredentials: (options.allowCredentials || []).map((cred: { id: string; type: string }) => ({
        ...cred,
        id: decodeBase64Url(cred.id),
      })),
    },
  }) as PublicKeyCredential

  const authResp = assertion.response as AuthenticatorAssertionResponse

  const verifyRes = await fetch("/api/auth/passkeys/login/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      challenge: options.challenge,
      credentialId: assertion.id,
      trustedDeviceLabel,
      response: {
        authenticatorData: encodeBuffer(authResp.authenticatorData),
        clientDataJSON: encodeBuffer(authResp.clientDataJSON),
        signature: encodeBuffer(authResp.signature),
        userHandle: authResp.userHandle ? encodeBuffer(authResp.userHandle) : null,
      },
    }),
  })

  const verified = await verifyRes.json()
  if (!verifyRes.ok) throw new Error(verified.error || "Passkey login failed")

  if (verified.actionLink) {
    window.location.href = verified.actionLink
  }

  return options.policy as {
    passkey_first: boolean
    enforce_passkey: boolean
    fallback_password: boolean
    fallback_magic_link: boolean
  } | undefined
}
