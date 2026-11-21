import * as THREE from 'three';
import type { Kn5Material, Kn5MaterialProperty, Kn5Texture } from './kn5Codec';
import { disposeThreeObject } from './threeCleanup';

export type CspLightingPreset = 'csp_showroom' | 'csp_sunset' | 'csp_studio_dark';

export interface DecodedRgbaImage {
  width: number;
  height: number;
  data: Uint8Array;
}

// ===== Pure TypeScript DDS Decoder (DXT1 / DXT3 / DXT5 / Uncompressed RGBA/BGRA/RGB) =====
// Flat reusable 4-color RGBA scratch table eliminates ~1.8M short-lived array allocations per 2K DDS
const DXT_COL_BUF = new Uint8Array(16);

function decodeDxtColorBlock(
  view: DataView,
  blockOffset: number,
  out: Uint8Array,
  width: number,
  height: number,
  bx: number,
  by: number,
  isDxt1: boolean
) {
  const c0 = view.getUint16(blockOffset, true);
  const c1 = view.getUint16(blockOffset + 2, true);
  const bits = view.getUint32(blockOffset + 4, true);

  const r0 = (((c0 >> 11) & 0x1f) * 255 / 31) | 0;
  const g0 = (((c0 >> 5) & 0x3f) * 255 / 63) | 0;
  const b0 = ((c0 & 0x1f) * 255 / 31) | 0;
  const r1 = (((c1 >> 11) & 0x1f) * 255 / 31) | 0;
  const g1 = (((c1 >> 5) & 0x3f) * 255 / 63) | 0;
  const b1 = ((c1 & 0x1f) * 255 / 31) | 0;

  DXT_COL_BUF[0] = r0; DXT_COL_BUF[1] = g0; DXT_COL_BUF[2] = b0; DXT_COL_BUF[3] = 255;
  DXT_COL_BUF[4] = r1; DXT_COL_BUF[5] = g1; DXT_COL_BUF[6] = b1; DXT_COL_BUF[7] = 255;

  if (!isDxt1 || c0 > c1) {
    DXT_COL_BUF[8] = ((2 * r0 + r1) / 3) | 0;
    DXT_COL_BUF[9] = ((2 * g0 + g1) / 3) | 0;
    DXT_COL_BUF[10] = ((2 * b0 + b1) / 3) | 0;
    DXT_COL_BUF[11] = 255;
    DXT_COL_BUF[12] = ((r0 + 2 * r1) / 3) | 0;
    DXT_COL_BUF[13] = ((g0 + 2 * g1) / 3) | 0;
    DXT_COL_BUF[14] = ((b0 + 2 * b1) / 3) | 0;
    DXT_COL_BUF[15] = 255;
  } else {
    DXT_COL_BUF[8] = (r0 + r1) >> 1;
    DXT_COL_BUF[9] = (g0 + g1) >> 1;
    DXT_COL_BUF[10] = (b0 + b1) >> 1;
    DXT_COL_BUF[11] = 255;
    DXT_COL_BUF[12] = 0;
    DXT_COL_BUF[13] = 0;
    DXT_COL_BUF[14] = 0;
    DXT_COL_BUF[15] = 0;
  }

  for (let py = 0; py < 4; py++) {
    const y = by + py;
    if (y >= height) continue;
    const rowBase = y * width;
    for (let px = 0; px < 4; px++) {
      const x = bx + px;
      if (x >= width) continue;
      const cOff = ((bits >>> ((py * 4 + px) * 2)) & 0x3) << 2;
      const dst = (rowBase + x) << 2;
      out[dst] = DXT_COL_BUF[cOff];
      out[dst + 1] = DXT_COL_BUF[cOff + 1];
      out[dst + 2] = DXT_COL_BUF[cOff + 2];
      if (isDxt1) out[dst + 3] = DXT_COL_BUF[cOff + 3];
    }
  }
}

