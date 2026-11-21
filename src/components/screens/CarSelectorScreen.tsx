import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  ArrowLeft,
  BookmarkPlus,
  Box,
  Building2,
  Car,
  ChevronRight,
  FolderOpen,
  Grid2x2,
  LayoutGrid,
  Package,
  Paintbrush,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Search,
  Sliders,
  Sparkles,
  Sun,
  Volume2,
} from 'lucide-react';
import type { CarSummary } from '../../types/ac';
import { kn5ToThreeGroup, parseKn5 } from '../../utils/kn5Codec';
import {
  buildCspTextureCache,
  createCspEnvironmentMap,
  type CspLightingPreset,
} from '../../utils/cspRenderer';
import { disposeThreeObject } from '../../utils/threeCleanup';

export type CarWorkTarget = 'model_edit' | 'model_save' | 'paint' | 'engine_sim' | 'car_tuning';

interface CarSelectorScreenProps {
  carsDir: string | null;
  cars: CarSummary[];
  loadingCars: boolean;
  targetWork: CarWorkTarget;
  defaultCspLighting: CspLightingPreset;
  onStartWork: (carId: string, work: CarWorkTarget) => void;
  onBackHome: () => void;
  onPickFolder: () => void;
  onUseDemo: () => void;
  onRefresh: () => void;
  onOpenNewCar: () => void;
}

interface BrandGroupInfo {
  name: string;
  count: number;
  badgeDataUrl?: string;
  samplePreviewUrl?: string;
  countries: string[];
}

const STORAGE_COLS_KEY = 'ac_car_studio_garage_cols';

const WORK_META: Record<
  CarWorkTarget,
  { title: string; cta: string; badgeClass: string; icon: React.ReactNode }
> = {
  model_edit: {
    title: 'モデルの改造 — 車両を選択',
    cta: 'この車両でモデル改造を開始',
    badgeClass: 'bg-cyan-500/20 text-cyan-200 border-cyan-500/40',
    icon: <Box className="w-4 h-4" />,
  },
  model_save: {
    title: 'モデルの保存 — 抽出元の車両を選択',
    cta: 'この車両からパーツを選択して保存',
    badgeClass: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40',
    icon: <BookmarkPlus className="w-4 h-4" />,
  },
  paint: {
    title: 'ペイント / スキン — 車両を選択',
    cta: 'この車両をペイントする',
    badgeClass: 'bg-fuchsia-500/20 text-fuchsia-200 border-fuchsia-500/40',
    icon: <Paintbrush className="w-4 h-4" />,
  },
  engine_sim: {
    title: 'エンジン音シミュレーター — 車両を選択',
    cta: 'この車両のエンジン音を設計する',
    badgeClass: 'bg-violet-500/20 text-violet-200 border-violet-500/40',
    icon: <Volume2 className="w-4 h-4" />,
  },
  car_tuning: {
    title: '車両データ改造 — 車両を選択',
    cta: 'この車両のデータを改造する',
    badgeClass: 'bg-rose-500/20 text-rose-200 border-rose-500/40',
    icon: <Sliders className="w-4 h-4" />,
  },
};

function loadSavedCols(): number {
  try {
    const v = Number(localStorage.getItem(STORAGE_COLS_KEY));
    if (v >= 2 && v <= 6) return v;
  } catch {
    // ignore
  }
  return 3;
}

