// Generates all PWA / iOS icons and iOS splash screens as PNGs without any
// image dependencies (tiny PNG encoder + anti-aliased vector shapes).
// Usage: npm run icons
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');

const BG = [247, 245, 240]; // #f7f5f0 plaster white
const RING = [47, 122, 62]; // #2f7a3e
const HAND = [71, 64, 56]; // #474038 graphite

// ---------- PNG encoding ----------
const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- Shapes (signed distance functions, in pixels) ----------
const segDist = (px, py, ax, ay, bx, by) => {
  const vx = bx - ax,
    vy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(px - ax - t * vx, py - ay - t * vy);
};

/** Draw the clock logo centred at (cx, cy) with overall radius r into an RGB buffer. */
function drawLogo(buf, w, h, cx, cy, r) {
  const ringR = r * 0.82;
  const ringW = r * 0.16;
  const hourLen = r * 0.38;
  const minLen = r * 0.56;
  const handW = r * 0.13;
  // Hands: minute at 12, hour at ~10 o'clock (300°).
  const ha = (300 * Math.PI) / 180;
  const shapes = [
    { color: RING, d: (x, y) => Math.abs(Math.hypot(x - cx, y - cy) - ringR) - ringW / 2 },
    { color: HAND, d: (x, y) => segDist(x, y, cx, cy, cx, cy - minLen) - handW / 2 },
    {
      color: HAND,
      d: (x, y) =>
        segDist(x, y, cx, cy, cx + Math.sin(ha) * hourLen, cy - Math.cos(ha) * hourLen) - handW / 2,
    },
    { color: RING, d: (x, y) => Math.hypot(x - cx, y - cy) - handW * 0.75 },
  ];
  const x0 = Math.max(0, Math.floor(cx - r - 2)),
    x1 = Math.min(w, Math.ceil(cx + r + 2));
  const y0 = Math.max(0, Math.floor(cy - r - 2)),
    y1 = Math.min(h, Math.ceil(cy + r + 2));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 3;
      for (const s of shapes) {
        // 1px anti-aliasing from the signed distance at the pixel centre.
        const a = Math.max(0, Math.min(1, 0.5 - s.d(x + 0.5, y + 0.5)));
        if (a <= 0) continue;
        for (let c = 0; c < 3; c++) buf[i + c] = Math.round(buf[i + c] * (1 - a) + s.color[c] * a);
      }
    }
  }
}

function canvas(w, h) {
  const buf = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) buf.set(BG, i * 3);
  return buf;
}

function icon(size, contentScale) {
  const buf = canvas(size, size);
  drawLogo(buf, size, size, size / 2, size / 2, (size / 2) * contentScale);
  return encodePng(size, size, buf);
}

function write(rel, data) {
  const p = join(pub, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, data);
  console.log('wrote', rel, `${(data.length / 1024).toFixed(1)} KB`);
}

// ---------- Icons ----------
// "any" icons + Apple icons: logo fills ~80%. Maskable: keep inside the 80% safe zone.
write('icons/pwa-192.png', icon(192, 0.8));
write('icons/pwa-512.png', icon(512, 0.8));
write('icons/maskable-512.png', icon(512, 0.6));
for (const s of [120, 152, 167, 180]) write(`icons/apple-touch-icon-${s}.png`, icon(s, 0.78));
write('icons/favicon-32.png', icon(32, 0.9));
// Some tools look for this exact name at the root.
write('apple-touch-icon.png', icon(180, 0.78));

// ---------- iOS splash screens (portrait) ----------
// [css width, css height, pixel ratio]
const devices = [
  [440, 956, 3], // iPhone 16/17 Pro Max
  [402, 874, 3], // iPhone 16/17 Pro, 17
  [420, 912, 3], // iPhone Air
  [430, 932, 3], // iPhone 14 Pro Max, 15 Plus/Pro Max, 16 Plus
  [393, 852, 3], // iPhone 14 Pro, 15, 15 Pro, 16, 16e
  [428, 926, 3], // iPhone 12/13 Pro Max, 14 Plus
  [390, 844, 3], // iPhone 12, 13, 14, 12/13 Pro
  [375, 812, 3], // iPhone X, XS, 11 Pro, 12/13 mini
  [414, 896, 3], // iPhone XS Max, 11 Pro Max
  [414, 896, 2], // iPhone XR, 11
  [414, 736, 3], // iPhone 6/7/8 Plus
  [375, 667, 2], // iPhone 6/7/8, SE 2/3
  [320, 568, 2], // iPhone SE (1st gen)
];
const links = [];
for (const [cw, ch, dpr] of devices) {
  const w = cw * dpr,
    h = ch * dpr;
  const buf = canvas(w, h);
  drawLogo(buf, w, h, w / 2, h / 2 - h * 0.04, w * 0.16);
  const name = `splash/splash-${w}x${h}.png`;
  write(name, encodePng(w, h, buf));
  links.push(
    `    <link rel="apple-touch-startup-image" href="${name}" media="(device-width: ${cw}px) and (device-height: ${ch}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)" />`,
  );
}

// Inject the splash <link> tags into index.html between the markers.
const indexPath = join(root, 'index.html');
const html = readFileSync(indexPath, 'utf8');
const start = '<!-- SPLASH_SCREENS -->';
const end = '<!-- /SPLASH_SCREENS -->';
const a = html.indexOf(start),
  b = html.indexOf(end);
if (a === -1 || b === -1) throw new Error('splash markers missing in index.html');
writeFileSync(
  indexPath,
  html.slice(0, a + start.length) + '\n' + links.join('\n') + '\n    ' + html.slice(b),
);
console.log('updated index.html with', links.length, 'splash screens');
