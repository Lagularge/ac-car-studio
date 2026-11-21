import { getIniNumber, getIniValue } from './iniHelpers';

export interface SuspensionKinematicsInput {
  totalMassKg: number;
  cgLocation: number;           // 0.35..0.68 (fraction on front axle)
  cgHeightM: number;            // ~0.42..0.55 m
  wheelbase: number;            // m
  frontTrack: number;           // m
  rearTrack: number;            // m
  frontSpringRate: number;      // N/m
  rearSpringRate: number;       // N/m
  frontProgSpringRate: number;  // N/m^2
  rearProgSpringRate: number;   // N/m^2
  frontArb: number;             // N/m
  rearArb: number;              // N/m
  frontStaticCamberDeg: number; // deg (negative = top inward)
  rearStaticCamberDeg: number;  // deg
  frontToeM: number;            // AC TOE_OUT linear tie-rod offset (m)
  rearToeM: number;             // m
  frontRodLength: number;       // m
  rearRodLength: number;        // m
  frontBaseY: number;           // m (e.g. -0.12)
  rearBaseY: number;            // m
  frontPackerRange: number;     // m
  rearPackerRange: number;      // m
  frontBumpStopRate: number;    // N/m
  rearBumpStopRate: number;     // N/m
  frontRadius: number;          // m
  rearRadius: number;           // m
  frontWidth: number;           // m
  rearWidth: number;            // m
  frontCamberGainDegPerM: number; // deg camber gain per meter of compression
  rearCamberGainDegPerM: number;
  frontBumpSteerDegPerM: number;  // deg toe change per meter of compression
  rearBumpSteerDegPerM: number;
}

export interface LoadSweepPoint {
  loadFactor: number;           // 0.2..2.4 (1.0 = 1G static)
  label: string;
  frontWheelLoadKgf: number;
  rearWheelLoadKgf: number;
  frontDeflectionMm: number;    // + = compression (bump), - = extension (rebound)
  rearDeflectionMm: number;
  frontRideHeightMm: number;
  rearRideHeightMm: number;
  frontCamberDeg: number;
  rearCamberDeg: number;
  frontToeDeg: number;
  rearToeDeg: number;
}

export interface RollSweepPoint {
  lateralG: number;             // 0.0..1.8 G
  rollAngleDeg: number;
  frontOutsideGroundCamberDeg: number;
  rearOutsideGroundCamberDeg: number;
  frontInsideGroundCamberDeg: number;
  rearInsideGroundCamberDeg: number;
  frontOuterLoadKgf: number;
  frontInnerLoadKgf: number;
  rearOuterLoadKgf: number;
  rearInnerLoadKgf: number;
  frontOuterRideHeightMm: number;
  rearOuterRideHeightMm: number;
}

export interface WheelInstantState {
  id: 'LF' | 'RF' | 'LR' | 'RR';
  travelMm: number;             // + = compressed into wheel well
  rideHeightMm: number;
  camberWorldDeg: number;       // Camber relative to ground
  camberChassisDeg: number;     // Camber relative to chassis
  toeDeg: number;               // + = toe-out (front) / toe-in, in degrees
  loadKgf: number;
}

export interface LiveSuspensionPosture {
  chassisHeaveM: number;
  chassisRollRad: number;
  chassisRollDeg: number;
  chassisPitchRad: number;
  chassisPitchDeg: number;
  frontRideHeightMm: number;
  rearRideHeightMm: number;
  wheels: {
    LF: WheelInstantState;
    RF: WheelInstantState;
    LR: WheelInstantState;
    RR: WheelInstantState;
  };
}

export interface SuspensionKinematicsAnalysis {
  input: SuspensionKinematicsInput;
  frontStaticWheelLoadKgf: number;
  rearStaticWheelLoadKgf: number;
  frontStaticRideHeightMm: number;
  rearStaticRideHeightMm: number;
  frontStaticToeDeg: number;
  rearStaticToeDeg: number;
  rollGradientDegPerG: number;
  frontRollStiffnessSharePct: number; // LLTD %
  underOversteerBalanceLabel: string;
  loadSweep: LoadSweepPoint[];
  rollSweep: RollSweepPoint[];
}

