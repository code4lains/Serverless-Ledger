import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.resolve(__dirname, '..');
const TAURI_ICONS_DIR = path.join(ROOT_DIR, 'packages', 'client', 'src-tauri', 'icons');
const PUBLIC_DIR = path.join(ROOT_DIR, 'packages', 'client', 'public');

// Ensure directories exist
if (!fs.existsSync(TAURI_ICONS_DIR)) {
  fs.mkdirSync(TAURI_ICONS_DIR, { recursive: true });
}
if (!fs.existsSync(PUBLIC_DIR)) {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}

// CRC32 table for PNG chunk checksums
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[i] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function createPngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = data.length;
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(len, 0);

  const crcBuf = Buffer.alloc(4);
  const typeAndData = Buffer.concat([typeBuf, data]);
  const checksum = crc32(typeAndData);
  crcBuf.writeUInt32BE(checksum, 0);

  return Buffer.concat([lenBuf, typeAndData, crcBuf]);
}

/**
 * Creates a raw PNG buffer from RGBA pixel data
 */
function createPng(width, height, rgbaBuffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR chunk: 13 bytes
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // 8 bit depth
  ihdr.writeUInt8(6, 9); // RGBA
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter
  ihdr.writeUInt8(0, 12); // interlace

  const ihdrChunk = createPngChunk('IHDR', ihdr);

  // Scanlines with filter byte 0 (None)
  const scanlines = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width * 4);
    scanlines[rowOffset] = 0; // Filter None
    const srcRowOffset = y * width * 4;
    rgbaBuffer.copy(scanlines, rowOffset + 1, srcRowOffset, srcRowOffset + width * 4);
  }

  const compressedData = zlib.deflateSync(scanlines, { level: 9 });
  const idatChunk = createPngChunk('IDAT', compressedData);
  const iendChunk = createPngChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

/**
 * Renders the Serverless Ledger Shield Icon into an RGBA buffer
 */
function renderAppIcon(size) {
  const buffer = Buffer.alloc(size * size * 4);

  // Primary color: Indigo #4F46E5 (79, 70, 229)
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.44;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const nx = (x - cx) / radius;
      const ny = (y - cy) / radius;

      // Rounded rectangle with shield bottom
      const inRoundedRect =
        Math.abs(nx) <= 0.85 && ny >= -0.85 && ny <= 0.85;

      // Distance from center for smooth rounded corners
      const cornerX = Math.max(0, Math.abs(nx) - 0.55);
      const cornerY = Math.max(0, Math.abs(ny) - 0.55);
      const cornerDist = Math.sqrt(cornerX * cornerX + cornerY * cornerY);

      // Pointed shield bottom
      const shieldPoint = ny > 0.4 ? (ny - 0.4) * 0.9 + Math.abs(nx) * 0.7 : 0;

      if (cornerDist <= 0.38 && shieldPoint <= 0.85 && inRoundedRect) {
        // App icon background: Smooth Indigo gradient
        const grad = 0.85 + 0.3 * (1 - y / size);
        const r = Math.min(255, Math.floor(79 * grad));
        const g = Math.min(255, Math.floor(70 * grad));
        const b = Math.min(255, Math.floor(229 * grad));

        // Draw inner white shield outline / checkmark
        const innerNx = nx * 1.5;
        const innerNy = ny * 1.5;

        let isCheckmark = false;
        const thickness = 0.12;

        // Segment 1: from (-0.35, 0.05) to (-0.05, 0.35)
        const seg1Dist = distToSegment(innerNx, innerNy, -0.35, 0.05, -0.05, 0.35);
        // Segment 2: from (-0.05, 0.35) to (0.42, -0.22)
        const seg2Dist = distToSegment(innerNx, innerNy, -0.05, 0.35, 0.42, -0.22);

        if (seg1Dist <= thickness || seg2Dist <= thickness) {
          isCheckmark = true;
        }

        if (isCheckmark) {
          // White checkmark
          buffer[idx] = 255;
          buffer[idx + 1] = 255;
          buffer[idx + 2] = 255;
          buffer[idx + 3] = 255;
        } else {
          // Shield background
          buffer[idx] = r;
          buffer[idx + 1] = g;
          buffer[idx + 2] = b;
          buffer[idx + 3] = 255;
        }
      } else {
        // Transparent
        buffer[idx] = 0;
        buffer[idx + 1] = 0;
        buffer[idx + 2] = 0;
        buffer[idx + 3] = 0;
      }
    }
  }

  return buffer;
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
}

/**
 * Creates a Windows .ICO file with multiple PNG sub-images
 */
function createIco(pngBuffers) {
  const count = pngBuffers.length;
  const headerSize = 6;
  const entrySize = 16;
  const dirSize = headerSize + count * entrySize;

  let offset = dirSize;
  const entries = [];

  for (const item of pngBuffers) {
    const entry = Buffer.alloc(entrySize);
    const w = item.size >= 256 ? 0 : item.size;
    const h = item.size >= 256 ? 0 : item.size;
    entry.writeUInt8(w, 0); // Width
    entry.writeUInt8(h, 1); // Height
    entry.writeUInt8(0, 2); // Color palette
    entry.writeUInt8(0, 3); // Reserved
    entry.writeUInt16LE(1, 4); // Color planes
    entry.writeUInt16LE(32, 6); // Bits per pixel
    entry.writeUInt32LE(item.buffer.length, 8); // Size of image data
    entry.writeUInt32LE(offset, 12); // Offset of image data
    entries.push(entry);
    offset += item.buffer.length;
  }

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Type: 1 = ICO
  header.writeUInt16LE(count, 4); // Number of images

  return Buffer.concat([header, ...entries, ...pngBuffers.map((p) => p.buffer)]);
}

