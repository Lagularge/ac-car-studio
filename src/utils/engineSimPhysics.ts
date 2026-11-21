import type { DynoPoint, LutPoint } from '../types/ac';
import { serializeLut, setIniValues, removeIniSection } from './iniHelpers';
import { getPowerLutFilename } from './physicsCalc';

export type EngineLayout =
  | 'I3'
  | 'I4'
  | 'I5'
  | 'I6'
  | 'B4'
  | 'B6'
  | 'V6'
  | 'V8_CROSS'
  | 'V8_FLAT'
  | 'V10'
  | 'V12'
  | 'ROTARY_2'
  | 'ROTARY_3'
  | 'ROTARY_4';

export type AspirationType = 'NA' | 'SINGLE_TURBO' | 'TWIN_TURBO' | 'SUPERCHARGER';
export type FuelType = 'RON98' | 'RON100' | 'E85' | 'RACE110';
export type HeaderType = 'EQUAL' | 'UEL_BOXER' | 'UEL_MUSCLE' | 'LOG_MANIFOLD';

export interface EngineSimConfig {
  id: string;
  name: string;
  layout: EngineLayout;
  cylinders: number;
  bankAngleDeg: number;
  boreMm: number;
  strokeMm: number;
  conrodLengthMm: number;
  compressionRatio: number;
  intakeCamDurationDeg: number; // e.g. 240 - 310
  camLiftMm: number;            // e.g. 8.5 - 14.5
  vvtSwitchRpm: number;         // 0 = disabled, else e.g. 5800
  intakeRunnerLengthMm: number; // Helmholtz resonance tuning (180 - 520mm)
  intakeRunnerDiaMm: number;    // 36 - 62mm
  headerType: HeaderType;
  exhaustPrimaryMm: number;     // 450 - 950mm
  aspiration: AspirationType;
  maxBoostBar: number;
  turboRefRpm: number;
  turboGamma: number;
  fuelType: FuelType;
  targetAfr: number;            // e.g. 12.6 for WOT gasoline, 8.5 for E85
  ignitionAdvanceDeg: number;   // 16 - 38
  flywheelMassKg: number;       // 3.5 - 14
  idleRpm: number;
  redlineRpm: number;
}

export interface CycleSamplePoint {
  crankDeg: number;
  pressureBar: number;
  exhaustValveLift: number;
  instantTorqueNm: number;
}

export interface EngineSimResult {
  displacementCc: number;
  boreStrokeRatio: number;
  meanPistonSpeedAtRedlineMs: number;
  helmholtzPeakRpm: number;
  estimatedInertiaKgM2: number;
  peakPowerPs: number;
  peakPowerBhp: number;
  peakPowerRpm: number;
  peakTorqueNm: number;
  peakTorqueRpm: number;
  peakVePct: number;
  thermalEfficiencyPct: number;
  firingAnglesDeg: number[];
  primaryLengthsMm: number[];
  dynoCurve: DynoPoint[];
  lutPoints: LutPoint[];
  cycleWave: CycleSamplePoint[];
}

export function getFiringAnglesForLayout(layout: EngineLayout, cylinders: number): number[] {
  switch (layout) {
    case 'I3':
      return [0, 240, 480];
    case 'I4':
      return [0, 180, 360, 540];
    case 'I5':
      return [0, 144, 288, 432, 576];
    case 'I6':
      return [0, 120, 240, 360, 480, 600];
    case 'B4':
      return [0, 180, 360, 540];
    case 'B6':
      return [0, 120, 240, 360, 480, 600];
    case 'V6':
      return [0, 120, 240, 360, 480, 600];
    case 'V8_CROSS':
      // Classic 90-deg crossplane V8 uneven bank pulses (L-R-L-L-R-L-R-R feel)
      // Slight acoustic asymmetry per bank + 90-deg intervals
      return [0, 90, 180, 270, 360, 450, 540, 630];
    case 'V8_FLAT':
      return [0, 90, 180, 270, 360, 450, 540, 630];
    case 'V10':
      // Odd-fire 90deg V10 (54/90 deg) vs 72deg even-fire -> iconic V10 howl
      return [0, 72, 144, 216, 288, 360, 432, 504, 576, 648];
    case 'V12':
      return [0, 60, 120, 180, 240, 300, 360, 420, 480, 540, 600, 660];
    case 'ROTARY_2':
      // Wankel 2-rotor fires 2 times per 360 crank deg = 4 times per 720 deg
      return [0, 180, 360, 540];
    case 'ROTARY_3':
      // 3-rotor fires 3 times per 360 deg = 6 times per 720 deg
      return [0, 120, 240, 360, 480, 600];
    case 'ROTARY_4':
      // 4-rotor 787B fires 4 times per 360 deg = 8 times per 720 deg
      return [0, 90, 180, 270, 360, 450, 540, 630];
    default: {
      const n = Math.max(1, cylinders);
      return Array.from({ length: n }, (_, i) => (i * 720) / n);
    }
  }
}

