'use client';

import { useTranslations } from 'next-intl';
import type { Check } from '@/lib/pki/validate';
import { StatusIcon, useFormat } from './ui';

const PASS_DETAIL = new Set(['path', 'signature', 'validity', 'nameConstraints', 'revocation', 'scts', 'pathLen', 'altSignature', 'hostname']);

export function useCheckText() {
  const t = useTranslations('pkiLab');
  const f = useFormat();
  return (c: Check): { title: string; detail?: string } => {
    const params: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(c.params ?? {})) {
      params[k] = (k === 'notBefore' || k === 'notAfter') && typeof v === 'string' ? f.date(v) : v;
    }
    const title = t(`checks.${c.id}`);
    let detail: string | undefined;
    if (c.reason) detail = t(`reasons.${c.reason}`, params);
    else if (c.status === 'pass' && PASS_DETAIL.has(c.id)) detail = t(`passes.${c.id}`, params);
    return { title, detail };
  };
}

export default function ValidationList({ checks, showPassed = true }: { checks: Check[]; showPassed?: boolean }) {
  const text = useCheckText();
  const visible = showPassed ? checks : checks.filter((c) => c.status !== 'pass');
  return (
    <ul className="flex flex-col gap-1 text-xs">
      {visible.map((c, i) => {
        const { title, detail } = text(c);
        return (
          <li key={`${c.id}-${c.cert ?? ''}-${i}`} className="flex gap-2 leading-relaxed">
            <StatusIcon status={c.status} />
            <span className="min-w-0">
              <span className={c.status === 'fail' ? 'text-red-300' : 'text-[var(--color-text-base)]'}>{title}</span>
              {c.cert && <span className="font-mono text-[var(--color-text-muted)]"> · {c.cert}</span>}
              {detail && <span className="block text-[var(--color-text-muted)]">{detail}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
