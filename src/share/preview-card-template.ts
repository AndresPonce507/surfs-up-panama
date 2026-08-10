import sharp from 'sharp';

import type { DaySummary } from '../data/forecast';

export const previewCardDimensions = { width: 1200, height: 630 } as const;
const maxPreviewCardBytes = 60 * 1024;

type PreviewCardStory = Readonly<{
  spotName: string;
  score: number;
  sizeBand?: string;
  sizeRangeM?: readonly [number, number];
  windState?: string;
  confidence?: string;
}>;

const sizeLabels: Readonly<Record<string, string>> = {
  ankle_knee: 'Tobillo a rodilla',
  knee_waist: 'Rodilla a cintura',
  waist_chest: 'Cintura a pecho',
  chest_head: 'Pecho a cabeza',
  overhead: 'Sobre la cabeza',
};

const windLabels: Readonly<Record<string, string>> = {
  clean: 'Viento limpio',
  choppy: 'Viento picado',
  blown_out: 'Viento destrozado',
};

const confidenceLabels: Readonly<Record<string, string>> = {
  low: 'Confianza baja',
  medium: 'Confianza media',
  high: 'Confianza alta',
};

function escapeText(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  })[character] ?? character);
}

function formatRange(range: readonly [number, number] | undefined): string {
  if (range === undefined) return 'Medida pendiente';
  return `${range[0].toFixed(1)}–${range[1].toFixed(1)} m`;
}

function svgFor(story: PreviewCardStory): string {
  const size = story.sizeBand === undefined ? 'Medida pendiente' : (sizeLabels[story.sizeBand] ?? story.sizeBand);
  const wind = story.windState === undefined ? 'Viento pendiente' : (windLabels[story.windState] ?? story.windState);
  const confidence = story.confidence === undefined
    ? 'Confianza pendiente'
    : (confidenceLabels[story.confidence] ?? story.confidence);
  return `
    <svg width="${previewCardDimensions.width}" height="${previewCardDimensions.height}" viewBox="0 0 ${previewCardDimensions.width} ${previewCardDimensions.height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="sea" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#075d68"/>
          <stop offset="0.55" stop-color="#0b8892"/>
          <stop offset="1" stop-color="#d2e7c7"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="630" fill="url(#sea)"/>
      <path d="M0 470 C160 390 270 560 430 480 S720 390 900 500 S1080 540 1200 430 V630 H0Z" fill="#063e48" opacity=".7"/>
      <path d="M0 505 C150 430 275 590 455 515 S760 445 940 545 S1095 575 1200 490" fill="none" stroke="#e5f2df" stroke-width="17" opacity=".85"/>
      <text x="72" y="92" fill="#eaf4e5" font-family="Arial, sans-serif" font-size="31" font-weight="700" letter-spacing="4">SURFS UP PANAMA</text>
      <text x="72" y="214" fill="#ffffff" font-family="Arial, sans-serif" font-size="76" font-weight="700">${escapeText(story.spotName)}</text>
      <text x="72" y="306" fill="#eaf4e5" font-family="Arial, sans-serif" font-size="35">Llamado de hoy</text>
      <text x="72" y="448" fill="#ffffff" font-family="Arial, sans-serif" font-size="154" font-weight="700">${story.score}</text>
      <text x="364" y="438" fill="#eaf4e5" font-family="Arial, sans-serif" font-size="47" font-weight="700">PUNTOS</text>
      <rect x="760" y="102" width="368" height="365" rx="30" fill="#063e48" opacity=".82"/>
      <text x="802" y="184" fill="#d2e7c7" font-family="Arial, sans-serif" font-size="27" font-weight="700" letter-spacing="2">OLEAJE</text>
      <text x="802" y="230" fill="#ffffff" font-family="Arial, sans-serif" font-size="31" font-weight="700">${escapeText(size)}</text>
      <text x="802" y="272" fill="#eaf4e5" font-family="Arial, sans-serif" font-size="27">${escapeText(formatRange(story.sizeRangeM))}</text>
      <text x="802" y="345" fill="#d2e7c7" font-family="Arial, sans-serif" font-size="27" font-weight="700" letter-spacing="2">VIENTO</text>
      <text x="802" y="389" fill="#ffffff" font-family="Arial, sans-serif" font-size="31" font-weight="700">${escapeText(wind)}</text>
      <text x="72" y="566" fill="#eaf4e5" font-family="Arial, sans-serif" font-size="32">${escapeText(confidence)}</text>
    </svg>`;
}

async function jpegFrom(story: PreviewCardStory): Promise<Buffer> {
  const input = Buffer.from(svgFor(story));
  const jpeg = await sharp(input)
    .jpeg({ quality: 76, progressive: true, chromaSubsampling: '4:2:0' })
    .toBuffer();
  if (jpeg.length > maxPreviewCardBytes) {
    throw new Error(`preview card for ${story.spotName} weighs ${jpeg.length} B, over the ${maxPreviewCardBytes} B contract`);
  }
  return jpeg;
}

/** Renders one truthful P7 day summary as the crawler-only JPEG artifact. */
export function renderSpotPreviewCard(summary: DaySummary, spotName: string): Promise<Buffer> {
  return jpegFrom({
    spotName,
    score: summary.score_q,
    ...(summary.size_band === undefined ? {} : { sizeBand: summary.size_band }),
    ...(summary.size_range_m === undefined ? {} : { sizeRangeM: summary.size_range_m }),
    ...(summary.wind_state === undefined ? {} : { windState: summary.wind_state }),
    ...(summary.conf_level === undefined ? {} : { confidence: summary.conf_level }),
  });
}

/** The declared static recovery face used when the P7 display fields are incomplete. */
export function renderGenericPreviewCard(): Promise<Buffer> {
  return jpegFrom({ spotName: 'Pronóstico pendiente', score: 0 });
}
