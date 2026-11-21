import type {
  CarPhysicsMetrics,
  DynoPoint,
  GearSpeedPoint,
  LutPoint,
  UiCarJson,
} from '../types/ac';
import { getIniNumber, getIniSections, getIniValue, hasIniSection, parseLut } from './iniHelpers';
import type { TransmissionMode } from '../types/ac';

function detectTransmissionModeLite(files: Record<string, string>): TransmissionMode {
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
  return getIniNumber(dt, 'GEARBOX', 'SUPPORTS_SHIFTER', 1) === 0 ? 'sequential' : 'manual';
}

interface TurboSpec {
  maxBoost: number;
  wastegate: number;
  referenceRpm: number;
  gamma: number;
}

function interpolateLut(points: LutPoint[], rpm: number): number {
  if (points.length === 0) return 0;
  if (rpm <= points[0].rpm) return points[0].torque;
  if (rpm >= points[points.length - 1].rpm) return points[points.length - 1].torque;

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (rpm >= a.rpm && rpm <= b.rpm) {
      const span = b.rpm - a.rpm;
      if (span <= 0) return a.torque;
      const t = (rpm - a.rpm) / span;
      return a.torque + (b.torque - a.torque) * t;
    }
  }
  return points[points.length - 1].torque;
}

export function getTurboSections(engineIni: string | undefined): string[] {
  return getIniSections(engineIni).filter((s) => /^TURBO_\d+$/i.test(s));
}

function readTurbos(engineIni: string | undefined): TurboSpec[] {
  const secs = getTurboSections(engineIni);
  return secs.map((sec) => ({
    maxBoost: Math.max(0, getIniNumber(engineIni, sec, 'MAX_BOOST', 0)),
    wastegate: getIniNumber(engineIni, sec, 'WASTEGATE', 0),
    referenceRpm: Math.max(1000, getIniNumber(engineIni, sec, 'REFERENCE_RPM', 4500)),
    gamma: Math.max(0.1, getIniNumber(engineIni, sec, 'GAMMA', 2.0)),
  }));
}

function computeBoostAtRpm(turbos: TurboSpec[], rpm: number): number {
  let total = 0;
  for (const t of turbos) {
    if (t.maxBoost <= 0) continue;
    const raw = t.maxBoost * Math.pow(Math.max(0, rpm) / t.referenceRpm, t.gamma);
    const limit = t.wastegate > 0 ? Math.min(t.maxBoost, t.wastegate) : t.maxBoost;
    total += Math.min(limit, raw);
  }
  return total;
}

export function getPowerLutFilename(engineIni: string | undefined): string {
  const name = getIniValue(engineIni, 'HEADER', 'POWER_CURVE', 'power.lut').trim();
  return name || 'power.lut';
}

