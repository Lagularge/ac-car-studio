import type { CustomPresetRecord } from '../types/ac';
import {
  getIniNumber,
  getIniValue,
  parseLut,
  serializeLut,
  setIniValue,
  setIniValues,
} from './iniHelpers';
import { getPowerLutFilename } from './physicsCalc';

export interface BuiltinPreset {
  id: string;
  name: string;
  category: 'drift' | 'grip' | 'engine' | 'chassis' | 'street';
  badge: string;
  description: string;
  highlights: string[];
  apply: (files: Record<string, string>) => Record<string, string>;
}

export const BUILTIN_PRESETS: BuiltinPreset[] = [
  {
    id: 'drift_pro',
    name: 'ドリフト仕様コンバージョン (D-Spec)',
    category: 'drift',
    badge: 'DRIFT',
    description:
      '大切れ角ステアリング、2Wayロックデフ、フロント高キャンバー、強化サイドブレーキ、ABS/TC解除を一括適用します。',
    highlights: [
      'ステアリングロック 560° / クイックステア比 9.0',
      'LSD Power 95% / Coast 85% / Preload 100Nm',
      'フロントキャンバー -5.0° / リア -0.6°',
      'ハンドブレーキ 3200Nm / ABS・TC OFF',
    ],
    apply: (files) => {
      const next = { ...files };
      next['car.ini'] = setIniValues(next['car.ini'], [
        ['CONTROLS', 'STEER_LOCK', 560],
        ['CONTROLS', 'STEER_RATIO', 9.0],
      ]);
      next['drivetrain.ini'] = setIniValues(next['drivetrain.ini'], [
        ['TRACTION', 'TYPE', 'RWD'],
        ['DIFFERENTIAL', 'POWER', '0.95'],
        ['DIFFERENTIAL', 'COAST', '0.85'],
        ['DIFFERENTIAL', 'PRELOAD', 100],
      ]);
      const fSpring = getIniNumber(next['suspensions.ini'], 'FRONT', 'SPRING_RATE', 65000);
      const rSpring = getIniNumber(next['suspensions.ini'], 'REAR', 'SPRING_RATE', 58000);
      next['suspensions.ini'] = setIniValues(next['suspensions.ini'], [
        ['FRONT', 'STATIC_CAMBER', '-5.00'],
        ['REAR', 'STATIC_CAMBER', '-0.60'],
        ['FRONT', 'SPRING_RATE', Math.round(Math.max(85000, fSpring * 1.25))],
        ['REAR', 'SPRING_RATE', Math.round(Math.max(65000, rSpring * 1.05))],
        ['ARB', 'FRONT', 38000],
        ['ARB', 'REAR', 14000],
      ]);
      next['brakes.ini'] = setIniValues(next['brakes.ini'], [
        ['DATA', 'HANDBRAKE_TORQUE', 3200],
      ]);
      if (next['electronics.ini']) {
        next['electronics.ini'] = setIniValues(next['electronics.ini'], [
          ['ABS', 'ACTIVE', 0],
          ['TRACTION_CONTROL', 'ACTIVE', 0],
        ]);
      }
      return next;
    },
  },
  {
    id: 'time_attack_grip',
    name: 'タイムアタック・グリップ仕様 (TA Spec)',
    category: 'grip',
    badge: 'GRIP / TA',
    description:
      'サーキット最速を狙うハイグリップ仕様。タイヤ摩擦係数・バネ＆ダンパー剛性・ダウンフォース・ブレーキを最適化します。',
    highlights: [
      'タイヤグリップ (DY/DX) +14% 向上',
      '前後スプリング +35% / ダンパー減衰 +30%',
      'サーキットキャンバー (-3.2° / -2.2°)',
      'リアウィングダウンフォース強化 & ブレーキ +25%',
    ],
    apply: (files) => {
      const next = { ...files };
      const fSpring = getIniNumber(next['suspensions.ini'], 'FRONT', 'SPRING_RATE', 65000);
      const rSpring = getIniNumber(next['suspensions.ini'], 'REAR', 'SPRING_RATE', 60000);
      const fBump = getIniNumber(next['suspensions.ini'], 'FRONT', 'DAMP_BUMP', 4200);
      const rBump = getIniNumber(next['suspensions.ini'], 'REAR', 'DAMP_BUMP', 3800);
      const fReb = getIniNumber(next['suspensions.ini'], 'FRONT', 'DAMP_REBOUND', 6500);
      const rReb = getIniNumber(next['suspensions.ini'], 'REAR', 'DAMP_REBOUND', 5800);

      next['suspensions.ini'] = setIniValues(next['suspensions.ini'], [
        ['FRONT', 'SPRING_RATE', Math.round(fSpring * 1.35)],
        ['REAR', 'SPRING_RATE', Math.round(rSpring * 1.35)],
        ['FRONT', 'DAMP_BUMP', Math.round(fBump * 1.3)],
        ['REAR', 'DAMP_BUMP', Math.round(rBump * 1.3)],
        ['FRONT', 'DAMP_REBOUND', Math.round(fReb * 1.3)],
        ['REAR', 'DAMP_REBOUND', Math.round(rReb * 1.3)],
        ['FRONT', 'STATIC_CAMBER', '-3.20'],
        ['REAR', 'STATIC_CAMBER', '-2.20'],
      ]);

      const scaleTyre = (section: string, key: string, mult: number, fallback: number) =>
        (getIniNumber(next['tyres.ini'], section, key, fallback) * mult).toFixed(4);

      next['tyres.ini'] = setIniValues(next['tyres.ini'], [
        ['FRONT', 'DY_REF', scaleTyre('FRONT', 'DY_REF', 1.14, 1.3)],
        ['FRONT', 'DX_REF', scaleTyre('FRONT', 'DX_REF', 1.14, 1.32)],
        ['FRONT', 'DY0', scaleTyre('FRONT', 'DY0', 1.14, 1.25)],
        ['FRONT', 'DX0', scaleTyre('FRONT', 'DX0', 1.14, 1.26)],
        ['REAR', 'DY_REF', scaleTyre('REAR', 'DY_REF', 1.14, 1.3)],
        ['REAR', 'DX_REF', scaleTyre('REAR', 'DX_REF', 1.14, 1.32)],
        ['REAR', 'DY0', scaleTyre('REAR', 'DY0', 1.14, 1.25)],
        ['REAR', 'DX0', scaleTyre('REAR', 'DX0', 1.14, 1.26)],
      ]);

      const brakeTq = getIniNumber(next['brakes.ini'], 'DATA', 'MAX_TORQUE', 2600);
      next['brakes.ini'] = setIniValues(next['brakes.ini'], [
        ['DATA', 'MAX_TORQUE', Math.round(brakeTq * 1.25)],
      ]);

      if (next['aero.ini']) {
        const rearCl = getIniNumber(next['aero.ini'], 'WING_1', 'CL_GAIN', 0.2);
        next['aero.ini'] = setIniValues(next['aero.ini'], [
          ['WING_1', 'CL_GAIN', Number(Math.max(0.45, rearCl * 1.6)).toFixed(2)],
        ]);
      }

      return next;
    },
  },
  {
    id: 'stage2_turbo',
    name: 'ステージ2 ターボチューン (+35% Power)',
    category: 'engine',
    badge: 'TURBO',
    description:
      'ベースエンジントルク底上げ＋ブースト圧引き上げ（NA車にはボルトオンターボ追加）＋強化クラッチ適用。',
    highlights: [
      'power.lut トルク全域 +15% スケーリング',
      'TURBO_0 ブースト +0.35 bar (NA車は 0.85 bar 追加)',
      'レブリミット +500 RPM 引き上げ',
      'クラッチ許容トルク +40% 強化',
    ],
    apply: (files) => {
      const next = { ...files };
      const lutFile = getPowerLutFilename(next['engine.ini']);
      const pts = parseLut(next[lutFile] ?? next['power.lut']);
      if (pts.length > 0) {
        const scaled = pts.map((p) => ({ rpm: p.rpm, torque: Number((p.torque * 1.15).toFixed(1)) }));
        next[lutFile] = serializeLut(scaled);
      }

      const curLimiter = getIniNumber(next['engine.ini'], 'ENGINE_DATA', 'LIMITER', 7500);
      const curBoost = getIniNumber(next['engine.ini'], 'TURBO_0', 'MAX_BOOST', 0);
      const newBoost = curBoost > 0.05 ? Math.min(2.4, curBoost + 0.35) : 0.85;

      next['engine.ini'] = setIniValues(next['engine.ini'], [
        ['ENGINE_DATA', 'LIMITER', Math.round(curLimiter + 500)],
        ['TURBO_0', 'LAG_DN', '0.96'],
        ['TURBO_0', 'LAG_UP', '0.985'],
        ['TURBO_0', 'MAX_BOOST', newBoost.toFixed(2)],
        ['TURBO_0', 'WASTEGATE', newBoost.toFixed(2)],
        ['TURBO_0', 'DISPLAY_MAX_BOOST', newBoost.toFixed(2)],
        ['TURBO_0', 'REFERENCE_RPM', Math.round((curLimiter + 500) * 0.52)],
        ['TURBO_0', 'GAMMA', '2.0'],
        ['TURBO_0', 'COCKPIT_ADJUSTABLE', 1],
      ]);

      const curClutch = getIniNumber(next['drivetrain.ini'], 'CLUTCH', 'MAX_TORQUE', 500);
      next['drivetrain.ini'] = setIniValue(
        next['drivetrain.ini'],
        'CLUTCH',
        'MAX_TORQUE',
        Math.round(curClutch * 1.4)
      );

      return next;
    },
  },
  {
    id: 'high_rev_na',
    name: '高回転メカチューン (High-Rev NA)',
    category: 'engine',
    badge: 'HIGH-REV',
    description:
      '軽量フライホイール＋高回転カム特性により、シャープな吹け上がりとハイエンドパワーを実現します。',
    highlights: [
      '高回転域 (4500RPM以上) トルク最大 +18% 増強',
      'レブリミット +1000 RPM 拡大',
      'エンジン回転慣性 (INERTIA) -25% 軽量化',
      'ファイナルギア +8% ローギアード化で加速重視',
    ],
    apply: (files) => {
      const next = { ...files };
      const lutFile = getPowerLutFilename(next['engine.ini']);
      const curLimiter = getIniNumber(next['engine.ini'], 'ENGINE_DATA', 'LIMITER', 7500);
      const newLimiter = curLimiter + 1000;
      const pts = parseLut(next[lutFile] ?? next['power.lut']);

      if (pts.length > 0) {
        const updated = pts.map((p) => {
          const boostRatio = p.rpm > 4000 ? 1 + 0.18 * Math.min(1, (p.rpm - 4000) / Math.max(1000, curLimiter - 4000)) : 1.02;
          return { rpm: p.rpm, torque: Number((p.torque * boostRatio).toFixed(1)) };
        });
        const last = updated[updated.length - 1];
        if (last.rpm < newLimiter) {
          updated.push({ rpm: newLimiter, torque: Number((last.torque * 0.94).toFixed(1)) });
          updated.push({ rpm: newLimiter + 500, torque: Number((last.torque * 0.7).toFixed(1)) });
        }
        next[lutFile] = serializeLut(updated);
      }

      const curInertia = getIniNumber(next['engine.ini'], 'ENGINE_DATA', 'INERTIA', 0.14);
      next['engine.ini'] = setIniValues(next['engine.ini'], [
        ['ENGINE_DATA', 'LIMITER', newLimiter],
        ['ENGINE_DATA', 'INERTIA', Math.max(0.06, Number((curInertia * 0.75).toFixed(3)))],
      ]);

      const curFinal = getIniNumber(next['drivetrain.ini'], 'GEARS', 'FINAL', 3.9);
      next['drivetrain.ini'] = setIniValue(
        next['drivetrain.ini'],
        'GEARS',
        'FINAL',
        (curFinal * 1.08).toFixed(3)
      );

      return next;
    },
  },
  {
    id: 'lightweight_track',
    name: '徹底軽量化 (Weight Reduction -12%)',
    category: 'chassis',
    badge: 'LIGHTWEIGHT',
    description:
      '内装ドンガラ・カーボン外装化を想定した車重12%削減とヨー慣性低減で、回頭性と加速力を劇的に引き上げます。',
    highlights: [
      '車両総重量 (TOTALMASS) -12% 削減',
      '慣性モーメント (INERTIA) を連動縮小',
      'パワーウェイトレシオ・制動距離・旋回性能が全域向上',
    ],
    apply: (files) => {
      const next = { ...files };
      const curMass = getIniNumber(next['car.ini'], 'BASIC', 'TOTALMASS', 1300);
      const newMass = Math.max(680, Math.round(curMass * 0.88));
      next['car.ini'] = setIniValue(next['car.ini'], 'BASIC', 'TOTALMASS', newMass);

      const inertiaStr = getIniValue(next['car.ini'], 'BASIC', 'INERTIA', '');
      const parts = inertiaStr.split(',').map((s) => Number(s.trim()));
      if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
        next['car.ini'] = setIniValue(
          next['car.ini'],
          'BASIC',
          'INERTIA',
          parts.map((n) => (n * 0.92).toFixed(2)).join(', ')
        );
      }
      return next;
    },
  },
  {
    id: 'balanced_street',
    name: 'ストリート快走バランス仕様 (Street)',
    category: 'street',
    badge: 'STREET',
    description:
      '峠道や公道マップで扱いやすい素直な挙動に整えます。マイルドな足回りと電子制御ONで安定性重視。',
    highlights: [
      '扱いやすいキャンバー (-1.5° / -1.2°)',
      'マイルドな LSD (Power 35% / Coast 20%)',
      'ステアリングロック 450° / ギア比 14.5',
      'ABS / TC 有効化',
    ],
    apply: (files) => {
      const next = { ...files };
      next['car.ini'] = setIniValues(next['car.ini'], [
        ['CONTROLS', 'STEER_LOCK', 450],
        ['CONTROLS', 'STEER_RATIO', 14.5],
      ]);
      next['drivetrain.ini'] = setIniValues(next['drivetrain.ini'], [
        ['DIFFERENTIAL', 'POWER', '0.35'],
        ['DIFFERENTIAL', 'COAST', '0.20'],
        ['DIFFERENTIAL', 'PRELOAD', 25],
      ]);
      next['suspensions.ini'] = setIniValues(next['suspensions.ini'], [
        ['FRONT', 'STATIC_CAMBER', '-1.50'],
        ['REAR', 'STATIC_CAMBER', '-1.20'],
      ]);
      if (next['electronics.ini']) {
        next['electronics.ini'] = setIniValues(next['electronics.ini'], [
          ['ABS', 'ACTIVE', 1],
          ['TRACTION_CONTROL', 'ACTIVE', 1],
        ]);
      }
      return next;
    },
  },
];

