#!/usr/bin/env node
// One-time: create the dataset signing key (ML-DSA-65) and the panel HMAC key.
// Never overwrites existing keys. Prints the public key, which the blog pins.

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { generateKeyPair } from '../lib/sign.mjs';
import { KEY_DIR, SIGNING_KEY, PANEL_KEY } from '../lib/config.mjs';

mkdirSync(KEY_DIR, { recursive: true, mode: 0o700 });
const pubPath = SIGNING_KEY.replace(/\.key$/, '.pub');

if (!existsSync(SIGNING_KEY)) {
  const k = generateKeyPair();
  writeFileSync(SIGNING_KEY, k.secretKeyHex + '\n', { mode: 0o600 });
  writeFileSync(pubPath, k.publicKeyHex + '\n', { mode: 0o644 });
  console.error('signing key created');
}
if (!existsSync(PANEL_KEY)) {
  writeFileSync(PANEL_KEY, randomBytes(32).toString('hex') + '\n', { mode: 0o600 });
  console.error('panel key created');
}
process.stdout.write(readFileSync(pubPath, 'utf8'));
