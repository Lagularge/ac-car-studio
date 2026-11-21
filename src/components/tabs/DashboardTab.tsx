import React, { useState } from 'react';
import {
  Activity,
  Flame,
  Gauge,
  RefreshCw,
  Scale,
  Timer,
  Wind,
} from 'lucide-react';
import type { CarPhysicsMetrics, LoadedCarData } from '../../types/ac';
import { DynoChart } from '../charts/DynoChart';
import { GearChart } from '../charts/GearChart';

interface DashboardTabProps {
  car: LoadedCarData;
  metrics: CarPhysicsMetrics;
  onSyncUiSpecs: () => void;
}

export const DashboardTab: React.FC<DashboardTabProps> = ({
  car,
  metrics,
  onSyncUiSpecs,
}) => {
  const [unitMode, setUnitMode] = useState<'ps' | 'bhp'>('ps');

  return (
    <div className="space-y-5">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <div className="bg-[#121722] border border-[#242e42] rounded-xl p-3.5">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>最大出力</span>
            <Flame className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-xl font-bold font-mono-num text-rose-400">
            {unitMode === 'ps'
              ? Math.round(metrics.hasHybrid ? (metrics.combinedPeakPowerPs ?? metrics.peakPowerPs) : metrics.peakPowerPs)
              : Math.round(
                  metrics.hasHybrid
                    ? (metrics.combinedPeakPowerPs ?? metrics.peakPowerPs) * 0.98632
                    : metrics.peakPowerBhp
                )}
            <span className="text-xs font-normal text-slate-400 ml-1">
              {unitMode === 'ps' ? 'PS' : 'BHP'}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 font-mono-num mt-0.5">
            {metrics.hasHybrid
              ? `ICE ${Math.round(metrics.peakPowerPs)} + EV ${Math.round(metrics.motorPeakPs ?? 0)} PS`
              : `@ ${metrics.peakPowerRpm} RPM`}
          </div>
        </div>

        <div className="bg-[#121722] border border-[#242e42] rounded-xl p-3.5">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>最大トルク</span>
            <Activity className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl font-bold font-mono-num text-amber-400">
            {Math.round(metrics.peakTorqueNm)}
            <span className="text-xs font-normal text-slate-400 ml-1">Nm</span>
          </div>
          <div className="text-[11px] text-slate-500 font-mono-num mt-0.5">
            @ {metrics.peakTorqueRpm} RPM
          </div>
        </div>

        <div className="bg-[#121722] border border-[#242e42] rounded-xl p-3.5">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>車重 / PWR</span>
            <Scale className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-bold font-mono-num text-slate-100">
            {Math.round(metrics.massKg)}
            <span className="text-xs font-normal text-slate-400 ml-1">kg</span>
          </div>
          <div className="text-[11px] text-emerald-400 font-mono-num mt-0.5">
            {metrics.powerToWeightKgPerPs} kg/PS
          </div>
        </div>

        <div className="bg-[#121722] border border-[#242e42] rounded-xl p-3.5">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>推定最高速</span>
            <Gauge className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-xl font-bold font-mono-num text-cyan-300">
            {Math.round(metrics.estimatedTopSpeedKmh)}
            <span className="text-xs font-normal text-slate-400 ml-1">km/h</span>
          </div>
          <div className="text-[11px] text-slate-500 font-mono-num mt-0.5">
            ギア上限 {metrics.gears[metrics.gears.length - 1]?.maxSpeedKmh ?? '-'} km/h
          </div>
        </div>

        <div className="bg-[#121722] border border-[#242e42] rounded-xl p-3.5">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>推定 0-100</span>
            <Timer className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-xl font-bold font-mono-num text-purple-300">
            {metrics.estimated0To100Sec}
            <span className="text-xs font-normal text-slate-400 ml-1">sec</span>
          </div>
          <div className="text-[11px] text-slate-500 font-mono-num mt-0.5">
            {metrics.driveType} /{' '}
            {metrics.transmissionMode === 'csp_cvt'
              ? 'CSP CVT'
              : metrics.transmissionMode === 'csp_at'
                ? 'CSP AT'
                : metrics.transmissionMode === 'sequential'
                  ? 'SEQ'
                  : 'MT'}{' '}
            {metrics.hasHybrid ? '• HV' : metrics.hasTurbo ? `• ${metrics.maxBoostBar}bar` : '• NA'}
          </div>
        </div>

        <div className="bg-[#121722] border border-[#242e42] rounded-xl p-3.5">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>前後配分 / Hz</span>
            <Wind className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-xl font-bold font-mono-num text-slate-100">
            {metrics.frontWeightPct}:{Number((100 - metrics.frontWeightPct).toFixed(1))}
          </div>
          <div className="text-[11px] text-sky-400 font-mono-num mt-0.5">
            F {metrics.frontSpringHz}Hz / R {metrics.rearSpringHz}Hz
          </div>
        </div>
      </div>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-[#121722] border border-[#242e42] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">ダイナモ出力・トルク曲線</h3>
              <p className="text-xs text-slate-400">
                power.lut + ターボブースト計算によるリアルタイム推定曲線
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex bg-[#0b0e14] rounded-lg p-0.5 border border-[#252e42] text-xs">
                <button
                  onClick={() => setUnitMode('ps')}
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    unitMode === 'ps' ? 'bg-rose-500 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  PS
                </button>
                <button
                  onClick={() => setUnitMode('bhp')}
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    unitMode === 'bhp' ? 'bg-rose-500 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  BHP
                </button>
              </div>
              <button
                onClick={onSyncUiSpecs}
                className="flex items-center gap-1.5 text-xs bg-[#1c2436] hover:bg-[#253048] text-cyan-300 border border-cyan-500/30 px-2.5 py-1.5 rounded-lg transition-colors"
                title="計算した馬力・トルク・グラフを ui_car.json に反映"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                UIスペック同期
              </button>
            </div>
          </div>
          <DynoChart curve={metrics.dynoCurve} unitMode={unitMode} height={290} />
        </div>

        <div className="bg-[#121722] border border-[#242e42] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">ギア別 車速 vs 回転数マップ</h3>
              <p className="text-xs text-slate-400">
                ファイナル {metrics.finalRatio} / 駆動輪半径 {(metrics.wheelRadiusM * 1000).toFixed(0)}mm / レブ {metrics.maxRpm} RPM
              </p>
            </div>
          </div>
          <GearChart
            gears={metrics.gears}
            maxRpm={metrics.maxRpm}
            idleRpm={metrics.idleRpm}
            height={290}
          />
        </div>
      </div>

      {/* Gear Table + Car Info */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 bg-[#121722] border border-[#242e42] rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-100 mb-3">各ギア到達速度 &amp; シフトポイント分析</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400 border-b border-[#242e42]">
                  <th className="text-left py-2 px-2">ギア</th>
                  <th className="text-right py-2 px-2">ギア比</th>
                  <th className="text-right py-2 px-2">総減速比</th>
                  <th className="text-right py-2 px-2">レブ到達速度</th>
                  <th className="text-right py-2 px-2">シフトアップ後RPM</th>
                  <th className="text-left py-2 px-3 w-40">カバー速度帯</th>
                </tr>
              </thead>
              <tbody className="font-mono-num">
                {metrics.gears.map((g) => {
                  const topSpeed = Math.max(1, metrics.gears[metrics.gears.length - 1]?.maxSpeedKmh ?? 300);
                  const pct = Math.min(100, (g.maxSpeedKmh / topSpeed) * 100);
                  return (
                    <tr key={g.gear} className="border-b border-[#1b2232] hover:bg-[#171e2d]">
                      <td className="py-2 px-2 font-semibold text-slate-200">{g.gear} 速</td>
                      <td className="py-2 px-2 text-right text-slate-300">{g.ratio.toFixed(3)}</td>
                      <td className="py-2 px-2 text-right text-slate-400">
                        {(g.ratio * metrics.finalRatio).toFixed(2)}
                      </td>
                      <td className="py-2 px-2 text-right text-cyan-300 font-semibold">
                        {g.maxSpeedKmh.toFixed(1)} km/h
                      </td>
                      <td className="py-2 px-2 text-right text-amber-300">
                        {g.gear === 1 ? '発進' : `${g.rpmAtShiftFromPrev} RPM`}
                      </td>
                      <td className="py-2 px-3">
                        <div className="w-full bg-[#0b0e14] h-2 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-rose-500 to-amber-400 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-[#121722] border border-[#242e42] rounded-xl p-4 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-100 mb-3">車両データステータス</h3>
            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between py-1 border-b border-[#1d2536]">
                <span className="text-slate-400">フォルダID</span>
                <span className="font-mono-num text-slate-200">{car.summary.id}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#1d2536]">
                <span className="text-slate-400">データソース</span>
                <span
                  className={`px-2 py-0.5 rounded font-medium ${
                    car.loadedFromAcd
                      ? 'bg-amber-500/15 text-amber-300'
                      : 'bg-emerald-500/15 text-emerald-300'
                  }`}
                >
                  {car.loadedFromAcd ? 'data.acd (メモリ復号中)' : 'data/ フォルダ'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#1d2536]">
                <span className="text-slate-400">読み込みファイル数</span>
                <span className="font-mono-num text-slate-200">{Object.keys(car.files).length} files</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#1d2536]">
                <span className="text-slate-400">ブランド / クラス</span>
                <span className="text-slate-200">
                  {car.uiCarJson.brand || '-'} / {car.uiCarJson.class || '-'}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">年式 / 国</span>
                <span className="text-slate-200">
                  {car.uiCarJson.year || '-'} / {car.uiCarJson.country || '-'}
                </span>
              </div>
            </div>
          </div>

          {car.summary.hasDataAcd && car.summary.hasDataFolder && (
            <div className="mt-4 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5 text-[11px] text-amber-200 leading-relaxed">
              <strong>注意:</strong> この車両には <code className="text-amber-100">data/</code> と{' '}
              <code className="text-amber-100">data.acd</code> の両方が存在します。AC本体に変更を確実に反映させるには、保存時に「data.acd も再パック」するか、古い data.acd をバックアップ後に退避してください。
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
