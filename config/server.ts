import type { Core } from '@strapi/strapi';

// cbom: hs256-jwt:strapi — Strapi internal JWT token auth (HS256, not detectable from source).

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Server => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  app: {
    keys: env.array('APP_KEYS'),
  },
});

export default config;
