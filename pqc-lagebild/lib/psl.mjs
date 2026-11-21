// Registrable domain (eTLD+1) per the Public Suffix List algorithm
// (https://github.com/publicsuffix/list/wiki/Format#algorithm).
// The list is downloaded once per run and cached; tests pass their own rules.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CACHE_DIR } from './config.mjs';
import { fetchRetry, writeAtomic } from './util.mjs';

const PSL_URL = 'https://publicsuffix.org/list/public_suffix_list.dat';

export class PublicSuffixList {
  constructor(text) {
    this.rules = new Set();
    this.wildcards = new Set();
    this.exceptions = new Set();
    for (const raw of text.split('\n')) {
      const line = raw.trim().split(/\s/)[0];
      if (!line || line.startsWith('//')) continue;
      const rule = domainToAsciiLower(line.replace(/^!/, '').replace(/^\*\./, ''));
      if (line.startsWith('!')) this.exceptions.add(rule);
      else if (line.startsWith('*.')) this.wildcards.add(rule);
      else this.rules.add(rule);
    }
  }

  /** Length (in labels) of the public suffix of `labels` (an array, left to right). */
  suffixLength(labels) {
    let best = 1; // implicit "*" rule
    for (let i = 0; i < labels.length; i++) {
      const candidate = labels.slice(i).join('.');
      const len = labels.length - i;
      if (this.exceptions.has(candidate)) return len - 1;
      if (this.rules.has(candidate) && len > best) best = len;
      const parent = labels.slice(i + 1).join('.');
      if (i + 1 < labels.length && this.wildcards.has(parent) && len > best) best = len;
    }
    return best;
  }

  /** "www.stadt.example.co.uk" → "example.co.uk"; null if the host is itself a public suffix or invalid. */
  registrableDomain(host) {
    const h = normalizeHost(host);
    if (!h) return null;
    const labels = h.split('.');
    const sl = this.suffixLength(labels);
    if (labels.length <= sl) return null;
    return labels.slice(labels.length - sl - 1).join('.');
  }
}

function domainToAsciiLower(s) {
  try {
    return new URL(`http://${s}`).hostname;
  } catch {
    return s.toLowerCase();
  }
}

/** Lower-case ASCII (punycode) host without trailing dot, or null if it is not a DNS name. */
export function normalizeHost(input) {
  if (!input) return null;
  let s = String(input).trim();
  if (/^mailto:|^tel:/i.test(s)) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `http://${s}`;
  let host;
  try {
    const u = new URL(s);
    if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null;
    host = u.hostname;
  } catch {
    return null;
  }
  host = host.replace(/\.$/, '');
  if (!host.includes('.')) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.startsWith('[')) return null;
  if (!/^[a-z0-9.-]+$/.test(host) || host.length > 253) return null;
  return host;
}

export async function loadPublicSuffixList() {
  const path = join(CACHE_DIR, 'public_suffix_list.dat');
  const fresh = existsSync(path) && Date.now() - statSync(path).mtimeMs < 7 * 86400_000;
  if (!fresh) {
    const res = await fetchRetry(PSL_URL);
    const text = await res.text();
    if (!text.includes('// ===BEGIN ICANN DOMAINS===')) throw new Error('public suffix list looks wrong');
    writeAtomic(path, text);
  }
  return new PublicSuffixList(readFileSync(path, 'utf8'));
}
