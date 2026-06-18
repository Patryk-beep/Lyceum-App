// Generates a 1024x1024 RGBA PNG source icon (Night canvas + gold lamp ring),
// with no external dependencies. Output path is argv[2].
const zlib = require("zlib");
const fs = require("fs");

const W = 1024;
const H = 1024;
const bg = [0x13, 0x11, 0x0c];
const gold = [0xd8, 0xa2, 0x3e];
const lamp = [0xe7, 0xb8, 0x5a];

const cx = W / 2;
const cy = H / 2;
const raw = Buffer.alloc((W * 4 + 1) * H);
let p = 0;
for (let y = 0; y < H; y++) {
  raw[p++] = 0; // filter: none
  for (let x = 0; x < W; x++) {
    const dx = x - cx;
    const dy = y - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    let c;
    if (d < 140) {
      c = [lamp[0], lamp[1], lamp[2], 255]; // inner flame
    } else if (d >= 290 && d <= 370) {
      c = [gold[0], gold[1], gold[2], 255]; // ring
    } else {
      c = [bg[0], bg[1], bg[2], 255];
    }
    raw[p++] = c[0];
    raw[p++] = c[1];
    raw[p++] = c[2];
    raw[p++] = c[3];
  }
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type: RGBA
const idat = zlib.deflateSync(raw, { level: 9 });
const png = Buffer.concat([
  sig,
  chunk("IHDR", ihdr),
  chunk("IDAT", idat),
  chunk("IEND", Buffer.alloc(0)),
]);

const out = process.argv[2] || "icon-source.png";
fs.writeFileSync(out, png);
console.log(`wrote ${out} (${png.length} bytes)`);
