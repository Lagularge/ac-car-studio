import * as THREE from 'three';
import {
  buildCspMaterialFromKn5,
  buildCspTextureCache,
  createKsEditorPresetMaterial,
  type CspTextureCache,
} from './cspRenderer';

export interface Kn5Texture {
  type: number; // 1 = active texture with data, 0 = empty slot
  name: string;
  data: Uint8Array;
}

export interface Kn5MaterialProperty {
  name: string;
  valueA: number;
  valueB: [number, number];
  valueC: [number, number, number];
  valueD: [number, number, number, number];
}

export interface Kn5TextureMapping {
  name: string;
  slot: number;
  texture: string;
}

export interface Kn5Material {
  name: string;
  shader: string;
  blendMode: number;   // 0=Opaque, 1=AlphaBlend, 2=AlphaToCoverage
  alphaTested: boolean;
  depthMode: number;   // 0=DepthNormal, 1=DepthNoWrite, 2=DepthOff
  properties: Kn5MaterialProperty[];
  textureMappings: Kn5TextureMapping[];
}

export interface Kn5Bone {
  name: string;
  transform: Float32Array; // 16 floats
}

export interface Kn5MeshData {
  castShadows: boolean;
  isVisible: boolean;
  isTransparent: boolean;
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  tangents: Float32Array;
  indices: Uint16Array;
  materialId: number;
  layer: number;
  lodIn: number;
  lodOut: number;
  boundingSphereCenter: [number, number, number];
  boundingSphereRadius: number;
  isRenderable: boolean;
  // Optional SkinnedMesh (nodeClass = 3) lossless preservation
  bones?: Kn5Bone[];
  skinWeights?: Float32Array;   // vertexCount * 4
  skinIndices?: Float32Array;   // vertexCount * 4
}

export interface Kn5Node {
  nodeClass: 1 | 2 | 3; // 1=Dummy, 2=Mesh, 3=SkinnedMesh
  name: string;
  active: boolean;
  transform: Float32Array; // 16 floats (4x4) for Dummy
  mesh?: Kn5MeshData;
  children: Kn5Node[];
}

export interface Kn5Document {
  version: number;
  unknownNo?: number;
  textures: Kn5Texture[];
  materials: Kn5Material[];
  root: Kn5Node;
}

export interface Kn5MeshUserMeta {
  nodeClass: 2 | 3;
  castShadows: boolean;
  isVisible: boolean;
  isTransparent: boolean;
  layer: number;
  lodIn: number;
  lodOut: number;
  isRenderable: boolean;
  bones?: Kn5Bone[];
  skinWeights?: Float32Array;
  skinIndices?: Float32Array;
}

class BinaryReader {
  private view: DataView;
  private bytes: Uint8Array;
  public offset = 0;
  private decoder = new TextDecoder('utf-8');

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get remaining() {
    return this.bytes.byteLength - this.offset;
  }

  readUint8(): number {
    const v = this.view.getUint8(this.offset);
    this.offset += 1;
    return v;
  }

  readInt32(): number {
    const v = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return v;
  }

  readUint16(): number {
    const v = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return v;
  }

  readFloat32(): number {
    const v = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    return v;
  }

  readBytes(len: number): Uint8Array {
    const slice = this.bytes.subarray(this.offset, this.offset + len);
    this.offset += len;
    return slice;
  }

  readString(): string {
    const len = this.readInt32();
    if (len <= 0) return '';
    const slice = this.readBytes(len);
    return this.decoder.decode(slice);
  }
}

class BinaryWriter {
  private chunks: Uint8Array[] = [];
  private total = 0;
  private encoder = new TextEncoder();

  writeBytes(arr: Uint8Array) {
    this.chunks.push(arr);
    this.total += arr.byteLength;
  }

  writeUint8(v: number) {
    this.writeBytes(new Uint8Array([v & 0xff]));
  }

  writeInt32(v: number) {
    const b = new ArrayBuffer(4);
    new DataView(b).setInt32(0, v, true);
    this.writeBytes(new Uint8Array(b));
  }

  writeUint16(v: number) {
    const b = new ArrayBuffer(2);
    new DataView(b).setUint16(0, v & 0xffff, true);
    this.writeBytes(new Uint8Array(b));
  }

  writeFloat32(v: number) {
    const b = new ArrayBuffer(4);
    new DataView(b).setFloat32(0, Number.isFinite(v) ? v : 0, true);
    this.writeBytes(new Uint8Array(b));
  }

  writeString(s: string) {
    const encoded = this.encoder.encode(s);
    this.writeInt32(encoded.byteLength);
    if (encoded.byteLength > 0) this.writeBytes(encoded);
  }

  toUint8Array(): Uint8Array {
    const out = new Uint8Array(this.total);
    let offset = 0;
    for (const c of this.chunks) {
      out.set(c, offset);
      offset += c.byteLength;
    }
    return out;
  }
}

/**
 * Generates a valid 4x4 uncompressed 32-bit BGRA DDS texture of a solid color.
 * 100% compatible with KsEditor, Assetto Corsa, and Custom Shaders Patch (CSP).
 */
export function createSolidColorDds(r: number, g: number, b: number, a = 255): Uint8Array {
  const width = 4;
  const height = 4;
  const pixelBytes = width * height * 4;
  const out = new Uint8Array(128 + pixelBytes);
  const view = new DataView(out.buffer);

  // 'DDS '
  view.setUint32(0, 0x20534444, true);
  view.setUint32(4, 124, true); // dwSize
  view.setUint32(8, 0x1 | 0x2 | 0x4 | 0x1000 | 0x8, true); // CAPS | HEIGHT | WIDTH | PIXELFORMAT | PITCH
  view.setUint32(12, height, true);
  view.setUint32(16, width, true);
  view.setUint32(20, width * 4, true); // pitch
  view.setUint32(28, 1, true); // mipMapCount

  // DDS_PIXELFORMAT (offset 76)
  view.setUint32(76, 32, true); // pfSize
  view.setUint32(80, 0x41, true); // DDPF_RGB | DDPF_ALPHAPIXELS
  view.setUint32(84, 0, true); // fourCC = 0 (uncompressed)
  view.setUint32(88, 32, true); // rgbBitCount
  view.setUint32(92, 0x00ff0000, true); // R mask (BGRA)
  view.setUint32(96, 0x0000ff00, true); // G mask
  view.setUint32(100, 0x000000ff, true); // B mask
  view.setUint32(104, 0xff000000, true); // A mask
  view.setUint32(108, 0x1000, true); // DDSCAPS_TEXTURE

  for (let i = 0; i < width * height; i++) {
    const off = 128 + i * 4;
    out[off] = b & 0xff;
    out[off + 1] = g & 0xff;
    out[off + 2] = r & 0xff;
    out[off + 3] = a & 0xff;
  }

  return out;
}

