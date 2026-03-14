'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

interface LayerProps {
  index: string;
  title: string;
  desc: string;
}

function Layer({ index, title, desc }: LayerProps) {
  return (
    <div className="flex gap-3">
      <span className="font-mono text-xs text-[var(--color-primary)] shrink-0 mt-0.5">{index}</span>
      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-xs text-[var(--color-text-base)]">{title}</span>
        <span className="text-xs text-[var(--color-text-muted)] leading-relaxed">{desc}</span>
      </div>
    </div>
  );
}

export default function SpamInfoPanel() {
  const t = useTranslations('contact.spamInfo');
  const [open, setOpen] = useState(false);

  return (
    <div className="glass-panel rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 font-mono text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-base)] transition-colors text-left"
      >
        <span>{t('toggle')}</span>
        <span aria-hidden="true">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="border-t border-[var(--color-glass-border)] px-4 py-4 flex flex-col gap-5">

          {/* Why no reCAPTCHA */}
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-xs text-[var(--color-text-muted)] tracking-widest uppercase">
              {t('whyTitle')}
            </span>
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">{t('whyDesc')}</p>
          </div>

          {/* Four layers */}
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-xs text-[var(--color-text-muted)] tracking-widest uppercase">
              {t('layersTitle')}
            </span>
            <div className="flex flex-col gap-3 mt-1">
              <Layer index="01" title={t('layer1Title')} desc={t('layer1Desc')} />
              <Layer index="02" title={t('layer2Title')} desc={t('layer2Desc')} />
              <Layer index="03" title={t('layer3Title')} desc={t('layer3Desc')} />
              <Layer index="04" title={t('layer4Title')} desc={t('layer4Desc')} />
            </div>
          </div>

          {/* HMAC principle */}
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-xs text-[var(--color-text-muted)] tracking-widest uppercase">
              {t('hmacTitle')}
            </span>
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">{t('hmacDesc')}</p>
          </div>

        </div>
      )}
    </div>
  );
}
