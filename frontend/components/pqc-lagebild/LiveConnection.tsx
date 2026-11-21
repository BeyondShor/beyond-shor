'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

interface Info { group: string | null; protocol: string | null; pq: boolean | null }

/** Shows which key-exchange group this very connection uses (as nginx saw it). Nothing is stored. */
export default function LiveConnection() {
  const t = useTranslations('pqcLagebild');
  const [info, setInfo] = useState<Info | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/tls-info', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Info) => { if (alive) setInfo(d); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  let tone = 'border-[var(--color-border)]';
  let headline = t('live.loading');
  let body: string | null = null;
  if (failed || (info && !info.group)) {
    headline = t('live.unknown');
    body = t('live.unknownBody');
  } else if (info?.pq) {
    tone = 'border-emerald-500/40';
    headline = t('live.pq');
    body = t('live.pqBody', { group: info.group ?? '', protocol: info.protocol ?? '' });
  } else if (info) {
    tone = 'border-amber-500/40';
    headline = t('live.classic');
    body = t('live.classicBody', { group: info.group ?? '', protocol: info.protocol ?? '' });
  }

  return (
    <div className={`rounded-xl border bg-[var(--color-bg-base)]/40 p-5 ${tone}`} aria-live="polite">
      <p className="mono-label text-[var(--color-text-muted)]">{t('live.label')}</p>
      <p className="mt-2 text-xl font-semibold text-[var(--color-text-base)]">
        {info?.pq === true && <span aria-hidden="true" className="mr-2 text-emerald-400">✔</span>}
        {info?.pq === false && <span aria-hidden="true" className="mr-2 text-amber-400">!</span>}
        {headline}
      </p>
      {body && <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-muted)]">{body}</p>}
      {info?.group && <p className="mt-3 font-mono text-xs text-[var(--color-text-muted)]">{info.protocol} · {info.group}</p>}
    </div>
  );
}