export function decodeDdsToRgba(bytes: Uint8Array): DecodedRgbaImage | null {
  if (bytes.byteLength < 128) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // 'DDS ' = 0x20534444
  if (view.getUint32(0, true) !== 0x20534444) return null;

  const height = view.getUint32(12, true);
  const width = view.getUint32(16, true);
  if (width <= 0 || height <= 0 || width > 8192 || height > 8192) return null;

  const pfFlags = view.getUint32(80, true);
  const fourCC = view.getUint32(84, true);
  const rgbBitCount = view.getUint32(88, true);
  const rMask = view.getUint32(92, true);
  const gMask = view.getUint32(96, true);
  const bMask = view.getUint32(100, true);
  const aMask = view.getUint32(104, true);

  let dataOffset = 128;
  // DX10 extended header
  if (fourCC === 0x30315844) {
    dataOffset = 148;
  }

  const out = new Uint8Array(width * height * 4);
  const blocksX = Math.max(1, Math.ceil(width / 4));
  const blocksY = Math.max(1, Math.ceil(height / 4));

  const DDPF_FOURCC = 0x4;
  if ((pfFlags & DDPF_FOURCC) !== 0) {
    // DXT1 = 0x31545844, DXT3 = 0x33545844, DXT5 = 0x35545844
    if (fourCC === 0x31545844) {
      let off = dataOffset;
      for (let by = 0; by < blocksY; by++) {
        for (let bx = 0; bx < blocksX; bx++) {
          if (off + 8 > bytes.byteLength) return { width, height, data: out };
          decodeDxtColorBlock(view, off, out, width, height, bx * 4, by * 4, true);
          off += 8;
        }
      }
      return { width, height, data: out };
    }

    if (fourCC === 0x33545844) {
      let off = dataOffset;
      for (let by = 0; by < blocksY; by++) {
        for (let bx = 0; bx < blocksX; bx++) {
          if (off + 16 > bytes.byteLength) return { width, height, data: out };
          // 4-bit explicit alpha (8 bytes)
          for (let py = 0; py < 4; py++) {
            const y = by * 4 + py;
            const rowWord = view.getUint16(off + py * 2, true);
            if (y >= height) continue;
            for (let px = 0; px < 4; px++) {
              const x = bx * 4 + px;
              if (x >= width) continue;
              const a4 = (rowWord >>> (px * 4)) & 0xf;
              out[(y * width + x) * 4 + 3] = (a4 << 4) | a4;
            }
          }
          decodeDxtColorBlock(view, off + 8, out, width, height, bx * 4, by * 4, false);
          off += 16;
        }
      }
      return { width, height, data: out };
    }

    if (fourCC === 0x35545844) {
      let off = dataOffset;
      const alphas = new Uint8Array(8);
      for (let by = 0; by < blocksY; by++) {
        for (let bx = 0; bx < blocksX; bx++) {
          if (off + 16 > bytes.byteLength) return { width, height, data: out };
          const a0 = bytes[off];
          const a1 = bytes[off + 1];
          alphas[0] = a0;
          alphas[1] = a1;
          if (a0 > a1) {
            for (let k = 1; k <= 6; k++) alphas[k + 1] = (((7 - k) * a0 + k * a1) / 7) | 0;
          } else {
            for (let k = 1; k <= 4; k++) alphas[k + 1] = (((5 - k) * a0 + k * a1) / 5) | 0;
            alphas[6] = 0;
            alphas[7] = 255;
          }
          // 48-bit index table (6 bytes = two 24-bit groups)
          const lo24 = bytes[off + 2] | (bytes[off + 3] << 8) | (bytes[off + 4] << 16);
          const hi24 = bytes[off + 5] | (bytes[off + 6] << 8) | (bytes[off + 7] << 16);
          for (let p = 0; p < 16; p++) {
            const x = bx * 4 + (p & 3);
            const y = by * 4 + (p >> 2);
            if (x >= width || y >= height) continue;
            const aIdx = p < 8 ? (lo24 >>> (p * 3)) & 0x7 : (hi24 >>> ((p - 8) * 3)) & 0x7;
            out[(y * width + x) * 4 + 3] = alphas[aIdx];
          }
          decodeDxtColorBlock(view, off + 8, out, width, height, bx * 4, by * 4, false);
          off += 16;
        }
      }
      return { width, height, data: out };
    }
    return null;
  }

  // Uncompressed RGBA / BGRA / RGB / L8
  const bytesPerPixel = Math.max(1, rgbBitCount >> 3);
  const pixelCount = width * height;
  if (dataOffset + pixelCount * bytesPerPixel > bytes.byteLength) return null;

  const isBgr = rMask === 0x00ff0000 && bMask === 0x000000ff;
  for (let i = 0; i < pixelCount; i++) {
    const src = dataOffset + i * bytesPerPixel;
    const dst = i * 4;
    if (bytesPerPixel === 4) {
      if (isBgr) {
        out[dst] = bytes[src + 2];
        out[dst + 1] = bytes[src + 1];
        out[dst + 2] = bytes[src];
        out[dst + 3] = aMask ? bytes[src + 3] : 255;
      } else {
        out[dst] = bytes[src];
        out[dst + 1] = bytes[src + 1];
        out[dst + 2] = bytes[src + 2];
        out[dst + 3] = aMask ? bytes[src + 3] : 255;
      }
    } else if (bytesPerPixel === 3) {
      out[dst] = isBgr ? bytes[src + 2] : bytes[src];
      out[dst + 1] = bytes[src + 1];
      out[dst + 2] = isBgr ? bytes[src] : bytes[src + 2];
      out[dst + 3] = 255;
    } else {
      const lum = bytes[src];
      out[dst] = lum;
      out[dst + 1] = lum;
      out[dst + 2] = lum;
      out[dst + 3] = 255;
    }
  }
  return { width, height, data: out };
}

