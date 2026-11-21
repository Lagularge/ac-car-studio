import * as THREE from 'three';
import type { PartCategory, SavedPartEntry } from '../types/ac';
import {
  kn5ToThreeGroup,
  parseKn5,
  threeGroupToKn5,
  type Kn5Material,
  type Kn5Texture,
} from './kn5Codec';
import { buildCspTextureCache } from './cspRenderer';

export const PART_CATEGORY_LABELS: Record<PartCategory, string> = {
  wheel: 'ホイール / タイヤ',
  steering: 'ステアリング',
  seat: 'シート',
  wing: 'ウィング / エアロ',
  exhaust: 'マフラー / 排気',
  brake: 'ブレーキ',
  body: 'ボディパーツ',
  other: 'その他パーツ',
};

export function detectPartCategory(nodeName: string): PartCategory {
  const u = nodeName.toUpperCase();
  if (/(WHEEL_|RIM|TYRE|TIRE|HUB_)/.test(u)) return 'wheel';
  if (/(STEER|SW_|VOLANTE)/.test(u)) return 'steering';
  if (/(SEAT|BUCKET|RECARO|BRIDE|SPARCO|CHAIR)/.test(u)) return 'seat';
  if (/(WING|SPOILER|SPLITTER|DIFFUSER|CANARD|AERO|LIP|SKIRT)/.test(u)) return 'wing';
  if (/(EXHAUST|MUFFLER|TAILPIPE|SILENCER)/.test(u)) return 'exhaust';
  if (/(BRAKE|DISC|ROTOR|CALIPER)/.test(u)) return 'brake';
  if (/(BODY|HOOD|BONNET|BUMPER|FENDER|DOOR|ROOF|TRUNK|MIRROR|HEADLIGHT|TAILLIGHT)/.test(u)) {
    return 'body';
  }
  return 'other';
}

export function getAncestorChain(obj: THREE.Object3D, stopAt: THREE.Object3D | null): THREE.Object3D[] {
  const chain: THREE.Object3D[] = [];
  let cur: THREE.Object3D | null = obj;
  while (cur && cur !== stopAt) {
    chain.unshift(cur);
    cur = cur.parent;
  }
  return chain;
}

/**
 * Finds the best logical AC part group when clicking a child mesh
 * (e.g., clicking RIM_LF inside WHEEL_LF suggests WHEEL_LF).
 */
export function findSuggestedPartGroup(
  obj: THREE.Object3D,
  stopAt: THREE.Object3D | null
): THREE.Object3D | null {
  const chain = getAncestorChain(obj, stopAt);
  for (let i = chain.length - 1; i >= 0; i--) {
    const n = chain[i];
    const u = n.name.toUpperCase();
    if (
      /^(WHEEL_LF|WHEEL_RF|WHEEL_LR|WHEEL_RR|STEER_HR|STEER_LR|REAR_WING|FRONT_WING|SEAT_L|SEAT_R|SEAT)$/.test(
        u
      )
    ) {
      return n;
    }
  }
  return null;
}

export interface ExtractedPartResult {
  kn5Bytes: Uint8Array;
  bboxSize: [number, number, number];
  sourceSide: 'left' | 'right' | 'center';
  textureCount: number;
}

const AC_RESERVED_NODE_REGEX = /^(WHEEL_LF|WHEEL_RF|WHEEL_LR|WHEEL_RR|STEER_HR|STEER_LR|SUSP_LF|SUSP_RF|SUSP_LR|SUSP_RR|HUB_LF|HUB_RF|HUB_LR|HUB_RR)$/i;

function sanitizeInnerAcNodeNames(obj: THREE.Object3D, prefix = 'PART_MESH_') {
  obj.traverse((child) => {
    if (AC_RESERVED_NODE_REGEX.test(child.name)) {
      child.name = `${prefix}${child.name}`;
    }
  });
}

/**
 * Extracts a selected node (and its entire subtree + used KsEditor materials & textures ONLY)
 * normalized around local origin (0,0,0) into a standalone lossless .kn5 part file.
 */
