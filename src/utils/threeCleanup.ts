import * as THREE from 'three';

const TEXTURE_KEYS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap',
  'alphaMap',
  'bumpMap',
  'displacementMap',
  'lightMap',
  'clearcoatMap',
  'clearcoatNormalMap',
  'clearcoatRoughnessMap',
  'sheenColorMap',
  'sheenRoughnessMap',
  'specularColorMap',
  'specularIntensityMap',
  'transmissionMap',
  'thicknessMap',
  'iridescenceMap',
  'iridescenceThicknessMap',
] as const;

/**
 * Safely disposes geometries, materials, and non-shared textures inside a Three.js Object3D subtree
 * to prevent GPU VRAM leaks when switching vehicles, replacing models, or unmounting 3D viewports.
 * Any texture tagged with `userData.__sharedCache === true` is preserved.
 */
export function disposeThreeObject(root: THREE.Object3D | null | undefined): void {
  if (!root) return;
  const disposedGeoms = new Set<THREE.BufferGeometry>();
  const disposedMats = new Set<THREE.Material>();
  const disposedTex = new Set<THREE.Texture>();

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry && !disposedGeoms.has(mesh.geometry)) {
      disposedGeoms.add(mesh.geometry);
      mesh.geometry.dispose();
    }

    const rawMat = mesh.material;
    if (!rawMat) return;
    const mats = Array.isArray(rawMat) ? rawMat : [rawMat];
    for (const mat of mats) {
      if (!mat || disposedMats.has(mat)) continue;
      disposedMats.add(mat);

      const rec = mat as unknown as Record<string, unknown>;
      for (const key of TEXTURE_KEYS) {
        const tex = rec[key];
        if (
          tex instanceof THREE.Texture &&
          !disposedTex.has(tex) &&
          !tex.userData?.__sharedCache
        ) {
          disposedTex.add(tex);
          tex.dispose();
        }
      }

      // Also dispose any original PBR map snapshot stored on livery materials
      const origMaps = mat.userData?.__origPbrMaps as
        | {
            normalMap?: THREE.Texture | null;
            roughnessMap?: THREE.Texture | null;
            metalnessMap?: THREE.Texture | null;
          }
        | undefined;
      if (origMaps) {
        for (const t of [origMaps.normalMap, origMaps.roughnessMap, origMaps.metalnessMap]) {
          if (t instanceof THREE.Texture && !disposedTex.has(t) && !t.userData?.__sharedCache) {
            disposedTex.add(t);
            t.dispose();
          }
        }
      }

      mat.dispose();
    }
  });
}

/**
 * Removes and GPU-disposes all child objects from a Three.js Group.
 */
export function clearThreeGroup(group: THREE.Group | null | undefined): void {
  if (!group) return;
  while (group.children.length > 0) {
    const child = group.children[0];
    group.remove(child);
    disposeThreeObject(child);
  }
}
