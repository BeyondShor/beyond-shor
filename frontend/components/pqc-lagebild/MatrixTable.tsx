import { getTranslations } from 'next-intl/server';
import type { MatrixDataset, MatrixRelease, MatrixResult } from '@/lib/pqc-lagebild';

// Column order and labels; a column is shown only if some release in the table has it.
const SERVER_COLS: [string, string][] = [
  ['nginx-server', 'nginx'], ['apache-server', 'Apache'], ['postfix-server', 'Postfix'], ['openssh-server', 'OpenSSH'],
  ['schannel-server', 'Schannel'],
];
const CLIENT_COLS: [string, string][] = [
  ['openssl-client', 'OpenSSL'], ['curl-client', 'curl'], ['python-client', 'Python'], ['openssh-client', 'OpenSSH'],
  ['powershell-client', 'PowerShell'], ['dotnet-client', '.NET'], ['urlsession-client', 'URLSession'],
  ['network-framework-client', 'Network.framework'],
];
const DISTRO_ORDER = ['windows', 'macos', 'debian', 'ubuntu', 'rhel', 'almalinux', 'rockylinux', 'oraclelinux', 'centos-stream',
  'fedora', 'amazonlinux', 'sles', 'opensuse-leap', 'opensuse-tumbleweed', 'archlinux', 'alpine'];

// Short, language-neutral names (the dataset's own names can be long or localized).
const DISPLAY: Record<string, string> = {
  debian: 'Debian', ubuntu: 'Ubuntu', almalinux: 'AlmaLinux', rockylinux: 'Rocky Linux', oraclelinux: 'Oracle Linux',
  'centos-stream': 'CentOS Stream', fedora: 'Fedora', amazonlinux: 'Amazon Linux', sles: 'SLES',
  'opensuse-leap': 'openSUSE Leap', 'opensuse-tumbleweed': 'openSUSE Tumbleweed', archlinux: 'Arch Linux', alpine: 'Alpine',
};

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
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 font-mono text-[11px] text-emerald-400" title={detail(r)}>
      ✔<span className="sr-only"> {labels.pq}</span>
    </span>
  ) : (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-500/30 bg-slate-500/10 font-mono text-[11px] text-slate-300" title={detail(r)}>
      ✘<span className="sr-only"> {labels.classic}</span>
    </span>
  );
}

/** "OpenSSL 3.5.9 29 Sep 2026 (Library: …)" → "3.5.9" */
function shortVersion(v: string | null | undefined): string | null {
  if (!v) return null;
  return /\d+\.\d+(?:\.\d+)?[a-z]?/.exec(v)?.[0] ?? null;
}

function sortReleases(list: MatrixRelease[]): MatrixRelease[] {
  const rank = (d: string) => { const i = DISTRO_ORDER.indexOf(d.toLowerCase()); return i < 0 ? DISTRO_ORDER.length : i; };
  return [...list].sort((a, b) => rank(a.distro) - rank(b.distro) || a.distro.localeCompare(b.distro)
    || b.version.localeCompare(a.version, undefined, { numeric: true }));
}

async function Table({ releases, caption, locale, showOpenssl }: { releases: MatrixRelease[]; caption: string; locale: string; showOpenssl: boolean }) {
  const t = await getTranslations({ locale, namespace: 'pqcLagebild' });
  const has = (k: string) => releases.some((r) => r.results?.[k]);
  const servers = SERVER_COLS.filter(([k]) => has(k));
  const clients = CLIENT_COLS.filter(([k]) => has(k));
  const labels = { pq: t('matrix.pq'), classic: t('matrix.classic'), na: t('matrix.na') };

  return (
    <div className="relative overflow-x-auto rounded-xl border border-[var(--color-border)]">
      <table className="min-w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-[var(--color-bg-base)]/60 text-left">
          <tr className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">
            <th scope="col" rowSpan={2} className="px-3 py-2 align-bottom">{t('matrix.release')}</th>
            {servers.length > 0 && <th scope="colgroup" colSpan={servers.length} className="border-l border-[var(--color-border-dim)] px-2 pt-2">{t('matrix.servers')}</th>}
            {clients.length > 0 && <th scope="colgroup" colSpan={clients.length} className="border-l border-[var(--color-border-dim)] px-2 pt-2">{t('matrix.clients')}</th>}
          </tr>
          <tr className="text-xs text-[var(--color-text-base)]">
            {servers.map(([k, l], i) => <th key={k} scope="col" className={`px-2 pb-2 text-center font-semibold ${i === 0 ? 'border-l border-[var(--color-border-dim)]' : ''}`}>{l}</th>)}
            {clients.map(([k, l], i) => <th key={k} scope="col" className={`px-2 pb-2 text-center font-semibold ${i === 0 ? 'border-l border-[var(--color-border-dim)]' : ''}`}>{l}</th>)}
          </tr>
        </thead>
        <tbody>
          {releases.map((r) => (
            <tr key={r.id} className="border-t border-[var(--color-border-dim)]">
              <th scope="row" className="whitespace-nowrap px-3 py-2 text-left font-normal">
                <span className="text-[var(--color-text-base)]">{DISPLAY[r.distro] ?? r.name ?? r.distro}{r.rolling ? '' : ` ${r.version}`}</span>
                {r.lts && <span className="ml-2 font-mono text-[10px] text-[var(--color-text-muted)]">LTS</span>}
                {r.rolling && <span className="ml-2 font-mono text-[10px] text-[var(--color-text-muted)]">rolling</span>}
                {showOpenssl && shortVersion(r.packages?.openssl) && <span className="block font-mono text-[10px] text-[var(--color-text-muted)]">OpenSSL {shortVersion(r.packages?.openssl)}</span>}
              </th>
              {servers.map(([k], i) => <td key={k} className={`px-2 py-2 text-center ${i === 0 ? 'border-l border-[var(--color-border-dim)]' : ''}`}><ResultCell r={r.results?.[k]} labels={labels} /></td>)}
              {clients.map(([k], i) => <td key={k} className={`px-2 py-2 text-center ${i === 0 ? 'border-l border-[var(--color-border-dim)]' : ''}`}><ResultCell r={r.results?.[k]} labels={labels} /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-[var(--color-border-dim)] px-4 py-2.5 font-mono text-[11px] text-[var(--color-text-muted)]">
        ✔ = {t('matrix.legendPq')} · ✘ = {t('matrix.legendClassic')} · – = {labels.na}
      </p>
    </div>
  );
}

export default async function MatrixTable({ matrix, locale }: { matrix: MatrixDataset; locale: string }) {
  const t = await getTranslations({ locale, namespace: 'pqcLagebild' });
  const runner = matrix.releases.filter((r) => r.source === 'github-hosted-runner');
  // one table per system family, so every table only has columns that exist on that system
  const groups: [string, MatrixRelease[], boolean][] = [
    [t('matrix.windowsTitle'), sortReleases(runner.filter((r) => r.distro === 'windows')), false],
    [t('matrix.macosTitle'), sortReleases(runner.filter((r) => r.distro === 'macos')), false],
    [t('matrix.linuxTitle'), sortReleases(matrix.releases.filter((r) => r.source !== 'github-hosted-runner')), true],
  ];
  return (
    <div className="space-y-8">
      {groups.filter(([, list]) => list.length > 0).map(([title, list, linux]) => (
        <div key={title}>
          <h3 className="mb-3 text-lg font-semibold text-[var(--color-text-base)]">{title}</h3>
          <Table releases={list} caption={title} locale={locale} showOpenssl={linux} />
        </div>
      ))}
    </div>
  );
}
