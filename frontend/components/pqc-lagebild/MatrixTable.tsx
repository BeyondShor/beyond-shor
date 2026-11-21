import { getTranslations } from 'next-intl/server';
import type { MatrixDataset, MatrixResult } from '@/lib/pqc-lagebild';

const SERVER_COLS: [string, string][] = [
  ['nginx-server', 'nginx'], ['apache-server', 'Apache'], ['postfix-server', 'Postfix'], ['openssh-server', 'OpenSSH'],
];
const CLIENT_COLS: [string, string][] = [
  ['openssl-client', 'OpenSSL'], ['curl-client', 'curl'], ['python-client', 'Python'], ['openssh-client', 'OpenSSH'],
  ['go-client', 'Go'], ['java-client', 'Java'], ['node-client', 'Node.js'],
];

function detail(r: MatrixResult): string {
  const parts: string[] = [];
  if (r.version) parts.push(String(r.version));
  if (r.group) parts.push(String(r.group));
  if (Array.isArray(r.keyShares) && r.keyShares.length) parts.push(`key shares: ${r.keyShares.join(', ')}`);
  if (Array.isArray(r.kex) && r.kex.length) parts.push(`kex: ${r.kex.slice(0, 3).join(', ')}${r.kex.length > 3 ? ', …' : ''}`);
  if (r.error) parts.push(String(r.error));
  return parts.join(' · ');
}

function ResultCell({ r, labels }: { r: MatrixResult | undefined; labels: { pq: string; classic: string; na: string } }) {
  if (!r || r.status === 'error' || r.status === 'skipped' || r.pq == null) {
    return <span className="text-[var(--color-text-muted)]" title={r ? detail(r) : labels.na}>–<span className="sr-only">{labels.na}</span></span>;
  }
  return r.pq ? (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] text-emerald-400" title={detail(r)}>
      ✔ {labels.pq}
    </span>
  ) : (
    <span className="inline-flex items-center whitespace-nowrap rounded-full border border-slate-500/30 bg-slate-500/10 px-2 py-0.5 font-mono text-[11px] text-slate-300" title={detail(r)}>
      ✘<span className="sr-only"> {labels.classic}</span>
    </span>
  );
}

export default async function MatrixTable({ matrix, locale }: { matrix: MatrixDataset; locale: string }) {
  const t = await getTranslations({ locale, namespace: 'pqcLagebild' });
  const has = (k: string) => matrix.releases.some((r) => r.results?.[k]);
  const servers = SERVER_COLS.filter(([k]) => has(k));
  const clients = CLIENT_COLS.filter(([k]) => has(k));
  const labels = { pq: t('matrix.pq'), classic: t('matrix.classic'), na: t('matrix.na') };
  const order = ['debian', 'ubuntu', 'almalinux', 'rhel', 'rocky', 'fedora', 'alpine'];
  const rank = (d: string) => { const i = order.indexOf(d.toLowerCase()); return i < 0 ? order.length : i; };
  const releases = [...matrix.releases].sort((a, b) => rank(a.distro) - rank(b.distro) || a.distro.localeCompare(b.distro) || b.version.localeCompare(a.version, undefined, { numeric: true }));

  return (
    <div className="relative overflow-x-auto rounded-xl border border-[var(--color-border)]">
      <table className="min-w-full text-sm">
        <caption className="sr-only">{t('matrixTitle')}</caption>
        <thead className="bg-[var(--color-bg-base)]/60 text-left">
          <tr className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">
            <th scope="col" rowSpan={2} className="px-4 py-2 align-bottom">{t('matrix.release')}</th>
            {servers.length > 0 && <th scope="colgroup" colSpan={servers.length} className="border-l border-[var(--color-border-dim)] px-3 pt-2">{t('matrix.servers')}</th>}
            {clients.length > 0 && <th scope="colgroup" colSpan={clients.length} className="border-l border-[var(--color-border-dim)] px-3 pt-2">{t('matrix.clients')}</th>}
          </tr>
          <tr className="text-xs text-[var(--color-text-base)]">
            {servers.map(([k, l], i) => <th key={k} scope="col" className={`px-3 pb-2 font-semibold ${i === 0 ? 'border-l border-[var(--color-border-dim)]' : ''}`}>{l}</th>)}
            {clients.map(([k, l], i) => <th key={k} scope="col" className={`px-3 pb-2 font-semibold ${i === 0 ? 'border-l border-[var(--color-border-dim)]' : ''}`}>{l}</th>)}
          </tr>
        </thead>
        <tbody>
          {releases.map((r) => (
            <tr key={r.id} className="border-t border-[var(--color-border-dim)]">
              <th scope="row" className="whitespace-nowrap px-4 py-2.5 text-left font-normal">
                <span className="text-[var(--color-text-base)]">{prettyDistro(r.distro)} {r.version}</span>
                {r.lts && <span className="ml-2 font-mono text-[10px] text-[var(--color-text-muted)]">LTS</span>}
                {shortVersion(r.packages?.openssl) && <span className="block font-mono text-[10px] text-[var(--color-text-muted)]">OpenSSL {shortVersion(r.packages?.openssl)}</span>}
              </th>
              {servers.map(([k], i) => <td key={k} className={`px-3 py-2.5 ${i === 0 ? 'border-l border-[var(--color-border-dim)]' : ''}`}><ResultCell r={r.results?.[k]} labels={labels} /></td>)}
              {clients.map(([k], i) => <td key={k} className={`px-3 py-2.5 ${i === 0 ? 'border-l border-[var(--color-border-dim)]' : ''}`}><ResultCell r={r.results?.[k]} labels={labels} /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-[var(--color-border-dim)] px-4 py-2.5 font-mono text-[11px] text-[var(--color-text-muted)]">
        ✔ {labels.pq} = {t('matrix.legendPq')} · ✘ = {t('matrix.legendClassic')} · – = {labels.na}
      </p>
    </div>
  );
}

/** "OpenSSL 3.5.9 29 Sep 2026 (Library: …)" → "3.5.9" */
function shortVersion(v: string | null | undefined): string | null {
  if (!v) return null;
  return /\d+\.\d+(?:\.\d+)?[a-z]?/.exec(v)?.[0] ?? null;
}

function prettyDistro(d: string): string {
  const map: Record<string, string> = { debian: 'Debian', ubuntu: 'Ubuntu', rhel: 'RHEL (UBI)', ubi: 'RHEL (UBI)', almalinux: 'AlmaLinux', rocky: 'Rocky Linux', alpine: 'Alpine', fedora: 'Fedora' };
  return map[d.toLowerCase()] ?? d;
}
