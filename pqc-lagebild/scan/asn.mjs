// Hosting class of an IP address, offline: iptoasn.com (PDDL v1.0) maps IPv4 ranges to ASNs,
// AWS publishes the CloudFront ranges. Nothing about the scanned domains leaves this host.
//
//   cdn    TLS terminated by a CDN / reverse-proxy provider (PQ is the provider's decision)
//   cloud  hyperscaler networks (load balancers, VMs — PQ may or may not be the customer's choice)
//   other  classic hosters and own infrastructure

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { CACHE_DIR } from '../lib/config.mjs';
import { fetchRetry, writeAtomic } from '../lib/util.mjs';

const IP2ASN_URL = 'https://iptoasn.com/data/ip2asn-v4.tsv.gz';
const AWS_RANGES_URL = 'https://ip-ranges.amazonaws.com/ip-ranges.json';

// Matched against the AS description from iptoasn (registry names, upper-case).
const CDN_AS = /\b(CLOUDFLARE|AKAMAI|FASTLY|CDN77|DATACAMP|BUNNYWAY|G-CORE|GCORE|EDGECAST|LIMELIGHT|EDGIO|INCAPSULA|IMPERVA|SUCURI|MYRA|STACKPATH|HIGHWINDS|CACHEFLY|KEYCDN|PROINITY|MEDIANOVA|CDNETWORKS|LINK11|VERCEL|NETLIFY)/;
const CLOUD_AS = /\b(AMAZON|GOOGLE|MICROSOFT|ORACLE|ALIBABA|TENCENT|IBM-CLOUD|SOFTLAYER)/;

export function ipToInt(ip) {
  const p = ip.split('.');
  if (p.length !== 4) return null;
  return ((Number(p[0]) << 24) >>> 0) + (Number(p[1]) << 16) + (Number(p[2]) << 8) + Number(p[3]);
}

function cidrToRange(cidr) {
  const [ip, bits] = cidr.split('/');
  const start = ipToInt(ip);
  const size = 2 ** (32 - Number(bits));
  return [start, start + size - 1];
}

async function cached(name, url, maxAgeDays) {
  const path = join(CACHE_DIR, name);
  if (!existsSync(path) || Date.now() - statSync(path).mtimeMs > maxAgeDays * 86400_000) {
    const res = await fetchRetry(url);
    writeAtomic(path, Buffer.from(await res.arrayBuffer()));
  }
  return readFileSync(path);
}

// Display names for the networks that host many sites. Matched against the AS description;
// anything else falls back to a cleaned-up AS name. Order matters (first match wins).
const PROVIDER_NAMES = [
  [/CLOUDFLARE/, 'Cloudflare'], [/AKAMAI|LINODE/, 'Akamai'], [/FASTLY/, 'Fastly'],
  [/AMAZON/, 'Amazon (AWS)'], [/GOOGLE/, 'Google'], [/MICROSOFT/, 'Microsoft (Azure)'],
  [/ORACLE/, 'Oracle'], [/ALIBABA/, 'Alibaba'], [/TENCENT/, 'Tencent'],
  [/IONOS|1AND1|ONEANDONE|1&1|FASTHOSTS|ARSYS/, 'IONOS'], [/STRATO/, 'Strato'], [/HETZNER/, 'Hetzner'],
  [/\bOVH/, 'OVHcloud'], [/HOSTINGER/, 'Hostinger'], [/CONTABO/, 'Contabo'], [/NETCUP/, 'netcup'],
  [/ALL-INKL|ALLINKL|NEUE MEDIEN/, 'ALL-INKL'], [/MITTWALD/, 'Mittwald'], [/HOSTEUROPE|HOST EUROPE/, 'Host Europe'],
  [/PLUSSERVER|PLUSLINE/, 'plusserver'], [/DOMAINFACTORY|DF-/, 'domainfactory'], [/DIGITALOCEAN/, 'DigitalOcean'],
  [/SCALEWAY|ONLINE S\.A\.S/, 'Scaleway'], [/INFOMANIAK/, 'Infomaniak'], [/ARUBA/, 'Aruba'], [/REGISTER/, 'Register.it'],
  [/LEASEWEB/, 'Leaseweb'], [/TRANSIP/, 'TransIP'], [/ONE\.COM|ONECOM/, 'one.com'], [/GANDI/, 'Gandi'],
  [/WIX/, 'Wix'], [/SQUARESPACE/, 'Squarespace'], [/SHOPIFY/, 'Shopify'], [/AUTOMATTIC/, 'Automattic (WordPress.com)'],
  [/GITHUB/, 'GitHub'], [/VERCEL/, 'Vercel'], [/NETLIFY/, 'Netlify'], [/BUNNY/, 'bunny.net'], [/CDN77|DATACAMP/, 'CDN77'],
  [/G-CORE|GCORE/, 'Gcore'], [/IMPERVA|INCAPSULA/, 'Imperva'], [/SUCURI/, 'Sucuri'], [/MYRA/, 'Myra Security'],
  [/LINK11/, 'Link11'], [/EDGECAST|EDGIO|LIMELIGHT/, 'Edgio'], [/DTAG|DEUTSCHE TELEKOM|T-SYSTEMS/, 'Deutsche Telekom'],
  [/VODAFONE/, 'Vodafone'], [/SWISSCOM/, 'Swisscom'], [/ORANGE/, 'Orange'], [/TELEFONICA/, 'Telefónica'],
  [/COMBELL/, 'Combell'], [/VSHOSTING/, 'VSHosting'], [/WEDOS/, 'WEDOS'], [/ACTIVE24/, 'Active24'], [/HOME\.PL|HOMEPL/, 'home.pl'],
  [/NAZWA/, 'nazwa.pl'], [/HOSTNET/, 'Hostnet'], [/ANTAGONIST/, 'Antagonist'], [/LOOPIA/, 'Loopia'], [/ZONE MEDIA|ZONEMEDIA/, 'Zone'],
  [/WEBGO/, 'webgo'], [/ALFAHOSTING/, 'Alfahosting'], [/SITEGROUND/, 'SiteGround'], [/GODADDY/, 'GoDaddy'],
  [/NEWFOLD|BLUEHOST|UNIFIED LAYER/, 'Newfold Digital'], [/VULTR|CHOOPA/, 'Vultr'], [/HOSTPOINT/, 'Hostpoint'],
  [/PROXIMUS/, 'Proximus'], [/\bKPN\b/, 'KPN'], [/\bA1 /, 'A1'], [/SEEWEB/, 'Seeweb'],
];

