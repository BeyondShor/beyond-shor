import { ImageResponse } from 'next/og';
import { getArticleBySlug } from '@/lib/strapi';
import { loadOgFonts } from '@/lib/og-fonts';

export const runtime     = 'nodejs';
export const size        = { width: 1200, height: 630 };
export const contentType = 'image/png';

const C = {
  bg:      '#030712',
  primary: '#06b6d4',
  text:    '#f1f5f9',
  muted:   '#94a3b8',
  dim:     '#334155',
};

interface Props {
  params: Promise<{ locale: string; slug: string }>;
}

export default async function OgImage({ params }: Props) {
  const { locale, slug } = await params;
  const fonts = loadOgFonts();

  const article = await getArticleBySlug(slug, locale).catch(() => null);
  const title    = article?.title    ?? 'Beyond Shor';
  const category = article?.category?.name ?? null;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: C.bg,
          display: 'flex',
          flexDirection: 'column',
          padding: '72px 80px',
          position: 'relative',
          backgroundImage:
            `linear-gradient(${C.primary}0a 1px, transparent 1px),` +
            `linear-gradient(90deg, ${C.primary}0a 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      >
        {/* corner accents */}
        <div style={{ position: 'absolute', top: 0, left: 0, width: 120, height: 3, background: C.primary, display: 'flex' }} />
        <div style={{ position: 'absolute', top: 0, left: 0, width: 3, height: 120, background: C.primary, display: 'flex' }} />
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: 120, height: 3, background: C.primary, display: 'flex' }} />
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: 3, height: 120, background: C.primary, display: 'flex' }} />

        {/* category label */}
        <div style={{
          fontFamily: 'JetBrains Mono',
          fontSize: 20,
          color: C.primary,
          letterSpacing: '0.18em',
          marginBottom: 32,
        }}>
          {category ? `// ${category.toLowerCase()}` : '// article'}
        </div>

        {/* article title */}
        <div style={{
          fontFamily: 'Inter',
          fontWeight: 700,
          fontSize: title.length > 50 ? 52 : 64,
          color: C.text,
          lineHeight: 1.2,
          flex: 1,
          display: 'flex',
          alignItems: 'flex-start',
          maxWidth: 1000,
        }}>
          {title}
        </div>

        {/* separator */}
        <div style={{ width: '100%', height: 1, background: C.dim, marginBottom: 28, display: 'flex' }} />

        {/* branding */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: 32, color: C.primary }}>[ </span>
          <span style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: 32, color: C.muted  }}>Beyond Shor</span>
          <span style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: 32, color: C.primary }}> ]</span>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