export function extractPartSubtreeToKn5(
  targetObj: THREE.Object3D,
  allSceneTextures: Kn5Texture[]
): ExtractedPartResult {
  targetObj.updateMatrixWorld(true);

  const worldBox = new THREE.Box3().setFromObject(targetObj);
  const worldCenter = new THREE.Vector3();
  const worldSize = new THREE.Vector3();
  if (!worldBox.isEmpty()) {
    worldBox.getCenter(worldCenter);
    worldBox.getSize(worldSize);
  } else {
    targetObj.getWorldPosition(worldCenter);
    worldSize.set(0.5, 0.5, 0.5);
  }

  const sourceSide: 'left' | 'right' | 'center' =
    worldCenter.x > 0.25 ? 'left' : worldCenter.x < -0.25 ? 'right' : 'center';

  // Clone subtree and preserve world orientation/scale while centering its geometric center at (0,0,0)
  const cloned = targetObj.clone(true);
  sanitizeInnerAcNodeNames(cloned, 'PART_SRC_');
  const worldPos = new THREE.Vector3();
  const worldQuat = new THREE.Quaternion();
  const worldScale = new THREE.Vector3();
  targetObj.matrixWorld.decompose(worldPos, worldQuat, worldScale);

  cloned.position.copy(worldPos).sub(worldCenter);
  cloned.quaternion.copy(worldQuat);
  cloned.scale.copy(worldScale);
  cloned.updateMatrixWorld(true);

  // Collect only the textures actually referenced by materials inside this part
  const neededTexNames = new Set<string>();
  cloned.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      const rawMat = (o as THREE.Mesh).material;
      const mats: THREE.Material[] = Array.isArray(rawMat) ? rawMat : [rawMat];
      for (const m of mats) {
        const ks = m?.userData?.kn5Material as Kn5Material | undefined;
        if (ks) {
          for (const tm of ks.textureMappings) {
            if (tm.texture) neededTexNames.add(tm.texture.toLowerCase());
          }
        }
      }
    }
  });

  const usedTextures = allSceneTextures.filter((t) => neededTexNames.has(t.name.toLowerCase()));

  const wrapper = new THREE.Group();
  wrapper.name = 'SAVED_PART_ROOT';
  wrapper.add(cloned);
  wrapper.updateMatrixWorld(true);

  const kn5Bytes = threeGroupToKn5(wrapper, usedTextures);

  return {
    kn5Bytes,
    bboxSize: [
      Number(worldSize.x.toFixed(3)),
      Number(worldSize.y.toFixed(3)),
      Number(worldSize.z.toFixed(3)),
    ],
    sourceSide,
    textureCount: usedTextures.length,
  };
}

/**
 * Removes duplicate UUIDs and any object whose ancestor is already in the selection list,
 * preventing duplicate geometry when both a parent group and its child mesh are Shift-selected.
 */
export function deduplicateSelectedObjects(objs: THREE.Object3D[]): THREE.Object3D[] {
  const uniqueByUuid = new Map<string, THREE.Object3D>();
  for (const o of objs) {
    if (o) uniqueByUuid.set(o.uuid, o);
  }
  const selectedSet = new Set(uniqueByUuid.values());
  const roots: THREE.Object3D[] = [];
  for (const obj of selectedSet) {
    let cur = obj.parent;
    let coveredByAncestor = false;
    while (cur) {
      if (selectedSet.has(cur)) {
        coveredByAncestor = true;
        break;
      }
      cur = cur.parent;
    }
    if (!coveredByAncestor) {
      roots.push(obj);
    }
  }
  return roots;
}

/**
 * Extracts one or multiple Shift-selected 3D parts (preserving exact relative 3D positions,
 * orientations, scales, KsEditor materials, and referenced textures ONLY) into a single
 * lossless `.kn5` part file normalized around their combined geometric center `(0, 0, 0)`.
 */
