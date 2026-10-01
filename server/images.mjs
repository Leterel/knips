export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

function invalid(message = 'Das Foto ist beschädigt oder kein unterstütztes JPEG, PNG oder WebP.') {
  throw Object.assign(new Error(message), { status: 400 });
}

// Header and container validation is deliberately bounded; this is not an image decoder.
export function inspectImage(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 20) invalid();
  if (bytes.length > MAX_IMAGE_BYTES) invalid('Das Foto darf höchstens 6 MB groß sein.');
  let type, ext, width, height;
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    if (bytes.length < 45) invalid();
    if (bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii', 12, 16) !== 'IHDR') invalid();
    width = bytes.readUInt32BE(16); height = bytes.readUInt32BE(20);
    let offset = 8, end = false, pixels = false;
    while (offset + 12 <= bytes.length) {
      const size = bytes.readUInt32BE(offset), name = bytes.toString('ascii', offset + 4, offset + 8);
      if (size > bytes.length - offset - 12) invalid();
      if (name === 'IDAT') pixels = true;
      offset += size + 12;
      if (name === 'IEND') { if (size || offset !== bytes.length) invalid(); end = true; break; }
    }
    if (!end || !pixels) invalid();
    type = 'image/png'; ext = 'png';
  } else if (bytes[0] === 255 && bytes[1] === 216 && bytes.at(-2) === 255 && bytes.at(-1) === 217) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 255) invalid();
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 218 || marker === 217) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      if (offset + 2 > bytes.length) invalid();
      const size = bytes.readUInt16BE(offset);
      if (size < 2 || offset + size > bytes.length) invalid();
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
        if (size < 8) invalid();
        height = bytes.readUInt16BE(offset + 3); width = bytes.readUInt16BE(offset + 5);
      }
      offset += size;
    }
    type = 'image/jpeg'; ext = 'jpg';
  } else if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    if (bytes.readUInt32LE(4) + 8 !== bytes.length) invalid();
    const chunk = bytes.toString('ascii', 12, 16), size = bytes.readUInt32LE(16);
    if (size > bytes.length - 20) invalid();
    if (chunk === 'VP8X' && size >= 10) {
      if (bytes[20] & 2) invalid('Animierte WebP-Dateien werden noch nicht unterstützt.');
      width = bytes.readUIntLE(24, 3) + 1; height = bytes.readUIntLE(27, 3) + 1;
    } else if (chunk === 'VP8L' && size >= 5 && bytes[20] === 47) {
      const bits = bytes.readUInt32LE(21); width = (bits & 0x3fff) + 1; height = ((bits >>> 14) & 0x3fff) + 1;
    } else if (chunk === 'VP8 ' && size >= 10 && bytes.subarray(23, 26).equals(Buffer.from([157, 1, 42]))) {
      width = bytes.readUInt16LE(26) & 0x3fff; height = bytes.readUInt16LE(28) & 0x3fff;
    }
    type = 'image/webp'; ext = 'webp';
  }
  if (!type || !width || !height) invalid();
  if (width > 8192 || height > 8192 || width * height > 40_000_000) invalid('Das Foto ist zu groß: maximal 8192 Pixel pro Seite und 40 Megapixel.');
  return { type, ext, width, height };
}
