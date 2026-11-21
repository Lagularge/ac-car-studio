import React from 'react';
import { Car, FileJson, RefreshCw } from 'lucide-react';
import type { UiCarJson } from '../../types/ac';
import { getIniNumber, getIniValue, setIniValue } from '../../utils/iniHelpers';
import { NumericControl } from '../ui/NumericControl';

interface CarMetaTabProps {
  files: Record<string, string>;
  uiCarJson: UiCarJson;
  onUpdateFile: (fileName: string, content: string) => void;
  onUpdateUiJson: (next: UiCarJson) => void;
  onSyncUiSpecs: () => void;
}

export const CarMetaTab: React.FC<CarMetaTabProps> = ({
  files,
  uiCarJson,
  onUpdateFile,
  onUpdateUiJson,
  onSyncUiSpecs,
}) => {
  const carIni = files['car.ini'] ?? '';
  const updateCar = (sec: string, key: string, val: string | number) =>
    onUpdateFile('car.ini', setIniValue(carIni, sec, key, val));

  const mass = getIniNumber(carIni, 'BASIC', 'TOTALMASS', 1300);
  const inertia = getIniValue(carIni, 'BASIC', 'INERTIA', '1.75, 1.22, 4.35');
  const screenName = getIniValue(carIni, 'INFO', 'SCREEN_NAME', uiCarJson.name || '');
  const fuel = getIniNumber(carIni, 'FUEL', 'FUEL', 40);
  const maxFuel = getIniNumber(carIni, 'FUEL', 'MAX_FUEL', 60);
  const consumption = getIniNumber(carIni, 'FUEL', 'CONSUMPTION', 0.003);

  const updateUiField = <K extends keyof UiCarJson>(key: K, value: UiCarJson[K]) => {
    onUpdateUiJson({ ...uiCarJson, [key]: value });
  };

  const updateSpec = (key: string, value: string) => {
    onUpdateUiJson({
      ...uiCarJson,
      specs: {
        ...(uiCarJson.specs ?? {}),
        [key]: value,
      },
    });
  };

  return (
    <div className="space-y-5">
      {/* car.ini Basic */}
      <div className="bg-[#121722] border border-[#242e42] rounded-xl p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Car className="w-4 h-4 text-rose-400" />
          <h3 className="text-sm font-semibold text-slate-100">車両基本物理設定 (car.ini)</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          <NumericControl
            label="車両総重量 (TOTALMASS)"
            value={mass}
            min={450}
            max={3500}
            step={5}
            unit="kg"
            hint="ドライバー込み重量 (AC仕様)"
            onChange={(v) => updateCar('BASIC', 'TOTALMASS', Math.round(v))}
          />
          <NumericControl
            label="初期燃料 (FUEL)"
            value={fuel}
            min={5}
            max={200}
            step={1}
            unit="L"
            accent="amber"
            onChange={(v) => updateCar('FUEL', 'FUEL', Math.round(v))}
          />
          <NumericControl
            label="燃料タンク容量 (MAX_FUEL)"
            value={maxFuel}
            min={10}
            max={250}
            step={1}
            unit="L"
            accent="amber"
            onChange={(v) => updateCar('FUEL', 'MAX_FUEL', Math.round(v))}
          />
          <NumericControl
            label="燃費係数 (CONSUMPTION)"
            value={consumption}
            min={0.0005}
            max={0.015}
            step={0.0002}
            decimals={4}
            accent="emerald"
            onChange={(v) => updateCar('FUEL', 'CONSUMPTION', v.toFixed(4))}
          />

          <div className="bg-[#0e131d] border border-[#242e42] rounded-lg p-3">
            <label className="text-xs text-slate-400 block mb-1">
              慣性モーメントボックス (INERTIA: X, Y, Z)
            </label>
            <input
              type="text"
              value={inertia}
              onChange={(e) => updateCar('BASIC', 'INERTIA', e.target.value)}
              className="w-full bg-[#0b0e14] border border-[#2b354b] rounded px-2.5 py-1.5 text-xs font-mono-num text-slate-100 focus:outline-none focus:border-rose-500"
            />
            <span className="text-[10px] text-slate-500 mt-1 block">幅, 高さ, 全長(m) の慣性箱寸法</span>
          </div>

          <div className="bg-[#0e131d] border border-[#242e42] rounded-lg p-3">
            <label className="text-xs text-slate-400 block mb-1">ゲーム内名称 (SCREEN_NAME)</label>
            <input
              type="text"
              value={screenName}
              onChange={(e) => updateCar('INFO', 'SCREEN_NAME', e.target.value)}
              className="w-full bg-[#0b0e14] border border-[#2b354b] rounded px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-rose-500"
            />
          </div>
        </div>
      </div>

      {/* ui_car.json */}
      <div className="bg-[#121722] border border-[#242e42] rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileJson className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-slate-100">
              UIメタデータ &amp; スペック表示 (ui/ui_car.json)
            </h3>
          </div>
          <button
            onClick={onSyncUiSpecs}
            className="flex items-center gap-1.5 text-xs bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 px-3 py-1.5 rounded-lg transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            現在の物理データからスペック・グラフを自動更新
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="text-slate-400 block mb-1">車両表示名 (name)</label>
            <input
              type="text"
              value={uiCarJson.name ?? ''}
              onChange={(e) => updateUiField('name', e.target.value)}
              className="w-full bg-[#0b0e14] border border-[#2b354b] rounded-lg px-3 py-2 text-slate-100"
            />
          </div>
          <div>
            <label className="text-slate-400 block mb-1">ブランド (brand)</label>
            <input
              type="text"
              value={uiCarJson.brand ?? ''}
              onChange={(e) => updateUiField('brand', e.target.value)}
              className="w-full bg-[#0b0e14] border border-[#2b354b] rounded-lg px-3 py-2 text-slate-100"
            />
          </div>
          <div>
            <label className="text-slate-400 block mb-1">クラス (class)</label>
            <select
              value={uiCarJson.class ?? 'street'}
              onChange={(e) => updateUiField('class', e.target.value)}
              className="w-full bg-[#0b0e14] border border-[#2b354b] rounded-lg px-3 py-2 text-slate-100"
            >
              <option value="street">street</option>
              <option value="race">race</option>
              <option value="drift">drift</option>
              <option value="rally">rally</option>
              <option value="open wheel">open wheel</option>
            </select>
          </div>
          <div>
            <label className="text-slate-400 block mb-1">年式 (year)</label>
            <input
              type="number"
              value={uiCarJson.year ?? 2024}
              onChange={(e) => updateUiField('year', Number(e.target.value))}
              className="w-full bg-[#0b0e14] border border-[#2b354b] rounded-lg px-3 py-2 text-slate-100 font-mono-num"
            />
          </div>
          <div>
            <label className="text-slate-400 block mb-1">国 (country)</label>
            <input
              type="text"
              value={uiCarJson.country ?? ''}
              onChange={(e) => updateUiField('country', e.target.value)}
              className="w-full bg-[#0b0e14] border border-[#2b354b] rounded-lg px-3 py-2 text-slate-100"
            />
          </div>
          <div>
            <label className="text-slate-400 block mb-1">制作者 (author)</label>
            <input
              type="text"
              value={uiCarJson.author ?? ''}
              onChange={(e) => updateUiField('author', e.target.value)}
              className="w-full bg-[#0b0e14] border border-[#2b354b] rounded-lg px-3 py-2 text-slate-100"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="text-slate-400 block mb-1">タグ (カンマ区切り)</label>
            <input
              type="text"
              value={(uiCarJson.tags ?? []).join(', ')}
              onChange={(e) =>
                updateUiField(
                  'tags',
                  e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                )
              }
              className="w-full bg-[#0b0e14] border border-[#2b354b] rounded-lg px-3 py-2 text-slate-100"
            />
          </div>
          <div>
            <label className="text-slate-400 block mb-1">説明文 (description)</label>
            <textarea
              rows={2}
              value={uiCarJson.description ?? ''}
              onChange={(e) => updateUiField('description', e.target.value)}
              className="w-full bg-[#0b0e14] border border-[#2b354b] rounded-lg px-3 py-2 text-slate-100"
            />
          </div>
        </div>

        <div className="border-t border-[#222b3e] pt-3">
          <div className="text-xs font-medium text-slate-300 mb-2">Content Manager 表示スペック (specs)</div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2 text-xs">
            {[
              ['bhp', '馬力 (bhp)'],
              ['torque', 'トルク (torque)'],
              ['weight', '車重 (weight)'],
              ['topspeed', '最高速 (topspeed)'],
              ['acceleration', '加速 (0-100)'],
              ['pwratio', 'PWR (pwratio)'],
            ].map(([k, label]) => (
              <div key={k}>
                <label className="text-[11px] text-slate-400 block mb-1">{label}</label>
                <input
                  type="text"
                  value={uiCarJson.specs?.[k] ?? ''}
                  onChange={(e) => updateSpec(k, e.target.value)}
                  className="w-full bg-[#0b0e14] border border-[#2b354b] rounded px-2 py-1.5 font-mono-num text-slate-200"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
