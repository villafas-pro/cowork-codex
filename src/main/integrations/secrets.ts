import { safeStorage } from 'electron'

/**
 * API tokens are encrypted with the OS keychain (Windows DPAPI) via Electron's safeStorage
 * before they are written to the database. The database lives in OneDrive and is backed up
 * daily, so a plain-text token there would be copied around.
 *
 * Caveat: the encrypted value only decrypts for the same Windows user on the same machine.
 * If the database is opened on another PC, decryptSecret returns '' and the user re-enters
 * the token in Settings.
 */

export function encryptSecret(plain: string): string {
  if (!plain) return ''
  if (safeStorage.isEncryptionAvailable()) {
    return 'enc:' + safeStorage.encryptString(plain).toString('base64')
  }
  // Last resort when the OS keychain is unavailable
  return 'plain:' + plain
}

export function decryptSecret(stored: string): string {
  if (!stored) return ''
  try {
    if (stored.startsWith('enc:')) {
      return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'))
    }
    if (stored.startsWith('plain:')) return stored.slice(6)
    return stored // legacy unprefixed value
  } catch {
    return ''
  }
}
