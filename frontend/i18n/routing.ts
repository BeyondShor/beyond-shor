import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['de', 'en'],
  defaultLocale: 'de',
  localePrefix: 'always',
  pathnames: {
    '/':              '/',
    '/about':         '/about',
    '/blog':          '/blog',
    '/blog/[slug]':   '/blog/[slug]',
    '/cbom':          '/cbom',
    '/playground':    '/playground',
    '/rss':           '/rss',
    '/verify':        '/verify',
    '/kontakt':    { de: '/kontakt',    en: '/contact'        },
    '/impressum':  { de: '/impressum',  en: '/imprint'        },
    '/datenschutz': { de: '/datenschutz', en: '/privacy-policy' },
  },
});