export function extractMultiplePartsToKn5(
  targetObjs: THREE.Object3D[],
  allSceneTextures: Kn5Texture[]
): ExtractedPartResult & { partCount: number } {
  const uniqueRoots = deduplicateSelectedObjects(targetObjs);
  if (uniqueRoots.length === 0) {
    throw new Error('保存するパーツが選択されていません。');
  }
  if (uniqueRoots.length === 1) {
    return {
      ...extractPartSubtreeToKn5(uniqueRoots[0], allSceneTextures),
      partCount: 1,
    };
  }

  const combinedBox = new THREE.Box3();
  for (const obj of uniqueRoots) {
    obj.updateMatrixWorld(true);
    combinedBox.expandByObject(obj);
  }

  const worldCenter = new THREE.Vector3();
  const worldSize = new THREE.Vector3();
  if (!combinedBox.isEmpty()) {
    combinedBox.getCenter(worldCenter);
    combinedBox.getSize(worldSize);
  } else {
    uniqueRoots[0].getWorldPosition(worldCenter);
    worldSize.set(0.5, 0.5, 0.5);
  }

  const sourceSide: 'left' | 'right' | 'center' =
    worldCenter.x > 0.25 ? 'left' : worldCenter.x < -0.25 ? 'right' : 'center';

  const wrapper = new THREE.Group();
  wrapper.name = 'SAVED_PART_ROOT';
  const multiGroup = new THREE.Group();
  multiGroup.name = 'SAVED_MULTI_PART';

  const neededTexNames = new Set<string>();
  const worldPos = new THREE.Vector3();
  const worldQuat = new THREE.Quaternion();
  const worldScale = new THREE.Vector3();

  for (const obj of uniqueRoots) {
    const cloned = obj.clone(true);
    sanitizeInnerAcNodeNames(cloned, 'PART_SRC_');
    obj.matrixWorld.decompose(worldPos, worldQuat, worldScale);

    cloned.position.copy(worldPos).sub(worldCenter);
    cloned.quaternion.copy(worldQuat);
    cloned.scale.copy(worldScale);
    cloned.updateMatrixWorld(true);

    cloned.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const rawMat = (o as THREE.Mesh).material;
        const mats: THREE.Material[] = Array.isArray(rawMat) ? rawMat : [rawMat];
        for (const m of mats) {
          const ks = m?.userData?.kn5Material as Kn5Material | undefined;
          if (ks) {
            for (const tm of ks.textureMappings) {
              if (tm.texture) neededTexNames.add(tm.texture.toLowerCase());
            }
          }
        }
      }
    });

    multiGroup.add(cloned);
  }

  wrapper.add(multiGroup);
  wrapper.updateMatrixWorld(true);

  const usedTextures = allSceneTextures.filter((t) => neededTexNames.has(t.name.toLowerCase()));
  const kn5Bytes = threeGroupToKn5(wrapper, usedTextures);

  return {
    kn5Bytes,
    bboxSize: [
      Number(worldSize.x.toFixed(3)),
      Number(worldSize.y.toFixed(3)),
      Number(worldSize.z.toFixed(3)),
    ],
    sourceSide,
    textureCount: usedTextures.length,
    partCount: uniqueRoots.length,
  };
}

/**
 * Loads a saved .kn5 part and merges its textures cleanly into the target car's texture pool
 * without ever colliding with or overwriting the target car's existing textures/materials.
 */
export function instantiateSavedPartForCar(
  partKn5Bytes: Uint8Array,
  partId: string,
  existingTextures: Kn5Texture[]
): { partGroup: THREE.Group; mergedTextures: Kn5Texture[]; addedTextures: number } {
  const doc = parseKn5(partKn5Bytes);
  const shortPrefix = partId.replace(/[^a-z0-9]/gi, '').slice(-6) || 'part';

  const existingByLower = new Map<string, Kn5Texture>();
  for (const t of existingTextures) {
    existingByLower.set(t.name.toLowerCase(), t);
  }

  const renameMap = new Map<string, string>();
  const added: Kn5Texture[] = [];

  for (const tex of doc.textures) {
    if (!tex.name) continue;
    const lower = tex.name.toLowerCase();
    const existing = existingByLower.get(lower);

    if (!existing) {
      added.push(tex);
      existingByLower.set(lower, tex);
    } else {
      // Exact byte-for-byte comparison: if contents differ, safely namespace to avoid corrupting target car!
      let sameBytes = existing.data.byteLength === tex.data.byteLength;
      if (sameBytes) {
        for (let i = 0; i < tex.data.byteLength; i++) {
          if (existing.data[i] !== tex.data[i]) {
            sameBytes = false;
            break;
          }
        }
      }
      if (!sameBytes) {
        const newName = `p${shortPrefix}_${tex.name}`;
        renameMap.set(lower, newName);
        const renamedTex: Kn5Texture = { ...tex, name: newName };
        added.push(renamedTex);
        existingByLower.set(newName.toLowerCase(), renamedTex);
      }
    }
  }

  // Remap material names & renamed texture slots inside the part so materials stay independent
  for (const mat of doc.materials) {
    mat.name = `P${shortPrefix}_${mat.name}`;
    for (const tm of mat.textureMappings) {
      const mapped = renameMap.get(tm.texture.toLowerCase());
      if (mapped) tm.texture = mapped;
    }
  }

  const mergedTextures = [...existingTextures, ...added];
  const texCache = buildCspTextureCache(mergedTextures);
  const partGroup = kn5ToThreeGroup(doc, texCache);

  return { partGroup, mergedTextures, addedTextures: added.length };
}

