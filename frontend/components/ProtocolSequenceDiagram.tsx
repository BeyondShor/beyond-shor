'use client';

import { useTranslations } from 'next-intl';

interface Props {
  activeStep: number;  // 0 = idle, 1–6 = step in progress/done
  quantumMode: boolean;
}

interface Arrow {
  step:       number;
  label:      string;
  direction:  'ltr' | 'rtl' | 'both'; // left-to-right, right-to-left, bidirectional
  quantum?:   'breach' | 'safe';
}

function fmtTime(ms: number | undefined): string {
  if (ms === undefined) return '';
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

export default function ProtocolSequenceDiagram({ activeStep, quantumMode }: Props) {
  const t = useTranslations('playground');

  const arrows: Arrow[] = [
    { step: 1, label: t('seqStep1a'), direction: 'both',  quantum: 'breach' },
    { step: 1, label: t('seqStep1b'), direction: 'rtl',   quantum: 'safe'   },
    { step: 3, label: t('seqStep3'),  direction: 'ltr',   quantum: 'safe'   },
    { step: 4, label: t('seqStep4'),  direction: 'both'                     },
    { step: 5, label: t('seqStep5'),  direction: 'ltr'                      },
  ];

  return (
    <div className="glass-panel rounded-xl border border-[var(--color-glass-border)] p-5">
      <span className="font-mono text-xs text-[var(--color-primary)] block mb-4">{t('seqTitle')}</span>

      <div className="overflow-x-auto">
        <div className="min-w-[320px] relative">
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_auto_1fr] gap-0 mb-3">
            <div className="text-center font-mono text-xs text-[var(--color-text-muted)] pb-1.5 border-b border-[var(--color-glass-border)]">
              {t('seqClient')}
            </div>
            <div className="w-16 sm:w-24" />
            <div className="text-center font-mono text-xs text-[var(--color-text-muted)] pb-1.5 border-b border-[var(--color-glass-border)]">
              {t('seqServer')}
            </div>
          </div>

          {/* Lifeline + arrows */}
          <div className="relative flex flex-col gap-0">
            {/* Vertical lifelines */}
            <div
              className="absolute top-0 bottom-0 left-[calc(50%-28px)] sm:left-[calc(50%-32px)] w-px bg-[var(--color-glass-border)]/60"
              style={{ transform: 'translateX(-50%)' }}
            />
            <div
              className="absolute top-0 bottom-0 right-[calc(50%-28px)] sm:right-[calc(50%-32px)] w-px bg-[var(--color-glass-border)]/60"
              style={{ transform: 'translateX(50%)' }}
            />

            {arrows.map((arrow, i) => {
              const visible = activeStep >= arrow.step;
              const isBreached = quantumMode && arrow.quantum === 'breach';
              const isSafe     = quantumMode && arrow.quantum === 'safe';

              return (
                <div
                  key={i}
                  className={`grid grid-cols-[1fr_auto_1fr] items-center py-2.5 transition-all duration-300 ${
                    visible ? 'opacity-100' : 'opacity-0'
                  }`}
                >
                  {/* Left side (client dot or source indicator) */}
                  <div className="flex justify-end pr-3">
                    {(arrow.direction === 'ltr' || arrow.direction === 'both') && (
                      <div className={`w-2 h-2 rounded-full ${
                        isBreached ? 'bg-red-400' : isSafe ? 'bg-emerald-400' : 'bg-[var(--color-primary)]/60'
                      }`} />
                    )}
                  </div>

                  {/* Arrow + label */}
                  <div className="w-16 sm:w-24 flex flex-col items-center gap-0.5">
                    <div className="relative w-full flex items-center">
                      {/* Arrow line */}
                      <div className={`absolute inset-0 top-1/2 h-px ${
                        isBreached ? 'bg-red-500/60' : isSafe ? 'bg-emerald-500/60' : 'bg-[var(--color-primary)]/40'
                      }`} />
                      {/* Arrowheads */}
                      {(arrow.direction === 'ltr' || arrow.direction === 'both') && (
                        <span className={`absolute right-0 text-[0.6rem] leading-none -translate-y-px ${
                          isBreached ? 'text-red-400' : isSafe ? 'text-emerald-400' : 'text-[var(--color-primary)]/70'
                        }`}>▶</span>
                      )}
                      {(arrow.direction === 'rtl' || arrow.direction === 'both') && (
                        <span className={`absolute left-0 text-[0.6rem] leading-none -translate-y-px ${
                          isBreached ? 'text-red-400' : isSafe ? 'text-emerald-400' : 'text-[var(--color-primary)]/70'
                        }`}>◀</span>
                      )}
                      <div className="w-full h-3" /> {/* spacer */}
                    </div>
                    <span className={`font-mono text-[0.6rem] leading-tight text-center px-0.5 ${
                      isBreached ? 'text-red-400/80' : isSafe ? 'text-emerald-400/80' : 'text-[var(--color-text-muted)]'
                    }`}>
                      {isBreached && '⚡ '}
                      {isSafe && '🛡 '}
                      {arrow.label}
                    </span>
                  </div>

                  {/* Right side (server dot) */}
                  <div className="flex justify-start pl-3">
                    {(arrow.direction === 'rtl' || arrow.direction === 'both') && (
                      <div className={`w-2 h-2 rounded-full ${
                        isBreached ? 'bg-red-400' : isSafe ? 'bg-emerald-400' : 'bg-[var(--color-primary)]/60'
                      }`} />
                    )}
                  </div>
                </div>
              );
            })}

            {/* Final "done" row */}
            {activeStep >= 6 && (
              <div className="flex justify-center pt-2 pb-1">
                <span className="font-mono text-xs text-emerald-400/80 border border-emerald-500/20 bg-emerald-500/5 rounded-full px-3 py-0.5">
                  {t('seqDone')}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
