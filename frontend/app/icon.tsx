import { ImageResponse } from 'next/og';
import { loadOgFonts } from '@/lib/og-fonts';

export const runtime     = 'nodejs';
export const size        = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icon() {
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
          borderRadius: 80,
        }}
      >
        {/* corner accents */}
        <div style={{ position: 'absolute', top: 0,  left: 0,  width: 80, height: 6,  background: '#06b6d4', borderRadius: '0 0 4px 0', display: 'flex' }} />
        <div style={{ position: 'absolute', top: 0,  left: 0,  width: 6,  height: 80, background: '#06b6d4', borderRadius: '0 0 4px 0', display: 'flex' }} />
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: 80, height: 6,  background: '#06b6d4', borderRadius: '4px 0 0 0', display: 'flex' }} />
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: 6,  height: 80, background: '#06b6d4', borderRadius: '4px 0 0 0', display: 'flex' }} />

        {/* [ B ] */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          <span style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: 200, color: '#06b6d4', lineHeight: 1 }}>[</span>
          <span style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: 200, color: '#f1f5f9', lineHeight: 1, margin: '0 8px' }}>B</span>
          <span style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: 200, color: '#06b6d4', lineHeight: 1 }}>]</span>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