export function parseKn5(bytes: Uint8Array): Kn5Document {
  const r = new BinaryReader(bytes);
  const magic = new TextDecoder('ascii').decode(r.readBytes(6));
  if (magic !== 'sc6969') {
    throw new Error(`KN5 マジックヘッダが不正です ("${magic}")`);
  }

  const version = r.readInt32();
  let unknownNo: number | undefined;
  if (version >= 6) {
    unknownNo = r.readInt32();
  }

  const textureCount = r.readInt32();
  const textures: Kn5Texture[] = [];
  for (let i = 0; i < textureCount; i++) {
    const type = r.readInt32();
    const name = r.readString();
    let data = new Uint8Array(0);
    if (type !== 0) {
      const size = r.readInt32();
      data = new Uint8Array(r.readBytes(Math.max(0, size)));
    }
    textures.push({ type, name, data });
  }

  const materialCount = r.readInt32();
  const materials: Kn5Material[] = [];
  for (let i = 0; i < materialCount; i++) {
    const name = r.readString();
    const shader = r.readString();
    const blendMode = r.readUint8();
    const alphaTested = r.readUint8() !== 0;
    const depthMode = version >= 5 ? r.readInt32() : 0;

    const propCount = r.readInt32();
    const properties: Kn5MaterialProperty[] = [];
    for (let p = 0; p < propCount; p++) {
      const propName = r.readString();
      const valueA = r.readFloat32();
      const valueB: [number, number] = [r.readFloat32(), r.readFloat32()];
      const valueC: [number, number, number] = [r.readFloat32(), r.readFloat32(), r.readFloat32()];
      const valueD: [number, number, number, number] = [
        r.readFloat32(),
        r.readFloat32(),
        r.readFloat32(),
        r.readFloat32(),
      ];
      properties.push({ name: propName, valueA, valueB, valueC, valueD });
    }

    const texCount = r.readInt32();
    const textureMappings: Kn5TextureMapping[] = [];
    for (let t = 0; t < texCount; t++) {
      const sampler = r.readString();
      const slot = r.readInt32();
      const texName = r.readString();
      textureMappings.push({ name: sampler, slot, texture: texName });
    }

    materials.push({
      name,
      shader,
      blendMode,
      alphaTested,
      depthMode,
      properties,
      textureMappings,
    });
  }

  function readNode(): Kn5Node {
    const nodeClass = r.readInt32() as 1 | 2 | 3;
    const name = r.readString();
    const childrenCount = r.readInt32();
    const active = r.readUint8() !== 0;

    const transform = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]);
    let mesh: Kn5MeshData | undefined;

    if (nodeClass === 1) {
      for (let m = 0; m < 16; m++) {
        transform[m] = r.readFloat32();
      }
    } else if (nodeClass === 2) {
      const castShadows = r.readUint8() !== 0;
      const isVisible = r.readUint8() !== 0;
      const isTransparent = r.readUint8() !== 0;
      const vertexCount = r.readInt32();

      const positions = new Float32Array(vertexCount * 3);
      const normals = new Float32Array(vertexCount * 3);
      const uvs = new Float32Array(vertexCount * 2);
      const tangents = new Float32Array(vertexCount * 3);

      for (let v = 0; v < vertexCount; v++) {
        positions[v * 3] = r.readFloat32();
        positions[v * 3 + 1] = r.readFloat32();
        positions[v * 3 + 2] = r.readFloat32();
        normals[v * 3] = r.readFloat32();
        normals[v * 3 + 1] = r.readFloat32();
        normals[v * 3 + 2] = r.readFloat32();
        uvs[v * 2] = r.readFloat32();
        uvs[v * 2 + 1] = r.readFloat32();
        tangents[v * 3] = r.readFloat32();
        tangents[v * 3 + 1] = r.readFloat32();
        tangents[v * 3 + 2] = r.readFloat32();
      }

      const indexCount = r.readInt32();
      const indices = new Uint16Array(indexCount);
      for (let idx = 0; idx < indexCount; idx++) {
        indices[idx] = r.readUint16();
      }

      const materialId = r.readInt32();
      const layer = r.readInt32();
      const lodIn = r.readFloat32();
      const lodOut = r.readFloat32();
      const boundingSphereCenter: [number, number, number] = [
        r.readFloat32(),
        r.readFloat32(),
        r.readFloat32(),
      ];
      const boundingSphereRadius = r.readFloat32();
      const isRenderable = r.readUint8() !== 0;

      mesh = {
        castShadows,
        isVisible,
        isTransparent,
        positions,
        normals,
        uvs,
        tangents,
        indices,
        materialId,
        layer,
        lodIn,
        lodOut,
        boundingSphereCenter,
        boundingSphereRadius,
        isRenderable,
      };
    } else if (nodeClass === 3) {
      const castShadows = r.readUint8() !== 0;
      const isVisible = r.readUint8() !== 0;
      const isTransparent = r.readUint8() !== 0;
      const boneCount = r.readInt32();
      const bones: Kn5Bone[] = [];
      for (let b = 0; b < boneCount; b++) {
        const bName = r.readString();
        const bMat = new Float32Array(16);
        for (let m = 0; m < 16; m++) bMat[m] = r.readFloat32();
        bones.push({ name: bName, transform: bMat });
      }

      const vertexCount = r.readInt32();
      const positions = new Float32Array(vertexCount * 3);
      const normals = new Float32Array(vertexCount * 3);
      const uvs = new Float32Array(vertexCount * 2);
      const tangents = new Float32Array(vertexCount * 3);
      const skinWeights = new Float32Array(vertexCount * 4);
      const skinIndices = new Float32Array(vertexCount * 4);

      for (let v = 0; v < vertexCount; v++) {
        positions[v * 3] = r.readFloat32();
        positions[v * 3 + 1] = r.readFloat32();
        positions[v * 3 + 2] = r.readFloat32();
        normals[v * 3] = r.readFloat32();
        normals[v * 3 + 1] = r.readFloat32();
        normals[v * 3 + 2] = r.readFloat32();
        uvs[v * 2] = r.readFloat32();
        uvs[v * 2 + 1] = r.readFloat32();
        tangents[v * 3] = r.readFloat32();
        tangents[v * 3 + 1] = r.readFloat32();
        tangents[v * 3 + 2] = r.readFloat32();
        skinWeights[v * 4] = r.readFloat32();
        skinWeights[v * 4 + 1] = r.readFloat32();
        skinWeights[v * 4 + 2] = r.readFloat32();
        skinWeights[v * 4 + 3] = r.readFloat32();
        skinIndices[v * 4] = r.readFloat32();
        skinIndices[v * 4 + 1] = r.readFloat32();
        skinIndices[v * 4 + 2] = r.readFloat32();
        skinIndices[v * 4 + 3] = r.readFloat32();
      }

      const indexCount = r.readInt32();
      const indices = new Uint16Array(indexCount);
      for (let idx = 0; idx < indexCount; idx++) {
        indices[idx] = r.readUint16();
      }
      const materialId = r.readInt32();
      const layer = r.readInt32();

      mesh = {
        castShadows,
        isVisible,
        isTransparent,
        positions,
        normals,
        uvs,
        tangents,
        indices,
        materialId,
        layer,
        lodIn: 0,
        lodOut: 2000,
        boundingSphereCenter: [0, 0, 0],
        boundingSphereRadius: 1,
        isRenderable: true,
        bones,
        skinWeights,
        skinIndices,
      };
    }

    const children: Kn5Node[] = [];
    for (let c = 0; c < childrenCount; c++) {
      if (r.remaining <= 0) break;
      children.push(readNode());
    }

    return { nodeClass, name, active, transform, mesh, children };
  }

  const root = readNode();
  return { version, unknownNo, textures, materials, root };
}

