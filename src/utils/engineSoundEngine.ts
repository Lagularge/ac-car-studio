import type { SoundExportPayload, SoundSampleWavPayload } from '../types/ac';
import type { EngineSimConfig, EngineSimResult } from './engineSimPhysics';

export type ExhaustMufflerType = 'STRAIGHT' | 'TITANIUM' | 'SPORT' | 'STREET';
export type AcousticRoomType = 'DYNO_GARAGE' | 'TRACK_OUTSIDE' | 'COCKPIT' | 'TUNNEL';
export type IntakeSystemType = 'STOCK_AIRBOX' | 'CONE_FILTER' | 'CARBON_PLENUM' | 'ITB_INDIVIDUAL';
export type ExhaustCrossoverType = 'SINGLE_MERGE' | 'DUAL_SEPARATE' | 'H_PIPE' | 'X_PIPE';

export interface EngineSoundSettings {
  masterVolume: number;         // 0..1
  // Exhaust & Interference
  exhaustLevel: number;         // 0..1.5
  crossoverType: ExhaustCrossoverType;
  interferenceStrength: number; // 0..1.5 (collector wave interference & back-pressure coupling)
  exhaustRasp: number;          // 0..1.5 (high-velocity non-linear wave steepening)
  exhaustLengthM: number;       // 1.2..4.5 m
  mufflerType: ExhaustMufflerType;
  // Low-Frequency Muffler Shake, Internal Cavity Resonance & Physical Mass Coupling
  mufflerShakeLevel: number;    // 0..1.8 (low-frequency physical muffler canister shake / "doko-doko")
  internalResonance: number;    // 0..1.8 (internal muffler chamber & cabin cavity resonance)
  mufflerMassKg: number;        // 4..30 kg (light thin titanium -> heavy thick steel canister)
  engineMassKg: number;         // 80..320 kg (light alloy block -> heavy cast-iron block)
  chassisMassKg: number;        // 700..2200 kg (stripped carbon tub -> heavy steel GT coupe)
  // Interior Cabin NVH (Soundproofing, Thermal Insulation & Firewall Attenuation)
  cabinInsulation: number;      // 0..1.0 (0=stripped race car, 0.58=sport street, 1.0=luxury GT sound/heat mat)
  firewallThickness: number;    // 0.2..1.5 (steel bulkhead mass-law + glass acoustic isolation)
  // Intake Induction
  intakeType: IntakeSystemType;
  intakeLevel: number;          // 0..1.8
  intakeResonance: number;      // 0.3..1.8 (Helmholtz plenum resonance Q & presence)
  // Mechanical & Metallic Engine Sounds
  mechanicalLevel: number;      // 0..1.5 (valvetrain, reciprocating block thump)
  metallicRinging: number;      // 0..1.5 (thin-wall header & exhaust shell modal resonance)
  gearWhineLevel: number;       // 0..1.2 (transmission / cam gear whine)
  // Forced Induction & Overrun
  turboWhineLevel: number;      // 0..1.5
  bovFlutterLevel: number;      // 0..1.5
  popBangLevel: number;         // 0..1.5
  // Acoustic Environment IR
  roomType: AcousticRoomType;
  convolutionMix: number;       // 0..0.85
  revLimiterCutHz: number;      // 14..42 Hz
}

export const DEFAULT_SOUND_SETTINGS: EngineSoundSettings = {
  masterVolume: 0.78,
  exhaustLevel: 1.05,
  crossoverType: 'X_PIPE',
  interferenceStrength: 0.85,
  exhaustRasp: 0.52,
  exhaustLengthM: 2.65,
  mufflerType: 'TITANIUM',
  mufflerShakeLevel: 1.18,
  internalResonance: 1.12,
  mufflerMassKg: 12,
  engineMassKg: 175,
  chassisMassKg: 1350,
  cabinInsulation: 0.58,
  firewallThickness: 0.85,
  intakeType: 'CARBON_PLENUM',
  intakeLevel: 0.48,
  intakeResonance: 0.85,
  mechanicalLevel: 0.88,
  metallicRinging: 0.54,
  gearWhineLevel: 0.24,
  turboWhineLevel: 0.65,
  bovFlutterLevel: 0.85,
  popBangLevel: 0.72,
  roomType: 'DYNO_GARAGE',
  convolutionMix: 0.42,
  revLimiterCutHz: 24,
};

/**
 * Generates high-realism 3D Binaural Image-Source Room & Cabin Impulse Responses (v4)
 * with physical floor/wall/ceiling/windshield early reflections (asymmetric L/R ITD & phase),
 * cabin eigenmodes (81 / 118 / 149 Hz), and porous insulation / air frequency-dependent absorption.
 */
function buildImpulseResponseBuffer(
  ctx: BaseAudioContext,
  room: AcousticRoomType,
  muffler: ExhaustMufflerType,
  cabinInsulation = 0.58
): AudioBuffer {
  const sr = ctx.sampleRate;
  const ins = Math.max(0, Math.min(1, cabinInsulation));
  const durationMap: Record<AcousticRoomType, number> = {
    DYNO_GARAGE: 0.80,
    TRACK_OUTSIDE: 0.44,
    COCKPIT: 0.30 - ins * 0.11, // More soundproofing/carpet/headliner shortens cabin RT60!
    TUNNEL: 1.65,
  };
  const dur = Math.max(0.14, durationMap[room]);
  const length = Math.floor(sr * dur);
  const buffer = ctx.createBuffer(2, length, sr);

  // Asymmetric 3D early reflections: [timeMsL, timeMsR, gain, invertPhase]
  const earlyTaps: Array<[number, number, number, number]> =
    room === 'DYNO_GARAGE'
      ? [
          [2.1, 2.3, 0.42, 1],
          [6.8, 8.9, 0.38, -1],
          [9.4, 7.1, 0.36, -1],
          [12.6, 13.1, 0.30, 1],
          [17.8, 18.6, 0.28, -1],
          [23.4, 26.2, 0.22, 1],
          [29.1, 25.8, 0.21, -1],
          [38.5, 41.2, 0.16, 1],
          [49.0, 46.4, 0.12, -1],
        ]
      : room === 'TUNNEL'
        ? [
            [2.4, 2.7, 0.48, 1],
            [8.2, 11.4, 0.46, -1],
            [11.8, 8.5, 0.45, -1],
            [16.5, 17.2, 0.40, 1],
            [26.0, 29.5, 0.36, -1],
            [38.2, 34.8, 0.32, 1],
            [52.4, 57.1, 0.28, -1],
            [71.0, 66.5, 0.24, 1],
            [94.0, 99.8, 0.19, -1],
            [124.0, 118.2, 0.15, 1],
          ]
        : room === 'COCKPIT'
          ? [
              // Dashboard & windshield glass reflections (damped by soft dash / headliner / seats)
              [1.25, 1.55, 0.34 * (1.1 - ins * 0.45), 1],
              [2.85, 4.35, 0.30 * (1.1 - ins * 0.48), -1], // Left door window
              [4.60, 3.10, 0.28 * (1.1 - ins * 0.48), -1], // Right passenger window
              [5.85, 6.20, 0.24 * (1.0 - ins * 0.58), 1],  // Roof headliner (strongly damped by insulation!)
              [8.70, 9.45, 0.22 * (1.0 - ins * 0.42), -1], // Rear parcel shelf / bulkhead
              [13.4, 12.8, 0.14 * (1.0 - ins * 0.55), 1],  // Longitudinal cabin bounce
            ]
          : [
              [1.9, 2.1, 0.40, 1],
              [11.5, 14.2, 0.28, -1],
              [22.8, 19.6, 0.20, 1],
              [42.0, 46.5, 0.13, -1],
              [74.0, 69.2, 0.08, 1],
            ];

  const baseDecay =
    room === 'TUNNEL'
      ? 2.4
      : room === 'DYNO_GARAGE'
        ? 5.2
        : room === 'COCKPIT'
          ? 10.5 + ins * 11.0 // Upholstered & insulated cabin decays much faster!
          : 8.2;

  // Porous Delany-Bazley high-frequency damping in cockpit increases sharply with insulation!
  const hfDampBase =
    room === 'COCKPIT'
      ? Math.max(0.045, 0.26 - ins * 0.20)
      : muffler === 'STREET'
        ? 0.10
        : muffler === 'SPORT'
          ? 0.18
          : muffler === 'TITANIUM'
            ? 0.28
            : 0.34;

  // Physical cavity eigenmodes (Cockpit: 2.1m x 1.45m x 1.15m cabin -> 81 / 118 / 149 Hz!)
  const roomModes =
    room === 'COCKPIT'
      ? [81, 118, 149]
      : room === 'DYNO_GARAGE'
        ? [58, 118, 224]
        : room === 'TUNNEL'
          ? [46, 94, 188, 360]
          : [82, 175];

  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let lp1 = 0;
    let lp2 = 0;
    let earlyLp = 0;

    let seed = 20261 + ch * 19477;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return (seed / 4294967296) * 2 - 1;
    };

    const earlyBuf = new Float32Array(length);
    for (let k = 0; k < earlyTaps.length; k++) {
      const [tL, tR, gain, sign] = earlyTaps[k];
      const tapSec = (ch === 0 ? tL : tR) / 1000;
      const idx = Math.floor(tapSec * sr);
      if (idx >= 2 && idx < length - 3) {
        earlyBuf[idx - 1] += gain * sign * 0.24;
        earlyBuf[idx] += gain * sign * 0.52;
        earlyBuf[idx + 1] += gain * sign * 0.24;
      }
    }

    for (let i = 0; i < length; i++) {
      const t = i / sr;
      let sample = 0;

      const erCut =
        room === 'COCKPIT'
          ? Math.max(0.055, (0.34 - ins * 0.24) * Math.exp(-t * 14))
          : Math.max(0.12, 0.55 - t * 2.2);
      earlyLp += erCut * (earlyBuf[i] - earlyLp);
      sample += earlyLp * 0.85;

      if (t > 0.0015 && t < 0.18) {
        const modeEnv = Math.exp(-t * (room === 'TUNNEL' ? 14 : room === 'COCKPIT' ? 24 + ins * 10 : 28));
        const phaseShift = ch === 0 ? 0 : 0.0018;
        const modeAmp = room === 'COCKPIT' ? 0.044 * (0.75 + 0.45 * ins) : 0.032;
        for (let m = 0; m < roomModes.length; m++) {
          sample +=
            Math.sin(2 * Math.PI * roomModes[m] * (t + phaseShift)) *
            modeEnv *
            (modeAmp / (m + 1));
        }
      }

      const lateFadeIn = Math.min(1, t / 0.016);
      const env = Math.exp(-t * baseDecay) * lateFadeIn;
      const diffuseGain =
        room === 'TUNNEL'
          ? 0.34
          : room === 'DYNO_GARAGE'
            ? 0.22
            : room === 'COCKPIT'
              ? 0.16 * (1.0 - ins * 0.52)
              : 0.11;
      const rawNoise = rand() * env * diffuseGain;
      const dynamicCut = Math.max(0.025, hfDampBase * Math.exp(-t * (room === 'COCKPIT' ? 8.5 : 3.8)));
      lp1 += dynamicCut * (rawNoise - lp1);
      lp2 += dynamicCut * 0.82 * (lp1 - lp2);
      sample += lp2;

      data[i] = sample * 0.72;
    }
  }

  return buffer;
}

/**
 * High-Realism First-Principles Engine AudioWorkletProcessor (v4)
 * Inspired by ange-yaghi/engine-sim (0.1.11a) GasSystem + Blair 1D Unsteady Gas Dynamics
 * + Munjal 1D Multi-Segment Kelly-Lochbaum Duct Acoustics + Automotive Cabin NVH Physics.
 *
 * Core Physical Models:
 * 1. 6x-Oversampled SI-Unit Gas-Dynamic Thermodynamics (~265-288 kHz internal physics clock):
 *    - Exact Ideal Gas Law (P = nRT/V) in Pascals, Kelvin, moles, m^3 for Intake Plenum & every Cylinder
 *    - True Slider-Crank instantaneous volume V(theta) + adiabatic compression/expansion + Wiebe heat release
 *    - Inertial compressible orifice flow ODEs (dq/dt with runner fluid inertia + Mach-1 sonic choking!)
 *    - Real Intake Plenum vacuum & atmospheric throttle-body rush (naturally produces physical throttle gulp!)
 * 2. 4-Section Kelly-Lochbaum 1D Acoustic Exhaust Duct Network (Per Bank A & B):
 *    - Per-cylinder fractional-delay primary headers -> Collector/X-Pipe/H-Pipe admittance scattering
 *    - Section 1 (Midpipe) <-> Section 2 (Expansion Chamber / Resonator) <-> Section 3 (Muffler Canister)
 *      with exact passive area-ratio reflection coefficients k = (1 - m)/(1 + m)
 *    - Levine-Schwinger frequency-dependent open-tailpipe radiation impedance
 * 3. Exact Axial Pressure-Force Muffler Shake ODE (F = P_inlet - P_outlet driving Muffler Mass on hangers)
 *    + Chassis Mass / Engine Mass / Muffler Mass structural coupling
 * 4. True Interior Cabin NVH Acoustics (when roomType === 'COCKPIT'):
 *    - Airborne Firewall Mass-Law + Delany-Bazley porous soundproofing/thermal insulation absorption
 *    - Rear Bulkhead & Trunk Carpet low-pass isolation for rear exhaust
 *    - Structure-Borne Engine Mount & Muffler Hanger floorpan transmission (bypasses foam!)
 *    - 3D Cabin Eigenmodes (81 / 118 / 149 Hz) & interior front/rear binaural imaging
 */
