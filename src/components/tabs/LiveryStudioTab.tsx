import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  ArrowDown,
  ArrowUp,
  Brush,
  Camera,
  Check,
  Copy,
  Crosshair,
  Eraser,
  Eye,
  EyeOff,
  FlipHorizontal2,
  FlipVertical2,
  Grid,
  ImagePlus,
  Layers,
  Lock,
  MousePointerClick,
  Paintbrush,
  Palette,
  Redo2,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Sliders,
  Sparkles,
  Sun,
  Trash2,
  Type,
  Undo2,
  Unlock,
  Wand2,
} from 'lucide-react';
import type { CarSkinSummary, CarSummary } from '../../types/ac';
import { getIniNumber } from '../../utils/iniHelpers';
import {
  buildProceduralCarGroup,
  kn5ToThreeGroup,
  parseKn5,
  type Kn5Material,
  type Kn5Texture,
} from '../../utils/kn5Codec';
import {
  buildCspTextureCache,
  createCspEnvironmentMap,
  decodeDdsToRgba,
  type CspLightingPreset,
} from '../../utils/cspRenderer';
import {
  CARBON_TILE_CYCLES,
  DEFAULT_SKIN_EXPORT_RESOLUTION,
  DEFAULT_TEXTURE_ADJUSTMENTS,
  PAINT_MATERIAL_PRESETS,
  applyPaintMaterialToThree,
  buildCarbonDiffuseRgbaWithDetailMask,
  buildDecalProjection3D,
  buildMultiMaterialSkinExtConfigIni,
  buildSurfacePatternDdsFiles,
  composeLiveryCanvas,
  encodeRgbaToDds,
  estimateOptimalUvDetailScale,
  extractMeshUvTriangles,
  mirrorDecalProjectionAcrossX,
  releaseLiveryScratchBuffers,
  renderLiveryBadgePngBytes,
  resolveActiveSurfacePattern,
  type DecalKind,
  type DecalProjection3D,
  type DecalProjectionMode,
  type LiveryLayer,
  type PaintMaterialPreset,
  type PaintMaterialState,
  type SkinExportResolution,
  type SurfacePatternType,
  type TextureAdjustmentParams,
} from '../../utils/liveryEngine';
import {
  OEM_COLOR_FAMILIES,
  OEM_MANUFACTURERS,
  OEM_PAINT_COLORS,
  type OemColorFamilyId,
  type OemManufacturerMeta,
  type OemPaintEntry,
} from '../../data/oem_paints/oemPaintCatalog';
import { DetachablePanel, type DetachMode } from '../common/DetachablePanel';
import { clearThreeGroup, disposeThreeObject } from '../../utils/threeCleanup';
import { HistoryStack, type UndoRedoHandler } from '../../utils/undoRedo';

interface LiveryStudioTabProps {
  carsDir: string;
  carId: string;
  cars?: CarSummary[];
  files: Record<string, string>;
  defaultSkinResolution?: SkinExportResolution;
  onToast: (text: string, type?: 'success' | 'error' | 'info') => void;
  onRegisterUndoRedo?: (handler: UndoRedoHandler | null) => void;
}

interface LiverySlotSnapshot {
  paintState: PaintMaterialState;
  textureAdjust: TextureAdjustmentParams;
  layers: LiveryLayer[];
  modified: boolean;
  selectedLayerId: string | null;
  directPaintImage?: ImageData;
  baseOriginalCanvas?: HTMLCanvasElement | null;
}

interface LiveryUndoEntry {
  slotUuid: string;
  before: LiverySlotSnapshot;
  after: LiverySlotSnapshot;
}

function cloneLiveryLayers(arr: LiveryLayer[]): LiveryLayer[] {
  return arr.map((l) => ({
    ...l,
    ...(l.projection3d
      ? {
          projection3d: {
            ...l.projection3d,
            origin: [...l.projection3d.origin] as [number, number, number],
            forward: [...l.projection3d.forward] as [number, number, number],
            right: [...l.projection3d.right] as [number, number, number],
            up: [...l.projection3d.up] as [number, number, number],
          },
        }
      : {}),
  }));
}

type StudioTool = 'orbit' | 'pick_apply' | 'decal' | 'paint';
type StudioSideTab = 'presets' | 'texture_edit' | 'decals' | 'brush' | 'export';
type PresetSubTab = 'oem_body' | 'exterior_carbon' | 'interior' | 'plastic_metal';
type PartPasteScope = 'whole_material' | 'mesh_uv_region';
type MaterialGroupFilter = 'all' | 'exterior' | 'interior' | 'plastic_metal' | 'wheel_other';
type BrushKind = 'round' | 'airbrush' | 'spray' | 'eraser';

interface TargetMaterialOption {
  uuid: string;
  name: string;
  diffuseTexName: string;
  detailTexName?: string;
  detailNmTexName?: string;
  category: Exclude<MaterialGroupFilter, 'all'>;
  material: THREE.MeshPhysicalMaterial;
  meshes: THREE.Mesh[];
  originalMap: THREE.Texture | null;
  originalColorHex: string;
  originalPbr: {
    metalness: number;
    roughness: number;
    clearcoat: number;
    clearcoatRoughness: number;
    envMapIntensity: number;
    reflectivity: number;
  };
}

function restoreOriginalThreeMaterial(matOpt: TargetMaterialOption) {
  const mat = matOpt.material;
  mat.map = matOpt.originalMap;
  mat.color.set(matOpt.originalColorHex || '#ffffff');
  mat.metalness = matOpt.originalPbr.metalness;
  mat.roughness = matOpt.originalPbr.roughness;
  mat.clearcoat = matOpt.originalPbr.clearcoat;
  mat.clearcoatRoughness = matOpt.originalPbr.clearcoatRoughness;
  mat.envMapIntensity = matOpt.originalPbr.envMapIntensity;
  mat.reflectivity = matOpt.originalPbr.reflectivity;
  mat.iridescence = 0;
  if (mat.userData?.__carbonUniforms) {
    mat.userData.__carbonUniforms.uCarbonEnabled.value = 0;
  }
  const origMaps = mat.userData?.__origPbrMaps as
    | {
        normalMap: THREE.Texture | null;
        normalScale: THREE.Vector2;
        roughnessMap: THREE.Texture | null;
        metalnessMap: THREE.Texture | null;
      }
    | undefined;
  if (origMaps) {
    mat.normalMap = origMaps.normalMap;
    mat.normalScale.copy(origMaps.normalScale);
    mat.roughnessMap = origMaps.roughnessMap;
    mat.metalnessMap = origMaps.metalnessMap;
  }
  mat.needsUpdate = true;
}

interface TextureSlotRuntime {
  uuid: string;
  materialName: string;
  diffuseTexName: string;
  paintState: PaintMaterialState;
  textureAdjust: TextureAdjustmentParams;
  layers: LiveryLayer[];
  compositeCanvas: HTMLCanvasElement;
  directPaintCanvas: HTMLCanvasElement;
  baseOriginalCanvas: HTMLCanvasElement | null;
  liveCanvasTex: THREE.CanvasTexture;
  undoStack: ImageData[];
  modified: boolean;
  originalLoaded: boolean;
}

const DEFAULT_LIVE_PREVIEW_SIZE = 2048;
const BRUSH_TEMP_COLOR = new THREE.Color();

function getLivePreviewCanvasSize(exportRes: SkinExportResolution): number {
  // Keep interactive 3D editing crisp & 60fps responsive (<= 2048px) while exporting at exact native 4K/8K!
  return exportRes <= 1024 ? 1024 : DEFAULT_LIVE_PREVIEW_SIZE;
}

const POPULAR_SWATCHES = [
  '#d90429', // Racing Red
  '#003399', // Bayside Blue
  '#2e1a36', // Midnight Purple
  '#f4f5f0', // Championship White
  '#eab308', // Racing Yellow
  '#004225', // British Racing Green
  '#f97316', // Papaya Orange
  '#1a1c20', // Moulded Black
  '#6a4326', // Cognac Tan Leather
  '#b59878', // Racing Bronze
];

const SURFACE_PATTERN_OPTIONS: Array<{ id: SurfacePatternType; label: string }> = [
  { id: 'none', label: 'なし (平滑ペイント / 標準)' },
  { id: 'carbon_twill', label: '3K 2×2 綾織カーボン (細目・CSP txDetail)' },
  { id: 'carbon_forged', label: 'フォージド・チョップドカーボン' },
  { id: 'alcantara', label: 'アルカンターラ / スエード起毛マイクロファイバー' },
  { id: 'leather_nappa', label: '本革ナッパレザー (天然シボ)' },
  { id: 'leather_synthetic', label: '合皮 / ビニールレザー (均一エンボスシボ)' },
  { id: 'plastic_moulded', label: '成形色樹脂・PP/ABS微細シボ (VDI-27)' },
  { id: 'brushed_metal', label: 'ヘアライン・ブラッシュド金属' },
  { id: 'fabric_racing', label: 'レーシングシート・ファブリックメッシュ' },
];

function classifyCarMaterial(name: string, texName: string): Exclude<MaterialGroupFilter, 'all'> {
  const s = `${name} ${texName}`.toLowerCase();
  if (
    /(int_|interior|cockpit|seat|steer|alcantara|leather|dash|console|belt|carpet|fabric|cloth|stitch|gauge|dial|door_panel|cabin)/.test(
      s
    )
  ) {
    return 'interior';
  }
  if (
    /(plastic|trim|rubber|grill|grille|wiper|mirror_base|mould|mold|black_ext|splitter|diffuser|carbon|exhaust|metal|chrome|alu|engine|bay|chassis_black)/.test(
      s
    )
  ) {
    return 'plastic_metal';
  }
  if (/(rim|wheel|tyre|tire|caliper|brake|disc|glass|window|windscreen|light|lens|badge|logo|plate)/.test(s)) {
    return 'wheel_other';
  }
  return 'exterior';
}

function guessBestBodyMaterial(options: TargetMaterialOption[]): TargetMaterialOption | null {
  if (options.length === 0) return null;
  const score = (opt: TargetMaterialOption) => {
    const s = `${opt.name} ${opt.diffuseTexName}`.toLowerCase();
    let pts = 0;
    if (/(body|paint|carpaint|skin|ext_body|chassis|livery)/.test(s)) pts += 120;
    if (opt.category === 'exterior') pts += 45;
    if (/(glass|windscreen|tyre|tire|rim|wheel|interior|cockpit|brake|light|shadow|plate|logo)/.test(s)) {
      pts -= 90;
    }
    const verts = opt.meshes.reduce(
      (acc, m) => acc + (m.geometry.getAttribute('position')?.count ?? 0),
      0
    );
    return pts + Math.min(45, verts / 1000);
  };
  return [...options].sort((a, b) => score(b) - score(a))[0];
}

function kn5DdsTextureToCanvasSync(tex: Kn5Texture): HTMLCanvasElement | null {
  if (!tex || tex.type === 0 || tex.data.byteLength < 16) return null;
  if (tex.data[0] !== 0x44 || tex.data[1] !== 0x44 || tex.data[2] !== 0x53 || tex.data[3] !== 0x20) {
    return null;
  }
  const dec = decodeDdsToRgba(tex.data);
  if (!dec) return null;
  const c = document.createElement('canvas');
  c.width = dec.width;
  c.height = dec.height;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const imgData = ctx.createImageData(dec.width, dec.height);
  imgData.data.set(dec.data);
  ctx.putImageData(imgData, 0, 0);
  return c;
}

