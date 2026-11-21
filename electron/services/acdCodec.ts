/**
 * Assetto Corsa data.acd Codec (Unpack & Pack)
 * Implements the standard AC / AcTools folder-name derived 8-octet key stream.
 */

export function generateAcdKey(carFolderName: string): string {
  const s = carFolderName.toLowerCase();
  const len = s.length;
  if (len === 0) {
    return '0-0-0-131-66-101-171-171';
  }

  const c: number[] = [];
  for (let i = 0; i < len; i++) {
    c.push(s.charCodeAt(i) & 0xff);
  }

  // Octet 0: sum of all char codes
  let n0 = 0;
  for (let i = 0; i < len; i++) {
    n0 = (n0 + c[i]) | 0;
  }
  const k0 = n0 & 0xff;

  // Octet 1
  let n1 = 0;
  for (let i = 0; i < len - 1; i += 2) {
    n1 = (Math.imul(n1, c[i]) - c[i + 1]) | 0;
  }
  const k1 = n1 & 0xff;

  // Octet 2
  let n2 = 0;
  for (let i = 1; i < len - 3; i += 3) {
    const denom = (c[i + 1] + 0x1b) | 0;
    const div = denom !== 0 ? Math.trunc(Math.imul(n2, c[i]) / denom) : 0;
    n2 = (div + (-0x1b - c[i - 1])) | 0;
  }
  const k2 = n2 & 0xff;

  // Octet 3
  let n3 = 0x1683;
  for (let i = 1; i < len; i++) {
    n3 = (n3 - c[i]) | 0;
  }
  const k3 = n3 & 0xff;

  // Octet 4
  let n4 = 0x42;
  for (let i = 1; i < len - 4; i += 4) {
    n4 = (Math.imul(c[i] + 0x0f, Math.imul(n4, c[i - 1] + 0x0f)) + 0x16) | 0;
  }
  const k4 = n4 & 0xff;

  // Octet 5
  let n5 = 0x65;
  for (let i = 0; i < len - 2; i += 2) {
    n5 = (n5 - c[i]) | 0;
  }
  const k5 = n5 & 0xff;

  // Octet 6
  let n6 = 0xab;
  for (let i = 0; i < len - 2; i += 2) {
    if (c[i] !== 0) {
      n6 = n6 % c[i];
    }
  }
  const k6 = n6 & 0xff;

  // Octet 7
  let n7 = 0xab;
  for (let i = 0; i < len - 1; i++) {
    const q = c[i] !== 0 ? Math.trunc(n7 / c[i]) : 0;
    n7 = (q + c[i + 1]) | 0;
  }
  const k7 = n7 & 0xff;

  return `${k0}-${k1}-${k2}-${k3}-${k4}-${k5}-${k6}-${k7}`;
}

export interface UnpackedAcdResult {
  keyString: string;
  files: Record<string, Buffer>;
}

export function unpackAcdBuffer(buffer: Buffer, carFolderName: string): UnpackedAcdResult {
  const keyString = generateAcdKey(carFolderName);
  const keyCodes = Buffer.from(keyString, 'ascii');
  const keyLen = keyCodes.length;

  const files: Record<string, Buffer> = {};
  if (buffer.length < 8) {
    throw new Error('data.acd ファイルが破損しているかサイズが小さすぎます。');
  }

  let offset = 0;
  // Version 2 header check: first int32 is negative (commonly -1111) followed by int32 header field
  const firstInt = buffer.readInt32LE(0);
  if (firstInt < 0) {
    offset = 8;
  }

  while (offset + 4 <= buffer.length) {
    const nameLen = buffer.readInt32LE(offset);
    offset += 4;

    if (nameLen <= 0 || nameLen > 512 || offset + nameLen + 4 > buffer.length) {
      throw new Error(
        `data.acd の解析に失敗しました (offset=${offset}, nameLen=${nameLen})。フォルダ名 "${carFolderName}" が元車両と一致しているか確認してください。`
      );
    }

    const fileName = buffer.subarray(offset, offset + nameLen).toString('utf8');
    offset += nameLen;

    const dataLen = buffer.readInt32LE(offset);
    offset += 4;

    if (dataLen < 0 || offset + dataLen * 4 > buffer.length) {
      throw new Error(
        `data.acd 内のエントリ "${fileName}" のデータ長が不正です (dataLen=${dataLen})。`
      );
    }

    const out = Buffer.allocUnsafe(dataLen);
    for (let i = 0; i < dataLen; i++) {
      const encByte = buffer[offset + i * 4];
      const keyByte = keyCodes[i % keyLen];
      out[i] = (encByte - keyByte) & 0xff;
    }
    offset += dataLen * 4;

    files[fileName] = out;
  }

  return { keyString, files };
}

export function packAcdBuffer(
  files: Record<string, Buffer>,
  carFolderName: string
): { keyString: string; buffer: Buffer } {
  const keyString = generateAcdKey(carFolderName);
  const keyCodes = Buffer.from(keyString, 'ascii');
  const keyLen = keyCodes.length;

  const names = Object.keys(files).sort((a, b) => a.localeCompare(b));
  let totalSize = 0;
  const encodedNames: Buffer[] = [];

  for (const name of names) {
    const nameBuf = Buffer.from(name, 'utf8');
    encodedNames.push(nameBuf);
    totalSize += 4 + nameBuf.length + 4 + files[name].length * 4;
  }

  const out = Buffer.alloc(totalSize);
  let offset = 0;

  for (let idx = 0; idx < names.length; idx++) {
    const nameBuf = encodedNames[idx];
    const data = files[names[idx]];

    out.writeInt32LE(nameBuf.length, offset);
    offset += 4;

    nameBuf.copy(out, offset);
    offset += nameBuf.length;

    out.writeInt32LE(data.length, offset);
    offset += 4;

    for (let i = 0; i < data.length; i++) {
      const encVal = (data[i] + keyCodes[i % keyLen]) & 0xff;
      out.writeUInt32LE(encVal, offset + i * 4);
    }
    offset += data.length * 4;
  }

  return { keyString, buffer: out };
}
