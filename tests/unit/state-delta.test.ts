import { describe, expect, it } from 'vitest';

import { appendedWith, assertStateDelta, containing, prependedWith, setTo } from '../common/state_delta';

describe('state-delta port', () => {
  it('accepts declared port-observable changes', () => {
    expect(() => assertStateDelta(
      { 'receipt.status': 'waiting', 'receipt.events': ['saved'], 'receipt.words': 'gracias' },
      { 'receipt.status': 'arrived', 'receipt.events': ['saved', 'arrived'], 'receipt.words': 'gracias llegó' },
      ['receipt.status', 'receipt.events', 'receipt.words'],
      { 'receipt.status': setTo('arrived'), 'receipt.events': appendedWith('arrived'), 'receipt.words': containing('llegó') },
    )).not.toThrow();
  });

  it('rejects a promised observation outside its universe', () => {
    expect(() => assertStateDelta({}, {}, ['receipt.status'], { 'private.row': setTo('changed') })).toThrow('outside the declared universe');
  });

  it('rejects mutation or reordering hidden beside an append or prepend', () => {
    expect(() => assertStateDelta(
      { 'receipt.events': ['saved', 'original'] },
      { 'receipt.events': ['saved', 'mutated', 'arrived'] },
      ['receipt.events'],
      { 'receipt.events': appendedWith('arrived') },
    )).toThrow('was not appended');
    expect(() => assertStateDelta(
      { 'receipt.events': ['saved', 'original'] },
      { 'receipt.events': ['arrived', 'original', 'saved'] },
      ['receipt.events'],
      { 'receipt.events': prependedWith('arrived') },
    )).toThrow('was not prepended');
  });
});
