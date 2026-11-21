import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  BatteryCharging,
  Box,
  Car,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Cog,
  Cpu,
  Disc,
  ExternalLink,
  FileCode2,
  Flame,
  Gauge,
  History,
  Home,
  LayoutGrid,
  Package,
  PackageOpen,
  Paintbrush,
  PictureInPicture2,
  Redo2,
  RotateCcw,
  Save,
  Settings,
  Sliders,
  Sparkles,
  Undo2,
} from 'lucide-react';
import type {
  BackupEntry,
  CarSummary,
  CreateCarPayload,
  CustomPresetRecord,
  LoadedCarData,
  PartCategory,
  UiCarJson,
} from './types/ac';
import { computeCarPhysics, syncUiCarSpecsFromPhysics } from './utils/physicsCalc';
import {
  analyzeSuspensionKinematics,
  computeLiveSuspensionPosture,
  extractSuspensionKinematicsInput,
} from './utils/suspensionKinematics';
import { useWindowAdaptiveUi } from './utils/useWindowAdaptiveUi';
import {
  ACCS_NAV_HISTORY_EVENT,
  ACCS_UNDO_REDO_EVENT,
  HistoryStack,
  NavHistoryStack,
  attachWindowShortcutListeners,
  type UndoRedoHandler,
} from './utils/undoRedo';
import { DetachablePanel, type DetachMode } from './components/common/DetachablePanel';
import { StartupSplashModal } from './components/common/StartupSplashModal';
import { HomeHubScreen, type WorkModeId } from './components/screens/HomeHubScreen';
import type { ModelHubAction } from './components/screens/ModelHubScreen';
import type { CarWorkTarget } from './components/screens/CarSelectorScreen';
import type { SkinExportResolution } from './utils/liveryEngine';
import type { AppSettingsState } from './components/screens/SettingsScreen';

const ModelHubScreen = lazy(() =>
  import('./components/screens/ModelHubScreen').then((m) => ({ default: m.ModelHubScreen }))
);

const SuspensionViewport3D = lazy(() =>
  import('./components/three/SuspensionViewport3D').then((m) => ({ default: m.SuspensionViewport3D }))
);
const CarSelectorScreen = lazy(() =>
  import('./components/screens/CarSelectorScreen').then((m) => ({ default: m.CarSelectorScreen }))
);
const SavedModelsViewerScreen = lazy(() =>
  import('./components/screens/SavedModelsViewerScreen').then((m) => ({
    default: m.SavedModelsViewerScreen,
  }))
);
const SettingsScreen = lazy(() =>
  import('./components/screens/SettingsScreen').then((m) => ({ default: m.SettingsScreen }))
);
const ServerSetupScreen = lazy(() =>
  import('./components/screens/ServerSetupScreen').then((m) => ({ default: m.ServerSetupScreen }))
);
const NewCarModal = lazy(() =>
  import('./components/NewCarModal').then((m) => ({ default: m.NewCarModal }))
);
const BackupModal = lazy(() =>
  import('./components/BackupModal').then((m) => ({ default: m.BackupModal }))
);
const DashboardTab = lazy(() =>
  import('./components/tabs/DashboardTab').then((m) => ({ default: m.DashboardTab }))
);
const EngineTab = lazy(() =>
  import('./components/tabs/EngineTab').then((m) => ({ default: m.EngineTab }))
);
const HybridTab = lazy(() =>
  import('./components/tabs/HybridTab').then((m) => ({ default: m.HybridTab }))
);
const DrivetrainTab = lazy(() =>
  import('./components/tabs/DrivetrainTab').then((m) => ({ default: m.DrivetrainTab }))
);
const SuspensionTab = lazy(() =>
  import('./components/tabs/SuspensionTab').then((m) => ({ default: m.SuspensionTab }))
);
const TyresBrakesAeroTab = lazy(() =>
  import('./components/tabs/TyresBrakesAeroTab').then((m) => ({ default: m.TyresBrakesAeroTab }))
);
const CarMetaTab = lazy(() =>
  import('./components/tabs/CarMetaTab').then((m) => ({ default: m.CarMetaTab }))
);
const PresetsCompareTab = lazy(() =>
  import('./components/tabs/PresetsCompareTab').then((m) => ({ default: m.PresetsCompareTab }))
);
const RawEditorTab = lazy(() =>
  import('./components/tabs/RawEditorTab').then((m) => ({ default: m.RawEditorTab }))
);
const ModelEditorTab = lazy(() =>
  import('./components/tabs/ModelEditorTab').then((m) => ({ default: m.ModelEditorTab }))
);
const LiveryStudioTab = lazy(() =>
  import('./components/tabs/LiveryStudioTab').then((m) => ({ default: m.LiveryStudioTab }))
);
const EngineSimTab = lazy(() =>
  import('./components/tabs/EngineSimTab').then((m) => ({ default: m.EngineSimTab }))
);

const LazyLoadingFallback: React.FC = () => (
  <div className="flex items-center justify-center w-full h-64 text-xs text-cyan-300 font-mono-num">
    モジュールを読み込み中...
  </div>
);

type ScreenRoute =
  | 'home'
  | 'model_hub'
  | 'car_select'
  | 'workspace'
  | 'saved_models'
  | 'server_setup'
  | 'settings';

type TabId =
  | 'dashboard'
  | 'model3d'
  | 'livery'
  | 'enginesim'
  | 'engine'
  | 'hybrid'
  | 'drivetrain'
  | 'suspension'
  | 'tyres'
  | 'meta'
  | 'presets'
  | 'raw';

interface ToastMessage {
  id: number;
  type: 'success' | 'error' | 'info';
  text: string;
}

interface NavRouteEntry {
  screen: ScreenRoute;
  targetWork: CarWorkTarget;
  activeTab: TabId;
  carId: string | null;
  savedModelsStep: 'categories' | 'models';
  savedModelsCategory: PartCategory | 'all';
}

interface CarDataSnapshot {
  files: Record<string, string>;
  uiCarJson: UiCarJson;
}

interface CarDataUndoEntry {
  before: CarDataSnapshot;
  after: CarDataSnapshot;
}

function isSameNavRoute(a: NavRouteEntry, b: NavRouteEntry): boolean {
  if (a.screen !== b.screen) return false;
  if (a.screen === 'car_select') return a.targetWork === b.targetWork;
  if (a.screen === 'workspace') return a.carId === b.carId && a.activeTab === b.activeTab;
  if (a.screen === 'saved_models') {
    return a.savedModelsStep === b.savedModelsStep && a.savedModelsCategory === b.savedModelsCategory;
  }
  return true;
}

const STORAGE_DIR_KEY = 'ac_car_studio_cars_dir';
const STORAGE_SETTINGS_KEY = 'ac_car_studio_settings_v1';

const VALID_SKIN_RESOLUTIONS: readonly SkinExportResolution[] = [1024, 2048, 4096, 8192];

const DEFAULT_APP_SETTINGS: AppSettingsState = {
  defaultAutoBackup: true,
  defaultRepackAcd: true,
  defaultCspLighting: 'csp_showroom',
  defaultSkinResolution: 4096,
  autoUiScale: true,
  manualUiScale: 1.0,
  enableStartupAnimation: true,
};

