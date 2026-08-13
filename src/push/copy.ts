// Settled spot-page wording for the avisos control (feature-delta.md, "Push
// copy record"). Held as one swappable constant per string so a later
// wording sign-off is a one-line change, never a search-and-replace across
// markup. The activate label is ratified from step 01-20; the refused label
// is ratified from step 01-21. Later steps append their own strings here as
// their own scenarios require them (ack, retry, unrecognised-destination,
// removal).
export const pushCopy = {
  activate: 'Avisos de este spot',
  refused: 'Sin el permiso del teléfono no te podemos mandar avisos de este spot.',
} as const;