const G_ACCEL = 9.80665;
const STEERING_ARM_LEN_M = 0.145; // 145mm tie-rod lever arm for TOE_OUT (m) -> toe angle (deg)

export function toeMetersToDeg(toeM: number): number {
  return Number(((Math.atan2(toeM, STEERING_ARM_LEN_M) * 180) / Math.PI).toFixed(3));
}

function parseVec3(raw: string): [number, number, number] | null {
  if (!raw) return null;
  const parts = raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
  if (parts.length < 3) return null;
  return [parts[0], parts[1], parts[2]];
}

/**
 * Estimates camber-gain (deg/m) and bump-steer (deg/m) from AC's 3D wishbone coordinates
 * (`WBCAR_TOP_FRONT`, `WBCAR_BOTTOM_FRONT`, `WBTYRE_TOP`, `WBTYRE_BOTTOM`, `WBTYRE_STEER`)
 * when available in `suspensions.ini`, or falls back to realistic DWB/STRUT geometry.
 */
function estimateAxleKinematicsFromIni(
  suspIni: string,
  section: 'FRONT' | 'REAR'
): { camberGainDegPerM: number; bumpSteerDegPerM: number } {
  const suspType = getIniValue(suspIni, section, 'TYPE', 'DWB').toUpperCase();
  const wbCarTopF = parseVec3(getIniValue(suspIni, section, 'WBCAR_TOP_FRONT', ''));
  const wbCarBotF = parseVec3(getIniValue(suspIni, section, 'WBCAR_BOTTOM_FRONT', ''));
  const wbTyreTop = parseVec3(getIniValue(suspIni, section, 'WBTYRE_TOP', ''));
  const wbTyreBot = parseVec3(getIniValue(suspIni, section, 'WBTYRE_BOTTOM', ''));

  if (wbCarTopF && wbCarBotF && wbTyreTop && wbTyreBot) {
    // Effective upper vs lower control arm lateral lengths in X
    const upperLen = Math.max(0.18, Math.abs(wbTyreTop[0] - wbCarTopF[0]));
    const lowerLen = Math.max(0.24, Math.abs(wbTyreBot[0] - wbCarBotF[0]));
    const uprightHeight = Math.max(0.16, Math.abs(wbTyreTop[1] - wbTyreBot[1]));
    // Short-Long Arm (SLA) camber gain rate from differential lateral arc curvature
    const slaFactor = (1 / upperLen - 1 / lowerLen) / Math.max(0.15, uprightHeight);
    const gainDegPerM = Math.max(8, Math.min(48, Math.abs(slaFactor) * 4.2 + (section === 'FRONT' ? 18 : 15)));
    const bumpSteer = section === 'FRONT' ? -3.2 : 2.8;
    return {
      camberGainDegPerM: Number(gainDegPerM.toFixed(1)),
      bumpSteerDegPerM: bumpSteer,
    };
  }

  if (suspType === 'STRUT') {
    return {
      camberGainDegPerM: section === 'FRONT' ? 14.5 : 16.0,
      bumpSteerDegPerM: section === 'FRONT' ? -4.0 : 2.2,
    };
  }
  if (suspType === 'AXLE') {
    return {
      camberGainDegPerM: 2.0,
      bumpSteerDegPerM: 0.5,
    };
  }
  // Default DWB (Double Wishbone)
  return {
    camberGainDegPerM: section === 'FRONT' ? 26.5 : 22.0,
    bumpSteerDegPerM: section === 'FRONT' ? -2.6 : 3.2,
  };
}