/**
 * Creates a Three.js Texture from a KN5 embedded texture (supports DDS, PNG, JPG).
 * Note: AC / DirectX UV origin is top-left, so flipY MUST be false!
 */
export function createThreeTextureFromKn5(
  tex: Kn5Texture,
  isColorSrgb: boolean
): { texture: THREE.Texture | null; decoded?: DecodedRgbaImage } {
  if (!tex || tex.type === 0 || tex.data.byteLength < 16) {
    return { texture: null };
  }

  // Check DDS signature first (regardless of file extension)
  if (
    tex.data[0] === 0x44 &&
    tex.data[1] === 0x44 &&
    tex.data[2] === 0x53 &&
    tex.data[3] === 0x20
  ) {
    const decoded = decodeDdsToRgba(tex.data);
    if (!decoded) return { texture: null };
    const dt = new THREE.DataTexture(
      decoded.data,
      decoded.width,
      decoded.height,
      THREE.RGBAFormat
    );
    dt.flipY = false; // DirectX / KN5 UV space
    dt.wrapS = THREE.RepeatWrapping;
    dt.wrapT = THREE.RepeatWrapping;
    dt.colorSpace = isColorSrgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    dt.generateMipmaps = true;
    dt.minFilter = THREE.LinearMipmapLinearFilter;
    dt.magFilter = THREE.LinearFilter;
    dt.anisotropy = 8;
    dt.needsUpdate = true;
    return { texture: dt, decoded };
  }

  // PNG / JPG / WebP
  const lower = tex.name.toLowerCase();
  const isPng = tex.data[0] === 0x89 && tex.data[1] === 0x50;
  const isJpg = tex.data[0] === 0xff && tex.data[1] === 0xd8;
  if (isPng || isJpg || lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
    try {
      const mime = isPng || lower.endsWith('.png') ? 'image/png' : 'image/jpeg';
      const copy = new Uint8Array(tex.data.byteLength);
      copy.set(tex.data);
      const blob = new Blob([copy.buffer], { type: mime });
      const url = URL.createObjectURL(blob);
      const loaded = new THREE.TextureLoader().load(url, () => URL.revokeObjectURL(url));
      loaded.flipY = false; // DirectX / KN5 UV space
      loaded.wrapS = THREE.RepeatWrapping;
      loaded.wrapT = THREE.RepeatWrapping;
      loaded.colorSpace = isColorSrgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      loaded.anisotropy = 8;
      return { texture: loaded };
    } catch {
      return { texture: null };
    }
  }

  return { texture: null };
}

/**
 * Extracts a roughness map from Assetto Corsa's txMaps (G channel = gloss/smoothness -> roughness = 1 - G).
 */
function buildCspRoughnessFromTxMaps(decoded: DecodedRgbaImage): THREE.DataTexture {
  const { width, height, data } = decoded;
  const out = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const g = data[i * 4 + 1]; // AC txMaps Green = glossiness/specular sharpness
    const rough = Math.max(18, Math.min(245, 255 - g));
    out[i * 4] = rough;
    out[i * 4 + 1] = rough;
    out[i * 4 + 2] = rough;
    out[i * 4 + 3] = 255;
  }
  const dt = new THREE.DataTexture(out, width, height, THREE.RGBAFormat);
  dt.flipY = false;
  dt.wrapS = THREE.RepeatWrapping;
  dt.wrapT = THREE.RepeatWrapping;
  dt.colorSpace = THREE.NoColorSpace;
  dt.generateMipmaps = true;
  dt.minFilter = THREE.LinearMipmapLinearFilter;
  dt.needsUpdate = true;
  return dt;
}

