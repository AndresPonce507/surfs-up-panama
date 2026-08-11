/** The small, publish-time story a shared home link tells before it is opened. */
export type LinkAnnouncementInput = Readonly<{
  spotName: string;
  score: number;
  site: string;
  /** Absolute crawler-only card address, when this announcement has one. */
  image?: string;
}>;

/** The Open Graph values a layout can publish without re-composing the call. */
export type LinkAnnouncement = Readonly<{
  title: string;
  description: string;
  url: string;
  locale: 'es_PA';
  image?: string;
}>;

/**
 * Describes the same winning spot and score that the completed Spanish call
 * carries. The configured site remains the sole owner of the public origin.
 */
export function composeLinkAnnouncement(input: LinkAnnouncementInput): LinkAnnouncement {
  return {
    title: `${input.spotName}: ${input.score} puntos`,
    description: `${input.spotName} tiene ${input.score} puntos para hoy.`,
    url: new URL('/', input.site).toString(),
    locale: 'es_PA',
    ...(input.image === undefined ? {} : { image: input.image }),
  };
}
