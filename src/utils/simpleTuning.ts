import type { CarPhysicsMetrics } from '../types/ac';
import {
  getIniNumber,
  parseLut,
  removeIniSection,
  serializeLut,
  setIniValue,
  setIniValues,
} from './iniHelpers';
import { getPowerLutFilename } from './physicsCalc';
import {
  CSP_TRANSMISSION_PRESETS,
  HYBRID_PRESETS,
  applyCspTransmissionToFiles,
  applyHybridSystemToFiles,
  createDefaultAtConfig,
  createDefaultCvtConfig,
  createDefaultHybridConfig,
} from './cspPowertrain';

// ============================================================================
// Simple Mode Easy Tuning Utilities
// Clean, predictable adjustments for beginners & rapid tuning
// ============================================================================

export type SimpleGripTierId = 'street' | 'sport' | 'semislick' | 'slick';
export type SimpleHybridTierId = 'off' | 'mild_48v' | 'sport_phev' | 'hypercar_ers';
export type SimplePackageId = 'street_comfort' | 'drift_fun' | 'track_grip' | 'hyper_boost';

export interface SimpleTuningSnapshot {
  massKg: number;
  turboBoostBar: number;
  frontRodLengthMm: number;
  frontCamberDeg: number;
  rearGripDx: number;
  brakeTorqueNm: number;
  driveType: 'RWD' | 'FWD' | 'AWD';
}

export function extractSimpleTuningSnapshot(files: Record<string, string>): SimpleTuningSnapshot {
  const carIni = files['car.ini'] ?? '';
  const engineIni = files['engine.ini'] ?? '';
  const dtIni = files['drivetrain.ini'] ?? '';
  const suspIni = files['suspensions.ini'] ?? '';
  const tyresIni = files['tyres.ini'] ?? '';
  const brakesIni = files['brakes.ini'] ?? '';

  const rawDrive = (dtIni.match(/\[TRACTION\][\s\S]*?TYPE\s*=\s*([A-Za-z]+)/i)?.[1] ?? 'RWD').toUpperCase();
  const driveType: 'RWD' | 'FWD' | 'AWD' =
    rawDrive === 'AWD' ? 'AWD' : rawDrive === 'FWD' ? 'FWD' : 'RWD';

  return {
    massKg: Math.round(getIniNumber(carIni, 'BASIC', 'TOTALMASS', 1300)),
    turboBoostBar: Number(getIniNumber(engineIni, 'TURBO_0', 'MAX_BOOST', 0).toFixed(2)),
    frontRodLengthMm: Math.round(getIniNumber(suspIni, 'FRONT', 'ROD_LENGTH', 0.04) * 1000),
    frontCamberDeg: Number(getIniNumber(suspIni, 'FRONT', 'STATIC_CAMBER', -1.8).toFixed(1)),
    rearGripDx: Number(
      getIniNumber(tyresIni, 'REAR', 'DX_REF', getIniNumber(tyresIni, 'REAR', 'DX0', 1.25)).toFixed(2)
    ),
    brakeTorqueNm: Math.round(getIniNumber(brakesIni, 'DATA', 'MAX_TORQUE', 2600)),
    driveType,
  };
}

/**
 * Scales engine torque LUT cleanly by a multiplier (e.g. 1.15 = +15%)
 * and automatically bumps clutch MAX_TORQUE so clutch never slips.
 */
export function applySimplePowerMultiplier(
  files: Record<string, string>,
  multiplier: number
): Record<string, string> {
  const mult = Math.max(0.5, Math.min(2.5, multiplier));
  const next = { ...files };
  const engineIni = next['engine.ini'] ?? '';
  const lutName = getPowerLutFilename(engineIni);
  const lutKey = next[lutName] !== undefined ? lutName : 'power.lut';
  const pts = parseLut(next[lutKey] ?? '');
  if (pts.length > 0) {
    const scaled = pts.map((p) => ({
      rpm: p.rpm,
      torque: Math.max(10, Number((p.torque * mult).toFixed(1))),
    }));
    next[lutKey] = serializeLut(scaled);

    const maxTq = Math.max(...scaled.map((p) => p.torque));
    const boost = Math.max(0, getIniNumber(engineIni, 'TURBO_0', 'MAX_BOOST', 0));
    const reqClutch = Math.round(maxTq * (1 + boost) * 1.4);
    const curClutch = getIniNumber(next['drivetrain.ini'] ?? '', 'CLUTCH', 'MAX_TORQUE', 500);
    if (reqClutch > curClutch) {
      next['drivetrain.ini'] = setIniValue(
        next['drivetrain.ini'] ?? '',
        'CLUTCH',
        'MAX_TORQUE',
        reqClutch
      );
    }
  }
  return next;
}

