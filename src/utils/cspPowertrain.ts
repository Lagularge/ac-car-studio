import type { LutPoint, TransmissionMode } from '../types/ac';
import {
  getIniNumber,
  getIniValue,
  hasIniSection,
  parseLut,
  removeIniSection,
  serializeLut,
  setIniValue,
  setIniValues,
} from './iniHelpers';

// ============================================================================
// CSP Automatic Transmission (AT) & Continuously Variable Transmission (CVT)
// + Hybrid Electric Motor & Regenerative Braking (ERS/KERS + CSP Lua)
// ============================================================================

export interface CspAtConfig {
  gears: number; // 4..10
  shiftTimeSec: number; // 0.08..0.45
  lockRatioGap: number; // 0.05..0.35 (torque converter lockup slip threshold)
  creepStrength: number; // 0..1.0 (low-speed fluid creep torque)
  kickdownGasThreshold: number; // 0.70..0.98
  ecoUpshiftPct: number; // 0.32..0.65 of maxRpm at light throttle
  sportUpshiftPct: number; // 0.85..0.98 of maxRpm at WOT
  downshiftPct: number; // 0.25..0.55 of maxRpm
  brakeDamageThresholdKmh: number; // e.g. 5 km/h for P/R protection
  useCspSharedAtModule: boolean; // CSP v0.3.0+ shared/physics/automatic-transmission with automatic fallback
  allowManualOverride: boolean; // Tiptronic / paddle M mode
}

export interface CspCvtConfig {
  minRatio: number; // Overdrive / top ratio (e.g. 0.45)
  maxRatio: number; // Low / launch ratio (e.g. 2.85)
  finalRatio: number; // Differential final drive (e.g. 4.35)
  virtualSteps: number; // 8..16 fine geometric ratio steps in drivetrain.ini
  cruiseRpm: number; // Target RPM at light throttle (e.g. 1800)
  midLoadRpm: number; // Target RPM at 50% throttle (e.g. 3600)
  peakPowerRpm: number; // Target RPM pinned at WOT (e.g. 6400)
  steppedShiftMode: boolean; // Simulated stepped shifts under heavy throttle (Sport CVT / D-Step)
  steppedShiftCount: number; // 6..8 simulated steps
  engineBrakeGain: number; // 0..1.0 braking down-ratio assist
  responseRate: number; // 0.35..1.0 ratio sweep responsiveness
}

export interface CspTransmissionConfig {
  mode: TransmissionMode;
  at: CspAtConfig;
  cvt: CspCvtConfig;
}

export type CspTransmissionPresetId =
  | 'at_6_street'
  | 'at_8_sport'
  | 'at_10_gt'
  | 'cvt_eco'
  | 'cvt_sport'
  | 'cvt_step7';

export interface CspTransmissionPreset {
  id: CspTransmissionPresetId;
  name: string;
  badge: string;
  description: string;
  mode: 'csp_at' | 'csp_cvt';
  apply: (maxRpm: number, idleRpm: number) => Partial<CspTransmissionConfig>;
}

export type HybridPresetId =
  | 'mild_48v'
  | 'street_strong'
  | 'sport_phev'
  | 'hypercar_ers'
  | 'gt_lmdh'
  | 'custom';

export type HybridDriveLayout = 'crank_integrated' | 'rear_axle' | 'awd_front_assist';

export interface HybridSystemConfig {
  enabled: boolean;
  presetId: HybridPresetId;
  motorPeakKw: number; // 10..450 kW
  motorPeakTorqueNm: number; // 40..900 Nm
  motorMaxRpm: number; // 5000..16000 RPM
  batteryCapacityKwh: number; // 0.5..25.0 kWh
  maxKjPerLap: number; // 4000 (race) .. 9999999 (street unlimited)
  hasPushToPass: boolean; // HAS_BUTTON_OVERRIDE
  motorDriveLayout: HybridDriveLayout;
  regenMaxKw: number; // 10..300 kW
  regenChargeK: number; // AC [KINETIC] CHARGE_K (e.g. 0.00018)
  coastRegenTorqueNm: number; // 0..250 Nm off-throttle regenerative drag
  brakeRearCorrection: boolean; // BRAKE_REAR_CORRECTION (brake-by-wire balance)
  heatRecoveryK: number; // 0..0.00025 MGU-H thermal recovery
  evLowSpeedAssist: boolean; // Smooth CSP Lua EV creep / regen blending
  defaultModeIndex: 0 | 1 | 2; // 0=Eco/Charge, 1=Normal/Hybrid, 2=Sport/Attack
}

export interface HybridPreset {
  id: Exclude<HybridPresetId, 'custom'>;
  name: string;
  badge: string;
  description: string;
  build: (carMaxRpm: number) => HybridSystemConfig;
}

const TX_BLOCK_START = '-- <<< AC_CAR_STUDIO_TX_START >>>';
const TX_BLOCK_END = '-- <<< AC_CAR_STUDIO_TX_END >>>';
const HYBRID_BLOCK_START = '-- <<< AC_CAR_STUDIO_HYBRID_START >>>';
const HYBRID_BLOCK_END = '-- <<< AC_CAR_STUDIO_HYBRID_END >>>';
const DISPATCH_BLOCK_START = '-- <<< AC_CAR_STUDIO_DISPATCH_START >>>';
const DISPATCH_BLOCK_END = '-- <<< AC_CAR_STUDIO_DISPATCH_END >>>';

export const HYBRID_MANAGED_FILES = [
  'ers.ini',
  'kers_torque_power.lut',
  'kers_torque_coast.lut',
  'ctrl_ers_0.ini',
  'ctrl_ers_1.ini',
  'ctrl_ers_2.ini',
] as const;

export function createDefaultAtConfig(): CspAtConfig {
  return {
    gears: 8,
    shiftTimeSec: 0.16,
    lockRatioGap: 0.14,
    creepStrength: 0.45,
    kickdownGasThreshold: 0.84,
    ecoUpshiftPct: 0.42,
    sportUpshiftPct: 0.94,
    downshiftPct: 0.36,
    brakeDamageThresholdKmh: 5,
    useCspSharedAtModule: true,
    allowManualOverride: true,
  };
}

export function createDefaultCvtConfig(maxRpm = 7200, idleRpm = 900): CspCvtConfig {
  const safeMax = Math.max(4500, Math.min(12000, maxRpm));
  const safeIdle = Math.max(700, Math.min(1500, idleRpm));
  return {
    minRatio: 0.48,
    maxRatio: 2.85,
    finalRatio: 4.35,
    virtualSteps: 14,
    cruiseRpm: Math.round(Math.max(safeIdle + 700, safeMax * 0.28)),
    midLoadRpm: Math.round(safeMax * 0.54),
    peakPowerRpm: Math.round(safeMax * 0.88),
    steppedShiftMode: false,
    steppedShiftCount: 7,
    engineBrakeGain: 0.45,
    responseRate: 0.72,
  };
}

