import { codeChallengeS256, generateCodeVerifier, generateRandomString } from './pkce';

describe('pkce', () => {
  it('matches the RFC 7636 test vector', async () => {
    const challenge = await codeChallengeS256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('generates a verifier from injected bytes using only unreserved characters', () => {
    const verifier = generateCodeVerifier((n) => Uint8Array.from({ length: n }, (_, i) => i * 7));
    expect(verifier).toHaveLength(64);
    expect(verifier).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it('clamps the verifier length to the 43..128 range', () => {
    const bytes = (n: number): Uint8Array => new Uint8Array(n);
    expect(generateCodeVerifier(bytes, 10)).toHaveLength(43);
    expect(generateCodeVerifier(bytes, 500)).toHaveLength(128);
  });

  it('treats missing bytes as zero', () => {
    expect(generateRandomString(() => new Uint8Array(0), 3)).toBe('AAA');
  });

  it('uses crypto randomness by default', () => {
    expect(generateCodeVerifier()).not.toBe(generateCodeVerifier());
  });
});
