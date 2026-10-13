// Minimal binary property list ("bplist00") parser.
//
// This is the format Apple's NSKeyedArchiver writes to disk. We only need
// enough of the spec to walk the object table: null/bool, ints, reals,
// dates, data, ASCII/UTF-16 strings, UIDs, arrays, sets and dicts.

export class UID {
  index: number;
  constructor(index: number) {
    this.index = index;
  }
}

export interface ParsedBplist {
  objects: unknown[];
  topObjectIndex: number;
}

function readBigUIntBE(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const b of bytes) {
    value = (value << 8n) | BigInt(b);
  }
  return value;
}

function toSignedBigInt(value: bigint, byteLength: number): bigint {
  const bits = BigInt(byteLength * 8);
  const max = 1n << (bits - 1n);
  if (value >= max) {
    return value - (1n << bits);
  }
  return value;
}

/** Parses an object's "length" encoding: either packed in the low nibble, or
 * an extended int object that immediately follows the marker byte. */
function readLength(bytes: Uint8Array, pos: { i: number }, marker: number): number {
  const lowNibble = marker & 0x0f;
  if (lowNibble !== 0x0f) {
    return lowNibble;
  }
  const extMarker = bytes[pos.i++];
  const extType = extMarker & 0xf0;
  if (extType !== 0x10) {
    throw new Error(`Expected int marker for extended length, got 0x${extMarker.toString(16)}`);
  }
  const byteCount = 1 << (extMarker & 0x0f);
  const value = readBigUIntBE(bytes.subarray(pos.i, pos.i + byteCount));
  pos.i += byteCount;
  return Number(value);
}

function parseObjectAt(
  bytes: Uint8Array,
  offset: number,
  objectRefSize: number
): unknown {
  const pos = { i: offset };
  const marker = bytes[pos.i++];
  const type = marker & 0xf0;

  switch (type) {
    case 0x00: {
      if (marker === 0x00) return null;
      if (marker === 0x08) return false;
      if (marker === 0x09) return true;
      if (marker === 0x0f) return undefined; // fill byte
      throw new Error(`Unknown singleton marker 0x${marker.toString(16)}`);
    }
    case 0x10: {
      // int: 2^nibble bytes, big-endian, two's complement for 8-byte ints.
      const byteCount = 1 << (marker & 0x0f);
      const raw = readBigUIntBE(bytes.subarray(pos.i, pos.i + byteCount));
      const signed = byteCount >= 8 ? toSignedBigInt(raw, byteCount) : raw;
      return Number(signed);
    }
    case 0x20: {
      // real: 4 (float) or 8 (double) bytes, big-endian IEEE-754.
      const byteCount = 1 << (marker & 0x0f);
      const buf = bytes.subarray(pos.i, pos.i + byteCount);
      const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
      return byteCount === 4 ? dv.getFloat32(0, false) : dv.getFloat64(0, false);
    }
    case 0x30: {
      // date: always an 8-byte big-endian double, seconds since 2001-01-01.
      const buf = bytes.subarray(pos.i, pos.i + 8);
      const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
      const seconds = dv.getFloat64(0, false);
      const epoch = Date.UTC(2001, 0, 1);
      return new Date(epoch + seconds * 1000);
    }
    case 0x40: {
      // data: raw bytes.
      const length = readLength(bytes, pos, marker);
      return bytes.slice(pos.i, pos.i + length);
    }
    case 0x50: {
      // ASCII string.
      const length = readLength(bytes, pos, marker);
      const slice = bytes.subarray(pos.i, pos.i + length);
      return String.fromCharCode(...slice);
    }
    case 0x60: {
      // UTF-16BE string. Length is in UTF-16 code units, not bytes.
      const length = readLength(bytes, pos, marker);
      const slice = bytes.subarray(pos.i, pos.i + length * 2);
      const codeUnits = new Uint16Array(length);
      for (let i = 0; i < length; i++) {
        codeUnits[i] = (slice[i * 2] << 8) | slice[i * 2 + 1];
      }
      return String.fromCharCode(...codeUnits);
    }
    case 0x80: {
      // UID: byte count is (low nibble + 1).
      const byteCount = (marker & 0x0f) + 1;
      const value = readBigUIntBE(bytes.subarray(pos.i, pos.i + byteCount));
      return new UID(Number(value));
    }
    case 0xa0:
    case 0xc0: {
      // array / set: `length` object refs of objectRefSize bytes each.
      const length = readLength(bytes, pos, marker);
      const refs: number[] = [];
      for (let i = 0; i < length; i++) {
        refs.push(
          readUIntAt(bytes, pos.i + i * objectRefSize, objectRefSize)
        );
      }
      return { __refs: refs };
    }
    case 0xd0: {
      // dict: `length` key refs, then `length` value refs.
      const length = readLength(bytes, pos, marker);
      const keyRefs: number[] = [];
      for (let i = 0; i < length; i++) {
        keyRefs.push(
          readUIntAt(bytes, pos.i + i * objectRefSize, objectRefSize)
        );
      }
      const valuePos = pos.i + length * objectRefSize;
      const valueRefs: number[] = [];
      for (let i = 0; i < length; i++) {
        valueRefs.push(
          readUIntAt(bytes, valuePos + i * objectRefSize, objectRefSize)
        );
      }
      return { __dictRefs: { keyRefs, valueRefs } };
    }
    default:
      throw new Error(`Unsupported bplist object type marker 0x${marker.toString(16)}`);
  }
}

