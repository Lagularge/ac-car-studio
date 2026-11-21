import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Code2,
  Cog,
  Cpu,
  Gauge,
  Sliders,
  Sparkles,
  Zap,
} from 'lucide-react';
import type { CarPhysicsMetrics, TransmissionMode } from '../../types/ac';
import {
  CSP_TRANSMISSION_PRESETS,
  applyCspTransmissionToFiles,
  generateCvtRatioTable,
  parseCspTransmissionFromFiles,
  type CspTransmissionConfig,
  type CspTransmissionPreset,
} from '../../utils/cspPowertrain';
import { getIniNumber, getIniValue, setIniValue, setIniValues } from '../../utils/iniHelpers';
import { GearChart } from '../charts/GearChart';
import { DetachablePanel } from '../common/DetachablePanel';
import { NumericControl } from '../ui/NumericControl';

interface DrivetrainTabProps {
  files: Record<string, string>;
  metrics: CarPhysicsMetrics;
  onUpdateFile: (fileName: string, content: string) => void;
  onReplaceAllFiles: (nextFiles: Record<string, string>, toastMsg: string) => void;
}

const MODE_CARDS: Array<{
  id: TransmissionMode;
  title: string;
  badge: string;
  desc: string;
}> = [
  {
    id: 'manual',
    title: 'MT (マニュアル)',
    badge: 'H-PATTERN',
    desc: 'クラッチ操作・Hパターンシフター対応の標準マニュアル。',
  },
  {
    id: 'sequential',
    title: 'シーケンシャル / DCT',
    badge: 'PADDLE',
    desc: '高速パドルシフト・ドグミッション／DCT向け。',
  },
  {
    id: 'csp_at',
    title: 'CSP AT (オートマ)',
    badge: 'CSP EXTENDED',
    desc: 'トルコンクリープ・ロックアップ・キックダウン・D/S/M対応の本格AT。',
  },
  {
    id: 'csp_cvt',
    title: 'CSP CVT (無段変速)',
    badge: 'CSP EXTENDED',
    desc: '目標回転数マップによる滑らかな無段変速＋擬似ステップ変速対応。',
  },
];