export const CSP_TRANSMISSION_PRESETS: CspTransmissionPreset[] = [
  {
    id: 'at_6_street',
    name: '6速トルコンAT (街乗り快適)',
    badge: '6AT',
    description: '滑らかなトルコンクリープと早めのエコシフトアップ。全開時はしっかり高回転まで引っ張ります。',
    mode: 'csp_at',
    apply: () => ({
      mode: 'csp_at',
      at: {
        gears: 6,
        shiftTimeSec: 0.24,
        lockRatioGap: 0.18,
        creepStrength: 0.55,
        kickdownGasThreshold: 0.82,
        ecoUpshiftPct: 0.38,
        sportUpshiftPct: 0.92,
        downshiftPct: 0.34,
        brakeDamageThresholdKmh: 5,
        useCspSharedAtModule: true,
        allowManualOverride: true,
      },
    }),
  },
  {
    id: 'at_8_sport',
    name: '8速スポーツAT (ZF 8HP系)',
    badge: '8AT',
    description: '素早いシフト時間とダイレクトなロックアップ特性。街乗りからサーキットまで万能な多段スポーツAT。',
    mode: 'csp_at',
    apply: () => ({
      mode: 'csp_at',
      at: {
        gears: 8,
        shiftTimeSec: 0.13,
        lockRatioGap: 0.11,
        creepStrength: 0.38,
        kickdownGasThreshold: 0.85,
        ecoUpshiftPct: 0.42,
        sportUpshiftPct: 0.95,
        downshiftPct: 0.38,
        brakeDamageThresholdKmh: 5,
        useCspSharedAtModule: true,
        allowManualOverride: true,
      },
    }),
  },
  {
    id: 'at_10_gt',
    name: '10速ハイパフォーマンスAT',
    badge: '10AT',
    description: '中速域を超クロスレシオ化し、9〜10速は高速巡航向けオーバードライブに設定した現代GT仕様。',
    mode: 'csp_at',
    apply: () => ({
      mode: 'csp_at',
      at: {
        gears: 10,
        shiftTimeSec: 0.11,
        lockRatioGap: 0.10,
        creepStrength: 0.32,
        kickdownGasThreshold: 0.86,
        ecoUpshiftPct: 0.40,
        sportUpshiftPct: 0.96,
        downshiftPct: 0.40,
        brakeDamageThresholdKmh: 5,
        useCspSharedAtModule: true,
        allowManualOverride: true,
      },
    }),
  },
  {
    id: 'cvt_eco',
    name: 'ストリート・エコCVT (無段変速)',
    badge: 'CVT',
    description: '低負荷時は低回転で静かに巡航し、踏み込むと無段階にギア比を連続変化させます。',
    mode: 'csp_cvt',
    apply: (maxRpm, idleRpm) => ({
      mode: 'csp_cvt',
      cvt: {
        ...createDefaultCvtConfig(maxRpm, idleRpm),
        minRatio: 0.44,
        maxRatio: 2.90,
        finalRatio: 4.55,
        virtualSteps: 14,
        cruiseRpm: Math.round(Math.max(idleRpm + 650, maxRpm * 0.25)),
        midLoadRpm: Math.round(maxRpm * 0.48),
        peakPowerRpm: Math.round(maxRpm * 0.86),
        steppedShiftMode: false,
        engineBrakeGain: 0.40,
        responseRate: 0.65,
      },
    }),
  },
  {
    id: 'cvt_sport',
    name: 'スポーツCVT (パワーバンド維持)',
    badge: 'SPORT CVT',
    description: '全開加速時にエンジンを最大出力回転数へ張り付かせ、シームレスに最速加速を続けます。',
    mode: 'csp_cvt',
    apply: (maxRpm, idleRpm) => ({
      mode: 'csp_cvt',
      cvt: {
        ...createDefaultCvtConfig(maxRpm, idleRpm),
        minRatio: 0.50,
        maxRatio: 3.10,
        finalRatio: 4.25,
        virtualSteps: 16,
        cruiseRpm: Math.round(Math.max(idleRpm + 900, maxRpm * 0.32)),
        midLoadRpm: Math.round(maxRpm * 0.60),
        peakPowerRpm: Math.round(maxRpm * 0.91),
        steppedShiftMode: false,
        engineBrakeGain: 0.65,
        responseRate: 0.88,
      },
    }),
  },
  {
    id: 'cvt_step7',
    name: '擬似7段スポーツCVT (D-Step)',
    badge: '7-STEP CVT',
    description: '通常時は滑らかなCVT、高負荷・全開時は7速スポーツAT風のステップ変速を再現します。',
    mode: 'csp_cvt',
    apply: (maxRpm, idleRpm) => ({
      mode: 'csp_cvt',
      cvt: {
        ...createDefaultCvtConfig(maxRpm, idleRpm),
        minRatio: 0.48,
        maxRatio: 2.95,
        finalRatio: 4.30,
        virtualSteps: 14,
        cruiseRpm: Math.round(Math.max(idleRpm + 800, maxRpm * 0.29)),
        midLoadRpm: Math.round(maxRpm * 0.55),
        peakPowerRpm: Math.round(maxRpm * 0.92),
        steppedShiftMode: true,
        steppedShiftCount: 7,
        engineBrakeGain: 0.60,
        responseRate: 0.82,
      },
    }),
  },
];

export const HYBRID_PRESETS: HybridPreset[] = [
  {
    id: 'mild_48v',
    name: '48V マイルドハイブリッド (MHEV)',
    badge: '48V MHEV',
    description: '発進・低速トルク補助と自然な減速回生を追加。軽量バッテリーで車両バランスを崩しません。',
    build: (maxRpm) => ({
      enabled: true,
      presetId: 'mild_48v',
      motorPeakKw: 22,
      motorPeakTorqueNm: 95,
      motorMaxRpm: Math.max(6000, maxRpm),
      batteryCapacityKwh: 0.9,
      maxKjPerLap: 9999999,
      hasPushToPass: false,
      motorDriveLayout: 'crank_integrated',
      regenMaxKw: 20,
      regenChargeK: 0.00014,
      coastRegenTorqueNm: 28,
      brakeRearCorrection: true,
      heatRecoveryK: 0,
      evLowSpeedAssist: true,
      defaultModeIndex: 1,
    }),
  },
  {
    id: 'street_strong',
    name: 'ストロングハイブリッド (THS / e:HEV系)',
    badge: 'STRONG HV',
    description: '中出力モーターによる力強い発進加速としっかり効くワンペダル寄りの回生ブレーキ。',
    build: (maxRpm) => ({
      enabled: true,
      presetId: 'street_strong',
      motorPeakKw: 95,
      motorPeakTorqueNm: 260,
      motorMaxRpm: Math.max(6500, maxRpm),
      batteryCapacityKwh: 2.2,
      maxKjPerLap: 9999999,
      hasPushToPass: false,
      motorDriveLayout: 'crank_integrated',
      regenMaxKw: 70,
      regenChargeK: 0.00022,
      coastRegenTorqueNm: 65,
      brakeRearCorrection: true,
      heatRecoveryK: 0,
      evLowSpeedAssist: true,
      defaultModeIndex: 1,
    }),
  },
  {
    id: 'sport_phev',
    name: 'スポーツ PHEV (NSX / 296 / SF90系)',
    badge: 'SPORT PHEV',
    description: '大容量バッテリー＋高トルクモーターでターボラグを完全に埋め、強力な回生制動を実現。',
    build: (maxRpm) => ({
      enabled: true,
      presetId: 'sport_phev',
      motorPeakKw: 150,
      motorPeakTorqueNm: 340,
      motorMaxRpm: Math.max(8000, maxRpm),
      batteryCapacityKwh: 7.5,
      maxKjPerLap: 9999999,
      hasPushToPass: true,
      motorDriveLayout: 'awd_front_assist',
      regenMaxKw: 120,
      regenChargeK: 0.00026,
      coastRegenTorqueNm: 85,
      brakeRearCorrection: true,
      heatRecoveryK: 0,
      evLowSpeedAssist: true,
      defaultModeIndex: 1,
    }),
  },
  {
    id: 'hypercar_ers',
    name: 'ハイパーカー ERS (918 / LaFerrari / P1系)',
    badge: 'HYPER ERS',
    description: '180kW超の爆発的モーターアシスト＋Push-to-Passオーバーライド＆ハードブレーキング回生。',
    build: (maxRpm) => ({
      enabled: true,
      presetId: 'hypercar_ers',
      motorPeakKw: 195,
      motorPeakTorqueNm: 420,
      motorMaxRpm: Math.max(8500, maxRpm),
      batteryCapacityKwh: 6.2,
      maxKjPerLap: 9999999,
      hasPushToPass: true,
      motorDriveLayout: 'awd_front_assist',
      regenMaxKw: 150,
      regenChargeK: 0.00030,
      coastRegenTorqueNm: 95,
      brakeRearCorrection: true,
      heatRecoveryK: 0.00004,
      evLowSpeedAssist: true,
      defaultModeIndex: 2,
    }),
  },
  {
    id: 'gt_lmdh',
    name: 'レース規定 ERS (LMDh / Formula系)',
    badge: 'RACE ERS',
    description: '1周あたり4MJ制限、MGU-K＋MGU-H熱回生、リアブレーキバイワイヤ補正を備えた本格競技仕様。',
    build: (maxRpm) => ({
      enabled: true,
      presetId: 'gt_lmdh',
      motorPeakKw: 160,
      motorPeakTorqueNm: 310,
      motorMaxRpm: Math.max(9000, maxRpm),
      batteryCapacityKwh: 1.8,
      maxKjPerLap: 4000,
      hasPushToPass: true,
      motorDriveLayout: 'rear_axle',
      regenMaxKw: 180,
      regenChargeK: 0.00034,
      coastRegenTorqueNm: 110,
      brakeRearCorrection: true,
      heatRecoveryK: 0.00009,
      evLowSpeedAssist: false,
      defaultModeIndex: 1,
    }),
  },
];

