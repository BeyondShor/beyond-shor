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
    '/rbe':          '/rbe',
    '/pki':          '/pki',
    '/pqc-lagebild':          { de: '/pqc-lagebild',          en: '/pqc-monitor'             },
    '/pqc-lagebild/methodik': { de: '/pqc-lagebild/methodik', en: '/pqc-monitor/methodology' },
    '/anderswo':   { de: '/anderswo',   en: '/elsewhere'      },
    '/kontakt':    { de: '/kontakt',    en: '/contact'        },
    '/impressum':  { de: '/impressum',  en: '/imprint'        },
    '/datenschutz': { de: '/datenschutz', en: '/privacy-policy' },
  },
});