export interface ReplacePartOptions {
  matchPosition: boolean;
  matchSize: boolean;
  preserveNodeName: boolean;
  flipY180?: boolean;
  isWheel?: boolean;
}

/**
 * Replaces `targetNode` in the scene with `newPartGroup`, automatically fitting world position,
 * scale, side orientation, and preserving AC functional node names (WHEEL_LF, STEER_HR, etc.).
 */
export function replaceNodeWithPartGroup(
  targetNode: THREE.Object3D,
  newPartGroup: THREE.Group,
  options: ReplacePartOptions
): THREE.Object3D {
  const parent = targetNode.parent;
  if (!parent) {
    throw new Error('ルートノード自体は差し替えできません。子ノードを選択してください。');
  }

  parent.updateMatrixWorld(true);
  targetNode.updateMatrixWorld(true);

  const oldBox = new THREE.Box3().setFromObject(targetNode);
  const oldCenter = new THREE.Vector3();
  const oldSize = new THREE.Vector3();
  if (!oldBox.isEmpty()) {
    oldBox.getCenter(oldCenter);
    oldBox.getSize(oldSize);
  } else {
    targetNode.getWorldPosition(oldCenter);
    oldSize.set(0.5, 0.5, 0.5);
  }

  // Measure incoming part in neutral space
  newPartGroup.position.set(0, 0, 0);
  newPartGroup.rotation.set(0, 0, 0);
  newPartGroup.scale.set(1, 1, 1);
  if (options.flipY180) {
    newPartGroup.rotation.y = Math.PI;
  }
  newPartGroup.updateMatrixWorld(true);

  const newBox = new THREE.Box3().setFromObject(newPartGroup);
  const newSize = new THREE.Vector3();
  if (!newBox.isEmpty()) {
    newBox.getSize(newSize);
  } else {
    newSize.set(0.5, 0.5, 0.5);
  }

  // Compute smart uniform scale factor
  let scaleFactor = 1.0;
  if (options.matchSize) {
    if (options.isWheel) {
      // Match wheel diameter (average of Y and Z extents)
      const oldDiam = (oldSize.y + oldSize.z) / 2;
      const newDiam = (newSize.y + newSize.z) / 2;
      if (oldDiam > 0.05 && newDiam > 0.05) {
        scaleFactor = oldDiam / newDiam;
      }
    } else {
      const oldMax = Math.max(oldSize.x, oldSize.y, oldSize.z);
      const newMax = Math.max(newSize.x, newSize.y, newSize.z);
      if (oldMax > 0.01 && newMax > 0.01) {
        scaleFactor = oldMax / newMax;
      }
    }
    scaleFactor = Math.max(0.05, Math.min(20, scaleFactor));
  }

  // Prevent duplicate AC reserved hook names (e.g., nested WHEEL_LF inside WHEEL_RF)
  sanitizeInnerAcNodeNames(newPartGroup, 'PART_INNER_');

  // Create clean container that preserves AC functional hook name (e.g., WHEEL_LF, STEER_HR)
  const container = new THREE.Group();
  container.name = options.preserveNodeName ? targetNode.name : newPartGroup.name;
  container.userData.kn5NodeClass = 1;

  // Position container at oldCenter in parent's local coordinate system
  const localCenter = options.matchPosition
    ? parent.worldToLocal(oldCenter.clone())
    : targetNode.position.clone();
  container.position.copy(localCenter);

  // Align part cleanly inside container
  newPartGroup.scale.setScalar(scaleFactor);
  container.add(newPartGroup);
  parent.add(container);
  container.updateMatrixWorld(true);

  // Fine-tune exact world center match after rotation & scaling
  if (options.matchPosition) {
    const placedBox = new THREE.Box3().setFromObject(newPartGroup);
    if (!placedBox.isEmpty()) {
      const placedCenter = new THREE.Vector3();
      placedBox.getCenter(placedCenter);
      const deltaWorld = oldCenter.clone().sub(placedCenter);
      const localOriginInWorld = container.localToWorld(new THREE.Vector3(0, 0, 0));
      const shiftedLocal = container.worldToLocal(localOriginInWorld.add(deltaWorld));
      newPartGroup.position.add(shiftedLocal);
    }
  }

  // Remove old target node
  parent.remove(targetNode);
  parent.updateMatrixWorld(true);
  return container;
}