const ENGINE_WORKLET_CODE = `
class BiquadFilter {
  constructor() {
    this.b0 = 1; this.b1 = 0; this.b2 = 0;
    this.a1 = 0; this.a2 = 0;
    this.z1 = 0; this.z2 = 0;
  }
  setBandpass(sr, freq, q) {
    const f = Math.min(sr * 0.42, Math.max(25, freq));
    const w0 = 6.283185307 * f / sr;
    const cosW = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * Math.max(0.35, q));
    const a0 = 1 + alpha;
    this.b0 = alpha / a0;
    this.b1 = 0;
    this.b2 = -alpha / a0;
    this.a1 = (-2 * cosW) / a0;
    this.a2 = (1 - alpha) / a0;
  }
  setLowpass(sr, freq, q) {
    const f = Math.min(sr * 0.42, Math.max(30, freq));
    const w0 = 6.283185307 * f / sr;
    const cosW = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * Math.max(0.45, q));
    const a0 = 1 + alpha;
    const b1 = 1 - cosW;
    this.b0 = (b1 * 0.5) / a0;
    this.b1 = b1 / a0;
    this.b2 = (b1 * 0.5) / a0;
    this.a1 = (-2 * cosW) / a0;
    this.a2 = (1 - alpha) / a0;
  }
  setPeaking(sr, freq, q, gainDb) {
    const f = Math.min(sr * 0.42, Math.max(25, freq));
    const A = Math.pow(10, gainDb / 40);
    const w0 = 6.283185307 * f / sr;
    const cosW = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * Math.max(0.35, q));
    const a0 = 1 + alpha / A;
    this.b0 = (1 + alpha * A) / a0;
    this.b1 = (-2 * cosW) / a0;
    this.b2 = (1 - alpha * A) / a0;
    this.a1 = (-2 * cosW) / a0;
    this.a2 = (1 - alpha / A) / a0;
  }
  process(x) {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

class AcEngineSimProcessorV4 extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sr = sampleRate;
    this.crankDeg = 0;
    this.rpm = 950;
    this.targetRpm = 950;
    this.throttle = 0.05;
    this.smoothThrottle = 0.05;
    this.prevThrottle = 0.05;
    this.boost = 0.0;
    this.limiterPhase = 0;
    this.limiterCutActive = false;
    this.unburnedFuelA = 0;
    this.unburnedFuelB = 0;
    this.limiterBoomA = 0;
    this.limiterBoomB = 0;
    this.vvtBlend = 0.0;

    // Engine mechanical config (SI units derived dynamically)
    this.firingAngles = [0, 180, 360, 540];
    this.primaryLengthsMm = [540, 540, 540, 540];
    this.cylBanks = [0, 1, 0, 1];
    this.isRotary = false;
    this.isVOrBoxer = false;
    this.aspiration = 'NA';
    this.maxBoostBar = 0;
    this.turboRefRpm = 4200;
    this.turboGamma = 2.0;
    this.redlineRpm = 7800;
    this.idleRpm = 900;
    this.vvtSwitchRpm = 0;
    this.displacementL = 2.0;
    this.compressionRatio = 10.0;
    this.intakeRunnerMm = 300;
    this.helmholtzHz = 260;

    // Sound & Physical Mass + Interior NVH settings
    this.exhaustLevel = 1.05;
    this.crossoverType = 'X_PIPE';
    this.interferenceStrength = 0.85;
    this.exhaustRasp = 0.52;
    this.exhaustLengthM = 2.65;
    this.mufflerType = 'TITANIUM';
    this.mufflerShakeLevel = 1.18;
    this.internalResonance = 1.12;
    this.mufflerMassKg = 12;
    this.engineMassKg = 175;
    this.chassisMassKg = 1350;
    this.cabinInsulation = 0.58;
    this.firewallThickness = 0.85;
    this.roomType = 'DYNO_GARAGE';
    this.intakeType = 'CARBON_PLENUM';
    this.intakeLevel = 0.48;
    this.intakeResonance = 0.85;
    this.mechanicalLevel = 0.88;
    this.metallicRinging = 0.54;
    this.gearWhineLevel = 0.24;
    this.turboWhineLevel = 0.65;
    this.bovFlutterLevel = 0.85;
    this.popBangLevel = 0.72;
    this.revLimiterCutHz = 24;

    // ===== 1. SI-UNIT THERMODYNAMIC GAS SYSTEM STATES (6x Oversampled) =====
    // Intake Plenum Reservoir (P_atm = 101325 Pa, T_atm = 298 K)
    this.plenP = 55000;      // Pa (starts in partial idle vacuum)
    this.plenFlow = 0;       // Inertial throttle-body airflow rate
    this.prevPlenP = 55000;

    // Per-cylinder thermodynamic states + inertial runner flow momentum
    this.cylN = new Float32Array(12);      // Normalized molar mass (1.0 = ambient full swept charge)
    this.cylT = new Float32Array(12);      // Absolute gas temperature (K)
    this.cylVol = new Float32Array(12);    // Normalized cylinder volume (Vc..Vc+1)
    this.cylPrevDeg = new Float32Array(12);
    this.cylCcv = new Float32Array(12);
    this.cylBalance = new Float32Array(12);
    this.cylSpark = new Uint8Array(12);
    this.cylInVel = new Float32Array(12);  // Inertial intake runner gas velocity / flow state!
    this.cylExVel = new Float32Array(12);  // Inertial exhaust primary gas velocity / flow state!
    this.cylExAcc = new Float32Array(12);
    this.cylInAcc = new Float32Array(12);

    this.runnerLen = 2048;
    this.exRunners = [];
    this.inRunners = [];
    const balPattern = [1.08, 0.93, 1.05, 0.95, 1.07, 0.92, 1.04, 0.94, 1.06, 0.93, 1.03, 0.96];
    for (let i = 0; i < 12; i++) {
      this.cylN[i] = 0.75;
      this.cylT[i] = 420;
      this.cylVol[i] = 0.6;
      this.cylCcv[i] = 1.0;
      this.cylBalance[i] = balPattern[i];
      this.cylSpark[i] = 1;
      this.exRunners.push(new Float32Array(this.runnerLen));
      this.inRunners.push(new Float32Array(this.runnerLen));
    }
    this.runnerIdx = 0;

    // ===== 2. 4-SECTION KELLY-LOCHBAUM 1D ACOUSTIC EXHAUST DUCT NETWORK (Banks A & B) =====
    // Section 1: Front Midpipe | Section 2: Mid-Resonator Chamber | Section 3: Muffler Canister & Tailpipe
    this.ductLen = 2048;
    this.s1FwdA = new Float32Array(this.ductLen); this.s1BwdA = new Float32Array(this.ductLen);
    this.s2FwdA = new Float32Array(this.ductLen); this.s2BwdA = new Float32Array(this.ductLen);
    this.s3FwdA = new Float32Array(this.ductLen); this.s3BwdA = new Float32Array(this.ductLen);
    this.s1FwdB = new Float32Array(this.ductLen); this.s1BwdB = new Float32Array(this.ductLen);
    this.s2FwdB = new Float32Array(this.ductLen); this.s2BwdB = new Float32Array(this.ductLen);
    this.s3FwdB = new Float32Array(this.ductLen); this.s3BwdB = new Float32Array(this.ductLen);
    this.ductIdx = 0;

    // Levine-Schwinger open-tailpipe frequency-dependent reflection states
    this.tailRefLpA = 0; this.tailRefLpB = 0;
    this.s2DampLpA = 0; this.s2DampLpB = 0;
    this.s3DampLpA = 0; this.s3DampLpB = 0;
    this.colBackA = 0; this.colBackB = 0;
    this.prevColA = 0; this.prevColB = 0;
    this.hPipeLp = 0;
    this.xPipeBuf = new Float32Array(256);
    this.xPipeIdx = 0;

    // Physical Newton-Force Muffler Canister Mass-Spring-Damper Shake Oscillator (per bank)
    this.mufShakePosA = 0; this.mufShakeVelA = 0; this.mufForceDcPrevA = 0; this.mufForceDcOutA = 0;
    this.mufShakePosB = 0; this.mufShakeVelB = 0; this.mufForceDcPrevB = 0; this.mufForceDcOutB = 0;
    this.mufShakeLpA = new BiquadFilter();
    this.mufShakeLpB = new BiquadFilter();

    // Internal Canister Cavity Resonators (supplementing Kelly-Lochbaum chamber modes)
    this.cavLowA = new BiquadFilter(); this.cavLowB = new BiquadFilter();
    this.cavMidA = new BiquadFilter(); this.cavMidB = new BiquadFilter();

    // DC blockers & Tailpipe radiation shaping
    this.dcPrevA = 0; this.dcOutA = 0;
    this.dcPrevB = 0; this.dcOutB = 0;
    this.blkDcPrev = 0; this.blkDcOut = 0;
    this.mufLpA = new BiquadFilter(); this.mufLpB = new BiquadFilter();
    this.mufBodyA = new BiquadFilter(); this.mufBodyB = new BiquadFilter();
    this.subBodyLp = new BiquadFilter();
    this.chassisRes = new BiquadFilter();

    // Intake Plenum Resonators
    this.intakeHelm = new BiquadFilter();
    this.intakeBody = new BiquadFilter();
    this.intakeRush = new BiquadFilter();
    this.filterUpdateCounter = 0;

    // Mechanical Engine Drive, Valvetrain Tappets, Piston Slap, Timing Chain & Header Metallic Ringing
    this.mechRes1 = new BiquadFilter(); // Block structural piston-slap / casting mode (~340 Hz)
    this.mechRes2 = new BiquadFilter(); // Cylinder head & cam cover mode (~1350 Hz)
    this.mechRes3 = new BiquadFilter(); // Tappet & valve-seat crisp click mode (~2950 Hz)
    this.mechRes4 = new BiquadFilter(); // Fuel injector & high cam-lobe tick (~4450 Hz)
    this.chainBp = new BiquadFilter();  // Timing chain / oil-pump / belt mechanical drive whir
    this.bearingBp = new BiquadFilter(); // Crankshaft main-bearing & reciprocating friction texture
    this.blockThumpLp = new BiquadFilter();
    this.metalRes1 = new BiquadFilter();
    this.metalRes2 = new BiquadFilter();
    this.metalRes3 = new BiquadFilter();

    // Realistic Aerodynamic Turbocharger & BOV Filters (Pressurized Whoosh + Breathy Blade Whistle)
    this.turboWhooshBp = new BiquadFilter();
    this.turboWhooshBp.setBandpass(this.sr, 2400, 0.90);
    this.turboWhistleBp = new BiquadFilter();
    this.bovBp = new BiquadFilter();
    this.gearBp = new BiquadFilter();
    this.gearBp.setBandpass(this.sr, 780, 2.2);
    this.popLp = new BiquadFilter();
    this.popLp.setLowpass(this.sr, 340, 0.95);

    // ===== 3. AUTOMOTIVE INTERIOR NVH FILTERS (Firewall + Soundproofing + Thermal Insulation + Cabin Modes) =====
    // Front Airborne Path (Engine/Intake -> Steel Firewall Mass-Law + Delany-Bazley Porous Felt/Wool)
    this.nvhFrontLp1 = new BiquadFilter();
    this.nvhFrontLp2 = new BiquadFilter();
    this.nvhIntakeLp = new BiquadFilter();
    // Rear Airborne Path (Exhaust -> Trunk Bulkhead + Rear Carpet + Rear Glass)
    this.nvhRearExLpA1 = new BiquadFilter();
    this.nvhRearExLpA2 = new BiquadFilter();
    this.nvhRearExLpB1 = new BiquadFilter();
    this.nvhRearExLpB2 = new BiquadFilter();
    // 3D Interior Cabin Eigenmodes (81 Hz longitudinal, 118 Hz lateral, 149 Hz vertical)
    this.cabinMode1 = new BiquadFilter();
    this.cabinMode2 = new BiquadFilter();
    this.cabinMode3 = new BiquadFilter();
    this.cabinMode1.setPeaking(this.sr, 81, 3.2, 4.2);
    this.cabinMode2.setPeaking(this.sr, 118, 3.8, 2.8);
    this.cabinMode3.setPeaking(this.sr, 149, 4.2, 1.8);
    // Structure-Borne Floorpan / Engine-Mount Filter (bypasses porous foam!)
    this.structFloorLp = new BiquadFilter();
    this.structPanelBp = new BiquadFilter();

    // 3D Binaural Multi-Source Spatializer Delay Lines (512 samples ~ 11.6 ms)
    this.spLen = 512;
    this.spExA = new Float32Array(this.spLen);
    this.spExB = new Float32Array(this.spLen);
    this.spIntake = new Float32Array(this.spLen);
    this.spBlock = new Float32Array(this.spLen);
    this.spIdx = 0;
    this.hsExAR = 0; this.hsExBL = 0; this.hsInR = 0; this.hsBlkL = 0;

    // Master warm analog presence low-pass
    this.masterAirLpL = new BiquadFilter();
    this.masterAirLpR = new BiquadFilter();

    this.gearPhase = 0;
    this.chainPhase = 0;
    this.oilPumpPhase = 0;
    this.turboShaftNorm = 0.08; // Physical inertial turbocharger shaft speed (0.08 idle -> 1.0 full boost)
    this.turboPhase = 0;
    this.scPhase = 0;
    this.bovEnv = 0;
    this.bovPhase = 0;
    this.popEnv = 0;
    this.popCooldown = 0;
    this.tappetDecay = 0;
    this.pistonSlapDecay = 0;
    this.injectorDecay = 0;
    this.noiseSeed = 2463534242;

    this.updateAcousticFilters();

    this.port.onmessage = (e) => {
      const msg = e.data;
      if (!msg) return;
      if (msg.type === 'state') {
        if (typeof msg.rpm === 'number') this.targetRpm = msg.rpm;
        if (typeof msg.throttle === 'number') this.throttle = msg.throttle;
      } else if (msg.type === 'config') {
        if (Array.isArray(msg.firingAngles)) this.firingAngles = msg.firingAngles;
        if (Array.isArray(msg.primaryLengthsMm)) this.primaryLengthsMm = msg.primaryLengthsMm;
        if (Array.isArray(msg.cylBanks)) this.cylBanks = msg.cylBanks;
        if (typeof msg.isRotary === 'boolean') this.isRotary = msg.isRotary;
        if (typeof msg.isVOrBoxer === 'boolean') this.isVOrBoxer = msg.isVOrBoxer;
        if (typeof msg.aspiration === 'string') this.aspiration = msg.aspiration;
        if (typeof msg.maxBoostBar === 'number') this.maxBoostBar = msg.maxBoostBar;
        if (typeof msg.turboRefRpm === 'number') this.turboRefRpm = msg.turboRefRpm;
        if (typeof msg.turboGamma === 'number') this.turboGamma = msg.turboGamma;
        if (typeof msg.redlineRpm === 'number') this.redlineRpm = msg.redlineRpm;
        if (typeof msg.idleRpm === 'number') this.idleRpm = msg.idleRpm;
        if (typeof msg.vvtSwitchRpm === 'number') this.vvtSwitchRpm = msg.vvtSwitchRpm;
        if (typeof msg.displacementL === 'number') this.displacementL = msg.displacementL;
        if (typeof msg.compressionRatio === 'number') this.compressionRatio = msg.compressionRatio;
        if (typeof msg.intakeRunnerMm === 'number') {
          this.intakeRunnerMm = msg.intakeRunnerMm;
          this.helmholtzHz = Math.max(125, Math.min(460, 76000 / Math.max(150, this.intakeRunnerMm)));
        }
      } else if (msg.type === 'sound') {
        const s = msg.settings;
        if (!s) return;
        const needFilterRefresh =
          this.mufflerType !== s.mufflerType ||
          this.mufflerMassKg !== s.mufflerMassKg ||
          this.engineMassKg !== s.engineMassKg ||
          this.chassisMassKg !== s.chassisMassKg ||
          this.internalResonance !== s.internalResonance ||
          this.cabinInsulation !== s.cabinInsulation ||
          this.firewallThickness !== s.firewallThickness ||
          this.roomType !== s.roomType;
        this.exhaustLevel = s.exhaustLevel;
        this.crossoverType = s.crossoverType;
        this.interferenceStrength = s.interferenceStrength;
        this.exhaustRasp = s.exhaustRasp;
        this.exhaustLengthM = s.exhaustLengthM;
        this.mufflerType = s.mufflerType;
        this.mufflerShakeLevel = typeof s.mufflerShakeLevel === 'number' ? s.mufflerShakeLevel : 1.18;
        this.internalResonance = typeof s.internalResonance === 'number' ? s.internalResonance : 1.12;
        this.mufflerMassKg = typeof s.mufflerMassKg === 'number' ? s.mufflerMassKg : 12;
        this.engineMassKg = typeof s.engineMassKg === 'number' ? s.engineMassKg : 175;
        this.chassisMassKg = typeof s.chassisMassKg === 'number' ? s.chassisMassKg : 1350;
        this.cabinInsulation = typeof s.cabinInsulation === 'number' ? s.cabinInsulation : 0.58;
        this.firewallThickness = typeof s.firewallThickness === 'number' ? s.firewallThickness : 0.85;
        this.roomType = typeof s.roomType === 'string' ? s.roomType : 'DYNO_GARAGE';
        this.intakeType = s.intakeType;
        this.intakeLevel = s.intakeLevel;
        this.intakeResonance = s.intakeResonance;
        this.mechanicalLevel = s.mechanicalLevel;
        this.metallicRinging = s.metallicRinging;
        this.gearWhineLevel = s.gearWhineLevel;
        this.turboWhineLevel = s.turboWhineLevel;
        this.bovFlutterLevel = s.bovFlutterLevel;
        this.popBangLevel = s.popBangLevel;
        this.revLimiterCutHz = s.revLimiterCutHz;
        if (needFilterRefresh) this.updateAcousticFilters();
      }
    };
  }

  updateAcousticFilters() {
    const sr = this.sr;
    const mufMassNorm = Math.max(0, Math.min(1, (this.mufflerMassKg - 4) / 26));
    const engMassNorm = Math.max(0, Math.min(1, (this.engineMassKg - 80) / 240));
    const chasMassNorm = Math.max(0, Math.min(1, (this.chassisMassKg - 700) / 1500));
    const ins = Math.max(0, Math.min(1, this.cabinInsulation));
    const fw = Math.max(0.2, Math.min(1.5, this.firewallThickness));

    let radCutoff = 2650;
    let bodyHz = 108;
    let bodyDb = 5.4;
    if (this.mufflerType === 'STRAIGHT') {
      radCutoff = 3450; bodyHz = 114; bodyDb = 5.0;
    } else if (this.mufflerType === 'TITANIUM') {
      radCutoff = 2900; bodyHz = 106; bodyDb = 5.5;
    } else if (this.mufflerType === 'SPORT') {
      radCutoff = 1900; bodyHz = 94; bodyDb = 6.6;
    } else {
      radCutoff = 1140; bodyHz = 80; bodyDb = 7.4;
    }

    const mufToneScale = 1.14 - 0.34 * mufMassNorm;
    this.mufLpA.setLowpass(sr, radCutoff * mufToneScale, 0.74);
    this.mufLpB.setLowpass(sr, radCutoff * mufToneScale * 0.96, 0.74);
    this.mufBodyA.setPeaking(sr, bodyHz * (1.12 - 0.30 * mufMassNorm), 0.92, bodyDb + mufMassNorm * 2.2);
    this.mufBodyB.setPeaking(sr, bodyHz * (1.15 - 0.30 * mufMassNorm), 0.92, bodyDb + mufMassNorm * 2.2);

    // Muffler Canister Shake Sub-Bass Shaping Filter (30-120 Hz)
    const shakeLpHz = 122 - 44 * mufMassNorm;
    this.mufShakeLpA.setLowpass(sr, shakeLpHz, 1.15);
    this.mufShakeLpB.setLowpass(sr, shakeLpHz * 0.96, 1.15);

    // Internal Muffler Cavity Resonators
    const cav1Hz = 116 - 52 * mufMassNorm;
    const cav2Hz = 295 - 120 * mufMassNorm;
    const cavQ1 = 2.8 + 1.6 * Math.min(1.8, this.internalResonance);
    const cavQ2 = 2.2 + 1.3 * Math.min(1.8, this.internalResonance);
    this.cavLowA.setBandpass(sr, cav1Hz, cavQ1);
    this.cavLowB.setBandpass(sr, cav1Hz * 1.045, cavQ1);
    this.cavMidA.setBandpass(sr, cav2Hz, cavQ2);
    this.cavMidB.setBandpass(sr, cav2Hz * 0.955, cavQ2);

    // Engine Block Mass -> shifts piston-slap, valvetrain shell modes & crankcase low-end thump
    const engFreqScale = 1.16 - 0.36 * engMassNorm;
    this.mechRes1.setBandpass(sr, 340 * engFreqScale, 2.2);
    this.mechRes2.setBandpass(sr, 1380 * engFreqScale, 3.0);
    this.mechRes3.setBandpass(sr, 2850 * engFreqScale, 3.4);
    this.mechRes4.setBandpass(sr, 4350 * engFreqScale, 3.0);
    this.chainBp.setBandpass(sr, 950 * engFreqScale, 1.8);
    this.bearingBp.setBandpass(sr, 1650 * engFreqScale, 1.1);
    this.blockThumpLp.setLowpass(sr, 215 - 125 * engMassNorm, 0.95);

    // Header / Exhaust Shell Metallic Modes shifted by Engine & Muffler Mass
    const metalScale = (1.12 - 0.28 * engMassNorm) * (1.12 - 0.28 * mufMassNorm);
    if (this.mufflerType === 'TITANIUM' || this.mufflerType === 'STRAIGHT') {
      this.metalRes1.setBandpass(sr, 780 * metalScale, 5.2);
      this.metalRes2.setBandpass(sr, 1500 * metalScale, 6.4);
      this.metalRes3.setBandpass(sr, 2580 * metalScale, 6.8);
    } else {
      this.metalRes1.setBandpass(sr, 520 * metalScale, 4.6);
      this.metalRes2.setBandpass(sr, 1060 * metalScale, 5.4);
      this.metalRes3.setBandpass(sr, 1840 * metalScale, 5.8);
    }

    // Chassis / Body Mass -> Floorpan Resonance & Mass-Law Air Cutoff
    this.chassisRes.setBandpass(sr, 148 - 94 * chasMassNorm, 2.2 + chasMassNorm * 1.1);
    this.subBodyLp.setLowpass(sr, 155 - 55 * chasMassNorm, 0.92);

    // ===== INTERIOR NVH TRANSMISSION FILTERS (Delany-Bazley Insulation + Firewall Mass Law) =====
    // Front Firewall + Thermal/Acoustic Glass-Wool Mat (5200 Hz stripped -> 720 Hz full luxury insulation!)
    const frontCut = Math.max(480, (5400 * Math.pow(0.15, ins)) / (0.65 + 0.45 * fw));
    this.nvhFrontLp1.setLowpass(sr, frontCut, 0.72);
    this.nvhFrontLp2.setLowpass(sr, frontCut * 1.35, 0.68);
    // Intake enters slightly cleaner via cowl / dash vent than raw engine mechanicals
    this.nvhIntakeLp.setLowpass(sr, Math.max(680, frontCut * 1.48), 0.75);

    // Rear Exhaust through Trunk Bulkhead + Carpet + Rear Glass (much deeper & warmer in cockpit!)
    const rearCut = Math.max(290, (2950 * Math.pow(0.135, ins)) / (0.68 + 0.42 * fw));
    this.nvhRearExLpA1.setLowpass(sr, rearCut, 0.76);
    this.nvhRearExLpA2.setLowpass(sr, rearCut * 1.25, 0.70);
    this.nvhRearExLpB1.setLowpass(sr, rearCut * 0.97, 0.76);
    this.nvhRearExLpB2.setLowpass(sr, rearCut * 1.22, 0.70);

    // Structure-Borne Floorpan / Mount Vibration (bypasses porous foam! <170 Hz stays powerful!)
    this.structFloorLp.setLowpass(sr, 175 - 65 * chasMassNorm, 0.95);
    this.structPanelBp.setBandpass(sr, 260 - 110 * chasMassNorm, 2.0);

    // Cabin Eigenmode prominence (stronger enclosed boom with heavy insulated cabin)
    const cabinBoomDb = 2.6 + ins * 3.4 + chasMassNorm * 1.8;
    this.cabinMode1.setPeaking(sr, 81 - chasMassNorm * 12, 2.9, cabinBoomDb);
    this.cabinMode2.setPeaking(sr, 118 - chasMassNorm * 14, 3.4, cabinBoomDb * 0.65);
    this.cabinMode3.setPeaking(sr, 149 - chasMassNorm * 16, 3.8, cabinBoomDb * 0.42);

    const airCut = this.roomType === 'COCKPIT'
      ? Math.max(1800, 6200 - ins * 3400 - chasMassNorm * 900)
      : 7600 - 2500 * chasMassNorm;
    this.masterAirLpL.setLowpass(sr, airCut, 0.72);
    this.masterAirLpR.setLowpass(sr, airCut, 0.72);
  }

  nextNoise() {
    let x = this.noiseSeed | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.noiseSeed = x;
    return ((x >>> 0) / 4294967296) * 2 - 1;
  }

  readFrac(buf, mask, idx, delaySamples) {
    const d = Math.max(1, Math.min(mask - 2, delaySamples));
    const dInt = d | 0;
    const frac = d - dInt;
    const i0 = (idx - dInt + mask + 1) & mask;
    const i1 = (i0 - 1 + mask + 1) & mask;
    return buf[i0] * (1 - frac) + buf[i1] * frac;
  }

  process(inputs, outputs) {
    const out = outputs[0];
    if (!out || out.length === 0) return true;
    const chL = out[0];
    const chR = out[1] || chL;
    const sr = this.sr;
    const nCyl = Math.min(12, this.firingAngles.length);

    const dispScale = Math.min(1.42, Math.max(0.75, Math.pow(this.displacementL / 2.4, 0.25)));
    const isTurbo = this.aspiration === 'SINGLE_TURBO' || this.aspiration === 'TWIN_TURBO';
    const isSC = this.aspiration === 'SUPERCHARGER';
    const useDualBank = this.crossoverType !== 'SINGLE_MERGE';
    const isCockpit = this.roomType === 'COCKPIT';

    // Physical Mass & Interior NVH normalized factors
    const mufMassNorm = Math.max(0, Math.min(1, (this.mufflerMassKg - 4) / 26));
    const engMassNorm = Math.max(0, Math.min(1, (this.engineMassKg - 80) / 240));
    const chasMassNorm = Math.max(0, Math.min(1, (this.chassisMassKg - 700) / 1500));
    const ins = Math.max(0, Math.min(1, this.cabinInsulation));
    const fw = Math.max(0.2, Math.min(1.5, this.firewallThickness));

    // Kelly-Lochbaum 1D Acoustic Expansion-Chamber Muffler Network (Munjal textbook equations!):
    // Section 1 (Midpipe A1) -> [Expansion k1 < 0] -> Section 2 (Canister Chamber A2 = m1*A1)
    // -> [Contraction k2 = -k1 > 0] -> Section 3 (Tailpipe A3 ~ A1) -> Open-Pipe Radiation!
    let m1 = 2.4;
    let s2Damp = 0.76;
    let s3Damp = 0.66;
    let tailOpenRefl = -0.80;
    if (this.mufflerType === 'STRAIGHT') {
      m1 = 1.35 + mufMassNorm * 0.45;
      s2Damp = 0.90; s3Damp = 0.86; tailOpenRefl = -0.84;
    } else if (this.mufflerType === 'TITANIUM') {
      m1 = 2.0 + mufMassNorm * 0.9;
      s2Damp = 0.84; s3Damp = 0.76; tailOpenRefl = -0.82;
    } else if (this.mufflerType === 'SPORT') {
      m1 = 3.0 + mufMassNorm * 1.5;
      s2Damp = 0.68; s3Damp = 0.56; tailOpenRefl = -0.74;
    } else {
      // STREET
      m1 = 4.2 + mufMassNorm * 2.2;
      s2Damp = 0.50; s3Damp = 0.36; tailOpenRefl = -0.62;
    }
    const k1 = (1.0 - m1) / (1.0 + m1); // Expansion (A1 -> A2): negative reflection
    const k2 = -k1 * 0.92;              // Contraction (A2 -> A3 tailpipe): positive reflection + pressure recovery!
    const tailRadLpAlpha = this.mufflerType === 'STRAIGHT' ? 0.52 : this.mufflerType === 'TITANIUM' ? 0.44 : this.mufflerType === 'SPORT' ? 0.30 : 0.20;

    // Exact SI Thermodynamic constants (6x oversampled!)
    const SUBSTEPS = 6;
    const dtSub = 1.0 / (sr * SUBSTEPS);
    const vc = 1.0 / Math.max(5.5, this.compressionRatio - 1.0);
    const rodRatio = 0.28;
    const P_ATM = 101325.0;
    const T_ATM = 298.0;
    const invBaseVol = 1.0 / (vc + 1.0);
    // Runner inertial momentum time constants (proportional to physical runner lengths!)
    const tauInRunner = Math.max(0.00018, Math.min(0.00095, (this.intakeRunnerMm / 1000) / 343 * 0.45));
    const inMomentumAlpha = Math.min(0.72, dtSub / tauInRunner);
    const tauExRunner = 0.00022;
    const exMomentumAlpha = Math.min(0.78, dtSub / tauExRunner);
    const inFlowScale = dtSub / 0.00086;
    const exFlowScale = dtSub / 0.00072;
    const plenTau = Math.max(0.00032, 0.00080 - this.intakeResonance * 0.00022);
    const plenAlpha = Math.min(0.58, dtSub / plenTau);

    // Muffler Canister Mass-Spring-Damper Shake ODE parameters (66 Hz light -> 32 Hz heavy steel)
    const shakeFreqHz = 66 - 34 * mufMassNorm;
    const omegaS = (6.2831853 * shakeFreqHz) / sr;
    const omegaS2 = omegaS * omegaS;
    const zetaS = 0.23 - 0.10 * mufMassNorm;
    const damp2ZetaW = 2 * zetaS * omegaS;
    const panelTransmit = 1.32 - 0.52 * chasMassNorm;
    const mechHfDamp = 1.18 - 0.50 * engMassNorm;
    const blockWeightGain = 0.65 + 0.85 * engMassNorm;
    const chasBassGain = 0.48 + 0.68 * chasMassNorm;

    // 3D Binaural ITD & Front/Rear Distance Tap Delays
    const dExNear = Math.floor((isCockpit ? 0.00420 : 0.00210) * sr);
    const dExFar = Math.floor((isCockpit ? 0.00462 : 0.00258) * sr);
    const dExGndL = Math.floor(0.00385 * sr);
    const dExGndR = Math.floor(0.00425 * sr);
    const dInNear = Math.floor(0.00018 * sr);
    const dInFar = Math.floor(0.00050 * sr);
    const dInWall = Math.floor(0.00150 * sr);
    const dBlkNear = Math.floor(0.00022 * sr);
    const dBlkFar = Math.floor(0.00048 * sr);

    const ductMask = this.ductLen - 1;
    const runnerMask = this.runnerLen - 1;
    const spMask = this.spLen - 1;

    for (let i = 0; i < chL.length; i++) {
      this.rpm += (this.targetRpm - this.rpm) * 0.0045;
      const rpm = Math.max(400, this.rpm);
      const rpmNorm = Math.min(1.15, rpm / Math.max(2000, this.redlineRpm));

      const rawDiff = this.throttle - this.smoothThrottle;
      this.smoothThrottle += rawDiff * 0.011;
      const thr = this.smoothThrottle;

      const vvtTarget = this.vvtSwitchRpm > 0 && rpm >= this.vvtSwitchRpm ? 1.0 : 0.0;
      this.vvtBlend += (vvtTarget - this.vvtBlend) * 0.0016;

      // Smooth every-8-samples dynamic filter updates for turbocharger aerodynamics & mechanical engine drive (zero zipper stepping!)
      const fCnt = this.filterUpdateCounter++;
      if ((fCnt & 7) === 0) {
        const engFreqScale = 1.16 - 0.36 * engMassNorm;
        this.chainBp.setBandpass(sr, Math.min(sr * 0.42, (580 + rpmNorm * 1650) * engFreqScale), 1.65);
        this.bearingBp.setBandpass(sr, Math.min(sr * 0.42, (1050 + rpmNorm * 2150) * engFreqScale), 1.05);

        if (isTurbo && this.maxBoostBar > 0.02) {
          const sh = this.turboShaftNorm;
          this.turboWhooshBp.setBandpass(sr, Math.min(sr * 0.42, 1380 + sh * 2350), 0.82);
          this.turboWhistleBp.setBandpass(sr, Math.min(sr * 0.44, 1850 + Math.pow(sh, 1.15) * 4600), 4.6);
          this.bovBp.setBandpass(sr, Math.min(sr * 0.42, 840 + this.bovEnv * 1450), 2.1);
        }
      }

      // Dynamic Helmholtz intake resonator updates every 64 samples (balanced natural Q)
      if ((fCnt & 63) === 0) {
        const helmFreq = this.helmholtzHz * (0.76 + 0.34 * rpmNorm + 0.12 * this.vvtBlend);
        const qBase =
          this.intakeType === 'CARBON_PLENUM' ? 2.5 :
          this.intakeType === 'ITB_INDIVIDUAL' ? 1.9 :
          this.intakeType === 'CONE_FILTER' ? 1.55 : 1.25;
        this.intakeHelm.setBandpass(sr, helmFreq, Math.max(0.8, qBase * this.intakeResonance));

        const bodyFreq =
          this.intakeType === 'ITB_INDIVIDUAL' ? 520 + rpmNorm * 620 :
          this.intakeType === 'CARBON_PLENUM' ? 350 + rpmNorm * 380 :
          this.intakeType === 'CONE_FILTER' ? 440 + rpmNorm * 460 :
          240 + rpmNorm * 220;
        this.intakeBody.setBandpass(sr, bodyFreq, this.intakeType === 'CARBON_PLENUM' ? 1.8 : 1.3);

        const rushFreq = this.intakeType === 'CONE_FILTER' ? 1420 + rpmNorm * 880 : 1020 + rpmNorm * 680;
        this.intakeRush.setBandpass(sr, rushFreq, 1.05);
      }

      // Whole-cylinder ignition-cut rev limiter clock
      if (rpm >= this.redlineRpm - 185 && thr > 0.25) {
        this.limiterPhase += this.revLimiterCutHz / sr;
        if (this.limiterPhase >= 1) this.limiterPhase -= 1;
        this.limiterCutActive = this.limiterPhase >= 0.48;
      } else {
        this.limiterCutActive = false;
        this.limiterPhase = 0;
      }

      // Boost tracking & BOV surge trigger
      let targetBoost = 0;
      if (isTurbo && this.maxBoostBar > 0.02) {
        const rr = Math.min(1.22, rpm / Math.max(1500, this.turboRefRpm));
        targetBoost = Math.min(this.maxBoostBar, this.maxBoostBar * Math.pow(rr, this.turboGamma)) * thr;
        // Real inertial turbocharger compressor rotor shaft speed (spools via exhaust enthalpy, coasts down slowly!)
        const spoolRatio = Math.min(1.15, this.boost / Math.max(0.2, this.maxBoostBar));
        const exhEnthalpy = Math.min(1.05, (0.06 + 0.94 * thr) * Math.pow(rpmNorm, 1.25) * (0.62 + 0.38 * spoolRatio));
        const targetShaft = Math.max(0.06, Math.min(1.04, 0.06 + 0.96 * Math.pow(exhEnthalpy, 0.85)));
        const shaftRate = targetShaft > this.turboShaftNorm ? (1.0 / (sr * 0.32)) : (1.0 / (sr * 1.05));
        this.turboShaftNorm += (targetShaft - this.turboShaftNorm) * shaftRate;
      } else if (isSC && this.maxBoostBar > 0.02) {
        targetBoost = this.maxBoostBar * Math.min(1, rpm / Math.max(2000, this.redlineRpm * 0.8)) * (0.25 + 0.75 * thr);
      }
      const prevBoost = this.boost;
      this.boost += (targetBoost - this.boost) * (targetBoost > this.boost ? 0.00025 : 0.00095);
      if (isTurbo && this.prevThrottle - thr > 0.0018 && prevBoost > 0.22) {
        this.bovEnv = Math.min(1.25, this.bovEnv + prevBoost * 0.62);
      }
      const throttleJump = Math.max(0, thr - this.prevThrottle);
      this.prevThrottle += (thr - this.prevThrottle) * 0.005;

      // Temperature-dependent exhaust gas speeds of sound in each duct section
      const cPrimary = 520 + thr * 105 + rpmNorm * 55;
      const cSec1 = cPrimary * 0.94;
      const cSec2 = cPrimary * 0.84;
      const cSec3 = cPrimary * 0.74;
      const cIntake = 343;

      // ===== 1. 6x-OVERSAMPLED SI THERMODYNAMIC GAS-SYSTEM & INERTIAL RUNNER FLOW ODE =====
      const degPerSub = ((rpm / 60) * 360) / (sr * SUBSTEPS);
      const pUpstream = P_ATM * (1.0 + this.boost * 0.85);
      // Throttle effective opening (IACV idle bypass + butterfly)
      const thrOpen = 0.095 + 0.905 * Math.pow(thr, 1.15);
      // Combustion temperature rise (K) scaled by trapped fuel-air density & CR
      const burnTempRiseK = (1350 + 1480 * thr) * (0.88 + (this.compressionRatio - 8) * 0.036);
      const inDur = this.isRotary ? 205 : (232 + this.vvtBlend * 22);
      const exDur = this.isRotary ? 215 : (238 + this.vvtBlend * 22);
      const evcAngle = 135 + exDur;
      const ivcAngle = 345 + inDur;

      let tappetTrig = 0;
      let pistonSlapTrig = 0;
      let injectorTrig = 0;
      let blockThumpSum = 0;
      let plenSurgeAcc = 0;

      for (let sub = 0; sub < SUBSTEPS; sub++) {
        this.crankDeg += degPerSub;
        if (this.crankDeg >= 720) this.crankDeg -= 720;

        let totalCylIntakeSub = 0;

        for (let c = 0; c < nCyl; c++) {
          let localDeg = this.crankDeg - this.firingAngles[c];
          if (localDeg < 0) localDeg += 720;
          const prevDeg = this.cylPrevDeg[c];
          this.cylPrevDeg[c] = localDeg;

          // Latch spark-cut & organic cylinder balance cleanly before TDC (680 deg)
          if (prevDeg < 680 && localDeg >= 680) {
            const jitterAmt = 0.12 - rpmNorm * 0.085;
            const balMix = 1.0 + (this.cylBalance[c] - 1.0) * Math.max(0.18, 1.0 - rpmNorm * 0.78);
            this.cylCcv[c] = balMix * (1.0 + this.nextNoise() * Math.max(0.025, jitterAmt));
            this.cylSpark[c] = this.limiterCutActive ? 0 : 1;
            if (this.cylSpark[c] === 0) {
              const bank = useDualBank ? (this.cylBanks[c] & 1) : 0;
              if (bank === 0) this.unburnedFuelA = Math.min(2.2, this.unburnedFuelA + 0.55 * thr);
              else this.unburnedFuelB = Math.min(2.2, this.unburnedFuelB + 0.55 * thr);
            } else {
              const bank = useDualBank ? (this.cylBanks[c] & 1) : 0;
              if (bank === 0 && this.unburnedFuelA > 0.22) {
                this.limiterBoomA = Math.min(1.8, this.limiterBoomA + this.unburnedFuelA * 0.95);
                this.unburnedFuelA *= 0.25;
              } else if (bank === 1 && this.unburnedFuelB > 0.22) {
                this.limiterBoomB = Math.min(1.8, this.limiterBoomB + this.unburnedFuelB * 0.95);
                this.unburnedFuelB *= 0.25;
              }
            }
          }

          // Exact crank-angle mechanical impulse excitations (Piston Slap, Valve Seating, Fuel Injector Solenoid!)
          if (!this.isRotary) {
            // Piston skirt major-thrust side slap at TDC+14 deg & minor reversal at BDC 180 deg
            if (prevDeg < 14 && localDeg >= 14) {
              pistonSlapTrig += (0.58 + 0.62 * thr + 0.42 * rpmNorm) * this.cylCcv[c];
            } else if (prevDeg < 180 && localDeg >= 180) {
              pistonSlapTrig += (0.26 + 0.24 * rpmNorm) * this.cylCcv[c];
            }
            // Exhaust & Intake valve seating impact (EVC / IVC) & lash opening click (EVO / IVO)
            if (prevDeg < evcAngle && localDeg >= evcAngle) {
              tappetTrig += (0.85 + 0.55 * rpmNorm + 0.40 * this.vvtBlend) * this.cylCcv[c];
            } else if (prevDeg < ivcAngle && localDeg >= ivcAngle) {
              tappetTrig += (0.78 + 0.50 * rpmNorm + 0.35 * this.vvtBlend) * this.cylCcv[c];
            } else if ((prevDeg < 135 && localDeg >= 135) || (prevDeg < 345 && localDeg >= 345)) {
              tappetTrig += (0.36 + 0.24 * rpmNorm + 0.22 * this.vvtBlend);
            }
          } else {
            // Rotary apex-seal port-edge mechanical click
            if ((prevDeg < 135 && localDeg >= 135) || (prevDeg < 345 && localDeg >= 345)) {
              pistonSlapTrig += (0.35 + 0.45 * rpmNorm) * this.cylCcv[c];
            }
          }
          // EFI Fuel Injector solenoid micro-tick (active unless fuel-cut!)
          if (prevDeg < 310 && localDeg >= 310 && this.cylSpark[c] === 1) {
            injectorTrig += 0.92;
          }

          // Exact slider-crank volume V(theta)
          const rad = localDeg * 0.0174532925;
          const sinT = Math.sin(rad);
          const cosT = Math.cos(rad);
          const xPist = this.isRotary
            ? 0.5 * (1.0 - Math.cos(rad * 1.5))
            : 0.5 * (1.0 - cosT + (1.0 - Math.sqrt(1.0 - rodRatio * rodRatio * sinT * sinT)) / rodRatio);
          const vol = vc + xPist;
          const prevVol = this.cylVol[c];
          this.cylVol[c] = vol;

          // Adiabatic compression/expansion (gamma - 1 = 0.31)
          let dVTerm = (0.31 * (prevVol - vol)) / Math.max(0.06, vol);
          if (dVTerm > 0.065) dVTerm = 0.065;
          else if (dVTerm < -0.065) dVTerm = -0.065;
          let T = this.cylT[c] * (1.0 + dVTerm);

          // Smooth Wiebe Combustion Heat Release (-15 BTDC -> +55 ATDC)
          let burnDeg = localDeg + 15;
          if (burnDeg >= 720) burnDeg -= 720;
          if (burnDeg < 70 && this.cylSpark[c] === 1) {
            const u = burnDeg / 70;
            const wiebe = 18.5 * u * u * Math.exp(-4.8 * u * u * u);
            const dT = wiebe * (degPerSub / 70) * burnTempRiseK * this.cylCcv[c];
            T += dT;
            blockThumpSum += (dT / 1500) * this.cylN[c];
          }

          // Physical cylinder wall heat transfer (tau ~ 85ms)
          T += (360.0 - T) * (dtSub / 0.085);
          if (T < 245.0) T = 245.0;
          else if (T > 3150.0) T = 3150.0;

          // Ideal Gas Law Pressure P_cyl (Pascals)
          const nMol = this.cylN[c];
          const pCyl = P_ATM * (nMol * (T / T_ATM)) / (vol * invBaseVol);

          // --- INTAKE VALVE: Compressible Choked Flow + Runner Gas Column Inertia ---
          let inDeg = localDeg - 345;
          if (inDeg < 0) inDeg += 720;
          let qIn = 0;
          if (inDeg < inDur) {
            const s = Math.sin((inDeg / inDur) * 3.14159265);
            const inLift = s * s * (1.0 + this.vvtBlend * 0.16);
            const dpIn = (this.plenP - pCyl) / P_ATM; // Normalized bar delta
            // Compressible sonic choking limit (Mach <= 1)
            const absDpIn = Math.min(2.2, Math.abs(dpIn));
            const targetInVel = inLift * (dpIn >= 0 ? Math.sqrt(absDpIn) : -Math.sqrt(absDpIn));
            // Inertial gas column momentum ODE (creates real Helmholtz overshoot & intake growl!)
            this.cylInVel[c] += (targetInVel - this.cylInVel[c]) * inMomentumAlpha;
            qIn = this.cylInVel[c];
          } else {
            // Closed valve water-hammer damping
            this.cylInVel[c] *= 0.80;
          }

          // --- EXHAUST VALVE: Compressible Choked Blowdown + Primary Runner Momentum ---
          let exDeg = localDeg - 135;
          if (exDeg < 0) exDeg += 720;
          let qEx = 0;
          if (exDeg < exDur) {
            const s = Math.sin((exDeg / exDur) * 3.14159265);
            const exLift = s * s * (1.0 + this.vvtBlend * 0.16);
            const bank = useDualBank ? (this.cylBanks[c] & 1) : 0;
            const backP = bank === 0 ? this.colBackA : this.colBackB;
            const pRun = P_ATM * (1.02 + Math.max(-0.42, Math.min(0.68, backP * 0.36 * this.interferenceStrength)));
            const dpEx = (pCyl - pRun) / P_ATM;
            // Sonic choking at supercritical blowdown pressure ratio (r_crit = 0.528 -> smooth real blowdown!)
            const pHigh = Math.max(pCyl, pRun);
            const pLow = Math.min(pCyl, pRun);
            const chokedDrop = (pHigh - Math.max(pLow, pHigh * 0.528)) / P_ATM;
            const targetExVel = exLift * (dpEx >= 0 ? Math.sqrt(Math.max(0, chokedDrop)) : -Math.sqrt(Math.max(0, chokedDrop)));
            this.cylExVel[c] += (targetExVel - this.cylExVel[c]) * exMomentumAlpha;
            qEx = this.cylExVel[c];
          } else {
            this.cylExVel[c] *= 0.78;
          }

          // Integrate cylinder molar mass & thermal mixing
          const dmIn = qIn * inFlowScale;
          const dmEx = qEx * exFlowScale;
          let dm = dmIn - dmEx;
          const maxDm = nMol * 0.18;
          if (dm > maxDm) dm = maxDm;
          else if (dm < -maxDm) dm = -maxDm;

          const nextN = Math.max(0.08, Math.min(4.8, nMol + dm));
          if (dmIn > 0) {
            const addM = Math.min(dmIn, maxDm);
            T = (T * nMol + T_ATM * addM) / (nMol + addM);
          }

          this.cylN[c] = nextN;
          this.cylT[c] = T;
          this.cylExAcc[c] += qEx * 1.32;
          this.cylInAcc[c] += qIn * 1.05;
          totalCylIntakeSub += dmIn;
        }

        // --- REAL INTAKE PLENUM MASS-CONSERVATION RESERVOIR (Vacuum + Tip-in Atmospheric Rush!) ---
        const dpThr = (pUpstream - this.plenP) / P_ATM;
        const absDpThr = Math.min(1.8, Math.abs(dpThr));
        const targetThrFlow = thrOpen * (dpThr >= 0 ? Math.sqrt(absDpThr) : -Math.sqrt(absDpThr)) * Math.sqrt(nCyl) * 1.15;
        this.plenFlow += (targetThrFlow - this.plenFlow) * plenAlpha;
        // Update plenum pressure from throttle inflow minus cylinder consumption
        const plenMassRate = this.plenFlow * (dtSub / 0.0018) - totalCylIntakeSub * (0.48 / Math.max(1, nCyl * 0.25));
        this.plenP = Math.max(24000.0, Math.min(pUpstream * 1.25, this.plenP + plenMassRate * P_ATM * 0.55));
        // Physical throttle-body pressure rush derivative (emergent tip-in gulp!)
        plenSurgeAcc += (this.plenP - this.prevPlenP) / P_ATM;
        this.prevPlenP = this.plenP;
      }

      // ===== 2. PRIMARY HEADERS (FRACTIONAL DELAY) -> COLLECTOR & CROSSOVER SCATTERING =====
      let exSumA = 0, exSumB = 0, exSqA = 0, exSqB = 0;
      let inPlenumSum = 0;
      const invSub = 1.0 / SUBSTEPS;

      for (let c = 0; c < nCyl; c++) {
        const avgEx = this.cylExAcc[c] * invSub;
        const avgIn = this.cylInAcc[c] * invSub;
        this.cylExAcc[c] = 0;
        this.cylInAcc[c] = 0;

        this.exRunners[c][this.runnerIdx] = avgEx;
        const pLenM = (this.primaryLengthsMm[c] || 540) / 1000;
        const pDelayF = Math.max(2, Math.min(this.runnerLen - 4, (pLenM / cPrimary) * sr));
        const exDel = this.readFrac(this.exRunners[c], runnerMask, this.runnerIdx, pDelayF);

        const bank = useDualBank ? (this.cylBanks[c] & 1) : 0;
        if (bank === 0) {
          exSumA += exDel;
          exSqA += exDel * exDel;
        } else {
          exSumB += exDel;
          exSqB += exDel * exDel;
        }

        this.inRunners[c][this.runnerIdx] = avgIn;
        const inDelayF = Math.max(2, Math.min(this.runnerLen - 4, ((this.intakeRunnerMm / 1000) / cIntake) * sr));
        inPlenumSum += this.readFrac(this.inRunners[c], runnerMask, this.runnerIdx, inDelayF);
      }
      this.runnerIdx = (this.runnerIdx + 1) & runnerMask;

      const normCyl = Math.sqrt(Math.max(1, useDualBank ? nCyl / 2 : nCyl));
      const loadExScale = 0.62 + 0.56 * thr + 0.34 * rpmNorm;
      let colA = (exSumA / normCyl) * dispScale * loadExScale;
      let colB = useDualBank ? (exSumB / normCyl) * dispScale * loadExScale : colA;

      // Inter-cylinder collector pulse overlap interference
      const ovA = (exSumA * exSumA - exSqA) * 0.09 * this.interferenceStrength;
      const ovB = useDualBank ? (exSumB * exSumB - exSqB) * 0.09 * this.interferenceStrength : ovA;
      colA += Math.tanh(ovA) * (0.20 + 0.28 * thr);
      colB += Math.tanh(ovB) * (0.20 + 0.28 * thr);

      // Crossover scattering (X-Pipe / H-Pipe / Dual / Merge)
      if (this.crossoverType === 'X_PIPE' && useDualBank) {
        const xPrev = this.xPipeBuf[this.xPipeIdx];
        const merged = (colA + colB) * 0.5;
        this.xPipeBuf[this.xPipeIdx] = merged;
        this.xPipeIdx = (this.xPipeIdx + 1) & 255;
        const xb = 0.44 * this.interferenceStrength;
        colA = colA * (1 - xb) + (merged + (merged - xPrev) * 0.16) * xb;
        colB = colB * (1 - xb) + (merged - (merged - xPrev) * 0.16) * xb;
      } else if (this.crossoverType === 'H_PIPE' && useDualBank) {
        this.hPipeLp += 0.040 * (((colA + colB) * 0.5) - this.hPipeLp);
        const hb = 0.54 * this.interferenceStrength;
        colA = colA * (1 - hb * 0.45) + this.hPipeLp * hb;
        colB = colB * (1 - hb * 0.45) + this.hPipeLp * hb;
      }

      // Rev-limiter unburned fuel exhaust backfire boom
      if (this.limiterBoomA > 0.002 || this.limiterBoomB > 0.002) {
        const boomNoise = this.popLp.process(this.nextNoise() * 1.45 + 0.35);
        colA += boomNoise * this.limiterBoomA * 2.3;
        colB += boomNoise * this.limiterBoomB * 2.3;
        this.limiterBoomA *= 0.9925;
        this.limiterBoomB *= 0.9925;
      }

      // Overrun exhaust pops & burble
      if (this.popCooldown > 0) this.popCooldown--;
      if (this.popBangLevel > 0.02 && thr < 0.08 && rpm > this.idleRpm + 1150) {
        if (this.popCooldown === 0 && Math.abs(this.nextNoise()) > 0.9966 - this.popBangLevel * 0.002) {
          this.popEnv = (0.55 + Math.abs(this.nextNoise()) * 0.95) * this.popBangLevel;
          this.popCooldown = Math.floor(sr * (0.045 + Math.abs(this.nextNoise()) * 0.14));
        }
      }
      if (this.popEnv > 0.001) {
        const popSig = this.popLp.process(this.nextNoise() * 1.35) * this.popEnv;
        colA += popSig * 2.1;
        colB += popSig * 1.85;
        this.popEnv *= 0.994;
      }

      // Controlled high-velocity exhaust pressure wave steepening (Rasp)
      const raspAmt = this.exhaustRasp * (0.15 + 0.85 * thr) * (0.25 + 0.52 * rpmNorm);
      if (raspAmt > 0.01) {
        colA += Math.tanh(colA * colA * 0.62) * (colA >= 0 ? 1 : -1) * raspAmt * 0.22;
        colB += Math.tanh(colB * colB * 0.62) * (colB >= 0 ? 1 : -1) * raspAmt * 0.22;
      }

      // ===== 3. 4-SECTION KELLY-LOCHBAUM 1D ACOUSTIC DUCT NETWORK (Banks A & B) =====
      // Physical lengths for Midpipe (S1), Expansion Chamber (S2), Rear Canister & Tailpipe (S3)
      const d1A = Math.max(8, Math.min(this.ductLen - 6, ((this.exhaustLengthM * 0.46) / cSec1) * sr));
      const d2A = Math.max(6, Math.min(this.ductLen - 6, ((0.28 + 0.24 * mufMassNorm) / cSec2) * sr));
      const d3A = Math.max(8, Math.min(this.ductLen - 6, ((this.exhaustLengthM * 0.34) / cSec3) * sr));
      const d1B = Math.max(8, d1A - (useDualBank ? 10 : 5));
      const d2B = Math.max(6, d2A + 4);
      const d3B = Math.max(8, d3A - (useDualBank ? 7 : 3));

      // --- BANK A Kelly-Lochbaum Wave Scattering ---
      const s1OutFwdA = this.readFrac(this.s1FwdA, ductMask, this.ductIdx, d1A);
      const s1OutBwdA = this.readFrac(this.s1BwdA, ductMask, this.ductIdx, d1A);
      const s2OutFwdA = this.readFrac(this.s2FwdA, ductMask, this.ductIdx, d2A);
      const s2OutBwdA = this.readFrac(this.s2BwdA, ductMask, this.ductIdx, d2A);
      const s3OutFwdA = this.readFrac(this.s3FwdA, ductMask, this.ductIdx, d3A);
      const s3OutBwdA = this.readFrac(this.s3BwdA, ductMask, this.ductIdx, d3A);

      // Junction 1 (Midpipe <-> Expansion Chamber)
      const j1FwdTo2A = (1.0 + k1) * s1OutFwdA - k1 * s2OutBwdA;
      const j1BwdTo1A = k1 * s1OutFwdA + (1.0 - k1) * s2OutBwdA;

      // Viscous attenuation inside expansion chamber
      this.s2DampLpA += s2Damp * (s2OutFwdA - this.s2DampLpA);
      const s2FwdDampedA = this.s2DampLpA * 0.94;

      // Junction 2 (Expansion Chamber <-> Muffler Canister)
      const j2FwdTo3A = (1.0 + k2) * s2FwdDampedA - k2 * s3OutBwdA;
      const j2BwdTo2A = k2 * s2FwdDampedA + (1.0 - k2) * s3OutBwdA;

      // Internal muffler fiberglass packing damping
      this.s3DampLpA += s3Damp * (s3OutFwdA - this.s3DampLpA);
      const s3FwdDampedA = this.s3DampLpA * 0.93;

      // Levine-Schwinger Frequency-Dependent Open-Tailpipe Reflection & Radiation
      this.tailRefLpA += tailRadLpAlpha * (s3FwdDampedA - this.tailRefLpA);
      const tailRefA = this.tailRefLpA * tailOpenRefl;
      const radA = s3FwdDampedA + tailRefA * 0.42;

      // Write next wave states into duct delay lines
      this.s1FwdA[this.ductIdx] = colA + s1OutBwdA * 0.32;
      this.s1BwdA[this.ductIdx] = j1BwdTo1A * 0.94;
      this.s2FwdA[this.ductIdx] = j1FwdTo2A * 0.96;
      this.s2BwdA[this.ductIdx] = j2BwdTo2A * 0.95;
      this.s3FwdA[this.ductIdx] = j2FwdTo3A * 0.96;
      this.s3BwdA[this.ductIdx] = tailRefA;
      this.colBackA += 0.14 * (colA + s1OutBwdA - this.colBackA);

      // Exact Axial Newton Force pushing Muffler Canister A: F = P_canister_in - P_canister_out!
      const mufAxialForceA = (s2FwdDampedA + s3OutBwdA) - (s3FwdDampedA + tailRefA);

      // --- BANK B Kelly-Lochbaum Wave Scattering ---
      const s1OutFwdB = this.readFrac(this.s1FwdB, ductMask, this.ductIdx, d1B);
      const s1OutBwdB = this.readFrac(this.s1BwdB, ductMask, this.ductIdx, d1B);
      const s2OutFwdB = this.readFrac(this.s2FwdB, ductMask, this.ductIdx, d2B);
      const s2OutBwdB = this.readFrac(this.s2BwdB, ductMask, this.ductIdx, d2B);
      const s3OutFwdB = this.readFrac(this.s3FwdB, ductMask, this.ductIdx, d3B);
      const s3OutBwdB = this.readFrac(this.s3BwdB, ductMask, this.ductIdx, d3B);

      const j1FwdTo2B = (1.0 + k1) * s1OutFwdB - k1 * s2OutBwdB;
      const j1BwdTo1B = k1 * s1OutFwdB + (1.0 - k1) * s2OutBwdB;
      this.s2DampLpB += s2Damp * (s2OutFwdB - this.s2DampLpB);
      const s2FwdDampedB = this.s2DampLpB * 0.94;
      const j2FwdTo3B = (1.0 + k2) * s2FwdDampedB - k2 * s3OutBwdB;
      const j2BwdTo2B = k2 * s2FwdDampedB + (1.0 - k2) * s3OutBwdB;
      this.s3DampLpB += s3Damp * (s3OutFwdB - this.s3DampLpB);
      const s3FwdDampedB = this.s3DampLpB * 0.93;
      this.tailRefLpB += tailRadLpAlpha * (s3FwdDampedB - this.tailRefLpB);
      const tailRefB = this.tailRefLpB * tailOpenRefl;
      const radB = s3FwdDampedB + tailRefB * 0.42;

      this.s1FwdB[this.ductIdx] = colB + s1OutBwdB * 0.32;
      this.s1BwdB[this.ductIdx] = j1BwdTo1B * 0.94;
      this.s2FwdB[this.ductIdx] = j1FwdTo2B * 0.96;
      this.s2BwdB[this.ductIdx] = j2BwdTo2B * 0.95;
      this.s3FwdB[this.ductIdx] = j2FwdTo3B * 0.96;
      this.s3BwdB[this.ductIdx] = tailRefB;
      this.colBackB += 0.14 * (colB + s1OutBwdB - this.colBackB);
      this.ductIdx = (this.ductIdx + 1) & ductMask;

      const mufAxialForceB = (s2FwdDampedB + s3OutBwdB) - (s3FwdDampedB + tailRefB);

      // DC block (9 Hz preserves 25-80 Hz muffler shake!)
      const dcA = radA - this.dcPrevA + 0.9988 * this.dcOutA;
      this.dcPrevA = radA; this.dcOutA = dcA;
      const dcB = radB - this.dcPrevB + 0.9988 * this.dcOutB;
      this.dcPrevB = radB; this.dcOutB = dcB;

      // ===== 4. EXACT AXIAL-FORCE MUFFLER CANISTER SHAKE ODE ("DOKO-DOKO"!) =====
      const fAcA = mufAxialForceA - this.mufForceDcPrevA + 0.998 * this.mufForceDcOutA;
      this.mufForceDcPrevA = mufAxialForceA; this.mufForceDcOutA = fAcA;
      const fAcB = mufAxialForceB - this.mufForceDcPrevB + 0.998 * this.mufForceDcOutB;
      this.mufForceDcPrevB = mufAxialForceB; this.mufForceDcOutB = fAcB;

      const shakeRpmWeight = 0.44 + 0.92 * Math.exp(-rpmNorm * 1.75);
      this.mufShakeVelA += omegaS2 * ((fAcA * 0.65 + dcA * 0.55) - this.mufShakePosA) - damp2ZetaW * this.mufShakeVelA;
      this.mufShakePosA = Math.max(-3.5, Math.min(3.5, this.mufShakePosA + this.mufShakeVelA));
      const mufShakeA =
        this.mufShakeLpA.process(Math.tanh(this.mufShakePosA * 0.55) * 1.15) *
        this.mufflerShakeLevel *
        (0.74 + 0.72 * mufMassNorm) *
        shakeRpmWeight *
        0.92;

      this.mufShakeVelB += omegaS2 * ((fAcB * 0.65 + dcB * 0.55) - this.mufShakePosB) - damp2ZetaW * this.mufShakeVelB;
      this.mufShakePosB = Math.max(-3.5, Math.min(3.5, this.mufShakePosB + this.mufShakeVelB));
      const mufShakeB =
        this.mufShakeLpB.process(Math.tanh(this.mufShakePosB * 0.55) * 1.15) *
        this.mufflerShakeLevel *
        (0.74 + 0.72 * mufMassNorm) *
        shakeRpmWeight *
        0.92;

      // Internal Canister Cavity Depth (coupled with Kelly-Lochbaum internal chamber waves!)
      const intResGain = this.internalResonance * (0.60 + 0.48 * mufMassNorm);
      const cavOutA = (this.cavLowA.process(dcA + fAcA * 0.35) * 0.78 + this.cavMidA.process(dcA) * 0.44) * intResGain;
      const cavOutB = (this.cavLowB.process(dcB + fAcB * 0.35) * 0.78 + this.cavMidB.process(dcB) * 0.44) * intResGain;

      const vibModA = 1.0 + Math.tanh(this.mufShakePosA * 0.55) * 0.14 * Math.min(1.4, this.mufflerShakeLevel);
      const vibModB = 1.0 + Math.tanh(this.mufShakePosB * 0.55) * 0.14 * Math.min(1.4, this.mufflerShakeLevel);
      const coreExA = this.mufLpA.process(this.mufBodyA.process(dcA));
      const coreExB = this.mufLpB.process(this.mufBodyB.process(dcB));
      let exOutA = ((coreExA + cavOutA) * vibModA + mufShakeA) * this.exhaustLevel * 1.32;
      let exOutB = ((coreExB + cavOutB) * vibModB + mufShakeB) * this.exhaustLevel * 1.32;

      // ===== 5. PHYSICAL INTAKE PLENUM INDUCTION (Progressive Butterfly + Real Tip-In Gulp!) =====
      // Realistic progressive throttle plate: almost closed at idle/light cruise, blooms naturally under WOT!
      const butterflyOpen = 0.015 + 0.985 * Math.pow(thr, 1.65);
      const inRaw = (inPlenumSum / Math.sqrt(Math.max(1, nCyl))) * butterflyOpen * (1.0 + this.vvtBlend * 0.25);
      // True atmospheric gulp into vacuum plenum weighted by actual throttle opening & pedal snap
      const tipInWeight = butterflyOpen * 0.55 + Math.min(1.0, throttleJump * 18.0) * 1.15;
      const plenumRushSig = Math.tanh(plenSurgeAcc * 1.8) * tipInWeight * (0.72 + 0.28 * this.nextNoise());
      const airTurb = this.nextNoise() * (0.008 + 0.16 * Math.pow(thr, 1.4)) * (0.20 + 0.80 * rpmNorm);

      const helmOut = this.intakeHelm.process(inRaw * 1.05 + plenumRushSig * 0.58);
      const bodyOut = this.intakeBody.process(inRaw * 0.88 + airTurb * 0.22 + plenumRushSig * 0.36);
      const rushOut = this.intakeRush.process(airTurb + Math.abs(plenumRushSig) * 0.28);

      let intakeMix = 0;
      if (this.intakeType === 'ITB_INDIVIDUAL') {
        intakeMix = helmOut * 0.92 + bodyOut * 1.02 + rushOut * 0.24 + inRaw * 0.16;
      } else if (this.intakeType === 'CARBON_PLENUM') {
        intakeMix = helmOut * 1.15 + bodyOut * 0.82 + rushOut * 0.14;
      } else if (this.intakeType === 'CONE_FILTER') {
        intakeMix = helmOut * 0.76 + bodyOut * 0.62 + rushOut * 0.40;
      } else {
        intakeMix = helmOut * 0.52 + bodyOut * 0.30 + rushOut * 0.10;
      }
      let intakeOut = Math.tanh(intakeMix * 1.15) * 0.78 * this.intakeLevel;

      // ===== 6. ENGINE MECHANICAL DRIVING SOUND, VALVETRAIN, PISTON SLAP, CHAIN & TURBO =====
      const mechCylNorm = 1.0 / Math.sqrt(Math.max(2, nCyl) * 0.25);
      // (a) Crank-angle excited short-decay mechanical impulses (Piston Slap, Valve Seating Tappets, EFI Injectors)
      this.pistonSlapDecay = Math.min(2.4, this.pistonSlapDecay * 0.984 + pistonSlapTrig * mechCylNorm);
      this.tappetDecay = Math.min(2.2, this.tappetDecay * 0.968 + tappetTrig * mechCylNorm);
      this.injectorDecay = Math.min(1.6, this.injectorDecay * 0.942 + injectorTrig * mechCylNorm);

      const nM1 = this.nextNoise();
      const nM2 = this.nextNoise();
      const pistonExc = this.pistonSlapDecay * (0.72 + 0.28 * nM1);
      const tappetExc = this.tappetDecay * (0.55 + 0.45 * nM2);
      const injectorExc = this.injectorDecay * (0.45 + 0.55 * nM1) * (0.95 / (1.0 + rpmNorm * 2.4));

      const mechBlockLow = this.mechRes1.process(pistonExc) * 0.34;
      const mechHeadMid = this.mechRes2.process(pistonExc * 0.55 + tappetExc * 0.95) * 0.30 * mechHfDamp;
      const mechTappetHi = this.mechRes3.process(tappetExc) * 0.34 * mechHfDamp;
      const mechInjectorHi = this.mechRes4.process(injectorExc) * 0.36 * mechHfDamp;

      // (b) Continuous Engine Rotational Drive Assembly (Timing Chain / Sprockets / Oil Pump / Bearing Whir!)
      // Always stays alive with engine RPM — even during off-throttle engine-braking coastdown!
      const chainFreq = (rpm / 60) * (this.isRotary ? 11.0 : 18.0);
      this.chainPhase = (this.chainPhase + (chainFreq * (1.0 + nM2 * 0.018)) / sr) % 1;
      const cp = this.chainPhase;
      const chainTri = cp < 0.25 ? cp * 4.0 : (cp < 0.75 ? 2.0 - cp * 4.0 : cp * 4.0 - 4.0);
      const chainRaw = (chainTri * 0.54 + Math.sin(cp * 12.56637) * 0.20 + nM1 * 0.36) * (0.60 + 0.40 * thr);
      const chainDriveOut = this.chainBp.process(chainRaw) * (0.062 + 0.148 * Math.pow(rpmNorm, 0.75)) * mechHfDamp;

      const oilFreq = (rpm / 60) * 7.5;
      this.oilPumpPhase = (this.oilPumpPhase + oilFreq / sr) % 1;
      const oilDriveHum =
        (Math.sin(this.oilPumpPhase * 6.2831853) * 0.65 + Math.sin(this.oilPumpPhase * 12.56637) * 0.25) *
        (0.036 + 0.088 * Math.pow(rpmNorm, 0.66)) *
        (0.68 + 0.32 * thr);

      const strokeMod = 0.74 + 0.26 * Math.abs(Math.sin(this.crankDeg * nCyl * 0.008726646));
      const bearingWhirOut =
        this.bearingBp.process(nM2 * strokeMod) *
        (0.042 + 0.138 * Math.pow(rpmNorm, 0.80)) *
        (0.65 + 0.35 * thr) *
        mechHfDamp;

      // (c) Combustion Crankcase Structural Thump (Engine Block Mass coupled)
      const blkAc = blockThumpSum - this.blkDcPrev + 0.996 * this.blkDcOut;
      this.blkDcPrev = blockThumpSum; this.blkDcOut = blkAc;
      const blockThump = this.blockThumpLp.process(blkAc * 0.64) * blockWeightGain;

      // Split into Airborne Mechanical Drive vs Structure-Borne Block Vibration for physically accurate Cockpit NVH!
      const mechAirborne = (mechHeadMid + mechTappetHi + mechInjectorHi + chainDriveOut + bearingWhirOut) * panelTransmit * this.mechanicalLevel;
      const mechStructLow = (blockThump + mechBlockLow + oilDriveHum) * this.mechanicalLevel;
      const mechOut = mechAirborne + mechStructLow;

      const dCol = ((colA - this.prevColA) + (colB - this.prevColB)) * 0.5;
      this.prevColA = colA; this.prevColB = colB;
      const metalDrive = Math.tanh(dCol * 1.6) * (0.28 + 0.72 * rpmNorm);
      const metalSig =
        this.metalRes1.process(metalDrive) * 0.55 +
        this.metalRes2.process(metalDrive) * 0.36 +
        this.metalRes3.process(metalDrive) * 0.20;
      const metalMassGain = (1.18 - 0.38 * mufMassNorm) * (1.12 - 0.24 * chasMassNorm);
      const metallicOut = Math.tanh(metalSig * 1.25) * 0.28 * metalMassGain * this.metallicRinging;

      let gearOut = 0;
      if (this.gearWhineLevel > 0.01) {
        const gFreq = 240 + rpmNorm * 1180;
        this.gearPhase = (this.gearPhase + gFreq / sr) % 1;
        const gLoad = 0.22 + 0.78 * Math.abs(thr - 0.15);
        const rawGear = Math.sin(this.gearPhase * 6.2831853) * 0.75 + Math.sin(this.gearPhase * 12.56637) * 0.25;
        gearOut = this.gearBp.process(rawGear) * rpmNorm * gLoad * 0.14 * panelTransmit * this.gearWhineLevel;
      }

      // Realistic Inertial Aerodynamic Turbocharger (80% Pressurized Air Whoosh + 20% Breathy Blade Whistle + Pure Air BOV!)
      let forcedOut = 0;
      if (isTurbo && this.maxBoostBar > 0.02) {
        const spool = Math.min(1.15, this.boost / Math.max(0.2, this.maxBoostBar));
        const sh = this.turboShaftNorm;
        const nT1 = this.nextNoise();
        const nT2 = this.nextNoise();
        // (1) Dominant pressurized charge-pipe & compressor air whoosh
        const whooshDrive = nT1 * (0.20 + 0.80 * thr) * (0.28 + 0.72 * spool) * Math.pow(sh, 1.30);
        const turboWhoosh = this.turboWhooshBp.process(whooshDrive) * 0.24;
        // (2) Subtle breathy compressor blade-passing whistle with turbulent micro-FM (zero UFO/theremin sine!)
        const tFreq = (1850 + Math.pow(sh, 1.15) * 4600) * (1.0 + nT2 * 0.012);
        this.turboPhase = (this.turboPhase + tFreq / sr) % 1;
        const bladeRaw = nT2 * 0.80 + Math.sin(this.turboPhase * 6.2831853) * 0.20;
        const whistleEnv = Math.pow(sh, 1.75) * (0.22 + 0.78 * Math.min(1.0, spool + 0.20));
        const turboWhistle = this.turboWhistleBp.process(bladeRaw) * whistleEnv * 0.10;
        forcedOut += (turboWhoosh + turboWhistle) * this.turboWhineLevel;
        // (3) Pure aerodynamic compressor-surge BOV air-chop flutter (slowing down as pressure bleeds)
        if (this.bovEnv > 0.002) {
          const flutterHz = 5.8 + this.bovEnv * 8.2;
          this.bovPhase += flutterHz / sr;
          const chopWave = Math.pow(0.5 + 0.5 * Math.sin(this.bovPhase * 6.2831853), 1.85);
          const bovAir = nT1 * (0.18 + 0.82 * chopWave);
          forcedOut += this.bovBp.process(bovAir) * this.bovEnv * 0.34 * this.bovFlutterLevel;
          this.bovEnv *= 0.99945;
        }
      } else if (isSC && this.maxBoostBar > 0.02) {
        const scFreq = 360 + rpmNorm * 1950;
        this.scPhase = (this.scPhase + scFreq / sr) % 1;
        forcedOut +=
          (Math.sin(this.scPhase * 6.2831853) * 0.72 + Math.sin(this.scPhase * 12.56637) * 0.28) *
          (0.26 + 0.74 * thr) * 0.15 * this.turboWhineLevel;
      }

      // ===== 7. AUTOMOTIVE INTERIOR NVH MODEL (Airborne Insulation vs Structure-Borne Floorpan!) =====
      let blockSource = mechOut + metallicOut + gearOut + forcedOut;
      let structureBorneCabin = 0;

      if (isCockpit) {
        // (a) Airborne Front Firewall + Thermal/Acoustic Insulation (strongly absorbs harsh high ticks & turbo hiss!)
        const frontRaw = mechAirborne + metallicOut + gearOut + forcedOut;
        const fwAtten = 1.0 / (0.85 + 0.55 * fw + 0.45 * ins);
        const frontAirborne = this.nvhFrontLp2.process(this.nvhFrontLp1.process(frontRaw)) * fwAtten;
        // Intake resonance enters cabin subtly via front dash cowl
        intakeOut = this.nvhIntakeLp.process(intakeOut) * (1.02 - ins * 0.34);

        // (b) Airborne Rear Exhaust through Trunk Bulkhead, Rear Seats & Carpet (warm, deep rear sound!)
        const rearBulkAtten = 0.92 - ins * 0.26;
        exOutA = this.nvhRearExLpA2.process(this.nvhRearExLpA1.process(exOutA)) * rearBulkAtten;
        exOutB = this.nvhRearExLpB2.process(this.nvhRearExLpB1.process(exOutB)) * rearBulkAtten;

        // (c) Structure-Borne Path (Engine Mounts + Muffler Hangers + Floorpan — BYPASSES Porous Foam!)
        // Low-frequency engine drive rumble, crankcase thump & muffler shake transmit into the cockpit floor!
        const mountAndHanger = (mufShakeA + mufShakeB) * 0.45 * this.exhaustLevel + mechStructLow * 0.88 + gearOut * (0.55 - ins * 0.40);
        const floorBass = this.structFloorLp.process(mountAndHanger) * (0.82 + 0.45 * chasMassNorm);
        // Butyl floor deadening damps tinny 200-350 Hz sheet-metal panel buzz when insulation is high!
        const panelBuzz = this.structPanelBp.process(mountAndHanger) * (0.48 * (1.0 - ins * 0.78));
        structureBorneCabin = floorBass + panelBuzz;

        blockSource = frontAirborne + mechStructLow * (0.72 - ins * 0.16);
      }

      // ===== 8. 5-SOURCE 3D BINAURAL SOUNDSTAGE (ITD + HEAD-SHADOW ILD + GROUND/CABIN BOUNCE) =====
      this.spExA[this.spIdx] = exOutA;
      this.spExB[this.spIdx] = exOutB;
      this.spIntake[this.spIdx] = intakeOut;
      this.spBlock[this.spIdx] = blockSource;

      const exA_L = this.spExA[(this.spIdx - dExNear + this.spLen) & spMask];
      const exA_R_raw = this.spExA[(this.spIdx - dExFar + this.spLen) & spMask];
      this.hsExAR += 0.24 * (exA_R_raw - this.hsExAR);
      const gndGain = isCockpit ? 0.10 : 0.28;
      const exA_gndL = this.spExA[(this.spIdx - dExGndL + this.spLen) & spMask] * gndGain;
      const exA_gndR = this.spExA[(this.spIdx - dExGndR + this.spLen) & spMask] * (gndGain * 0.82);

      const exB_R = this.spExB[(this.spIdx - dExNear + this.spLen) & spMask];
      const exB_L_raw = this.spExB[(this.spIdx - dExFar + this.spLen) & spMask];
      this.hsExBL += 0.24 * (exB_L_raw - this.hsExBL);
      const exB_gndR = this.spExB[(this.spIdx - dExGndL + this.spLen) & spMask] * gndGain;
      const exB_gndL = this.spExB[(this.spIdx - dExGndR + this.spLen) & spMask] * (gndGain * 0.82);

      const in_L = this.spIntake[(this.spIdx - dInNear + this.spLen) & spMask] * 0.96;
      const in_R_raw = this.spIntake[(this.spIdx - dInFar + this.spLen) & spMask];
      this.hsInR += 0.34 * (in_R_raw - this.hsInR);
      const in_wall = this.spIntake[(this.spIdx - dInWall + this.spLen) & spMask] * (isCockpit ? 0.28 : 0.18);

      const blk_R = this.spBlock[(this.spIdx - dBlkNear + this.spLen) & spMask] * 0.94;
      const blk_L_raw = this.spBlock[(this.spIdx - dBlkFar + this.spLen) & spMask];
      this.hsBlkL += 0.38 * (blk_L_raw - this.hsBlkL);
      this.spIdx = (this.spIdx + 1) & spMask;

      // Coherent Sub-Chassis Body & Floorpan Resonance
      const chassisDrive =
        (exOutA + exOutB) * 0.42 +
        (mufShakeA + mufShakeB) * 0.28 * this.exhaustLevel +
        intakeOut * 0.20 +
        blockThump * 0.45 * this.mechanicalLevel;
      let subChassis =
        this.subBodyLp.process(chassisDrive) * chasBassGain +
        this.chassisRes.process(chassisDrive) * (0.28 + 0.26 * this.internalResonance) * (0.75 + 0.35 * chasMassNorm) +
        structureBorneCabin;

      // Apply 3D Interior Cabin Eigenmodes (81 / 118 / 149 Hz) inside cockpit!
      if (isCockpit) {
        subChassis = this.cabinMode3.process(this.cabinMode2.process(this.cabinMode1.process(subChassis)));
      }

      const stereoWidth = this.crossoverType === 'DUAL_SEPARATE' ? 0.58 : 0.72;
      const mixL =
        exA_L * 0.88 + this.hsExBL * stereoWidth + exA_gndL + exB_gndL +
        in_L + in_wall + this.hsBlkL * 0.78 + subChassis;
      const mixR =
        exB_R * 0.88 + this.hsExAR * stereoWidth + exB_gndR + exA_gndR +
        this.hsInR * 0.74 + in_wall + blk_R + subChassis;

      chL[i] = Math.tanh(this.masterAirLpL.process(mixL) * 1.28) * 0.86;
      chR[i] = Math.tanh(this.masterAirLpR.process(mixR) * 1.28) * 0.86;
    }

    return true;
  }
}

registerProcessor('ac-engine-sim-processor-v4', AcEngineSimProcessorV4);
`;