export function computeCarPhysics(files: Record<string, string>): CarPhysicsMetrics {
  const carIni = files['car.ini'] ?? '';
  const engineIni = files['engine.ini'] ?? '';
  const drivetrainIni = files['drivetrain.ini'] ?? '';
  const suspensionsIni = files['suspensions.ini'] ?? '';
  const tyresIni = files['tyres.ini'] ?? '';
  const aeroIni = files['aero.ini'] ?? '';

  const powerLutFile = getPowerLutFilename(engineIni);
  const lutText = files[powerLutFile] ?? files['power.lut'] ?? '';
  const lutPoints = parseLut(lutText);

  // Optional Hybrid ERS / Electric Motor curve
  const ersIni = files['ers.ini'] ?? '';
  const hasHybrid = ersIni.trim().length > 0 && /\[KINETIC\]/i.test(ersIni);
  const ersTorqueLutName = getIniValue(ersIni, 'KINETIC', 'TORQUE_CURVE', 'kers_torque_power.lut').trim();
  const motorLutPoints = hasHybrid
    ? parseLut(files[ersTorqueLutName] ?? files['kers_torque_power.lut'] ?? '')
    : [];

  const massKg = Math.max(200, getIniNumber(carIni, 'BASIC', 'TOTALMASS', 1300));
  const maxRpm = Math.max(
    3000,
    getIniNumber(engineIni, 'ENGINE_DATA', 'LIMITER', lutPoints[lutPoints.length - 1]?.rpm || 7500)
  );
  const idleRpm = Math.max(500, getIniNumber(engineIni, 'ENGINE_DATA', 'MINIMUM', 900));

  const turbos = readTurbos(engineIni);
  const hasTurbo = turbos.some((t) => t.maxBoost > 0.01);
  const maxBoostBar = turbos.reduce((acc, t) => {
    const cap = t.wastegate > 0 ? Math.min(t.maxBoost, t.wastegate) : t.maxBoost;
    return acc + Math.max(0, cap);
  }, 0);

  // Sample dyno curve every 250 RPM up to maxRpm
  const dynoCurve: DynoPoint[] = [];
  const step = 250;
  const startRpm = Math.min(idleRpm, 1000);
  const sampleRpms: number[] = [];
  for (let r = startRpm; r < maxRpm; r += step) {
    sampleRpms.push(r);
  }
  sampleRpms.push(maxRpm);

  let peakTorqueNm = 0;
  let peakTorqueRpm = startRpm;
  let peakPowerPs = 0;
  let peakPowerBhp = 0;
  let peakPowerRpm = startRpm;
  let motorPeakKw = 0;
  let motorPeakPs = 0;
  let motorPeakTorqueNm = 0;
  let combinedPeakPowerPs = 0;
  let combinedPeakTorqueNm = 0;

  for (const rpm of sampleRpms) {
    const naTorqueNm = Math.max(0, interpolateLut(lutPoints, rpm));
    const boostBar = computeBoostAtRpm(turbos, rpm);
    const totalTorqueNm = naTorqueNm * (1 + boostBar);

    const naKw = (naTorqueNm * rpm) / 9549.2966;
    const totalKw = (totalTorqueNm * rpm) / 9549.2966;

    const naPowerPs = naKw * 1.3596216;
    const naPowerBhp = naKw * 1.3410221;
    const totalPowerPs = totalKw * 1.3596216;
    const totalPowerBhp = totalKw * 1.3410221;

    const motorTorqueNm = hasHybrid && motorLutPoints.length > 0 ? Math.max(0, interpolateLut(motorLutPoints, rpm)) : 0;
    const motorKw = (motorTorqueNm * rpm) / 9549.2966;
    const motorPowerPs = motorKw * 1.3596216;
    const combinedTorqueNm = totalTorqueNm + motorTorqueNm;
    const combinedPowerPs = totalPowerPs + motorPowerPs;

    if (totalTorqueNm > peakTorqueNm) {
      peakTorqueNm = totalTorqueNm;
      peakTorqueRpm = rpm;
    }
    if (totalPowerPs > peakPowerPs) {
      peakPowerPs = totalPowerPs;
      peakPowerBhp = totalPowerBhp;
      peakPowerRpm = rpm;
    }
    if (motorTorqueNm > motorPeakTorqueNm) motorPeakTorqueNm = motorTorqueNm;
    if (motorKw > motorPeakKw) {
      motorPeakKw = motorKw;
      motorPeakPs = motorPowerPs;
    }
    if (combinedPowerPs > combinedPeakPowerPs) combinedPeakPowerPs = combinedPowerPs;
    if (combinedTorqueNm > combinedPeakTorqueNm) combinedPeakTorqueNm = combinedTorqueNm;

    dynoCurve.push({
      rpm,
      naTorqueNm: Number(naTorqueNm.toFixed(1)),
      naPowerPs: Number(naPowerPs.toFixed(1)),
      naPowerBhp: Number(naPowerBhp.toFixed(1)),
      totalTorqueNm: Number(totalTorqueNm.toFixed(1)),
      totalPowerPs: Number(totalPowerPs.toFixed(1)),
      totalPowerBhp: Number(totalPowerBhp.toFixed(1)),
      boostBar: Number(boostBar.toFixed(2)),
      ...(hasHybrid
        ? {
            motorTorqueNm: Number(motorTorqueNm.toFixed(1)),
            motorPowerPs: Number(motorPowerPs.toFixed(1)),
            combinedTorqueNm: Number(combinedTorqueNm.toFixed(1)),
            combinedPowerPs: Number(combinedPowerPs.toFixed(1)),
          }
        : {}),
    });
  }

  // Drivetrain & Gears
  const driveType = getIniValue(drivetrainIni, 'TRACTION', 'TYPE', 'RWD').toUpperCase();
  const transmissionMode = detectTransmissionModeLite(files);
  const gearCount = Math.min(18, Math.max(1, Math.round(getIniNumber(drivetrainIni, 'GEARS', 'COUNT', 6))));
  const finalRatio = Math.max(0.5, getIniNumber(drivetrainIni, 'GEARS', 'FINAL', 3.9));

  const frontRadius = getIniNumber(tyresIni, 'FRONT', 'RADIUS', 0.315);
  const rearRadius = getIniNumber(tyresIni, 'REAR', 'RADIUS', 0.315);
  const wheelRadiusM = driveType === 'FWD' ? frontRadius : rearRadius;
  const wheelCircumferenceM = 2 * Math.PI * wheelRadiusM;

  const gears: GearSpeedPoint[] = [];
  for (let g = 1; g <= gearCount; g++) {
    const ratio = Math.abs(getIniNumber(drivetrainIni, 'GEARS', `GEAR_${g}`, Math.max(0.6, 3.6 - g * 0.45)));
    const totalRatio = Math.max(0.1, ratio * finalRatio);
    const maxSpeedKmh = (maxRpm / totalRatio) * wheelCircumferenceM * (60 / 1000);
    const speedAtIdleKmh = (idleRpm / totalRatio) * wheelCircumferenceM * (60 / 1000);
    const prevRatio = g > 1 ? gears[g - 2].ratio : ratio;
    const rpmAtShiftFromPrev = g > 1 ? Math.round(maxRpm * (ratio / Math.max(0.01, prevRatio))) : idleRpm;

    gears.push({
      gear: g,
      ratio: Number(ratio.toFixed(3)),
      maxSpeedKmh: Number(maxSpeedKmh.toFixed(1)),
      rpmAtShiftFromPrev,
      speedAtIdleKmh: Number(speedAtIdleKmh.toFixed(1)),
    });
  }

  const gearLimitedTopSpeed = gears.length > 0 ? gears[gears.length - 1].maxSpeedKmh : 200;

  // Use combined system power when Hybrid ERS is active
  const effectivePeakPowerPs = hasHybrid && combinedPeakPowerPs > peakPowerPs ? combinedPeakPowerPs : peakPowerPs;

  // Rough aero drag limited speed estimation
  const bodyCd = Math.max(0.22, getIniNumber(aeroIni, 'WING_0', 'CD_GAIN', 0.33));
  const rearCd = Math.max(0, getIniNumber(aeroIni, 'WING_1', 'CD_GAIN', 0.04));
  const cdA = (bodyCd + rearCd) * 2.05; // approx frontal area 2.05 m^2
  const peakWatts = (effectivePeakPowerPs / 1.3596216) * 1000 * 0.88; // ~12% drivetrain loss
  const aeroTopSpeedMs = Math.cbrt((2 * Math.max(10000, peakWatts)) / (1.225 * Math.max(0.35, cdA)));
  const aeroTopSpeedKmh = aeroTopSpeedMs * 3.6;

  const estimatedTopSpeedKmh = Number(Math.min(gearLimitedTopSpeed, aeroTopSpeedKmh).toFixed(1));
  const powerToWeightKgPerPs = effectivePeakPowerPs > 1 ? Number((massKg / effectivePeakPowerPs).toFixed(2)) : 0;

  // Heuristic 0-100 km/h estimate based on PWR & drivetrain traction
  const tractionFactor = driveType === 'AWD' ? 0.90 : driveType === 'FWD' ? 1.12 : 1.0;
  const tyreGrip = getIniNumber(tyresIni, 'REAR', 'DX_REF', getIniNumber(tyresIni, 'REAR', 'DX0', 1.25));
  const gripFactor = Math.max(0.78, Math.min(1.18, 1.28 / Math.max(0.8, tyreGrip)));
  const estimated0To100Sec =
    effectivePeakPowerPs > 20
      ? Number(
          Math.max(1.8, Math.min(20, Math.pow(massKg / effectivePeakPowerPs, 0.76) * 1.52 * tractionFactor * gripFactor)).toFixed(
            1
          )
        )
      : 0;

  // Suspension natural ride frequencies (Hz)
  const cgLocation = Math.min(0.8, Math.max(0.2, getIniNumber(suspensionsIni, 'BASIC', 'CG_LOCATION', 0.52)));
  const frontWeightPct = Number((cgLocation * 100).toFixed(1));
  const frontCornerMass = (massKg * cgLocation) / 2;
  const rearCornerMass = (massKg * (1 - cgLocation)) / 2;
  const frontSpring = getIniNumber(suspensionsIni, 'FRONT', 'SPRING_RATE', 60000);
  const rearSpring = getIniNumber(suspensionsIni, 'REAR', 'SPRING_RATE', 55000);

  const frontSpringHz =
    frontSpring > 0 ? Number(((1 / (2 * Math.PI)) * Math.sqrt(frontSpring / Math.max(50, frontCornerMass))).toFixed(2)) : 0;
  const rearSpringHz =
    rearSpring > 0 ? Number(((1 / (2 * Math.PI)) * Math.sqrt(rearSpring / Math.max(50, rearCornerMass))).toFixed(2)) : 0;

  return {
    massKg,
    peakTorqueNm: Number(peakTorqueNm.toFixed(1)),
    peakTorqueRpm,
    peakPowerPs: Number(peakPowerPs.toFixed(1)),
    peakPowerBhp: Number(peakPowerBhp.toFixed(1)),
    peakPowerRpm,
    maxRpm,
    idleRpm,
    powerToWeightKgPerPs,
    estimatedTopSpeedKmh,
    estimated0To100Sec,
    driveType,
    wheelRadiusM,
    finalRatio,
    gears,
    dynoCurve,
    frontWeightPct,
    frontSpringHz,
    rearSpringHz,
    hasTurbo,
    maxBoostBar: Number(maxBoostBar.toFixed(2)),
    hasHybrid,
    motorPeakKw: Number(motorPeakKw.toFixed(1)),
    motorPeakPs: Number(motorPeakPs.toFixed(1)),
    motorPeakTorqueNm: Number(motorPeakTorqueNm.toFixed(1)),
    combinedPeakPowerPs: Number((hasHybrid ? combinedPeakPowerPs : peakPowerPs).toFixed(1)),
    combinedPeakTorqueNm: Number((hasHybrid ? combinedPeakTorqueNm : peakTorqueNm).toFixed(1)),
    transmissionMode,
  };
}