export const CarSelectorScreen: React.FC<CarSelectorScreenProps> = ({
  carsDir,
  cars,
  loadingCars,
  targetWork,
  defaultCspLighting,
  onStartWork,
  onBackHome,
  onPickFolder,
  onUseDemo,
  onRefresh,
  onOpenNewCar,
}) => {
  const [search, setSearch] = useState('');
  const [brandSearch, setBrandSearch] = useState('');
  const [selectedBrand, setSelectedBrand] = useState<string>('ALL');
  const [selectedClass, setSelectedClass] = useState<string>('ALL');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'folder' | 'acd'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'brand' | 'year'>('name');
  const [browseView, setBrowseView] = useState<'cars' | 'brands'>('cars');
  const [showBrandSidebar, setShowBrandSidebar] = useState(true);
  const [columnsPerRow, setColumnsPerRow] = useState<number>(loadSavedCols);
  const [focusedCarId, setFocusedCarId] = useState<string | null>(cars[0]?.id ?? null);

  // Live 3D CSP Preview toggle inside right detail pane
  const [show3DPreview, setShow3DPreview] = useState(false);
  const [loading3D, setLoading3D] = useState(false);
  const [preview3DNote, setPreview3DNote] = useState('');
  const previewMountRef = useRef<HTMLDivElement | null>(null);

  const handleSetColumns = (cols: number) => {
    setColumnsPerRow(cols);
    try {
      localStorage.setItem(STORAGE_COLS_KEY, String(cols));
    } catch {
      // ignore
    }
  };

  // Aggregate manufacturers (brands) with badge images and counts
  const brands = useMemo<BrandGroupInfo[]>(() => {
    const map = new Map<string, BrandGroupInfo>();
    for (const c of cars) {
      const name = c.brand?.trim() || 'Unknown';
      const existing = map.get(name);
      if (!existing) {
        map.set(name, {
          name,
          count: 1,
          badgeDataUrl: c.badgeDataUrl,
          samplePreviewUrl: c.previewDataUrl,
          countries: c.country ? [c.country] : [],
        });
      } else {
        existing.count++;
        if (!existing.badgeDataUrl && c.badgeDataUrl) existing.badgeDataUrl = c.badgeDataUrl;
        if (!existing.samplePreviewUrl && c.previewDataUrl) existing.samplePreviewUrl = c.previewDataUrl;
        if (c.country && !existing.countries.includes(c.country)) existing.countries.push(c.country);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [cars]);

  const filteredBrands = useMemo(() => {
    const q = brandSearch.trim().toLowerCase();
    if (!q) return brands;
    return brands.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.countries.some((ct) => ct.toLowerCase().includes(q))
    );
  }, [brands, brandSearch]);

  const classes = useMemo(() => {
    const set = new Set<string>();
    for (const c of cars) {
      if (c.carClass) set.add(c.carClass.toLowerCase());
    }
    return Array.from(set).sort();
  }, [cars]);

  const filteredCars = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = cars.filter((c) => {
      if (selectedBrand !== 'ALL' && (c.brand?.trim() || 'Unknown') !== selectedBrand) return false;
      if (selectedClass !== 'ALL' && (c.carClass || '').toLowerCase() !== selectedClass) return false;
      if (sourceFilter === 'folder' && !c.hasDataFolder) return false;
      if (sourceFilter === 'acd' && !c.hasDataAcd) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        c.brand.toLowerCase().includes(q) ||
        c.carClass.toLowerCase().includes(q) ||
        c.country.toLowerCase().includes(q)
      );
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'brand') return a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name);
      if (sortBy === 'year') return (Number(b.year) || 0) - (Number(a.year) || 0) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
  }, [cars, search, selectedBrand, selectedClass, sourceFilter, sortBy]);

  useEffect(() => {
    if (filteredCars.length > 0 && !filteredCars.some((c) => c.id === focusedCarId)) {
      setFocusedCarId(filteredCars[0].id);
    }
  }, [filteredCars, focusedCarId]);

  const focusedCar = useMemo(
    () => filteredCars.find((c) => c.id === focusedCarId) ?? filteredCars[0] ?? null,
    [filteredCars, focusedCarId]
  );

  // Live 3D CSP Preview Renderer in Detail Pane
  useEffect(() => {
    if (!show3DPreview || !focusedCar || !carsDir) return;
    const container = previewMountRef.current;
    if (!container) return;

    let cancelled = false;
    setLoading3D(true);
    setPreview3DNote('');

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0c111b');

    const camera = new THREE.PerspectiveCamera(
      38,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.05,
      100
    );
    camera.position.set(3.8, 1.45, 4.1);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const env = createCspEnvironmentMap(renderer, defaultCspLighting);
    scene.environment = env;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.5;
    controls.target.set(0, 0.55, 0);

    scene.add(new THREE.HemisphereLight('#f1f5f9', '#1e293b', 0.75));
    const key = new THREE.DirectionalLight('#ffffff', 2.0);
    key.position.set(5, 8, 5);
    scene.add(key);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(10, 48),
      new THREE.MeshStandardMaterial({ color: '#0a0f18', roughness: 0.4, metalness: 0.25 })
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    (async () => {
      try {
        const models = await window.acApi.listCarModels(carsDir, focusedCar.id);
        const preferred = models.find((m) => !m.fileName.toLowerCase().includes('collider'));
        if (!preferred || cancelled) {
          if (!cancelled) setPreview3DNote('この車両には表示可能な .kn5 モデルがありません');
          return;
        }
        const bytes = await window.acApi.readCarModelBytes(carsDir, focusedCar.id, preferred.fileName);
        if (!bytes || cancelled) return;
        const doc = parseKn5(bytes);
        const cache = buildCspTextureCache(doc.textures);
        const grp = kn5ToThreeGroup(doc, cache);
        const box = new THREE.Box3().setFromObject(grp);
        if (!box.isEmpty()) {
          grp.position.y -= box.min.y;
          const center = box.getCenter(new THREE.Vector3());
          grp.position.x -= center.x;
          grp.position.z -= center.z;
        }
        scene.add(grp);
        setPreview3DNote(`CSP 3D: ${preferred.fileName}`);
      } catch {
        if (!cancelled) setPreview3DNote('3Dモデルの読込に失敗しました');
      } finally {
        if (!cancelled) setLoading3D(false);
      }
    })();

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      controls.update();
      renderer.render(scene, camera);
    };
    loop();

    const ro = new ResizeObserver(() => {
      if (!container) return;
      camera.aspect = container.clientWidth / Math.max(1, container.clientHeight);
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, Math.max(1, container.clientHeight));
    });
    ro.observe(container);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      env.dispose();
      disposeThreeObject(scene);
      renderer.dispose();
    };
  }, [show3DPreview, focusedCar, carsDir, defaultCspLighting]);

  const workMeta = WORK_META[targetWork];
  const isCompactCard = columnsPerRow >= 5;

  return (
    <div className="h-screen w-screen bg-[#080b11] text-slate-100 flex flex-col overflow-hidden">
      {/* Top Bar */}
      <header className="px-5 py-3 bg-[#0c111b] border-b border-[#1f283b] flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onBackHome}
            className="flex items-center gap-1.5 bg-[#182132] hover:bg-[#23304a] border border-[#2a3650] text-slate-200 text-xs px-3 py-1.5 rounded-lg"
          >
            <ArrowLeft className="w-4 h-4" />
            ホーム
          </button>

          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold ${workMeta.badgeClass}`}
          >
            {workMeta.icon}
            {workMeta.title}
          </div>

          <span className="text-xs font-mono-num text-slate-400">
            {selectedBrand === 'ALL' ? '全メーカー' : selectedBrand} ({filteredCars.length} / {cars.length} 台)
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            onClick={onOpenNewCar}
            disabled={!carsDir}
            className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white font-semibold px-3 py-1.5 rounded-lg"
          >
            <Plus className="w-3.5 h-3.5" />
            新規Mod作成
          </button>
          <button
            onClick={onPickFolder}
            className="flex items-center gap-1.5 bg-[#182132] hover:bg-[#23304a] border border-[#2a3650] text-slate-200 px-3 py-1.5 rounded-lg"
          >
            <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
            ACフォルダ変更
          </button>
          <button
            onClick={onUseDemo}
            className="flex items-center gap-1 bg-[#182132] hover:bg-[#23304a] border border-cyan-500/30 text-cyan-300 px-2.5 py-1.5 rounded-lg"
          >
            <Sparkles className="w-3.5 h-3.5" />
            デモ
          </button>
          <button
            onClick={onRefresh}
            disabled={!carsDir}
            className="p-1.5 bg-[#182132] hover:bg-[#23304a] border border-[#2a3650] text-slate-300 rounded-lg"
            title="再スキャン"
          >
            <RefreshCw className={`w-4 h-4 ${loadingCars ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* CSP Filter, Manufacturer Mode & Columns-Per-Row Toolbar */}
      <div className="px-5 py-2.5 bg-[#0e131e] border-b border-[#1c2538] flex flex-wrap items-center gap-2.5 shrink-0 text-xs">
        {/* Toggle Manufacturer Left Sidebar */}
        <button
          onClick={() => setShowBrandSidebar((v) => !v)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-colors ${
            showBrandSidebar
              ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-200'
              : 'bg-[#090c11] border-[#27324a] text-slate-400 hover:text-slate-200'
          }`}
          title="メーカー選択サイドバーの表示/非表示"
        >
          {showBrandSidebar ? <PanelLeftClose className="w-3.5 h-3.5" /> : <PanelLeftOpen className="w-3.5 h-3.5" />}
          メーカー欄
        </button>

        {/* Cars Grid vs Brand Central Tiles View */}
        <div className="flex bg-[#090c11] border border-[#27324a] rounded-lg p-0.5">
          <button
            onClick={() => setBrowseView('cars')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] ${
              browseView === 'cars' ? 'bg-rose-600 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            車両一覧
          </button>
          <button
            onClick={() => setBrowseView('brands')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] ${
              browseView === 'brands' ? 'bg-cyan-600 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            メーカーから選ぶ ({brands.length})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="車名・メーカー・クラス・IDで検索..."
            className="w-full bg-[#090c11] border border-[#27324a] rounded-xl pl-8 pr-3 py-1.5 text-slate-100 focus:outline-none focus:border-rose-500"
          />
        </div>

        {/* Class Filter */}
        <select
          value={selectedClass}
          onChange={(e) => setSelectedClass(e.target.value)}
          className="bg-[#090c11] border border-[#27324a] rounded-lg px-2.5 py-1.5 text-slate-200"
        >
          <option value="ALL">クラス: すべて</option>
          {classes.map((cls) => (
            <option key={cls} value={cls}>
              {cls}
            </option>
          ))}
        </select>

        {/* Data Source Filter */}
        <div className="flex bg-[#090c11] border border-[#27324a] rounded-lg p-0.5">
          {(
            [
              ['all', 'すべて'],
              ['folder', 'data/'],
              ['acd', 'ACD'],
            ] as const
          ).map(([k, lbl]) => (
            <button
              key={k}
              onClick={() => setSourceFilter(k)}
              className={`px-2 py-1 rounded-md text-[11px] ${
                sourceFilter === k ? 'bg-amber-600 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>

        {/* Sort */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'name' | 'brand' | 'year')}
          className="bg-[#090c11] border border-[#27324a] rounded-lg px-2 py-1.5 text-slate-300"
        >
          <option value="name">車名順</option>
          <option value="brand">メーカー順</option>
          <option value="year">年式順</option>
        </select>

        {/* Columns-Per-Row Selector (2..6) */}
        <div className="flex items-center gap-1.5 bg-[#090c11] border border-[#27324a] rounded-lg px-2 py-1 ml-auto">
          <Grid2x2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="text-[11px] text-slate-400 whitespace-nowrap">1列の表示数:</span>
          {[2, 3, 4, 5, 6].map((n) => (
            <button
              key={n}
              onClick={() => handleSetColumns(n)}
              className={`w-6 h-6 rounded text-[11px] font-mono-num font-bold transition-colors ${
                columnsPerRow === n
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-[#192235]'
              }`}
              title={`1列に ${n} 台表示`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Main 3-Pane CSP Garage Body (Left: Manufacturers | Center: Grid | Right: CSP Detail) */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Pane: Dedicated Manufacturer (Brand) List */}
        {showBrandSidebar && (
          <aside className="w-56 shrink-0 bg-[#0b1019] border-r border-[#1f283b] flex flex-col min-h-0">
            <div className="p-2.5 border-b border-[#1c2538] space-y-2">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-300 px-1">
                <span className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-cyan-400" />
                  メーカー ({brands.length})
                </span>
                {selectedBrand !== 'ALL' && (
                  <button
                    onClick={() => setSelectedBrand('ALL')}
                    className="text-[10px] text-rose-400 hover:text-rose-300"
                  >
                    解除
                  </button>
                )}
              </div>
              <div className="relative">
                <Search className="w-3 h-3 text-slate-500 absolute left-2.5 top-2" />
                <input
                  type="text"
                  value={brandSearch}
                  onChange={(e) => setBrandSearch(e.target.value)}
                  placeholder="メーカー絞り込み..."
                  className="w-full bg-[#070a10] border border-[#222c40] rounded-lg pl-7 pr-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              <button
                onClick={() => {
                  setSelectedBrand('ALL');
                  setBrowseView('cars');
                }}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs border transition-colors ${
                  selectedBrand === 'ALL'
                    ? 'bg-rose-500/20 border-rose-500/60 text-rose-200 font-bold'
                    : 'bg-[#101622] border-transparent text-slate-300 hover:bg-[#172033]'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-md bg-[#1a2336] flex items-center justify-center text-[10px] font-bold text-rose-300">
                    ALL
                  </span>
                  すべて
                </span>
                <span className="font-mono-num text-[11px] text-slate-400">{cars.length}</span>
              </button>

              {filteredBrands.map((b) => {
                const active = selectedBrand === b.name;
                return (
                  <button
                    key={b.name}
                    onClick={() => {
                      setSelectedBrand(b.name);
                      setBrowseView('cars');
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl text-xs border transition-colors ${
                      active
                        ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-100 font-semibold'
                        : 'bg-[#101622]/70 border-transparent text-slate-300 hover:bg-[#172033]'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="w-6 h-6 rounded-md bg-[#090d14] border border-[#222c40] shrink-0 overflow-hidden flex items-center justify-center">
                        {b.badgeDataUrl ? (
                          <img src={b.badgeDataUrl} alt={b.name} className="w-5 h-5 object-contain" />
                        ) : (
                          <span className="text-[10px] font-bold text-slate-400">
                            {b.name.slice(0, 2).toUpperCase()}
                          </span>
                        )}
                      </span>
                      <span className="truncate">{b.name}</span>
                    </span>
                    <span className="font-mono-num text-[11px] text-slate-500 shrink-0">{b.count}</span>
                  </button>
                );
              })}
            </div>
          </aside>
        )}

        {/* Center Pane: Manufacturer Tiles OR Variable-Column Car Grid */}
        <div className="flex-1 overflow-y-auto p-4 min-w-0">
          {loadingCars ? (
            <div className="h-full flex items-center justify-center text-sm text-slate-400">
              Assetto Corsa 車両ガレージをスキャン中...
            </div>
          ) : browseView === 'brands' ? (
            /* ===== BRAND CENTRAL MANUFACTURER TILE GRID ===== */
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                <span>メーカーを選択すると、そのメーカーの車両一覧を表示します</span>
                <span className="font-mono-num">{filteredBrands.length} メーカー</span>
              </div>
              <div
                className="grid gap-3.5"
                style={{
                  gridTemplateColumns: `repeat(${columnsPerRow}, minmax(0, 1fr))`,
                }}
              >
                {filteredBrands.map((b) => (
                  <button
                    key={b.name}
                    onClick={() => {
                      setSelectedBrand(b.name);
                      setBrowseView('cars');
                    }}
                    className="group relative rounded-2xl overflow-hidden border border-[#222d42] hover:border-cyan-500 bg-[#101622] hover:bg-[#162033] transition-all text-left p-4 flex flex-col items-center justify-center gap-2.5 min-h-[145px]"
                  >
                    {b.samplePreviewUrl && (
                      <img
                        src={b.samplePreviewUrl}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover opacity-15 group-hover:opacity-25 group-hover:scale-105 transition-all"
                      />
                    )}
                    <div className="relative z-10 w-14 h-14 rounded-2xl bg-[#090d14]/90 border border-[#2a3650] flex items-center justify-center shadow-lg">
                      {b.badgeDataUrl ? (
                        <img src={b.badgeDataUrl} alt={b.name} className="w-11 h-11 object-contain" />
                      ) : (
                        <span className="text-lg font-black text-cyan-300">
                          {b.name.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="relative z-10 text-center">
                      <div className="text-sm font-bold text-white group-hover:text-cyan-200 truncate max-w-[180px]">
                        {b.name}
                      </div>
                      <div className="text-[11px] font-mono-num text-slate-400 mt-0.5">
                        {b.count} 台 {b.countries[0] ? `• ${b.countries[0]}` : ''}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : filteredCars.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-4 text-slate-400">
              <Car className="w-14 h-14 text-slate-700" />
              <div>
                <p className="text-sm font-semibold text-slate-300">表示できる車両が見つかりません</p>
                <p className="text-xs text-slate-500 mt-1">
                  絞り込み条件を解除するか、ACフォルダ設定／デモ車両をご確認ください。
                </p>
              </div>
              <div className="flex gap-2">
                {selectedBrand !== 'ALL' && (
                  <button
                    onClick={() => setSelectedBrand('ALL')}
                    className="bg-[#1b2436] hover:bg-[#26324c] text-slate-200 text-xs font-semibold px-4 py-2 rounded-xl"
                  >
                    全メーカーを表示
                  </button>
                )}
                <button
                  onClick={onPickFolder}
                  className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold px-4 py-2 rounded-xl"
                >
                  ACフォルダを選択
                </button>
                <button
                  onClick={onUseDemo}
                  className="bg-[#1b2436] hover:bg-[#26324c] text-cyan-300 border border-cyan-500/30 text-xs font-semibold px-4 py-2 rounded-xl"
                >
                  デモ車両を開く
                </button>
              </div>
            </div>
          ) : (
            /* ===== VARIABLE-COLUMN CAR GRID (2..6 COLUMNS PER ROW) ===== */
            <div
              className="grid gap-3.5"
              style={{
                gridTemplateColumns: `repeat(${columnsPerRow}, minmax(0, 1fr))`,
              }}
            >
              {filteredCars.map((car) => {
                const isFocused = focusedCar?.id === car.id;
                return (
                  <div
                    key={car.id}
                    onClick={() => setFocusedCarId(car.id)}
                    onDoubleClick={() => onStartWork(car.id, targetWork)}
                    className={`group rounded-2xl overflow-hidden border cursor-pointer transition-all duration-150 ${
                      isFocused
                        ? 'bg-[#161f32] border-rose-500 ring-2 ring-rose-500/30 shadow-xl shadow-rose-500/10'
                        : 'bg-[#111622] border-[#212b3f] hover:border-[#3b4d70] hover:bg-[#151c2c]'
                    }`}
                  >
                    {/* 16:9 Thumbnail Preview */}
                    <div className="aspect-[16/9] w-full bg-[#090c11] relative overflow-hidden flex items-center justify-center">
                      {car.previewDataUrl ? (
                        <img
                          src={car.previewDataUrl}
                          alt={car.name}
                          decoding="async"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="flex flex-col items-center text-slate-700">
                          <Car className={isCompactCard ? 'w-7 h-7' : 'w-10 h-10'} />
                        </div>
                      )}

                      {/* Top-left Manufacturer Badge + Name */}
                      <div className="absolute top-1.5 left-1.5 flex items-center gap-1">
                        {car.badgeDataUrl && (
                          <span className="w-5 h-5 rounded bg-black/70 backdrop-blur p-0.5 flex items-center justify-center border border-white/10">
                            <img src={car.badgeDataUrl} alt="" className="w-full h-full object-contain" />
                          </span>
                        )}
                        {!isCompactCard && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/70 backdrop-blur text-slate-200 border border-white/10 truncate max-w-[90px]">
                            {car.brand}
                          </span>
                        )}
                      </div>

                      {/* Top-right Data Source Badges */}
                      <div className="absolute top-1.5 right-1.5 flex gap-1">
                        {car.hasDataFolder && (
                          <span className="text-[9px] font-mono-num px-1.5 py-0.5 rounded bg-emerald-950/90 border border-emerald-500/40 text-emerald-300">
                            data
                          </span>
                        )}
                        {car.hasDataAcd && (
                          <span className="text-[9px] font-mono-num px-1.5 py-0.5 rounded bg-amber-950/90 border border-amber-500/40 text-amber-300 flex items-center gap-0.5">
                            <Package className="w-2.5 h-2.5" />
                            ACD
                          </span>
                        )}
                      </div>

                      {/* Bottom Spec Strip */}
                      {!isCompactCard && (car.bhpSpec || car.weightSpec) && (
                        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-2.5 pt-4 pb-1.5 flex items-center justify-between text-[10px] font-mono-num">
                          <span className="text-rose-300 font-semibold">{car.bhpSpec || ''}</span>
                          <span className="text-slate-300">{car.weightSpec || ''}</span>
                        </div>
                      )}
                    </div>

                    {/* Card Footer */}
                    <div className={isCompactCard ? 'p-2' : 'p-2.5'}>
                      <div
                        className={`${isCompactCard ? 'text-xs' : 'text-sm'} font-bold text-slate-100 truncate`}
                        title={car.name}
                      >
                        {car.name}
                      </div>
                      <div className="flex items-center justify-between mt-0.5 text-[10px] text-slate-400">
                        <span className="truncate text-cyan-400 font-mono-num uppercase">
                          {isCompactCard ? car.brand : car.carClass}
                        </span>
                        <span className="font-mono-num text-slate-500 truncate ml-1">
                          {car.year || car.bhpSpec || ''}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Pane: CSP Showroom Detail & Action Pane */}
        <aside className="w-80 xl:w-96 shrink-0 bg-[#0d121c] border-l border-[#1f283b] flex flex-col min-h-0 overflow-y-auto p-4">
          {!focusedCar ? (
            <div className="flex-1 flex items-center justify-center text-xs text-slate-500">
              ガレージから車両を選択してください
            </div>
          ) : (
            <div className="flex flex-col h-full justify-between gap-4">
              <div className="space-y-3.5">
                {/* Large Preview / Live 3D CSP Toggle */}
                <div className="rounded-2xl overflow-hidden border border-[#26324a] bg-[#080b11] relative aspect-[16/10]">
                  {show3DPreview ? (
                    <>
                      <div ref={previewMountRef} className="w-full h-full" />
                      {loading3D && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-xs text-cyan-300">
                          CSP 3D ショールーム読込中...
                        </div>
                      )}
                      {preview3DNote && (
                        <div className="absolute bottom-2 left-2 text-[10px] font-mono-num bg-black/75 px-2 py-0.5 rounded text-cyan-300">
                          {preview3DNote}
                        </div>
                      )}
                    </>
                  ) : focusedCar.previewDataUrl ? (
                    <img
                      src={focusedCar.previewDataUrl}
                      alt={focusedCar.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-600">
                      <Car className="w-12 h-12" />
                      <span className="text-xs mt-1.5">プレビュー画像なし</span>
                    </div>
                  )}

                  <button
                    onClick={() => setShow3DPreview((v) => !v)}
                    className={`absolute top-2 right-2 flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg border backdrop-blur transition-colors ${
                      show3DPreview
                        ? 'bg-cyan-600/90 border-cyan-400 text-white'
                        : 'bg-black/70 hover:bg-black/90 border-white/20 text-slate-200'
                    }`}
                  >
                    <Sun className="w-3.5 h-3.5" />
                    {show3DPreview ? '2D画像' : '3D CSP'}
                  </button>
                </div>

                {/* Title & Brand Badge */}
                <div className="flex items-start gap-2.5">
                  {focusedCar.badgeDataUrl && (
                    <div className="w-10 h-10 rounded-xl bg-[#090d14] border border-[#253048] p-1.5 shrink-0 flex items-center justify-center">
                      <img src={focusedCar.badgeDataUrl} alt="" className="w-full h-full object-contain" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                      <span className="font-bold text-rose-400 uppercase tracking-wider">
                        {focusedCar.brand}
                      </span>
                      {focusedCar.year && <span>• {focusedCar.year}</span>}
                      {focusedCar.country && <span>• {focusedCar.country}</span>}
                    </div>
                    <h2 className="text-xl font-black text-white mt-0.5 leading-tight">
                      {focusedCar.name}
                    </h2>
                    <div className="text-[11px] font-mono-num text-slate-500 mt-0.5 truncate">
                      {focusedCar.id}
                    </div>
                  </div>
                </div>

                {/* CSP Spec Grid */}
                <div className="grid grid-cols-3 gap-2 text-center font-mono-num">
                  <div className="bg-[#121826] border border-[#232e44] rounded-xl p-2">
                    <div className="text-[10px] text-slate-400">POWER</div>
                    <div className="text-xs font-bold text-rose-300 mt-0.5 truncate">
                      {focusedCar.bhpSpec || '-'}
                    </div>
                  </div>
                  <div className="bg-[#121826] border border-[#232e44] rounded-xl p-2">
                    <div className="text-[10px] text-slate-400">TORQUE</div>
                    <div className="text-xs font-bold text-amber-300 mt-0.5 truncate">
                      {focusedCar.torqueSpec || '-'}
                    </div>
                  </div>
                  <div className="bg-[#121826] border border-[#232e44] rounded-xl p-2">
                    <div className="text-[10px] text-slate-400">WEIGHT</div>
                    <div className="text-xs font-bold text-cyan-300 mt-0.5 truncate">
                      {focusedCar.weightSpec || '-'}
                    </div>
                  </div>
                </div>

                <div className="bg-[#121826] border border-[#232e44] rounded-xl p-3 text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-400">クラス</span>
                    <span className="text-slate-200 uppercase font-mono-num">{focusedCar.carClass}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">データ状態</span>
                    <span className="text-slate-200 font-mono-num">
                      {focusedCar.hasDataFolder ? 'data/ 展開済' : ''}
                      {focusedCar.hasDataFolder && focusedCar.hasDataAcd ? ' + ' : ''}
                      {focusedCar.hasDataAcd ? 'data.acd' : ''}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">バックアップ数</span>
                    <span className="text-emerald-300 font-mono-num">{focusedCar.backupCount} 件</span>
                  </div>
                </div>
              </div>

              {/* Action Launch Buttons */}
              <div className="space-y-2 pt-3 border-t border-[#1e273a]">
                <button
                  onClick={() => onStartWork(focusedCar.id, targetWork)}
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-bold text-xs py-3 rounded-xl shadow-lg shadow-rose-600/25 transition-all"
                >
                  {workMeta.icon}
                  {workMeta.cta}
                  <ChevronRight className="w-4 h-4" />
                </button>

                <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                  <button
                    onClick={() => onStartWork(focusedCar.id, 'model_edit')}
                    className={`py-2 rounded-lg border font-medium ${
                      targetWork === 'model_edit'
                        ? 'bg-cyan-500/20 border-cyan-500 text-cyan-200'
                        : 'bg-[#141b29] hover:bg-[#1d273b] border-[#253048] text-slate-300'
                    }`}
                  >
                    モデル改造
                  </button>
                  <button
                    onClick={() => onStartWork(focusedCar.id, 'paint')}
                    className={`py-2 rounded-lg border font-medium ${
                      targetWork === 'paint'
                        ? 'bg-fuchsia-500/20 border-fuchsia-500 text-fuchsia-200'
                        : 'bg-[#141b29] hover:bg-[#1d273b] border-[#253048] text-slate-300'
                    }`}
                  >
                    ペイント
                  </button>
                  <button
                    onClick={() => onStartWork(focusedCar.id, 'car_tuning')}
                    className={`py-2 rounded-lg border font-medium ${
                      targetWork === 'car_tuning'
                        ? 'bg-rose-500/20 border-rose-500 text-rose-200'
                        : 'bg-[#141b29] hover:bg-[#1d273b] border-[#253048] text-slate-300'
                    }`}
                  >
                    データ改造
                  </button>
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
