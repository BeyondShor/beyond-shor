import { ImageResponse } from 'next/og';
import { loadOgFonts } from '@/lib/og-fonts';

export const runtime     = 'nodejs';
export const size        = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  const fonts = loadOgFonts();

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#030712',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 40,
        }}
      >
        <div style={{ position: 'absolute', top: 0,    left: 0,  width: 36, height: 3, background: '#06b6d4', display: 'flex' }} />
        <div style={{ position: 'absolute', top: 0,    left: 0,  width: 3,  height: 36, background: '#06b6d4', display: 'flex' }} />
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: 36, height: 3, background: '#06b6d4', display: 'flex' }} />
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: 3,  height: 36, background: '#06b6d4', display: 'flex' }} />

        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: 72, color: '#06b6d4', lineHeight: 1 }}>[</span>
          <span style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: 72, color: '#f1f5f9', lineHeight: 1, margin: '0 4px' }}>B</span>
          <span style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: 72, color: '#06b6d4', lineHeight: 1 }}>]</span>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
