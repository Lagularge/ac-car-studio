export interface UiCarSpecs {
  bhp?: string;
  torque?: string;
  weight?: string;
  topspeed?: string;
  acceleration?: string;
  pwratio?: string;
  [key: string]: string | undefined;
}

export interface UiCarJson {
  name?: string;
  brand?: string;
  description?: string;
  tags?: string[];
  class?: string;
  specs?: UiCarSpecs;
  torqueCurve?: [string | number, string | number][];
  powerCurve?: [string | number, string | number][];
  country?: string;
  author?: string;
  version?: string;
  url?: string;
  year?: number | string;
  [key: string]: unknown;
}

export interface CarSummary {
  id: string;
  name: string;
  brand: string;
  carClass: string;
  year: string;
  country: string;
  hasDataFolder: boolean;
  hasDataAcd: boolean;
  dataSource: 'folder' | 'acd' | 'none';
  previewDataUrl?: string;
  badgeDataUrl?: string;
  bhpSpec?: string;
  torqueSpec?: string;
  weightSpec?: string;
  backupCount: number;
}

export interface LoadedCarData {
  summary: CarSummary;
  carDir: string;
  files: Record<string, string>;
  uiCarJson: UiCarJson;
  uiCarJsonRaw: string;
  loadedFromAcd: boolean;
}

export interface BackupEntry {
  id: string;
  timestamp: string;
  note: string;
  hasDataFolder: boolean;
  hasDataAcd: boolean;
  fileCount: number;
}

export type NewCarTemplateId =
  | 'fr_sports'
  | 'drift_spec'
  | 'awd_rally'
  | 'ff_hothatch'
  | 'gt3_race';

export interface CreateCarPayload {
  folderName: string;
  name: string;
  brand: string;
  country: string;
  year: number;
  carClass: string;
  author: string;
  description: string;
  templateId: NewCarTemplateId;
  massKg: number;
  peakTorqueNm: number;
  maxRpm: number;
  turboBoostBar: number;
}

export interface LutPoint {
  rpm: number;
  torque: number;
}

export interface DynoPoint {
  rpm: number;
  naTorqueNm: number;
  naPowerPs: number;
  naPowerBhp: number;
  totalTorqueNm: number;
  totalPowerPs: number;
  totalPowerBhp: number;
  boostBar: number;
  motorTorqueNm?: number;
  motorPowerPs?: number;
  combinedTorqueNm?: number;
  combinedPowerPs?: number;
}

export interface GearSpeedPoint {
  gear: number;
  ratio: number;
  maxSpeedKmh: number;
  rpmAtShiftFromPrev: number;
  speedAtIdleKmh: number;
}

export type TransmissionMode = 'manual' | 'sequential' | 'csp_at' | 'csp_cvt';

export interface CarPhysicsMetrics {
  massKg: number;
  peakTorqueNm: number;
  peakTorqueRpm: number;
  peakPowerPs: number;
  peakPowerBhp: number;
  peakPowerRpm: number;
  maxRpm: number;
  idleRpm: number;
  powerToWeightKgPerPs: number;
  estimatedTopSpeedKmh: number;
  estimated0To100Sec: number;
  driveType: string;
  wheelRadiusM: number;
  finalRatio: number;
  gears: GearSpeedPoint[];
  dynoCurve: DynoPoint[];
  frontWeightPct: number;
  frontSpringHz: number;
  rearSpringHz: number;
  hasTurbo: boolean;
  maxBoostBar: number;
  hasHybrid?: boolean;
  motorPeakKw?: number;
  motorPeakPs?: number;
  motorPeakTorqueNm?: number;
  combinedPeakPowerPs?: number;
  combinedPeakTorqueNm?: number;
  transmissionMode?: TransmissionMode;
}

export interface CustomPresetRecord {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  category: 'custom';
  patchFiles: Record<string, Record<string, Record<string, string>>>;
  lutScale?: number;
}

export interface AcDetectResult {
  carsDir: string | null;
  candidates: string[];
}

export interface SaveCarResult {
  ok: boolean;
  savedFiles: number;
  packedAcd: boolean;
  error?: string;
}

export interface AcdActionResult {
  ok: boolean;
  fileCount?: number;
  keyString?: string;
  message: string;
}

export interface CarModelFileInfo {
  fileName: string;
  sizeBytes: number;
  isPrimaryLod: boolean;
}

export interface ExternalModelFile {
  fileName: string;
  ext: string;
  bytes: Uint8Array;
}

