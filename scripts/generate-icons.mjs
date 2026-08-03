/*
  Genererer app-ikonerne uden afhængigheder — ingen billedbibliotek, ingen
  binære filer der skal vedligeholdes i hånden. Kør: npm run icons

  Motivet er det samme som appens identitet: et stempelaftryk på papir med
  en stregkode indeni.
*/

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const PAPER = [0xd6, 0xd0, 0xba];
const INK = [0x1e, 0x1d, 0x19];

/** Simpelt RGB-lærred. */
function canvas(size, fill) {
  const px = Buffer.alloc(size * size * 3);
  for (let i = 0; i < size * size; i += 1) {
    px[i * 3] = fill[0];
    px[i * 3 + 1] = fill[1];
    px[i * 3 + 2] = fill[2];
  }

  const rect = (x, y, w, h, color) => {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(size, Math.round(x + w));
    const y1 = Math.min(size, Math.round(y + h));
    for (let py = y0; py < y1; py += 1) {
      for (let pxx = x0; pxx < x1; pxx += 1) {
        const i = (py * size + pxx) * 3;
        px[i] = color[0];
        px[i + 1] = color[1];
        px[i + 2] = color[2];
      }
    }
  };

  const frame = (x, y, w, h, thickness, color) => {
    rect(x, y, w, thickness, color);
    rect(x, y + h - thickness, w, thickness, color);
    rect(x, y, thickness, h, color);
    rect(x + w - thickness, y, thickness, h, color);
  };

  return { px, rect, frame };
}

function png(size, pixels) {
  // Filterbyte 0 foran hver scanline.
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 3 + 1)] = 0;
    pixels.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  }

  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Stempelramme + stregkode. `inset` er sikkerhedszonen til maskable. */
function drawIcon(size, inset) {
  const { px, rect, frame } = canvas(size, PAPER);
  const pad = Math.round(size * inset);
  const box = size - pad * 2;
  const thick = Math.max(2, Math.round(size * 0.035));

  // Stemplets dobbeltkant.
  frame(pad, pad, box, box, thick, INK);
  frame(pad + thick * 2, pad + thick * 2, box - thick * 4, box - thick * 4, Math.max(1, thick / 3), INK);

  // Stregkode: uregelmæssige bredder, som en rigtig EAN-13.
  const widths = [3, 1, 2, 1, 1, 3, 2, 1, 1, 2, 3, 1, 2, 1, 3, 1, 1, 2];
  const unit = (box - thick * 8) / widths.reduce((a, b) => a + b + 1, 0);
  const barTop = pad + box * 0.3;
  const barHeight = box * 0.4;

  let x = pad + thick * 4;
  for (const w of widths) {
    rect(x, barTop, w * unit, barHeight, INK);
    x += (w + 1) * unit;
  }

  // Grundlinje under koden, som cifferrækken på en etiket.
  rect(pad + thick * 4, barTop + barHeight + unit * 2, box - thick * 8, Math.max(1, unit), INK);

  return png(size, px);
}

mkdirSync(OUT_DIR, { recursive: true });

const files = [
  ['icon-192.png', drawIcon(192, 0.06)],
  ['icon-512.png', drawIcon(512, 0.06)],
  // Maskable: motivet skal overleve at blive beskåret til en cirkel.
  ['icon-maskable-512.png', drawIcon(512, 0.19)],
];

for (const [name, data] of files) {
  writeFileSync(join(OUT_DIR, name), data);
  console.log(`skrev ${name} (${(data.length / 1024).toFixed(1)} kB)`);
}
