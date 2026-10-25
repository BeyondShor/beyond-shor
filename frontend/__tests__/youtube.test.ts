/**
 * YouTube URL parsing for the thumbnails on /anderswo.
 */
import { describe, it, expect } from 'vitest';
import { youTubeId } from '@/lib/youtube';

describe('youTubeId', () => {
  it.each([
    ['https://www.youtube.com/watch?v=b_CmFQb2bhY', 'b_CmFQb2bhY'],
    ['https://youtube.com/watch?v=0OZDiZDGjWw&t=42s', '0OZDiZDGjWw'],
    ['https://youtu.be/b_CmFQb2bhY?si=abc123', 'b_CmFQb2bhY'],
    ['https://m.youtube.com/watch?v=b_CmFQb2bhY', 'b_CmFQb2bhY'],
    ['https://www.youtube.com/shorts/b_CmFQb2bhY', 'b_CmFQb2bhY'],
    ['https://www.youtube.com/live/b_CmFQb2bhY?feature=share', 'b_CmFQb2bhY'],
    ['https://www.youtube-nocookie.com/embed/b_CmFQb2bhY', 'b_CmFQb2bhY'],
  ])('%s', (url, id) => {
    expect(youTubeId(url)).toBe(id);
  });

  it.each([
    null,
    '',
    'not a url',
    'https://research.hisolutions.com/2026/06/krypto-agilitaet/',
    'https://www.youtube.com/@hisolutions',
    'https://www.youtube.com/watch?v=tooShort',
    'https://www.youtube.com/watch?v=../../etc/pas',
    'https://evil.example/watch?v=b_CmFQb2bhY',
  ])('rejects %s', (url) => {
    expect(youTubeId(url)).toBeNull();
  });
});
