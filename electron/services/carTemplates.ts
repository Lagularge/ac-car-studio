import type { CreateCarPayload, NewCarTemplateId, UiCarJson } from '../../src/types/ac';

interface TemplatePreset {
  driveType: 'RWD' | 'FWD' | 'AWD';
  inertia: string;
  fuel: number;
  maxFuel: number;
  idleRpm: number;
  limiterFactor: number;
  gears: number[];
  finalRatio: number;
  wheelbase: number;
  cgLocation: number;
  frontTrack: number;
  rearTrack: number;
  frontSpring: number;
  rearSpring: number;
  frontDamperBump: number;
  rearDamperBump: number;
  frontDamperReb: number;
  rearDamperReb: number;
  frontArb: number;
  rearArb: number;
  frontCamber: number;
  rearCamber: number;
  steerLock: number;
  steerRatio: number;
  lsdPower: number;
  lsdCoast: number;
  lsdPreload: number;
  brakeTorque: number;
  brakeBias: number;
  tyreRadiusFront: number;
  tyreRadiusRear: number;
  tyreWidthFront: number;
  tyreWidthRear: number;
  tyreDy: number;
  tyreDx: number;
  tyreName: string;
  bodyCl: number;
  bodyCd: number;
  rearWingCl: number;
  rearWingCd: number;
  tags: string[];
}

