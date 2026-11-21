import React, { useState } from 'react';
import { Car, Plus, X } from 'lucide-react';
import type { CreateCarPayload, NewCarTemplateId } from '../types/ac';

interface NewCarModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (payload: CreateCarPayload) => Promise<void>;
}

const TEMPLATE_OPTIONS: Array<{
  id: NewCarTemplateId;
  title: string;
  sub: string;
  defaults: Partial<CreateCarPayload>;
}> = [
  {
    id: 'fr_sports',
    title: 'FR スポーツクーペ',
    sub: 'バランス型 RWD / 6速 / ストリート',
    defaults: { massKg: 1320, peakTorqueNm: 380, maxRpm: 7800, turboBoostBar: 0.7, carClass: 'street' },
  },
  {
    id: 'drift_spec',
    title: 'ドリフトプロ仕様',
    sub: '高切れ角・2Wayデフ・RWDターボ',
    defaults: { massKg: 1200, peakTorqueNm: 540, maxRpm: 7800, turboBoostBar: 1.4, carClass: 'drift' },
  },
  {
    id: 'awd_rally',
    title: 'AWD ターボ / ラリー',
    sub: '4WD・ショートギア・トラクション重視',
    defaults: { massKg: 1360, peakTorqueNm: 460, maxRpm: 7600, turboBoostBar: 1.25, carClass: 'rally' },
  },
  {
    id: 'ff_hothatch',
    title: 'FF ホットハッチ',
    sub: '軽量 FWD・高回転NA/ターボ',
    defaults: { massKg: 1120, peakTorqueNm: 280, maxRpm: 8400, turboBoostBar: 0, carClass: 'street' },
  },
  {
    id: 'gt3_race',
    title: 'GT3 レーシングカー',
    sub: '高ダウンフォース・スリック・シーケンシャル',
    defaults: { massKg: 1250, peakTorqueNm: 640, maxRpm: 8600, turboBoostBar: 0, carClass: 'race' },
  },
];