/**
 * Creates a macOS .ICNS file container
 */
function createIcns(pngBuffers) {
  const icnsTypes = {
    32: 'icp5',
    64: 'ic12',
    128: 'ic07',
    256: 'ic08',
    512: 'ic09',
  };

  const chunks = [];
  let totalLength = 8; // Header length

  for (const item of pngBuffers) {
    const type = icnsTypes[item.size];
    if (type) {
      const typeBuf = Buffer.from(type, 'ascii');
      const lenBuf = Buffer.alloc(4);
      const chunkSize = 8 + item.buffer.length;
      lenBuf.writeUInt32BE(chunkSize, 0);
      chunks.push(Buffer.concat([typeBuf, lenBuf, item.buffer]));
      totalLength += chunkSize;
    }
  }

  const header = Buffer.alloc(8);
  header.write('icns', 0, 4, 'ascii');
  header.writeUInt32BE(totalLength, 4);

  return Buffer.concat([header, ...chunks]);
}

console.log('=== Generating Multi-Platform Icons for Serverless Ledger ===');

// Generate distinct resolution PNG buffers
const sizes = [16, 30, 32, 44, 48, 50, 64, 71, 89, 107, 128, 142, 150, 180, 192, 256, 284, 310, 512];
const generatedBuffers = {};
const pngItemsForIco = [];

for (const size of sizes) {
  const rgba = renderAppIcon(size);
  const png = createPng(size, size, rgba);
  generatedBuffers[size] = png;
  pngItemsForIco.push({ size, buffer: png });
}

// 1. Tauri Icons
const tauriFiles = {
  '32x32.png': generatedBuffers[32],
  '128x128.png': generatedBuffers[128],
  '128x128@2x.png': generatedBuffers[256],
  'icon.png': generatedBuffers[512],
  'Square30x30Logo.png': generatedBuffers[30],
  'Square44x44Logo.png': generatedBuffers[44],
  'Square71x71Logo.png': generatedBuffers[71],
  'Square89x89Logo.png': generatedBuffers[89],
  'Square107x107Logo.png': generatedBuffers[107],
  'Square142x142Logo.png': generatedBuffers[142],
  'Square150x150Logo.png': generatedBuffers[150],
  'Square284x284Logo.png': generatedBuffers[284],
  'Square310x310Logo.png': generatedBuffers[310],
  'StoreLogo.png': generatedBuffers[50],
};

for (const [filename, buf] of Object.entries(tauriFiles)) {
  const filePath = path.join(TAURI_ICONS_DIR, filename);
  fs.writeFileSync(filePath, buf);
  console.log(`✓ Generated Tauri icon: packages/client/src-tauri/icons/${filename}`);
}

// 2. Windows .ico
const icoBuffer = createIco([
  { size: 16, buffer: generatedBuffers[16] },
  { size: 32, buffer: generatedBuffers[32] },
  { size: 48, buffer: generatedBuffers[48] },
  { size: 64, buffer: generatedBuffers[64] },
  { size: 128, buffer: generatedBuffers[128] },
  { size: 256, buffer: generatedBuffers[256] },
]);
fs.writeFileSync(path.join(TAURI_ICONS_DIR, 'icon.ico'), icoBuffer);
console.log('✓ Generated Windows ICO: packages/client/src-tauri/icons/icon.ico');

// 3. macOS .icns
const icnsBuffer = createIcns([
  { size: 32, buffer: generatedBuffers[32] },
  { size: 64, buffer: generatedBuffers[64] },
  { size: 128, buffer: generatedBuffers[128] },
  { size: 256, buffer: generatedBuffers[256] },
  { size: 512, buffer: generatedBuffers[512] },
]);
fs.writeFileSync(path.join(TAURI_ICONS_DIR, 'icon.icns'), icnsBuffer);
console.log('✓ Generated macOS ICNS: packages/client/src-tauri/icons/icon.icns');

// 4. Web & PWA Icons in public/
fs.writeFileSync(path.join(PUBLIC_DIR, 'pwa-192x192.png'), generatedBuffers[192]);
fs.writeFileSync(path.join(PUBLIC_DIR, 'pwa-512x512.png'), generatedBuffers[512]);
fs.writeFileSync(path.join(PUBLIC_DIR, 'apple-touch-icon.png'), generatedBuffers[180]);
fs.writeFileSync(path.join(PUBLIC_DIR, 'favicon.ico'), icoBuffer);
console.log('✓ Generated PWA assets: pwa-192x192.png, pwa-512x512.png, apple-touch-icon.png, favicon.ico');

console.log('\n🎉 ALL ICONS GENERATED SUCCESSFULLY! 🎉\n');
