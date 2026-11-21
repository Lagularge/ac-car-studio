import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { clearThreeGroup, disposeThreeObject } from '../../utils/threeCleanup';
import {
  ArrowUpRight,
  BookmarkPlus,
  Box,
  Car,
  Copy,
  Disc,
  Eye,
  EyeOff,
  FilePlus2,
  FolderInput,
  Image as ImageIcon,
  Layers,
  MousePointerClick,
  PackageCheck,
  Palette,
  Plus,
  RefreshCw,
  Replace,
  Save,
  Search,
  Sliders,
  Sun,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { CarModelFileInfo, CarSummary, PartCategory, SavedPartEntry } from '../../types/ac';
import { getIniNumber } from '../../utils/iniHelpers';
import {
  buildProceduralCarGroup,
  createSolidColorDds,
  kn5ToThreeGroup,
  parseKn5,
  threeGroupToKn5,
  type Kn5Material,
  type Kn5MeshUserMeta,
  type Kn5Texture,
} from '../../utils/kn5Codec';
import {
  KSEDITOR_SHADERS,
  buildCspMaterialFromKn5,
  buildCspTextureCache,
  createCspEnvironmentMap,
  createKsEditorPresetMaterial,
  getKn5Prop,
  getKn5PropA,
  kn5TextureToPreviewDataUrl,
  setKn5PropA,
  setKn5PropC,
  type CspLightingPreset,
  type CspTextureCache,
} from '../../utils/cspRenderer';
import {
  PART_CATEGORY_LABELS,
  deduplicateSelectedObjects,
  detectPartCategory,
  extractMultiplePartsToKn5,
  findSuggestedPartGroup,
  getAncestorChain,
  instantiateSavedPartForCar,
  replaceAllFourWheels,
  replaceNodeWithPartGroup,
} from '../../utils/partTransfer';
import { DetachablePanel, type DetachMode } from '../common/DetachablePanel';
import { HistoryStack, type UndoRedoHandler } from '../../utils/undoRedo';

interface ModelEditorTabProps {
  carsDir: string;
  carId: string;
  cars: CarSummary[];
  files: Record<string, string>;
  initialMode?: 'edit' | 'save';
  onSavedPartsChanged?: (count: number) => void;
  onToast: (text: string, type?: 'success' | 'error' | 'info') => void;
  onRegisterUndoRedo?: (handler: UndoRedoHandler | null) => void;
}

interface NodeStateSnapshot {
  name: string;
  visible: boolean;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  castShadow: boolean;
  kn5MeshMeta?: Kn5MeshUserMeta;
}

type ModelUndoAction =
  | { kind: 'node'; uuid: string; before: NodeStateSnapshot; after: NodeStateSnapshot }
  | {
      kind: 'material';
      matUuid: string;
      before: Kn5Material;
      after: Kn5Material;
      prevTextures?: Kn5Texture[];
      nextTextures?: Kn5Texture[];
    }
  | {
      kind: 'add_node';
      parent: THREE.Object3D;
      node: THREE.Object3D;
      prevSelectedUuid: string | null;
      prevTextures?: Kn5Texture[];
      nextTextures?: Kn5Texture[];
    }
  | { kind: 'delete_node'; parent: THREE.Object3D; node: THREE.Object3D; index: number }
  | {
      kind: 'replace_nodes';
      replacements: Array<{
        parent: THREE.Object3D;
        oldObj: THREE.Object3D;
        newObj: THREE.Object3D | null;
        index: number;
      }>;
      prevSelectedUuid: string | null;
      nextSelectedUuid: string | null;
      prevTextures?: Kn5Texture[];
      nextTextures?: Kn5Texture[];
    }
  | { kind: 'textures'; prevTextures: Kn5Texture[]; nextTextures: Kn5Texture[] };

function captureNodeSnapshot(obj: THREE.Object3D): NodeStateSnapshot {
  const meta = obj.userData?.kn5MeshMeta as Kn5MeshUserMeta | undefined;
  return {
    name: obj.name,
    visible: obj.visible,
    position: [obj.position.x, obj.position.y, obj.position.z],
    rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
    scale: [obj.scale.x, obj.scale.y, obj.scale.z],
    castShadow: (obj as THREE.Mesh).castShadow ?? false,
    kn5MeshMeta: meta ? structuredClone(meta) : undefined,
  };
}

function applyNodeSnapshot(obj: THREE.Object3D, snap: NodeStateSnapshot) {
  obj.name = snap.name;
  obj.visible = snap.visible;
  obj.position.set(snap.position[0], snap.position[1], snap.position[2]);
  obj.rotation.set(snap.rotation[0], snap.rotation[1], snap.rotation[2]);
  obj.scale.set(snap.scale[0], snap.scale[1], snap.scale[2]);
  if ((obj as THREE.Mesh).isMesh) {
    (obj as THREE.Mesh).castShadow = snap.castShadow;
  }
  if (snap.kn5MeshMeta) {
    obj.userData.kn5MeshMeta = structuredClone(snap.kn5MeshMeta);
  }
  obj.updateMatrixWorld(true);
}

function insertChildAtIndex(parent: THREE.Object3D, child: THREE.Object3D, index: number) {
  parent.add(child);
  if (index >= 0 && index < parent.children.length - 1) {
    parent.children.pop();
    parent.children.splice(index, 0, child);
  }
  parent.updateMatrixWorld(true);
}

function disposeEvictedModelAction(action: ModelUndoAction) {
  if (action.kind === 'add_node' || action.kind === 'delete_node') {
    if (!action.node.parent) {
      disposeThreeObject(action.node);
    }
  } else if (action.kind === 'replace_nodes') {
    for (const r of action.replacements) {
      if (!r.oldObj.parent) disposeThreeObject(r.oldObj);
      if (r.newObj && !r.newObj.parent) disposeThreeObject(r.newObj);
    }
  }
}

interface SceneTreeItem {
  uuid: string;
  name: string;
  depth: number;
  isMesh: boolean;
  visible: boolean;
  vertexCount: number;
}

type InspectorTab = 'node' | 'parts' | 'material' | 'textures';

async function parseExternalModelToThree(
  ext: string,
  fileName: string,
  bytes: Uint8Array
): Promise<{ group: THREE.Group; textures: Kn5Texture[] }> {
  const lowerExt = ext.toLowerCase();
  if (lowerExt === '.kn5') {
    const doc = parseKn5(bytes);
    const grp = kn5ToThreeGroup(doc);
    return { group: grp, textures: doc.textures };
  }

  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

  if (lowerExt === '.fbx') {
    const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
    const loader = new FBXLoader();
    const grp = loader.parse(ab, '');
    grp.name = fileName.replace(/\.fbx$/i, '');
    return { group: grp, textures: [] };
  }

  if (lowerExt === '.glb' || lowerExt === '.gltf') {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const loader = new GLTFLoader();
    const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
      loader.parse(ab, '', (g) => resolve(g), (err) => reject(err));
    });
    gltf.scene.name = fileName.replace(/\.(glb|gltf)$/i, '');
    return { group: gltf.scene, textures: [] };
  }

  if (lowerExt === '.obj') {
    const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
    const loader = new OBJLoader();
    const text = new TextDecoder('utf-8').decode(bytes);
    const grp = loader.parse(text);
    grp.name = fileName.replace(/\.obj$/i, '');
    return { group: grp, textures: [] };
  }

  throw new Error(`未対応の3Dモデル形式です: ${ext}`);
}

