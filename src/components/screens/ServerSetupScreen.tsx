import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Car,
  CheckCircle2,
  ClipboardCopy,
  CloudSun,
  CopyPlus,
  Cpu,
  ExternalLink,
  FileCode2,
  Flag,
  FolderOpen,
  Globe,
  Home,
  LayoutGrid,
  MapPin,
  Play,
  RefreshCw,
  Save,
  Server,
  Shield,
  Sparkles,
  Square,
  Terminal,
  Timer,
  Trash2,
  Users,
} from 'lucide-react';
import type {
  AcServerLogEvent,
  AcServerStatus,
  AcTrackSummary,
  CarSkinSummary,
  CarSummary,
} from '../../types/ac';
import {
  SERVER_PRESETS,
  WEATHER_OPTIONS,
  buildContentManagerJoinLink,
  createDefaultServerConfig,
  parseServerConfigBundle,
  serializeServerConfigBundle,
  sunAngleToTimeLabel,
  type AcServerConfig,
  type AcServerEntrySlot,
  type ServerPreset,
} from '../../utils/serverConfig';
import { NumericControl } from '../ui/NumericControl';
import { TrackPickerModal, VisualCarPickerPanel } from './ServerVisualPickers';

interface ServerSetupScreenProps {
  carsDir: string | null;
  cars: CarSummary[];
  simpleMode?: boolean;
  onToggleSimpleMode?: (next: boolean) => void;
  onBackHome: () => void;
  onToast: (text: string, type?: 'success' | 'error' | 'info') => void;
}

type ServerTabId = 'basic' | 'sessions' | 'entries' | 'csp' | 'console';

const STORAGE_SERVER_DIR_KEY = 'ac_car_studio_server_dir';

