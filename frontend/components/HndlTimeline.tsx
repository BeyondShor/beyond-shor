import path from 'path';
import { parseTimeline } from '@/lib/parseTimeline';
import { getTimelineEvents } from '@/lib/strapi';
import HndlTimelineClient from './HndlTimelineClient';

interface Props {
  locale: string;
}

export default async function HndlTimeline({ locale }: Props) {
  // Strapi-first: fetch timeline events from CMS.
  // Falls back to the local markdown file when Strapi is offline or returns no data.
  let events = await getTimelineEvents(locale);

  if (events.length === 0) {
    const file = locale === 'en' ? 'timeline_en.md' : 'timeline_de.md';
    const filePath = path.join(process.cwd(), 'data', file);
    events = parseTimeline(filePath);
  }

  return <HndlTimelineClient events={events} locale={locale} />;
}