/**
 * Display name of a publicly bookable provider, or null. Only commercial CDNs, clouds, hosters and
 * carriers are ever named: captive networks (a banking group's IT, municipal IT, research and state
 * networks) would let readers infer the posture of specific (critical) organisations.
 */
/** Every name providerName() can return (plus CloudFront from the AWS ranges). */
export const KNOWN_PROVIDERS = new Set([...PROVIDER_NAMES.map(([, n]) => n), 'Amazon CloudFront']);

export function providerName(desc) {
  const D = desc.toUpperCase();
  for (const [re, name] of PROVIDER_NAMES) if (re.test(D)) return name;
  return null;
}

export class HostingClassifier {
  constructor(ip2asnTsv, awsRanges) {
    const starts = [];
    const ends = [];
    const classes = [];
    const providers = [];
    const names = new Map();
    for (const line of ip2asnTsv.split('\n')) {
      const [s, e, asn, , desc = ''] = line.split('\t');
      if (!s || asn === '0') continue;
      const D = desc.toUpperCase();
      const cls = CDN_AS.test(D) ? 'cdn' : CLOUD_AS.test(D) ? 'cloud' : 'other';
      if (!names.has(desc)) names.set(desc, providerName(desc));
      starts.push(ipToInt(s));
      ends.push(ipToInt(e));
      classes.push(cls);
      providers.push(names.get(desc));
    }
    this.starts = Uint32Array.from(starts);
    this.ends = Uint32Array.from(ends);
    this.classes = classes;
    this.providers = providers;
    this.cloudfront = (awsRanges?.prefixes ?? [])
      .filter((p) => p.service === 'CLOUDFRONT')
      .map((p) => cidrToRange(p.ip_prefix))
      .sort((a, b) => a[0] - b[0]);
  }

  /** { hosting: 'cdn' | 'cloud' | 'other' | 'unknown', provider: display name or null } */
  classify(ip) {
    const n = ipToInt(ip);
    if (n === null) return { hosting: 'unknown', provider: null }; // IPv6: rare, reported separately
    for (const [s, e] of this.cloudfront) if (n >= s && n <= e) return { hosting: 'cdn', provider: 'Amazon CloudFront' };
    let lo = 0;
    let hi = this.starts.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (n < this.starts[mid]) hi = mid - 1;
      else if (n > this.ends[mid]) lo = mid + 1;
      else return { hosting: this.classes[mid], provider: this.providers[mid] };
    }
    return { hosting: 'other', provider: null };
  }
}

export async function loadHostingClassifier() {
  const tsv = gunzipSync(await cached('ip2asn-v4.tsv.gz', IP2ASN_URL, 7)).toString('utf8');
  const aws = JSON.parse((await cached('aws-ip-ranges.json', AWS_RANGES_URL, 7)).toString('utf8'));
  return new HostingClassifier(tsv, aws);
}