export function syncUiCarSpecsFromPhysics(uiCarJson: UiCarJson, metrics: CarPhysicsMetrics): UiCarJson {
  // Sample around 12-18 clean points for ui_car.json graphs
  const step = Math.max(1, Math.floor(metrics.dynoCurve.length / 16));
  const torqueCurve: [string, string][] = [];
  const powerCurve: [string, string][] = [];

  for (let i = 0; i < metrics.dynoCurve.length; i += step) {
    const pt = metrics.dynoCurve[i];
    torqueCurve.push([String(pt.rpm), String(Math.round(pt.totalTorqueNm))]);
    powerCurve.push([String(pt.rpm), String(Math.round(pt.totalPowerBhp))]);
  }
  const last = metrics.dynoCurve[metrics.dynoCurve.length - 1];
  if (last && torqueCurve[torqueCurve.length - 1]?.[0] !== String(last.rpm)) {
    torqueCurve.push([String(last.rpm), String(Math.round(last.totalTorqueNm))]);
    powerCurve.push([String(last.rpm), String(Math.round(last.totalPowerBhp))]);
  }

  return {
    ...uiCarJson,
    specs: {
      ...(uiCarJson.specs ?? {}),
      bhp: `${Math.round(metrics.peakPowerBhp)} bhp`,
      torque: `${Math.round(metrics.peakTorqueNm)} Nm`,
      weight: `${Math.round(metrics.massKg)} kg`,
      topspeed: `${Math.round(metrics.estimatedTopSpeedKmh)}+ km/h`,
      acceleration: `${metrics.estimated0To100Sec}s 0-100`,
      pwratio: `${metrics.powerToWeightKgPerPs} kg/ps`,
    },
    torqueCurve,
    powerCurve,
  };
}
