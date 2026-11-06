// Writes the playground's certificates, requests and CRLs as PEM files so that an
// independent implementation can check them: `scripts/pki-interop.sh` runs OpenSSL 3.5
// on them in a container. Skipped unless PKI_INTEROP_DIR is set.
import { describe, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { caCrl, createPki, currentCrl, issueLeaf, type ProfileId } from '@/lib/pki/engine';
import { toPem } from '@/lib/pki/der';
import { keygen } from '@/lib/pki/algorithms';
import { issueCatalystCertificate, randomSerial } from '@/lib/pki/x509';

const dir = process.env.PKI_INTEROP_DIR;

describe.skipIf(!dir)('export for OpenSSL interop', () => {
  const profiles: ProfileId[] = ['classical', 'mldsa44', 'mldsa65', 'composite', 'mixed', 'web-classical', 'web-mtc'];
  for (const p of profiles) {
    it(p, () => {
      const out = path.join(dir!, p);
      mkdirSync(out, { recursive: true });
      const pki = createPki(p);
      const leaf = issueLeaf(pki, 'ok');
      writeFileSync(path.join(out, 'leaf.pem'), toPem(leaf.der, 'CERTIFICATE'));
      writeFileSync(path.join(out, 'csr.pem'), toPem(leaf.csr, 'CERTIFICATE REQUEST'));
      writeFileSync(path.join(out, 'host.txt'), leaf.expectedHost);
      if (pki.root && pki.issuing) {
        writeFileSync(path.join(out, 'root.pem'), toPem(pki.root.der, 'CERTIFICATE'));
        writeFileSync(path.join(out, 'int.pem'), toPem(pki.issuing.der, 'CERTIFICATE'));
        const revoked = issueLeaf(pki, 'revoked');
        writeFileSync(path.join(out, 'revoked.pem'), toPem(revoked.der, 'CERTIFICATE'));
        writeFileSync(path.join(out, 'crl.pem'), toPem(currentCrl(pki), 'X509 CRL'));
        // a second issuing CA, revoked by the root, and the leaf it issued
        const viaRevoked = issueLeaf(pki, 'intermediateRevoked');
        writeFileSync(path.join(out, 'revoked-ca.pem'), toPem(pki.extraCas[0].der, 'CERTIFICATE'));
        writeFileSync(path.join(out, 'revoked-ca-leaf.pem'), toPem(viaRevoked.der, 'CERTIFICATE'));
        writeFileSync(path.join(out, 'revoked-ca.crl.pem'), toPem(caCrl(pki.extraCas[0], pki.now), 'X509 CRL'));
        writeFileSync(path.join(out, 'arl.pem'), toPem(caCrl(pki.root, pki.now), 'X509 CRL'));
      }
      if (leaf.mtc) writeFileSync(path.join(out, 'standalone.pem'), toPem(leaf.mtc.standalone, 'CERTIFICATE'));
    }, 120_000);
  }

  it('ITU-T catalyst certificate', () => {
    const out = path.join(dir!, 'catalyst');
    mkdirSync(out, { recursive: true });
    const ca = keygen('ecdsa-p256'), caAlt = keygen('mldsa65'), leafKey = keygen('ecdsa-p256');
    const name = { C: 'DE', O: 'Muster GmbH', CN: 'Hybrid CA' };
    const now = new Date();
    const der = issueCatalystCertificate({
      serial: randomSerial(), issuer: name, subject: { CN: 'portal.muster.example' },
      notBefore: now, notAfter: new Date(now.getTime() + 864e5 * 30),
      subjectKey: { alg: 'ecdsa-p256', publicKey: leafKey.publicKey },
      extensions: [{ type: 'subjectAltName', dns: ['portal.muster.example'] }, { type: 'altPublicKey', alg: 'mldsa65', publicKey: keygen('mldsa65').publicKey }],
    }, ca, caAlt);
    writeFileSync(path.join(out, 'leaf.pem'), toPem(der, 'CERTIFICATE'));
  });
});
