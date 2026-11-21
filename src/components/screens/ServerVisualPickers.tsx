import React, { useEffect, useMemo, useState } from 'react';
import {
  Car,
  Check,
  CheckCircle2,
  Flag,
  Globe,
  Layers,
  MapPin,
  Plus,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import type {
  AcTrackLayoutInfo,
  AcTrackSummary,
  CarSkinSummary,
  CarSummary,
} from '../../types/ac';

// ============================================================================
// 1. Visual Track & Layout Picker Modal (Preview Photo + Course Outline Map)
// ============================================================================

interface TrackPickerModalProps {
  open: boolean;
  tracks: AcTrackSummary[];
  currentTrackId: string;
  currentLayoutId: string;
  onSelect: (trackId: string, layoutId: string, pitboxes?: number) => void;
  onClose: () => void;
}

export const TrackPickerModal: React.FC<TrackPickerModalProps> = ({
  open,
  tracks,
  currentTrackId,
  currentLayoutId,
  onSelect,
  onClose,
}) => {
  const [search, setSearch] = useState('');
  const [countryFilter, setCountryFilter] = useState<string>('ALL');
  const [selectedTrackId, setSelectedTrackId] = useState(currentTrackId);
  const [selectedLayoutId, setSelectedLayoutId] = useState(currentLayoutId);
  const [manualTrackId, setManualTrackId] = useState(currentTrackId);
  const [manualLayoutId, setManualLayoutId] = useState(currentLayoutId);

  useEffect(() => {
    if (!open) return;
    setSelectedTrackId(currentTrackId);
    setSelectedLayoutId(currentLayoutId);
    setManualTrackId(currentTrackId);
    setManualLayoutId(currentLayoutId);
  }, [open, currentTrackId, currentLayoutId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const countries = useMemo(() => {
    const set = new Set<string>();
    for (const t of tracks) {
      if (t.country.trim()) set.add(t.country.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [tracks]);

  const filteredTracks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tracks.filter((t) => {
      if (countryFilter !== 'ALL' && t.country.trim() !== countryFilter) return false;
      if (!q) return true;
      return (
        t.id.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.country.toLowerCase().includes(q) ||
        t.layouts.some((l) => l.name.toLowerCase().includes(q) || l.id.toLowerCase().includes(q))
      );
    });
  }, [tracks, search, countryFilter]);

  const activeTrack = useMemo(
    () => tracks.find((t) => t.id === selectedTrackId) ?? filteredTracks[0] ?? null,
    [tracks, selectedTrackId, filteredTracks]
  );

  const activeLayout: AcTrackLayoutInfo | null = useMemo(() => {
    if (!activeTrack) return null;
    return (
      activeTrack.layouts.find((l) => l.id === selectedLayoutId) ?? activeTrack.layouts[0] ?? null
    );
  }, [activeTrack, selectedLayoutId]);

  if (!open) return null;

  const handleChooseTrackCard = (track: AcTrackSummary) => {
    setSelectedTrackId(track.id);
    const firstLayout = track.layouts[0]?.id ?? '';
    setSelectedLayoutId(firstLayout);
    setManualTrackId(track.id);
    setManualLayoutId(firstLayout);
  };

  const handleConfirm = () => {
    if (activeTrack && activeLayout) {
      onSelect(activeTrack.id, activeLayout.id, activeLayout.pitboxes);
    } else if (manualTrackId.trim()) {
      onSelect(manualTrackId.trim(), manualLayoutId.trim());
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[1360px] h-[88vh] bg-[#0c111b] border border-[#2a3752] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-3.5 bg-[#101725] border-b border-[#222e46] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">
                サーキット &amp; レイアウト プレビュー選択 ({filteredTracks.length} / {tracks.length})
              </h2>
              <p className="text-[11px] text-slate-400">
                サーキットをクリックしてレイアウトとプレビューを確認し、決定してください（ダブルクリックで即決定）
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-[#182132] hover:bg-[#25324c] text-slate-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search & Country Filter Strip */}
        <div className="px-5 py-2.5 bg-[#0a0f18] border-b border-[#1c263a] flex flex-wrap items-center gap-2.5 shrink-0">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="サーキット名・国・レイアウト名・フォルダIDで検索..."
              autoFocus
              className="w-full bg-[#121927] border border-[#283550] rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div className="flex items-center gap-1 overflow-x-auto max-w-full">
            <button
              type="button"
              onClick={() => setCountryFilter('ALL')}
              className={`px-2.5 py-1 rounded-lg text-[11px] border whitespace-nowrap ${
                countryFilter === 'ALL'
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 font-semibold'
                  : 'bg-[#121927] border-[#253149] text-slate-400 hover:text-slate-200'
              }`}
            >
              すべての国
            </button>
            {countries.slice(0, 12).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCountryFilter(c)}
                className={`px-2.5 py-1 rounded-lg text-[11px] border whitespace-nowrap ${
                  countryFilter === c
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 font-semibold'
                    : 'bg-[#121927] border-[#253149] text-slate-400 hover:text-slate-200'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Body: Left Visual Grid + Right Large Preview Inspector */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Left Grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {filteredTracks.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 p-8">
                <Globe className="w-10 h-10 text-slate-600 mb-3" />
                <div className="text-sm font-semibold text-slate-200">
                  該当するサーキットが見つかりませんでした
                </div>
                <p className="text-xs text-slate-500 mt-1 max-w-md">
                  Assetto Corsa の <code className="text-slate-300">content/tracks</code> フォルダが認識されていない場合は、下の直接ID入力欄からサーキットIDを指定することもできます。
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredTracks.map((track) => {
                  const isSelected = activeTrack?.id === track.id;
                  const maxPit = Math.max(...track.layouts.map((l) => l.pitboxes || 0));
                  return (
                    <button
                      key={track.id}
                      type="button"
                      onClick={() => handleChooseTrackCard(track)}
                      onDoubleClick={() => {
                        const firstLayout = track.layouts[0];
                        onSelect(track.id, firstLayout?.id ?? '', firstLayout?.pitboxes);
                        onClose();
                      }}
                      className={`group text-left rounded-xl overflow-hidden border transition-all flex flex-col bg-[#111827] ${
                        isSelected
                          ? 'border-cyan-400 ring-2 ring-cyan-400/30 shadow-lg shadow-cyan-950/50'
                          : 'border-[#232f46] hover:border-slate-500'
                      }`}
                    >
                      {/* 16:9 Preview Photo + Course Outline Overlay */}
                      <div className="relative aspect-[16/9] w-full bg-[#080c14] overflow-hidden">
                        {track.previewDataUrl ? (
                          <img
                            src={track.previewDataUrl}
                            alt={track.name}
                            loading="lazy"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#131d30] to-[#0a0f18] text-slate-600">
                            <Flag className="w-8 h-8" />
                          </div>
                        )}

                        <div className="absolute inset-0 bg-gradient-to-t from-[#0b101b] via-transparent to-black/20" />

                        {/* Track Outline Overlay */}
                        {track.outlineDataUrl && (
                          <div className="absolute top-2 right-2 w-16 h-12 rounded-lg bg-black/55 backdrop-blur-[2px] border border-white/10 p-1.5 flex items-center justify-center">
                            <img
                              src={track.outlineDataUrl}
                              alt=""
                              loading="lazy"
                              className="max-w-full max-h-full object-contain drop-shadow-[0_0_4px_rgba(0,0,0,0.9)]"
                            />
                          </div>
                        )}

                        {/* Badges */}
                        <div className="absolute top-2 left-2 flex items-center gap-1">
                          {track.layouts.length > 1 && (
                            <span className="text-[10px] font-mono-num px-1.5 py-0.5 rounded bg-cyan-600/85 text-white font-semibold">
                              {track.layouts.length} レイアウト
                            </span>
                          )}
                          <span className="text-[10px] font-mono-num px-1.5 py-0.5 rounded bg-black/70 text-slate-200 border border-white/10">
                            {maxPit} Pit
                          </span>
                        </div>

                        {isSelected && (
                          <div className="absolute bottom-2 right-2 w-6 h-6 rounded-full bg-cyan-500 text-slate-950 flex items-center justify-center shadow">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        )}
                      </div>

                      {/* Card Footer */}
                      <div className="p-2.5 flex-1 flex flex-col justify-between">
                        <div className="text-xs font-bold text-slate-100 truncate" title={track.name}>
                          {track.name}
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                          <span className="truncate flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-cyan-400 shrink-0" />
                            {track.country || track.id}
                          </span>
                          <span className="font-mono-num text-slate-500 truncate ml-2">
                            {track.layouts[0]?.length || ''}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Detail & Layout Selector Inspector */}
          <div className="w-[360px] xl:w-[410px] bg-[#0e1422] border-l border-[#222e46] p-4 flex flex-col justify-between overflow-y-auto shrink-0">
            {activeTrack && activeLayout ? (
              <div className="space-y-4">
                {/* Large Preview Hero */}
                <div className="relative aspect-[16/9] rounded-xl overflow-hidden border border-[#2a3754] bg-[#070a11]">
                  {activeLayout.previewDataUrl ? (
                    <img
                      src={activeLayout.previewDataUrl}
                      alt={activeLayout.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-600">
                      <Flag className="w-10 h-10" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#090d16] via-transparent to-transparent" />
                  <div className="absolute bottom-2.5 left-3 right-3">
                    <div className="text-sm font-bold text-white leading-tight drop-shadow">
                      {activeLayout.name}
                    </div>
                    <div className="text-[11px] font-mono-num text-cyan-300 mt-0.5">
                      {activeTrack.id}
                      {activeLayout.id ? ` / ${activeLayout.id}` : ''}
                    </div>
                  </div>
                </div>

                {/* Course Outline Map Box + Quick Stats */}
                <div className="grid grid-cols-5 gap-2.5">
                  <div className="col-span-2 bg-[#080c14] border border-[#232f46] rounded-xl p-2 flex items-center justify-center min-h-[86px]">
                    {activeLayout.outlineDataUrl ? (
                      <img
                        src={activeLayout.outlineDataUrl}
                        alt="Track Map"
                        className="max-h-20 max-w-full object-contain"
                      />
                    ) : (
                      <span className="text-[10px] text-slate-500">マップ画像なし</span>
                    )}
                  </div>
                  <div className="col-span-3 bg-[#0a0f19] border border-[#232f46] rounded-xl p-2.5 space-y-1.5 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-slate-400">ピット上限</span>
                      <span className="font-mono-num font-bold text-emerald-300">
                        {activeLayout.pitboxes} 台
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">全長</span>
                      <span className="font-mono-num text-slate-200">
                        {activeLayout.length || '-'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">国 / 地域</span>
                      <span className="text-slate-200 truncate max-w-[120px]">
                        {activeLayout.country || activeTrack.country || '-'}
                      </span>
                    </div>
                    {activeLayout.width && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">コース幅</span>
                        <span className="font-mono-num text-slate-300">{activeLayout.width}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Layout Selection List */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-cyan-400" />
                    レイアウト選択 ({activeTrack.layouts.length})
                  </div>
                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    {activeTrack.layouts.map((layout) => {
                      const isLaySelected = activeLayout.id === layout.id;
                      return (
                        <button
                          key={layout.id || '__default'}
                          type="button"
                          onClick={() => {
                            setSelectedLayoutId(layout.id);
                            setManualTrackId(activeTrack.id);
                            setManualLayoutId(layout.id);
                          }}
                          className={`w-full flex items-center gap-2.5 p-2 rounded-xl border text-left transition-colors ${
                            isLaySelected
                              ? 'bg-cyan-500/15 border-cyan-400 text-white'
                              : 'bg-[#0b101a] border-[#222e46] text-slate-300 hover:border-slate-500'
                          }`}
                        >
                          <div className="w-12 h-9 rounded-lg bg-[#070a10] border border-white/10 overflow-hidden shrink-0 flex items-center justify-center">
                            {layout.outlineDataUrl ? (
                              <img
                                src={layout.outlineDataUrl}
                                alt=""
                                className="max-w-full max-h-full object-contain p-1"
                              />
                            ) : layout.previewDataUrl ? (
                              <img
                                src={layout.previewDataUrl}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Flag className="w-3.5 h-3.5 text-slate-600" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold truncate">{layout.name}</div>
                            <div className="text-[10px] font-mono-num text-slate-400">
                              {layout.pitboxes} Pit{layout.length ? ` • ${layout.length}` : ''}
                            </div>
                          </div>
                          {isLaySelected && <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-400 text-center py-10">
                左の一覧からサーキットを選択してください
              </div>
            )}

            {/* Manual Fallback + Confirm Button */}
            <div className="pt-4 mt-4 border-t border-[#222e46] space-y-2.5">
              <details className="text-[11px] text-slate-400">
                <summary className="cursor-pointer hover:text-slate-200">
                  未インストールコースをIDで直接指定する
                </summary>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <input
                    type="text"
                    value={manualTrackId}
                    onChange={(e) => {
                      setManualTrackId(e.target.value);
                      setSelectedTrackId(e.target.value);
                    }}
                    placeholder="TRACK ID"
                    className="bg-[#080c14] border border-[#26334d] rounded px-2 py-1 text-xs font-mono-num text-slate-100"
                  />
                  <input
                    type="text"
                    value={manualLayoutId}
                    onChange={(e) => {
                      setManualLayoutId(e.target.value);
                      setSelectedLayoutId(e.target.value);
                    }}
                    placeholder="CONFIG_TRACK (任意)"
                    className="bg-[#080c14] border border-[#26334d] rounded px-2 py-1 text-xs font-mono-num text-slate-100"
                  />
                </div>
              </details>

              <button
                type="button"
                onClick={handleConfirm}
                className="w-full flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs py-2.5 rounded-xl shadow-lg shadow-cyan-950/40"
              >
                <CheckCircle2 className="w-4 h-4" />
                このサーキットに決定
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 2. Visual Car & Skin Preview Picker (Card Grid + Live Skin Thumbnail Strip)
// ============================================================================

interface VisualCarPickerPanelProps {
  carsDir: string | null;
  cars: CarSummary[];
  slotCountByCarId: Record<string, number>;
  onAddCarSlots: (payload: {
    model: string;
    skin: string;
    count: number;
    ballast: number;
    restrictor: number;
    autoRotateSkins: CarSkinSummary[];
  }) => void;
}

export const VisualCarPickerPanel: React.FC<VisualCarPickerPanelProps> = ({
  carsDir,
  cars,
  slotCountByCarId,
  onAddCarSlots,
}) => {
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState<string>('ALL');
  const [classFilter, setClassFilter] = useState<string>('ALL');
  const [selectedCarId, setSelectedCarId] = useState<string>(cars[0]?.id ?? '');
  const [skins, setSkins] = useState<CarSkinSummary[]>([]);
  const [selectedSkinId, setSelectedSkinId] = useState<string>(''); // '' = auto rotate
  const [slotCount, setSlotCount] = useState<number>(2);
  const [ballast, setBallast] = useState<number>(0);
  const [restrictor, setRestrictor] = useState<number>(0);
  const [manualModelId, setManualModelId] = useState('');

  useEffect(() => {
    if (!selectedCarId && cars.length > 0) {
      setSelectedCarId(cars[0].id);
    }
  }, [cars, selectedCarId]);

  useEffect(() => {
    if (!carsDir || !selectedCarId) {
      setSkins([]);
      setSelectedSkinId('');
      return;
    }
    let cancelled = false;
    window.acApi
      .listCarSkins(carsDir, selectedCarId)
      .then((list) => {
        if (cancelled) return;
        setSkins(list);
        setSelectedSkinId(''); // default to auto-rotation across available skins
      })
      .catch(() => {
        if (!cancelled) {
          setSkins([]);
          setSelectedSkinId('');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [carsDir, selectedCarId]);

  const brands = useMemo(() => {
    const s = new Set<string>();
    for (const c of cars) {
      if (c.brand && c.brand !== 'Unknown') s.add(c.brand);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [cars]);

  const classes = useMemo(() => {
    const s = new Set<string>();
    for (const c of cars) {
      if (c.carClass) s.add(c.carClass);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [cars]);

  const filteredCars = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cars.filter((c) => {
      if (brandFilter !== 'ALL' && c.brand !== brandFilter) return false;
      if (classFilter !== 'ALL' && c.carClass !== classFilter) return false;
      if (!q) return true;
      return (
        c.id.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.brand.toLowerCase().includes(q) ||
        c.carClass.toLowerCase().includes(q)
      );
    });
  }, [cars, search, brandFilter, classFilter]);

  const selectedCar = useMemo(
    () => cars.find((c) => c.id === selectedCarId) ?? filteredCars[0] ?? null,
    [cars, selectedCarId, filteredCars]
  );

  const selectedSkinObj = useMemo(
    () => skins.find((s) => s.id === selectedSkinId) ?? null,
    [skins, selectedSkinId]
  );

  const heroPreviewUrl =
    selectedSkinObj?.previewDataUrl ?? selectedCar?.previewDataUrl ?? undefined;

  const handleAdd = () => {
    const targetModel = manualModelId.trim() || selectedCar?.id || '';
    if (!targetModel) return;
    onAddCarSlots({
      model: targetModel,
      skin: selectedSkinId,
      count: slotCount,
      ballast,
      restrictor,
      autoRotateSkins: skins,
    });
  };

  return (
    <div className="bg-[#121722] border border-[#242e42] rounded-xl overflow-hidden flex flex-col">
      {/* Top Filter Bar */}
      <div className="px-4 py-3 bg-[#0f1522] border-b border-[#222d42] flex flex-wrap items-center gap-2.5">
        <div className="flex items-center gap-2 text-xs font-bold text-white mr-1">
          <Car className="w-4 h-4 text-emerald-400" />
          車両プレビュー選択 ({filteredCars.length} / {cars.length} 台)
        </div>

        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="車両名・メーカー・IDで検索..."
            className="w-full bg-[#090d15] border border-[#27344f] rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-400"
          />
        </div>

        <select
          value={brandFilter}
          onChange={(e) => setBrandFilter(e.target.value)}
          className="bg-[#090d15] border border-[#27344f] rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
        >
          <option value="ALL">すべてのメーカー ({brands.length})</option>
          {brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1 overflow-x-auto">
          <button
            type="button"
            onClick={() => setClassFilter('ALL')}
            className={`px-2 py-1 rounded-lg text-[11px] border ${
              classFilter === 'ALL'
                ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                : 'bg-[#090d15] border-[#253149] text-slate-400'
            }`}
          >
            全クラス
          </button>
          {classes.slice(0, 6).map((cls) => (
            <button
              key={cls}
              type="button"
              onClick={() => setClassFilter(cls)}
              className={`px-2 py-1 rounded-lg text-[11px] border uppercase ${
                classFilter === cls
                  ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                  : 'bg-[#090d15] border-[#253149] text-slate-400 hover:text-slate-200'
              }`}
            >
              {cls}
            </button>
          ))}
        </div>
      </div>

      {/* Main Split: Left Visual Car Cards Grid + Right Selected Car & Skin Gallery */}
      <div className="grid grid-cols-1 xl:grid-cols-12 min-h-[420px]">
        {/* Left: Car Preview Card Grid */}
        <div className="xl:col-span-7 p-3.5 max-h-[520px] overflow-y-auto border-b xl:border-b-0 xl:border-r border-[#222d42]">
          {filteredCars.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-500 text-xs">
              <Car className="w-8 h-8 mb-2 opacity-50" />
              条件に合う車両がありません。右下のID欄から直接追加もできます。
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {filteredCars.map((car) => {
                const active = selectedCar?.id === car.id;
                const countInList = slotCountByCarId[car.id] ?? 0;
                return (
                  <button
                    key={car.id}
                    type="button"
                    onClick={() => {
                      setSelectedCarId(car.id);
                      setManualModelId('');
                    }}
                    className={`group text-left rounded-xl overflow-hidden border transition-all flex flex-col bg-[#0c111c] ${
                      active
                        ? 'border-emerald-400 ring-2 ring-emerald-400/25 shadow-md shadow-emerald-950/40'
                        : 'border-[#232f46] hover:border-slate-500'
                    }`}
                  >
                    <div className="relative aspect-[16/10] w-full bg-[#070a10] overflow-hidden">
                      {car.previewDataUrl ? (
                        <img
                          src={car.previewDataUrl}
                          alt={car.name}
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-600">
                          <Car className="w-7 h-7" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0b101b] via-transparent to-transparent" />

                      {car.badgeDataUrl && (
                        <img
                          src={car.badgeDataUrl}
                          alt=""
                          loading="lazy"
                          className="absolute top-1.5 left-1.5 w-6 h-6 object-contain drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]"
                        />
                      )}

                      {countInList > 0 && (
                        <span className="absolute top-1.5 right-1.5 text-[10px] font-mono-num font-bold px-1.5 py-0.5 rounded-full bg-emerald-500 text-slate-950 shadow">
                          ×{countInList} 登録中
                        </span>
                      )}

                      {car.bhpSpec && (
                        <span className="absolute bottom-1.5 right-1.5 text-[9px] font-mono-num px-1.5 py-0.5 rounded bg-black/70 text-amber-200 border border-white/10">
                          {car.bhpSpec}
                        </span>
                      )}
                    </div>

                    <div className="p-2">
                      <div className="text-[11px] font-bold text-slate-100 truncate" title={car.name}>
                        {car.name}
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 mt-0.5">
                        <span className="truncate">{car.brand}</span>
                        <span className="uppercase text-[9px] text-slate-500">{car.carClass}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Large Car Preview + Visual Skin Thumbnail Picker + Add Controls */}
        <div className="xl:col-span-5 p-4 bg-[#0e1421] flex flex-col justify-between gap-3">
          <div className="space-y-3">
            {/* Large Car / Skin Hero Preview */}
            <div className="relative aspect-[16/9] rounded-xl overflow-hidden border border-[#2a3854] bg-[#070a11]">
              {heroPreviewUrl ? (
                <img
                  src={heroPreviewUrl}
                  alt={selectedCar?.name ?? 'Car Preview'}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-600">
                  <Car className="w-10 h-10" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#090d16] via-transparent to-transparent" />
              {selectedCar?.badgeDataUrl && (
                <img
                  src={selectedCar.badgeDataUrl}
                  alt=""
                  className="absolute top-2.5 left-2.5 w-8 h-8 object-contain drop-shadow"
                />
              )}
              <div className="absolute bottom-2.5 left-3 right-3 flex items-end justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white truncate">
                    {selectedCar?.name ?? '車両未選択'}
                  </div>
                  <div className="text-[11px] font-mono-num text-emerald-300 truncate">
                    {selectedCar?.id || manualModelId || '-'}
                    {selectedSkinObj ? ` • Skin: ${selectedSkinObj.skinName || selectedSkinObj.id}` : ' • 全スキン自動割当'}
                  </div>
                </div>
                {selectedCar && (
                  <div className="text-[10px] font-mono-num text-right text-slate-200 shrink-0 bg-black/60 px-2 py-1 rounded-lg border border-white/10">
                    <div>{selectedCar.bhpSpec || '-'}</div>
                    <div className="text-slate-400">{selectedCar.weightSpec || ''}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Visual Skin Picker Grid */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  スキンプレビュー選択 ({skins.length} 種類)
                </span>
                <span className="text-[10px] text-slate-400">
                  {selectedSkinId ? selectedSkinId : '自動ローテーション'}
                </span>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 max-h-36 overflow-y-auto pr-1">
                {/* Auto-rotate option */}
                <button
                  type="button"
                  onClick={() => setSelectedSkinId('')}
                  className={`rounded-lg border p-1.5 text-center flex flex-col items-center justify-center min-h-[62px] transition-colors ${
                    selectedSkinId === ''
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                      : 'bg-[#090d15] border-[#243048] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Sparkles className="w-4 h-4 mb-1" />
                  <span className="text-[10px] font-semibold leading-tight">自動割当</span>
                </button>

                {skins.map((skin) => {
                  const active = selectedSkinId === skin.id;
                  return (
                    <button
                      key={skin.id}
                      type="button"
                      onClick={() => setSelectedSkinId(skin.id)}
                      className={`rounded-lg overflow-hidden border text-left transition-all bg-[#090d15] ${
                        active
                          ? 'border-emerald-400 ring-1 ring-emerald-400/50'
                          : 'border-[#243048] hover:border-slate-500'
                      }`}
                      title={skin.skinName || skin.id}
                    >
                      <div className="aspect-[16/10] w-full bg-[#06090f] overflow-hidden relative">
                        {skin.previewDataUrl ? (
                          <img
                            src={skin.previewDataUrl}
                            alt={skin.skinName || skin.id}
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[9px] text-slate-500">
                            No Img
                          </div>
                        )}
                        {skin.number && (
                          <span className="absolute bottom-0.5 right-0.5 text-[9px] font-mono-num px-1 rounded bg-black/75 text-white">
                            #{skin.number}
                          </span>
                        )}
                      </div>
                      <div className="px-1.5 py-1 text-[9px] text-slate-200 truncate">
                        {skin.skinName || skin.id}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Add Controls */}
          <div className="space-y-2.5 pt-2 border-t border-[#222d42]">
            <div className="grid grid-cols-3 gap-2 text-[11px]">
              <div>
                <label className="text-slate-400 block mb-1">追加台数</label>
                <div className="grid grid-cols-4 gap-1">
                  {[1, 2, 4, 8].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setSlotCount(n)}
                      className={`py-1 rounded font-mono-num border text-[11px] ${
                        slotCount === n
                          ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200 font-bold'
                          : 'bg-[#090d15] border-[#253149] text-slate-400'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-slate-400 block mb-1">バラスト (kg)</label>
                <input
                  type="number"
                  value={ballast}
                  min={0}
                  max={200}
                  onChange={(e) => setBallast(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full bg-[#090d15] border border-[#253149] rounded-lg px-2 py-1 text-xs font-mono-num text-amber-300"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">リストリクタ (%)</label>
                <input
                  type="number"
                  value={restrictor}
                  min={0}
                  max={100}
                  onChange={(e) =>
                    setRestrictor(Math.min(100, Math.max(0, Number(e.target.value) || 0)))
                  }
                  className="w-full bg-[#090d15] border border-[#253149] rounded-lg px-2 py-1 text-xs font-mono-num text-cyan-300"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleAdd}
              disabled={!selectedCar && !manualModelId.trim()}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-xs py-2.5 rounded-xl shadow-lg shadow-emerald-950/40"
            >
              <Plus className="w-4 h-4" />
              この車両を {slotCount} スロット追加
            </button>

            <details className="text-[10px] text-slate-400">
              <summary className="cursor-pointer hover:text-slate-200">
                未インストール車両を MODEL ID で直接追加
              </summary>
              <input
                type="text"
                value={manualModelId}
                onChange={(e) => setManualModelId(e.target.value)}
                placeholder="例: ks_mazda_mx5_cup"
                className="mt-1.5 w-full bg-[#080c14] border border-[#26334d] rounded px-2.5 py-1 text-xs font-mono-num text-slate-100"
              />
            </details>
          </div>
        </div>
      </div>
    </div>
  );
};
