module.exports = {
  apps: [
    {
      name: 'beyond-shor-prod',
      cwd: '/var/www/beyond-shor/frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'beyond-shor-dev',
      cwd: '/var/www/beyond-shor/frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3001',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'strapi',
      cwd: '/var/www/beyond-shor',
      script: 'npm',
      args: 'start',
      env: { NODE_ENV: 'production' },
    },
  ],
};
