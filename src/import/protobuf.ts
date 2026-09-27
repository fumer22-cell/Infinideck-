/** Tiny protobuf wire-format reader (enough for Anki's media manifest and notetype configs). */
export interface PbField { no: number; wire: number; varint?: number; bytes?: Uint8Array }

export function readPb(buf: Uint8Array): PbField[] {
  const out: PbField[] = [];
  let i = 0;
  const varint = (): number => {
    let result = 0;
    let mul = 1;
    for (;;) {
      if (i >= buf.length) throw new Error('protobuf: truncated varint');
      const b = buf[i++];
      result += (b & 0x7f) * mul;
      if (!(b & 0x80)) break;
      mul *= 128;
    }
    return result;
  };
  while (i < buf.length) {
    const key = varint();
    const no = Math.floor(key / 8);
    const wire = key & 7;
    if (wire === 0) out.push({ no, wire, varint: varint() });
    else if (wire === 2) {
      const len = varint();
      out.push({ no, wire, bytes: buf.subarray(i, i + len) });
      i += len;
    } else if (wire === 1) i += 8;
    else if (wire === 5) i += 4;
    else throw new Error(`protobuf: unsupported wire type ${wire}`);
  }
  return out;
}

const td = new TextDecoder();
export const pbString = (f?: PbField) => (f?.bytes ? td.decode(f.bytes) : '');