/**
 * Snapshot key tuning parameters from current car files into a reusable custom preset.
 */
export function extractCustomPresetSnapshot(
  files: Record<string, string>,
  name: string,
  description: string
): CustomPresetRecord {
  const keysToCapture: Array<[file: string, section: string, key: string]> = [
    ['car.ini', 'BASIC', 'TOTALMASS'],
    ['car.ini', 'CONTROLS', 'STEER_LOCK'],
    ['car.ini', 'CONTROLS', 'STEER_RATIO'],
    ['engine.ini', 'ENGINE_DATA', 'LIMITER'],
    ['engine.ini', 'TURBO_0', 'MAX_BOOST'],
    ['engine.ini', 'TURBO_0', 'WASTEGATE'],
    ['drivetrain.ini', 'TRACTION', 'TYPE'],
    ['drivetrain.ini', 'GEARS', 'FINAL'],
    ['drivetrain.ini', 'DIFFERENTIAL', 'POWER'],
    ['drivetrain.ini', 'DIFFERENTIAL', 'COAST'],
    ['drivetrain.ini', 'DIFFERENTIAL', 'PRELOAD'],
    ['suspensions.ini', 'FRONT', 'SPRING_RATE'],
    ['suspensions.ini', 'REAR', 'SPRING_RATE'],
    ['suspensions.ini', 'FRONT', 'DAMP_BUMP'],
    ['suspensions.ini', 'REAR', 'DAMP_BUMP'],
    ['suspensions.ini', 'FRONT', 'DAMP_REBOUND'],
    ['suspensions.ini', 'REAR', 'DAMP_REBOUND'],
    ['suspensions.ini', 'FRONT', 'STATIC_CAMBER'],
    ['suspensions.ini', 'REAR', 'STATIC_CAMBER'],
    ['suspensions.ini', 'ARB', 'FRONT'],
    ['suspensions.ini', 'ARB', 'REAR'],
    ['tyres.ini', 'FRONT', 'DY_REF'],
    ['tyres.ini', 'FRONT', 'DX_REF'],
    ['tyres.ini', 'REAR', 'DY_REF'],
    ['tyres.ini', 'REAR', 'DX_REF'],
    ['brakes.ini', 'DATA', 'MAX_TORQUE'],
    ['brakes.ini', 'DATA', 'FRONT_SHARE'],
    ['brakes.ini', 'DATA', 'HANDBRAKE_TORQUE'],
    ['aero.ini', 'WING_1', 'CL_GAIN'],
    ['aero.ini', 'WING_1', 'CD_GAIN'],
  ];

  const patchFiles: Record<string, Record<string, Record<string, string>>> = {};
  for (const [file, section, key] of keysToCapture) {
    const val = getIniValue(files[file], section, key, '');
    if (val !== '') {
      patchFiles[file] ??= {};
      patchFiles[file][section] ??= {};
      patchFiles[file][section][key] = val;
    }
  }

  return {
    id: `custom_${Date.now()}`,
    name: name.trim() || 'カスタムプリセット',
    description: description.trim() || '車両設定スナップショット',
    createdAt: new Date().toISOString(),
    category: 'custom',
    patchFiles,
  };
}

export function applyCustomPreset(
  files: Record<string, string>,
  preset: CustomPresetRecord
): Record<string, string> {
  const next = { ...files };
  for (const [fileName, sections] of Object.entries(preset.patchFiles)) {
    let content = next[fileName] ?? '';
    for (const [sec, kv] of Object.entries(sections)) {
      for (const [k, v] of Object.entries(kv)) {
        content = setIniValue(content, sec, k, v);
      }
    }
    next[fileName] = content;
  }
  return next;
}