export function applySimpleTurboBoost(
  files: Record<string, string>,
  boostBar: number,
  maxRpm = 7500
): Record<string, string> {
  const next = { ...files };
  const clamped = Math.max(0, Math.min(2.5, Number(boostBar.toFixed(2))));
  let eng = next['engine.ini'] ?? '';

  if (clamped <= 0.01) {
    eng = removeIniSection(eng, 'TURBO_0');
  } else {
    eng = setIniValues(eng, [
      ['TURBO_0', 'LAG_DN', '0.96'],
      ['TURBO_0', 'LAG_UP', '0.985'],
      ['TURBO_0', 'MAX_BOOST', clamped.toFixed(2)],
      ['TURBO_0', 'WASTEGATE', clamped.toFixed(2)],
      ['TURBO_0', 'DISPLAY_MAX_BOOST', clamped.toFixed(2)],
      ['TURBO_0', 'REFERENCE_RPM', Math.round(maxRpm * 0.52)],
      ['TURBO_0', 'GAMMA', '2.0'],
      ['TURBO_0', 'COCKPIT_ADJUSTABLE', 1],
    ]);
  }
  next['engine.ini'] = eng;

  // Keep clutch strong enough for added boost
  const curClutch = getIniNumber(next['drivetrain.ini'] ?? '', 'CLUTCH', 'MAX_TORQUE', 500);
  const recommended = Math.round(450 * (1 + clamped));
  if (recommended > curClutch) {
    next['drivetrain.ini'] = setIniValue(
      next['drivetrain.ini'] ?? '',
      'CLUTCH',
      'MAX_TORQUE',
      recommended
    );
  }
  return next;
}

export function applySimpleGripTier(
  files: Record<string, string>,
  tier: SimpleGripTierId
): Record<string, string> {
  const map: Record<SimpleGripTierId, { dx: number; dy: number }> = {
    street: { dx: 1.20, dy: 1.18 },
    sport: { dx: 1.32, dy: 1.30 },
    semislick: { dx: 1.46, dy: 1.44 },
    slick: { dx: 1.65, dy: 1.62 },
  };
  const g = map[tier];
  const next = { ...files };
  next['tyres.ini'] = setIniValues(next['tyres.ini'] ?? '', [
    ['FRONT', 'DX_REF', g.dx.toFixed(3)],
    ['FRONT', 'DY_REF', g.dy.toFixed(3)],
    ['FRONT', 'DX0', (g.dx * 0.96).toFixed(4)],
    ['FRONT', 'DY0', (g.dy * 0.96).toFixed(4)],
    ['REAR', 'DX_REF', g.dx.toFixed(3)],
    ['REAR', 'DY_REF', g.dy.toFixed(3)],
    ['REAR', 'DX0', (g.dx * 0.96).toFixed(4)],
    ['REAR', 'DY0', (g.dy * 0.96).toFixed(4)],
  ]);
  return next;
}

export function applySimpleRideHeightDeltaMm(
  files: Record<string, string>,
  targetFrontRodMm: number
): Record<string, string> {
  const next = { ...files };
  const susp = next['suspensions.ini'] ?? '';
  const curFront = getIniNumber(susp, 'FRONT', 'ROD_LENGTH', 0.04);
  const curRear = getIniNumber(susp, 'REAR', 'ROD_LENGTH', 0.04);
  const targetFrontM = Math.max(-0.04, Math.min(0.14, targetFrontRodMm / 1000));
  const delta = targetFrontM - curFront;
  const targetRearM = Math.max(-0.04, Math.min(0.14, curRear + delta));
  next['suspensions.ini'] = setIniValues(susp, [
    ['FRONT', 'ROD_LENGTH', targetFrontM.toFixed(4)],
    ['REAR', 'ROD_LENGTH', targetRearM.toFixed(4)],
  ]);
  return next;
}

