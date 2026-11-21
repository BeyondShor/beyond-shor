#!/usr/bin/env node
// ClientHello sink: accepts TCP connections, records the first ClientHello of each
// as one JSON line, then answers with a fatal handshake_failure alert and closes.
// Runs in the sidecar container of a release pod, so release clients reach it on 127.0.0.1.
//
//   node clienthello-sink.mjs <port> <out.jsonl>

import net from 'node:net';
import { appendFileSync } from 'node:fs';
import { extractClientHello, parseClientHello, summarizeClientHello } from './clienthello.mjs';

const port = Number(process.argv[2] ?? 9443);
const out = process.argv[3] ?? '/out/clienthello.jsonl';
const ALERT_HANDSHAKE_FAILURE = Buffer.from([0x15, 0x03, 0x03, 0x00, 0x02, 0x02, 0x28]);

const server = net.createServer((sock) => {
  let buf = Buffer.alloc(0);
  sock.setTimeout(10_000, () => sock.destroy());
  sock.on('error', () => {});
  sock.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    let hs;
    try {
      hs = extractClientHello(buf);
    } catch (err) {
      appendFileSync(out, JSON.stringify({ error: err.message }) + '\n');
      sock.destroy();
      return;
    }
    if (!hs) {
      if (buf.length > 65536) sock.destroy();
      return;
    }
    try {
      const hello = parseClientHello(hs);
      appendFileSync(out, JSON.stringify({ sni: hello.sni, ...summarizeClientHello(hello) }) + '\n');
    } catch (err) {
      appendFileSync(out, JSON.stringify({ error: err.message }) + '\n');
    }
    sock.end(ALERT_HANDSHAKE_FAILURE);
  });
});

server.listen(port, '127.0.0.1', () => console.log(`sink listening on 127.0.0.1:${port}`));
