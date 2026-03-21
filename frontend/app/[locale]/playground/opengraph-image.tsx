import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Hybrid PQC Playground';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const KEM_ENTRIES = [
  { name: 'X25519',             size: '32 B',    color: '#64748b' },
  { name: 'ML-KEM-1024',        size: '1.5 KB',  color: '#06b6d4' },
  { name: 'FrodoKEM-1344-AES',  size: '21 KB',   color: '#06b6d4' },
  { name: 'McEliece 8192128',   size: '1.3 MB',  color: '#f59e0b' },
];

export default async function Image({ params }: { params: { locale: string } }) {
  const isEn = params?.locale === 'en';

  const title   = isEn ? 'Hybrid PQC Playground' : 'Hybrid-PQC-Playground';
  const sub     = isEn
    ? 'X25519 + ML-KEM · McEliece · FrodoKEM + AES-256-GCM'
    : 'X25519 + ML-KEM · McEliece · FrodoKEM + AES-256-GCM';
  const sizeLabel = isEn ? 'Public Key Size' : 'Public-Key-Größe';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '60px 72px',
          background: '#030712',
          fontFamily: 'monospace',
        }}
      >
        {/* Top accent line */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 32, height: 2, background: '#06b6d4' }} />
          <span style={{ color: '#06b6d4', fontSize: 14, letterSpacing: 3 }}>
            beyond-shor.eu
          </span>
        </div>

        {/* Main title block */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ color: '#06b6d4', fontSize: 15, letterSpacing: 2 }}>
            // interactive demo
          </div>
          <div style={{ color: '#f8fafc', fontSize: 56, fontWeight: 700, lineHeight: 1.15 }}>
            {title}
          </div>
          <div style={{ color: '#94a3b8', fontSize: 22, marginTop: 4 }}>
            {sub}
          </div>
        </div>

        {/* Key-size bars */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ color: '#475569', fontSize: 13, letterSpacing: 2, marginBottom: 4 }}>
            // {sizeLabel}
          </div>
          {KEM_ENTRIES.map((k) => (
            <div key={k.name} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 200, color: '#94a3b8', fontSize: 14 }}>{k.name}</div>
              <div
                style={{
                  height: 8,
                  width: k.name === 'McEliece 8192128' ? 400
                       : k.name === 'FrodoKEM-1344-AES' ? 180
                       : k.name === 'ML-KEM-1024'       ? 60
                       : 10,
                  borderRadius: 4,
                  background: k.color,
                  opacity: 0.75,
                }}
              />
              <div style={{ color: k.name === 'McEliece 8192128' ? '#f59e0b' : '#94a3b8', fontSize: 14, minWidth: 60 }}>
                {k.size}
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size },
  );
}