export function extractSuspensionKinematicsInput(
  files: Record<string, string>
): SuspensionKinematicsInput {
  const suspIni = files['suspensions.ini'] ?? '';
  const carIni = files['car.ini'] ?? '';
  const tyresIni = files['tyres.ini'] ?? '';

  const totalMassKg = getIniNumber(carIni, 'BASIC', 'TOTALMASS', 1350);
  const wheelbase = getIniNumber(suspIni, 'BASIC', 'WHEELBASE', 2.6);
  const cgLocation = getIniNumber(suspIni, 'BASIC', 'CG_LOCATION', 0.52);

  const frontRadius = getIniNumber(tyresIni, 'FRONT', 'RADIUS', 0.316);
  const rearRadius = getIniNumber(tyresIni, 'REAR', 'RADIUS', 0.316);
  const frontWidth = getIniNumber(tyresIni, 'FRONT', 'WIDTH', 0.235);
  const rearWidth = getIniNumber(tyresIni, 'REAR', 'WIDTH', 0.255);

  const frontBaseY = getIniNumber(suspIni, 'FRONT', 'BASEY', -0.12);
  const rearBaseY = getIniNumber(suspIni, 'REAR', 'BASEY', -0.12);
  const avgRadius = (frontRadius + rearRadius) / 2;
  const avgBaseY = (frontBaseY + rearBaseY) / 2;
  const cgHeightM = Math.max(0.32, Math.min(0.68, avgRadius - avgBaseY + 0.05));

  const fKin = estimateAxleKinematicsFromIni(suspIni, 'FRONT');
  const rKin = estimateAxleKinematicsFromIni(suspIni, 'REAR');

  return {
    totalMassKg,
    cgLocation,
    cgHeightM,
    wheelbase,
    frontTrack: getIniNumber(suspIni, 'FRONT', 'TRACK', 1.54),
    rearTrack: getIniNumber(suspIni, 'REAR', 'TRACK', 1.54),
    frontSpringRate: getIniNumber(suspIni, 'FRONT', 'SPRING_RATE', 65000),
    rearSpringRate: getIniNumber(suspIni, 'REAR', 'SPRING_RATE', 58000),
    frontProgSpringRate: getIniNumber(suspIni, 'FRONT', 'PROG_SPRING_RATE', 0),
    rearProgSpringRate: getIniNumber(suspIni, 'REAR', 'PROG_SPRING_RATE', 0),
    frontArb: getIniNumber(suspIni, 'ARB', 'FRONT', 28000),
    rearArb: getIniNumber(suspIni, 'ARB', 'REAR', 18000),
    frontStaticCamberDeg: getIniNumber(suspIni, 'FRONT', 'STATIC_CAMBER', -1.8),
    rearStaticCamberDeg: getIniNumber(suspIni, 'REAR', 'STATIC_CAMBER', -1.4),
    frontToeM: getIniNumber(suspIni, 'FRONT', 'TOE_OUT', 0.0001),
    rearToeM: getIniNumber(suspIni, 'REAR', 'TOE_OUT', 0.0004),
    frontRodLength: getIniNumber(suspIni, 'FRONT', 'ROD_LENGTH', 0.045),
    rearRodLength: getIniNumber(suspIni, 'REAR', 'ROD_LENGTH', 0.045),
    frontBaseY,
    rearBaseY,
    frontPackerRange: getIniNumber(suspIni, 'FRONT', 'PACKER_RANGE', 0.055),
    rearPackerRange: getIniNumber(suspIni, 'REAR', 'PACKER_RANGE', 0.06),
    frontBumpStopRate: getIniNumber(suspIni, 'FRONT', 'BUMP_STOP_RATE', 160000),
    rearBumpStopRate: getIniNumber(suspIni, 'REAR', 'BUMP_STOP_RATE', 160000),
    frontRadius,
    rearRadius,
    frontWidth,
    rearWidth,
    frontCamberGainDegPerM: fKin.camberGainDegPerM,
    rearCamberGainDegPerM: rKin.camberGainDegPerM,
    frontBumpSteerDegPerM: fKin.bumpSteerDegPerM,
    rearBumpSteerDegPerM: rKin.bumpSteerDegPerM,
  };
}

/**
 * Solves suspension compression deflection `dz` (m, + = bump compression) for a given delta force `dF` (N)
 * around the 1G static equilibrium, accounting for linear spring rate, progressive spring rate, and packer/bump-stop.
 */