export type PartCategory =
  | 'wheel'
  | 'steering'
  | 'seat'
  | 'wing'
  | 'exhaust'
  | 'brake'
  | 'body'
  | 'other';

export interface SavedPartEntry {
  id: string;
  name: string;
  category: PartCategory;
  sourceCarId: string;
  sourceNodeName: string;
  sourceSide?: 'left' | 'right' | 'center';
  bboxSize: [number, number, number];
  sizeBytes: number;
  createdAt: string;
  thumbnailDataUrl?: string;
}

export interface SavePartPayload {
  name: string;
  category: PartCategory;
  sourceCarId: string;
  sourceNodeName: string;
  sourceSide?: 'left' | 'right' | 'center';
  bboxSize: [number, number, number];
  thumbnailDataUrl?: string;
  kn5Bytes: Uint8Array;
}

export interface CarSkinSummary {
  id: string;
  skinName: string;
  driverName: string;
  team: string;
  number: string;
  previewDataUrl?: string;
  files: string[];
}

export interface SaveSkinPayload {
  skinFolderId: string;
  skinName: string;
  driverName: string;
  team: string;
  country: string;
  number: string;
  textureFileName: string;
  textureBytes: Uint8Array;
  extConfigIni: string;
  extraFiles?: Array<{ fileName: string; bytes: Uint8Array }>;
  previewJpegBytes?: Uint8Array;
  liveryPngBytes?: Uint8Array;
}

export interface PickedDecalImage {
  fileName: string;
  dataUrl: string;
}

export interface SoundSampleWavPayload {
  fileName: string;
  wavBytes: Uint8Array;
  rpm: number;
  loadType: 'on' | 'off' | 'idle' | 'fx';
  perspective?: 'ext' | 'int' | 'fx';
}

export interface SoundExportPayload {
  engineName: string;
  layoutLabel: string;
  maxRpm: number;
  idleRpm: number;
  samples: SoundSampleWavPayload[];
  manifestJson: string;
  extConfigIni: string;
  cspLuaScript: string;
  soundsIniPatch?: string;
}

export interface SoundExportResult {
  ok: boolean;
  exportDir?: string;
  writtenFiles: number;
  message: string;
}

// ============================================================================
// Assetto Corsa Dedicated Server Types
// ============================================================================

export interface AcTrackLayoutInfo {
  id: string;
  name: string;
  pitboxes: number;
  length: string;
  width?: string;
  country: string;
  city?: string;
  tags?: string[];
  previewDataUrl?: string;
  outlineDataUrl?: string;
}

export interface AcTrackSummary {
  id: string;
  name: string;
  country: string;
  city: string;
  tags?: string[];
  previewDataUrl?: string;
  outlineDataUrl?: string;
  layouts: AcTrackLayoutInfo[];
}

export interface AcServerConfigFiles {
  serverDir: string;
  hasAcServerExe: boolean;
  serverCfgIni: string;
  entryListIni: string;
  cspExtraOptionsIni: string;
}

export interface AcServerSavePayload {
  serverCfgIni: string;
  entryListIni: string;
  cspExtraOptionsIni: string;
  writeCspExtra: boolean;
}

export interface AcServerStatus {
  running: boolean;
  pid: number | null;
  serverDir: string | null;
  startedAt: string | null;
}

export interface AcServerLogEvent {
  stream: 'stdout' | 'stderr' | 'system';
  line: string;
  timestamp: string;
}