export const NewCarModal: React.FC<NewCarModalProps> = ({ open, onClose, onCreate }) => {
  const [templateId, setTemplateId] = useState<NewCarTemplateId>('fr_sports');
  const [folderName, setFolderName] = useState('my_custom_sports_car');
  const [name, setName] = useState('My Custom Sports Car');
  const [brand, setBrand] = useState('Custom');
  const [country, setCountry] = useState('Japan');
  const [year, setYear] = useState(2025);
  const [carClass, setCarClass] = useState('street');
  const [author, setAuthor] = useState('AC Car Studio User');
  const [description, setDescription] = useState('');
  const [massKg, setMassKg] = useState(1320);
  const [peakTorqueNm, setPeakTorqueNm] = useState(380);
  const [maxRpm, setMaxRpm] = useState(7800);
  const [turboBoostBar, setTurboBoostBar] = useState(0.7);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const selectTemplate = (tpl: (typeof TEMPLATE_OPTIONS)[number]) => {
    setTemplateId(tpl.id);
    if (tpl.defaults.massKg !== undefined) setMassKg(tpl.defaults.massKg);
    if (tpl.defaults.peakTorqueNm !== undefined) setPeakTorqueNm(tpl.defaults.peakTorqueNm);
    if (tpl.defaults.maxRpm !== undefined) setMaxRpm(tpl.defaults.maxRpm);
    if (tpl.defaults.turboBoostBar !== undefined) setTurboBoostBar(tpl.defaults.turboBoostBar);
    if (tpl.defaults.carClass !== undefined) setCarClass(tpl.defaults.carClass);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onCreate({
        folderName,
        name,
        brand,
        country,
        year,
        carClass,
        author,
        description,
        templateId,
        massKg,
        peakTorqueNm,
        maxRpm,
        turboBoostBar,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#121722] border border-[#2a354d] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#222b3e]">
          <div className="flex items-center gap-2">
            <Car className="w-5 h-5 text-rose-400" />
            <h2 className="text-base font-bold text-slate-100">新規 Assetto Corsa 車両Modを作成</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5 text-xs">
          {/* Template Picker */}
          <div>
            <label className="text-slate-300 font-semibold block mb-2">
              1. ベース物理テンプレートを選択
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {TEMPLATE_OPTIONS.map((tpl) => (
                <button
                  type="button"
                  key={tpl.id}
                  onClick={() => selectTemplate(tpl)}
                  className={`text-left p-3 rounded-xl border transition-all ${
                    templateId === tpl.id
                      ? 'bg-rose-500/15 border-rose-500 text-rose-200'
                      : 'bg-[#0b0e14] border-[#242e42] text-slate-300 hover:border-[#394867]'
                  }`}
                >
                  <div className="font-semibold text-xs">{tpl.title}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{tpl.sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Identity */}
          <div>
            <label className="text-slate-300 font-semibold block mb-2">2. 車両基本情報</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-slate-400 block mb-1">フォルダID (半角英数・_・-)</label>
                <input
                  required
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  className="w-full bg-[#0b0e14] border border-[#2b354b] rounded-lg px-3 py-2 font-mono-num text-slate-100"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">車両表示名</label>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[#0b0e14] border border-[#2b354b] rounded-lg px-3 py-2 text-slate-100"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">ブランド</label>
                <input
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  className="w-full bg-[#0b0e14] border border-[#2b354b] rounded-lg px-3 py-2 text-slate-100"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-400 block mb-1">年式</label>
                  <input
                    type="number"
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                    className="w-full bg-[#0b0e14] border border-[#2b354b] rounded-lg px-3 py-2 font-mono-num text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">国</label>
                  <input
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full bg-[#0b0e14] border border-[#2b354b] rounded-lg px-3 py-2 text-slate-100"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Initial Physics */}
          <div>
            <label className="text-slate-300 font-semibold block mb-2">
              3. 初期パワートレイン &amp; 重量スペック
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-slate-400 block mb-1">車両重量 (kg)</label>
                <input
                  type="number"
                  min={500}
                  max={3000}
                  value={massKg}
                  onChange={(e) => setMassKg(Number(e.target.value))}
                  className="w-full bg-[#0b0e14] border border-[#2b354b] rounded-lg px-3 py-2 font-mono-num text-slate-100"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">目標トルク (Nm)</label>
                <input
                  type="number"
                  min={80}
                  max={2000}
                  value={peakTorqueNm}
                  onChange={(e) => setPeakTorqueNm(Number(e.target.value))}
                  className="w-full bg-[#0b0e14] border border-[#2b354b] rounded-lg px-3 py-2 font-mono-num text-amber-300"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">レブリミット (RPM)</label>
                <input
                  type="number"
                  min={4500}
                  max={14000}
                  step={100}
                  value={maxRpm}
                  onChange={(e) => setMaxRpm(Number(e.target.value))}
                  className="w-full bg-[#0b0e14] border border-[#2b354b] rounded-lg px-3 py-2 font-mono-num text-rose-300"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">ターボ圧 (bar / 0=NA)</label>
                <input
                  type="number"
                  min={0}
                  max={3.0}
                  step={0.05}
                  value={turboBoostBar}
                  onChange={(e) => setTurboBoostBar(Number(e.target.value))}
                  className="w-full bg-[#0b0e14] border border-[#2b354b] rounded-lg px-3 py-2 font-mono-num text-cyan-300"
                />
              </div>
            </div>
          </div>

          <div className="bg-[#0b0e14] border border-[#212a3d] rounded-lg p-3 text-[11px] text-slate-400 leading-relaxed">
            生成される内容: <code className="text-slate-200">data/</code> (car.ini, engine.ini, power.lut, drivetrain.ini, suspensions.ini, tyres.ini, brakes.ini, aero.ini, electronics.ini 他全18ファイル) + <code className="text-slate-200">ui/ui_car.json</code> + <code className="text-slate-200">skins/00_default/</code>。3Dモデル (.kn5) を配置すればそのままACで走行可能な構成です。
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[#222b3e]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-[#1a2233] text-slate-300 hover:bg-[#243047]"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              {submitting ? '生成中...' : '車両Modひな形を作成'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