export function buildKn5(doc: Kn5Document): Uint8Array {
  const w = new BinaryWriter();
  w.writeBytes(new TextEncoder().encode('sc6969'));
  const ver = doc.version >= 6 ? 6 : 5;
  w.writeInt32(ver);
  if (ver >= 6) {
    w.writeInt32(doc.unknownNo ?? 0);
  }

  // Textures (respect type === 0 empty slots vs type === 1 active textures)
  w.writeInt32(doc.textures.length);
  for (const tex of doc.textures) {
    const isActive = tex.type !== 0 && tex.data.byteLength > 0;
    w.writeInt32(isActive ? 1 : 0);
    w.writeString(tex.name);
    if (isActive) {
      w.writeInt32(tex.data.byteLength);
      w.writeBytes(tex.data);
    }
  }

  // Materials (KsEditor full fidelity)
  w.writeInt32(doc.materials.length);
  for (const mat of doc.materials) {
    w.writeString(mat.name);
    w.writeString(mat.shader || 'ksPerPixel');
    w.writeUint8(mat.blendMode ?? 0);
    w.writeUint8(mat.alphaTested ? 1 : 0);
    w.writeInt32(mat.depthMode ?? 0);

    w.writeInt32(mat.properties.length);
    for (const p of mat.properties) {
      w.writeString(p.name);
      w.writeFloat32(p.valueA);
      w.writeFloat32(p.valueB[0]);
      w.writeFloat32(p.valueB[1]);
      w.writeFloat32(p.valueC[0]);
      w.writeFloat32(p.valueC[1]);
      w.writeFloat32(p.valueC[2]);
      w.writeFloat32(p.valueD[0]);
      w.writeFloat32(p.valueD[1]);
      w.writeFloat32(p.valueD[2]);
      w.writeFloat32(p.valueD[3]);
    }

    w.writeInt32(mat.textureMappings.length);
    for (const tm of mat.textureMappings) {
      w.writeString(tm.name);
      w.writeInt32(tm.slot);
      w.writeString(tm.texture);
    }
  }

  function writeNode(node: Kn5Node) {
    const isSkinned = node.nodeClass === 3 && node.mesh?.bones && node.mesh.skinWeights && node.mesh.skinIndices;
    const cls = isSkinned ? 3 : node.nodeClass === 3 ? 2 : node.nodeClass;

    w.writeInt32(cls);
    w.writeString(node.name || 'Node');
    w.writeInt32(node.children.length);
    w.writeUint8(node.active ? 1 : 0);

    if (cls === 1) {
      for (let m = 0; m < 16; m++) {
        w.writeFloat32(node.transform[m] ?? (m % 5 === 0 ? 1 : 0));
      }
    } else if (cls === 2 && node.mesh) {
      const m = node.mesh;
      w.writeUint8(m.castShadows ? 1 : 0);
      w.writeUint8(m.isVisible ? 1 : 0);
      w.writeUint8(m.isTransparent ? 1 : 0);

      const vCount = Math.floor(m.positions.length / 3);
      w.writeInt32(vCount);
      for (let v = 0; v < vCount; v++) {
        w.writeFloat32(m.positions[v * 3] ?? 0);
        w.writeFloat32(m.positions[v * 3 + 1] ?? 0);
        w.writeFloat32(m.positions[v * 3 + 2] ?? 0);
        w.writeFloat32(m.normals[v * 3] ?? 0);
        w.writeFloat32(m.normals[v * 3 + 1] ?? 1);
        w.writeFloat32(m.normals[v * 3 + 2] ?? 0);
        w.writeFloat32(m.uvs[v * 2] ?? 0);
        w.writeFloat32(m.uvs[v * 2 + 1] ?? 0);
        w.writeFloat32(m.tangents[v * 3] ?? 1);
        w.writeFloat32(m.tangents[v * 3 + 1] ?? 0);
        w.writeFloat32(m.tangents[v * 3 + 2] ?? 0);
      }

      w.writeInt32(m.indices.length);
      for (let i = 0; i < m.indices.length; i++) {
        w.writeUint16(m.indices[i]);
      }

      w.writeInt32(m.materialId);
      w.writeInt32(m.layer);
      w.writeFloat32(m.lodIn);
      w.writeFloat32(m.lodOut);
      w.writeFloat32(m.boundingSphereCenter[0]);
      w.writeFloat32(m.boundingSphereCenter[1]);
      w.writeFloat32(m.boundingSphereCenter[2]);
      w.writeFloat32(m.boundingSphereRadius);
      w.writeUint8(m.isRenderable ? 1 : 0);
    } else if (cls === 3 && node.mesh && node.mesh.bones && node.mesh.skinWeights && node.mesh.skinIndices) {
      const m = node.mesh;
      const bones = node.mesh.bones;
      const skinWeights = node.mesh.skinWeights;
      const skinIndices = node.mesh.skinIndices;
      w.writeUint8(m.castShadows ? 1 : 0);
      w.writeUint8(m.isVisible ? 1 : 0);
      w.writeUint8(m.isTransparent ? 1 : 0);

      w.writeInt32(bones.length);
      for (const bone of bones) {
        w.writeString(bone.name);
        for (let i = 0; i < 16; i++) {
          w.writeFloat32(bone.transform[i] ?? (i % 5 === 0 ? 1 : 0));
        }
      }

      const vCount = Math.floor(m.positions.length / 3);
      w.writeInt32(vCount);
      for (let v = 0; v < vCount; v++) {
        w.writeFloat32(m.positions[v * 3] ?? 0);
        w.writeFloat32(m.positions[v * 3 + 1] ?? 0);
        w.writeFloat32(m.positions[v * 3 + 2] ?? 0);
        w.writeFloat32(m.normals[v * 3] ?? 0);
        w.writeFloat32(m.normals[v * 3 + 1] ?? 1);
        w.writeFloat32(m.normals[v * 3 + 2] ?? 0);
        w.writeFloat32(m.uvs[v * 2] ?? 0);
        w.writeFloat32(m.uvs[v * 2 + 1] ?? 0);
        w.writeFloat32(m.tangents[v * 3] ?? 1);
        w.writeFloat32(m.tangents[v * 3 + 1] ?? 0);
        w.writeFloat32(m.tangents[v * 3 + 2] ?? 0);
        w.writeFloat32(skinWeights[v * 4] ?? 0);
        w.writeFloat32(skinWeights[v * 4 + 1] ?? 0);
        w.writeFloat32(skinWeights[v * 4 + 2] ?? 0);
        w.writeFloat32(skinWeights[v * 4 + 3] ?? 0);
        w.writeFloat32(skinIndices[v * 4] ?? 0);
        w.writeFloat32(skinIndices[v * 4 + 1] ?? 0);
        w.writeFloat32(skinIndices[v * 4 + 2] ?? 0);
        w.writeFloat32(skinIndices[v * 4 + 3] ?? 0);
      }

      w.writeInt32(m.indices.length);
      for (let i = 0; i < m.indices.length; i++) {
        w.writeUint16(m.indices[i]);
      }

      w.writeInt32(m.materialId);
      w.writeInt32(m.layer);
    }

    for (const child of node.children) {
      writeNode(child);
    }
  }

  writeNode(doc.root);
  return w.toUint8Array();
}

