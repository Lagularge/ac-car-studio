import React, { useMemo, useState } from 'react';
import { Box, Compass, ExternalLink, PictureInPicture2, Sliders } from 'lucide-react';
import type { CarPhysicsMetrics } from '../../types/ac';
import { getIniNumber, setIniValue } from '../../utils/iniHelpers';
import {
  analyzeSuspensionKinematics,
  computeLiveSuspensionPosture,
  extractSuspensionKinematicsInput,
} from '../../utils/suspensionKinematics';
import { NumericControl } from '../ui/NumericControl';
import { SuspensionViewport3D } from '../three/SuspensionViewport3D';
import { SuspensionKinematicsCharts } from '../charts/SuspensionKinematicsCharts';
import { DetachablePanel, type DetachMode } from '../common/DetachablePanel';

interface SuspensionTabProps {
  carsDir: string | null;
  carId: string | null;
  files: Record<string, string>;
  metrics: CarPhysicsMetrics;
  onUpdateFile: (fileName: string, content: string) => void;
}

export const SuspensionTab: React.FC<SuspensionTabProps> = ({
  carsDir,
  carId,
  files,
  metrics,
  onUpdateFile,
}) => {
  const [viewerDetachMode, setViewerDetachMode] = useState<DetachMode>('docked');
  const [settingsDetachMode, setSettingsDetachMode] = useState<DetachMode>('docked');
  const [testLoadFactor, setTestLoadFactor] = useState<number>(1.0);
  const [testLateralG, setTestLateralG] = useState<number>(0.0);

  const suspIni = files['suspensions.ini'] ?? '';
  const carIni = files['car.ini'] ?? '';
  const tyresIni = files['tyres.ini'] ?? '';

  const updateSusp = (section: string, key: string, value: string | number) => {
    onUpdateFile('suspensions.ini', setIniValue(suspIni, section, key, value));
  };
  const updateCar = (section: string, key: string, value: string | number) => {
    onUpdateFile('car.ini', setIniValue(carIni, section, key, value));
  };
  const updateTyres = (section: string, key: string, value: string | number) => {
    onUpdateFile('tyres.ini', setIniValue(tyresIni, section, key, value));
  };

  // Basic & Steering
  const wheelbase = getIniNumber(suspIni, 'BASIC', 'WHEELBASE', 2.6);
  const cgLocation = getIniNumber(suspIni, 'BASIC', 'CG_LOCATION', 0.52);
  const arbFront = getIniNumber(suspIni, 'ARB', 'FRONT', 28000);
  const arbRear = getIniNumber(suspIni, 'ARB', 'REAR', 18000);

  const steerLock = getIniNumber(carIni, 'CONTROLS', 'STEER_LOCK', 450);
  const steerRatio = getIniNumber(carIni, 'CONTROLS', 'STEER_RATIO', 14.5);
  const ffMult = getIniNumber(carIni, 'CONTROLS', 'FFMULT', 2.2);

  // Front
  const fSpring = getIniNumber(suspIni, 'FRONT', 'SPRING_RATE', 65000);
  const fProgSpring = getIniNumber(suspIni, 'FRONT', 'PROG_SPRING_RATE', 0);
  const fBump = getIniNumber(suspIni, 'FRONT', 'DAMP_BUMP', 4200);
  const fReb = getIniNumber(suspIni, 'FRONT', 'DAMP_REBOUND', 6500);
  const fCamber = getIniNumber(suspIni, 'FRONT', 'STATIC_CAMBER', -1.8);
  const fToe = getIniNumber(suspIni, 'FRONT', 'TOE_OUT', 0.0001);
  const fRod = getIniNumber(suspIni, 'FRONT', 'ROD_LENGTH', 0.045);
  const fTrack = getIniNumber(suspIni, 'FRONT', 'TRACK', 1.54);
  const fPacker = getIniNumber(suspIni, 'FRONT', 'PACKER_RANGE', 0.055);

  // Rear
  const rSpring = getIniNumber(suspIni, 'REAR', 'SPRING_RATE', 58000);
  const rProgSpring = getIniNumber(suspIni, 'REAR', 'PROG_SPRING_RATE', 0);
  const rBump = getIniNumber(suspIni, 'REAR', 'DAMP_BUMP', 3800);
  const rReb = getIniNumber(suspIni, 'REAR', 'DAMP_REBOUND', 5800);
  const rCamber = getIniNumber(suspIni, 'REAR', 'STATIC_CAMBER', -1.4);
  const rToe = getIniNumber(suspIni, 'REAR', 'TOE_OUT', 0.0004);
  const rRod = getIniNumber(suspIni, 'REAR', 'ROD_LENGTH', 0.045);
  const rTrack = getIniNumber(suspIni, 'REAR', 'TRACK', 1.54);
  const rPacker = getIniNumber(suspIni, 'REAR', 'PACKER_RANGE', 0.06);

  // Tyres visual sizing
  const fRadius = getIniNumber(tyresIni, 'FRONT', 'RADIUS', 0.316);
  const rRadius = getIniNumber(tyresIni, 'REAR', 'RADIUS', 0.316);
  const fWidth = getIniNumber(tyresIni, 'FRONT', 'WIDTH', 0.235);
  const rWidth = getIniNumber(tyresIni, 'REAR', 'WIDTH', 0.255);

  // Real-time Suspension Kinematics & Roll Analysis
  const kinAnalysis = useMemo(() => {
    const input = extractSuspensionKinematicsInput(files);
    return analyzeSuspensionKinematics(input);
  }, [files]);

  const livePosture = useMemo(
    () => computeLiveSuspensionPosture(kinAnalysis, testLoadFactor, testLateralG, 0),
    [kinAnalysis, testLoadFactor, testLateralG]
  );

  return (
    <div className="space-y-4">
      {/* Top Quick Bar: Choose 3D Viewer Floating OR Settings Panel Floating */}
      <div className="bg-[#121722] border border-[#242e42] rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-rose-400" />
          <span className="font-bold text-slate-100">
            3Dサスペンション・アライメント &amp; 荷重/Rollキネマティクス設計
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Option A: 3D Viewer Only Floating / Popout */}
          <div className="flex items-center gap-1 bg-[#0b0e14] border border-[#253047] rounded-lg px-2 py-1">
            <Box className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[11px] text-slate-300 font-medium mr-1">3Dビューワーのみ:</span>
            {viewerDetachMode !== 'docked' ? (
              <button
                type="button"
                onClick={() => setViewerDetachMode('docked')}
                className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-semibold"
              >
                元の位置に戻す
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setViewerDetachMode('floating')}
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#161f30] hover:bg-[#22304a] text-cyan-300 text-[10px]"
                >
                  <PictureInPicture2 className="w-3 h-3" />
                  フローティング
                </button>
                <button
                  type="button"
                  onClick={() => setViewerDetachMode('popout')}
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-200 text-[10px]"
                >
                  <ExternalLink className="w-3 h-3" />
                  別ウィンドウ
                </button>
              </>
            )}
          </div>

          {/* Option B: Settings Only Floating / Popout */}
          <div className="flex items-center gap-1 bg-[#0b0e14] border border-[#253047] rounded-lg px-2 py-1">
            <Sliders className="w-3.5 h-3.5 text-rose-400" />
            <span className="text-[11px] text-slate-300 font-medium mr-1">設定部分のみ:</span>
            {settingsDetachMode !== 'docked' ? (
              <button
                type="button"
                onClick={() => setSettingsDetachMode('docked')}
                className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-semibold"
              >
                元の位置に戻す
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setSettingsDetachMode('floating')}
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#161f30] hover:bg-[#22304a] text-rose-300 text-[10px]"
                >
                  <PictureInPicture2 className="w-3 h-3" />
                  フローティング
                </button>
                <button
                  type="button"
                  onClick={() => setSettingsDetachMode('popout')}
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-200 text-[10px]"
                >
                  <ExternalLink className="w-3 h-3" />
                  別ウィンドウ
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 1: Real-time 3D Suspension & Wheel Alignment Viewer (Detachable as 3D Viewer Only!) */}
      <DetachablePanel
        panelId="suspension_3d_viewer"
        title="3Dサスペンション・ホイールアライメントビューワー"
        subtitle={`F:${fCamber.toFixed(1)}° / R:${rCamber.toFixed(1)}°`}
        role="viewer3d"
        mode={viewerDetachMode}
        onModeChange={setViewerDetachMode}
        hideDockedHeader
        defaultFloatingBounds={{ x: 28, y: 84, width: 660, height: 500 }}
        popoutSize={{ width: 820, height: 620 }}
      >
        <SuspensionViewport3D
          carsDir={carsDir}
          carId={carId}
          livePosture={livePosture}
          testLoadFactor={testLoadFactor}
          testLateralG={testLateralG}
          onChangeLoadFactor={setTestLoadFactor}
          onChangeLateralG={setTestLateralG}
          canvasHeightClass={viewerDetachMode === 'docked' ? 'h-[350px]' : 'h-full'}
          params={{
            wheelbase,
            frontTrack: fTrack,
            rearTrack: rTrack,
            frontRodLength: fRod,
            rearRodLength: rRod,
            frontCamberDeg: fCamber,
            rearCamberDeg: rCamber,
            frontToeM: fToe,
            rearToeM: rToe,
            frontSpringRate: fSpring,
            rearSpringRate: rSpring,
            frontArb: arbFront,
            rearArb: arbRear,
            steerLockDeg: steerLock,
            steerRatio,
            frontRadius: fRadius,
            rearRadius: rRadius,
            frontWidth: fWidth,
            rearWidth: rWidth,
          }}
        />
      </DetachablePanel>

      {/* SECTION 2: Separate Kinematics, Load Change & Roll Behavior Telemetry Graphs */}
      <SuspensionKinematicsCharts
        analysis={kinAnalysis}
        testLoadFactor={testLoadFactor}
        testLateralG={testLateralG}
        onChangeLoadFactor={setTestLoadFactor}
        onChangeLateralG={setTestLateralG}
      />

      {/* SECTION 3: Suspension Settings Panel (Detachable as Settings Only!) */}
      <DetachablePanel
        panelId="suspension_settings_only"
        title="サスペンション & アライメント設定パラメータ"
        subtitle={`Front ${metrics.frontSpringHz}Hz / Rear ${metrics.rearSpringHz}Hz`}
        role="settings"
        mode={settingsDetachMode}
        onModeChange={setSettingsDetachMode}
        defaultFloatingBounds={{ x: 740, y: 84, width: 620, height: 680 }}
        popoutSize={{ width: 720, height: 840 }}
        dockedClassName="bg-[#121722] border border-[#242e42] rounded-xl overflow-hidden"
      >
        <div className="p-4 space-y-4 overflow-y-auto flex-1 bg-[#0e131d]">
          {/* Geometry, Wheelbase, ARB & Steering */}
          <div className="bg-[#121722] border border-[#242e42] rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-semibold text-slate-100">
                  シャシージオメトリ・ホイール位置・スタビライザー &amp; ステアリング
                </h3>
              </div>
              <div className="text-xs font-mono-num text-sky-300 bg-sky-500/10 border border-sky-500/20 px-2.5 py-1 rounded-lg">
                固有振動数: Front {metrics.frontSpringHz} Hz / Rear {metrics.rearSpringHz} Hz
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              <NumericControl
                label="フロント重量配分 (CG_LOCATION)"
                value={Number((cgLocation * 100).toFixed(1))}
                min={35}
                max={68}
                step={0.5}
                decimals={1}
                unit="%"
                hint={`前後 ${Math.round(cgLocation * 100)} : ${Math.round((1 - cgLocation) * 100)}`}
                accent="cyan"
                onChange={(v) => updateSusp('BASIC', 'CG_LOCATION', (v / 100).toFixed(3))}
              />
              <NumericControl
                label="ホイールベース (WHEELBASE)"
                value={wheelbase}
                min={1.8}
                max={3.4}
                step={0.01}
                decimals={3}
                unit="m"
                hint="3D前後ホイール距離に即反映"
                onChange={(v) => updateSusp('BASIC', 'WHEELBASE', v.toFixed(3))}
              />
              <NumericControl
                label="フロント ARB (スタビライザー)"
                value={arbFront}
                min={0}
                max={120000}
                step={1000}
                unit="N/m"
                hint="Roll剛性と外輪荷重移動に直結"
                accent="amber"
                onChange={(v) => updateSusp('ARB', 'FRONT', Math.round(v))}
              />
              <NumericControl
                label="リア ARB (スタビライザー)"
                value={arbRear}
                min={0}
                max={120000}
                step={1000}
                unit="N/m"
                hint="Rollバランス(US/OS)を調整"
                accent="amber"
                onChange={(v) => updateSusp('ARB', 'REAR', Math.round(v))}
              />
              <NumericControl
                label="ステアロック角 (STEER_LOCK)"
                value={steerLock}
                min={180}
                max={720}
                step={10}
                unit="deg"
                hint="ドリフトは 500~600° 推奨"
                accent="rose"
                onChange={(v) => updateCar('CONTROLS', 'STEER_LOCK', Math.round(v))}
              />
              <NumericControl
                label="ステアリングギア比 (STEER_RATIO)"
                value={steerRatio}
                min={6}
                max={22}
                step={0.2}
                decimals={1}
                hint="小さいほどクイック・高切れ角"
                accent="rose"
                onChange={(v) => updateCar('CONTROLS', 'STEER_RATIO', v.toFixed(1))}
              />
              <NumericControl
                label="フロントタイヤ外径半径 (RADIUS)"
                value={fRadius}
                min={0.24}
                max={0.44}
                step={0.002}
                decimals={3}
                unit="m"
                hint={`外径 ${Math.round(fRadius * 2000)}mm (3Dタイヤ即反映)`}
                accent="emerald"
                onChange={(v) => updateTyres('FRONT', 'RADIUS', v.toFixed(4))}
              />
              <NumericControl
                label="リアタイヤ外径半径 (RADIUS)"
                value={rRadius}
                min={0.24}
                max={0.44}
                step={0.002}
                decimals={3}
                unit="m"
                hint={`外径 ${Math.round(rRadius * 2000)}mm (3Dタイヤ即反映)`}
                accent="emerald"
                onChange={(v) => updateTyres('REAR', 'RADIUS', v.toFixed(4))}
              />
              <NumericControl
                label="フロントタイヤ幅 (WIDTH)"
                value={fWidth}
                min={0.145}
                max={0.365}
                step={0.005}
                decimals={3}
                unit="m"
                hint={`${Math.round(fWidth * 1000)}mm幅`}
                accent="cyan"
                onChange={(v) => updateTyres('FRONT', 'WIDTH', v.toFixed(3))}
              />
              <NumericControl
                label="リアタイヤ幅 (WIDTH)"
                value={rWidth}
                min={0.145}
                max={0.385}
                step={0.005}
                decimals={3}
                unit="m"
                hint={`${Math.round(rWidth * 1000)}mm幅`}
                accent="cyan"
                onChange={(v) => updateTyres('REAR', 'WIDTH', v.toFixed(3))}
              />
              <NumericControl
                label="FFB 倍率 (FFMULT)"
                value={ffMult}
                min={0.5}
                max={6.0}
                step={0.1}
                decimals={2}
                hint="フォースフィードバック強度"
                accent="emerald"
                onChange={(v) => updateCar('CONTROLS', 'FFMULT', v.toFixed(2))}
              />
            </div>
          </div>

          {/* Front vs Rear Columns */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {/* FRONT */}
            <div className="bg-[#121722] border border-[#242e42] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-[#222b3e] pb-2">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-rose-400" />
                  <h3 className="text-sm font-semibold text-rose-300">
                    フロントサスペンション ([FRONT])
                  </h3>
                </div>
                <span className="text-xs font-mono-num text-slate-400">
                  {(fSpring / 9806.65).toFixed(1)} kgf/mm ({metrics.frontSpringHz} Hz)
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <NumericControl
                  label="キャンバー角 (STATIC_CAMBER)"
                  value={fCamber}
                  min={-9.0}
                  max={2.0}
                  step={0.1}
                  decimals={2}
                  unit="deg"
                  hint="マイナスがネガティブ (3D即反映)"
                  accent="emerald"
                  onChange={(v) => updateSusp('FRONT', 'STATIC_CAMBER', v.toFixed(2))}
                />
                <NumericControl
                  label="トー設定 (TOE_OUT)"
                  value={Number((fToe * 1000).toFixed(2))}
                  min={-12}
                  max={12}
                  step={0.05}
                  decimals={2}
                  unit="mm"
                  hint={`実効角 ${kinAnalysis.frontStaticToeDeg.toFixed(2)}° (+アウト/-イン)`}
                  accent="emerald"
                  onChange={(v) => updateSusp('FRONT', 'TOE_OUT', (v / 1000).toFixed(5))}
                />
                <NumericControl
                  label="フロントトレッド幅 (TRACK)"
                  value={fTrack}
                  min={1.1}
                  max={2.1}
                  step={0.005}
                  decimals={3}
                  unit="m"
                  hint="左右ホイール間隔・ツライチ調整"
                  accent="cyan"
                  onChange={(v) => updateSusp('FRONT', 'TRACK', v.toFixed(3))}
                />
                <NumericControl
                  label="車高ロッド長 (ROD_LENGTH)"
                  value={Number((fRod * 1000).toFixed(1))}
                  min={-80}
                  max={150}
                  step={1}
                  decimals={1}
                  unit="mm"
                  hint={`1G車高 ${kinAnalysis.frontStaticRideHeightMm}mm`}
                  accent="cyan"
                  onChange={(v) => updateSusp('FRONT', 'ROD_LENGTH', (v / 1000).toFixed(4))}
                />
                <NumericControl
                  label="スプリングレート (SPRING_RATE)"
                  value={fSpring}
                  min={15000}
                  max={300000}
                  step={1000}
                  unit="N/m"
                  hint={`${(fSpring / 9806.65).toFixed(1)} kgf/mm`}
                  onChange={(v) => updateSusp('FRONT', 'SPRING_RATE', Math.round(v))}
                />
                <NumericControl
                  label="プログレッシブバネ (PROG_SPRING)"
                  value={fProgSpring}
                  min={0}
                  max={1500000}
                  step={25000}
                  unit="N/m²"
                  hint="高荷重時の非線形バネ立ち上がり"
                  onChange={(v) => updateSusp('FRONT', 'PROG_SPRING_RATE', Math.round(v))}
                />
                <NumericControl
                  label="バンプ減衰 (DAMP_BUMP)"
                  value={fBump}
                  min={500}
                  max={25000}
                  step={100}
                  unit="Ns/m"
                  accent="amber"
                  onChange={(v) => updateSusp('FRONT', 'DAMP_BUMP', Math.round(v))}
                />
                <NumericControl
                  label="リバウンド減衰 (DAMP_REBOUND)"
                  value={fReb}
                  min={500}
                  max={35000}
                  step={100}
                  unit="Ns/m"
                  accent="amber"
                  onChange={(v) => updateSusp('FRONT', 'DAMP_REBOUND', Math.round(v))}
                />
                <NumericControl
                  label="バンプラバー作動ストローク (PACKER)"
                  value={Number((fPacker * 1000).toFixed(1))}
                  min={15}
                  max={120}
                  step={1}
                  decimals={1}
                  unit="mm"
                  hint="底付きバンプストップ開始距離"
                  onChange={(v) => updateSusp('FRONT', 'PACKER_RANGE', (v / 1000).toFixed(4))}
                />
              </div>
            </div>

            {/* REAR */}
            <div className="bg-[#121722] border border-[#242e42] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-[#222b3e] pb-2">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-sm font-semibold text-cyan-300">
                    リアサスペンション ([REAR])
                  </h3>
                </div>
                <span className="text-xs font-mono-num text-slate-400">
                  {(rSpring / 9806.65).toFixed(1)} kgf/mm ({metrics.rearSpringHz} Hz)
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <NumericControl
                  label="キャンバー角 (STATIC_CAMBER)"
                  value={rCamber}
                  min={-9.0}
                  max={2.0}
                  step={0.1}
                  decimals={2}
                  unit="deg"
                  hint="マイナスがネガティブ (3D即反映)"
                  accent="emerald"
                  onChange={(v) => updateSusp('REAR', 'STATIC_CAMBER', v.toFixed(2))}
                />
                <NumericControl
                  label="トー設定 (TOE_OUT)"
                  value={Number((rToe * 1000).toFixed(2))}
                  min={-12}
                  max={12}
                  step={0.05}
                  decimals={2}
                  unit="mm"
                  hint={`実効角 ${kinAnalysis.rearStaticToeDeg.toFixed(2)}° (正:トーイン方向)`}
                  accent="emerald"
                  onChange={(v) => updateSusp('REAR', 'TOE_OUT', (v / 1000).toFixed(5))}
                />
                <NumericControl
                  label="リアトレッド幅 (TRACK)"
                  value={rTrack}
                  min={1.1}
                  max={2.1}
                  step={0.005}
                  decimals={3}
                  unit="m"
                  hint="左右ホイール間隔・ワイドトレッド調整"
                  accent="cyan"
                  onChange={(v) => updateSusp('REAR', 'TRACK', v.toFixed(3))}
                />
                <NumericControl
                  label="車高ロッド長 (ROD_LENGTH)"
                  value={Number((rRod * 1000).toFixed(1))}
                  min={-80}
                  max={150}
                  step={1}
                  decimals={1}
                  unit="mm"
                  hint={`1G車高 ${kinAnalysis.rearStaticRideHeightMm}mm`}
                  accent="cyan"
                  onChange={(v) => updateSusp('REAR', 'ROD_LENGTH', (v / 1000).toFixed(4))}
                />
                <NumericControl
                  label="スプリングレート (SPRING_RATE)"
                  value={rSpring}
                  min={15000}
                  max={300000}
                  step={1000}
                  unit="N/m"
                  hint={`${(rSpring / 9806.65).toFixed(1)} kgf/mm`}
                  accent="cyan"
                  onChange={(v) => updateSusp('REAR', 'SPRING_RATE', Math.round(v))}
                />
                <NumericControl
                  label="プログレッシブバネ (PROG_SPRING)"
                  value={rProgSpring}
                  min={0}
                  max={1500000}
                  step={25000}
                  unit="N/m²"
                  hint="高荷重時の非線形バネ立ち上がり"
                  accent="cyan"
                  onChange={(v) => updateSusp('REAR', 'PROG_SPRING_RATE', Math.round(v))}
                />
                <NumericControl
                  label="バンプ減衰 (DAMP_BUMP)"
                  value={rBump}
                  min={500}
                  max={25000}
                  step={100}
                  unit="Ns/m"
                  accent="amber"
                  onChange={(v) => updateSusp('REAR', 'DAMP_BUMP', Math.round(v))}
                />
                <NumericControl
                  label="リバウンド減衰 (DAMP_REBOUND)"
                  value={rReb}
                  min={500}
                  max={35000}
                  step={100}
                  unit="Ns/m"
                  accent="amber"
                  onChange={(v) => updateSusp('REAR', 'DAMP_REBOUND', Math.round(v))}
                />
                <NumericControl
                  label="バンプラバー作動ストローク (PACKER)"
                  value={Number((rPacker * 1000).toFixed(1))}
                  min={15}
                  max={120}
                  step={1}
                  decimals={1}
                  unit="mm"
                  hint="底付きバンプストップ開始距離"
                  onChange={(v) => updateSusp('REAR', 'PACKER_RANGE', (v / 1000).toFixed(4))}
                />
              </div>
            </div>
          </div>
        </div>
      </DetachablePanel>
    </div>
  );
};