export function createDefaultHybridConfig(carMaxRpm = 7500): HybridSystemConfig {
  return {
    ...HYBRID_PRESETS[1].build(carMaxRpm),
    enabled: false,
  };
}

// ============================================================================
// Gear Ratio Generators for AT & CVT
// ============================================================================

export function generateAtRatioTable(gearCount: number): { ratios: number[]; final: number } {
  const n = Math.min(10, Math.max(4, Math.round(gearCount)));
  const tables: Record<number, { ratios: number[]; final: number }> = {
    4: { ratios: [2.84, 1.55, 1.00, 0.70], final: 3.90 },
    5: { ratios: [3.58, 2.19, 1.41, 1.00, 0.75], final: 3.73 },
    6: { ratios: [4.17, 2.34, 1.52, 1.14, 0.87, 0.69], final: 3.55 },
    7: { ratios: [4.38, 2.86, 1.92, 1.37, 1.00, 0.82, 0.73], final: 3.46 },
    8: { ratios: [4.71, 3.14, 2.11, 1.67, 1.29, 1.00, 0.84, 0.67], final: 3.23 },
    9: { ratios: [5.35, 3.24, 2.25, 1.64, 1.21, 1.00, 0.86, 0.72, 0.60], final: 3.15 },
    10: { ratios: [4.70, 2.99, 2.15, 1.77, 1.52, 1.28, 1.00, 0.85, 0.69, 0.64], final: 3.15 },
  };
  return tables[n] ?? tables[8];
}

export function generateCvtRatioTable(cvt: CspCvtConfig): number[] {
  const steps = Math.min(16, Math.max(8, Math.round(cvt.virtualSteps)));
  const maxR = Math.max(1.2, cvt.maxRatio);
  const minR = Math.max(0.32, Math.min(maxR - 0.3, cvt.minRatio));
  const ratios: number[] = [];
  for (let i = 0; i < steps; i++) {
    const t = steps > 1 ? i / (steps - 1) : 0;
    const ratio = maxR * Math.pow(minR / maxR, t);
    ratios.push(Number(ratio.toFixed(4)));
  }
  return ratios;
}

// ============================================================================
// Hybrid Electric Motor & Regenerative Braking LUT Generators
// ============================================================================

export function generateMotorTorqueLut(
  motorPeakKw: number,
  motorPeakTorqueNm: number,
  motorMaxRpm: number
): LutPoint[] {
  const peakKw = Math.max(1, motorPeakKw);
  const peakNm = Math.max(1, motorPeakTorqueNm);
  const maxRpm = Math.max(4000, Math.round(motorMaxRpm));
  const baseRpm = (9549.2966 * peakKw) / peakNm;

  const rpms = new Set<number>([0, 250, 500, 1000, 1500, 2000, 3000, 4000, 5000, 6000, maxRpm]);
  for (let r = 1000; r < maxRpm; r += 1000) rpms.add(r);
  if (baseRpm > 300 && baseRpm < maxRpm) {
    rpms.add(Math.round(baseRpm));
    rpms.add(Math.round(Math.min(maxRpm, baseRpm * 1.15)));
  }

  const sorted = Array.from(rpms)
    .filter((r) => r >= 0 && r <= maxRpm)
    .sort((a, b) => a - b);

  return sorted.map((rpm) => {
    let torque = peakNm;
    if (rpm > baseRpm && rpm > 0) {
      torque = Math.min(peakNm, (9549.2966 * peakKw) / rpm);
    }
    // Soft high-RPM field-weakening roll-off above 93% maxRpm
    if (rpm > maxRpm * 0.93) {
      const fade = Math.max(0.72, 1 - ((rpm - maxRpm * 0.93) / (maxRpm * 0.07)) * 0.25);
      torque *= fade;
    }
    return { rpm, torque: Number(torque.toFixed(1)) };
  });
}

export function generateRegenCoastLut(
  coastRegenTorqueNm: number,
  regenMaxKw: number,
  motorMaxRpm: number
): LutPoint[] {
  const maxNm = Math.max(0, coastRegenTorqueNm);
  const maxKw = Math.max(5, regenMaxKw);
  const maxRpm = Math.max(4000, Math.round(motorMaxRpm));

  const sampleRpms = [0, 300, 600, 1000, 1500, 2200, 3000, 4000, 5000, 6500, 8000, maxRpm]
    .filter((r, i, arr) => r <= maxRpm && arr.indexOf(r) === i)
    .sort((a, b) => a - b);

  return sampleRpms.map((rpm) => {
    if (rpm <= 250 || maxNm <= 0) return { rpm, torque: 0 };
    const ramp = Math.min(1, (rpm - 250) / 950);
    const powerCapNm = (9549.2966 * maxKw) / Math.max(1, rpm);
    const torque = Math.min(maxNm * ramp, powerCapNm);
    return { rpm, torque: Number(torque.toFixed(1)) };
  });
}

export function computeDischargeTimeMs(batteryCapacityKwh: number, motorPeakKw: number): number {
  const kwh = Math.max(0.2, batteryCapacityKwh);
  const kw = Math.max(5, motorPeakKw);
  const seconds = (kwh * 3600) / kw;
  return Math.round(Math.max(4000, Math.min(3600000, seconds * 1000)));
}

// ============================================================================
// Unified CSP data/script.lua Composer (Preserves Custom Author Lua!)
// ============================================================================

function stripMarkedBlock(src: string, startMarker: string, endMarker: string): string {
  const sIdx = src.indexOf(startMarker);
  if (sIdx === -1) return src;
  const eIdx = src.indexOf(endMarker, sIdx);
  if (eIdx === -1) return src.slice(0, sIdx).trimEnd();
  const before = src.slice(0, sIdx).trimEnd();
  const after = src.slice(eIdx + endMarker.length).trimStart();
  if (!before) return after;
  if (!after) return before;
  return `${before}\n\n${after}`;
}