export function getPrimaryLengthsForConfig(config: EngineSimConfig): number[] {
  const base = config.exhaustPrimaryMm;
  const angles = getFiringAnglesForLayout(config.layout, config.cylinders);
  const n = angles.length;

  if (config.headerType === 'UEL_BOXER') {
    // Classic Subaru EJ unequal length header: left bank ~360mm longer than right bank
    return angles.map((_, idx) => (idx % 2 === 0 ? base * 0.72 : base * 1.48));
  }
  if (config.headerType === 'UEL_MUSCLE' || config.layout === 'V8_CROSS') {
    // Crossplane V8 dual-bank uneven pulse grouping creates iconic V8 burble
    const pattern = [0.82, 1.18, 0.92, 1.38, 1.25, 0.85, 1.44, 0.96];
    return angles.map((_, idx) => base * pattern[idx % pattern.length]);
  }
  if (config.headerType === 'LOG_MANIFOLD') {
    return angles.map((_, idx) => base * (0.55 + (idx / Math.max(1, n)) * 0.65));
  }
  // Equal length tuned headers (minor 1-3% natural variance)
  return angles.map((_, idx) => base * (0.985 + ((idx * 17) % 5) * 0.008));
}

export const ENGINE_SIM_PRESETS: EngineSimConfig[] = [
  {
    id: 'i4_turbo_20',
    name: '2.0L 直4 ターボ (SR20 / 4G63 系)',
    layout: 'I4',
    cylinders: 4,
    bankAngleDeg: 0,
    boreMm: 86.0,
    strokeMm: 86.0,
    conrodLengthMm: 136.3,
    compressionRatio: 8.8,
    intakeCamDurationDeg: 256,
    camLiftMm: 10.8,
    vvtSwitchRpm: 0,
    intakeRunnerLengthMm: 310,
    intakeRunnerDiaMm: 46,
    headerType: 'EQUAL',
    exhaustPrimaryMm: 540,
    aspiration: 'SINGLE_TURBO',
    maxBoostBar: 1.35,
    turboRefRpm: 4100,
    turboGamma: 2.1,
    fuelType: 'RON100',
    targetAfr: 11.8,
    ignitionAdvanceDeg: 24,
    flywheelMassKg: 6.8,
    idleRpm: 950,
    redlineRpm: 7800,
  },
  {
    id: 'i6_tt_26',
    name: '2.6L 直6 ツインターボ (RB26 / 2JZ 系)',
    layout: 'I6',
    cylinders: 6,
    bankAngleDeg: 0,
    boreMm: 86.0,
    strokeMm: 73.7,
    conrodLengthMm: 121.5,
    compressionRatio: 8.6,
    intakeCamDurationDeg: 264,
    camLiftMm: 10.6,
    vvtSwitchRpm: 0,
    intakeRunnerLengthMm: 290,
    intakeRunnerDiaMm: 45,
    headerType: 'EQUAL',
    exhaustPrimaryMm: 620,
    aspiration: 'TWIN_TURBO',
    maxBoostBar: 1.45,
    turboRefRpm: 4400,
    turboGamma: 1.9,
    fuelType: 'RON100',
    targetAfr: 11.8,
    ignitionAdvanceDeg: 25,
    flywheelMassKg: 7.4,
    idleRpm: 950,
    redlineRpm: 8400,
  },
  {
    id: 'b4_uel_20',
    name: '2.0L 水平対向4気筒 不等長ターボ (EJ20)',
    layout: 'B4',
    cylinders: 4,
    bankAngleDeg: 180,
    boreMm: 92.0,
    strokeMm: 75.0,
    conrodLengthMm: 130.5,
    compressionRatio: 8.5,
    intakeCamDurationDeg: 254,
    camLiftMm: 10.2,
    vvtSwitchRpm: 0,
    intakeRunnerLengthMm: 330,
    intakeRunnerDiaMm: 44,
    headerType: 'UEL_BOXER',
    exhaustPrimaryMm: 580,
    aspiration: 'SINGLE_TURBO',
    maxBoostBar: 1.30,
    turboRefRpm: 3900,
    turboGamma: 2.0,
    fuelType: 'RON100',
    targetAfr: 11.8,
    ignitionAdvanceDeg: 24,
    flywheelMassKg: 7.2,
    idleRpm: 900,
    redlineRpm: 8000,
  },
  {
    id: 'i4_vtec_20',
    name: '2.0L 直4 高回転 VTEC NA (F20C / K20A 系)',
    layout: 'I4',
    cylinders: 4,
    bankAngleDeg: 0,
    boreMm: 87.0,
    strokeMm: 84.0,
    conrodLengthMm: 153.0,
    compressionRatio: 11.7,
    intakeCamDurationDeg: 282,
    camLiftMm: 12.7,
    vvtSwitchRpm: 5900,
    intakeRunnerLengthMm: 235,
    intakeRunnerDiaMm: 50,
    headerType: 'EQUAL',
    exhaustPrimaryMm: 640,
    aspiration: 'NA',
    maxBoostBar: 0,
    turboRefRpm: 4500,
    turboGamma: 2.0,
    fuelType: 'RON100',
    targetAfr: 12.8,
    ignitionAdvanceDeg: 31,
    flywheelMassKg: 5.2,
    idleRpm: 1000,
    redlineRpm: 9000,
  },
  {
    id: 'v8_crossplane_62',
    name: '6.2L V8 クロスプレーン (アメリカンマッスル)',
    layout: 'V8_CROSS',
    cylinders: 8,
    bankAngleDeg: 90,
    boreMm: 103.25,
    strokeMm: 92.0,
    conrodLengthMm: 155.0,
    compressionRatio: 10.9,
    intakeCamDurationDeg: 248,
    camLiftMm: 13.8,
    vvtSwitchRpm: 0,
    intakeRunnerLengthMm: 360,
    intakeRunnerDiaMm: 54,
    headerType: 'UEL_MUSCLE',
    exhaustPrimaryMm: 740,
    aspiration: 'NA',
    maxBoostBar: 0,
    turboRefRpm: 4000,
    turboGamma: 2.0,
    fuelType: 'RON98',
    targetAfr: 12.7,
    ignitionAdvanceDeg: 28,
    flywheelMassKg: 10.5,
    idleRpm: 720,
    redlineRpm: 6800,
  },
  {
    id: 'v8_flatplane_45',
    name: '4.5L V8 フラットプレーン NA (イタリアン 9000RPM)',
    layout: 'V8_FLAT',
    cylinders: 8,
    bankAngleDeg: 90,
    boreMm: 94.0,
    strokeMm: 81.0,
    conrodLengthMm: 142.0,
    compressionRatio: 12.5,
    intakeCamDurationDeg: 288,
    camLiftMm: 13.2,
    vvtSwitchRpm: 6200,
    intakeRunnerLengthMm: 225,
    intakeRunnerDiaMm: 52,
    headerType: 'EQUAL',
    exhaustPrimaryMm: 610,
    aspiration: 'NA',
    maxBoostBar: 0,
    turboRefRpm: 5000,
    turboGamma: 2.0,
    fuelType: 'RON100',
    targetAfr: 12.8,
    ignitionAdvanceDeg: 32,
    flywheelMassKg: 5.5,
    idleRpm: 1150,
    redlineRpm: 9000,
  },
  {
    id: 'v10_na_52',
    name: '5.2L V10 NA (LFA / GT3 ハイトーン)',
    layout: 'V10',
    cylinders: 10,
    bankAngleDeg: 72,
    boreMm: 84.5,
    strokeMm: 92.8,
    conrodLengthMm: 152.0,
    compressionRatio: 12.7,
    intakeCamDurationDeg: 292,
    camLiftMm: 13.0,
    vvtSwitchRpm: 6000,
    intakeRunnerLengthMm: 215,
    intakeRunnerDiaMm: 50,
    headerType: 'EQUAL',
    exhaustPrimaryMm: 590,
    aspiration: 'NA',
    maxBoostBar: 0,
    turboRefRpm: 5000,
    turboGamma: 2.0,
    fuelType: 'RON100',
    targetAfr: 12.8,
    ignitionAdvanceDeg: 32,
    flywheelMassKg: 5.0,
    idleRpm: 1200,
    redlineRpm: 9200,
  },
  {
    id: 'v12_na_65',
    name: '6.5L V12 NA (ハイパーカー / F1 スクリーム)',
    layout: 'V12',
    cylinders: 12,
    bankAngleDeg: 65,
    boreMm: 95.0,
    strokeMm: 76.4,
    conrodLengthMm: 140.0,
    compressionRatio: 12.8,
    intakeCamDurationDeg: 296,
    camLiftMm: 13.5,
    vvtSwitchRpm: 6400,
    intakeRunnerLengthMm: 205,
    intakeRunnerDiaMm: 52,
    headerType: 'EQUAL',
    exhaustPrimaryMm: 560,
    aspiration: 'NA',
    maxBoostBar: 0,
    turboRefRpm: 5000,
    turboGamma: 2.0,
    fuelType: 'RACE110',
    targetAfr: 12.9,
    ignitionAdvanceDeg: 33,
    flywheelMassKg: 4.8,
    idleRpm: 1300,
    redlineRpm: 9500,
  },
  {
    id: 'rotary_13b_tt',
    name: '1.3L 2ローター ツインターボ (13B-REW)',
    layout: 'ROTARY_2',
    cylinders: 2,
    bankAngleDeg: 0,
    boreMm: 84.0,
    strokeMm: 78.0,
    conrodLengthMm: 120.0,
    compressionRatio: 9.0,
    intakeCamDurationDeg: 280,
    camLiftMm: 11.5,
    vvtSwitchRpm: 0,
    intakeRunnerLengthMm: 260,
    intakeRunnerDiaMm: 48,
    headerType: 'EQUAL',
    exhaustPrimaryMm: 500,
    aspiration: 'TWIN_TURBO',
    maxBoostBar: 1.15,
    turboRefRpm: 4500,
    turboGamma: 1.8,
    fuelType: 'RON100',
    targetAfr: 11.5,
    ignitionAdvanceDeg: 25,
    flywheelMassKg: 4.6,
    idleRpm: 1100,
    redlineRpm: 8800,
  },
  {
    id: 'rotary_4r_787',
    name: '2.6L 4ローター NA (787B レーシング)',
    layout: 'ROTARY_4',
    cylinders: 4,
    bankAngleDeg: 0,
    boreMm: 86.0,
    strokeMm: 80.0,
    conrodLengthMm: 120.0,
    compressionRatio: 10.2,
    intakeCamDurationDeg: 304,
    camLiftMm: 13.5,
    vvtSwitchRpm: 6500,
    intakeRunnerLengthMm: 195,
    intakeRunnerDiaMm: 54,
    headerType: 'EQUAL',
    exhaustPrimaryMm: 520,
    aspiration: 'NA',
    maxBoostBar: 0,
    turboRefRpm: 5000,
    turboGamma: 2.0,
    fuelType: 'RACE110',
    targetAfr: 12.6,
    ignitionAdvanceDeg: 30,
    flywheelMassKg: 3.8,
    idleRpm: 1800,
    redlineRpm: 10500,
  },
];

