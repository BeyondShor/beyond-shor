// Import the Windows/macOS results that the pqc-matrix-os GitHub workflow writes to the
// data branch. Whatever comes in is checked for schema and age and rebuilt field by field
// from a whitelist before it gets near our signature: we sign it, so we decide its shape.

import { fetchRetry } from '../lib/util.mjs';

export const OS_MATRIX_URL = process.env.PQSCAN_OS_MATRIX_URL
  ?? 'https://raw.githubusercontent.com/BeyondShor/beyond-shor/pqc-matrix-data/os-matrix.json';
export const OS_SCHEMA = 'beyond-shor/os-matrix@1';
export const MAX_AGE_DAYS = 40;

const str = (v, max = 120) => (typeof v === 'string' && v.length > 0 ? v.slice(0, max) : null);
const bool = (v) => (typeof v === 'boolean' ? v : undefined);
const strList = (v, maxItems = 40, max = 60) =>
  Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, maxItems).map((x) => x.slice(0, max)) : undefined;

function sanitizeResult(r) {
  if (!r || typeof r !== 'object') return null;
  const out = { status: r.status === 'ok' ? 'ok' : 'error' };
  for (const k of ['version', 'group', 'protocol', 'preferred', 'reason']) {
    const v = str(r[k], 300);
    if (v !== null) out[k] = v;
  }
  for (const k of ['pq', 'pqOffered', 'tls13', 'acceptsX25519MLKEM768', 'tls']) {
    const v = bool(r[k]);
    if (v !== undefined) out[k] = v;
  }
  for (const k of ['keyShares', 'groups', 'kex']) {
    const v = strList(r[k]);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/** Rebuild one runner release from known fields only; null if it is not a usable release. */
export function sanitizeRelease(r) {
  if (!r || typeof r !== 'object') return null;
  if (r.distro !== 'windows' && r.distro !== 'macos') return null;
  if (typeof r.id !== 'string' || !/^(windows|macos)-[a-z0-9.-]{1,40}$/.test(r.id)) return null;
  const results = {};
  for (const [k, v] of Object.entries(r.results ?? {}).slice(0, 20)) {
    if (!/^[a-z0-9-]{1,40}$/.test(k)) continue;
    const s = sanitizeResult(v);
    if (s) results[k] = s;
  }
  const packages = {};
  for (const [k, v] of Object.entries(r.packages ?? {}).slice(0, 30)) {
    if (/^[a-z0-9-]{1,40}$/.test(k) && str(v, 300)) packages[k] = str(v, 300);
  }
  return {
    id: r.id,
    distro: r.distro,
    name: str(r.name) ?? (r.distro === 'windows' ? 'Windows' : 'macOS'),
    version: str(r.version),
    osBuild: str(r.osBuild),
    arch: str(r.arch, 20),
    runnerImage: str(r.runnerImage),
    image: str(r.image),
    source: 'github-hosted-runner',
    packages,
    results,
    errors: strList(r.errors, 10, 300) ?? [],
    testedAt: str(r.testedAt, 40),
  };
}

/** Validate a parsed os-matrix.json. Returns { status, releases, generatedAt, workflow, reason }. */
export function validateOsMatrix(data, now = new Date()) {
  if (!data || data.schema !== OS_SCHEMA) return { status: 'invalid', releases: [], reason: 'unexpected schema' };
  const generated = Date.parse(data.generatedAt);
  if (Number.isNaN(generated)) return { status: 'invalid', releases: [], reason: 'generatedAt missing' };
  const ageDays = (now.getTime() - generated) / 86_400_000;
  const generatedAt = new Date(generated).toISOString();
  if (ageDays > MAX_AGE_DAYS) return { status: 'stale', releases: [], generatedAt, reason: `${Math.floor(ageDays)} days old` };
  if (ageDays < -1) return { status: 'invalid', releases: [], generatedAt, reason: 'generatedAt in the future' };
  const releases = (Array.isArray(data.releases) ? data.releases : []).map(sanitizeRelease).filter(Boolean);
  if (releases.length === 0) return { status: 'invalid', releases: [], generatedAt, reason: 'no usable releases' };
  const workflow = {
    runId: str(String(data.workflow?.runId ?? ''), 30),
    url: /^https:\/\/github\.com\/BeyondShor\/beyond-shor\/actions\/runs\/\d+$/.test(data.workflow?.url ?? '') ? data.workflow.url : null,
    commit: /^[0-9a-f]{40}$/.test(data.workflow?.commit ?? '') ? data.workflow.commit : null,
  };
  return { status: 'included', releases, generatedAt, workflow, reason: null };
}

/** Fetch and validate. Never throws: a missing or broken file must not stop the Linux matrix. */
export async function fetchOsMatrix(url = OS_MATRIX_URL, now = new Date()) {
  try {
    const res = await fetchRetry(url, { retries: 2, timeoutMs: 30_000 });
    const text = await res.text();
    if (text.length > 2_000_000) return { status: 'invalid', releases: [], url, reason: 'file too large' };
    return { ...validateOsMatrix(JSON.parse(text), now), url };
  } catch (err) {
    const missing = /HTTP 404/.test(err.message ?? '');
    return { status: missing ? 'missing' : 'error', releases: [], url, reason: String(err.message ?? err).slice(0, 200) };
  }
}