export function applySimpleDriveType(
  files: Record<string, string>,
  driveType: 'RWD' | 'FWD' | 'AWD'
): Record<string, string> {
  const next = { ...files };
  let dt = setIniValue(next['drivetrain.ini'] ?? '', 'TRACTION', 'TYPE', driveType);
  if (driveType === 'AWD' && !dt.toUpperCase().includes('[AWD]')) {
    dt = setIniValues(dt, [
      ['AWD', 'FRONT_SHARE', 35],
      ['AWD', 'FRONT_DIFF_POWER', '0.25'],
      ['AWD', 'FRONT_DIFF_COAST', '0.10'],
      ['AWD', 'FRONT_DIFF_PRELOAD', 15],
      ['AWD', 'CENTRE_DIFF_POWER', '0.50'],
      ['AWD', 'CENTRE_DIFF_COAST', '0.35'],
      ['AWD', 'CENTRE_DIFF_PRELOAD', 40],
    ]);
  }
  next['drivetrain.ini'] = dt;
  return next;
}

export function applySimpleQuickPackage(
  files: Record<string, string>,
  pkg: SimplePackageId,
  metrics: CarPhysicsMetrics
): Record<string, string> {
  let next = { ...files };

  if (pkg === 'street_comfort') {
    const atPreset = CSP_TRANSMISSION_PRESETS.find((p) => p.id === 'at_8_sport')!;
    next = applySimpleGripTier(next, 'sport');
    next = applyCspTransmissionToFiles(
      next,
      {
        mode: 'csp_at',
        at: { ...createDefaultAtConfig(), ...(atPreset.apply(metrics.maxRpm, metrics.idleRpm).at ?? {}) },
        cvt: createDefaultCvtConfig(metrics.maxRpm, metrics.idleRpm),
      },
      { maxRpm: metrics.maxRpm, idleRpm: metrics.idleRpm, regenerateGearRatios: true }
    );
    return next;
  }

  if (pkg === 'drift_fun') {
    next = applySimpleDriveType(next, 'RWD');
    next = applySimpleGripTier(next, 'street');
    next['drivetrain.ini'] = setIniValues(next['drivetrain.ini'] ?? '', [
      ['DIFFERENTIAL', 'POWER', '0.95'],
      ['DIFFERENTIAL', 'COAST', '0.90'],
      ['DIFFERENTIAL', 'PRELOAD', 110],
    ]);
    next['suspensions.ini'] = setIniValues(next['suspensions.ini'] ?? '', [
      ['FRONT', 'STATIC_CAMBER', '-4.80'],
      ['REAR', 'STATIC_CAMBER', '-0.80'],
    ]);
    next['car.ini'] = setIniValues(next['car.ini'] ?? '', [
      ['CONTROLS', 'STEER_LOCK', 540],
      ['CONTROLS', 'STEER_RATIO', '9.5'],
    ]);
    return next;
  }

  if (pkg === 'track_grip') {
    next = applySimpleGripTier(next, 'slick');
    const curMass = getIniNumber(next['car.ini'] ?? '', 'BASIC', 'TOTALMASS', 1300);
    next['car.ini'] = setIniValue(
      next['car.ini'] ?? '',
      'BASIC',
      'TOTALMASS',
      Math.max(850, Math.round(curMass * 0.9))
    );
    next['suspensions.ini'] = setIniValues(next['suspensions.ini'] ?? '', [
      ['FRONT', 'STATIC_CAMBER', '-3.20'],
      ['REAR', 'STATIC_CAMBER', '-2.30'],
    ]);
    next['brakes.ini'] = setIniValue(next['brakes.ini'] ?? '', 'DATA', 'MAX_TORQUE', 3800);
    return next;
  }

  // hyper_boost: Turbo + Sport PHEV Hybrid + Semi-Slick + Lightweight
  next = applySimplePowerMultiplier(next, 1.25);
  next = applySimpleTurboBoost(next, Math.max(1.2, metrics.maxBoostBar + 0.4), metrics.maxRpm);
  next = applySimpleGripTier(next, 'slick');
  const hyperPreset = HYBRID_PRESETS.find((p) => p.id === 'hypercar_ers')!;
  next = applyHybridSystemToFiles(next, hyperPreset.build(metrics.maxRpm));
  return next;
}

export function applySimpleHybridTier(
  files: Record<string, string>,
  tier: SimpleHybridTierId,
  maxRpm: number
): Record<string, string> {
  if (tier === 'off') {
    return applyHybridSystemToFiles(files, createDefaultHybridConfig(maxRpm));
  }
  const preset = HYBRID_PRESETS.find((p) => p.id === tier) ?? HYBRID_PRESETS[1];
  return applyHybridSystemToFiles(files, preset.build(maxRpm));
}