function loadPersistedSettings(): AppSettingsState {
  try {
    const raw = localStorage.getItem(STORAGE_SETTINGS_KEY);
    if (!raw) return DEFAULT_APP_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettingsState>;
    const resCandidate = parsed.defaultSkinResolution;
    const validRes: SkinExportResolution = VALID_SKIN_RESOLUTIONS.includes(
      resCandidate as SkinExportResolution
    )
      ? (resCandidate as SkinExportResolution)
      : 4096;
    const validManualScale =
      typeof parsed.manualUiScale === 'number' &&
      Number.isFinite(parsed.manualUiScale) &&
      parsed.manualUiScale >= 0.75 &&
      parsed.manualUiScale <= 1.25
        ? parsed.manualUiScale
        : 1.0;
    return {
      ...DEFAULT_APP_SETTINGS,
      ...parsed,
      defaultSkinResolution: validRes,
      autoUiScale: typeof parsed.autoUiScale === 'boolean' ? parsed.autoUiScale : true,
      manualUiScale: validManualScale,
      enableStartupAnimation:
        typeof parsed.enableStartupAnimation === 'boolean' ? parsed.enableStartupAnimation : true,
    };
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

export const App: React.FC = () => {
  // Navigation & Settings
  const [screen, setScreen] = useState<ScreenRoute>('home');
  const [targetWork, setTargetWork] = useState<CarWorkTarget>('car_tuning');
  const [savedModelsStep, setSavedModelsStep] = useState<'categories' | 'models'>('categories');
  const [savedModelsCategory, setSavedModelsCategory] = useState<PartCategory | 'all'>('wheel');
  const [appSettings, setAppSettings] = useState<AppSettingsState>(loadPersistedSettings);

  // Garage / Cars State
  const [carsDir, setCarsDir] = useState<string | null>(null);
  const [cars, setCars] = useState<CarSummary[]>([]);
  const [loadingCars, setLoadingCars] = useState(false);
  const [savedPartCount, setSavedPartCount] = useState(0);

  // Active Loaded Car State
  const [selectedCarId, setSelectedCarId] = useState<string | null>(null);
  const [loadedCar, setLoadedCar] = useState<LoadedCarData | null>(null);
  const [files, setFiles] = useState<Record<string, string>>({});
  const [originalFiles, setOriginalFiles] = useState<Record<string, string>>({});
  const [uiCarJson, setUiCarJson] = useState<UiCarJson>({});
  const [originalUiCarJson, setOriginalUiCarJson] = useState<UiCarJson>({});
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [customPresets, setCustomPresets] = useState<CustomPresetRecord[]>([]);

  const [activeTab, setActiveTab] = useState<TabId>('dashboard');

  // Navigation Back/Forward History (Mouse Side Buttons / Electron app-command / Alt+Arrows / UI)
  const navHistoryRef = useRef(
    new NavHistoryStack<NavRouteEntry>(
      {
        screen: 'home',
        targetWork: 'car_tuning',
        activeTab: 'dashboard',
        carId: null,
        savedModelsStep: 'categories',
        savedModelsCategory: 'wheel',
      },
      isSameNavRoute,
      60
    )
  );
  const [navButtonState, setNavButtonState] = useState({ canBack: false, canForward: false });
  const lastNavCommandTsRef = useRef(0);
  const carsDirRef = useRef(carsDir);
  carsDirRef.current = carsDir;
  const selectedCarIdRef = useRef(selectedCarId);
  selectedCarIdRef.current = selectedCarId;

  // Car Data Undo/Redo Stack (INI / Physics / Presets / Meta / Raw)
  const carHistoryRef = useRef(new HistoryStack<CarDataUndoEntry>({ maxEntries: 60, coalesceMs: 450 }));
  const [carHistoryTick, setCarHistoryTick] = useState(0);
  const filesRef = useRef(files);
  filesRef.current = files;
  const uiCarJsonRef = useRef(uiCarJson);
  uiCarJsonRef.current = uiCarJson;

  // Specialized Tab Undo/Redo Delegation (3D Model / Livery / EngineSim)
  const [tabUndoHandler, setTabUndoHandler] = useState<UndoRedoHandler | null>(null);
  const registerTabUndoRedo = useCallback((handler: UndoRedoHandler | null) => {
    setTabUndoHandler(handler);
  }, []);
  const [repackOnSave, setRepackOnSave] = useState(false);
  const [autoBackupOnSave, setAutoBackupOnSave] = useState(appSettings.defaultAutoBackup);
  const [saving, setSaving] = useState(false);

  const [newCarModalOpen, setNewCarModalOpen] = useState(false);
  const [backupModalOpen, setBackupModalOpen] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  // Startup boot animation & window-adaptive UI scaling (configured from SettingsScreen)
  const [showStartupSplash, setShowStartupSplash] = useState<boolean>(
    () => appSettings.enableStartupAnimation
  );
  const adaptiveUi = useWindowAdaptiveUi(appSettings.autoUiScale, appSettings.manualUiScale);

  // Global 3D Model Viewer Only Floating / Separate OS Window (available across all physics/data editing tabs)
  const [global3dViewerMode, setGlobal3dViewerMode] = useState<DetachMode>('docked');
  const [globalLoadFactor, setGlobalLoadFactor] = useState<number>(1.0);
  const [globalLateralG, setGlobalLateralG] = useState<number>(0.0);

  const globalSuspKin = useMemo(() => {
    if (global3dViewerMode === 'docked') return null;
    const inp = extractSuspensionKinematicsInput(files);
    return analyzeSuspensionKinematics(inp);
  }, [files, global3dViewerMode]);

  const globalLivePosture = useMemo(() => {
    if (!globalSuspKin) return undefined;
    return computeLiveSuspensionPosture(globalSuspKin, globalLoadFactor, globalLateralG, 0);
  }, [globalSuspKin, globalLoadFactor, globalLateralG]);

  const showToast = useCallback((text: string, type: ToastMessage['type'] = 'success') => {
    const id = Date.now();
    setToast({ id, type, text });
    window.setTimeout(() => {
      setToast((cur) => (cur?.id === id ? null : cur));
    }, 4200);
  }, []);

  const updateAppSettings = useCallback((patch: Partial<AppSettingsState>) => {
    setAppSettings((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(next));
      if (patch.defaultAutoBackup !== undefined) setAutoBackupOnSave(patch.defaultAutoBackup);
      return next;
    });
    showToast('設定を保存しました', 'info');
  }, [showToast]);

  const scanCars = useCallback(
    async (dir: string) => {
      setLoadingCars(true);
      try {
        const list = await window.acApi.listCars(dir);
        setCars(list);
        return list;
      } catch (err) {
        showToast(`車両スキャン失敗: ${err instanceof Error ? err.message : String(err)}`, 'error');
        return [];
      } finally {
        setLoadingCars(false);
      }
    },
    [showToast]
  );

  const loadCarById = useCallback(
    async (dir: string, carId: string) => {
      try {
        const data = await window.acApi.loadCar(dir, carId);
        const backupList = await window.acApi.listBackups(dir, carId);
        setSelectedCarId(carId);
        selectedCarIdRef.current = carId;
        setLoadedCar(data);
        const clonedFiles = { ...data.files };
        const clonedUi = structuredClone(data.uiCarJson);
        filesRef.current = clonedFiles;
        uiCarJsonRef.current = clonedUi;
        carHistoryRef.current.clear();
        setCarHistoryTick((t) => t + 1);
        setFiles(clonedFiles);
        setOriginalFiles({ ...data.files });
        setUiCarJson(clonedUi);
        setOriginalUiCarJson(structuredClone(data.uiCarJson));
        setBackups(backupList);
        setRepackOnSave(data.summary.hasDataAcd && appSettings.defaultRepackAcd);
        setAutoBackupOnSave(appSettings.defaultAutoBackup);
        return true;
      } catch (err) {
        showToast(
          `車両の読み込みに失敗しました: ${err instanceof Error ? err.message : String(err)}`,
          'error'
        );
        return false;
      }
    },
    [showToast, appSettings.defaultAutoBackup, appSettings.defaultRepackAcd]
  );

  // Initial background detection on launch (stay on Home Hub screen!)
  useEffect(() => {
    (async () => {
      const [presets, parts] = await Promise.all([
        window.acApi.loadCustomPresets(),
        window.acApi.listSavedParts(),
      ]);
      setCustomPresets(presets);
      setSavedPartCount(parts.length);

      const savedDir = localStorage.getItem(STORAGE_DIR_KEY);
      if (savedDir) {
        const list = await scanCars(savedDir);
        if (list.length > 0) {
          setCarsDir(savedDir);
          return;
        }
      }

      const detected = await window.acApi.detectAcDir();
      if (detected.carsDir) {
        setCarsDir(detected.carsDir);
        localStorage.setItem(STORAGE_DIR_KEY, detected.carsDir);
        await scanCars(detected.carsDir);
        showToast('Assetto Corsa の content/cars フォルダを自動検出しました', 'info');
      }
    })();
  }, [scanCars, showToast]);

  const metrics = useMemo(() => computeCarPhysics(files), [files]);

  const isDirty = useMemo(() => {
    if (!loadedCar) return false;
    const keys = new Set([...Object.keys(files), ...Object.keys(originalFiles)]);
    for (const k of keys) {
      if (files[k] !== originalFiles[k]) return true;
    }
    return JSON.stringify(uiCarJson) !== JSON.stringify(originalUiCarJson);
  }, [loadedCar, files, originalFiles, uiCarJson, originalUiCarJson]);

  const handlePickFolder = async () => {
    const picked = await window.acApi.selectCarsDir();
    if (!picked) return;
    setCarsDir(picked);
    localStorage.setItem(STORAGE_DIR_KEY, picked);
    setLoadedCar(null);
    setSelectedCarId(null);
    const list = await scanCars(picked);
    showToast(`フォルダを切り替えました (${list.length} 台検出)`, 'info');
  };

  const handleDetectFolder = async () => {
    const detected = await window.acApi.detectAcDir();
    if (detected.carsDir) {
      setCarsDir(detected.carsDir);
      localStorage.setItem(STORAGE_DIR_KEY, detected.carsDir);
      const list = await scanCars(detected.carsDir);
      showToast(`Steamフォルダを検出しました (${list.length} 台)`, 'success');
    } else {
      showToast('SteamのAssetto Corsaフォルダが見つかりませんでした。手動選択をお試しください。', 'error');
    }
  };

  const handleUseDemo = async () => {
    const demoDir = await window.acApi.createDemoWorkspace();
    setCarsDir(demoDir);
    localStorage.setItem(STORAGE_DIR_KEY, demoDir);
    await scanCars(demoDir);
    showToast('デモ車両ワークスペース (3台・ACDデモ含む) を開きました', 'success');
  };

  const syncNavButtonState = useCallback(() => {
    setNavButtonState({
      canBack: navHistoryRef.current.canBack,
      canForward: navHistoryRef.current.canForward,
    });
  }, []);

  const pushNavRoute = useCallback(
    (patch: Partial<NavRouteEntry>) => {
      const next: NavRouteEntry = { ...navHistoryRef.current.current, ...patch };
      navHistoryRef.current.push(next);
      setTargetWork(next.targetWork);
      setActiveTab(next.activeTab);
      setSavedModelsStep(next.savedModelsStep);
      setSavedModelsCategory(next.savedModelsCategory);
      setScreen(next.screen);
      syncNavButtonState();
    },
    [syncNavButtonState]
  );

  const handleNavigateHistory = useCallback(
    async (direction: 'back' | 'forward') => {
      const now = Date.now();
      // Deduplicate Electron Windows app-command + DOM mouseup button 3/4 firing together
      if (now - lastNavCommandTsRef.current < 100) return;
      lastNavCommandTsRef.current = now;

      const target =
        direction === 'back' ? navHistoryRef.current.back() : navHistoryRef.current.forward();
      if (!target) return;

      setNewCarModalOpen(false);
      setBackupModalOpen(false);

      if (target.screen === 'workspace' && target.carId) {
        if (target.carId !== selectedCarIdRef.current && carsDirRef.current) {
          const ok = await loadCarById(carsDirRef.current, target.carId);
          if (!ok) {
            syncNavButtonState();
            return;
          }
        }
      }

      if (target.screen === 'home' || target.screen === 'model_hub') {
        window.acApi
          .listSavedParts()
          .then((parts) => setSavedPartCount(parts.length))
          .catch(() => {});
      }

      setTargetWork(target.targetWork);
      setActiveTab(target.activeTab);
      setSavedModelsStep(target.savedModelsStep);
      setSavedModelsCategory(target.savedModelsCategory);
      setScreen(target.screen);
      syncNavButtonState();
    },
    [loadCarById, syncNavButtonState]
  );

  // Handle Home Hub Mode Selection
  const handleSelectHomeMode = async (mode: WorkModeId) => {
    if (mode === 'settings') {
      pushNavRoute({ screen: 'settings' });
      return;
    }
    if (mode === 'server_setup') {
      pushNavRoute({ screen: 'server_setup' });
      return;
    }
    if (mode === 'model_edit') {
      try {
        const parts = await window.acApi.listSavedParts();
        setSavedPartCount(parts.length);
      } catch {
        // ignore
      }
      pushNavRoute({ screen: 'model_hub' });
      return;
    }
    if (mode === 'create_mod') {
      if (!carsDir) {
        const demoDir = await window.acApi.createDemoWorkspace();
        setCarsDir(demoDir);
        localStorage.setItem(STORAGE_DIR_KEY, demoDir);
        await scanCars(demoDir);
        showToast('出力先が未設定だったためデモフォルダを準備しました', 'info');
      }
      setNewCarModalOpen(true);
      return;
    }
    // paint / engine_sim / car_tuning -> Open full-screen CSP Car Selector!
    pushNavRoute({ screen: 'car_select', targetWork: mode });
  };

  // Handle Model Hub 3-Way Choice (モデルの改造 / モデルの保存 / 保存されたモデルの確認)
  const handleSelectModelHubAction = (action: ModelHubAction) => {
    if (action === 'saved_models') {
      pushNavRoute({ screen: 'saved_models', savedModelsStep: 'categories' });
      return;
    }
    pushNavRoute({ screen: 'car_select', targetWork: action });
  };

  const handleStartCarWork = async (carId: string, work: CarWorkTarget) => {
    if (!carsDir) return;
    const ok = await loadCarById(carsDir, carId);
    if (!ok) return;
    const nextTab: TabId =
      work === 'model_edit' || work === 'model_save'
        ? 'model3d'
        : work === 'paint'
          ? 'livery'
          : work === 'engine_sim'
            ? 'enginesim'
            : 'dashboard';
    pushNavRoute({ screen: 'workspace', targetWork: work, activeTab: nextTab, carId });
  };

  const commitCarDataChange = useCallback(
    (
      nextFiles: Record<string, string>,
      nextUiJson: UiCarJson,
      label: string,
      coalesceKey?: string
    ) => {
      const before: CarDataSnapshot = {
        files: { ...filesRef.current },
        uiCarJson: structuredClone(uiCarJsonRef.current),
      };
      const after: CarDataSnapshot = {
        files: { ...nextFiles },
        uiCarJson: structuredClone(nextUiJson),
      };
      carHistoryRef.current.push(
        { before, after },
        {
          label,
          coalesceKey,
          mergeCoalesced: (existing, incoming) => ({
            before: existing.before,
            after: incoming.after,
          }),
        }
      );
      filesRef.current = after.files;
      uiCarJsonRef.current = after.uiCarJson;
      setFiles(after.files);
      setUiCarJson(after.uiCarJson);
      setCarHistoryTick((t) => t + 1);
    },
    []
  );

  const handleCarDataUndo = useCallback(() => {
    const rec = carHistoryRef.current.undo();
    if (!rec) return;
    const snap = rec.value.before;
    const nextFiles = { ...snap.files };
    const nextUi = structuredClone(snap.uiCarJson);
    filesRef.current = nextFiles;
    uiCarJsonRef.current = nextUi;
    setFiles(nextFiles);
    setUiCarJson(nextUi);
    setCarHistoryTick((t) => t + 1);
    showToast(`元に戻しました${rec.label ? ` (${rec.label})` : ''}`, 'info');
  }, [showToast]);

  const handleCarDataRedo = useCallback(() => {
    const rec = carHistoryRef.current.redo();
    if (!rec) return;
    const snap = rec.value.after;
    const nextFiles = { ...snap.files };
    const nextUi = structuredClone(snap.uiCarJson);
    filesRef.current = nextFiles;
    uiCarJsonRef.current = nextUi;
    setFiles(nextFiles);
    setUiCarJson(nextUi);
    setCarHistoryTick((t) => t + 1);
    showToast(`やり直しました${rec.label ? ` (${rec.label})` : ''}`, 'info');
  }, [showToast]);

  // Active Undo/Redo handler switches seamlessly to specialized tabs (3D / Skin / EngineSim) or Car Data
  const activeUndoRedo: UndoRedoHandler = useMemo(() => {
    void carHistoryTick;
    const isSpecializedTab =
      screen === 'workspace' &&
      (activeTab === 'model3d' || activeTab === 'livery' || activeTab === 'enginesim');
    if (isSpecializedTab && tabUndoHandler) {
      return tabUndoHandler;
    }
    return {
      undo: handleCarDataUndo,
      redo: handleCarDataRedo,
      canUndo: screen === 'workspace' && carHistoryRef.current.canUndo,
      canRedo: screen === 'workspace' && carHistoryRef.current.canRedo,
      undoCount: screen === 'workspace' ? carHistoryRef.current.undoCount : 0,
      redoCount: screen === 'workspace' ? carHistoryRef.current.redoCount : 0,
      undoLabel: carHistoryRef.current.undoLabel,
      redoLabel: carHistoryRef.current.redoLabel,
    };
  }, [activeTab, carHistoryTick, handleCarDataRedo, handleCarDataUndo, screen, tabUndoHandler]);

  const activeUndoRedoRef = useRef(activeUndoRedo);
  activeUndoRedoRef.current = activeUndoRedo;
  const handleNavigateHistoryRef = useRef(handleNavigateHistory);
  handleNavigateHistoryRef.current = handleNavigateHistory;

  // Bind global Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z, Mouse Side Buttons (3/4 + Electron app-command), and pop-out events
  useEffect(() => {
    const triggerUndo = () => {
      if (activeUndoRedoRef.current.canUndo) {
        activeUndoRedoRef.current.undo();
      }
    };
    const triggerRedo = () => {
      if (activeUndoRedoRef.current.canRedo) {
        activeUndoRedoRef.current.redo();
      }
    };
    const triggerNav = (dir: 'back' | 'forward') => {
      void handleNavigateHistoryRef.current(dir);
    };

    const detachMain = attachWindowShortcutListeners(window, {
      onUndo: triggerUndo,
      onRedo: triggerRedo,
      onNav: triggerNav,
    });
    const unsubIpc = window.acApi.onAppNavCommand?.(triggerNav);

    const onCustomUndoRedo = (ev: Event) => {
      const detail = (ev as CustomEvent<{ action: 'undo' | 'redo' }>).detail;
      if (detail?.action === 'undo') triggerUndo();
      else if (detail?.action === 'redo') triggerRedo();
    };
    const onCustomNav = (ev: Event) => {
      const detail = (ev as CustomEvent<{ direction: 'back' | 'forward' }>).detail;
      if (detail?.direction === 'back' || detail?.direction === 'forward') {
        triggerNav(detail.direction);
      }
    };

    window.addEventListener(ACCS_UNDO_REDO_EVENT, onCustomUndoRedo);
    window.addEventListener(ACCS_NAV_HISTORY_EVENT, onCustomNav);

    return () => {
      detachMain();
      unsubIpc?.();
      window.removeEventListener(ACCS_UNDO_REDO_EVENT, onCustomUndoRedo);
      window.removeEventListener(ACCS_NAV_HISTORY_EVENT, onCustomNav);
    };
  }, []);

  const handleUpdateFile = useCallback(
    (fileName: string, content: string) => {
      if (filesRef.current[fileName] === content) return;
      commitCarDataChange(
        { ...filesRef.current, [fileName]: content },
        uiCarJsonRef.current,
        `${fileName} 編集`,
        `file:${fileName}`
      );
    },
    [commitCarDataChange]
  );

  const handleReplaceAllFiles = useCallback(
    (nextFiles: Record<string, string>, toastMsg: string) => {
      commitCarDataChange(nextFiles, uiCarJsonRef.current, toastMsg);
      showToast(toastMsg, 'info');
    },
    [commitCarDataChange, showToast]
  );

  const handleUpdateUiJson = useCallback(
    (nextOrUpdater: React.SetStateAction<UiCarJson>) => {
      const nextUi =
        typeof nextOrUpdater === 'function'
          ? (nextOrUpdater as (prev: UiCarJson) => UiCarJson)(uiCarJsonRef.current)
          : nextOrUpdater;
      commitCarDataChange(filesRef.current, nextUi, '車両情報 (ui_car.json) 編集', 'ui_car_json');
    },
    [commitCarDataChange]
  );

  const handleSyncUiSpecs = useCallback(() => {
    const nextUi = syncUiCarSpecsFromPhysics(uiCarJsonRef.current, metrics);
    commitCarDataChange(filesRef.current, nextUi, 'UIスペック自動同期');
    showToast('現在の物理計算結果から ui_car.json のスペックとグラフを同期しました', 'success');
  }, [commitCarDataChange, metrics, showToast]);

  const handleSave = async () => {
    if (!carsDir || !selectedCarId) return;
    setSaving(true);
    try {
      const res = await window.acApi.saveCar(carsDir, selectedCarId, files, uiCarJson, {
        repackAcd: repackOnSave,
        createBackupFirst: autoBackupOnSave,
        backupNote: '保存前自動バックアップ',
      });
      if (res.ok) {
        await scanCars(carsDir);
        await loadCarById(carsDir, selectedCarId);
        showToast(
          `保存完了 (${res.savedFiles} ファイル${res.packedAcd ? ' + data.acd 再パック済' : ''})`,
          'success'
        );
      } else {
        showToast(`保存エラー: ${res.error}`, 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleResetEdits = () => {
    commitCarDataChange({ ...originalFiles }, structuredClone(originalUiCarJson), '未保存の変更を破棄');
    showToast('未保存の変更を破棄しました (Ctrl+Z で復元可能)', 'info');
  };

  const handleUnpackAcd = async () => {
    if (!carsDir || !selectedCarId) return;
    const res = await window.acApi.unpackAcd(carsDir, selectedCarId);
    if (res.ok) {
      await scanCars(carsDir);
      await loadCarById(carsDir, selectedCarId);
      showToast(`${res.message} (Key: ${res.keyString})`, 'success');
    } else {
      showToast(res.message, 'error');
    }
  };

  const handlePackAcd = async () => {
    if (!carsDir || !selectedCarId) return;
    if (isDirty) {
      await window.acApi.saveCar(carsDir, selectedCarId, files, uiCarJson, {
        repackAcd: false,
        createBackupFirst: true,
        backupNote: 'ACDパック前バックアップ',
      });
    }
    const res = await window.acApi.packAcd(carsDir, selectedCarId, true);
    if (res.ok) {
      await scanCars(carsDir);
      await loadCarById(carsDir, selectedCarId);
      showToast(`${res.message} (Key: ${res.keyString})`, 'success');
    } else {
      showToast(res.message, 'error');
    }
  };

  const handleCreateCar = async (payload: CreateCarPayload) => {
    if (!carsDir) return;
    const res = await window.acApi.createCar(carsDir, payload);
    if (res.ok && res.carId) {
      await scanCars(carsDir);
      await loadCarById(carsDir, res.carId);
      pushNavRoute({
        screen: 'workspace',
        targetWork: 'car_tuning',
        activeTab: 'dashboard',
        carId: res.carId,
      });
      showToast(`新規車両Mod「${payload.name}」を生成して開きました`, 'success');
    } else {
      showToast(res.error || '車両作成に失敗しました', 'error');
    }
  };

  const handleCreateBackup = async (note: string) => {
    if (!carsDir || !selectedCarId) return;
    const res = await window.acApi.createBackup(carsDir, selectedCarId, note);
    if (res.ok) {
      const list = await window.acApi.listBackups(carsDir, selectedCarId);
      setBackups(list);
      showToast('バックアップを作成しました', 'success');
    } else {
      showToast(res.error || 'バックアップ失敗', 'error');
    }
  };

  const handleRestoreBackup = async (backupId: string) => {
    if (!carsDir || !selectedCarId) return;
    const res = await window.acApi.restoreBackup(carsDir, selectedCarId, backupId);
    if (res.ok) {
      await scanCars(carsDir);
      await loadCarById(carsDir, selectedCarId);
      setBackupModalOpen(false);
      showToast(`バックアップ (${backupId}) から復元しました`, 'success');
    } else {
      showToast(res.error || '復元に失敗しました', 'error');
    }
  };

  const handleDeleteBackup = async (backupId: string) => {
    if (!carsDir || !selectedCarId) return;
    const res = await window.acApi.deleteBackup(carsDir, selectedCarId, backupId);
    if (res.ok) {
      const list = await window.acApi.listBackups(carsDir, selectedCarId);
      setBackups(list);
      showToast('バックアップを削除しました', 'info');
    }
  };

  const handleSaveCustomPresets = async (next: CustomPresetRecord[]) => {
    setCustomPresets(next);
    await window.acApi.saveCustomPresets(next);
    showToast('カスタムプリセットを更新しました', 'success');
  };

  // Car Data & Physics Tuning tabs (モデル改造 & ペイント/スキン are completely independent studios!)
  const tabs: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
    { id: 'dashboard', label: 'ダッシュボード', icon: <Gauge className="w-3.5 h-3.5" /> },
    { id: 'enginesim', label: 'エンジン & サウンドSim', icon: <Cpu className="w-3.5 h-3.5" /> },
    { id: 'engine', label: 'エンジン & ターボ', icon: <Flame className="w-3.5 h-3.5" /> },
    { id: 'hybrid', label: 'ハイブリッド / 回生', icon: <BatteryCharging className="w-3.5 h-3.5" /> },
    { id: 'drivetrain', label: '駆動系 & AT/CVT', icon: <Cog className="w-3.5 h-3.5" /> },
    { id: 'suspension', label: 'サスペンション (3D)', icon: <Sliders className="w-3.5 h-3.5" /> },
    { id: 'tyres', label: 'タイヤ・ブレーキ・空力', icon: <Disc className="w-3.5 h-3.5" /> },
    { id: 'meta', label: '車両情報 & UI', icon: <Car className="w-3.5 h-3.5" /> },
    { id: 'presets', label: 'プリセット & 比較', icon: <Sparkles className="w-3.5 h-3.5" /> },
    { id: 'raw', label: '生INI / LUT編集', icon: <FileCode2 className="w-3.5 h-3.5" /> },
  ];

  const isStandaloneModelStudio = activeTab === 'model3d';
  const isStandaloneLiveryStudio = activeTab === 'livery';
  const isStandaloneStudio = isStandaloneModelStudio || isStandaloneLiveryStudio;

  const refreshPartCountAndGoHome = async () => {
    try {
      const parts = await window.acApi.listSavedParts();
      setSavedPartCount(parts.length);
    } catch {
      // ignore
    }
    pushNavRoute({ screen: 'home' });
  };

  const renderTabBody = (tabId: TabId) => {
    if (!loadedCar) return null;
    switch (tabId) {
      case 'dashboard':
        return (
          <DashboardTab
            car={loadedCar}
            metrics={metrics}
            onSyncUiSpecs={handleSyncUiSpecs}
          />
        );
      case 'model3d':
        return carsDir && selectedCarId ? (
          <ModelEditorTab
            carsDir={carsDir}
            carId={selectedCarId}
            cars={cars}
            files={files}
            initialMode={targetWork === 'model_save' ? 'save' : 'edit'}
            onSavedPartsChanged={setSavedPartCount}
            onToast={showToast}
            onRegisterUndoRedo={registerTabUndoRedo}
          />
        ) : null;
      case 'livery':
        return carsDir && selectedCarId ? (
          <LiveryStudioTab
            carsDir={carsDir}
            carId={selectedCarId}
            cars={cars}
            files={files}
            defaultSkinResolution={appSettings.defaultSkinResolution}
            onToast={showToast}
            onRegisterUndoRedo={registerTabUndoRedo}
          />
        ) : null;
      case 'enginesim':
        return carsDir && selectedCarId ? (
          <EngineSimTab
            carsDir={carsDir}
            carId={selectedCarId}
            cars={cars}
            files={files}
            currentCarMetrics={metrics}
            onReplaceAllFiles={handleReplaceAllFiles}
            onToast={showToast}
            onRegisterUndoRedo={registerTabUndoRedo}
          />
        ) : null;
      case 'engine':
        return <EngineTab files={files} metrics={metrics} onUpdateFile={handleUpdateFile} />;
      case 'hybrid':
        return (
          <HybridTab
            files={files}
            metrics={metrics}
            onReplaceAllFiles={handleReplaceAllFiles}
          />
        );
      case 'drivetrain':
        return (
          <DrivetrainTab
            files={files}
            metrics={metrics}
            onUpdateFile={handleUpdateFile}
            onReplaceAllFiles={handleReplaceAllFiles}
          />
        );
      case 'suspension':
        return carsDir && selectedCarId ? (
          <SuspensionTab
            carsDir={carsDir}
            carId={selectedCarId}
            files={files}
            metrics={metrics}
            onUpdateFile={handleUpdateFile}
          />
        ) : null;
      case 'tyres':
        return <TyresBrakesAeroTab files={files} onUpdateFile={handleUpdateFile} />;
      case 'meta':
        return (
          <CarMetaTab
            files={files}
            uiCarJson={uiCarJson}
            onUpdateFile={handleUpdateFile}
            onUpdateUiJson={handleUpdateUiJson}
            onSyncUiSpecs={handleSyncUiSpecs}
          />
        );
      case 'presets':
        return carsDir && selectedCarId ? (
          <PresetsCompareTab
            carsDir={carsDir}
            carId={selectedCarId}
            cars={cars}
            backups={backups}
            files={files}
            originalFiles={originalFiles}
            metrics={metrics}
            customPresets={customPresets}
            onReplaceAllFiles={handleReplaceAllFiles}
            onSaveCustomPresets={handleSaveCustomPresets}
          />
        ) : null;
      case 'raw':
        return (
          <RawEditorTab
            files={files}
            originalFiles={originalFiles}
            onUpdateFile={handleUpdateFile}
          />
        );
      default:
        return null;
    }
  };

  return (
    <>
      {/* 0. Animated Startup Splash Screen */}
      <StartupSplashModal
        open={showStartupSplash}
        onFinish={() => setShowStartupSplash(false)}
      />

      {/* 1. Startup Home Hub Screen */}
      {screen === 'home' && (
        <HomeHubScreen
          carsDir={carsDir}
          carCount={cars.length}
          savedPartCount={savedPartCount}
          onSelectMode={handleSelectHomeMode}
          onPickFolder={handlePickFolder}
          onUseDemo={handleUseDemo}
        />
      )}

      {/* 1b. Model Modification 3-Way Hub (モデルの改造 / モデルの保存 / 保存されたモデルの確認) */}
      {screen === 'model_hub' && (
        <Suspense fallback={<LazyLoadingFallback />}>
          <ModelHubScreen
            carCount={cars.length}
            savedPartCount={savedPartCount}
            onSelectAction={handleSelectModelHubAction}
            onBackHome={refreshPartCountAndGoHome}
          />
        </Suspense>
      )}

      {/* 2. Full-Screen CSP Car Selector Garage */}
      {screen === 'car_select' && (
        <Suspense fallback={<LazyLoadingFallback />}>
          <CarSelectorScreen
            carsDir={carsDir}
            cars={cars}
            loadingCars={loadingCars}
            targetWork={targetWork}
            defaultCspLighting={appSettings.defaultCspLighting}
            onStartWork={handleStartCarWork}
            onBackHome={refreshPartCountAndGoHome}
            onPickFolder={handlePickFolder}
            onUseDemo={handleUseDemo}
            onRefresh={() => carsDir && scanCars(carsDir)}
            onOpenNewCar={() => setNewCarModalOpen(true)}
          />
        </Suspense>
      )}

      {/* 3. Saved Models / Parts 3D Viewer Screen */}
      {screen === 'saved_models' && (
        <Suspense fallback={<LazyLoadingFallback />}>
          <SavedModelsViewerScreen
            defaultCspLighting={appSettings.defaultCspLighting}
            navStep={savedModelsStep}
            navCategory={savedModelsCategory}
            onNavStepChange={(step, category) =>
              pushNavRoute({
                screen: 'saved_models',
                savedModelsStep: step,
                savedModelsCategory: category,
              })
            }
            onBackHome={refreshPartCountAndGoHome}
            onGoToModelEdit={() => {
              pushNavRoute({ screen: 'car_select', targetWork: 'model_edit' });
            }}
            onPartsChanged={setSavedPartCount}
            onToast={showToast}
          />
        </Suspense>
      )}

      {/* 4. Settings Screen */}
      {screen === 'settings' && (
        <Suspense fallback={<LazyLoadingFallback />}>
          <SettingsScreen
            carsDir={carsDir}
            carCount={cars.length}
            savedPartCount={savedPartCount}
            customPresetCount={customPresets.length}
            settings={appSettings}
            windowWidth={adaptiveUi.windowWidth}
            windowHeight={adaptiveUi.windowHeight}
            effectiveUiScale={adaptiveUi.effectiveScale}
            onUpdateSettings={updateAppSettings}
            onPlayStartupAnimation={() => setShowStartupSplash(true)}
            onPickFolder={handlePickFolder}
            onDetectFolder={handleDetectFolder}
            onUseDemo={handleUseDemo}
            onBackHome={refreshPartCountAndGoHome}
          />
        </Suspense>
      )}

      {/* 4b. Assetto Corsa Dedicated Server Configurator & Runner Screen */}
      {screen === 'server_setup' && (
        <Suspense fallback={<LazyLoadingFallback />}>
          <ServerSetupScreen
            carsDir={carsDir}
            cars={cars}
            onBackHome={refreshPartCountAndGoHome}
            onToast={showToast}
          />
        </Suspense>
      )}

      {/* 5. Full-Width Active Vehicle Studio Workspace */}
      {screen === 'workspace' && loadedCar && (
        <div className="flex flex-col h-screen w-screen bg-[#0b0e14] text-slate-100 overflow-hidden">
          {/* Top Action Bar */}
          <header className="bg-[#0f141e] border-b border-[#1f283b] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex items-center gap-0.5 bg-[#121927] border border-[#253048] rounded-lg p-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleNavigateHistory('back')}
                  disabled={!navButtonState.canBack}
                  className="p-1 rounded hover:bg-[#23304a] disabled:opacity-30 text-slate-200 transition-colors"
                  title="戻る (マウスサイドボタン戻る / Alt+←)"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleNavigateHistory('forward')}
                  disabled={!navButtonState.canForward}
                  className="p-1 rounded hover:bg-[#23304a] disabled:opacity-30 text-slate-200 transition-colors"
                  title="進む (マウスサイドボタン進む / Alt+→)"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                onClick={refreshPartCountAndGoHome}
                className="flex items-center gap-1.5 bg-[#182132] hover:bg-[#23304a] text-slate-200 border border-[#2a3650] text-xs px-2.5 py-1.5 rounded-lg shrink-0"
                title="作業選択ホーム画面へ戻る"
              >
                <Home className="w-3.5 h-3.5 text-rose-400" />
                ホーム
              </button>

              {isStandaloneModelStudio && (
                <button
                  onClick={() => pushNavRoute({ screen: 'model_hub' })}
                  className="flex items-center gap-1.5 bg-[#182132] hover:bg-[#23304a] text-emerald-300 border border-emerald-500/30 text-xs px-2.5 py-1.5 rounded-lg shrink-0"
                  title="モデル改造・保存・確認メニューへ戻る"
                >
                  <Box className="w-3.5 h-3.5" />
                  モデルメニュー
                </button>
              )}

              <button
                onClick={() => pushNavRoute({ screen: 'car_select' })}
                className="flex items-center gap-1.5 bg-[#182132] hover:bg-[#23304a] text-cyan-300 border border-cyan-500/30 text-xs px-2.5 py-1.5 rounded-lg shrink-0"
                title="CSP大画面ガレージで別の車両を選択"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                車両変更
              </button>

              <div className="h-6 w-px bg-[#242e42] mx-0.5 hidden sm:block" />

              {isStandaloneStudio && (
                <span
                  className={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-lg border shrink-0 ${
                    isStandaloneLiveryStudio
                      ? 'bg-fuchsia-500/15 border-fuchsia-500/40 text-fuchsia-200'
                      : targetWork === 'model_save'
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                        : 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200'
                  }`}
                >
                  {isStandaloneLiveryStudio ? (
                    <>
                      <Paintbrush className="w-3.5 h-3.5" />
                      ペイント / スキンスタジオ
                    </>
                  ) : targetWork === 'model_save' ? (
                    <>
                      <Box className="w-3.5 h-3.5" />
                      モデルの保存スタジオ
                    </>
                  ) : (
                    <>
                      <Box className="w-3.5 h-3.5" />
                      モデル改造スタジオ
                    </>
                  )}
                </span>
              )}

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-slate-100 truncate max-w-[260px]">
                    {uiCarJson.name || loadedCar.summary.name}
                  </h2>
                  {!isStandaloneStudio && isDirty && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                      未保存
                    </span>
                  )}
                  {!isStandaloneStudio && loadedCar.summary.hasDataAcd && (
                    <span className="text-[10px] font-mono-num px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 shrink-0">
                      ACD
                    </span>
                  )}
                  {!isStandaloneStudio && loadedCar.summary.hasDataFolder && (
                    <span className="text-[10px] font-mono-num px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 shrink-0">
                      data/
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 font-mono-num flex items-center gap-2.5">
                  <span className="truncate max-w-[160px]">{loadedCar.summary.id}</span>
                  {!isStandaloneStudio && (
                    <>
                      <span>•</span>
                      <span className="text-rose-300">
                        {Math.round(
                          metrics.hasHybrid
                            ? (metrics.combinedPeakPowerPs ?? metrics.peakPowerPs)
                            : metrics.peakPowerPs
                        )}{' '}
                        PS
                      </span>
                      <span className="text-amber-300">
                        {Math.round(
                          metrics.hasHybrid
                            ? (metrics.combinedPeakTorqueNm ?? metrics.peakTorqueNm)
                            : metrics.peakTorqueNm
                        )}{' '}
                        Nm
                      </span>
                      <span className="text-slate-300">{Math.round(metrics.massKg)} kg</span>
                      <span className="text-cyan-300">{metrics.driveType}</span>
                      {metrics.transmissionMode === 'csp_at' && (
                        <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-200 text-[10px]">
                          CSP AT
                        </span>
                      )}
                      {metrics.transmissionMode === 'csp_cvt' && (
                        <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-200 text-[10px]">
                          CSP CVT
                        </span>
                      )}
                      {metrics.hasHybrid && (
                        <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 text-[10px]">
                          HV +{Math.round(metrics.motorPeakKw ?? 0)}kW
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              {!isStandaloneStudio && (
                <>
                  {loadedCar.summary.hasDataAcd && (
                    <button
                      onClick={handleUnpackAcd}
                      className="flex items-center gap-1 bg-[#182132] hover:bg-[#233048] text-amber-300 border border-amber-500/30 px-2.5 py-1.5 rounded-lg"
                      title="data.acd を data/ フォルダへ展開"
                    >
                      <PackageOpen className="w-3.5 h-3.5" />
                      ACD展開
                    </button>
                  )}

                  <button
                    onClick={handlePackAcd}
                    className="flex items-center gap-1 bg-[#182132] hover:bg-[#233048] text-cyan-300 border border-cyan-500/30 px-2.5 py-1.5 rounded-lg"
                    title="data/ フォルダを data.acd に再パック"
                  >
                    <Package className="w-3.5 h-3.5" />
                    ACDパック
                  </button>

                  <button
                    onClick={() => setBackupModalOpen(true)}
                    className="flex items-center gap-1 bg-[#182132] hover:bg-[#233048] text-slate-200 border border-[#2a3650] px-2.5 py-1.5 rounded-lg"
                  >
                    <History className="w-3.5 h-3.5 text-slate-400" />
                    Backup ({backups.length})
                  </button>
                </>
              )}

              <button
                onClick={() => carsDir && selectedCarId && window.acApi.openCarFolder(carsDir, selectedCarId)}
                className="p-1.5 bg-[#182132] hover:bg-[#233048] text-slate-300 border border-[#2a3650] rounded-lg"
                title="エクスプローラーで車両フォルダを開く"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => pushNavRoute({ screen: 'settings' })}
                className="p-1.5 bg-[#182132] hover:bg-[#233048] text-slate-300 border border-[#2a3650] rounded-lg"
                title="設定 (自動UI調整・起動アニメーション・スキン解像度)"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>

              <div className="h-5 w-px bg-[#242e42]" />

              {/* Context-Aware Undo / Redo (Ctrl+Z / Ctrl+Y) across Data, 3D Model, Skin & EngineSim */}
              <div className="flex items-center gap-0.5 bg-[#121927] border border-[#253048] rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => activeUndoRedo.undo()}
                  disabled={!activeUndoRedo.canUndo}
                  className="flex items-center gap-1 px-1.5 py-1 rounded hover:bg-[#23304a] disabled:opacity-35 text-slate-200 transition-colors"
                  title={
                    activeUndoRedo.undoLabel
                      ? `元に戻す (Ctrl+Z): ${activeUndoRedo.undoLabel}`
                      : '元に戻す (Ctrl+Z)'
                  }
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  {activeUndoRedo.undoCount > 0 && (
                    <span className="text-[10px] font-mono-num text-cyan-300">
                      {activeUndoRedo.undoCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => activeUndoRedo.redo()}
                  disabled={!activeUndoRedo.canRedo}
                  className="flex items-center gap-1 px-1.5 py-1 rounded hover:bg-[#23304a] disabled:opacity-35 text-slate-200 transition-colors"
                  title={
                    activeUndoRedo.redoLabel
                      ? `やり直し (Ctrl+Y): ${activeUndoRedo.redoLabel}`
                      : 'やり直し (Ctrl+Y)'
                  }
                >
                  <Redo2 className="w-3.5 h-3.5" />
                  {activeUndoRedo.redoCount > 0 && (
                    <span className="text-[10px] font-mono-num text-amber-300">
                      {activeUndoRedo.redoCount}
                    </span>
                  )}
                </button>
              </div>

              {!isStandaloneStudio && (
                <>
                  <label className="flex items-center gap-1 text-[11px] text-slate-400 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={autoBackupOnSave}
                      onChange={(e) => setAutoBackupOnSave(e.target.checked)}
                      className="accent-cyan-500"
                    />
                    自動Backup
                  </label>

                  <label className="flex items-center gap-1 text-[11px] text-slate-400 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={repackOnSave}
                      onChange={(e) => setRepackOnSave(e.target.checked)}
                      className="accent-amber-500"
                    />
                    ACD更新
                  </label>

                  {isDirty && (
                    <button
                      onClick={handleResetEdits}
                      className="flex items-center gap-1 bg-[#1b2232] hover:bg-[#273046] text-slate-300 px-2.5 py-1.5 rounded-lg"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      戻す
                    </button>
                  )}

                  <button
                    onClick={handleSave}
                    disabled={saving || !isDirty}
                    className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white font-semibold px-4 py-1.5 rounded-lg shadow-md shadow-rose-600/20"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {saving ? '保存中...' : '保存'}
                  </button>
                </>
              )}
            </div>
          </header>

          {/* Car Data Navigation Tabs (hidden for independent Model & Livery Studios!) */}
          {!isStandaloneStudio && (
            <nav className="bg-[#0d111a] border-b border-[#1f283b] px-4 flex items-center justify-between gap-2 overflow-x-auto shrink-0">
              <div className="flex items-center gap-1 overflow-x-auto">
                {tabs.map((t) => {
                  const active = activeTab === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => pushNavRoute({ screen: 'workspace', activeTab: t.id })}
                      className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                        active
                          ? 'border-rose-500 text-rose-300 bg-rose-500/5'
                          : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-[#141a27]'
                      }`}
                    >
                      {t.icon}
                      {t.label}
                    </button>
                  );
                })}
              </div>

              {/* 3D Model Viewer Only Floating / Separate Window Quick Switch */}
              <div className="flex items-center gap-1.5 py-1.5 shrink-0">
                <span className="text-[11px] text-slate-400 hidden xl:inline mr-0.5">
                  3Dモデルビューワーのみ:
                </span>
                {global3dViewerMode !== 'docked' ? (
                  <button
                    type="button"
                    onClick={() => setGlobal3dViewerMode('docked')}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold"
                  >
                    3Dビューワーを閉じる
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setGlobal3dViewerMode('floating')}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#161f30] hover:bg-[#22304a] border border-[#2c3a57] text-cyan-300 text-[11px] font-medium"
                      title="どのデータ編集タブからでも、3Dモデルビューワーのみをフローティング表示して車高・タイヤ・キャンバー・トーをリアルタイム確認できます"
                    >
                      <PictureInPicture2 className="w-3.5 h-3.5" />
                      3Dビューワーをフローティング
                    </button>
                    <button
                      type="button"
                      onClick={() => setGlobal3dViewerMode('popout')}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-200 text-[11px] font-medium"
                      title="3Dモデルビューワーのみを独立した別ウィンドウとして開きます"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      3Dビューワーを別ウィンドウ
                    </button>
                  </>
                )}
              </div>
            </nav>
          )}

          {/* Active Tab Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5">
            <Suspense fallback={<LazyLoadingFallback />}>
              {renderTabBody(activeTab)}
            </Suspense>

            {/* Global 3D Model Viewer Only Floating / Separate Window (Live synchronized with Suspension & Tyre Settings!) */}
            {!isStandaloneStudio && global3dViewerMode !== 'docked' && globalSuspKin && (
              <DetachablePanel
                panelId="global_3d_car_viewer"
                title={`3Dモデルビューワー — ${uiCarJson.name || loadedCar.summary.name}`}
                subtitle={loadedCar.summary.id}
                role="viewer3d"
                mode={global3dViewerMode}
                onModeChange={setGlobal3dViewerMode}
                defaultFloatingBounds={{ x: 28, y: 88, width: 660, height: 500 }}
                popoutSize={{ width: 840, height: 640 }}
              >
                <Suspense fallback={<LazyLoadingFallback />}>
                  <SuspensionViewport3D
                    carsDir={carsDir}
                    carId={selectedCarId}
                    livePosture={globalLivePosture}
                    testLoadFactor={globalLoadFactor}
                    testLateralG={globalLateralG}
                    onChangeLoadFactor={setGlobalLoadFactor}
                    onChangeLateralG={setGlobalLateralG}
                    canvasHeightClass="h-full"
                    params={{
                      wheelbase: globalSuspKin.input.wheelbase,
                      frontTrack: globalSuspKin.input.frontTrack,
                      rearTrack: globalSuspKin.input.rearTrack,
                      frontRodLength: globalSuspKin.input.frontRodLength,
                      rearRodLength: globalSuspKin.input.rearRodLength,
                      frontCamberDeg: globalSuspKin.input.frontStaticCamberDeg,
                      rearCamberDeg: globalSuspKin.input.rearStaticCamberDeg,
                      frontToeM: globalSuspKin.input.frontToeM,
                      rearToeM: globalSuspKin.input.rearToeM,
                      frontSpringRate: globalSuspKin.input.frontSpringRate,
                      rearSpringRate: globalSuspKin.input.rearSpringRate,
                      frontArb: globalSuspKin.input.frontArb,
                      rearArb: globalSuspKin.input.rearArb,
                      steerLockDeg: 450,
                      steerRatio: 14.5,
                      frontRadius: globalSuspKin.input.frontRadius,
                      rearRadius: globalSuspKin.input.rearRadius,
                      frontWidth: globalSuspKin.input.frontWidth,
                      rearWidth: globalSuspKin.input.rearWidth,
                    }}
                  />
                </Suspense>
              </DetachablePanel>
            )}
          </div>
        </div>
      )}

      {/* Global Modals (mounted only when opened) */}
      {newCarModalOpen && (
        <Suspense fallback={null}>
          <NewCarModal
            open={newCarModalOpen}
            onClose={() => setNewCarModalOpen(false)}
            onCreate={handleCreateCar}
          />
        </Suspense>
      )}

      {loadedCar && backupModalOpen && (
        <Suspense fallback={null}>
          <BackupModal
            open={backupModalOpen}
            carName={uiCarJson.name || loadedCar.summary.name}
            backups={backups}
            onClose={() => setBackupModalOpen(false)}
            onCreateBackup={handleCreateBackup}
            onRestoreBackup={handleRestoreBackup}
            onDeleteBackup={handleDeleteBackup}
          />
        </Suspense>
      )}

      {/* Global Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl border shadow-2xl text-xs font-medium ${
            toast.type === 'error'
              ? 'bg-rose-950/95 border-rose-500/60 text-rose-200'
              : toast.type === 'info'
                ? 'bg-slate-900/95 border-cyan-500/50 text-cyan-200'
                : 'bg-emerald-950/95 border-emerald-500/60 text-emerald-200'
          }`}
        >
          {toast.type === 'error' ? (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : toast.type === 'info' ? (
            <Archive className="w-4 h-4 text-cyan-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span>{toast.text}</span>
        </div>
      )}
    </>
  );
};

export default App;
