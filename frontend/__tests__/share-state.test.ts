import { describe, it, expect } from 'vitest';
import {
  encodeShareState,
  decodeShareState,
  fromHex,
  type KemRunShareState,
  type KemBenchmarkShareState,
  type SigRunShareState,
  type SigBenchmarkShareState,
} from '../lib/share-state';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const kemRunState: KemRunShareState = {
  v: 1, mode: 'encryption', type: 'run', kem: 'mlkem',
  s1: { cxPub: 'aa', cxPriv: 'bb', sxPub: 'cc', sxPriv: 'dd', kemPub: 'ee', kemPriv: 'ff', keygenMs: 12 },
  s2: { secret: 'deadbeef' },
  s3: { ct: '01020304', kemSecret: 'aabbcc', encapMs: 3, decapMs: 2 },
  s4: { salt: 'saltsalt', key: 'keykey' },
  s5: { iv: 'iviviviv', ct: 'ctct', plaintext: 'hello world' },
  s6: { decrypted: 'hello world' },
};

const kemBenchState: KemBenchmarkShareState = {
  v: 1, mode: 'encryption', type: 'benchmark',
  benchmark: {
    mlkem: { status: 'done', runs: [{ keygenMs: 1, encapMs: 2, decapMs: 3, pubKeyBytes: 4, ciphertextBytes: 5, ssBytes: 6 }], total: 1 },
  },
};

const sigRunState: SigRunShareState = {
  v: 1, mode: 'signatures', type: 'run', dsa: 'mldsa65',
  s1: { pk: 'pubkey', sk: 'seckey', keygenMs: 5 },
  s2: { msg: 'aabbcc', sig: 'ddeeff', signMs: 2 },
  s3: { valid: true, verifyMs: 1 },
};

const sigBenchState: SigBenchmarkShareState = {
  v: 1, mode: 'signatures', type: 'benchmark',
  benchmark: {
    mldsa65: { status: 'done', runs: [{ keygenMs: 1, signMs: 2, verifyMs: 3, pubKeyBytes: 4, secKeyBytes: 5, sigBytes: 6 }], total: 1 },
  },
};

// ── encodeShareState / decodeShareState ───────────────────────────────────────

describe('encodeShareState / decodeShareState', () => {
  it('roundtrips KemRunShareState', () => {
    const encoded = encodeShareState(kemRunState);
    expect(decodeShareState(encoded)).toEqual(kemRunState);
  });

  it('roundtrips KemBenchmarkShareState', () => {
    const encoded = encodeShareState(kemBenchState);
    expect(decodeShareState(encoded)).toEqual(kemBenchState);
  });

  it('roundtrips SigRunShareState', () => {
    const encoded = encodeShareState(sigRunState);
    expect(decodeShareState(encoded)).toEqual(sigRunState);
  });

  it('roundtrips SigBenchmarkShareState', () => {
    const encoded = encodeShareState(sigBenchState);
    expect(decodeShareState(encoded)).toEqual(sigBenchState);
  });

  it('encoded string is URL-safe (no +, /, =)', () => {
    const encoded = encodeShareState(kemRunState);
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it('returns null for empty string', () => {
    expect(decodeShareState('')).toBeNull();
  });

  it('returns null for garbage input', () => {
    expect(decodeShareState('!!!not-valid!!!')).toBeNull();
  });

  it('returns null for valid base64 but non-JSON content', () => {
    const nonJson = btoa('this is not json').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    expect(decodeShareState(nonJson)).toBeNull();
  });

  it('returns null when v !== 1', () => {
    const bad = { v: 2, mode: 'encryption', type: 'run' };
    const encoded = btoa(JSON.stringify(bad)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    expect(decodeShareState(encoded)).toBeNull();
  });

  it('handles padding edge cases (encoded length % 4 == 0, 1, 2, 3)', () => {
    // The four states have different sizes → different padding edge cases
    for (const state of [kemRunState, kemBenchState, sigRunState, sigBenchState]) {
      const encoded = encodeShareState(state);
      const roundtripped = decodeShareState(encoded);
      expect(roundtripped).not.toBeNull();
    }
  });
});

// ── fromHex ───────────────────────────────────────────────────────────────────

describe('fromHex', () => {
  it('converts known hex string to bytes', () => {
    const result = fromHex('deadbeef');
    expect(result).toEqual(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
  });

  it('converts all-zeros hex', () => {
    expect(fromHex('0000')).toEqual(new Uint8Array([0, 0]));
  });

  it('converts all-ff hex', () => {
    expect(fromHex('ffff')).toEqual(new Uint8Array([255, 255]));
  });

  it('returns empty array for empty string', () => {
    expect(fromHex('')).toEqual(new Uint8Array([]));
  });

  it('roundtrips: hex → bytes → hex', () => {
    const hex = 'cafebabe0102030405060708';
    const bytes = fromHex(hex);
    const backToHex = Buffer.from(bytes).toString('hex');
    expect(backToHex).toBe(hex);
  });
});