export interface FourWheelNodes {
  lf: THREE.Object3D | null;
  rf: THREE.Object3D | null;
  lr: THREE.Object3D | null;
  rr: THREE.Object3D | null;
}

export function findFourWheelNodes(root: THREE.Object3D): FourWheelNodes {
  const res: FourWheelNodes = { lf: null, rf: null, lr: null, rr: null };
  root.traverse((obj) => {
    const u = obj.name.toUpperCase();
    if (u === 'WHEEL_LF') res.lf = obj;
    else if (u === 'WHEEL_RF') res.rf = obj;
    else if (u === 'WHEEL_LR') res.lr = obj;
    else if (u === 'WHEEL_RR') res.rr = obj;
  });
  return res;
}

export interface NodeReplacementRecord {
  parent: THREE.Object3D;
  oldObj: THREE.Object3D;
  newObj: THREE.Object3D;
  index: number;
}

/**
 * Replaces all 4 wheels (WHEEL_LF, WHEEL_RF, WHEEL_LR, WHEEL_RR) using a single saved wheel part,
 * automatically flipping the opposite side by 180 deg around Y so spokes face outward on all 4 corners!
 */
export function replaceAllFourWheels(
  root: THREE.Object3D,
  partKn5Bytes: Uint8Array,
  partEntry: SavedPartEntry,
  existingTextures: Kn5Texture[],
  matchSize: boolean
): {
  replacedCount: number;
  mergedTextures: Kn5Texture[];
  firstReplaced: THREE.Object3D | null;
  replacements: NodeReplacementRecord[];
} {
  const wheels = findFourWheelNodes(root);
  const targets: Array<{ node: THREE.Object3D | null; side: 'left' | 'right' }> = [
    { node: wheels.lf, side: 'left' },
    { node: wheels.rf, side: 'right' },
    { node: wheels.lr, side: 'left' },
    { node: wheels.rr, side: 'right' },
  ];

  // Instantiate once so all 4 wheels share the exact same textures/materials cleanly
  const { partGroup: templatePart, mergedTextures } = instantiateSavedPartForCar(
    partKn5Bytes,
    partEntry.id,
    existingTextures
  );

  const sourceSide = partEntry.sourceSide ?? 'left';
  let replacedCount = 0;
  let firstReplaced: THREE.Object3D | null = null;
  const replacements: NodeReplacementRecord[] = [];

  for (const item of targets) {
    if (!item.node || !item.node.parent) continue;
    const parent = item.node.parent;
    const index = parent.children.indexOf(item.node);
    const instance = replacedCount === 0 ? templatePart : (templatePart.clone(true) as THREE.Group);
    const shouldFlip = sourceSide !== 'center' && item.side !== sourceSide;
    const placed = replaceNodeWithPartGroup(item.node, instance, {
      matchPosition: true,
      matchSize,
      preserveNodeName: true,
      flipY180: shouldFlip,
      isWheel: true,
    });
    replacements.push({ parent, oldObj: item.node, newObj: placed, index });
    if (!firstReplaced) firstReplaced = placed;
    replacedCount++;
  }

  return { replacedCount, mergedTextures, firstReplaced, replacements };
}