function buildAtLuaBlock(cfg: CspAtConfig, maxRpm: number, idleRpm: number): string {
  const safeMax = Math.max(4000, Math.round(maxRpm));
  const safeIdle = Math.max(600, Math.round(idleRpm));
  return [
    TX_BLOCK_START,
    `-- AC Car Studio: CSP Automatic Transmission (${cfg.gears}AT / Torque Converter)`,
    'local _acStudioTxMode = "csp_at"',
    `local _acStudioUseSharedAt = ${cfg.useCspSharedAtModule ? 'true' : 'false'}`,
    'local _acStudioSharedAtLoaded = false',
    'if _acStudioUseSharedAt then',
    "  local ok = pcall(require, 'shared/physics/automatic-transmission')",
    '  _acStudioSharedAtLoaded = ok and true or false',
    'end',
    '',
    'local _atState = {',
    '  cooldown = 0,',
    '  manualOverride = false,',
    `  maxRpm = ${safeMax},`,
    `  idleRpm = ${safeIdle},`,
    `  gears = ${cfg.gears},`,
    `  shiftTime = ${cfg.shiftTimeSec.toFixed(3)},`,
    `  lockRatioGap = ${cfg.lockRatioGap.toFixed(3)},`,
    `  creepStrength = ${cfg.creepStrength.toFixed(3)},`,
    `  kickdownGas = ${cfg.kickdownGasThreshold.toFixed(3)},`,
    `  ecoUpPct = ${cfg.ecoUpshiftPct.toFixed(3)},`,
    `  sportUpPct = ${cfg.sportUpshiftPct.toFixed(3)},`,
    `  downPct = ${cfg.downshiftPct.toFixed(3)},`,
    `  allowManual = ${cfg.allowManualOverride ? 'true' : 'false'},`,
    '}',
    '',
    'local function _acStudioUpdateTx(dt)',
    '  if _acStudioSharedAtLoaded then return end',
    '  local car = ac.getCar(0)',
    '  local ph = ac.accessCarPhysics and ac.accessCarPhysics() or nil',
    '  if not car or not ph then return end',
    '  if _atState.cooldown > 0 then _atState.cooldown = _atState.cooldown - dt end',
    '',
    '  local gas = car.gas or 0',
    '  local brake = car.brake or 0',
    '  local speed = car.speedKmh or 0',
    '  local rpm = ph.rpm or car.rpm or 0',
    '  local gear = car.gear or 0',
    '  local sportMode = car.extraA == true',
    '',
    '  -- Torque-converter low-speed creep when in Drive and off brake',
    '  if gear >= 1 and brake < 0.05 and gas < 0.03 and speed < 14 and _atState.creepStrength > 0.01 then',
    '    local creep = _atState.creepStrength * (1 - speed / 14) * 0.14',
    '    if ph.gas ~= nil then ph.gas = math.max(ph.gas, creep) end',
    '  end',
    '',
    '  if _atState.allowManual and car.extraB == true then',
    '    return -- Manual / Paddle M-mode active (Extra B)',
    '  end',
    '',
    '  if gear < 1 or _atState.cooldown > 0 then return end',
    '',
    '  local upPct = _atState.ecoUpPct + (_atState.sportUpPct - _atState.ecoUpPct) * math.min(1, gas ^ 1.15)',
    '  if sportMode then upPct = math.min(0.97, upPct + 0.12) end',
    '  local upRpm = _atState.maxRpm * upPct',
    '  local dnRpm = _atState.maxRpm * (_atState.downPct + (sportMode and 0.10 or 0) + (gas > _atState.kickdownGas and 0.22 or 0))',
    '',
    '  if rpm >= upRpm and gear < _atState.gears and gas > 0.04 then',
    '    ph.requestedGearIndex = gear + 2',
    '    _atState.cooldown = math.max(0.28, _atState.shiftTime + 0.14)',
    '  elseif rpm <= dnRpm and gear > 1 and (brake > 0.08 or gas > _atState.kickdownGas or speed < 18) then',
    '    ph.requestedGearIndex = gear',
    '    _atState.cooldown = math.max(0.24, _atState.shiftTime + 0.10)',
    '  end',
    'end',
    TX_BLOCK_END,
  ].join('\n');
}

function buildCvtLuaBlock(cfg: CspCvtConfig, maxRpm: number, idleRpm: number): string {
  const safeMax = Math.max(4500, Math.round(maxRpm));
  const safeIdle = Math.max(600, Math.round(idleRpm));
  const steps = Math.min(16, Math.max(8, Math.round(cfg.virtualSteps)));
  return [
    TX_BLOCK_START,
    `-- AC Car Studio: CSP Continuously Variable Transmission (CVT / ${steps} virtual steps)`,
    'local _acStudioTxMode = "csp_cvt"',
    'local _cvtState = {',
    '  cooldown = 0,',
    '  smoothedGas = 0,',
    '  stepPhase = 0,',
    `  steps = ${steps},`,
    `  maxRpm = ${safeMax},`,
    `  idleRpm = ${safeIdle},`,
    `  cruiseRpm = ${Math.round(cfg.cruiseRpm)},`,
    `  midLoadRpm = ${Math.round(cfg.midLoadRpm)},`,
    `  peakPowerRpm = ${Math.round(cfg.peakPowerRpm)},`,
    `  steppedMode = ${cfg.steppedShiftMode ? 'true' : 'false'},`,
    `  steppedCount = ${Math.min(8, Math.max(5, Math.round(cfg.steppedShiftCount)))},`,
    `  engineBrakeGain = ${cfg.engineBrakeGain.toFixed(3)},`,
    `  responseRate = ${cfg.responseRate.toFixed(3)},`,
    '}',
    '',
    'local function _acStudioUpdateTx(dt)',
    '  local car = ac.getCar(0)',
    '  local ph = ac.accessCarPhysics and ac.accessCarPhysics() or nil',
    '  if not car or not ph then return end',
    '  if _cvtState.cooldown > 0 then _cvtState.cooldown = _cvtState.cooldown - dt end',
    '',
    '  local gas = car.gas or 0',
    '  local brake = car.brake or 0',
    '  local speed = car.speedKmh or 0',
    '  local rpm = ph.rpm or car.rpm or 0',
    '  local gear = car.gear or 0',
    '  local sportMode = car.extraA == true',
    '',
    '  -- Smooth throttle demand filter to prevent ratio hunting',
    '  local alpha = math.min(1, dt * (2.5 + _cvtState.responseRate * 7.5))',
    '  _cvtState.smoothedGas = _cvtState.smoothedGas + (gas - _cvtState.smoothedGas) * alpha',
    '  local g = _cvtState.smoothedGas',
    '',
    '  -- Low-speed CVT torque-converter creep',
    '  if gear >= 1 and brake < 0.05 and gas < 0.02 and speed < 10 then',
    '    if ph.gas ~= nil then ph.gas = math.max(ph.gas, (1 - speed / 10) * 0.06) end',
    '  end',
    '',
    '  if gear < 1 or _cvtState.cooldown > 0 then return end',
    '',
    '  -- Compute continuous target RPM curve (Cruise -> MidLoad -> Peak Power)',
    '  local targetRpm',
    '  if g < 0.5 then',
    '    local t = g / 0.5',
    '    targetRpm = _cvtState.cruiseRpm + (_cvtState.midLoadRpm - _cvtState.cruiseRpm) * t',
    '  else',
    '    local t = (g - 0.5) / 0.5',
    '    targetRpm = _cvtState.midLoadRpm + (_cvtState.peakPowerRpm - _cvtState.midLoadRpm) * t',
    '  end',
    '  if sportMode then',
    '    targetRpm = math.min(_cvtState.maxRpm * 0.96, targetRpm * 1.14)',
    '  end',
    '  if brake > 0.10 and _cvtState.engineBrakeGain > 0.05 and speed > 22 then',
    '    targetRpm = math.max(targetRpm, _cvtState.midLoadRpm * (0.72 + brake * 0.45 * _cvtState.engineBrakeGain))',
    '  end',
    '',
    '  -- Optional Simulated Stepped-Shift Sport CVT (D-Step) under heavy throttle',
    '  local hysteresis = 260',
    '  if (_cvtState.steppedMode or sportMode) and gas > 0.72 then',
    '    hysteresis = 420',
    '    targetRpm = math.min(_cvtState.maxRpm * 0.94, _cvtState.peakPowerRpm * 1.03)',
    '  end',
    '',
    '  -- Move continuously through dense virtual pulley ratios',
    '  local stepDelay = math.max(0.05, 0.20 - _cvtState.responseRate * 0.14)',
    '  if speed < 14 and gear > 1 then',
    '    ph.requestedGearIndex = 2 -- Reset to Low pulley ratio at stop',
    '    _cvtState.cooldown = stepDelay',
    '  elseif rpm > targetRpm + hysteresis and gear < _cvtState.steps then',
    '    ph.requestedGearIndex = gear + 2 -- Shift toward Overdrive (longer ratio)',
    '    _cvtState.cooldown = stepDelay',
    '  elseif rpm < targetRpm - hysteresis and gear > 1 and (gas > 0.06 or brake > 0.12) then',
    '    ph.requestedGearIndex = gear -- Shift toward Low (shorter ratio)',
    '    _cvtState.cooldown = stepDelay',
    '  end',
    'end',
    TX_BLOCK_END,
  ].join('\n');
}