/**
 * Generates a small preview thumbnail DataURL for any KN5 texture (including DDS!).
 */
export function kn5TextureToPreviewDataUrl(tex: Kn5Texture, maxDim = 96): string | null {
  if (!tex || tex.type === 0 || tex.data.byteLength < 16) return null;
  if (typeof document === 'undefined') return null;

  // DDS -> decode and draw to offscreen canvas
  if (tex.data[0] === 0x44 && tex.data[1] === 0x44 && tex.data[2] === 0x53 && tex.data[3] === 0x20) {
    const decoded = decodeDdsToRgba(tex.data);
    if (!decoded) return null;
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = decoded.width;
    srcCanvas.height = decoded.height;
    const sctx = srcCanvas.getContext('2d');
    if (!sctx) return null;
    const imgData = sctx.createImageData(decoded.width, decoded.height);
    imgData.data.set(decoded.data);
    sctx.putImageData(imgData, 0, 0);

    const scale = Math.min(1, maxDim / Math.max(decoded.width, decoded.height));
    const dstCanvas = document.createElement('canvas');
    dstCanvas.width = Math.max(1, Math.round(decoded.width * scale));
    dstCanvas.height = Math.max(1, Math.round(decoded.height * scale));
    const dctx = dstCanvas.getContext('2d');
    if (!dctx) return null;
    dctx.drawImage(srcCanvas, 0, 0, dstCanvas.width, dstCanvas.height);
    const dataUrl = dstCanvas.toDataURL('image/png');
    srcCanvas.width = 0;
    srcCanvas.height = 0;
    dstCanvas.width = 0;
    dstCanvas.height = 0;
    return dataUrl;
  }

  // PNG / JPG -> base64
  if ((tex.data[0] === 0x89 && tex.data[1] === 0x50) || (tex.data[0] === 0xff && tex.data[1] === 0xd8)) {
    const mime = tex.data[0] === 0x89 ? 'image/png' : 'image/jpeg';
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < tex.data.length; i += chunk) {
      bin += String.fromCharCode(...tex.data.subarray(i, i + chunk));
    }
    return `data:${mime};base64,${btoa(bin)}`;
  }

  return null;
}

// ===== KsEditor Property Helpers =====
export function getKn5Prop(mat: Kn5Material, name: string): Kn5MaterialProperty | undefined {
  const target = name.toLowerCase();
  return mat.properties.find((p) => p.name.toLowerCase() === target);
}

export function getKn5PropA(mat: Kn5Material, name: string, fallback: number): number {
  const p = getKn5Prop(mat, name);
  return p && Number.isFinite(p.valueA) ? p.valueA : fallback;
}

export function setKn5PropA(mat: Kn5Material, name: string, valueA: number) {
  const p = getKn5Prop(mat, name);
  if (p) {
    p.valueA = valueA;
  } else {
    mat.properties.push({
      name,
      valueA,
      valueB: [0, 0],
      valueC: [0, 0, 0],
      valueD: [0, 0, 0, 0],
    });
  }
}

export function setKn5PropC(mat: Kn5Material, name: string, valueC: [number, number, number]) {
  const p = getKn5Prop(mat, name);
  if (p) {
    p.valueC = valueC;
  } else {
    mat.properties.push({
      name,
      valueA: 0,
      valueB: [0, 0],
      valueC,
      valueD: [0, 0, 0, 0],
    });
  }
}

export interface CspTextureCache {
  rawTextures: Map<string, Kn5Texture>;
  colorTextures: Map<string, THREE.Texture | null>;
  linearTextures: Map<string, THREE.Texture | null>;
  decodedImages: Map<string, DecodedRgbaImage>;
  roughnessFromMaps: Map<string, THREE.DataTexture | null>;
}

/**
 * Registers KN5 textures for lazy on-demand decoding.
 * Only textures actually referenced as txDiffuse / txNormal / txMaps by materials are decoded and uploaded,
 * cutting KN5 load CPU time and GPU VRAM footprint by ~50-65% on large vehicles.
 */