export interface ElectronAcApi {
  detectAcDir: () => Promise<AcDetectResult>;
  selectCarsDir: () => Promise<string | null>;
  createDemoWorkspace: () => Promise<string>;
  listCars: (carsDir: string) => Promise<CarSummary[]>;
  loadCar: (carsDir: string, carId: string) => Promise<LoadedCarData>;
  saveCar: (
    carsDir: string,
    carId: string,
    files: Record<string, string>,
    uiCarJson: UiCarJson,
    options: { repackAcd?: boolean; createBackupFirst?: boolean; backupNote?: string }
  ) => Promise<SaveCarResult>;
  unpackAcd: (carsDir: string, carId: string) => Promise<AcdActionResult>;
  packAcd: (carsDir: string, carId: string, backupOldAcd?: boolean) => Promise<AcdActionResult>;
  createCar: (carsDir: string, payload: CreateCarPayload) => Promise<{ ok: boolean; carId?: string; error?: string }>;
  listBackups: (carsDir: string, carId: string) => Promise<BackupEntry[]>;
  createBackup: (carsDir: string, carId: string, note: string) => Promise<{ ok: boolean; entry?: BackupEntry; error?: string }>;
  restoreBackup: (carsDir: string, carId: string, backupId: string) => Promise<{ ok: boolean; error?: string }>;
  deleteBackup: (carsDir: string, carId: string, backupId: string) => Promise<{ ok: boolean; error?: string }>;
  loadBackupData: (carsDir: string, carId: string, backupId: string) => Promise<Record<string, string>>;
  openCarFolder: (carsDir: string, carId: string) => Promise<void>;
  loadCustomPresets: () => Promise<CustomPresetRecord[]>;
  saveCustomPresets: (presets: CustomPresetRecord[]) => Promise<boolean>;
  // 3D Model (.kn5 / .fbx / .glb / .obj) APIs
  listCarModels: (carsDir: string, carId: string) => Promise<CarModelFileInfo[]>;
  readCarModelBytes: (carsDir: string, carId: string, fileName: string) => Promise<Uint8Array | null>;
  saveCarModelBytes: (
    carsDir: string,
    carId: string,
    fileName: string,
    bytes: Uint8Array,
    updateLodsIni?: boolean
  ) => Promise<{ ok: boolean; message: string }>;
  replaceModelFromCar: (
    carsDir: string,
    targetCarId: string,
    sourceCarId: string,
    sourceFileName: string
  ) => Promise<{ ok: boolean; targetFileName?: string; message: string }>;
  pickExternalModelFile: () => Promise<ExternalModelFile | null>;
  pickExternalTextureFile: () => Promise<ExternalModelFile | null>;
  // Parts Library APIs
  listSavedParts: () => Promise<SavedPartEntry[]>;
  savePartToLibrary: (
    payload: SavePartPayload
  ) => Promise<{ ok: boolean; entry?: SavedPartEntry; error?: string }>;
  loadSavedPartBytes: (partId: string) => Promise<Uint8Array | null>;
  updateSavedPartMeta: (
    partId: string,
    patch: { name?: string; category?: PartCategory; thumbnailDataUrl?: string }
  ) => Promise<{ ok: boolean; entry?: SavedPartEntry; error?: string }>;
  deleteSavedPart: (partId: string) => Promise<{ ok: boolean; error?: string }>;
  // Skin / Livery Studio APIs
  listCarSkins: (carsDir: string, carId: string) => Promise<CarSkinSummary[]>;
  readCarSkinFile: (
    carsDir: string,
    carId: string,
    skinId: string,
    fileName: string
  ) => Promise<Uint8Array | null>;
  saveCarSkin: (
    carsDir: string,
    carId: string,
    payload: SaveSkinPayload
  ) => Promise<{ ok: boolean; skinId?: string; message: string }>;
  pickDecalImageFile: () => Promise<PickedDecalImage | null>;
  // Sound Export APIs
  exportEngineSoundPack: (
    carsDir: string,
    carId: string,
    payload: SoundExportPayload
  ) => Promise<SoundExportResult>;
  removeCustomEngineSound: (
    carsDir: string,
    carId: string
  ) => Promise<{ ok: boolean; message: string }>;
  copySoundBankFromCar: (
    carsDir: string,
    targetCarId: string,
    sourceCarId: string
  ) => Promise<{ ok: boolean; message: string }>;
  // Assetto Corsa Server Setup & Runner APIs
  detectServerDir: (carsDir?: string | null) => Promise<{ serverDir: string | null; hasAcServerExe: boolean; candidates: string[] }>;
  selectServerDir: () => Promise<string | null>;
  listInstalledTracks: (carsDir?: string | null, serverDir?: string | null) => Promise<AcTrackSummary[]>;
  readServerConfig: (serverDir: string) => Promise<AcServerConfigFiles>;
  saveServerConfig: (
    serverDir: string,
    payload: AcServerSavePayload
  ) => Promise<{ ok: boolean; writtenFiles: string[]; error?: string }>;
  startAcServer: (serverDir: string) => Promise<{ ok: boolean; status?: AcServerStatus; error?: string }>;
  stopAcServer: () => Promise<{ ok: boolean; message: string }>;
  getAcServerStatus: () => Promise<AcServerStatus>;
  openServerFolder: (serverDir: string) => Promise<void>;
  onServerLog?: (callback: (event: AcServerLogEvent) => void) => () => void;
  onServerExit?: (callback: (info: { code: number | null; signal: string | null }) => void) => () => void;
  // App-level OS navigation command listener (Windows Mouse Side Buttons Back / Forward)
  onAppNavCommand?: (callback: (direction: 'back' | 'forward') => void) => () => void;
}

declare global {
  interface Window {
    acApi: ElectronAcApi;
  }
}