function buildHybridLuaBlock(cfg: HybridSystemConfig): string {
  return [
    HYBRID_BLOCK_START,
    `-- AC Car Studio: CSP Hybrid Assist & Regenerative Braking Helper (${cfg.presetId})`,
    'local _hybridState = {',
    `  evLowSpeedAssist = ${cfg.evLowSpeedAssist ? 'true' : 'false'},`,
    `  coastRegenNm = ${Math.round(cfg.coastRegenTorqueNm)},`,
    `  motorPeakKw = ${Math.round(cfg.motorPeakKw)},`,
    `  layout = "${cfg.motorDriveLayout}",`,
    '}',
    '',
    'local function _acStudioUpdateHybrid(dt)',
    '  local car = ac.getCar(0)',
    '  local ph = ac.accessCarPhysics and ac.accessCarPhysics() or nil',
    '  if not car or not ph then return end',
    '  local speed = car.speedKmh or 0',
    '  local gas = car.gas or 0',
    '  local brake = car.brake or 0',
    '  -- Smooth regenerative deceleration blend on lift-off & light braking',
    '  if _hybridState.evLowSpeedAssist and speed > 8 and gas < 0.03 and brake < 0.05 and _hybridState.coastRegenNm > 20 then',
    '    local regenBlend = math.min(0.14, (_hybridState.coastRegenNm / 220) * 0.10)',
    '    if ph.brake ~= nil and ph.brake < regenBlend then',
    '      ph.brake = regenBlend',
    '    end',
    '  end',
    'end',
    HYBRID_BLOCK_END,
  ].join('\n');
}

function buildDispatchLuaBlock(hasTx: boolean, hasHybrid: boolean): string {
  const calls: string[] = [];
  if (hasTx) calls.push('  _acStudioUpdateTx(dt)');
  if (hasHybrid) calls.push('  _acStudioUpdateHybrid(dt)');
  return [
    DISPATCH_BLOCK_START,
    'local _acStudioPrevUpdate = script and script.update or nil',
    'function script.update(dt)',
    '  if _acStudioPrevUpdate then _acStudioPrevUpdate(dt) end',
    ...calls,
    'end',
    DISPATCH_BLOCK_END,
  ].join('\n');
}

export function composeUnifiedCspScriptLua(
  existingScript: string | undefined,
  txConfig: { mode: TransmissionMode; at: CspAtConfig; cvt: CspCvtConfig; maxRpm: number; idleRpm: number } | null,
  hybridConfig: HybridSystemConfig | null
): string | null {
  let base = existingScript ?? '';
  base = stripMarkedBlock(base, TX_BLOCK_START, TX_BLOCK_END);
  base = stripMarkedBlock(base, HYBRID_BLOCK_START, HYBRID_BLOCK_END);
  base = stripMarkedBlock(base, DISPATCH_BLOCK_START, DISPATCH_BLOCK_END);
  base = base.trim();

  const hasTx = !!txConfig && (txConfig.mode === 'csp_at' || txConfig.mode === 'csp_cvt');
  const hasHybrid = !!hybridConfig && hybridConfig.enabled && hybridConfig.evLowSpeedAssist;

  if (!hasTx && !hasHybrid) {
    return base.length > 0 ? base + '\n' : null;
  }

  const parts: string[] = [];
  if (base.length > 0) parts.push(base);
  if (hasTx && txConfig) {
    parts.push(
      txConfig.mode === 'csp_at'
        ? buildAtLuaBlock(txConfig.at, txConfig.maxRpm, txConfig.idleRpm)
        : buildCvtLuaBlock(txConfig.cvt, txConfig.maxRpm, txConfig.idleRpm)
    );
  }
  if (hasHybrid && hybridConfig) {
    parts.push(buildHybridLuaBlock(hybridConfig));
  }
  parts.push(buildDispatchLuaBlock(hasTx, hasHybrid));

  return parts.join('\n\n') + '\n';
}

// ============================================================================
// Parse & Apply CSP Transmission (MT / Sequential / CSP AT / CSP CVT)
// ============================================================================

export function detectTransmissionMode(files: Record<string, string>): TransmissionMode {
  const dt = files['drivetrain.ini'] ?? '';
  const lua = files['script.lua'] ?? '';
  if (hasIniSection(dt, 'SCRIPT_CVT') || lua.includes('_acStudioTxMode = "csp_cvt"')) {
    return 'csp_cvt';
  }
  if (
    hasIniSection(dt, 'SCRIPT_AUTOMATIC_GEARBOX') ||
    lua.includes('_acStudioTxMode = "csp_at"') ||
    lua.includes('shared/physics/automatic-transmission')
  ) {
    return 'csp_at';
  }
  const supportsShifter = getIniNumber(dt, 'GEARBOX', 'SUPPORTS_SHIFTER', 1);
  return supportsShifter === 0 ? 'sequential' : 'manual';
}