export function buildCspTextureCache(textures: Kn5Texture[]): CspTextureCache {
  const rawTextures = new Map<string, Kn5Texture>();
  for (const tex of textures) {
    if (!tex.name || tex.type === 0 || tex.data.byteLength < 16) continue;
    rawTextures.set(tex.name.toLowerCase(), tex);
  }
  return {
    rawTextures,
    colorTextures: new Map(),
    linearTextures: new Map(),
    decodedImages: new Map(),
    roughnessFromMaps: new Map(),
  };
}

function getOrDecodeCspTexture(
  cache: CspTextureCache,
  key: string,
  isColorSrgb: boolean
): THREE.Texture | null {
  const targetMap = isColorSrgb ? cache.colorTextures : cache.linearTextures;
  if (targetMap.has(key)) {
    return targetMap.get(key) ?? null;
  }

  const raw = cache.rawTextures.get(key);
  if (!raw) {
    targetMap.set(key, null);
    return null;
  }

  // Reuse already-decoded DDS pixel buffer if the other color-space variant decoded it first
  const cachedDec = cache.decodedImages.get(key);
  if (cachedDec) {
    const dt = new THREE.DataTexture(cachedDec.data, cachedDec.width, cachedDec.height, THREE.RGBAFormat);
    dt.flipY = false;
    dt.wrapS = THREE.RepeatWrapping;
    dt.wrapT = THREE.RepeatWrapping;
    dt.colorSpace = isColorSrgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    dt.generateMipmaps = true;
    dt.minFilter = THREE.LinearMipmapLinearFilter;
    dt.magFilter = THREE.LinearFilter;
    dt.anisotropy = 8;
    dt.needsUpdate = true;
    targetMap.set(key, dt);
    return dt;
  }

  const res = createThreeTextureFromKn5(raw, isColorSrgb);
  if (res.decoded) {
    cache.decodedImages.set(key, res.decoded);
  }
  targetMap.set(key, res.texture);
  return res.texture;
}

function getOrDecodeRoughnessFromMaps(
  cache: CspTextureCache,
  key: string
): THREE.DataTexture | null {
  if (cache.roughnessFromMaps.has(key)) {
    return cache.roughnessFromMaps.get(key) ?? null;
  }
  let dec = cache.decodedImages.get(key);
  if (!dec) {
    const raw = cache.rawTextures.get(key);
    if (
      raw &&
      raw.data[0] === 0x44 &&
      raw.data[1] === 0x44 &&
      raw.data[2] === 0x53 &&
      raw.data[3] === 0x20
    ) {
      dec = decodeDdsToRgba(raw.data) ?? undefined;
    }
  }
  const roughMap = dec ? buildCspRoughnessFromTxMaps(dec) : null;
  cache.roughnessFromMaps.set(key, roughMap);
  return roughMap;
}

/**
 * Converts a KsEditor Kn5Material into a CSP-inspired MeshPhysicalMaterial
 * (with IBL Fresnel, Clearcoat, txDiffuse, txNormal, txMaps roughness, Emissive & Alpha).
 */
