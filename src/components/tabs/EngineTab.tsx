import React, { useState } from 'react';
import { Flame, Plus, Sparkles, Trash2, Wind } from 'lucide-react';
import type { CarPhysicsMetrics, LutPoint } from '../../types/ac';
import {
  getIniNumber,
  hasIniSection,
  parseLut,
  removeIniSection,
  serializeLut,
  setIniValue,
  setIniValues,
} from '../../utils/iniHelpers';
import { getPowerLutFilename } from '../../utils/physicsCalc';
import { DynoChart } from '../charts/DynoChart';
import { DetachablePanel } from '../common/DetachablePanel';
import { NumericControl } from '../ui/NumericControl';

interface EngineTabProps {
  files: Record<string, string>;
  metrics: CarPhysicsMetrics;
  onUpdateFile: (fileName: string, content: string) => void;
}

export const EngineTab: React.FC<EngineTabProps> = ({ files, metrics, onUpdateFile }) => {
  const engineIni = files['engine.ini'] ?? '';
  const lutFile = getPowerLutFilename(engineIni);
  const lutPoints = parseLut(files[lutFile] ?? files['power.lut']);

  const [scalePercent, setScalePercent] = useState(110);
  const [newRpm, setNewRpm] = useState(5000);
  const [newTorque, setNewTorque] = useState(300);

  const limiter = getIniNumber(engineIni, 'ENGINE_DATA', 'LIMITER', 7500);
  const minimum = getIniNumber(engineIni, 'ENGINE_DATA', 'MINIMUM', 900);
  const inertia = getIniNumber(engineIni, 'ENGINE_DATA', 'INERTIA', 0.14);
  const limiterHz = getIniNumber(engineIni, 'ENGINE_DATA', 'LIMITER_HZ', 28);
  const coastTorque = getIniNumber(engineIni, 'COAST_REF', 'TORQUE', 70);

  const hasTurbo0 = hasIniSection(engineIni, 'TURBO_0');
  const maxBoost = getIniNumber(engineIni, 'TURBO_0', 'MAX_BOOST', 0.8);
  const wastegate = getIniNumber(engineIni, 'TURBO_0', 'WASTEGATE', 0.8);
  const refRpm = getIniNumber(engineIni, 'TURBO_0', 'REFERENCE_RPM', 4200);
  const gamma = getIniNumber(engineIni, 'TURBO_0', 'GAMMA', 2.0);
  const lagUp = getIniNumber(engineIni, 'TURBO_0', 'LAG_UP', 0.985);
  const lagDn = getIniNumber(engineIni, 'TURBO_0', 'LAG_DN', 0.96);

  const updateEngine = (section: string, key: string, value: string | number) => {
    onUpdateFile('engine.ini', setIniValue(engineIni, section, key, value));
  };

  const updateLut = (nextPoints: LutPoint[]) => {
    onUpdateFile(lutFile, serializeLut(nextPoints));
  };

  const handleScaleLut = (multiplier: number) => {
    if (lutPoints.length === 0) return;
    const scaled = lutPoints.map((p) => ({
      rpm: p.rpm,
      torque: Math.max(5, Number((p.torque * multiplier).toFixed(1))),
    }));
    updateLut(scaled);
  };

  const handleSmoothLut = () => {
    if (lutPoints.length < 3) return;
    const smoothed = lutPoints.map((p, idx) => {
      if (idx === 0 || idx === lutPoints.length - 1) return p;
      const avg = (lutPoints[idx - 1].torque + p.torque * 2 + lutPoints[idx + 1].torque) / 4;
      return { rpm: p.rpm, torque: Number(avg.toFixed(1)) };
    });
    updateLut(smoothed);
  };

  const handleAddTurbo = () => {
    const updated = setIniValues(engineIni, [
      ['TURBO_0', 'LAG_DN', '0.96'],
      ['TURBO_0', 'LAG_UP', '0.985'],
      ['TURBO_0', 'MAX_BOOST', '0.80'],
      ['TURBO_0', 'WASTEGATE', '0.80'],
      ['TURBO_0', 'DISPLAY_MAX_BOOST', '0.80'],
      ['TURBO_0', 'REFERENCE_RPM', Math.round(limiter * 0.52)],
      ['TURBO_0', 'GAMMA', '2.0'],
      ['TURBO_0', 'COCKPIT_ADJUSTABLE', 1],
    ]);
    onUpdateFile('engine.ini', updated);
  };

  const handleRemoveTurbo = () => {
    onUpdateFile('engine.ini', removeIniSection(engineIni, 'TURBO_0'));
  };

  const handleAddLutPoint = () => {
    const exists = lutPoints.some((p) => Math.abs(p.rpm - newRpm) < 10);
    const next = exists
      ? lutPoints.map((p) => (Math.abs(p.rpm - newRpm) < 10 ? { rpm: newRpm, torque: newTorque } : p))
      : [...lutPoints, { rpm: newRpm, torque: newTorque }];
    updateLut(next);
  };

  return (
    <div className="space-y-5">
      {/* Live Dyno Preview */}
      <div className="bg-[#121722] border border-[#242e42] rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-rose-400" />
            <h3 className="text-sm font-semibold text-slate-100">リアルタイム・エンジンダイノ</h3>
            <span className="text-xs font-mono-num px-2 py-0.5 rounded bg-rose-500/15 text-rose-300">
              {Math.round(metrics.peakPowerPs)} PS @ {metrics.peakPowerRpm} RPM
            </span>
            <span className="text-xs font-mono-num px-2 py-0.5 rounded bg-amber-500/15 text-amber-300">
              {Math.round(metrics.peakTorqueNm)} Nm @ {metrics.peakTorqueRpm} RPM
            </span>
          </div>
          <span className="text-xs text-slate-400 font-mono-num">参照カーブ: {lutFile}</span>
        </div>
        <DynoChart curve={metrics.dynoCurve} height={250} />
      </div>

      {/* Engine Basic + Turbo + Torque LUT Settings (Detachable as Settings Only!) */}
      <DetachablePanel
        panelId="engine_turbo_settings_only"
        title="エンジン・ターボ・トルクカーブ設定"
        subtitle={`${Math.round(metrics.peakPowerPs)} PS / ${Math.round(metrics.peakTorqueNm)} Nm`}
        role="settings"
        dockedClassName="bg-[#121722] border border-[#242e42] rounded-xl overflow-hidden"
        popoutSize={{ width: 680, height: 820 }}
      >
        <div className="p-4 space-y-4 overflow-y-auto flex-1 bg-[#0e131d]">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Engine Core */}
        <div className="bg-[#121722] border border-[#242e42] rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-slate-100">エンジン基本設定 (engine.ini)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <NumericControl
              label="レブリミッター (LIMITER)"
              value={limiter}
              min={4000}
              max={15000}
              step={100}
              unit="RPM"
              onChange={(v) => updateEngine('ENGINE_DATA', 'LIMITER', Math.round(v))}
            />
            <NumericControl
              label="アイドリング回転 (MINIMUM)"
              value={minimum}
              min={500}
              max={3000}
              step={50}
              unit="RPM"
              onChange={(v) => updateEngine('ENGINE_DATA', 'MINIMUM', Math.round(v))}
            />
            <NumericControl
              label="エンジン慣性 (INERTIA)"
              value={inertia}
              min={0.04}
              max={0.40}
              step={0.005}
              decimals={3}
              unit="kg·m²"
              hint="小さいほどレスポンス向上"
              accent="cyan"
              onChange={(v) => updateEngine('ENGINE_DATA', 'INERTIA', v.toFixed(3))}
            />
            <NumericControl
              label="リミッター周波数 (LIMITER_HZ)"
              value={limiterHz}
              min={5}
              max={60}
              step={1}
              unit="Hz"
              hint="レブカットの刻み速度"
              accent="amber"
              onChange={(v) => updateEngine('ENGINE_DATA', 'LIMITER_HZ', Math.round(v))}
            />
            <NumericControl
              label="エンジンブレーキ (COAST TORQUE)"
              value={coastTorque}
              min={10}
              max={250}
              step={5}
              unit="Nm"
              hint="アクセルオフ時の制動トルク"
              accent="emerald"
              onChange={(v) => updateEngine('COAST_REF', 'TORQUE', Math.round(v))}
            />
          </div>
        </div>

        {/* Turbocharger */}
        <div className="bg-[#121722] border border-[#242e42] rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wind className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-slate-100">ターボチャージャー (TURBO_0)</h3>
            </div>
            {hasTurbo0 ? (
              <button
                onClick={handleRemoveTurbo}
                className="flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 px-2.5 py-1 rounded-lg transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                NA化 (ターボ削除)
              </button>
            ) : (
              <button
                onClick={handleAddTurbo}
                className="flex items-center gap-1 text-xs text-cyan-300 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 px-3 py-1 rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                ターボを追加 (ボルトオン)
              </button>
            )}
          </div>

          {hasTurbo0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <NumericControl
                label="最大ブースト (MAX_BOOST)"
                value={maxBoost}
                min={0}
                max={3.5}
                step={0.05}
                decimals={2}
                unit="bar"
                accent="cyan"
                onChange={(v) =>
                  onUpdateFile(
                    'engine.ini',
                    setIniValues(engineIni, [
                      ['TURBO_0', 'MAX_BOOST', v.toFixed(2)],
                      ['TURBO_0', 'DISPLAY_MAX_BOOST', v.toFixed(2)],
                    ])
                  )
                }
              />
              <NumericControl
                label="ウェイストゲート上限"
                value={wastegate}
                min={0}
                max={3.5}
                step={0.05}
                decimals={2}
                unit="bar"
                hint="0でリミット無し"
                accent="cyan"
                onChange={(v) => updateEngine('TURBO_0', 'WASTEGATE', v.toFixed(2))}
              />
              <NumericControl
                label="基準回転数 (REFERENCE_RPM)"
                value={refRpm}
                min={1500}
                max={10000}
                step={100}
                unit="RPM"
                hint="最大ブースト到達目安"
                accent="amber"
                onChange={(v) => updateEngine('TURBO_0', 'REFERENCE_RPM', Math.round(v))}
              />
              <NumericControl
                label="立ち上がり特性 (GAMMA)"
                value={gamma}
                min={0.5}
                max={4.5}
                step={0.1}
                decimals={1}
                hint="小さいほど低回転から過給"
                accent="amber"
                onChange={(v) => updateEngine('TURBO_0', 'GAMMA', v.toFixed(1))}
              />
              <NumericControl
                label="スプールラグ (LAG_UP)"
                value={lagUp}
                min={0.85}
                max={0.999}
                step={0.002}
                decimals={3}
                hint="低いほどレスポンス鋭い"
                onChange={(v) => updateEngine('TURBO_0', 'LAG_UP', v.toFixed(3))}
              />
              <NumericControl
                label="ブースト抜け (LAG_DN)"
                value={lagDn}
                min={0.85}
                max={0.999}
                step={0.002}
                decimals={3}
                onChange={(v) => updateEngine('TURBO_0', 'LAG_DN', v.toFixed(3))}
              />
            </div>
          ) : (
            <div className="bg-[#0b0e14] border border-dashed border-[#2a354d] rounded-lg p-6 text-center text-xs text-slate-400">
              現在この車両は自然吸気 (NA) です。右上の「ターボを追加」からワンクリックで過給機を追加し、ダイノグラフで出力変化を確認できます。
            </div>
          )}
        </div>
      </div>

      {/* Torque Curve LUT Editor */}
      <div className="bg-[#121722] border border-[#242e42] rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              トルクカーブ直接編集 ({lutFile})
            </h3>
            <p className="text-xs text-slate-400">
              NAベース軸出力トルク (Nm)。ターボ車はここに (1 + Boost) 倍が掛けられます。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleScaleLut(0.9)}
              className="text-xs bg-[#1a2233] hover:bg-[#242f46] text-slate-200 px-2.5 py-1.5 rounded-lg border border-[#2d3a54]"
            >
              -10%
            </button>
            <button
              onClick={() => handleScaleLut(1.05)}
              className="text-xs bg-[#1a2233] hover:bg-[#242f46] text-emerald-300 px-2.5 py-1.5 rounded-lg border border-[#2d3a54]"
            >
              +5%
            </button>
            <button
              onClick={() => handleScaleLut(1.15)}
              className="text-xs bg-[#1a2233] hover:bg-[#242f46] text-amber-300 px-2.5 py-1.5 rounded-lg border border-[#2d3a54]"
            >
              +15%
            </button>
            <div className="flex items-center gap-1 bg-[#0b0e14] border border-[#2b354b] rounded-lg px-2 py-1">
              <input
                type="number"
                value={scalePercent}
                onChange={(e) => setScalePercent(Number(e.target.value))}
                className="w-14 bg-transparent text-xs font-mono-num text-right text-slate-100 focus:outline-none"
              />
              <span className="text-xs text-slate-400">%</span>
              <button
                onClick={() => handleScaleLut(scalePercent / 100)}
                className="text-xs bg-rose-600 hover:bg-rose-500 text-white px-2 py-0.5 rounded ml-1"
              >
                倍率適用
              </button>
            </div>
            <button
              onClick={handleSmoothLut}
              className="flex items-center gap-1 text-xs bg-[#1a2233] hover:bg-[#242f46] text-cyan-300 px-2.5 py-1.5 rounded-lg border border-cyan-500/30"
            >
              <Sparkles className="w-3.5 h-3.5" />
              カーブ平滑化
            </button>
          </div>
        </div>

        {/* Add point bar */}
        <div className="flex flex-wrap items-center gap-2 bg-[#0b0e14] border border-[#212a3d] rounded-lg p-2.5 text-xs">
          <span className="text-slate-400">ポイント追加/更新:</span>
          <input
            type="number"
            value={newRpm}
            step={250}
            onChange={(e) => setNewRpm(Number(e.target.value))}
            className="w-24 bg-[#121722] border border-[#2b354b] rounded px-2 py-1 font-mono-num text-slate-100"
            placeholder="RPM"
          />
          <span className="text-slate-500">RPM</span>
          <input
            type="number"
            value={newTorque}
            step={10}
            onChange={(e) => setNewTorque(Number(e.target.value))}
            className="w-24 bg-[#121722] border border-[#2b354b] rounded px-2 py-1 font-mono-num text-slate-100"
            placeholder="Torque"
          />
          <span className="text-slate-500">Nm</span>
          <button
            onClick={handleAddLutPoint}
            className="flex items-center gap-1 bg-rose-600 hover:bg-rose-500 text-white px-3 py-1 rounded-md ml-auto"
          >
            <Plus className="w-3.5 h-3.5" />
            追加
          </button>
        </div>

        {/* Points Grid */}
        <div className="max-h-72 overflow-y-auto border border-[#212a3d] rounded-lg">
          <table className="w-full text-xs">
            <thead className="bg-[#0e131d] sticky top-0 text-slate-400 border-b border-[#242e42]">
              <tr>
                <th className="py-2 px-3 text-left">回転数 (RPM)</th>
                <th className="py-2 px-3 text-left">NAトルク (Nm)</th>
                <th className="py-2 px-3 text-left w-1/2">トルクバー調整</th>
                <th className="py-2 px-3 text-right">NA推定PS</th>
                <th className="py-2 px-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="font-mono-num divide-y divide-[#1a2130]">
              {lutPoints.map((pt, idx) => {
                const naPs = Math.round((pt.torque * pt.rpm) / 7023.5);
                const maxSlider = Math.max(800, Math.round(metrics.peakTorqueNm * 1.5));
                return (
                  <tr key={`${pt.rpm}-${idx}`} className="hover:bg-[#161d2b]">
                    <td className="py-1.5 px-3">
                      <input
                        type="number"
                        value={pt.rpm}
                        step={100}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (!Number.isFinite(v)) return;
                          const copy = [...lutPoints];
                          copy[idx] = { ...copy[idx], rpm: v };
                          updateLut(copy);
                        }}
                        className="w-24 bg-[#0b0e14] border border-[#2b354b] rounded px-2 py-0.5 text-slate-200"
                      />
                    </td>
                    <td className="py-1.5 px-3">
                      <input
                        type="number"
                        value={pt.torque}
                        step={5}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (!Number.isFinite(v)) return;
                          const copy = [...lutPoints];
                          copy[idx] = { ...copy[idx], torque: v };
                          updateLut(copy);
                        }}
                        className="w-24 bg-[#0b0e14] border border-[#2b354b] rounded px-2 py-0.5 text-amber-300"
                      />
                    </td>
                    <td className="py-1.5 px-3">
                      <input
                        type="range"
                        min={0}
                        max={maxSlider}
                        step={1}
                        value={Math.min(maxSlider, Math.max(0, pt.torque))}
                        onChange={(e) => {
                          const copy = [...lutPoints];
                          copy[idx] = { ...copy[idx], torque: Number(e.target.value) };
                          updateLut(copy);
                        }}
                        className="w-full h-1.5 accent-amber-400"
                      />
                    </td>
                    <td className="py-1.5 px-3 text-right text-rose-300">{naPs} PS</td>
                    <td className="py-1.5 px-3 text-right">
                      <button
                        onClick={() => updateLut(lutPoints.filter((_, i) => i !== idx))}
                        className="text-slate-500 hover:text-rose-400 p-1"
                        title="このポイントを削除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
        </div>
      </DetachablePanel>
    </div>
  );
};