export function parseCspTransmissionFromFiles(
  files: Record<string, string>,
  maxRpm = 7500,
  idleRpm = 900
): CspTransmissionConfig {
  const dt = files['drivetrain.ini'] ?? '';
  const mode = detectTransmissionMode(files);
  const defAt = createDefaultAtConfig();
  const defCvt = createDefaultCvtConfig(maxRpm, idleRpm);

  const gearCount = Math.min(16, Math.max(4, Math.round(getIniNumber(dt, 'GEARS', 'COUNT', 6))));
  const firstRatio = Math.abs(getIniNumber(dt, 'GEARS', 'GEAR_1', defCvt.maxRatio));
  const lastRatio = Math.abs(getIniNumber(dt, 'GEARS', `GEAR_${gearCount}`, defCvt.minRatio));

  const at: CspAtConfig = {
    gears: Math.min(10, Math.max(4, mode === 'csp_at' ? gearCount : defAt.gears)),
    shiftTimeSec: getIniNumber(dt, 'SCRIPT_AUTOMATIC_GEARBOX', 'SHIFT_TIME', defAt.shiftTimeSec),
    lockRatioGap: getIniNumber(dt, 'SCRIPT_AUTOMATIC_GEARBOX', 'LOCK_RATIO_GAP', defAt.lockRatioGap),
    creepStrength: getIniNumber(dt, 'SCRIPT_AUTOMATIC_GEARBOX', 'CREEP_STRENGTH', defAt.creepStrength),
    kickdownGasThreshold: getIniNumber(
      dt,
      'SCRIPT_AUTOMATIC_GEARBOX',
      'KICKDOWN_GAS',
      defAt.kickdownGasThreshold
    ),
    ecoUpshiftPct: getIniNumber(dt, 'SCRIPT_AUTOMATIC_GEARBOX', 'ECO_UP_PCT', defAt.ecoUpshiftPct),
    sportUpshiftPct: getIniNumber(dt, 'SCRIPT_AUTOMATIC_GEARBOX', 'SPORT_UP_PCT', defAt.sportUpshiftPct),
    downshiftPct: getIniNumber(dt, 'SCRIPT_AUTOMATIC_GEARBOX', 'DOWN_PCT', defAt.downshiftPct),
    brakeDamageThresholdKmh: getIniNumber(
      dt,
      'SCRIPT_AUTOMATIC_GEARBOX',
      'BRAKE_DAMAGE_THRESHOLD_KMH',
      defAt.brakeDamageThresholdKmh
    ),
    useCspSharedAtModule:
      getIniNumber(dt, 'SCRIPT_AUTOMATIC_GEARBOX', 'USE_SHARED_MODULE', 1) === 1,
    allowManualOverride:
      getIniNumber(dt, 'SCRIPT_AUTOMATIC_GEARBOX', 'ALLOW_MANUAL', 1) === 1,
  };

  const cvt: CspCvtConfig = {
    minRatio: getIniNumber(dt, 'SCRIPT_CVT', 'MIN_RATIO', mode === 'csp_cvt' ? lastRatio : defCvt.minRatio),
    maxRatio: getIniNumber(dt, 'SCRIPT_CVT', 'MAX_RATIO', mode === 'csp_cvt' ? firstRatio : defCvt.maxRatio),
    finalRatio: getIniNumber(dt, 'GEARS', 'FINAL', defCvt.finalRatio),
    virtualSteps: Math.min(
      16,
      Math.max(8, Math.round(getIniNumber(dt, 'SCRIPT_CVT', 'VIRTUAL_STEPS', mode === 'csp_cvt' ? gearCount : defCvt.virtualSteps)))
    ),
    cruiseRpm: getIniNumber(dt, 'SCRIPT_CVT', 'CRUISE_RPM', defCvt.cruiseRpm),
    midLoadRpm: getIniNumber(dt, 'SCRIPT_CVT', 'MID_LOAD_RPM', defCvt.midLoadRpm),
    peakPowerRpm: getIniNumber(dt, 'SCRIPT_CVT', 'PEAK_POWER_RPM', defCvt.peakPowerRpm),
    steppedShiftMode: getIniNumber(dt, 'SCRIPT_CVT', 'STEPPED_SHIFT_MODE', 0) === 1,
    steppedShiftCount: getIniNumber(dt, 'SCRIPT_CVT', 'STEPPED_SHIFT_COUNT', defCvt.steppedShiftCount),
    engineBrakeGain: getIniNumber(dt, 'SCRIPT_CVT', 'ENGINE_BRAKE_GAIN', defCvt.engineBrakeGain),
    responseRate: getIniNumber(dt, 'SCRIPT_CVT', 'RESPONSE_RATE', defCvt.responseRate),
  };

  return { mode, at, cvt };
}

