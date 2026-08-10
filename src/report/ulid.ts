// The client-minted report identity.
//
// domain-model.md section 7.3: `report_id` is a ULID minted ONCE at commit,
// before any network attempt, and section 7.4 makes it half of the dedup
// natural key `(spot_id, observed_at_utc, report_id)` forever. Two reports
// that share an identity are one report as far as the server is concerned:
// the second `PutItem` fails its `attribute_not_exists(SK)` condition, the
// device is told `duplicate`, and it clears the queue entry. A weak mint
// therefore does not corrupt a record, it silently deletes one.
//
// Randomness is injected for the same reason the forecast core takes its
// clock as a parameter (src/pipeline/ports.ts): nothing in the core may read
// an ambient source. This lane declares its own port rather than importing
// the forecast lane's, because the report capture route may never reach the
// forecast layer (application-architecture.md section 9, leak path L1).

/** Crockford base32: the 32 ULID symbols. I, L, O and U are deliberately absent. */
const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** A ULID is 26 symbols: 10 of millisecond time, then 16 of randomness. */
const TIME_SYMBOLS = 10;
const RANDOM_SYMBOLS = 16;
const SYMBOL_COUNT = 32;

/**
 * Injected randomness. One call yields one value in `[0, 1)`, the contract
 * `Math.random` and every seeded generator already satisfy. The mint draws
 * once per random symbol, so 16 draws carry the full 80 bits.
 */
export type RandomSource = () => number;

/**
 * Mint one report identity for the commit instant `now`, drawing every random
 * symbol from `random`. Pure: the same instant and the same draws always give
 * the same identity, which is what lets a queued report replay byte-identical.
 */
export function mintReportId(now: Date, random: RandomSource): string {
  return encodeTime(now.getTime()) + encodeRandomness(random);
}

function symbolAt(index: number): string {
  return CROCKFORD_ALPHABET.charAt(index);
}

/** The commit millisecond, most significant symbol first, so ids sort by time. */
function encodeTime(milliseconds: number): string {
  const symbols: string[] = [];
  let remaining = milliseconds;
  for (let position = 0; position < TIME_SYMBOLS; position += 1) {
    symbols.push(symbolAt(remaining % SYMBOL_COUNT));
    remaining = Math.floor(remaining / SYMBOL_COUNT);
  }
  return symbols.reverse().join('');
}

/** One draw per symbol: sixteen symbols are the ULID's full 80 bits. */
function encodeRandomness(random: RandomSource): string {
  const symbols: string[] = [];
  for (let position = 0; position < RANDOM_SYMBOLS; position += 1) {
    symbols.push(symbolAt(Math.floor(random() * SYMBOL_COUNT)));
  }
  return symbols.join('');
}
