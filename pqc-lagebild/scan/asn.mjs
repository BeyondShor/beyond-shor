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

export class HostingClassifier {
  constructor(ip2asnTsv, awsRanges) {
    const starts = [];
    const ends = [];
    const classes = [];
    for (const line of ip2asnTsv.split('\n')) {
      const [s, e, asn, , desc = ''] = line.split('\t');
      if (!s || asn === '0') continue;
      const D = desc.toUpperCase();
      const cls = CDN_AS.test(D) ? 'cdn' : CLOUD_AS.test(D) ? 'cloud' : 'other';
      starts.push(ipToInt(s));
      ends.push(ipToInt(e));
      classes.push(cls);
    }
    this.starts = Uint32Array.from(starts);
    this.ends = Uint32Array.from(ends);
    this.classes = classes;
    this.cloudfront = (awsRanges?.prefixes ?? [])
      .filter((p) => p.service === 'CLOUDFRONT')
      .map((p) => cidrToRange(p.ip_prefix))
      .sort((a, b) => a[0] - b[0]);
  }

  classify(ip) {
    const n = ipToInt(ip);
    if (n === null) return 'unknown'; // IPv6: rare enough to report separately
    for (const [s, e] of this.cloudfront) if (n >= s && n <= e) return 'cdn';
    let lo = 0;
    let hi = this.starts.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (n < this.starts[mid]) hi = mid - 1;
      else if (n > this.ends[mid]) lo = mid + 1;
      else return this.classes[mid];
    }
    return 'other';
  }
}

export async function loadHostingClassifier() {
  const tsv = gunzipSync(await cached('ip2asn-v4.tsv.gz', IP2ASN_URL, 7)).toString('utf8');
  const aws = JSON.parse((await cached('aws-ip-ranges.json', AWS_RANGES_URL, 7)).toString('utf8'));
  return new HostingClassifier(tsv, aws);
}
