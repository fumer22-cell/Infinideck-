// Generates the PWA icons (pixel skull on a stone tile) as PNGs with no dependencies.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const half = ['....kkkk', '...kwwww', '..kwwwww', '.kwwwwww', '.kwwwwww', '.kwkkkkw', '.kwkRRkk', '.kwkkkkk', '.kwwwwww', '..kwwwwk', '...kwwww', '...kwkwk', '...kwkwk', '....kkkk'];
const skull = half.map((r) => r + [...r].reverse().join(''));
const P = { k: [13, 11, 10], w: [232, 224, 204], R: [224, 58, 42] };

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size) {
  const grid = 24; // logical pixels
  const s = size / grid;
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = [0];
    for (let x = 0; x < size; x++) {
      const gx = Math.floor(x / s), gy = Math.floor(y / s);
      // stone background with a mortar pattern and gold border
      let c = (gy % 6 === 5 || (gx + (Math.floor(gy / 6) % 2) * 3) % 6 === 5) ? [28, 24, 22] : [52, 46, 42];
      if (gx === 1 || gy === 1 || gx === grid - 2 || gy === grid - 2) c = [200, 160, 64];
      if (gx === 0 || gy === 0 || gx === grid - 1 || gy === grid - 1) c = [21, 17, 15];
      const sx = gx - 4, sy = gy - 5;
      if (sy >= 0 && sy < skull.length && sx >= 0 && sx < 16) {
        const ch = skull[sy][sx];
        if (ch !== '.') c = P[ch];
      }
      row.push(...c, 255);
    }
    rows.push(Buffer.from(row));
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}
writeFileSync('public/icon-192.png', png(192));
writeFileSync('public/icon-512.png', png(512));
writeFileSync('public/apple-touch-icon.png', png(180));

// SVG favicon
let rects = '';
skull.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') rects += `<rect x="${x + 4}" y="${y + 5}" width="1" height="1" fill="rgb(${P[ch]})"/>`; }));
writeFileSync('public/icon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" shape-rendering="crispEdges"><rect width="24" height="24" fill="#15110f"/><rect x="1" y="1" width="22" height="22" fill="#c8a040"/><rect x="2" y="2" width="20" height="20" fill="#342e2a"/>${rects}</svg>`);
console.log('icons written');
