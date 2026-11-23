import React, { useMemo } from 'react';
import {
  Activity,
  BatteryCharging,
  Cog,
  Disc,
  Flame,
  Gauge,
  Scale,
  Sliders,
  Sparkles,
  Timer,
  Wrench,
  Zap,
} from 'lucide-react';
import type { CarPhysicsMetrics } from '../../types/ac';
import { setIniValue } from '../../utils/iniHelpers';
import {
  CSP_TRANSMISSION_PRESETS,
  applyCspTransmissionToFiles,
  createDefaultAtConfig,
  createDefaultCvtConfig,
} from '../../utils/cspPowertrain';
import {
  applySimpleDriveType,
  applySimpleGripTier,
  applySimpleHybridTier,
  applySimplePowerMultiplier,
  applySimpleQuickPackage,
  applySimpleRideHeightDeltaMm,
  applySimpleTurboBoost,
  extractSimpleTuningSnapshot,
  type SimpleGripTierId,
  type SimpleHybridTierId,
  type SimplePackageId,
} from '../../utils/simpleTuning';
import { NumericControl } from '../ui/NumericControl';

interface SimpleTuningTabProps {
  files: Record<string, string>;
  metrics: CarPhysicsMetrics;
  onUpdateFile: (fileName: string, content: string) => void;
  onReplaceAllFiles: (nextFiles: Record<string, string>, toastMsg: string) => void;
  onSwitchToFullMode: () => void;
}

