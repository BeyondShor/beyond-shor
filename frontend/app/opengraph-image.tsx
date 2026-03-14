import { ImageResponse } from 'next/og';
import { loadOgFonts } from '@/lib/og-fonts';

export const runtime     = 'nodejs';
export const size        = { width: 1200, height: 630 };
export const contentType = 'image/png';

const C = {
  bg:      '#030712',
  surface: '#0f172a',
  primary: '#06b6d4',
  text:    '#f1f5f9',
  muted:   '#94a3b8',
  border:  'rgba(255,255,255,0.08)',
};

export default function OgImage() {
  const fonts = loadOgFonts();

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: C.bg,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          // subtle grid
          backgroundImage:
            `linear-gradient(${C.primary}0a 1px, transparent 1px),` +
            `linear-gradient(90deg, ${C.primary}0a 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      >
        {/* top-left corner accent */}
        <div style={{ position: 'absolute', top: 0, left: 0, width: 160, height: 3, background: C.primary, display: 'flex' }} />
        <div style={{ position: 'absolute', top: 0, left: 0, width: 3, height: 160, background: C.primary, display: 'flex' }} />

        {/* bottom-right corner accent */}
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: 160, height: 3, background: C.primary, display: 'flex' }} />
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: 3, height: 160, background: C.primary, display: 'flex' }} />

        {/* center content */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
          {/* mono label */}
          <div style={{
            fontFamily: 'JetBrains Mono',
            fontSize: 20,
            color: C.primary,
            letterSpacing: '0.18em',
            marginBottom: 28,
          }}>
            // post-quantum cryptography
          </div>

          {/* logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            <span style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: 88, color: C.primary, lineHeight: 1 }}>[</span>
            <span style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: 88, color: C.text,    lineHeight: 1, margin: '0 12px' }}>Beyond Shor</span>
            <span style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: 88, color: C.primary, lineHeight: 1 }}>]</span>
          </div>

          {/* tagline */}
          <div style={{
            fontFamily: 'Inter',
            fontWeight: 700,
            fontSize: 26,
            color: C.muted,
            marginTop: 28,
            letterSpacing: '0.02em',
          }}>
            Securing the Post-Quantum Era
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