function computeCylinderBanks(config: EngineSimConfig, firingCount: number): number[] {
  const isVOrBoxer = config.bankAngleDeg > 10;
  if (config.layout === 'V8_CROSS') {
    return [0, 1, 0, 0, 1, 0, 1, 1].slice(0, firingCount);
  }
  if (isVOrBoxer) {
    return Array.from({ length: firingCount }, (_, i) => i % 2);
  }
  if (firingCount === 4) return [0, 1, 1, 0];
  if (firingCount === 6) return [0, 0, 0, 1, 1, 1];
  return Array.from({ length: firingCount }, (_, i) => i % 2);
}

export class EngineSoundController {
  private ctx: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private dryGain: GainNode | null = null;
  private wetGain: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private convolver: ConvolverNode | null = null;
  public analyser: AnalyserNode | null = null;
  private running = false;
  private currentRoom: AcousticRoomType = 'DYNO_GARAGE';
  private currentMuffler: ExhaustMufflerType = 'TITANIUM';
  private currentInsulation = 0.58;

  async start(
    config: EngineSimConfig,
    simResult: EngineSimResult,
    settings: EngineSoundSettings
  ): Promise<void> {
    if (this.running && this.ctx) {
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      this.updateConfig(config, simResult);
      this.updateSettings(settings);
      return;
    }

    const ctx = new AudioContext({ latencyHint: 'interactive' });
    const blob = new Blob([ENGINE_WORKLET_CODE], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    try {
      await ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }

    const worklet = new AudioWorkletNode(ctx, 'ac-engine-sim-processor-v4', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });

    const dryGain = ctx.createGain();
    const wetGain = ctx.createGain();
    const masterGain = ctx.createGain();
    const convolver = ctx.createConvolver();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.72;

    convolver.buffer = buildImpulseResponseBuffer(
      ctx,
      settings.roomType,
      settings.mufflerType,
      settings.cabinInsulation ?? 0.58
    );
    this.currentRoom = settings.roomType;
    this.currentMuffler = settings.mufflerType;
    this.currentInsulation = settings.cabinInsulation ?? 0.58;

    worklet.connect(dryGain);
    worklet.connect(convolver);
    convolver.connect(wetGain);
    dryGain.connect(masterGain);
    wetGain.connect(masterGain);
    masterGain.connect(analyser);
    analyser.connect(ctx.destination);

    this.ctx = ctx;
    this.workletNode = worklet;
    this.dryGain = dryGain;
    this.wetGain = wetGain;
    this.masterGain = masterGain;
    this.convolver = convolver;
    this.analyser = analyser;
    this.running = true;

    this.updateConfig(config, simResult);
    this.updateSettings(settings);
  }

