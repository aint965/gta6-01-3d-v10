// Seeded random numbers for Palkon Auto: one deterministic stream drives the whole
// city, so the same seed always builds the same Solmar. Mulberry32 is small, fast and
// good enough for placement, sizes and colours.
export function createRandom(seed) {
  let state = (seed >>> 0) || 1;
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    // A float in [min, max).
    range(min, max) {
      return min + next() * (max - min);
    },
    // An integer in [min, max].
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    // One item from an array.
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
    // True with the given probability.
    chance(p) {
      return next() < p;
    },
  };
}
