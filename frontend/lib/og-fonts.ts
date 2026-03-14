import { readFileSync } from 'fs';
import { join } from 'path';

export function loadOgFonts() {
  const interBold  = readFileSync(join(process.cwd(), 'public/fonts/inter-bold.ttf'));
  const jbMono     = readFileSync(join(process.cwd(), 'public/fonts/jetbrains-mono-regular.ttf'));
  return [
    { name: 'Inter',           data: interBold,  weight: 700 as const, style: 'normal' as const },
    { name: 'JetBrains Mono',  data: jbMono,     weight: 400 as const, style: 'normal' as const },
  ];
}