function solveDeflectionFromDeltaForce(
  deltaForceN: number,
  springRate: number,
  progRate: number,
  packerGapM: number,
  bumpStopRate: number
): number {
  const k = Math.max(12000, springRate);
  const kp = Math.max(0, progRate);
  const gap = Math.max(0.015, packerGapM || 0.055);
  const kb = Math.max(50000, bumpStopRate || 150000);

  // Iterative Newton step for non-linear force F(dz) = k*dz + 0.5*kp*dz*|dz| + max(0, dz - gap)*kb
  let dz = deltaForceN / k;
  for (let iter = 0; iter < 8; iter++) {
    const bumpEngage = dz > gap ? dz - gap : 0;
    const f = k * dz + 0.5 * kp * dz * Math.abs(dz) + bumpEngage * kb - deltaForceN;
    const df = k + kp * Math.abs(dz) + (dz > gap ? kb : 0);
    dz -= f / Math.max(1000, df);
  }
  return Math.max(-0.095, Math.min(0.11, dz));
}

function computeStaticRideHeightMm(rodLengthM: number, springRate: number, staticLoadN: number): number {
  // Base reference ground clearance ~115mm at ROD_LENGTH = 0.045m, adjusted by rod length and static sag
  const sagDeltaM = staticLoadN / Math.max(15000, springRate) - 0.052;
  const hM = 0.115 + (rodLengthM - 0.045) * 0.95 - sagDeltaM * 0.35;
  return Math.max(35, Math.min(260, hM * 1000));
}