/**
 * Converts a parsed KN5 document into a CSP-rendered Three.js Group while preserving
 * 100% of original KsEditor materials, DDS textures, node hierarchy, tangents,
 * mesh flags, and SkinnedMesh bones for lossless re-export.
 */
export function kn5ToThreeGroup(
  doc: Kn5Document,
  existingTexCache?: CspTextureCache
): THREE.Group {
  const texCache = existingTexCache ?? buildCspTextureCache(doc.textures);
  const threeMaterials = doc.materials.map((m) => buildCspMaterialFromKn5(m, texCache));

  function convertNode(node: Kn5Node): THREE.Object3D {
    if (node.nodeClass === 1) {
      const grp = new THREE.Group();
      grp.name = node.name || 'Dummy';
      grp.visible = node.active;
      const mat4 = new THREE.Matrix4().fromArray(node.transform);
      mat4.decompose(grp.position, grp.quaternion, grp.scale);
      grp.userData.kn5NodeClass = 1;
      for (const ch of node.children) {
        grp.add(convertNode(ch));
      }
      return grp;
    }

    if (node.mesh) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(node.mesh.positions, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(node.mesh.normals, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(node.mesh.uvs, 2));
      // Preserve exact original tangents for normal-map shaders in CSP!
      geo.setAttribute('kn5Tangent', new THREE.BufferAttribute(node.mesh.tangents, 3));
      geo.setIndex(new THREE.BufferAttribute(node.mesh.indices, 1));
      geo.computeBoundingSphere();

      const mat =
        threeMaterials[node.mesh.materialId] ??
        new THREE.MeshPhysicalMaterial({ color: '#94a3b8', roughness: 0.4, metalness: 0.3 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = node.name || 'Mesh';
      mesh.visible = node.active && node.mesh.isVisible;
      mesh.castShadow = node.mesh.castShadows;
      mesh.receiveShadow = true;

      const meta: Kn5MeshUserMeta = {
        nodeClass: node.nodeClass === 3 ? 3 : 2,
        castShadows: node.mesh.castShadows,
        isVisible: node.mesh.isVisible,
        isTransparent: node.mesh.isTransparent,
        layer: node.mesh.layer,
        lodIn: node.mesh.lodIn,
        lodOut: node.mesh.lodOut,
        isRenderable: node.mesh.isRenderable,
        bones: node.mesh.bones,
        skinWeights: node.mesh.skinWeights,
        skinIndices: node.mesh.skinIndices,
      };
      mesh.userData.kn5MeshMeta = meta;
      mesh.userData.kn5NodeClass = meta.nodeClass;

      for (const ch of node.children) {
        mesh.add(convertNode(ch));
      }
      return mesh;
    }

    const fallback = new THREE.Group();
    fallback.name = node.name || 'Node';
    fallback.userData.kn5NodeClass = 1;
    return fallback;
  }

  const converted = convertNode(doc.root);
  let rootGroup: THREE.Group;
  if (converted instanceof THREE.Group) {
    rootGroup = converted;
  } else {
    rootGroup = new THREE.Group();
    rootGroup.name = 'Root';
    rootGroup.add(converted);
  }

  rootGroup.userData.kn5Version = doc.version;
  rootGroup.userData.kn5UnknownNo = doc.unknownNo;
  return rootGroup;
}

/**
 * Computes accurate per-vertex orthonormal 3D tangents (Lengyel algorithm)
 * so external FBX/GLB/OBJ meshes render cleanly with CSP normal-map shaders.
 */
function computeSmoothTangents(
  positions: Float32Array,
  normals: Float32Array,
  uvs: Float32Array,
  indices: Uint16Array
): Float32Array {
  const vCount = Math.floor(positions.length / 3);
  const tan1 = new Float32Array(vCount * 3);

  for (let i = 0; i + 2 < indices.length; i += 3) {
    const i1 = indices[i];
    const i2 = indices[i + 1];
    const i3 = indices[i + 2];

    const x1 = positions[i2 * 3] - positions[i1 * 3];
    const x2 = positions[i3 * 3] - positions[i1 * 3];
    const y1 = positions[i2 * 3 + 1] - positions[i1 * 3 + 1];
    const y2 = positions[i3 * 3 + 1] - positions[i1 * 3 + 1];
    const z1 = positions[i2 * 3 + 2] - positions[i1 * 3 + 2];
    const z2 = positions[i3 * 3 + 2] - positions[i1 * 3 + 2];

    const s1 = uvs[i2 * 2] - uvs[i1 * 2];
    const s2 = uvs[i3 * 2] - uvs[i1 * 2];
    const t1 = uvs[i2 * 2 + 1] - uvs[i1 * 2 + 1];
    const t2 = uvs[i3 * 2 + 1] - uvs[i1 * 2 + 1];

    const det = s1 * t2 - s2 * t1;
    if (Math.abs(det) < 1e-8) continue;
    const r = 1.0 / det;

    const sx = (t2 * x1 - t1 * x2) * r;
    const sy = (t2 * y1 - t1 * y2) * r;
    const sz = (t2 * z1 - t1 * z2) * r;

    for (const idx of [i1, i2, i3]) {
      tan1[idx * 3] += sx;
      tan1[idx * 3 + 1] += sy;
      tan1[idx * 3 + 2] += sz;
    }
  }

  const out = new Float32Array(vCount * 3);
  for (let v = 0; v < vCount; v++) {
    const nx = normals[v * 3];
    const ny = normals[v * 3 + 1];
    const nz = normals[v * 3 + 2];
    let tx = tan1[v * 3];
    let ty = tan1[v * 3 + 1];
    let tz = tan1[v * 3 + 2];

    // Gram-Schmidt orthogonalize T against N
    const dot = nx * tx + ny * ty + nz * tz;
    tx -= nx * dot;
    ty -= ny * dot;
    tz -= nz * dot;

    const len = Math.sqrt(tx * tx + ty * ty + tz * tz);
    if (len > 1e-6) {
      out[v * 3] = tx / len;
      out[v * 3 + 1] = ty / len;
      out[v * 3 + 2] = tz / len;
    } else {
      // Safe orthogonal fallback when UVs are degenerate
      const ax = Math.abs(nx) < 0.9 ? 1 : 0;
      const ay = Math.abs(nx) < 0.9 ? 0 : 1;
      const cx = ny * 0 - nz * ay;
      const cy = nz * ax - nx * 0;
      const cz = nx * ay - ny * ax;
      const cl = Math.sqrt(cx * cx + cy * cy + cz * cz) || 1;
      out[v * 3] = cx / cl;
      out[v * 3 + 1] = cy / cl;
      out[v * 3 + 2] = cz / cl;
    }
  }
  return out;
}

function isNearIdentityMatrix(m: THREE.Matrix4): boolean {
  const e = m.elements;
  const id = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (let i = 0; i < 16; i++) {
    if (Math.abs(e[i] - id[i]) > 1e-5) return false;
  }
  return true;
}

/**
 * Lossless KsEditor-compatible export of a Three.js scene back into a valid Assetto Corsa / CSP KN5.
 * Preserves original shaders, material properties, multi-slot textures, DDS blobs,
 * indexed geometry, tangents, mesh flags, node hierarchy, and SkinnedMesh bones.
 */
export function threeGroupToKn5(
  rootObj: THREE.Object3D,
  baseTextures: Kn5Texture[] = []
): Uint8Array {
  rootObj.updateMatrixWorld(true);

  // Deduplicated texture pool preserving all original KN5 textures
  const textures: Kn5Texture[] = [];
  const texNameSet = new Set<string>();
  const addTextureIfMissing = (tex: Kn5Texture) => {
    const key = tex.name.toLowerCase();
    if (texNameSet.has(key)) return;
    texNameSet.add(key);
    textures.push(tex);
  };
  for (const t of baseTextures) {
    addTextureIfMissing(t);
  }

  const ensureSolidColorDds = (hexColor: THREE.Color, opacity = 1): string => {
    const r = Math.round(hexColor.r * 255);
    const g = Math.round(hexColor.g * 255);
    const b = Math.round(hexColor.b * 255);
    const a = Math.round(Math.max(0, Math.min(1, opacity)) * 255);
    const name = `ac_studio_col_${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}_${a.toString(16).padStart(2, '0')}.dds`;
    addTextureIfMissing({ type: 1, name, data: createSolidColorDds(r, g, b, a) });
    return name;
  };

  const materials: Kn5Material[] = [];
  const matObjectToId = new Map<THREE.Material, number>();
  const matNameToId = new Map<string, number>();

  function getOrCreateMaterialId(matInput: THREE.Material | THREE.Material[] | undefined): number {
    const m = Array.isArray(matInput) ? matInput[0] : matInput;
    if (m && matObjectToId.has(m)) return matObjectToId.get(m)!;

    // 1. Original / KsEditor-edited KN5 Material -> export with 100% lossless shader, props & texture slots!
    const storedKn5Mat = m?.userData?.kn5Material as Kn5Material | undefined;
    if (storedKn5Mat) {
      const cloned: Kn5Material = structuredClone(storedKn5Mat);
      // Verify every referenced texture exists in the texture table (create safe fallback if missing)
      for (const tm of cloned.textureMappings) {
        if (tm.texture && !texNameSet.has(tm.texture.toLowerCase())) {
          addTextureIfMissing({
            type: 1,
            name: tm.texture,
            data: createSolidColorDds(200, 200, 200, 255),
          });
        }
      }
      const id = materials.length;
      materials.push(cloned);
      if (m) matObjectToId.set(m, id);
      matNameToId.set(cloned.name, id);
      return id;
    }

    // 2. External (FBX/GLB/OBJ) or procedural Three.js Material -> convert cleanly to KsEditor material + solid DDS
    const std = m as THREE.MeshStandardMaterial | undefined;
    const baseName = m?.name?.trim() || `AC_Studio_Mat_${materials.length}`;
    if (!m && matNameToId.has(baseName)) return matNameToId.get(baseName)!;

    const col = std?.color ? std.color.clone() : new THREE.Color('#cbd5e1');
    const isTransparent = Boolean(std?.transparent && (std?.opacity ?? 1) < 0.95);
    const texName = ensureSolidColorDds(col, isTransparent ? (std?.opacity ?? 0.45) : 1.0);

    const lower = baseName.toLowerCase();
    const presetKind: 'carpaint' | 'glass' | 'carbon' | 'metal_rim' | 'tyre' | 'emissive' =
      isTransparent || lower.includes('glass') || lower.includes('windscreen')
        ? 'glass'
        : lower.includes('tyre') || lower.includes('tire') || lower.includes('rubber')
          ? 'tyre'
          : lower.includes('carbon')
            ? 'carbon'
            : lower.includes('rim') || lower.includes('alloy') || lower.includes('rotor') || (std?.metalness ?? 0) > 0.78
              ? 'metal_rim'
              : std?.emissive && (std.emissive.r + std.emissive.g + std.emissive.b > 0.2)
                ? 'emissive'
                : 'carpaint';

    const ksMat = createKsEditorPresetMaterial(presetKind, baseName, texName);
    if (presetKind === 'emissive' && std?.emissive) {
      const emProp = ksMat.properties.find((p) => p.name === 'ksEmissive');
      if (emProp) {
        const mult = std.emissiveIntensity ?? 1.5;
        emProp.valueC = [std.emissive.r * mult, std.emissive.g * mult, std.emissive.b * mult];
      }
    }

    const id = materials.length;
    materials.push(ksMat);
    if (m) matObjectToId.set(m, id);
    matNameToId.set(ksMat.name, id);
    return id;
  }

  function buildMeshNodesFromThreeMesh(mesh: THREE.Mesh, bakeMatrix?: THREE.Matrix4): Kn5Node[] {
    const meta = mesh.userData?.kn5MeshMeta as Kn5MeshUserMeta | undefined;
    const matId = getOrCreateMaterialId(mesh.material);

    const geom = mesh.geometry;
    const posAttr = geom.getAttribute('position');
    if (!posAttr || posAttr.count === 0) return [];

    // Compute normals if missing (on a lightweight clone only when needed)
    let workGeom = geom;
    let shouldDispose = false;
    if (!workGeom.getAttribute('normal')) {
      workGeom = geom.clone();
      workGeom.computeVertexNormals();
      shouldDispose = true;
    }

    const hasValidIndex = Boolean(workGeom.index && workGeom.index.count > 0);
    const vCount = workGeom.getAttribute('position').count;

    // Fast lossless path: indexed (or non-indexed) mesh fitting cleanly inside uint16 (<= 65535 vertices)
    if (vCount <= 65535) {
      const posA = workGeom.getAttribute('position');
      const normA = workGeom.getAttribute('normal');
      const uvA = workGeom.getAttribute('uv');
      const kn5TanA = workGeom.getAttribute('kn5Tangent');

      const positions = new Float32Array(vCount * 3);
      const normals = new Float32Array(vCount * 3);
      const uvs = new Float32Array(vCount * 2);

      const v3 = new THREE.Vector3();
      const normalMat = bakeMatrix ? new THREE.Matrix3().getNormalMatrix(bakeMatrix) : null;

      let cx = 0, cy = 0, cz = 0;
      for (let i = 0; i < vCount; i++) {
        v3.set(posA.getX(i), posA.getY(i), posA.getZ(i));
        if (bakeMatrix) v3.applyMatrix4(bakeMatrix);
        positions[i * 3] = v3.x;
        positions[i * 3 + 1] = v3.y;
        positions[i * 3 + 2] = v3.z;
        cx += v3.x; cy += v3.y; cz += v3.z;

        v3.set(normA.getX(i), normA.getY(i), normA.getZ(i));
        if (normalMat) v3.applyMatrix3(normalMat).normalize();
        normals[i * 3] = v3.x;
        normals[i * 3 + 1] = v3.y;
        normals[i * 3 + 2] = v3.z;

        uvs[i * 2] = uvA ? uvA.getX(i) : 0;
        uvs[i * 2 + 1] = uvA ? uvA.getY(i) : 0;
      }

      const indices = hasValidIndex
        ? Uint16Array.from(workGeom.index!.array as ArrayLike<number>)
        : Uint16Array.from({ length: vCount }, (_, idx) => idx);

      // Preserve exact original tangents (transformed if baked), or compute smooth Lengyel tangents
      let tangents: Float32Array;
      if (kn5TanA && kn5TanA.count === vCount) {
        tangents = new Float32Array(vCount * 3);
        for (let i = 0; i < vCount; i++) {
          v3.set(kn5TanA.getX(i), kn5TanA.getY(i), kn5TanA.getZ(i));
          if (normalMat) v3.applyMatrix3(normalMat).normalize();
          tangents[i * 3] = v3.x;
          tangents[i * 3 + 1] = v3.y;
          tangents[i * 3 + 2] = v3.z;
        }
      } else {
        tangents = computeSmoothTangents(positions, normals, uvs, indices);
      }

      if (vCount > 0) {
        cx /= vCount; cy /= vCount; cz /= vCount;
      }
      let radius = 0.1;
      for (let i = 0; i < vCount; i++) {
        const dx = positions[i * 3] - cx;
        const dy = positions[i * 3 + 1] - cy;
        const dz = positions[i * 3 + 2] - cz;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d > radius) radius = d;
      }

      const isSkinned = Boolean(
        meta?.nodeClass === 3 &&
        meta.bones &&
        meta.skinWeights &&
        meta.skinIndices &&
        meta.skinWeights.length === vCount * 4
      );

      if (shouldDispose) workGeom.dispose();

      return [
        {
          nodeClass: isSkinned ? 3 : 2,
          name: mesh.name || 'Mesh',
          active: mesh.visible,
          transform: new Float32Array(16),
          mesh: {
            castShadows: meta?.castShadows ?? mesh.castShadow ?? true,
            isVisible: meta?.isVisible ?? mesh.visible,
            isTransparent: meta?.isTransparent ?? (materials[matId]?.blendMode === 1),
            positions,
            normals,
            uvs,
            tangents,
            indices,
            materialId: matId,
            layer: meta?.layer ?? 0,
            lodIn: meta?.lodIn ?? 0,
            lodOut: meta?.lodOut ?? 2000,
            boundingSphereCenter: [cx, cy, cz],
            boundingSphereRadius: radius,
            isRenderable: meta?.isRenderable ?? true,
            bones: isSkinned ? meta!.bones : undefined,
            skinWeights: isSkinned ? meta!.skinWeights : undefined,
            skinIndices: isSkinned ? meta!.skinIndices : undefined,
          },
          children: [],
        },
      ];
    }

    // Large external mesh (> 65535 vertices) -> safely chunk into <= 60000-vertex sub-meshes
    const nonIndexed = workGeom.index ? workGeom.toNonIndexed() : workGeom;
    const posA = nonIndexed.getAttribute('position');
    const normA = nonIndexed.getAttribute('normal');
    const uvA = nonIndexed.getAttribute('uv');
    const totalVerts = posA.count;
    const MAX_CHUNK = 60000;
    const outNodes: Kn5Node[] = [];
    const v3 = new THREE.Vector3();
    const normalMat = bakeMatrix ? new THREE.Matrix3().getNormalMatrix(bakeMatrix) : null;

    for (let start = 0; start < totalVerts; start += MAX_CHUNK) {
      const count = Math.min(MAX_CHUNK, totalVerts - start);
      const positions = new Float32Array(count * 3);
      const normals = new Float32Array(count * 3);
      const uvs = new Float32Array(count * 2);
      const indices = new Uint16Array(count);

      let cx = 0, cy = 0, cz = 0;
      for (let i = 0; i < count; i++) {
        const vi = start + i;
        v3.set(posA.getX(vi), posA.getY(vi), posA.getZ(vi));
        if (bakeMatrix) v3.applyMatrix4(bakeMatrix);
        positions[i * 3] = v3.x; positions[i * 3 + 1] = v3.y; positions[i * 3 + 2] = v3.z;
        cx += v3.x; cy += v3.y; cz += v3.z;

        v3.set(normA.getX(vi), normA.getY(vi), normA.getZ(vi));
        if (normalMat) v3.applyMatrix3(normalMat).normalize();
        normals[i * 3] = v3.x; normals[i * 3 + 1] = v3.y; normals[i * 3 + 2] = v3.z;

        uvs[i * 2] = uvA ? uvA.getX(vi) : 0;
        uvs[i * 2 + 1] = uvA ? uvA.getY(vi) : 0;
        indices[i] = i;
      }

      const tangents = computeSmoothTangents(positions, normals, uvs, indices);
      if (count > 0) { cx /= count; cy /= count; cz /= count; }
      let radius = 0.1;
      for (let i = 0; i < count; i++) {
        const d = Math.hypot(positions[i * 3] - cx, positions[i * 3 + 1] - cy, positions[i * 3 + 2] - cz);
        if (d > radius) radius = d;
      }

      outNodes.push({
        nodeClass: 2,
        name: start === 0 ? mesh.name || 'Mesh' : `${mesh.name || 'Mesh'}_part${Math.floor(start / MAX_CHUNK)}`,
        active: mesh.visible,
        transform: new Float32Array(16),
        mesh: {
          castShadows: meta?.castShadows ?? true,
          isVisible: meta?.isVisible ?? mesh.visible,
          isTransparent: meta?.isTransparent ?? (materials[matId]?.blendMode === 1),
          positions,
          normals,
          uvs,
          tangents,
          indices,
          materialId: matId,
          layer: meta?.layer ?? 0,
          lodIn: meta?.lodIn ?? 0,
          lodOut: meta?.lodOut ?? 2000,
          boundingSphereCenter: [cx, cy, cz],
          boundingSphereRadius: radius,
          isRenderable: meta?.isRenderable ?? true,
        },
        children: [],
      });
    }

    if (nonIndexed !== workGeom) nonIndexed.dispose();
    if (shouldDispose) workGeom.dispose();
    return outNodes;
  }

  function convertObject(obj: THREE.Object3D): Kn5Node {
    obj.updateMatrix();

    // Direct Mesh node: preserve original flat nodeClass=2/3 hierarchy if transform is identity!
    if ((obj as THREE.Mesh).isMesh) {
      const meshObj = obj as THREE.Mesh;
      const isIdentity = isNearIdentityMatrix(meshObj.matrix);
      const meshNodes = buildMeshNodesFromThreeMesh(meshObj, isIdentity ? undefined : meshObj.matrix);

      // Attach any child objects cleanly
      const childNodes = obj.children.map((ch) => convertObject(ch));

      if (meshNodes.length === 1 && isIdentity) {
        meshNodes[0].children.push(...childNodes);
        return meshNodes[0];
      }

      // If transformed or split into multiple chunks, wrap in a clean Dummy node (with baked mesh)
      return {
        nodeClass: 1,
        name: `${obj.name || 'Mesh'}_GRP`,
        active: obj.visible,
        transform: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
        children: [...meshNodes, ...childNodes],
      };
    }

    // Standard Dummy / Group node (nodeClass = 1)
    const dummy: Kn5Node = {
      nodeClass: 1,
      name: obj.name || 'Group',
      active: obj.visible,
      transform: new Float32Array(obj.matrix.elements),
      children: obj.children.map((ch) => convertObject(ch)),
    };
    return dummy;
  }

  const root = convertObject(rootObj);
  const version = typeof rootObj.userData?.kn5Version === 'number' ? rootObj.userData.kn5Version : 5;
  const unknownNo = typeof rootObj.userData?.kn5UnknownNo === 'number' ? rootObj.userData.kn5UnknownNo : 0;

  return buildKn5({
    version,
    unknownNo,
    textures,
    materials,
    root,
  });
}

export interface ProceduralCarOptions {
  wheelbase: number;
  frontTrack: number;
  rearTrack: number;
  frontRadius: number;
  rearRadius: number;
  frontWidth: number;
  rearWidth: number;
  bodyColor?: string;
}

/**
 * Builds a clean, CSP-ready procedural sports car 3D model with standard AC wheel node names
 * (WHEEL_LF, WHEEL_RF, WHEEL_LR, WHEEL_RR) + KsEditor-compatible physical materials.
 */
export function buildProceduralCarGroup(opts: ProceduralCarOptions): THREE.Group {
  const root = new THREE.Group();
  root.name = 'PROCEDURAL_CAR_ROOT';

  const wb = Math.max(2.0, Math.min(3.3, opts.wheelbase || 2.6));
  const fTrack = Math.max(1.2, Math.min(2.0, opts.frontTrack || 1.54));
  const rTrack = Math.max(1.2, Math.min(2.0, opts.rearTrack || 1.56));
  const fRad = Math.max(0.24, Math.min(0.42, opts.frontRadius || 0.316));
  const rRad = Math.max(0.24, Math.min(0.42, opts.rearRadius || 0.316));
  const fWid = Math.max(0.16, Math.min(0.38, opts.frontWidth || 0.24));
  const rWid = Math.max(0.16, Math.min(0.40, opts.rearWidth || 0.26));

  const halfWb = wb / 2;
  const bodyWidth = Math.max(fTrack, rTrack) + 0.16;
  const bodyLen = wb + 1.55;

  const paintMat = new THREE.MeshPhysicalMaterial({
    name: 'Body_Paint',
    color: opts.bodyColor ?? '#e11d48',
    metalness: 0.45,
    roughness: 0.22,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.4,
  });
  const carbonMat = new THREE.MeshPhysicalMaterial({
    name: 'Carbon_Aero',
    color: '#1e2430',
    metalness: 0.3,
    roughness: 0.35,
    clearcoat: 0.65,
    clearcoatRoughness: 0.18,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    name: 'Cabin_Glass',
    color: '#0f172a',
    metalness: 0.1,
    roughness: 0.04,
    clearcoat: 1.0,
    clearcoatRoughness: 0.02,
    transparent: true,
    opacity: 0.42,
    envMapIntensity: 1.8,
  });
  const headlightMat = new THREE.MeshPhysicalMaterial({
    name: 'Headlights',
    color: '#f8fafc',
    emissive: '#bae6fd',
    emissiveIntensity: 1.2,
    roughness: 0.08,
    clearcoat: 1.0,
  });
  const taillightMat = new THREE.MeshPhysicalMaterial({
    name: 'Taillights',
    color: '#ef4444',
    emissive: '#dc2626',
    emissiveIntensity: 1.4,
    roughness: 0.1,
    clearcoat: 1.0,
  });
  const suspMat = new THREE.MeshStandardMaterial({
    name: 'Suspension_Arms',
    color: '#64748b',
    metalness: 0.85,
    roughness: 0.28,
  });
  const coilMat = new THREE.MeshStandardMaterial({
    name: 'Coilover_Spring',
    color: '#f59e0b',
    metalness: 0.6,
    roughness: 0.3,
  });

  const chassis = new THREE.Group();
  chassis.name = 'CHASSIS_BODY';
  root.add(chassis);

  const lowerBody = new THREE.Mesh(new THREE.BoxGeometry(bodyWidth, 0.42, bodyLen), paintMat);
  lowerBody.name = 'BODY_MAIN';
  lowerBody.position.set(0, 0.50, 0);
  lowerBody.castShadow = true;
  lowerBody.receiveShadow = true;
  chassis.add(lowerBody);

  const hood = new THREE.Mesh(new THREE.BoxGeometry(bodyWidth * 0.94, 0.16, bodyLen * 0.36), paintMat);
  hood.name = 'BODY_HOOD';
  hood.position.set(0, 0.74, bodyLen * 0.24);
  hood.rotation.x = 0.08;
  hood.castShadow = true;
  chassis.add(hood);

  const rearDeck = new THREE.Mesh(new THREE.BoxGeometry(bodyWidth * 0.96, 0.18, bodyLen * 0.28), paintMat);
  rearDeck.name = 'BODY_REAR';
  rearDeck.position.set(0, 0.77, -bodyLen * 0.31);
  rearDeck.castShadow = true;
  chassis.add(rearDeck);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(bodyWidth * 0.76, 0.44, bodyLen * 0.40), glassMat);
  cabin.name = 'CABIN_GLASS';
  cabin.position.set(0, 0.96, -0.10);
  cabin.castShadow = true;
  chassis.add(cabin);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(bodyWidth * 0.72, 0.06, bodyLen * 0.30), paintMat);
  roof.name = 'BODY_ROOF';
  roof.position.set(0, 1.19, -0.14);
  chassis.add(roof);

  const splitter = new THREE.Mesh(new THREE.BoxGeometry(bodyWidth * 1.03, 0.04, 0.55), carbonMat);
  splitter.name = 'AERO_SPLITTER';
  splitter.position.set(0, 0.26, bodyLen * 0.46);
  chassis.add(splitter);

  for (const side of [-1, 1]) {
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.07, wb - 0.65), carbonMat);
    skirt.name = side < 0 ? 'SKIRT_R' : 'SKIRT_L';
    skirt.position.set(side * (bodyWidth * 0.50), 0.27, 0);
    chassis.add(skirt);
  }

  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(bodyWidth * 0.88, 0.16, 0.35), carbonMat);
  diffuser.name = 'AERO_DIFFUSER';
  diffuser.position.set(0, 0.30, -bodyLen * 0.48);
  chassis.add(diffuser);

  const wingGroup = new THREE.Group();
  wingGroup.name = 'REAR_WING';
  const wingBlade = new THREE.Mesh(new THREE.BoxGeometry(bodyWidth * 0.98, 0.04, 0.30), carbonMat);
  wingBlade.position.set(0, 1.14, -bodyLen * 0.45);
  wingBlade.rotation.x = 0.09;
  wingBlade.castShadow = true;
  wingGroup.add(wingBlade);

  for (const side of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.30, 0.18), carbonMat);
    strut.position.set(side * 0.45, 0.98, -bodyLen * 0.43);
    wingGroup.add(strut);

    const endplate = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.20, 0.36), carbonMat);
    endplate.position.set(side * (bodyWidth * 0.49), 1.13, -bodyLen * 0.45);
    wingGroup.add(endplate);
  }
  chassis.add(wingGroup);

  for (const side of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.10, 0.08), headlightMat);
    hl.name = side < 0 ? 'HEADLIGHT_R' : 'HEADLIGHT_L';
    hl.position.set(side * (bodyWidth * 0.34), 0.60, bodyLen * 0.50);
    chassis.add(hl);

    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.09, 0.06), taillightMat);
    tl.name = side < 0 ? 'TAILLIGHT_R' : 'TAILLIGHT_L';
    tl.position.set(side * (bodyWidth * 0.33), 0.66, -bodyLen * 0.50);
    chassis.add(tl);
  }

  const armPositions: Array<[string, number, number]> = [
    ['SUSP_LF', fTrack / 2, halfWb],
    ['SUSP_RF', -fTrack / 2, halfWb],
    ['SUSP_LR', rTrack / 2, -halfWb],
    ['SUSP_RR', -rTrack / 2, -halfWb],
  ];
  for (const [armName, xEdge, zPos] of armPositions) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(xEdge) * 0.65, 0.035, 0.14), suspMat);
    arm.name = armName;
    arm.position.set(xEdge * 0.55, 0.33, zPos);
    chassis.add(arm);

    const coil = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.26, 12), coilMat);
    coil.name = `${armName}_COIL`;
    coil.position.set(xEdge * 0.72, 0.48, zPos);
    chassis.add(coil);
  }

  const tyreMat = new THREE.MeshStandardMaterial({
    name: 'Tyre_Rubber',
    color: '#17191e',
    roughness: 0.88,
    metalness: 0.05,
  });
  const rimMat = new THREE.MeshPhysicalMaterial({
    name: 'Alloy_Rim',
    color: '#e2e8f0',
    metalness: 0.88,
    roughness: 0.18,
    clearcoat: 0.8,
  });
  const rotorMat = new THREE.MeshStandardMaterial({
    name: 'Brake_Rotor',
    color: '#94a3b8',
    metalness: 0.9,
    roughness: 0.35,
  });
  const caliperMat = new THREE.MeshPhysicalMaterial({
    name: 'Brake_Caliper',
    color: '#ef4444',
    metalness: 0.4,
    roughness: 0.25,
    clearcoat: 0.9,
  });

  function makeWheel(name: string, radius: number, width: number, x: number, z: number): THREE.Group {
    const wg = new THREE.Group();
    wg.name = name;
    wg.position.set(x, radius, z);

    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 28), tyreMat);
    tyre.rotation.z = Math.PI / 2;
    tyre.name = `${name}_TYRE`;
    tyre.castShadow = true;
    wg.add(tyre);

    const rim = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.66, radius * 0.66, width + 0.012, 20), rimMat);
    rim.rotation.z = Math.PI / 2;
    rim.name = `${name}_RIM`;
    wg.add(rim);

    for (let s = 0; s < 5; s++) {
      const angle = (s / 5) * Math.PI * 2;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(width + 0.025, radius * 1.15, 0.038), rimMat);
      spoke.rotation.x = angle;
      wg.add(spoke);
    }

    const disc = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.52, radius * 0.52, 0.03, 20), rotorMat);
    disc.rotation.z = Math.PI / 2;
    disc.position.x = x > 0 ? -width * 0.22 : width * 0.22;
    wg.add(disc);

    const cal = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.09), caliperMat);
    cal.position.set(x > 0 ? -width * 0.22 : width * 0.22, 0.04, -radius * 0.34);
    wg.add(cal);

    return wg;
  }

  root.add(makeWheel('WHEEL_LF', fRad, fWid, fTrack / 2, halfWb));
  root.add(makeWheel('WHEEL_RF', fRad, fWid, -fTrack / 2, halfWb));
  root.add(makeWheel('WHEEL_LR', rRad, rWid, rTrack / 2, -halfWb));
  root.add(makeWheel('WHEEL_RR', rRad, rWid, -rTrack / 2, -halfWb));

  return root;
}