const TEMPLATES: Record<NewCarTemplateId, TemplatePreset> = {
  fr_sports: {
    driveType: 'RWD',
    inertia: '1.75, 1.22, 4.35',
    fuel: 40,
    maxFuel: 60,
    idleRpm: 900,
    limiterFactor: 1.0,
    gears: [3.62, 2.19, 1.54, 1.21, 1.0, 0.77],
    finalRatio: 4.1,
    wheelbase: 2.57,
    cgLocation: 0.52,
    frontTrack: 1.52,
    rearTrack: 1.54,
    frontSpring: 65000,
    rearSpring: 58000,
    frontDamperBump: 4200,
    rearDamperBump: 3800,
    frontDamperReb: 6500,
    rearDamperReb: 5800,
    frontArb: 28000,
    rearArb: 18000,
    frontCamber: -1.8,
    rearCamber: -1.4,
    steerLock: 450,
    steerRatio: 14.5,
    lsdPower: 0.45,
    lsdCoast: 0.25,
    lsdPreload: 35,
    brakeTorque: 2600,
    brakeBias: 0.65,
    tyreRadiusFront: 0.316,
    tyreRadiusRear: 0.316,
    tyreWidthFront: 0.235,
    tyreWidthRear: 0.255,
    tyreDy: 1.28,
    tyreDx: 1.30,
    tyreName: 'Street Performance',
    bodyCl: 0.08,
    bodyCd: 0.32,
    rearWingCl: 0.14,
    rearWingCd: 0.04,
    tags: ['#street', 'rwd', 'manual', 'sports'],
  },
  drift_spec: {
    driveType: 'RWD',
    inertia: '1.70, 1.18, 4.45',
    fuel: 35,
    maxFuel: 55,
    idleRpm: 1050,
    limiterFactor: 1.0,
    gears: [3.32, 1.90, 1.31, 1.0, 0.76],
    finalRatio: 4.3,
    wheelbase: 2.525,
    cgLocation: 0.54,
    frontTrack: 1.58,
    rearTrack: 1.56,
    frontSpring: 95000,
    rearSpring: 72000,
    frontDamperBump: 5200,
    rearDamperBump: 3900,
    frontDamperReb: 8200,
    rearDamperReb: 6100,
    frontArb: 36000,
    rearArb: 14000,
    frontCamber: -4.8,
    rearCamber: -0.8,
    steerLock: 540,
    steerRatio: 9.2,
    lsdPower: 0.92,
    lsdCoast: 0.85,
    lsdPreload: 95,
    brakeTorque: 2900,
    brakeBias: 0.68,
    tyreRadiusFront: 0.312,
    tyreRadiusRear: 0.314,
    tyreWidthFront: 0.245,
    tyreWidthRear: 0.265,
    tyreDy: 1.22,
    tyreDx: 1.24,
    tyreName: 'Drift Semi-Slick',
    bodyCl: 0.05,
    bodyCd: 0.35,
    rearWingCl: 0.10,
    rearWingCd: 0.05,
    tags: ['#drift', 'rwd', 'manual', 'turbo', 'custom'],
  },
  awd_rally: {
    driveType: 'AWD',
    inertia: '1.80, 1.30, 4.30',
    fuel: 45,
    maxFuel: 60,
    idleRpm: 950,
    limiterFactor: 1.0,
    gears: [3.45, 2.06, 1.44, 1.09, 0.82, 0.65],
    finalRatio: 4.44,
    wheelbase: 2.62,
    cgLocation: 0.56,
    frontTrack: 1.55,
    rearTrack: 1.55,
    frontSpring: 52000,
    rearSpring: 48000,
    frontDamperBump: 4500,
    rearDamperBump: 4200,
    frontDamperReb: 6800,
    rearDamperReb: 6400,
    frontArb: 22000,
    rearArb: 24000,
    frontCamber: -2.2,
    rearCamber: -1.6,
    steerLock: 420,
    steerRatio: 13.0,
    lsdPower: 0.55,
    lsdCoast: 0.35,
    lsdPreload: 45,
    brakeTorque: 2800,
    brakeBias: 0.62,
    tyreRadiusFront: 0.318,
    tyreRadiusRear: 0.318,
    tyreWidthFront: 0.245,
    tyreWidthRear: 0.245,
    tyreDy: 1.32,
    tyreDx: 1.34,
    tyreName: 'Rally Tarmac',
    bodyCl: 0.12,
    bodyCd: 0.36,
    rearWingCl: 0.28,
    rearWingCd: 0.07,
    tags: ['#rally', 'awd', 'turbo', 'manual'],
  },
  ff_hothatch: {
    driveType: 'FWD',
    inertia: '1.65, 1.25, 3.95',
    fuel: 35,
    maxFuel: 50,
    idleRpm: 850,
    limiterFactor: 1.0,
    gears: [3.26, 2.13, 1.51, 1.14, 0.92, 0.74],
    finalRatio: 4.53,
    wheelbase: 2.58,
    cgLocation: 0.61,
    frontTrack: 1.54,
    rearTrack: 1.52,
    frontSpring: 60000,
    rearSpring: 68000,
    frontDamperBump: 4000,
    rearDamperBump: 4200,
    frontDamperReb: 6200,
    rearDamperReb: 6500,
    frontArb: 24000,
    rearArb: 32000,
    frontCamber: -2.5,
    rearCamber: -1.2,
    steerLock: 450,
    steerRatio: 14.0,
    lsdPower: 0.60,
    lsdCoast: 0.15,
    lsdPreload: 30,
    brakeTorque: 2450,
    brakeBias: 0.70,
    tyreRadiusFront: 0.308,
    tyreRadiusRear: 0.308,
    tyreWidthFront: 0.235,
    tyreWidthRear: 0.225,
    tyreDy: 1.29,
    tyreDx: 1.31,
    tyreName: 'Sport Street',
    bodyCl: 0.06,
    bodyCd: 0.33,
    rearWingCl: 0.12,
    rearWingCd: 0.03,
    tags: ['#street', 'fwd', 'manual', 'hatchback'],
  },
  gt3_race: {
    driveType: 'RWD',
    inertia: '1.90, 1.08, 4.65',
    fuel: 60,
    maxFuel: 120,
    idleRpm: 1600,
    limiterFactor: 1.0,
    gears: [2.85, 2.12, 1.68, 1.36, 1.12, 0.94],
    finalRatio: 3.73,
    wheelbase: 2.68,
    cgLocation: 0.45,
    frontTrack: 1.66,
    rearTrack: 1.68,
    frontSpring: 165000,
    rearSpring: 155000,
    frontDamperBump: 9500,
    rearDamperBump: 9000,
    frontDamperReb: 14500,
    rearDamperReb: 13800,
    frontArb: 54000,
    rearArb: 42000,
    frontCamber: -3.4,
    rearCamber: -2.6,
    steerLock: 320,
    steerRatio: 12.0,
    lsdPower: 0.50,
    lsdCoast: 0.65,
    lsdPreload: 80,
    brakeTorque: 4200,
    brakeBias: 0.61,
    tyreRadiusFront: 0.330,
    tyreRadiusRear: 0.345,
    tyreWidthFront: 0.305,
    tyreWidthRear: 0.325,
    tyreDy: 1.58,
    tyreDx: 1.62,
    tyreName: 'GT3 Racing Slick Medium',
    bodyCl: 0.38,
    bodyCd: 0.40,
    rearWingCl: 0.95,
    rearWingCd: 0.16,
    tags: ['#gt3', 'rwd', 'semislick', 'sequential', 'race'],
  },
};

