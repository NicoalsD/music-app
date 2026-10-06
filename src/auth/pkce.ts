/** Source of cryptographically secure random bytes (injectable for tests). */
export type RandomBytes = (length: number) => Uint8Array;

export const cryptoRandomBytes: RandomBytes = (length) => crypto.getRandomValues(new Uint8Array(length));

// 64 symbols, so `byte & 63` is unbiased. All are valid PKCE "unreserved" characters.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Generates a random URL-safe string (used for the PKCE verifier and the OAuth state). */
export function generateRandomString(randomBytes: RandomBytes = cryptoRandomBytes, length = 64): string {
  const bytes = randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += ALPHABET.charAt((bytes[i] ?? 0) & 63);
  }
  return result;
}

/** PKCE code verifier: 43 to 128 characters (RFC 7636). */
export function generateCodeVerifier(randomBytes: RandomBytes = cryptoRandomBytes, length = 64): string {
  return generateRandomString(randomBytes, Math.min(128, Math.max(43, length)));
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** PKCE S256 challenge: base64url(SHA-256(verifier)). */
export async function codeChallengeS256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}