export const SimpleTuningTab: React.FC<SimpleTuningTabProps> = ({
  files,
  metrics,
  onUpdateFile,
  onReplaceAllFiles,
  onSwitchToFullMode,
}) => {
  const snap = useMemo(() => extractSimpleTuningSnapshot(files), [files]);

  const activeGripTier: SimpleGripTierId =
    snap.rearGripDx >= 1.56
      ? 'slick'
      : snap.rearGripDx >= 1.40
        ? 'semislick'
        : snap.rearGripDx >= 1.26
          ? 'sport'
          : 'street';

  const activeHybridTier: SimpleHybridTierId = !metrics.hasHybrid
    ? 'off'
    : (metrics.motorPeakKw ?? 0) >= 170
      ? 'hypercar_ers'
      : (metrics.motorPeakKw ?? 0) >= 80
        ? 'sport_phev'
        : 'mild_48v';

  const displayPs = Math.round(
    metrics.hasHybrid ? (metrics.combinedPeakPowerPs ?? metrics.peakPowerPs) : metrics.peakPowerPs
  );
  const displayNm = Math.round(
    metrics.hasHybrid ? (metrics.combinedPeakTorqueNm ?? metrics.peakTorqueNm) : metrics.peakTorqueNm
  );

  const handleQuickTx = (mode: 'manual' | 'csp_at' | 'csp_cvt') => {
    if (mode === 'manual') {
      const next = applyCspTransmissionToFiles(files, {
        mode: 'manual',
        at: createDefaultAtConfig(),
        cvt: createDefaultCvtConfig(metrics.maxRpm, metrics.idleRpm),
      });
      onReplaceAllFiles(next, 'トランスミッションを標準 MT に変更しました');
      return;
    }
    if (mode === 'csp_at') {
      const p = CSP_TRANSMISSION_PRESETS.find((x) => x.id === 'at_8_sport')!;
      const next = applyCspTransmissionToFiles(
        files,
        {
          mode: 'csp_at',
          at: { ...createDefaultAtConfig(), ...(p.apply(metrics.maxRpm, metrics.idleRpm).at ?? {}) },
          cvt: createDefaultCvtConfig(metrics.maxRpm, metrics.idleRpm),
        },
        { maxRpm: metrics.maxRpm, idleRpm: metrics.idleRpm, regenerateGearRatios: true }
      );
      onReplaceAllFiles(next, 'CSP 8速スポーツ AT を適用しました');
      return;
    }
    const p = CSP_TRANSMISSION_PRESETS.find((x) => x.id === 'cvt_sport')!;
    const next = applyCspTransmissionToFiles(
      files,
      {
        mode: 'csp_cvt',
        at: createDefaultAtConfig(),
        cvt: { ...createDefaultCvtConfig(metrics.maxRpm, metrics.idleRpm), ...(p.apply(metrics.maxRpm, metrics.idleRpm).cvt ?? {}) },
      },
      { maxRpm: metrics.maxRpm, idleRpm: metrics.idleRpm, regenerateGearRatios: true }
    );
    onReplaceAllFiles(next, 'CSP スポーツ CVT (無段変速) を適用しました');
  };

  const quickPackages: Array<{
    id: SimplePackageId;
    title: string;
    badge: string;
    desc: string;
    accent: string;
  }> = [
    {
      id: 'street_comfort',
      title: 'ストリート快適 8AT',
      badge: 'STREET',
      desc: '扱いやすいスポーツタイヤ＋滑らかな8速ATで街乗り・高速巡航を快適に。',
      accent: 'hover:border-cyan-400',
    },
    {
      id: 'drift_fun',
      title: 'ドリフト仕様',
      badge: 'DRIFT',
      desc: 'FR化・2Wayロックデフ・切れ角アップ・フロント鬼キャンで即ドリフト可能。',
      accent: 'hover:border-amber-400',
    },
    {
      id: 'track_grip',
      title: 'サーキット最速仕様',
      badge: 'TRACK',
      desc: '10%軽量化・レーシングスリック・強化ブレーキ・サーキットアライメント。',
      accent: 'hover:border-rose-400',
    },
    {
      id: 'hyper_boost',
      title: 'ハイパーカー覚醒',
      badge: 'HYPER HV',
      desc: 'パワー+25%・ハイブースト・ハイパーカーERSモーター＆スリックを一括適用。',
      accent: 'hover:border-emerald-400',
    },
  ];

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      {/* Live Performance KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-[#121722] border border-[#242e42] rounded-xl p-3.5">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>最大出力</span>
            <Flame className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-xl font-bold font-mono-num text-rose-400">
            {displayPs}
            <span className="text-xs font-normal text-slate-400 ml-1">PS</span>
          </div>
        </div>

        <div className="bg-[#121722] border border-[#242e42] rounded-xl p-3.5">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>最大トルク</span>
            <Activity className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl font-bold font-mono-num text-amber-400">
            {displayNm}
            <span className="text-xs font-normal text-slate-400 ml-1">Nm</span>
          </div>
        </div>

        <div className="bg-[#121722] border border-[#242e42] rounded-xl p-3.5">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>車重</span>
            <Scale className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-bold font-mono-num text-slate-100">
            {snap.massKg}
            <span className="text-xs font-normal text-slate-400 ml-1">kg</span>
          </div>
        </div>

        <div className="bg-[#121722] border border-[#242e42] rounded-xl p-3.5">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>推定 0-100</span>
            <Timer className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-xl font-bold font-mono-num text-purple-300">
            {metrics.estimated0To100Sec}
            <span className="text-xs font-normal text-slate-400 ml-1">秒</span>
          </div>
        </div>

        <div className="bg-[#121722] border border-[#242e42] rounded-xl p-3.5 col-span-2 md:col-span-1">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>推定最高速</span>
            <Gauge className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-xl font-bold font-mono-num text-cyan-300">
            {Math.round(metrics.estimatedTopSpeedKmh)}
            <span className="text-xs font-normal text-slate-400 ml-1">km/h</span>
          </div>
        </div>
      </div>

      {/* 4 One-Click Tuning Packages */}
      <div className="bg-[#121722] border border-[#242e42] rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Sparkles className="w-4 h-4 text-amber-400" />
            ワンクリック簡単パッケージ（迷ったらここから選択）
          </div>
          <span className="text-[11px] text-slate-400">すべて Ctrl+Z で元に戻せます</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {quickPackages.map((pkg) => (
            <button
              key={pkg.id}
              type="button"
              onClick={() =>
                onReplaceAllFiles(
                  applySimpleQuickPackage(files, pkg.id, metrics),
                  `シンプルパッケージ「${pkg.title}」を適用しました`
                )
              }
              className={`text-left p-3.5 rounded-xl bg-[#0b0e14] border border-[#252e42] ${pkg.accent} transition-all hover:-translate-y-0.5`}
            >
              <span className="text-[10px] font-mono-num px-2 py-0.5 rounded bg-white/10 text-slate-200">
                {pkg.badge}
              </span>
              <div className="text-sm font-bold text-white mt-2">{pkg.title}</div>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{pkg.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* 2-Column Easy Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Engine, Turbo, Drivetrain, AT/CVT, Hybrid */}
        <div className="bg-[#121722] border border-[#242e42] rounded-xl p-4 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Zap className="w-4 h-4 text-rose-400" />
            パワー・駆動・ミッション・ハイブリッド
          </h3>

          {/* Power Quick Bump Buttons */}
          <div className="bg-[#0b0e14] border border-[#242e42] rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-200">エンジン出力をまとめて増減</span>
              <span className="font-mono-num text-rose-300">{Math.round(metrics.peakPowerPs)} PS (ICE)</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: '-10%', mult: 0.9, cls: 'text-slate-300' },
                { label: '+10%', mult: 1.1, cls: 'text-cyan-300' },
                { label: '+25%', mult: 1.25, cls: 'text-amber-300' },
                { label: '+50%', mult: 1.5, cls: 'text-rose-300' },
              ].map((b) => (
                <button
                  key={b.label}
                  type="button"
                  onClick={() =>
                    onReplaceAllFiles(
                      applySimplePowerMultiplier(files, b.mult),
                      `エンジン出力を ${b.label} 調整しました`
                    )
                  }
                  className={`py-2 rounded-lg bg-[#141c2c] hover:bg-[#1e2a42] border border-[#293752] text-xs font-bold font-mono-num ${b.cls}`}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          <NumericControl
            label="ターボブースト圧 (0 で NA 化)"
            value={snap.turboBoostBar}
            min={0}
            max={2.2}
            step={0.05}
            decimals={2}
            unit="bar"
            accent="rose"
            onChange={(v) =>
              onReplaceAllFiles(
                applySimpleTurboBoost(files, v, metrics.maxRpm),
                v <= 0.01 ? 'ターボを解除 (NA化)' : `ターボ圧を ${v.toFixed(2)} bar に調整`
              )
            }
          />

          {/* Drive Type */}
          <div>
            <label className="text-xs text-slate-400 block mb-1.5">駆動方式</label>
            <div className="grid grid-cols-3 gap-2">
              {(['RWD', 'FWD', 'AWD'] as const).map((dt) => (
                <button
                  key={dt}
                  type="button"
                  onClick={() =>
                    onReplaceAllFiles(applySimpleDriveType(files, dt), `駆動方式を ${dt} に変更しました`)
                  }
                  className={`py-2 rounded-lg text-xs font-bold border transition-colors ${
                    snap.driveType === dt
                      ? 'bg-rose-500/20 border-rose-400 text-rose-200'
                      : 'bg-[#0b0e14] border-[#252e42] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {dt}
                </button>
              ))}
            </div>
          </div>

          {/* Transmission Mode */}
          <div>
            <label className="text-xs text-slate-400 flex items-center gap-1.5 mb-1.5">
              <Cog className="w-3.5 h-3.5 text-cyan-400" />
              ミッション方式 (MT / CSP AT / CSP CVT)
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'manual', label: 'MT (マニュアル)' },
                  { id: 'csp_at', label: 'CSP 8速 AT' },
                  { id: 'csp_cvt', label: 'CSP CVT' },
                ] as const
              ).map((t) => {
                const active =
                  t.id === 'manual'
                    ? metrics.transmissionMode === 'manual' || metrics.transmissionMode === 'sequential'
                    : metrics.transmissionMode === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleQuickTx(t.id)}
                    className={`py-2 rounded-lg text-xs font-semibold border transition-colors ${
                      active
                        ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                        : 'bg-[#0b0e14] border-[#252e42] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Hybrid Tier */}
          <div>
            <label className="text-xs text-slate-400 flex items-center gap-1.5 mb-1.5">
              <BatteryCharging className="w-3.5 h-3.5 text-emerald-400" />
              ハイブリッドモーター &amp; 回生ブレーキ
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  { id: 'off', label: 'OFF' },
                  { id: 'mild_48v', label: 'マイルド' },
                  { id: 'sport_phev', label: 'スポーツHV' },
                  { id: 'hypercar_ers', label: 'ハイパーERS' },
                ] as Array<{ id: SimpleHybridTierId; label: string }>
              ).map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() =>
                    onReplaceAllFiles(
                      applySimpleHybridTier(files, h.id, metrics.maxRpm),
                      h.id === 'off' ? 'ハイブリッドを OFF にしました' : `ハイブリッド (${h.label}) を適用しました`
                    )
                  }
                  className={`py-2 rounded-lg text-[11px] font-semibold border transition-colors ${
                    activeHybridTier === h.id
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                      : 'bg-[#0b0e14] border-[#252e42] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {h.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Weight, Ride Height, Camber, Grip, Brakes */}
        <div className="bg-[#121722] border border-[#242e42] rounded-xl p-4 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Sliders className="w-4 h-4 text-cyan-400" />
            軽量化・車高・キャンバー・タイヤ・ブレーキ
          </h3>

          <NumericControl
            label="車重 (軽量化すると加速・旋回が向上)"
            value={snap.massKg}
            min={650}
            max={2500}
            step={10}
            unit="kg"
            accent="emerald"
            onChange={(v) =>
              onUpdateFile('car.ini', setIniValue(files['car.ini'] ?? '', 'BASIC', 'TOTALMASS', Math.round(v)))
            }
          />

          <NumericControl
            label="車高 (ロッド長: 小さいほどローダウン)"
            value={snap.frontRodLengthMm}
            min={-25}
            max={100}
            step={2}
            unit="mm"
            accent="cyan"
            onChange={(v) =>
              onReplaceAllFiles(
                applySimpleRideHeightDeltaMm(files, v),
                `前後車高を連動調整しました (${Math.round(v)} mm)`
              )
            }
          />

          <NumericControl
            label="フロントキャンバー角 (マイナスで鬼キャン)"
            value={snap.frontCamberDeg}
            min={-8}
            max={0}
            step={0.2}
            decimals={1}
            unit="°"
            accent="amber"
            onChange={(v) =>
              onUpdateFile(
                'suspensions.ini',
                setIniValue(files['suspensions.ini'] ?? '', 'FRONT', 'STATIC_CAMBER', v.toFixed(2))
              )
            }
          />

          <div>
            <label className="text-xs text-slate-400 flex items-center gap-1.5 mb-1.5">
              <Disc className="w-3.5 h-3.5 text-amber-400" />
              タイヤグリップレベル
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  { id: 'street', label: 'ストリート' },
                  { id: 'sport', label: 'スポーツ' },
                  { id: 'semislick', label: 'Sタイヤ' },
                  { id: 'slick', label: 'スリック' },
                ] as Array<{ id: SimpleGripTierId; label: string }>
              ).map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() =>
                    onReplaceAllFiles(
                      applySimpleGripTier(files, g.id),
                      `タイヤグリップを「${g.label}」に変更しました`
                    )
                  }
                  className={`py-2 rounded-lg text-[11px] font-semibold border transition-colors ${
                    activeGripTier === g.id
                      ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                      : 'bg-[#0b0e14] border-[#252e42] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          <NumericControl
            label="ブレーキ制動力 (MAX_TORQUE)"
            value={snap.brakeTorqueNm}
            min={1200}
            max={5500}
            step={100}
            unit="Nm"
            accent="rose"
            onChange={(v) =>
              onUpdateFile('brakes.ini', setIniValue(files['brakes.ini'] ?? '', 'DATA', 'MAX_TORQUE', Math.round(v)))
            }
          />
        </div>
      </div>

      {/* Footer Bridge to Full Mode */}
      <div className="bg-[#0e1421] border border-[#222f46] rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="text-slate-400">
          サスペンションの詳細減衰力・エンジン音響シミュレーター・生 INI 編集などを行いたい場合は通常モードに切り替えられます。
        </div>
        <button
          type="button"
          onClick={onSwitchToFullMode}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#192338] hover:bg-[#23314d] border border-cyan-500/40 text-cyan-200 font-semibold shrink-0"
        >
          <Wrench className="w-3.5 h-3.5" />
          通常モード（詳細機能すべて表示）に切替
        </button>
      </div>
    </div>
  );
};