  stop() {
    try {
      this.workletNode?.disconnect();
      this.dryGain?.disconnect();
      this.wetGain?.disconnect();
      this.masterGain?.disconnect();
      this.convolver?.disconnect();
      this.analyser?.disconnect();
    } catch {
      // ignore disconnect errors during teardown
    }
    if (this.ctx) {
      this.ctx.close().catch(() => {});
    }
    this.ctx = null;
    this.workletNode = null;
    this.dryGain = null;
    this.wetGain = null;
    this.masterGain = null;
    this.convolver = null;
    this.analyser = null;
    this.running = false;
  }

  isRunning() {
    return this.running;
  }

  updateState(rpm: number, throttle: number) {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'state', rpm, throttle });
  }

  updateConfig(config: EngineSimConfig, simResult: EngineSimResult) {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({
      type: 'config',
      firingAngles: simResult.firingAnglesDeg,
      primaryLengthsMm: simResult.primaryLengthsMm,
      cylBanks: computeCylinderBanks(config, simResult.firingAnglesDeg.length),
      isRotary: config.layout.startsWith('ROTARY_'),
      isVOrBoxer: config.bankAngleDeg > 10,
      aspiration: config.aspiration,
      maxBoostBar: config.maxBoostBar,
      turboRefRpm: config.turboRefRpm,
      turboGamma: config.turboGamma,
      redlineRpm: config.redlineRpm,
      idleRpm: config.idleRpm,
      vvtSwitchRpm: config.vvtSwitchRpm,
      displacementL: simResult.displacementCc / 1000,
      compressionRatio: config.compressionRatio,
      intakeRunnerMm: config.intakeRunnerLengthMm,
    });
  }

  updateSettings(settings: EngineSoundSettings) {
    if (!this.ctx || !this.workletNode || !this.dryGain || !this.wetGain || !this.masterGain || !this.convolver) {
      return;
    }
    const now = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(settings.masterVolume, now, 0.02);
    this.dryGain.gain.setTargetAtTime(1 - settings.convolutionMix * 0.55, now, 0.03);
    this.wetGain.gain.setTargetAtTime(settings.convolutionMix * 1.35, now, 0.03);

    const ins = settings.cabinInsulation ?? 0.58;
    const needIrRebuild =
      this.currentRoom !== settings.roomType ||
      this.currentMuffler !== settings.mufflerType ||
      (settings.roomType === 'COCKPIT' && Math.abs(this.currentInsulation - ins) >= 0.08);
    if (needIrRebuild) {
      this.convolver.buffer = buildImpulseResponseBuffer(this.ctx, settings.roomType, settings.mufflerType, ins);
      this.currentRoom = settings.roomType;
      this.currentMuffler = settings.mufflerType;
      this.currentInsulation = ins;
    }

    this.workletNode.port.postMessage({ type: 'sound', settings });
  }
}