export function applyCspTransmissionToFiles(
  files: Record<string, string>,
  config: CspTransmissionConfig,
  options?: { maxRpm?: number; idleRpm?: number; regenerateGearRatios?: boolean }
): Record<string, string> {
  const next: Record<string, string> = { ...files };
  const engineIni = next['engine.ini'] ?? '';
  const maxRpm = options?.maxRpm ?? getIniNumber(engineIni, 'ENGINE_DATA', 'LIMITER', 7500);
  const idleRpm = options?.idleRpm ?? getIniNumber(engineIni, 'ENGINE_DATA', 'MINIMUM', 900);

  let carIni = next['car.ini'] ?? '';
  let dtIni = next['drivetrain.ini'] ?? '';
  const existingHybrid = parseHybridSystemFromFiles(next, maxRpm);

  if (config.mode === 'csp_at') {
    // Enable CSP Extended Physics in car.ini
    carIni = setIniValue(carIni, 'HEADER', 'VERSION', 'extended-2');
    next['car.ini'] = carIni;

    dtIni = removeIniSection(dtIni, 'SCRIPT_CVT');

    const at = config.at;
    const prevCount = Math.round(getIniNumber(dtIni, 'GEARS', 'COUNT', 6));
    const updates: Array<[string, string, string | number]> = [
      ['GEARS', 'COUNT', at.gears],
      ['GEARBOX', 'CHANGE_UP_TIME', Math.round(at.shiftTimeSec * 1000)],
      ['GEARBOX', 'CHANGE_DN_TIME', Math.round(at.shiftTimeSec * 1000 * 1.1)],
      ['GEARBOX', 'AUTO_CUTOFF_TIME', 0],
      ['GEARBOX', 'SUPPORTS_SHIFTER', 1],
      ['SUPPORTS_SHIFTER', 'SUPPORTS_SHIFTER', 1],
      ['AUTOCLUTCH', 'UPSHIFT_PROFILE', 'NONE'],
      ['AUTOCLUTCH', 'DOWNSHIFT_PROFILE', 'NONE'],
      ['AUTOCLUTCH', 'USE_ON_CHANGES', 1],
      ['AUTOCLUTCH', 'MIN_RPM', Math.round(idleRpm * 1.15)],
      ['AUTOCLUTCH', 'MAX_RPM', Math.round(idleRpm * 2.1)],
      ['AUTOCLUTCH', 'FORCED_ON', 1],
      ['AUTO_SHIFTER', 'UP', Math.round(maxRpm * at.sportUpshiftPct)],
      ['AUTO_SHIFTER', 'DOWN', Math.round(maxRpm * at.downshiftPct)],
      ['AUTO_SHIFTER', 'SLIP_THRESHOLD', '1.08'],
      ['AUTO_SHIFTER', 'GAS_CUTOFF_TIME', '0.04'],
      ['SCRIPT_AUTOMATIC_GEARBOX', 'SHIFT_TIME', at.shiftTimeSec.toFixed(3)],
      ['SCRIPT_AUTOMATIC_GEARBOX', 'LOCK_RATIO_GAP', at.lockRatioGap.toFixed(3)],
      ['SCRIPT_AUTOMATIC_GEARBOX', 'BRAKE_DAMAGE_THRESHOLD_KMH', Math.round(at.brakeDamageThresholdKmh)],
      ['SCRIPT_AUTOMATIC_GEARBOX', 'CREEP_STRENGTH', at.creepStrength.toFixed(2)],
      ['SCRIPT_AUTOMATIC_GEARBOX', 'KICKDOWN_GAS', at.kickdownGasThreshold.toFixed(2)],
      ['SCRIPT_AUTOMATIC_GEARBOX', 'ECO_UP_PCT', at.ecoUpshiftPct.toFixed(2)],
      ['SCRIPT_AUTOMATIC_GEARBOX', 'SPORT_UP_PCT', at.sportUpshiftPct.toFixed(2)],
      ['SCRIPT_AUTOMATIC_GEARBOX', 'DOWN_PCT', at.downshiftPct.toFixed(2)],
      ['SCRIPT_AUTOMATIC_GEARBOX', 'USE_SHARED_MODULE', at.useCspSharedAtModule ? 1 : 0],
      ['SCRIPT_AUTOMATIC_GEARBOX', 'ALLOW_MANUAL', at.allowManualOverride ? 1 : 0],
    ];

    if (options?.regenerateGearRatios || prevCount !== at.gears || prevCount > 10) {
      const table = generateAtRatioTable(at.gears);
      updates.push(['GEARS', 'FINAL', table.final.toFixed(3)]);
      for (let g = 1; g <= at.gears; g++) {
        updates.push(['GEARS', `GEAR_${g}`, table.ratios[g - 1].toFixed(3)]);
      }
    }

    next['drivetrain.ini'] = setIniValues(dtIni, updates);
  } else if (config.mode === 'csp_cvt') {
    carIni = setIniValue(carIni, 'HEADER', 'VERSION', 'extended-2');
    next['car.ini'] = carIni;

    dtIni = removeIniSection(dtIni, 'SCRIPT_AUTOMATIC_GEARBOX');
    dtIni = removeIniSection(dtIni, 'SUPPORTS_SHIFTER');

    const cvt = config.cvt;
    const ratios = generateCvtRatioTable(cvt);
    const updates: Array<[string, string, string | number]> = [
      ['GEARS', 'COUNT', ratios.length],
      ['GEARS', 'FINAL', cvt.finalRatio.toFixed(3)],
      ['GEARBOX', 'CHANGE_UP_TIME', 12],
      ['GEARBOX', 'CHANGE_DN_TIME', 12],
      ['GEARBOX', 'AUTO_CUTOFF_TIME', 0],
      ['GEARBOX', 'SUPPORTS_SHIFTER', 0],
      ['GEARBOX', 'INERTIA', '0.008'],
      ['AUTOCLUTCH', 'UPSHIFT_PROFILE', 'NONE'],
      ['AUTOCLUTCH', 'DOWNSHIFT_PROFILE', 'NONE'],
      ['AUTOCLUTCH', 'USE_ON_CHANGES', 0],
      ['AUTOCLUTCH', 'MIN_RPM', Math.round(idleRpm * 1.1)],
      ['AUTOCLUTCH', 'MAX_RPM', Math.round(idleRpm * 1.9)],
      ['AUTOCLUTCH', 'FORCED_ON', 1],
      ['AUTO_SHIFTER', 'UP', Math.round(cvt.peakPowerRpm)],
      ['AUTO_SHIFTER', 'DOWN', Math.round(cvt.cruiseRpm)],
      ['AUTO_SHIFTER', 'SLIP_THRESHOLD', '1.02'],
      ['AUTO_SHIFTER', 'GAS_CUTOFF_TIME', '0.00'],
      ['SCRIPT_CVT', 'MIN_RATIO', cvt.minRatio.toFixed(3)],
      ['SCRIPT_CVT', 'MAX_RATIO', cvt.maxRatio.toFixed(3)],
      ['SCRIPT_CVT', 'VIRTUAL_STEPS', ratios.length],
      ['SCRIPT_CVT', 'CRUISE_RPM', Math.round(cvt.cruiseRpm)],
      ['SCRIPT_CVT', 'MID_LOAD_RPM', Math.round(cvt.midLoadRpm)],
      ['SCRIPT_CVT', 'PEAK_POWER_RPM', Math.round(cvt.peakPowerRpm)],
      ['SCRIPT_CVT', 'STEPPED_SHIFT_MODE', cvt.steppedShiftMode ? 1 : 0],
      ['SCRIPT_CVT', 'STEPPED_SHIFT_COUNT', Math.round(cvt.steppedShiftCount)],
      ['SCRIPT_CVT', 'ENGINE_BRAKE_GAIN', cvt.engineBrakeGain.toFixed(2)],
      ['SCRIPT_CVT', 'RESPONSE_RATE', cvt.responseRate.toFixed(2)],
    ];

    for (let i = 0; i < ratios.length; i++) {
      updates.push(['GEARS', `GEAR_${i + 1}`, ratios[i].toFixed(4)]);
    }

    next['drivetrain.ini'] = setIniValues(dtIni, updates);
  } else {
    // Revert cleanly to Manual or Sequential
    dtIni = removeIniSection(dtIni, 'SCRIPT_AUTOMATIC_GEARBOX');
    dtIni = removeIniSection(dtIni, 'SCRIPT_CVT');
    dtIni = removeIniSection(dtIni, 'SUPPORTS_SHIFTER');

    const prevCount = Math.round(getIniNumber(dtIni, 'GEARS', 'COUNT', 6));
    const updates: Array<[string, string, string | number]> = [
      ['GEARBOX', 'SUPPORTS_SHIFTER', config.mode === 'manual' ? 1 : 0],
      ['GEARBOX', 'CHANGE_UP_TIME', config.mode === 'manual' ? 130 : 65],
      ['GEARBOX', 'CHANGE_DN_TIME', config.mode === 'manual' ? 160 : 80],
      ['AUTOCLUTCH', 'FORCED_ON', 0],
    ];
    if (prevCount > 8) {
      const six = generateAtRatioTable(6);
      updates.push(['GEARS', 'COUNT', 6]);
      updates.push(['GEARS', 'FINAL', '3.900']);
      for (let g = 1; g <= 6; g++) {
        updates.push(['GEARS', `GEAR_${g}`, six.ratios[g - 1].toFixed(3)]);
      }
    }
    next['drivetrain.ini'] = setIniValues(dtIni, updates);
  }

  // Update unified CSP data/script.lua (preserving Hybrid & any author code)
  const composedLua = composeUnifiedCspScriptLua(
    next['script.lua'],
    { ...config, maxRpm, idleRpm },
    existingHybrid
  );
  if (composedLua === null) {
    delete next['script.lua'];
  } else {
    next['script.lua'] = composedLua;
  }

  return next;
}

// ============================================================================
// Parse & Apply Hybrid System (Electric Motor + Regenerative Braking)
// ============================================================================