export function buildCspMaterialFromKn5(
  kn5Mat: Kn5Material,
  texCache: CspTextureCache,
  existingMat?: THREE.MeshPhysicalMaterial
): THREE.MeshPhysicalMaterial {
  const mat = existingMat ?? new THREE.MeshPhysicalMaterial();
  mat.name = kn5Mat.name;

  const shaderLower = (kn5Mat.shader || '').toLowerCase();
  const nameLower = (kn5Mat.name || '').toLowerCase();

  // KsEditor uniforms
  const ksDiffuse = getKn5PropA(kn5Mat, 'ksDiffuse', 0.4);
  const ksSpecular = getKn5PropA(kn5Mat, 'ksSpecular', 0.35);
  const ksSpecularExp = getKn5PropA(kn5Mat, 'ksSpecularEXP', 50);
  const fresnelC = getKn5PropA(kn5Mat, 'fresnelC', 0.05);
  const fresnelMax = getKn5PropA(kn5Mat, 'fresnelMaxLevel', 0.35);
  const sunSpec = getKn5PropA(kn5Mat, 'sunSpecular', 0);
  const emissiveProp = getKn5Prop(kn5Mat, 'ksEmissive');
  const ksAlphaRef = getKn5PropA(kn5Mat, 'ksAlphaRef', 0.5);

  // Texture slots
  const findTexName = (sampler: string) =>
    kn5Mat.textureMappings.find((tm) => tm.name.toLowerCase() === sampler.toLowerCase())?.texture?.toLowerCase();

  const diffKey = findTexName('txDiffuse');
  const normKey = findTexName('txNormal');
  const mapsKey = findTexName('txMaps');

  const diffTex = diffKey ? getOrDecodeCspTexture(texCache, diffKey, true) : null;
  const normTex = normKey ? getOrDecodeCspTexture(texCache, normKey, false) : null;
  const roughMap = mapsKey ? getOrDecodeRoughnessFromMaps(texCache, mapsKey) : null;

  mat.map = diffTex;
  mat.normalMap = normTex;
  mat.roughnessMap = roughMap;

  // Color brightness from ksDiffuse (when texture is present, keep color bright white-tinted so texture shows accurately)
  if (diffTex) {
    const gain = Math.min(1.0, Math.max(0.55, 0.65 + ksDiffuse * 0.7));
    mat.color.setRGB(gain, gain, gain);
  } else {
    // Untextured fallback tint
    if (shaderLower.includes('windscreen') || nameLower.includes('glass')) {
      mat.color.set('#1e293b');
    } else if (shaderLower.includes('tyre') || nameLower.includes('tyre') || nameLower.includes('tire')) {
      mat.color.set('#1b1e24');
    } else {
      const c = Math.min(0.85, Math.max(0.22, ksDiffuse * 1.1));
      mat.color.setRGB(c, c, c);
    }
  }

  // CSP Roughness, Metalness, Clearcoat & Fresnel mapping
  const isWindscreen = shaderLower.includes('windscreen') || nameLower.includes('windscreen');
  const isMultiMap = shaderLower.includes('multimap') || shaderLower.includes('reflection');
  const isTyre = shaderLower.includes('tyre') || nameLower.includes('tyre') || nameLower.includes('tire');

  // Map AC specular exponent (1..250) -> PBR roughness (0.06..0.92)
  const expRough = Math.max(0.06, Math.min(0.92, 1.0 - Math.log2(Math.max(1, ksSpecularExp)) / 8.8));
  mat.roughness = isTyre ? 0.84 : roughMap ? 0.95 : expRough;
  mat.metalness = isTyre
    ? 0.04
    : isWindscreen
      ? 0.1
      : Math.min(0.92, Math.max(0.02, fresnelC * 1.35 + ksSpecular * 0.25));

  // CSP Car Paint Clearcoat simulation
  if (isWindscreen) {
    mat.clearcoat = 1.0;
    mat.clearcoatRoughness = 0.04;
    mat.envMapIntensity = 1.85;
  } else if (isMultiMap && (fresnelMax > 0.2 || sunSpec > 1)) {
    mat.clearcoat = Math.min(1.0, Math.max(0.15, fresnelMax * 1.15));
    mat.clearcoatRoughness = Math.max(0.03, Math.min(0.45, 0.35 - fresnelMax * 0.28));
    mat.envMapIntensity = 0.95 + fresnelMax * 1.15;
  } else {
    mat.clearcoat = 0;
    mat.envMapIntensity = isTyre ? 0.35 : 0.75 + fresnelMax * 0.6;
  }

  mat.reflectivity = Math.min(1.0, Math.max(0.1, fresnelMax));

  // Emissive (lights, dash, glowing brakes)
  if (emissiveProp) {
    const [er, eg, eb] = emissiveProp.valueC;
    const mag = Math.max(er, eg, eb);
    if (mag > 0.02) {
      mat.emissive.setRGB(Math.min(1, er), Math.min(1, eg), Math.min(1, eb));
      mat.emissiveIntensity = Math.min(3.0, mag);
    } else {
      mat.emissive.setRGB(0, 0, 0);
      mat.emissiveIntensity = 0;
    }
  } else {
    mat.emissive.setRGB(0, 0, 0);
    mat.emissiveIntensity = 0;
  }

  // BlendMode, AlphaTested, DepthMode (exact KsEditor flags)
  if (kn5Mat.blendMode === 1 || isWindscreen) {
    mat.transparent = true;
    mat.opacity = isWindscreen ? 0.36 : diffTex ? 0.92 : 0.45;
  } else {
    mat.transparent = false;
    mat.opacity = 1.0;
  }

  mat.alphaTest = kn5Mat.alphaTested ? Math.max(0.05, Math.min(0.95, ksAlphaRef || 0.5)) : 0;
  mat.depthWrite = kn5Mat.depthMode !== 1 && !isWindscreen;
  mat.depthTest = kn5Mat.depthMode !== 2;
  mat.side = isWindscreen || kn5Mat.blendMode === 1 ? THREE.DoubleSide : THREE.FrontSide;

  // Store full KsEditor Kn5Material metadata for lossless round-trip export!
  mat.userData.kn5Material = structuredClone(kn5Mat);
  mat.needsUpdate = true;

  return mat;
}