// ===== Offline Biquad Filter (Matches v4 AudioWorklet DSP for WAV Export) =====
class OfflineBiquad {
  b0 = 1; b1 = 0; b2 = 0; a1 = 0; a2 = 0; z1 = 0; z2 = 0;
  setBandpass(sr: number, freq: number, q: number) {
    const f = Math.min(sr * 0.42, Math.max(25, freq));
    const w0 = (2 * Math.PI * f) / sr;
    const cosW = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * Math.max(0.35, q));
    const a0 = 1 + alpha;
    this.b0 = alpha / a0;
    this.b1 = 0;
    this.b2 = -alpha / a0;
    this.a1 = (-2 * cosW) / a0;
    this.a2 = (1 - alpha) / a0;
  }
  setLowpass(sr: number, freq: number, q: number) {
    const f = Math.min(sr * 0.42, Math.max(30, freq));
    const w0 = (2 * Math.PI * f) / sr;
    const cosW = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * Math.max(0.45, q));
    const a0 = 1 + alpha;
    const b1 = 1 - cosW;
    this.b0 = (b1 * 0.5) / a0;
    this.b1 = b1 / a0;
    this.b2 = (b1 * 0.5) / a0;
    this.a1 = (-2 * cosW) / a0;
    this.a2 = (1 - alpha) / a0;
  }
  setPeaking(sr: number, freq: number, q: number, gainDb: number) {
    const f = Math.min(sr * 0.42, Math.max(25, freq));
    const A = Math.pow(10, gainDb / 40);
    const w0 = (2 * Math.PI * f) / sr;
    const cosW = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * Math.max(0.35, q));
    const a0 = 1 + alpha / A;
    this.b0 = (1 + alpha * A) / a0;
    this.b1 = (-2 * cosW) / a0;
    this.b2 = (1 - alpha * A) / a0;
    this.a1 = (-2 * cosW) / a0;
    this.a2 = (1 - alpha / A) / a0;
  }
  process(x: number): number {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

export function encodeWavPcm16(samples: Float32Array, sampleRate = 44100): Uint8Array {
  const numSamples = samples.length;
  const byteLength = 44 + numSamples * 2;
  const buffer = new ArrayBuffer(byteLength);
  const view = new DataView(buffer);

  const writeStr = (off: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Uint8Array(buffer);
}

/**
 * Offline physical synthesis matching the v4 6x-oversampled SI Thermodynamic Gas-System,
 * 4-Section Kelly-Lochbaum 1D Duct Acoustics, Axial-Force Muffler Shake & Interior NVH model.
 */
export function renderOfflineEngineLoopWav(
  config: EngineSimConfig,
  simResult: EngineSimResult,
  settings: EngineSoundSettings,
  rpm: number,
  throttle: number,
  durationSec = 2.0,
  sampleRate = 44100
): Uint8Array {
  const warmupSamples = Math.floor(sampleRate * 0.25);
  const loopSamples = Math.floor(sampleRate * durationSec);
  const xfadeSamples = Math.floor(sampleRate * 0.12);
  const totalSamples = warmupSamples + loopSamples + xfadeSamples;

  const raw = new Float32Array(totalSamples);
  const firingAngles = simResult.firingAnglesDeg;
  const primaryLengthsMm = simResult.primaryLengthsMm;
  const cylBanks = computeCylinderBanks(config, firingAngles.length);
  const nCyl = Math.min(12, firingAngles.length);
  const isRotary = config.layout.startsWith('ROTARY_');
  const isTurbo = config.aspiration === 'SINGLE_TURBO' || config.aspiration === 'TWIN_TURBO';
  const isSC = config.aspiration === 'SUPERCHARGER';
  const useDualBank = settings.crossoverType !== 'SINGLE_MERGE';
  const isCockpit = settings.roomType === 'COCKPIT';

  const mufMassNorm = Math.max(0, Math.min(1, ((settings.mufflerMassKg ?? 12) - 4) / 26));
  const engMassNorm = Math.max(0, Math.min(1, ((settings.engineMassKg ?? 175) - 80) / 240));
  const chasMassNorm = Math.max(0, Math.min(1, ((settings.chassisMassKg ?? 1350) - 700) / 1500));
  const mufShakeLevel = settings.mufflerShakeLevel ?? 1.18;
  const intResLevel = settings.internalResonance ?? 1.12;
  const ins = Math.max(0, Math.min(1, settings.cabinInsulation ?? 0.58));
  const fw = Math.max(0.2, Math.min(1.5, settings.firewallThickness ?? 0.85));

  const P_ATM = 101325.0;
  const T_ATM = 298.0;
  let plenP = 55000.0 + throttle * 45000.0;
  let plenFlow = 0;
  let prevPlenP = plenP;

  const cylN = new Float32Array(nCyl).fill(0.75);
  const cylT = new Float32Array(nCyl).fill(420);
  const cylVol = new Float32Array(nCyl).fill(0.6);
  const cylPrevDeg = new Float32Array(nCyl);
  const cylCcv = new Float32Array(nCyl).fill(1.0);
  const balPattern = [1.08, 0.93, 1.05, 0.95, 1.07, 0.92, 1.04, 0.94, 1.06, 0.93, 1.03, 0.96];
  const cylBalance = Float32Array.from({ length: nCyl }, (_, i) => balPattern[i % balPattern.length]);
  const cylInVel = new Float32Array(nCyl);
  const cylExVel = new Float32Array(nCyl);
  const cylExAcc = new Float32Array(nCyl);
  const cylInAcc = new Float32Array(nCyl);

  const runnerLen = 2048;
  const runnerMask = runnerLen - 1;
  const exRunners = Array.from({ length: nCyl }, () => new Float32Array(runnerLen));
  const inRunners = Array.from({ length: nCyl }, () => new Float32Array(runnerLen));
  let runnerIdx = 0;

  const ductLen = 2048;
  const ductMask = ductLen - 1;
  const s1FwdA = new Float32Array(ductLen), s1BwdA = new Float32Array(ductLen);
  const s2FwdA = new Float32Array(ductLen), s2BwdA = new Float32Array(ductLen);
  const s3FwdA = new Float32Array(ductLen), s3BwdA = new Float32Array(ductLen);
  const s1FwdB = new Float32Array(ductLen), s1BwdB = new Float32Array(ductLen);
  const s2FwdB = new Float32Array(ductLen), s2BwdB = new Float32Array(ductLen);
  const s3FwdB = new Float32Array(ductLen), s3BwdB = new Float32Array(ductLen);
  let ductIdx = 0;
  let tailRefLpA = 0, tailRefLpB = 0;
  let s2DampLpA = 0, s2DampLpB = 0;
  let s3DampLpA = 0, s3DampLpB = 0;
  let colBackA = 0, colBackB = 0;
  let prevColA = 0, prevColB = 0;
  let hPipeLp = 0;
  const xPipeBuf = new Float32Array(256);
  let xPipeIdx = 0;
  let dcPrevA = 0, dcOutA = 0, dcPrevB = 0, dcOutB = 0;
  let blkDcPrev = 0, blkDcOut = 0;

  let mufShakePosA = 0, mufShakeVelA = 0, mufForceDcPrevA = 0, mufForceDcOutA = 0;
  let mufShakePosB = 0, mufShakeVelB = 0, mufForceDcPrevB = 0, mufForceDcOutB = 0;
  const shakeFreqHz = 66 - 34 * mufMassNorm;
  const omegaS = (2 * Math.PI * shakeFreqHz) / sampleRate;
  const omegaS2 = omegaS * omegaS;
  const zetaS = 0.23 - 0.10 * mufMassNorm;
  const damp2ZetaW = 2 * zetaS * omegaS;
  const panelTransmit = 1.32 - 0.52 * chasMassNorm;
  const mechHfDamp = 1.18 - 0.50 * engMassNorm;
  const blockWeightGain = 0.65 + 0.85 * engMassNorm;
  const chasBassGain = 0.48 + 0.68 * chasMassNorm;

  const readFrac = (buf: Float32Array, mask: number, idx: number, delaySamples: number) => {
    const d = Math.max(1, Math.min(mask - 2, delaySamples));
    const dInt = d | 0;
    const frac = d - dInt;
    const i0 = (idx - dInt + mask + 1) & mask;
    const i1 = (i0 - 1 + mask + 1) & mask;
    return buf[i0] * (1 - frac) + buf[i1] * frac;
  };

  let m1 = 2.4, s2Damp = 0.76, s3Damp = 0.66, tailOpenRefl = -0.80;
  if (settings.mufflerType === 'STRAIGHT') {
    m1 = 1.35 + mufMassNorm * 0.45; s2Damp = 0.90; s3Damp = 0.86; tailOpenRefl = -0.84;
  } else if (settings.mufflerType === 'TITANIUM') {
    m1 = 2.0 + mufMassNorm * 0.9; s2Damp = 0.84; s3Damp = 0.76; tailOpenRefl = -0.82;
  } else if (settings.mufflerType === 'SPORT') {
    m1 = 3.0 + mufMassNorm * 1.5; s2Damp = 0.68; s3Damp = 0.56; tailOpenRefl = -0.74;
  } else {
    m1 = 4.2 + mufMassNorm * 2.2; s2Damp = 0.50; s3Damp = 0.36; tailOpenRefl = -0.62;
  }
  const k1 = (1.0 - m1) / (1.0 + m1);
  const k2 = -k1 * 0.92;
  const tailRadLpAlpha = settings.mufflerType === 'STRAIGHT' ? 0.52 : settings.mufflerType === 'TITANIUM' ? 0.44 : settings.mufflerType === 'SPORT' ? 0.30 : 0.20;

  const rpmNorm = Math.min(1.15, rpm / Math.max(2000, config.redlineRpm));
  const vvtBlend = config.vvtSwitchRpm > 0 && rpm >= config.vvtSwitchRpm ? 1.0 : 0.0;
  const helmHz = Math.max(125, Math.min(460, 76000 / Math.max(150, config.intakeRunnerLengthMm)));

  const mufLpA = new OfflineBiquad(), mufLpB = new OfflineBiquad();
  const mufBodyA = new OfflineBiquad(), mufBodyB = new OfflineBiquad();
  const mufShakeLpA = new OfflineBiquad(), mufShakeLpB = new OfflineBiquad();
  const cavLowA = new OfflineBiquad(), cavLowB = new OfflineBiquad();
  const cavMidA = new OfflineBiquad(), cavMidB = new OfflineBiquad();
  const subBodyLp = new OfflineBiquad(), chassisRes = new OfflineBiquad();

  const radCutoff = settings.mufflerType === 'STRAIGHT' ? 3450 : settings.mufflerType === 'TITANIUM' ? 2900 : settings.mufflerType === 'SPORT' ? 1900 : 1140;
  const bodyHz = settings.mufflerType === 'STRAIGHT' ? 114 : settings.mufflerType === 'TITANIUM' ? 106 : settings.mufflerType === 'SPORT' ? 94 : 80;
  const bodyDb = settings.mufflerType === 'STRAIGHT' ? 5.0 : settings.mufflerType === 'TITANIUM' ? 5.5 : settings.mufflerType === 'SPORT' ? 6.6 : 7.4;
  const mufToneScale = 1.14 - 0.34 * mufMassNorm;
  mufLpA.setLowpass(sampleRate, radCutoff * mufToneScale, 0.74);
  mufLpB.setLowpass(sampleRate, radCutoff * mufToneScale * 0.96, 0.74);
  mufBodyA.setPeaking(sampleRate, bodyHz * (1.12 - 0.30 * mufMassNorm), 0.92, bodyDb + mufMassNorm * 2.2);
  mufBodyB.setPeaking(sampleRate, bodyHz * (1.15 - 0.30 * mufMassNorm), 0.92, bodyDb + mufMassNorm * 2.2);

  const shakeLpHz = 122 - 44 * mufMassNorm;
  mufShakeLpA.setLowpass(sampleRate, shakeLpHz, 1.15);
  mufShakeLpB.setLowpass(sampleRate, shakeLpHz * 0.96, 1.15);

  const cav1Hz = 116 - 52 * mufMassNorm;
  const cav2Hz = 295 - 120 * mufMassNorm;
  const cavQ1 = 2.8 + 1.6 * Math.min(1.8, intResLevel);
  const cavQ2 = 2.2 + 1.3 * Math.min(1.8, intResLevel);
  cavLowA.setBandpass(sampleRate, cav1Hz, cavQ1);
  cavLowB.setBandpass(sampleRate, cav1Hz * 1.045, cavQ1);
  cavMidA.setBandpass(sampleRate, cav2Hz, cavQ2);
  cavMidB.setBandpass(sampleRate, cav2Hz * 0.955, cavQ2);

  chassisRes.setBandpass(sampleRate, 148 - 94 * chasMassNorm, 2.2 + chasMassNorm * 1.1);
  subBodyLp.setLowpass(sampleRate, 155 - 55 * chasMassNorm, 0.92);

  const intakeHelm = new OfflineBiquad(), intakeBody = new OfflineBiquad(), intakeRush = new OfflineBiquad();
  const qBase = settings.intakeType === 'CARBON_PLENUM' ? 2.5 : settings.intakeType === 'ITB_INDIVIDUAL' ? 1.9 : settings.intakeType === 'CONE_FILTER' ? 1.55 : 1.25;
  intakeHelm.setBandpass(sampleRate, helmHz * (0.76 + 0.34 * rpmNorm + 0.12 * vvtBlend), Math.max(0.8, qBase * settings.intakeResonance));
  const inBodyFreq =
    settings.intakeType === 'ITB_INDIVIDUAL' ? 520 + rpmNorm * 620 :
    settings.intakeType === 'CARBON_PLENUM' ? 350 + rpmNorm * 380 :
    settings.intakeType === 'CONE_FILTER' ? 440 + rpmNorm * 460 : 240 + rpmNorm * 220;
  intakeBody.setBandpass(sampleRate, inBodyFreq, settings.intakeType === 'CARBON_PLENUM' ? 1.8 : 1.3);
  intakeRush.setBandpass(sampleRate, (settings.intakeType === 'CONE_FILTER' ? 1420 : 1020) + rpmNorm * 680, 1.05);

  const engFreqScale = 1.16 - 0.36 * engMassNorm;
  const mech1 = new OfflineBiquad(); mech1.setBandpass(sampleRate, 340 * engFreqScale, 2.2);
  const mech2 = new OfflineBiquad(); mech2.setBandpass(sampleRate, 1380 * engFreqScale, 3.0);
  const mech3 = new OfflineBiquad(); mech3.setBandpass(sampleRate, 2850 * engFreqScale, 3.4);
  const mech4 = new OfflineBiquad(); mech4.setBandpass(sampleRate, 4350 * engFreqScale, 3.0);
  const chainBp = new OfflineBiquad(); chainBp.setBandpass(sampleRate, Math.min(sampleRate * 0.42, (580 + rpmNorm * 1650) * engFreqScale), 1.65);
  const bearingBp = new OfflineBiquad(); bearingBp.setBandpass(sampleRate, Math.min(sampleRate * 0.42, (1050 + rpmNorm * 2150) * engFreqScale), 1.05);
  const blockThumpLp = new OfflineBiquad(); blockThumpLp.setLowpass(sampleRate, 215 - 125 * engMassNorm, 0.95);

  const metalScale = (1.12 - 0.28 * engMassNorm) * (1.12 - 0.28 * mufMassNorm);
  const met1 = new OfflineBiquad(), met2 = new OfflineBiquad(), met3 = new OfflineBiquad();
  if (settings.mufflerType === 'TITANIUM' || settings.mufflerType === 'STRAIGHT') {
    met1.setBandpass(sampleRate, 780 * metalScale, 5.2);
    met2.setBandpass(sampleRate, 1500 * metalScale, 6.4);
    met3.setBandpass(sampleRate, 2580 * metalScale, 6.8);
  } else {
    met1.setBandpass(sampleRate, 520 * metalScale, 4.6);
    met2.setBandpass(sampleRate, 1060 * metalScale, 5.4);
    met3.setBandpass(sampleRate, 1840 * metalScale, 5.8);
  }

  // Interior NVH filters for offline cockpit renders
  const frontCut = Math.max(480, (5400 * Math.pow(0.15, ins)) / (0.65 + 0.45 * fw));
  const rearCut = Math.max(290, (2950 * Math.pow(0.135, ins)) / (0.68 + 0.42 * fw));
  const nvhFrontLp1 = new OfflineBiquad(); nvhFrontLp1.setLowpass(sampleRate, frontCut, 0.72);
  const nvhFrontLp2 = new OfflineBiquad(); nvhFrontLp2.setLowpass(sampleRate, frontCut * 1.35, 0.68);
  const nvhIntakeLp = new OfflineBiquad(); nvhIntakeLp.setLowpass(sampleRate, Math.max(680, frontCut * 1.48), 0.75);
  const nvhRearExLpA1 = new OfflineBiquad(); nvhRearExLpA1.setLowpass(sampleRate, rearCut, 0.76);
  const nvhRearExLpA2 = new OfflineBiquad(); nvhRearExLpA2.setLowpass(sampleRate, rearCut * 1.25, 0.70);
  const nvhRearExLpB1 = new OfflineBiquad(); nvhRearExLpB1.setLowpass(sampleRate, rearCut * 0.97, 0.76);
  const nvhRearExLpB2 = new OfflineBiquad(); nvhRearExLpB2.setLowpass(sampleRate, rearCut * 1.22, 0.70);
  const structFloorLp = new OfflineBiquad(); structFloorLp.setLowpass(sampleRate, 175 - 65 * chasMassNorm, 0.95);
  const structPanelBp = new OfflineBiquad(); structPanelBp.setBandpass(sampleRate, 260 - 110 * chasMassNorm, 2.0);
  const cabinBoomDb = 2.6 + ins * 3.4 + chasMassNorm * 1.8;
  const cabinMode1 = new OfflineBiquad(); cabinMode1.setPeaking(sampleRate, 81 - chasMassNorm * 12, 2.9, cabinBoomDb);
  const cabinMode2 = new OfflineBiquad(); cabinMode2.setPeaking(sampleRate, 118 - chasMassNorm * 14, 3.4, cabinBoomDb * 0.65);
  const cabinMode3 = new OfflineBiquad(); cabinMode3.setPeaking(sampleRate, 149 - chasMassNorm * 16, 3.8, cabinBoomDb * 0.42);

  const boost =
    isTurbo && config.maxBoostBar > 0.02
      ? Math.min(config.maxBoostBar, config.maxBoostBar * Math.pow(rpm / Math.max(1500, config.turboRefRpm), config.turboGamma)) * throttle
      : isSC
        ? config.maxBoostBar * Math.min(1, rpm / Math.max(2000, config.redlineRpm * 0.8)) * (0.25 + 0.75 * throttle)
        : 0;
  const spool = config.maxBoostBar > 0.02 ? Math.min(1.15, boost / Math.max(0.2, config.maxBoostBar)) : 0;
  const exhEnthalpy = Math.min(1.05, (0.06 + 0.94 * throttle) * Math.pow(rpmNorm, 1.25) * (0.62 + 0.38 * spool));
  const turboShaftNorm = isTurbo && config.maxBoostBar > 0.02 ? Math.max(0.06, Math.min(1.04, 0.06 + 0.96 * Math.pow(exhEnthalpy, 0.85))) : 0;
  const turboWhooshBp = new OfflineBiquad(); turboWhooshBp.setBandpass(sampleRate, Math.min(sampleRate * 0.42, 1380 + turboShaftNorm * 2350), 0.82);
  const turboWhistleBp = new OfflineBiquad(); turboWhistleBp.setBandpass(sampleRate, Math.min(sampleRate * 0.44, 1850 + Math.pow(turboShaftNorm, 1.15) * 4600), 4.6);
  const gearBp = new OfflineBiquad(); gearBp.setBandpass(sampleRate, 780, 2.2);
  const masterAirLp = new OfflineBiquad();
  masterAirLp.setLowpass(sampleRate, isCockpit ? Math.max(1800, 6200 - ins * 3400 - chasMassNorm * 900) : 7600 - 2500 * chasMassNorm, 0.72);

  let seed = 987654321;
  const nextNoise = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return (seed / 4294967296) * 2 - 1;
  };

  const cPrimary = 520 + throttle * 105 + rpmNorm * 55;
  const cSec1 = cPrimary * 0.94, cSec2 = cPrimary * 0.84, cSec3 = cPrimary * 0.74, cIntake = 343;
  const d1A = Math.max(8, Math.min(ductLen - 6, ((settings.exhaustLengthM * 0.46) / cSec1) * sampleRate));
  const d2A = Math.max(6, Math.min(ductLen - 6, ((0.28 + 0.24 * mufMassNorm) / cSec2) * sampleRate));
  const d3A = Math.max(8, Math.min(ductLen - 6, ((settings.exhaustLengthM * 0.34) / cSec3) * sampleRate));
  const d1B = Math.max(8, d1A - (useDualBank ? 10 : 5));
  const d2B = Math.max(6, d2A + 4);
  const d3B = Math.max(8, d3A - (useDualBank ? 7 : 3));

  const dispScale = Math.min(1.42, Math.max(0.75, Math.pow(simResult.displacementCc / 2400, 0.25)));
  const vc = 1.0 / Math.max(5.5, config.compressionRatio - 1.0);
  const invBaseVol = 1.0 / (vc + 1.0);
  const rodRatio = 0.28;
  const SUBSTEPS = 6;
  const invSub = 1.0 / SUBSTEPS;
  const dtSub = 1.0 / (sampleRate * SUBSTEPS);
  const tauInRunner = Math.max(0.00018, Math.min(0.00095, (config.intakeRunnerLengthMm / 1000) / 343 * 0.45));
  const inMomentumAlpha = Math.min(0.72, dtSub / tauInRunner);
  const exMomentumAlpha = Math.min(0.78, dtSub / 0.00022);
  const inFlowScale = dtSub / 0.00086;
  const exFlowScale = dtSub / 0.00072;
  const plenAlpha = Math.min(0.58, dtSub / Math.max(0.00032, 0.00080 - settings.intakeResonance * 0.00022));

  const degPerSub = ((rpm / 60) * 360) / (sampleRate * SUBSTEPS);
  const pUpstream = P_ATM * (1.0 + boost * 0.85);
  const thrOpen = 0.095 + 0.905 * Math.pow(throttle, 1.15);
  const burnTempRiseK = (1350 + 1480 * throttle) * (0.88 + (config.compressionRatio - 8) * 0.036);
  const inDur = isRotary ? 205 : 232 + vvtBlend * 22;
  const exDur = isRotary ? 215 : 238 + vvtBlend * 22;
  const evcAngle = 135 + exDur;
  const ivcAngle = 345 + inDur;
  const normCyl = Math.sqrt(Math.max(1, useDualBank ? nCyl / 2 : nCyl));
  const mechCylNorm = 1.0 / Math.sqrt(Math.max(2, nCyl) * 0.25);
  const butterflyOpen = 0.015 + 0.985 * Math.pow(throttle, 1.65);
  const raspAmt = settings.exhaustRasp * (0.15 + 0.85 * throttle) * (0.25 + 0.52 * rpmNorm);

  let crankDeg = 0, gearPhase = 0, chainPhase = 0, oilPumpPhase = 0, turboPhase = 0, scPhase = 0;
  let tappetDecay = 0, pistonSlapDecay = 0, injectorDecay = 0;

  for (let i = 0; i < totalSamples; i++) {
    let tappetTrig = 0;
    let pistonSlapTrig = 0;
    let injectorTrig = 0;
    let blockThumpSum = 0;
    let plenSurgeAcc = 0;

    for (let sub = 0; sub < SUBSTEPS; sub++) {
      crankDeg += degPerSub;
      if (crankDeg >= 720) crankDeg -= 720;
      let totalCylIntakeSub = 0;

      for (let c = 0; c < nCyl; c++) {
        let localDeg = crankDeg - firingAngles[c];
        if (localDeg < 0) localDeg += 720;
        const prevDeg = cylPrevDeg[c];
        cylPrevDeg[c] = localDeg;
        if (prevDeg < 680 && localDeg >= 680) {
          const balMix = 1.0 + (cylBalance[c] - 1.0) * Math.max(0.18, 1.0 - rpmNorm * 0.78);
          cylCcv[c] = balMix * (1.0 + nextNoise() * Math.max(0.025, 0.12 - rpmNorm * 0.085));
        }

        if (!isRotary) {
          if (prevDeg < 14 && localDeg >= 14) {
            pistonSlapTrig += (0.58 + 0.62 * throttle + 0.42 * rpmNorm) * cylCcv[c];
          } else if (prevDeg < 180 && localDeg >= 180) {
            pistonSlapTrig += (0.26 + 0.24 * rpmNorm) * cylCcv[c];
          }
          if (prevDeg < evcAngle && localDeg >= evcAngle) {
            tappetTrig += (0.85 + 0.55 * rpmNorm + 0.40 * vvtBlend) * cylCcv[c];
          } else if (prevDeg < ivcAngle && localDeg >= ivcAngle) {
            tappetTrig += (0.78 + 0.50 * rpmNorm + 0.35 * vvtBlend) * cylCcv[c];
          } else if ((prevDeg < 135 && localDeg >= 135) || (prevDeg < 345 && localDeg >= 345)) {
            tappetTrig += 0.36 + 0.24 * rpmNorm + 0.22 * vvtBlend;
          }
        } else {
          if ((prevDeg < 135 && localDeg >= 135) || (prevDeg < 345 && localDeg >= 345)) {
            pistonSlapTrig += (0.35 + 0.45 * rpmNorm) * cylCcv[c];
          }
        }
        if (prevDeg < 310 && localDeg >= 310) {
          injectorTrig += 0.92;
        }

        const rad = localDeg * 0.0174532925;
        const sinT = Math.sin(rad), cosT = Math.cos(rad);
        const xPist = isRotary
          ? 0.5 * (1.0 - Math.cos(rad * 1.5))
          : 0.5 * (1.0 - cosT + (1.0 - Math.sqrt(1.0 - rodRatio * rodRatio * sinT * sinT)) / rodRatio);
        const vol = vc + xPist;
        const prevVol = cylVol[c];
        cylVol[c] = vol;

        let dVTerm = (0.31 * (prevVol - vol)) / Math.max(0.06, vol);
        if (dVTerm > 0.065) dVTerm = 0.065;
        else if (dVTerm < -0.065) dVTerm = -0.065;
        let T = cylT[c] * (1.0 + dVTerm);

        let burnDeg = localDeg + 15;
        if (burnDeg >= 720) burnDeg -= 720;
        if (burnDeg < 70) {
          const u = burnDeg / 70;
          const wiebe = 18.5 * u * u * Math.exp(-4.8 * u * u * u);
          const dT = wiebe * (degPerSub / 70) * burnTempRiseK * cylCcv[c];
          T += dT;
          blockThumpSum += (dT / 1500) * cylN[c];
        }

        T += (360.0 - T) * (dtSub / 0.085);
        if (T < 245.0) T = 245.0;
        else if (T > 3150.0) T = 3150.0;

        const nMol = cylN[c];
        const pCyl = (P_ATM * (nMol * (T / T_ATM))) / (vol * invBaseVol);

        let inDeg = localDeg - 345;
        if (inDeg < 0) inDeg += 720;
        let qIn = 0;
        if (inDeg < inDur) {
          const s = Math.sin((inDeg / inDur) * Math.PI);
          const inLift = s * s * (1.0 + vvtBlend * 0.16);
          const dpIn = (plenP - pCyl) / P_ATM;
          const absDpIn = Math.min(2.2, Math.abs(dpIn));
          const targetInVel = inLift * (dpIn >= 0 ? Math.sqrt(absDpIn) : -Math.sqrt(absDpIn));
          cylInVel[c] += (targetInVel - cylInVel[c]) * inMomentumAlpha;
          qIn = cylInVel[c];
        } else {
          cylInVel[c] *= 0.80;
        }

        let exDeg = localDeg - 135;
        if (exDeg < 0) exDeg += 720;
        let qEx = 0;
        if (exDeg < exDur) {
          const s = Math.sin((exDeg / exDur) * Math.PI);
          const exLift = s * s * (1.0 + vvtBlend * 0.16);
          const bank = useDualBank ? (cylBanks[c] & 1) : 0;
          const backP = bank === 0 ? colBackA : colBackB;
          const pRun = P_ATM * (1.02 + Math.max(-0.42, Math.min(0.68, backP * 0.36 * settings.interferenceStrength)));
          const dpEx = (pCyl - pRun) / P_ATM;
          const pHigh = Math.max(pCyl, pRun), pLow = Math.min(pCyl, pRun);
          const chokedDrop = (pHigh - Math.max(pLow, pHigh * 0.528)) / P_ATM;
          const targetExVel = exLift * (dpEx >= 0 ? Math.sqrt(Math.max(0, chokedDrop)) : -Math.sqrt(Math.max(0, chokedDrop)));
          cylExVel[c] += (targetExVel - cylExVel[c]) * exMomentumAlpha;
          qEx = cylExVel[c];
        } else {
          cylExVel[c] *= 0.78;
        }

        const dmIn = qIn * inFlowScale;
        const dmEx = qEx * exFlowScale;
        let dm = dmIn - dmEx;
        const maxDm = nMol * 0.18;
        if (dm > maxDm) dm = maxDm;
        else if (dm < -maxDm) dm = -maxDm;

        const nextN = Math.max(0.08, Math.min(4.8, nMol + dm));
        if (dmIn > 0) {
          const addM = Math.min(dmIn, maxDm);
          T = (T * nMol + T_ATM * addM) / (nMol + addM);
        }
        cylN[c] = nextN;
        cylT[c] = T;
        cylExAcc[c] += qEx * 1.32;
        cylInAcc[c] += qIn * 1.05;
        totalCylIntakeSub += dmIn;
      }

      const dpThr = (pUpstream - plenP) / P_ATM;
      const absDpThr = Math.min(1.8, Math.abs(dpThr));
      const targetThrFlow = thrOpen * (dpThr >= 0 ? Math.sqrt(absDpThr) : -Math.sqrt(absDpThr)) * Math.sqrt(nCyl) * 1.15;
      plenFlow += (targetThrFlow - plenFlow) * plenAlpha;
      const plenMassRate = plenFlow * (dtSub / 0.0018) - totalCylIntakeSub * (0.48 / Math.max(1, nCyl * 0.25));
      plenP = Math.max(24000.0, Math.min(pUpstream * 1.25, plenP + plenMassRate * P_ATM * 0.55));
      plenSurgeAcc += (plenP - prevPlenP) / P_ATM;
      prevPlenP = plenP;
    }

    let exSumA = 0, exSumB = 0, exSqA = 0, exSqB = 0, inPlenumSum = 0;
    for (let c = 0; c < nCyl; c++) {
      const avgEx = cylExAcc[c] * invSub;
      const avgIn = cylInAcc[c] * invSub;
      cylExAcc[c] = 0; cylInAcc[c] = 0;
      exRunners[c][runnerIdx] = avgEx;
      const pDelF = Math.max(2, Math.min(runnerLen - 4, ((primaryLengthsMm[c] || 540) / 1000 / cPrimary) * sampleRate));
      const exDel = readFrac(exRunners[c], runnerMask, runnerIdx, pDelF);
      const bank = useDualBank ? (cylBanks[c] & 1) : 0;
      if (bank === 0) { exSumA += exDel; exSqA += exDel * exDel; }
      else { exSumB += exDel; exSqB += exDel * exDel; }
      inRunners[c][runnerIdx] = avgIn;
      const inDelF = Math.max(2, Math.min(runnerLen - 4, ((config.intakeRunnerLengthMm / 1000) / cIntake) * sampleRate));
      inPlenumSum += readFrac(inRunners[c], runnerMask, runnerIdx, inDelF);
    }
    runnerIdx = (runnerIdx + 1) & runnerMask;

    const loadExScale = 0.62 + 0.56 * throttle + 0.34 * rpmNorm;
    let colA = (exSumA / normCyl) * dispScale * loadExScale;
    let colB = useDualBank ? (exSumB / normCyl) * dispScale * loadExScale : colA;
    colA += Math.tanh((exSumA * exSumA - exSqA) * 0.09 * settings.interferenceStrength) * (0.20 + 0.28 * throttle);
    colB += Math.tanh((useDualBank ? exSumB * exSumB - exSqB : exSumA * exSumA - exSqA) * 0.09 * settings.interferenceStrength) * (0.20 + 0.28 * throttle);

    if (settings.crossoverType === 'X_PIPE' && useDualBank) {
      const xPrev = xPipeBuf[xPipeIdx];
      const merged = (colA + colB) * 0.5;
      xPipeBuf[xPipeIdx] = merged;
      xPipeIdx = (xPipeIdx + 1) & 255;
      const xb = 0.44 * settings.interferenceStrength;
      colA = colA * (1 - xb) + (merged + (merged - xPrev) * 0.16) * xb;
      colB = colB * (1 - xb) + (merged - (merged - xPrev) * 0.16) * xb;
    } else if (settings.crossoverType === 'H_PIPE' && useDualBank) {
      hPipeLp += 0.040 * ((colA + colB) * 0.5 - hPipeLp);
      const hb = 0.54 * settings.interferenceStrength;
      colA = colA * (1 - hb * 0.45) + hPipeLp * hb;
      colB = colB * (1 - hb * 0.45) + hPipeLp * hb;
    }
    if (raspAmt > 0.01) {
      colA += Math.tanh(colA * colA * 0.62) * (colA >= 0 ? 1 : -1) * raspAmt * 0.22;
      colB += Math.tanh(colB * colB * 0.62) * (colB >= 0 ? 1 : -1) * raspAmt * 0.22;
    }

    // 4-Section Kelly-Lochbaum 1D Acoustic Duct Network (A & B)
    const s1OutFwdA = readFrac(s1FwdA, ductMask, ductIdx, d1A);
    const s1OutBwdA = readFrac(s1BwdA, ductMask, ductIdx, d1A);
    const s2OutFwdA = readFrac(s2FwdA, ductMask, ductIdx, d2A);
    const s2OutBwdA = readFrac(s2BwdA, ductMask, ductIdx, d2A);
    const s3OutFwdA = readFrac(s3FwdA, ductMask, ductIdx, d3A);
    const s3OutBwdA = readFrac(s3BwdA, ductMask, ductIdx, d3A);
    const j1FwdTo2A = (1.0 + k1) * s1OutFwdA - k1 * s2OutBwdA;
    const j1BwdTo1A = k1 * s1OutFwdA + (1.0 - k1) * s2OutBwdA;
    s2DampLpA += s2Damp * (s2OutFwdA - s2DampLpA);
    const s2FwdDampedA = s2DampLpA * 0.94;
    const j2FwdTo3A = (1.0 + k2) * s2FwdDampedA - k2 * s3OutBwdA;
    const j2BwdTo2A = k2 * s2FwdDampedA + (1.0 - k2) * s3OutBwdA;
    s3DampLpA += s3Damp * (s3OutFwdA - s3DampLpA);
    const s3FwdDampedA = s3DampLpA * 0.93;
    tailRefLpA += tailRadLpAlpha * (s3FwdDampedA - tailRefLpA);
    const tailRefA = tailRefLpA * tailOpenRefl;
    const radA = s3FwdDampedA + tailRefA * 0.42;
    s1FwdA[ductIdx] = colA + s1OutBwdA * 0.32; s1BwdA[ductIdx] = j1BwdTo1A * 0.94;
    s2FwdA[ductIdx] = j1FwdTo2A * 0.96; s2BwdA[ductIdx] = j2BwdTo2A * 0.95;
    s3FwdA[ductIdx] = j2FwdTo3A * 0.96; s3BwdA[ductIdx] = tailRefA;
    colBackA += 0.14 * (colA + s1OutBwdA - colBackA);
    const mufAxialForceA = (s2FwdDampedA + s3OutBwdA) - (s3FwdDampedA + tailRefA);

    const s1OutFwdB = readFrac(s1FwdB, ductMask, ductIdx, d1B);
    const s1OutBwdB = readFrac(s1BwdB, ductMask, ductIdx, d1B);
    const s2OutFwdB = readFrac(s2FwdB, ductMask, ductIdx, d2B);
    const s2OutBwdB = readFrac(s2BwdB, ductMask, ductIdx, d2B);
    const s3OutFwdB = readFrac(s3FwdB, ductMask, ductIdx, d3B);
    const s3OutBwdB = readFrac(s3BwdB, ductMask, ductIdx, d3B);
    const j1FwdTo2B = (1.0 + k1) * s1OutFwdB - k1 * s2OutBwdB;
    const j1BwdTo1B = k1 * s1OutFwdB + (1.0 - k1) * s2OutBwdB;
    s2DampLpB += s2Damp * (s2OutFwdB - s2DampLpB);
    const s2FwdDampedB = s2DampLpB * 0.94;
    const j2FwdTo3B = (1.0 + k2) * s2FwdDampedB - k2 * s3OutBwdB;
    const j2BwdTo2B = k2 * s2FwdDampedB + (1.0 - k2) * s3OutBwdB;
    s3DampLpB += s3Damp * (s3OutFwdB - s3DampLpB);
    const s3FwdDampedB = s3DampLpB * 0.93;
    tailRefLpB += tailRadLpAlpha * (s3FwdDampedB - tailRefLpB);
    const tailRefB = tailRefLpB * tailOpenRefl;
    const radB = s3FwdDampedB + tailRefB * 0.42;
    s1FwdB[ductIdx] = colB + s1OutBwdB * 0.32; s1BwdB[ductIdx] = j1BwdTo1B * 0.94;
    s2FwdB[ductIdx] = j1FwdTo2B * 0.96; s2BwdB[ductIdx] = j2BwdTo2B * 0.95;
    s3FwdB[ductIdx] = j2FwdTo3B * 0.96; s3BwdB[ductIdx] = tailRefB;
    colBackB += 0.14 * (colB + s1OutBwdB - colBackB);
    ductIdx = (ductIdx + 1) & ductMask;
    const mufAxialForceB = (s2FwdDampedB + s3OutBwdB) - (s3FwdDampedB + tailRefB);

    const dcA = radA - dcPrevA + 0.9988 * dcOutA; dcPrevA = radA; dcOutA = dcA;
    const dcB = radB - dcPrevB + 0.9988 * dcOutB; dcPrevB = radB; dcOutB = dcB;

    const fAcA = mufAxialForceA - mufForceDcPrevA + 0.998 * mufForceDcOutA; mufForceDcPrevA = mufAxialForceA; mufForceDcOutA = fAcA;
    const fAcB = mufAxialForceB - mufForceDcPrevB + 0.998 * mufForceDcOutB; mufForceDcPrevB = mufAxialForceB; mufForceDcOutB = fAcB;
    const shakeRpmWeight = 0.44 + 0.92 * Math.exp(-rpmNorm * 1.75);
    mufShakeVelA += omegaS2 * ((fAcA * 0.65 + dcA * 0.55) - mufShakePosA) - damp2ZetaW * mufShakeVelA;
    mufShakePosA = Math.max(-3.5, Math.min(3.5, mufShakePosA + mufShakeVelA));
    const mufShakeA = mufShakeLpA.process(Math.tanh(mufShakePosA * 0.55) * 1.15) * mufShakeLevel * (0.74 + 0.72 * mufMassNorm) * shakeRpmWeight * 0.92;
    mufShakeVelB += omegaS2 * ((fAcB * 0.65 + dcB * 0.55) - mufShakePosB) - damp2ZetaW * mufShakeVelB;
    mufShakePosB = Math.max(-3.5, Math.min(3.5, mufShakePosB + mufShakeVelB));
    const mufShakeB = mufShakeLpB.process(Math.tanh(mufShakePosB * 0.55) * 1.15) * mufShakeLevel * (0.74 + 0.72 * mufMassNorm) * shakeRpmWeight * 0.92;

    const intResGain = intResLevel * (0.60 + 0.48 * mufMassNorm);
    const cavOutA = (cavLowA.process(dcA + fAcA * 0.35) * 0.78 + cavMidA.process(dcA) * 0.44) * intResGain;
    const cavOutB = (cavLowB.process(dcB + fAcB * 0.35) * 0.78 + cavMidB.process(dcB) * 0.44) * intResGain;
    const vibModA = 1.0 + Math.tanh(mufShakePosA * 0.55) * 0.14 * Math.min(1.4, mufShakeLevel);
    const vibModB = 1.0 + Math.tanh(mufShakePosB * 0.55) * 0.14 * Math.min(1.4, mufShakeLevel);
    let exOutA = ((mufLpA.process(mufBodyA.process(dcA)) + cavOutA) * vibModA + mufShakeA) * settings.exhaustLevel * 1.32;
    let exOutB = ((mufLpB.process(mufBodyB.process(dcB)) + cavOutB) * vibModB + mufShakeB) * settings.exhaustLevel * 1.32;

    const inRaw = (inPlenumSum / Math.sqrt(Math.max(1, nCyl))) * butterflyOpen * (1.0 + vvtBlend * 0.25);
    const plenumRushSig = Math.tanh(plenSurgeAcc * 1.8) * (butterflyOpen * 0.55) * (0.72 + 0.28 * nextNoise());
    const airTurb = nextNoise() * (0.008 + 0.16 * Math.pow(throttle, 1.4)) * (0.20 + 0.80 * rpmNorm);
    const hOut = intakeHelm.process(inRaw * 1.05 + plenumRushSig * 0.58);
    const bOut = intakeBody.process(inRaw * 0.88 + airTurb * 0.22 + plenumRushSig * 0.36);
    const rOut = intakeRush.process(airTurb + Math.abs(plenumRushSig) * 0.28);
    const inMix =
      settings.intakeType === 'ITB_INDIVIDUAL' ? hOut * 0.92 + bOut * 1.02 + rOut * 0.24 + inRaw * 0.16 :
      settings.intakeType === 'CARBON_PLENUM' ? hOut * 1.15 + bOut * 0.82 + rOut * 0.14 :
      settings.intakeType === 'CONE_FILTER' ? hOut * 0.76 + bOut * 0.62 + rOut * 0.40 :
      hOut * 0.52 + bOut * 0.30 + rOut * 0.10;
    let intakeOut = Math.tanh(inMix * 1.15) * 0.78 * settings.intakeLevel;

    // Engine Mechanical Driving Sound, Piston Slap, Valvetrain Tappets, Injectors & Timing Chain/Bearing Whir
    pistonSlapDecay = Math.min(2.4, pistonSlapDecay * 0.984 + pistonSlapTrig * mechCylNorm);
    tappetDecay = Math.min(2.2, tappetDecay * 0.968 + tappetTrig * mechCylNorm);
    injectorDecay = Math.min(1.6, injectorDecay * 0.942 + injectorTrig * mechCylNorm);
    const nM1 = nextNoise();
    const nM2 = nextNoise();
    const pistonExc = pistonSlapDecay * (0.72 + 0.28 * nM1);
    const tappetExc = tappetDecay * (0.55 + 0.45 * nM2);
    const injectorExc = injectorDecay * (0.45 + 0.55 * nM1) * (0.95 / (1.0 + rpmNorm * 2.4));

    const mechBlockLow = mech1.process(pistonExc) * 0.34;
    const mechHeadMid = mech2.process(pistonExc * 0.55 + tappetExc * 0.95) * 0.30 * mechHfDamp;
    const mechTappetHi = mech3.process(tappetExc) * 0.34 * mechHfDamp;
    const mechInjectorHi = mech4.process(injectorExc) * 0.36 * mechHfDamp;

    const chainFreq = (rpm / 60) * (isRotary ? 11.0 : 18.0);
    chainPhase = (chainPhase + (chainFreq * (1.0 + nM2 * 0.018)) / sampleRate) % 1;
    const cp = chainPhase;
    const chainTri = cp < 0.25 ? cp * 4.0 : (cp < 0.75 ? 2.0 - cp * 4.0 : cp * 4.0 - 4.0);
    const chainRaw = (chainTri * 0.54 + Math.sin(cp * 12.56637) * 0.20 + nM1 * 0.36) * (0.60 + 0.40 * throttle);
    const chainDriveOut = chainBp.process(chainRaw) * (0.062 + 0.148 * Math.pow(rpmNorm, 0.75)) * mechHfDamp;

    const oilFreq = (rpm / 60) * 7.5;
    oilPumpPhase = (oilPumpPhase + oilFreq / sampleRate) % 1;
    const oilDriveHum =
      (Math.sin(oilPumpPhase * 6.2831853) * 0.65 + Math.sin(oilPumpPhase * 12.56637) * 0.25) *
      (0.036 + 0.088 * Math.pow(rpmNorm, 0.66)) *
      (0.68 + 0.32 * throttle);

    const strokeMod = 0.74 + 0.26 * Math.abs(Math.sin(crankDeg * nCyl * 0.008726646));
    const bearingWhirOut =
      bearingBp.process(nM2 * strokeMod) *
      (0.042 + 0.138 * Math.pow(rpmNorm, 0.80)) *
      (0.65 + 0.35 * throttle) *
      mechHfDamp;

    const blkAc = blockThumpSum - blkDcPrev + 0.996 * blkDcOut; blkDcPrev = blockThumpSum; blkDcOut = blkAc;
    const blockThump = blockThumpLp.process(blkAc * 0.64) * blockWeightGain;
    const mechAirborne = (mechHeadMid + mechTappetHi + mechInjectorHi + chainDriveOut + bearingWhirOut) * panelTransmit * settings.mechanicalLevel;
    const mechStructLow = (blockThump + mechBlockLow + oilDriveHum) * settings.mechanicalLevel;
    const mechOut = mechAirborne + mechStructLow;

    const dCol = (colA - prevColA + (colB - prevColB)) * 0.5; prevColA = colA; prevColB = colB;
    const metalDrive = Math.tanh(dCol * 1.6) * (0.28 + 0.72 * rpmNorm);
    const metAud = met1.process(metalDrive) * 0.55 + met2.process(metalDrive) * 0.36 + met3.process(metalDrive) * 0.20;
    const metalMassGain = (1.18 - 0.38 * mufMassNorm) * (1.12 - 0.24 * chasMassNorm);
    const metallicOut = Math.tanh(metAud * 1.25) * 0.28 * metalMassGain * settings.metallicRinging;

    let gearOut = 0;
    if (settings.gearWhineLevel > 0.01) {
      const gf = 240 + rpmNorm * 1180;
      gearPhase = (gearPhase + gf / sampleRate) % 1;
      const rg = Math.sin(gearPhase * 6.2831853) * 0.75 + Math.sin(gearPhase * 12.56637) * 0.25;
      gearOut = gearBp.process(rg) * rpmNorm * (0.22 + 0.78 * Math.abs(throttle - 0.15)) * 0.14 * panelTransmit * settings.gearWhineLevel;
    }

    let forced = 0;
    if (isTurbo && config.maxBoostBar > 0.02) {
      const sh = turboShaftNorm;
      const nT1 = nextNoise();
      const nT2 = nextNoise();
      const whooshDrive = nT1 * (0.20 + 0.80 * throttle) * (0.28 + 0.72 * spool) * Math.pow(sh, 1.30);
      const turboWhoosh = turboWhooshBp.process(whooshDrive) * 0.24;
      const tf = (1850 + Math.pow(sh, 1.15) * 4600) * (1.0 + nT2 * 0.012);
      turboPhase = (turboPhase + tf / sampleRate) % 1;
      const bladeRaw = nT2 * 0.80 + Math.sin(turboPhase * 6.2831853) * 0.20;
      const whistleEnv = Math.pow(sh, 1.75) * (0.22 + 0.78 * Math.min(1.0, spool + 0.20));
      const turboWhistle = turboWhistleBp.process(bladeRaw) * whistleEnv * 0.10;
      forced = (turboWhoosh + turboWhistle) * settings.turboWhineLevel;
    } else if (isSC && config.maxBoostBar > 0.02) {
      const sf = 360 + rpmNorm * 1950;
      scPhase = (scPhase + sf / sampleRate) % 1;
      forced = (Math.sin(scPhase * 6.2831853) * 0.72 + Math.sin(scPhase * 12.56637) * 0.28) * (0.26 + 0.74 * throttle) * 0.15 * settings.turboWhineLevel;
    }

    let blockMix = mechOut + metallicOut + gearOut + forced;
    let structCabin = 0;
    if (isCockpit) {
      const frontRaw = mechAirborne + metallicOut + gearOut + forced;
      const fwAtten = 1.0 / (0.85 + 0.55 * fw + 0.45 * ins);
      const frontAir = nvhFrontLp2.process(nvhFrontLp1.process(frontRaw)) * fwAtten;
      intakeOut = nvhIntakeLp.process(intakeOut) * (1.02 - ins * 0.34);
      const rearBulkAtten = 0.92 - ins * 0.26;
      exOutA = nvhRearExLpA2.process(nvhRearExLpA1.process(exOutA)) * rearBulkAtten;
      exOutB = nvhRearExLpB2.process(nvhRearExLpB1.process(exOutB)) * rearBulkAtten;
      const mh = (mufShakeA + mufShakeB) * 0.45 * settings.exhaustLevel + mechStructLow * 0.88 + gearOut * (0.55 - ins * 0.40);
      structCabin = structFloorLp.process(mh) * (0.82 + 0.45 * chasMassNorm) + structPanelBp.process(mh) * (0.48 * (1.0 - ins * 0.78));
      blockMix = frontAir + mechStructLow * (0.72 - ins * 0.16);
    }

    const chassisDrive =
      (exOutA + exOutB) * 0.42 +
      (mufShakeA + mufShakeB) * 0.28 * settings.exhaustLevel +
      intakeOut * 0.20 +
      blockThump * 0.45 * settings.mechanicalLevel;
    let subChassis =
      subBodyLp.process(chassisDrive) * chasBassGain +
      chassisRes.process(chassisDrive) * (0.28 + 0.26 * intResLevel) * (0.75 + 0.35 * chasMassNorm) +
      structCabin;
    if (isCockpit) {
      subChassis = cabinMode3.process(cabinMode2.process(cabinMode1.process(subChassis)));
    }

    const sum = (exOutA + exOutB) * 0.78 + intakeOut + blockMix + subChassis;
    raw[i] = Math.tanh(masterAirLp.process(sum) * 1.28) * 0.88;
  }

  // Seamless crossfade loop extraction
  const out = new Float32Array(loopSamples);
  for (let i = 0; i < loopSamples; i++) {
    out[i] = raw[warmupSamples + i];
  }
  for (let i = 0; i < xfadeSamples; i++) {
    const t = i / xfadeSamples;
    out[i] = out[i] * t + raw[warmupSamples + loopSamples + i] * (1 - t);
  }

  return encodeWavPcm16(out, sampleRate);
}

/**
 * Synthesizes a realistic 100% aerodynamic compressor-surge BOV flutter one-shot WAV
 * (zero sine oscillators — pressurized air chopping with naturally slowing flutter rate).
 */
export function renderBovFlutterWav(
  settings: EngineSoundSettings,
  sampleRate = 44100
): Uint8Array {
  const durationSec = 0.82;
  const totalSamples = Math.floor(sampleRate * durationSec);
  const out = new Float32Array(totalSamples);
  const bovBp = new OfflineBiquad();
  const bleedLp = new OfflineBiquad();
  bleedLp.setLowpass(sampleRate, 3800, 0.75);

  let seed = 135792468;
  const nextNoise = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return (seed / 4294967296) * 2 - 1;
  };

  let phase = 0;
  const level = Math.max(0.25, Math.min(1.6, settings.bovFlutterLevel));

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const attack = Math.min(1.0, t / 0.012);
    const tailFade = t > durationSec - 0.06 ? Math.max(0, (durationSec - t) / 0.06) : 1.0;
    const env = attack * Math.exp(-t * 3.7) * tailFade;

    if ((i & 7) === 0) {
      bovBp.setBandpass(sampleRate, 820 + env * 1500, 2.05);
    }

    const flutterHz = 5.4 + env * 8.6;
    phase += flutterHz / sampleRate;
    const chop = Math.pow(0.5 + 0.5 * Math.sin(phase * 6.2831853), 1.85);
    const n1 = nextNoise();
    const surge = bovBp.process(n1 * (0.16 + 0.84 * chop)) * env * 1.15;
    const bleed = bleedLp.process(n1) * env * env * 0.22;
    out[i] = Math.tanh((surge + bleed) * level * 0.95) * 0.86;
  }

  return encodeWavPcm16(out, sampleRate);
}

