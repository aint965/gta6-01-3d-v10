// The title screen for Palkon Auto: original vector lettering drawn in code
// and a live aerial camera that slowly flies over the real city.
//
// The logo is a 5x7 pixel letterform, authored here as seven rows of five
// bits per letter and drawn as SVG rectangles — no image file, no copied
// font. The aerial camera orbits the city centre at about 430 units up,
// looking down at the streets, so the title always sits over the living
// city: traffic moving, lamps lit, the sea to the west.

const FONT_5X7 = {
  P: ['#####', '#...#', '#...#', '#####', '#....', '#....', '#....'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
};

const CELL = 16;
const LETTER_GAP = 16;
const LINE_GAP = 16;
const LIMESTONE = '#ead8b2';
const CORAL = '#d77f69';

function lineWidth(word) {
  return word.length * 5 * CELL + (word.length - 1) * LETTER_GAP;
}

function wordRects(word, ox, oy) {
  const rects = [];
  [...word].forEach((ch, li) => {
    const glyph = FONT_5X7[ch];
    if (!glyph) return;
    const x0 = ox + li * (5 * CELL + LETTER_GAP);
    glyph.forEach((row, r) => {
      [...row].forEach((bit, c) => {
        if (bit === '#') rects.push([x0 + c * CELL, oy + r * CELL]);
      });
    });
  });
  return rects;
}

/** Draw "PALKON" over "AUTO" into an <svg>: limestone letters with a coral
 * shadow offset, centred on the longer line. */
export function buildLogo(svg) {
  const lines = ['PALKON', 'AUTO'];
  const width = lineWidth(lines[0]);
  const height = 2 * 7 * CELL + LINE_GAP;
  const parts = [];
  lines.forEach((word, li) => {
    const ox = (width - lineWidth(word)) / 2;
    const oy = li * (7 * CELL + LINE_GAP);
    const rects = wordRects(word, ox, oy);
    for (const [x, y] of rects) {
      parts.push(`<rect x="${x + 5}" y="${y + 5}" width="${CELL - 2}" height="${CELL - 2}" rx="2" fill="${CORAL}"/>`);
    }
    for (const [x, y] of rects) {
      parts.push(`<rect x="${x}" y="${y}" width="${CELL - 2}" height="${CELL - 2}" rx="2" fill="${LIMESTONE}"/>`);
    }
  });
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.innerHTML = parts.join('');
}

/** The aerial camera at t seconds: a slow orbit around the city centre,
 * high enough to read the districts and the sea, drifting a little in
 * height so the frame never sits still. The orbit stays inside the city
 * footprint and above the tallest tower, so the near streets read clearly
 * while the far side fades into the haze. */
export function titleCameraAt(t) {
  const angle = 0.55 + t * 0.012;
  const pos = [
    1100 * Math.cos(angle),
    300 + 30 * Math.sin(t * 0.05),
    1100 * Math.sin(angle),
  ];
  return { pos, target: [0, 30, 0], fov: 70 };
}
