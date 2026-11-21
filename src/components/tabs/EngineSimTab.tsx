import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Cpu,
  Download,
  Flame,
  Play,
  RotateCcw,
  Square,
  Volume2,
  Waves,
  Zap,
} from 'lucide-react';
import type { CarPhysicsMetrics, CarSummary } from '../../types/ac';
import {
  ENGINE_SIM_PRESETS,
  applyEngineSimToCarFiles,
  simulateEngine,
  type AspirationType,
  type EngineLayout,
  type EngineSimConfig,
  type FuelType,
  type HeaderType,
} from '../../utils/engineSimPhysics';
import {
  DEFAULT_SOUND_SETTINGS,
  EngineSoundController,
  buildEngineSoundExportPayload,
  type AcousticRoomType,
  type EngineSoundSettings,
  type ExhaustCrossoverType,
  type ExhaustMufflerType,
  type IntakeSystemType,
} from '../../utils/engineSoundEngine';
import { DynoChart } from '../charts/DynoChart';
import { DetachablePanel } from '../common/DetachablePanel';
import { NumericControl } from '../ui/NumericControl';
import { HistoryStack, type UndoRedoHandler } from '../../utils/undoRedo';

interface EngineSimSnapshot {
  config: EngineSimConfig;
  soundSettings: EngineSoundSettings;
}

interface EngineSimUndoEntry {
  before: EngineSimSnapshot;
  after: EngineSimSnapshot;
}

interface EngineSimTabProps {
  carsDir: string;
  carId: string;
  cars: CarSummary[];
  files: Record<string, string>;
  currentCarMetrics: CarPhysicsMetrics;
  onReplaceAllFiles: (nextFiles: Record<string, string>, toastMsg: string) => void;
  onToast: (text: string, type?: 'success' | 'error' | 'info') => void;
  onRegisterUndoRedo?: (handler: UndoRedoHandler | null) => void;
}

type DriveDemoMode = 'free' | 'dyno' | 'track';

const LAYOUT_OPTIONS: Array<{ value: EngineLayout; label: string; cyls: number; bank: number }> = [
  { value: 'I3', label: '直列3気筒 (I3)', cyls: 3, bank: 0 },
  { value: 'I4', label: '直列4気筒 (I4)', cyls: 4, bank: 0 },
  { value: 'I5', label: '直列5気筒 (I5)', cyls: 5, bank: 0 },
  { value: 'I6', label: '直列6気筒 (I6)', cyls: 6, bank: 0 },
  { value: 'B4', label: '水平対向4気筒 (Boxer 4)', cyls: 4, bank: 180 },
  { value: 'B6', label: '水平対向6気筒 (Boxer 6)', cyls: 6, bank: 180 },
  { value: 'V6', label: 'V型6気筒 (V6 60°)', cyls: 6, bank: 60 },
  { value: 'V8_CROSS', label: 'V8 クロスプレーン (90°)', cyls: 8, bank: 90 },
  { value: 'V8_FLAT', label: 'V8 フラットプレーン (90°)', cyls: 8, bank: 90 },
  { value: 'V10', label: 'V型10気筒 (V10 72°)', cyls: 10, bank: 72 },
  { value: 'V12', label: 'V型12気筒 (V12 65°)', cyls: 12, bank: 65 },
  { value: 'ROTARY_2', label: '2ローター ロータリー (13B)', cyls: 2, bank: 0 },
  { value: 'ROTARY_3', label: '3ローター ロータリー (20B)', cyls: 3, bank: 0 },
  { value: 'ROTARY_4', label: '4ローター レーシング (R26B)', cyls: 4, bank: 0 },
];

