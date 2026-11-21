import React from 'react';
import { Disc, ShieldCheck, Wind } from 'lucide-react';
import {
  getIniNumber,
  getIniSections,
  getIniValue,
  setIniValue,
  setIniValues,
} from '../../utils/iniHelpers';
import { DetachablePanel } from '../common/DetachablePanel';
import { NumericControl } from '../ui/NumericControl';

interface TyresBrakesAeroTabProps {
  files: Record<string, string>;
  onUpdateFile: (fileName: string, content: string) => void;
}

export const TyresBrakesAeroTab: React.FC<TyresBrakesAeroTabProps> = ({
  files,
  onUpdateFile,
}) => {
  const tyresIni = files['tyres.ini'] ?? '';
  const brakesIni = files['brakes.ini'] ?? '';
  const aeroIni = files['aero.ini'] ?? '';
  const elecIni = files['electronics.ini'] ?? '';

  const updateTyres = (section: string, key: string, value: string | number) =>
    onUpdateFile('tyres.ini', setIniValue(tyresIni, section, key, value));
  const updateBrakes = (section: string, key: string, value: string | number) =>
    onUpdateFile('brakes.ini', setIniValue(brakesIni, section, key, value));
  const updateAero = (section: string, key: string, value: string | number) =>
    onUpdateFile('aero.ini', setIniValue(aeroIni, section, key, value));
  const updateElec = (section: string, key: string, value: string | number) =>
    onUpdateFile('electronics.ini', setIniValue(elecIni, section, key, value));

  // Tyres (Primary compound FRONT / REAR)
  const tyreName = getIniValue(tyresIni, 'FRONT', 'NAME', 'Street');
  const fWidth = getIniNumber(tyresIni, 'FRONT', 'WIDTH', 0.235);
  const rWidth = getIniNumber(tyresIni, 'REAR', 'WIDTH', 0.255);
  const fRadius = getIniNumber(tyresIni, 'FRONT', 'RADIUS', 0.316);
  const rRadius = getIniNumber(tyresIni, 'REAR', 'RADIUS', 0.316);
  const fDy = getIniNumber(tyresIni, 'FRONT', 'DY_REF', getIniNumber(tyresIni, 'FRONT', 'DY0', 1.28));
  const fDx = getIniNumber(tyresIni, 'FRONT', 'DX_REF', getIniNumber(tyresIni, 'FRONT', 'DX0', 1.3));
  const rDy = getIniNumber(tyresIni, 'REAR', 'DY_REF', getIniNumber(tyresIni, 'REAR', 'DY0', 1.28));
  const rDx = getIniNumber(tyresIni, 'REAR', 'DX_REF', getIniNumber(tyresIni, 'REAR', 'DX0', 1.3));
  const fPress = getIniNumber(tyresIni, 'FRONT', 'PRESSURE_IDEAL', 33);
  const rPress = getIniNumber(tyresIni, 'REAR', 'PRESSURE_IDEAL', 33);

  // Brakes
  const brakeMaxTorque = getIniNumber(brakesIni, 'DATA', 'MAX_TORQUE', 2600);
  const brakeFrontShare = getIniNumber(brakesIni, 'DATA', 'FRONT_SHARE', 0.65);
  const handbrakeTorque = getIniNumber(brakesIni, 'DATA', 'HANDBRAKE_TORQUE', 1200);
  const brakeCockpitAdj = getIniNumber(brakesIni, 'DATA', 'COCKPIT_ADJUSTABLE', 0);

  // Electronics
  const absPresent = getIniNumber(elecIni, 'ABS', 'PRESENT', 1);
  const absActive = getIniNumber(elecIni, 'ABS', 'ACTIVE', 1);
  const tcPresent = getIniNumber(elecIni, 'TRACTION_CONTROL', 'PRESENT', 1);
  const tcActive = getIniNumber(elecIni, 'TRACTION_CONTROL', 'ACTIVE', 1);

  // Aero wings
  const wingSections = getIniSections(aeroIni).filter((s) => /^WING_\d+$/i.test(s));

  const applyTyrePreset = (name: string, dy: number, dx: number) => {
    onUpdateFile(
      'tyres.ini',
      setIniValues(tyresIni, [
        ['FRONT', 'NAME', name],
        ['REAR', 'NAME', name],
        ['FRONT', 'DY_REF', dy.toFixed(3)],
        ['FRONT', 'DX_REF', dx.toFixed(3)],
        ['FRONT', 'DY0', (dy * 0.96).toFixed(4)],
        ['FRONT', 'DX0', (dx * 0.96).toFixed(4)],
        ['REAR', 'DY_REF', dy.toFixed(3)],
        ['REAR', 'DX_REF', dx.toFixed(3)],
        ['REAR', 'DY0', (dy * 0.96).toFixed(4)],
        ['REAR', 'DX0', (dx * 0.96).toFixed(4)],
      ])
    );
  };

  return (
    <DetachablePanel
      panelId="tyres_brakes_aero_settings_only"
      title="タイヤ・ブレーキ・空力設定"
      subtitle={`${tyreName} / F:${Math.round(fWidth * 1000)}mm R:${Math.round(rWidth * 1000)}mm`}
      role="settings"
      dockedClassName="bg-[#121722] border border-[#242e42] rounded-xl overflow-hidden"
      popoutSize={{ width: 720, height: 840 }}
    >
    <div className="p-4 space-y-5 overflow-y-auto flex-1 bg-[#0e131d]">
      {/* Tyres Section */}
      <div className="bg-[#121722] border border-[#242e42] rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Disc className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-slate-100">
              タイヤコンパウンド &amp; グリップ設定 (tyres.ini)
            </h3>
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs">
            <button
              onClick={() => applyTyrePreset('Street 90s', 1.15, 1.18)}
              className="bg-[#1a2233] hover:bg-[#243047] border border-[#2d3a54] px-2.5 py-1 rounded-lg text-slate-300"
            >
              コンフォート (1.15)
            </button>
            <button
              onClick={() => applyTyrePreset('Street Sport', 1.28, 1.30)}
              className="bg-[#1a2233] hover:bg-[#243047] border border-[#2d3a54] px-2.5 py-1 rounded-lg text-emerald-300"
            >
              ハイグリップ街乗り (1.28)
            </button>
            <button
              onClick={() => applyTyrePreset('Semi-Slick', 1.44, 1.46)}
              className="bg-[#1a2233] hover:bg-[#243047] border border-[#2d3a54] px-2.5 py-1 rounded-lg text-amber-300"
            >
              Sタイヤ / セミスリ (1.44)
            </button>
            <button
              onClick={() => applyTyrePreset('Racing Slick', 1.68, 1.72)}
              className="bg-[#1a2233] hover:bg-[#243047] border border-[#2d3a54] px-2.5 py-1 rounded-lg text-rose-300"
            >
              レーシングスリック (1.68)
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs text-slate-400 shrink-0">コンパウンド表示名:</label>
          <input
            type="text"
            value={tyreName}
            onChange={(e) =>
              onUpdateFile(
                'tyres.ini',
                setIniValues(tyresIni, [
                  ['FRONT', 'NAME', e.target.value],
                  ['REAR', 'NAME', e.target.value],
                ])
              )
            }
            className="w-64 bg-[#0b0e14] border border-[#2b354b] rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-rose-500"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <NumericControl
            label="フロント横グリップ (DY_REF)"
            value={fDy}
            min={0.7}
            max={2.4}
            step={0.02}
            decimals={3}
            accent="rose"
            onChange={(v) =>
              onUpdateFile(
                'tyres.ini',
                setIniValues(tyresIni, [
                  ['FRONT', 'DY_REF', v.toFixed(3)],
                  ['FRONT', 'DY0', (v * 0.96).toFixed(4)],
                ])
              )
            }
          />
          <NumericControl
            label="フロント縦グリップ (DX_REF)"
            value={fDx}
            min={0.7}
            max={2.4}
            step={0.02}
            decimals={3}
            accent="rose"
            onChange={(v) =>
              onUpdateFile(
                'tyres.ini',
                setIniValues(tyresIni, [
                  ['FRONT', 'DX_REF', v.toFixed(3)],
                  ['FRONT', 'DX0', (v * 0.96).toFixed(4)],
                ])
              )
            }
          />
          <NumericControl
            label="リア横グリップ (DY_REF)"
            value={rDy}
            min={0.7}
            max={2.4}
            step={0.02}
            decimals={3}
            accent="cyan"
            onChange={(v) =>
              onUpdateFile(
                'tyres.ini',
                setIniValues(tyresIni, [
                  ['REAR', 'DY_REF', v.toFixed(3)],
                  ['REAR', 'DY0', (v * 0.96).toFixed(4)],
                ])
              )
            }
          />
          <NumericControl
            label="リア縦グリップ (DX_REF)"
            value={rDx}
            min={0.7}
            max={2.4}
            step={0.02}
            decimals={3}
            accent="cyan"
            onChange={(v) =>
              onUpdateFile(
                'tyres.ini',
                setIniValues(tyresIni, [
                  ['REAR', 'DX_REF', v.toFixed(3)],
                  ['REAR', 'DX0', (v * 0.96).toFixed(4)],
                ])
              )
            }
          />
          <NumericControl
            label="フロントタイヤ幅 (WIDTH)"
            value={Math.round(fWidth * 1000)}
            min={155}
            max={385}
            step={5}
            unit="mm"
            onChange={(v) => updateTyres('FRONT', 'WIDTH', (v / 1000).toFixed(3))}
          />
          <NumericControl
            label="リアタイヤ幅 (WIDTH)"
            value={Math.round(rWidth * 1000)}
            min={155}
            max={405}
            step={5}
            unit="mm"
            accent="cyan"
            onChange={(v) => updateTyres('REAR', 'WIDTH', (v / 1000).toFixed(3))}
          />
          <NumericControl
            label="フロント外径半径 (RADIUS)"
            value={Math.round(fRadius * 1000)}
            min={240}
            max={420}
            step={1}
            unit="mm"
            hint="ギア速度計算にも連動"
            accent="amber"
            onChange={(v) => updateTyres('FRONT', 'RADIUS', (v / 1000).toFixed(3))}
          />
          <NumericControl
            label="リア外径半径 (RADIUS)"
            value={Math.round(rRadius * 1000)}
            min={240}
            max={420}
            step={1}
            unit="mm"
            hint="ギア速度計算にも連動"
            accent="amber"
            onChange={(v) => updateTyres('REAR', 'RADIUS', (v / 1000).toFixed(3))}
          />
          <NumericControl
            label="フロント理想空気圧 (IDEAL)"
            value={fPress}
            min={18}
            max={45}
            step={0.5}
            decimals={1}
            unit="psi"
            accent="emerald"
            onChange={(v) => updateTyres('FRONT', 'PRESSURE_IDEAL', v.toFixed(1))}
          />
          <NumericControl
            label="リア理想空気圧 (IDEAL)"
            value={rPress}
            min={18}
            max={45}
            step={0.5}
            decimals={1}
            unit="psi"
            accent="emerald"
            onChange={(v) => updateTyres('REAR', 'PRESSURE_IDEAL', v.toFixed(1))}
          />
        </div>
      </div>

      {/* Brakes & Electronics */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-[#121722] border border-[#242e42] rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-rose-400" />
            <h3 className="text-sm font-semibold text-slate-100">ブレーキシステム (brakes.ini)</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <NumericControl
              label="最大ブレーキトルク (MAX_TORQUE)"
              value={brakeMaxTorque}
              min={800}
              max={7000}
              step={50}
              unit="Nm"
              onChange={(v) => updateBrakes('DATA', 'MAX_TORQUE', Math.round(v))}
            />
            <NumericControl
              label="フロント制動バイアス (FRONT_SHARE)"
              value={Math.round(brakeFrontShare * 100)}
              min={45}
              max={85}
              step={1}
              unit="%"
              hint={`前 ${Math.round(brakeFrontShare * 100)}% / 後 ${100 - Math.round(brakeFrontShare * 100)}%`}
              accent="cyan"
              onChange={(v) => updateBrakes('DATA', 'FRONT_SHARE', (v / 100).toFixed(2))}
            />
            <NumericControl
              label="サイドブレーキトルク (HANDBRAKE)"
              value={handbrakeTorque}
              min={0}
              max={5000}
              step={100}
              unit="Nm"
              hint="ドリフトは 2500Nm 以上"
              accent="amber"
              onChange={(v) => updateBrakes('DATA', 'HANDBRAKE_TORQUE', Math.round(v))}
            />
            <label className="flex items-center justify-between bg-[#0b0e14] border border-[#252e42] rounded-lg p-3 text-xs cursor-pointer">
              <span className="text-slate-300">車内ブレーキバランス調整可</span>
              <input
                type="checkbox"
                checked={brakeCockpitAdj === 1}
                onChange={(e) =>
                  updateBrakes('DATA', 'COCKPIT_ADJUSTABLE', e.target.checked ? 1 : 0)
                }
                className="accent-rose-500 w-4 h-4"
              />
            </label>
          </div>
        </div>

        <div className="bg-[#121722] border border-[#242e42] rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-slate-100">電子制御システム (electronics.ini)</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <label className="flex items-center justify-between bg-[#0b0e14] border border-[#252e42] rounded-lg p-3 cursor-pointer">
              <span className="text-slate-200">ABS 搭載 (PRESENT)</span>
              <input
                type="checkbox"
                checked={absPresent === 1}
                onChange={(e) => updateElec('ABS', 'PRESENT', e.target.checked ? 1 : 0)}
                className="accent-emerald-500 w-4 h-4"
              />
            </label>
            <label className="flex items-center justify-between bg-[#0b0e14] border border-[#252e42] rounded-lg p-3 cursor-pointer">
              <span className="text-slate-200">ABS デフォルトON (ACTIVE)</span>
              <input
                type="checkbox"
                checked={absActive === 1}
                onChange={(e) => updateElec('ABS', 'ACTIVE', e.target.checked ? 1 : 0)}
                className="accent-emerald-500 w-4 h-4"
              />
            </label>
            <label className="flex items-center justify-between bg-[#0b0e14] border border-[#252e42] rounded-lg p-3 cursor-pointer">
              <span className="text-slate-200">トラクションコントロール搭載</span>
              <input
                type="checkbox"
                checked={tcPresent === 1}
                onChange={(e) =>
                  updateElec('TRACTION_CONTROL', 'PRESENT', e.target.checked ? 1 : 0)
                }
                className="accent-emerald-500 w-4 h-4"
              />
            </label>
            <label className="flex items-center justify-between bg-[#0b0e14] border border-[#252e42] rounded-lg p-3 cursor-pointer">
              <span className="text-slate-200">TC デフォルトON (ACTIVE)</span>
              <input
                type="checkbox"
                checked={tcActive === 1}
                onChange={(e) =>
                  updateElec('TRACTION_CONTROL', 'ACTIVE', e.target.checked ? 1 : 0)
                }
                className="accent-emerald-500 w-4 h-4"
              />
            </label>
          </div>
        </div>
      </div>

      {/* Aero Wings */}
      <div className="bg-[#121722] border border-[#242e42] rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Wind className="w-4 h-4 text-sky-400" />
          <h3 className="text-sm font-semibold text-slate-100">
            空力・ダウンフォース設定 (aero.ini — {wingSections.length} 要素検出)
          </h3>
        </div>
        {wingSections.length === 0 ? (
          <div className="text-xs text-slate-400 bg-[#0b0e14] rounded-lg p-4">
            aero.ini に WING セクションが見つかりませんでした。
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {wingSections.map((sec) => {
              const name = getIniValue(aeroIni, sec, 'NAME', sec);
              const cl = getIniNumber(aeroIni, sec, 'CL_GAIN', 0.1);
              const cd = getIniNumber(aeroIni, sec, 'CD_GAIN', 0.1);
              const angle = getIniNumber(aeroIni, sec, 'ANGLE', 0);
              return (
                <div
                  key={sec}
                  className="bg-[#0e131d] border border-[#242e42] rounded-lg p-3 space-y-2.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-sky-300">
                      [{sec}] {name}
                    </span>
                    <span className="font-mono-num text-slate-400">
                      L/D比: {cd > 0.001 ? (cl / cd).toFixed(2) : '-'}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <NumericControl
                      label="ダウンフォース (CL)"
                      value={cl}
                      min={-0.5}
                      max={3.5}
                      step={0.02}
                      decimals={2}
                      accent="cyan"
                      onChange={(v) => updateAero(sec, 'CL_GAIN', v.toFixed(2))}
                    />
                    <NumericControl
                      label="空気抵抗 (CD)"
                      value={cd}
                      min={0}
                      max={1.5}
                      step={0.01}
                      decimals={2}
                      accent="amber"
                      onChange={(v) => updateAero(sec, 'CD_GAIN', v.toFixed(2))}
                    />
                    <NumericControl
                      label="ウィング角 (ANGLE)"
                      value={angle}
                      min={-10}
                      max={25}
                      step={0.5}
                      decimals={1}
                      unit="deg"
                      onChange={(v) => updateAero(sec, 'ANGLE', v.toFixed(1))}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
    </DetachablePanel>
  );
};
