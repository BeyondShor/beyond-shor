'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ALGS, algByOid } from '@/lib/pki/meta';
import { OID, oidName } from '@/lib/pki/oids';
import type { CertView } from '@/lib/pki/worker-types';
import type { DName, ParsedCert } from '@/lib/pki/x509';
import { Badge, useFormat } from './ui';

type Tab = 'fields' | 'extensions' | 'anatomy' | 'pem';

const PART_COLOR: Record<string, string> = {
  publicKey: '#06b6d4', signature: '#a78bfa', altPublicKey: '#22d3ee', altSignature: '#c4b5fd',
  sct: '#f472b6', names: '#fbbf24', extensions: '#34d399', structure: '#64748b',
};

export function nameLine(n: DName): string {
  if (n.trustAnchorId) return `trustAnchorID ${n.trustAnchorId}`;
  return [n.CN && `CN=${n.CN}`, n.O && `O=${n.O}`, n.C && `C=${n.C}`].filter(Boolean).join(', ') || '—';
}

function keyAlgName(c: ParsedCert): string {
  if (c.keyAlg) return ALGS[c.keyAlg].name;
  return oidName(c.spkiAlgOid);
}

function sigAlgName(o: string): string {
  if (o === OID.mtcProof) return 'id-alg-mtcProof (Merkle Tree)';
  return algByOid(o)?.name ?? oidName(o);
}

export default function CertViewer({ cert, fileName, role }: { cert: CertView; fileName: string; role: string }) {
  const t = useTranslations('pkiLab');
  const f = useFormat();
  const [tab, setTab] = useState<Tab>('fields');
  const c = cert.parsed;
  const isMtc = c.sigAlgOid === OID.mtcProof;

  const tabs: Tab[] = ['fields', 'extensions', 'anatomy', 'pem'];
  const rows: [string, string][] = [
    [t('cert.subject'), nameLine(c.subject)],
    [t('cert.issuer'), nameLine(c.issuer)],
    [t('cert.serial'), c.serialHex],
    [t('cert.validity'), `${f.date(c.notBefore)} – ${f.date(c.notAfter)}`],
    [t('cert.keyAlg'), `${keyAlgName(c)} · ${f.bytes(c.publicKey.length)}`],
    [t('cert.sigAlg'), `${sigAlgName(c.sigAlgOid)} · ${f.bytes(c.signature.length)}`],
  ];
  if (c.san?.length) rows.push([t('cert.san'), c.san.join(', ')]);
  if (c.basicConstraints) rows.push(['basicConstraints', c.basicConstraints.ca ? `cA=TRUE${c.basicConstraints.pathLen !== undefined ? `, pathLen=${c.basicConstraints.pathLen}` : ''}` : 'cA=FALSE']);
  if (c.keyUsage) rows.push(['keyUsage', c.keyUsage.join(', ')]);
  if (c.extKeyUsage) rows.push(['extendedKeyUsage', c.extKeyUsage.map(oidName).join(', ')]);
  if (c.nameConstraints?.length) rows.push(['nameConstraints', `permitted: ${c.nameConstraints.join(', ')}`]);
  if (c.crlUri) rows.push(['cRLDistributionPoints', c.crlUri]);
  if (c.altPublicKey) rows.push(['subjectAltPublicKeyInfo', `${algByOid(c.altPublicKey.algOid)?.name ?? c.altPublicKey.algOid} · ${f.bytes(c.altPublicKey.publicKey.length)}`]);
  if (c.altSignature) rows.push(['altSignatureValue', f.bytes(c.altSignature.length)]);

  const total = cert.der.length;

  function download() {
    const blob = new Blob([cert.pem], { type: 'application/x-pem-file' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="primary">{role}</Badge>
        <Badge>{f.bytes(total)}</Badge>
        {isMtc && <Badge tone="violet">Merkle Tree Certificate</Badge>}
      </div>
      <div role="tablist" className="flex flex-wrap gap-1">
        {tabs.map((x) => (
          <button key={x} role="tab" type="button" aria-selected={tab === x} onClick={() => setTab(x)}
            className={`rounded-md px-2.5 py-1 font-mono text-xs border transition-colors ${tab === x
              ? 'border-[var(--color-primary)]/50 bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
              : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-base)]'}`}>
            {t(`cert.tab.${x}`)}
          </button>
        ))}
      </div>

      {tab === 'fields' && (
        <dl className="grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-[minmax(0,11rem)_1fr]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-mono text-[var(--color-text-muted)]">{k}</dt>
              <dd className="font-mono text-[var(--color-text-base)] break-all">{v}</dd>
            </div>
          ))}
        </dl>
      )}

      {tab === 'extensions' && (
        <ul className="flex flex-col gap-1 text-xs font-mono">
          {c.extensions.map((e) => (
            <li key={e.oid + e.start} className="flex flex-wrap items-center gap-2">
              <span className="text-[var(--color-text-base)]">{e.name}</span>
              <span className="text-[var(--color-text-muted)]">{e.oid}</span>
              {e.critical && <Badge tone="warn">{t('cert.critical')}</Badge>}
              <span className="text-[var(--color-text-muted)]">{f.bytes(e.end - e.start)}</span>
            </li>
          ))}
          {c.extensions.length === 0 && <li className="text-[var(--color-text-muted)]">—</li>}
          <li className="mt-2 font-sans text-[var(--color-text-muted)] leading-relaxed">{t('cert.criticalHint')}</li>
        </ul>
      )}

      {tab === 'anatomy' && (
        <div className="flex flex-col gap-3">
          <div className="flex h-5 w-full overflow-hidden rounded border border-[var(--color-border-dim)]" role="img" aria-label={t('cert.anatomyAria')}>
            {c.breakdown.map((b) => (
              <div key={b.part} style={{ width: `${(b.bytes / total) * 100}%`, background: PART_COLOR[b.part] }} title={`${t(`cert.part.${b.part}`)}: ${f.bytes(b.bytes)}`} />
            ))}
          </div>
          <ul className="grid gap-1 sm:grid-cols-2 text-xs font-mono">
            {c.breakdown.map((b) => (
              <li key={b.part} className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: PART_COLOR[b.part] }} aria-hidden="true" />
                <span className="text-[var(--color-text-muted)]">{t(`cert.part.${b.part}`)}</span>
                <span className="ml-auto tabular-nums text-[var(--color-text-base)]">{f.bytes(b.bytes)} · {Math.round((b.bytes / total) * 100)} %</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">{t(isMtc ? 'cert.anatomyHintMtc' : 'cert.anatomyHint')}</p>
        </div>
      )}

      {tab === 'pem' && (
        <div className="flex flex-col gap-2">
          <pre className="max-h-56 overflow-auto rounded-lg border border-[var(--color-border-dim)] bg-[var(--color-bg-base)] p-3 font-mono text-[0.65rem] leading-snug text-[var(--color-text-muted)]">{cert.pem}</pre>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={download} className="font-mono text-xs text-[var(--color-primary)] hover:underline">↓ {fileName}</button>
            <span className="text-xs text-[var(--color-text-muted)]">{t(isMtc ? 'cert.pemHintMtc' : 'cert.pemHint')}</span>
          </div>
        </div>
      )}
    </div>
  );
}
