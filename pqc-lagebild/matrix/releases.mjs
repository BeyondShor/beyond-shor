// Which releases to test: every currently supported release of the distributions
// below, discovered from endoflife.date each run — new releases appear by themselves,
// end-of-life releases drop out. Rolling distributions are one entry each, dated by run.
//
// Images: Docker Official Images come from AWS ECR Public's mirror, because Docker Hub
// allows only a handful of anonymous pulls per hour. Everything else comes from the
// vendor's own registry. RHEL is represented by its rebuilds (AlmaLinux, Rocky, Oracle;
// same crypto-policies): the UBI images lack server packages such as postfix without a
// subscription. SLES is tested via SUSE's BCI base images, whose free repository carries
// all packages we need — no registration involved.

import { fetchRetry } from '../lib/util.mjs';

const MIRROR = 'public.ecr.aws/docker/library';

export const DISTROS = [
  { distro: 'debian', product: 'debian', family: 'deb', name: 'Debian' },
  { distro: 'ubuntu', product: 'ubuntu', family: 'deb', name: 'Ubuntu', ltsOnly: true },
  { distro: 'almalinux', product: 'almalinux', family: 'rpm', name: 'AlmaLinux (RHEL-kompatibel)' },
  { distro: 'rockylinux', product: 'rocky-linux', family: 'rpm', name: 'Rocky Linux (RHEL-kompatibel)', image: (c) => `quay.io/rockylinux/rockylinux:${c}` },
  { distro: 'oraclelinux', product: 'oracle-linux', family: 'rpm', name: 'Oracle Linux', image: (c) => `${MIRROR}/oraclelinux:${c}` },
  { distro: 'centos-stream', product: 'centos-stream', family: 'rpm', name: 'CentOS Stream', image: (c) => `quay.io/centos/centos:stream${c}` },
  { distro: 'fedora', product: 'fedora', family: 'rpm', name: 'Fedora' },
  { distro: 'amazonlinux', product: 'amazon-linux', family: 'rpm', name: 'Amazon Linux', image: (c) => `${MIRROR}/amazonlinux:${c}` },
  { distro: 'opensuse-leap', product: 'opensuse', family: 'zypper', name: 'openSUSE Leap', image: (c) => `registry.opensuse.org/opensuse/leap:${c}` },
  { distro: 'sles', product: 'sles', family: 'zypper', name: 'SUSE Linux Enterprise Server (BCI)', image: (c) => `registry.suse.com/bci/bci-base:${c}` },
  { distro: 'alpine', product: 'alpine-linux', family: 'apk', name: 'Alpine Linux' },
];

export const ROLLING = [
  { distro: 'opensuse-tumbleweed', family: 'zypper', name: 'openSUSE Tumbleweed', image: 'registry.opensuse.org/opensuse/tumbleweed:latest' },
  { distro: 'archlinux', family: 'pacman', name: 'Arch Linux', image: `${MIRROR}/archlinux:latest` },
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
      rolling: false,
      eol: typeof c.eol === 'string' ? c.eol : null,
      image: def.image ? def.image(c.cycle) : `${MIRROR}/${def.distro}:${c.cycle}`,
    }))
    .sort((a, b) => b.version.localeCompare(a.version, 'en', { numeric: true }));
}

/** Rolling releases: one entry each; the version is the test date (packages say the rest). */
export function rollingReleases(today) {
  return ROLLING.map((r) => ({
    id: r.distro, distro: r.distro, name: r.name, family: r.family,
    version: today, latest: null, codename: null, lts: false, rolling: true, eol: null, image: r.image,
  }));
}

/** All releases to test. A distro whose lookup fails is skipped and noted in `errors`. */
export async function discoverReleases(today = new Date().toISOString().slice(0, 10), errors = []) {
  const out = [];
  for (const def of DISTROS) {
    try {
      const res = await fetchRetry(`https://endoflife.date/api/${def.product}.json`, { timeoutMs: 30_000 });
      const cycles = await res.json();
      if (!Array.isArray(cycles) || cycles.length === 0) throw new Error('no cycles');
      out.push(...releasesFor(def, cycles, today));
    } catch (err) {
      errors.push(`endoflife.date/${def.product}: ${err.message}`);
    }
  }
  out.push(...rollingReleases(today));
  return out;
}
