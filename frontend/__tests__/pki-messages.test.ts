import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import de from '@/messages/de.json';
import en from '@/messages/en.json';
import {
  ATTACKS, FAILURE_VARIANTS, PRIVATE_CLIENTS, PRIVATE_PROFILES, QDAY_DEPLOYMENTS, WEB_CLIENTS, WEB_PROFILES,
} from '@/lib/pki/meta';

const root = path.join(__dirname, '..');
type Tree = { [k: string]: string | Tree };

function has(tree: Tree, key: string): boolean {
  let cur: string | Tree | undefined = tree;
  for (const part of key.split('.')) {
    if (typeof cur !== 'object' || !(part in cur)) return false;
    cur = cur[part];
  }
  return typeof cur === 'string';
}

const sources = [
  ...readdirSync(path.join(root, 'components/pki')).map((f) => path.join(root, 'components/pki', f)),
  path.join(root, 'app/[locale]/pki/page.tsx'),
];

function literalKeys(): string[] {
  const keys = new Set<string>();
  for (const file of sources) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g)) keys.add(m[1]);
    // ternaries inside t(...): t(cond ? 'a.b' : 'c.d')
    // ternaries inside t(...): only the branches after ? and :, not the condition
    for (const m of src.matchAll(/\bt\(([^()]*\?[^()]*)\)/g)) for (const s of m[1].matchAll(/[?:]\s*'([a-zA-Z0-9_.]+)'/g)) keys.add(s[1]);
  }
  return [...keys].filter((k) => k.includes('.') || /^[a-z]/.test(k));
}

function dynamicKeys(): string[] {
  const reasons = new Set<string>();
  for (const f of ['lib/pki/validate.ts']) {
    const src = readFileSync(path.join(root, f), 'utf8');
    for (const m of src.matchAll(/reason:\s*([^,}]*)/g)) for (const s of m[1].matchAll(/(?:^\s*|[?:]\s*)'([a-zA-Z]+)'/g)) reasons.add(s[1]);
  }
  for (const r of ['viaLandmark', 'viaCosignatures', 'notMtc', 'malformed', 'proof', 'unknownLandmark', 'cosignatures']) reasons.add(r);
  const clients = [...PRIVATE_CLIENTS, ...WEB_CLIENTS];
  const profiles = [...PRIVATE_PROFILES, ...WEB_PROFILES];
  const checks = ['parse', 'path', 'algorithm', 'signature', 'altSignature', 'mtcProof', 'validity', 'criticalExtensions', 'caFlags',
    'pathLen', 'nameConstraints', 'eku', 'hostname', 'revocation', 'scts', 'pqPolicy'];
  return [
    ...clients.flatMap((c) => ['name', 'short', 'desc'].map((x) => `clients.${c}.${x}`)),
    ...profiles.flatMap((p) => ['name', 'short', 'desc'].map((x) => `profiles.${p}.${x}`)),
    ...profiles.map((p) => `step3.summary.${p}`),
    ...FAILURE_VARIANTS.flatMap((v) => ['label', 'what', 'why'].map((x) => `failures.${v}.${x}`)),
    ...ATTACKS.flatMap((a) => ['title', 'desc', 'lesson'].map((x) => `attack.${a}.${x}`)),
    ...QDAY_DEPLOYMENTS.flatMap((d) => ['name', 'desc'].map((x) => `qday.${d}.${x}`)),
    ...checks.map((c) => `checks.${c}`),
    ...[...reasons].map((r) => `reasons.${r}`),
    ...['path', 'signature', 'validity', 'nameConstraints', 'revocation', 'scts', 'pathLen', 'altSignature', 'hostname'].map((p) => `passes.${p}`),
    ...['chain', 'landmark', 'standalone'].map((p) => `presented.${p}`),
    ...['pass', 'fail', 'skip'].map((p) => `step3.cv.${p}`),
    ...['fields', 'extensions', 'anatomy', 'pem'].map((p) => `cert.tab.${p}`),
    ...['publicKey', 'signature', 'altPublicKey', 'altSignature', 'sct', 'names', 'extensions', 'structure'].map((p) => `cert.part.${p}`),
    ...['d398', 'd200', 'd100', 'd47', 'h160'].map((p) => `revocation.life.${p}`),
    ...['local', 'online', 'softBlocked', 'none'].map((p) => `revocation.behaviour.${p}`),
    ...['leafKeygen', 'csrSign', 'popCheck', 'validation', 'issue', 'validate', 'cvSign', 'cvVerify', 'handshake'].map((p) => `bench.metric.${p}`),
    ...['primary', 'remote1', 'remote2', 'internal'].map((p) => `acme.perspective.${p}`),
    ...['ServerHello', 'ChangeCipherSpec', 'encrypted'].map((p) => `budget.record.${p}`),
    ...['ceremony', 'request', 'validate', 'issue', 'handshake'].flatMap((ph) => ['short', 'private', 'web', 'mtc'].map((k) => `overview.phase.${ph}.${k}`)),
    'overview.phase.verdict.short',
    ...['notQuantumSafe', 'quantumSafe', 'notInTr', 'notHybrid', 'trConform', 'draft', 'notHybridBelow', 'today', 'hypothetical', 'planned'].map((b) => `badges.${b}`),
    ...['ca', 'ra', 'subscriber', 'relyingParty'].flatMap((r) => [`basics.${r}.name`, `basics.${r}.desc`]),
    ...['trust', 'algorithms', 'transparency', 'lifetime', 'pq'].flatMap((k) => ['label', 'private', 'web'].map((x) => `compare.${k}.${x}`)),
    ...['real', 'tls', 'acme', 'interop', 'composite', 'catalyst', 'mtc', 'simplified', 'shor'].map((k) => `impl.${k}`),
    ...['s1', 's2', 's3', 's4'].map((k) => `mtc.${k}`),
    ...['cert', 'store', 'deadline'].map((k) => `clocks.${k}`),
    ...['private', 'web', 'privateDesc', 'webDesc'].map((k) => `scope.${k}`),
  ];
}

describe('PKI playground texts', () => {
  const pkiDe = (de as unknown as Record<string, Tree>).pkiLab;
  const pkiEn = (en as unknown as Record<string, Tree>).pkiLab;

  it('every key used by the code exists in German and English', () => {
    const missing: string[] = [];
    for (const k of [...literalKeys(), ...dynamicKeys()]) {
      if (!has(pkiDe, k)) missing.push(`de:${k}`);
      if (!has(pkiEn, k)) missing.push(`en:${k}`);
    }
    expect(missing).toEqual([]);
  });

  it('German and English have the same keys', () => {
    const flat = (t: Tree, p = ''): string[] => Object.entries(t).flatMap(([k, v]) => (typeof v === 'string' ? [p + k] : flat(v, `${p}${k}.`)));
    expect(flat(pkiDe).sort()).toEqual(flat(pkiEn).sort());
    expect(Object.keys((de as unknown as Record<string, Tree>).pkiPlayground.demos as Tree)).toEqual(Object.keys((en as unknown as Record<string, Tree>).pkiPlayground.demos as Tree));
  });

  it('German texts use the formal address', () => {
    const flat = (t: Tree): string[] => Object.values(t).flatMap((v) => (typeof v === 'string' ? [v] : flat(v)));
    const informal = flat(pkiDe).filter((s) => /\b(du|dein|deine|dir|dich)\b/i.test(s));
    expect(informal).toEqual([]);
  });
});
