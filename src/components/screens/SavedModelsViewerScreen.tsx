import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  Armchair,
  ArrowLeft,
  Box,
  Camera,
  Car,
  Check,
  ChevronRight,
  Compass,
  Disc,
  Eye,
  Flame,
  Grid2x2,
  Home,
  Layers,
  PackageCheck,
  Pause,
  Pencil,
  Play,
  Search,
  Shield,
  Sun,
  Trash2,
  Wind,
} from 'lucide-react';
import type { PartCategory, SavedPartEntry } from '../../types/ac';
import { kn5ToThreeGroup, parseKn5 } from '../../utils/kn5Codec';
import {
  buildCspTextureCache,
  createCspEnvironmentMap,
  type CspLightingPreset,
} from '../../utils/cspRenderer';
import { PART_CATEGORY_LABELS } from '../../utils/partTransfer';
import { clearThreeGroup, disposeThreeObject } from '../../utils/threeCleanup';

interface SavedModelsViewerScreenProps {
  defaultCspLighting: CspLightingPreset;
  navStep?: 'categories' | 'models';
  navCategory?: PartCategory | 'all';
  onNavStepChange?: (step: 'categories' | 'models', category: PartCategory | 'all') => void;
  onBackHome: () => void;
  onGoToModelEdit: () => void;
  onPartsChanged: (count: number) => void;
  onToast: (text: string, type?: 'success' | 'error' | 'info') => void;
}

interface CategoryTileMeta {
  id: PartCategory | 'all';
  title: string;
  en: string;
  desc: string;
  accent: string;
  icon: React.ReactNode;
}

const CATEGORY_TILES: CategoryTileMeta[] = [
  {
    id: 'wheel',
    title: 'ホイール / タイヤ',
    en: 'WHEELS & TYRES',
    desc: '保存したホイール・リム・タイヤモデル（4輪一括装着対応）',
    accent: 'from-cyan-500 to-blue-600',
    icon: <Disc className="w-7 h-7" />,
  },
  {
    id: 'steering',
    title: 'ステアリング',
    en: 'STEERING WHEELS',
    desc: '社外ステアリング・ディープコーン・フォーミュラハンドル等',
    accent: 'from-rose-500 to-orange-500',
    icon: <Compass className="w-7 h-7" />,
  },
  {
    id: 'seat',
    title: 'シート',
    en: 'RACING SEATS',
    desc: 'フルバケットシート・セミバケ・純正スポーツシート等',
    accent: 'from-amber-500 to-rose-600',
    icon: <Armchair className="w-7 h-7" />,
  },
  {
    id: 'wing',
    title: 'ウィング / エアロ',
    en: 'WINGS & AERO',
    desc: 'GTウィング・リップスポイラー・ディフューザー・カナード',
    accent: 'from-fuchsia-500 to-purple-600',
    icon: <Wind className="w-7 h-7" />,
  },
  {
    id: 'exhaust',
    title: 'マフラー / 排気',
    en: 'EXHAUST SYSTEMS',
    desc: 'チタンマフラー・2本出しテールパイプ・エキゾーストパーツ',
    accent: 'from-orange-500 to-red-600',
    icon: <Flame className="w-7 h-7" />,
  },
  {
    id: 'brake',
    title: 'ブレーキ',
    en: 'BRAKES & CALIPERS',
    desc: '大径スリットローター・対向キャリパー・ブレーキキット',
    accent: 'from-red-500 to-rose-700',
    icon: <Shield className="w-7 h-7" />,
  },
  {
    id: 'body',
    title: 'ボディパーツ',
    en: 'BODY PANELS',
    desc: 'バンパー・ボンネット・フェンダー・ミラー・ライト類',
    accent: 'from-indigo-500 to-blue-700',
    icon: <Car className="w-7 h-7" />,
  },
  {
    id: 'other',
    title: 'その他パーツ',
    en: 'OTHER PARTS',
    desc: 'ロールケージ・メーター・追加計器・カスタム小物等',
    accent: 'from-slate-500 to-slate-700',
    icon: <Box className="w-7 h-7" />,
  },
  {
    id: 'all',
    title: 'すべての保存モデル',
    en: 'ALL SAVED MODELS',
    desc: '全カテゴリの保存済みパーツをまとめて一覧表示します',
    accent: 'from-emerald-500 to-teal-600',
    icon: <Layers className="w-7 h-7" />,
  },
];