export function simulateEngine(config: EngineSimConfig): EngineSimResult {
  const isRotary = config.layout.startsWith('ROTARY_');
  const boreM = config.boreMm / 1000;
  const strokeM = config.strokeMm / 1000;

  // For rotary, 1 rotor ~ 654cc equivalent 4-stroke effective breathing = 2x chamber volume
  const singleCylCc = isRotary
    ? (Math.PI / 4) * boreM * boreM * strokeM * 1e6 * 1.52
    : (Math.PI / 4) * boreM * boreM * strokeM * 1e6;

  // Rotary breathes twice as often per crank revolution as a 4-stroke cylinder
  const effectiveDispCc = isRotary
    ? singleCylCc * config.cylinders * 1.85
    : singleCylCc * config.cylinders;
  const displayDispCc = isRotary ? Math.round(654 * config.cylinders) : Math.round(singleCylCc * config.cylinders);

  const boreStrokeRatio = Number((config.boreMm / Math.max(1, config.strokeMm)).toFixed(2));
  const meanPistonSpeedAtRedlineMs = Number(
    ((2 * strokeM * config.redlineRpm) / 60).toFixed(1)
  );

  // Helmholtz intake resonance peak RPM estimation
  // Shorter runner + larger diameter + longer cam duration shifts VE peak higher
  const runnerFactor = 320 / Math.max(140, config.intakeRunnerLengthMm);
  const diaFactor = Math.sqrt(Math.max(30, config.intakeRunnerDiaMm) / 46);
  const camFactor = config.intakeCamDurationDeg / 260;
  const helmholtzPeakRpm = Math.round(
    Math.min(config.redlineRpm * 0.94, Math.max(3200, 5600 * runnerFactor * diaFactor * camFactor))
  );

  // Fuel properties (energy & knock tolerance)
  const fuelSpecs: Record<FuelType, { energyMult: number; knockBonus: number; stoichAfr: number }> = {
    RON98: { energyMult: 1.0, knockBonus: 0, stoichAfr: 14.7 },
    RON100: { energyMult: 1.02, knockBonus: 1.2, stoichAfr: 14.7 },
    E85: { energyMult: 1.09, knockBonus: 3.5, stoichAfr: 9.8 },
    RACE110: { energyMult: 1.06, knockBonus: 4.5, stoichAfr: 14.5 },
  };
  const fuel = fuelSpecs[config.fuelType];

  // Otto cycle thermal efficiency with real-world heat loss scaling
  const gammaAir = 1.31;
  const idealOtto = 1 - Math.pow(Math.max(6, config.compressionRatio), -(gammaAir - 1));
  const realThermalEff = idealOtto * 0.61; // realistic combustion + wall heat losses

  // Ignition timing & AFR efficiency curve
  const idealAdvance = config.aspiration === 'NA' ? 30 : 24;
  const advDelta = Math.abs(config.ignitionAdvanceDeg - idealAdvance);
  const timingEff = Math.max(0.82, 1 - advDelta * advDelta * 0.00055);
  const lambda = config.targetAfr / fuel.stoichAfr;
  const afrEff = Math.max(0.84, 1 - Math.pow(lambda - 0.86, 2) * 1.45);

  // Cam lift breathing multiplier
  const liftFactor = Math.min(1.16, Math.max(0.78, 0.85 + (config.camLiftMm - 8.0) * 0.045));

  // Build dyno curve & power.lut (NA base torque in lut + boost multiplier)
  const dynoCurve: DynoPoint[] = [];
  const lutPoints: LutPoint[] = [];

  const step = 250;
  const maxSampleRpm = config.redlineRpm + 500;

  let peakPowerPs = 0;
  let peakPowerBhp = 0;
  let peakPowerRpm = config.idleRpm;
  let peakTorqueNm = 0;
  let peakTorqueRpm = config.idleRpm;
  let peakVePct = 0;

  // Baseline IMEP at 100% VE & 10:1 CR ~ 13.4 bar for modern 4-stroke gasoline
  const baseImepBar = 13.4 * (realThermalEff / 0.345) * fuel.energyMult * timingEff * afrEff;

  for (let rpm = 0; rpm <= maxSampleRpm; rpm += step) {
    const safeRpm = Math.max(500, rpm);

    // Volumetric Efficiency curve around Helmholtz peak RPM
    const normDist = (safeRpm - helmholtzPeakRpm) / Math.max(1800, helmholtzPeakRpm * 0.58);
    let ve = (0.70 + 0.34 * Math.exp(-0.55 * normDist * normDist)) * liftFactor;

    // Low-end cam overlap penalty for aggressive cams
    if (config.intakeCamDurationDeg > 265 && safeRpm < 3600) {
      const overlapPenalty = ((config.intakeCamDurationDeg - 265) / 40) * (1 - safeRpm / 3600) * 0.18;
      ve -= overlapPenalty;
    }

    // VVT / VTEC high-cam lobe engagement
    if (config.vvtSwitchRpm > 0) {
      if (safeRpm >= config.vvtSwitchRpm) {
        const ramp = Math.min(1, (safeRpm - config.vvtSwitchRpm) / 500);
        ve += 0.095 * ramp;
      } else {
        // Low-cam preserves low-end torque
        ve += 0.05 * (1 - safeRpm / config.vvtSwitchRpm);
      }
    }

    // Choking drop beyond redline
    if (safeRpm > config.redlineRpm) {
      ve *= Math.max(0.45, 1 - ((safeRpm - config.redlineRpm) / 900) * 0.45);
    }
    ve = Math.max(0.42, Math.min(1.24, ve));

    // Chen-Flynn friction MEP (bar)
    const pistonSpeedMs = (2 * strokeM * safeRpm) / 60;
    const fmepBar = 0.65 + 0.048 * pistonSpeedMs + 0.0022 * pistonSpeedMs * pistonSpeedMs;

    // NA BMEP -> NA Torque (Nm) = BMEP(bar) * Disp(L) * 100 / (4*pi)
    const naBmepBar = Math.max(1.2, baseImepBar * ve - fmepBar);
    const dispL = effectiveDispCc / 1000;
    let naTorqueNm = (naBmepBar * dispL * 100) / (4 * Math.PI);
    if (rpm === 0) naTorqueNm *= 0.42;

    // Forced induction boost calculation
    let boostBar = 0;
    if (config.aspiration === 'SINGLE_TURBO' || config.aspiration === 'TWIN_TURBO') {
      const twinFactor = config.aspiration === 'TWIN_TURBO' ? 0.90 : 1.0;
      const rawBoost =
        config.maxBoostBar *
        Math.pow(safeRpm / Math.max(1500, config.turboRefRpm * twinFactor), config.turboGamma);
      boostBar = Math.min(config.maxBoostBar, rawBoost);
    } else if (config.aspiration === 'SUPERCHARGER') {
      // Positive displacement / centrifugal hybrid linear-ish instant boost
      boostBar = config.maxBoostBar * Math.min(1, 0.42 + 0.58 * (safeRpm / Math.max(2500, config.redlineRpm * 0.75)));
    }

    // Intercooled charge density gain (slightly less than ideal 1+boost due to heat + exhaust backpressure)
    const densityGain =
      config.aspiration === 'SUPERCHARGER'
        ? 1 + boostBar * 0.84 // parasitic belt drive loss
        : 1 + boostBar * 0.93;

    const totalTorqueNm = Math.max(10, naTorqueNm * densityGain);
    const naKw = (naTorqueNm * rpm) / 9549.2966;
    const totalKw = (totalTorqueNm * rpm) / 9549.2966;
    const naPowerPs = naKw * 1.3596216;
    const naPowerBhp = naKw * 1.3410221;
    const totalPowerPs = totalKw * 1.3596216;
    const totalPowerBhp = totalKw * 1.3410221;

    // For AC power.lut: AC applies (1 + boost) directly when TURBO_0 is present.
    // For Supercharger (which AC models inside power.lut directly), bake totalTorqueNm into power.lut!
    const lutTorque =
      config.aspiration === 'SUPERCHARGER'
        ? totalTorqueNm
        : boostBar > 0.01
          ? totalTorqueNm / (1 + boostBar)
          : naTorqueNm;

    if (rpm % 500 === 0 || rpm === config.redlineRpm) {
      lutPoints.push({ rpm, torque: Number(Math.max(15, lutTorque).toFixed(1)) });
    }

    if (rpm >= config.idleRpm && rpm <= config.redlineRpm) {
      if (ve * 100 > peakVePct) peakVePct = ve * 100;
      if (totalTorqueNm > peakTorqueNm) {
        peakTorqueNm = totalTorqueNm;
        peakTorqueRpm = rpm;
      }
      if (totalPowerPs > peakPowerPs) {
        peakPowerPs = totalPowerPs;
        peakPowerBhp = totalPowerBhp;
        peakPowerRpm = rpm;
      }

      dynoCurve.push({
        rpm,
        naTorqueNm: Number(naTorqueNm.toFixed(1)),
        naPowerPs: Number(naPowerPs.toFixed(1)),
        naPowerBhp: Number(naPowerBhp.toFixed(1)),
        totalTorqueNm: Number(totalTorqueNm.toFixed(1)),
        totalPowerPs: Number(totalPowerPs.toFixed(1)),
        totalPowerBhp: Number(totalPowerBhp.toFixed(1)),
        boostBar: Number(boostBar.toFixed(2)),
      });
    }
  }

  // Generate 720-deg crank cycle pressure & combined instant torque waveform
  const firingAnglesDeg = getFiringAnglesForLayout(config.layout, config.cylinders);
  const primaryLengthsMm = getPrimaryLengthsForConfig(config);
  const cycleWave: CycleSamplePoint[] = [];
  const peakCylinderPressureBar = 52 + config.compressionRatio * 2.8 + config.maxBoostBar * 24;

  for (let deg = 0; deg <= 720; deg += 10) {
    // Cylinder 1 pressure (TDC firing at 360 deg)
    let pBar = 1.0 + config.maxBoostBar;
    const distFromTdc = deg - 360;
    if (distFromTdc > -180 && distFromTdc < 180) {
      // Compression + Wiebe combustion spike peaking around +14 deg ATDC
      const comp = Math.pow(config.compressionRatio, 1.25) * Math.exp(-Math.pow(distFromTdc / 36, 2));
      const comb =
        distFromTdc > -15
          ? peakCylinderPressureBar * Math.exp(-Math.pow((distFromTdc - 14) / 26, 2))
          : 0;
      pBar = Math.max(pBar, 1.0 + comp + comb);
    }

    // Exhaust valve opening around 500..720 deg (EVO ~ 140 deg ATDC)
    let exLift = 0;
    if (deg >= 490 && deg <= 720) {
      const t = (deg - 490) / 230;
      exLift = config.camLiftMm * Math.pow(Math.sin(t * Math.PI), 1.5);
    }

    // Combined instantaneous torque across all firing cylinders
    let instTq = 0;
    for (const fAngle of firingAnglesDeg) {
      const local = ((deg - fAngle) % 720 + 720) % 720;
      // Power stroke contribution peaking at ~35 deg ATDC
      if (local < 180) {
        const pulse = Math.sin((local / 180) * Math.PI) * Math.exp(-local / 75);
        instTq += (peakTorqueNm / firingAnglesDeg.length) * 3.1 * pulse;
      } else if (local > 540) {
        // Compression resistance
        const compDrag = Math.sin(((local - 540) / 180) * Math.PI);
        instTq -= (peakTorqueNm / firingAnglesDeg.length) * 0.55 * compDrag;
      }
    }

    cycleWave.push({
      crankDeg: deg,
      pressureBar: Number(pBar.toFixed(1)),
      exhaustValveLift: Number(exLift.toFixed(2)),
      instantTorqueNm: Number(instTq.toFixed(1)),
    });
  }

  // Rotational inertia estimation for AC engine.ini
  const estimatedInertiaKgM2 = Number(
    Math.max(0.06, Math.min(0.32, 0.055 + config.flywheelMassKg * 0.011 + config.cylinders * 0.004)).toFixed(3)
  );

  return {
    displacementCc: displayDispCc,
    boreStrokeRatio,
    meanPistonSpeedAtRedlineMs,
    helmholtzPeakRpm,
    estimatedInertiaKgM2,
    peakPowerPs: Number(peakPowerPs.toFixed(1)),
    peakPowerBhp: Number(peakPowerBhp.toFixed(1)),
    peakPowerRpm,
    peakTorqueNm: Number(peakTorqueNm.toFixed(1)),
    peakTorqueRpm,
    peakVePct: Number(peakVePct.toFixed(1)),
    thermalEfficiencyPct: Number((realThermalEff * 100).toFixed(1)),
    firingAnglesDeg,
    primaryLengthsMm,
    dynoCurve,
    lutPoints,
    cycleWave,
  };
}

