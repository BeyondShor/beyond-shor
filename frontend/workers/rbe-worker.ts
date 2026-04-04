/// <reference lib="webworker" />
// RBE Web Worker — runs all client-side cryptographic operations off the main thread.
// Receives WorkerInMessage, posts WorkerOutMessage after each operation.

import type { WorkerInMessage, WorkerOutMessage } from '@/lib/rbe-types';
import { rbeKeyGen, rbeEncrypt, rbeDecryptStep1, rbeDecryptStep2 } from '@/lib/rbe/core';

function post(msg: WorkerOutMessage): void {
  (self as unknown as Worker).postMessage(msg);
}

(self as unknown as Worker).onmessage = (ev: MessageEvent<WorkerInMessage>) => {
  const m   = ev.data;
  const t0  = performance.now();

  try {
    switch (m.type) {

      case 'keygen': {
        const { pk, sk } = rbeKeyGen(m.a);
        post({ id: m.id, type: 'keygen_done', pk, sk, ms: performance.now() - t0 });
        break;
      }

      case 'encrypt': {
        const { c0, c1 } = rbeEncrypt(m.a, m.mpkAgg, m.msg);
        post({ id: m.id, type: 'encrypt_done', c0, c1, ms: performance.now() - t0 });
        break;
      }

      case 'dec_step1': {
        const temp = rbeDecryptStep1(m.c0, m.c1, m.hsk);
        post({ id: m.id, type: 'dec_step1_done', temp, ms: performance.now() - t0 });
        break;
      }

      case 'dec_step2': {
        const { result, msg: decoded } = rbeDecryptStep2(m.c0, m.temp, m.sk);
        post({ id: m.id, type: 'dec_step2_done', result, msg: decoded, ms: performance.now() - t0 });
        break;
      }

      default:
        post({ id: (m as WorkerInMessage).id, type: 'error', msg: 'Unknown message type' });
    }
  } catch (err) {
    post({ id: m.id, type: 'error', msg: err instanceof Error ? err.message : String(err) });
  }
};
