interface JsonLdProps {
  data: Record<string, unknown>;
}

/**
 * Renders JSON-LD structured data in a <script> tag for SEO.
 * Used for Article, WebSite, and Organization schemas.
 */
export default function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e') }}
    />
  );
}