/**
 * Synthesizes a physical exhaust overrun / rev-limiter backfire pop one-shot WAV.
 */
export function renderBackfirePopWav(
  settings: EngineSoundSettings,
  sampleRate = 44100
): Uint8Array {
  const durationSec = 0.42;
  const totalSamples = Math.floor(sampleRate * durationSec);
  const out = new Float32Array(totalSamples);
  const mufMassNorm = Math.max(0, Math.min(1, ((settings.mufflerMassKg ?? 12) - 4) / 26));

  const subLp = new OfflineBiquad();
  subLp.setLowpass(sampleRate, 260 - 70 * mufMassNorm, 0.92);
  const cavBp = new OfflineBiquad();
  cavBp.setBandpass(sampleRate, 155 - 45 * mufMassNorm, 1.5);
  const crackBp = new OfflineBiquad();
  crackBp.setBandpass(sampleRate, 1450 - 380 * mufMassNorm, 1.15);

  let seed = 246813579;
  const nextNoise = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return (seed / 4294967296) * 2 - 1;
  };

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const attack = Math.min(1.0, t / 0.0025);
    const tailFade = t > durationSec - 0.04 ? Math.max(0, (durationSec - t) / 0.04) : 1.0;
    const boomEnv = attack * Math.exp(-t * 16.5) * tailFade;
    const crackEnv = attack * Math.exp(-t * 36.0) * tailFade;
    // Secondary small tailpipe crackle echo at ~75 ms
    const echoT = t - 0.075;
    const echoEnv = echoT > 0 ? Math.min(1.0, echoT / 0.003) * Math.exp(-echoT * 34.0) * 0.42 * tailFade : 0;

    const n = nextNoise();
    const boom = (subLp.process(n * 1.45 + 0.25) * 0.95 + cavBp.process(n) * 0.65) * boomEnv;
    const crack = crackBp.process(n) * (crackEnv * 0.72 + echoEnv * 0.85);
    out[i] = Math.tanh((boom + crack) * 1.35) * 0.88;
  }

  return encodeWavPcm16(out, sampleRate);
}

