export type OpaqueId = string

export type IdFactory = () => string

function defaultIdFactory(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }

  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const bytes = new Uint8Array(16)
    globalThis.crypto.getRandomValues(bytes)
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
      16,
      20,
    )}-${hex.slice(20)}`
  }

  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export function createOpaqueId(factory: IdFactory = defaultIdFactory): OpaqueId {
  const id = factory()

  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new Error('An opaque ID factory must return a non-empty string.')
  }

  return id
}
