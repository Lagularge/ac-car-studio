import React, { useEffect, useMemo, useState } from 'react';
import {
  BatteryCharging,
  CheckCircle2,
  Cpu,
  Flame,
  Gauge,
  Power,
  RotateCcw,
  Sparkles,
  Trash2,
  Zap,
} from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { CarPhysicsMetrics } from '../../types/ac';
import {
  HYBRID_PRESETS,
  applyHybridSystemToFiles,
  computeDischargeTimeMs,
  generateMotorTorqueLut,
  generateRegenCoastLut,
  parseHybridSystemFromFiles,
  type HybridDriveLayout,
  type HybridSystemConfig,
} from '../../utils/cspPowertrain';
import { NumericControl } from '../ui/NumericControl';

interface HybridTabProps {
  files: Record<string, string>;
  metrics: CarPhysicsMetrics;
  onReplaceAllFiles: (nextFiles: Record<string, string>, toastMsg: string) => void;
}

export const HybridTab: React.FC<HybridTabProps> = ({ files, metrics, onReplaceAllFiles }) => {
  const parsed = useMemo(
    () => parseHybridSystemFromFiles(files, metrics.maxRpm),
    [files, metrics.maxRpm]
  );

  const [draft, setDraft] = useState<HybridSystemConfig>(parsed);

  useEffect(() => {
    setDraft(parsed);
  }, [parsed]);

  const motorPs = Math.round(draft.motorPeakKw * 1.3596216);
  const dischargeSec = (
    computeDischargeTimeMs(draft.batteryCapacityKwh, draft.motorPeakKw) / 1000
  ).toFixed(1);

  // Live preview curves combining current ICE dyno curve + draft electric motor & regen LUTs
  const previewCurves = useMemo(() => {
    const motorLut = generateMotorTorqueLut(
      draft.motorPeakKw,
      draft.motorPeakTorqueNm,
      draft.motorMaxRpm
    );
    const regenLut = generateRegenCoastLut(
      draft.coastRegenTorqueNm,
      draft.regenMaxKw,
      draft.motorMaxRpm
    );

    const interp = (pts: Array<{ rpm: number; torque: number }>, rpm: number) => {
      if (pts.length === 0) return 0;
      if (rpm <= pts[0].rpm) return pts[0].torque;
      if (rpm >= pts[pts.length - 1].rpm) return pts[pts.length - 1].torque;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        if (rpm >= a.rpm && rpm <= b.rpm) {
          const span = b.rpm - a.rpm;
          return span > 0 ? a.torque + ((b.torque - a.torque) * (rpm - a.rpm)) / span : a.torque;
        }
      }
      return 0;
    };

    const combinedSeries = metrics.dynoCurve.map((pt) => {
      const mTq = interp(motorLut, pt.rpm);
      const mPs = ((mTq * pt.rpm) / 9549.2966) * 1.3596216;
      const rTq = interp(regenLut, pt.rpm);
      return {
        rpm: pt.rpm,
        icePs: Math.round(pt.totalPowerPs),
        motorPs: Math.round(mPs),
        combinedPs: Math.round(pt.totalPowerPs + mPs),
        iceTq: Math.round(pt.totalTorqueNm),
        motorTq: Math.round(mTq),
        combinedTq: Math.round(pt.totalTorqueNm + mTq),
        regenTq: Math.round(rTq),
      };
    });

    let estPeakCombinedPs = 0;
    let estPeakCombinedTq = 0;
    for (const row of combinedSeries) {
      if (row.combinedPs > estPeakCombinedPs) estPeakCombinedPs = row.combinedPs;
      if (row.combinedTq > estPeakCombinedTq) estPeakCombinedTq = row.combinedTq;
    }

    return { combinedSeries, estPeakCombinedPs, estPeakCombinedTq };
  }, [draft, metrics.dynoCurve]);

  const handleApply = (cfg: HybridSystemConfig, label?: string) => {
    const nextFiles = applyHybridSystemToFiles(files, cfg);
    onReplaceAllFiles(
      nextFiles,
      label ??
        (cfg.enabled
          ? `ハイブリッドシステム (${cfg.motorPeakKw} kW / 回生 ${cfg.regenMaxKw} kW) を適用しました`
          : 'ハイブリッドシステム (ers.ini / モーター・回生) を解除しました')
    );
  };

  const handleApplyPreset = (presetIdx: number) => {
    const preset = HYBRID_PRESETS[presetIdx];
    if (!preset) return;
    const cfg = preset.build(metrics.maxRpm);
    setDraft(cfg);
    handleApply(cfg, `ハイブリッド「${preset.name}」を適用しました`);
  };

  const updateDraft = (patch: Partial<HybridSystemConfig>) => {
    setDraft((prev) => ({ ...prev, presetId: 'custom', ...patch }));
  };

  return (
    <div className="space-y-5">
      {/* Header Banner + Status */}
      <div className="bg-[#121722] border border-emerald-500/30 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center text-white shadow-lg shadow-emerald-950/40">
            <BatteryCharging className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-white">
                ハイブリッド化 (駆動モーター &amp; 回生ブレーキ)
              </h2>
              <span
                className={`text-[10px] font-mono-num px-2.5 py-0.5 rounded-full border ${
                  parsed.enabled
                    ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
                    : 'bg-slate-800 border-slate-600 text-slate-400'
                }`}
              >
                {parsed.enabled
                  ? `ハイブリッド有効 (+${parsed.motorPeakKw} kW / 回生 ${parsed.regenMaxKw} kW)`
                  : '現在: 純エンジン車 (ERS未使用)'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Assetto Corsa 標準 ERS/KERS (ers.ini・トルク/回生LUT・3段階ドライブモード) + CSP拡張回生ブレンドを一括生成します
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {parsed.enabled && (
            <button
              type="button"
              onClick={() => {
                const off = { ...draft, enabled: false };
                setDraft(off);
                handleApply(off);
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 text-xs font-semibold"
            >
              <Trash2 className="w-3.5 h-3.5" />
              ハイブリッド解除
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              const nextCfg = { ...draft, enabled: true };
              setDraft(nextCfg);
              handleApply(nextCfg);
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-900/30"
          >
            <CheckCircle2 className="w-4 h-4" />
            ハイブリッド設定を車両へ適用
          </button>
        </div>
      </div>

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-[#121722] border border-[#242e42] rounded-xl p-3.5">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>システム合算最大出力 (予測)</span>
            <Flame className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-bold font-mono-num text-emerald-300">
            {previewCurves.estPeakCombinedPs}
            <span className="text-xs font-normal text-slate-400 ml-1">PS</span>
          </div>
          <div className="text-[11px] text-slate-400 font-mono-num mt-0.5">
            ICE {Math.round(metrics.peakPowerPs)} PS + モーター {motorPs} PS ({draft.motorPeakKw} kW)
          </div>
        </div>

        <div className="bg-[#121722] border border-[#242e42] rounded-xl p-3.5">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>システム合算最大トルク</span>
            <Zap className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-xl font-bold font-mono-num text-cyan-300">
            {previewCurves.estPeakCombinedTq}
            <span className="text-xs font-normal text-slate-400 ml-1">Nm</span>
          </div>
          <div className="text-[11px] text-slate-400 font-mono-num mt-0.5">
            0回転即時モーター +{draft.motorPeakTorqueNm} Nm
          </div>
        </div>

        <div className="bg-[#121722] border border-[#242e42] rounded-xl p-3.5">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>バッテリー実効容量 / 放電時間</span>
            <BatteryCharging className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl font-bold font-mono-num text-amber-300">
            {draft.batteryCapacityKwh.toFixed(1)}
            <span className="text-xs font-normal text-slate-400 ml-1">kWh</span>
          </div>
          <div className="text-[11px] text-slate-400 font-mono-num mt-0.5">
            全開連続放電: 約 {dischargeSec} 秒
          </div>
        </div>

        <div className="bg-[#121722] border border-[#242e42] rounded-xl p-3.5">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>回生ブレーキ能力</span>
            <RotateCcw className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-xl font-bold font-mono-num text-sky-300">
            {draft.regenMaxKw}
            <span className="text-xs font-normal text-slate-400 ml-1">kW</span>
          </div>
          <div className="text-[11px] text-slate-400 font-mono-num mt-0.5">
            アクセルOFF回生 {draft.coastRegenTorqueNm} Nm / 補正{draft.brakeRearCorrection ? 'ON' : 'OFF'}
          </div>
        </div>
      </div>

      {/* 5 One-Click Hybrid Presets */}
      <div className="bg-[#121722] border border-[#242e42] rounded-xl p-4">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300 mb-2.5">
          <Sparkles className="w-3.5 h-3.5" />
          ハイブリッド方式プリセット (ワンクリック適用)
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-2.5">
          {HYBRID_PRESETS.map((preset, idx) => {
            const active = draft.presetId === preset.id && draft.enabled;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleApplyPreset(idx)}
                className={`text-left p-3 rounded-xl border transition-all ${
                  active
                    ? 'bg-emerald-500/15 border-emerald-400 text-white'
                    : 'bg-[#0b0e14] border-[#252e42] hover:border-emerald-400/50 text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="text-[10px] font-mono-num px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                    {preset.badge}
                  </span>
                </div>
                <div className="text-xs font-bold leading-snug">{preset.name}</div>
                <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">{preset.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Live Charts Row: Combined Power + Motor/Regen Torque */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-[#121722] border border-[#242e42] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Gauge className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-slate-100">
              エンジン + 電気モーター システム合算出力カーブ
            </h3>
          </div>
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={previewCurves.combinedSeries} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2738" />
                <XAxis dataKey="rpm" stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 11 }} unit=" PS" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f141f',
                    border: '1px solid #2b354b',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  labelFormatter={(v) => `${v} RPM`}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Line type="monotone" dataKey="combinedPs" name="システム合算 (PS)" stroke="#10b981" strokeWidth={2.6} dot={false} />
                <Line type="monotone" dataKey="icePs" name="エンジン単体 (PS)" stroke="#f43f5e" strokeWidth={2} strokeDasharray="4 3" dot={false} />
                <Line type="monotone" dataKey="motorPs" name="電気モーター単体 (PS)" stroke="#22d3ee" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#121722] border border-[#242e42] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-slate-100">
              モーター駆動トルク &amp; アクセルOFF回生制動トルク (LUT)
            </h3>
          </div>
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={previewCurves.combinedSeries} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2738" />
                <XAxis dataKey="rpm" stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 11 }} unit=" Nm" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f141f',
                    border: '1px solid #2b354b',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  labelFormatter={(v) => `${v} RPM`}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Line type="monotone" dataKey="motorTq" name="モーターアシストトルク (Nm)" stroke="#22d3ee" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="regenTq" name="アクセルOFF回生ドラッグ (Nm)" stroke="#a855f7" strokeWidth={2.3} dot={false} />
                <Line type="monotone" dataKey="combinedTq" name="合算トルク (Nm)" stroke="#f59e0b" strokeWidth={1.6} strokeDasharray="4 3" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Detailed Controls: Electric Motor + Regenerative Braking */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Left: Electric Motor & Battery */}
        <div className="bg-[#121722] border border-[#242e42] rounded-xl p-4 space-y-3.5">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
            <Power className="w-4 h-4" />
            駆動用電気モーター &amp; バッテリー (ers.ini / kers_torque_power.lut)
          </div>

          <NumericControl
            label="モーター最大出力"
            value={draft.motorPeakKw}
            min={10}
            max={450}
            step={5}
            unit="kW"
            hint={`約 ${motorPs} PS (1kW ≈ 1.36 PS)`}
            accent="emerald"
            onChange={(v) => updateDraft({ motorPeakKw: Math.round(v) })}
          />
          <NumericControl
            label="モーター最大トルク (0 RPMから発生)"
            value={draft.motorPeakTorqueNm}
            min={40}
            max={900}
            step={10}
            unit="Nm"
            hint={`基底回転数: 約 ${Math.round((9549.3 * draft.motorPeakKw) / Math.max(1, draft.motorPeakTorqueNm))} RPM まで最大トルク維持`}
            accent="cyan"
            onChange={(v) => updateDraft({ motorPeakTorqueNm: Math.round(v) })}
          />
          <NumericControl
            label="モーター最高回転数"
            value={draft.motorMaxRpm}
            min={5000}
            max={16000}
            step={250}
            unit="RPM"
            accent="amber"
            onChange={(v) => updateDraft({ motorMaxRpm: Math.round(v) })}
          />
          <NumericControl
            label="バッテリー実効容量 (DISCHARGE_TIME算出)"
            value={draft.batteryCapacityKwh}
            min={0.5}
            max={25}
            step={0.1}
            decimals={1}
            unit="kWh"
            hint={`全開放電時間 DISCHARGE_TIME=${computeDischargeTimeMs(draft.batteryCapacityKwh, draft.motorPeakKw)} ms`}
            accent="emerald"
            onChange={(v) => updateDraft({ batteryCapacityKwh: v })}
          />

          <div>
            <label className="text-xs text-slate-400 block mb-1.5">ハイブリッド駆動レイアウト</label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'crank_integrated', label: 'クランク直結' },
                  { id: 'rear_axle', label: 'リアアクスル駆動' },
                  { id: 'awd_front_assist', label: 'AWD フロント補助' },
                ] as Array<{ id: HybridDriveLayout; label: string }>
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => updateDraft({ motorDriveLayout: item.id })}
                  className={`py-2 px-2 rounded-lg text-xs font-medium border ${
                    draft.motorDriveLayout === item.id
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                      : 'bg-[#0b0e14] border-[#252e42] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            <div>
              <label className="text-xs text-slate-400 block mb-1">1周放出制限 (MAX_KJ_PER_LAP)</label>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => updateDraft({ maxKjPerLap: 9999999 })}
                  className={`flex-1 py-1.5 rounded-lg text-[11px] border ${
                    draft.maxKjPerLap >= 1000000
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                      : 'bg-[#0b0e14] border-[#252e42] text-slate-400'
                  }`}
                >
                  ストリート無制限
                </button>
                <button
                  type="button"
                  onClick={() => updateDraft({ maxKjPerLap: 4000 })}
                  className={`flex-1 py-1.5 rounded-lg text-[11px] border ${
                    draft.maxKjPerLap < 1000000
                      ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                      : 'bg-[#0b0e14] border-[#252e42] text-slate-400'
                  }`}
                >
                  レース規定 4MJ
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">初期ERSモード (DEFAULT_CONTROLLER)</label>
              <div className="grid grid-cols-3 gap-1">
                {[
                  { id: 0 as const, label: 'Eco' },
                  { id: 1 as const, label: 'Normal' },
                  { id: 2 as const, label: 'Attack' },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => updateDraft({ defaultModeIndex: m.id })}
                    className={`py-1.5 rounded-lg text-[11px] border ${
                      draft.defaultModeIndex === m.id
                        ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                        : 'bg-[#0b0e14] border-[#252e42] text-slate-400'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <label className="flex items-center justify-between bg-[#0b0e14] border border-[#252e42] rounded-lg px-3 py-2 text-xs cursor-pointer">
            <span className="text-slate-300">Push-to-Pass (KERSオーバーライドボタン有効化)</span>
            <input
              type="checkbox"
              checked={draft.hasPushToPass}
              onChange={(e) => updateDraft({ hasPushToPass: e.target.checked })}
              className="accent-emerald-500 w-4 h-4"
            />
          </label>
        </div>

        {/* Right: Regenerative Braking & CSP Integration */}
        <div className="bg-[#121722] border border-[#242e42] rounded-xl p-4 space-y-3.5">
          <div className="flex items-center gap-2 text-sm font-semibold text-sky-300">
            <RotateCcw className="w-4 h-4" />
            回生ブレーキ &amp; エネルギー回収 (kers_torque_coast.lut / MGU-K・H)
          </div>

          <NumericControl
            label="回生ブレーキ最大回収出力"
            value={draft.regenMaxKw}
            min={10}
            max={300}
            step={5}
            unit="kW"
            hint="ブレーキング・減速時に電気へ戻す最大パワー上限"
            accent="cyan"
            onChange={(v) => updateDraft({ regenMaxKw: Math.round(v) })}
          />
          <NumericControl
            label="ブレーキ回生充電効率 (CHARGE_K)"
            value={Number((draft.regenChargeK * 10000).toFixed(2))}
            min={0.5}
            max={6.0}
            step={0.1}
            decimals={2}
            unit="×10⁻⁴"
            hint={`ers.ini CHARGE_K=${draft.regenChargeK.toFixed(6)} (標準 1.4〜3.4)`}
            accent="emerald"
            onChange={(v) => updateDraft({ regenChargeK: v / 10000 })}
          />
          <NumericControl
            label="アクセルOFF 回生ドラッグトルク (ワンペダル感)"
            value={draft.coastRegenTorqueNm}
            min={0}
            max={220}
            step={5}
            unit="Nm"
            hint="0 Nm=コースティング / 60~120 Nm=強い回生エンジンブレーキ"
            accent="amber"
            onChange={(v) => updateDraft({ coastRegenTorqueNm: Math.round(v) })}
          />
          <NumericControl
            label="MGU-H 排気・ターボ熱回生 ([HEAT] CHARGE_K)"
            value={Number((draft.heatRecoveryK * 10000).toFixed(2))}
            min={0}
            max={2.0}
            step={0.05}
            decimals={2}
            unit="×10⁻⁴"
            hint="0 = MGU-Kのみ / >0 = 高回転排気熱からも自動充電 (F1/LMP1系)"
            accent="rose"
            onChange={(v) => updateDraft({ heatRecoveryK: v / 10000 })}
          />

          <div className="space-y-2 pt-1">
            <label className="flex items-center justify-between bg-[#0b0e14] border border-[#252e42] rounded-lg px-3 py-2 text-xs cursor-pointer">
              <span className="text-slate-300">
                ブレーキバイワイヤ リア配分自動補正 (BRAKE_REAR_CORRECTION)
              </span>
              <input
                type="checkbox"
                checked={draft.brakeRearCorrection}
                onChange={(e) => updateDraft({ brakeRearCorrection: e.target.checked })}
                className="accent-sky-500 w-4 h-4 shrink-0"
              />
            </label>

            <label className="flex items-center justify-between bg-[#0b0e14] border border-[#252e42] rounded-lg px-3 py-2 text-xs cursor-pointer">
              <span className="text-slate-300 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                CSP拡張 スムーズ回生減速ブレンド (data/script.lua 統合)
              </span>
              <input
                type="checkbox"
                checked={draft.evLowSpeedAssist}
                onChange={(e) => updateDraft({ evLowSpeedAssist: e.target.checked })}
                className="accent-cyan-500 w-4 h-4 shrink-0"
              />
            </label>
          </div>

          {/* 3 Cockpit Drive Modes Summary */}
          <div className="bg-[#0b0e14] border border-[#222c40] rounded-xl p-3 space-y-1.5">
            <div className="text-[11px] font-semibold text-slate-200">
              自動生成されるコックピット切替プロファイル (ctrl_ers_0〜2.ini)
            </div>
            <div className="grid grid-cols-3 gap-2 text-[10px]">
              <div className="bg-[#121826] border border-[#243048] rounded-lg p-2">
                <div className="font-bold text-emerald-300">0: Eco / Charge</div>
                <div className="text-slate-400 mt-0.5">放出を抑え充電優先</div>
              </div>
              <div className="bg-[#121826] border border-[#243048] rounded-lg p-2">
                <div className="font-bold text-cyan-300">1: Normal / Hybrid</div>
                <div className="text-slate-400 mt-0.5">アクセル連動アシスト</div>
              </div>
              <div className="bg-[#121826] border border-[#243048] rounded-lg p-2">
                <div className="font-bold text-rose-300">2: Sport / Attack</div>
                <div className="text-slate-400 mt-0.5">全開100%モーター出力</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