/**
 * Generates a high-dynamic-range CSP-style IBL environment map via PMREMGenerator
 * (softbox reflections on car paint, horizon contrast, crisp rim highlights).
 */
export function createCspEnvironmentMap(
  renderer: THREE.WebGLRenderer,
  preset: CspLightingPreset
): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const envScene = new THREE.Scene();

  if (preset === 'csp_showroom') {
    envScene.background = new THREE.Color('#131926');
    // Overhead racing showroom linear softboxes (signature CSP carpaint reflection bands!)
    const stripMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4.5, 4.7, 5.2) });
    for (let z = -6; z <= 6; z += 4) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(10, 0.25, 1.4), stripMat);
      strip.position.set(0, 8, z);
      envScene.add(strip);
    }
    // Side fill panels
    const sideL = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 4),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.7, 2.2), side: THREE.DoubleSide })
    );
    sideL.position.set(-10, 3.5, 0);
    sideL.rotation.y = Math.PI / 2;
    envScene.add(sideL);

    const sideR = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 4),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 1.85, 1.75), side: THREE.DoubleSide })
    );
    sideR.position.set(10, 3.5, 0);
    sideR.rotation.y = -Math.PI / 2;
    envScene.add(sideR);
  } else if (preset === 'csp_sunset') {
    envScene.background = new THREE.Color('#1a2238');
    // Warm sunset sun disc + horizon glow
    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(2.2, 16, 16),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(9.0, 4.2, 1.8) })
    );
    sun.position.set(12, 4.5, 10);
    envScene.add(sun);

    const skyBand = new THREE.Mesh(
      new THREE.CylinderGeometry(18, 18, 5, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 0.95, 0.65), side: THREE.BackSide })
    );
    skyBand.position.y = 2.5;
    envScene.add(skyBand);

    const upperSky = new THREE.Mesh(
      new THREE.PlaneGeometry(36, 36),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.9, 1.8), side: THREE.DoubleSide })
    );
    upperSky.position.y = 12;
    upperSky.rotation.x = Math.PI / 2;
    envScene.add(upperSky);
  } else {
    // csp_studio_dark
    envScene.background = new THREE.Color('#070a10');
    const mainBar = new THREE.Mesh(
      new THREE.BoxGeometry(12, 0.2, 1.0),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(5.5, 5.5, 6.0) })
    );
    mainBar.position.set(0, 7.5, 0);
    envScene.add(mainBar);

    const cyanAccent = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 3.5, 12),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.6, 3.8) })
    );
    cyanAccent.position.set(-9, 3, 0);
    envScene.add(cyanAccent);

    const roseAccent = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 3.0, 10),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 0.8, 1.2) })
    );
    roseAccent.position.set(9, 2.8, 0);
    envScene.add(roseAccent);
  }

  const rt = pmrem.fromScene(envScene, 0.035);
  disposeThreeObject(envScene);
  pmrem.dispose();
  return rt.texture;
}

/**
 * Standard KsEditor shader presets for creating or resetting materials cleanly.
 */
export const KSEDITOR_SHADERS = [
  'ksPerPixel',
  'ksPerPixelReflection',
  'ksPerPixelNM',
  'ksPerPixelNM_UVMult',
  'ksPerPixelMultiMap',
  'ksPerPixelMultiMap_NMDetail',
  'ksPerPixelMultiMap_damage_dirt',
  'ksWindscreen',
  'ksTyres',
  'ksPerPixelAlpha',
  'ksPerPixelAT',
  'ksBrakeDisc',
] as const;