export const ServerSetupScreen: React.FC<ServerSetupScreenProps> = ({
  carsDir,
  cars,
  simpleMode = false,
  onToggleSimpleMode,
  onBackHome,
  onToast,
}) => {
  const [serverDir, setServerDir] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_SERVER_DIR_KEY)
  );
  const [hasAcServerExe, setHasAcServerExe] = useState(false);
  const [tracks, setTracks] = useState<AcTrackSummary[]>([]);
  const [trackModalOpen, setTrackModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ServerTabId>('basic');
  const [config, setConfig] = useState<AcServerConfig>(() => createDefaultServerConfig());
  const [saving, setSaving] = useState(false);

  // Cache skin previews per "carId::skinId" so entry list rows show actual chosen livery thumbnail!
  const [skinPreviewMap, setSkinPreviewMap] = useState<Record<string, string>>({});
  const fetchedSkinCarIdsRef = useRef<Set<string>>(new Set());

  // Server Runner & Console state
  const [serverStatus, setServerStatus] = useState<AcServerStatus>({
    running: false,
    pid: null,
    serverDir: null,
    startedAt: null,
  });
  const [logs, setLogs] = useState<AcServerLogEvent[]>([]);
  const [publicHostIp, setPublicHostIp] = useState('127.0.0.1');
  const [previewIniTab, setPreviewIniTab] = useState<'server_cfg' | 'entry_list' | 'csp_extra'>(
    'server_cfg'
  );
  const logEndRef = useRef<HTMLDivElement | null>(null);

  const loadDirConfig = useCallback(
    async (dir: string) => {
      try {
        const [bundle, trackList] = await Promise.all([
          window.acApi.readServerConfig(dir),
          window.acApi.listInstalledTracks(carsDir, dir),
        ]);
        setHasAcServerExe(bundle.hasAcServerExe);
        setTracks(trackList);
        if (bundle.serverCfgIni.trim() || bundle.entryListIni.trim()) {
          setConfig(
            parseServerConfigBundle(
              bundle.serverCfgIni,
              bundle.entryListIni,
              bundle.cspExtraOptionsIni
            )
          );
        }
      } catch (err) {
        onToast(
          `サーバー設定の読み込みに失敗しました: ${err instanceof Error ? err.message : String(err)}`,
          'error'
        );
      }
    },
    [carsDir, onToast]
  );

  // Initial detection of server dir, tracks, and running status
  useEffect(() => {
    (async () => {
      const status = await window.acApi.getAcServerStatus();
      setServerStatus(status);

      let targetDir = serverDir;
      if (!targetDir) {
        const detected = await window.acApi.detectServerDir(carsDir);
        if (detected.serverDir) {
          targetDir = detected.serverDir;
          setServerDir(detected.serverDir);
          setHasAcServerExe(detected.hasAcServerExe);
          localStorage.setItem(STORAGE_SERVER_DIR_KEY, detected.serverDir);
        }
      }

      if (targetDir) {
        await loadDirConfig(targetDir);
      } else {
        const trackList = await window.acApi.listInstalledTracks(carsDir, null);
        setTracks(trackList);
      }
    })();
  }, [carsDir, loadDirConfig, serverDir]);

  // Subscribe to live acServer.exe stdout/stderr & exit events
  useEffect(() => {
    const unsubLog = window.acApi.onServerLog?.((ev) => {
      setLogs((prev) => {
        const next = [...prev, ev];
        return next.length > 400 ? next.slice(next.length - 400) : next;
      });
    });
    const unsubExit = window.acApi.onServerExit?.(() => {
      window.acApi.getAcServerStatus().then(setServerStatus).catch(() => {});
    });
    return () => {
      unsubLog?.();
      unsubExit?.();
    };
  }, []);

  useEffect(() => {
    if (activeTab === 'console') {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, activeTab]);

  const serialized = useMemo(() => serializeServerConfigBundle(config), [config]);

  // Preload skin preview thumbnails for cars already present in entry_list.ini
  useEffect(() => {
    if (!carsDir) return;
    const missingCarIds = serialized.uniqueCarIds.filter(
      (id) => !fetchedSkinCarIdsRef.current.has(id)
    );
    if (missingCarIds.length === 0) return;
    for (const id of missingCarIds) fetchedSkinCarIdsRef.current.add(id);

    let cancelled = false;
    Promise.all(
      missingCarIds.map(async (carId) => {
        try {
          const skins = await window.acApi.listCarSkins(carsDir, carId);
          return { carId, skins };
        } catch {
          return { carId, skins: [] as CarSkinSummary[] };
        }
      })
    ).then((results) => {
      if (cancelled) return;
      setSkinPreviewMap((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const { carId, skins } of results) {
          for (const s of skins) {
            if (s.previewDataUrl && !next[`${carId}::${s.id}`]) {
              next[`${carId}::${s.id}`] = s.previewDataUrl;
              changed = true;
            }
          }
        }
        return changed ? next : prev;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [carsDir, serialized.uniqueCarIds]);

  const carById = useMemo(() => {
    const map = new Map<string, CarSummary>();
    for (const c of cars) map.set(c.id, c);
    return map;
  }, [cars]);

  const slotCountByCarId = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const slot of config.entryList) {
      if (!slot.model) continue;
      counts[slot.model] = (counts[slot.model] ?? 0) + 1;
    }
    return counts;
  }, [config.entryList]);

  const selectedTrackObj = useMemo(
    () => tracks.find((t) => t.id === config.track) ?? null,
    [tracks, config.track]
  );

  const selectedLayoutObj = useMemo(() => {
    if (!selectedTrackObj) return null;
    return (
      selectedTrackObj.layouts.find((l) => l.id === config.configTrack) ??
      selectedTrackObj.layouts[0] ??
      null
    );
  }, [selectedTrackObj, config.configTrack]);

  const handleSelectServerDir = async () => {
    const picked = await window.acApi.selectServerDir();
    if (!picked) return;
    setServerDir(picked);
    localStorage.setItem(STORAGE_SERVER_DIR_KEY, picked);
    await loadDirConfig(picked);
    onToast(`サーバーフォルダを切り替えました: ${picked}`, 'info');
  };

  const handleAutoDetectServer = async () => {
    const detected = await window.acApi.detectServerDir(carsDir);
    if (detected.serverDir) {
      setServerDir(detected.serverDir);
      setHasAcServerExe(detected.hasAcServerExe);
      localStorage.setItem(STORAGE_SERVER_DIR_KEY, detected.serverDir);
      await loadDirConfig(detected.serverDir);
      onToast(`Assetto Corsa server フォルダを検出しました`, 'success');
    } else {
      onToast('server フォルダを自動検出できませんでした。手動で選択してください。', 'error');
    }
  };

  const handleSaveConfig = async (): Promise<boolean> => {
    let dir = serverDir;
    if (!dir) {
      const picked = await window.acApi.selectServerDir();
      if (!picked) return false;
      dir = picked;
      setServerDir(picked);
      localStorage.setItem(STORAGE_SERVER_DIR_KEY, picked);
    }
    setSaving(true);
    try {
      const res = await window.acApi.saveServerConfig(dir, {
        serverCfgIni: serialized.serverCfgIni,
        entryListIni: serialized.entryListIni,
        cspExtraOptionsIni: serialized.cspExtraOptionsIni,
        writeCspExtra: config.cspExtra.enabled,
      });
      if (res.ok) {
        onToast(`サーバー設定を保存しました (${res.writtenFiles.join(', ')})`, 'success');
        return true;
      }
      onToast(`保存に失敗しました: ${res.error}`, 'error');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleStartServer = async () => {
    if (!serverDir) {
      onToast('先に server フォルダ (acServer.exe の場所) を選択してください', 'error');
      return;
    }
    const saved = await handleSaveConfig();
    if (!saved) return;
    const res = await window.acApi.startAcServer(serverDir);
    if (res.ok && res.status) {
      setServerStatus(res.status);
      setActiveTab('console');
      onToast(`acServer.exe を起動しました (PID ${res.status.pid ?? '-'})`, 'success');
    } else {
      onToast(res.error || 'サーバー起動に失敗しました', 'error');
    }
  };

  const handleStopServer = async () => {
    const res = await window.acApi.stopAcServer();
    const status = await window.acApi.getAcServerStatus();
    setServerStatus(status);
    onToast(res.message, res.ok ? 'info' : 'error');
  };

  const handleApplyPreset = (preset: ServerPreset) => {
    setConfig((prev) => preset.apply(prev));
    onToast(`プリセット「${preset.name}」を適用しました`, 'info');
  };

  const handleAddCarSlots = (payload: {
    model: string;
    skin: string;
    count: number;
    ballast: number;
    restrictor: number;
    autoRotateSkins: CarSkinSummary[];
  }) => {
    const { model, skin, count, ballast, restrictor, autoRotateSkins } = payload;
    if (!model.trim()) return;

    // Cache skin thumbnails so the registered entry list displays exact skin previews
    if (autoRotateSkins.length > 0) {
      setSkinPreviewMap((prev) => {
        const next = { ...prev };
        for (const s of autoRotateSkins) {
          if (s.previewDataUrl) next[`${model}::${s.id}`] = s.previewDataUrl;
        }
        return next;
      });
    }

    const existingOfModel = config.entryList.filter((e) => e.model === model).length;
    const added: AcServerEntrySlot[] = [];
    for (let i = 0; i < count; i++) {
      const assignedSkin =
        skin ||
        (autoRotateSkins.length > 0
          ? autoRotateSkins[(existingOfModel + i) % autoRotateSkins.length]?.id ?? ''
          : '');
      added.push({
        model,
        skin: assignedSkin,
        spectatorMode: 0,
        driverName: '',
        team: '',
        guid: '',
        ballast,
        restrictor,
      });
    }

    setConfig((prev) => {
      const nextEntries = [...prev.entryList, ...added];
      return {
        ...prev,
        entryList: nextEntries,
        maxClients: Math.max(prev.maxClients, nextEntries.length),
      };
    });
    const carLabel = carById.get(model)?.name ?? model;
    onToast(`${carLabel} を ${count} スロット追加しました`, 'success');
  };

  const duplicateSlot = (idx: number) => {
    setConfig((prev) => {
      const src = prev.entryList[idx];
      if (!src) return prev;
      const nextEntries = [
        ...prev.entryList.slice(0, idx + 1),
        { ...src, driverName: '', guid: '' },
        ...prev.entryList.slice(idx + 1),
      ];
      return {
        ...prev,
        entryList: nextEntries,
        maxClients: Math.max(prev.maxClients, nextEntries.length),
      };
    });
  };

  const updateSlot = (idx: number, patch: Partial<AcServerEntrySlot>) => {
    setConfig((prev) => ({
      ...prev,
      entryList: prev.entryList.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    }));
  };

  const removeSlot = (idx: number) => {
    setConfig((prev) => ({
      ...prev,
      entryList: prev.entryList.filter((_, i) => i !== idx),
    }));
  };

  const joinLink = useMemo(
    () => buildContentManagerJoinLink(publicHostIp, config.httpPort, config.password),
    [publicHostIp, config.httpPort, config.password]
  );

  const copyText = (text: string, label: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => onToast(`${label}をクリップボードにコピーしました`, 'success'))
      .catch(() => onToast('コピーに失敗しました', 'error'));
  };

  const subTabs: Array<{ id: ServerTabId; label: string; icon: React.ReactNode }> = simpleMode
    ? [
        { id: 'basic', label: '基本・コース・天候', icon: <Globe className="w-3.5 h-3.5" /> },
        {
          id: 'entries',
          label: `車両選択 (${config.entryList.length})`,
          icon: <Car className="w-3.5 h-3.5" />,
        },
        { id: 'console', label: '起動 & 招待リンク', icon: <Terminal className="w-3.5 h-3.5" /> },
      ]
    : [
        { id: 'basic', label: '基本・コース・天候・アシスト', icon: <Globe className="w-3.5 h-3.5" /> },
        { id: 'sessions', label: 'セッション構成', icon: <Timer className="w-3.5 h-3.5" /> },
        {
          id: 'entries',
          label: `エントリー車両 GUI (${config.entryList.length})`,
          icon: <Car className="w-3.5 h-3.5" />,
        },
        { id: 'csp', label: 'CSP拡張ルール', icon: <Cpu className="w-3.5 h-3.5" /> },
        { id: 'console', label: '起動コンソール & INI出力', icon: <Terminal className="w-3.5 h-3.5" /> },
      ];

  useEffect(() => {
    if (simpleMode && (activeTab === 'sessions' || activeTab === 'csp')) {
      setActiveTab('basic');
    }
  }, [simpleMode, activeTab]);

  return (
    <div className="h-screen w-screen bg-[#080b11] text-slate-100 flex flex-col overflow-hidden">
      {/* Top Action Header */}
      <header className="bg-[#0e131e] border-b border-[#1f293d] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onBackHome}
            className="flex items-center gap-1.5 bg-[#182132] hover:bg-[#23304a] text-slate-200 border border-[#2a3650] text-xs px-2.5 py-1.5 rounded-lg shrink-0"
          >
            <Home className="w-3.5 h-3.5 text-rose-400" />
            ホーム
          </button>

          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shrink-0 shadow-md shadow-emerald-950/40">
            <Server className="w-4 h-4" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-white truncate">
                Assetto Corsa サーバー設定 &amp; ランチャー
              </h1>
              <span
                className={`text-[10px] font-mono-num px-2 py-0.5 rounded-full border ${
                  serverStatus.running
                    ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                    : 'bg-slate-800 border-slate-600 text-slate-400'
                }`}
              >
                {serverStatus.running ? `稼働中 (PID ${serverStatus.pid})` : '停止中'}
              </span>
            </div>
            <div
              className="text-[11px] font-mono-num text-slate-400 truncate max-w-[440px]"
              title={serverDir ?? ''}
            >
              {serverDir
                ? `${serverDir} ${hasAcServerExe ? '• acServer.exe 検出済' : '• acServer.exe 未検出 (設定書き出しのみ可)'}`
                : 'server フォルダ未設定 (右のボタンから検出または選択)'}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {onToggleSimpleMode && (
            <div className="flex items-center bg-[#111724] border border-[#232e44] rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => onToggleSimpleMode(false)}
                className={`px-2 py-1 rounded text-[11px] font-semibold ${
                  !simpleMode ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                通常
              </button>
              <button
                type="button"
                onClick={() => onToggleSimpleMode(true)}
                className={`px-2 py-1 rounded text-[11px] font-semibold ${
                  simpleMode ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                シンプル
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={handleAutoDetectServer}
            className="flex items-center gap-1 bg-[#182132] hover:bg-[#23304a] border border-[#2a3650] text-cyan-300 px-2.5 py-1.5 rounded-lg"
            title="Assetto Corsa の server フォルダを自動検出"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            自動検出
          </button>
          <button
            type="button"
            onClick={handleSelectServerDir}
            className="flex items-center gap-1 bg-[#182132] hover:bg-[#23304a] border border-[#2a3650] text-slate-200 px-2.5 py-1.5 rounded-lg"
          >
            <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
            フォルダ選択
          </button>
          {serverDir && (
            <button
              type="button"
              onClick={() => window.acApi.openServerFolder(serverDir)}
              className="p-1.5 bg-[#182132] hover:bg-[#23304a] border border-[#2a3650] text-slate-300 rounded-lg"
              title="エクスプローラーで server フォルダを開く"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}

          <div className="h-5 w-px bg-[#253048]" />

          <button
            type="button"
            onClick={handleSaveConfig}
            disabled={saving}
            className="flex items-center gap-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white font-semibold px-3.5 py-1.5 rounded-lg"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? '保存中...' : '設定を保存 (cfg/)'}
          </button>

          {serverStatus.running ? (
            <button
              type="button"
              onClick={handleStopServer}
              className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold px-3.5 py-1.5 rounded-lg shadow-md shadow-rose-900/30"
            >
              <Square className="w-3.5 h-3.5" />
              サーバー停止
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStartServer}
              disabled={!hasAcServerExe}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold px-3.5 py-1.5 rounded-lg shadow-md shadow-emerald-900/30"
              title={
                hasAcServerExe
                  ? '現在の設定を保存して acServer.exe を起動します'
                  : 'acServer.exe がある Assetto Corsa の server フォルダを選択すると直接起動できます'
              }
            >
              <Play className="w-3.5 h-3.5" />
              保存してサーバー起動
            </button>
          )}
        </div>
      </header>

      {/* Preset Bar */}
      <div className="bg-[#0c101a] border-b border-[#1c2538] px-4 py-2 flex items-center gap-2 overflow-x-auto shrink-0">
        <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-300 shrink-0 mr-1">
          <Sparkles className="w-3.5 h-3.5" />
          用途プリセット:
        </span>
        {SERVER_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => handleApplyPreset(p)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#141c2c] hover:bg-[#1d2940] border border-[#26344f] hover:border-emerald-400/60 text-xs text-slate-200 whitespace-nowrap transition-colors"
            title={p.description}
          >
            <span className="text-[9px] font-mono-num px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
              {p.badge}
            </span>
            {p.name}
          </button>
        ))}
      </div>

      {/* Sub Tabs */}
      <nav className="bg-[#0d111a] border-b border-[#1f283b] px-4 flex items-center gap-1 overflow-x-auto shrink-0">
        {subTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === t.id
                ? 'border-emerald-400 text-emerald-300 bg-emerald-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-[#141a27]'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>

      {/* Tab Body */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-5">
        {/* =============================================================== */}
        {/* TAB 1: BASIC / VISUAL TRACK CARD / NETWORK / WEATHER / ASSISTS  */}
        {/* =============================================================== */}
        {activeTab === 'basic' && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 max-w-[1600px] mx-auto">
            {/* Column 1: Visual Track Preview Card + Selected Cars Preview + Server Identity */}
            <div className="space-y-4">
              {/* Visual Track Hero Preview Card */}
              <div className="bg-[#121722] border border-cyan-500/35 rounded-xl overflow-hidden shadow-lg shadow-cyan-950/20">
                <div className="px-4 py-2.5 bg-[#0f1624] border-b border-[#222f46] flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Globe className="w-4 h-4 text-cyan-400" />
                    サーキット選択
                  </h3>
                  <button
                    type="button"
                    onClick={() => setTrackModalOpen(true)}
                    className="flex items-center gap-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold px-3 py-1 rounded-lg shadow"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    プレビューGUIから変更 ({tracks.length})
                  </button>
                </div>

                {/* Clickable Track Photo + Outline Preview */}
                <button
                  type="button"
                  onClick={() => setTrackModalOpen(true)}
                  className="group relative block w-full aspect-[16/9] bg-[#070a11] overflow-hidden text-left"
                  title="クリックしてサーキット一覧プレビューGUIを開く"
                >
                  {selectedLayoutObj?.previewDataUrl ? (
                    <img
                      src={selectedLayoutObj.previewDataUrl}
                      alt={selectedLayoutObj.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#131e33] to-[#080c14] text-slate-500 gap-2">
                      <Flag className="w-9 h-9 text-cyan-500/60" />
                      <span className="text-xs font-mono-num text-slate-300">{config.track}</span>
                    </div>
                  )}

                  <div className="absolute inset-0 bg-gradient-to-t from-[#090d16] via-[#090d16]/35 to-black/20" />

                  {/* Track Map Outline Overlay */}
                  {selectedLayoutObj?.outlineDataUrl && (
                    <div className="absolute top-3 right-3 w-24 h-16 rounded-xl bg-black/60 backdrop-blur-[2px] border border-white/15 p-2 flex items-center justify-center">
                      <img
                        src={selectedLayoutObj.outlineDataUrl}
                        alt="Track Outline"
                        className="max-w-full max-h-full object-contain drop-shadow"
                      />
                    </div>
                  )}

                  <div className="absolute top-3 left-3 flex items-center gap-1.5">
                    <span className="text-[10px] font-mono-num px-2 py-0.5 rounded-full bg-cyan-500/85 text-slate-950 font-bold">
                      {selectedLayoutObj ? `${selectedLayoutObj.pitboxes} Pit` : 'TRACK'}
                    </span>
                    {selectedLayoutObj?.length && (
                      <span className="text-[10px] font-mono-num px-2 py-0.5 rounded-full bg-black/70 text-slate-200 border border-white/15">
                        {selectedLayoutObj.length}
                      </span>
                    )}
                  </div>

                  <div className="absolute bottom-3 left-3.5 right-3.5 flex items-end justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-base font-bold text-white truncate drop-shadow">
                        {selectedLayoutObj?.name ?? config.track}
                      </div>
                      <div className="text-[11px] text-cyan-300 font-mono-num flex items-center gap-1.5 mt-0.5">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span className="truncate">
                          {selectedLayoutObj?.country || selectedTrackObj?.country || config.track}
                          {config.configTrack ? ` • ${config.configTrack}` : ''}
                        </span>
                      </div>
                    </div>
                    <span className="text-[11px] bg-black/65 group-hover:bg-cyan-500 group-hover:text-slate-950 text-cyan-200 border border-cyan-400/40 px-2.5 py-1 rounded-lg transition-colors shrink-0 font-semibold">
                      変更
                    </span>
                  </div>
                </button>

                {/* Quick Layout Switcher Pills (if multi-layout track) */}
                {selectedTrackObj && selectedTrackObj.layouts.length > 1 && (
                  <div className="p-3 bg-[#0c111c] border-t border-[#202b40] space-y-1.5">
                    <div className="text-[10px] text-slate-400 font-semibold">
                      レイアウト切替 ({selectedTrackObj.layouts.length})
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedTrackObj.layouts.map((l) => {
                        const active = l.id === (selectedLayoutObj?.id ?? config.configTrack);
                        return (
                          <button
                            key={l.id || '__default'}
                            type="button"
                            onClick={() =>
                              setConfig((p) => ({
                                ...p,
                                configTrack: l.id,
                                maxClients: Math.min(p.maxClients, l.pitboxes || p.maxClients),
                              }))
                            }
                            className={`px-2.5 py-1 rounded-lg text-[11px] border transition-colors ${
                              active
                                ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 font-semibold'
                                : 'bg-[#080b12] border-[#243048] text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {l.name} ({l.pitboxes}P)
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Quick Participating Cars Visual Preview Strip */}
              <div className="bg-[#121722] border border-[#242e42] rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Car className="w-4 h-4 text-emerald-400" />
                    参加車両 ({serialized.uniqueCarIds.length} 車種 / {config.entryList.length} 台)
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('entries')}
                    className="flex items-center gap-1 bg-emerald-600/20 hover:bg-emerald-600/35 border border-emerald-500/40 text-emerald-300 text-[11px] font-semibold px-2.5 py-1 rounded-lg"
                  >
                    <LayoutGrid className="w-3 h-3" />
                    車両GUIで選択・編集
                  </button>
                </div>

                {serialized.uniqueCarIds.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => setActiveTab('entries')}
                    className="w-full py-5 rounded-xl border border-dashed border-[#2b3854] hover:border-emerald-400/60 bg-[#0b0f18] text-xs text-slate-400 hover:text-emerald-200 transition-colors"
                  >
                    まだ車両が登録されていません。クリックして車両プレビューGUIから追加してください。
                  </button>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {serialized.uniqueCarIds.slice(0, 6).map((carId) => {
                      const info = carById.get(carId);
                      const cnt = slotCountByCarId[carId] ?? 0;
                      return (
                        <button
                          key={carId}
                          type="button"
                          onClick={() => setActiveTab('entries')}
                          className="rounded-lg overflow-hidden border border-[#253149] hover:border-emerald-400 bg-[#0a0e17] text-left transition-colors"
                        >
                          <div className="relative aspect-[16/10] bg-[#06090f]">
                            {info?.previewDataUrl ? (
                              <img
                                src={info.previewDataUrl}
                                alt={info.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-slate-600">
                                <Car className="w-5 h-5" />
                              </div>
                            )}
                            <span className="absolute top-1 right-1 text-[9px] font-mono-num font-bold px-1.5 py-0.2 rounded-full bg-emerald-500 text-slate-950">
                              ×{cnt}
                            </span>
                          </div>
                          <div className="px-1.5 py-1 text-[10px] text-slate-200 truncate">
                            {info?.name ?? carId}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Server Identity */}
              <div className="bg-[#121722] border border-[#242e42] rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Server className="w-4 h-4 text-emerald-400" />
                  サーバー基本情報
                </h3>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">サーバー名 (NAME)</label>
                  <input
                    type="text"
                    value={config.name}
                    onChange={(e) => setConfig((p) => ({ ...p, name: e.target.value }))}
                    className="w-full bg-[#0b0e14] border border-[#263147] rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">入室パスワード (任意)</label>
                    <input
                      type="text"
                      value={config.password}
                      placeholder="空欄で公開"
                      onChange={(e) => setConfig((p) => ({ ...p, password: e.target.value }))}
                      className="w-full bg-[#0b0e14] border border-[#263147] rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">管理者パスワード</label>
                    <input
                      type="text"
                      value={config.adminPassword}
                      onChange={(e) => setConfig((p) => ({ ...p, adminPassword: e.target.value }))}
                      className="w-full bg-[#0b0e14] border border-[#263147] rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">ウェルカムメッセージ</label>
                  <input
                    type="text"
                    value={config.welcomeMessage}
                    onChange={(e) => setConfig((p) => ({ ...p, welcomeMessage: e.target.value }))}
                    className="w-full bg-[#0b0e14] border border-[#263147] rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <NumericControl
                  label="最大参加人数 (MAX_CLIENTS)"
                  value={config.maxClients}
                  min={1}
                  max={64}
                  step={1}
                  unit="人"
                  hint={
                    selectedLayoutObj
                      ? `選択コースのピット上限: ${selectedLayoutObj.pitboxes} 台`
                      : 'コースのピット数以下に設定してください'
                  }
                  accent="emerald"
                  onChange={(v) => setConfig((p) => ({ ...p, maxClients: Math.round(v) }))}
                />
              </div>
            </div>

            {/* Column 2: Network Ports + Weather & Time */}
            <div className="space-y-4">
              <div className="bg-[#121722] border border-[#242e42] rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-amber-400" />
                  ネットワーク・ポート &amp; ロビー設定
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">UDP_PORT</label>
                    <input
                      type="number"
                      value={config.udpPort}
                      onChange={(e) =>
                        setConfig((p) => ({ ...p, udpPort: Number(e.target.value) || 9600 }))
                      }
                      className="w-full bg-[#0b0e14] border border-[#263147] rounded-lg px-2.5 py-1.5 text-xs font-mono-num text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">TCP_PORT</label>
                    <input
                      type="number"
                      value={config.tcpPort}
                      onChange={(e) =>
                        setConfig((p) => ({ ...p, tcpPort: Number(e.target.value) || 9600 }))
                      }
                      className="w-full bg-[#0b0e14] border border-[#263147] rounded-lg px-2.5 py-1.5 text-xs font-mono-num text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">HTTP_PORT</label>
                    <input
                      type="number"
                      value={config.httpPort}
                      onChange={(e) =>
                        setConfig((p) => ({ ...p, httpPort: Number(e.target.value) || 8081 }))
                      }
                      className="w-full bg-[#0b0e14] border border-[#263147] rounded-lg px-2.5 py-1.5 text-xs font-mono-num text-slate-100"
                    />
                  </div>
                </div>

                <NumericControl
                  label="通信更新レート (CLIENT_SEND_INTERVAL_HZ)"
                  value={config.clientSendIntervalHz}
                  min={10}
                  max={40}
                  step={1}
                  unit="Hz"
                  hint="標準 18Hz / 高速LAN・少人数は 25〜30Hz"
                  accent="cyan"
                  onChange={(v) =>
                    setConfig((p) => ({ ...p, clientSendIntervalHz: Math.round(v) }))
                  }
                />

                <div className="space-y-1.5 text-xs">
                  {(
                    [
                      ['registerToLobby', '公開サーバーリストへ登録 (REGISTER_TO_LOBBY)'],
                      ['pickupModeEnabled', 'ピックアップモード有効 (事前予約不要で自由参加)'],
                      ['loopMode', 'セッション終了後に自動ループ (LOOP_MODE)'],
                      ['lockedEntryList', 'エントリーリスト固定 (指定GUIDのみ入室可)'],
                    ] as const
                  ).map(([key, label]) => (
                    <label
                      key={key}
                      className="flex items-center justify-between bg-[#0b0e14] border border-[#252e42] rounded-lg px-3 py-2 cursor-pointer"
                    >
                      <span className="text-slate-300">{label}</span>
                      <input
                        type="checkbox"
                        checked={config[key]}
                        onChange={(e) => setConfig((p) => ({ ...p, [key]: e.target.checked }))}
                        className="accent-emerald-500 w-4 h-4 shrink-0"
                      />
                    </label>
                  ))}
                </div>
              </div>

              {/* Weather & Time */}
              <div className="bg-[#121722] border border-[#242e42] rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <CloudSun className="w-4 h-4 text-sky-400" />
                  時刻・天候・路面温度 (WEATHER_0)
                </h3>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">天候プリセット (GRAPHICS)</label>
                  <select
                    value={config.weather.graphics}
                    onChange={(e) =>
                      setConfig((p) => ({
                        ...p,
                        weather: { ...p.weather, graphics: e.target.value },
                      }))
                    }
                    className="w-full bg-[#0b0e14] border border-[#263147] rounded-lg px-3 py-1.5 text-xs text-slate-100"
                  >
                    {WEATHER_OPTIONS.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.label}
                      </option>
                    ))}
                  </select>
                </div>
                <NumericControl
                  label="開始時刻 / 太陽角 (SUN_ANGLE)"
                  value={config.sunAngle}
                  min={-80}
                  max={80}
                  step={4}
                  unit={`(${sunAngleToTimeLabel(config.sunAngle)})`}
                  accent="amber"
                  onChange={(v) => setConfig((p) => ({ ...p, sunAngle: Math.round(v) }))}
                />
                <NumericControl
                  label="時間経過倍率 (TIME_OF_DAY_MULT)"
                  value={config.timeOfDayMult}
                  min={0}
                  max={24}
                  step={1}
                  unit="x"
                  accent="cyan"
                  onChange={(v) => setConfig((p) => ({ ...p, timeOfDayMult: Math.round(v) }))}
                />
                <div className="grid grid-cols-2 gap-2.5">
                  <NumericControl
                    label="気温"
                    value={config.weather.baseTemperatureAmbient}
                    min={5}
                    max={40}
                    step={1}
                    unit="°C"
                    accent="cyan"
                    onChange={(v) =>
                      setConfig((p) => ({
                        ...p,
                        weather: { ...p.weather, baseTemperatureAmbient: Math.round(v) },
                      }))
                    }
                  />
                  <NumericControl
                    label="路面温度"
                    value={config.weather.baseTemperatureRoad}
                    min={5}
                    max={55}
                    step={1}
                    unit="°C"
                    accent="rose"
                    onChange={(v) =>
                      setConfig((p) => ({
                        ...p,
                        weather: { ...p.weather, baseTemperatureRoad: Math.round(v) },
                      }))
                    }
                  />
                </div>
              </div>
            </div>

            {/* Column 3: Realism, Assists & Dynamic Track */}
            <div className="space-y-4">
              <div className="bg-[#121722] border border-[#242e42] rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Shield className="w-4 h-4 text-rose-400" />
                  アシスト &amp; リアリズム設定
                </h3>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">ABS 許可</label>
                    <select
                      value={config.absAllowed}
                      onChange={(e) =>
                        setConfig((p) => ({ ...p, absAllowed: Number(e.target.value) as 0 | 1 | 2 }))
                      }
                      className="w-full bg-[#0b0e14] border border-[#263147] rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
                    >
                      <option value={0}>禁止 (OFF)</option>
                      <option value={1}>純正準拠 (Factory)</option>
                      <option value={2}>全車許可 (ON)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">TC (トラコン) 許可</label>
                    <select
                      value={config.tcAllowed}
                      onChange={(e) =>
                        setConfig((p) => ({ ...p, tcAllowed: Number(e.target.value) as 0 | 1 | 2 }))
                      }
                      className="w-full bg-[#0b0e14] border border-[#263147] rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
                    >
                      <option value={0}>禁止 (OFF)</option>
                      <option value={1}>純正準拠 (Factory)</option>
                      <option value={2}>全車許可 (ON)</option>
                    </select>
                  </div>
                </div>

                <NumericControl
                  label="車両ダメージ倍率 (DAMAGE_MULTIPLIER)"
                  value={config.damageMultiplier}
                  min={0}
                  max={100}
                  step={5}
                  unit="%"
                  accent="rose"
                  onChange={(v) => setConfig((p) => ({ ...p, damageMultiplier: Math.round(v) }))}
                />
                <NumericControl
                  label="燃料消費倍率 (FUEL_RATE)"
                  value={config.fuelRate}
                  min={0}
                  max={300}
                  step={10}
                  unit="%"
                  accent="amber"
                  onChange={(v) => setConfig((p) => ({ ...p, fuelRate: Math.round(v) }))}
                />
                <NumericControl
                  label="タイヤ摩耗倍率 (TYRE_WEAR_RATE)"
                  value={config.tyreWearRate}
                  min={0}
                  max={300}
                  step={10}
                  unit="%"
                  accent="cyan"
                  onChange={(v) => setConfig((p) => ({ ...p, tyreWearRate: Math.round(v) }))}
                />
                <NumericControl
                  label="コース外許容タイヤ本数 (-1でペナルティ無)"
                  value={config.allowedTyresOut}
                  min={-1}
                  max={4}
                  step={1}
                  unit="本"
                  accent="emerald"
                  onChange={(v) => setConfig((p) => ({ ...p, allowedTyresOut: Math.round(v) }))}
                />

                <div className="space-y-1.5 text-xs">
                  {(
                    [
                      ['tyreBlanketsAllowed', 'タイヤウォーマー有効 (TYRE_BLANKETS_ALLOWED)'],
                      ['autoclutchAllowed', 'オートクラッチ許可 (AUTOCLUTCH_ALLOWED)'],
                      ['stabilityAllowed', 'スタビリティ制御許可 (STABILITY_ALLOWED)'],
                      ['forceVirtualMirror', 'バーチャルミラー強制表示'],
                    ] as const
                  ).map(([key, label]) => (
                    <label
                      key={key}
                      className="flex items-center justify-between bg-[#0b0e14] border border-[#252e42] rounded-lg px-3 py-1.5 cursor-pointer"
                    >
                      <span className="text-slate-300">{label}</span>
                      <input
                        type="checkbox"
                        checked={config[key]}
                        onChange={(e) => setConfig((p) => ({ ...p, [key]: e.target.checked }))}
                        className="accent-rose-500 w-4 h-4 shrink-0"
                      />
                    </label>
                  ))}
                </div>
              </div>

              {/* Dynamic Track */}
              <div className="bg-[#121722] border border-[#242e42] rounded-xl p-4 space-y-3">
                <label className="flex items-center justify-between text-sm font-semibold text-white cursor-pointer">
                  <span>動的路面グリップ (DYNAMIC_TRACK)</span>
                  <input
                    type="checkbox"
                    checked={config.dynamicTrack.enabled}
                    onChange={(e) =>
                      setConfig((p) => ({
                        ...p,
                        dynamicTrack: { ...p.dynamicTrack, enabled: e.target.checked },
                      }))
                    }
                    className="accent-emerald-500 w-4 h-4"
                  />
                </label>
                {config.dynamicTrack.enabled && (
                  <div className="space-y-2.5">
                    <NumericControl
                      label="初期路面グリップ (SESSION_START)"
                      value={config.dynamicTrack.sessionStart}
                      min={85}
                      max={100}
                      step={1}
                      unit="%"
                      accent="emerald"
                      onChange={(v) =>
                        setConfig((p) => ({
                          ...p,
                          dynamicTrack: { ...p.dynamicTrack, sessionStart: Math.round(v) },
                        }))
                      }
                    />
                    <NumericControl
                      label="グリップ+1%に必要な周回数 (LAP_GAIN)"
                      value={config.dynamicTrack.lapGain}
                      min={1}
                      max={50}
                      step={1}
                      unit="周"
                      accent="cyan"
                      onChange={(v) =>
                        setConfig((p) => ({
                          ...p,
                          dynamicTrack: { ...p.dynamicTrack, lapGain: Math.round(v) },
                        }))
                      }
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* =============================================================== */}
        {/* TAB 2: SESSIONS (PRACTICE / QUALIFY / RACE)                     */}
        {/* =============================================================== */}
        {activeTab === 'sessions' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 max-w-6xl mx-auto">
            {/* Practice */}
            <div className="bg-[#121722] border border-[#242e42] rounded-xl p-4 space-y-3">
              <label className="flex items-center justify-between text-sm font-bold text-cyan-300 cursor-pointer">
                <span>プラクティス (PRACTICE)</span>
                <input
                  type="checkbox"
                  checked={config.practice.enabled}
                  onChange={(e) =>
                    setConfig((p) => ({
                      ...p,
                      practice: { ...p.practice, enabled: e.target.checked },
                    }))
                  }
                  className="accent-cyan-500 w-4 h-4"
                />
              </label>
              {config.practice.enabled && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">セッション名</label>
                    <input
                      type="text"
                      value={config.practice.name}
                      onChange={(e) =>
                        setConfig((p) => ({ ...p, practice: { ...p.practice, name: e.target.value } }))
                      }
                      className="w-full bg-[#0b0e14] border border-[#263147] rounded-lg px-3 py-1.5 text-xs text-slate-100"
                    />
                  </div>
                  <NumericControl
                    label="セッション時間 (TIME)"
                    value={config.practice.time}
                    min={5}
                    max={720}
                    step={5}
                    unit="分"
                    accent="cyan"
                    onChange={(v) =>
                      setConfig((p) => ({
                        ...p,
                        practice: { ...p.practice, time: Math.round(v) },
                      }))
                    }
                  />
                  <label className="flex items-center justify-between bg-[#0b0e14] border border-[#252e42] rounded-lg px-3 py-2 text-xs cursor-pointer">
                    <span className="text-slate-300">途中参加を許可 (IS_OPEN=1)</span>
                    <input
                      type="checkbox"
                      checked={config.practice.isOpen === 1}
                      onChange={(e) =>
                        setConfig((p) => ({
                          ...p,
                          practice: { ...p.practice, isOpen: e.target.checked ? 1 : 0 },
                        }))
                      }
                      className="accent-cyan-500 w-4 h-4"
                    />
                  </label>
                </div>
              )}
            </div>

            {/* Qualify */}
            <div className="bg-[#121722] border border-[#242e42] rounded-xl p-4 space-y-3">
              <label className="flex items-center justify-between text-sm font-bold text-amber-300 cursor-pointer">
                <span>予選 (QUALIFY)</span>
                <input
                  type="checkbox"
                  checked={config.qualify.enabled}
                  onChange={(e) =>
                    setConfig((p) => ({
                      ...p,
                      qualify: { ...p.qualify, enabled: e.target.checked },
                    }))
                  }
                  className="accent-amber-500 w-4 h-4"
                />
              </label>
              {config.qualify.enabled && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">セッション名</label>
                    <input
                      type="text"
                      value={config.qualify.name}
                      onChange={(e) =>
                        setConfig((p) => ({ ...p, qualify: { ...p.qualify, name: e.target.value } }))
                      }
                      className="w-full bg-[#0b0e14] border border-[#263147] rounded-lg px-3 py-1.5 text-xs text-slate-100"
                    />
                  </div>
                  <NumericControl
                    label="予選時間 (TIME)"
                    value={config.qualify.time}
                    min={5}
                    max={120}
                    step={5}
                    unit="分"
                    accent="amber"
                    onChange={(v) =>
                      setConfig((p) => ({
                        ...p,
                        qualify: { ...p.qualify, time: Math.round(v) },
                      }))
                    }
                  />
                  <label className="flex items-center justify-between bg-[#0b0e14] border border-[#252e42] rounded-lg px-3 py-2 text-xs cursor-pointer">
                    <span className="text-slate-300">途中参加を許可 (IS_OPEN=1)</span>
                    <input
                      type="checkbox"
                      checked={config.qualify.isOpen === 1}
                      onChange={(e) =>
                        setConfig((p) => ({
                          ...p,
                          qualify: { ...p.qualify, isOpen: e.target.checked ? 1 : 0 },
                        }))
                      }
                      className="accent-amber-500 w-4 h-4"
                    />
                  </label>
                </div>
              )}
            </div>

            {/* Race */}
            <div className="bg-[#121722] border border-[#242e42] rounded-xl p-4 space-y-3">
              <label className="flex items-center justify-between text-sm font-bold text-rose-300 cursor-pointer">
                <span>決勝レース (RACE)</span>
                <input
                  type="checkbox"
                  checked={config.race.enabled}
                  onChange={(e) =>
                    setConfig((p) => ({
                      ...p,
                      race: { ...p.race, enabled: e.target.checked },
                    }))
                  }
                  className="accent-rose-500 w-4 h-4"
                />
              </label>
              {config.race.enabled && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">セッション名</label>
                    <input
                      type="text"
                      value={config.race.name}
                      onChange={(e) =>
                        setConfig((p) => ({ ...p, race: { ...p.race, name: e.target.value } }))
                      }
                      className="w-full bg-[#0b0e14] border border-[#263147] rounded-lg px-3 py-1.5 text-xs text-slate-100"
                    />
                  </div>
                  <NumericControl
                    label="周回数 (LAPS / 0で時間制レース)"
                    value={config.race.laps}
                    min={0}
                    max={100}
                    step={1}
                    unit="周"
                    accent="rose"
                    onChange={(v) =>
                      setConfig((p) => ({ ...p, race: { ...p.race, laps: Math.round(v) } }))
                    }
                  />
                  {config.race.laps === 0 && (
                    <NumericControl
                      label="時間制レース長さ (TIME)"
                      value={config.race.time}
                      min={5}
                      max={360}
                      step={5}
                      unit="分"
                      accent="rose"
                      onChange={(v) =>
                        setConfig((p) => ({ ...p, race: { ...p.race, time: Math.round(v) } }))
                      }
                    />
                  )}
                  <NumericControl
                    label="グリッド待機時間 (WAIT_TIME)"
                    value={config.race.waitTime}
                    min={15}
                    max={180}
                    step={5}
                    unit="秒"
                    accent="amber"
                    onChange={(v) =>
                      setConfig((p) => ({ ...p, race: { ...p.race, waitTime: Math.round(v) } }))
                    }
                  />
                  <NumericControl
                    label="リバースグリッド対象順位 (0=無効)"
                    value={config.race.reversedGridRacePositions}
                    min={0}
                    max={24}
                    step={1}
                    unit="位まで"
                    accent="cyan"
                    onChange={(v) =>
                      setConfig((p) => ({
                        ...p,
                        race: { ...p.race, reversedGridRacePositions: Math.round(v) },
                      }))
                    }
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* =============================================================== */}
        {/* TAB 3: VISUAL CAR & SKIN GALLERY + ENTRY LIST                   */}
        {/* =============================================================== */}
        {activeTab === 'entries' && (
          <div className="space-y-4 max-w-[1600px] mx-auto">
            {/* Full Visual Car & Skin Preview Browser */}
            <VisualCarPickerPanel
              carsDir={carsDir}
              cars={cars}
              slotCountByCarId={slotCountByCarId}
              onAddCarSlots={handleAddCarSlots}
            />

            {/* Registered Entry List Table with Visual Car/Skin Thumbnails */}
            <div className="bg-[#121722] border border-[#242e42] rounded-xl p-4 flex flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    登録済みエントリーリスト ({config.entryList.length} 台 / 車種{' '}
                    {serialized.uniqueCarIds.length})
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    server_cfg.ini の CARS=... へ自動的に同期されます
                  </p>
                </div>
                {config.entryList.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setConfig((p) => ({ ...p, entryList: [] }))}
                    className="text-xs text-rose-300 hover:text-rose-200 px-2.5 py-1 rounded-lg bg-rose-500/10 border border-rose-500/30"
                  >
                    すべてクリア
                  </button>
                )}
              </div>

              <div className="overflow-x-auto flex-1">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-400 border-b border-[#242e42]">
                      <th className="text-left py-2 px-1.5">#</th>
                      <th className="text-left py-2 px-1.5">プレビュー &amp; 車両</th>
                      <th className="text-left py-2 px-1.5">SKIN</th>
                      <th className="text-left py-2 px-1.5">バラスト(kg)</th>
                      <th className="text-left py-2 px-1.5">リストリクタ(%)</th>
                      <th className="text-left py-2 px-1.5">指定GUID (任意)</th>
                      <th className="text-right py-2 px-1.5">操作</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono-num">
                    {config.entryList.map((slot, idx) => {
                      const carInfo = carById.get(slot.model);
                      const thumbUrl =
                        (slot.skin ? skinPreviewMap[`${slot.model}::${slot.skin}`] : undefined) ??
                        carInfo?.previewDataUrl;
                      return (
                        <tr key={idx} className="border-b border-[#1b2232] hover:bg-[#161e2e]/60">
                          <td className="py-1.5 px-1.5 text-slate-500">{idx}</td>
                          <td className="py-1.5 px-1.5">
                            <div className="flex items-center gap-2.5">
                              <div className="w-16 h-10 rounded-md overflow-hidden bg-[#070a10] border border-[#253149] shrink-0 flex items-center justify-center">
                                {thumbUrl ? (
                                  <img
                                    src={thumbUrl}
                                    alt={slot.model}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <Car className="w-4 h-4 text-slate-600" />
                                )}
                              </div>
                              <div className="min-w-0">
                                {carInfo && (
                                  <div className="font-sans text-xs font-semibold text-slate-100 truncate max-w-[200px]">
                                    {carInfo.name}
                                  </div>
                                )}
                                <input
                                  type="text"
                                  value={slot.model}
                                  onChange={(e) => updateSlot(idx, { model: e.target.value })}
                                  className="w-44 bg-[#0b0e14] border border-[#252e42] rounded px-1.5 py-0.5 text-[10px] text-slate-300 mt-0.5"
                                />
                              </div>
                            </div>
                          </td>
                          <td className="py-1.5 px-1.5">
                            <input
                              type="text"
                              value={slot.skin}
                              onChange={(e) => updateSlot(idx, { skin: e.target.value })}
                              className="w-36 bg-[#0b0e14] border border-[#252e42] rounded px-2 py-1 text-[11px] text-slate-300"
                            />
                          </td>
                          <td className="py-1.5 px-1.5">
                            <input
                              type="number"
                              value={slot.ballast}
                              min={0}
                              max={200}
                              onChange={(e) =>
                                updateSlot(idx, { ballast: Number(e.target.value) || 0 })
                              }
                              className="w-16 bg-[#0b0e14] border border-[#252e42] rounded px-2 py-1 text-[11px] text-amber-300"
                            />
                          </td>
                          <td className="py-1.5 px-1.5">
                            <input
                              type="number"
                              value={slot.restrictor}
                              min={0}
                              max={100}
                              onChange={(e) =>
                                updateSlot(idx, { restrictor: Number(e.target.value) || 0 })
                              }
                              className="w-16 bg-[#0b0e14] border border-[#252e42] rounded px-2 py-1 text-[11px] text-cyan-300"
                            />
                          </td>
                          <td className="py-1.5 px-1.5">
                            <input
                              type="text"
                              value={slot.guid}
                              placeholder="Steam64 ID"
                              onChange={(e) => updateSlot(idx, { guid: e.target.value })}
                              className="w-36 bg-[#0b0e14] border border-[#252e42] rounded px-2 py-1 text-[11px] text-slate-300"
                            />
                          </td>
                          <td className="py-1.5 px-1.5 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => duplicateSlot(idx)}
                              className="p-1 text-slate-400 hover:text-emerald-400 mr-1"
                              title="このスロットを1台複製"
                            >
                              <CopyPlus className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeSlot(idx)}
                              className="p-1 text-slate-400 hover:text-rose-400"
                              title="削除"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {config.entryList.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-10 text-center text-slate-500">
                          上の車両プレビューGUIから車種とスキンを選んでスロットを追加してください。
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =============================================================== */}
        {/* TAB 4: CSP EXTRA OPTIONS (csp_extra_options.ini)                */}
        {/* =============================================================== */}
        {activeTab === 'csp' && (
          <div className="max-w-4xl mx-auto space-y-4">
            <div className="bg-[#121722] border border-cyan-500/30 rounded-xl p-4 space-y-4">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-cyan-400" />
                    CSP サーバー拡張ルールを有効にする (cfg/csp_extra_options.ini)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    CSP AT / CVT 車両の拡張物理許可、逆走ペナルティ解除、衝突無効化、ピット速度制限などを制御します。
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={config.cspExtra.enabled}
                  onChange={(e) =>
                    setConfig((p) => ({
                      ...p,
                      cspExtra: { ...p.cspExtra, enabled: e.target.checked },
                    }))
                  }
                  className="accent-cyan-500 w-5 h-5"
                />
              </label>

              {config.cspExtra.enabled && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-[#222d42]">
                  <div className="space-y-2.5 text-xs">
                    <div>
                      <label className="text-slate-400 block mb-1">
                        クライアント最低必須 CSP バージョン (TRACK csp/タグ)
                      </label>
                      <select
                        value={config.cspExtra.requireCspVersion}
                        onChange={(e) =>
                          setConfig((p) => ({
                            ...p,
                            cspExtra: { ...p.cspExtra, requireCspVersion: e.target.value },
                          }))
                        }
                        className="w-full bg-[#0b0e14] border border-[#263147] rounded-lg px-3 py-2 text-xs text-slate-100"
                      >
                        <option value="">指定なし (標準トラック名)</option>
                        <option value="0.1.76">CSP v0.1.76 以上</option>
                        <option value="0.1.79">CSP v0.1.79 以上 (推奨)</option>
                        <option value="0.2.0">CSP v0.2.0 以上</option>
                        <option value="0.2.3">CSP v0.2.3 以上</option>
                      </select>
                    </div>

                    {(
                      [
                        [
                          'useExtendedPhysics',
                          'CSP 拡張物理をサーバーで有効化 (AT/CVT/ハイブリッドLua対応)',
                        ],
                        ['allowWrongWay', '逆走ペナルティ無効化 (首都高・フリーローム向け)'],
                        ['disableCollisions', '車両同士の衝突判定を無効化 (ゴースト走行)'],
                        ['noBackToPits', 'ポーズ画面の「ピットへ戻る」を禁止'],
                        ['enforceBackToPitsPenalty', '「ピットへ戻る」使用時にペナルティ適用'],
                        ['disableRainPhysics', '雨天物理スリップを無効化'],
                      ] as const
                    ).map(([key, label]) => (
                      <label
                        key={key}
                        className="flex items-center justify-between bg-[#0b0e14] border border-[#252e42] rounded-lg px-3 py-2 cursor-pointer"
                      >
                        <span className="text-slate-200">{label}</span>
                        <input
                          type="checkbox"
                          checked={config.cspExtra[key]}
                          onChange={(e) =>
                            setConfig((p) => ({
                              ...p,
                              cspExtra: { ...p.cspExtra, [key]: e.target.checked },
                            }))
                          }
                          className="accent-cyan-500 w-4 h-4 shrink-0"
                        />
                      </label>
                    ))}
                  </div>

                  <div className="space-y-3">
                    <NumericControl
                      label="許容逆走距離 (MAX_METERS_WRONG_WAY / 0で制限なし)"
                      value={config.cspExtra.maxMetersWrongWay}
                      min={0}
                      max={1000}
                      step={25}
                      unit="m"
                      accent="amber"
                      onChange={(v) =>
                        setConfig((p) => ({
                          ...p,
                          cspExtra: { ...p.cspExtra, maxMetersWrongWay: Math.round(v) },
                        }))
                      }
                    />
                    <NumericControl
                      label="ピットレーン制限速度 (0でコース既定)"
                      value={config.cspExtra.pitSpeedLimitKmh}
                      min={0}
                      max={140}
                      step={5}
                      unit="km/h"
                      accent="cyan"
                      onChange={(v) =>
                        setConfig((p) => ({
                          ...p,
                          cspExtra: { ...p.cspExtra, pitSpeedLimitKmh: Math.round(v) },
                        }))
                      }
                    />
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">
                        追加カスタム CSP INI ブロック (任意)
                      </label>
                      <textarea
                        rows={5}
                        value={config.cspExtra.customRawBlock}
                        onChange={(e) =>
                          setConfig((p) => ({
                            ...p,
                            cspExtra: { ...p.cspExtra, customRawBlock: e.target.value },
                          }))
                        }
                        placeholder={'; 例:\n[EXTRA_TWEAKS]\nCUSTOM_MOTION=1'}
                        className="w-full bg-[#0b0e14] border border-[#263147] rounded-lg px-3 py-2 text-xs font-mono-num text-slate-200"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* =============================================================== */}
        {/* TAB 5: LIVE CONSOLE, CM JOIN LINK & RAW INI PREVIEW             */}
        {/* =============================================================== */}
        {activeTab === 'console' && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 max-w-[1600px] mx-auto">
            {/* Live acServer.exe Console + CM Join Link */}
            <div className="space-y-4">
              <div className="bg-[#121722] border border-[#242e42] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-emerald-400" />
                    acServer.exe ライブコンソールログ
                  </h3>
                  <button
                    type="button"
                    onClick={() => setLogs([])}
                    className="text-[11px] text-slate-400 hover:text-slate-200 px-2 py-1 rounded bg-[#0b0e14] border border-[#252e42]"
                  >
                    ログクリア
                  </button>
                </div>

                <div className="bg-[#070a10] border border-[#1d2638] rounded-lg p-3 h-72 overflow-y-auto font-mono-num text-[11px] space-y-1">
                  {logs.length === 0 ? (
                    <div className="text-slate-500">
                      「保存してサーバー起動」を押すと acServer.exe の標準出力ログがここにリアルタイム表示されます。
                    </div>
                  ) : (
                    logs.map((ev, i) => (
                      <div
                        key={i}
                        className={
                          ev.stream === 'stderr'
                            ? 'text-rose-400'
                            : ev.stream === 'system'
                              ? 'text-cyan-300'
                              : 'text-slate-200'
                        }
                      >
                        <span className="text-slate-600 mr-2">
                          {ev.timestamp.slice(11, 19)}
                        </span>
                        {ev.line}
                      </div>
                    ))
                  )}
                  <div ref={logEndRef} />
                </div>
              </div>

              {/* Content Manager Invite Link & Port Forwarding */}
              <div className="bg-[#121722] border border-[#242e42] rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                  Content Manager 招待リンク &amp; ポート開放チェック
                </h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={publicHostIp}
                    onChange={(e) => setPublicHostIp(e.target.value)}
                    placeholder="公開IP または ドメイン (ローカル検証は 127.0.0.1)"
                    className="flex-1 bg-[#0b0e14] border border-[#263147] rounded-lg px-3 py-1.5 text-xs font-mono-num text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => copyText(joinLink, '招待リンク')}
                    className="flex items-center gap-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg"
                  >
                    <ClipboardCopy className="w-3.5 h-3.5" />
                    リンクコピー
                  </button>
                </div>
                <div className="bg-[#080b11] border border-[#222c40] rounded-lg px-3 py-2 text-[11px] font-mono-num text-cyan-300 break-all">
                  {joinLink}
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px] font-mono-num">
                  <div className="bg-[#0b0e14] border border-[#242e42] rounded-lg p-2">
                    <div className="text-slate-400">UDP ポート開放</div>
                    <div className="text-emerald-300 font-bold mt-0.5">{config.udpPort} / UDP</div>
                  </div>
                  <div className="bg-[#0b0e14] border border-[#242e42] rounded-lg p-2">
                    <div className="text-slate-400">TCP ポート開放</div>
                    <div className="text-emerald-300 font-bold mt-0.5">{config.tcpPort} / TCP</div>
                  </div>
                  <div className="bg-[#0b0e14] border border-[#242e42] rounded-lg p-2">
                    <div className="text-slate-400">HTTP 情報ポート</div>
                    <div className="text-cyan-300 font-bold mt-0.5">{config.httpPort} / TCP</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Generated INI Preview */}
            <div className="bg-[#121722] border border-[#242e42] rounded-xl p-4 flex flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <FileCode2 className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-semibold text-white">出力 INI プレビュー</h3>
                </div>
                <div className="flex gap-1 text-xs">
                  {(
                    [
                      ['server_cfg', 'server_cfg.ini'],
                      ['entry_list', 'entry_list.ini'],
                      ['csp_extra', 'csp_extra_options.ini'],
                    ] as const
                  ).map(([id, name]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setPreviewIniTab(id)}
                      className={`px-2.5 py-1 rounded-lg font-mono-num border ${
                        previewIniTab === id
                          ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                          : 'bg-[#0b0e14] border-[#252e42] text-slate-400'
                      }`}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>

              <pre className="flex-1 bg-[#070a10] border border-[#1d2638] rounded-lg p-3 text-[11px] font-mono-num text-slate-200 overflow-auto max-h-[500px] whitespace-pre">
                {previewIniTab === 'server_cfg'
                  ? serialized.serverCfgIni
                  : previewIniTab === 'entry_list'
                    ? serialized.entryListIni || '; (エントリー車両が未登録です)'
                    : config.cspExtra.enabled
                      ? serialized.cspExtraOptionsIni
                      : '; (CSP拡張ルールは現在OFFです)'}
              </pre>
            </div>
          </div>
        )}
      </main>

      {/* Full-Screen Visual Track & Layout Picker Modal */}
      <TrackPickerModal
        open={trackModalOpen}
        tracks={tracks}
        currentTrackId={config.track}
        currentLayoutId={config.configTrack}
        onSelect={(trackId, layoutId, pitboxes) => {
          setConfig((p) => ({
            ...p,
            track: trackId,
            configTrack: layoutId,
            maxClients: pitboxes ? Math.min(p.maxClients, pitboxes) : p.maxClients,
          }));
          onToast(`サーキットを ${trackId}${layoutId ? ` (${layoutId})` : ''} に変更しました`, 'success');
        }}
        onClose={() => setTrackModalOpen(false)}
      />
    </div>
  );
};
