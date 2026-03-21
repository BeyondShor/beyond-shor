import type { Core } from '@strapi/strapi';

const config = (_env: Core.Config.Shared.ConfigParams): Core.Config.Plugin => ({
  i18n: {
    enabled: true,
    config: {
      defaultLocale: 'de',
      locales: ['de', 'en'],
    },
  },
});

export default config;
