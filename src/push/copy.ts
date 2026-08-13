// Settled spot-page wording for the avisos control (feature-delta.md, "Push
// copy record"). Held as one swappable constant per string so a later
// wording sign-off is a one-line change, never a search-and-replace across
// markup. Only the activate label is ratified for this step (01-20); later
// steps append their own strings here as their own scenarios require them
// (permission-refused, ack, retry, unrecognised-destination, removal).
export const pushCopy = {
  activate: 'Avisos de este spot',
} as const;