export const EngineSimTab: React.FC<EngineSimTabProps> = ({
  carsDir,
  carId,
  cars,
  files,
  currentCarMetrics,
  onReplaceAllFiles,
  onToast,
  onRegisterUndoRedo,
}) => {
  const [config, setConfig] = useState<EngineSimConfig>(() => ({ ...ENGINE_SIM_PRESETS[1] }));
  const [soundSettings, setSoundSettings] = useState<EngineSoundSettings>(() => ({
    ...DEFAULT_SOUND_SETTINGS,
    chassisMassKg: Math.max(700, Math.min(2200, Math.round(currentCarMetrics.massKg || 1350))),
  }));

  const historyRef = useRef(new HistoryStack<EngineSimUndoEntry>({ maxEntries: 60, coalesceMs: 450 }));
  const [historyTick, setHistoryTick] = useState(0);
  const isRestoringHistoryRef = useRef(false);
  const soundSettingsRef = useRef(soundSettings);
  soundSettingsRef.current = soundSettings;

  const [audioRunning, setAudioRunning] = useState(false);
  const [demoMode, setDemoMode] = useState<DriveDemoMode>('free');
  const [manualThrottle, setManualThrottle] = useState(0);
  const [pedalHeld, setPedalHeld] = useState(false);
  const [liveRpm, setLiveRpm] = useState(config.idleRpm);
  const [liveGear, setLiveGear] = useState(1);
  const [liveBoost, setLiveBoost] = useState(0);
  const [exportingSound, setExportingSound] = useState(false);
  const [donorBankCarId, setDonorBankCarId] = useState('');

  const soundCtrlRef = useRef<EngineSoundController | null>(null);
  const pistonCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const scopeCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const simResult = useMemo(() => simulateEngine(config), [config]);

  // Sync chassis mass default when switching loaded car
  useEffect(() => {
    if (currentCarMetrics.massKg > 0) {
      const clamped = Math.max(700, Math.min(2200, Math.round(currentCarMetrics.massKg)));
      setSoundSettings((prev) => ({ ...prev, chassisMassKg: clamped }));
    }
  }, [carId, currentCarMetrics.massKg]);

  // Estimate realistic engine block mass when layout / displacement changes
  useEffect(() => {
    if (isRestoringHistoryRef.current) {
      isRestoringHistoryRef.current = false;
      return;
    }
    const dispL = simResult.displacementCc / 1000;
    const isRot = config.layout.startsWith('ROTARY_');
    const estKg = isRot
      ? Math.round(95 + config.cylinders * 22)
      : Math.round(
          Math.max(
            90,
            Math.min(
              310,
              92 + dispL * 24 + config.cylinders * 7 + (config.aspiration !== 'NA' ? 18 : 0)
            )
          )
        );
    setSoundSettings((prev) => ({ ...prev, engineMassKg: estKg }));
  }, [config.layout, config.cylinders, config.aspiration, simResult.displacementCc]);

  // Physics loop refs for smooth 60fps virtual engine dynamics & canvas animation
  const simStateRef = useRef({
    rpm: config.idleRpm,
    crankDeg: 0,
    throttle: 0.05,
    gear: 1,
    demoTime: 0,
    boost: 0,
    inLimiterCut: false,
  });

  const configRef = useRef(config);
  configRef.current = config;
  const simResultRef = useRef(simResult);
  simResultRef.current = simResult;
  const demoModeRef = useRef(demoMode);
  demoModeRef.current = demoMode;
  const throttleInputRef = useRef(0);
  throttleInputRef.current = pedalHeld ? 1.0 : manualThrottle;

  // Sync audio synthesizer parameters whenever config or soundSettings change
  useEffect(() => {
    const ctrl = soundCtrlRef.current;
    if (ctrl && ctrl.isRunning()) {
      ctrl.updateConfig(config, simResult);
    }
  }, [config, simResult]);

  useEffect(() => {
    const ctrl = soundCtrlRef.current;
    if (ctrl && ctrl.isRunning()) {
      ctrl.updateSettings(soundSettings);
    }
  }, [soundSettings]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      soundCtrlRef.current?.stop();
    };
  }, []);

  // Spacebar throttle support when audio is running
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && audioRunning) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        setPedalHeld(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setPedalHeld(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [audioRunning]);

  // Main 60fps Engine Simulation, Audio State Feed, Piston Cutaway & Oscilloscope Renderer
  useEffect(() => {
    let rafId = 0;
    let lastTs = performance.now();
    let uiSyncCounter = 0;
    let lastUiRpm = -1;
    let lastUiGear = -1;
    let lastUiBoost = Number.NaN;
    let scopePlaceholderDrawn = false;
    const gearRatios = [3.4, 2.25, 1.62, 1.24, 0.98, 0.78];

    const step = (now: number) => {
      rafId = requestAnimationFrame(step);
      if (document.hidden) {
        lastTs = now;
        return;
      }
      const dt = Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;

      const cfg = configRef.current;
      const res = simResultRef.current;
      const st = simStateRef.current;
      const mode = demoModeRef.current;

      let targetThrottle = throttleInputRef.current;
      let loadInertia = Math.max(0.06, res.estimatedInertiaKgM2);

      if (mode === 'dyno') {
        st.demoTime = (st.demoTime + dt) % 9.5;
        if (st.demoTime < 0.8) {
          targetThrottle = 0.08;
        } else if (st.demoTime < 6.5) {
          targetThrottle = 1.0;
          loadInertia *= 4.6; // Heavy dyno drum inertia for clean full pull
        } else {
          targetThrottle = 0.0;
          loadInertia *= 3.2;
        }
      } else if (mode === 'track') {
        st.demoTime += dt;
        const cycle = st.demoTime % 15.0;
        if (cycle < 10.5) {
          // Accelerating through gears 1 -> 5
          targetThrottle = 1.0;
          loadInertia *= 1.8 + st.gear * 1.1;
          if (st.rpm >= cfg.redlineRpm * 0.96 && st.gear < 5) {
            const prevRatio = gearRatios[st.gear - 1];
            const nextRatio = gearRatios[st.gear];
            st.gear += 1;
            st.rpm = Math.max(cfg.idleRpm + 500, st.rpm * (nextRatio / prevRatio));
            targetThrottle = 0.05;
          }
        } else {
          // Braking & heel-toe blip downshifts
          targetThrottle = 0.02;
          loadInertia *= 2.0;
          if (st.rpm < cfg.redlineRpm * 0.56 && st.gear > 1) {
            const prevRatio = gearRatios[st.gear - 1];
            const lowerRatio = gearRatios[st.gear - 2];
            st.gear -= 1;
            st.rpm = Math.min(cfg.redlineRpm * 0.92, st.rpm * (lowerRatio / prevRatio));
            targetThrottle = 0.65; // blip
          }
        }
      } else {
        st.gear = 0; // Neutral free revving
      }

      st.throttle += (targetThrottle - st.throttle) * Math.min(1, dt * 16);

      // Inertial rev-limiter hysteresis (cuts torque cleanly at redline, drops ~150 RPM, then re-fires)
      if (st.rpm >= cfg.redlineRpm) {
        st.inLimiterCut = true;
      } else if (st.rpm <= cfg.redlineRpm - 155 || st.throttle < 0.15) {
        st.inLimiterCut = false;
      }

      // Rotational acceleration physics
      const effectiveThr = st.inLimiterCut ? 0.0 : st.throttle;
      const rpmAccel = (effectiveThr * (cfg.redlineRpm - cfg.idleRpm) * 1.55) / (loadInertia * 5.2);
      const engineBraking = ((1 - effectiveThr) * (st.rpm - cfg.idleRpm) * (st.inLimiterCut ? 1.8 : 0.95)) / (loadInertia * 4.5);
      st.rpm += (rpmAccel - engineBraking) * dt;

      // Idle governor & hard ceiling
      if (st.rpm < cfg.idleRpm) {
        st.rpm += (cfg.idleRpm - st.rpm) * Math.min(1, dt * 14);
      }
      if (st.rpm > cfg.redlineRpm + 25) {
        st.rpm = cfg.redlineRpm + 25;
      }

      // Compute instantaneous boost
      let tgtBoost = 0;
      if (cfg.aspiration === 'SINGLE_TURBO' || cfg.aspiration === 'TWIN_TURBO') {
        tgtBoost =
          Math.min(
            cfg.maxBoostBar,
            cfg.maxBoostBar * Math.pow(st.rpm / Math.max(1500, cfg.turboRefRpm), cfg.turboGamma)
          ) * st.throttle;
      } else if (cfg.aspiration === 'SUPERCHARGER') {
        tgtBoost =
          cfg.maxBoostBar * Math.min(1, st.rpm / Math.max(2000, cfg.redlineRpm * 0.8)) * (0.25 + 0.75 * st.throttle);
      }
      st.boost += (tgtBoost - st.boost) * Math.min(1, dt * (tgtBoost > st.boost ? 5 : 14));

      // Advance visual crank angle (slowed down visually at high RPM so motion stays readable)
      const visualDegStep = (Math.min(st.rpm, 2800) / 60) * 360 * dt * 0.45;
      st.crankDeg = (st.crankDeg + visualDegStep) % 720;

      // Feed live audio synthesizer
      if (soundCtrlRef.current?.isRunning()) {
        soundCtrlRef.current.updateState(st.rpm, st.throttle);
      }

      // Update React HUD at ~15Hz (only when values actually change)
      uiSyncCounter++;
      if (uiSyncCounter % 4 === 0) {
        const nextRpm = Math.round(st.rpm);
        const nextBoost = Number(st.boost.toFixed(2));
        if (nextRpm !== lastUiRpm) {
          lastUiRpm = nextRpm;
          setLiveRpm(nextRpm);
        }
        if (st.gear !== lastUiGear) {
          lastUiGear = st.gear;
          setLiveGear(st.gear);
        }
        if (nextBoost !== lastUiBoost) {
          lastUiBoost = nextBoost;
          setLiveBoost(nextBoost);
        }
      }

      // 1. Draw Piston / Rotary Cutaway Animation
      const pCanvas = pistonCanvasRef.current;
      if (pCanvas) {
        const ctx = pCanvas.getContext('2d');
        if (ctx) {
          drawEngineCutaway(ctx, pCanvas.width, pCanvas.height, cfg, res, st.crankDeg, st.throttle);
        }
      }

      // 2. Draw Live Audio Oscilloscope & FFT Spectrum (skip redundant static placeholder redraws when idle)
      const sCanvas = scopeCanvasRef.current;
      if (sCanvas) {
        const activeAnalyser = soundCtrlRef.current?.analyser ?? null;
        if (activeAnalyser || !scopePlaceholderDrawn) {
          const ctx = sCanvas.getContext('2d');
          if (ctx) {
            drawAudioScope(ctx, sCanvas.width, sCanvas.height, activeAnalyser, st.rpm, cfg.redlineRpm);
            scopePlaceholderDrawn = !activeAnalyser;
          }
        }
      }
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const handleToggleAudio = async () => {
    if (audioRunning) {
      soundCtrlRef.current?.stop();
      setAudioRunning(false);
    } else {
      try {
        if (!soundCtrlRef.current) {
          soundCtrlRef.current = new EngineSoundController();
        }
        await soundCtrlRef.current.start(config, simResult, soundSettings);
        soundCtrlRef.current.updateState(simStateRef.current.rpm, simStateRef.current.throttle);
        setAudioRunning(true);
      } catch (err) {
        onToast(`オーディオ起動エラー: ${err instanceof Error ? err.message : String(err)}`, 'error');
      }
    }
  };

  const handleApplyEngineToCar = () => {
    const nextFiles = applyEngineSimToCarFiles(config, simResult, files);
    onReplaceAllFiles(
      nextFiles,
      `シミュレートしたエンジン「${config.name}」(${Math.round(simResult.peakPowerPs)} PS / ${Math.round(simResult.peakTorqueNm)} Nm) を車両データへ反映しました`
    );
  };

  const handleExportSoundToCar = async () => {
    setExportingSound(true);
    try {
      // Allow UI to render loading state before offline PCM synthesis
      await new Promise((r) => setTimeout(r, 30));
      const payload = buildEngineSoundExportPayload(config, simResult, soundSettings);
      const res = await window.acApi.exportEngineSoundPack(carsDir, carId, payload);
      if (res.ok) {
        onToast(res.message, 'success');
      } else {
        onToast(res.message, 'error');
      }
    } catch (err) {
      onToast(`サウンド書き出しエラー: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setExportingSound(false);
    }
  };

  const handleRestoreStockSound = async () => {
    const res = await window.acApi.removeCustomEngineSound(carsDir, carId);
    onToast(res.message, res.ok ? 'info' : 'error');
  };

  const handleCopyDonorBank = async () => {
    if (!donorBankCarId) return;
    const res = await window.acApi.copySoundBankFromCar(carsDir, carId, donorBankCarId);
    onToast(res.message, res.ok ? 'success' : 'error');
  };

  const commitSimEdit = useCallback(
    (
      nextCfg: EngineSimConfig,
      nextSnd: EngineSoundSettings,
      label: string,
      coalesceKey?: string
    ) => {
      const before: EngineSimSnapshot = {
        config: { ...configRef.current },
        soundSettings: { ...soundSettingsRef.current },
      };
      const after: EngineSimSnapshot = {
        config: { ...nextCfg },
        soundSettings: { ...nextSnd },
      };
      historyRef.current.push(
        { before, after },
        {
          label,
          coalesceKey,
          mergeCoalesced: (existing, incoming) => ({
            before: existing.before,
            after: incoming.after,
          }),
        }
      );
      configRef.current = after.config;
      soundSettingsRef.current = after.soundSettings;
      setConfig(after.config);
      setSoundSettings(after.soundSettings);
      setHistoryTick((t) => t + 1);
    },
    []
  );

  const handleUndoSim = useCallback(() => {
    const rec = historyRef.current.undo();
    if (!rec) return;
    isRestoringHistoryRef.current = true;
    configRef.current = { ...rec.value.before.config };
    soundSettingsRef.current = { ...rec.value.before.soundSettings };
    setConfig({ ...rec.value.before.config });
    setSoundSettings({ ...rec.value.before.soundSettings });
    setHistoryTick((t) => t + 1);
    onToast(`元に戻しました${rec.label ? ` (${rec.label})` : ''}`, 'info');
  }, [onToast]);

  const handleRedoSim = useCallback(() => {
    const rec = historyRef.current.redo();
    if (!rec) return;
    isRestoringHistoryRef.current = true;
    configRef.current = { ...rec.value.after.config };
    soundSettingsRef.current = { ...rec.value.after.soundSettings };
    setConfig({ ...rec.value.after.config });
    setSoundSettings({ ...rec.value.after.soundSettings });
    setHistoryTick((t) => t + 1);
    onToast(`やり直しました${rec.label ? ` (${rec.label})` : ''}`, 'info');
  }, [onToast]);

  useEffect(() => {
    if (!onRegisterUndoRedo) return;
    void historyTick;
    onRegisterUndoRedo({
      undo: handleUndoSim,
      redo: handleRedoSim,
      canUndo: historyRef.current.canUndo,
      canRedo: historyRef.current.canRedo,
      undoCount: historyRef.current.undoCount,
      redoCount: historyRef.current.redoCount,
      undoLabel: historyRef.current.undoLabel,
      redoLabel: historyRef.current.redoLabel,
    });
  }, [onRegisterUndoRedo, handleUndoSim, handleRedoSim, historyTick]);

  useEffect(() => {
    return () => {
      onRegisterUndoRedo?.(null);
    };
  }, [onRegisterUndoRedo]);

  const updateCfg = <K extends keyof EngineSimConfig>(key: K, val: EngineSimConfig[K]) => {
    commitSimEdit(
      { ...configRef.current, [key]: val },
      soundSettingsRef.current,
      `エンジン設定 (${String(key)})`,
      `cfg:${String(key)}`
    );
  };

  const updateSound = <K extends keyof EngineSoundSettings>(key: K, val: EngineSoundSettings[K]) => {
    commitSimEdit(
      configRef.current,
      { ...soundSettingsRef.current, [key]: val },
      `音響設定 (${String(key)})`,
      `snd:${String(key)}`
    );
  };

  const handleSelectLayout = (layout: EngineLayout) => {
    const meta = LAYOUT_OPTIONS.find((o) => o.value === layout);
    if (!meta) return;
    const prev = configRef.current;
    commitSimEdit(
      {
        ...prev,
        layout,
        cylinders: meta.cyls,
        bankAngleDeg: meta.bank,
        headerType:
          layout === 'B4' ? 'UEL_BOXER' : layout === 'V8_CROSS' ? 'UEL_MUSCLE' : prev.headerType,
      },
      soundSettingsRef.current,
      `エンジン形式 (${meta.label})`
    );
  };

  const rpmPct = Math.min(100, Math.max(0, (liveRpm / Math.max(1000, config.redlineRpm)) * 100));

  return (
    <div className="space-y-5">
      {/* Preset Engine Quick Picker */}
      <div className="bg-[#121722] border border-[#242e42] rounded-xl p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-rose-400" />
            <h3 className="text-sm font-semibold text-slate-100">
              物理エンジンシミュレーター &amp; engine-sim 音響スタジオ
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleApplyEngineToCar}
              className="flex items-center gap-1.5 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white text-xs font-semibold px-3.5 py-1.5 rounded-lg shadow-md shadow-rose-600/20"
            >
              <Zap className="w-3.5 h-3.5" />
              このエンジン性能を車両へ反映
            </button>
            <button
              onClick={handleExportSoundToCar}
              disabled={exportingSound}
              className="flex items-center gap-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-semibold px-3.5 py-1.5 rounded-lg shadow-md shadow-cyan-600/20"
              title="車外3D・車内NVH・BOV・アフターファイアWAVとCSP Lua音響ランタイムを書き出し、Assetto Corsa実機へ直接反映します"
            >
              <Download className="w-3.5 h-3.5" />
              {exportingSound ? '車外/車内 WAV & CSP Lua生成中...' : 'ACにエンジン音を反映 (CSP書き出し)'}
            </button>
            <button
              onClick={handleRestoreStockSound}
              disabled={exportingSound}
              className="flex items-center gap-1 bg-[#182132] hover:bg-[#233048] disabled:opacity-50 text-slate-300 border border-[#2c3954] text-xs px-2.5 py-1.5 rounded-lg"
              title="書き出したカスタム音スクリプトを解除し、車両本来のFMOD .bankサウンドへ戻します"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              元の音に戻す
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {ENGINE_SIM_PRESETS.map((p) => {
            const active = p.id === config.id;
            return (
              <button
                key={p.id}
                onClick={() => {
                  simStateRef.current.rpm = p.idleRpm;
                  const prev = soundSettingsRef.current;
                  commitSimEdit(
                    { ...p },
                    {
                      ...prev,
                      crossoverType:
                        p.layout === 'V8_CROSS'
                          ? 'H_PIPE'
                          : p.layout === 'V8_FLAT' || p.layout === 'V10' || p.layout === 'V12'
                            ? 'X_PIPE'
                            : p.layout === 'B4'
                              ? 'DUAL_SEPARATE'
                              : 'SINGLE_MERGE',
                      intakeType:
                        p.id === 'i4_vtec_20' || p.id === 'rotary_4r_787'
                          ? 'ITB_INDIVIDUAL'
                          : p.layout === 'V10' || p.layout === 'V12' || p.layout === 'V8_FLAT'
                            ? 'CARBON_PLENUM'
                            : p.aspiration !== 'NA'
                              ? 'CONE_FILTER'
                              : 'CARBON_PLENUM',
                      mufflerType:
                        p.layout === 'V10' || p.layout === 'V12' || p.id === 'rotary_4r_787'
                          ? 'TITANIUM'
                          : p.layout === 'V8_CROSS'
                            ? 'SPORT'
                            : prev.mufflerType,
                      metallicRinging:
                        p.layout === 'V10' || p.layout === 'V12' || p.layout === 'V8_FLAT' || p.id === 'i4_vtec_20'
                          ? 0.95
                          : 0.68,
                    },
                    `プリセット: ${p.name}`
                  );
                }}
                className={`px-2.5 py-1 rounded-lg border text-[11px] transition-colors ${
                  active
                    ? 'bg-rose-500/20 border-rose-500 text-rose-200 font-semibold'
                    : 'bg-[#0b0e14] border-[#242e42] text-slate-400 hover:text-slate-200 hover:border-[#394867]'
                }`}
              >
                {p.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Live Engine-Sim Console: Cutaway + Scope + Throttle/Sound Controls */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Piston / Rotary Cutaway */}
        <div className="xl:col-span-4 bg-[#121722] border border-[#242e42] rounded-xl p-3 flex flex-col">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-semibold text-slate-200">リアルタイム機関断面モデル</span>
            <span className="font-mono-num text-amber-300">
              {simResult.displacementCc} cc ({config.layout})
            </span>
          </div>
          <canvas
            ref={pistonCanvasRef}
            width={380}
            height={220}
            className="w-full h-[220px] bg-[#080b10] border border-[#1d2538] rounded-lg"
          />
          <div className="grid grid-cols-3 gap-2 mt-2.5 text-[11px] font-mono-num">
            <div className="bg-[#0b0e14] border border-[#20293d] rounded-lg p-2 text-center">
              <div className="text-slate-500 text-[10px]">最大出力</div>
              <div className="text-rose-400 font-bold text-sm">{Math.round(simResult.peakPowerPs)} PS</div>
            </div>
            <div className="bg-[#0b0e14] border border-[#20293d] rounded-lg p-2 text-center">
              <div className="text-slate-500 text-[10px]">最大トルク</div>
              <div className="text-amber-400 font-bold text-sm">{Math.round(simResult.peakTorqueNm)} Nm</div>
            </div>
            <div className="bg-[#0b0e14] border border-[#20293d] rounded-lg p-2 text-center">
              <div className="text-slate-500 text-[10px]">ピストン速度</div>
              <div className="text-cyan-300 font-bold text-sm">{simResult.meanPistonSpeedAtRedlineMs} m/s</div>
            </div>
          </div>
        </div>

        {/* Live Tachometer + Audio Waveform/Spectrum */}
        <div className="xl:col-span-4 bg-[#121722] border border-[#242e42] rounded-xl p-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs mb-2">
              <div className="flex items-center gap-1.5">
                <Waves className="w-4 h-4 text-cyan-400" />
                <span className="font-semibold text-slate-200">排気波形 &amp; FFTスペクトラム</span>
              </div>
              <span className="font-mono-num text-[11px] text-slate-400">
                {audioRunning ? 'AUDIO LIVE' : 'STANDBY'}
              </span>
            </div>
            <canvas
              ref={scopeCanvasRef}
              width={380}
              height={160}
              className="w-full h-[160px] bg-[#080b10] border border-[#1d2538] rounded-lg"
            />
          </div>

          {/* Digital RPM Bar */}
          <div className="mt-3 space-y-2">
            <div className="flex items-baseline justify-between font-mono-num">
              <div>
                <span className="text-2xl font-bold text-slate-100">{liveRpm}</span>
                <span className="text-xs text-slate-400 ml-1">RPM</span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-cyan-300">Boost: {liveBoost.toFixed(2)} bar</span>
                <span className="px-2 py-0.5 rounded bg-[#0b0e14] border border-[#2b354b] text-amber-300 font-bold">
                  {liveGear === 0 ? 'N' : `${liveGear}速`}
                </span>
              </div>
            </div>
            <div className="h-3 bg-[#080b10] border border-[#1f283b] rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-75 ${
                  rpmPct > 88
                    ? 'bg-gradient-to-r from-amber-500 via-rose-500 to-red-500'
                    : 'bg-gradient-to-r from-emerald-500 via-cyan-400 to-amber-400'
                }`}
                style={{ width: `${rpmPct}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] font-mono-num text-slate-500">
              <span>IDLE {config.idleRpm}</span>
              <span>VE PEAK {simResult.helmholtzPeakRpm}</span>
              <span className="text-rose-400">REDLINE {config.redlineRpm}</span>
            </div>
          </div>
        </div>

        {/* Live Sound Transport & Throttle Controls */}
        <div className="xl:col-span-4 bg-[#121722] border border-[#242e42] rounded-xl p-3.5 flex flex-col justify-between text-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-semibold text-slate-100">
              <Volume2 className="w-4 h-4 text-emerald-400" />
              エンジンサウンド操作盤
            </div>
            <button
              onClick={handleToggleAudio}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg font-bold transition-all ${
                audioRunning
                  ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/25'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/25'
              }`}
            >
              {audioRunning ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {audioRunning ? 'エンジン停止' : 'エンジン始動 (音再生)'}
            </button>
          </div>

          {/* Demo Drive Modes */}
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">テスト運転モード</label>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  ['free', 'フリー空吹かし'],
                  ['dyno', '全開ダイノ計測'],
                  ['track', 'シフト加速デモ'],
                ] as Array<[DriveDemoMode, string]>
              ).map(([m, label]) => (
                <button
                  key={m}
                  onClick={() => {
                    setDemoMode(m);
                    simStateRef.current.demoTime = 0;
                    simStateRef.current.gear = m === 'track' ? 1 : 0;
                  }}
                  className={`py-1.5 rounded-lg border text-[11px] transition-colors ${
                    demoMode === m
                      ? 'bg-cyan-500/20 border-cyan-500 text-cyan-200 font-semibold'
                      : 'bg-[#0b0e14] border-[#252e42] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Throttle Pedal & Slider */}
          <div className="space-y-2">
            <button
              onMouseDown={() => {
                setDemoMode('free');
                setPedalHeld(true);
              }}
              onMouseUp={() => setPedalHeld(false)}
              onMouseLeave={() => setPedalHeld(false)}
              className={`w-full py-3 rounded-xl font-bold text-sm border transition-all select-none ${
                pedalHeld
                  ? 'bg-gradient-to-r from-rose-600 to-amber-500 border-rose-400 text-white scale-[0.99]'
                  : 'bg-[#1a2233] hover:bg-[#232f47] border-[#303e5c] text-slate-100'
              }`}
            >
              {pedalHeld ? 'FULL THROTTLE (WOT)!' : 'アクセル全開 (長押し / Spaceキー)'}
            </button>

            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400 shrink-0">スロットル開度:</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={pedalHeld ? 1 : manualThrottle}
                onChange={(e) => {
                  setDemoMode('free');
                  setManualThrottle(Number(e.target.value));
                }}
                className="flex-1 h-1.5"
              />
              <span className="font-mono-num text-rose-300 w-10 text-right">
                {Math.round((pedalHeld ? 1 : manualThrottle) * 100)}%
              </span>
            </div>
          </div>

          {/* Master volume + Donor Bank Copy */}
          <div className="pt-2 border-t border-[#222b3e] space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400 shrink-0">マスター音量:</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={soundSettings.masterVolume}
                onChange={(e) => updateSound('masterVolume', Number(e.target.value))}
                className="flex-1 h-1.5 accent-emerald-400"
              />
              <span className="font-mono-num text-slate-300 w-10 text-right">
                {Math.round(soundSettings.masterVolume * 100)}%
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <select
                value={donorBankCarId}
                onChange={(e) => setDonorBankCarId(e.target.value)}
                className="flex-1 min-w-0 bg-[#0b0e14] border border-[#2b354b] rounded-lg px-2 py-1 text-[11px] text-slate-300"
              >
                <option value="">他車のFMOD .bankをベース移植...</option>
                {cars
                  .filter((c) => c.id !== carId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
              <button
                onClick={handleCopyDonorBank}
                disabled={!donorBankCarId}
                className="bg-[#1b2436] hover:bg-[#26324c] disabled:opacity-40 text-amber-300 border border-amber-500/30 px-2.5 py-1 rounded-lg text-[11px] shrink-0"
              >
                .bank移植
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Simulated Dyno vs Current Car Dyno */}
      <div className="bg-[#121722] border border-[#242e42] rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-rose-400" />
            <h3 className="text-sm font-semibold text-slate-100">
              シミュレート出力曲線 vs 現在の車両エンジン比較
            </h3>
          </div>
          <div className="flex flex-wrap gap-3 text-xs font-mono-num text-slate-400">
            <span>熱効率: <strong className="text-emerald-300">{simResult.thermalEfficiencyPct}%</strong></span>
            <span>最大VE: <strong className="text-cyan-300">{simResult.peakVePct}%</strong></span>
            <span>ボア/ストローク比: <strong className="text-slate-200">{simResult.boreStrokeRatio}</strong></span>
            <span>推定慣性: <strong className="text-amber-300">{simResult.estimatedInertiaKgM2} kg·m²</strong></span>
          </div>
        </div>
        <DynoChart
          curve={simResult.dynoCurve}
          compareCurve={currentCarMetrics.dynoCurve}
          compareLabel="現在の車両"
          height={250}
        />
      </div>

      {/* Bottom 2-Column Detailed Designers: Engine Physics & Acoustic Sound (Both support In-App Floating & Separate OS Window) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Engine Physics Designer */}
        <DetachablePanel
          panelId="enginesim_physics_designer"
          title="エンジン物理設計パラメータ"
          subtitle={`${config.name} (${simResult.displacementCc}cc)`}
          role="settings"
          dockedClassName="bg-[#121722] border border-[#242e42] rounded-xl overflow-hidden"
          popoutSize={{ width: 580, height: 780 }}
        >
          <div className="p-4 space-y-3 overflow-y-auto flex-1">
          <div className="flex items-center gap-2 border-b border-[#222b3e] pb-2">
            <Flame className="w-4 h-4 text-rose-400" />
            <h3 className="text-sm font-semibold text-slate-100">エンジン物理設計パラメータ</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
            <div>
              <label className="text-slate-400 block mb-1">気筒レイアウト・クランク位相</label>
              <select
                value={config.layout}
                onChange={(e) => handleSelectLayout(e.target.value as EngineLayout)}
                className="w-full bg-[#0b0e14] border border-[#2b354b] rounded-lg px-2.5 py-2 text-slate-100"
              >
                {LAYOUT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-slate-400 block mb-1">過給方式 (Aspiration)</label>
              <select
                value={config.aspiration}
                onChange={(e) => {
                  const asp = e.target.value as AspirationType;
                  const prev = configRef.current;
                  commitSimEdit(
                    {
                      ...prev,
                      aspiration: asp,
                      maxBoostBar: asp === 'NA' ? 0 : Math.max(0.7, prev.maxBoostBar),
                    },
                    soundSettingsRef.current,
                    `過給方式 (${asp})`
                  );
                }}
                className="w-full bg-[#0b0e14] border border-[#2b354b] rounded-lg px-2.5 py-2 text-slate-100"
              >
                <option value="NA">自然吸気 (NA)</option>
                <option value="SINGLE_TURBO">シングルターボ</option>
                <option value="TWIN_TURBO">ツインターボ</option>
                <option value="SUPERCHARGER">スーパーチャージャー</option>
              </select>
            </div>
            <div>
              <label className="text-slate-400 block mb-1">エキゾーストマニホールド形式</label>
              <select
                value={config.headerType}
                onChange={(e) => updateCfg('headerType', e.target.value as HeaderType)}
                className="w-full bg-[#0b0e14] border border-[#2b354b] rounded-lg px-2.5 py-2 text-slate-100"
              >
                <option value="EQUAL">等長ヘッダー (澄んだ倍音・高回転)</option>
                <option value="UEL_BOXER">不等長 UEL ボクサー (ドロドロ音)</option>
                <option value="UEL_MUSCLE">不等長 V8 マッスル (重低音ビート)</option>
                <option value="LOG_MANIFOLD">鋳鉄ログマニホールド</option>
              </select>
            </div>
            <div>
              <label className="text-slate-400 block mb-1">燃料種別 (Fuel)</label>
              <select
                value={config.fuelType}
                onChange={(e) => updateCfg('fuelType', e.target.value as FuelType)}
                className="w-full bg-[#0b0e14] border border-[#2b354b] rounded-lg px-2.5 py-2 text-slate-100"
              >
                <option value="RON98">ハイオク RON98</option>
                <option value="RON100">プレミアム RON100</option>
                <option value="E85">エタノール E85 (+出力・高耐ノック)</option>
                <option value="RACE110">レーシングガス 110</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <NumericControl
              label="ボア径 (Bore)"
              value={config.boreMm}
              min={64}
              max={115}
              step={0.5}
              decimals={1}
              unit="mm"
              onChange={(v) => updateCfg('boreMm', v)}
            />
            <NumericControl
              label="ストローク長 (Stroke)"
              value={config.strokeMm}
              min={55}
              max={115}
              step={0.5}
              decimals={1}
              unit="mm"
              onChange={(v) => updateCfg('strokeMm', v)}
            />
            <NumericControl
              label="圧縮比 (Compression Ratio)"
              value={config.compressionRatio}
              min={7.5}
              max={14.5}
              step={0.1}
              decimals={1}
              unit=":1"
              accent="amber"
              onChange={(v) => updateCfg('compressionRatio', v)}
            />
            <NumericControl
              label="レブリミット (Redline)"
              value={config.redlineRpm}
              min={5000}
              max={13000}
              step={100}
              unit="RPM"
              onChange={(v) => updateCfg('redlineRpm', Math.round(v))}
            />
            <NumericControl
              label="カム作用角 (Duration)"
              value={config.intakeCamDurationDeg}
              min={220}
              max={320}
              step={2}
              unit="deg"
              hint="大きいほど高回転型"
              accent="cyan"
              onChange={(v) => updateCfg('intakeCamDurationDeg', Math.round(v))}
            />
            <NumericControl
              label="最大バルブリフト (Lift)"
              value={config.camLiftMm}
              min={8.0}
              max={15.0}
              step={0.1}
              decimals={1}
              unit="mm"
              accent="cyan"
              onChange={(v) => updateCfg('camLiftMm', v)}
            />
            <NumericControl
              label="吸気ランナー長 (Helmholtz)"
              value={config.intakeRunnerLengthMm}
              min={160}
              max={500}
              step={5}
              unit="mm"
              hint={`共鳴ピーク ${simResult.helmholtzPeakRpm} RPM`}
              accent="emerald"
              onChange={(v) => updateCfg('intakeRunnerLengthMm', Math.round(v))}
            />
            <NumericControl
              label="VVT / VTEC 切替回転 (0=無効)"
              value={config.vvtSwitchRpm}
              min={0}
              max={8500}
              step={100}
              unit="RPM"
              accent="emerald"
              onChange={(v) => updateCfg('vvtSwitchRpm', Math.round(v))}
            />
            {config.aspiration !== 'NA' && (
              <>
                <NumericControl
                  label="最大過給圧 (Max Boost)"
                  value={config.maxBoostBar}
                  min={0.2}
                  max={3.0}
                  step={0.05}
                  decimals={2}
                  unit="bar"
                  accent="cyan"
                  onChange={(v) => updateCfg('maxBoostBar', v)}
                />
                <NumericControl
                  label="ターボスプール基準回転"
                  value={config.turboRefRpm}
                  min={2200}
                  max={7500}
                  step={100}
                  unit="RPM"
                  accent="cyan"
                  onChange={(v) => updateCfg('turboRefRpm', Math.round(v))}
                />
              </>
            )}
            <NumericControl
              label="フライホイール質量"
              value={config.flywheelMassKg}
              min={2.5}
              max={15.0}
              step={0.2}
              decimals={1}
              unit="kg"
              hint="軽いほど吹け上がり鋭い"
              accent="amber"
              onChange={(v) => updateCfg('flywheelMassKg', v)}
            />
            <NumericControl
              label="点火時期進角 (Timing)"
              value={config.ignitionAdvanceDeg}
              min={14}
              max={40}
              step={1}
              unit="deg"
              onChange={(v) => updateCfg('ignitionAdvanceDeg', Math.round(v))}
            />
          </div>
          </div>
        </DetachablePanel>

        {/* Acoustic Sound Synthesizer Designer (engine-sim v4 rebuild) */}
        <DetachablePanel
          panelId="enginesim_acoustic_designer"
          title="物理音響設計（吸気・金属駆動音・排気干渉・車内NVH）"
          subtitle="engine-sim v4 Physical DSP"
          role="settings"
          dockedClassName="bg-[#121722] border border-[#242e42] rounded-xl overflow-hidden"
          popoutSize={{ width: 620, height: 840 }}
        >
          <div className="p-4 space-y-4 overflow-y-auto flex-1">
          <div className="flex items-center justify-between border-b border-[#222b3e] pb-2">
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-slate-100">
                物理音響設計（吸気・金属音・排気干渉・IR）
              </h3>
            </div>
            <span className="text-[10px] font-mono-num text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded">
              engine-sim v4 Physical DSP
            </span>
          </div>

          {/* 1. Exhaust Interference & Waveguide */}
          <div className="space-y-2.5">
            <div className="text-[11px] font-semibold text-rose-300 uppercase tracking-wider">
              1. 排気干渉 &amp; エキゾースト・ウェーブガイド
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">集合・クロスオーバー干渉方式</label>
                <select
                  value={soundSettings.crossoverType}
                  onChange={(e) => updateSound('crossoverType', e.target.value as ExhaustCrossoverType)}
                  className="w-full bg-[#0b0e14] border border-[#2b354b] rounded-lg px-2.5 py-2 text-slate-100"
                >
                  <option value="X_PIPE">Xパイプ交差干渉 (高回転スクリーム・澄んだ和音)</option>
                  <option value="H_PIPE">Hパイプ連結干渉 (図太い低域ビート・マッスル)</option>
                  <option value="SINGLE_MERGE">1本集合コレクター (直列/4-1/6-1 強い倍音統合)</option>
                  <option value="DUAL_SEPARATE">左右バンク完全独立デュアル (立体ステレオ排気)</option>
                </select>
              </div>
              <div>
                <label className="text-slate-400 block mb-1">マフラー / 管材質特性</label>
                <select
                  value={soundSettings.mufflerType}
                  onChange={(e) => {
                    const mType = e.target.value as ExhaustMufflerType;
                    const defaultMass =
                      mType === 'STRAIGHT' ? 7 : mType === 'TITANIUM' ? 9 : mType === 'SPORT' ? 16 : 24;
                    commitSimEdit(
                      configRef.current,
                      { ...soundSettingsRef.current, mufflerType: mType, mufflerMassKg: defaultMass },
                      `マフラー特性 (${mType})`
                    );
                  }}
                  className="w-full bg-[#0b0e14] border border-[#2b354b] rounded-lg px-2.5 py-2 text-slate-100"
                >
                  <option value="STRAIGHT">競技用フル直管 (軽量・爆音・超高倍音)</option>
                  <option value="TITANIUM">チタンレーシング (薄肉軽量・乾いた響き)</option>
                  <option value="SPORT">スポーツマフラー (中量級・重低音＆バランス)</option>
                  <option value="STREET">純正ストリートサイレンサー (重量スチール・重厚)</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <NumericControl
                label="気筒間 排気干渉強度"
                value={Math.round(soundSettings.interferenceStrength * 100)}
                min={0}
                max={150}
                step={5}
                unit="%"
                hint="コレクター脈動衝突・逆圧干渉"
                onChange={(v) => updateSound('interferenceStrength', v / 100)}
              />
              <NumericControl
                label="排気割れ / ラスプ感 (Rasp)"
                value={Math.round(soundSettings.exhaustRasp * 100)}
                min={0}
                max={150}
                step={5}
                unit="%"
                hint="高流速時の非線形ショック波急峻化"
                accent="amber"
                onChange={(v) => updateSound('exhaustRasp', v / 100)}
              />
              <NumericControl
                label="エキゾースト管全長"
                value={soundSettings.exhaustLengthM}
                min={1.2}
                max={4.5}
                step={0.05}
                decimals={2}
                unit="m"
                hint="定在波の共鳴ピッチが変化"
                accent="cyan"
                onChange={(v) => updateSound('exhaustLengthM', v)}
              />
              <NumericControl
                label="エキゾースト排気音量"
                value={Math.round(soundSettings.exhaustLevel * 100)}
                min={0}
                max={150}
                step={5}
                unit="%"
                onChange={(v) => updateSound('exhaustLevel', v / 100)}
              />
            </div>
          </div>

          {/* 2. Muffler Shake, Internal Cavity Resonance & Physical Mass Acoustics */}
          <div className="space-y-2.5 pt-2 border-t border-[#1e2739]">
            <div className="text-[11px] font-semibold text-fuchsia-300 uppercase tracking-wider">
              2. マフラー低音揺れ (ドコドコ感)・内部共鳴 &amp; 質量音響
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <NumericControl
                label="マフラー低音揺れ (ドコドコ感)"
                value={Math.round(soundSettings.mufflerShakeLevel * 100)}
                min={0}
                max={180}
                step={5}
                unit="%"
                hint="マフラー本体の質量バネ振動・低回転の空気の揺れ"
                accent="rose"
                onChange={(v) => updateSound('mufflerShakeLevel', v / 100)}
              />
              <NumericControl
                label="マフラー内部・車内共鳴感"
                value={Math.round(soundSettings.internalResonance * 100)}
                min={0}
                max={180}
                step={5}
                unit="%"
                hint="タイコ内部の空洞反射・こもり音・フロア共鳴"
                accent="amber"
                onChange={(v) => updateSound('internalResonance', v / 100)}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <NumericControl
                label="車体質量 (Chassis)"
                value={soundSettings.chassisMassKg}
                min={700}
                max={2200}
                step={25}
                unit="kg"
                hint={
                  soundSettings.chassisMassKg < 1050
                    ? '軽量カーボン: 振動直達・高い箱鳴り'
                    : soundSettings.chassisMassKg > 1600
                      ? '重量級スチール: 重厚な低音＆遮音'
                      : '標準スポーツボディ共鳴'
                }
                accent="cyan"
                onChange={(v) => updateSound('chassisMassKg', Math.round(v))}
              />
              <NumericControl
                label="エンジン質量 (Block)"
                value={soundSettings.engineMassKg}
                min={80}
                max={320}
                step={5}
                unit="kg"
                hint={
                  soundSettings.engineMassKg < 135
                    ? '軽量アルミ: 鋭いメカ音＆軽快'
                    : soundSettings.engineMassKg > 215
                      ? '重厚鋳鉄: 深いブロック打撃＆低域'
                      : '標準ブロック剛性バランス'
                }
                accent="amber"
                onChange={(v) => updateSound('engineMassKg', Math.round(v))}
              />
              <NumericControl
                label="マフラー質量 (Exhaust)"
                value={soundSettings.mufflerMassKg}
                min={4}
                max={30}
                step={1}
                unit="kg"
                hint={
                  soundSettings.mufflerMassKg <= 9
                    ? '超軽量チタン: 乾いた高応答＆高揺れ'
                    : soundSettings.mufflerMassKg >= 20
                      ? '重量スチール: 34Hz極低音ドコドコ'
                      : 'スポーツステン共鳴バランス'
                }
                accent="rose"
                onChange={(v) => updateSound('mufflerMassKg', Math.round(v))}
              />
            </div>
          </div>

          {/* 3. Intake Induction System */}
          <div className="space-y-2.5 pt-2 border-t border-[#1e2739]">
            <div className="text-[11px] font-semibold text-emerald-300 uppercase tracking-wider">
              3. インテーク吸気システム（プレナム共鳴・スロットル急開）
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div className="sm:col-span-2">
                <label className="text-slate-400 block mb-1">インテーク構造タイプ</label>
                <select
                  value={soundSettings.intakeType}
                  onChange={(e) => updateSound('intakeType', e.target.value as IntakeSystemType)}
                  className="w-full bg-[#0b0e14] border border-[#2b354b] rounded-lg px-2.5 py-2 text-slate-100"
                >
                  <option value="ITB_INDIVIDUAL">4スロ / 独立多連スロットル ITB (ダイレクトな咆哮・最高レスポンス)</option>
                  <option value="CARBON_PLENUM">カーボンエアボックス (CSL / GT3系 図太いヘルムホルツ箱鳴り)</option>
                  <option value="CONE_FILTER">剥き出しキノコ型エアクリーナー (強烈な吸入気流＆急開スパイク)</option>
                  <option value="STOCK_AIRBOX">純正レゾネーター付きエアボックス (控えめ・低域寄り)</option>
                </select>
              </div>
              <NumericControl
                label="インテーク吸気音量"
                value={Math.round(soundSettings.intakeLevel * 100)}
                min={0}
                max={180}
                step={5}
                unit="%"
                accent="emerald"
                onChange={(v) => updateSound('intakeLevel', v / 100)}
              />
              <NumericControl
                label="プレナム共鳴の鋭さ (Helmholtz Q)"
                value={Math.round(soundSettings.intakeResonance * 100)}
                min={30}
                max={180}
                step={5}
                unit="%"
                hint="高いほど吸気の箱鳴りが際立つ"
                accent="emerald"
                onChange={(v) => updateSound('intakeResonance', v / 100)}
              />
            </div>
          </div>

          {/* 4. Engine Metallic & Mechanical Sound */}
          <div className="space-y-2.5 pt-2 border-t border-[#1e2739]">
            <div className="text-[11px] font-semibold text-amber-300 uppercase tracking-wider">
              4. エンジン金属音 &amp; メカニカル駆動音
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <NumericControl
                label="エンジン駆動音・メカ音"
                value={Math.round(soundSettings.mechanicalLevel * 100)}
                min={0}
                max={180}
                step={5}
                unit="%"
                hint="ピストン・動弁タペット・チェーン・インジェクター駆動音"
                accent="amber"
                onChange={(v) => updateSound('mechanicalLevel', v / 100)}
              />
              <NumericControl
                label="ブロック/エキマニ金属鳴り"
                value={Math.round(soundSettings.metallicRinging * 100)}
                min={0}
                max={150}
                step={5}
                unit="%"
                hint="4モード金属共振リンギング"
                accent="amber"
                onChange={(v) => updateSound('metallicRinging', v / 100)}
              />
              <NumericControl
                label="ストレートギア鳴り"
                value={Math.round(soundSettings.gearWhineLevel * 100)}
                min={0}
                max={120}
                step={5}
                unit="%"
                hint="ドグミッション / カムギア"
                accent="cyan"
                onChange={(v) => updateSound('gearWhineLevel', v / 100)}
              />
            </div>
          </div>

          {/* 5. Forced Induction, Overrun, Interior NVH & IR Room */}
          <div className="space-y-2.5 pt-2 border-t border-[#1e2739]">
            <div className="text-[11px] font-semibold text-cyan-300 uppercase tracking-wider">
              5. 過給・アフターファイア・聴取環境 &amp; 車内防音/断熱 NVH
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">聴取ポジション / 音響空間 IR</label>
                <select
                  value={soundSettings.roomType}
                  onChange={(e) => updateSound('roomType', e.target.value as AcousticRoomType)}
                  className="w-full bg-[#0b0e14] border border-[#2b354b] rounded-lg px-2.5 py-2 text-slate-100"
                >
                  <option value="DYNO_GARAGE">車外: ダイナモ測定室 / ガレージ</option>
                  <option value="TRACK_OUTSIDE">車外: サーキット屋外マイク</option>
                  <option value="COCKPIT">車内: コックピット (防音材・断熱材・車室共鳴)</option>
                  <option value="TUNNEL">車外: 高速道路トンネル大反響</option>
                </select>
              </div>
              <NumericControl
                label="IRコンボリューション量 (Wet)"
                value={Math.round(soundSettings.convolutionMix * 100)}
                min={0}
                max={85}
                step={1}
                unit="%"
                accent="cyan"
                onChange={(v) => updateSound('convolutionMix', v / 100)}
              />
            </div>

            {/* Interior Cabin Soundproofing & Thermal Insulation NVH Panel */}
            <div
              className={`rounded-xl border p-3 space-y-2.5 transition-colors ${
                soundSettings.roomType === 'COCKPIT'
                  ? 'bg-cyan-500/8 border-cyan-500/45'
                  : 'bg-[#0b0e14] border-[#212b3f]'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <span className="font-semibold text-cyan-200">
                  車内 NVH 音響（防音材・断熱グラスウール・制振シート・バルクヘッド遮音）
                </span>
                {soundSettings.roomType !== 'COCKPIT' ? (
                  <button
                    onClick={() => updateSound('roomType', 'COCKPIT')}
                    className="bg-cyan-600/30 hover:bg-cyan-600/50 border border-cyan-400/50 text-cyan-100 px-2.5 py-0.5 rounded-lg font-medium"
                  >
                    車内コックピット音に切替
                  </button>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 font-semibold">
                    車内NVH 有効中
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5 text-[10px]">
                {(
                  [
                    ['ドンガラ競技車 (防音なし)', 0.05, 0.35],
                    ['スポーツカー純正 (標準防音断熱)', 0.58, 0.85],
                    ['高級GT / 静粛仕様 (極厚断熱・二重ガラス)', 0.95, 1.35],
                  ] as const
                ).map(([lbl, insVal, fwVal]) => (
                  <button
                    key={lbl}
                    onClick={() =>
                      commitSimEdit(
                        configRef.current,
                        {
                          ...soundSettingsRef.current,
                          roomType: 'COCKPIT',
                          cabinInsulation: insVal,
                          firewallThickness: fwVal,
                        },
                        `車内防音プリセット (${lbl})`
                      )
                    }
                    className="bg-[#131b2c] hover:bg-[#1e2a42] border border-[#293652] text-slate-200 px-2 py-1 rounded-lg"
                  >
                    {lbl}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <NumericControl
                  label="防音材・断熱材 (吸音/制振)"
                  value={Math.round(soundSettings.cabinInsulation * 100)}
                  min={0}
                  max={100}
                  step={2}
                  unit="%"
                  hint="多孔質フェルト/グラスウールが高域を吸音し重低音を残す"
                  accent="cyan"
                  onChange={(v) => updateSound('cabinInsulation', v / 100)}
                />
                <NumericControl
                  label="バルクヘッド遮音・ガラス剛性"
                  value={Math.round(soundSettings.firewallThickness * 100)}
                  min={20}
                  max={150}
                  step={5}
                  unit="%"
                  hint="隔壁質量則による空気伝搬音の遮断・リア排気のこもり感"
                  accent="emerald"
                  onChange={(v) => updateSound('firewallThickness', v / 100)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <NumericControl
                label="ターボ過給気流 / SC音"
                value={Math.round(soundSettings.turboWhineLevel * 100)}
                min={0}
                max={150}
                step={5}
                unit="%"
                hint="加圧エア気流＋慣性タービン翼音"
                accent="cyan"
                onChange={(v) => updateSound('turboWhineLevel', v / 100)}
              />
              <NumericControl
                label="ブローオフ / サージ (BOV)"
                value={Math.round(soundSettings.bovFlutterLevel * 100)}
                min={0}
                max={150}
                step={5}
                unit="%"
                accent="amber"
                onChange={(v) => updateSound('bovFlutterLevel', v / 100)}
              />
              <NumericControl
                label="アフターファイア / バブル音"
                value={Math.round(soundSettings.popBangLevel * 100)}
                min={0}
                max={150}
                step={5}
                unit="%"
                accent="rose"
                onChange={(v) => updateSound('popBangLevel', v / 100)}
              />
              <NumericControl
                label="レブリミッター刻み周波数"
                value={soundSettings.revLimiterCutHz}
                min={14}
                max={42}
                step={1}
                unit="Hz"
                accent="amber"
                onChange={(v) => updateSound('revLimiterCutHz', Math.round(v))}
              />
            </div>
          </div>

          <div className="bg-[#0b0e14] border border-[#212a3d] rounded-lg p-3 text-[11px] text-slate-400 leading-relaxed">
            <strong>エクスポート出力内容:</strong> 右上の「ACにエンジン音を反映 (CSP書き出し)」を実行すると、吸気・機械駆動音・排気干渉・車内防音NVHをすべて含んだ24本の 16-bit WAV（車外11＋車内11＋BOV＋アフターファイア）＋ CSP FMODリアルタイム音響スクリプト <code className="text-cyan-300">extension/ac_car_studio_engine_sound.lua</code> ＋ <code className="text-cyan-300">extension/ext_config.ini</code> が自動生成されます。
          </div>
          </div>
        </DetachablePanel>
      </div>
    </div>
  );
};

// ===== Cutaway Canvas Renderer (Piston / V-Engine / Boxer / Wankel Rotary) =====
function drawEngineCutaway(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cfg: EngineSimConfig,
  res: ReturnType<typeof simulateEngine>,
  crankDeg: number,
  throttle: number
) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#080b10';
  ctx.fillRect(0, 0, w, h);

  const isRotary = cfg.layout.startsWith('ROTARY_');
  const cx = w / 2;
  const cy = h * 0.62;

  if (isRotary) {
    // Draw Wankel epitrochoid housing + triangular rotor
    const rOuter = 66;
    const rScale = 44;
    ctx.save();
    ctx.translate(cx, h * 0.5);

    // Epitrochoid housing
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.05; a += 0.05) {
      const x = (rOuter + 12 * Math.cos(2 * a)) * Math.cos(a) * 1.15;
      const y = (rOuter - 12 * Math.cos(2 * a)) * Math.sin(a) * 0.92;
      if (a === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();

    // Combustion glow on right side
    const firePulse = Math.pow(Math.max(0, Math.sin((crankDeg * Math.PI) / 180)), 4);
    if (firePulse > 0.05) {
      const grad = ctx.createRadialGradient(48, 0, 4, 48, 0, 38);
      grad.addColorStop(0, `rgba(251, 146, 60, ${0.35 + firePulse * 0.55 * (0.3 + 0.7 * throttle)})`);
      grad.addColorStop(1, 'rgba(251, 146, 60, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(-90, -80, 180, 160);
    }

    // Eccentric shaft + Triangular rotor (rotates at 1/3 crank speed)
    const crankRad = (crankDeg * Math.PI) / 180;
    const rotorAngle = crankRad / 3;
    const eccX = Math.cos(crankRad) * 9;
    const eccY = Math.sin(crankRad) * 9;

    ctx.save();
    ctx.translate(eccX, eccY);
    ctx.rotate(rotorAngle);
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const a1 = (k * 2 * Math.PI) / 3;
      const a2 = ((k + 1) * 2 * Math.PI) / 3;
      const x1 = Math.cos(a1) * rScale;
      const y1 = Math.sin(a1) * rScale;
      const x2 = Math.cos(a2) * rScale;
      const y2 = Math.sin(a2) * rScale;
      const midA = (a1 + a2) / 2;
      const ctrlX = Math.cos(midA) * (rScale * 0.72);
      const ctrlY = Math.sin(midA) * (rScale * 0.72);
      if (k === 0) ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(ctrlX, ctrlY, x2, y2);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Eccentric gear center
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.restore();
    return;
  }

  // Reciprocating engine: draw 1 or 2 banks depending on bankAngleDeg
  const banks = cfg.bankAngleDeg > 10 ? [-cfg.bankAngleDeg / 2, cfg.bankAngleDeg / 2] : [0];
  const crankR = 26;
  const rodL = 62;

  // Draw cylinder banks
  banks.forEach((bankDeg, bIdx) => {
    const bankRad = (bankDeg * Math.PI) / 180;
    const fireOffset = res.firingAnglesDeg[bIdx % res.firingAnglesDeg.length] ?? 0;
    const localDeg = ((crankDeg - fireOffset) % 720 + 720) % 720;
    const theta = (localDeg * Math.PI) / 180;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(bankRad);

    // Cylinder bore walls
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(-22, -(crankR + rodL + 26), 44, 78);

    // Piston kinematics along local -Y axis
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);
    const pinX = crankR * sinT;
    const pinY = -crankR * cosT;
    const pistonY = pinY - Math.sqrt(Math.max(1, rodL * rodL - pinX * pinX));

    // Combustion chamber flash (power stroke 0..110 deg)
    if (localDeg < 110) {
      const intensity = Math.exp(-localDeg / 38) * (0.35 + 0.65 * throttle);
      const chamberH = Math.max(4, pistonY - -(crankR + rodL + 24));
      ctx.fillStyle = `rgba(249, 115, 22, ${intensity.toFixed(2)})`;
      ctx.fillRect(-20, -(crankR + rodL + 24), 40, chamberH);
    }

    // Intake (360..540) / Exhaust (180..360) valve indicators
    const exOpen = localDeg >= 160 && localDeg <= 360 ? Math.sin(((localDeg - 160) / 200) * Math.PI) * 8 : 0;
    const inOpen = localDeg >= 360 && localDeg <= 550 ? Math.sin(((localDeg - 360) / 190) * Math.PI) * 8 : 0;

    // Intake valve (cyan)
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-10, -(crankR + rodL + 34));
    ctx.lineTo(-10, -(crankR + rodL + 22) + inOpen);
    ctx.stroke();

    // Exhaust valve (rose)
    ctx.strokeStyle = '#f43f5e';
    ctx.beginPath();
    ctx.moveTo(10, -(crankR + rodL + 34));
    ctx.lineTo(10, -(crankR + rodL + 22) + exOpen);
    ctx.stroke();

    // Connecting rod
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(pinX, pinY);
    ctx.lineTo(0, pistonY);
    ctx.stroke();

    // Piston head
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(-19, pistonY - 11, 38, 18);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-19, pistonY - 7, 38, 2);
    ctx.fillRect(-19, pistonY - 3, 38, 2);

    // Crank pin
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(pinX, pinY, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  });

  // Crankshaft main journal
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, crankR + 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#f43f5e';
  ctx.beginPath();
  ctx.arc(cx, cy, 8, 0, Math.PI * 2);
  ctx.fill();

  // Firing order legend strip at bottom
  ctx.fillStyle = '#64748b';
  ctx.font = '10px monospace';
  ctx.fillText(`FIRING: ${res.firingAnglesDeg.length} pulses/720°  HEADER: ${cfg.headerType}`, 10, h - 8);
}

// Reusable scope buffers to avoid 120 typed-array allocations per second at 60fps
let scopeFreqBuf: Uint8Array<ArrayBuffer> | null = null;
let scopeTimeBuf: Uint8Array<ArrayBuffer> | null = null;

// ===== Live Audio Oscilloscope & FFT Spectrum Renderer =====
function drawAudioScope(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  analyser: AnalyserNode | null,
  rpm: number,
  redline: number
) {
  ctx.fillStyle = '#080b10';
  ctx.fillRect(0, 0, w, h);

  // Subtle grid
  ctx.strokeStyle = '#151e2e';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();

  if (!analyser) {
    ctx.fillStyle = '#475569';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('「エンジン始動 (音再生)」を押すと波形が表示されます', w / 2, h / 2 + 4);
    ctx.textAlign = 'start';
    return;
  }

  // FFT bars in background
  if (!scopeFreqBuf || scopeFreqBuf.length !== analyser.frequencyBinCount) {
    scopeFreqBuf = new Uint8Array(analyser.frequencyBinCount);
  }
  const freqData = scopeFreqBuf;
  analyser.getByteFrequencyData(freqData);
  const barCount = 48;
  const barW = w / barCount;
  ctx.fillStyle = rpm > redline * 0.88 ? 'rgba(244, 63, 94, 0.28)' : 'rgba(6, 182, 212, 0.25)';
  for (let i = 0; i < barCount; i++) {
    const val = freqData[i * 3] ?? 0;
    const barH = (val / 255) * (h * 0.78);
    ctx.fillRect(i * barW, h - barH, barW - 1.5, barH);
  }

  // Time-domain waveform foreground
  if (!scopeTimeBuf || scopeTimeBuf.length !== analyser.fftSize) {
    scopeTimeBuf = new Uint8Array(analyser.fftSize);
  }
  const timeData = scopeTimeBuf;
  analyser.getByteTimeDomainData(timeData);
  ctx.strokeStyle = '#f43f5e';
  ctx.lineWidth = 2;
  ctx.beginPath();
  const sliceW = w / timeData.length;
  for (let i = 0; i < timeData.length; i++) {
    const v = timeData[i] / 128.0;
    const y = (v * h) / 2;
    if (i === 0) ctx.moveTo(0, y);
    else ctx.lineTo(i * sliceW, y);
  }
  ctx.stroke();
}