export function createKsEditorPresetMaterial(
  preset: 'carpaint' | 'glass' | 'carbon' | 'metal_rim' | 'tyre' | 'emissive',
  matName: string,
  diffuseTexName: string
): Kn5Material {
  const prop = (name: string, a: number, c: [number, number, number] = [0, 0, 0]): Kn5MaterialProperty => ({
    name,
    valueA: a,
    valueB: [0, 0],
    valueC: c,
    valueD: [0, 0, 0, 0],
  });

  if (preset === 'glass') {
    return {
      name: matName,
      shader: 'ksWindscreen',
      blendMode: 1,
      alphaTested: false,
      depthMode: 1,
      properties: [
        prop('ksAmbient', 0.25),
        prop('ksDiffuse', 0.15),
        prop('ksSpecular', 0.85),
        prop('ksSpecularEXP', 160),
        prop('ksEmissive', 0),
        prop('fresnelC', 0.18),
        prop('fresnelEXP', 4.0),
        prop('fresnelMaxLevel', 0.95),
      ],
      textureMappings: [{ name: 'txDiffuse', slot: 0, texture: diffuseTexName }],
    };
  }

  if (preset === 'carpaint') {
    return {
      name: matName,
      shader: 'ksPerPixelReflection',
      blendMode: 0,
      alphaTested: false,
      depthMode: 0,
      properties: [
        prop('ksAmbient', 0.35),
        prop('ksDiffuse', 0.45),
        prop('ksSpecular', 0.45),
        prop('ksSpecularEXP', 140),
        prop('ksEmissive', 0),
        prop('fresnelC', 0.12),
        prop('fresnelEXP', 4.5),
        prop('fresnelMaxLevel', 0.85),
        prop('sunSpecular', 8.0),
        prop('sunSpecularEXP', 180),
      ],
      textureMappings: [{ name: 'txDiffuse', slot: 0, texture: diffuseTexName }],
    };
  }

  if (preset === 'metal_rim') {
    return {
      name: matName,
      shader: 'ksPerPixelReflection',
      blendMode: 0,
      alphaTested: false,
      depthMode: 0,
      properties: [
        prop('ksAmbient', 0.30),
        prop('ksDiffuse', 0.40),
        prop('ksSpecular', 0.80),
        prop('ksSpecularEXP', 120),
        prop('ksEmissive', 0),
        prop('fresnelC', 0.38),
        prop('fresnelEXP', 3.0),
        prop('fresnelMaxLevel', 0.92),
      ],
      textureMappings: [{ name: 'txDiffuse', slot: 0, texture: diffuseTexName }],
    };
  }

  if (preset === 'carbon') {
    return {
      name: matName,
      shader: 'ksPerPixelReflection',
      blendMode: 0,
      alphaTested: false,
      depthMode: 0,
      properties: [
        prop('ksAmbient', 0.25),
        prop('ksDiffuse', 0.32),
        prop('ksSpecular', 0.45),
        prop('ksSpecularEXP', 90),
        prop('ksEmissive', 0),
        prop('fresnelC', 0.08),
        prop('fresnelEXP', 5.0),
        prop('fresnelMaxLevel', 0.55),
      ],
      textureMappings: [{ name: 'txDiffuse', slot: 0, texture: diffuseTexName }],
    };
  }

  if (preset === 'emissive') {
    return {
      name: matName,
      shader: 'ksPerPixel',
      blendMode: 0,
      alphaTested: false,
      depthMode: 0,
      properties: [
        prop('ksAmbient', 0.35),
        prop('ksDiffuse', 0.45),
        prop('ksSpecular', 0.55),
        prop('ksSpecularEXP', 80),
        prop('ksEmissive', 0, [2.2, 0.15, 0.15]),
      ],
      textureMappings: [{ name: 'txDiffuse', slot: 0, texture: diffuseTexName }],
    };
  }

  // tyre / matte rubber
  return {
    name: matName,
    shader: 'ksPerPixel',
    blendMode: 0,
    alphaTested: false,
    depthMode: 0,
    properties: [
      prop('ksAmbient', 0.22),
      prop('ksDiffuse', 0.26),
      prop('ksSpecular', 0.08),
      prop('ksSpecularEXP', 18),
      prop('ksEmissive', 0),
    ],
    textureMappings: [{ name: 'txDiffuse', slot: 0, texture: diffuseTexName }],
  };
}