export const SavedModelsViewerScreen: React.FC<SavedModelsViewerScreenProps> = ({
  defaultCspLighting,
  navStep,
  navCategory,
  onNavStepChange,
  onBackHome,
  onGoToModelEdit,
  onPartsChanged,
  onToast,
}) => {
  const [parts, setParts] = useState<SavedPartEntry[]>([]);
  const [internalStep, setInternalStep] = useState<'categories' | 'models'>(navStep ?? 'categories');
  const [internalCategory, setInternalCategory] = useState<PartCategory | 'all'>(navCategory ?? 'wheel');
  const viewStep = navStep ?? internalStep;
  const selectedCategory = navCategory ?? internalCategory;
  const updateViewRoute = (step: 'categories' | 'models', category: PartCategory | 'all') => {
    setInternalStep(step);
    setInternalCategory(category);
    onNavStepChange?.(step, category);
  };
  const [search, setSearch] = useState('');
  const [columnsPerRow, setColumnsPerRow] = useState<number>(2);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Rename / edit metadata state
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<PartCategory>('wheel');
  const [savingMeta, setSavingMeta] = useState(false);
  const [updatingThumb, setUpdatingThumb] = useState(false);

  // 3D Viewer state
  const [cspPreset, setCspPreset] = useState<CspLightingPreset>(defaultCspLighting);
  const [autoRotate, setAutoRotate] = useState(true);
  const [wireframe, setWireframe] = useState(false);
  const [loadingMesh, setLoadingMesh] = useState(false);

  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const envRef = useRef<THREE.Texture | null>(null);
  const partGroupRef = useRef<THREE.Group | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);

  useEffect(() => {
    (async () => {
      const list = await window.acApi.listSavedParts();
      setParts(list);
      onPartsChanged(list.length);
    })();
  }, [onPartsChanged]);

  const categoryCounts = useMemo(() => {
    const map: Record<string, { count: number; thumb?: string }> = {
      all: { count: parts.length, thumb: parts[0]?.thumbnailDataUrl },
    };
    for (const p of parts) {
      if (!map[p.category]) {
        map[p.category] = { count: 1, thumb: p.thumbnailDataUrl };
      } else {
        map[p.category].count++;
        if (!map[p.category].thumb && p.thumbnailDataUrl) {
          map[p.category].thumb = p.thumbnailDataUrl;
        }
      }
    }
    return map;
  }, [parts]);

  const filteredParts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return parts.filter((p) => {
      if (selectedCategory !== 'all' && p.category !== selectedCategory) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.sourceCarId.toLowerCase().includes(q) ||
        p.sourceNodeName.toLowerCase().includes(q)
      );
    });
  }, [parts, selectedCategory, search]);

  useEffect(() => {
    if (viewStep === 'models' && filteredParts.length > 0 && !filteredParts.some((p) => p.id === selectedId)) {
      setSelectedId(filteredParts[0].id);
    }
  }, [viewStep, filteredParts, selectedId]);

  const selectedPart = useMemo(
    () => filteredParts.find((p) => p.id === selectedId) ?? filteredParts[0] ?? null,
    [filteredParts, selectedId]
  );

  // Sync rename inputs whenever selectedPart changes
  useEffect(() => {
    if (selectedPart) {
      setEditName(selectedPart.name);
      setEditCategory(selectedPart.category);
    } else {
      setEditName('');
    }
  }, [selectedPart]);

  // Setup CSP 3D Viewer only when in step 2 ('models')
  useEffect(() => {
    if (viewStep !== 'models') return;
    const container = mountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0c111b');

    const camera = new THREE.PerspectiveCamera(
      40,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.02,
      100
    );
    camera.position.set(1.5, 0.9, 1.8);

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const env = createCspEnvironmentMap(renderer, cspPreset);
    scene.environment = env;
    envRef.current = env;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 2.0;

    scene.add(new THREE.HemisphereLight('#f1f5f9', '#1e293b', 0.8));
    const key = new THREE.DirectionalLight('#ffffff', 2.0);
    key.position.set(4, 6, 4);
    scene.add(key);

    const grid = new THREE.GridHelper(6, 24, '#2e3c59', '#162033');
    grid.position.y = -0.5;
    scene.add(grid);
    gridRef.current = grid;

    const holder = new THREE.Group();
    scene.add(holder);

    sceneRef.current = scene;
    rendererRef.current = renderer;
    controlsRef.current = controls;
    cameraRef.current = camera;
    partGroupRef.current = holder;

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
      controls.update();
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      envRef.current?.dispose();
      disposeThreeObject(scene);
      renderer.dispose();
      sceneRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
      cameraRef.current = null;
      partGroupRef.current = null;
      gridRef.current = null;
    };
  }, [viewStep]);

  useEffect(() => {
    if (controlsRef.current) controlsRef.current.autoRotate = autoRotate;
  }, [autoRotate]);

  useEffect(() => {
    const scene = sceneRef.current;
    const renderer = rendererRef.current;
    if (!scene || !renderer) return;
    envRef.current?.dispose();
    const nextEnv = createCspEnvironmentMap(renderer, cspPreset);
    scene.environment = nextEnv;
    envRef.current = nextEnv;
  }, [cspPreset]);

  const activePartId = selectedPart?.id ?? null;

  // Load selected saved part KN5 into 3D viewer (keyed by ID so renaming or thumbnail refresh keeps camera angle)
  useEffect(() => {
    if (viewStep !== 'models') return;
    let cancelled = false;
    const holder = partGroupRef.current;
    if (!holder) return;
    clearThreeGroup(holder);
    if (!activePartId) return;

    (async () => {
      setLoadingMesh(true);
      try {
        const bytes = await window.acApi.loadSavedPartBytes(activePartId);
        if (!bytes || cancelled) return;
        const doc = parseKn5(bytes);
        const cache = buildCspTextureCache(doc.textures);
        const grp = kn5ToThreeGroup(doc, cache);

        const box = new THREE.Box3().setFromObject(grp);
        if (!box.isEmpty()) {
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          grp.position.sub(center);
          const maxDim = Math.max(0.25, size.x, size.y, size.z);
          if (cameraRef.current && controlsRef.current) {
            cameraRef.current.position.set(maxDim * 1.6, maxDim * 0.9, maxDim * 1.8);
            controlsRef.current.target.set(0, 0, 0);
            controlsRef.current.update();
          }
        }
        holder.add(grp);
      } finally {
        if (!cancelled) setLoadingMesh(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [viewStep, activePartId]);

  // Apply wireframe
  useEffect(() => {
    const holder = partGroupRef.current;
    if (!holder) return;
    holder.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const raw = (obj as THREE.Mesh).material;
        const mats: THREE.Material[] = Array.isArray(raw) ? raw : [raw];
        for (const m of mats) {
          if ('wireframe' in m) (m as THREE.MeshStandardMaterial).wireframe = wireframe;
        }
      }
    });
  }, [wireframe, loadingMesh]);

  const handleOpenCategory = (cat: PartCategory | 'all') => {
    setSearch('');
    setSelectedId(null);
    updateViewRoute('models', cat);
  };

  const handleSaveMeta = async () => {
    if (!selectedPart) return;
    const trimmed = editName.trim();
    if (!trimmed) {
      onToast('モデル名を入力してください', 'error');
      return;
    }
    setSavingMeta(true);
    try {
      const res = await window.acApi.updateSavedPartMeta(selectedPart.id, {
        name: trimmed,
        category: editCategory,
      });
      if (res.ok) {
        const list = await window.acApi.listSavedParts();
        setParts(list);
        onPartsChanged(list.length);
        onToast(`モデル名を「${trimmed}」に更新しました`, 'success');
      } else {
        onToast(res.error || '更新に失敗しました', 'error');
      }
    } finally {
      setSavingMeta(false);
    }
  };

  const handleUpdateThumbnail = async () => {
    if (!selectedPart || !rendererRef.current || !sceneRef.current || !cameraRef.current) return;
    setUpdatingThumb(true);
    try {
      const renderer = rendererRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      const grid = gridRef.current;
      const prevGridVis = grid ? grid.visible : true;
      if (grid) grid.visible = false;

      renderer.render(scene, camera);

      const src = renderer.domElement;
      const targetW = 480;
      const targetH = 300;
      const targetRatio = targetW / targetH;
      const srcW = Math.max(1, src.width);
      const srcH = Math.max(1, src.height);
      const srcRatio = srcW / srcH;

      let sx = 0;
      let sy = 0;
      let sw = srcW;
      let sh = srcH;
      if (srcRatio > targetRatio) {
        sw = srcH * targetRatio;
        sx = (srcW - sw) / 2;
      } else {
        sh = srcW / targetRatio;
        sy = (srcH - sh) / 2;
      }

      const out = document.createElement('canvas');
      out.width = targetW;
      out.height = targetH;
      const ctx = out.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D コンテキストの取得に失敗しました');
      ctx.fillStyle = '#0c111b';
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.drawImage(src, sx, sy, sw, sh, 0, 0, targetW, targetH);
      const dataUrl = out.toDataURL('image/jpeg', 0.9);

      if (grid) grid.visible = prevGridVis;
      renderer.render(scene, camera);

      const res = await window.acApi.updateSavedPartMeta(selectedPart.id, {
        thumbnailDataUrl: dataUrl,
      });
      if (res.ok) {
        const list = await window.acApi.listSavedParts();
        setParts(list);
        onPartsChanged(list.length);
        onToast(`「${selectedPart.name}」のプレビュー画像を更新しました`, 'success');
      } else {
        onToast(res.error || 'プレビュー画像の更新に失敗しました', 'error');
      }
    } catch (err) {
      onToast(err instanceof Error ? err.message : '画像の撮影に失敗しました', 'error');
    } finally {
      setUpdatingThumb(false);
    }
  };

  const handleDelete = async (id: string) => {
    await window.acApi.deleteSavedPart(id);
    const next = await window.acApi.listSavedParts();
    setParts(next);
    onPartsChanged(next.length);
    if (selectedId === id) setSelectedId(null);
    onToast('保存済みモデルを削除しました', 'info');
  };

  const activeCategoryMeta =
    CATEGORY_TILES.find((c) => c.id === selectedCategory) ?? CATEGORY_TILES[0];

  const metaDirty =
    Boolean(selectedPart) &&
    (editName.trim() !== selectedPart!.name || editCategory !== selectedPart!.category);

  // =========================================================================
  // STEP 1: CSP-Style Part Category Selector Screen
  // =========================================================================
  if (viewStep === 'categories') {
    return (
      <div className="h-screen w-screen bg-[#080b11] text-slate-100 flex flex-col overflow-hidden">
        <header className="px-6 py-4 bg-[#0d121d] border-b border-[#1f283b] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={onBackHome}
              className="flex items-center gap-1.5 bg-[#182132] hover:bg-[#23304a] border border-[#2a3650] text-slate-200 text-xs px-3 py-1.5 rounded-lg"
            >
              <Home className="w-4 h-4 text-rose-400" />
              ホームへ戻る
            </button>
            <div className="flex items-center gap-2">
              <PackageCheck className="w-5 h-5 text-emerald-400" />
              <h1 className="text-base font-bold text-white">
                保存されたモデルの確認 — 種類を選択 ({parts.length} 件保存済)
              </h1>
            </div>
          </div>

          <button
            onClick={onGoToModelEdit}
            className="flex items-center gap-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold px-4 py-2 rounded-xl"
          >
            <Car className="w-4 h-4" />
            車両から新しいパーツを保存しに行く
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-6xl mx-auto">
            <div className="mb-6">
              <div className="text-xs font-mono-num uppercase tracking-[0.2em] text-emerald-400 mb-1">
                SAVED PARTS CATEGORY
              </div>
              <h2 className="text-2xl font-extrabold text-white">
                確認したいパーツの種類を選択してください
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                ホイール・ステアリング・シートなどの種類を選ぶと、保存済みモデルのリストと CSP 3D ビューアが開きます（モデルの名前変更も可能です）。
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {CATEGORY_TILES.map((tile) => {
                const info = categoryCounts[tile.id] ?? { count: 0 };
                return (
                  <button
                    key={tile.id}
                    onClick={() => handleOpenCategory(tile.id)}
                    className="group relative text-left bg-[#101622] hover:bg-[#161f32] border border-[#222d42] hover:border-emerald-400/70 rounded-2xl p-5 overflow-hidden transition-all duration-200 hover:-translate-y-0.5 shadow-xl min-h-[168px] flex flex-col justify-between"
                  >
                    {/* Subtle Background Thumbnail */}
                    {info.thumb && (
                      <img
                        src={info.thumb}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover opacity-15 group-hover:opacity-25 group-hover:scale-105 transition-all"
                      />
                    )}
                    <div
                      className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${tile.accent} opacity-80`}
                    />

                    <div className="relative z-10 flex items-start justify-between gap-3">
                      <div
                        className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${tile.accent} flex items-center justify-center text-white shadow-lg`}
                      >
                        {tile.icon}
                      </div>
                      <span
                        className={`text-xs font-mono-num font-bold px-2.5 py-1 rounded-full border ${
                          info.count > 0
                            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200'
                            : 'bg-[#090d14]/80 border-[#263147] text-slate-500'
                        }`}
                      >
                        {info.count} 件
                      </span>
                    </div>

                    <div className="relative z-10 mt-4">
                      <div className="text-[10px] font-mono-num tracking-[0.16em] text-slate-500">
                        {tile.en}
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <h3 className="text-lg font-bold text-white group-hover:text-emerald-200 transition-colors">
                          {tile.title}
                        </h3>
                        <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-300 group-hover:translate-x-1 transition-all" />
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">{tile.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </main>
      </div>
    );
  }

  // =========================================================================
  // STEP 2: Selected Category Models Grid + CSP 3D Viewer & Custom Rename
  // =========================================================================
  return (
    <div className="h-screen w-screen bg-[#080b11] text-slate-100 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="px-5 py-3 bg-[#0d121d] border-b border-[#1f283b] flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => updateViewRoute('categories', selectedCategory)}
            className="flex items-center gap-1.5 bg-[#182132] hover:bg-[#23304a] border border-[#2a3650] text-slate-200 text-xs px-3 py-1.5 rounded-lg font-medium"
          >
            <ArrowLeft className="w-4 h-4 text-emerald-400" />
            種類選択へ戻る
          </button>
          <button
            onClick={onBackHome}
            className="flex items-center gap-1 bg-[#141c2b] hover:bg-[#1f2b42] border border-[#253048] text-slate-300 text-xs px-2.5 py-1.5 rounded-lg"
          >
            <Home className="w-3.5 h-3.5" />
            ホーム
          </button>

          <div className="h-5 w-px bg-[#242e42]" />

          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-emerald-300">{activeCategoryMeta.title}</span>
            <span className="text-xs font-mono-num text-slate-400">({filteredParts.length} 件)</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="relative w-52">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="モデル名・元車両で検索..."
              className="w-full bg-[#090c11] border border-[#27324a] rounded-lg pl-8 pr-2.5 py-1 text-slate-100 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex items-center gap-1 bg-[#090c11] border border-[#27324a] rounded-lg px-2 py-1">
            <Grid2x2 className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[11px] text-slate-400">列:</span>
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                onClick={() => setColumnsPerRow(n)}
                className={`w-5 h-5 rounded text-[11px] font-mono-num font-bold ${
                  columnsPerRow === n ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {n}
              </button>
            ))}
          </div>

          <button
            onClick={onGoToModelEdit}
            className="flex items-center gap-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold px-3.5 py-1.5 rounded-lg"
          >
            <Car className="w-3.5 h-3.5" />
            車両を選んで装着する
          </button>
        </div>
      </header>

      {/* Main Split: Left Model Grid + Right Large CSP 3D Viewer & Rename Bar */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 overflow-hidden">
        {/* Left Model Cards Grid */}
        <aside className="lg:col-span-5 bg-[#0d121c] border-r border-[#1f283b] overflow-y-auto p-4">
          {filteredParts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-6 gap-3 text-xs text-slate-500">
              <Box className="w-12 h-12 text-slate-700" />
              <p className="text-slate-300 font-semibold">
                「{activeCategoryMeta.title}」に保存されたモデルはまだありません
              </p>
              <p className="leading-relaxed">
                「モデル改造」画面で車両のパーツを左クリックし、「パーツをライブラリに保存」から好きな名前を付けて保存してください。
              </p>
              <button
                onClick={() => updateViewRoute('categories', selectedCategory)}
                className="mt-1 bg-[#1b2436] hover:bg-[#26324c] text-slate-200 px-4 py-2 rounded-xl"
              >
                他の種類を見る
              </button>
            </div>
          ) : (
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: `repeat(${columnsPerRow}, minmax(0, 1fr))`,
              }}
            >
              {filteredParts.map((part) => {
                const active = selectedPart?.id === part.id;
                return (
                  <div
                    key={part.id}
                    onClick={() => setSelectedId(part.id)}
                    className={`rounded-xl overflow-hidden border cursor-pointer transition-all ${
                      active
                        ? 'bg-[#162133] border-emerald-500 ring-2 ring-emerald-500/30 shadow-lg'
                        : 'bg-[#111622] border-[#20293d] hover:border-[#37486a]'
                    }`}
                  >
                    <div className="aspect-[16/10] bg-[#080b10] relative overflow-hidden flex items-center justify-center">
                      {part.thumbnailDataUrl ? (
                        <img
                          src={part.thumbnailDataUrl}
                          alt={part.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Box className="w-8 h-8 text-slate-600" />
                      )}
                      <span className="absolute top-1.5 left-1.5 text-[9px] font-mono-num px-1.5 py-0.5 rounded bg-black/75 text-emerald-300 border border-white/10">
                        {PART_CATEGORY_LABELS[part.category]}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(part.id);
                        }}
                        className="absolute top-1.5 right-1.5 p-1 rounded bg-black/70 text-slate-400 hover:text-rose-400"
                        title="削除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="p-2.5">
                      <div className="text-xs font-bold text-slate-100 truncate" title={part.name}>
                        {part.name}
                      </div>
                      <div className="text-[10px] font-mono-num text-slate-500 truncate mt-0.5">
                        元: {part.sourceCarId} • {(part.sizeBytes / 1024).toFixed(0)} KB
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </aside>

        {/* Right: Large CSP 3D Part Viewer + Custom Name / Category Editor */}
        <main className="lg:col-span-7 relative bg-[#090d14] flex flex-col">
          <div ref={mountRef} className="flex-1 w-full h-full" />

          {/* Top 3D Controls */}
          <div className="absolute top-4 left-4 right-4 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
            <div className="pointer-events-auto flex items-center gap-2 bg-[#0b0e14]/85 backdrop-blur border border-[#252e42] rounded-xl px-3 py-1.5 text-xs">
              <Sun className="w-4 h-4 text-amber-400" />
              <select
                value={cspPreset}
                onChange={(e) => setCspPreset(e.target.value as CspLightingPreset)}
                className="bg-transparent text-cyan-300 focus:outline-none"
              >
                <option value="csp_showroom" className="bg-[#0b0e14]">CSP Showroom</option>
                <option value="csp_sunset" className="bg-[#0b0e14]">CSP Sunset</option>
                <option value="csp_studio_dark" className="bg-[#0b0e14]">CSP Dark</option>
              </select>
            </div>

            <div className="pointer-events-auto flex flex-wrap items-center gap-2 text-xs">
              <button
                onClick={handleUpdateThumbnail}
                disabled={!selectedPart || loadingMesh || updatingThumb}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border backdrop-blur bg-cyan-600/25 hover:bg-cyan-600/40 disabled:opacity-40 border-cyan-400/60 text-cyan-100 font-semibold transition-colors"
                title="現在の3Dアングルで保存モデルのサムネイル画像を更新します"
              >
                <Camera className="w-3.5 h-3.5" />
                {updatingThumb ? '更新中...' : '画像を更新'}
              </button>
              <button
                onClick={() => setAutoRotate((v) => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border backdrop-blur font-medium transition-colors ${
                  autoRotate
                    ? 'bg-amber-500/20 hover:bg-amber-500/35 border-amber-400/60 text-amber-200'
                    : 'bg-emerald-500/20 hover:bg-emerald-500/35 border-emerald-400/60 text-emerald-200'
                }`}
                title={autoRotate ? '自動回転を停止する' : '自動回転を再開する'}
              >
                {autoRotate ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                {autoRotate ? '自動回転を停止' : '自動回転を再開'}
              </button>
              <button
                onClick={() => setWireframe((v) => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border backdrop-blur ${
                  wireframe
                    ? 'bg-cyan-500/20 border-cyan-500 text-cyan-200'
                    : 'bg-[#0b0e14]/85 border-[#252e42] text-slate-300'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                ワイヤー
              </button>
            </div>
          </div>

          {/* Bottom Rename & Metadata Editor Panel */}
          {selectedPart && (
            <div className="absolute bottom-4 left-4 right-4 bg-[#0c111b]/94 backdrop-blur-md border border-[#2a3854] rounded-2xl p-4 space-y-3 text-xs shadow-2xl">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 text-emerald-300 font-semibold shrink-0">
                  <Pencil className="w-3.5 h-3.5" />
                  モデル名:
                </div>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && metaDirty) handleSaveMeta();
                  }}
                  placeholder="好きな名前を入力 (例: TE37 18インチ ブロンズ)"
                  className="flex-1 min-w-[180px] bg-[#070a10] border border-[#2d3b56] focus:border-emerald-500 rounded-lg px-3 py-1.5 text-sm font-bold text-white focus:outline-none"
                />
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value as PartCategory)}
                  className="bg-[#070a10] border border-[#2d3b56] rounded-lg px-2.5 py-1.5 text-slate-200"
                  title="パーツの種類を変更"
                >
                  {(Object.keys(PART_CATEGORY_LABELS) as PartCategory[]).map((cat) => (
                    <option key={cat} value={cat}>
                      {PART_CATEGORY_LABELS[cat]}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleSaveMeta}
                  disabled={!metaDirty || savingMeta}
                  className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold px-3.5 py-1.5 rounded-lg"
                >
                  <Check className="w-3.5 h-3.5" />
                  名前を保存
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#1e273a]">
                <div className="text-slate-400 font-mono-num flex flex-wrap gap-3 text-[11px]">
                  <span>元車両: {selectedPart.sourceCarId}</span>
                  <span>元ノード: {selectedPart.sourceNodeName}</span>
                  <span>寸法: {selectedPart.bboxSize.map((n) => n.toFixed(2)).join(' × ')} m</span>
                  <span>サイズ: {(selectedPart.sizeBytes / 1024).toFixed(1)} KB</span>
                </div>
                <button
                  onClick={onGoToModelEdit}
                  className="bg-rose-600 hover:bg-rose-500 text-white font-semibold px-4 py-1.5 rounded-lg"
                >
                  別車両に装着しに行く
                </button>
              </div>
            </div>
          )}

          {loadingMesh && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-xs text-cyan-300">
              3Dモデルを読み込み中...
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