function kn5TextureToCanvas(tex: Kn5Texture): Promise<HTMLCanvasElement | null> {
  return new Promise((resolve) => {
    if (!tex || tex.type === 0 || tex.data.byteLength < 16) return resolve(null);

    const syncDds = kn5DdsTextureToCanvasSync(tex);
    if (syncDds) return resolve(syncDds);

    const isPng = tex.data[0] === 0x89 && tex.data[1] === 0x50;
    const isJpg = tex.data[0] === 0xff && tex.data[1] === 0xd8;
    if (isPng || isJpg) {
      const copy = new Uint8Array(tex.data.byteLength);
      copy.set(tex.data);
      const blob = new Blob([copy.buffer], { type: isPng ? 'image/png' : 'image/jpeg' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext('2d')?.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        resolve(c);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
      return;
    }

    resolve(null);
  });
}

function makeDefaultPaintState(isPrimaryBody: boolean): PaintMaterialState {
  if (isPrimaryBody) {
    return {
      presetId: 'candy',
      baseColor: '#d90429',
      secondaryColor: '#ff758f',
      useGradient: false,
      gradientAngleDeg: 45,
      baseTextureBlend: 0.45,
      ...PAINT_MATERIAL_PRESETS[0].params,
    };
  }
  return {
    presetId: 'gloss_solid',
    baseColor: '#ffffff',
    secondaryColor: '#e2e8f0',
    useGradient: false,
    gradientAngleDeg: 45,
    baseTextureBlend: 0.55,
    metalness: 0.15,
    roughness: 0.35,
    clearcoat: 0.5,
    clearcoatRoughness: 0.15,
    fresnelMax: 0.65,
    iridescence: 0,
    flakeIntensity: 0,
    envIntensity: 1.0,
    carbonPattern: false,
    carbonWeaveScale: 60,
    surfacePattern: 'none',
    normalStrength: 0.65,
  };
}

export const LiveryStudioTab: React.FC<LiveryStudioTabProps> = ({
  carsDir,
  carId,
  cars = [],
  files,
  defaultSkinResolution = DEFAULT_SKIN_EXPORT_RESOLUTION,
  onToast,
  onRegisterUndoRedo,
}) => {
  const defaultSkinResRef = useRef<SkinExportResolution>(defaultSkinResolution);
  const prevDefaultSkinResRef = useRef<SkinExportResolution>(defaultSkinResolution);
  defaultSkinResRef.current = defaultSkinResolution;
  const mountRef = useRef<HTMLDivElement | null>(null);
  const uvPreviewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const envTexRef = useRef<THREE.Texture | null>(null);
  const carRootRef = useRef<THREE.Group | null>(null);
  const decalGizmoRef = useRef<THREE.Group | null>(null);
  // Tracks which material UUID currently owns React paintState/textureAdjust/layers so slot switching NEVER cross-contaminates!
  const syncedSlotUuidRef = useRef<string | null>(null);
  // Persistent 3D Click-Apply paste stamp (preserved across consecutive 3D clicks on different parts/materials)
  const activePasteStampRef = useRef<{
    label: string;
    paintState: PaintMaterialState;
  }>({
    label: 'キャンディ塗装',
    paintState: makeDefaultPaintState(true),
  });
  const [activePasteStampMeta, setActivePasteStampMeta] = useState<{ label: string; color: string }>({
    label: 'キャンディ塗装',
    color: '#d90429',
  });
  // GT7-style 3D Decal Projection controls
  const [decalProjMode, setDecalProjMode] = useState<DecalProjectionMode>('camera');
  const [decalAspectLock, setDecalAspectLock] = useState<boolean>(true);
  const decalProjModeRef = useRef<DecalProjectionMode>(decalProjMode);
  decalProjModeRef.current = decalProjMode;

  // Per-Material / Per-Texture runtime slots map
  const slotsMapRef = useRef<Map<string, TextureSlotRuntime>>(new Map());
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const kn5TexturesRef = useRef<Kn5Texture[]>([]);
  const filesRef = useRef(files);
  filesRef.current = files;
  const liveryHistoryRef = useRef(
    new HistoryStack<LiveryUndoEntry>({ maxEntries: 36, coalesceMs: 450 })
  );
  const [historyTick, setHistoryTick] = useState(0);
  const historyOpsRef = useRef<{
    capture: (
      slot: TextureSlotRuntime,
      opts?: { includeBitmap?: boolean; includeBaseCanvas?: boolean; selectedLayerOverride?: string | null }
    ) => LiverySlotSnapshot;
    push: (
      slotUuid: string,
      before: LiverySlotSnapshot,
      after: LiverySlotSnapshot,
      label: string,
      coalesceKey?: string
    ) => void;
  } | null>(null);

  // Studio UI states
  const [tool, setTool] = useState<StudioTool>('orbit');
  const [sideTab, setSideTab] = useState<StudioSideTab>('presets');
  const [presetSubTab, setPresetSubTab] = useState<PresetSubTab>('oem_body');
  const [cspPreset, setCspPreset] = useState<CspLightingPreset>('csp_showroom');
  const [showUvMiniMap, setShowUvMiniMap] = useState(true);
  const [loadingCar, setLoadingCar] = useState(false);
  const [viewerDetachMode, setViewerDetachMode] = useState<DetachMode>('docked');
  const [panelDetachMode, setPanelDetachMode] = useState<DetachMode>('docked');

  // Manufacturer OEM Paint Selector state
  const [selectedBrandId, setSelectedBrandId] = useState<string>('nissan');
  const [selectedColorFamily, setSelectedColorFamily] = useState<OemColorFamilyId>('ALL');
  const [oemSearchQuery, setOemSearchQuery] = useState<string>('');

  // Model-Conforming Material Application Settings
  const [partPasteScope, setPartPasteScope] = useState<PartPasteScope>('whole_material');
  const [autoCalibrateUvScale, setAutoCalibrateUvScale] = useState<boolean>(true);
  const [quickApplyOn3dClick, setQuickApplyOn3dClick] = useState<boolean>(true);
  const [hoveredPartLabel, setHoveredPartLabel] = useState<string | null>(null);

  // Material & Texture Browser Filter
  const [materialOptions, setMaterialOptions] = useState<TargetMaterialOption[]>([]);
  const [selectedMatUuid, setSelectedMatUuid] = useState<string>('');
  const [matGroupFilter, setMatGroupFilter] = useState<MaterialGroupFilter>('all');
  const [matSearchQuery, setMatSearchQuery] = useState<string>('');
  const [modifiedMatUuids, setModifiedMatUuids] = useState<string[]>([]);

  // Active Material's React State (synchronized with slotsMapRef.current.get(selectedMatUuid))
  const [paintState, setPaintState] = useState<PaintMaterialState>(() => makeDefaultPaintState(true));
  const [textureAdjust, setTextureAdjust] = useState<TextureAdjustmentParams>(() => ({
    ...DEFAULT_TEXTURE_ADJUSTMENTS,
    exportResolution: defaultSkinResolution,
  }));
  const [layers, setLayers] = useState<LiveryLayer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);

  // 3D Direct Paint Brush settings
  const [brushKind, setBrushKind] = useState<BrushKind>('airbrush');
  const [brushColor, setBrushColor] = useState('#ffffff');
  const [brushSize, setBrushSize] = useState(28);
  const [brushOpacity, setBrushOpacity] = useState(0.85);
  const [brushMirrorU, setBrushMirrorU] = useState(false);
  const [paintVersion, setPaintVersion] = useState(0);

  // Skin Export Metadata & Existing Skins
  const [existingSkins, setExistingSkins] = useState<CarSkinSummary[]>([]);
  const [skinFolderId, setSkinFolderId] = useState('custom_livery_01');
  const [skinName, setSkinName] = useState('Custom Studio Livery');
  const [driverName, setDriverName] = useState('');
  const [teamName, setTeamName] = useState('AC Car Studio Racing');
  const [carNumber, setCarNumber] = useState('07');
  const [country, setCountry] = useState('Japan');
  const [exportTexName, setExportTexName] = useState('skin_body.dds');
  const [savingSkin, setSavingSkin] = useState(false);

  const activeTargetMat = useMemo(
    () => materialOptions.find((m) => m.uuid === selectedMatUuid) ?? materialOptions[0] ?? null,
    [materialOptions, selectedMatUuid]
  );

  const selectedLayer = useMemo(
    () => layers.find((l) => l.id === selectedLayerId) ?? null,
    [layers, selectedLayerId]
  );

  // Match real manufacturer badge images from installed AC cars if available
  const brandBadgeUrlMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const mfg of OEM_MANUFACTURERS) {
      for (const car of cars) {
        if (!car.badgeDataUrl) continue;
        const hay = `${car.id} ${car.name} ${car.brand}`.toLowerCase();
        if (mfg.matchKeywords.some((kw) => hay.includes(kw))) {
          map.set(mfg.id, car.badgeDataUrl);
          break;
        }
      }
    }
    return map;
  }, [cars]);

  const activeManufacturer: OemManufacturerMeta = useMemo(
    () => OEM_MANUFACTURERS.find((m) => m.id === selectedBrandId) ?? OEM_MANUFACTURERS[0],
    [selectedBrandId]
  );

  const filteredOemColors = useMemo(() => {
    const q = oemSearchQuery.trim().toLowerCase();
    return OEM_PAINT_COLORS.filter((c) => {
      if (c.manufacturerId !== selectedBrandId) return false;
      if (selectedColorFamily !== 'ALL' && c.family !== selectedColorFamily) return false;
      if (q) {
        const hay = `${c.code} ${c.nameJp} ${c.nameEn} ${c.modelHint ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [selectedBrandId, selectedColorFamily, oemSearchQuery]);

  const filteredMaterialOptions = useMemo(() => {
    const q = matSearchQuery.trim().toLowerCase();
    return materialOptions.filter((opt) => {
      if (matGroupFilter !== 'all' && opt.category !== matGroupFilter) return false;
      if (q) {
        const hay = `${opt.name} ${opt.diffuseTexName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [materialOptions, matGroupFilter, matSearchQuery]);

  const markSlotModified = useCallback((uuid: string, isMod = true) => {
    const slot = slotsMapRef.current.get(uuid);
    if (slot) {
      slot.modified = isMod;
    }
    setModifiedMatUuids(
      Array.from(slotsMapRef.current.values())
        .filter((s) => s.modified)
        .map((s) => s.uuid)
    );
  }, []);

  // Get or create the independent runtime slot for a material UUID
  const getOrCreateSlot = useCallback(
    (matOpt: TargetMaterialOption, isPrimaryBody = false): TextureSlotRuntime => {
      const existing = slotsMapRef.current.get(matOpt.uuid);
      if (existing) return existing;

      const defaultExportRes = defaultSkinResRef.current;
      const liveSize = getLivePreviewCanvasSize(defaultExportRes);

      const comp = document.createElement('canvas');
      comp.width = liveSize;
      comp.height = liveSize;

      const dir = document.createElement('canvas');
      dir.width = liveSize;
      dir.height = liveSize;

      const tex = new THREE.CanvasTexture(comp);
      tex.flipY = false; // DirectX / KN5 UV space
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;

      const initPaint = makeDefaultPaintState(isPrimaryBody);
      if (!isPrimaryBody) {
        initPaint.baseColor = matOpt.originalColorHex || '#2a303c';
        initPaint.metalness = matOpt.originalPbr.metalness;
        initPaint.roughness = matOpt.originalPbr.roughness;
        initPaint.clearcoat = matOpt.originalPbr.clearcoat;
        initPaint.clearcoatRoughness = matOpt.originalPbr.clearcoatRoughness;
        initPaint.envIntensity = matOpt.originalPbr.envMapIntensity;
        initPaint.fresnelMax = matOpt.originalPbr.reflectivity;
      }
      const initAdjust: TextureAdjustmentParams = {
        ...DEFAULT_TEXTURE_ADJUSTMENTS,
        exportResolution: defaultExportRes,
        baseMode: isPrimaryBody ? 'paint_or_preset' : 'original_adjust',
      };

      const kn5Tex = kn5TexturesRef.current.find(
        (t) => t.name.toLowerCase() === matOpt.diffuseTexName.toLowerCase()
      );
      // Decode DDS synchronously so untouched slots NEVER flash white before base texture arrives
      const syncOriginal = kn5Tex ? kn5DdsTextureToCanvasSync(kn5Tex) : null;

      const slot: TextureSlotRuntime = {
        uuid: matOpt.uuid,
        materialName: matOpt.name,
        diffuseTexName: matOpt.diffuseTexName,
        paintState: initPaint,
        textureAdjust: initAdjust,
        layers: [],
        compositeCanvas: comp,
        directPaintCanvas: dir,
        baseOriginalCanvas: syncOriginal,
        liveCanvasTex: tex,
        undoStack: [],
        modified: isPrimaryBody,
        originalLoaded: Boolean(syncOriginal) || !kn5Tex,
      };

      slotsMapRef.current.set(matOpt.uuid, slot);

      // Asynchronously decode non-DDS (PNG/JPG) original KN5 texture into slot.baseOriginalCanvas
      if (kn5Tex && !syncOriginal) {
        kn5TextureToCanvas(kn5Tex).then((c) => {
          slot.baseOriginalCanvas = c;
          slot.originalLoaded = true;
          if (slot.modified) {
            composeLiveryCanvas(
              slot.compositeCanvas,
              slot.paintState,
              slot.baseOriginalCanvas,
              slot.layers,
              imageCacheRef.current,
              slot.directPaintCanvas,
              slot.textureAdjust,
              matOpt.meshes,
              matOpt.originalColorHex
            );
            slot.liveCanvasTex.needsUpdate = true;
          }
        });
      }

      return slot;
    },
    []
  );

  // Pure slot renderer: composites directly from `slot`'s own authoritative state (zero cross-slot React bleed!)
  const recompositeSlotDirect = useCallback(
    (matOpt: TargetMaterialOption, slot: TextureSlotRuntime) => {
      const exportRes = slot.textureAdjust.exportResolution || defaultSkinResRef.current;
      const targetRes = getLivePreviewCanvasSize(exportRes);
      if (slot.compositeCanvas.width !== targetRes) {
        slot.compositeCanvas.width = targetRes;
        slot.compositeCanvas.height = targetRes;
        const oldPaint = document.createElement('canvas');
        oldPaint.width = slot.directPaintCanvas.width;
        oldPaint.height = slot.directPaintCanvas.height;
        oldPaint.getContext('2d')?.drawImage(slot.directPaintCanvas, 0, 0);
        slot.directPaintCanvas.width = targetRes;
        slot.directPaintCanvas.height = targetRes;
        slot.directPaintCanvas
          .getContext('2d')
          ?.drawImage(oldPaint, 0, 0, targetRes, targetRes);
        oldPaint.width = 0;
        oldPaint.height = 0;
      }

      composeLiveryCanvas(
        slot.compositeCanvas,
        slot.paintState,
        slot.baseOriginalCanvas,
        slot.layers,
        imageCacheRef.current,
        slot.directPaintCanvas,
        slot.textureAdjust,
        matOpt.meshes,
        matOpt.originalColorHex
      );

      slot.liveCanvasTex.needsUpdate = true;

      if (slot.modified) {
        matOpt.material.map = slot.liveCanvasTex;
        applyPaintMaterialToThree(matOpt.material, slot.paintState);
      } else {
        // NEVER overwrite untouched KN5 material color/PBR with #ffffff!
        restoreOriginalThreeMaterial(matOpt);
      }
    },
    []
  );

  // Select a material option and load its independent state into the editor controls
  const selectMaterialSlot = useCallback(
    (matOpt: TargetMaterialOption) => {
      const slot = getOrCreateSlot(matOpt, false);
      syncedSlotUuidRef.current = matOpt.uuid;
      paintStateRef.current = { ...slot.paintState };
      textureAdjustRef.current = { ...slot.textureAdjust };
      layersRef.current = cloneLiveryLayers(slot.layers);
      setSelectedMatUuid(matOpt.uuid);
      setExportTexName(matOpt.diffuseTexName);
      setPaintState({ ...slot.paintState });
      setTextureAdjust({ ...slot.textureAdjust });
      setLayers(cloneLiveryLayers(slot.layers));
      setSelectedLayerId(slot.layers[slot.layers.length - 1]?.id ?? null);
    },
    [getOrCreateSlot]
  );

  // Sync active React state back into the active material's slot & recomposite (strictly guarded by syncedSlotUuidRef!)
  const recompositeNow = useCallback(() => {
    if (!activeTargetMat) return;
    const slot = getOrCreateSlot(activeTargetMat, false);

    // Only write React state back into `slot` when React state actually belongs to this exact material!
    if (syncedSlotUuidRef.current === activeTargetMat.uuid) {
      slot.paintState = paintState;
      slot.textureAdjust = textureAdjust;
      slot.layers = layers;
    }

    recompositeSlotDirect(activeTargetMat, slot);

    // Draw 2D UV Mini-Map with UV Wireframe Overlay
    const mini = uvPreviewCanvasRef.current;
    if (mini && showUvMiniMap) {
      const mctx = mini.getContext('2d');
      if (mctx) {
        mctx.clearRect(0, 0, mini.width, mini.height);
        mctx.drawImage(slot.compositeCanvas, 0, 0, mini.width, mini.height);

        mctx.strokeStyle = 'rgba(255,255,255,0.22)';
        mctx.lineWidth = 0.6;
        mctx.beginPath();
        for (const mesh of activeTargetMat.meshes) {
          const uv = mesh.geometry.getAttribute('uv');
          if (!uv) continue;
          const idx = mesh.geometry.index;
          const triCount = idx
            ? Math.min(3500, Math.floor(idx.count / 3))
            : Math.min(3500, Math.floor(uv.count / 3));
          const step = Math.max(1, Math.floor(triCount / 900));
          for (let t = 0; t < triCount; t += step) {
            const i0 = idx ? idx.getX(t * 3) : t * 3;
            const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
            const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
            const u0 = ((uv.getX(i0) % 1) + 1) % 1;
            const v0 = ((uv.getY(i0) % 1) + 1) % 1;
            const u1 = ((uv.getX(i1) % 1) + 1) % 1;
            const v1 = ((uv.getY(i1) % 1) + 1) % 1;
            const u2 = ((uv.getX(i2) % 1) + 1) % 1;
            const v2 = ((uv.getY(i2) % 1) + 1) % 1;
            if (
              Math.abs(u1 - u0) > 0.5 ||
              Math.abs(u2 - u1) > 0.5 ||
              Math.abs(u0 - u2) > 0.5 ||
              Math.abs(v1 - v0) > 0.5 ||
              Math.abs(v2 - v1) > 0.5 ||
              Math.abs(v0 - v2) > 0.5
            ) {
              continue;
            }
            mctx.moveTo(u0 * mini.width, v0 * mini.height);
            mctx.lineTo(u1 * mini.width, v1 * mini.height);
            mctx.lineTo(u2 * mini.width, v2 * mini.height);
            mctx.lineTo(u0 * mini.width, v0 * mini.height);
          }
        }
        mctx.stroke();

        const sel = slot.layers.find((l) => l.id === selectedLayerId);
        if (sel && sel.kind !== 'mesh_uv_mask') {
          mctx.strokeStyle = '#fbbf24';
          mctx.lineWidth = 1.5;
          mctx.beginPath();
          mctx.arc(sel.u * mini.width, sel.v * mini.height, 6, 0, Math.PI * 2);
          mctx.stroke();
        }
      }
    }
  }, [
    activeTargetMat,
    getOrCreateSlot,
    recompositeSlotDirect,
    paintState,
    textureAdjust,
    layers,
    showUvMiniMap,
    selectedLayerId,
  ]);

  const recompositeRef = useRef(recompositeNow);
  recompositeRef.current = recompositeNow;

  useEffect(() => {
    recompositeNow();
  }, [recompositeNow, paintVersion]);

  // Propagate Settings defaultSkinResolution updates to slots that were using the previous default
  useEffect(() => {
    const prevDef = prevDefaultSkinResRef.current;
    if (prevDef === defaultSkinResolution) return;
    prevDefaultSkinResRef.current = defaultSkinResolution;
    for (const slot of slotsMapRef.current.values()) {
      if (slot.textureAdjust.exportResolution === prevDef) {
        slot.textureAdjust = {
          ...slot.textureAdjust,
          exportResolution: defaultSkinResolution,
        };
      }
    }
    setTextureAdjust((cur) =>
      cur.exportResolution === prevDef ? { ...cur, exportResolution: defaultSkinResolution } : cur
    );
  }, [defaultSkinResolution]);

  // Helper to apply a Material Preset to the active material (or a specific clicked 3D mesh region)
  const applyMaterialPresetToTarget = useCallback(
    (
      preset: PaintMaterialPreset,
      targetMat: TargetMaterialOption | null = activeTargetMat,
      clickedMesh?: THREE.Mesh | null,
      updatePasteStamp = true
    ) => {
      if (!targetMat) return;
      const slot = getOrCreateSlot(targetMat, false);
      const beforeSnap = historyOpsRef.current?.capture(slot);
      const pattern =
        preset.params.surfacePattern ?? (preset.params.carbonPattern ? 'carbon_twill' : 'none');
      const optimalScale =
        autoCalibrateUvScale && pattern !== 'none'
          ? estimateOptimalUvDetailScale(
              clickedMesh ? [clickedMesh] : targetMat.meshes,
              pattern
            )
          : preset.params.carbonWeaveScale;

      const resolvedBaseColor = preset.suggestedBaseColor ?? slot.paintState.baseColor;
      const resolvedSecondaryColor = preset.suggestedSecondaryColor ?? slot.paintState.secondaryColor;

      // Remember chosen preset as the persistent 3D click-apply stamp when chosen from the side panel
      if (updatePasteStamp) {
        const stampPaint: PaintMaterialState = {
          ...activePasteStampRef.current.paintState,
          presetId: preset.id,
          baseColor: resolvedBaseColor,
          secondaryColor: resolvedSecondaryColor,
          ...preset.params,
          carbonWeaveScale: optimalScale,
        };
        activePasteStampRef.current = {
          label: preset.name,
          paintState: stampPaint,
        };
        setActivePasteStampMeta({
          label: preset.name,
          color: resolvedBaseColor,
        });
      }

      if (partPasteScope === 'mesh_uv_region' && clickedMesh) {
        // Model-conforming 3D part UV region paste: paste strictly onto clickedMesh's UV triangles!
        const tris = extractMeshUvTriangles(clickedMesh);
        if (tris.length >= 6) {
          const partName = clickedMesh.name || targetMat.name;
          const newLayer: LiveryLayer = {
            id: `part_${Date.now()}`,
            name: `部位素材: ${partName} (${preset.name})`,
            kind: 'mesh_uv_mask',
            visible: true,
            u: 0.5,
            v: 0.5,
            scaleX: 1,
            scaleY: 1,
            rotationDeg: 0,
            opacity: 1,
            flipX: false,
            blendMode: 'source-over',
            color: resolvedBaseColor,
            meshUuid: clickedMesh.uuid,
            meshUvTriangles: tris,
            meshSurfacePattern: pattern,
            meshPatternScale: optimalScale,
          };

          // Replace existing mask for the exact same meshUuid in-place so consecutive clicks never stack duplicates
          const existingIdx = slot.layers.findIndex(
            (l) => l.kind === 'mesh_uv_mask' && l.meshUuid === clickedMesh.uuid
          );
          const nextLayers =
            existingIdx >= 0
              ? slot.layers.map((l, idx) => (idx === existingIdx ? newLayer : l))
              : [...slot.layers, newLayer];
          slot.layers = nextLayers;

          // Only update whole-material shader normal/roughness if this material exclusively owns this single mesh
          if (pattern !== 'none' && targetMat.meshes.length === 1) {
            slot.paintState = {
              ...slot.paintState,
              ...preset.params,
              carbonWeaveScale: optimalScale,
            };
          }

          slot.modified = true;
          markSlotModified(targetMat.uuid, true);
          // Immediately composite ONLY this slot from its own authoritative state (zero cross-slot React bleed)
          recompositeSlotDirect(targetMat, slot);

          if (beforeSnap && historyOpsRef.current) {
            const afterSnap = historyOpsRef.current.capture(slot, {
              selectedLayerOverride: newLayer.id,
            });
            historyOpsRef.current.push(
              targetMat.uuid,
              beforeSnap,
              afterSnap,
              `部位素材: ${preset.name}`
            );
          }

          // Synchronize refs & React UI cleanly to targetMat
          syncedSlotUuidRef.current = targetMat.uuid;
          paintStateRef.current = { ...slot.paintState };
          textureAdjustRef.current = { ...slot.textureAdjust };
          layersRef.current = cloneLiveryLayers(slot.layers);
          setSelectedMatUuid(targetMat.uuid);
          setExportTexName(targetMat.diffuseTexName);
          setPaintState({ ...slot.paintState });
          setTextureAdjust({ ...slot.textureAdjust });
          setLayers(cloneLiveryLayers(slot.layers));
          setSelectedLayerId(newLayer.id);

          onToast(
            `3Dパーツ「${partName}」のUV領域に「${preset.name}」をモデル形状に合わせて貼り付けました`,
            'success'
          );
          return;
        }
      }

      const nextPaint: PaintMaterialState = {
        ...slot.paintState,
        presetId: preset.id,
        baseColor: resolvedBaseColor,
        secondaryColor: resolvedSecondaryColor,
        ...preset.params,
        carbonWeaveScale: optimalScale,
      };
      const nextAdj: TextureAdjustmentParams = {
        ...slot.textureAdjust,
        baseMode: 'paint_or_preset',
      };

      slot.paintState = nextPaint;
      slot.textureAdjust = nextAdj;
      slot.modified = true;
      markSlotModified(targetMat.uuid, true);
      recompositeSlotDirect(targetMat, slot);

      if (beforeSnap && historyOpsRef.current) {
        const afterSnap = historyOpsRef.current.capture(slot);
        historyOpsRef.current.push(targetMat.uuid, beforeSnap, afterSnap, `プリセット: ${preset.name}`);
      }

      syncedSlotUuidRef.current = targetMat.uuid;
      paintStateRef.current = { ...nextPaint };
      textureAdjustRef.current = { ...nextAdj };
      layersRef.current = cloneLiveryLayers(slot.layers);
      setSelectedMatUuid(targetMat.uuid);
      setExportTexName(targetMat.diffuseTexName);
      setPaintState(nextPaint);
      setTextureAdjust(nextAdj);
      setLayers(cloneLiveryLayers(slot.layers));

      onToast(
        `「${targetMat.name}」にプリセット「${preset.name}」を適用しました${
          pattern !== 'none' ? ` (3Dモデル寸法UV自動最適化: ${optimalScale}×)` : ''
        }`,
        'info'
      );
    },
    [
      activeTargetMat,
      autoCalibrateUvScale,
      getOrCreateSlot,
      markSlotModified,
      partPasteScope,
      recompositeSlotDirect,
      onToast,
    ]
  );

  // Helper to apply an Official Manufacturer OEM Paint Color
  const applyOemColorToTarget = useCallback(
    (
      oem: OemPaintEntry,
      targetMat: TargetMaterialOption | null = activeTargetMat,
      clickedMesh?: THREE.Mesh | null,
      updatePasteStamp = true
    ) => {
      if (!targetMat) return;
      const slot = getOrCreateSlot(targetMat, false);
      const beforeSnap = historyOpsRef.current?.capture(slot);

      const presetId =
        oem.finish === 'candy'
          ? 'candy'
          : oem.finish === 'chameleon'
            ? 'pearl_chameleon'
            : oem.finish === 'matte'
              ? 'matte'
              : oem.finish === 'solid'
                ? 'gloss_solid'
                : 'metallic';

      const oemPaintPatch: PaintMaterialState = {
        ...slot.paintState,
        presetId,
        baseColor: oem.baseColor,
        secondaryColor: oem.secondaryColor,
        useGradient: false,
        metalness: oem.metalness,
        roughness: oem.roughness,
        clearcoat: oem.clearcoat,
        clearcoatRoughness: oem.clearcoatRoughness,
        fresnelMax: oem.fresnelMax,
        flakeIntensity: oem.flakeIntensity,
        iridescence: oem.iridescence,
        envIntensity: oem.envIntensity,
        carbonPattern: false,
        surfacePattern: 'none',
      };

      if (updatePasteStamp) {
        activePasteStampRef.current = {
          label: `${oem.nameJp} (${oem.code})`,
          paintState: { ...oemPaintPatch },
        };
        setActivePasteStampMeta({
          label: `${oem.nameJp} (${oem.code})`,
          color: oem.baseColor,
        });
      }

      if (partPasteScope === 'mesh_uv_region' && clickedMesh) {
        const tris = extractMeshUvTriangles(clickedMesh);
        if (tris.length >= 6) {
          const partName = clickedMesh.name || targetMat.name;
          const newLayer: LiveryLayer = {
            id: `oem_part_${Date.now()}`,
            name: `部位純正色: ${partName} (${oem.code} ${oem.nameJp})`,
            kind: 'mesh_uv_mask',
            visible: true,
            u: 0.5,
            v: 0.5,
            scaleX: 1,
            scaleY: 1,
            rotationDeg: 0,
            opacity: 1,
            flipX: false,
            blendMode: 'source-over',
            color: oem.baseColor,
            meshUuid: clickedMesh.uuid,
            meshUvTriangles: tris,
            meshSurfacePattern: 'none',
          };
          const existingIdx = slot.layers.findIndex(
            (l) => l.kind === 'mesh_uv_mask' && l.meshUuid === clickedMesh.uuid
          );
          const nextLayers =
            existingIdx >= 0
              ? slot.layers.map((l, idx) => (idx === existingIdx ? newLayer : l))
              : [...slot.layers, newLayer];
          slot.layers = nextLayers;
          slot.modified = true;
          markSlotModified(targetMat.uuid, true);
          recompositeSlotDirect(targetMat, slot);

          if (beforeSnap && historyOpsRef.current) {
            const afterSnap = historyOpsRef.current.capture(slot, {
              selectedLayerOverride: newLayer.id,
            });
            historyOpsRef.current.push(
              targetMat.uuid,
              beforeSnap,
              afterSnap,
              `部位純正色: ${oem.nameJp}`
            );
          }

          syncedSlotUuidRef.current = targetMat.uuid;
          paintStateRef.current = { ...slot.paintState };
          textureAdjustRef.current = { ...slot.textureAdjust };
          layersRef.current = cloneLiveryLayers(slot.layers);
          setSelectedMatUuid(targetMat.uuid);
          setExportTexName(targetMat.diffuseTexName);
          setPaintState({ ...slot.paintState });
          setTextureAdjust({ ...slot.textureAdjust });
          setLayers(cloneLiveryLayers(slot.layers));
          setSelectedLayerId(newLayer.id);

          onToast(
            `3Dパーツ「${partName}」に純正色「${oem.nameJp} (${oem.code})」を貼り付けました`,
            'success'
          );
          return;
        }
      }

      const nextAdj: TextureAdjustmentParams = {
        ...slot.textureAdjust,
        baseMode: 'paint_or_preset',
      };

      slot.paintState = oemPaintPatch;
      slot.textureAdjust = nextAdj;
      slot.modified = true;
      markSlotModified(targetMat.uuid, true);
      recompositeSlotDirect(targetMat, slot);

      if (beforeSnap && historyOpsRef.current) {
        const afterSnap = historyOpsRef.current.capture(slot);
        historyOpsRef.current.push(targetMat.uuid, beforeSnap, afterSnap, `純正色: ${oem.nameJp}`);
      }

      syncedSlotUuidRef.current = targetMat.uuid;
      paintStateRef.current = { ...oemPaintPatch };
      textureAdjustRef.current = { ...nextAdj };
      layersRef.current = cloneLiveryLayers(slot.layers);
      setSelectedMatUuid(targetMat.uuid);
      setExportTexName(targetMat.diffuseTexName);
      setPaintState(oemPaintPatch);
      setTextureAdjust(nextAdj);
      setLayers(cloneLiveryLayers(slot.layers));

      onToast(
        `純正色「${oem.nameJp} (${oem.code})」を「${targetMat.name}」に適用しました`,
        'success'
      );
    },
    [
      activeTargetMat,
      getOrCreateSlot,
      markSlotModified,
      partPasteScope,
      recompositeSlotDirect,
      onToast,
    ]
  );

  // Reset a single texture/material slot back to the car's original unedited KN5 state
  const handleResetCurrentTextureSlot = useCallback(() => {
    if (!activeTargetMat) return;
    const slot = getOrCreateSlot(activeTargetMat, false);
    const beforeSnap = historyOpsRef.current?.capture(slot, { includeBitmap: true });
    const resetPaint = makeDefaultPaintState(false);
    resetPaint.baseColor = activeTargetMat.originalColorHex || '#2a303c';
    slot.paintState = resetPaint;
    slot.textureAdjust = {
      ...DEFAULT_TEXTURE_ADJUSTMENTS,
      exportResolution: defaultSkinResRef.current,
      baseMode: 'original_adjust',
    };
    slot.layers = [];
    slot.undoStack = [];
    slot.directPaintCanvas
      .getContext('2d')
      ?.clearRect(0, 0, slot.directPaintCanvas.width, slot.directPaintCanvas.height);

    // Restore original Three.js material map, color & PBR properties completely
    restoreOriginalThreeMaterial(activeTargetMat);

    slot.modified = false;
    markSlotModified(activeTargetMat.uuid, false);
    if (beforeSnap && historyOpsRef.current) {
      const afterSnap = historyOpsRef.current.capture(slot, {
        includeBitmap: true,
        selectedLayerOverride: null,
      });
      historyOpsRef.current.push(
        activeTargetMat.uuid,
        beforeSnap,
        afterSnap,
        `マテリアル初期化: ${activeTargetMat.name}`
      );
    }
    syncedSlotUuidRef.current = activeTargetMat.uuid;
    paintStateRef.current = { ...slot.paintState };
    textureAdjustRef.current = { ...slot.textureAdjust };
    layersRef.current = [];
    setPaintState({ ...slot.paintState });
    setTextureAdjust({ ...slot.textureAdjust });
    setLayers([]);
    setSelectedLayerId(null);
    setPaintVersion((v) => v + 1);
    onToast(`テクスチャ「${activeTargetMat.diffuseTexName}」を元の状態にリセットしました`, 'info');
  }, [activeTargetMat, getOrCreateSlot, markSlotModified, onToast]);

  //Refs for real-time 3D canvas event listeners
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const activeTargetMatRef = useRef(activeTargetMat);
  activeTargetMatRef.current = activeTargetMat;
  const materialOptionsRef = useRef(materialOptions);
  materialOptionsRef.current = materialOptions;
  // Pre-indexed mesh list & O(1) mesh -> TargetMaterialOption lookup for zero-alloc hover raycasting
  const meshIndex = useMemo(() => {
    const meshes: THREE.Mesh[] = [];
    const map = new Map<THREE.Mesh, TargetMaterialOption>();
    for (const opt of materialOptions) {
      for (const m of opt.meshes) {
        meshes.push(m);
        map.set(m, opt);
      }
    }
    return { meshes, map };
  }, [materialOptions]);
  const meshIndexRef = useRef(meshIndex);
  meshIndexRef.current = meshIndex;
  const selectedLayerIdRef = useRef(selectedLayerId);
  selectedLayerIdRef.current = selectedLayerId;
  const quickApplyOn3dClickRef = useRef(quickApplyOn3dClick);
  quickApplyOn3dClickRef.current = quickApplyOn3dClick;
  const paintStateRef = useRef(paintState);
  paintStateRef.current = paintState;
  const textureAdjustRef = useRef(textureAdjust);
  textureAdjustRef.current = textureAdjust;
  const layersRef = useRef(layers);
  layersRef.current = layers;
  const brushRef = useRef({ brushKind, brushColor, brushSize, brushOpacity, brushMirrorU });
  brushRef.current = { brushKind, brushColor, brushSize, brushOpacity, brushMirrorU };

  // Capture a snapshot of a material slot (only capturing directPaintCanvas bitmap when needed)
  const captureSlotSnapshot = useCallback(
    (
      slot: TextureSlotRuntime,
      opts?: { includeBitmap?: boolean; includeBaseCanvas?: boolean; selectedLayerOverride?: string | null }
    ): LiverySlotSnapshot => {
      let directPaintImage: ImageData | undefined;
      if (opts?.includeBitmap) {
        const ctx = slot.directPaintCanvas.getContext('2d');
        if (ctx) {
          directPaintImage = ctx.getImageData(
            0,
            0,
            slot.directPaintCanvas.width,
            slot.directPaintCanvas.height
          );
        }
      }
      return {
        paintState: { ...slot.paintState },
        textureAdjust: { ...slot.textureAdjust },
        layers: cloneLiveryLayers(slot.layers),
        modified: slot.modified,
        selectedLayerId:
          opts?.selectedLayerOverride !== undefined
            ? opts.selectedLayerOverride
            : selectedLayerIdRef.current,
        ...(directPaintImage ? { directPaintImage } : {}),
        ...(opts?.includeBaseCanvas ? { baseOriginalCanvas: slot.baseOriginalCanvas } : {}),
      };
    },
    []
  );

  const pushLiveryHistory = useCallback(
    (
      slotUuid: string,
      before: LiverySlotSnapshot,
      after: LiverySlotSnapshot,
      label: string,
      coalesceKey?: string
    ) => {
      liveryHistoryRef.current.push(
        { slotUuid, before, after },
        {
          label,
          coalesceKey,
          mergeCoalesced: (existing, incoming) => ({
            slotUuid: existing.slotUuid,
            before: existing.before,
            after: incoming.after,
          }),
        }
      );
      setHistoryTick((t) => t + 1);
    },
    []
  );

  historyOpsRef.current = {
    capture: captureSlotSnapshot,
    push: pushLiveryHistory,
  };

  const applyLiverySnapshot = useCallback(
    (slotUuid: string, snap: LiverySlotSnapshot) => {
      const matOpt = materialOptionsRef.current.find((m) => m.uuid === slotUuid);
      if (!matOpt) return;
      const slot = getOrCreateSlot(matOpt, false);

      slot.paintState = { ...snap.paintState };
      slot.textureAdjust = { ...snap.textureAdjust };
      slot.layers = cloneLiveryLayers(snap.layers);
      slot.modified = snap.modified;

      if (snap.baseOriginalCanvas !== undefined) {
        slot.baseOriginalCanvas = snap.baseOriginalCanvas;
      }

      if (snap.directPaintImage) {
        if (
          slot.directPaintCanvas.width !== snap.directPaintImage.width ||
          slot.directPaintCanvas.height !== snap.directPaintImage.height
        ) {
          slot.directPaintCanvas.width = snap.directPaintImage.width;
          slot.directPaintCanvas.height = snap.directPaintImage.height;
        }
        slot.directPaintCanvas.getContext('2d')?.putImageData(snap.directPaintImage, 0, 0);
      }

      recompositeSlotDirect(matOpt, slot);

      markSlotModified(slotUuid, snap.modified);
      syncedSlotUuidRef.current = matOpt.uuid;
      paintStateRef.current = { ...slot.paintState };
      textureAdjustRef.current = { ...slot.textureAdjust };
      layersRef.current = cloneLiveryLayers(slot.layers);
      setSelectedMatUuid(matOpt.uuid);
      setExportTexName(matOpt.diffuseTexName);
      setPaintState({ ...slot.paintState });
      setTextureAdjust({ ...slot.textureAdjust });
      setLayers(cloneLiveryLayers(slot.layers));
      setSelectedLayerId(snap.selectedLayerId);
      setPaintVersion((v) => v + 1);
    },
    [getOrCreateSlot, markSlotModified, recompositeSlotDirect]
  );

  const handleLiveryUndo = useCallback(() => {
    const rec = liveryHistoryRef.current.undo();
    if (!rec) return;
    applyLiverySnapshot(rec.value.slotUuid, rec.value.before);
    setHistoryTick((t) => t + 1);
    onToast(`元に戻しました${rec.label ? ` (${rec.label})` : ''}`, 'info');
  }, [applyLiverySnapshot, onToast]);

  const handleLiveryRedo = useCallback(() => {
    const rec = liveryHistoryRef.current.redo();
    if (!rec) return;
    applyLiverySnapshot(rec.value.slotUuid, rec.value.after);
    setHistoryTick((t) => t + 1);
    onToast(`やり直しました${rec.label ? ` (${rec.label})` : ''}`, 'info');
  }, [applyLiverySnapshot, onToast]);

  useEffect(() => {
    if (!onRegisterUndoRedo) return;
    void historyTick;
    onRegisterUndoRedo({
      undo: handleLiveryUndo,
      redo: handleLiveryRedo,
      canUndo: liveryHistoryRef.current.canUndo,
      canRedo: liveryHistoryRef.current.canRedo,
      undoCount: liveryHistoryRef.current.undoCount,
      redoCount: liveryHistoryRef.current.redoCount,
      undoLabel: liveryHistoryRef.current.undoLabel,
      redoLabel: liveryHistoryRef.current.redoLabel,
    });
  }, [onRegisterUndoRedo, handleLiveryUndo, handleLiveryRedo, historyTick]);

  useEffect(() => {
    return () => {
      onRegisterUndoRedo?.(null);
    };
  }, [onRegisterUndoRedo]);

  // Paint stroke helper on active slot's directPaintCanvas at UV (0..1, 0..1)
  const dabBrushAtUv = useCallback(
    (u: number, v: number) => {
      const targetMat = activeTargetMatRef.current;
      if (!targetMat) return;
      const slot = getOrCreateSlot(targetMat, false);
      markSlotModified(targetMat.uuid, true);
      const pCanvas = slot.directPaintCanvas;
      const ctx = pCanvas.getContext('2d');
      if (!ctx) return;

      const {
        brushKind: kind,
        brushColor: color,
        brushSize: size,
        brushOpacity: op,
        brushMirrorU: mirror,
      } = brushRef.current;

      const drawOne = (ux: number, vy: number) => {
        const x = (((ux % 1) + 1) % 1) * pCanvas.width;
        const y = (((vy % 1) + 1) % 1) * pCanvas.height;

        ctx.save();
        if (kind === 'eraser') {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.globalAlpha = op;
          ctx.beginPath();
          ctx.arc(x, y, size, 0, Math.PI * 2);
          ctx.fillStyle = '#000';
          ctx.fill();
        } else if (kind === 'round') {
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = op;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(x, y, size, 0, Math.PI * 2);
          ctx.fill();
        } else if (kind === 'airbrush') {
          ctx.globalCompositeOperation = 'source-over';
          const grad = ctx.createRadialGradient(x, y, 0, x, y, size * 1.4);
          BRUSH_TEMP_COLOR.set(color);
          const r = Math.round(BRUSH_TEMP_COLOR.r * 255);
          const g = Math.round(BRUSH_TEMP_COLOR.g * 255);
          const b = Math.round(BRUSH_TEMP_COLOR.b * 255);
          grad.addColorStop(0, `rgba(${r},${g},${b},${(op * 0.55).toFixed(3)})`);
          grad.addColorStop(0.55, `rgba(${r},${g},${b},${(op * 0.22).toFixed(3)})`);
          grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(x, y, size * 1.4, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = op * 0.65;
          ctx.fillStyle = color;
          for (let k = 0; k < 24; k++) {
            const a = Math.random() * Math.PI * 2;
            const r = Math.random() * size * 1.4;
            ctx.fillRect(x + Math.cos(a) * r, y + Math.sin(a) * r, 2.2, 2.2);
          }
        }
        ctx.restore();
      };

      drawOne(u, v);
      if (mirror) {
        drawOne(1 - u, v);
      }
      recompositeRef.current();
    },
    [getOrCreateSlot, markSlotModified]
  );

  const handleUndoPaint = handleLiveryUndo;

  const handleClearDirectPaint = useCallback(() => {
    if (!activeTargetMat) return;
    const slot = getOrCreateSlot(activeTargetMat, false);
    const before = captureSlotSnapshot(slot, { includeBitmap: true });
    slot.directPaintCanvas
      .getContext('2d')
      ?.clearRect(0, 0, slot.directPaintCanvas.width, slot.directPaintCanvas.height);
    const after = captureSlotSnapshot(slot, { includeBitmap: true });
    pushLiveryHistory(activeTargetMat.uuid, before, after, 'ブラシペイント消去');
    setPaintVersion((v) => v + 1);
  }, [activeTargetMat, captureSlotSnapshot, getOrCreateSlot, pushLiveryHistory]);

  // Ref for 3D click part selection & material paste callback
  const handle3dPartPickOrApplyRef = useRef<
    (hitMatOpt: TargetMaterialOption, hitMesh: THREE.Mesh) => void
  >(() => {});
  handle3dPartPickOrApplyRef.current = (hitMatOpt, hitMesh) => {
    if (quickApplyOn3dClickRef.current) {
      // Read from persistent activePasteStampRef (NOT paintStateRef) so consecutive clicks across different
      // parts & materials always apply the exact preset/color the user chose instead of resetting to white!
      const stamp = activePasteStampRef.current;
      const curState = stamp.paintState;
      const matchedPreset =
        PAINT_MATERIAL_PRESETS.find((p) => p.id === curState.presetId) ?? PAINT_MATERIAL_PRESETS[0];
      const customPreset: PaintMaterialPreset = {
        ...matchedPreset,
        name: stamp.label || matchedPreset.name,
        suggestedBaseColor: curState.baseColor,
        suggestedSecondaryColor: curState.secondaryColor,
        params: {
          metalness: curState.metalness,
          roughness: curState.roughness,
          clearcoat: curState.clearcoat,
          clearcoatRoughness: curState.clearcoatRoughness,
          fresnelMax: curState.fresnelMax,
          iridescence: curState.iridescence,
          flakeIntensity: curState.flakeIntensity,
          envIntensity: curState.envIntensity,
          carbonPattern: curState.carbonPattern,
          carbonWeaveScale: curState.carbonWeaveScale,
          surfacePattern: curState.surfacePattern,
          normalStrength: curState.normalStrength,
        },
      };
      applyMaterialPresetToTarget(customPreset, hitMatOpt, hitMesh, false);
    } else {
      selectMaterialSlot(hitMatOpt);
      onToast(
        `3Dパーツ「${hitMesh.name || hitMatOpt.name}」を選択しました (テクスチャ: ${hitMatOpt.diffuseTexName})`,
        'info'
      );
    }
  };

  // Setup Three.js CSP Viewport
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0d121c');

    const camera = new THREE.PerspectiveCamera(
      38,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.03,
      150
    );
    camera.position.set(3.9, 1.55, 4.1);

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const env = createCspEnvironmentMap(renderer, 'csp_showroom');
    scene.environment = env;
    envTexRef.current = env;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0.56, 0);
    controls.maxPolarAngle = Math.PI / 2 - 0.02;

    scene.add(new THREE.HemisphereLight('#f1f5f9', '#1e293b', 0.72));
    const key = new THREE.DirectionalLight('#ffffff', 2.2);
    key.position.set(6, 9, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    scene.add(key);

    const rim = new THREE.DirectionalLight('#7dd3fc', 0.9);
    rim.position.set(-6, 4, -5);
    scene.add(rim);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(14, 64),
      new THREE.MeshStandardMaterial({ color: '#0c111a', roughness: 0.35, metalness: 0.3 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.85, 2.92, 64),
      new THREE.MeshBasicMaterial({
        color: '#f43f5e',
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.45,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.003;
    scene.add(ring);

    const carRoot = new THREE.Group();
    scene.add(carRoot);

    // GT7-style 3D Decal Projection Frame Gizmo (hovering wireframe box + crosshair + top indicator arrow)
    const decalGizmo = new THREE.Group();
    decalGizmo.visible = false;
    {
      const framePts = [
        new THREE.Vector3(-0.5, -0.5, 0),
        new THREE.Vector3(0.5, -0.5, 0),
        new THREE.Vector3(0.5, 0.5, 0),
        new THREE.Vector3(-0.5, 0.5, 0),
      ];
      const frameGeom = new THREE.BufferGeometry().setFromPoints(framePts);
      const frameLine = new THREE.LineLoop(
        frameGeom,
        new THREE.LineBasicMaterial({
          color: '#fbbf24',
          depthTest: false,
          transparent: true,
          opacity: 0.95,
        })
      );
      frameLine.renderOrder = 999;
      decalGizmo.add(frameLine);

      const crossPts = [
        new THREE.Vector3(-0.08, 0, 0),
        new THREE.Vector3(0.08, 0, 0),
        new THREE.Vector3(0, -0.08, 0),
        new THREE.Vector3(0, 0.08, 0),
      ];
      const crossLine = new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(crossPts),
        new THREE.LineBasicMaterial({
          color: '#fef08a',
          depthTest: false,
          transparent: true,
          opacity: 0.85,
        })
      );
      crossLine.renderOrder = 999;
      decalGizmo.add(crossLine);

      // Top orientation arrow (shows UP direction & rotation angle clearly from any angle)
      const arrowPts = [
        new THREE.Vector3(-0.09, 0.52, 0),
        new THREE.Vector3(0, 0.64, 0),
        new THREE.Vector3(0.09, 0.52, 0),
      ];
      const arrowLine = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(arrowPts),
        new THREE.LineBasicMaterial({
          color: '#f43f5e',
          depthTest: false,
          transparent: true,
          opacity: 0.95,
        })
      );
      arrowLine.renderOrder = 999;
      decalGizmo.add(arrowLine);

      const tintPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          color: '#fbbf24',
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.07,
          depthTest: false,
          depthWrite: false,
        })
      );
      tintPlane.renderOrder = 998;
      decalGizmo.add(tintPlane);
    }
    scene.add(decalGizmo);

    sceneRef.current = scene;
    cameraRef.current = camera;
    controlsRef.current = controls;
    rendererRef.current = renderer;
    carRootRef.current = carRoot;
    decalGizmoRef.current = decalGizmo;

    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const tmpNormalMat = new THREE.Matrix3();
    const tmpCamUp = new THREE.Vector3();
    let isPainting = false;
    let isDraggingDecal = false;
    let decalDragRafPending = false;
    let latestDecalDragEvent: PointerEvent | null = null;
    let pendingBrushUndo: { slotUuid: string; before: LiverySlotSnapshot } | null = null;
    let pendingDecalUndo: { slotUuid: string; before: LiverySlotSnapshot } | null = null;

    const computeHitWorldNormal = (hit: THREE.Intersection): THREE.Vector3 => {
      const n = new THREE.Vector3(0, 1, 0);
      if (hit.face) {
        tmpNormalMat.getNormalMatrix(hit.object.matrixWorld);
        n.copy(hit.face.normal).applyMatrix3(tmpNormalMat).normalize();
      }
      const toCam = new THREE.Vector3().subVectors(camera.position, hit.point);
      if (n.dot(toCam) < 0) n.negate();
      return n;
    };

    const updateGizmoForLayer = (layer: LiveryLayer | null) => {
      if (
        !layer ||
        !layer.visible ||
        layer.kind === 'mesh_uv_mask' ||
        !layer.projection3d ||
        toolRef.current !== 'decal'
      ) {
        decalGizmo.visible = false;
        return;
      }
      const proj = layer.projection3d;
      const rad = (layer.rotationDeg * Math.PI) / 180;
      const cosR = Math.cos(rad);
      const sinR = Math.sin(rad);
      const right = new THREE.Vector3(...proj.right);
      const up = new THREE.Vector3(...proj.up);
      const fwd = new THREE.Vector3(...proj.forward);
      const xAxis = right.clone().multiplyScalar(cosR).addScaledVector(up, -sinR).normalize();
      const yAxis = right.clone().multiplyScalar(sinR).addScaledVector(up, cosR).normalize();
      const zAxis = fwd.clone().negate().normalize();
      const basis = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
      decalGizmo.quaternion.setFromRotationMatrix(basis);
      decalGizmo.position.set(
        proj.origin[0] - fwd.x * 0.028,
        proj.origin[1] - fwd.y * 0.028,
        proj.origin[2] - fwd.z * 0.028
      );
      decalGizmo.scale.set(proj.widthM, proj.heightM, 1);
      decalGizmo.visible = true;
    };

    type SurfaceHit = {
      uv: THREE.Vector2;
      mesh: THREE.Mesh;
      faceIndex: number | null;
      point: THREE.Vector3;
      worldNormal: THREE.Vector3;
    };

    const raycastActiveMaterial = (ev: PointerEvent): SurfaceHit | null => {
      const targetMat = activeTargetMatRef.current;
      if (!targetMat || targetMat.meshes.length === 0) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(targetMat.meshes, false);
      const h = hits.find((item) => item.uv);
      if (!h || !h.uv) return null;
      return {
        // DirectX / KN5 top-left V (matches CanvasTexture.flipY = false — NO inverted 1 - v!)
        uv: new THREE.Vector2(((h.uv.x % 1) + 1) % 1, ((h.uv.y % 1) + 1) % 1),
        mesh: h.object as THREE.Mesh,
        faceIndex: h.faceIndex ?? null,
        point: h.point.clone(),
        worldNormal: computeHitWorldNormal(h),
      };
    };

    const raycastAnyCarPart = (
      ev: PointerEvent
    ): {
      matOpt: TargetMaterialOption;
      mesh: THREE.Mesh;
      uv?: THREE.Vector2;
      point: THREE.Vector3;
      worldNormal: THREE.Vector3;
    } | null => {
      const { meshes: allMeshes, map: meshMap } = meshIndexRef.current;
      if (allMeshes.length === 0) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(allMeshes, false);
      if (hits.length === 0) return null;
      const firstHit = hits[0];
      const hitMesh = firstHit.object as THREE.Mesh;
      const matOpt = meshMap.get(hitMesh);
      if (!matOpt) return null;
      const uv = firstHit.uv
        ? new THREE.Vector2(((firstHit.uv.x % 1) + 1) % 1, ((firstHit.uv.y % 1) + 1) % 1)
        : undefined;
      return {
        matOpt,
        mesh: hitMesh,
        uv,
        point: firstHit.point.clone(),
        worldNormal: computeHitWorldNormal(firstHit),
      };
    };

    const placeOrDragDecalAtHit = (hit: SurfaceHit, isInitialDown: boolean) => {
      const targetMat = activeTargetMatRef.current;
      if (!targetMat) return;
      const slot = getOrCreateSlot(targetMat, false);

      tmpCamUp.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
      const projMode = decalProjModeRef.current;
      const selId = selectedLayerIdRef.current;
      const currentLayers = layersRef.current;
      const existingSel = selId
        ? currentLayers.find((l) => l.id === selId && l.kind !== 'mesh_uv_mask')
        : null;

      let nextLayers: LiveryLayer[];
      let activeLayer: LiveryLayer | null = null;

      if (existingSel) {
        const curProj = existingSel.projection3d;
        const widthM = curProj?.widthM ?? Math.max(0.18, Math.min(1.6, existingSel.scaleX * 2.2));
        const heightM = curProj?.heightM ?? Math.max(0.18, Math.min(1.6, existingSel.scaleY * 2.2));
        const depthM = curProj?.depthM ?? 0.35;
        const angleLimitDeg = curProj?.angleLimitDeg ?? 70;
        const nextProj = buildDecalProjection3D({
          hitPoint: hit.point,
          surfaceNormal: hit.worldNormal,
          cameraPosition: camera.position,
          cameraUp: tmpCamUp,
          mode: projMode,
          widthM,
          heightM,
          depthM,
          angleLimitDeg,
        });

        nextLayers = currentLayers.map((l) => {
          if (l.id !== existingSel.id) return l;
          const updated: LiveryLayer = {
            ...l,
            u: Number(hit.uv.x.toFixed(4)),
            v: Number(hit.uv.y.toFixed(4)),
            projection3d: nextProj,
          };
          activeLayer = updated;
          return updated;
        });
      } else if (isInitialDown) {
        const id = `layer_${Date.now()}`;
        const nextProj = buildDecalProjection3D({
          hitPoint: hit.point,
          surfaceNormal: hit.worldNormal,
          cameraPosition: camera.position,
          cameraUp: tmpCamUp,
          mode: projMode,
          widthM: 0.42,
          heightM: 0.42,
          depthM: 0.35,
          angleLimitDeg: 70,
        });
        const created: LiveryLayer = {
          id,
          name: 'ゼッケンプレート',
          kind: 'number_plate_circle',
          visible: true,
          u: Number(hit.uv.x.toFixed(4)),
          v: Number(hit.uv.y.toFixed(4)),
          scaleX: 0.16,
          scaleY: 0.16,
          rotationDeg: 0,
          opacity: 1,
          flipX: false,
          flipY: false,
          blendMode: 'source-over',
          color: '#ffffff',
          accentColor: '#111827',
          text: '07',
          projection3d: nextProj,
        };
        activeLayer = created;
        nextLayers = [...currentLayers, created];
        selectedLayerIdRef.current = id;
        setSelectedLayerId(id);
      } else {
        return;
      }

      // Immediately project & composite onto the 3D car at 60fps
      slot.layers = nextLayers;
      slot.modified = true;
      layersRef.current = nextLayers;
      syncedSlotUuidRef.current = targetMat.uuid;
      recompositeSlotDirect(targetMat, slot);
      updateGizmoForLayer(activeLayer);
      markSlotModified(targetMat.uuid, true);
      setLayers(nextLayers);
    };

    const onPointerDown = (ev: PointerEvent) => {
      if (ev.button !== 0) return;
      const curTool = toolRef.current;
      if (curTool === 'pick_apply') {
        const hit = raycastAnyCarPart(ev);
        if (hit) {
          handle3dPartPickOrApplyRef.current(hit.matOpt, hit.mesh);
        }
      } else if (curTool === 'paint') {
        let hit = raycastActiveMaterial(ev);
        if (!hit) {
          const anyHit = raycastAnyCarPart(ev);
          if (anyHit && anyHit.uv) {
            selectMaterialSlot(anyHit.matOpt);
            activeTargetMatRef.current = anyHit.matOpt;
            hit = {
              uv: anyHit.uv,
              mesh: anyHit.mesh,
              faceIndex: null,
              point: anyHit.point,
              worldNormal: anyHit.worldNormal,
            };
          }
        }
        if (hit) {
          const activeMat = activeTargetMatRef.current;
          if (activeMat && historyOpsRef.current) {
            const slot = getOrCreateSlot(activeMat, false);
            pendingBrushUndo = {
              slotUuid: activeMat.uuid,
              before: historyOpsRef.current.capture(slot, { includeBitmap: true }),
            };
          }
          isPainting = true;
          dabBrushAtUv(hit.uv.x, hit.uv.y);
        }
      } else if (curTool === 'decal') {
        let hit = raycastActiveMaterial(ev);
        if (!hit) {
          const anyHit = raycastAnyCarPart(ev);
          if (anyHit && anyHit.uv) {
            selectMaterialSlot(anyHit.matOpt);
            activeTargetMatRef.current = anyHit.matOpt;
            hit = {
              uv: anyHit.uv,
              mesh: anyHit.mesh,
              faceIndex: null,
              point: anyHit.point,
              worldNormal: anyHit.worldNormal,
            };
          }
        }
        if (hit) {
          const activeMat = activeTargetMatRef.current;
          if (activeMat && historyOpsRef.current) {
            const slot = getOrCreateSlot(activeMat, false);
            pendingDecalUndo = {
              slotUuid: activeMat.uuid,
              before: historyOpsRef.current.capture(slot),
            };
          }
          isDraggingDecal = true;
          placeOrDragDecalAtHit(hit, true);
        }
      }
    };

    let hoverRafPending = false;
    let lastHoverLabel: string | null = null;
    const onPointerMove = (ev: PointerEvent) => {
      const curTool = toolRef.current;
      if (curTool === 'pick_apply') {
        if (hoverRafPending) return;
        hoverRafPending = true;
        requestAnimationFrame(() => {
          hoverRafPending = false;
          if (toolRef.current !== 'pick_apply') return;
          const hit = raycastAnyCarPart(ev);
          const nextLabel = hit
            ? `${hit.mesh.name || 'Mesh'} → ${hit.matOpt.name} (${hit.matOpt.diffuseTexName})`
            : null;
          if (nextLabel !== lastHoverLabel) {
            lastHoverLabel = nextLabel;
            setHoveredPartLabel(nextLabel);
          }
        });
        return;
      }
      if (isPainting && curTool === 'paint') {
        const hit = raycastActiveMaterial(ev);
        if (hit) dabBrushAtUv(hit.uv.x, hit.uv.y);
      } else if (isDraggingDecal && curTool === 'decal') {
        latestDecalDragEvent = ev;
        if (decalDragRafPending) return;
        decalDragRafPending = true;
        requestAnimationFrame(() => {
          decalDragRafPending = false;
          const dragEv = latestDecalDragEvent;
          latestDecalDragEvent = null;
          if (!isDraggingDecal || toolRef.current !== 'decal' || !dragEv) return;
          const hit = raycastActiveMaterial(dragEv);
          if (hit) placeOrDragDecalAtHit(hit, false);
        });
      }
    };

    const onPointerUp = () => {
      if (isPainting) {
        isPainting = false;
        if (pendingBrushUndo && historyOpsRef.current) {
          const slot = slotsMapRef.current.get(pendingBrushUndo.slotUuid);
          if (slot) {
            const after = historyOpsRef.current.capture(slot, { includeBitmap: true });
            historyOpsRef.current.push(
              pendingBrushUndo.slotUuid,
              pendingBrushUndo.before,
              after,
              '3Dブラシペイント'
            );
          }
          pendingBrushUndo = null;
        }
        setPaintVersion((v) => v + 1);
      }
      if (isDraggingDecal) {
        isDraggingDecal = false;
        latestDecalDragEvent = null;
        if (pendingDecalUndo && historyOpsRef.current) {
          const snapInfo = pendingDecalUndo;
          pendingDecalUndo = null;
          const slot = slotsMapRef.current.get(snapInfo.slotUuid);
          if (slot && historyOpsRef.current) {
            slot.layers = cloneLiveryLayers(layersRef.current);
            const after = historyOpsRef.current.capture(slot);
            historyOpsRef.current.push(snapInfo.slotUuid, snapInfo.before, after, '3Dデカール投影配置');
          }
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    const ro = new ResizeObserver(() => {
      if (!container) return;
      camera.aspect = container.clientWidth / Math.max(1, container.clientHeight);
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, Math.max(1, container.clientHeight));
    });
    ro.observe(container);

    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      if (document.hidden) return;
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      ro.disconnect();
      controls.dispose();
      decalGizmoRef.current = null;
      for (const s of slotsMapRef.current.values()) {
        s.liveCanvasTex.dispose();
      }
      slotsMapRef.current.clear();
      envTexRef.current?.dispose();
      disposeThreeObject(scene);
      renderer.dispose();
    };
  }, [dabBrushAtUv, getOrCreateSlot, markSlotModified, recompositeSlotDirect, selectMaterialSlot]);

  // Synchronize GT7 3D Decal Projection Frame Gizmo with active selection & tool
  useEffect(() => {
    const gizmo = decalGizmoRef.current;
    if (!gizmo) return;
    if (
      tool !== 'decal' ||
      !selectedLayer ||
      !selectedLayer.visible ||
      selectedLayer.kind === 'mesh_uv_mask' ||
      !selectedLayer.projection3d
    ) {
      gizmo.visible = false;
      return;
    }
    const proj = selectedLayer.projection3d;
    const rad = (selectedLayer.rotationDeg * Math.PI) / 180;
    const cosR = Math.cos(rad);
    const sinR = Math.sin(rad);
    const right = new THREE.Vector3(...proj.right);
    const up = new THREE.Vector3(...proj.up);
    const fwd = new THREE.Vector3(...proj.forward);
    const xAxis = right.clone().multiplyScalar(cosR).addScaledVector(up, -sinR).normalize();
    const yAxis = right.clone().multiplyScalar(sinR).addScaledVector(up, cosR).normalize();
    const zAxis = fwd.clone().negate().normalize();
    const basis = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
    gizmo.quaternion.setFromRotationMatrix(basis);
    gizmo.position.set(
      proj.origin[0] - fwd.x * 0.028,
      proj.origin[1] - fwd.y * 0.028,
      proj.origin[2] - fwd.z * 0.028
    );
    gizmo.scale.set(proj.widthM, proj.heightM, 1);
    gizmo.visible = true;
  }, [tool, selectedLayer]);

  // Disable left-mouse Orbit rotation when interacting directly with the 3D car
  useEffect(() => {
    const ctrl = controlsRef.current;
    if (!ctrl) return;
    ctrl.enableRotate = tool === 'orbit';
    if (tool !== 'pick_apply') {
      setHoveredPartLabel(null);
    }
  }, [tool]);

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

  // Auto-detect vehicle brand to pre-select manufacturer in OEM Paint catalog
  useEffect(() => {
    const curCar = cars.find((c) => c.id === carId);
    const hay = `${carId} ${curCar?.name ?? ''} ${curCar?.brand ?? ''}`.toLowerCase();
    const matchedBrand = OEM_MANUFACTURERS.find((m) => m.matchKeywords.some((kw) => hay.includes(kw)));
    if (matchedBrand) {
      setSelectedBrandId(matchedBrand.id);
    }
  }, [carId, cars]);

  // Load target vehicle 3D model + skins list on car switch
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingCar(true);
      try {
        const [models, skins] = await Promise.all([
          window.acApi.listCarModels(carsDir, carId),
          window.acApi.listCarSkins(carsDir, carId),
        ]);
        if (cancelled) return;
        setExistingSkins(skins);

        const root = carRootRef.current;
        if (!root) return;
        for (const s of slotsMapRef.current.values()) {
          s.liveCanvasTex.dispose();
        }
        slotsMapRef.current.clear();
        liveryHistoryRef.current.clear();
        setHistoryTick((t) => t + 1);
        clearThreeGroup(root);
        setModifiedMatUuids([]);

        let carObj: THREE.Group | null = null;
        let kn5Textures: Kn5Texture[] = [];

        const preferred = models.find((m) => !m.fileName.toLowerCase().includes('collider'));
        if (preferred) {
          const bytes = await window.acApi.readCarModelBytes(carsDir, carId, preferred.fileName);
          if (bytes && !cancelled) {
            const doc = parseKn5(bytes);
            kn5Textures = doc.textures;
            const cache = buildCspTextureCache(doc.textures);
            carObj = kn5ToThreeGroup(doc, cache);
            const box = new THREE.Box3().setFromObject(carObj);
            if (!box.isEmpty()) {
              carObj.position.y -= box.min.y;
              const center = box.getCenter(new THREE.Vector3());
              carObj.position.x -= center.x;
              carObj.position.z -= center.z;
            }
          }
        }

        if (!carObj) {
          const susp = filesRef.current['suspensions.ini'] ?? '';
          const tyres = filesRef.current['tyres.ini'] ?? '';
          carObj = buildProceduralCarGroup({
            wheelbase: getIniNumber(susp, 'BASIC', 'WHEELBASE', 2.6),
            frontTrack: getIniNumber(susp, 'FRONT', 'TRACK', 1.54),
            rearTrack: getIniNumber(susp, 'REAR', 'TRACK', 1.56),
            frontRadius: getIniNumber(tyres, 'FRONT', 'RADIUS', 0.316),
            rearRadius: getIniNumber(tyres, 'REAR', 'RADIUS', 0.316),
            frontWidth: getIniNumber(tyres, 'FRONT', 'WIDTH', 0.24),
            rearWidth: getIniNumber(tyres, 'REAR', 'WIDTH', 0.26),
          });
        }

        if (cancelled) return;
        kn5TexturesRef.current = kn5Textures;
        root.add(carObj);

        const byMat = new Map<string, TargetMaterialOption>();
        carObj.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mesh = obj as THREE.Mesh;
            const rawM = mesh.material;
            const first = Array.isArray(rawM) ? rawM[0] : rawM;
            if (!first) return;
            let phys: THREE.MeshPhysicalMaterial;
            if (first instanceof THREE.MeshPhysicalMaterial) {
              phys = first;
            } else {
              const std = first as THREE.MeshStandardMaterial;
              phys = new THREE.MeshPhysicalMaterial({
                name: std.name,
                color: std.color?.clone() ?? new THREE.Color('#ffffff'),
                map: std.map ?? null,
                roughness: std.roughness ?? 0.4,
                metalness: std.metalness ?? 0.3,
              });
              phys.userData = { ...std.userData };
              mesh.material = phys;
            }

            if (!byMat.has(phys.uuid)) {
              const ksMat = phys.userData?.kn5Material as Kn5Material | undefined;
              const diffSlot = ksMat?.textureMappings.find(
                (tm) => tm.name.toLowerCase() === 'txdiffuse'
              );
              const detailSlot = ksMat?.textureMappings.find(
                (tm) => tm.name.toLowerCase() === 'txdetail'
              );
              const detailNmSlot = ksMat?.textureMappings.find(
                (tm) =>
                  tm.name.toLowerCase() === 'txdetailnm' ||
                  tm.name.toLowerCase() === 'txnormaldetail'
              );
              const mName = phys.name || 'Body_Paint';
              const dTexName =
                diffSlot?.texture || `${mName.replace(/[^a-z0-9_]/gi, '_')}.dds`;
              byMat.set(phys.uuid, {
                uuid: phys.uuid,
                name: mName,
                diffuseTexName: dTexName,
                detailTexName: detailSlot?.texture,
                detailNmTexName: detailNmSlot?.texture,
                category: classifyCarMaterial(mName, dTexName),
                material: phys,
                meshes: [mesh],
                originalMap: phys.map ?? null,
                originalColorHex: phys.color ? `#${phys.color.getHexString()}` : '#2a303c',
                originalPbr: {
                  metalness: phys.metalness ?? 0.15,
                  roughness: phys.roughness ?? 0.4,
                  clearcoat: phys.clearcoat ?? 0,
                  clearcoatRoughness: phys.clearcoatRoughness ?? 0.2,
                  envMapIntensity: phys.envMapIntensity ?? 1.0,
                  reflectivity: phys.reflectivity ?? 0.5,
                },
              });
            } else {
              byMat.get(phys.uuid)!.meshes.push(mesh);
            }
          }
        });

        const opts = Array.from(byMat.values());
        setMaterialOptions(opts);
        const best = guessBestBodyMaterial(opts);
        if (best) {
          const primarySlot = getOrCreateSlot(best, true);
          syncedSlotUuidRef.current = best.uuid;
          paintStateRef.current = { ...primarySlot.paintState };
          textureAdjustRef.current = { ...primarySlot.textureAdjust };
          layersRef.current = [];
          activePasteStampRef.current = {
            label:
              PAINT_MATERIAL_PRESETS.find((p) => p.id === primarySlot.paintState.presetId)?.name ??
              'キャンディ塗装',
            paintState: { ...primarySlot.paintState },
          };
          setActivePasteStampMeta({
            label: activePasteStampRef.current.label,
            color: primarySlot.paintState.baseColor,
          });
          markSlotModified(best.uuid, true);
          setSelectedMatUuid(best.uuid);
          setExportTexName(best.diffuseTexName);
          setPaintState({ ...primarySlot.paintState });
          setTextureAdjust({ ...primarySlot.textureAdjust });
          setLayers([]);
          setSelectedLayerId(null);
        }
      } finally {
        if (!cancelled) setLoadingCar(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [carsDir, carId, getOrCreateSlot, markSlotModified]);

  const setCameraAngle = (
    angle: 'quarter' | 'front' | 'left' | 'right' | 'top' | 'rear' | 'interior'
  ) => {
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    if (!cam || !ctrl) return;
    if (angle === 'interior') {
      cam.position.set(0.32, 1.06, -0.35);
      ctrl.target.set(0.18, 0.92, 0.55);
      ctrl.update();
      return;
    }
    const map: Record<
      'quarter' | 'front' | 'left' | 'right' | 'top' | 'rear',
      [number, number, number]
    > = {
      quarter: [3.9, 1.55, 4.1],
      front: [0.01, 1.05, 5.1],
      left: [5.0, 1.05, 0.01],
      right: [-5.0, 1.05, 0.01],
      top: [0.01, 5.8, 0.12],
      rear: [0.01, 1.15, -5.1],
    };
    const [cx, cy, cz] = map[angle];
    cam.position.set(cx, cy, cz);
    ctrl.target.set(0, 0.56, 0);
    ctrl.update();
  };

  // Wrapper to update paintState and mark the current texture slot modified (with coalesced Undo/Redo)
  const updatePaintState = useCallback(
    (updater: (prev: PaintMaterialState) => PaintMaterialState) => {
      const next = updater(paintStateRef.current);
      if (activeTargetMat && historyOpsRef.current) {
        const slot = getOrCreateSlot(activeTargetMat, false);
        const before = historyOpsRef.current.capture(slot);
        slot.paintState = next;
        markSlotModified(activeTargetMat.uuid, true);
        const after = historyOpsRef.current.capture(slot);
        historyOpsRef.current.push(
          activeTargetMat.uuid,
          before,
          after,
          `ペイント設定 (${activeTargetMat.name})`,
          `paint:${activeTargetMat.uuid}`
        );
      } else if (activeTargetMat) {
        markSlotModified(activeTargetMat.uuid, true);
      }
      // Keep persistent 3D click-apply stamp synchronized with user's custom paint edits
      const presetLabel =
        PAINT_MATERIAL_PRESETS.find((p) => p.id === next.presetId)?.name ?? 'カスタムペイント';
      activePasteStampRef.current = {
        label: presetLabel,
        paintState: { ...next },
      };
      setActivePasteStampMeta({
        label: presetLabel,
        color: next.baseColor,
      });
      paintStateRef.current = next;
      setPaintState(next);
    },
    [activeTargetMat, getOrCreateSlot, markSlotModified]
  );

  // Wrapper to update textureAdjust and mark the current texture slot modified (with coalesced Undo/Redo)
  const updateTextureAdjust = useCallback(
    (updater: (prev: TextureAdjustmentParams) => TextureAdjustmentParams) => {
      const next = updater(textureAdjustRef.current);
      if (activeTargetMat && historyOpsRef.current) {
        const slot = getOrCreateSlot(activeTargetMat, false);
        const before = historyOpsRef.current.capture(slot);
        slot.textureAdjust = next;
        markSlotModified(activeTargetMat.uuid, true);
        const after = historyOpsRef.current.capture(slot);
        historyOpsRef.current.push(
          activeTargetMat.uuid,
          before,
          after,
          `テクスチャ色調補正 (${activeTargetMat.name})`,
          `texadj:${activeTargetMat.uuid}`
        );
      } else if (activeTargetMat) {
        markSlotModified(activeTargetMat.uuid, true);
      }
      textureAdjustRef.current = next;
      setTextureAdjust(next);
    },
    [activeTargetMat, getOrCreateSlot, markSlotModified]
  );

  // Helper to commit layer stack edits with unified Undo/Redo
  const commitLayersChange = useCallback(
    (
      nextLayers: LiveryLayer[],
      nextSelectedId: string | null | undefined,
      label: string,
      coalesceKey?: string
    ) => {
      const targetMat = activeTargetMatRef.current;
      const selNext = nextSelectedId !== undefined ? nextSelectedId : selectedLayerIdRef.current;
      if (targetMat && historyOpsRef.current) {
        const slot = getOrCreateSlot(targetMat, false);
        const before = historyOpsRef.current.capture(slot);
        slot.layers = cloneLiveryLayers(nextLayers);
        markSlotModified(targetMat.uuid, true);
        const after = historyOpsRef.current.capture(slot, { selectedLayerOverride: selNext });
        historyOpsRef.current.push(targetMat.uuid, before, after, label, coalesceKey);
      } else if (targetMat) {
        markSlotModified(targetMat.uuid, true);
      }
      layersRef.current = nextLayers;
      setLayers(nextLayers);
      if (nextSelectedId !== undefined) {
        setSelectedLayerId(nextSelectedId);
      }
    },
    [getOrCreateSlot, markSlotModified]
  );

  // Calibrate UV scale from the 3D geometry of the currently selected material
  const handleAutoCalibrateCurrentMaterialUv = () => {
    if (!activeTargetMat) return;
    const activePattern = resolveActiveSurfacePattern(paintState);
    const patternForCalc = activePattern === 'none' ? 'carbon_twill' : activePattern;
    const optimal = estimateOptimalUvDetailScale(activeTargetMat.meshes, patternForCalc);
    updatePaintState((p) => ({
      ...p,
      carbonWeaveScale: optimal,
    }));
    onToast(
      `3Dモデルのポリゴン表面積とUV面積の比率から最適なUV倍率 (${optimal}×) を算出しました`,
      'success'
    );
  };

  // Cast a ray at the 3D viewport center (with subtle probe fallback) to auto-project newly added GT7 decals
  const raycastViewportCenter = useCallback((): {
    point: THREE.Vector3;
    normal: THREE.Vector3;
    uv: THREE.Vector2;
    camPos: THREE.Vector3;
    camUp: THREE.Vector3;
  } | null => {
    const cam = cameraRef.current;
    const targetMat = activeTargetMatRef.current;
    if (!cam || !targetMat || targetMat.meshes.length === 0) return null;

    cam.updateMatrixWorld();
    const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion).normalize();
    const ray = new THREE.Raycaster();
    const probes: Array<[number, number]> = [
      [0, 0],
      [0, -0.12],
      [0, 0.12],
      [-0.14, 0],
      [0.14, 0],
      [0, -0.25],
    ];
    const normalMat = new THREE.Matrix3();
    for (const [nx, ny] of probes) {
      ray.setFromCamera(new THREE.Vector2(nx, ny), cam);
      const hits = ray.intersectObjects(targetMat.meshes, false);
      const h = hits.find((item) => item.uv);
      if (h && h.uv) {
        const n = new THREE.Vector3(0, 1, 0);
        if (h.face) {
          normalMat.getNormalMatrix(h.object.matrixWorld);
          n.copy(h.face.normal).applyMatrix3(normalMat).normalize();
        }
        const toCam = new THREE.Vector3().subVectors(cam.position, h.point);
        if (n.dot(toCam) < 0) n.negate();
        return {
          point: h.point.clone(),
          normal: n,
          uv: new THREE.Vector2(((h.uv.x % 1) + 1) % 1, ((h.uv.y % 1) + 1) % 1),
          camPos: cam.position.clone(),
          camUp,
        };
      }
    }

    // Fallback: project onto bounding-box surface facing the camera
    const box = new THREE.Box3();
    for (const m of targetMat.meshes) {
      box.expandByObject(m);
    }
    if (box.isEmpty()) return null;
    const center = box.getCenter(new THREE.Vector3());
    const toCamDir = new THREE.Vector3().subVectors(cam.position, center).normalize();
    const size = box.getSize(new THREE.Vector3());
    const approxPoint = center.clone().addScaledVector(toCamDir, Math.min(size.x, size.y, size.z) * 0.45);
    return {
      point: approxPoint,
      normal: toCamDir,
      uv: new THREE.Vector2(0.5, 0.5),
      camPos: cam.position.clone(),
      camUp,
    };
  }, []);

  // Add external image decal (PNG/JPG/WebP) with GT7 3D projection right at the user's current 3D view
  const handleAddExternalImageDecal = async () => {
    const picked = await window.acApi.pickDecalImageFile();
    if (!picked) return;
    const img = new Image();
    img.onload = () => {
      imageCacheRef.current.set(picked.dataUrl, img);
      const aspect = Math.max(0.15, Math.min(6, img.naturalWidth / Math.max(1, img.naturalHeight)));
      const maxM = 0.56;
      const widthM = aspect >= 1 ? maxM : Number((maxM * aspect).toFixed(3));
      const heightM = aspect >= 1 ? Number((maxM / aspect).toFixed(3)) : maxM;
      const centerHit = raycastViewportCenter();
      const proj3d = centerHit
        ? buildDecalProjection3D({
            hitPoint: centerHit.point,
            surfaceNormal: centerHit.normal,
            cameraPosition: centerHit.camPos,
            cameraUp: centerHit.camUp,
            mode: decalProjModeRef.current,
            widthM,
            heightM,
            depthM: 0.35,
            angleLimitDeg: 70,
          })
        : undefined;

      const baseScale = 0.24;
      const id = `img_${Date.now()}`;
      const nextLayer: LiveryLayer = {
        id,
        name: picked.fileName.replace(/\.[^.]+$/, ''),
        kind: 'image',
        visible: true,
        u: centerHit ? Number(centerHit.uv.x.toFixed(4)) : 0.5,
        v: centerHit ? Number(centerHit.uv.y.toFixed(4)) : 0.5,
        scaleX: Number((aspect >= 1 ? baseScale : baseScale * aspect).toFixed(3)),
        scaleY: Number((aspect >= 1 ? baseScale / aspect : baseScale).toFixed(3)),
        rotationDeg: 0,
        opacity: 1,
        flipX: false,
        flipY: false,
        blendMode: 'source-over',
        color: '#ffffff',
        imageDataUrl: picked.dataUrl,
        projection3d: proj3d,
      };
      commitLayersChange([...layersRef.current, nextLayer], id, `画像デカール追加: ${nextLayer.name}`);
      setSideTab('decals');
      setTool('decal');
      onToast(
        `画像「${picked.fileName}」を現在の3D視点へ投影配置しました。3Dモデル上をドラッグして移動・調整できます！`,
        'success'
      );
    };
    img.src = picked.dataUrl;
  };

  const handleAddBuiltInDecal = (kind: DecalKind) => {
    const id = `dec_${Date.now()}`;
    const labels: Record<DecalKind, string> = {
      image: '画像',
      stripe_center: 'センターストライプ',
      stripe_slash: '斜めレーシング帯',
      number_plate_circle: '丸型ゼッケン',
      number_plate_gt: 'GT角型ゼッケン',
      checker_band: 'チェッカー帯',
      star: 'レーシングスター',
      arrow: 'レーシングアロー',
      text: 'カスタムロゴ文字',
      mesh_uv_mask: '3Dパーツ領域素材',
    };
    const isStripe =
      kind === 'stripe_center' || kind === 'stripe_slash' || kind === 'checker_band';
    const defaultSizeM: [number, number] =
      kind === 'stripe_center'
        ? [0.42, 1.65]
        : kind === 'stripe_slash'
          ? [0.95, 0.45]
          : kind === 'checker_band'
            ? [1.1, 0.28]
            : kind === 'text'
              ? [0.72, 0.22]
              : kind === 'number_plate_gt'
                ? [0.44, 0.48]
                : kind === 'arrow'
                  ? [0.68, 0.34]
                  : [0.42, 0.42];
    const centerHit = raycastViewportCenter();
    const proj3d = centerHit
      ? buildDecalProjection3D({
          hitPoint: centerHit.point,
          surfaceNormal: centerHit.normal,
          cameraPosition: centerHit.camPos,
          cameraUp: centerHit.camUp,
          mode: decalProjModeRef.current,
          widthM: defaultSizeM[0],
          heightM: defaultSizeM[1],
          depthM: isStripe ? 0.55 : 0.35,
          angleLimitDeg: isStripe ? 80 : 70,
        })
      : undefined;

    const next: LiveryLayer = {
      id,
      name: labels[kind],
      kind,
      visible: true,
      u: centerHit ? Number(centerHit.uv.x.toFixed(4)) : 0.5,
      v: centerHit ? Number(centerHit.uv.y.toFixed(4)) : 0.5,
      scaleX: isStripe ? 0.35 : kind === 'text' ? 0.38 : 0.18,
      scaleY: isStripe ? 0.95 : kind === 'text' ? 0.12 : 0.18,
      rotationDeg: 0,
      opacity: 1,
      flipX: false,
      flipY: false,
      blendMode: 'source-over',
      color: '#ffffff',
      accentColor: '#e11d48',
      text: kind === 'text' ? 'TURBO SPEC' : carNumber || '07',
      projection3d: proj3d,
    };
    commitLayersChange([...layersRef.current, next], id, `デカール追加: ${labels[kind]}`);
    setTool('decal');
    onToast(
      `「${labels[kind]}」を3Dモデル上に投影配置しました。車体上をドラッグして自由に移動できます！`,
      'info'
    );
  };

  const updateSelectedLayer = (patch: Partial<LiveryLayer>) => {
    if (!selectedLayerId) return;
    const next = layersRef.current.map((l) => (l.id === selectedLayerId ? { ...l, ...patch } : l));
    commitLayersChange(next, undefined, 'デカール編集', `layer:${selectedLayerId}`);
  };

  const updateSelectedProjection3d = (
    patch: Partial<DecalProjection3D>,
    axisChanged?: 'width' | 'height'
  ) => {
    if (!selectedLayerId) return;
    const next = layersRef.current.map((l) => {
      if (l.id !== selectedLayerId || !l.projection3d) return l;
      const cur = l.projection3d;
      const nextProj: DecalProjection3D = { ...cur, ...patch };
      if (decalAspectLock && axisChanged === 'width' && patch.widthM !== undefined) {
        const ratio = cur.heightM / Math.max(0.02, cur.widthM);
        nextProj.heightM = Number(Math.max(0.04, Math.min(4.5, patch.widthM * ratio)).toFixed(3));
      } else if (decalAspectLock && axisChanged === 'height' && patch.heightM !== undefined) {
        const ratio = cur.widthM / Math.max(0.02, cur.heightM);
        nextProj.widthM = Number(Math.max(0.04, Math.min(4.5, patch.heightM * ratio)).toFixed(3));
      }
      return { ...l, projection3d: nextProj };
    });
    commitLayersChange(next, undefined, '3D投影サイズ・範囲調整', `layer_proj:${selectedLayerId}`);
  };

  // GT7 "今のカメラ視点から貼り直す" (align selected decal's projection direction to current camera / center hit)
  const handleReprojectSelectedFromCamera = () => {
    if (!selectedLayerId) return;
    const sel = layersRef.current.find((l) => l.id === selectedLayerId);
    if (!sel || sel.kind === 'mesh_uv_mask') return;
    const cam = cameraRef.current;
    if (!cam) return;

    cam.updateMatrixWorld();
    const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion).normalize();
    const centerHit = raycastViewportCenter();
    const originVec = sel.projection3d
      ? new THREE.Vector3(...sel.projection3d.origin)
      : centerHit?.point ?? new THREE.Vector3(0, 0.7, 0);
    const surfaceNormal = centerHit?.normal ?? new THREE.Vector3().subVectors(cam.position, originVec).normalize();

    const widthM = sel.projection3d?.widthM ?? Math.max(0.2, Math.min(1.6, sel.scaleX * 2.2));
    const heightM = sel.projection3d?.heightM ?? Math.max(0.2, Math.min(1.6, sel.scaleY * 2.2));
    const nextProj = buildDecalProjection3D({
      hitPoint: sel.projection3d ? originVec : (centerHit?.point ?? originVec),
      surfaceNormal,
      cameraPosition: cam.position,
      cameraUp: camUp,
      mode: decalProjModeRef.current,
      widthM,
      heightM,
      depthM: sel.projection3d?.depthM ?? 0.35,
      angleLimitDeg: sel.projection3d?.angleLimitDeg ?? 70,
    });

    const next = layersRef.current.map((l) =>
      l.id === selectedLayerId ? { ...l, projection3d: nextProj } : l
    );
    commitLayersChange(next, undefined, `今の視点から再投影: ${sel.name}`);
    onToast(
      `「${sel.name}」を現在の3Dカメラ視点 (${decalProjModeRef.current === 'camera' ? 'カメラ基準' : 'ボディ表面基準'}) に合わせて再投影しました`,
      'success'
    );
  };

  const handleMirrorDuplicateLayer = (layer: LiveryLayer, keepReadable = false) => {
    let copy: LiveryLayer;
    if (layer.projection3d) {
      const mirrored = mirrorDecalProjectionAcrossX(
        layer.projection3d,
        layer.rotationDeg,
        layer.flipX,
        keepReadable
      );
      copy = {
        ...layer,
        id: `mir_${Date.now()}`,
        name: `${layer.name} (${keepReadable ? '反対側・文字維持' : '反対側・対称'})`,
        u: Number((1 - layer.u).toFixed(4)),
        flipX: mirrored.flipX,
        rotationDeg: mirrored.rotationDeg,
        projection3d: mirrored.projection3d,
      };
    } else {
      copy = {
        ...layer,
        id: `mir_${Date.now()}`,
        name: `${layer.name} (対称)`,
        u: Number((1 - layer.u).toFixed(4)),
        flipX: keepReadable ? layer.flipX : !layer.flipX,
        rotationDeg: keepReadable ? layer.rotationDeg : -layer.rotationDeg,
      };
    }
    commitLayersChange(
      [...layersRef.current, copy],
      copy.id,
      `${keepReadable ? '反対側複製(文字維持)' : '反対側対称複製'}: ${layer.name}`
    );
    onToast(
      `「${layer.name}」を車体の反対側へ${keepReadable ? '文字向き維持で' : '左右対称に'}複製しました`,
      'info'
    );
  };

  const handleMoveLayer = (id: string, dir: -1 | 1) => {
    const prev = layersRef.current;
    const idx = prev.findIndex((l) => l.id === id);
    const nextIdx = idx + dir;
    if (idx < 0 || nextIdx < 0 || nextIdx >= prev.length) return;
    const arr = [...prev];
    [arr[idx], arr[nextIdx]] = [arr[nextIdx], arr[idx]];
    commitLayersChange(arr, undefined, 'レイヤー順序変更');
  };

  // Load an existing skin's texture into the active slot
  const handleLoadExistingSkin = async (skin: CarSkinSummary) => {
    if (!activeTargetMat) return;
    const texFile =
      skin.files.find((f) => f.toLowerCase() === exportTexName.toLowerCase()) ??
      skin.files.find((f) => /\.(dds|png|jpg|jpeg)$/i.test(f) && !/^(preview|livery)/i.test(f));
    if (!texFile) {
      onToast(`スキン ${skin.skinName} にベーステクスチャが見つかりません`, 'error');
      return;
    }
    const bytes = await window.acApi.readCarSkinFile(carsDir, carId, skin.id, texFile);
    if (!bytes) return;
    const c = await kn5TextureToCanvas({ type: 1, name: texFile, data: bytes });
    if (c) {
      const slot = getOrCreateSlot(activeTargetMat, false);
      const before = historyOpsRef.current?.capture(slot, { includeBaseCanvas: true });
      slot.baseOriginalCanvas = c;
      const nextAdj: TextureAdjustmentParams = { ...textureAdjustRef.current, baseMode: 'original_adjust' };
      slot.textureAdjust = nextAdj;
      markSlotModified(activeTargetMat.uuid, true);
      if (before && historyOpsRef.current) {
        const after = historyOpsRef.current.capture(slot, { includeBaseCanvas: true });
        historyOpsRef.current.push(
          activeTargetMat.uuid,
          before,
          after,
          `既存スキン読込: ${skin.skinName}`
        );
      }
      textureAdjustRef.current = nextAdj;
      setTextureAdjust(nextAdj);
      setSkinFolderId(`${skin.id}_custom`);
      setSkinName(`${skin.skinName} Custom`);
      onToast(`既存スキン「${skin.skinName}」(${texFile}) をベースに読み込みました`, 'success');
    }
  };

  // Export Complete Multi-Texture AC Skin Folder (all modified DDS/PNG textures + detail/normal maps + multi-material ext_config.ini + ui_skin.json + preview.jpg + livery.png)
  const handleSaveSkin = async () => {
    recompositeNow();
    setSavingSkin(true);
    try {
      const modifiedSlots: Array<{ opt: TargetMaterialOption; slot: TextureSlotRuntime }> = [];
      for (const opt of materialOptions) {
        const s = slotsMapRef.current.get(opt.uuid);
        if (s && s.modified) {
          modifiedSlots.push({ opt, slot: s });
        }
      }
      if (modifiedSlots.length === 0 && activeTargetMat) {
        const s = getOrCreateSlot(activeTargetMat, true);
        modifiedSlots.push({ opt: activeTargetMat, slot: s });
      }

      let primaryTexName = exportTexName.trim() || 'skin_body.dds';
      let primaryTexBytes: Uint8Array | null = null;
      const extraFiles: Array<{ fileName: string; bytes: Uint8Array }> = [];
      const seenExtraFiles = new Set<string>();
      const shaderEntries: Array<{
        materialName: string;
        paintState: PaintMaterialState;
        diffuseTexName?: string;
      }> = [];

      const pushUniqueExtraFile = (fileName: string, bytes: Uint8Array) => {
        const key = fileName.toLowerCase();
        if (seenExtraFiles.has(key)) return;
        seenExtraFiles.add(key);
        extraFiles.push({ fileName, bytes });
      };

      for (let idx = 0; idx < modifiedSlots.length; idx++) {
        const { opt, slot } = modifiedSlots[idx];
        const isActiveOpt = opt.uuid === activeTargetMat?.uuid;
        const targetExportRes = slot.textureAdjust.exportResolution || defaultSkinResRef.current;

        // Render at the exact native export resolution (1024 / 2048 / 4096 / 8192)
        // Use a dedicated temporary canvas when export resolution exceeds live preview size so RAM stays low
        let outCanvas: HTMLCanvasElement;
        let tempExportCanvas: HTMLCanvasElement | null = null;
        if (targetExportRes === slot.compositeCanvas.width) {
          recompositeSlotDirect(opt, slot);
          outCanvas = slot.compositeCanvas;
        } else {
          tempExportCanvas = document.createElement('canvas');
          tempExportCanvas.width = targetExportRes;
          tempExportCanvas.height = targetExportRes;
          composeLiveryCanvas(
            tempExportCanvas,
            slot.paintState,
            slot.baseOriginalCanvas,
            slot.layers,
            imageCacheRef.current,
            slot.directPaintCanvas,
            slot.textureAdjust,
            opt.meshes,
            opt.originalColorHex
          );
          outCanvas = tempExportCanvas;
        }

        let texFileName = isActiveOpt
          ? exportTexName.trim() || opt.diffuseTexName
          : opt.diffuseTexName;
        const isPngTarget = texFileName.toLowerCase().endsWith('.png');
        const activePattern = resolveActiveSurfacePattern(slot.paintState);
        const hasDetailPattern = activePattern !== 'none';

        let slotBytes: Uint8Array;
        let extDiffuseRef = texFileName;

        try {
          if (hasDetailPattern) {
            const maskedRgba = buildCarbonDiffuseRgbaWithDetailMask(
              outCanvas,
              slot.layers.filter((l) => l.kind !== 'mesh_uv_mask'),
              imageCacheRef.current,
              slot.directPaintCanvas,
              opt.meshes
            );
            const detailDiffuseDds = encodeRgbaToDds(outCanvas.width, outCanvas.height, maskedRgba, {
              generateMipmaps: true,
            });

            if (isPngTarget) {
              const blob = await new Promise<Blob | null>((res) =>
                outCanvas.toBlob(res, 'image/png')
              );
              if (!blob) throw new Error('PNGエンコード失敗');
              slotBytes = new Uint8Array(await blob.arrayBuffer());
              extDiffuseRef = `${texFileName.replace(/\.[^.]+$/, '')}_detail_base.dds`;
              pushUniqueExtraFile(extDiffuseRef, detailDiffuseDds);
            } else {
              if (!texFileName.toLowerCase().endsWith('.dds')) texFileName += '.dds';
              slotBytes = detailDiffuseDds;
              extDiffuseRef = texFileName;
            }

            const patternFiles = buildSurfacePatternDdsFiles(activePattern, {
              detailTexName: opt.detailTexName,
              detailNmTexName: opt.detailNmTexName,
            });
            for (const pf of patternFiles) {
              pushUniqueExtraFile(pf.fileName, pf.bytes);
            }
          } else if (isPngTarget) {
            const blob = await new Promise<Blob | null>((res) => outCanvas.toBlob(res, 'image/png'));
            if (!blob) throw new Error('PNGエンコード失敗');
            slotBytes = new Uint8Array(await blob.arrayBuffer());
          } else {
            if (!texFileName.toLowerCase().endsWith('.dds')) texFileName += '.dds';
            const imgData = outCanvas
              .getContext('2d')!
              .getImageData(0, 0, outCanvas.width, outCanvas.height);
            slotBytes = encodeRgbaToDds(outCanvas.width, outCanvas.height, imgData.data, {
              generateMipmaps: true,
            });
          }
        } finally {
          if (tempExportCanvas) {
            tempExportCanvas.width = 0;
            tempExportCanvas.height = 0;
          }
        }

        if (idx === 0) {
          primaryTexName = texFileName;
          primaryTexBytes = slotBytes;
          seenExtraFiles.add(primaryTexName.toLowerCase());
        } else {
          pushUniqueExtraFile(texFileName, slotBytes);
        }

        shaderEntries.push({
          materialName: opt.name,
          paintState: slot.paintState,
          diffuseTexName: hasDetailPattern ? extDiffuseRef : undefined,
        });
      }

      if (!primaryTexBytes) {
        throw new Error('出力対象のテクスチャデータがありません');
      }

      // Capture high-res preview.jpg directly from 3D CSP viewport (hide 3D decal frame gizmo first!)
      let previewJpegBytes: Uint8Array | undefined;
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        const prevGizmoVis = decalGizmoRef.current?.visible ?? false;
        if (decalGizmoRef.current) decalGizmoRef.current.visible = false;
        rendererRef.current.render(sceneRef.current, cameraRef.current);
        const jpegBlob = await new Promise<Blob | null>((res) =>
          rendererRef.current!.domElement.toBlob(res, 'image/jpeg', 0.9)
        );
        if (decalGizmoRef.current) decalGizmoRef.current.visible = prevGizmoVis;
        if (jpegBlob) {
          previewJpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());
        }
      }

      const liveryPngBytes = await renderLiveryBadgePngBytes(
        paintState.baseColor,
        paintState.secondaryColor,
        carNumber
      );

      const extConfigIni = buildMultiMaterialSkinExtConfigIni(shaderEntries);

      const res = await window.acApi.saveCarSkin(carsDir, carId, {
        skinFolderId,
        skinName,
        driverName,
        team: teamName,
        country,
        number: carNumber,
        textureFileName: primaryTexName,
        textureBytes: primaryTexBytes,
        extConfigIni,
        extraFiles: extraFiles.length > 0 ? extraFiles : undefined,
        previewJpegBytes,
        liveryPngBytes,
      });

      if (res.ok) {
        setExistingSkins(await window.acApi.listCarSkins(carsDir, carId));
        onToast(`${res.message} (編集マテリアル数: ${modifiedSlots.length})`, 'success');
      } else {
        onToast(res.message, 'error');
      }
    } catch (err) {
      onToast(
        `スキン保存エラー: ${err instanceof Error ? err.message : String(err)}`,
        'error'
      );
    } finally {
      // Release any large temporary 4096px / 8192px offscreen scratch buffers right after export
      releaseLiveryScratchBuffers();
      setSavingSkin(false);
    }
  };

  // Allow clicking directly on 2D UV Mini-Map to place decal or paint
  const handleUvMiniClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const u = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const v = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    if (tool === 'paint') {
      const targetMat = activeTargetMatRef.current;
      const slot = targetMat ? getOrCreateSlot(targetMat, false) : null;
      const before = slot ? captureSlotSnapshot(slot, { includeBitmap: true }) : null;
      dabBrushAtUv(u, v);
      if (targetMat && slot && before) {
        const after = captureSlotSnapshot(slot, { includeBitmap: true });
        pushLiveryHistory(targetMat.uuid, before, after, 'UVミニマップペイント');
      }
      setPaintVersion((x) => x + 1);
    } else if (selectedLayerId) {
      const sel = layersRef.current.find((l) => l.id === selectedLayerId);
      if (sel?.projection3d) {
        onToast('3D投影デカールは3Dモデル上をクリック＆ドラッグして直接移動できます', 'info');
      } else {
        updateSelectedLayer({ u: Number(u.toFixed(4)), v: Number(v.toFixed(4)) });
      }
    }
  };

  const activePresetObj = useMemo(
    () => PAINT_MATERIAL_PRESETS.find((p) => p.id === paintState.presetId) ?? PAINT_MATERIAL_PRESETS[0],
    [paintState.presetId]
  );

  return (
    <div className="space-y-3">
      {/* Top Livery Studio Control Bar */}
      <div className="bg-[#121722] border border-[#242e42] rounded-xl p-3 flex flex-wrap items-center justify-between gap-2.5 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 mr-1">
            <Paintbrush className="w-4 h-4 text-rose-400" />
            <span className="font-bold text-slate-100">3D リバリー &amp; マテリアルスタジオ</span>
          </div>

          {/* 3D Viewport Interaction Mode Switcher */}
          <div className="flex bg-[#090c11] border border-[#252e42] rounded-lg p-0.5">
            <button
              onClick={() => setTool('orbit')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors ${
                tool === 'orbit'
                  ? 'bg-cyan-600 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="3Dカメラの回転・ズーム"
            >
              <Camera className="w-3.5 h-3.5" />
              視点回転
            </button>
            <button
              onClick={() => {
                setTool('pick_apply');
                setSideTab('presets');
              }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors ${
                tool === 'pick_apply'
                  ? 'bg-emerald-600 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="3Dモデルのパーツを直接クリックして選択・素材プリセットを貼り付け"
            >
              <Crosshair className="w-3.5 h-3.5" />
              パーツ選択・素材貼付
            </button>
            <button
              onClick={() => {
                setTool('decal');
                setSideTab('decals');
              }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors ${
                tool === 'decal'
                  ? 'bg-amber-600 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="3Dモデルの表面に沿ってデカールをクリック＆ドラッグ配置"
            >
              <MousePointerClick className="w-3.5 h-3.5" />
              3Dデカール配置
            </button>
            <button
              onClick={() => {
                setTool('paint');
                setSideTab('brush');
              }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors ${
                tool === 'paint'
                  ? 'bg-rose-600 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="3Dモデル上に直接ブラシでペイント"
            >
              <Brush className="w-3.5 h-3.5" />
              3Dブラシ
            </button>
          </div>

          {/* Target Material Picker */}
          <select
            value={activeTargetMat?.uuid ?? ''}
            onChange={(e) => {
              const found = materialOptions.find((m) => m.uuid === e.target.value);
              if (found) selectMaterialSlot(found);
            }}
            className="bg-[#0b0e14] border border-[#2b354b] rounded-lg px-2.5 py-1.5 font-mono-num text-cyan-300 max-w-[260px]"
            title="編集対象の車両マテリアル / テクスチャ"
          >
            {materialOptions.map((opt) => {
              const isMod = modifiedMatUuids.includes(opt.uuid);
              return (
                <option key={opt.uuid} value={opt.uuid}>
                  {isMod ? '★ ' : ''}
                  {opt.name} ({opt.diffuseTexName})
                </option>
              );
            })}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              ['quarter', '斜め'],
              ['front', '正面'],
              ['left', '左側面'],
              ['right', '右側面'],
              ['top', '真上'],
              ['rear', 'リア'],
              ['interior', '内装'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setCameraAngle(k)}
              className={`px-2 py-1 rounded-md text-[11px] border ${
                k === 'interior'
                  ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border-amber-500/40'
                  : 'bg-[#182132] hover:bg-[#23304a] text-slate-300 border-[#2a3650]'
              }`}
            >
              {label}
            </button>
          ))}

          <button
            onClick={() => setShowUvMiniMap((v) => !v)}
            className={`flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] ${
              showUvMiniMap
                ? 'bg-cyan-500/20 border-cyan-500 text-cyan-200'
                : 'bg-[#0b0e14] border-[#252e42] text-slate-400'
            }`}
          >
            <Grid className="w-3 h-3" />
            UV展開図
          </button>

          <button
            onClick={() => setSideTab('export')}
            className="flex items-center gap-1.5 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-semibold px-3 py-1.5 rounded-lg"
          >
            <Save className="w-3.5 h-3.5" />
            スキン書き出し ({modifiedMatUuids.length || 1})
          </button>
        </div>
      </div>

      {/* Main Split Workspace: 3D Live Showroom (Viewer Only Detachable) + 5-Tab Workstation (Settings Only Detachable) */}
      <div
        className="grid grid-cols-1 xl:grid-cols-12 gap-4"
        style={{ height: 'var(--accs-studio-h, calc(100vh - 165px))', minHeight: '460px' }}
      >
        {/* Left: Live 3D CSP Showroom Viewport (Detachable as 3D Viewer Only!) */}
        <DetachablePanel
          panelId="livery_3d_viewer"
          title="3Dリバリー・ショールームビューワー"
          subtitle={activeTargetMat?.name}
          role="viewer3d"
          mode={viewerDetachMode}
          onModeChange={setViewerDetachMode}
          dockedClassName={`${
            panelDetachMode === 'docked' ? 'xl:col-span-7' : 'xl:col-span-12'
          } bg-[#090d14] border border-[#242e42] rounded-xl overflow-hidden min-h-[360px]`}
          defaultFloatingBounds={{ x: 24, y: 84, width: 680, height: 540 }}
          popoutSize={{ width: 880, height: 660 }}
        >
        <div className="relative w-full h-full flex-1">
          <div
            ref={mountRef}
            className={`w-full h-full ${
              tool === 'paint'
                ? 'cursor-crosshair'
                : tool === 'decal' || tool === 'pick_apply'
                  ? 'cursor-cell'
                  : 'cursor-grab'
            }`}
          />

          {/* Top-Left CSP Environment & Active Material Status */}
          <div className="absolute top-3 left-3 flex flex-wrap items-center gap-2 bg-[#0b0e14]/90 backdrop-blur border border-[#252e42] rounded-lg px-2.5 py-1.5 text-[11px]">
            <Sun className="w-3.5 h-3.5 text-amber-400" />
            <select
              value={cspPreset}
              onChange={(e) => setCspPreset(e.target.value as CspLightingPreset)}
              className="bg-transparent text-cyan-300 focus:outline-none cursor-pointer"
            >
              <option value="csp_showroom" className="bg-[#0b0e14]">
                CSP Showroom (艶・シボ確認)
              </option>
              <option value="csp_sunset" className="bg-[#0b0e14]">
                CSP Sunset Track
              </option>
              <option value="csp_studio_dark" className="bg-[#0b0e14]">
                CSP Dark Studio
              </option>
            </select>
            <span className="text-slate-600">|</span>
            <span className="text-slate-300 font-mono-num">
              対象: <strong className="text-cyan-300">{activeTargetMat?.name ?? '-'}</strong>
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-rose-300 font-semibold">{activePresetObj.name}</span>
          </div>

          {/* Mode Hint / Hovered 3D Part Inspector Banner */}
          <div className="absolute top-3 right-3 bg-[#0b0e14]/90 backdrop-blur border border-[#252e42] rounded-lg px-2.5 py-1.5 text-[11px] text-slate-300 max-w-xs truncate">
            {hoveredPartLabel ? (
              <span className="text-emerald-300 font-mono-num">🎯 {hoveredPartLabel}</span>
            ) : tool === 'pick_apply' ? (
              <span className="text-emerald-300">
                左クリック: 3Dパーツを選択{quickApplyOn3dClick ? '＆現在の素材を貼付' : ''} / 右ドラッグ: 移動
              </span>
            ) : tool === 'paint' ? (
              '左ドラッグ: 3Dボディ直接ペイント / ホイール: ズーム'
            ) : tool === 'decal' ? (
              '左ドラッグ: 3Dモデル表面に沿ってデカール移動'
            ) : (
              '左ドラッグ: 回転 / 右ドラッグ: 移動 / ホイール: ズーム'
            )}
          </div>

          {/* Floating Quick Bar for 3D Part Pick & Paste Mode */}
          {tool === 'pick_apply' && (
            <div className="absolute bottom-3 left-3 bg-[#0c111b]/95 backdrop-blur border border-emerald-500/40 rounded-xl px-3 py-2 flex flex-wrap items-center gap-2 text-[11px] shadow-xl max-w-[460px]">
              <div className="flex items-center justify-between gap-2 w-full">
                <label className="flex items-center gap-1.5 text-emerald-200 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={quickApplyOn3dClick}
                    onChange={(e) => setQuickApplyOn3dClick(e.target.checked)}
                    className="accent-emerald-500"
                  />
                  3Dクリック時に現在の素材を連続貼付
                </label>
                <div
                  className="flex items-center gap-1.5 bg-[#121927] border border-emerald-500/35 rounded-md px-2 py-0.5 text-[10px] text-slate-200 max-w-[180px]"
                  title="連続3Dクリック時に貼り付けられる現在の素材スタンプ"
                >
                  <span
                    className="w-3 h-3 rounded-sm border border-white/30 shrink-0"
                    style={{ backgroundColor: activePasteStampMeta.color }}
                  />
                  <span className="truncate font-medium">{activePasteStampMeta.label}</span>
                </div>
              </div>
              <div className="flex gap-1 w-full">
                <button
                  onClick={() => setPartPasteScope('whole_material')}
                  className={`flex-1 py-1 px-2 rounded border text-[10px] ${
                    partPasteScope === 'whole_material'
                      ? 'bg-emerald-600 border-emerald-400 text-white font-semibold'
                      : 'bg-[#121722] border-[#2b354b] text-slate-300'
                  }`}
                >
                  マテリアル全体 (3D寸法UV自動最適化)
                </button>
                <button
                  onClick={() => setPartPasteScope('mesh_uv_region')}
                  className={`flex-1 py-1 px-2 rounded border text-[10px] ${
                    partPasteScope === 'mesh_uv_region'
                      ? 'bg-amber-600 border-amber-400 text-white font-semibold'
                      : 'bg-[#121722] border-[#2b354b] text-slate-300'
                  }`}
                >
                  クリックした3Dメッシュ領域のみ貼付
                </button>
              </div>
            </div>
          )}

          {/* Floating GT7-Style 3D Decal Projection Quick Bar */}
          {tool === 'decal' && (
            <div className="absolute bottom-3 left-3 bg-[#0c111b]/95 backdrop-blur border border-amber-500/45 rounded-xl px-3 py-2 flex flex-wrap items-center gap-2 text-[11px] shadow-xl max-w-[520px]">
              <div className="flex items-center gap-1 bg-[#121722] border border-[#2b354b] rounded-lg p-0.5">
                <button
                  onClick={() => setDecalProjMode('camera')}
                  className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                    decalProjMode === 'camera'
                      ? 'bg-amber-600 text-white font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                  title="GT7標準: 現在のカメラ視点方向から3Dモデルへ真っ直ぐ投影します"
                >
                  カメラ基準投影 (GT7)
                </button>
                <button
                  onClick={() => setDecalProjMode('surface')}
                  className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                    decalProjMode === 'surface'
                      ? 'bg-amber-600 text-white font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                  title="ボディの曲面法線に沿って垂直に投影します"
                >
                  ボディ表面基準
                </button>
              </div>
              {selectedLayer && selectedLayer.kind !== 'mesh_uv_mask' && (
                <button
                  onClick={handleReprojectSelectedFromCamera}
                  className="flex items-center gap-1 bg-amber-500/20 hover:bg-amber-500/35 border border-amber-400/50 text-amber-200 px-2 py-1 rounded-md text-[10px] font-medium"
                  title="選択中デカールの投影方向を今の3Dカメラ視点に合わせます"
                >
                  <RefreshCw className="w-3 h-3" />
                  今の視点から再投影
                </button>
              )}
              <span className="text-[10px] text-slate-400">
                左ドラッグ: 3Dモデル上で直接移動 / 視点変更は「視点回転」へ
              </span>
            </div>
          )}

          {/* Floating Quick Brush Bar when in 3D Paint Mode */}
          {tool === 'paint' && (
            <div className="absolute bottom-3 left-3 bg-[#0c111b]/95 backdrop-blur border border-rose-500/40 rounded-xl px-3 py-2 flex flex-wrap items-center gap-2.5 text-[11px] shadow-xl">
              <input
                type="color"
                value={brushColor}
                onChange={(e) => setBrushColor(e.target.value)}
                className="w-7 h-7 rounded bg-transparent cursor-pointer"
              />
              <div className="flex gap-1">
                {(
                  [
                    ['airbrush', 'エアブラシ'],
                    ['round', 'ペン'],
                    ['spray', 'スプレー'],
                    ['eraser', '消去'],
                  ] as Array<[BrushKind, string]>
                ).map(([k, lbl]) => (
                  <button
                    key={k}
                    onClick={() => setBrushKind(k)}
                    className={`px-2 py-1 rounded border ${
                      brushKind === k
                        ? 'bg-rose-600 border-rose-500 text-white'
                        : 'bg-[#121722] border-[#2b354b] text-slate-300'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">太さ</span>
                <input
                  type="range"
                  min={4}
                  max={100}
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  className="w-20 h-1.5"
                />
              </div>
              <button
                onClick={handleUndoPaint}
                disabled={!liveryHistoryRef.current.canUndo}
                className="flex items-center gap-1 bg-[#1b2436] hover:bg-[#26324c] disabled:opacity-40 text-slate-200 px-2 py-1 rounded"
                title="元に戻す (Ctrl+Z)"
              >
                <Undo2 className="w-3 h-3" />
                戻す
              </button>
              <button
                onClick={handleLiveryRedo}
                disabled={!liveryHistoryRef.current.canRedo}
                className="flex items-center gap-1 bg-[#1b2436] hover:bg-[#26324c] disabled:opacity-40 text-slate-200 px-2 py-1 rounded"
                title="やり直し (Ctrl+Y)"
              >
                <Redo2 className="w-3 h-3" />
                やり直し
              </button>
            </div>
          )}

          {/* Bottom-Right 2D UV Wireframe Mini-Map */}
          {showUvMiniMap && (
            <div className="absolute bottom-3 right-3 bg-[#0c111b]/92 backdrop-blur border border-[#2b3854] rounded-xl p-2 shadow-2xl">
              <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                <span className="font-mono-num truncate max-w-[115px]">
                  UV: {activeTargetMat?.diffuseTexName}
                </span>
                <span className="font-mono-num text-cyan-300">{textureAdjust.exportResolution}px</span>
              </div>
              <canvas
                ref={uvPreviewCanvasRef}
                width={168}
                height={168}
                onClick={handleUvMiniClick}
                className="w-[168px] h-[168px] rounded border border-[#222b3e] cursor-crosshair"
              />
            </div>
          )}

          {loadingCar && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-xs text-cyan-300">
              車両モデルと全テクスチャスロットを読み込み中...
            </div>
          )}
        </div>
        </DetachablePanel>

        {/* Right: 5-Tab Livery & Material Workstation Panel (Detachable as Settings Only!) */}
        <DetachablePanel
          panelId="livery_workstation"
          title="リバリー & マテリアル設定パネル"
          subtitle={activeTargetMat?.name}
          role="settings"
          mode={panelDetachMode}
          onModeChange={setPanelDetachMode}
          dockedClassName={`${
            viewerDetachMode === 'docked' ? 'xl:col-span-5' : 'xl:col-span-12'
          } bg-[#121722] border border-[#242e42] rounded-xl text-xs`}
          popoutSize={{ width: 560, height: 820 }}
        >
          {/* 5 Workstation Tabs */}
          <div className="grid grid-cols-5 border-b border-[#222b3e] bg-[#0e131d] shrink-0 text-[11px]">
            <button
              onClick={() => setSideTab('presets')}
              className={`py-2.5 px-1 flex items-center justify-center gap-1 font-semibold border-b-2 ${
                sideTab === 'presets'
                  ? 'border-rose-500 text-rose-300 bg-rose-500/10'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">プリセットから選ぶ</span>
            </button>
            <button
              onClick={() => setSideTab('texture_edit')}
              className={`py-2.5 px-1 flex items-center justify-center gap-1 font-semibold border-b-2 ${
                sideTab === 'texture_edit'
                  ? 'border-cyan-500 text-cyan-300 bg-cyan-500/10'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sliders className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">テクスチャ編集</span>
            </button>
            <button
              onClick={() => setSideTab('decals')}
              className={`py-2.5 px-1 flex items-center justify-center gap-1 font-semibold border-b-2 ${
                sideTab === 'decals'
                  ? 'border-amber-500 text-amber-300 bg-amber-500/10'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">デカール ({layers.length})</span>
            </button>
            <button
              onClick={() => setSideTab('brush')}
              className={`py-2.5 px-1 flex items-center justify-center gap-1 font-semibold border-b-2 ${
                sideTab === 'brush'
                  ? 'border-purple-500 text-purple-300 bg-purple-500/10'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Brush className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">3Dブラシ</span>
            </button>
            <button
              onClick={() => setSideTab('export')}
              className={`py-2.5 px-1 flex items-center justify-center gap-1 font-semibold border-b-2 ${
                sideTab === 'export'
                  ? 'border-emerald-500 text-emerald-300 bg-emerald-500/10'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Save className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">保存 ({modifiedMatUuids.length || 1})</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
            {/* =================================================================================
                TAB 1: プリセットから選ぶ (SELECT FROM PRESETS — OEM BODY, EXTERIOR/CARBON, INTERIOR, PLASTIC/TRIM)
               ================================================================================= */}
            {sideTab === 'presets' && (
              <>
                {/* Target Model Material & Model-Conforming Paste Bar */}
                <div className="bg-[#0e131d] border border-[#253047] rounded-xl p-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[10px] text-slate-400">現在の適応先マテリアル / 部位</div>
                      <div className="font-mono-num text-cyan-300 font-semibold truncate">
                        {activeTargetMat?.name ?? '未選択'} ({activeTargetMat?.diffuseTexName ?? '-'})
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        setTool((prev) => (prev === 'pick_apply' ? 'orbit' : 'pick_apply'))
                      }
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold shrink-0 transition-colors ${
                        tool === 'pick_apply'
                          ? 'bg-emerald-600 border-emerald-400 text-white'
                          : 'bg-[#161f30] hover:bg-[#202d45] border-[#2e3c58] text-emerald-300'
                      }`}
                    >
                      <Crosshair className="w-3.5 h-3.5" />
                      {tool === 'pick_apply' ? '3Dクリック貼付ON' : '3Dで部位クリック貼付'}
                    </button>
                  </div>

                  {/* Model-Conforming Paste Scope Toggle */}
                  <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-[#1e2739]">
                    <button
                      onClick={() => setPartPasteScope('whole_material')}
                      className={`py-1.5 px-2 rounded-lg border text-[10px] text-left transition-colors ${
                        partPasteScope === 'whole_material'
                          ? 'bg-cyan-500/15 border-cyan-500 text-cyan-200 font-semibold'
                          : 'bg-[#090c11] border-[#222b3e] text-slate-400'
                      }`}
                    >
                      ● マテリアル全体に適用
                      <span className="block text-[9px] text-slate-400 font-normal">
                        3Dパーツ面積からUV目を自動最適化
                      </span>
                    </button>
                    <button
                      onClick={() => {
                        setPartPasteScope('mesh_uv_region');
                        setTool('pick_apply');
                      }}
                      className={`py-1.5 px-2 rounded-lg border text-[10px] text-left transition-colors ${
                        partPasteScope === 'mesh_uv_region'
                          ? 'bg-amber-500/15 border-amber-500 text-amber-200 font-semibold'
                          : 'bg-[#090c11] border-[#222b3e] text-slate-400'
                      }`}
                    >
                      ● 3Dクリック部位(メッシュ)のみ
                      <span className="block text-[9px] text-slate-400 font-normal">
                        1枚のテクスチャ内の特定部位のみ貼付
                      </span>
                    </button>
                  </div>
                </div>

                {/* 4 Preset Category Sub-Tabs */}
                <div className="grid grid-cols-4 gap-1 bg-[#0a0d13] p-1 rounded-xl border border-[#222b3e] text-[11px]">
                  {(
                    [
                      ['oem_body', 'メーカー純正色'],
                      ['exterior_carbon', '塗装・カーボン'],
                      ['interior', '内装 (革/アルカン)'],
                      ['plastic_metal', '樹脂・成形色・金属'],
                    ] as Array<[PresetSubTab, string]>
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => setPresetSubTab(id)}
                      className={`py-1.5 px-1.5 rounded-lg font-semibold truncate transition-colors ${
                        presetSubTab === id
                          ? 'bg-gradient-to-r from-rose-600 to-amber-600 text-white shadow'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* ----- SUB-TAB 1: メーカー純正色 (OEM MANUFACTURER BODY COLORS) ----- */}
                {presetSubTab === 'oem_body' && (
                  <div className="space-y-3">
                    {/* Step 1: Manufacturer Logo Grid */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-slate-200">
                          1. メーカーロゴを選択 ({OEM_MANUFACTURERS.length}メーカー純正カラーフォルダ)
                        </span>
                        <span className="text-[10px] text-cyan-300 font-mono-num">
                          {activeManufacturer.jpName} ({activeManufacturer.country})
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {OEM_MANUFACTURERS.map((mfg) => {
                          const active = mfg.id === selectedBrandId;
                          const realBadgeUrl = brandBadgeUrlMap.get(mfg.id);
                          return (
                            <button
                              key={mfg.id}
                              onClick={() => setSelectedBrandId(mfg.id)}
                              className={`p-1.5 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${
                                active
                                  ? 'bg-[#1a2336] border-rose-500 text-white shadow-md shadow-rose-500/10'
                                  : 'bg-[#0b0e14] border-[#222b3e] text-slate-300 hover:border-[#3b4a6b]'
                              }`}
                            >
                              <div
                                className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden border border-white/20 shrink-0"
                                style={{
                                  background: realBadgeUrl
                                    ? '#0f172a'
                                    : `radial-gradient(circle at 30% 30%, ${mfg.accentHex}, #0f172a)`,
                                }}
                              >
                                {realBadgeUrl ? (
                                  <img
                                    src={realBadgeUrl}
                                    alt={mfg.name}
                                    className="w-6 h-6 object-contain"
                                  />
                                ) : (
                                  <span className="font-black text-[9px] tracking-tighter text-white">
                                    {mfg.monogram}
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] font-semibold truncate w-full text-center">
                                {mfg.jpName}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Step 2: Coarse Color Family Filter (大まかな色分け) */}
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-semibold text-slate-200 block">
                        2. 大まかな色分けをクリック
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {OEM_COLOR_FAMILIES.map((fam) => {
                          const active = selectedColorFamily === fam.id;
                          return (
                            <button
                              key={fam.id}
                              onClick={() => setSelectedColorFamily(fam.id)}
                              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-medium transition-all ${
                                active
                                  ? 'bg-rose-500/20 border-rose-400 text-white font-semibold'
                                  : 'bg-[#0b0e14] border-[#242e42] text-slate-300 hover:border-[#3b4a6b]'
                              }`}
                            >
                              <span
                                className="w-3 h-3 rounded-full border border-white/30 shrink-0"
                                style={{ background: fam.swatchHex }}
                              />
                              {fam.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Step 3: Official Manufacturer OEM Paint Swatches */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-slate-200">
                          3. {activeManufacturer.jpName} 純正カラー ({filteredOemColors.length}色)
                        </span>
                        <div className="relative w-36">
                          <Search className="w-3 h-3 text-slate-500 absolute left-2 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={oemSearchQuery}
                            onChange={(e) => setOemSearchQuery(e.target.value)}
                            placeholder="色名・コード検索"
                            className="w-full bg-[#090c11] border border-[#242e42] rounded-lg pl-6 pr-2 py-0.5 text-[10px] text-slate-200"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-1.5 max-h-[250px] overflow-y-auto pr-1">
                        {filteredOemColors.map((oem) => {
                          const isCurrentColor =
                            paintState.baseColor.toLowerCase() === oem.baseColor.toLowerCase();
                          return (
                            <button
                              key={oem.id}
                              onClick={() => applyOemColorToTarget(oem)}
                              className={`p-2 rounded-xl border text-left flex items-center gap-2.5 transition-all ${
                                isCurrentColor
                                  ? 'bg-rose-500/15 border-rose-500 text-white'
                                  : 'bg-[#0b0e14] border-[#222b3e] text-slate-200 hover:border-[#3b4a6b]'
                              }`}
                            >
                              <div
                                className="w-9 h-9 rounded-lg shrink-0 border border-white/25 shadow-inner relative overflow-hidden"
                                style={{
                                  background: `linear-gradient(135deg, ${oem.baseColor} 0%, ${oem.baseColor} 60%, ${oem.secondaryColor} 100%)`,
                                }}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono-num text-[10px] px-1.5 py-0.2 bg-[#182235] border border-[#2d3d5c] rounded text-cyan-300 font-semibold">
                                    {oem.code}
                                  </span>
                                  <span className="font-semibold text-[11px] truncate">
                                    {oem.nameJp}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-[10px] text-slate-400 mt-0.5">
                                  <span className="truncate">{oem.nameEn}</span>
                                  <span className="text-amber-300/90 font-mono-num shrink-0 ml-2">
                                    {oem.modelHint}
                                  </span>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* ----- SUB-TAB 2: 外装塗装・カーボン (EXTERIOR PAINT & CARBON COMPOSITE) ----- */}
                {presetSubTab === 'exterior_carbon' && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-semibold text-amber-300 block">
                        カーボンコンポジット (3K綾織 / ドライカーボン / フォージド)
                      </span>
                      <div className="grid grid-cols-1 gap-1.5">
                        {PAINT_MATERIAL_PRESETS.filter((p) => p.category === 'carbon_composite').map(
                          (preset) => {
                            const active = paintState.presetId === preset.id;
                            return (
                              <button
                                key={preset.id}
                                onClick={() => applyMaterialPresetToTarget(preset)}
                                className={`text-left p-2.5 rounded-xl border transition-all flex items-center gap-2.5 ${
                                  active
                                    ? 'bg-amber-500/15 border-amber-500 text-amber-100'
                                    : 'bg-[#0b0e14] border-[#242e42] text-slate-200 hover:border-[#394867]'
                                }`}
                              >
                                <div
                                  className="w-8 h-8 rounded-lg shrink-0 border border-white/25"
                                  style={{ background: preset.swatchGradient }}
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-semibold">{preset.name}</span>
                                    <span className="text-[9px] font-mono-num px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                                      {preset.badge}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-slate-400 truncate mt-0.5">
                                    {preset.description}
                                  </div>
                                </div>
                              </button>
                            );
                          }
                        )}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <span className="text-[11px] font-semibold text-rose-300 block">
                        外装塗装仕上げプリセット (キャンディ / メタリック / マジョーラ / マット / クローム)
                      </span>
                      <div className="grid grid-cols-2 gap-1.5">
                        {PAINT_MATERIAL_PRESETS.filter((p) => p.category === 'exterior_paint').map(
                          (preset) => {
                            const active = paintState.presetId === preset.id;
                            return (
                              <button
                                key={preset.id}
                                onClick={() => applyMaterialPresetToTarget(preset)}
                                className={`text-left p-2 rounded-xl border transition-all flex items-center gap-2 ${
                                  active
                                    ? 'bg-rose-500/15 border-rose-500 text-rose-100'
                                    : 'bg-[#0b0e14] border-[#242e42] text-slate-300 hover:border-[#394867]'
                                }`}
                              >
                                <div
                                  className="w-7 h-7 rounded-full shrink-0 border border-white/25"
                                  style={{ background: preset.swatchGradient }}
                                />
                                <div className="min-w-0">
                                  <div className="text-[11px] font-semibold truncate">
                                    {preset.name}
                                  </div>
                                  <div className="text-[9px] font-mono-num text-slate-400">
                                    {preset.badge}
                                  </div>
                                </div>
                              </button>
                            );
                          }
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* ----- SUB-TAB 3: 内装素材 (INTERIOR MATERIALS: ALCANTARA, NAPPA LEATHER, SYNTHETIC LEATHER, FABRIC) ----- */}
                {presetSubTab === 'interior' && (
                  <div className="space-y-2.5">
                    <div className="bg-[#0e131d] border border-[#222b3e] rounded-xl p-2.5 flex items-center justify-between">
                      <span className="text-[11px] text-slate-300">
                        内装素材のシボ・起毛を維持して色のみ変更:
                      </span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="color"
                          value={paintState.baseColor}
                          onChange={(e) =>
                            updatePaintState((p) => ({ ...p, baseColor: e.target.value }))
                          }
                          className="w-6 h-6 bg-transparent cursor-pointer"
                        />
                        <span className="font-mono-num text-[11px] text-cyan-300">
                          {paintState.baseColor}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-1.5 max-h-[370px] overflow-y-auto pr-1">
                      {PAINT_MATERIAL_PRESETS.filter((p) => p.category === 'interior_material').map(
                        (preset) => {
                          const active = paintState.presetId === preset.id;
                          return (
                            <button
                              key={preset.id}
                              onClick={() => applyMaterialPresetToTarget(preset)}
                              className={`text-left p-2 rounded-xl border transition-all flex items-center gap-2.5 ${
                                active
                                  ? 'bg-cyan-500/15 border-cyan-500 text-cyan-100'
                                  : 'bg-[#0b0e14] border-[#242e42] text-slate-200 hover:border-[#394867]'
                              }`}
                            >
                              <div
                                className="w-8 h-8 rounded-lg shrink-0 border border-white/25"
                                style={{ background: preset.swatchGradient }}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] font-semibold truncate">
                                    {preset.name}
                                  </span>
                                  <span className="text-[9px] font-mono-num px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 shrink-0">
                                    {preset.badge}
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-400 truncate">
                                  {preset.description}
                                </div>
                              </div>
                            </button>
                          );
                        }
                      )}
                    </div>
                  </div>
                )}

                {/* ----- SUB-TAB 4: 樹脂・成形色・ラバー・金属 (MOULDED BLACK PLASTIC, ABS TRIM, RUBBER, BRUSHED METAL) ----- */}
                {presetSubTab === 'plastic_metal' && (
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-1 gap-1.5 max-h-[410px] overflow-y-auto pr-1">
                      {PAINT_MATERIAL_PRESETS.filter((p) => p.category === 'plastic_metal').map(
                        (preset) => {
                          const active = paintState.presetId === preset.id;
                          return (
                            <button
                              key={preset.id}
                              onClick={() => applyMaterialPresetToTarget(preset)}
                              className={`text-left p-2.5 rounded-xl border transition-all flex items-center gap-2.5 ${
                                active
                                  ? 'bg-emerald-500/15 border-emerald-500 text-emerald-100'
                                  : 'bg-[#0b0e14] border-[#242e42] text-slate-200 hover:border-[#394867]'
                              }`}
                            >
                              <div
                                className="w-8 h-8 rounded-lg shrink-0 border border-white/25"
                                style={{ background: preset.swatchGradient }}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] font-semibold truncate">
                                    {preset.name}
                                  </span>
                                  <span className="text-[9px] font-mono-num px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 shrink-0">
                                    {preset.badge}
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-400 truncate mt-0.5">
                                  {preset.description}
                                </div>
                              </div>
                            </button>
                          );
                        }
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* =================================================================================
                TAB 2: テクスチャごとの詳細編集 (DETAILED PER-TEXTURE / PER-MATERIAL EDITOR)
               ================================================================================= */}
            {sideTab === 'texture_edit' && (
              <>
                {/* 1. Categorized Texture / Material Slot Selector */}
                <div className="bg-[#0e131d] border border-[#242e42] rounded-xl p-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200">
                      車両テクスチャ・マテリアル一覧 ({filteredMaterialOptions.length}/
                      {materialOptions.length})
                    </span>
                    <button
                      onClick={handleResetCurrentTextureSlot}
                      className="flex items-center gap-1 text-[10px] bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded"
                      title="現在選択中のテクスチャの編集を破棄して元KN5の状態に戻します"
                    >
                      <RotateCcw className="w-3 h-3" />
                      このテクスチャを初期化
                    </button>
                  </div>

                  {/* Category Filter Pills + Search */}
                  <div className="flex flex-wrap gap-1">
                    {(
                      [
                        ['all', 'すべて'],
                        ['exterior', '外装'],
                        ['interior', '内装'],
                        ['plastic_metal', '樹脂・金属'],
                        ['wheel_other', 'ホイール・他'],
                      ] as Array<[MaterialGroupFilter, string]>
                    ).map(([id, lbl]) => (
                      <button
                        key={id}
                        onClick={() => setMatGroupFilter(id)}
                        className={`px-2 py-0.5 rounded-md text-[10px] border ${
                          matGroupFilter === id
                            ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 font-semibold'
                            : 'bg-[#090c11] border-[#222b3e] text-slate-400'
                        }`}
                      >
                        {lbl}
                      </button>
                    ))}
                    <input
                      type="text"
                      value={matSearchQuery}
                      onChange={(e) => setMatSearchQuery(e.target.value)}
                      placeholder="テクスチャ検索..."
                      className="flex-1 min-w-[90px] bg-[#090c11] border border-[#222b3e] rounded-md px-2 py-0.5 text-[10px] text-slate-200"
                    />
                  </div>

                  {/* Scrollable Texture Slot List */}
                  <div className="max-h-[125px] overflow-y-auto space-y-1 pr-1">
                    {filteredMaterialOptions.map((opt) => {
                      const active = opt.uuid === activeTargetMat?.uuid;
                      const isMod = modifiedMatUuids.includes(opt.uuid);
                      return (
                        <button
                          key={opt.uuid}
                          onClick={() => selectMaterialSlot(opt)}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg border flex items-center justify-between gap-2 transition-colors ${
                            active
                              ? 'bg-cyan-500/15 border-cyan-500 text-white'
                              : 'bg-[#090c11] border-[#1f2738] text-slate-300 hover:bg-[#131a28]'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-[11px] truncate">{opt.name}</span>
                              {isMod && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-semibold shrink-0">
                                  編集済
                                </span>
                              )}
                            </div>
                            <div className="font-mono-num text-[10px] text-slate-400 truncate">
                              txDiffuse: {opt.diffuseTexName} ({opt.meshes.length} mesh)
                            </div>
                          </div>
                          {active && <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Base Composition Mode Toggle & Color / Gradient Controls */}
                <div className="bg-[#0e131d] border border-[#222b3e] rounded-xl p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200">ベーステクスチャ合成モード</span>
                    <select
                      value={textureAdjust.exportResolution}
                      onChange={(e) =>
                        updateTextureAdjust((p) => ({
                          ...p,
                          exportResolution: Number(e.target.value) as SkinExportResolution,
                        }))
                      }
                      className="bg-[#090c11] border border-[#2b354b] rounded px-2 py-0.5 font-mono-num text-[10px] text-cyan-300"
                      title="このテクスチャの書き出し解像度 (既定値は設定画面から変更可能)"
                    >
                      <option value={1024}>出力解像度: 1024×1024</option>
                      <option value={2048}>出力解像度: 2048×2048</option>
                      <option value={4096}>出力解像度: 4096×4096 (標準4K)</option>
                      <option value={8192}>出力解像度: 8192×8192 (8K極精細)</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() =>
                        updateTextureAdjust((p) => ({ ...p, baseMode: 'paint_or_preset' }))
                      }
                      className={`py-1.5 px-2 rounded-lg border text-[10px] font-semibold ${
                        textureAdjust.baseMode === 'paint_or_preset'
                          ? 'bg-rose-500/20 border-rose-500 text-rose-200'
                          : 'bg-[#090c11] border-[#222b3e] text-slate-400'
                      }`}
                    >
                      ペイント・素材プリセット塗り
                    </button>
                    <button
                      onClick={() =>
                        updateTextureAdjust((p) => ({ ...p, baseMode: 'original_adjust' }))
                      }
                      className={`py-1.5 px-2 rounded-lg border text-[10px] font-semibold ${
                        textureAdjust.baseMode === 'original_adjust'
                          ? 'bg-cyan-500/20 border-cyan-500 text-cyan-200'
                          : 'bg-[#090c11] border-[#222b3e] text-slate-400'
                      }`}
                    >
                      元テクスチャ維持＋色調編集
                    </button>
                  </div>

                  {textureAdjust.baseMode === 'paint_or_preset' && (
                    <>
                      <div className="flex items-center justify-between pt-1">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="color"
                            value={paintState.baseColor}
                            onChange={(e) =>
                              updatePaintState((p) => ({ ...p, baseColor: e.target.value }))
                            }
                            className="w-6 h-6 bg-transparent cursor-pointer"
                          />
                          <span className="font-mono-num text-[11px] text-slate-200">
                            {paintState.baseColor}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="color"
                            value={paintState.secondaryColor}
                            onChange={(e) =>
                              updatePaintState((p) => ({ ...p, secondaryColor: e.target.value }))
                            }
                            className="w-6 h-6 bg-transparent cursor-pointer"
                          />
                          <label className="flex items-center gap-1 text-[10px] text-slate-400 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={paintState.useGradient}
                              onChange={(e) =>
                                updatePaintState((p) => ({ ...p, useGradient: e.target.checked }))
                              }
                              className="accent-rose-500"
                            />
                            2トーン
                          </label>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {POPULAR_SWATCHES.map((hex) => (
                          <button
                            key={hex}
                            onClick={() => updatePaintState((p) => ({ ...p, baseColor: hex }))}
                            className="w-5 h-5 rounded-full border border-white/25 hover:scale-110 transition-transform"
                            style={{ backgroundColor: hex }}
                          />
                        ))}
                      </div>

                      <div className="flex items-center gap-2 pt-1 border-t border-[#1e2739]">
                        <span className="text-[11px] text-slate-400 w-28">元AO/パネル線維持</span>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.02}
                          value={paintState.baseTextureBlend}
                          onChange={(e) =>
                            updatePaintState((p) => ({
                              ...p,
                              baseTextureBlend: Number(e.target.value),
                            }))
                          }
                          className="flex-1 h-1.5 accent-emerald-400"
                        />
                        <span className="font-mono-num text-[11px] w-10 text-right text-emerald-300">
                          {Math.round(paintState.baseTextureBlend * 100)}%
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* 3. Per-Texture Color Grading & Tone Adjustment (色調・トーン詳細補正) */}
                <div className="bg-[#0e131d] border border-[#222b3e] rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-cyan-300">
                      テクスチャ色調・トーン詳細補正
                    </span>
                    <button
                      onClick={() =>
                        updateTextureAdjust((p) => ({
                          ...DEFAULT_TEXTURE_ADJUSTMENTS,
                          baseMode: p.baseMode,
                          exportResolution: p.exportResolution,
                        }))
                      }
                      className="text-[10px] text-slate-400 hover:text-slate-200 underline"
                    >
                      色調リセット
                    </button>
                  </div>

                  {(
                    [
                      ['brightness', '明度 (Brightness)', -0.6, 0.6, 0.02],
                      ['contrast', 'コントラスト (Contrast)', -0.6, 0.6, 0.02],
                      ['saturation', '彩度 (Saturation)', -1.0, 1.0, 0.02],
                      ['hueShiftDeg', '色相シフト (Hue °)', -180, 180, 2],
                      ['gamma', 'ガンマ補正 (Gamma)', 0.4, 2.2, 0.02],
                    ] as const
                  ).map(([key, label, min, max, step]) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="w-32 text-[11px] text-slate-400 truncate">{label}</span>
                      <input
                        type="range"
                        min={min}
                        max={max}
                        step={step}
                        value={textureAdjust[key]}
                        onChange={(e) =>
                          updateTextureAdjust((p) => ({ ...p, [key]: Number(e.target.value) }))
                        }
                        className="flex-1 h-1.5 accent-cyan-400"
                      />
                      <span className="w-11 text-right font-mono-num text-[10px] text-slate-200">
                        {key === 'hueShiftDeg'
                          ? `${textureAdjust[key]}°`
                          : textureAdjust[key].toFixed(2)}
                      </span>
                    </div>
                  ))}

                  {/* Color Tint Filter */}
                  <div className="flex items-center gap-2 pt-1 border-t border-[#1e2739]">
                    <span className="text-[11px] text-slate-400 w-20">カラーティント</span>
                    <input
                      type="color"
                      value={textureAdjust.tintColor}
                      onChange={(e) =>
                        updateTextureAdjust((p) => ({ ...p, tintColor: e.target.value }))
                      }
                      className="w-5 h-5 bg-transparent cursor-pointer"
                    />
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.02}
                      value={textureAdjust.tintStrength}
                      onChange={(e) =>
                        updateTextureAdjust((p) => ({
                          ...p,
                          tintStrength: Number(e.target.value),
                        }))
                      }
                      className="flex-1 h-1.5 accent-rose-400"
                    />
                    <select
                      value={textureAdjust.tintMode}
                      onChange={(e) =>
                        updateTextureAdjust((p) => ({
                          ...p,
                          tintMode: e.target.value as 'multiply' | 'overlay' | 'screen',
                        }))
                      }
                      className="bg-[#090c11] border border-[#2b354b] rounded px-1.5 py-0.5 text-[10px]"
                    >
                      <option value="multiply">乗算</option>
                      <option value="overlay">オーバーレイ</option>
                      <option value="screen">スクリーン</option>
                    </select>
                  </div>
                </div>

                {/* 4. Surface Pattern (Carbon / Alcantara / Leather / Moulded Plastic) & UV Scale */}
                <div className="bg-[#0e131d] border border-[#222b3e] rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-amber-300">
                      表面素材パターン・シボ・織り目 (CSP txDetail/NM)
                    </span>
                    <button
                      onClick={handleAutoCalibrateCurrentMaterialUv}
                      className="flex items-center gap-1 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-200 px-2 py-0.5 rounded text-[10px]"
                      title="3Dモデルのポリゴン面積から最適なUVスケールを自動算出します"
                    >
                      <Wand2 className="w-3 h-3" />
                      3Dモデル寸法に合わせる
                    </button>
                  </div>

                  <select
                    value={resolveActiveSurfacePattern(paintState)}
                    onChange={(e) => {
                      const pat = e.target.value as SurfacePatternType;
                      updatePaintState((p) => ({
                        ...p,
                        surfacePattern: pat,
                        carbonPattern: pat === 'carbon_twill',
                      }));
                    }}
                    className="w-full bg-[#090c11] border border-[#2b354b] rounded-lg px-2.5 py-1.5 text-[11px] text-amber-200"
                  >
                    {SURFACE_PATTERN_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>

                  {resolveActiveSurfacePattern(paintState) !== 'none' && (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center gap-2">
                        <span className="w-32 text-[11px] text-slate-400">
                          目の細かさ (UV倍率)
                        </span>
                        <input
                          type="range"
                          min={10}
                          max={250}
                          step={2}
                          value={paintState.carbonWeaveScale}
                          onChange={(e) =>
                            updatePaintState((p) => ({
                              ...p,
                              carbonWeaveScale: Number(e.target.value),
                            }))
                          }
                          className="flex-1 h-1.5 accent-amber-400"
                        />
                        <span className="w-11 text-right font-mono-num text-[10px] text-amber-200">
                          {paintState.carbonWeaveScale}×
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="w-32 text-[11px] text-slate-400">
                          凹凸ノーマル強度
                        </span>
                        <input
                          type="range"
                          min={0.1}
                          max={1.6}
                          step={0.05}
                          value={paintState.normalStrength ?? 0.85}
                          onChange={(e) =>
                            updatePaintState((p) => ({
                              ...p,
                              normalStrength: Number(e.target.value),
                            }))
                          }
                          className="flex-1 h-1.5 accent-amber-400"
                        />
                        <span className="w-11 text-right font-mono-num text-[10px] text-amber-200">
                          {(paintState.normalStrength ?? 0.85).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* 5. PBR / CSP Shader Parameters */}
                <div className="bg-[#0e131d] border border-[#222b3e] rounded-xl p-3 space-y-1.5">
                  <span className="font-semibold text-slate-200 block">
                    PBR / CSPシェーダー反射パラメーター
                  </span>
                  {(
                    [
                      ['metalness', 'メタリック度 (Metalness)', 0, 1, 0.01],
                      ['roughness', '表面の粗さ (Roughness)', 0.02, 0.96, 0.01],
                      ['clearcoat', 'クリアコート層 (Clearcoat)', 0, 1, 0.01],
                      ['clearcoatRoughness', 'クリア光沢粗さ', 0.01, 0.5, 0.01],
                      ['fresnelMax', 'フレネル反射強度', 0.05, 1, 0.01],
                      ['iridescence', 'パール / マジョーラ偏光', 0, 1, 0.02],
                      ['flakeIntensity', 'メタリックフレーク粒感', 0, 1, 0.02],
                      ['envIntensity', '環境反射ブースト (CSP)', 0.3, 2.5, 0.05],
                    ] as const
                  ).map(([key, label, min, max, step]) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="w-36 text-[11px] text-slate-400 truncate">{label}</span>
                      <input
                        type="range"
                        min={min}
                        max={max}
                        step={step}
                        value={paintState[key]}
                        onChange={(e) =>
                          updatePaintState((p) => ({ ...p, [key]: Number(e.target.value) }))
                        }
                        className="flex-1 h-1.5 accent-cyan-400"
                      />
                      <span className="w-10 text-right font-mono-num text-[10px] text-slate-200">
                        {paintState[key].toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* =================================================================================
                TAB 3: デカール・部位貼付レイヤー (DECALS & 3D PART UV MASK LAYERS)
               ================================================================================= */}
            {sideTab === 'decals' && (
              <>
                <div className="flex gap-2">
                  <button
                    onClick={handleAddExternalImageDecal}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white font-semibold py-2 px-3 rounded-xl shadow-md"
                  >
                    <ImagePlus className="w-4 h-4" />
                    画像を貼り付け (.png / .jpg / .webp)
                  </button>
                </div>

                {/* GT7-Style 3D Camera / Surface Decal Projection Mode Selector */}
                <div className="bg-[#0e131d] border border-amber-500/35 rounded-xl p-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-semibold text-amber-200">
                        GT7式 3Dモデル直接投影モード
                      </div>
                      <div className="text-[10px] text-slate-400">
                        UV展開図ではなく表示中の3D車体へ直接プロジェクション貼付（曲面・シーム跨ぎ対応）
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => setDecalProjMode('camera')}
                      className={`py-1.5 px-2 rounded-lg border text-[10px] font-semibold transition-colors ${
                        decalProjMode === 'camera'
                          ? 'bg-amber-600 border-amber-400 text-white'
                          : 'bg-[#090c11] border-[#2b354b] text-slate-300 hover:bg-[#141b29]'
                      }`}
                    >
                      カメラ基準 (GT7標準)
                    </button>
                    <button
                      onClick={() => setDecalProjMode('surface')}
                      className={`py-1.5 px-2 rounded-lg border text-[10px] font-semibold transition-colors ${
                        decalProjMode === 'surface'
                          ? 'bg-amber-600 border-amber-400 text-white'
                          : 'bg-[#090c11] border-[#2b354b] text-slate-300 hover:bg-[#141b29]'
                      }`}
                    >
                      ボディ表面基準 (曲面密着)
                    </button>
                  </div>
                </div>

                {/* Built-in GT7/Forza style racing shapes */}
                <div className="space-y-1.5">
                  <span className="text-[11px] text-slate-400 block">
                    内蔵レーシングデカール＆テキスト追加 (現在の3D視点中央へ自動投影)
                  </span>
                  <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                    {(
                      [
                        ['stripe_center', 'センター2本ライン'],
                        ['stripe_slash', '斜めスラッシュ帯'],
                        ['number_plate_circle', '丸型ゼッケン'],
                        ['number_plate_gt', 'GT角型ゼッケン'],
                        ['checker_band', 'チェッカーフラッグ'],
                        ['text', 'カスタム文字ロゴ'],
                        ['star', 'スター'],
                        ['arrow', 'レーシングアロー'],
                      ] as Array<[DecalKind, string]>
                    ).map(([k, lbl]) => (
                      <button
                        key={k}
                        onClick={() => handleAddBuiltInDecal(k)}
                        className="bg-[#0e131d] hover:bg-[#1a2336] border border-[#242e42] text-slate-200 py-1.5 px-2 rounded-lg text-left truncate"
                      >
                        + {lbl}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Selected Layer Transform Inspector */}
                {selectedLayer && (
                  <div className="bg-[#0e131d] border border-amber-500/40 rounded-xl p-3 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <input
                        type="text"
                        value={selectedLayer.name}
                        onChange={(e) => updateSelectedLayer({ name: e.target.value })}
                        className="flex-1 bg-[#080b10] border border-[#2b354b] rounded px-2 py-1 text-slate-100 font-semibold"
                      />
                      {selectedLayer.kind !== 'mesh_uv_mask' && (
                        <button
                          onClick={handleReprojectSelectedFromCamera}
                          className="flex items-center gap-1 bg-amber-500/20 hover:bg-amber-500/35 text-amber-200 border border-amber-500/40 px-2 py-1 rounded text-[10px] shrink-0"
                          title="選択中デカールを現在の3Dカメラ視点に合わせて再投影します"
                        >
                          <RefreshCw className="w-3 h-3" />
                          再投影
                        </button>
                      )}
                    </div>

                    {/* GT7 2-Mode Opposite Side Duplication Buttons */}
                    {selectedLayer.kind !== 'mesh_uv_mask' && (
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          onClick={() => handleMirrorDuplicateLayer(selectedLayer, false)}
                          className="flex items-center justify-center gap-1 bg-cyan-600/20 hover:bg-cyan-600/35 text-cyan-200 border border-cyan-500/35 px-2 py-1 rounded text-[10px]"
                          title="ライン・模様などを車体反対側へ左右反転して対称複製します"
                        >
                          <FlipHorizontal2 className="w-3 h-3" />
                          反対側に反転複製 (対称)
                        </button>
                        <button
                          onClick={() => handleMirrorDuplicateLayer(selectedLayer, true)}
                          className="flex items-center justify-center gap-1 bg-emerald-600/20 hover:bg-emerald-600/35 text-emerald-200 border border-emerald-500/35 px-2 py-1 rounded text-[10px]"
                          title="ゼッケン番号やスポンサーロゴを文字が読める向きのまま反対側へ複製します"
                        >
                          <Copy className="w-3 h-3" />
                          反対側に複製 (文字維持)
                        </button>
                      </div>
                    )}

                    {(selectedLayer.kind === 'text' ||
                      selectedLayer.kind === 'number_plate_circle' ||
                      selectedLayer.kind === 'number_plate_gt') && (
                      <div className="flex items-center gap-1.5">
                        <Type className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <input
                          type="text"
                          value={selectedLayer.text ?? ''}
                          onChange={(e) => updateSelectedLayer({ text: e.target.value })}
                          placeholder="文字・ゼッケン番号"
                          className="flex-1 bg-[#080b10] border border-[#2b354b] rounded px-2 py-1 text-slate-100"
                        />
                      </div>
                    )}

                    {selectedLayer.kind !== 'image' && (
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="text-slate-400">カラー</span>
                        <input
                          type="color"
                          value={selectedLayer.color}
                          onChange={(e) => updateSelectedLayer({ color: e.target.value })}
                          className="w-6 h-6 bg-transparent cursor-pointer"
                        />
                        {selectedLayer.kind !== 'mesh_uv_mask' && (
                          <>
                            <span className="text-slate-400 ml-2">アクセント/縁</span>
                            <input
                              type="color"
                              value={selectedLayer.accentColor || '#111827'}
                              onChange={(e) =>
                                updateSelectedLayer({ accentColor: e.target.value })
                              }
                              className="w-6 h-6 bg-transparent cursor-pointer"
                            />
                          </>
                        )}
                      </div>
                    )}

                    {selectedLayer.kind !== 'mesh_uv_mask' && selectedLayer.projection3d ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] text-amber-300/90 border-b border-[#222b3e] pb-1">
                          <span>
                            3D空間プロジェクション ({selectedLayer.projection3d.mode === 'camera' ? 'カメラ基準' : '表面基準'})
                          </span>
                          <button
                            onClick={() => setDecalAspectLock((v) => !v)}
                            className={`flex items-center gap-1 px-1.5 py-0.5 rounded border ${
                              decalAspectLock
                                ? 'bg-amber-500/20 border-amber-500/50 text-amber-200'
                                : 'bg-[#090c11] border-[#2b354b] text-slate-400'
                            }`}
                          >
                            {decalAspectLock ? (
                              <Lock className="w-2.5 h-2.5" />
                            ) : (
                              <Unlock className="w-2.5 h-2.5" />
                            )}
                            縦横比{decalAspectLock ? '固定' : '自由'}
                          </button>
                        </div>

                        {/* Width (cm) */}
                        <div className="flex items-center gap-2">
                          <span className="w-24 text-[11px] text-slate-400">横幅 (実寸)</span>
                          <input
                            type="range"
                            min={0.05}
                            max={3.0}
                            step={0.01}
                            value={selectedLayer.projection3d.widthM}
                            onChange={(e) =>
                              updateSelectedProjection3d(
                                { widthM: Number(e.target.value) },
                                'width'
                              )
                            }
                            className="flex-1 h-1.5 accent-amber-400"
                          />
                          <span className="w-12 text-right font-mono-num text-[10px] text-amber-200">
                            {Math.round(selectedLayer.projection3d.widthM * 100)}cm
                          </span>
                        </div>

                        {/* Height (cm) */}
                        <div className="flex items-center gap-2">
                          <span className="w-24 text-[11px] text-slate-400">縦幅 (実寸)</span>
                          <input
                            type="range"
                            min={0.05}
                            max={3.0}
                            step={0.01}
                            value={selectedLayer.projection3d.heightM}
                            onChange={(e) =>
                              updateSelectedProjection3d(
                                { heightM: Number(e.target.value) },
                                'height'
                              )
                            }
                            className="flex-1 h-1.5 accent-amber-400"
                          />
                          <span className="w-12 text-right font-mono-num text-[10px] text-amber-200">
                            {Math.round(selectedLayer.projection3d.heightM * 100)}cm
                          </span>
                        </div>

                        {/* Rotation (°) */}
                        <div className="flex items-center gap-2">
                          <span className="w-24 text-[11px] text-slate-400">回転角度 (°)</span>
                          <input
                            type="range"
                            min={-180}
                            max={180}
                            step={1}
                            value={selectedLayer.rotationDeg}
                            onChange={(e) =>
                              updateSelectedLayer({ rotationDeg: Number(e.target.value) })
                            }
                            className="flex-1 h-1.5 accent-amber-400"
                          />
                          <span className="w-12 text-right font-mono-num text-[10px]">
                            {selectedLayer.rotationDeg}°
                          </span>
                        </div>

                        {/* GT7 Projection Depth Limit (投影深度) */}
                        <div className="flex items-center gap-2">
                          <span className="w-24 text-[11px] text-slate-400">投影深度制限</span>
                          <input
                            type="range"
                            min={0.05}
                            max={1.8}
                            step={0.02}
                            value={selectedLayer.projection3d.depthM}
                            onChange={(e) =>
                              updateSelectedProjection3d({ depthM: Number(e.target.value) })
                            }
                            className="flex-1 h-1.5 accent-cyan-400"
                          />
                          <span className="w-12 text-right font-mono-num text-[10px] text-cyan-200">
                            {Math.round(selectedLayer.projection3d.depthM * 100)}cm
                          </span>
                        </div>

                        {/* GT7 Angle Cutoff Limit (角度制限) */}
                        <div className="flex items-center gap-2">
                          <span className="w-24 text-[11px] text-slate-400">曲面角度制限</span>
                          <input
                            type="range"
                            min={20}
                            max={89}
                            step={1}
                            value={selectedLayer.projection3d.angleLimitDeg}
                            onChange={(e) =>
                              updateSelectedProjection3d({
                                angleLimitDeg: Number(e.target.value),
                              })
                            }
                            className="flex-1 h-1.5 accent-cyan-400"
                          />
                          <span className="w-12 text-right font-mono-num text-[10px] text-cyan-200">
                            {selectedLayer.projection3d.angleLimitDeg}°
                          </span>
                        </div>

                        {/* Opacity */}
                        <div className="flex items-center gap-2">
                          <span className="w-24 text-[11px] text-slate-400">不透明度</span>
                          <input
                            type="range"
                            min={0.05}
                            max={1}
                            step={0.02}
                            value={selectedLayer.opacity}
                            onChange={(e) =>
                              updateSelectedLayer({ opacity: Number(e.target.value) })
                            }
                            className="flex-1 h-1.5 accent-amber-400"
                          />
                          <span className="w-12 text-right font-mono-num text-[10px]">
                            {Math.round(selectedLayer.opacity * 100)}%
                          </span>
                        </div>
                      </div>
                    ) : selectedLayer.kind !== 'mesh_uv_mask' ? (
                      <div className="space-y-1.5">
                        <button
                          onClick={handleReprojectSelectedFromCamera}
                          className="w-full py-1 px-2 rounded bg-amber-600/25 hover:bg-amber-600/40 border border-amber-500/50 text-amber-200 text-[10px] font-semibold"
                        >
                          GT7式 3Dモデル投影へ変換 (現在のカメラ視点へ配置)
                        </button>
                        {(
                          [
                            ['u', '位置 U (横)', 0, 1, 0.005],
                            ['v', '位置 V (縦)', 0, 1, 0.005],
                            ['scaleX', '幅 Scale X', 0.02, 1.8, 0.01],
                            ['scaleY', '高さ Scale Y', 0.02, 1.8, 0.01],
                            ['rotationDeg', '回転角度 (°)', -180, 180, 1],
                            ['opacity', '不透明度', 0.05, 1, 0.02],
                          ] as const
                        ).map(([k, lbl, min, max, step]) => (
                          <div key={k} className="flex items-center gap-2">
                            <span className="w-24 text-[11px] text-slate-400">{lbl}</span>
                            <input
                              type="range"
                              min={min}
                              max={max}
                              step={step}
                              value={selectedLayer[k]}
                              onChange={(e) =>
                                updateSelectedLayer({ [k]: Number(e.target.value) })
                              }
                              className="flex-1 h-1.5 accent-amber-400"
                            />
                            <span className="w-11 text-right font-mono-num text-[10px]">
                              {k === 'rotationDeg'
                                ? `${selectedLayer[k]}°`
                                : selectedLayer[k].toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="w-24 text-[11px] text-slate-400">部位不透明度</span>
                        <input
                          type="range"
                          min={0.05}
                          max={1}
                          step={0.02}
                          value={selectedLayer.opacity}
                          onChange={(e) =>
                            updateSelectedLayer({ opacity: Number(e.target.value) })
                          }
                          className="flex-1 h-1.5 accent-amber-400"
                        />
                        <span className="w-11 text-right font-mono-num text-[10px]">
                          {Math.round(selectedLayer.opacity * 100)}%
                        </span>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <select
                        value={selectedLayer.blendMode}
                        onChange={(e) =>
                          updateSelectedLayer({
                            blendMode: e.target.value as GlobalCompositeOperation,
                          })
                        }
                        className="bg-[#080b10] border border-[#2b354b] rounded px-2 py-1 text-[11px]"
                      >
                        <option value="source-over">合成: 通常 (Normal)</option>
                        <option value="multiply">合成: 乗算 (Multiply)</option>
                        <option value="screen">合成: スクリーン (Screen)</option>
                        <option value="overlay">合成: オーバーレイ</option>
                      </select>
                      {selectedLayer.kind !== 'mesh_uv_mask' && (
                        <div className="flex items-center gap-2.5">
                          <label className="flex items-center gap-1 text-[11px] text-slate-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedLayer.flipX}
                              onChange={(e) => updateSelectedLayer({ flipX: e.target.checked })}
                              className="accent-cyan-500"
                            />
                            左右反転
                          </label>
                          <label className="flex items-center gap-1 text-[11px] text-slate-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={Boolean(selectedLayer.flipY)}
                              onChange={(e) => updateSelectedLayer({ flipY: e.target.checked })}
                              className="accent-cyan-500"
                            />
                            <FlipVertical2 className="w-3 h-3 text-slate-400" />
                            上下反転
                          </label>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Layer Stack List */}
                <div className="space-y-1.5">
                  <span className="text-[11px] text-slate-400 font-semibold block">
                    「{activeTargetMat?.name}」のレイヤー一覧 (上が手前)
                  </span>
                  {layers.length === 0 ? (
                    <div className="text-center py-5 text-[11px] text-slate-500 border border-dashed border-[#242e42] rounded-xl">
                      レイヤーはまだありません。上のボタンからデカールを追加するか、「プリセットから選ぶ」→「3Dクリック部位のみ」でパーツ素材を追加できます。
                    </div>
                  ) : (
                    [...layers].reverse().map((l) => {
                      const active = l.id === selectedLayerId;
                      return (
                        <div
                          key={l.id}
                          onClick={() => setSelectedLayerId(l.id)}
                          className={`p-2 rounded-lg border flex items-center justify-between gap-1.5 cursor-pointer ${
                            active
                              ? 'bg-amber-500/15 border-amber-500/60 text-amber-100'
                              : 'bg-[#0b0e14] border-[#222b3e] text-slate-300 hover:bg-[#141b29]'
                          }`}
                        >
                          <span className="truncate text-[11px] font-medium flex-1">
                            {l.kind === 'mesh_uv_mask' ? '🧩 ' : l.projection3d ? '🎯 ' : ''}
                            {l.name}
                          </span>
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMoveLayer(l.id, 1);
                              }}
                              className="p-1 text-slate-400 hover:text-white"
                            >
                              <ArrowUp className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMoveLayer(l.id, -1);
                              }}
                              className="p-1 text-slate-400 hover:text-white"
                            >
                              <ArrowDown className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                commitLayersChange(
                                  layersRef.current.map((x) =>
                                    x.id === l.id ? { ...x, visible: !x.visible } : x
                                  ),
                                  undefined,
                                  `レイヤー表示切替: ${l.name}`
                                );
                              }}
                              className="p-1 text-slate-400 hover:text-white"
                            >
                              {l.visible ? (
                                <Eye className="w-3 h-3" />
                              ) : (
                                <EyeOff className="w-3 h-3 text-rose-400" />
                              )}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const dup: LiveryLayer = {
                                  ...l,
                                  id: `dup_${Date.now()}`,
                                  name: `${l.name} copy`,
                                  u: Math.min(0.95, l.u + 0.05),
                                  ...(l.projection3d
                                    ? {
                                        projection3d: {
                                          ...l.projection3d,
                                          origin: [
                                            Number(
                                              (
                                                l.projection3d.origin[0] +
                                                l.projection3d.right[0] * 0.08
                                              ).toFixed(4)
                                            ),
                                            Number(
                                              (
                                                l.projection3d.origin[1] +
                                                l.projection3d.right[1] * 0.08
                                              ).toFixed(4)
                                            ),
                                            Number(
                                              (
                                                l.projection3d.origin[2] +
                                                l.projection3d.right[2] * 0.08
                                              ).toFixed(4)
                                            ),
                                          ] as [number, number, number],
                                          forward: [...l.projection3d.forward] as [
                                            number,
                                            number,
                                            number,
                                          ],
                                          right: [...l.projection3d.right] as [
                                            number,
                                            number,
                                            number,
                                          ],
                                          up: [...l.projection3d.up] as [number, number, number],
                                        },
                                      }
                                    : {}),
                                };
                                commitLayersChange(
                                  [...layersRef.current, dup],
                                  dup.id,
                                  `レイヤー複製: ${l.name}`
                                );
                              }}
                              className="p-1 text-slate-400 hover:text-cyan-300"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                commitLayersChange(
                                  layersRef.current.filter((x) => x.id !== l.id),
                                  selectedLayerId === l.id ? null : undefined,
                                  `レイヤー削除: ${l.name}`
                                );
                              }}
                              className="p-1 text-slate-400 hover:text-rose-400"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}

            {/* =================================================================================
                TAB 4: 3Dダイレクトペイントブラシ (3D DIRECT PAINT BRUSH)
               ================================================================================= */}
            {sideTab === 'brush' && (
              <div className="space-y-3.5">
                <div className="bg-[#0e131d] border border-cyan-500/30 rounded-xl p-3 space-y-2">
                  <div className="font-semibold text-cyan-300">
                    3Dダイレクトペイントブラシ ({activeTargetMat?.name})
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    3Dモデル上のパーツを直接左ドラッグすると、そのパーツのテクスチャにリアルタイムでペイントできます。
                  </p>
                  {tool !== 'paint' && (
                    <button
                      onClick={() => setTool('paint')}
                      className="w-full bg-rose-600 hover:bg-rose-500 text-white font-semibold py-1.5 rounded-lg"
                    >
                      3D直接ペイントモードをONにする
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      ['airbrush', 'ソフトエアブラシ'],
                      ['round', 'ハード丸ペン'],
                      ['spray', 'スプレー散らし'],
                      ['eraser', '消しゴム'],
                    ] as Array<[BrushKind, string]>
                  ).map(([k, lbl]) => (
                    <button
                      key={k}
                      onClick={() => setBrushKind(k)}
                      className={`py-2 px-2 rounded-lg border text-[11px] font-medium ${
                        brushKind === k
                          ? 'bg-rose-500/20 border-rose-500 text-rose-200'
                          : 'bg-[#0b0e14] border-[#242e42] text-slate-300'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between bg-[#0b0e14] border border-[#222b3e] rounded-lg px-3 py-2">
                  <span className="text-slate-300">ブラシカラー</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={brushColor}
                      onChange={(e) => setBrushColor(e.target.value)}
                      className="w-7 h-7 bg-transparent cursor-pointer"
                    />
                    <span className="font-mono-num text-slate-200">{brushColor}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-24 text-slate-400">ブラシ太さ</span>
                    <input
                      type="range"
                      min={3}
                      max={120}
                      value={brushSize}
                      onChange={(e) => setBrushSize(Number(e.target.value))}
                      className="flex-1 h-1.5"
                    />
                    <span className="w-10 text-right font-mono-num">{brushSize}px</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-24 text-slate-400">不透明度</span>
                    <input
                      type="range"
                      min={0.05}
                      max={1}
                      step={0.02}
                      value={brushOpacity}
                      onChange={(e) => setBrushOpacity(Number(e.target.value))}
                      className="flex-1 h-1.5 accent-cyan-400"
                    />
                    <span className="w-10 text-right font-mono-num">
                      {Math.round(brushOpacity * 100)}%
                    </span>
                  </div>
                  <label className="flex items-center justify-between bg-[#0b0e14] border border-[#222b3e] rounded-lg px-3 py-2 cursor-pointer">
                    <span className="text-slate-300">左右対称ミラーペイント (U反転)</span>
                    <input
                      type="checkbox"
                      checked={brushMirrorU}
                      onChange={(e) => setBrushMirrorU(e.target.checked)}
                      className="accent-cyan-500"
                    />
                  </label>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleUndoPaint}
                    disabled={!liveryHistoryRef.current.canUndo}
                    className="flex-1 flex items-center justify-center gap-1 bg-[#1a2233] hover:bg-[#25314a] disabled:opacity-40 text-slate-200 py-2 rounded-lg border border-[#2d3a54]"
                    title="元に戻す (Ctrl+Z)"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    戻す (Ctrl+Z)
                  </button>
                  <button
                    onClick={handleLiveryRedo}
                    disabled={!liveryHistoryRef.current.canRedo}
                    className="flex-1 flex items-center justify-center gap-1 bg-[#1a2233] hover:bg-[#25314a] disabled:opacity-40 text-slate-200 py-2 rounded-lg border border-[#2d3a54]"
                    title="やり直し (Ctrl+Y)"
                  >
                    <Redo2 className="w-3.5 h-3.5" />
                    やり直し (Ctrl+Y)
                  </button>
                  <button
                    onClick={handleClearDirectPaint}
                    className="flex-1 flex items-center justify-center gap-1 bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 py-2 rounded-lg border border-rose-500/30"
                  >
                    <Eraser className="w-3.5 h-3.5" />
                    全消去
                  </button>
                </div>
              </div>
            )}

            {/* =================================================================================
                TAB 5: スキン保存 (MULTI-TEXTURE SKIN EXPORT & EXISTING SKINS)
               ================================================================================= */}
            {sideTab === 'export' && (
              <div className="space-y-4">
                <div className="bg-[#0e131d] border border-emerald-500/35 rounded-xl p-3 space-y-2.5">
                  <div className="font-semibold text-emerald-300">
                    Assetto Corsa スキンとして一括書き出し (skins/)
                  </div>

                  {/* Summary of Modified Textures / Materials to Export */}
                  <div className="bg-[#090c11] border border-[#222b3e] rounded-lg p-2 space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold">
                      <span>
                        書き出し対象の編集済みテクスチャ・マテリアル ({modifiedMatUuids.length || 1}件):
                      </span>
                      <span className="font-mono-num text-rose-300">
                        既定解像度: {defaultSkinResolution}×{defaultSkinResolution}px
                      </span>
                    </div>
                    <div className="max-h-24 overflow-y-auto space-y-1">
                      {materialOptions
                        .filter((m) => modifiedMatUuids.includes(m.uuid))
                        .map((m) => {
                          const s = slotsMapRef.current.get(m.uuid);
                          const pat = s ? resolveActiveSurfacePattern(s.paintState) : 'none';
                          const res = s?.textureAdjust.exportResolution ?? defaultSkinResolution;
                          return (
                            <div
                              key={m.uuid}
                              className="flex items-center justify-between text-[10px] font-mono-num text-slate-300"
                            >
                              <span className="truncate">
                                ● {m.name} → <strong className="text-cyan-300">{m.diffuseTexName}</strong>
                              </span>
                              <span className="text-amber-300 shrink-0 ml-2">
                                {res}px · {s?.paintState.presetId}
                                {pat !== 'none' ? ` [${pat}]` : ''}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-0.5">
                        スキンフォルダID
                      </label>
                      <input
                        type="text"
                        value={skinFolderId}
                        onChange={(e) => setSkinFolderId(e.target.value)}
                        className="w-full bg-[#080b10] border border-[#2b354b] rounded px-2 py-1 font-mono-num text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-0.5">
                        スキン表示名
                      </label>
                      <input
                        type="text"
                        value={skinName}
                        onChange={(e) => setSkinName(e.target.value)}
                        className="w-full bg-[#080b10] border border-[#2b354b] rounded px-2 py-1 text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-0.5">
                        ドライバー名
                      </label>
                      <input
                        type="text"
                        value={driverName}
                        onChange={(e) => setDriverName(e.target.value)}
                        className="w-full bg-[#080b10] border border-[#2b354b] rounded px-2 py-1 text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-0.5">
                        カーナンバー
                      </label>
                      <input
                        type="text"
                        value={carNumber}
                        onChange={(e) => setCarNumber(e.target.value)}
                        className="w-full bg-[#080b10] border border-[#2b354b] rounded px-2 py-1 font-mono-num text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-0.5">チーム名</label>
                      <input
                        type="text"
                        value={teamName}
                        onChange={(e) => setTeamName(e.target.value)}
                        className="w-full bg-[#080b10] border border-[#2b354b] rounded px-2 py-1 text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-0.5">国</label>
                      <input
                        type="text"
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        className="w-full bg-[#080b10] border border-[#2b354b] rounded px-2 py-1 text-slate-100"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 block mb-0.5">
                      現在選択中マテリアルの出力テクスチャ名 (元KN5の txDiffuse)
                    </label>
                    <input
                      type="text"
                      value={exportTexName}
                      onChange={(e) => setExportTexName(e.target.value)}
                      className="w-full bg-[#080b10] border border-[#2b354b] rounded px-2 py-1 font-mono-num text-cyan-300"
                    />
                  </div>

                  <button
                    onClick={handleSaveSkin}
                    disabled={savingSkin}
                    className="w-full flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg shadow-lg shadow-emerald-600/20"
                  >
                    <Save className="w-4 h-4" />
                    {savingSkin
                      ? '全テクスチャ DDS & プレビュー生成中...'
                      : `skins/${skinFolderId}/ へ一括スキン保存`}
                  </button>

                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    出力内容: 編集した<strong>全テクスチャ (.dds)</strong> + 素材ディテール＆ノーマルマップ + 複数マテリアル対応 <strong>ext_config.ini</strong> (純正色/カーボン/アルカンターラ/本革/合皮/成形色樹脂を実機再現) + <strong>ui_skin.json</strong> + <strong>preview.jpg</strong> + <strong>livery.png</strong>
                  </p>
                </div>

                {/* Existing Skins in Vehicle */}
                <div className="space-y-2">
                  <span className="font-semibold text-slate-300 block">
                    既存スキンからベースを読み込む ({existingSkins.length})
                  </span>
                  {existingSkins.length === 0 ? (
                    <div className="text-center py-4 text-[11px] text-slate-500 border border-dashed border-[#242e42] rounded-lg">
                      skins フォルダに既存スキンはありません。
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {existingSkins.map((s) => (
                        <div
                          key={s.id}
                          className="bg-[#0b0e14] border border-[#222b3e] rounded-lg p-2 flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-12 h-8 rounded bg-[#141b29] overflow-hidden shrink-0">
                              {s.previewDataUrl && (
                                <img
                                  src={s.previewDataUrl}
                                  alt={s.skinName}
                                  className="w-full h-full object-cover"
                                />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-200 truncate text-[11px]">
                                {s.skinName}
                              </div>
                              <div className="font-mono-num text-[10px] text-slate-500 truncate">
                                {s.id}
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => handleLoadExistingSkin(s)}
                            className="bg-[#1b2436] hover:bg-[#26324c] text-cyan-300 px-2.5 py-1 rounded text-[10px] shrink-0"
                          >
                            ベース読込
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </DetachablePanel>
      </div>
    </div>
  );
};