export const ModelEditorTab: React.FC<ModelEditorTabProps> = ({
  carsDir,
  carId,
  cars,
  files,
  initialMode = 'edit',
  onSavedPartsChanged,
  onToast,
  onRegisterUndoRedo,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const envTexRef = useRef<THREE.Texture | null>(null);
  const modelRootRef = useRef<THREE.Group | null>(null);
  const highlightHelpersRef = useRef<THREE.BoxHelper[]>([]);
  const texCacheRef = useRef<CspTextureCache>(buildCspTextureCache([]));
  const historyRef = useRef(
    new HistoryStack<ModelUndoAction>({
      maxEntries: 40,
      coalesceMs: 450,
      onEvict: disposeEvictedModelAction,
    })
  );
  const [historyTick, setHistoryTick] = useState(0);

  const [embeddedTextures, setEmbeddedTextures] = useState<Kn5Texture[]>([]);
  const embeddedTexturesRef = useRef<Kn5Texture[]>([]);
  embeddedTexturesRef.current = embeddedTextures;

  // Parts Library & Action Modal state
  const [savedParts, setSavedParts] = useState<SavedPartEntry[]>([]);
  const [partFilterCat, setPartFilterCat] = useState<PartCategory | 'all'>('all');
  const [savedPartPickerMode, setSavedPartPickerMode] = useState<'append' | 'replace' | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [savePartDialogOpen, setSavePartDialogOpen] = useState(false);
  const [newPartName, setNewPartName] = useState('');
  const [newPartCategory, setNewPartCategory] = useState<PartCategory>('wheel');
  const [optMatchPos, setOptMatchPos] = useState(true);
  const [optMatchSize, setOptMatchSize] = useState(true);
  const [optPreserveName, setOptPreserveName] = useState(true);
  const [optFlipY180, setOptFlipY180] = useState(false);

  const [carModels, setCarModels] = useState<CarModelFileInfo[]>([]);
  const [activeKn5Name, setActiveKn5Name] = useState<string>(`${carId}.kn5`);
  const [saveFileName, setSaveFileName] = useState<string>(`${carId}.kn5`);
  const [updateLodsOnSave, setUpdateLodsOnSave] = useState(true);
  const [wireframe, setWireframe] = useState(false);
  const [cspPreset, setCspPreset] = useState<CspLightingPreset>('csp_showroom');

  // Other car donor selector
  const [donorCarId, setDonorCarId] = useState<string>('');
  const [donorModels, setDonorModels] = useState<CarModelFileInfo[]>([]);
  const [donorFileName, setDonorFileName] = useState<string>('');

  // Scene tree & multi-part selection state (Shift + Left-Click to select multiple parts!)
  const [treeItems, setTreeItems] = useState<SceneTreeItem[]>([]);
  const [treeSearch, setTreeSearch] = useState('');
  const [selectedUuids, setSelectedUuids] = useState<string[]>([]);
  const selectedUuid = selectedUuids[selectedUuids.length - 1] ?? null;
  const setSelectedUuid = useCallback((uuid: string | null) => {
    setSelectedUuids(uuid ? [uuid] : []);
  }, []);
  const toggleSelectedUuid = useCallback((uuid: string) => {
    setSelectedUuids((prev) =>
      prev.includes(uuid) ? prev.filter((id) => id !== uuid) : [...prev, uuid]
    );
  }, []);
  const selectedUuidSet = useMemo(() => new Set(selectedUuids), [selectedUuids]);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('node');
  const [selectedMatUuid, setSelectedMatUuid] = useState<string>('');
  const [uniformScale, setUniformScale] = useState(true);
  const [inspectorTick, setInspectorTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [treeDetachMode, setTreeDetachMode] = useState<DetachMode>('docked');
  const [viewerDetachMode, setViewerDetachMode] = useState<DetachMode>('docked');
  const [inspectorDetachMode, setInspectorDetachMode] = useState<DetachMode>('docked');

  // Texture preview thumbnails cache (computed lazily on textures tab)
  const [texPreviews, setTexPreviews] = useState<Record<string, string>>({});

  const rebuildTreeList = useCallback(() => {
    const root = modelRootRef.current;
    if (!root) {
      setTreeItems([]);
      return;
    }
    const items: SceneTreeItem[] = [];
    const walk = (obj: THREE.Object3D, depth: number) => {
      const isMesh = (obj as THREE.Mesh).isMesh === true;
      let vertexCount = 0;
      if (isMesh) {
        const pos = (obj as THREE.Mesh).geometry?.getAttribute('position');
        if (pos) vertexCount = pos.count;
      }
      items.push({
        uuid: obj.uuid,
        name: obj.name || (isMesh ? 'Mesh' : 'Group'),
        depth,
        isMesh,
        visible: obj.visible,
        vertexCount,
      });
      for (const ch of obj.children) {
        walk(ch, depth + 1);
      }
    };
    for (const ch of root.children) {
      walk(ch, 0);
    }
    setTreeItems(items);
  }, []);

  const findObjectByUuid = useCallback((uuid: string | null): THREE.Object3D | null => {
    if (!uuid || !modelRootRef.current) return null;
    let found: THREE.Object3D | null = null;
    modelRootRef.current.traverse((obj) => {
      if (obj.uuid === uuid) found = obj;
    });
    return found;
  }, []);

  const selectedObj = useMemo(() => {
    void inspectorTick;
    return findObjectByUuid(selectedUuid);
  }, [findObjectByUuid, selectedUuid, inspectorTick]);

  const selectedObjs = useMemo(() => {
    void inspectorTick;
    const raw: THREE.Object3D[] = [];
    for (const id of selectedUuids) {
      const found = findObjectByUuid(id);
      if (found) raw.push(found);
    }
    return deduplicateSelectedObjects(raw);
  }, [findObjectByUuid, selectedUuids, inspectorTick]);

  // Collect all unique materials in the scene
  const sceneMaterials = useMemo(() => {
    void inspectorTick;
    void treeItems;
    const root = modelRootRef.current;
    if (!root) return [] as THREE.Material[];
    const seen = new Set<string>();
    const list: THREE.Material[] = [];
    root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const rawMat = (obj as THREE.Mesh).material;
        const mats: THREE.Material[] = Array.isArray(rawMat) ? rawMat : [rawMat];
        for (const m of mats) {
          if (m && !seen.has(m.uuid)) {
            seen.add(m.uuid);
            list.push(m);
          }
        }
      }
    });
    return list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [inspectorTick, treeItems]);

  // Auto-sync selected material when clicking a mesh
  useEffect(() => {
    if (selectedObj && (selectedObj as THREE.Mesh).isMesh) {
      const m = (selectedObj as THREE.Mesh).material;
      const first = Array.isArray(m) ? m[0] : m;
      if (first) setSelectedMatUuid(first.uuid);
    }
  }, [selectedObj]);

  const activeThreeMaterial = useMemo(() => {
    void inspectorTick;
    return sceneMaterials.find((m) => m.uuid === selectedMatUuid) ?? sceneMaterials[0] ?? null;
  }, [sceneMaterials, selectedMatUuid, inspectorTick]);

  // Ensure active material always has a KsEditor Kn5Material structure for live editing
  const ensureKn5MaterialOn = useCallback(
    (mat: THREE.Material): Kn5Material => {
      if (mat.userData.kn5Material) {
        return mat.userData.kn5Material as Kn5Material;
      }
      const std = mat as THREE.MeshStandardMaterial;
      const col = std?.color ? std.color.clone() : new THREE.Color('#cbd5e1');
      const r = Math.round(col.r * 255);
      const g = Math.round(col.g * 255);
      const b = Math.round(col.b * 255);
      const texName = `ac_studio_${(mat.name || 'mat').replace(/[^a-z0-9_]/gi, '_')}.dds`;
      if (!embeddedTexturesRef.current.some((t) => t.name.toLowerCase() === texName.toLowerCase())) {
        const nextTex = [...embeddedTexturesRef.current, { type: 1, name: texName, data: createSolidColorDds(r, g, b, 255) }];
        setEmbeddedTextures(nextTex);
        texCacheRef.current = buildCspTextureCache(nextTex);
      }
      const ks = createKsEditorPresetMaterial('carpaint', mat.name || 'Material', texName);
      mat.userData.kn5Material = ks;
      return ks;
    },
    []
  );

  // Refresh all CSP Three.js materials whenever embedded textures change
  const refreshAllSceneCspMaterials = useCallback((textures: Kn5Texture[]) => {
    const cache = buildCspTextureCache(textures);
    texCacheRef.current = cache;
    const root = modelRootRef.current;
    if (!root) return;
    const updated = new Set<string>();
    root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = (obj as THREE.Mesh).material;
        const mats = Array.isArray(m) ? m : [m];
        for (const mat of mats) {
          if (mat && !updated.has(mat.uuid) && mat.userData?.kn5Material) {
            updated.add(mat.uuid);
            if (mat instanceof THREE.MeshPhysicalMaterial) {
              buildCspMaterialFromKn5(mat.userData.kn5Material as Kn5Material, cache, mat);
            }
          }
        }
      }
    });
    setInspectorTick((t) => t + 1);
  }, []);

  // Build thumbnails lazily when opening Textures tab
  useEffect(() => {
    if (inspectorTab !== 'textures') return;
    const next: Record<string, string> = {};
    for (const tex of embeddedTextures) {
      if (tex.type === 0 || tex.data.byteLength < 16) continue;
      if (texPreviews[tex.name]) {
        next[tex.name] = texPreviews[tex.name];
      } else {
        const url = kn5TextureToPreviewDataUrl(tex, 64);
        if (url) next[tex.name] = url;
      }
    }
    setTexPreviews(next);
  }, [inspectorTab, embeddedTextures]);

  const updateSelectionHighlights = useCallback(
    (objs: THREE.Object3D[], primaryUuid: string | null) => {
      const scene = sceneRef.current;
      if (!scene) return;
      for (const h of highlightHelpersRef.current) {
        scene.remove(h);
        h.dispose();
      }
      highlightHelpersRef.current = [];
      for (const obj of objs) {
        const isPrimary = obj.uuid === primaryUuid;
        const helper = new THREE.BoxHelper(obj, isPrimary ? 0xfbbf24 : 0x10b981);
        scene.add(helper);
        highlightHelpersRef.current.push(helper);
      }
    },
    []
  );

  useEffect(() => {
    updateSelectionHighlights(selectedObjs, selectedUuid);
  }, [selectedObjs, selectedUuid, updateSelectionHighlights]);

  // Setup CSP-Based Three.js Viewport
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0d121c');

    const camera = new THREE.PerspectiveCamera(
      40,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.05,
      150
    );
    camera.position.set(3.8, 1.7, 4.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    cameraRef.current = camera;

    // CSP IBL Environment Map
    const env = createCspEnvironmentMap(renderer, 'csp_showroom');
    scene.environment = env;
    envTexRef.current = env;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0.58, 0);

    // Studio key + fill + rim lights matching CSP Showroom
    scene.add(new THREE.HemisphereLight('#e2e8f0', '#1e293b', 0.65));
    const dir1 = new THREE.DirectionalLight('#ffffff', 2.0);
    dir1.position.set(6, 9, 6);
    dir1.castShadow = true;
    dir1.shadow.mapSize.set(1024, 1024);
    scene.add(dir1);
    const dir2 = new THREE.DirectionalLight('#7dd3fc', 0.8);
    dir2.position.set(-6, 5, -5);
    scene.add(dir2);

    // Subtle reflective showroom floor
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(36, 36),
      new THREE.MeshStandardMaterial({ color: '#0c1019', roughness: 0.48, metalness: 0.25 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(20, 40, '#2e3c59', '#172032');
    grid.position.y = 0.002;
    scene.add(grid);
    scene.add(new THREE.AxesHelper(1.0));

    const modelRoot = new THREE.Group();
    modelRoot.name = 'MODEL_EDITOR_ROOT';
    scene.add(modelRoot);

    sceneRef.current = scene;
    modelRootRef.current = modelRoot;

    // Left-click Raycasting to directly select 3D parts in viewport
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    let downX = 0;
    let downY = 0;

    const onPointerDown = (ev: PointerEvent) => {
      if (ev.button !== 0) return;
      downX = ev.clientX;
      downY = ev.clientY;
    };

    const onPointerUp = (ev: PointerEvent) => {
      if (ev.button !== 0) return;
      const dist = Math.hypot(ev.clientX - downX, ev.clientY - downY);
      if (dist > 5) return; // Dragged camera -> not a click

      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects(modelRoot.children, true);
      const visibleHit = hits.find((h) => {
        let cur: THREE.Object3D | null = h.object;
        while (cur && cur !== modelRoot) {
          if (!cur.visible) return false;
          cur = cur.parent;
        }
        return true;
      });
      if (visibleHit) {
        if (ev.shiftKey) {
          toggleSelectedUuid(visibleHit.object.uuid);
        } else {
          setSelectedUuid(visibleHit.object.uuid);
        }
        setInspectorTick((t) => t + 1);
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    const ro = new ResizeObserver(() => {
      if (!container) return;
      camera.aspect = container.clientWidth / Math.max(1, container.clientHeight);
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, Math.max(1, container.clientHeight));
    });
    ro.observe(container);

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      for (const h of highlightHelpersRef.current) {
        h.update();
      }
      controls.update();
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      ro.disconnect();
      controls.dispose();
      highlightHelpersRef.current = [];
      envTexRef.current?.dispose();
      historyRef.current.clear();
      disposeThreeObject(scene);
      renderer.dispose();
    };
  }, [setSelectedUuid, toggleSelectedUuid]);

  // Update CSP lighting preset
  useEffect(() => {
    const scene = sceneRef.current;
    const renderer = rendererRef.current;
    if (!scene || !renderer) return;
    envTexRef.current?.dispose();
    const nextEnv = createCspEnvironmentMap(renderer, cspPreset);
    scene.environment = nextEnv;
    envTexRef.current = nextEnv;
    scene.background = new THREE.Color(
      cspPreset === 'csp_sunset' ? '#171d2c' : cspPreset === 'csp_studio_dark' ? '#070a10' : '#0d121c'
    );
  }, [cspPreset]);

  const replaceSceneWithObject = useCallback(
    (obj: THREE.Object3D, textures: Kn5Texture[] = []) => {
      const root = modelRootRef.current;
      if (!root) return;
      historyRef.current.clear();
      setHistoryTick((t) => t + 1);
      clearThreeGroup(root);
      setEmbeddedTextures(textures);
      setTexPreviews({});
      texCacheRef.current = buildCspTextureCache(textures);
      root.add(obj);
      setSelectedUuid(obj.uuid);
      rebuildTreeList();
      setInspectorTick((t) => t + 1);
    },
    [rebuildTreeList]
  );

  const findMaterialByUuid = useCallback((uuid: string): THREE.Material | null => {
    const root = modelRootRef.current;
    if (!root) return null;
    let found: THREE.Material | null = null;
    root.traverse((obj) => {
      if (found || !(obj as THREE.Mesh).isMesh) return;
      const raw = (obj as THREE.Mesh).material;
      const mats = Array.isArray(raw) ? raw : [raw];
      for (const m of mats) {
        if (m && m.uuid === uuid) {
          found = m;
          break;
        }
      }
    });
    return found;
  }, []);

  const applyModelTextures = useCallback(
    (textures: Kn5Texture[]) => {
      setEmbeddedTextures(textures);
      embeddedTexturesRef.current = textures;
      setTexPreviews({});
      refreshAllSceneCspMaterials(textures);
    },
    [refreshAllSceneCspMaterials]
  );

  const executeModelHistory = useCallback(
    (dir: 'undo' | 'redo') => {
      const rec = dir === 'undo' ? historyRef.current.undo() : historyRef.current.redo();
      if (!rec) return;
      const action = rec.value;
      const isUndo = dir === 'undo';

      if (action.kind === 'node') {
        const obj = findObjectByUuid(action.uuid);
        if (obj) {
          applyNodeSnapshot(obj, isUndo ? action.before : action.after);
          setSelectedUuid(obj.uuid);
        }
        rebuildTreeList();
        setInspectorTick((t) => t + 1);
      } else if (action.kind === 'material') {
        const texList = isUndo ? action.prevTextures : action.nextTextures;
        if (texList) {
          setEmbeddedTextures(texList);
          embeddedTexturesRef.current = texList;
          texCacheRef.current = buildCspTextureCache(texList);
        }
        const mat = findMaterialByUuid(action.matUuid);
        if (mat) {
          const ks = structuredClone(isUndo ? action.before : action.after);
          mat.userData.kn5Material = ks;
          if (mat instanceof THREE.MeshPhysicalMaterial) {
            buildCspMaterialFromKn5(ks, texCacheRef.current, mat);
          }
          setSelectedMatUuid(mat.uuid);
        }
        setInspectorTick((t) => t + 1);
      } else if (action.kind === 'add_node') {
        if (isUndo) {
          action.parent.remove(action.node);
          if (action.prevTextures) applyModelTextures(action.prevTextures);
          setSelectedUuid(action.prevSelectedUuid);
        } else {
          action.parent.add(action.node);
          if (action.nextTextures) applyModelTextures(action.nextTextures);
          setSelectedUuid(action.node.uuid);
        }
        rebuildTreeList();
        setInspectorTick((t) => t + 1);
      } else if (action.kind === 'delete_node') {
        if (isUndo) {
          insertChildAtIndex(action.parent, action.node, action.index);
          setSelectedUuid(action.node.uuid);
        } else {
          action.parent.remove(action.node);
          setSelectedUuid(null);
        }
        rebuildTreeList();
        setInspectorTick((t) => t + 1);
      } else if (action.kind === 'replace_nodes') {
        if (isUndo) {
          for (let i = action.replacements.length - 1; i >= 0; i--) {
            const r = action.replacements[i];
            if (r.newObj) r.parent.remove(r.newObj);
            insertChildAtIndex(r.parent, r.oldObj, r.index);
          }
          if (action.prevTextures) applyModelTextures(action.prevTextures);
          setSelectedUuid(action.prevSelectedUuid);
        } else {
          for (const r of action.replacements) {
            r.parent.remove(r.oldObj);
            if (r.newObj) insertChildAtIndex(r.parent, r.newObj, r.index);
          }
          if (action.nextTextures) applyModelTextures(action.nextTextures);
          setSelectedUuid(action.nextSelectedUuid);
        }
        rebuildTreeList();
        setInspectorTick((t) => t + 1);
      } else if (action.kind === 'textures') {
        applyModelTextures(isUndo ? action.prevTextures : action.nextTextures);
      }

      setHistoryTick((t) => t + 1);
      onToast(
        `${isUndo ? '元に戻しました' : 'やり直しました'}${rec.label ? ` (${rec.label})` : ''}`,
        'info'
      );
    },
    [applyModelTextures, findMaterialByUuid, findObjectByUuid, onToast, rebuildTreeList]
  );

  useEffect(() => {
    if (!onRegisterUndoRedo) return;
    void historyTick;
    onRegisterUndoRedo({
      undo: () => executeModelHistory('undo'),
      redo: () => executeModelHistory('redo'),
      canUndo: historyRef.current.canUndo,
      canRedo: historyRef.current.canRedo,
      undoCount: historyRef.current.undoCount,
      redoCount: historyRef.current.redoCount,
      undoLabel: historyRef.current.undoLabel,
      redoLabel: historyRef.current.redoLabel,
    });
  }, [onRegisterUndoRedo, executeModelHistory, historyTick]);

  useEffect(() => {
    return () => {
      onRegisterUndoRedo?.(null);
    };
  }, [onRegisterUndoRedo]);

  const loadProceduralBase = useCallback(() => {
    const susp = files['suspensions.ini'] ?? '';
    const tyres = files['tyres.ini'] ?? '';
    const proc = buildProceduralCarGroup({
      wheelbase: getIniNumber(susp, 'BASIC', 'WHEELBASE', 2.6),
      frontTrack: getIniNumber(susp, 'FRONT', 'TRACK', 1.54),
      rearTrack: getIniNumber(susp, 'REAR', 'TRACK', 1.56),
      frontRadius: getIniNumber(tyres, 'FRONT', 'RADIUS', 0.316),
      rearRadius: getIniNumber(tyres, 'REAR', 'RADIUS', 0.316),
      frontWidth: getIniNumber(tyres, 'FRONT', 'WIDTH', 0.24),
      rearWidth: getIniNumber(tyres, 'REAR', 'WIDTH', 0.26),
    });
    replaceSceneWithObject(proc, []);
  }, [files, replaceSceneWithObject]);

  const loadCarKn5File = useCallback(
    async (fileName: string) => {
      setBusy(true);
      try {
        const bytes = await window.acApi.readCarModelBytes(carsDir, carId, fileName);
        if (!bytes) {
          onToast(`${fileName} の読み込みに失敗しました`, 'error');
          return;
        }
        const doc = parseKn5(bytes);
        const cache = buildCspTextureCache(doc.textures);
        const grp = kn5ToThreeGroup(doc, cache);
        setActiveKn5Name(fileName);
        setSaveFileName(fileName);
        replaceSceneWithObject(grp, doc.textures);
        onToast(
          `${fileName} を読込 (CSP PBR変換 / テクスチャ ${doc.textures.length} / マテリアル ${doc.materials.length})`,
          'info'
        );
      } catch (err) {
        onToast(`KN5解析エラー: ${err instanceof Error ? err.message : String(err)}`, 'error');
      } finally {
        setBusy(false);
      }
    },
    [carsDir, carId, onToast, replaceSceneWithObject]
  );

  // Scan current car models on car switch (always deprioritize collider.kn5)
  useEffect(() => {
    (async () => {
      const [models, parts] = await Promise.all([
        window.acApi.listCarModels(carsDir, carId),
        window.acApi.listSavedParts(),
      ]);
      setCarModels(models);
      setSavedParts(parts);
      const preferred = models.find((m) => !m.fileName.toLowerCase().includes('collider')) ?? models[0];
      if (preferred) {
        await loadCarKn5File(preferred.fileName);
      } else {
        setActiveKn5Name('(未配置)');
        setSaveFileName(`${carId}.kn5`);
        loadProceduralBase();
      }
    })();
  }, [carsDir, carId, loadCarKn5File, loadProceduralBase]);

  // Apply wireframe toggle
  useEffect(() => {
    const root = modelRootRef.current;
    if (!root) return;
    root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mats = Array.isArray((obj as THREE.Mesh).material)
          ? ((obj as THREE.Mesh).material as THREE.Material[])
          : [(obj as THREE.Mesh).material];
        for (const m of mats) {
          if ('wireframe' in m) (m as THREE.MeshStandardMaterial).wireframe = wireframe;
        }
      }
    });
  }, [wireframe, treeItems]);

  const handleSelectDonorCar = async (targetDonorId: string) => {
    setDonorCarId(targetDonorId);
    setDonorFileName('');
    if (!targetDonorId) {
      setDonorModels([]);
      return;
    }
    const list = await window.acApi.listCarModels(carsDir, targetDonorId);
    setDonorModels(list);
    const preferred = list.find((m) => !m.fileName.toLowerCase().includes('collider')) ?? list[0];
    if (preferred) setDonorFileName(preferred.fileName);
  };

  const mergeTexturesUnique = (incoming: Kn5Texture[]): Kn5Texture[] => {
    if (incoming.length === 0) return embeddedTexturesRef.current;
    const map = new Map<string, Kn5Texture>();
    for (const t of embeddedTexturesRef.current) map.set(t.name.toLowerCase(), t);
    for (const t of incoming) {
      if (!map.has(t.name.toLowerCase())) map.set(t.name.toLowerCase(), t);
    }
    const next = Array.from(map.values());
    setEmbeddedTextures(next);
    embeddedTexturesRef.current = next;
    texCacheRef.current = buildCspTextureCache(next);
    return next;
  };

  const handleImportExternal = async (mode: 'append' | 'replace') => {
    const picked = await window.acApi.pickExternalModelFile();
    if (!picked) return;
    const root = modelRootRef.current;
    if (!root) return;
    setBusy(true);
    try {
      const { group, textures } = await parseExternalModelToThree(
        picked.ext,
        picked.fileName,
        picked.bytes
      );
      const prevTextures = [...embeddedTexturesRef.current];
      const prevSel = selectedUuid;
      if (mode === 'replace') {
        const oldChildren = [...root.children];
        for (let i = 0; i < oldChildren.length; i++) {
          root.remove(oldChildren[i]);
        }
        root.add(group);
        if (oldChildren.length > 0) {
          const replacements: Array<{
            parent: THREE.Object3D;
            oldObj: THREE.Object3D;
            newObj: THREE.Object3D | null;
            index: number;
          }> = [{ parent: root, oldObj: oldChildren[0], newObj: group, index: 0 }];
          for (let i = 1; i < oldChildren.length; i++) {
            replacements.push({ parent: root, oldObj: oldChildren[i], newObj: null, index: i });
          }
          historyRef.current.push(
            {
              kind: 'replace_nodes',
              replacements,
              prevSelectedUuid: prevSel,
              nextSelectedUuid: group.uuid,
              prevTextures,
              nextTextures: textures,
            },
            { label: `外部モデル差替: ${picked.fileName}` }
          );
        } else {
          historyRef.current.push(
            {
              kind: 'add_node',
              parent: root,
              node: group,
              prevSelectedUuid: prevSel,
              prevTextures,
              nextTextures: textures,
            },
            { label: `外部モデル読込: ${picked.fileName}` }
          );
        }
        setEmbeddedTextures(textures);
        embeddedTexturesRef.current = textures;
        setTexPreviews({});
        texCacheRef.current = buildCspTextureCache(textures);
        setSelectedUuid(group.uuid);
        rebuildTreeList();
        setInspectorTick((t) => t + 1);
        setHistoryTick((t) => t + 1);
        onToast(`外部モデル ${picked.fileName} に差し替えました`, 'success');
      } else {
        root.add(group);
        const nextTextures = mergeTexturesUnique(textures);
        historyRef.current.push(
          {
            kind: 'add_node',
            parent: root,
            node: group,
            prevSelectedUuid: prevSel,
            prevTextures,
            nextTextures,
          },
          { label: `外部モデル追加: ${picked.fileName}` }
        );
        setSelectedUuid(group.uuid);
        rebuildTreeList();
        setHistoryTick((t) => t + 1);
        onToast(`外部モデル ${picked.fileName} をシーンに追加しました`, 'success');
      }
    } catch (err) {
      onToast(`3Dモデル読込失敗: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleMergeFromDonorCar = async () => {
    if (!donorCarId || !donorFileName || !modelRootRef.current) return;
    setBusy(true);
    try {
      const bytes = await window.acApi.readCarModelBytes(carsDir, donorCarId, donorFileName);
      if (!bytes) {
        onToast('移植元車両のKN5を読み込めませんでした', 'error');
        return;
      }
      const prevTextures = [...embeddedTexturesRef.current];
      const prevSel = selectedUuid;
      const doc = parseKn5(bytes);
      const grp = kn5ToThreeGroup(doc);
      grp.name = `IMPORTED_${donorCarId}`;
      modelRootRef.current.add(grp);
      const nextTextures = mergeTexturesUnique(doc.textures);
      historyRef.current.push(
        {
          kind: 'add_node',
          parent: modelRootRef.current,
          node: grp,
          prevSelectedUuid: prevSel,
          prevTextures,
          nextTextures,
        },
        { label: `他車パーツ追加: ${donorCarId}` }
      );
      setSelectedUuid(grp.uuid);
      rebuildTreeList();
      setHistoryTick((t) => t + 1);
      onToast(`${donorCarId}/${donorFileName} をパーツとしてシーンに追加しました`, 'success');
    } catch (err) {
      onToast(`インポートエラー: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleDirectReplaceFromDonor = async () => {
    if (!donorCarId || !donorFileName) return;
    setBusy(true);
    try {
      const res = await window.acApi.replaceModelFromCar(carsDir, carId, donorCarId, donorFileName);
      if (res.ok && res.targetFileName) {
        const models = await window.acApi.listCarModels(carsDir, carId);
        setCarModels(models);
        await loadCarKn5File(res.targetFileName);
        onToast(res.message, 'success');
      } else {
        onToast(res.message, 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleSaveKn5 = async () => {
    const root = modelRootRef.current;
    if (!root || root.children.length === 0) return;
    setBusy(true);
    try {
      const targetGroup = root.children.length === 1 ? root.children[0] : root;
      const bytes = threeGroupToKn5(targetGroup, embeddedTexturesRef.current);
      const res = await window.acApi.saveCarModelBytes(
        carsDir,
        carId,
        saveFileName || `${carId}.kn5`,
        bytes,
        updateLodsOnSave
      );
      if (res.ok) {
        const models = await window.acApi.listCarModels(carsDir, carId);
        setCarModels(models);
        setActiveKn5Name(saveFileName);
        onToast(`${res.message} (KsEditor/CSP完全互換形式で出力済)`, 'success');
      } else {
        onToast(res.message, 'error');
      }
    } catch (err) {
      onToast(`KN5書き出しエラー: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const mutateObjectWithUndo = (
    obj: THREE.Object3D | null,
    fn: (target: THREE.Object3D) => void,
    label?: string
  ) => {
    if (!obj) return;
    const before = captureNodeSnapshot(obj);
    fn(obj);
    obj.updateMatrixWorld(true);
    const after = captureNodeSnapshot(obj);
    historyRef.current.push(
      { kind: 'node', uuid: obj.uuid, before, after },
      {
        label: label ?? `ノード編集: ${obj.name || 'Node'}`,
        coalesceKey: `node:${obj.uuid}`,
        mergeCoalesced: (existing, incoming) =>
          existing.kind === 'node' && incoming.kind === 'node'
            ? { ...existing, after: incoming.after }
            : incoming,
      }
    );
    setInspectorTick((t) => t + 1);
    setHistoryTick((t) => t + 1);
    rebuildTreeList();
  };

  const mutateSelected = (fn: (obj: THREE.Object3D) => void) => {
    mutateObjectWithUndo(selectedObj, fn);
  };

  // Mutate KsEditor material and immediately re-render CSP Three.js material
  const mutateActiveKsMaterial = (fn: (ks: Kn5Material) => void) => {
    if (!activeThreeMaterial) return;
    const prevTextures = [...embeddedTexturesRef.current];
    const ks = ensureKn5MaterialOn(activeThreeMaterial);
    const before = structuredClone(ks);
    fn(ks);
    const after = structuredClone(ks);
    const nextTextures = [...embeddedTexturesRef.current];
    activeThreeMaterial.userData.kn5Material = ks;
    if (activeThreeMaterial instanceof THREE.MeshPhysicalMaterial) {
      buildCspMaterialFromKn5(ks, texCacheRef.current, activeThreeMaterial);
    }
    const texturesChanged = nextTextures.length !== prevTextures.length;
    historyRef.current.push(
      {
        kind: 'material',
        matUuid: activeThreeMaterial.uuid,
        before,
        after,
        ...(texturesChanged ? { prevTextures, nextTextures } : {}),
      },
      {
        label: `マテリアル編集: ${ks.name}`,
        coalesceKey: `mat:${activeThreeMaterial.uuid}`,
        mergeCoalesced: (existing, incoming) =>
          existing.kind === 'material' && incoming.kind === 'material'
            ? {
                ...existing,
                after: incoming.after,
                nextTextures: incoming.nextTextures ?? existing.nextTextures,
              }
            : incoming,
      }
    );
    setInspectorTick((t) => t + 1);
    setHistoryTick((t) => t + 1);
  };

  const handleAddExternalTexture = async () => {
    const picked = await window.acApi.pickExternalTextureFile();
    if (!picked) return;
    const prevTextures = [...embeddedTexturesRef.current];
    const existsIdx = embeddedTexturesRef.current.findIndex(
      (t) => t.name.toLowerCase() === picked.fileName.toLowerCase()
    );
    const next = [...embeddedTexturesRef.current];
    if (existsIdx >= 0) {
      next[existsIdx] = { type: 1, name: picked.fileName, data: picked.bytes };
    } else {
      next.push({ type: 1, name: picked.fileName, data: picked.bytes });
    }
    historyRef.current.push(
      { kind: 'textures', prevTextures, nextTextures: next },
      { label: `テクスチャ追加: ${picked.fileName}` }
    );
    setEmbeddedTextures(next);
    embeddedTexturesRef.current = next;
    setTexPreviews((p) => {
      const cp = { ...p };
      delete cp[picked.fileName];
      return cp;
    });
    refreshAllSceneCspMaterials(next);
    setHistoryTick((t) => t + 1);
    onToast(`テクスチャ "${picked.fileName}" を追加しました`, 'success');
  };

  const handleReplaceTextureBytes = async (targetName: string) => {
    const picked = await window.acApi.pickExternalTextureFile();
    if (!picked) return;
    const prevTextures = [...embeddedTexturesRef.current];
    const next = embeddedTexturesRef.current.map((t) =>
      t.name === targetName ? { ...t, type: 1, data: picked.bytes } : t
    );
    historyRef.current.push(
      { kind: 'textures', prevTextures, nextTextures: next },
      { label: `テクスチャ差替: ${targetName}` }
    );
    setEmbeddedTextures(next);
    embeddedTexturesRef.current = next;
    setTexPreviews((p) => {
      const cp = { ...p };
      delete cp[targetName];
      return cp;
    });
    refreshAllSceneCspMaterials(next);
    setHistoryTick((t) => t + 1);
    onToast(`テクスチャ "${targetName}" の中身を差し替えました`, 'success');
  };

  const handleDeleteTexture = (targetName: string) => {
    const prevTextures = [...embeddedTexturesRef.current];
    const next = embeddedTexturesRef.current.filter((t) => t.name !== targetName);
    historyRef.current.push(
      { kind: 'textures', prevTextures, nextTextures: next },
      { label: `テクスチャ削除: ${targetName}` }
    );
    setEmbeddedTextures(next);
    embeddedTexturesRef.current = next;
    refreshAllSceneCspMaterials(next);
    setHistoryTick((t) => t + 1);
    onToast(`テクスチャ "${targetName}" を削除しました`, 'info');
  };

  const handleDeleteSelected = () => {
    if (!selectedObj || !selectedObj.parent) return;
    const parent = selectedObj.parent;
    const index = parent.children.indexOf(selectedObj);
    const name = selectedObj.name;
    parent.remove(selectedObj);
    historyRef.current.push(
      { kind: 'delete_node', parent, node: selectedObj, index },
      { label: `ノード削除: ${name}` }
    );
    setSelectedUuid(null);
    rebuildTreeList();
    setHistoryTick((t) => t + 1);
    onToast('選択ノードを削除しました', 'info');
  };

  const handleDuplicateSelected = () => {
    if (!selectedObj || !selectedObj.parent) return;
    const parent = selectedObj.parent;
    const prevSel = selectedObj.uuid;
    const cloned = selectedObj.clone(true);
    cloned.name = `${selectedObj.name}_copy`;
    cloned.position.x += 0.2;
    parent.add(cloned);
    historyRef.current.push(
      { kind: 'add_node', parent, node: cloned, prevSelectedUuid: prevSel },
      { label: `ノード複製: ${selectedObj.name}` }
    );
    setSelectedUuid(cloned.uuid);
    rebuildTreeList();
    setHistoryTick((t) => t + 1);
    onToast(`ノード "${selectedObj.name}" を複製しました`, 'info');
  };

  // ===== Parts Library Handlers =====
  const captureViewportThumbnail = (): string | undefined => {
    const renderer = rendererRef.current;
    if (!renderer) return undefined;
    try {
      const src = renderer.domElement;
      const thumb = document.createElement('canvas');
      thumb.width = 160;
      thumb.height = 100;
      const ctx = thumb.getContext('2d');
      if (!ctx) return undefined;
      ctx.drawImage(src, 0, 0, thumb.width, thumb.height);
      return thumb.toDataURL('image/jpeg', 0.78);
    } catch {
      return undefined;
    }
  };

  const openSavePartForm = useCallback(() => {
    if (selectedObjs.length === 0) {
      onToast('保存するパーツを左クリック（複数選択は Shift+左クリック）で選択してください', 'info');
      return;
    }
    const primary = selectedObj ?? selectedObjs[0];
    const detectedCat = detectPartCategory(primary.name);
    setNewPartCategory(detectedCat);
    setNewPartName(
      selectedObjs.length > 1
        ? `${carId}_${primary.name}_${selectedObjs.length}parts`
        : `${carId}_${primary.name}`
    );
    setSavePartDialogOpen(true);
  }, [carId, onToast, selectedObj, selectedObjs]);

  const handleConfirmSavePart = useCallback(async () => {
    if (selectedObjs.length === 0 || busy) return;
    setBusy(true);
    try {
      const extracted = extractMultiplePartsToKn5(selectedObjs, embeddedTexturesRef.current);
      const thumb = captureViewportThumbnail();
      const primary = selectedObj ?? selectedObjs[0];
      const sourceLabel =
        selectedObjs.length > 1
          ? selectedObjs.map((o) => o.name).join(' + ')
          : primary.name;
      const res = await window.acApi.savePartToLibrary({
        name: newPartName.trim() || primary.name,
        category: newPartCategory,
        sourceCarId: carId,
        sourceNodeName: sourceLabel,
        sourceSide: extracted.sourceSide,
        bboxSize: extracted.bboxSize,
        thumbnailDataUrl: thumb,
        kn5Bytes: extracted.kn5Bytes,
      });
      if (res.ok && res.entry) {
        const list = await window.acApi.listSavedParts();
        setSavedParts(list);
        onSavedPartsChanged?.(list.length);
        setSavePartDialogOpen(false);
        setInspectorTab('parts');
        onToast(
          `「${res.entry.name}」を保存しました (${extracted.partCount}パーツ結合 / テクスチャ ${extracted.textureCount} 個抽出)`,
          'success'
        );
      } else {
        onToast(res.error || 'パーツ保存に失敗しました', 'error');
      }
    } catch (err) {
      onToast(`パーツ抽出エラー: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setBusy(false);
    }
  }, [busy, carId, newPartCategory, newPartName, onSavedPartsChanged, onToast, selectedObj, selectedObjs]);

  // Ctrl+S shortcut: opens Save Part dialog when part(s) are selected, or immediately commits save when dialog is open!
  const ctrlSHandlersRef = useRef({
    saveDialogOpen: false,
    hasSelection: false,
    openForm: openSavePartForm,
    confirmSave: handleConfirmSavePart,
    notifyNone: () => {},
  });
  ctrlSHandlersRef.current = {
    saveDialogOpen: savePartDialogOpen,
    hasSelection: selectedObjs.length > 0,
    openForm: openSavePartForm,
    confirmSave: handleConfirmSavePart,
    notifyNone: () =>
      onToast('保存するパーツを選択してから Ctrl+S を押してください（複数選択: Shift+左クリック）', 'info'),
  };

  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && ev.key.toLowerCase() === 's') {
        ev.preventDefault();
        ev.stopPropagation();
        const cur = ctrlSHandlersRef.current;
        if (cur.saveDialogOpen) {
          void cur.confirmSave();
        } else if (cur.hasSelection) {
          cur.openForm();
        } else {
          cur.notifyNone();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleReplaceSelectedWithPart = async (part: SavedPartEntry) => {
    if (!selectedObj || !selectedObj.parent || selectedObj.parent === modelRootRef.current) {
      onToast('差し替え先のパーツ（ホイール・ステア・シート等）を3Dビューで左クリック選択してください', 'error');
      return;
    }
    setBusy(true);
    try {
      const bytes = await window.acApi.loadSavedPartBytes(part.id);
      if (!bytes) {
        onToast('保存済みパーツの読み込みに失敗しました', 'error');
        return;
      }
      const { partGroup, mergedTextures, addedTextures } = instantiateSavedPartForCar(
        bytes,
        part.id,
        embeddedTexturesRef.current
      );

      // Auto-flip wheel if target is opposite side of source wheel
      const targetBox = new THREE.Box3().setFromObject(selectedObj);
      const targetCenter = new THREE.Vector3();
      if (!targetBox.isEmpty()) targetBox.getCenter(targetCenter);
      const targetSide = targetCenter.x > 0.25 ? 'left' : targetCenter.x < -0.25 ? 'right' : 'center';
      const autoFlipWheel =
        part.category === 'wheel' &&
        part.sourceSide &&
        part.sourceSide !== 'center' &&
        targetSide !== 'center' &&
        targetSide !== part.sourceSide;

      const parent = selectedObj.parent;
      const oldIndex = parent.children.indexOf(selectedObj);
      const prevTextures = [...embeddedTexturesRef.current];
      const prevSel = selectedObj.uuid;

      const placed = replaceNodeWithPartGroup(selectedObj, partGroup, {
        matchPosition: optMatchPos,
        matchSize: optMatchSize,
        preserveNodeName: optPreserveName,
        flipY180: optFlipY180 !== Boolean(autoFlipWheel),
        isWheel: part.category === 'wheel' || detectPartCategory(selectedObj.name) === 'wheel',
      });

      historyRef.current.push(
        {
          kind: 'replace_nodes',
          replacements: [{ parent, oldObj: selectedObj, newObj: placed, index: oldIndex }],
          prevSelectedUuid: prevSel,
          nextSelectedUuid: placed.uuid,
          prevTextures,
          nextTextures: mergedTextures,
        },
        { label: `パーツ差替: ${part.name}` }
      );
      setEmbeddedTextures(mergedTextures);
      embeddedTexturesRef.current = mergedTextures;
      texCacheRef.current = buildCspTextureCache(mergedTextures);
      setSelectedUuid(placed.uuid);
      setSavedPartPickerMode(null);
      rebuildTreeList();
      setInspectorTick((t) => t + 1);
      setHistoryTick((t) => t + 1);
      onToast(
        `「${placed.name}」をパーツ「${part.name}」へ差し替えました (追加テクスチャ ${addedTextures} 個)`,
        'success'
      );
    } catch (err) {
      onToast(`パーツ差し替えエラー: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleReplaceAllFourWheels = async (part: SavedPartEntry) => {
    const root = modelRootRef.current;
    if (!root) return;
    setBusy(true);
    try {
      const bytes = await window.acApi.loadSavedPartBytes(part.id);
      if (!bytes) {
        onToast('ホイールパーツの読み込みに失敗しました', 'error');
        return;
      }
      const prevTextures = [...embeddedTexturesRef.current];
      const prevSel = selectedUuid;
      const { replacedCount, mergedTextures, firstReplaced, replacements } = replaceAllFourWheels(
        root,
        bytes,
        part,
        embeddedTexturesRef.current,
        optMatchSize
      );
      if (replacedCount === 0) {
        onToast(
          'この車両に WHEEL_LF / WHEEL_RF / WHEEL_LR / WHEEL_RR ノードが見つかりませんでした。個別に左クリックして差し替えてください。',
          'error'
        );
        return;
      }
      historyRef.current.push(
        {
          kind: 'replace_nodes',
          replacements,
          prevSelectedUuid: prevSel,
          nextSelectedUuid: firstReplaced?.uuid ?? prevSel,
          prevTextures,
          nextTextures: mergedTextures,
        },
        { label: `4輪ホイール交換: ${part.name}` }
      );
      setEmbeddedTextures(mergedTextures);
      embeddedTexturesRef.current = mergedTextures;
      texCacheRef.current = buildCspTextureCache(mergedTextures);
      if (firstReplaced) setSelectedUuid(firstReplaced.uuid);
      setSavedPartPickerMode(null);
      rebuildTreeList();
      setInspectorTick((t) => t + 1);
      setHistoryTick((t) => t + 1);
      onToast(`ホイール「${part.name}」を ${replacedCount} 輪すべてに自動フィット装着しました！`, 'success');
    } catch (err) {
      onToast(`4輪差し替えエラー: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleAppendPartToScene = async (part: SavedPartEntry) => {
    const root = modelRootRef.current;
    if (!root) return;
    setBusy(true);
    try {
      const bytes = await window.acApi.loadSavedPartBytes(part.id);
      if (!bytes) return;
      const prevTextures = [...embeddedTexturesRef.current];
      const prevSel = selectedUuid;
      const { partGroup, mergedTextures } = instantiateSavedPartForCar(
        bytes,
        part.id,
        embeddedTexturesRef.current
      );
      partGroup.name = part.name.replace(/[^a-z0-9_]/gi, '_');
      const targetContainer = root.children[0] ?? root;
      targetContainer.add(partGroup);
      historyRef.current.push(
        {
          kind: 'add_node',
          parent: targetContainer,
          node: partGroup,
          prevSelectedUuid: prevSel,
          prevTextures,
          nextTextures: mergedTextures,
        },
        { label: `パーツ追加: ${part.name}` }
      );
      setEmbeddedTextures(mergedTextures);
      embeddedTexturesRef.current = mergedTextures;
      texCacheRef.current = buildCspTextureCache(mergedTextures);
      setSelectedUuid(partGroup.uuid);
      setSavedPartPickerMode(null);
      rebuildTreeList();
      setInspectorTick((t) => t + 1);
      setHistoryTick((t) => t + 1);
      onToast(`保存モデル「${part.name}」を新規パーツとして車両へ追加しました`, 'success');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteSavedPart = async (partId: string) => {
    await window.acApi.deleteSavedPart(partId);
    const next = await window.acApi.listSavedParts();
    setSavedParts(next);
    onSavedPartsChanged?.(next.length);
    onToast('ライブラリからパーツを削除しました', 'info');
  };

  const selectedAncestors = useMemo(() => {
    void inspectorTick;
    if (!selectedObj) return [] as THREE.Object3D[];
    return getAncestorChain(selectedObj, modelRootRef.current);
  }, [selectedObj, inspectorTick]);

  const suggestedParentGroup = useMemo(() => {
    void inspectorTick;
    if (!selectedObj) return null;
    const found = findSuggestedPartGroup(selectedObj, modelRootRef.current);
    return found && found.uuid !== selectedObj.uuid ? found : null;
  }, [selectedObj, inspectorTick]);

  const selectedDetectedCat = useMemo(
    () => (selectedObj ? detectPartCategory(selectedObj.name) : 'other'),
    [selectedObj]
  );

  const filteredSavedParts = useMemo(() => {
    if (partFilterCat === 'all') return savedParts;
    return savedParts.filter((p) => p.category === partFilterCat);
  }, [savedParts, partFilterCat]);

  const filteredPickerParts = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    return filteredSavedParts.filter((p) => {
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.sourceCarId.toLowerCase().includes(q) ||
        p.sourceNodeName.toLowerCase().includes(q) ||
        PART_CATEGORY_LABELS[p.category].toLowerCase().includes(q)
      );
    });
  }, [filteredSavedParts, pickerSearch]);

  const filteredTree = useMemo(() => {
    const q = treeSearch.trim().toLowerCase();
    if (!q) return treeItems;
    return treeItems.filter((i) => i.name.toLowerCase().includes(q));
  }, [treeItems, treeSearch]);

  const totalVerts = useMemo(
    () => treeItems.reduce((acc, i) => acc + i.vertexCount, 0),
    [treeItems]
  );

  const activeKsMat = useMemo(() => {
    void inspectorTick;
    if (!activeThreeMaterial) return null;
    return (activeThreeMaterial.userData?.kn5Material as Kn5Material | undefined) ?? null;
  }, [activeThreeMaterial, inspectorTick]);

  const selectedMeshMeta = useMemo(() => {
    void inspectorTick;
    if (!selectedObj || !(selectedObj as THREE.Mesh).isMesh) return null;
    const m = selectedObj.userData?.kn5MeshMeta as Kn5MeshUserMeta | undefined;
    return (
      m ?? {
        nodeClass: 2 as const,
        castShadows: (selectedObj as THREE.Mesh).castShadow,
        isVisible: selectedObj.visible,
        isTransparent: false,
        layer: 0,
        lodIn: 0,
        lodOut: 2000,
        isRenderable: true,
      }
    );
  }, [selectedObj, inspectorTick]);

  return (
    <div className="space-y-4">
      {/* Top Import / Replace / Export Toolbar */}
      <div className="bg-[#121722] border border-[#242e42] rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 mr-2">
            <Box className="w-4 h-4 text-rose-400" />
            <span className="font-semibold text-slate-100">3Dモデル &amp; KsEditor / CSP スタジオ</span>
            <span className="font-mono-num text-[11px] px-2 py-0.5 rounded bg-[#0b0e14] border border-[#252e42] text-cyan-300">
              {activeKn5Name}
            </span>
          </div>

          {carModels.length > 1 && (
            <select
              value={activeKn5Name}
              onChange={(e) => loadCarKn5File(e.target.value)}
              className="bg-[#0b0e14] border border-[#2b354b] rounded-lg px-2 py-1.5 text-slate-200"
            >
              {carModels.map((m) => (
                <option key={m.fileName} value={m.fileName}>
                  {m.fileName} {m.isPrimaryLod ? '[LOD_0]' : ''} ({(m.sizeBytes / 1024).toFixed(0)} KB)
                </option>
              ))}
            </select>
          )}

          <button
            onClick={() => handleImportExternal('append')}
            disabled={busy}
            className="flex items-center gap-1.5 bg-[#1b2436] hover:bg-[#26324c] text-emerald-300 border border-emerald-500/30 px-3 py-1.5 rounded-lg"
          >
            <FilePlus2 className="w-3.5 h-3.5" />
            外部モデル追加 (.kn5/.fbx/.glb/.obj)
          </button>

          <button
            onClick={() => {
              loadProceduralBase();
              onToast('プロシージャルベース車両を生成しました', 'info');
            }}
            className="flex items-center gap-1 bg-[#1b2436] hover:bg-[#26324c] text-slate-300 border border-[#2d3a54] px-2.5 py-1.5 rounded-lg"
          >
            <Car className="w-3.5 h-3.5" />
            ベース車生成
          </button>
        </div>

        {/* Export to KN5 */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={saveFileName}
            onChange={(e) => setSaveFileName(e.target.value)}
            className="w-44 bg-[#0b0e14] border border-[#2b354b] rounded-lg px-2.5 py-1.5 font-mono-num text-slate-100"
            placeholder="car_model.kn5"
          />
          <label className="flex items-center gap-1 text-[11px] text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={updateLodsOnSave}
              onChange={(e) => setUpdateLodsOnSave(e.target.checked)}
              className="accent-rose-500"
            />
            lods.ini連動
          </label>
          <button
            onClick={handleSaveKn5}
            disabled={busy}
            className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white font-semibold px-3.5 py-1.5 rounded-lg"
          >
            <Save className="w-3.5 h-3.5" />
            .kn5 として保存
          </button>
        </div>
      </div>

      {/* Save Mode Guidance Strip (shown when opened from HOME -> モデル改造 -> モデルの保存) */}
      {initialMode === 'save' && (
        <div className="bg-emerald-500/10 border border-emerald-500/35 rounded-xl px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-200">
          <div className="flex items-center gap-2">
            <BookmarkPlus className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              <strong>モデルの保存モード:</strong> 3Dモデル上またはシーングラフでパーツを左クリック選択（複数パーツは{' '}
              <kbd className="px-1.5 py-0.5 rounded bg-[#0b1018] border border-emerald-500/40 font-mono-num text-[10px]">
                Shift + 左クリック
              </kbd>
              ）し、{' '}
              <kbd className="px-1.5 py-0.5 rounded bg-[#0b1018] border border-emerald-500/40 font-mono-num text-[10px]">
                Ctrl + S
              </kbd>{' '}
              または「パーツの保存」でライブラリへ保存できます。
            </span>
          </div>
          <span className="font-mono-num text-[11px] text-emerald-300 shrink-0">
            選択中: {selectedObjs.length} パーツ
          </span>
        </div>
      )}

      {/* Donor Car Transfer & Core Part Action Bar (パーツの保存 / 新規パーツ追加 / モデルの差し替え) */}
      <div className="bg-[#121722] border border-[#242e42] rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-400 font-medium">他車両からKN5を移植:</span>
          <select
            value={donorCarId}
            onChange={(e) => handleSelectDonorCar(e.target.value)}
            className="bg-[#0b0e14] border border-[#2b354b] rounded-lg px-2.5 py-1.5 text-slate-200 max-w-[210px]"
          >
            <option value="">移植元車両を選択...</option>
            {cars
              .filter((c) => c.id !== carId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>

          {donorModels.length > 0 && (
            <select
              value={donorFileName}
              onChange={(e) => setDonorFileName(e.target.value)}
              className="bg-[#0b0e14] border border-[#2b354b] rounded-lg px-2 py-1.5 text-slate-200 max-w-[180px]"
            >
              {donorModels.map((m) => (
                <option key={m.fileName} value={m.fileName}>
                  {m.fileName}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={handleMergeFromDonorCar}
            disabled={!donorCarId || !donorFileName || busy}
            className="flex items-center gap-1 bg-cyan-600/20 hover:bg-cyan-600/35 disabled:opacity-40 text-cyan-300 border border-cyan-500/30 px-2.5 py-1.5 rounded-lg"
          >
            <Plus className="w-3.5 h-3.5" />
            シーンに追加マージ
          </button>
        </div>

        {/* Relocated Core Model Actions: パーツの保存 / 新規パーツ追加 (保存済みモデル) / モデルの差し替え */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openSavePartForm}
            disabled={selectedObjs.length === 0 || busy}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold px-3 py-1.5 rounded-lg shadow-sm shadow-emerald-600/20"
            title="選択中のパーツを保存 (複数選択: Shift+左クリック / ショートカット: Ctrl+S)"
          >
            <BookmarkPlus className="w-3.5 h-3.5" />
            パーツの保存
            {selectedObjs.length > 0 && (
              <span className="font-mono-num text-[10px] px-1.5 py-0.2 rounded bg-black/25">
                {selectedObjs.length}件
              </span>
            )}
            <span className="font-mono-num text-[10px] opacity-80 hidden sm:inline">Ctrl+S</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setPickerSearch('');
              setPartFilterCat('all');
              setSavedPartPickerMode('append');
            }}
            disabled={busy}
            className="flex items-center gap-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white font-semibold px-3 py-1.5 rounded-lg shadow-sm shadow-cyan-600/20"
            title="保存されたモデル（パーツライブラリ）から選んで車両へ新規パーツとして追加します"
          >
            <Plus className="w-3.5 h-3.5" />
            新規パーツ追加
            <span className="font-mono-num text-[10px] px-1.5 py-0.2 rounded bg-black/25">
              {savedParts.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setPickerSearch('');
              if (selectedDetectedCat !== 'other') {
                setPartFilterCat(selectedDetectedCat);
              } else {
                setPartFilterCat('all');
              }
              setSavedPartPickerMode('replace');
            }}
            disabled={busy}
            className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white font-semibold px-3 py-1.5 rounded-lg shadow-sm shadow-amber-600/20"
            title="選択中パーツを保存済みモデルへ差し替え、または外部ファイル・他車両モデルで差し替えます"
          >
            <Replace className="w-3.5 h-3.5" />
            モデルの差し替え
          </button>
        </div>
      </div>

      {/* Main 3-Column Editor Workspace (Auto-Adapts to Window Size & Expands 3D Canvas when Panels are Detached) */}
      <div
        className="grid grid-cols-1 xl:grid-cols-12 gap-4"
        style={{ height: 'var(--accs-studio-h, calc(100vh - 185px))', minHeight: '460px' }}
      >
        {/* Left: Scene Graph */}
        <DetachablePanel
          panelId="model3d_scene_graph"
          title="シーングラフ"
          subtitle={`${treeItems.length} nodes / ${totalVerts.toLocaleString()} verts`}
          mode={treeDetachMode}
          onModeChange={setTreeDetachMode}
          dockedClassName="xl:col-span-3 bg-[#121722] border border-[#242e42] rounded-xl overflow-hidden"
          defaultFloatingBounds={{ x: 24, y: 110, width: 340, height: 560 }}
          popoutSize={{ width: 420, height: 720 }}
        >
          <div className="p-3 flex flex-col flex-1 min-h-0">
          <div className="relative mb-2">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
            <input
              type="text"
              value={treeSearch}
              onChange={(e) => setTreeSearch(e.target.value)}
              placeholder="ノード検索 (WHEEL, WING...)"
              className="w-full bg-[#0b0e14] border border-[#2b354b] rounded-lg pl-8 pr-2 py-1 text-xs text-slate-200"
            />
          </div>

          <div className="flex items-center justify-between gap-1 mb-1.5 text-[10px] text-slate-400">
            <span>Shift+左クリックで複数選択</span>
            {selectedUuids.length > 1 && (
              <button
                type="button"
                onClick={() => setSelectedUuids([])}
                className="text-emerald-300 hover:text-emerald-200 underline"
              >
                {selectedObjs.length}件選択中 (解除)
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto space-y-0.5 pr-1">
            {filteredTree.map((item) => {
              const isPrimary = item.uuid === selectedUuid;
              const isMulti = selectedUuidSet.has(item.uuid);
              const selIdx = isMulti ? selectedUuids.indexOf(item.uuid) + 1 : 0;
              return (
                <div
                  key={item.uuid}
                  onClick={(e) => {
                    if (e.shiftKey) {
                      toggleSelectedUuid(item.uuid);
                    } else {
                      setSelectedUuid(item.uuid);
                    }
                  }}
                  style={{ paddingLeft: `${8 + Math.min(5, item.depth) * 12}px` }}
                  className={`flex items-center justify-between gap-1 py-1 pr-2 rounded cursor-pointer text-[11px] font-mono-num select-none ${
                    isPrimary
                      ? 'bg-rose-500/20 text-rose-200 border border-rose-500/40'
                      : isMulti
                        ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40'
                        : 'text-slate-300 hover:bg-[#1a2233] border border-transparent'
                  }`}
                >
                  <span className="truncate flex items-center gap-1">
                    {selectedUuids.length > 1 && isMulti && (
                      <span className="text-[9px] px-1 rounded bg-emerald-500/30 text-emerald-100 font-bold shrink-0">
                        #{selIdx}
                      </span>
                    )}
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        item.isMesh ? 'bg-cyan-400' : 'bg-amber-400'
                      }`}
                    />
                    {item.name}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const obj = findObjectByUuid(item.uuid);
                      if (obj) {
                        mutateObjectWithUndo(
                          obj,
                          (o) => {
                            o.visible = !o.visible;
                            if (o.userData?.kn5MeshMeta) {
                              o.userData.kn5MeshMeta.isVisible = o.visible;
                            }
                          },
                          `表示切替: ${obj.name}`
                        );
                      }
                    }}
                    className="text-slate-500 hover:text-slate-200 shrink-0"
                    title="表示切替"
                  >
                    {item.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3 text-rose-400" />}
                  </button>
                </div>
              );
            })}
          </div>
          </div>
        </DetachablePanel>

        {/* Center: CSP-Rendered 3D Canvas (Detachable as 3D Viewer Only!) */}
        <DetachablePanel
          panelId="model3d_viewer"
          title="3Dモデル・パーツ編集ビューワー"
          subtitle={activeKn5Name}
          role="viewer3d"
          mode={viewerDetachMode}
          onModeChange={setViewerDetachMode}
          dockedClassName={`${
            treeDetachMode !== 'docked' && inspectorDetachMode !== 'docked'
              ? 'xl:col-span-12'
              : treeDetachMode !== 'docked'
                ? 'xl:col-span-8'
                : inspectorDetachMode !== 'docked'
                  ? 'xl:col-span-9'
                  : 'xl:col-span-5'
          } bg-[#090d14] border border-[#242e42] rounded-xl overflow-hidden min-h-[360px]`}
          defaultFloatingBounds={{ x: 40, y: 84, width: 680, height: 540 }}
          popoutSize={{ width: 880, height: 660 }}
        >
        <div className="relative w-full h-full flex-1">
          <div ref={mountRef} className="w-full h-full" />
          <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-[#0b0e14]/85 backdrop-blur border border-[#252e42] rounded-lg px-2.5 py-1 text-[11px] text-cyan-300">
            <Sun className="w-3.5 h-3.5 text-amber-400" />
            <select
              value={cspPreset}
              onChange={(e) => setCspPreset(e.target.value as CspLightingPreset)}
              className="bg-transparent text-cyan-300 focus:outline-none cursor-pointer"
            >
              <option value="csp_showroom" className="bg-[#0b0e14]">CSP Showroom (IBL)</option>
              <option value="csp_sunset" className="bg-[#0b0e14]">CSP Sunset Track</option>
              <option value="csp_studio_dark" className="bg-[#0b0e14]">CSP Dark Studio</option>
            </select>
          </div>
          <div className="absolute top-3 right-3 flex gap-1.5">
            <button
              onClick={() => setWireframe((w) => !w)}
              className={`px-2.5 py-1 rounded-lg border text-[11px] backdrop-blur ${
                wireframe
                  ? 'bg-cyan-500/25 border-cyan-500 text-cyan-200'
                  : 'bg-[#0b0e14]/80 border-[#252e42] text-slate-300'
              }`}
            >
              ワイヤー
            </button>
            <button
              onClick={rebuildTreeList}
              className="p-1.5 rounded-lg bg-[#0b0e14]/80 border border-[#252e42] text-slate-300 hover:text-white"
              title="ツリー更新"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
          {busy && (
            <div className="absolute inset-0 bg-black/55 flex items-center justify-center text-xs text-cyan-300 z-20">
              KN5 / パーツを処理中...
            </div>
          )}

          {/* Left-Click / Shift+Left-Click Selected Part Status HUD */}
          {selectedObj ? (
            <div className="absolute bottom-3 left-3 right-3 bg-[#0c111b]/92 backdrop-blur-md border border-[#2f3d59] rounded-xl p-2.5 shadow-2xl space-y-2 z-10">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                  <MousePointerClick className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="font-mono-num font-bold text-slate-100 truncate max-w-[180px]">
                    {selectedObj.name}
                  </span>
                  {selectedObjs.length > 1 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/25 text-emerald-200 border border-emerald-500/45">
                      +{selectedObjs.length - 1}件 (計{selectedObjs.length}パーツ複数選択中)
                    </span>
                  )}
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                    {PART_CATEGORY_LABELS[selectedDetectedCat]}
                  </span>
                  {suggestedParentGroup && selectedObjs.length === 1 && (
                    <button
                      onClick={() => setSelectedUuid(suggestedParentGroup.uuid)}
                      className="flex items-center gap-0.5 text-[10px] bg-amber-500/20 hover:bg-amber-500/35 text-amber-200 border border-amber-500/40 px-2 py-0.5 rounded transition-colors"
                      title="子メッシュではなくパーツ親グループ全体を選択"
                    >
                      <ArrowUpRight className="w-3 h-3" />
                      親パーツ ({suggestedParentGroup.name}) を選択
                    </button>
                  )}
                </div>

                {/* Ancestor breadcrumb mini-jump */}
                {selectedAncestors.length > 1 && selectedObjs.length === 1 && (
                  <div className="flex items-center gap-1 text-[10px] font-mono-num text-slate-400 overflow-x-auto max-w-full">
                    {selectedAncestors.slice(-3).map((anc, idx, arr) => (
                      <React.Fragment key={anc.uuid}>
                        <button
                          onClick={() => setSelectedUuid(anc.uuid)}
                          className={`hover:text-slate-100 truncate max-w-[90px] ${
                            idx === arr.length - 1 ? 'text-rose-300 font-semibold' : ''
                          }`}
                        >
                          {anc.name}
                        </button>
                        {idx < arr.length - 1 && <span>/</span>}
                      </React.Fragment>
                    ))}
                  </div>
                )}
              </div>

              {/* Multi-selected parts chips */}
              {selectedObjs.length > 1 && (
                <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-[#222c42]">
                  {selectedObjs.map((o) => (
                    <span
                      key={o.uuid}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/35 text-[10px] font-mono-num text-emerald-200"
                    >
                      <span className="truncate max-w-[120px]">{o.name}</span>
                      <button
                        type="button"
                        onClick={() => toggleSelectedUuid(o.uuid)}
                        className="text-emerald-300 hover:text-white"
                        title="このパーツを選択解除"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() => setSelectedUuids([])}
                    className="text-[10px] text-slate-400 hover:text-slate-200 underline ml-1"
                  >
                    すべて解除
                  </button>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="text-[10px] text-slate-400">
                  Shift+左クリック: 複数選択 / Ctrl+S: パーツ保存
                </span>
                <button
                  onClick={() => {
                    mutateSelected((o) => {
                      o.visible = !o.visible;
                      if (o.userData?.kn5MeshMeta) o.userData.kn5MeshMeta.isVisible = o.visible;
                    });
                  }}
                  className="bg-[#182132] hover:bg-[#24314a] text-slate-300 border border-[#2a3650] px-2 py-1 rounded-lg ml-auto"
                >
                  {selectedObj.visible ? '非表示' : '表示'}
                </button>
                <button
                  onClick={handleDeleteSelected}
                  className="bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 px-2 py-1 rounded-lg"
                  title="選択パーツを削除"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="absolute bottom-3 left-3 bg-[#0b0e14]/85 border border-[#252e42] rounded-lg px-2.5 py-1.5 text-[11px] text-slate-300 pointer-events-none flex items-center gap-1.5">
              <MousePointerClick className="w-3.5 h-3.5 text-cyan-400" />
              左クリックで選択 / Shift+左クリックで複数選択 / Ctrl+S でパーツ保存
            </div>
          )}
        </div>
        </DetachablePanel>

        {/* Right: KsEditor 4-Tab Inspector (Node / Parts Library / Material / Textures) */}
        <DetachablePanel
          panelId="model3d_inspector"
          title="3Dインスペクター & パーツ設定パネル"
          subtitle={selectedObj?.name || activeKn5Name}
          role="settings"
          mode={inspectorDetachMode}
          onModeChange={setInspectorDetachMode}
          dockedClassName={`${
            viewerDetachMode !== 'docked'
              ? treeDetachMode !== 'docked'
                ? 'xl:col-span-12'
                : 'xl:col-span-9'
              : 'xl:col-span-4'
          } bg-[#121722] border border-[#242e42] rounded-xl text-xs`}
          popoutSize={{ width: 520, height: 800 }}
        >
          {/* Inspector Tabs */}
          <div className="grid grid-cols-4 border-b border-[#222b3e] bg-[#0e131d] shrink-0 text-[11px]">
            <button
              onClick={() => setInspectorTab('node')}
              className={`py-2 flex items-center justify-center gap-1 font-medium border-b-2 transition-colors ${
                inspectorTab === 'node'
                  ? 'border-rose-500 text-rose-300 bg-rose-500/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sliders className="w-3 h-3" />
              ノード
            </button>
            <button
              onClick={() => setInspectorTab('parts')}
              className={`py-2 flex items-center justify-center gap-1 font-medium border-b-2 transition-colors ${
                inspectorTab === 'parts'
                  ? 'border-emerald-500 text-emerald-300 bg-emerald-500/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <PackageCheck className="w-3 h-3" />
              パーツ庫 ({savedParts.length})
            </button>
            <button
              onClick={() => setInspectorTab('material')}
              className={`py-2 flex items-center justify-center gap-1 font-medium border-b-2 transition-colors ${
                inspectorTab === 'material'
                  ? 'border-cyan-500 text-cyan-300 bg-cyan-500/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Palette className="w-3 h-3" />
              材質 ({sceneMaterials.length})
            </button>
            <button
              onClick={() => setInspectorTab('textures')}
              className={`py-2 flex items-center justify-center gap-1 font-medium border-b-2 transition-colors ${
                inspectorTab === 'textures'
                  ? 'border-amber-500 text-amber-300 bg-amber-500/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <ImageIcon className="w-3 h-3" />
              画像 ({embeddedTextures.length})
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
            {/* ===== TAB 1: NODE TRANSFORM & KN5 MESH FLAGS ===== */}
            {inspectorTab === 'node' && (
              <>
                {!selectedObj ? (
                  <div className="text-slate-500 text-center py-10">
                    左のシーングラフからノードを選択してください。
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <input
                        type="text"
                        value={selectedObj.name}
                        onChange={(e) => mutateSelected((o) => (o.name = e.target.value))}
                        className="flex-1 bg-[#0b0e14] border border-[#2b354b] rounded-lg px-2.5 py-1.5 font-mono-num text-slate-100"
                      />
                      <button
                        onClick={handleDuplicateSelected}
                        className="p-1.5 bg-[#1b2436] hover:bg-[#26324c] text-cyan-300 rounded-lg"
                        title="複製"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={handleDeleteSelected}
                        className="p-1.5 bg-rose-500/15 hover:bg-rose-500/30 text-rose-400 rounded-lg"
                        title="削除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Position */}
                    <div className="space-y-1.5">
                      <span className="text-slate-300 font-semibold">位置 Position (m)</span>
                      {(['x', 'y', 'z'] as const).map((axis) => (
                        <div key={axis} className="flex items-center gap-2">
                          <span className="w-4 uppercase font-mono-num text-slate-400">{axis}</span>
                          <input
                            type="range"
                            min={-4}
                            max={4}
                            step={0.01}
                            value={selectedObj.position[axis]}
                            onChange={(e) =>
                              mutateSelected((o) => (o.position[axis] = Number(e.target.value)))
                            }
                            className="flex-1 h-1.5"
                          />
                          <input
                            type="number"
                            step={0.02}
                            value={Number(selectedObj.position[axis].toFixed(3))}
                            onChange={(e) =>
                              mutateSelected((o) => (o.position[axis] = Number(e.target.value) || 0))
                            }
                            className="w-16 bg-[#0b0e14] border border-[#2b354b] rounded px-1.5 py-0.5 text-right font-mono-num"
                          />
                        </div>
                      ))}
                    </div>

                    {/* Rotation */}
                    <div className="space-y-1.5">
                      <span className="text-slate-300 font-semibold">回転 Rotation (deg)</span>
                      {(['x', 'y', 'z'] as const).map((axis) => {
                        const deg = THREE.MathUtils.radToDeg(selectedObj.rotation[axis]);
                        return (
                          <div key={axis} className="flex items-center gap-2">
                            <span className="w-4 uppercase font-mono-num text-slate-400">{axis}</span>
                            <input
                              type="range"
                              min={-180}
                              max={180}
                              step={1}
                              value={deg}
                              onChange={(e) =>
                                mutateSelected(
                                  (o) =>
                                    (o.rotation[axis] = THREE.MathUtils.degToRad(Number(e.target.value)))
                                )
                              }
                              className="flex-1 h-1.5 accent-cyan-400"
                            />
                            <input
                              type="number"
                              step={1}
                              value={Number(deg.toFixed(1))}
                              onChange={(e) =>
                                mutateSelected(
                                  (o) =>
                                    (o.rotation[axis] = THREE.MathUtils.degToRad(
                                      Number(e.target.value) || 0
                                    ))
                                )
                              }
                              className="w-16 bg-[#0b0e14] border border-[#2b354b] rounded px-1.5 py-0.5 text-right font-mono-num"
                            />
                          </div>
                        );
                      })}
                    </div>

                    {/* Scale */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-300 font-semibold">スケール Scale</span>
                        <label className="flex items-center gap-1 text-[11px] text-slate-400 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={uniformScale}
                            onChange={(e) => setUniformScale(e.target.checked)}
                            className="accent-amber-500"
                          />
                          均一
                        </label>
                      </div>
                      {(['x', 'y', 'z'] as const).map((axis) => (
                        <div key={axis} className="flex items-center gap-2">
                          <span className="w-4 uppercase font-mono-num text-slate-400">{axis}</span>
                          <input
                            type="range"
                            min={0.01}
                            max={3}
                            step={0.01}
                            value={selectedObj.scale[axis]}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              mutateSelected((o) => {
                                if (uniformScale) o.scale.set(v, v, v);
                                else o.scale[axis] = v;
                              });
                            }}
                            className="flex-1 h-1.5 accent-amber-400"
                          />
                          <input
                            type="number"
                            step={0.05}
                            value={Number(selectedObj.scale[axis].toFixed(3))}
                            onChange={(e) => {
                              const v = Number(e.target.value) || 1;
                              mutateSelected((o) => {
                                if (uniformScale) o.scale.set(v, v, v);
                                else o.scale[axis] = v;
                              });
                            }}
                            className="w-16 bg-[#0b0e14] border border-[#2b354b] rounded px-1.5 py-0.5 text-right font-mono-num"
                          />
                        </div>
                      ))}

                      <div className="flex gap-1.5 pt-1">
                        <button
                          onClick={() => mutateSelected((o) => o.scale.multiplyScalar(0.01))}
                          className="flex-1 bg-[#1b2436] hover:bg-[#26324c] text-[10px] py-1 rounded text-amber-300"
                        >
                          ×0.01 (cm→m)
                        </button>
                        <button
                          onClick={() => mutateSelected((o) => o.scale.set(1, 1, 1))}
                          className="flex-1 bg-[#1b2436] hover:bg-[#26324c] text-[10px] py-1 rounded text-slate-300"
                        >
                          1.0 リセット
                        </button>
                      </div>
                    </div>

                    {/* KsEditor Mesh Flags */}
                    {selectedMeshMeta && (
                      <div className="pt-2.5 border-t border-[#222b3e] space-y-2">
                        <span className="text-cyan-300 font-semibold block">
                          KsEditor メッシュオブジェクト設定
                        </span>
                        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                          {(
                            [
                              ['castShadows', 'CastShadows'],
                              ['isTransparent', 'IsTransparent'],
                              ['isRenderable', 'IsRenderable'],
                            ] as const
                          ).map(([flag, label]) => (
                            <label
                              key={flag}
                              className="flex items-center justify-between bg-[#0b0e14] border border-[#222b3e] rounded px-2 py-1.5 cursor-pointer"
                            >
                              <span className="text-slate-300">{label}</span>
                              <input
                                type="checkbox"
                                checked={selectedMeshMeta[flag]}
                                onChange={(e) =>
                                  mutateSelected((o) => {
                                    const meta: Kn5MeshUserMeta = {
                                      ...selectedMeshMeta,
                                      [flag]: e.target.checked,
                                    };
                                    o.userData.kn5MeshMeta = meta;
                                    if (flag === 'castShadows') o.castShadow = e.target.checked;
                                  })
                                }
                                className="accent-cyan-500"
                              />
                            </label>
                          ))}
                          <div className="flex items-center justify-between bg-[#0b0e14] border border-[#222b3e] rounded px-2 py-1">
                            <span className="text-slate-400">Layer</span>
                            <input
                              type="number"
                              value={selectedMeshMeta.layer}
                              onChange={(e) =>
                                mutateSelected((o) => {
                                  o.userData.kn5MeshMeta = {
                                    ...selectedMeshMeta,
                                    layer: Number(e.target.value) || 0,
                                  };
                                })
                              }
                              className="w-12 bg-[#121722] border border-[#2b354b] rounded px-1 text-right font-mono-num"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {/* ===== TAB 2: IN-APP PARTS LIBRARY (SAVE & SWAP) ===== */}
            {inspectorTab === 'parts' && (
              <div className="space-y-3">
                {/* Save Current Selected Part(s) CTA */}
                <div className="bg-[#0e131d] border border-emerald-500/30 rounded-lg p-2.5 space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-emerald-300">
                      選択中のパーツを保存 (Ctrl+S)
                    </span>
                    <span className="font-mono-num text-slate-400 truncate max-w-[140px]">
                      {selectedObjs.length > 1
                        ? `${selectedObjs.length} パーツ複数選択中`
                        : selectedObj
                          ? selectedObj.name
                          : '未選択'}
                    </span>
                  </div>
                  <button
                    onClick={openSavePartForm}
                    disabled={selectedObjs.length === 0}
                    className="w-full flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold py-1.5 rounded-lg text-xs"
                  >
                    <BookmarkPlus className="w-3.5 h-3.5" />
                    {selectedObjs.length > 1
                      ? `${selectedObjs.length}個のパーツをまとめて保存`
                      : '現在の選択パーツをパーツ庫に保存'}
                  </button>
                </div>

                {/* Swap Alignment Options */}
                <div className="bg-[#0b0e14] border border-[#222b3e] rounded-lg p-2.5 space-y-1.5">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    差し替えフィット設定
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                    <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                      <input
                        type="checkbox"
                        checked={optMatchPos}
                        onChange={(e) => setOptMatchPos(e.target.checked)}
                        className="accent-rose-500"
                      />
                      位置自動合わせ
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                      <input
                        type="checkbox"
                        checked={optMatchSize}
                        onChange={(e) => setOptMatchSize(e.target.checked)}
                        className="accent-rose-500"
                      />
                      サイズ自動調整
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                      <input
                        type="checkbox"
                        checked={optPreserveName}
                        onChange={(e) => setOptPreserveName(e.target.checked)}
                        className="accent-cyan-500"
                      />
                      ACノード名維持
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                      <input
                        type="checkbox"
                        checked={optFlipY180}
                        onChange={(e) => setOptFlipY180(e.target.checked)}
                        className="accent-amber-500"
                      />
                      向き反転 (Y180°)
                    </label>
                  </div>
                </div>

                {/* Category Filter */}
                <div className="flex flex-wrap gap-1">
                  <button
                    onClick={() => setPartFilterCat('all')}
                    className={`px-2 py-0.5 rounded text-[10px] border ${
                      partFilterCat === 'all'
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-200'
                        : 'bg-[#0b0e14] border-[#242e42] text-slate-400'
                    }`}
                  >
                    すべて ({savedParts.length})
                  </button>
                  {(['wheel', 'steering', 'seat', 'wing', 'exhaust', 'brake', 'body', 'other'] as PartCategory[]).map(
                    (cat) => {
                      const cnt = savedParts.filter((p) => p.category === cat).length;
                      if (cnt === 0 && partFilterCat !== cat) return null;
                      return (
                        <button
                          key={cat}
                          onClick={() => setPartFilterCat(cat)}
                          className={`px-2 py-0.5 rounded text-[10px] border ${
                            partFilterCat === cat
                              ? 'bg-emerald-500/20 border-emerald-500 text-emerald-200'
                              : 'bg-[#0b0e14] border-[#242e42] text-slate-400'
                          }`}
                        >
                          {PART_CATEGORY_LABELS[cat]} ({cnt})
                        </button>
                      );
                    }
                  )}
                </div>

                {/* Saved Parts Cards */}
                {filteredSavedParts.length === 0 ? (
                  <div className="text-center py-7 px-3 text-[11px] text-slate-500 border border-dashed border-[#242e42] rounded-xl leading-relaxed">
                    保存されたパーツはまだありません。<br />
                    3Dモデル上でホイール・ステアリング・シート等を左クリックし、下の「パーツをライブラリに保存」で登録すると、別車両にワンクリックで差し替えられます！
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredSavedParts.map((part) => (
                      <div
                        key={part.id}
                        className="bg-[#0e131d] border border-[#242e42] rounded-xl p-2.5 space-y-2"
                      >
                        <div className="flex gap-2.5 items-center">
                          <div className="w-14 h-10 rounded-lg bg-[#080b10] border border-[#222b3e] overflow-hidden shrink-0 flex items-center justify-center">
                            {part.thumbnailDataUrl ? (
                              <img
                                src={part.thumbnailDataUrl}
                                alt={part.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Box className="w-4 h-4 text-slate-600" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-slate-100 truncate text-xs" title={part.name}>
                              {part.name}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate font-mono-num">
                              {PART_CATEGORY_LABELS[part.category]} • 元: {part.sourceCarId}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono-num">
                              {(part.sizeBytes / 1024).toFixed(0)} KB • {part.bboxSize.map((n) => n.toFixed(2)).join('×')}m
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeleteSavedPart(part.id)}
                            className="p-1 text-slate-500 hover:text-rose-400 shrink-0"
                            title="ライブラリから削除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="flex flex-wrap gap-1.5 text-[11px]">
                          <button
                            onClick={() => handleReplaceSelectedWithPart(part)}
                            disabled={!selectedObj || busy}
                            className="flex-1 flex items-center justify-center gap-1 bg-rose-600/25 hover:bg-rose-600/40 disabled:opacity-40 text-rose-200 border border-rose-500/40 py-1 px-2 rounded-lg font-medium"
                          >
                            <Replace className="w-3 h-3" />
                            選択パーツと差し替え
                          </button>

                          {part.category === 'wheel' && (
                            <button
                              onClick={() => handleReplaceAllFourWheels(part)}
                              disabled={busy}
                              className="flex items-center justify-center gap-1 bg-cyan-600/25 hover:bg-cyan-600/40 disabled:opacity-40 text-cyan-200 border border-cyan-500/40 py-1 px-2 rounded-lg font-medium"
                              title="左右反転を含めて4輪 WHEEL_LF/RF/LR/RR すべて一括履き替え"
                            >
                              <Disc className="w-3 h-3" />
                              4輪一括装着
                            </button>
                          )}

                          <button
                            onClick={() => handleAppendPartToScene(part)}
                            disabled={busy}
                            className="bg-[#1b2436] hover:bg-[#26324c] text-slate-300 border border-[#2d3a54] py-1 px-2 rounded-lg"
                            title="削除せずシーンに追加"
                          >
                            + 追加
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ===== TAB 3: KSEDITOR MATERIAL INSPECTOR ===== */}
            {inspectorTab === 'material' && (
              <>
                <div>
                  <label className="text-slate-400 block mb-1">編集対象マテリアル (KsEditor)</label>
                  <select
                    value={activeThreeMaterial?.uuid ?? ''}
                    onChange={(e) => setSelectedMatUuid(e.target.value)}
                    className="w-full bg-[#0b0e14] border border-[#2b354b] rounded-lg px-2.5 py-1.5 font-mono-num text-slate-100"
                  >
                    {sceneMaterials.map((m) => (
                      <option key={m.uuid} value={m.uuid}>
                        {m.name || 'Unnamed'} — {(m.userData?.kn5Material as Kn5Material | undefined)?.shader ?? 'Three.js'}
                      </option>
                    ))}
                  </select>
                </div>

                {activeThreeMaterial && (
                  <>
                    {!activeKsMat ? (
                      <button
                        onClick={() => {
                          ensureKn5MaterialOn(activeThreeMaterial);
                          setInspectorTick((t) => t + 1);
                        }}
                        className="w-full bg-cyan-600/20 hover:bg-cyan-600/35 border border-cyan-500/30 text-cyan-200 py-2 rounded-lg font-medium"
                      >
                        KsEditor マテリアルへ変換して詳細編集する
                      </button>
                    ) : (
                      <>
                        {/* Shader & Flags */}
                        <div className="space-y-2 bg-[#0e131d] border border-[#222b3e] rounded-lg p-2.5">
                          <div>
                            <label className="text-[11px] text-slate-400 block mb-1">Shader</label>
                            <select
                              value={activeKsMat.shader}
                              onChange={(e) => mutateActiveKsMaterial((ks) => (ks.shader = e.target.value))}
                              className="w-full bg-[#0b0e14] border border-[#2b354b] rounded px-2 py-1 font-mono-num text-cyan-300"
                            >
                              {!KSEDITOR_SHADERS.includes(activeKsMat.shader as (typeof KSEDITOR_SHADERS)[number]) && (
                                <option value={activeKsMat.shader}>{activeKsMat.shader}</option>
                              )}
                              {KSEDITOR_SHADERS.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] text-slate-400 block mb-0.5">BlendMode</label>
                              <select
                                value={activeKsMat.blendMode}
                                onChange={(e) =>
                                  mutateActiveKsMaterial((ks) => (ks.blendMode = Number(e.target.value)))
                                }
                                className="w-full bg-[#0b0e14] border border-[#2b354b] rounded px-1.5 py-1 text-[11px]"
                              >
                                <option value={0}>Opaque (0)</option>
                                <option value={1}>AlphaBlend (1)</option>
                                <option value={2}>AlphaToCoverage (2)</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-[10px] text-slate-400 block mb-0.5">DepthMode</label>
                              <select
                                value={activeKsMat.depthMode}
                                onChange={(e) =>
                                  mutateActiveKsMaterial((ks) => (ks.depthMode = Number(e.target.value)))
                                }
                                className="w-full bg-[#0b0e14] border border-[#2b354b] rounded px-1.5 py-1 text-[11px]"
                              >
                                <option value={0}>DepthNormal (0)</option>
                                <option value={1}>DepthNoWrite (1)</option>
                                <option value={2}>DepthOff (2)</option>
                              </select>
                            </div>
                          </div>

                          <label className="flex items-center justify-between text-[11px] cursor-pointer pt-0.5">
                            <span className="text-slate-300">AlphaTested</span>
                            <input
                              type="checkbox"
                              checked={activeKsMat.alphaTested}
                              onChange={(e) =>
                                mutateActiveKsMaterial((ks) => (ks.alphaTested = e.target.checked))
                              }
                              className="accent-cyan-500"
                            />
                          </label>
                        </div>

                        {/* KsEditor Uniform Properties */}
                        <div className="space-y-2">
                          <span className="text-slate-300 font-semibold block">KsEditor シェーダーパラメータ</span>
                          {(
                            [
                              ['ksAmbient', 0, 1.5, 0.02],
                              ['ksDiffuse', 0, 1.5, 0.02],
                              ['ksSpecular', 0, 2.0, 0.02],
                              ['ksSpecularEXP', 1, 250, 1],
                              ['fresnelC', 0, 1.0, 0.01],
                              ['fresnelEXP', 0.5, 10.0, 0.1],
                              ['fresnelMaxLevel', 0, 1.0, 0.01],
                              ['sunSpecular', 0, 25, 0.5],
                            ] as Array<[string, number, number, number]>
                          ).map(([propName, min, max, step]) => {
                            const val = getKn5PropA(activeKsMat, propName, 0);
                            return (
                              <div key={propName} className="flex items-center gap-2">
                                <span className="w-28 text-[11px] font-mono-num text-slate-400 truncate">
                                  {propName}
                                </span>
                                <input
                                  type="range"
                                  min={min}
                                  max={max}
                                  step={step}
                                  value={Math.min(max, Math.max(min, val))}
                                  onChange={(e) =>
                                    mutateActiveKsMaterial((ks) => setKn5PropA(ks, propName, Number(e.target.value)))
                                  }
                                  className="flex-1 h-1.5 accent-cyan-400"
                                />
                                <input
                                  type="number"
                                  step={step}
                                  value={Number(val.toFixed(2))}
                                  onChange={(e) =>
                                    mutateActiveKsMaterial((ks) =>
                                      setKn5PropA(ks, propName, Number(e.target.value) || 0)
                                    )
                                  }
                                  className="w-14 bg-[#0b0e14] border border-[#2b354b] rounded px-1 py-0.5 text-right font-mono-num text-[11px]"
                                />
                              </div>
                            );
                          })}

                          {/* ksEmissive RGB */}
                          <div className="flex items-center justify-between bg-[#0b0e14] border border-[#222b3e] rounded px-2.5 py-1.5">
                            <span className="text-[11px] font-mono-num text-slate-400">ksEmissive (RGB)</span>
                            <div className="flex gap-1">
                              {[0, 1, 2].map((chIdx) => {
                                const em = getKn5Prop(activeKsMat, 'ksEmissive')?.valueC ?? [0, 0, 0];
                                return (
                                  <input
                                    key={chIdx}
                                    type="number"
                                    step={0.1}
                                    value={Number(em[chIdx].toFixed(2))}
                                    onChange={(e) => {
                                      const next: [number, number, number] = [...em] as [number, number, number];
                                      next[chIdx] = Number(e.target.value) || 0;
                                      mutateActiveKsMaterial((ks) => setKn5PropC(ks, 'ksEmissive', next));
                                    }}
                                    className="w-12 bg-[#121722] border border-[#2b354b] rounded px-1 py-0.5 text-right font-mono-num text-[10px]"
                                  />
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        {/* Texture Mappings (txDiffuse, txNormal, txMaps, txDetail...) */}
                        <div className="space-y-1.5 pt-2 border-t border-[#222b3e]">
                          <div className="flex items-center justify-between">
                            <span className="text-amber-300 font-semibold">テクスチャスロット割当</span>
                            <button
                              onClick={() =>
                                mutateActiveKsMaterial((ks) => {
                                  const used = new Set(ks.textureMappings.map((t) => t.name));
                                  const candidates = ['txDiffuse', 'txNormal', 'txMaps', 'txDetail', 'txDamage'];
                                  const nextName = candidates.find((c) => !used.has(c)) ?? `txSlot${ks.textureMappings.length}`;
                                  ks.textureMappings.push({
                                    name: nextName,
                                    slot: ks.textureMappings.length,
                                    texture: embeddedTextures[0]?.name ?? '',
                                  });
                                })
                              }
                              className="text-[10px] bg-[#1a2233] hover:bg-[#25314a] text-amber-300 px-2 py-0.5 rounded"
                            >
                              + スロット追加
                            </button>
                          </div>

                          {activeKsMat.textureMappings.map((tm, idx) => (
                            <div
                              key={`${tm.name}-${idx}`}
                              className="bg-[#0b0e14] border border-[#222b3e] rounded-lg p-2 space-y-1"
                            >
                              <div className="flex items-center justify-between text-[10px] font-mono-num">
                                <span className="text-cyan-300 font-semibold">
                                  [{tm.slot}] {tm.name}
                                </span>
                                <button
                                  onClick={() =>
                                    mutateActiveKsMaterial((ks) => {
                                      ks.textureMappings.splice(idx, 1);
                                    })
                                  }
                                  className="text-slate-500 hover:text-rose-400"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                              <select
                                value={tm.texture}
                                onChange={(e) =>
                                  mutateActiveKsMaterial((ks) => {
                                    ks.textureMappings[idx].texture = e.target.value;
                                  })
                                }
                                className="w-full bg-[#121722] border border-[#2b354b] rounded px-2 py-1 font-mono-num text-[11px] text-slate-200"
                              >
                                <option value={tm.texture}>{tm.texture || '(未割当)'}</option>
                                {embeddedTextures
                                  .filter((t) => t.name !== tm.texture)
                                  .map((t) => (
                                    <option key={t.name} value={t.name}>
                                      {t.name}
                                    </option>
                                  ))}
                              </select>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </>
                )}
              </>
            )}

            {/* ===== TAB 3: KSEDITOR EMBEDDED TEXTURES MANAGER ===== */}
            {inspectorTab === 'textures' && (
              <>
                <button
                  onClick={handleAddExternalTexture}
                  className="w-full flex items-center justify-center gap-1.5 bg-amber-600/20 hover:bg-amber-600/35 border border-amber-500/40 text-amber-200 py-2 rounded-lg font-semibold"
                >
                  <Upload className="w-3.5 h-3.5" />
                  外部テクスチャを追加 (.dds / .png / .jpg)
                </button>

                {embeddedTextures.length === 0 ? (
                  <div className="text-slate-500 text-center py-8">
                    埋め込みテクスチャはありません。KN5保存時に各マテリアル専用のDDSテクスチャが自動生成されます。
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {embeddedTextures.map((tex) => (
                      <div
                        key={tex.name}
                        className="bg-[#0b0e14] border border-[#222b3e] rounded-lg p-2 flex items-center gap-2.5"
                      >
                        <div className="w-10 h-10 rounded bg-[#141a27] border border-[#252e42] shrink-0 overflow-hidden flex items-center justify-center">
                          {texPreviews[tex.name] ? (
                            <img
                              src={texPreviews[tex.name]}
                              alt={tex.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <ImageIcon className="w-4 h-4 text-slate-600" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-mono-num text-[11px] text-slate-200 truncate" title={tex.name}>
                            {tex.name}
                          </div>
                          <div className="text-[10px] font-mono-num text-slate-500">
                            {tex.type === 0 ? '空スロット' : `${(tex.data.byteLength / 1024).toFixed(1)} KB`}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleReplaceTextureBytes(tex.name)}
                            className="p-1.5 bg-[#1a2233] hover:bg-[#26324c] text-cyan-300 rounded"
                            title="このテクスチャ画像を差し替え"
                          >
                            <Replace className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDeleteTexture(tex.name)}
                            className="p-1.5 bg-rose-500/15 hover:bg-rose-500/30 text-rose-400 rounded"
                            title="削除"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </DetachablePanel>
      </div>

      {/* Modal 1: Save Single or Multiple Selected Parts (Triggered by 「パーツの保存」 or Ctrl+S) */}
      {savePartDialogOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSavePartDialogOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-[#101622] border border-emerald-500/45 rounded-2xl shadow-2xl overflow-hidden text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 bg-[#0c111b] border-b border-[#222c42] flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-sm text-emerald-300">
                <BookmarkPlus className="w-4 h-4" />
                パーツをライブラリに保存 ({selectedObjs.length} パーツ)
              </div>
              <button
                type="button"
                onClick={() => setSavePartDialogOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-[#1a2234]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Selected Parts Preview List */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-slate-300">
                  保存対象の選択パーツ ({selectedObjs.length}件 — 複数選択は Shift+左クリック)
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto bg-[#090d14] border border-[#222c42] rounded-xl p-2.5">
                  {selectedObjs.map((o) => (
                    <span
                      key={o.uuid}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/35 font-mono-num text-[11px] text-emerald-200"
                    >
                      <span className="truncate max-w-[180px]">{o.name}</span>
                      {selectedObjs.length > 1 && (
                        <button
                          type="button"
                          onClick={() => toggleSelectedUuid(o.uuid)}
                          className="text-emerald-300 hover:text-white"
                          title="保存対象から除外"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="block">
                  <span className="text-[11px] text-slate-400 block mb-1">保存モデル名</span>
                  <input
                    type="text"
                    autoFocus
                    value={newPartName}
                    onChange={(e) => setNewPartName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleConfirmSavePart();
                      if (e.key === 'Escape') setSavePartDialogOpen(false);
                    }}
                    placeholder="例: TE37 18インチ / エアロセット / NARDI ステアリング"
                    className="w-full bg-[#080b10] border border-emerald-500/50 focus:border-emerald-400 rounded-xl px-3 py-2 text-slate-100 focus:outline-none"
                  />
                </label>

                <label className="block">
                  <span className="text-[11px] text-slate-400 block mb-1">カテゴリ</span>
                  <select
                    value={newPartCategory}
                    onChange={(e) => setNewPartCategory(e.target.value as PartCategory)}
                    className="w-full bg-[#080b10] border border-[#2b354b] rounded-xl px-3 py-2 text-slate-200"
                  >
                    {(Object.keys(PART_CATEGORY_LABELS) as PartCategory[]).map((cat) => (
                      <option key={cat} value={cat}>
                        {PART_CATEGORY_LABELS[cat]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-[#1e2739]">
                <span className="text-[10px] text-slate-400">
                  Enter または Ctrl+S で即保存できます
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSavePartDialogOpen(false)}
                    className="px-3.5 py-2 rounded-xl bg-[#1a2233] hover:bg-[#24304a] text-slate-300"
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleConfirmSavePart()}
                    disabled={busy || selectedObjs.length === 0}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {busy ? '保存中...' : 'ライブラリに保存'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Saved Models Picker for 「新規パーツ追加」 (append) & 「モデルの差し替え」 (replace) */}
      {savedPartPickerMode && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSavedPartPickerMode(null)}
        >
          <div
            className="w-full max-w-3xl max-h-[85vh] bg-[#101622] border border-[#2a3854] rounded-2xl shadow-2xl flex flex-col overflow-hidden text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 bg-[#0c111b] border-b border-[#222c42] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-bold text-sm text-white">
                {savedPartPickerMode === 'append' ? (
                  <>
                    <Plus className="w-4 h-4 text-cyan-400" />
                    新規パーツ追加 — 保存されたモデルから選択
                  </>
                ) : (
                  <>
                    <Replace className="w-4 h-4 text-amber-400" />
                    モデルの差し替え
                    {selectedObj && (
                      <span className="font-mono-num text-xs font-normal text-amber-300 ml-1">
                        (対象: {selectedObj.name})
                      </span>
                    )}
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSavedPartPickerMode(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-[#1a2234]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3 flex-1 overflow-y-auto">
              {/* Replace-mode Fit Options & External/Donor Whole-Model Replace Shortcuts */}
              {savedPartPickerMode === 'replace' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  <div className="bg-[#090d14] border border-[#222c42] rounded-xl p-3 space-y-1.5">
                    <div className="text-[10px] font-semibold text-amber-300 uppercase tracking-wider">
                      保存済みパーツ差し替えフィット設定
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                      <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                        <input
                          type="checkbox"
                          checked={optMatchPos}
                          onChange={(e) => setOptMatchPos(e.target.checked)}
                          className="accent-rose-500"
                        />
                        位置自動合わせ
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                        <input
                          type="checkbox"
                          checked={optMatchSize}
                          onChange={(e) => setOptMatchSize(e.target.checked)}
                          className="accent-rose-500"
                        />
                        サイズ自動調整
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                        <input
                          type="checkbox"
                          checked={optPreserveName}
                          onChange={(e) => setOptPreserveName(e.target.checked)}
                          className="accent-cyan-500"
                        />
                        ACノード名維持
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                        <input
                          type="checkbox"
                          checked={optFlipY180}
                          onChange={(e) => setOptFlipY180(e.target.checked)}
                          className="accent-amber-500"
                        />
                        向き反転 (Y180°)
                      </label>
                    </div>
                  </div>

                  <div className="bg-[#090d14] border border-[#222c42] rounded-xl p-3 space-y-2">
                    <div className="text-[10px] font-semibold text-cyan-300 uppercase tracking-wider">
                      ファイル / 他車両モデルと丸ごと差し替え
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setSavedPartPickerMode(null);
                          void handleImportExternal('replace');
                        }}
                        disabled={busy}
                        className="flex items-center gap-1.5 bg-amber-600/20 hover:bg-amber-600/35 text-amber-200 border border-amber-500/40 px-2.5 py-1.5 rounded-lg text-[11px]"
                      >
                        <FolderInput className="w-3.5 h-3.5" />
                        外部モデルファイル (.kn5/.fbx/.glb/.obj)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSavedPartPickerMode(null);
                          void handleDirectReplaceFromDonor();
                        }}
                        disabled={!donorCarId || !donorFileName || busy}
                        className="flex items-center gap-1.5 bg-cyan-600/20 hover:bg-cyan-600/35 disabled:opacity-40 text-cyan-200 border border-cyan-500/40 px-2.5 py-1.5 rounded-lg text-[11px]"
                        title="上部バーで移植元車両を選択すると有効になります"
                      >
                        <Replace className="w-3.5 h-3.5" />
                        選択中の他車両KN5へ丸ごと差替
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Search & Category Filters */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
                  <input
                    type="text"
                    value={pickerSearch}
                    onChange={(e) => setPickerSearch(e.target.value)}
                    placeholder="保存されたモデル名・抽出元車両で検索..."
                    className="w-full bg-[#080b10] border border-[#2b354b] rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-100"
                  />
                </div>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => setPartFilterCat('all')}
                    className={`px-2 py-1 rounded-md text-[10px] border ${
                      partFilterCat === 'all'
                        ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 font-semibold'
                        : 'bg-[#090d14] border-[#242e42] text-slate-400'
                    }`}
                  >
                    すべて ({savedParts.length})
                  </button>
                  {(['wheel', 'steering', 'seat', 'wing', 'exhaust', 'brake', 'body', 'other'] as PartCategory[]).map(
                    (cat) => {
                      const cnt = savedParts.filter((p) => p.category === cat).length;
                      if (cnt === 0 && partFilterCat !== cat) return null;
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setPartFilterCat(cat)}
                          className={`px-2 py-1 rounded-md text-[10px] border ${
                            partFilterCat === cat
                              ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 font-semibold'
                              : 'bg-[#090d14] border-[#242e42] text-slate-400'
                          }`}
                        >
                          {PART_CATEGORY_LABELS[cat]} ({cnt})
                        </button>
                      );
                    }
                  )}
                </div>
              </div>

              {/* Saved Models Grid */}
              {filteredPickerParts.length === 0 ? (
                <div className="text-center py-12 px-4 text-slate-400 border border-dashed border-[#242e42] rounded-xl leading-relaxed">
                  {savedParts.length === 0 ? (
                    <>
                      保存されたモデルがまだありません。
                      <br />
                      3Dモデル上でパーツを選択（複数選択は Shift+左クリック）し、
                      <strong className="text-emerald-300">「パーツの保存」または Ctrl+S</strong> でモデルを保存してから追加・差し替えを行えます。
                    </>
                  ) : (
                    '条件に一致する保存済みモデルが見つかりませんでした。'
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {filteredPickerParts.map((part) => (
                    <div
                      key={part.id}
                      className="bg-[#0c111b] border border-[#242e42] hover:border-slate-500/70 rounded-xl p-3 flex flex-col justify-between gap-2.5"
                    >
                      <div className="flex gap-3 items-center">
                        <div className="w-16 h-12 rounded-lg bg-[#070a10] border border-[#222b3e] overflow-hidden shrink-0 flex items-center justify-center">
                          {part.thumbnailDataUrl ? (
                            <img
                              src={part.thumbnailDataUrl}
                              alt={part.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Box className="w-5 h-5 text-slate-600" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-slate-100 truncate" title={part.name}>
                            {part.name}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate font-mono-num">
                            {PART_CATEGORY_LABELS[part.category]} • 元: {part.sourceCarId}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono-num">
                            {(part.sizeBytes / 1024).toFixed(0)} KB •{' '}
                            {part.bboxSize.map((n) => n.toFixed(2)).join('×')}m
                          </div>
                        </div>
                      </div>

                      {savedPartPickerMode === 'append' ? (
                        <button
                          type="button"
                          onClick={() => void handleAppendPartToScene(part)}
                          disabled={busy}
                          className="w-full flex items-center justify-center gap-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white font-semibold py-1.5 rounded-lg"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          この保存モデルを新規パーツとして追加
                        </button>
                      ) : (
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => void handleReplaceSelectedWithPart(part)}
                            disabled={!selectedObj || busy}
                            className="flex-1 flex items-center justify-center gap-1 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white font-semibold py-1.5 px-2 rounded-lg"
                          >
                            <Replace className="w-3.5 h-3.5" />
                            選択パーツと差し替え
                          </button>
                          {part.category === 'wheel' && (
                            <button
                              type="button"
                              onClick={() => void handleReplaceAllFourWheels(part)}
                              disabled={busy}
                              className="flex items-center justify-center gap-1 bg-cyan-600/25 hover:bg-cyan-600/40 text-cyan-200 border border-cyan-500/40 py-1.5 px-2.5 rounded-lg font-semibold"
                              title="WHEEL_LF / RF / LR / RR の4輪すべてを一括交換"
                            >
                              <Disc className="w-3.5 h-3.5" />
                              4輪交換
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