export const DrivetrainTab: React.FC<DrivetrainTabProps> = ({
  files,
  metrics,
  onUpdateFile,
  onReplaceAllFiles,
}) => {
  const dtIni = files['drivetrain.ini'] ?? '';
  const carIni = files['car.ini'] ?? '';

  const parsedTx = useMemo(
    () => parseCspTransmissionFromFiles(files, metrics.maxRpm, metrics.idleRpm),
    [files, metrics.maxRpm, metrics.idleRpm]
  );

  const [txDraft, setTxDraft] = useState<CspTransmissionConfig>(parsedTx);
  const [showLuaPreview, setShowLuaPreview] = useState(false);

  // Sync draft when car changes or Undo/Redo restores files
  useEffect(() => {
    setTxDraft(parsedTx);
  }, [parsedTx]);

  const driveType = getIniValue(dtIni, 'TRACTION', 'TYPE', 'RWD').toUpperCase();
  const gearCount = Math.min(16, Math.max(4, Math.round(getIniNumber(dtIni, 'GEARS', 'COUNT', 6))));
  const finalRatio = getIniNumber(dtIni, 'GEARS', 'FINAL', 3.9);
  const reverseRatio = Math.abs(getIniNumber(dtIni, 'GEARS', 'GEAR_R', 3.38));

  const lsdPower = getIniNumber(dtIni, 'DIFFERENTIAL', 'POWER', 0.45);
  const lsdCoast = getIniNumber(dtIni, 'DIFFERENTIAL', 'COAST', 0.25);
  const lsdPreload = getIniNumber(dtIni, 'DIFFERENTIAL', 'PRELOAD', 35);

  const changeUp = getIniNumber(dtIni, 'GEARBOX', 'CHANGE_UP_TIME', 130);
  const changeDn = getIniNumber(dtIni, 'GEARBOX', 'CHANGE_DN_TIME', 160);
  const clutchMax = getIniNumber(dtIni, 'CLUTCH', 'MAX_TORQUE', 550);
  const supportsShifter = getIniNumber(dtIni, 'GEARBOX', 'SUPPORTS_SHIFTER', 1);

  const awdFrontShare = getIniNumber(dtIni, 'AWD', 'FRONT_SHARE', 35);
  const isExtendedPhysics = getIniValue(carIni, 'HEADER', 'VERSION', '').toLowerCase().includes('extended');

  const updateDt = (section: string, key: string, value: string | number) => {
    onUpdateFile('drivetrain.ini', setIniValue(dtIni, section, key, value));
  };

  const handleSetDriveType = (type: 'RWD' | 'FWD' | 'AWD') => {
    let next = setIniValue(dtIni, 'TRACTION', 'TYPE', type);
    if (type === 'AWD' && !dtIni.toUpperCase().includes('[AWD]')) {
      next = setIniValues(next, [
        ['AWD', 'FRONT_SHARE', 35],
        ['AWD', 'FRONT_DIFF_POWER', '0.25'],
        ['AWD', 'FRONT_DIFF_COAST', '0.10'],
        ['AWD', 'FRONT_DIFF_PRELOAD', 15],
        ['AWD', 'CENTRE_DIFF_POWER', '0.50'],
        ['AWD', 'CENTRE_DIFF_COAST', '0.35'],
        ['AWD', 'CENTRE_DIFF_PRELOAD', 40],
        ['AWD', 'REAR_DIFF_POWER', lsdPower.toFixed(2)],
        ['AWD', 'REAR_DIFF_COAST', lsdCoast.toFixed(2)],
        ['AWD', 'REAR_DIFF_PRELOAD', lsdPreload],
      ]);
    }
    onUpdateFile('drivetrain.ini', next);
  };

  const handleSetGearCount = (count: number) => {
    const updates: Array<[string, string, string | number]> = [['GEARS', 'COUNT', count]];
    const defaults = [3.8, 2.5, 1.85, 1.42, 1.15, 0.94, 0.80, 0.68, 0.59, 0.52];
    for (let g = 1; g <= count; g++) {
      const existing = getIniValue(dtIni, 'GEARS', `GEAR_${g}`, '');
      if (!existing) {
        updates.push(['GEARS', `GEAR_${g}`, (defaults[g - 1] ?? 0.5).toFixed(3)]);
      }
    }
    onUpdateFile('drivetrain.ini', setIniValues(dtIni, updates));
  };

  const applyGearStyle = (style: 'close' | 'balanced' | 'topspeed') => {
    const map: Record<typeof style, { ratios: number[]; final: number }> = {
      close: { ratios: [3.10, 2.25, 1.72, 1.38, 1.14, 0.96, 0.82, 0.71, 0.62, 0.55], final: 4.30 },
      balanced: { ratios: [3.55, 2.20, 1.56, 1.21, 1.00, 0.80, 0.68, 0.58, 0.51, 0.46], final: 3.90 },
      topspeed: { ratios: [3.20, 2.05, 1.45, 1.10, 0.88, 0.70, 0.59, 0.50, 0.44, 0.39], final: 3.42 },
    };
    const preset = map[style];
    const updates: Array<[string, string, string | number]> = [['GEARS', 'FINAL', preset.final.toFixed(3)]];
    const maxG = Math.min(gearCount, preset.ratios.length);
    for (let g = 1; g <= maxG; g++) {
      updates.push(['GEARS', `GEAR_${g}`, preset.ratios[g - 1].toFixed(3)]);
    }
    onUpdateFile('drivetrain.ini', setIniValues(dtIni, updates));
  };

  const applyTxConfig = (cfg: CspTransmissionConfig, regenerateGearRatios: boolean, label: string) => {
    const nextFiles = applyCspTransmissionToFiles(files, cfg, {
      maxRpm: metrics.maxRpm,
      idleRpm: metrics.idleRpm,
      regenerateGearRatios,
    });
    onReplaceAllFiles(nextFiles, label);
  };

  const handleApplyPreset = (preset: CspTransmissionPreset) => {
    const patch = preset.apply(metrics.maxRpm, metrics.idleRpm);
    const merged: CspTransmissionConfig = {
      mode: patch.mode ?? preset.mode,
      at: { ...txDraft.at, ...(patch.at ?? {}) },
      cvt: { ...txDraft.cvt, ...(patch.cvt ?? {}) },
    };
    setTxDraft(merged);
    applyTxConfig(merged, true, `CSP ${preset.name} を適用しました`);
  };

  const cvtPreviewRatios = useMemo(() => generateCvtRatioTable(txDraft.cvt), [txDraft.cvt]);

  // Small inline SVG preview of CVT Target RPM vs Throttle (0..100%)
  const cvtCurvePoints = useMemo(() => {
    const maxR = Math.max(4500, metrics.maxRpm);
    const pts: Array<{ gas: number; rpm: number }> = [
      { gas: 0, rpm: txDraft.cvt.cruiseRpm },
      { gas: 50, rpm: txDraft.cvt.midLoadRpm },
      { gas: 100, rpm: txDraft.cvt.peakPowerRpm },
    ];
    return pts
      .map((p) => {
        const x = 16 + (p.gas / 100) * 248;
        const y = 86 - (Math.min(maxR, Math.max(0, p.rpm)) / maxR) * 72;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [txDraft.cvt, metrics.maxRpm]);

  return (
    <div className="space-y-5">
      {/* =================================================================== */}
      {/* CSP Extended Physics AT & CVT Transmission Studio                    */}
      {/* =================================================================== */}
      <div className="bg-[#121722] border border-cyan-500/30 rounded-xl p-4 space-y-4 shadow-lg shadow-cyan-950/10">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                CSP 拡張トランスミッション (AT / CVT 実装)
                <span
                  className={`text-[10px] font-mono-num px-2 py-0.5 rounded-full border ${
                    parsedTx.mode === 'csp_cvt'
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                      : parsedTx.mode === 'csp_at'
                        ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                        : 'bg-slate-800 border-slate-600 text-slate-300'
                  }`}
                >
                  現在:{' '}
                  {parsedTx.mode === 'csp_cvt'
                    ? `CSP CVT (${parsedTx.cvt.virtualSteps}段仮想プーリー)`
                    : parsedTx.mode === 'csp_at'
                      ? `CSP ${parsedTx.at.gears}速 AT`
                      : parsedTx.mode === 'sequential'
                        ? 'シーケンシャル'
                        : 'マニュアル (MT)'}
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                car.ini (extended-2) ・ drivetrain.ini ・ data/script.lua を自動生成して本格AT / CVTを実装します
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px]">
            <span
              className={`px-2 py-1 rounded-lg border font-mono-num ${
                isExtendedPhysics
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-[#0b0e14] border-[#252e42] text-slate-400'
              }`}
            >
              CSP拡張物理: {isExtendedPhysics ? 'ON (extended-2)' : 'OFF'}
            </span>
            {files['script.lua'] && (
              <button
                type="button"
                onClick={() => setShowLuaPreview((v) => !v)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#1a2233] hover:bg-[#24304a] border border-[#2d3a54] text-cyan-300"
              >
                <Code2 className="w-3.5 h-3.5" />
                {showLuaPreview ? 'script.lua を隠す' : 'script.lua 確認'}
              </button>
            )}
          </div>
        </div>

        {/* 4 Transmission Mode Selector */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5">
          {MODE_CARDS.map((card) => {
            const selected = txDraft.mode === card.id;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => setTxDraft((prev) => ({ ...prev, mode: card.id }))}
                className={`text-left p-3 rounded-xl border transition-all ${
                  selected
                    ? card.id === 'csp_cvt'
                      ? 'bg-emerald-500/15 border-emerald-400 text-white shadow-md shadow-emerald-950/30'
                      : card.id === 'csp_at'
                        ? 'bg-cyan-500/15 border-cyan-400 text-white shadow-md shadow-cyan-950/30'
                        : 'bg-rose-500/15 border-rose-400 text-white'
                    : 'bg-[#0b0e14] border-[#242e42] text-slate-300 hover:border-slate-500'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-bold">{card.title}</span>
                  <span className="text-[9px] font-mono-num px-1.5 py-0.5 rounded bg-black/40 border border-white/10 text-slate-300">
                    {card.badge}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-snug">{card.desc}</p>
              </button>
            );
          })}
        </div>

        {/* One-Click AT / CVT Presets */}
        <div className="bg-[#0b0e14] border border-[#222c40] rounded-xl p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300 mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            ワンクリック CSP AT / CVT プリセット (ギア比＋Luaスクリプトを即適用)
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {CSP_TRANSMISSION_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleApplyPreset(preset)}
                className="text-left p-2.5 rounded-lg bg-[#121826] hover:bg-[#1a2438] border border-[#27334a] hover:border-cyan-400/60 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-100">{preset.name}</span>
                  <span
                    className={`text-[10px] font-mono-num px-1.5 py-0.5 rounded ${
                      preset.mode === 'csp_cvt'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-cyan-500/20 text-cyan-300'
                    }`}
                  >
                    {preset.badge}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">{preset.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Detailed Parameter Panel for Selected Mode */}
        {txDraft.mode === 'csp_at' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 bg-[#0e131d] border border-cyan-500/25 rounded-xl p-3.5">
            <div className="space-y-3">
              <div className="text-xs font-semibold text-cyan-300 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5" />
                AT ギア段数・シフト特性
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">AT 段数 (4〜10速)</label>
                <div className="grid grid-cols-7 gap-1">
                  {[4, 5, 6, 7, 8, 9, 10].map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() =>
                        setTxDraft((prev) => ({ ...prev, at: { ...prev.at, gears: g } }))
                      }
                      className={`py-1 rounded text-xs font-mono-num border ${
                        txDraft.at.gears === g
                          ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200'
                          : 'bg-[#0b0e14] border-[#252e42] text-slate-400'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>
              <NumericControl
                label="変速時間 (SHIFT_TIME)"
                value={txDraft.at.shiftTimeSec}
                min={0.08}
                max={0.45}
                step={0.01}
                decimals={2}
                unit="秒"
                accent="cyan"
                onChange={(v) =>
                  setTxDraft((prev) => ({ ...prev, at: { ...prev.at, shiftTimeSec: v } }))
                }
              />
              <NumericControl
                label="トルコンロックアップ許容スリップ (LOCK_RATIO_GAP)"
                value={txDraft.at.lockRatioGap}
                min={0.05}
                max={0.35}
                step={0.01}
                decimals={2}
                hint="小さいほどダイレクト感強 / 大きいほど滑らか"
                accent="cyan"
                onChange={(v) =>
                  setTxDraft((prev) => ({ ...prev, at: { ...prev.at, lockRatioGap: v } }))
                }
              />
            </div>

            <div className="space-y-3">
              <div className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5" />
                シフトマップ &amp; キックダウン
              </div>
              <NumericControl
                label="低負荷エコ シフトアップ回転率"
                value={Math.round(txDraft.at.ecoUpshiftPct * 100)}
                min={30}
                max={65}
                step={1}
                unit="%"
                hint={`約 ${Math.round(metrics.maxRpm * txDraft.at.ecoUpshiftPct)} RPM`}
                accent="emerald"
                onChange={(v) =>
                  setTxDraft((prev) => ({ ...prev, at: { ...prev.at, ecoUpshiftPct: v / 100 } }))
                }
              />
              <NumericControl
                label="全開スポーツ シフトアップ回転率"
                value={Math.round(txDraft.at.sportUpshiftPct * 100)}
                min={82}
                max={98}
                step={1}
                unit="%"
                hint={`約 ${Math.round(metrics.maxRpm * txDraft.at.sportUpshiftPct)} RPM`}
                accent="rose"
                onChange={(v) =>
                  setTxDraft((prev) => ({ ...prev, at: { ...prev.at, sportUpshiftPct: v / 100 } }))
                }
              />
              <NumericControl
                label="シフトダウン回転率 / キックダウン開度"
                value={Math.round(txDraft.at.kickdownGasThreshold * 100)}
                min={68}
                max={98}
                step={1}
                unit="% Gas"
                hint={`ダウン基準: ${Math.round(metrics.maxRpm * txDraft.at.downshiftPct)} RPM`}
                accent="amber"
                onChange={(v) =>
                  setTxDraft((prev) => ({
                    ...prev,
                    at: { ...prev.at, kickdownGasThreshold: v / 100 },
                  }))
                }
              />
            </div>

            <div className="space-y-3 flex flex-col justify-between">
              <div className="space-y-2.5">
                <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-cyan-400" />
                  クリープ・CSP連携オプション
                </div>
                <NumericControl
                  label="クリープ現象の強さ (ブレーキOFF微前進)"
                  value={Math.round(txDraft.at.creepStrength * 100)}
                  min={0}
                  max={100}
                  step={5}
                  unit="%"
                  accent="cyan"
                  onChange={(v) =>
                    setTxDraft((prev) => ({ ...prev, at: { ...prev.at, creepStrength: v / 100 } }))
                  }
                />
                <label className="flex items-center justify-between bg-[#0b0e14] border border-[#252e42] rounded-lg px-3 py-2 text-[11px] cursor-pointer">
                  <span className="text-slate-300">CSP v0.3+ 公式ATモジュール優先 (互換フォールバック付)</span>
                  <input
                    type="checkbox"
                    checked={txDraft.at.useCspSharedAtModule}
                    onChange={(e) =>
                      setTxDraft((prev) => ({
                        ...prev,
                        at: { ...prev.at, useCspSharedAtModule: e.target.checked },
                      }))
                    }
                    className="accent-cyan-500 w-4 h-4 shrink-0"
                  />
                </label>
                <label className="flex items-center justify-between bg-[#0b0e14] border border-[#252e42] rounded-lg px-3 py-2 text-[11px] cursor-pointer">
                  <span className="text-slate-300">Extra A: スポーツモード / Extra B: パドルMモード</span>
                  <input
                    type="checkbox"
                    checked={txDraft.at.allowManualOverride}
                    onChange={(e) =>
                      setTxDraft((prev) => ({
                        ...prev,
                        at: { ...prev.at, allowManualOverride: e.target.checked },
                      }))
                    }
                    className="accent-cyan-500 w-4 h-4 shrink-0"
                  />
                </label>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() =>
                    applyTxConfig(txDraft, false, `CSP ${txDraft.at.gears}速AT設定を反映しました`)
                  }
                  className="flex-1 flex items-center justify-center gap-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs py-2 rounded-lg"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  CSP ATを適用
                </button>
                <button
                  type="button"
                  onClick={() =>
                    applyTxConfig(
                      txDraft,
                      true,
                      `CSP ${txDraft.at.gears}速AT + 推奨ギア比を生成しました`
                    )
                  }
                  className="px-3 py-2 rounded-lg bg-[#1a2438] hover:bg-[#24324e] border border-cyan-500/40 text-cyan-200 text-xs font-medium"
                  title="段数に合わせてAT用のギア比とファイナルも自動生成します"
                >
                  ギア比も再生成
                </button>
              </div>
            </div>
          </div>
        )}

        {txDraft.mode === 'csp_cvt' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 bg-[#0e131d] border border-emerald-500/25 rounded-xl p-3.5">
            <div className="space-y-3">
              <div className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5" />
                CVT プーリーレシオ幅 &amp; 解像度
              </div>
              <NumericControl
                label="発進側 Low レシオ (MAX_RATIO)"
                value={txDraft.cvt.maxRatio}
                min={1.8}
                max={4.2}
                step={0.05}
                decimals={2}
                accent="emerald"
                onChange={(v) =>
                  setTxDraft((prev) => ({ ...prev, cvt: { ...prev.cvt, maxRatio: v } }))
                }
              />
              <NumericControl
                label="巡航側 OD レシオ (MIN_RATIO)"
                value={txDraft.cvt.minRatio}
                min={0.35}
                max={0.85}
                step={0.01}
                decimals={2}
                accent="emerald"
                onChange={(v) =>
                  setTxDraft((prev) => ({ ...prev, cvt: { ...prev.cvt, minRatio: v } }))
                }
              />
              <NumericControl
                label="ファイナルギア比 (FINAL)"
                value={txDraft.cvt.finalRatio}
                min={3.0}
                max={6.2}
                step={0.05}
                decimals={2}
                accent="cyan"
                onChange={(v) =>
                  setTxDraft((prev) => ({ ...prev, cvt: { ...prev.cvt, finalRatio: v } }))
                }
              />
              <NumericControl
                label="仮想プーリー段数 (滑らかさ)"
                value={txDraft.cvt.virtualSteps}
                min={8}
                max={16}
                step={1}
                unit="段"
                hint={`比幅 ${(txDraft.cvt.maxRatio / Math.max(0.1, txDraft.cvt.minRatio)).toFixed(2)}倍 / 1段あたり約 ${Math.round((Math.pow(txDraft.cvt.maxRatio / Math.max(0.1, txDraft.cvt.minRatio), 1 / Math.max(1, txDraft.cvt.virtualSteps - 1)) - 1) * 100)}%`}
                accent="amber"
                onChange={(v) =>
                  setTxDraft((prev) => ({ ...prev, cvt: { ...prev.cvt, virtualSteps: Math.round(v) } }))
                }
              />
            </div>

            <div className="space-y-3">
              <div className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5" />
                目標回転数マップ (スロットル → 維持RPM)
              </div>
              <NumericControl
                label="巡航 目標RPM (アクセル微開)"
                value={txDraft.cvt.cruiseRpm}
                min={1200}
                max={Math.max(2500, Math.round(metrics.maxRpm * 0.55))}
                step={100}
                unit="RPM"
                accent="cyan"
                onChange={(v) =>
                  setTxDraft((prev) => ({ ...prev, cvt: { ...prev.cvt, cruiseRpm: Math.round(v) } }))
                }
              />
              <NumericControl
                label="中負荷 目標RPM (アクセル50%)"
                value={txDraft.cvt.midLoadRpm}
                min={2000}
                max={Math.max(3500, Math.round(metrics.maxRpm * 0.85))}
                step={100}
                unit="RPM"
                accent="amber"
                onChange={(v) =>
                  setTxDraft((prev) => ({ ...prev, cvt: { ...prev.cvt, midLoadRpm: Math.round(v) } }))
                }
              />
              <NumericControl
                label="全開加速 ピーク張り付きRPM (WOT)"
                value={txDraft.cvt.peakPowerRpm}
                min={3200}
                max={Math.round(metrics.maxRpm * 0.97)}
                step={100}
                unit="RPM"
                hint={`最大出力点: ${metrics.peakPowerRpm} RPM 付近を推奨`}
                accent="rose"
                onChange={(v) =>
                  setTxDraft((prev) => ({
                    ...prev,
                    cvt: { ...prev.cvt, peakPowerRpm: Math.round(v) },
                  }))
                }
              />
              {/* Compact CVT RPM Target Curve Preview */}
              <div className="bg-[#080b11] border border-[#222c40] rounded-lg p-2">
                <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                  <span>スロットル開度 → CVT目標回転数プレビュー</span>
                  <span className="font-mono-num text-emerald-300">
                    {cvtPreviewRatios[0]?.toFixed(2)} → {cvtPreviewRatios[cvtPreviewRatios.length - 1]?.toFixed(2)}
                  </span>
                </div>
                <svg viewBox="0 0 280 96" className="w-full h-20">
                  <line x1="16" y1="86" x2="264" y2="86" stroke="#243047" strokeWidth="1" />
                  <line x1="16" y1="14" x2="16" y2="86" stroke="#243047" strokeWidth="1" />
                  <polyline
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={cvtCurvePoints}
                  />
                  <text x="16" y="95" fill="#64748b" fontSize="8">0% Gas</text>
                  <text x="128" y="95" fill="#64748b" fontSize="8">50%</text>
                  <text x="236" y="95" fill="#64748b" fontSize="8">100%</text>
                </svg>
              </div>
            </div>

            <div className="space-y-3 flex flex-col justify-between">
              <div className="space-y-2.5">
                <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-emerald-400" />
                  応答性・エンジンブレーキ・擬似ステップ
                </div>
                <NumericControl
                  label="変速応答スピード (RESPONSE_RATE)"
                  value={Math.round(txDraft.cvt.responseRate * 100)}
                  min={35}
                  max={100}
                  step={5}
                  unit="%"
                  accent="emerald"
                  onChange={(v) =>
                    setTxDraft((prev) => ({
                      ...prev,
                      cvt: { ...prev.cvt, responseRate: v / 100 },
                    }))
                  }
                />
                <NumericControl
                  label="ブレーキ連動 ロー側シフト (エンジンブレーキ)"
                  value={Math.round(txDraft.cvt.engineBrakeGain * 100)}
                  min={0}
                  max={100}
                  step={5}
                  unit="%"
                  accent="amber"
                  onChange={(v) =>
                    setTxDraft((prev) => ({
                      ...prev,
                      cvt: { ...prev.cvt, engineBrakeGain: v / 100 },
                    }))
                  }
                />
                <label className="flex items-center justify-between bg-[#0b0e14] border border-[#252e42] rounded-lg px-3 py-2 text-[11px] cursor-pointer">
                  <span className="text-slate-300">全開時の擬似ステップ変速 (D-Step / スポーツCVT)</span>
                  <input
                    type="checkbox"
                    checked={txDraft.cvt.steppedShiftMode}
                    onChange={(e) =>
                      setTxDraft((prev) => ({
                        ...prev,
                        cvt: { ...prev.cvt, steppedShiftMode: e.target.checked },
                      }))
                    }
                    className="accent-emerald-500 w-4 h-4 shrink-0"
                  />
                </label>
                <div className="text-[10px] text-slate-400 bg-[#0b0e14] border border-[#20293d] rounded-lg p-2 leading-relaxed">
                  ヒント: ゲーム内では <strong>Extra A</strong> でスポーツモード (目標回転数+14%＆ステップ制御) を切替できます。
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  applyTxConfig(
                    txDraft,
                    true,
                    `CSP CVT (${txDraft.cvt.virtualSteps}段仮想プーリー + script.lua) を適用しました`
                  )
                }
                className="w-full flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs py-2.5 rounded-lg shadow-md shadow-emerald-950/30"
              >
                <CheckCircle2 className="w-4 h-4" />
                CSP CVT を車両データへ反映
              </button>
            </div>
          </div>
        )}

        {(txDraft.mode === 'manual' || txDraft.mode === 'sequential') &&
          txDraft.mode !== parsedTx.mode && (
            <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0e131d] border border-rose-500/30 rounded-xl p-3 text-xs">
              <span className="text-slate-200">
                トランスミッションを{' '}
                <strong>{txDraft.mode === 'manual' ? '標準 MT (マニュアル)' : 'シーケンシャル / DCT'}</strong>{' '}
                へ切り替えます（CSP AT/CVT スクリプトブロックは安全に解除されます）。
              </span>
              <button
                type="button"
                onClick={() =>
                  applyTxConfig(
                    txDraft,
                    false,
                    txDraft.mode === 'manual'
                      ? '標準 MT (マニュアル) に切り替えました'
                      : 'シーケンシャル / DCT に切り替えました'
                  )
                }
                className="bg-rose-600 hover:bg-rose-500 text-white font-semibold px-4 py-1.5 rounded-lg"
              >
                この方式を適用
              </button>
            </div>
          )}

        {showLuaPreview && files['script.lua'] && (
          <div className="bg-[#080b11] border border-[#243047] rounded-xl p-3">
            <div className="text-[11px] font-mono-num text-cyan-300 mb-1.5">
              data/script.lua (CSP Extended Physics 自動生成プレビュー)
            </div>
            <pre className="text-[11px] font-mono-num text-slate-300 overflow-x-auto max-h-56 overflow-y-auto whitespace-pre">
              {files['script.lua']}
            </pre>
          </div>
        )}
      </div>

      {/* Live Gear Chart */}
      <div className="bg-[#121722] border border-[#242e42] rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Cog className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-slate-100">ギア比 &amp; 速度シミュレーション</h3>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={() => applyGearStyle('close')}
              className="bg-[#1a2233] hover:bg-[#253149] border border-[#2d3a54] px-2.5 py-1 rounded-lg text-amber-300"
            >
              クロスミッション化
            </button>
            <button
              onClick={() => applyGearStyle('balanced')}
              className="bg-[#1a2233] hover:bg-[#253149] border border-[#2d3a54] px-2.5 py-1 rounded-lg text-slate-200"
            >
              バランス標準
            </button>
            <button
              onClick={() => applyGearStyle('topspeed')}
              className="bg-[#1a2233] hover:bg-[#253149] border border-[#2d3a54] px-2.5 py-1 rounded-lg text-cyan-300"
            >
              最高速ロング仕様
            </button>
          </div>
        </div>
        <GearChart
          gears={metrics.gears}
          maxRpm={metrics.maxRpm}
          idleRpm={metrics.idleRpm}
          height={250}
        />
      </div>

      {/* Drive Type + Final + Gear Count Settings (Detachable as Settings Only!) */}
      <DetachablePanel
        panelId="drivetrain_settings_only"
        title="駆動方式・ギア比・LSD・クラッチ設定"
        subtitle={`${driveType} / ${gearCount}速 / Final ${finalRatio}`}
        role="settings"
        dockedClassName="bg-[#121722] border border-[#242e42] rounded-xl overflow-hidden"
        popoutSize={{ width: 720, height: 820 }}
      >
        <div className="p-4 overflow-y-auto flex-1 bg-[#0e131d]">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="bg-[#121722] border border-[#242e42] rounded-xl p-4 space-y-4">
              <h3 className="text-sm font-semibold text-slate-100">駆動方式 &amp; ギアボックス</h3>

              <div>
                <label className="text-xs text-slate-400 block mb-1.5">駆動方式 (TRACTION / TYPE)</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['RWD', 'FWD', 'AWD'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => handleSetDriveType(t)}
                      className={`py-2 rounded-lg text-xs font-semibold border transition-colors ${
                        driveType === t
                          ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                          : 'bg-[#0b0e14] border-[#252e42] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {driveType === 'AWD' && (
                <NumericControl
                  label="AWD フロント駆動配分 (FRONT_SHARE)"
                  value={awdFrontShare}
                  min={5}
                  max={65}
                  step={1}
                  unit="%"
                  accent="cyan"
                  onChange={(v) => updateDt('AWD', 'FRONT_SHARE', Math.round(v))}
                />
              )}

              <div>
                <label className="text-xs text-slate-400 block mb-1.5">前進ギア段数 (COUNT)</label>
                <div className="grid grid-cols-7 gap-1">
                  {[4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <button
                      key={n}
                      onClick={() => handleSetGearCount(n)}
                      className={`py-1.5 rounded-lg text-xs font-mono-num border ${
                        gearCount === n
                          ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                          : 'bg-[#0b0e14] border-[#252e42] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                {gearCount > 10 && (
                  <p className="text-[10px] text-emerald-300 mt-1">
                    現在 CSP CVT 用 {gearCount}段仮想プーリー構成が適用されています
                  </p>
                )}
              </div>

              <NumericControl
                label="ファイナルギア比 (FINAL)"
                value={finalRatio}
                min={2.2}
                max={6.5}
                step={0.01}
                decimals={3}
                hint="大きいほど加速重視 / 小さいほど最高速"
                accent="rose"
                onChange={(v) => updateDt('GEARS', 'FINAL', v.toFixed(3))}
              />

              <NumericControl
                label="リバースギア比 (GEAR_R)"
                value={reverseRatio}
                min={1.5}
                max={5.5}
                step={0.05}
                decimals={3}
                onChange={(v) => updateDt('GEARS', 'GEAR_R', (-Math.abs(v)).toFixed(3))}
              />
            </div>

            {/* Individual Gear Ratios */}
            <div className="bg-[#121722] border border-[#242e42] rounded-xl p-4 space-y-2.5">
              <h3 className="text-sm font-semibold text-slate-100">各ギア比チューニング</h3>
              <div className="space-y-2.5 max-h-[430px] overflow-y-auto pr-1">
                {metrics.gears.map((g) => (
                  <NumericControl
                    key={g.gear}
                    label={`${g.gear}速 (GEAR_${g.gear})`}
                    value={g.ratio}
                    min={0.35}
                    max={5.6}
                    step={0.01}
                    decimals={3}
                    hint={`Max ${g.maxSpeedKmh} km/h`}
                    accent="amber"
                    onChange={(v) => updateDt('GEARS', `GEAR_${g.gear}`, v.toFixed(3))}
                  />
                ))}
              </div>
            </div>

            {/* Differential & Clutch */}
            <div className="bg-[#121722] border border-[#242e42] rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-semibold text-slate-100">LSD &amp; シフト・クラッチ</h3>

              <NumericControl
                label="LSD 加速側ロック率 (POWER)"
                value={Math.round(lsdPower * 100)}
                min={0}
                max={100}
                step={1}
                unit="%"
                hint="ドリフトは 80~100% 推奨"
                accent="rose"
                onChange={(v) => updateDt('DIFFERENTIAL', 'POWER', (v / 100).toFixed(2))}
              />
              <NumericControl
                label="LSD 減速側ロック率 (COAST)"
                value={Math.round(lsdCoast * 100)}
                min={0}
                max={100}
                step={1}
                unit="%"
                hint="2WayならPOWERと同等"
                accent="amber"
                onChange={(v) => updateDt('DIFFERENTIAL', 'COAST', (v / 100).toFixed(2))}
              />
              <NumericControl
                label="LSD プリロード (PRELOAD)"
                value={lsdPreload}
                min={0}
                max={250}
                step={5}
                unit="Nm"
                accent="cyan"
                onChange={(v) => updateDt('DIFFERENTIAL', 'PRELOAD', Math.round(v))}
              />

              <div className="border-t border-[#222b3e] pt-3 space-y-3">
                <NumericControl
                  label="シフトアップ時間 (CHANGE_UP_TIME)"
                  value={changeUp}
                  min={10}
                  max={350}
                  step={5}
                  unit="ms"
                  accent="emerald"
                  onChange={(v) => updateDt('GEARBOX', 'CHANGE_UP_TIME', Math.round(v))}
                />
                <NumericControl
                  label="シフトダウン時間 (CHANGE_DN_TIME)"
                  value={changeDn}
                  min={10}
                  max={350}
                  step={5}
                  unit="ms"
                  accent="emerald"
                  onChange={(v) => updateDt('GEARBOX', 'CHANGE_DN_TIME', Math.round(v))}
                />
                <NumericControl
                  label="クラッチ最大トルク (MAX_TORQUE)"
                  value={clutchMax}
                  min={150}
                  max={2500}
                  step={25}
                  unit="Nm"
                  hint={`推奨: ${Math.round((metrics.combinedPeakTorqueNm ?? metrics.peakTorqueNm) * 1.35)} Nm 以上`}
                  onChange={(v) => updateDt('CLUTCH', 'MAX_TORQUE', Math.round(v))}
                />
                <label className="flex items-center justify-between bg-[#0b0e14] border border-[#252e42] rounded-lg px-3 py-2 text-xs cursor-pointer">
                  <span className="text-slate-300">Hパターンシフター対応 (SUPPORTS_SHIFTER)</span>
                  <input
                    type="checkbox"
                    checked={supportsShifter === 1}
                    onChange={(e) => updateDt('GEARBOX', 'SUPPORTS_SHIFTER', e.target.checked ? 1 : 0)}
                    className="accent-rose-500 w-4 h-4"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      </DetachablePanel>
    </div>
  );
};
