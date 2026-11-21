// Alert mails from the blog server, through the same SMTP account as the contact form
// (settings in frontend/.env.local). Nothing here runs on the scanner host.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

export function loadEnvFile(path) {
  const env = {};
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i < 0) continue;
      env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch { /* missing file: no mail */ }
  return env;
}

export async function sendAlert(repoRoot, subject, text) {
  const env = loadEnvFile(join(repoRoot, 'frontend/.env.local'));
  const host = env.CONTACT_SMTP_HOST;
  const to = env.CONTACT_EMAIL_TO;
  if (!host || !to) throw new Error('SMTP not configured (CONTACT_SMTP_HOST / CONTACT_EMAIL_TO)');
  const require = createRequire(join(repoRoot, 'frontend/package.json'));
  const nodemailer = require('nodemailer');
  const port = Number(env.CONTACT_SMTP_PORT ?? 587);
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user: env.CONTACT_SMTP_USER, pass: env.CONTACT_SMTP_PASS },
  });
  const from = env.CONTACT_EMAIL_FROM ?? env.CONTACT_SMTP_USER ?? to;
  await transporter.sendMail({ from: `"Beyond Shor PQC-Lagebild" <${from}>`, to, subject: `[PQC-Lagebild] ${subject}`, text });
}
