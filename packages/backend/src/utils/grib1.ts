// Minimal GRIB edition 1 decoder: regular lat/lon grid, simple packing, no bitmap.
// That is what the Copernicus ADS returns for CAMS PM2.5. Anything else throws instead of
// decoding wrongly.

export type Grib1Message = {
  /** Values in file order: rows run north to south, each row west to east. */
  values: Float64Array;
  ni: number;
  nj: number;
  lat1: number;
  lng1: number;
  dLat: number;
  dLng: number;
  /** Hours after the run time (PDS P1). The messages of one file are not in time order. */
  leadHour: number;
};

const PDS_LENGTH_MIN = 28;
const HOUR_UNIT = 1;
const LAT_LON_GRID = 0;
// shortcut: only the scan order we have seen (west to east, north to south, i consecutive);
// add the other orders when a request returns one.
const SUPPORTED_SCAN_MODE = 0;

export function decodeGrib1(buf: Buffer): Grib1Message[] {
  const messages: Grib1Message[] = [];
  let offset = 0;
  while (offset < buf.length) {
    const length = messageLength(buf, offset);
    messages.push(decodeMessage(buf.subarray(offset, offset + length)));
    offset += length;
  }
  if (messages.length === 0) throw new Error('[grib1] no GRIB messages in buffer');
  return messages;
}

function messageLength(buf: Buffer, offset: number): number {
  if (buf.length - offset < 8 || buf.toString('latin1', offset, offset + 4) !== 'GRIB') {
    throw new Error(`[grib1] expected GRIB at byte ${offset}`);
  }
  const edition = buf[offset + 7];
  if (edition !== 1) throw new Error(`[grib1] unsupported edition ${edition}, expected 1`);
  const length = buf.readUIntBE(offset + 4, 3);
  if (offset + length > buf.length) throw new Error(`[grib1] truncated message at byte ${offset}`);
  return length;
}

function decodeMessage(msg: Buffer): Grib1Message {
  if (msg.toString('latin1', msg.length - 4) !== '7777') {
    throw new Error('[grib1] message does not end with 7777');
  }

  const pdsStart = 8;
  const pdsLength = msg.readUIntBE(pdsStart, 3);
  if (pdsLength < PDS_LENGTH_MIN) throw new Error(`[grib1] PDS too short (${pdsLength})`);
  const sectionFlags = msg[pdsStart + 7];
  const hasGds = (sectionFlags & 0x80) !== 0;
  const hasBitmap = (sectionFlags & 0x40) !== 0;
  if (!hasGds) throw new Error('[grib1] message has no grid definition section');
  if (hasBitmap) throw new Error('[grib1] bitmap section is not supported');
  if (msg[pdsStart + 17] !== HOUR_UNIT) throw new Error('[grib1] time unit is not hours');
  const leadHour = msg[pdsStart + 18];
  const decimalScale = readSignMagnitude(msg, pdsStart + 26, 2);

  const gdsStart = pdsStart + pdsLength;
  const gdsLength = msg.readUIntBE(gdsStart, 3);
  if (msg[gdsStart + 5] !== LAT_LON_GRID) throw new Error('[grib1] grid is not a lat/lon grid');
  if (msg[gdsStart + 27] !== SUPPORTED_SCAN_MODE) {
    throw new Error(`[grib1] unsupported scanning mode ${msg[gdsStart + 27]}`);
  }
  const ni = msg.readUInt16BE(gdsStart + 6);
  const nj = msg.readUInt16BE(gdsStart + 8);
  const lat1 = readSignMagnitude(msg, gdsStart + 10, 3) / 1000;
  const lng1 = readSignMagnitude(msg, gdsStart + 13, 3) / 1000;
  const dLng = msg.readUInt16BE(gdsStart + 23) / 1000;
  const dLat = msg.readUInt16BE(gdsStart + 25) / 1000;

  const bdsStart = gdsStart + gdsLength;
  const bdsLength = msg.readUIntBE(bdsStart, 3);
  const bdsFlags = msg[bdsStart + 3];
  // Bit 1: spherical harmonics or complex packing. Bit 3: integer data. Bit 4: extra flags.
  if ((bdsFlags & 0xf0) !== 0)
    throw new Error('[grib1] only simple packing of floats is supported');
  const unusedBits = bdsFlags & 0x0f;
  const binaryScale = readSignMagnitude(msg, bdsStart + 4, 2);
  const reference = readIbmFloat(msg, bdsStart + 6);
  const bitsPerValue = msg[bdsStart + 10];
  if (bitsPerValue === 0 || bitsPerValue > 32) {
    throw new Error(`[grib1] unsupported bits per value ${bitsPerValue}`);
  }

  const dataBits = (bdsLength - 11) * 8 - unusedBits;
  if (dataBits !== ni * nj * bitsPerValue) {
    throw new Error(`[grib1] data holds ${dataBits} bits, expected ${ni * nj * bitsPerValue}`);
  }

  const binaryFactor = 2 ** binaryScale;
  const decimalFactor = 10 ** decimalScale;
  const values = new Float64Array(ni * nj);
  for (let i = 0; i < values.length; i += 1) {
    const packed = readBits(msg, (bdsStart + 11) * 8 + i * bitsPerValue, bitsPerValue);
    values[i] = (reference + packed * binaryFactor) / decimalFactor;
  }

  return { values, ni, nj, lat1, lng1, dLat, dLng, leadHour };
}

// GRIB1 stores signed numbers as a sign bit plus a magnitude, not two's complement.
function readSignMagnitude(buf: Buffer, offset: number, bytes: number): number {
  const raw = buf.readUIntBE(offset, bytes);
  const signBit = 2 ** (bytes * 8 - 1);
  return raw >= signBit ? -(raw - signBit) : raw;
}

// IBM hexadecimal float: sign, 7-bit exponent (base 16, bias 64), 24-bit fraction.
function readIbmFloat(buf: Buffer, offset: number): number {
  const raw = buf.readUInt32BE(offset);
  const sign = raw >>> 31 === 1 ? -1 : 1;
  const exponent = (raw >>> 24) & 0x7f;
  const fraction = (raw & 0xffffff) / 2 ** 24;
  return sign * fraction * 16 ** (exponent - 64);
}

function readBits(buf: Buffer, bitOffset: number, count: number): number {
  let value = 0;
  let read = 0;
  while (read < count) {
    const byte = buf[(bitOffset + read) >> 3];
    const bitInByte = (bitOffset + read) & 7;
    const take = Math.min(8 - bitInByte, count - read);
    const bits = (byte >> (8 - bitInByte - take)) & ((1 << take) - 1);
    value = value * 2 ** take + bits;
    read += take;
  }
  return value;
}