function escapeLuaStr(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, ' ');
}

function buildCspEngineSoundLuaScript(
  config: EngineSimConfig,
  settings: EngineSoundSettings,
  extIdle: { fileName: string; rpm: number },
  extOn: Array<{ fileName: string; rpm: number }>,
  extOff: Array<{ fileName: string; rpm: number }>,
  intIdle: { fileName: string; rpm: number },
  intOn: Array<{ fileName: string; rpm: number }>,
  intOff: Array<{ fileName: string; rpm: number }>,
  bovFileName: string | null,
  popFileName: string | null
): string {
  const fmtList = (items: Array<{ fileName: string; rpm: number }>) =>
    items.map((it) => `  { file = '${escapeLuaStr(it.fileName)}', rpm = ${Math.round(it.rpm)} },`).join('\n');

  const isTurbo = config.aspiration === 'SINGLE_TURBO' || config.aspiration === 'TWIN_TURBO';
  const masterGain = Math.max(0.45, Math.min(1.35, settings.masterVolume * 1.15));

  return `-- AC Car Studio — Physical Engine Sound Runtime for Assetto Corsa (CSP Lua)
-- Engine: ${escapeLuaStr(config.name)} (${escapeLuaStr(config.layout)})
-- Auto-generated: plays dual-bank Exterior 3D + Cockpit NVH WAV loops via FMOD ac.AudioEvent.fromFile
-- Automatically silences stock FMOD .bank engine channels ONLY when custom WAVs load cleanly.

local ENGINE_NAME = '${escapeLuaStr(config.name)}'
local IDLE_RPM = ${Math.round(config.idleRpm)}
local REDLINE_RPM = ${Math.round(config.redlineRpm)}
local IS_TURBO = ${isTurbo ? 'true' : 'false'}
local MAX_BOOST = ${Math.max(0.3, config.maxBoostBar).toFixed(2)}
local LIMITER_CUT_HZ = ${Math.max(8, Math.min(28, settings.revLimiterCutHz)).toFixed(1)}
local BOV_LEVEL = ${Math.max(0, settings.bovFlutterLevel).toFixed(2)}
local POP_LEVEL = ${Math.max(0, settings.popBangLevel).toFixed(2)}
local MASTER_GAIN = ${masterGain.toFixed(2)}

local EXT_IDLE_DEF = { file = '${escapeLuaStr(extIdle.fileName)}', rpm = ${Math.round(extIdle.rpm)} }
local EXT_ON_DEFS = {
${fmtList(extOn)}
}
local EXT_OFF_DEFS = {
${fmtList(extOff)}
}

local INT_IDLE_DEF = { file = '${escapeLuaStr(intIdle.fileName)}', rpm = ${Math.round(intIdle.rpm)} }
local INT_ON_DEFS = {
${fmtList(intOn)}
}
local INT_OFF_DEFS = {
${fmtList(intOff)}
}

local BOV_FILE = ${bovFileName ? `'${escapeLuaStr(bovFileName)}'` : 'nil'}
local POP_FILE = ${popFileName ? `'${escapeLuaStr(popFileName)}'` : 'nil'}

local POS_TAILPIPE = vec3(0, 0.40, -1.90)
local POS_CABIN = vec3(0, 0.55, 0.35)
local POS_ENGINE_BAY = vec3(0, 0.52, 1.05)

local function clamp(x, lo, hi)
  if x < lo then return lo end
  if x > hi then return hi end
  return x
end

local function normPath(p)
  return (string.gsub(p, '\\\\', '/'))
end

local function resolveWavPath(fileName)
  if not fileName then return nil end
  local origin = ac.getFolder(ac.FolderID.ScriptOrigin)
  if origin and #origin > 0 then
    local p1 = normPath(origin) .. '/ac_car_studio_sound/' .. fileName
    if io.fileExists(p1) then return p1 end
  end
  local cid = ac.getCarID(car.index)
  local carsDir = ac.getFolder(ac.FolderID.ContentCars)
  if carsDir and cid and #cid > 0 then
    local base = normPath(carsDir) .. '/' .. cid
    local p2 = base .. '/extension/ac_car_studio_sound/' .. fileName
    if io.fileExists(p2) then return p2 end
    local p3 = base .. '/sfx/engine_sim_export/' .. fileName
    if io.fileExists(p3) then return p3 end
  end
  return 'ac_car_studio_sound/' .. fileName
end

local allLoops = {}
local validLoopCount = 0

local function createLoopVoice(def, isExterior)
  local fullPath = resolveWavPath(def.file)
  if not fullPath then return nil end
  local ev = ac.AudioEvent.fromFile({
    filename = fullPath,
    use3D = true,
    useOcclusion = isExterior,
    loop = true,
    minDistance = isExterior and 2.8 or 1.8,
    maxDistance = isExterior and 450.0 or 14.0,
    dopplerEffect = isExterior and 1.0 or 0.0,
  }, true)
  if not ev or not ev:isValid() then
    return nil
  end
  if isExterior then
    ev.cameraInteriorMultiplier = 0.42
    ev.cameraExteriorMultiplier = 1.0
    ev.cameraTrackMultiplier = 1.15
    ev:setPosition(POS_TAILPIPE)
  else
    -- Lua explicitly routes intBank only during cockpit/interior view; keep both multipliers at 1.0 so custom/VR cameras never mute it
    ev.cameraInteriorMultiplier = 1.0
    ev.cameraExteriorMultiplier = 1.0
    ev.cameraTrackMultiplier = 0.0
    ev:setPosition(POS_CABIN)
  end
  ev.volume = 0.0
  ev.pitch = 1.0
  local voice = { ev = ev, rpm = def.rpm, isExt = isExterior, active = false }
  allLoops[#allLoops + 1] = voice
  validLoopCount = validLoopCount + 1
  return voice
end

local function buildBank(idleDef, onDefs, offDefs, isExterior)
  local bank = {
    idle = createLoopVoice(idleDef, isExterior),
    on = {},
    off = {},
  }
  for i = 1, #onDefs do
    local v = createLoopVoice(onDefs[i], isExterior)
    if v then bank.on[#bank.on + 1] = v end
  end
  for i = 1, #offDefs do
    local v = createLoopVoice(offDefs[i], isExterior)
    if v then bank.off[#bank.off + 1] = v end
  end
  return bank
end

local extBank = buildBank(EXT_IDLE_DEF, EXT_ON_DEFS, EXT_OFF_DEFS, true)
local intBank = buildBank(INT_IDLE_DEF, INT_ON_DEFS, INT_OFF_DEFS, false)
local bovFullPath = BOV_FILE and resolveWavPath(BOV_FILE) or nil
local popFullPath = POP_FILE and resolveWavPath(POP_FILE) or nil
local activeOneShots = {}

local function muteStockEngine()
  if validLoopCount == 0 then return end
  if ac.CarAudioTweak and ac.CarAudioTweak.setVolume then
    ac.CarAudioTweak.setVolume(ac.CarAudioEventID.EngineExt, 0)
    ac.CarAudioTweak.setVolume(ac.CarAudioEventID.EngineInt, 0)
    ac.CarAudioTweak.setVolume(ac.CarAudioEventID.Turbo, 0)
    ac.CarAudioTweak.setVolume(ac.CarAudioEventID.BackfireExt, 0)
    ac.CarAudioTweak.setVolume(ac.CarAudioEventID.BackfireInt, 0)
    ac.CarAudioTweak.setVolume(ac.CarAudioEventID.Limiter, 0)
  end
end

if validLoopCount > 0 then
  muteStockEngine()
  ac.log('[AC Car Studio Sound] Active (' .. validLoopCount .. ' loops loaded) for ' .. tostring(ac.getCarID(car.index)) .. ' [' .. ENGINE_NAME .. ']')
else
  ac.log('[AC Car Studio Sound] Warning: No WAV loops loaded for ' .. tostring(ac.getCarID(car.index)) .. '; keeping stock bank.')
end

local function setVoiceState(v, vol, pitch, pos)
  if not v or not v.ev then return end
  if vol > 0.004 then
    v.ev.volume = vol
    v.ev.pitch = pitch
    v.ev:setPosition(pos)
    if not v.active or not v.ev:isPlaying() then
      v.ev:start()
      v.active = true
    end
  else
    if v.active then
      v.ev.volume = 0.0
      v.ev:stop()
      v.active = false
    end
  end
end

local function silenceBank(bank)
  if bank.idle then setVoiceState(bank.idle, 0, 1, POS_TAILPIPE) end
  for i = 1, #bank.on do setVoiceState(bank.on[i], 0, 1, POS_TAILPIPE) end
  for i = 1, #bank.off do setVoiceState(bank.off[i], 0, 1, POS_TAILPIPE) end
end

local function driveRegionList(list, rpm, groupWeight, masterVol, pos)
  local n = #list
  if n == 0 or groupWeight <= 0.004 then
    for i = 1, n do setVoiceState(list[i], 0, 1, pos) end
    return
  end

  if rpm <= list[1].rpm then
    local p = clamp(rpm / math.max(300, list[1].rpm), 0.48, 1.55)
    setVoiceState(list[1], groupWeight * masterVol, p, pos)
    for i = 2, n do setVoiceState(list[i], 0, 1, pos) end
    return
  end

  if rpm >= list[n].rpm then
    local p = clamp(rpm / math.max(500, list[n].rpm), 0.60, 1.45)
    setVoiceState(list[n], groupWeight * masterVol, p, pos)
    for i = 1, n - 1 do setVoiceState(list[i], 0, 1, pos) end
    return
  end

  local idx = 1
  for i = 1, n - 1 do
    if rpm >= list[i].rpm and rpm <= list[i + 1].rpm then
      idx = i
      break
    end
  end

  local lo = list[idx]
  local hi = list[idx + 1]
  local span = math.max(100, hi.rpm - lo.rpm)
  local t = clamp((rpm - lo.rpm) / span, 0.0, 1.0)
  local wLo = math.cos(t * 1.5707963)
  local wHi = math.sin(t * 1.5707963)
  local pLo = clamp(rpm / math.max(300, lo.rpm), 0.55, 1.65)
  local pHi = clamp(rpm / math.max(300, hi.rpm), 0.55, 1.65)

  for i = 1, n do
    if i == idx then
      setVoiceState(lo, groupWeight * wLo * masterVol, pLo, pos)
    elseif i == idx + 1 then
      setVoiceState(hi, groupWeight * wHi * masterVol, pHi, pos)
    else
      setVoiceState(list[i], 0, 1, pos)
    end
  end
end

local function driveBank(bank, rpm, thr, masterVol, pos)
  local firstOnRpm = (#bank.on > 0) and bank.on[1].rpm or (IDLE_RPM + 700)
  local idleSpan = math.max(550, (firstOnRpm - IDLE_RPM) * 0.95)
  local idleRpmW = clamp(1.0 - (rpm - IDLE_RPM) / idleSpan, 0.0, 1.0)
  local idleThrW = clamp(1.0 - thr * 1.45, 0.0, 1.0)
  local wIdle = bank.idle and (idleRpmW * idleThrW) or 0.0

  if bank.idle then
    local pIdle = clamp(rpm / math.max(350, bank.idle.rpm), 0.55, 1.45)
    setVoiceState(bank.idle, wIdle * masterVol, pIdle, pos)
  end

  local driveTotal = math.sqrt(math.max(0.0, 1.0 - wIdle * wIdle))
  local onFrac = clamp((thr - 0.05) / 0.70, 0.0, 1.0)
  local wOn = driveTotal * math.sqrt(onFrac)
  local wOff = driveTotal * math.sqrt(1.0 - onFrac)

  driveRegionList(bank.on, rpm, wOn, masterVol, pos)
  driveRegionList(bank.off, rpm, wOff, masterVol, pos)
end

local function spawnOneShot(path, vol, pitch, pos, intMult, extMult)
  if not path or vol <= 0.02 then return end
  if #activeOneShots >= 6 then
    local oldest = table.remove(activeOneShots, 1)
    if oldest and oldest.ev then oldest.ev:dispose() end
  end
  local ev = ac.AudioEvent.fromFile({
    filename = path,
    use3D = true,
    useOcclusion = true,
    loop = false,
    minDistance = 2.5,
    maxDistance = 260.0,
    dopplerEffect = 0.85,
  }, true)
  if not ev or not ev:isValid() then return end
  ev.cameraInteriorMultiplier = intMult
  ev.cameraExteriorMultiplier = extMult
  ev.cameraTrackMultiplier = extMult * 1.1
  ev.volume = vol
  ev.pitch = pitch
  ev:setPosition(pos)
  ev:start()
  activeOneShots[#activeOneShots + 1] = { ev = ev, pos = pos }
end

local smoothRpm = IDLE_RPM
local smoothThr = 0.05
local prevGas = 0.0
local prevRpm = IDLE_RPM
local peakBoost = 0.0
local bovCooldown = 0.0
local popCooldown = 0.0
local limiterPhase = 0.0
local prevLimiterCut = false
local lastFrame = -1

local function tick(dt)
  if validLoopCount == 0 then return end
  if sim.frame == lastFrame then return end
  lastFrame = sim.frame

  muteStockEngine()

  -- Clean up finished one-shot FX and update active 3D positions
  for i = #activeOneShots, 1, -1 do
    local item = activeOneShots[i]
    if not item.ev or not item.ev:isValid() or not item.ev:isPlaying() then
      if item.ev then item.ev:dispose() end
      table.remove(activeOneShots, i)
    else
      item.ev:setPosition(item.pos)
    end
  end

  local dist = car.distanceToCamera or 0
  if sim.isPaused or dist > 400 or (car.rpm or 0) < 60 then
    silenceBank(extBank)
    silenceBank(intBank)
    return
  end

  local dtClamped = clamp(dt or 0.016, 0.001, 0.05)
  local rawRpm = math.max(150, car.rpm or IDLE_RPM)
  local rawGas = clamp(car.gas or 0, 0.0, 1.0)
  smoothRpm = smoothRpm + (rawRpm - smoothRpm) * math.min(1.0, dtClamped * 32.0)
  smoothThr = smoothThr + (rawGas - smoothThr) * math.min(1.0, dtClamped * 26.0)

  local engSlider = ac.getAudioVolume('engine')
  if not engSlider or engSlider < 0 then engSlider = 1.0 end
  local oppSlider = 1.0
  if car.index > 0 then
    local o = ac.getAudioVolume('opponents')
    if o and o >= 0 then oppSlider = o end
  end
  local aliveFade = clamp((rawRpm - 60) / 260, 0.0, 1.0)

  -- Real-time Rev Limiter ignition cut modulation
  local limRpm = (car.rpmLimiter and car.rpmLimiter > 1500) and car.rpmLimiter or REDLINE_RPM
  local limiterGain = 1.0
  local limiterCut = false
  if rawRpm >= limRpm - 95 and rawGas > 0.25 then
    limiterPhase = (limiterPhase + dtClamped * LIMITER_CUT_HZ) % 1.0
    limiterCut = limiterPhase >= 0.50
    limiterGain = limiterCut and 0.14 or 1.0
    if limiterCut and not prevLimiterCut and popFullPath and popCooldown <= 0 then
      spawnOneShot(popFullPath, 0.72 * engSlider * oppSlider * MASTER_GAIN, 0.90 + math.random() * 0.28, POS_TAILPIPE, 0.42, 1.0)
      popCooldown = 0.075
    end
  else
    limiterPhase = 0.0
  end
  prevLimiterCut = limiterCut

  local masterVol = engSlider * oppSlider * MASTER_GAIN * aliveFade * limiterGain

  -- Route cleanly between Cockpit Interior NVH bank and Exterior 3D bank (only 2-4 FMOD voices active!)
  local isIntCam = car.isCameraOnBoard and (ac.isInteriorView and ac.isInteriorView() or false)
  if isIntCam and #intBank.on > 0 then
    silenceBank(extBank)
    driveBank(intBank, smoothRpm, smoothThr, masterVol * 0.96, POS_CABIN)
  else
    silenceBank(intBank)
    driveBank(extBank, smoothRpm, smoothThr, masterVol, POS_TAILPIPE)
  end

  -- Turbo BOV Compressor Surge Flutter Trigger
  bovCooldown = math.max(0, bovCooldown - dtClamped)
  popCooldown = math.max(0, popCooldown - dtClamped)
  local boost = car.turboBoost or 0
  if boost > peakBoost then
    peakBoost = boost
  else
    peakBoost = math.max(boost, peakBoost - dtClamped * 1.4)
  end

  if IS_TURBO and bovFullPath and BOV_LEVEL > 0.05 and bovCooldown <= 0 then
    if (prevGas - rawGas) > 0.22 and peakBoost > 0.22 then
      local bNorm = clamp(peakBoost / MAX_BOOST, 0.32, 1.15)
      spawnOneShot(
        bovFullPath,
        bNorm * BOV_LEVEL * 0.65 * engSlider * oppSlider * MASTER_GAIN,
        0.88 + 0.24 * clamp(peakBoost / MAX_BOOST, 0.0, 1.0),
        POS_ENGINE_BAY,
        0.52,
        1.0
      )
      bovCooldown = 0.36
      peakBoost = 0
    end
  end

  -- Overrun Exhaust Pops & Burbles on High-RPM Deceleration
  if popFullPath and POP_LEVEL > 0.05 and popCooldown <= 0 then
    if rawGas < 0.08 and rawRpm > IDLE_RPM + 1250 and rawRpm < prevRpm - 3 then
      if math.random() < (dtClamped * (3.2 + POP_LEVEL * 6.5)) then
        spawnOneShot(
          popFullPath,
          (0.40 + math.random() * 0.45) * POP_LEVEL * engSlider * oppSlider * MASTER_GAIN,
          0.78 + math.random() * 0.46,
          POS_TAILPIPE,
          0.35,
          1.0
        )
        popCooldown = 0.09 + math.random() * 0.16
      end
    end
  end

  prevGas = prevGas + (rawGas - prevGas) * math.min(1.0, dtClamped * 18.0)
  prevRpm = rawRpm
end

function update(dt)
  tick(dt)
end

script = script or {}
function script.update(dt)
  tick(dt)
end

if ac.onRelease then
  ac.onRelease(function()
    for i = 1, #allLoops do
      if allLoops[i].ev then allLoops[i].ev:dispose() end
    end
    for i = 1, #activeOneShots do
      if activeOneShots[i].ev then activeOneShots[i].ev:dispose() end
    end
  end)
end
`;
}

