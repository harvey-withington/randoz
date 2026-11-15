// Draws RANDOZ's icon and renders the images the app needs from it.
//
//   node scripts/make-icons.mjs
//
// The icon is a camera iris of six straight-edged blades (red, amber, orange,
// twice round) with a hot-air balloon in its opening. The opening is the
// hexagon the blades' edges leave between them, as in a real iris: nothing is
// laid over the middle to round it off. It is drawn here, in code, so the
// geometry stays exact and a change is one number.
//
// Writes to app/assets/icon/ the drawings (SVG):
//   randoz-icon.svg          the iris as first drawn: a small opening
//   randoz-icon-bold.svg     a wider opening and a larger balloon, which reads
//                            better small. This one is the app's icon.
//   randoz-icon-mono.svg     one colour, for Android's themed icons
// and to app/assets/ the PNGs app.json points to, rendered with headless Edge:
//   icon.png, android-icon-foreground.png, android-icon-monochrome.png

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const drawings = path.join(root, 'app', 'assets', 'icon');
const assets = path.join(root, 'app', 'assets');

const RED = '#D93A49';
const ORANGE = '#EB7A05';
const AMBER = '#F0B74A';
const CREAM = '#FDF4DC';
const NAVY = '#14213D';
const SKY = '#BFD9F5';
// The blades are worked out turning one way and drawn mirrored (TWIST), so
// that the iris closes the way the original drawing does: its upright edge
// right of centre. In this order they read red, amber, orange clockwise from
// the top once mirrored.
const BLADES = [RED, ORANGE, AMBER, RED, ORANGE, AMBER];
const TWIST = 'scale(-1 1)';

const round = (n) => Math.round(n * 100) / 100;
const point = (radius, degrees) => {
  const a = (degrees * Math.PI) / 180;
  return [round(radius * Math.cos(a)), round(radius * Math.sin(a))];
};

/**
 * The six blades of an iris of radius `outer` around a hexagonal opening of
 * radius `opening`. Each blade's inner edge runs along one side of the
 * hexagon and on to the rim, as a real iris's blades overlap.
 */
function blades(outer, opening) {
  // The hexagon's corners, clockwise, placed so one blade edge is upright.
  const corner = (k) => point(opening, -90 + 60 + 60 * k);
  // Where the line from corner k through corner k+1 meets the rim.
  const rim = (k) => {
    const [x1, y1] = corner(k);
    const [x2, y2] = corner(k + 1);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy);
    const ux = dx / length;
    const uy = dy / length;
    const along = -(x2 * ux + y2 * uy) + Math.sqrt((x2 * ux + y2 * uy) ** 2 - (x2 * x2 + y2 * y2 - outer * outer));
    return [round(x2 + ux * along), round(y2 + uy * along)];
  };
  return BLADES.map((fill, k) => {
    const from = corner(k + 1);
    const a = rim(k);
    const b = rim(k + 1);
    return { fill, d: `M${from} L${a} A${outer} ${outer} 0 0 1 ${b} Z`, edge: `M${corner(k)} L${a}` };
  });
}

/** The opening the blades leave: a hexagon with its corners `opening` from the centre. */
const hexagon = (opening) => 'M' + [0, 1, 2, 3, 4, 5].map((k) => point(opening, -90 + 60 + 60 * k)).join(' L') + ' Z';

/** The balloon, about 130 tall, centred a little above 0,0 so it sits well with its basket. */
function balloon(scale, colours) {
  const { envelope, stripe, basket, ropes } = colours;
  return `<g transform="scale(${scale}) translate(0 -11)">
    <path d="M0 -62 C38 -62 54 -32 54 -8 C54 22 24 46 13 60 L-13 60 C-24 46 -54 22 -54 -8 C-54 -32 -38 -62 0 -62 Z" fill="${envelope}"/>
    <path d="M0 -62 C15 -62 21 -27 21 -6 C21 24 10 48 6 60 L-6 60 C-10 48 -21 24 -21 -6 C-21 -27 -15 -62 0 -62 Z" fill="${stripe}"/>
    <path d="M-11 60 L-8 70 M11 60 L8 70" stroke="${ropes}" stroke-width="3" stroke-linecap="round" fill="none"/>
    <rect x="-10" y="70" width="20" height="13" rx="3" fill="${basket}"/>
  </g>`;
}

