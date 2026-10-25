'use client';

import { useSyncExternalStore } from 'react';

/** Tailwind's lg — below it /cbom shows ShorSightReport instead. */
const DESKTOP = '(min-width: 1024px)';

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(DESKTOP);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

/**
 * ShorSight's own UI (public/shorsight/inventory.html), embedded from lg upwards.
 * The src is only set on a desktop-wide viewport, so phones never load the page
 * they are not shown. The framed page sizes the iframe itself and keeps its
 * detail drawer on screen (see shorsight/build_inventory.py).
 */
export default function ShorSightFrame({ src, title }: { src: string; title: string }) {
  const desktop = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DESKTOP).matches,
    () => false,
  );

  return (
    <iframe
      src={desktop ? src : undefined}
      title={title}
      lang="en"
      className="block h-[80vh] w-full"
      // the framed page sets its own height once it has rendered
      suppressHydrationWarning
    />
  );
}
