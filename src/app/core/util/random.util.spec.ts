import { shuffle, pickRandom } from './random.util';

describe('shuffle', () => {
  it('returns an array with the same elements, possibly reordered', () => {
    const input = [1, 2, 3, 4, 5];
    const result = shuffle(input);
    expect(result.length).toBe(input.length);
    expect([...result].sort()).toEqual([...input].sort());
  });

  it('does not mutate the input array', () => {
    const input = [1, 2, 3];
    shuffle(input);
    expect(input).toEqual([1, 2, 3]);
  });
});

describe('pickRandom', () => {
  it('returns the requested number of unique items from the input', () => {
    const input = ['a', 'b', 'c', 'd', 'e'];
    const result = pickRandom(input, 3);
    expect(result.length).toBe(3);
    expect(new Set(result).size).toBe(3);
    for (const item of result) {
      expect(input).toContain(item);
    }
  });

  it('caps at the input length when count exceeds it', () => {
    const result = pickRandom(['a', 'b'], 5);
    expect(result.length).toBe(2);
  });
});