function readUIntAt(bytes: Uint8Array, offset: number, length: number): number {
  let value = 0;
  for (let i = 0; i < length; i++) {
    value = value * 256 + bytes[offset + i];
  }
  return value;
}

/** Raw array/dict markers from parseObjectAt still hold object *indexes*
 * (via the offset table), not resolved values. We resolve those refs here,
 * turning "{__refs:[...]}" into a real array of resolved sub-objects, etc. */
function resolveRefs(
  raw: unknown,
  offsetTable: number[],
  objectRefSize: number,
  bytes: Uint8Array,
  cache: Map<number, unknown>
): unknown {
  if (raw && typeof raw === "object" && !Array.isArray(raw) && !(raw instanceof Uint8Array) && !(raw instanceof Date) && !(raw instanceof UID)) {
    const obj = raw as Record<string, unknown>;
    if ("__refs" in obj) {
      const refs = obj.__refs as number[];
      return refs.map((idx) => getObject(idx, offsetTable, objectRefSize, bytes, cache));
    }
    if ("__dictRefs" in obj) {
      const { keyRefs, valueRefs } = obj.__dictRefs as {
        keyRefs: number[];
        valueRefs: number[];
      };
      const dict: Record<string, unknown> = {};
      for (let i = 0; i < keyRefs.length; i++) {
        const key = getObject(keyRefs[i], offsetTable, objectRefSize, bytes, cache);
        const value = getObject(valueRefs[i], offsetTable, objectRefSize, bytes, cache);
        dict[String(key)] = value;
      }
      return dict;
    }
  }
  return raw;
}

function getObject(
  index: number,
  offsetTable: number[],
  objectRefSize: number,
  bytes: Uint8Array,
  cache: Map<number, unknown>
): unknown {
  if (cache.has(index)) return cache.get(index);
  const offset = offsetTable[index];
  const raw = parseObjectAt(bytes, offset, objectRefSize);
  const resolved = resolveRefs(raw, offsetTable, objectRefSize, bytes, cache);
  cache.set(index, resolved);
  return resolved;
}

export function parseBinaryPlist(buffer: ArrayBuffer): ParsedBplist {
  const bytes = new Uint8Array(buffer);
  const header = String.fromCharCode(...bytes.subarray(0, 8));
  if (!header.startsWith("bplist")) {
    throw new Error("Not a binary plist (missing 'bplist' header)");
  }

  const trailer = bytes.subarray(bytes.length - 32);
  const offsetSize = trailer[6];
  const objectRefSize = trailer[7];
  const numObjects = Number(readBigUIntBE(trailer.subarray(8, 16)));
  const topObjectIndex = Number(readBigUIntBE(trailer.subarray(16, 24)));
  const offsetTableOffset = Number(readBigUIntBE(trailer.subarray(24, 32)));

  const offsetTable: number[] = [];
  for (let i = 0; i < numObjects; i++) {
    const offset = offsetTableOffset + i * offsetSize;
    offsetTable.push(readUIntAt(bytes, offset, offsetSize));
  }

  const cache = new Map<number, unknown>();
  const objects: unknown[] = [];
  for (let i = 0; i < numObjects; i++) {
    objects.push(getObject(i, offsetTable, objectRefSize, bytes, cache));
  }

  return { objects, topObjectIndex };
}