/**
 * Applies the simulated engine physics directly to the car's data files
 * (power.lut, engine.ini, and drivetrain.ini clutch capacity).
 */
export function applyEngineSimToCarFiles(
  config: EngineSimConfig,
  result: EngineSimResult,
  currentFiles: Record<string, string>
): Record<string, string> {
  const next = { ...currentFiles };
  const lutFile = getPowerLutFilename(next['engine.ini']);
  next[lutFile] = serializeLut(result.lutPoints);

  let engIni = next['engine.ini'] ?? '';
  engIni = setIniValues(engIni, [
    ['HEADER', 'POWER_CURVE', lutFile],
    ['ENGINE_DATA', 'LIMITER', Math.round(config.redlineRpm)],
    ['ENGINE_DATA', 'MINIMUM', Math.round(config.idleRpm)],
    ['ENGINE_DATA', 'INERTIA', result.estimatedInertiaKgM2.toFixed(3)],
    ['COAST_REF', 'RPM', Math.round(config.redlineRpm)],
    ['COAST_REF', 'TORQUE', Math.round(Math.max(40, result.peakTorqueNm * 0.16))],
    ['DAMAGE', 'RPM_THRESHOLD', Math.round(config.redlineRpm + 450)],
  ]);

  if (config.aspiration === 'SINGLE_TURBO' || config.aspiration === 'TWIN_TURBO') {
    const twinLagUp = config.aspiration === 'TWIN_TURBO' ? '0.978' : '0.986';
    const twinRef = Math.round(
      config.aspiration === 'TWIN_TURBO' ? config.turboRefRpm * 0.9 : config.turboRefRpm
    );
    engIni = setIniValues(engIni, [
      ['TURBO_0', 'LAG_DN', '0.960'],
      ['TURBO_0', 'LAG_UP', twinLagUp],
      ['TURBO_0', 'MAX_BOOST', config.maxBoostBar.toFixed(2)],
      ['TURBO_0', 'WASTEGATE', config.maxBoostBar.toFixed(2)],
      ['TURBO_0', 'DISPLAY_MAX_BOOST', config.maxBoostBar.toFixed(2)],
      ['TURBO_0', 'REFERENCE_RPM', twinRef],
      ['TURBO_0', 'GAMMA', config.turboGamma.toFixed(2)],
      ['TURBO_0', 'COCKPIT_ADJUSTABLE', 1],
    ]);
  } else {
    engIni = removeIniSection(engIni, 'TURBO_0');
    engIni = removeIniSection(engIni, 'TURBO_1');
  }
  next['engine.ini'] = engIni;

  // Ensure clutch can hold the new simulated peak torque
  if (next['drivetrain.ini']) {
    const recommendedClutch = Math.round(Math.max(450, result.peakTorqueNm * 1.45));
    next['drivetrain.ini'] = setIniValues(next['drivetrain.ini'], [
      ['CLUTCH', 'MAX_TORQUE', recommendedClutch],
      ['AUTO_SHIFTER', 'UP', Math.round(config.redlineRpm * 0.94)],
      ['AUTO_SHIFTER', 'DOWN', Math.round(config.redlineRpm * 0.56)],
    ]);
  }

  return next;
}
