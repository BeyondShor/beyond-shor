// Turning a website URL from a source list into the unit we measure:
//   site — host without a leading "www.", lower-case ASCII (dedupe key, what gets probed)
//   zone — registrable domain (eTLD+1) of that host, for DNSSEC
// plus the rules that drop URLs which are not an organisation's own website.

import { normalizeHost } from '../../lib/psl.mjs';

// Zones whose hosts are platforms, social networks, link shorteners or archives — a profile page
// there is not the organisation's own web server, so measuring it would measure the platform.
export const PLATFORM_ZONES = new Set([
  'facebook.com', 'fb.com', 'instagram.com', 'twitter.com', 'x.com', 'linkedin.com', 'xing.com',
  'youtube.com', 'youtu.be', 'tiktok.com', 'pinterest.com', 'flickr.com', 'vimeo.com', 't.me',
  'wikipedia.org', 'wikimedia.org', 'wikidata.org', 'archive.org', 'webcitation.org', 'archive.today', 'archive.ph',
  'google.com', 'goo.gl', 'bit.ly', 'tinyurl.com', 'linktr.ee',
  'blogspot.com', 'wordpress.com', 'wix.com', 'wixsite.com', 'jimdo.com', 'jimdofree.com', 'jimdosite.com',
  'weebly.com', 'squarespace.com', 'tumblr.com', 'medium.com', 'substack.com', 'webnode.page', 'strikingly.com',
  'github.com', 'gitlab.com', 'yelp.com', 'tripadvisor.com', 'foursquare.com', 'google.de',
]);

// Hosts under these suffixes are user sites on shared platforms. Some are public suffixes in the
// PSL (so the zone is the user's own label), which is why they are matched on the host.
export const PLATFORM_HOST_SUFFIXES = [
  '.github.io', '.gitlab.io', '.blogspot.com', '.wordpress.com', '.wixsite.com', '.jimdofree.com',
  '.jimdosite.com', '.weebly.com', '.business.site', '.netlify.app', '.vercel.app', '.pages.dev',
  '.sites.google.com',
];

/** URL or host → { site, zone } or null if it is not a usable DNS name. */
export function siteFromUrl(url, psl) {
  const host = normalizeHost(url);
  if (!host) return null;
  const site = host.startsWith('www.') ? host.slice(4) : host;
  const zone = psl.registrableDomain(site);
  if (!zone) return null;
  return { site, zone };
}

export function isPlatform(site, zone) {
  if (PLATFORM_ZONES.has(zone) || PLATFORM_ZONES.has(site)) return true;
  const host = `.${site}`;
  return PLATFORM_HOST_SUFFIXES.some((s) => host.endsWith(s));
}

// A site that is listed as the website of more than SHARED_MAX_ORGS organisations spanning at
// least SHARED_MIN_GROUPS different category/sector groups is a portal or platform we did not
// know about (e.g. a regional hosting portal), not one organisation's own site. Sites shared by
// many organisations of the same kind (e.g. a joint site of several municipalities) are kept once.
export const SHARED_MAX_ORGS = 5;
export const SHARED_MIN_GROUPS = 3;

export function isSharedPlatform(assignments) {
  if (assignments.length <= SHARED_MAX_ORGS) return false;
  const groups = new Set(assignments.map((a) => `${a.category}/${a.sector ?? ''}`));
  return groups.size >= SHARED_MIN_GROUPS;
}