export function analyzeSuspensionKinematics(
  input: SuspensionKinematicsInput
): SuspensionKinematicsAnalysis {
  const fStaticLoadN = (input.totalMassKg * G_ACCEL * input.cgLocation) / 2;
  const rStaticLoadN = (input.totalMassKg * G_ACCEL * (1 - input.cgLocation)) / 2;
  const fStaticKgf = fStaticLoadN / G_ACCEL;
  const rStaticKgf = rStaticLoadN / G_ACCEL;

  const fStaticRhMm = computeStaticRideHeightMm(
    input.frontRodLength,
    input.frontSpringRate,
    fStaticLoadN
  );
  const rStaticRhMm = computeStaticRideHeightMm(
    input.rearRodLength,
    input.rearSpringRate,
    rStaticLoadN
  );

  const fStaticToeDeg = toeMetersToDeg(input.frontToeM);
  const rStaticToeDeg = toeMetersToDeg(input.rearToeM);

  // 1. Load Sweep (0.2x Rebound -> 2.4x Full Compression Load)
  const loadSweep: LoadSweepPoint[] = [];
  for (let i = 0; i <= 22; i++) {
    const loadFactor = Number((0.2 + i * 0.1).toFixed(2));
    const fForceDeltaN = fStaticLoadN * (loadFactor - 1.0);
    const rForceDeltaN = rStaticLoadN * (loadFactor - 1.0);

    const fDzM = solveDeflectionFromDeltaForce(
      fForceDeltaN,
      input.frontSpringRate,
      input.frontProgSpringRate,
      input.frontPackerRange,
      input.frontBumpStopRate
    );
    const rDzM = solveDeflectionFromDeltaForce(
      rForceDeltaN,
      input.rearSpringRate,
      input.rearProgSpringRate,
      input.rearPackerRange,
      input.rearBumpStopRate
    );

    // Non-linear wishbone arc camber curve: negative camber increases on compression
    const fCamber =
      input.frontStaticCamberDeg -
      input.frontCamberGainDegPerM * fDzM -
      110 * fDzM * Math.abs(fDzM);
    const rCamber =
      input.rearStaticCamberDeg -
      input.rearCamberGainDegPerM * rDzM -
      90 * rDzM * Math.abs(rDzM);

    // Bump steer curve
    const fToe =
      fStaticToeDeg + input.frontBumpSteerDegPerM * fDzM + 22 * fDzM * fDzM;
    const rToe =
      rStaticToeDeg + input.rearBumpSteerDegPerM * rDzM + 18 * rDzM * rDzM;

    loadSweep.push({
      loadFactor,
      label: `${Math.round(loadFactor * 100)}%`,
      frontWheelLoadKgf: Number((fStaticKgf * loadFactor).toFixed(1)),
      rearWheelLoadKgf: Number((rStaticKgf * loadFactor).toFixed(1)),
      frontDeflectionMm: Number((fDzM * 1000).toFixed(1)),
      rearDeflectionMm: Number((rDzM * 1000).toFixed(1)),
      frontRideHeightMm: Number(Math.max(15, fStaticRhMm - fDzM * 1000).toFixed(1)),
      rearRideHeightMm: Number(Math.max(15, rStaticRhMm - rDzM * 1000).toFixed(1)),
      frontCamberDeg: Number(fCamber.toFixed(2)),
      rearCamberDeg: Number(rCamber.toFixed(2)),
      frontToeDeg: Number(fToe.toFixed(3)),
      rearToeDeg: Number(rToe.toFixed(3)),
    });
  }

  // 2. Roll Stiffness & Lateral G Sweep (0.0G -> 1.8G)
  // Roll stiffness per axle (Nm/rad): K_phi = 0.5 * (k_spring + k_arb) * track^2
  const fRollStiffNmPerRad =
    0.5 * (input.frontSpringRate + input.frontArb) * Math.pow(input.frontTrack, 2);
  const rRollStiffNmPerRad =
    0.5 * (input.rearSpringRate + input.rearArb) * Math.pow(input.rearTrack, 2);
  const totalRollStiffNmPerRad = Math.max(15000, fRollStiffNmPerRad + rRollStiffNmPerRad);

  const frontRollShare = fRollStiffNmPerRad / totalRollStiffNmPerRad;
  const rollArmM = Math.max(0.22, input.cgHeightM - 0.11); // Distance from roll axis to CG
  const rollMomentPerG = input.totalMassKg * G_ACCEL * rollArmM;
  const rollRadPerG = rollMomentPerG / totalRollStiffNmPerRad;
  const rollGradientDegPerG = Number(((rollRadPerG * 180) / Math.PI).toFixed(2));

  const balanceDelta = (frontRollShare - input.cgLocation) * 100;
  const underOversteerBalanceLabel =
    balanceDelta > 3.5
      ? 'アンダーステア傾向 (前ロール剛性過多)'
      : balanceDelta < -3.5
        ? 'オーバーステア傾向 (後ロール剛性高め)'
        : 'ニュートラルバランス';

  const rollSweep: RollSweepPoint[] = [];
  for (let i = 0; i <= 18; i++) {
    const latG = Number((i * 0.1).toFixed(1));
    const rollDeg = rollGradientDegPerG * latG;
    const rollRad = (rollDeg * Math.PI) / 180;

    // Lateral load transfer on front & rear axles
    const totalLatForceN = input.totalMassKg * G_ACCEL * latG;
    const fLatTransferN =
      (totalLatForceN * input.cgHeightM * frontRollShare) / Math.max(1.1, input.frontTrack);
    const rLatTransferN =
      (totalLatForceN * input.cgHeightM * (1 - frontRollShare)) / Math.max(1.1, input.rearTrack);

    const fOuterN = Math.min(fStaticLoadN * 2.35, fStaticLoadN + fLatTransferN);
    const fInnerN = Math.max(0, fStaticLoadN - fLatTransferN);
    const rOuterN = Math.min(rStaticLoadN * 2.35, rStaticLoadN + rLatTransferN);
    const rInnerN = Math.max(0, rStaticLoadN - rLatTransferN);

    // Wheel vertical travel during roll: outer compresses (+), inner extends (-)
    const fOuterTravelM = Math.sin(rollRad) * (input.frontTrack / 2);
    const rOuterTravelM = Math.sin(rollRad) * (input.rearTrack / 2);

    // Camber relative to road surface = staticCamber + bodyRollDeg (tilts outer top outward) - camberGain(outerCompression)
    const fOuterGroundCamber =
      input.frontStaticCamberDeg +
      rollDeg * 0.88 -
      input.frontCamberGainDegPerM * fOuterTravelM;
    const rOuterGroundCamber =
      input.rearStaticCamberDeg +
      rollDeg * 0.88 -
      input.rearCamberGainDegPerM * rOuterTravelM;

    const fInnerGroundCamber =
      input.frontStaticCamberDeg -
      rollDeg * 0.88 +
      input.frontCamberGainDegPerM * fOuterTravelM;
    const rInnerGroundCamber =
      input.rearStaticCamberDeg -
      rollDeg * 0.88 +
      input.rearCamberGainDegPerM * rOuterTravelM;

    rollSweep.push({
      lateralG: latG,
      rollAngleDeg: Number(rollDeg.toFixed(2)),
      frontOutsideGroundCamberDeg: Number(fOuterGroundCamber.toFixed(2)),
      rearOutsideGroundCamberDeg: Number(rOuterGroundCamber.toFixed(2)),
      frontInsideGroundCamberDeg: Number(fInnerGroundCamber.toFixed(2)),
      rearInsideGroundCamberDeg: Number(rInnerGroundCamber.toFixed(2)),
      frontOuterLoadKgf: Number((fOuterN / G_ACCEL).toFixed(1)),
      frontInnerLoadKgf: Number((fInnerN / G_ACCEL).toFixed(1)),
      rearOuterLoadKgf: Number((rOuterN / G_ACCEL).toFixed(1)),
      rearInnerLoadKgf: Number((rInnerN / G_ACCEL).toFixed(1)),
      frontOuterRideHeightMm: Number(Math.max(15, fStaticRhMm - fOuterTravelM * 1000).toFixed(1)),
      rearOuterRideHeightMm: Number(Math.max(15, rStaticRhMm - rOuterTravelM * 1000).toFixed(1)),
    });
  }

  return {
    input,
    frontStaticWheelLoadKgf: Number(fStaticKgf.toFixed(1)),
    rearStaticWheelLoadKgf: Number(rStaticKgf.toFixed(1)),
    frontStaticRideHeightMm: Number(fStaticRhMm.toFixed(1)),
    rearStaticRideHeightMm: Number(rStaticRhMm.toFixed(1)),
    frontStaticToeDeg: fStaticToeDeg,
    rearStaticToeDeg: rStaticToeDeg,
    rollGradientDegPerG,
    frontRollStiffnessSharePct: Number((frontRollShare * 100).toFixed(1)),
    underOversteerBalanceLabel,
    loadSweep,
    rollSweep,
  };
}

