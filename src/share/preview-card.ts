/** The five P7 fields a spot-specific preview card needs to state a truth. */
export type PreviewCardInput = Readonly<{
  spot_id: string;
  spot_name: string;
  score_q: number;
  size_band?: string;
  size_range_m?: readonly [number, number];
  wind_state?: string;
  conf_level?: string;
}>;

/** The honest card choice that the publisher can turn into an image. */
export type PreviewCardSelection = Readonly<{
  kind: 'spot' | 'generic';
  spot_id?: string;
  missing_fields: readonly string[];
}>;

const requiredPreviewFields = [
  'size_band',
  'size_range_m',
  'wind_state',
  'conf_level',
] as const;

function missingPreviewFields(input: PreviewCardInput): readonly string[] {
  return requiredPreviewFields.filter((field) => input[field] === undefined);
}

/**
 * Selects a spot card only when every display field is present. Missing data
 * is kept as a value so publication can log it while using the shared generic
 * card instead of inventing a surf claim.
 */
export function selectPreviewCard(input: PreviewCardInput): PreviewCardSelection {
  const missing_fields = missingPreviewFields(input);
  if (missing_fields.length > 0) {
    return { kind: 'generic', missing_fields };
  }
  return { kind: 'spot', spot_id: input.spot_id, missing_fields };
}