function generateTorqueLutPoints(peakTorque: number, maxRpm: number, idleRpm: number): [number, number][] {
  const pts: [number, number][] = [];
  const step = 500;
  const peakRpm = Math.round((maxRpm * 0.68) / 100) * 100;

  pts.push([0, Math.round(peakTorque * 0.32)]);
  for (let rpm = 500; rpm <= maxRpm + 500; rpm += step) {
    let factor: number;
    if (rpm < idleRpm) {
      factor = 0.42 + (rpm / idleRpm) * 0.18;
    } else if (rpm <= peakRpm) {
      const t = (rpm - idleRpm) / Math.max(1, peakRpm - idleRpm);
      factor = 0.60 + 0.40 * Math.sin((t * Math.PI) / 2);
    } else if (rpm <= maxRpm) {
      const t = (rpm - peakRpm) / Math.max(1, maxRpm - peakRpm);
      factor = 1.0 - 0.14 * (t * t);
    } else {
      factor = 0.55;
    }
    pts.push([rpm, Math.max(20, Math.round(peakTorque * factor))]);
  }
  return pts;
}

export function buildNewCarFiles(payload: CreateCarPayload): {
  files: Record<string, string>;
  uiCarJson: UiCarJson;
} {
  const tpl = TEMPLATES[payload.templateId] ?? TEMPLATES.fr_sports;
  const maxRpm = Math.max(4500, Math.round(payload.maxRpm));
  const idleRpm = tpl.idleRpm;
  const hasTurbo = payload.turboBoostBar > 0.01;
  // Base NA torque in power.lut is divided by (1 + boost) so final peak aligns nicely with requested peakTorqueNm
  const basePeakTorque = hasTurbo
    ? Math.round(payload.peakTorqueNm / (1 + payload.turboBoostBar * 0.85))
    : Math.round(payload.peakTorqueNm);

  const lutPts = generateTorqueLutPoints(basePeakTorque, maxRpm, idleRpm);
  const powerLut = lutPts.map(([r, t]) => `${r}|${t}`).join('\n') + '\n';

  // Estimate UI curve (with turbo multiplier)
  const uiTorqueCurve: [string, string][] = [];
  const uiPowerCurve: [string, string][] = [];
  let maxTorque = 0;
  let maxPs = 0;
  for (const [rpm, naTorque] of lutPts) {
    if (rpm > maxRpm) continue;
    const boostFactor = hasTurbo
      ? payload.turboBoostBar * Math.min(1, Math.pow(Math.max(0, rpm - 1500) / Math.max(1, maxRpm * 0.45), 1.6))
      : 0;
    const totalTorque = Math.round(naTorque * (1 + boostFactor));
    const ps = Math.round((totalTorque * rpm) / 7023.5);
    if (totalTorque > maxTorque) maxTorque = totalTorque;
    if (ps > maxPs) maxPs = ps;
    uiTorqueCurve.push([String(rpm), String(totalTorque)]);
    uiPowerCurve.push([String(rpm), String(ps)]);
  }

  const maxBhp = Math.round(maxPs * 0.9863);
  const lastGear = tpl.gears[tpl.gears.length - 1];
  const estTopSpeed = Math.round(
    ((maxRpm / (lastGear * tpl.finalRatio)) * 2 * Math.PI * tpl.tyreRadiusRear * 60) / 1000
  );
  const pwr = (payload.massKg / Math.max(1, maxBhp)).toFixed(2);

  const turboSection = hasTurbo
    ? `
[TURBO_0]
LAG_DN=0.96
LAG_UP=0.985
MAX_BOOST=${payload.turboBoostBar.toFixed(2)}
WASTEGATE=${payload.turboBoostBar.toFixed(2)}
DISPLAY_MAX_BOOST=${payload.turboBoostBar.toFixed(2)}
REFERENCE_RPM=${Math.round(maxRpm * 0.52)}
GAMMA=2.1
COCKPIT_ADJUSTABLE=1
`
    : '';

  const gearsIni = tpl.gears
    .map((ratio, idx) => `GEAR_${idx + 1}=${ratio.toFixed(3)}`)
    .join('\n');

  const awdSection =
    tpl.driveType === 'AWD'
      ? `
[AWD]
FRONT_SHARE=38
FRONT_DIFF_POWER=0.25
FRONT_DIFF_COAST=0.10
FRONT_DIFF_PRELOAD=15
CENTRE_DIFF_POWER=0.50
CENTRE_DIFF_COAST=0.35
CENTRE_DIFF_PRELOAD=40
REAR_DIFF_POWER=${tpl.lsdPower.toFixed(2)}
REAR_DIFF_COAST=${tpl.lsdCoast.toFixed(2)}
REAR_DIFF_PRELOAD=${tpl.lsdPreload}
`
      : '';

  const files: Record<string, string> = {
    'car.ini': `[HEADER]
VERSION=2

[INFO]
SCREEN_NAME=${payload.name}

[BASIC]
GRAPHICS_OFFSET=0,-0.32,0
GRAPHICS_PITCH_ROTATION=0
TOTALMASS=${Math.round(payload.massKg)}
INERTIA=${tpl.inertia}

[GRAPHICS]
DRIVEREYES=0.35,1.05,-0.25
ONBOARD_EXPOSURE=28
OUTBOARD_EXPOSURE=31
ON_BOARD_PITCH_ANGLE=-2.0
BUMPER_CAMERA_POS=0,0.45,1.95
BONNET_CAMERA_POS=0,1.08,0.60
MIRROR_POSITION=0.0,1.12,0.52
SHAKE_MUL=1.8
USE_ANIMATED_SUSPENSIONS=0
FUEL_LIGHT_MIN_LITERS=8

[CONTROLS]
FFMULT=2.2
STEER_ASSIST=1.0
STEER_LOCK=${tpl.steerLock}
STEER_RATIO=${tpl.steerRatio}
LINEAR_STEER_ROD_RATIO=0.0028

[FUEL]
CONSUMPTION=0.0030
FUEL=${tpl.fuel}
MAX_FUEL=${tpl.maxFuel}

[FUELTANK]
POSITION=0,-0.15,-1.10

[RIDE]
PICKUP_FRONT_HEIGHT=-0.18
PICKUP_REAR_HEIGHT=-0.19

[PIT_STOP]
TYRE_CHANGE_TIME_SEC=12
FUEL_LITER_TIME_SEC=0.6
BODY_REPAIR_TIME_SEC=20
ENGINE_REPAIR_TIME_SEC=25
SUSP_REPAIR_TIME_SEC=30
`,

    'engine.ini': `[HEADER]
VERSION=1
POWER_CURVE=power.lut
COAST_CURVE=FROM_COAST_REF

[ENGINE_DATA]
ALTITUDE_SENSITIVITY=0.1
INERTIA=0.145
LIMITER=${maxRpm}
LIMITER_HZ=28
MINIMUM=${idleRpm}

[COAST_REF]
RPM=${maxRpm}
TORQUE=75
NON_LINEARITY=0

[COAST_DATA]
COAST0=0
COAST1=0
COAST=0.0000015

[COAST_CURVE]
FILENAME=coast.lut
${turboSection}
[DAMAGE]
TURBO_BOOST_THRESHOLD=2.2
TURBO_DAMAGE_K=5
RPM_THRESHOLD=${maxRpm + 400}
RPM_DAMAGE_K=1
`,

    'power.lut': powerLut,

    'drivetrain.ini': `[HEADER]
VERSION=3

[TRACTION]
TYPE=${tpl.driveType}

[GEARS]
COUNT=${tpl.gears.length}
GEAR_R=-3.380
${gearsIni}
FINAL=${tpl.finalRatio.toFixed(3)}

[DIFFERENTIAL]
POWER=${tpl.lsdPower.toFixed(2)}
COAST=${tpl.lsdCoast.toFixed(2)}
PRELOAD=${tpl.lsdPreload}
${awdSection}
[GEARBOX]
CHANGE_UP_TIME=${payload.templateId === 'gt3_race' ? 55 : 135}
CHANGE_DN_TIME=${payload.templateId === 'gt3_race' ? 75 : 165}
AUTO_CUTOFF_TIME=${payload.templateId === 'gt3_race' ? 60 : 120}
SUPPORTS_SHIFTER=${payload.templateId === 'gt3_race' ? 0 : 1}
VALID_SHIFT_RPM_WINDOW=800
CONTROLS_WINDOW_GAIN=0.4
INERTIA=0.025

[CLUTCH]
MAX_TORQUE=${Math.round(Math.max(400, payload.peakTorqueNm * 1.45))}

[AUTOCLUTCH]
UPSHIFT_PROFILE=NONE
DOWNSHIFT_PROFILE=DOWNSHIFT_PROFILE
USE_ON_CHANGES=1
MIN_RPM=${idleRpm + 200}
MAX_RPM=${Math.round(maxRpm * 0.45)}
FORCED_ON=0

[DOWNSHIFT_PROFILE]
POINT_0=15
POINT_1=110
POINT_2=210

[AUTOBLIP]
ELECTRONIC=${payload.templateId === 'gt3_race' ? 1 : 0}
POINT_0=10
POINT_1=120
POINT_2=160
LEVEL=0.75

[AUTO_SHIFTER]
UP=${Math.round(maxRpm * 0.94)}
DOWN=${Math.round(maxRpm * 0.56)}
SLIP_THRESHOLD=1.15
GAS_CUTOFF_TIME=0.22

[DAMAGE]
RPM_WINDOW_K=100
`,

    'suspensions.ini': `[HEADER]
VERSION=1

[BASIC]
WHEELBASE=${tpl.wheelbase.toFixed(3)}
CG_LOCATION=${tpl.cgLocation.toFixed(3)}

[ARB]
FRONT=${tpl.frontArb}
REAR=${tpl.rearArb}

[FRONT]
TYPE=DWB
BASEY=-0.125
TRACK=${tpl.frontTrack.toFixed(3)}
ROD_LENGTH=0.045
HUB_MASS=36
RIM_OFFSET=0.0
WBCAR_TOP_FRONT=0.42,0.16,0.16
WBCAR_TOP_REAR=0.42,0.15,-0.16
WBCAR_BOTTOM_FRONT=0.36,-0.08,0.18
WBCAR_BOTTOM_REAR=0.36,-0.08,-0.18
WBTYRE_TOP=0.08,0.18,0.0
WBTYRE_BOTTOM=0.06,-0.09,0.015
WBCAR_STEER=0.38,-0.04,0.13
WBTYRE_STEER=0.07,-0.04,0.13
TOE_OUT=0.00010
STATIC_CAMBER=${tpl.frontCamber.toFixed(2)}
SPRING_RATE=${tpl.frontSpring}
PROGRESSIVE_SPRING_RATE=0
BUMP_STOP_RATE=500000
BUMPSTOP_UP=0.065
BUMPSTOP_DN=0.070
PACKER_RANGE=0.055
DAMP_BUMP=${tpl.frontDamperBump}
DAMP_FAST_BUMP=${Math.round(tpl.frontDamperBump * 0.6)}
DAMP_FAST_BUMPTHRESHOLD=0.14
DAMP_REBOUND=${tpl.frontDamperReb}
DAMP_FAST_REBOUND=${Math.round(tpl.frontDamperReb * 0.6)}
DAMP_FAST_REBOUNDTHRESHOLD=0.14

[REAR]
TYPE=DWB
BASEY=-0.120
TRACK=${tpl.rearTrack.toFixed(3)}
ROD_LENGTH=0.045
HUB_MASS=38
RIM_OFFSET=0.0
WBCAR_TOP_FRONT=0.40,0.15,0.16
WBCAR_TOP_REAR=0.40,0.15,-0.16
WBCAR_BOTTOM_FRONT=0.34,-0.08,0.18
WBCAR_BOTTOM_REAR=0.34,-0.08,-0.18
WBTYRE_TOP=0.08,0.17,0.0
WBTYRE_BOTTOM=0.06,-0.09,0.0
WBCAR_STEER=0.36,-0.05,-0.15
WBTYRE_STEER=0.06,-0.05,-0.15
TOE_OUT=0.00040
STATIC_CAMBER=${tpl.rearCamber.toFixed(2)}
SPRING_RATE=${tpl.rearSpring}
PROGRESSIVE_SPRING_RATE=0
BUMP_STOP_RATE=500000
BUMPSTOP_UP=0.070
BUMPSTOP_DN=0.075
PACKER_RANGE=0.060
DAMP_BUMP=${tpl.rearDamperBump}
DAMP_FAST_BUMP=${Math.round(tpl.rearDamperBump * 0.6)}
DAMP_FAST_BUMPTHRESHOLD=0.14
DAMP_REBOUND=${tpl.rearDamperReb}
DAMP_FAST_REBOUND=${Math.round(tpl.rearDamperReb * 0.6)}
DAMP_FAST_REBOUNDTHRESHOLD=0.14

[GRAPHICS_OFFSETS]
WHEEL_LF=0
SUSP_LF=0
WHEEL_RF=0
SUSP_RF=0
WHEEL_LR=0
SUSP_LR=0
WHEEL_RR=0
SUSP_RR=0

[DAMAGE]
MIN_VELOCITY=40
GAIN=0.0004
MAX_DAMAGE=0.05
DEBUG_LOG=0
`,

    'tyres.ini': `[HEADER]
VERSION=10

[COMPOUND_DEFAULT]
INDEX=0

[FRONT]
NAME=${tpl.tyreName}
SHORT_NAME=SP
WIDTH=${tpl.tyreWidthFront.toFixed(3)}
RADIUS=${tpl.tyreRadiusFront.toFixed(3)}
RIM_RADIUS=0.241
ANGULAR_INERTIA=1.35
DAMP=450
RATE=265000
DY0=${(tpl.tyreDy * 0.96).toFixed(4)}
DY1=-0.045
DX0=${(tpl.tyreDx * 0.96).toFixed(4)}
DX1=-0.042
WEAR_CURVE=tyre_wear_curve.lut
SPEED_SENSITIVITY=0.0025
RELAXATION_LENGTH=0.065
ROLLING_RESISTANCE_0=12
ROLLING_RESISTANCE_1=0.0005
ROLLING_RESISTANCE_SLIP=4200
FLEX=0.00065
CAMBER_GAIN=0.14
DCAMBER_0=1.2
DCAMBER_1=-13
FRICTION_LIMIT_ANGLE=7.8
XMU=0.25
PRESSURE_STATIC=30
PRESSURE_SPRING_GAIN=6500
PRESSURE_FLEX_GAIN=0.4
PRESSURE_RR_GAIN=0.55
PRESSURE_D_GAIN=0.004
PRESSURE_IDEAL=33
FZ0=3600
LS_EXPY=0.80
LS_EXPX=0.82
DX_REF=${tpl.tyreDx.toFixed(3)}
DY_REF=${tpl.tyreDy.toFixed(3)}
FLEX_GAIN=0.042
FALLOFF_LEVEL=0.84
FALLOFF_SPEED=2.2
CX_MULT=1.02
RADIUS_ANGULAR_K=0.01
BRAKE_DX_MOD=0.03

[REAR]
NAME=${tpl.tyreName}
SHORT_NAME=SP
WIDTH=${tpl.tyreWidthRear.toFixed(3)}
RADIUS=${tpl.tyreRadiusRear.toFixed(3)}
RIM_RADIUS=0.241
ANGULAR_INERTIA=1.45
DAMP=450
RATE=275000
DY0=${(tpl.tyreDy * 0.96).toFixed(4)}
DY1=-0.045
DX0=${(tpl.tyreDx * 0.96).toFixed(4)}
DX1=-0.042
WEAR_CURVE=tyre_wear_curve.lut
SPEED_SENSITIVITY=0.0025
RELAXATION_LENGTH=0.065
ROLLING_RESISTANCE_0=12
ROLLING_RESISTANCE_1=0.0005
ROLLING_RESISTANCE_SLIP=4200
FLEX=0.00065
CAMBER_GAIN=0.14
DCAMBER_0=1.2
DCAMBER_1=-13
FRICTION_LIMIT_ANGLE=7.8
XMU=0.25
PRESSURE_STATIC=30
PRESSURE_SPRING_GAIN=6500
PRESSURE_FLEX_GAIN=0.4
PRESSURE_RR_GAIN=0.55
PRESSURE_D_GAIN=0.004
PRESSURE_IDEAL=33
FZ0=3800
LS_EXPY=0.80
LS_EXPX=0.82
DX_REF=${tpl.tyreDx.toFixed(3)}
DY_REF=${tpl.tyreDy.toFixed(3)}
FLEX_GAIN=0.042
FALLOFF_LEVEL=0.84
FALLOFF_SPEED=2.2
CX_MULT=1.02
RADIUS_ANGULAR_K=0.01
BRAKE_DX_MOD=0.03

[THERMAL_FRONT]
SURFACE_TRANSFER=0.015
PATCH_TRANSFER=0.0003
CORE_TRANSFER=0.00018
INTERNAL_CORE_TRANSFER=0.003
FRICTION_K=0.045
ROLLING_K=0.25
PERFORMANCE_CURVE=tcurve_street.lut
GRAIN_GAMMA=2
GRAIN_GAIN=0.4
BLISTER_GAMMA=2
BLISTER_GAIN=0.4
COOL_FACTOR=1.55
SURFACE_ROLLING_K=0.85

[THERMAL_REAR]
SURFACE_TRANSFER=0.015
PATCH_TRANSFER=0.0003
CORE_TRANSFER=0.00018
INTERNAL_CORE_TRANSFER=0.003
FRICTION_K=0.045
ROLLING_K=0.25
PERFORMANCE_CURVE=tcurve_street.lut
GRAIN_GAMMA=2
GRAIN_GAIN=0.4
BLISTER_GAMMA=2
BLISTER_GAIN=0.4
COOL_FACTOR=1.55
SURFACE_ROLLING_K=0.85
`,

    'brakes.ini': `[HEADER]
VERSION=1

[DATA]
MAX_TORQUE=${tpl.brakeTorque}
FRONT_SHARE=${tpl.brakeBias.toFixed(2)}
HANDBRAKE_TORQUE=${payload.templateId === 'drift_spec' ? 2800 : 1200}
COCKPIT_ADJUSTABLE=${payload.templateId === 'gt3_race' ? 1 : 0}
ADJUST_STEP=0.5
`,

    'aero.ini': `[HEADER]
VERSION=2

[WING_0]
NAME=BODY
CHORD=1.0
SPAN=1.78
POSITION=0,0.08,0.05
LUT_AOA_CL=wing_body_AOA_CL.lut
LUT_GH_CL=
CL_GAIN=${tpl.bodyCl.toFixed(2)}
LUT_AOA_CD=wing_body_AOA_CD.lut
LUT_GH_CD=
CD_GAIN=${tpl.bodyCd.toFixed(2)}
ANGLE=0

[WING_1]
NAME=REAR_WING
CHORD=0.35
SPAN=1.45
POSITION=0,0.72,-1.95
LUT_AOA_CL=wing_rear_AOA_CL.lut
LUT_GH_CL=
CL_GAIN=${tpl.rearWingCl.toFixed(2)}
LUT_AOA_CD=wing_rear_AOA_CD.lut
LUT_GH_CD=
CD_GAIN=${tpl.rearWingCd.toFixed(2)}
ANGLE=${payload.templateId === 'gt3_race' ? 6 : 2}
`,

    'electronics.ini': `[ABS]
SLIP_RATIO_LIMIT=0.14
CURVE=
PRESENT=${payload.templateId === 'drift_spec' ? 0 : 1}
ACTIVE=${payload.templateId === 'drift_spec' ? 0 : 1}
RATE_HZ=80

[TRACTION_CONTROL]
SLIP_RATIO_LIMIT=0.07
CURVE=
PRESENT=${payload.templateId === 'drift_spec' ? 0 : 1}
ACTIVE=${payload.templateId === 'drift_spec' ? 0 : 1}
RATE_HZ=100
MIN_SPEED_KMH=20
`,

    'tyre_wear_curve.lut': `0|100
25|98
50|95
75|88
90|75
100|50
`,

    'tcurve_street.lut': `10|0.94
40|0.98
75|1.00
95|0.99
120|0.93
160|0.82
`,

    'wing_body_AOA_CL.lut': `-10|-0.5
0|1.0
10|1.5
`,

    'wing_body_AOA_CD.lut': `-10|1.2
0|1.0
10|1.2
`,

    'wing_rear_AOA_CL.lut': `-5|0.2
0|0.7
5|1.0
10|1.35
15|1.55
`,

    'wing_rear_AOA_CD.lut': `-5|0.8
0|1.0
5|1.2
10|1.6
15|2.1
`,

    'setup.ini': `[DISPLAY_METHOD]
SHOW_CLICKS=0

[GEARS]
USE_GEARSET=0

[FUEL]
SHOW_CLICKS=0
TAB=GENERIC
NAME=Fuel
MIN=5
MAX=${tpl.maxFuel}
STEP=1
POS_X=0.5
POS_Y=0
HELP=HELP_FUEL

[BRAKE_POWER_MULT]
SHOW_CLICKS=0
TAB=GENERIC
NAME=Brake Power
MIN=80
MAX=100
STEP=1
POS_X=0.5
POS_Y=2
HELP=HELP_BRAKE_POWER_MULT

[FRONT_BIAS]
SHOW_CLICKS=0
TAB=GENERIC
NAME=Brake Bias
MIN=50
MAX=80
STEP=1
POS_X=0.5
POS_Y=3
HELP=HELP_FRONT_BIAS
`,

    'lods.ini': `[COCKPIT_HR]
DISTANCE_SWITCH=8

[LOD_0]
FILE=${payload.folderName}.kn5
IN=0
OUT=2000
`,

    'cameras.ini': `[CAMERA_0]
NAME=CHASER
POSITION=0,1.25,-4.4
FORWARD=0,-0.08,1
UP=0,1,0
FOV=56
`,
  };

  const uiCarJson: UiCarJson = {
    name: payload.name,
    brand: payload.brand,
    description: payload.description || `${payload.name} — Created with AC Car Studio`,
    tags: [...tpl.tags, payload.brand.toLowerCase()],
    class: payload.carClass || 'street',
    specs: {
      bhp: `${maxBhp} bhp`,
      torque: `${maxTorque} Nm`,
      weight: `${Math.round(payload.massKg)} kg`,
      topspeed: `${estTopSpeed}+ km/h`,
      acceleration: `${Math.max(2.3, Number((payload.massKg / Math.max(100, maxPs) * 1.15).toFixed(1)))}s 0-100`,
      pwratio: `${pwr} kg/hp`,
    },
    torqueCurve: uiTorqueCurve,
    powerCurve: uiPowerCurve,
    country: payload.country || 'Japan',
    author: payload.author || 'AC Car Studio',
    version: '1.0',
    url: '',
    year: payload.year || 2024,
  };

  return { files, uiCarJson };
}