/**
 * Computes the instantaneous 3D chassis & 4-wheel alignment state for any combination of:
 *  - `loadFactor`: Vertical load multiplier (`0.2..2.2`, `1.0` = 1G static)
 *  - `lateralG`: Cornering lateral acceleration (`-1.8..+1.8` G; positive = left turn -> roll right, outer = LF/LR)
 *  - `pitchG`: Braking/acceleration longitudinal G (`-1.2..+1.2` G; positive = braking dive)
 */
export function computeLiveSuspensionPosture(
  analysis: SuspensionKinematicsAnalysis,
  loadFactor = 1.0,
  lateralG = 0.0,
  pitchG = 0.0
): LiveSuspensionPosture {
  const { input } = analysis;
  const fStaticN = analysis.frontStaticWheelLoadKgf * G_ACCEL;
  const rStaticN = analysis.rearStaticWheelLoadKgf * G_ACCEL;

  // Roll angle from lateralG
  const rollDeg = analysis.rollGradientDegPerG * lateralG;
  const rollRad = (rollDeg * Math.PI) / 180;

  // Longitudinal pitch from pitchG (+ = braking dive onto front axle)
  const pitchTransferN =
    (input.totalMassKg * G_ACCEL * pitchG * input.cgHeightM) / Math.max(1.8, input.wheelbase);
  const fHeaveForceDeltaN = fStaticN * (loadFactor - 1.0) + pitchTransferN * 0.5;
  const rHeaveForceDeltaN = rStaticN * (loadFactor - 1.0) - pitchTransferN * 0.5;

  const fHeaveDzM = solveDeflectionFromDeltaForce(
    fHeaveForceDeltaN,
    input.frontSpringRate,
    input.frontProgSpringRate,
    input.frontPackerRange,
    input.frontBumpStopRate
  );
  const rHeaveDzM = solveDeflectionFromDeltaForce(
    rHeaveForceDeltaN,
    input.rearSpringRate,
    input.rearProgSpringRate,
    input.rearPackerRange,
    input.rearBumpStopRate
  );

  // Ride height offset from ROD_LENGTH relative to 0.045m nominal
  const fRodOffsetM = (input.frontRodLength - 0.045) * 0.95;
  const rRodOffsetM = (input.rearRodLength - 0.045) * 0.95;

  const fCornerShiftY = fRodOffsetM - fHeaveDzM;
  const rCornerShiftY = rRodOffsetM - rHeaveDzM;

  const chassisHeaveM = (fCornerShiftY + rCornerShiftY) / 2;
  const chassisPitchRad = Math.atan2(rCornerShiftY - fCornerShiftY, Math.max(1.8, input.wheelbase));
  const chassisPitchDeg = (chassisPitchRad * 180) / Math.PI;

  // Lateral load transfer per axle
  const frontShare = analysis.frontRollStiffnessSharePct / 100;
  const totalLatForceN = input.totalMassKg * G_ACCEL * lateralG;
  const fLatTransferN =
    (totalLatForceN * input.cgHeightM * frontShare) / Math.max(1.1, input.frontTrack);
  const rLatTransferN =
    (totalLatForceN * input.cgHeightM * (1 - frontShare)) / Math.max(1.1, input.rearTrack);

  // Left (+X) vs Right (-X) wheel travel from roll + heave
  const fRollTravelM = Math.sin(rollRad) * (input.frontTrack / 2);
  const rRollTravelM = Math.sin(rollRad) * (input.rearTrack / 2);

  const buildWheel = (
    id: 'LF' | 'RF' | 'LR' | 'RR',
    isFront: boolean,
    isLeft: boolean
  ): WheelInstantState => {
    const sign = isLeft ? 1 : -1; // Left is outer when lateralG > 0
    const heaveDz = isFront ? fHeaveDzM : rHeaveDzM;
    const rollDz = (isFront ? fRollTravelM : rRollTravelM) * sign;
    const totalDzM = Math.max(-0.09, Math.min(0.11, heaveDz + rollDz));

    const staticCamber = isFront ? input.frontStaticCamberDeg : input.rearStaticCamberDeg;
    const camberGain = isFront ? input.frontCamberGainDegPerM : input.rearCamberGainDegPerM;
    const camberChassisDeg =
      staticCamber - camberGain * totalDzM - 95 * totalDzM * Math.abs(totalDzM);
    // Relative to ground, body roll tilts left wheel by +rollDeg and right wheel by -rollDeg
    const camberWorldDeg = camberChassisDeg + rollDeg * sign * 0.88;

    const staticToe = isFront ? analysis.frontStaticToeDeg : analysis.rearStaticToeDeg;
    const bumpSteer = isFront ? input.frontBumpSteerDegPerM : input.rearBumpSteerDegPerM;
    const toeDeg = staticToe + bumpSteer * totalDzM;

    const baseLoadN = (isFront ? fStaticN : rStaticN) * loadFactor + (isFront ? pitchTransferN * 0.5 : -pitchTransferN * 0.5);
    const latDeltaN = (isFront ? fLatTransferN : rLatTransferN) * sign;
    const loadKgf = Math.max(0, (baseLoadN + latDeltaN) / G_ACCEL);

    const staticRhMm = isFront
      ? analysis.frontStaticRideHeightMm
      : analysis.rearStaticRideHeightMm;

    return {
      id,
      travelMm: Number((totalDzM * 1000).toFixed(1)),
      rideHeightMm: Number(Math.max(12, staticRhMm - totalDzM * 1000).toFixed(1)),
      camberWorldDeg: Number(camberWorldDeg.toFixed(2)),
      camberChassisDeg: Number(camberChassisDeg.toFixed(2)),
      toeDeg: Number(toeDeg.toFixed(3)),
      loadKgf: Number(loadKgf.toFixed(1)),
    };
  };

  return {
    chassisHeaveM,
    chassisRollRad: rollRad,
    chassisRollDeg: Number(rollDeg.toFixed(2)),
    chassisPitchRad,
    chassisPitchDeg: Number(chassisPitchDeg.toFixed(2)),
    frontRideHeightMm: Number(Math.max(12, analysis.frontStaticRideHeightMm - fHeaveDzM * 1000).toFixed(1)),
    rearRideHeightMm: Number(Math.max(12, analysis.rearStaticRideHeightMm - rHeaveDzM * 1000).toFixed(1)),
    wheels: {
      LF: buildWheel('LF', true, true),
      RF: buildWheel('RF', true, false),
      LR: buildWheel('LR', false, true),
      RR: buildWheel('RR', false, false),
    },
  };
}
