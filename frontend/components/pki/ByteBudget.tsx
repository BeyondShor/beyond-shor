'use client';

import { useTranslations } from 'next-intl';
import { EAP_FRAGMENT, TCP_INITIAL_WINDOW } from '@/lib/pki/meta';
import { OID } from '@/lib/pki/oids';
import type { HandshakeView } from '@/lib/pki/worker-types';
import { BudgetBar, Collapsible, Note, useFormat } from './ui';

interface Load { label: string; bytes: number }

/** Key and signature bytes the client receives, read from the certificates and messages actually sent. */
export function cryptoLoad(h: HandshakeView, t: (k: string) => string): Load[] {
  const rows: Load[] = [];
  rows.push({ label: t('budget.cvSig'), bytes: h.tls.messages.certificateVerify - 8 });    // header 4, scheme 2, length 2
  h.validation.path.forEach((c, i) => {
    const who = i === 0 ? t('budget.leaf') : t('budget.intermediate');
    rows.push({ label: `${t('budget.pk')} · ${who}`, bytes: c.publicKey.length });
    if (c.sigAlgOid === OID.mtcProof) rows.push({ label: t('budget.mtcProof'), bytes: c.signature.length });
    else rows.push({ label: `${t('budget.sig')} · ${who}`, bytes: c.signature.length });
    if (c.altPublicKey) rows.push({ label: `${t('budget.altPk')} · ${who}`, bytes: c.altPublicKey.publicKey.length });
    if (c.altSignature) rows.push({ label: `${t('budget.altSig')} · ${who}`, bytes: c.altSignature.length });
    if (c.sctList) rows.push({ label: t('budget.scts'), bytes: c.sctList.length });
  });
  return rows;
}

function Flight({ h }: { h: HandshakeView }) {
  const t = useTranslations('pkiLab');
  const f = useFormat();
  const load = cryptoLoad(h, t);
  const crypto = load.reduce((s, r) => s + r.bytes, 0);
  const tr = h.tls.transport;
  const m = h.tls.messages;
  const max = Math.max(TCP_INITIAL_WINDOW * 1.15, tr.tcpServerBytes * 1.05, tr.quicServerBytes * 1.05);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-2 sm:grid-cols-3 font-mono text-xs">
        <div className="rounded-lg border border-[var(--color-border-dim)] p-2.5">
          <div className="text-[var(--color-text-muted)]">{t('budget.chain')}</div>
          <div className="text-lg text-[var(--color-text-base)] tabular-nums">{f.bytes(h.validation.path.reduce((s, c) => s + c.der.length, 0))}</div>
        </div>
        <div className="rounded-lg border border-[var(--color-border-dim)] p-2.5">
          <div className="text-[var(--color-text-muted)]">{t('budget.cryptoLoad')}</div>
          <div className="text-lg text-[var(--color-text-base)] tabular-nums">{f.bytes(crypto)}</div>
        </div>
        <div className="rounded-lg border border-[var(--color-border-dim)] p-2.5">
          <div className="text-[var(--color-text-muted)]">{t('budget.flight')}</div>
          <div className="text-lg text-[var(--color-text-base)] tabular-nums">{f.bytes(tr.tcpServerBytes)}</div>
        </div>
      </div>
      <BudgetBar value={tr.tcpServerBytes} limit={TCP_INITIAL_WINDOW} max={max} label={t('budget.tcp')}
        limitLabel={`${f.bytes(tr.tcpServerBytes)} / ${f.bytes(TCP_INITIAL_WINDOW)}`} />
      <BudgetBar value={tr.quicServerBytes} limit={tr.quicLimit} max={max} label={t('budget.quic', { client: f.n(tr.quicClientBytes) })}
        limitLabel={`${f.bytes(tr.quicServerBytes)} / ${f.bytes(tr.quicLimit)}`} />
      <p className="font-mono text-xs text-[var(--color-text-muted)]">
        {t('budget.eap', { fragments: tr.eapRoundTrips, size: f.n(EAP_FRAGMENT) })}
      </p>
      <Collapsible summary={t('budget.details')}>
        <div className="grid gap-4 sm:grid-cols-2 text-xs font-mono">
          <table className="w-full">
            <caption className="text-left text-[var(--color-text-muted)] pb-1">{t('budget.loadTitle')}</caption>
            <tbody>
              {load.map((r, i) => (
                <tr key={i} className="border-b border-[var(--color-border-dim)]/50">
                  <td className="py-0.5 pr-2 text-[var(--color-text-muted)]">{r.label}</td>
                  <td className="py-0.5 text-right tabular-nums text-[var(--color-text-base)]">{f.bytes(r.bytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="w-full">
            <caption className="text-left text-[var(--color-text-muted)] pb-1">{t('budget.flightTitle')}</caption>
            <tbody>
              {([['ClientHello', h.tls.clientHelloBytes], ['ServerHello', m.serverHello], ['EncryptedExtensions', m.encryptedExtensions],
                ['Certificate', m.certificate], ['CertificateVerify', m.certificateVerify], ['Finished', m.finished]] as const).map(([k, v]) => (
                <tr key={k} className="border-b border-[var(--color-border-dim)]/50">
                  <td className="py-0.5 pr-2 text-[var(--color-text-muted)]">{k}</td>
                  <td className="py-0.5 text-right tabular-nums text-[var(--color-text-base)]">{f.bytes(v)}</td>
                </tr>
              ))}
              <tr><td colSpan={2} className="pt-2 text-[var(--color-text-muted)]">{t('budget.records')}</td></tr>
              {h.tls.records.map((r, i) => (
                <tr key={i} className="border-b border-[var(--color-border-dim)]/50">
                  <td className="py-0.5 pr-2 text-[var(--color-text-muted)]">{t(`budget.record.${r.kind}`)}</td>
                  <td className="py-0.5 text-right tabular-nums text-[var(--color-text-base)]">{f.bytes(r.bytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-[var(--color-text-muted)] leading-relaxed">{t('budget.method')}</p>
        {h.tls.privateUseScheme && <p className="mt-2 text-xs text-amber-300/90 leading-relaxed">{t('budget.privateScheme')}</p>}
      </Collapsible>
    </div>
  );
}

export default function ByteBudget({ handshakes }: { handshakes: HandshakeView[] }) {
  const t = useTranslations('pkiLab');
  // One panel per certificate form actually sent (MTC: landmark-relative and standalone)
  const seen = new Set<string>();
  const panels = handshakes.filter((h) => {
    const key = `${h.presented}:${h.tls.messages.certificate}`;
    if (h.validation.path.length === 0 || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const exceedsTcp = panels.some((h) => h.tls.transport.tcpServerBytes > TCP_INITIAL_WINDOW);
  const exceedsQuic = panels.some((h) => h.tls.transport.quicServerBytes > h.tls.transport.quicLimit);
  return (
    <div className="flex flex-col gap-4">
      {panels.map((h) => (
        <div key={`${h.presented}:${h.tls.messages.certificate}`} className="flex flex-col gap-2">
          {panels.length > 1 && <span className="font-mono text-xs text-[var(--color-primary)]">{t(`presented.${h.presented}`)}</span>}
          <Flight h={h} />
        </div>
      ))}
      <Note tone={exceedsTcp || exceedsQuic ? 'warn' : 'neutral'}>
        {t(exceedsTcp ? 'budget.overTcp' : exceedsQuic ? 'budget.overQuic' : 'budget.explain')}
      </Note>
    </div>
  );
}
