import { describe, expect, it } from 'vitest';
import { formatTicketNumber } from './queue';

describe('formatTicketNumber', () => {
  it.each([
    [1, '001'],
    [7, '007'],
    [1000, '1000'],
  ])('formats sequence %i as %s', (sequence, expected) => {
    expect(formatTicketNumber(sequence)).toBe(expected);
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects invalid sequence %s', (sequence) => {
    expect(() => formatTicketNumber(sequence)).toThrow(RangeError);
  });
});
