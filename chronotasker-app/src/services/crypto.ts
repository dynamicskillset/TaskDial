/**
 * Client-side AES-256-GCM encryption using PBKDF2 key derivation.
 * The encryption key is derived from the user's password and a server-stored salt.
 * The key never leaves the client — the server only stores ciphertext.
 */

const PBKDF2_ITERATIONS = 200_000;
const SESSION_KEY_PREFIX = 'ct_ek_';

let _cryptoKey: CryptoKey | null = null;
let _currentUserId: string | null = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Key management ────────────────────────────────────────────────────────────

/**
 * Derive and store an encryption key from the user's password and their key_salt.
 * Called once on login or registration. Persists key to sessionStorage so page
 * refreshes don't require re-login.
 */
export async function initKey(password: string, keySaltHex: string, userId: string): Promise<void> {
  const keySalt = hexToBytes(keySaltHex);

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  _cryptoKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: keySalt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );

  _currentUserId = userId;

  // Persist raw key bytes in sessionStorage (cleared when tab closes)
  const exported = await crypto.subtle.exportKey('raw', _cryptoKey);
  sessionStorage.setItem(
    `${SESSION_KEY_PREFIX}${userId}`,
    bytesToHex(new Uint8Array(exported)),
  );
}

/**
 * Restore the encryption key from sessionStorage (e.g. after a page refresh).
 * Returns true if successful.
 */
export async function loadKeyFromSession(userId: string): Promise<boolean> {
  const hex = sessionStorage.getItem(`${SESSION_KEY_PREFIX}${userId}`);
  if (!hex) return false;

  try {
    const keyBytes = hexToBytes(hex);
    _cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    );
    _currentUserId = userId;
    return true;
  } catch {
    return false;
  }
}

/** Clear the in-memory key and remove it from sessionStorage. */
export function clearKey(userId: string): void {
  _cryptoKey = null;
  _currentUserId = null;
  sessionStorage.removeItem(`${SESSION_KEY_PREFIX}${userId}`);
}

export function hasKey(): boolean {
  return _cryptoKey !== null;
}

export function getCurrentUserId(): string | null {
  return _currentUserId;
}

// ── Encrypt / Decrypt ─────────────────────────────────────────────────────────

/** Encrypted format: hex(iv[12] + ciphertext) */
const ENC_PREFIX = 'enc:';

/**
 * Encrypt a plaintext string. Returns a prefixed hex string.
 * Throws if the key has not been initialised.
 */
export async function encrypt(plaintext: string): Promise<string> {
  if (!_cryptoKey) throw new Error('Encryption key not available');

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, _cryptoKey, encoded);

  const combined = new Uint8Array(12 + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), 12);

  return ENC_PREFIX + bytesToHex(combined);
}

/**
 * Decrypt a ciphertext string produced by encrypt().
 * If the value does not start with the encrypted prefix, it is returned as-is
 * (graceful fallback for unencrypted legacy data or empty values).
 */
export async function decrypt(value: string): Promise<string> {
  if (!value.startsWith(ENC_PREFIX)) return value; // legacy plaintext

  if (!_cryptoKey) throw new Error('Encryption key not available');

  const hex = value.slice(ENC_PREFIX.length);
  const combined = hexToBytes(hex);
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, _cryptoKey, ciphertext);
  return new TextDecoder().decode(plaintext);
}

/** Returns true if the string looks like an encrypted value. */
export function isEncrypted(value: string): boolean {
  return value.startsWith(ENC_PREFIX);
}