export function parseHybridSystemFromFiles(
  files: Record<string, string>,
  carMaxRpm = 7500
): HybridSystemConfig {
  const ersIni = files['ers.ini'];
  if (!ersIni || !ersIni.trim()) {
    return createDefaultHybridConfig(carMaxRpm);
  }

  const powerLutName = getIniValue(ersIni, 'KINETIC', 'TORQUE_CURVE', 'kers_torque_power.lut').trim();
  const coastLutName = getIniValue(ersIni, 'KINETIC', 'COAST_CURVE', 'kers_torque_coast.lut').trim();
  const powerPts = parseLut(files[powerLutName] ?? files['kers_torque_power.lut'] ?? '');
  const coastPts = parseLut(files[coastLutName] ?? files['kers_torque_coast.lut'] ?? '');

  let motorPeakTorqueNm = 0;
  let motorPeakKw = 0;
  let motorMaxRpm = carMaxRpm;
  for (const pt of powerPts) {
    if (pt.torque > motorPeakTorqueNm) motorPeakTorqueNm = pt.torque;
    const kw = (pt.torque * pt.rpm) / 9549.2966;
    if (kw > motorPeakKw) motorPeakKw = kw;
    if (pt.rpm > motorMaxRpm) motorMaxRpm = pt.rpm;
  }

  let coastRegenTorqueNm = 0;
  let regenMaxKw = 0;
  for (const pt of coastPts) {
    const absT = Math.abs(pt.torque);
    if (absT > coastRegenTorqueNm) coastRegenTorqueNm = absT;
    const kw = (absT * pt.rpm) / 9549.2966;
    if (kw > regenMaxKw) regenMaxKw = kw;
  }

  const safeKw = Math.max(10, Math.round(motorPeakKw || 95));
  const safeNm = Math.max(40, Math.round(motorPeakTorqueNm || 240));
  const dischargeMs = getIniNumber(ersIni, 'KINETIC', 'DISCHARGE_TIME', 60000);
  const batteryCapacityKwh = Number(
    Math.max(0.5, Math.min(25, ((dischargeMs / 1000) * safeKw) / 3600)).toFixed(2)
  );
  const regenChargeK = getIniNumber(ersIni, 'KINETIC', 'CHARGE_K', 0.00022);
  const maxKjPerLap = getIniNumber(ersIni, 'KINETIC', 'MAX_KJ_PER_LAP', 9999999);
  const hasPushToPass = getIniNumber(ersIni, 'KINETIC', 'HAS_BUTTON_OVERRIDE', 1) === 1;
  const brakeRearCorrection = getIniNumber(ersIni, 'KINETIC', 'BRAKE_REAR_CORRECTION', 1) === 1;
  const heatRecoveryK = getIniNumber(ersIni, 'HEAT', 'CHARGE_K', 0);
  const defaultCtrl = getIniNumber(ersIni, 'KINETIC', 'DEFAULT_CONTROLLER', 1);
  const defaultModeIndex: 0 | 1 | 2 = defaultCtrl === 0 ? 0 : defaultCtrl === 2 ? 2 : 1;

  const presetMeta = getIniValue(ersIni, 'AC_CAR_STUDIO_HYBRID', 'PRESET_ID', 'custom') as HybridPresetId;
  const layoutMeta = getIniValue(
    ersIni,
    'AC_CAR_STUDIO_HYBRID',
    'DRIVE_LAYOUT',
    'crank_integrated'
  ) as HybridDriveLayout;
  const evLowSpeedAssist =
    getIniNumber(ersIni, 'AC_CAR_STUDIO_HYBRID', 'EV_LOW_SPEED_ASSIST', 1) === 1;

  return {
    enabled: true,
    presetId: presetMeta || 'custom',
    motorPeakKw: safeKw,
    motorPeakTorqueNm: safeNm,
    motorMaxRpm: Math.max(5000, Math.round(motorMaxRpm)),
    batteryCapacityKwh,
    maxKjPerLap,
    hasPushToPass,
    motorDriveLayout: layoutMeta || 'crank_integrated',
    regenMaxKw: Math.max(10, Math.round(regenMaxKw || safeKw * 0.75)),
    regenChargeK,
    coastRegenTorqueNm: Math.round(coastRegenTorqueNm),
    brakeRearCorrection,
    heatRecoveryK,
    evLowSpeedAssist,
    defaultModeIndex,
  };
}

function buildCtrlErsIni(
  name: string,
  gasLutInline: string,
  speedLutInline?: string
): string {
  const lines = [
    '[HEADER]',
    `NAME=${name}`,
    '',
    '[CONTROLLER_0]',
    'INPUT=GAS',
    'COMBINATOR=ADD',
    `LUT=${gasLutInline}`,
    'FILTER=0.985',
    'UP_LIMIT=1',
    'DOWN_LIMIT=0',
  ];
  if (speedLutInline) {
    lines.push(
      '',
      '[CONTROLLER_1]',
      'INPUT=SPEED_KMH',
      'COMBINATOR=MULT',
      `LUT=${speedLutInline}`,
      'FILTER=0.98',
      'UP_LIMIT=1',
      'DOWN_LIMIT=0'
    );
  }
  return lines.join('\n') + '\n';
}

export function applyHybridSystemToFiles(
  files: Record<string, string>,
  config: HybridSystemConfig
): Record<string, string> {
  const next: Record<string, string> = { ...files };
  const engineIni = next['engine.ini'] ?? '';
  const maxRpm = getIniNumber(engineIni, 'ENGINE_DATA', 'LIMITER', 7500);
  const idleRpm = getIniNumber(engineIni, 'ENGINE_DATA', 'MINIMUM', 900);
  const existingTx = parseCspTransmissionFromFiles(next, maxRpm, idleRpm);

  if (!config.enabled) {
    for (const fileName of HYBRID_MANAGED_FILES) {
      delete next[fileName];
    }
    const composedLua = composeUnifiedCspScriptLua(
      next['script.lua'],
      { ...existingTx, maxRpm, idleRpm },
      null
    );
    if (composedLua === null) {
      delete next['script.lua'];
    } else {
      next['script.lua'] = composedLua;
    }
    return next;
  }

  const powerLut = generateMotorTorqueLut(
    config.motorPeakKw,
    config.motorPeakTorqueNm,
    config.motorMaxRpm
  );
  const coastLut = generateRegenCoastLut(
    config.coastRegenTorqueNm,
    config.regenMaxKw,
    config.motorMaxRpm
  );
  const dischargeTimeMs = computeDischargeTimeMs(config.batteryCapacityKwh, config.motorPeakKw);

  const ersIniLines = [
    '[HEADER]',
    'VERSION=1',
    '',
    '[KINETIC]',
    `CHARGE_K=${config.regenChargeK.toFixed(6)}`,
    'TORQUE_CURVE=kers_torque_power.lut',
    'COAST_CURVE=kers_torque_coast.lut',
    `DISCHARGE_TIME=${dischargeTimeMs}`,
    `HAS_BUTTON_OVERRIDE=${config.hasPushToPass ? 1 : 0}`,
    `MAX_KJ_PER_LAP=${Math.round(config.maxKjPerLap)}`,
    `DEFAULT_CONTROLLER=${config.defaultModeIndex}`,
    `BRAKE_REAR_CORRECTION=${config.brakeRearCorrection ? 1 : 0}`,
    '',
    '[HEAT]',
    `CHARGE_K=${config.heatRecoveryK.toFixed(6)}`,
    `TORQUE_PERC=${config.heatRecoveryK > 0 ? 15 : 0}`,
    '',
    '[COCKPIT_CONTROLS]',
    'RECOVERY=1',
    'DELIVERY_PROFILE=1',
    `MGU_H_MODE=${config.heatRecoveryK > 0 ? 1 : 0}`,
    '',
    '[AC_CAR_STUDIO_HYBRID]',
    `PRESET_ID=${config.presetId}`,
    `DRIVE_LAYOUT=${config.motorDriveLayout}`,
    `EV_LOW_SPEED_ASSIST=${config.evLowSpeedAssist ? 1 : 0}`,
  ];

  next['ers.ini'] = ersIniLines.join('\n') + '\n';
  next['kers_torque_power.lut'] = serializeLut(powerLut);
  next['kers_torque_coast.lut'] = serializeLut(coastLut);

  // 3 Cockpit-Selectable Hybrid Delivery Profiles
  next['ctrl_ers_0.ini'] = buildCtrlErsIni(
    'Eco / Charge',
    '(|0=0|0.40=0.05|0.75=0.20|1.0=0.45|)',
    '(|0=0.5|20=1.0|140=0.6|240=0.2|)'
  );
  next['ctrl_ers_1.ini'] = buildCtrlErsIni(
    'Normal / Hybrid',
    '(|0=0|0.15=0.15|0.50=0.55|0.85=0.90|1.0=1.0|)',
    '(|0=0.8|15=1.0|260=0.9|340=0.6|)'
  );
  next['ctrl_ers_2.ini'] = buildCtrlErsIni(
    'Sport / Attack',
    '(|0=0|0.10=0.35|0.35=0.80|0.65=1.0|1.0=1.0|)',
    '(|0=1.0|350=1.0|)'
  );

  // If EV low-speed CSP assist is enabled, activate CSP extended physics + unified script.lua
  if (config.evLowSpeedAssist) {
    next['car.ini'] = setIniValue(next['car.ini'] ?? '', 'HEADER', 'VERSION', 'extended-2');
  }

  const composedLua = composeUnifiedCspScriptLua(
    next['script.lua'],
    { ...existingTx, maxRpm, idleRpm },
    config
  );
  if (composedLua === null) {
    delete next['script.lua'];
  } else {
    next['script.lua'] = composedLua;
  }

  return next;
}