/**
 * The icon on a 1024 square with nothing behind it.
 * `iris` is the iris's radius, `hole` how far the opening's corners are from the centre, and
 * `lift` how large the balloon is drawn.
 */
function icon({ iris, hole, lift }) {
  const parts = blades(iris, hole);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <title>RANDOZ</title>
  <g transform="translate(512 512)">
    <circle r="${iris}" fill="${CREAM}"/>
    <g transform="${TWIST}">
    ${parts.map((blade) => `<path d="${blade.d}" fill="${blade.fill}"/>`).join('\n    ')}
    <path d="${hexagon(hole)}" fill="${NAVY}"/>
    ${parts.map((blade) => `<path d="${blade.edge}" stroke="${CREAM}" stroke-width="${round(iris * 0.022)}" stroke-linecap="round" fill="none"/>`).join('\n    ')}
    </g>
    <circle r="${iris}" fill="none" stroke="${CREAM}" stroke-width="${round(iris * 0.045)}"/>
    ${balloon(lift, { envelope: CREAM, stripe: SKY, basket: AMBER, ropes: CREAM })}
  </g>
</svg>
`;
}

/** One colour, for Android to tint: the blades as solid shapes with gaps between, and the balloon. */
function mono({ iris, hole, lift }) {
  const parts = blades(iris, hole);
  const gap = round(iris * 0.035);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <title>RANDOZ</title>
  <defs>
    <mask id="cut">
      <rect width="1024" height="1024" fill="black"/>
      <g transform="translate(512 512)">
        <circle r="${iris}" fill="white"/>
        <g transform="${TWIST}">
        ${parts.map((blade) => `<path d="${blade.edge}" stroke="black" stroke-width="${gap}" stroke-linecap="round" fill="none"/>`).join('\n        ')}
        </g>
        <path d="${hexagon(hole)}" fill="black"/>
        ${balloon(lift, { envelope: 'white', stripe: 'white', basket: 'white', ropes: 'white' })}
      </g>
    </mask>
  </defs>
  <rect width="1024" height="1024" fill="black" mask="url(#cut)"/>
</svg>
`;
}

// The iris as first drawn fills most of the square. As an Android icon it has
// to sit inside the middle two thirds, which is all a launcher is sure to show.
const ORIGINAL = { iris: 480, hole: 178, lift: 1.75 };
const BOLD = { iris: 480, hole: 292, lift: 3.2 };
const inset = (shape, to) => {
  const by = to / shape.iris;
  return { iris: to, hole: shape.hole * by, lift: shape.lift * by };
};

fs.mkdirSync(drawings, { recursive: true });
const write = (name, text) => fs.writeFileSync(path.join(drawings, name), text);
write('randoz-icon.svg', icon(ORIGINAL));
write('randoz-icon-bold.svg', icon(BOLD));
write('randoz-icon-mono.svg', mono(inset(BOLD, 300)));

// --- PNGs, rendered by headless Edge ------------------------------------------

const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'randoz-icons-'));
let run = 0;

/** Renders an SVG to a 1024 px PNG with a transparent background. */
function render(svg, out) {
  const source = path.join(scratch, `icon-${++run}.svg`);
  fs.writeFileSync(source, svg);
  const win = (p) => p.split('/').join(path.win32.sep);
  execFileSync(edge, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${win(path.join(scratch, 'profile-' + run))}`,
    '--window-size=1024,1024', '--hide-scrollbars', '--default-background-color=00000000',
    `--screenshot=${win(out)}`,
    'file:///' + source.split(path.win32.sep).join('/'),
  ], { stdio: 'ignore' });
  if (!fs.existsSync(out)) throw new Error('Edge did not write ' + out);
  console.log('wrote ' + path.relative(root, out));
}

if (fs.existsSync(edge)) {
  render(icon(BOLD), path.join(assets, 'icon.png'));
  render(icon(inset(BOLD, 318)), path.join(assets, 'android-icon-foreground.png'));
  render(mono(inset(BOLD, 300)), path.join(assets, 'android-icon-monochrome.png'));
  // --preview also renders the other two drawings to the temp folder, to look at.
  if (process.argv.includes('--preview')) {
    render(icon(ORIGINAL), path.join(os.tmpdir(), 'randoz-icon-original.png'));
  }
  fs.rmSync(scratch, { recursive: true, force: true });
} else {
  console.log('Edge not found: wrote the SVGs only. Render the PNGs another way.');
}