export function buildEngineSoundExportPayload(
  config: EngineSimConfig,
  simResult: EngineSimResult,
  settings: EngineSoundSettings
): SoundExportPayload {
  const samples: SoundSampleWavPayload[] = [];
  const idleRpm = Math.round(config.idleRpm);

  // Exterior settings: dry outdoor mic so AC's 3D space, Doppler & tunnel reverb handle room acoustics naturally
  const extSettings: EngineSoundSettings = { ...settings, roomType: 'TRACK_OUTSIDE' };
  // Cockpit interior settings: preserves user's exact cabinInsulation, firewallThickness & mass NVH!
  const intSettings: EngineSoundSettings = { ...settings, roomType: 'COCKPIT' };

  const extIdleFile = `ext_idle_${idleRpm}.wav`;
  samples.push({
    fileName: extIdleFile,
    wavBytes: renderOfflineEngineLoopWav(config, simResult, extSettings, idleRpm, 0.06, 1.8),
    rpm: idleRpm,
    loadType: 'idle',
    perspective: 'ext',
  });

  const intIdleFile = `int_idle_${idleRpm}.wav`;
  samples.push({
    fileName: intIdleFile,
    wavBytes: renderOfflineEngineLoopWav(config, simResult, intSettings, idleRpm, 0.06, 1.8),
    rpm: idleRpm,
    loadType: 'idle',
    perspective: 'int',
  });

  const extOnRefs: Array<{ fileName: string; rpm: number }> = [];
  const intOnRefs: Array<{ fileName: string; rpm: number }> = [];
  const onSteps = 6;
  for (let i = 0; i < onSteps; i++) {
    const frac = i / (onSteps - 1);
    const rpm = Math.round((config.idleRpm + 700 + frac * (config.redlineRpm - config.idleRpm - 800)) / 100) * 100;
    const extFile = `ext_on_${rpm}.wav`;
    const intFile = `int_on_${rpm}.wav`;
    samples.push({
      fileName: extFile,
      wavBytes: renderOfflineEngineLoopWav(config, simResult, extSettings, rpm, 0.96, 1.45),
      rpm,
      loadType: 'on',
      perspective: 'ext',
    });
    samples.push({
      fileName: intFile,
      wavBytes: renderOfflineEngineLoopWav(config, simResult, intSettings, rpm, 0.96, 1.45),
      rpm,
      loadType: 'on',
      perspective: 'int',
    });
    extOnRefs.push({ fileName: extFile, rpm });
    intOnRefs.push({ fileName: intFile, rpm });
  }

  const extOffRefs: Array<{ fileName: string; rpm: number }> = [];
  const intOffRefs: Array<{ fileName: string; rpm: number }> = [];
  const offSteps = 4;
  for (let i = 0; i < offSteps; i++) {
    const frac = i / (offSteps - 1);
    const rpm = Math.round((config.idleRpm + 1000 + frac * (config.redlineRpm - config.idleRpm - 1200)) / 100) * 100;
    const extFile = `ext_off_${rpm}.wav`;
    const intFile = `int_off_${rpm}.wav`;
    samples.push({
      fileName: extFile,
      wavBytes: renderOfflineEngineLoopWav(config, simResult, extSettings, rpm, 0.03, 1.45),
      rpm,
      loadType: 'off',
      perspective: 'ext',
    });
    samples.push({
      fileName: intFile,
      wavBytes: renderOfflineEngineLoopWav(config, simResult, intSettings, rpm, 0.03, 1.45),
      rpm,
      loadType: 'off',
      perspective: 'int',
    });
    extOffRefs.push({ fileName: extFile, rpm });
    intOffRefs.push({ fileName: intFile, rpm });
  }

  // Dedicated Dynamic Event One-Shots (Aerodynamic BOV Flutter & Exhaust Backfire Pop)
  const isTurbo = config.aspiration === 'SINGLE_TURBO' || config.aspiration === 'TWIN_TURBO';
  let bovFileName: string | null = null;
  if (isTurbo && config.maxBoostBar > 0.02) {
    bovFileName = 'fx_bov_flutter.wav';
    samples.push({
      fileName: bovFileName,
      wavBytes: renderBovFlutterWav(settings),
      rpm: 0,
      loadType: 'fx',
      perspective: 'fx',
    });
  }

  const popFileName = 'fx_backfire_pop.wav';
  samples.push({
    fileName: popFileName,
    wavBytes: renderBackfirePopWav(settings),
    rpm: 0,
    loadType: 'fx',
    perspective: 'fx',
  });

  const cspLuaScript = buildCspEngineSoundLuaScript(
    config,
    settings,
    { fileName: extIdleFile, rpm: idleRpm },
    extOnRefs,
    extOffRefs,
    { fileName: intIdleFile, rpm: idleRpm },
    intOnRefs,
    intOffRefs,
    bovFileName,
    popFileName
  );

  const manifest = {
    generator:
      'AC Car Studio — Engine-Sim Physical Audio Synthesizer v4 (CSP Direct Lua Audio Runtime + Dual EXT/INT WAV Bank)',
    createdAt: new Date().toISOString(),
    runtime: {
      mode: 'CSP Car Extension Lua Script (ac.AudioEvent.fromFile + ac.CarAudioTweak)',
      scriptFile: 'extension/ac_car_studio_engine_sound.lua',
      wavDir: 'extension/ac_car_studio_sound/',
      requiresCsp: true,
    },
    engine: {
      name: config.name,
      layout: config.layout,
      cylinders: config.cylinders,
      displacementCc: simResult.displacementCc,
      aspiration: config.aspiration,
      idleRpm: config.idleRpm,
      redlineRpm: config.redlineRpm,
      firingAnglesDeg: simResult.firingAnglesDeg,
      primaryLengthsMm: simResult.primaryLengthsMm,
      cylinderBanks: computeCylinderBanks(config, simResult.firingAnglesDeg.length),
    },
    soundSettings: settings,
    samples: samples.map((s) => ({
      file: s.fileName,
      rpm: s.rpm,
      load: s.loadType,
      perspective: s.perspective ?? 'ext',
      sampleRate: 44100,
      channels: 1,
      loopable: s.loadType !== 'fx',
    })),
    fmodGuide:
      'In Assetto Corsa with CSP, the custom engine sound plays automatically via extension/ac_car_studio_engine_sound.lua. For vanilla AC without CSP, import ext_on_*.wav and ext_off_*.wav into FMOD Studio 1.08.12 and build <car_folder>.bank.',
  };

  // Verified CSP car script hook in extension/ext_config.ini (stock engine muting is fail-safe inside Lua!)
  const extConfigIni = `[SCRIPT_...]
SCRIPT = ac_car_studio_engine_sound.lua
ACTIVE_FOR_UNFOCUSED = 1
ACTIVE_FOR_NEAREST = 12
ACTIVE_FOR_LOD = C

[EXHAUST_FLAMES]
; Generated by AC Car Studio Engine-Sim v4 (${config.name})
ANTILAG = ${settings.popBangLevel > 0.5 ? 1 : 0}
INTENSITY = ${(settings.popBangLevel * 1.2).toFixed(2)}
`;

  const soundsIniPatch = `[ENGINE]
POSITION=0,0.45,1.10

[BACKFIRE]
MIN_RPM=${Math.round(config.idleRpm + 1800)}
MAX_RPM=${Math.round(config.redlineRpm)}
TRIGGER_GAS=0.12
VOLUME=${Math.min(1.5, settings.popBangLevel).toFixed(2)}
`;

  return {
    engineName: config.name,
    layoutLabel: config.layout,
    maxRpm: config.redlineRpm,
    idleRpm: config.idleRpm,
    samples,
    manifestJson: JSON.stringify(manifest, null, 2),
    extConfigIni,
    cspLuaScript,
    soundsIniPatch,
  };
}
