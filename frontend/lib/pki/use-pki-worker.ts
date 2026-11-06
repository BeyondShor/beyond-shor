'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { BenchRunView, PkiRequest, PkiResponse, WorkerIn, WorkerOut } from './worker-types';

type Pending = {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  onProgress?: (p: { done: number; total: number; run?: BenchRunView }) => void;
};

/** One worker per mounted playground; requests are queued by the worker itself. */
export function usePkiWorker() {
  const worker = useRef<Worker | null>(null);
  const pending = useRef(new Map<number, Pending>());
  const nextId = useRef(1);

  useEffect(() => {
    const w = new Worker(new URL('../../workers/pki-worker.ts', import.meta.url), { type: 'module' });
    const map = pending.current;
    w.onmessage = (ev: MessageEvent<WorkerOut>) => {
      const m = ev.data;
      const p = map.get(m.id);
      if (!p) return;
      if ('progress' in m) { p.onProgress?.(m.progress); return; }
      map.delete(m.id);
      if (m.ok) p.resolve(m.result);
      else p.reject(new Error(m.error));
    };
    w.onerror = (e) => {
      for (const p of map.values()) p.reject(new Error(e.message || 'worker error'));
      map.clear();
    };
    worker.current = w;
    return () => { w.terminate(); worker.current = null; map.clear(); };
  }, []);

  const call = useCallback(<R extends PkiRequest>(req: R, onProgress?: Pending['onProgress']): { id: number; done: Promise<PkiResponse<R['op']>> } => {
    const id = nextId.current++;
    const done = new Promise<PkiResponse<R['op']>>((resolve, reject) => {
      const w = worker.current;
      if (!w) { reject(new Error('worker not ready')); return; }
      pending.current.set(id, { resolve: resolve as (v: unknown) => void, reject, onProgress });
      w.postMessage({ id, req } satisfies WorkerIn);
    });
    return { id, done };
  }, []);

  const cancel = useCallback((id: number) => {
    worker.current?.postMessage({ id, cancel: true } satisfies WorkerIn);
  }, []);

  return { call, cancel };
}
