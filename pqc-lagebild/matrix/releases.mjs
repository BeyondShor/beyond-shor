// Which releases to test: every currently supported release of the distributions
// below, discovered from endoflife.date each run — new releases appear by themselves,
// end-of-life releases drop out.
//
// Images come from AWS ECR Public's mirror of the Docker Official Images, because
// Docker Hub allows only a handful of anonymous pulls per hour. RHEL is represented by
// AlmaLinux (binary-compatible, same crypto-policies): the UBI images lack server
// packages such as postfix without a subscription.

import { fetchRetry } from '../lib/util.mjs';

const MIRROR = 'public.ecr.aws/docker/library';

export const DISTROS = [
  { distro: 'debian', product: 'debian', family: 'deb', name: 'Debian' },
  { distro: 'ubuntu', product: 'ubuntu', family: 'deb', name: 'Ubuntu', ltsOnly: true },
  { distro: 'almalinux', product: 'almalinux', family: 'rpm', name: 'AlmaLinux (RHEL-kompatibel)' },
  { distro: 'fedora', product: 'fedora', family: 'rpm', name: 'Fedora' },
  { distro: 'alpine', product: 'alpine-linux', family: 'apk', name: 'Alpine Linux' },
];

/** True if a release (an endoflife.date cycle) is supported on `today` (YYYY-MM-DD). */
export function isSupported(cycle, today) {
  const eol = cycle.eol;
  if (eol === false) return true;
  if (eol === true) return false;
  return typeof eol === 'string' && eol > today && (!cycle.releaseDate || cycle.releaseDate <= today);
}

/** Map endoflife.date cycles of one distro to matrix releases. */
export function releasesFor(def, cycles, today) {
  return cycles
    .filter((c) => isSupported(c, today))
    .filter((c) => !def.ltsOnly || c.lts === true)
    .map((c) => ({
      id: `${def.distro}-${c.cycle}`,
      distro: def.distro,
      name: def.name,
      family: def.family,
      version: String(c.cycle),
      latest: c.latest ? String(c.latest) : null,
      codename: c.codename ?? null,
      lts: c.lts === true || (typeof c.lts === 'string' && c.lts > today),
      eol: typeof c.eol === 'string' ? c.eol : null,
      image: `${MIRROR}/${def.distro}:${c.cycle}`,
    }))
    .sort((a, b) => b.version.localeCompare(a.version, 'en', { numeric: true }));
}

export async function discoverReleases(today = new Date().toISOString().slice(0, 10)) {
  const out = [];
  for (const def of DISTROS) {
    const res = await fetchRetry(`https://endoflife.date/api/${def.product}.json`, { timeoutMs: 30_000 });
    const cycles = await res.json();
    if (!Array.isArray(cycles) || cycles.length === 0) throw new Error(`endoflife.date: no cycles for ${def.product}`);
    out.push(...releasesFor(def, cycles, today));
  }
  return out;
}
