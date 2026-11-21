import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Camera, Eye, RotateCw } from 'lucide-react';
import {
  buildProceduralCarGroup,
  kn5ToThreeGroup,
  parseKn5,
} from '../../utils/kn5Codec';
import {
  buildCspTextureCache,
  createCspEnvironmentMap,
  type CspLightingPreset,
} from '../../utils/cspRenderer';
import type { LiveSuspensionPosture } from '../../utils/suspensionKinematics';
import { clearThreeGroup, disposeThreeObject } from '../../utils/threeCleanup';

export interface SuspensionVisualParams {
  wheelbase: number;
  frontTrack: number;
  rearTrack: number;
  frontRodLength: number;   // meters
  rearRodLength: number;    // meters
  frontCamberDeg: number;   // negative = top tilts inward
  rearCamberDeg: number;
  frontToeM: number;
  rearToeM: number;
  frontSpringRate: number;
  rearSpringRate: number;
  frontArb: number;
  rearArb: number;
  steerLockDeg: number;
  steerRatio: number;
  frontRadius: number;
  rearRadius: number;
  frontWidth: number;
  rearWidth: number;
}

interface SuspensionViewport3DProps {
  carsDir: string | null;
  carId: string | null;
  params: SuspensionVisualParams;
  livePosture?: LiveSuspensionPosture;
  testLoadFactor?: number;
  testLateralG?: number;
  onChangeLoadFactor?: (val: number) => void;
  onChangeLateralG?: (val: number) => void;
  canvasHeightClass?: string;
}

type CameraView = 'quarter' | 'front' | 'side' | 'top' | 'rear';
type MotionTest = 'static' | 'bump' | 'roll' | 'brake';

interface WheelPivotEntry {
  id: 'LF' | 'RF' | 'LR' | 'RR';
  pivot: THREE.Group;
  guideLine: THREE.Line;
  baseHubCenter: THREE.Vector3;
  nativeRadius: number;
  nativeWidth: number;
  isFront: boolean;
  isLeft: boolean; // +X side in AC standard
}

export const SuspensionViewport3D: React.FC<SuspensionViewport3DProps> = ({
  carsDir,
  carId,
  params,
  livePosture,
  testLoadFactor = 1.0,
  testLateralG = 0.0,
  onChangeLoadFactor,
  onChangeLateralG,
  canvasHeightClass = 'h-[360px]',
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [cameraView, setCameraView] = useState<CameraView>('quarter');
  const [motionTest, setMotionTest] = useState<MotionTest>('static');
  const [steerInput, setSteerInput] = useState(0); // -1..1
  const [exaggerateAngles, setExaggerateAngles] = useState(true);
  const [showLaserGuides, setShowLaserGuides] = useState(true);
  const [wireframe, setWireframe] = useState(false);
  const [cspPreset, setCspPreset] = useState<CspLightingPreset>('csp_showroom');
  const [loadedModelLabel, setLoadedModelLabel] = useState('プロシージャル車両モデル');

  // Refs shared with 60fps animation loop
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const postureRef = useRef(livePosture);
  postureRef.current = livePosture;
  const steerRef = useRef(steerInput);
  steerRef.current = steerInput;
  const motionRef = useRef(motionTest);
  motionRef.current = motionTest;
  const exAnglesRef = useRef(exaggerateAngles);
  exAnglesRef.current = exaggerateAngles;
  const showGuidesRef = useRef(showLaserGuides);
  showGuidesRef.current = showLaserGuides;

  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const envTexRef = useRef<THREE.Texture | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const carContainerRef = useRef<THREE.Group | null>(null);
  const chassisRef = useRef<THREE.Object3D | null>(null);
  const wheelsRef = useRef<WheelPivotEntry[]>([]);
  const baseChassisYRef = useRef(0);
  const nativeGeometryRef = useRef({
    frontTrack: 1.54,
    rearTrack: 1.54,
    wheelbase: 2.6,
  });

  const maxWheelSteerDeg = Math.min(
    75,
    Math.max(10, params.steerLockDeg / Math.max(4, params.steerRatio))
  );

  // Initialize Three.js Scene
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0a0e16');
    scene.fog = new THREE.Fog('#0a0e16', 12, 32);

    const camera = new THREE.PerspectiveCamera(
      38,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.05,
      100
    );
    camera.position.set(3.3, 1.45, 3.7);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const envTex = createCspEnvironmentMap(renderer, 'csp_showroom');
    scene.environment = envTex;
    envTexRef.current = envTex;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0.48, 0);
    controls.maxPolarAngle = Math.PI / 2 - 0.01;
    controls.minDistance = 1.2;
    controls.maxDistance = 14;

    // Studio Lighting
    scene.add(new THREE.HemisphereLight('#cbd5e1', '#1e293b', 0.9));
    const keyLight = new THREE.DirectionalLight('#ffffff', 2.2);
    keyLight.position.set(5, 8, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight('#38bdf8', 1.1);
    rimLight.position.set(-5, 4, -4);
    scene.add(rimLight);

    const warmFill = new THREE.DirectionalLight('#fb7185', 0.65);
    warmFill.position.set(3, 2, -5);
    scene.add(warmFill);

    // Garage floor + alignment measurement grid
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(36, 36),
      new THREE.MeshStandardMaterial({ color: '#0c111b', roughness: 0.65, metalness: 0.25 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(16, 32, '#2d3b56', '#192234');
    grid.position.y = 0.002;
    scene.add(grid);

    const carContainer = new THREE.Group();
    carContainer.name = 'SUSP_CAR_CONTAINER';
    scene.add(carContainer);

    sceneRef.current = scene;
    cameraRef.current = camera;
    controlsRef.current = controls;
    carContainerRef.current = carContainer;

    const resizeObserver = new ResizeObserver(() => {
      if (!container) return;
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    let rafId = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      rafId = requestAnimationFrame(animate);
      if (document.hidden) return;
      const t = clock.getElapsedTime();
      const p = paramsRef.current;
      const posture = postureRef.current;
      const steerNorm = steerRef.current;
      const motion = motionRef.current;
      const angleExag = exAnglesRef.current ? 1.85 : 1.0;
      const showGuides = showGuidesRef.current;

      // Dynamic animated motion test overlay (bump / roll / brake) on top of live static/scrubbed posture
      let animBumpM = 0;
      let animRollRad = 0;
      let animPitchRad = 0;

      const avgSpring = (p.frontSpringRate + p.rearSpringRate) / 2;
      const springSoftness = Math.min(2.2, Math.max(0.35, 70000 / Math.max(15000, avgSpring)));
      const arbSoftness = Math.min(
        2.0,
        Math.max(0.35, 28000 / Math.max(5000, (p.frontArb + p.rearArb) / 2))
      );

      if (motion === 'bump') {
        const freq = Math.sqrt(Math.max(20000, avgSpring) / 350) / (2 * Math.PI);
        animBumpM = Math.sin(t * freq * Math.PI * 1.4) * 0.048 * springSoftness;
      } else if (motion === 'roll') {
        animRollRad = Math.sin(t * 2.2) * 0.068 * arbSoftness;
      } else if (motion === 'brake') {
        const dive = 0.5 + 0.5 * Math.sin(t * 2.4);
        animPitchRad = dive * 0.048 * springSoftness;
        animBumpM = -dive * 0.022 * springSoftness;
      }

      const heaveM = (posture?.chassisHeaveM ?? (p.frontRodLength + p.rearRodLength - 0.09) * 0.5) + animBumpM;
      const rollRad = (posture?.chassisRollRad ?? 0) + animRollRad;
      const pitchRad = (posture?.chassisPitchRad ?? 0) + animPitchRad;

      // 1. Update Chassis Body independently of grounded wheels!
      if (chassisRef.current) {
        chassisRef.current.position.y = baseChassisYRef.current + heaveM;
        chassisRef.current.rotation.x = pitchRad;
        // Positive roll (left turn -> roll right) tilts chassis around Z
        chassisRef.current.rotation.z = -rollRad;
      }

      const maxSteerRad = THREE.MathUtils.degToRad(
        Math.min(75, Math.max(10, p.steerLockDeg / Math.max(4, p.steerRatio)))
      );
      const wheelSteerRad = steerNorm * maxSteerRad;

      // 2. Update All 4 Grounded Wheel Pivots (Track, Wheelbase, Radius, Width, Camber, Toe, Steer)
      for (const w of wheelsRef.current) {
        const wState = posture?.wheels[w.id];
        const targetTrack = w.isFront ? p.frontTrack : p.rearTrack;
        const targetWb = p.wheelbase;
        const targetRadius = w.isFront ? p.frontRadius : p.rearRadius;
        const targetWidth = w.isFront ? p.frontWidth : p.rearWidth;

        // Scale tire width (X) & diameter (Y, Z) relative to the model's native wheel dimensions
        const scaleX = Math.max(0.55, Math.min(1.75, targetWidth / Math.max(0.12, w.nativeWidth)));
        const scaleYZ = Math.max(0.65, Math.min(1.55, targetRadius / Math.max(0.18, w.nativeRadius)));
        w.pivot.scale.set(scaleX, scaleYZ, scaleYZ);

        // Live Camber (deg) & Toe (deg) from kinematics solver (or direct static + dynamic roll/bump)
        const baseCamberDeg = wState
          ? wState.camberWorldDeg
          : (w.isFront ? p.frontCamberDeg : p.rearCamberDeg) -
            THREE.MathUtils.radToDeg(animBumpM * 24) +
            THREE.MathUtils.radToDeg(animRollRad) * (w.isLeft ? 1 : -1) * 0.7;

        const baseToeDeg = wState
          ? wState.toeDeg
          : ((w.isFront ? p.frontToeM : p.rearToeM) / 0.145) * (180 / Math.PI);

        const sign = w.isLeft ? 1 : -1;
        // Negative camber tilts top of wheel inward toward X=0
        const camberRad = THREE.MathUtils.degToRad(-baseCamberDeg * angleExag) * sign;
        // Positive TOE_OUT rotates front of wheel outward
        const toeSign = w.isFront ? -sign : sign;
        const toeRad = THREE.MathUtils.degToRad(baseToeDeg * (exAnglesRef.current ? 4.0 : 1.0)) * toeSign;
        const steerPart = w.isFront ? wheelSteerRad : 0;

        // Position wheel at live Track Width (X), grounded Radius (Y), and live Wheelbase (Z)
        const halfTrack = targetTrack / 2;
        const halfWb = targetWb / 2;
        const zCenterOffset =
          Math.abs(w.baseHubCenter.z) - nativeGeometryRef.current.wheelbase / 2;
        const finalX = sign * halfTrack;
        const finalZ = (w.isFront ? 1 : -1) * (halfWb + zCenterOffset);
        // Keep tire bottom resting cleanly on floor y=0 even when cambered
        const effectiveRadius = w.nativeRadius * scaleYZ;
        const finalY = effectiveRadius * Math.cos(Math.min(0.45, Math.abs(camberRad)));

        w.pivot.position.set(finalX, finalY, finalZ);

        // Apply rotation in YXZ order: Yaw (Steering + Toe) first, then Roll (Camber)
        w.pivot.rotation.order = 'YXZ';
        w.pivot.rotation.y = steerPart + toeRad;
        w.pivot.rotation.z = camberRad;
        w.pivot.rotation.x = 0;

        w.guideLine.visible = showGuides;
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      controls.dispose();
      envTexRef.current?.dispose();
      disposeThreeObject(scene);
      renderer.dispose();
    };
  }, []);

  // Update CSP lighting preset dynamically
  useEffect(() => {
    const scene = sceneRef.current;
    const renderer = rendererRef.current;
    if (!scene || !renderer) return;
    envTexRef.current?.dispose();
    const nextEnv = createCspEnvironmentMap(renderer, cspPreset);
    scene.environment = nextEnv;
    envTexRef.current = nextEnv;
    scene.background = new THREE.Color(
      cspPreset === 'csp_sunset' ? '#171d2c' : cspPreset === 'csp_studio_dark' ? '#070a10' : '#0d121c'
    );
  }, [cspPreset]);

  // Load real car .kn5 model (with textures & centered WheelPivots!) or fallback procedural model
  useEffect(() => {
    let cancelled = false;

    const createWheelLaserGuide = (radius: number, isLeft: boolean): THREE.Line => {
      const sign = isLeft ? 1 : -1;
      const pts = [
        // Vertical camber plane indicator (from bottom contact patch through hub to top of tire)
        new THREE.Vector3(sign * 0.14, -radius, 0),
        new THREE.Vector3(sign * 0.14, radius * 1.15, 0),
        new THREE.Vector3(sign * 0.14, -radius + 0.01, 0),
        // Forward toe heading laser along ground
        new THREE.Vector3(sign * 0.14, -radius + 0.01, radius * 1.9),
        new THREE.Vector3(sign * 0.14, -radius + 0.01, -radius * 1.2),
      ];
      const geom = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({
        color: isLeft ? '#f43f5e' : '#38bdf8',
        transparent: true,
        opacity: 0.85,
      });
      return new THREE.Line(geom, mat);
    };

    const extractWheelPivotsFromRoot = (carRoot: THREE.Group): WheelPivotEntry[] => {
      carRoot.updateMatrixWorld(true);

      const corners: Array<{
        id: 'LF' | 'RF' | 'LR' | 'RR';
        isFront: boolean;
        isLeft: boolean;
        regex: RegExp;
      }> = [
        {
          id: 'LF',
          isFront: true,
          isLeft: true,
          regex: /^(WHEEL_LF|SUSP_LF|DISC_LF|HUB_LF|WHEEL_FL|TIRE_LF|RIM_LF)$/i,
        },
        {
          id: 'RF',
          isFront: true,
          isLeft: false,
          regex: /^(WHEEL_RF|SUSP_RF|DISC_RF|HUB_RF|WHEEL_FR|TIRE_RF|RIM_RF)$/i,
        },
        {
          id: 'LR',
          isFront: false,
          isLeft: true,
          regex: /^(WHEEL_LR|SUSP_LR|DISC_LR|HUB_LR|WHEEL_RL|TIRE_LR|RIM_LR|WHEEL_BL)$/i,
        },
        {
          id: 'RR',
          isFront: false,
          isLeft: false,
          regex: /^(WHEEL_RR|SUSP_RR|DISC_RR|HUB_RR|TIRE_RR|RIM_RR|WHEEL_BR)$/i,
        },
      ];

      const entries: WheelPivotEntry[] = [];

      for (const corner of corners) {
        const matchedNodes: THREE.Object3D[] = [];
        carRoot.traverse((obj) => {
          if (obj === carRoot) return;
          if (corner.regex.test(obj.name.trim())) {
            // Avoid adding a child if its ancestor is already in matchedNodes
            const hasMatchedAncestor = matchedNodes.some((anc) => {
              let p: THREE.Object3D | null = obj.parent;
              while (p) {
                if (p === anc) return true;
                p = p.parent;
              }
              return false;
            });
            if (!hasMatchedAncestor) {
              matchedNodes.push(obj);
            }
          }
        });

        if (matchedNodes.length === 0) continue;

        // Compute world bounding box of this wheel assembly
        const wheelBox = new THREE.Box3();
        for (const n of matchedNodes) {
          wheelBox.expandByObject(n);
        }
        if (wheelBox.isEmpty()) continue;

        const hubCenter = wheelBox.getCenter(new THREE.Vector3());
        const size = wheelBox.getSize(new THREE.Vector3());
        const nativeRadius = Math.max(0.22, Math.min(0.48, Math.max(size.y, size.z) / 2));
        const nativeWidth = Math.max(0.16, Math.min(0.45, size.x));

        // Create a centered WheelPivot group at hubCenter
        const pivot = new THREE.Group();
        pivot.name = `ACCS_WHEEL_PIVOT_${corner.id}`;
        pivot.position.copy(hubCenter);

        // Reparent matched wheel/hub/disc nodes into pivot while preserving their world positions
        for (const n of matchedNodes) {
          n.updateMatrixWorld(true);
          const worldMat = n.matrixWorld.clone();
          const pivotInv = new THREE.Matrix4().makeTranslation(
            -hubCenter.x,
            -hubCenter.y,
            -hubCenter.z
          );
          const localMat = pivotInv.multiply(worldMat);
          pivot.add(n);
          localMat.decompose(n.position, n.quaternion, n.scale);
        }

        const guideLine = createWheelLaserGuide(nativeRadius, corner.isLeft);
        pivot.add(guideLine);

        entries.push({
          id: corner.id,
          pivot,
          guideLine,
          baseHubCenter: hubCenter.clone(),
          nativeRadius,
          nativeWidth,
          isFront: corner.isFront,
          isLeft: corner.isLeft,
        });
      }

      return entries;
    };

    const loadModel = async () => {
      const container = carContainerRef.current;
      if (!container) return;

      clearThreeGroup(container);
      wheelsRef.current = [];
      chassisRef.current = null;

      let loadedKn5: THREE.Group | null = null;
      let modelName = '';

      if (carsDir && carId) {
        try {
          const models = await window.acApi.listCarModels(carsDir, carId);
          const primary = models.find((m) => !m.fileName.toLowerCase().includes('collider'));
          if (primary) {
            const bytes = await window.acApi.readCarModelBytes(carsDir, carId, primary.fileName);
            if (bytes && !cancelled) {
              const doc = parseKn5(bytes);
              const texCache = buildCspTextureCache(doc.textures);
              loadedKn5 = kn5ToThreeGroup(doc, texCache);
              modelName = primary.fileName;
            }
          }
        } catch {
          loadedKn5 = null;
        }
      }

      if (cancelled) return;

      let targetGroup: THREE.Group;
      let isKn5 = false;

      if (loadedKn5) {
        isKn5 = true;
        const box = new THREE.Box3().setFromObject(loadedKn5);
        if (!box.isEmpty()) {
          loadedKn5.position.y -= box.min.y;
          const center = box.getCenter(new THREE.Vector3());
          loadedKn5.position.x -= center.x;
          loadedKn5.position.z -= center.z;
        }
        targetGroup = loadedKn5;
      } else {
        const p = paramsRef.current;
        targetGroup = buildProceduralCarGroup({
          wheelbase: p.wheelbase,
          frontTrack: p.frontTrack,
          rearTrack: p.rearTrack,
          frontRadius: p.frontRadius,
          rearRadius: p.rearRadius,
          frontWidth: p.frontWidth,
          rearWidth: p.rearWidth,
        });
      }

      // Extract the 4 wheel assemblies into independent WheelPivots so chassis & wheels move independently!
      const wheelEntries = extractWheelPivotsFromRoot(targetGroup);

      container.add(targetGroup);
      for (const w of wheelEntries) {
        container.add(w.pivot);
      }

      // Measure native track & wheelbase from extracted wheel centers
      const lf = wheelEntries.find((w) => w.id === 'LF');
      const rf = wheelEntries.find((w) => w.id === 'RF');
      const lr = wheelEntries.find((w) => w.id === 'LR');
      const rr = wheelEntries.find((w) => w.id === 'RR');

      const natFTrack =
        lf && rf ? Math.abs(lf.baseHubCenter.x - rf.baseHubCenter.x) : paramsRef.current.frontTrack;
      const natRTrack =
        lr && rr ? Math.abs(lr.baseHubCenter.x - rr.baseHubCenter.x) : paramsRef.current.rearTrack;
      const natWb =
        lf && lr
          ? Math.abs(lf.baseHubCenter.z - lr.baseHubCenter.z)
          : paramsRef.current.wheelbase;

      nativeGeometryRef.current = {
        frontTrack: Math.max(1.1, natFTrack),
        rearTrack: Math.max(1.1, natRTrack),
        wheelbase: Math.max(1.8, natWb),
      };

      chassisRef.current = targetGroup;
      baseChassisYRef.current = targetGroup.position.y;
      wheelsRef.current = wheelEntries;

      if (isKn5) {
        setLoadedModelLabel(
          `実車 KN5: ${modelName} (4輪独立ピボット・キャンバー/トー/車高リアルタイム同期)`
        );
      } else {
        setLoadedModelLabel('リアルタイム3D車両モデル (4輪独立ピボット)');
      }
    };

    loadModel();
    return () => {
      cancelled = true;
    };
  }, [carsDir, carId]);

  // Toggle wireframe
  useEffect(() => {
    const container = carContainerRef.current;
    if (!container) return;
    container.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mat = (obj as THREE.Mesh).material;
        const mats = Array.isArray(mat) ? mat : [mat];
        for (const m of mats) {
          if ('wireframe' in m) (m as THREE.MeshStandardMaterial).wireframe = wireframe;
        }
      }
    });
  }, [wireframe, loadedModelLabel]);

  // Camera View Presets
  useEffect(() => {
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    if (!cam || !ctrl) return;
    const presets: Record<
      CameraView,
      { pos: [number, number, number]; target: [number, number, number] }
    > = {
      quarter: { pos: [3.3, 1.45, 3.7], target: [0, 0.48, 0] },
      front: { pos: [0, 0.58, 4.1], target: [0, 0.42, 0] },
      side: { pos: [4.6, 0.68, 0], target: [0, 0.45, 0] },
      top: { pos: [0, 5.8, 0.01], target: [0, 0.4, 0] },
      rear: { pos: [0, 0.62, -4.1], target: [0, 0.42, 0] },
    };
    const p = presets[cameraView];
    cam.position.set(...p.pos);
    ctrl.target.set(...p.target);
    ctrl.update();
  }, [cameraView]);

  const lfState = livePosture?.wheels.LF;
  const rfState = livePosture?.wheels.RF;
  const lrState = livePosture?.wheels.LR;
  const rrState = livePosture?.wheels.RR;

  return (
    <div className="bg-[#121722] border border-[#242e42] rounded-xl overflow-hidden flex flex-col h-full">
      {/* Top Toolbar */}
      <div className="px-3.5 py-2 border-b border-[#222b3e] flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Camera className="w-4 h-4 text-rose-400 shrink-0" />
          <span className="font-semibold text-slate-100 truncate">
            リアルタイム3Dサスペンション・アライメントビューア
          </span>
          <span className="text-[10px] font-mono-num px-2 py-0.5 rounded bg-[#0b0e14] border border-[#252e42] text-cyan-300 truncate hidden sm:inline">
            {loadedModelLabel}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              ['quarter', '斜め'],
              ['front', '正面(キャンバー)'],
              ['side', '真横(車高)'],
              ['top', '真上(トー/舵角)'],
              ['rear', '真後ろ(リア角)'],
            ] as Array<[CameraView, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setCameraView(id)}
              className={`px-2 py-1 rounded-md border text-[11px] transition-colors ${
                cameraView === id
                  ? 'bg-rose-500/20 border-rose-500 text-rose-200 font-semibold'
                  : 'bg-[#0b0e14] border-[#252e42] text-slate-400 hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}

          <select
            value={cspPreset}
            onChange={(e) => setCspPreset(e.target.value as CspLightingPreset)}
            className="bg-[#0b0e14] border border-[#252e42] rounded-md px-2 py-1 text-[11px] text-cyan-300"
          >
            <option value="csp_showroom">CSP Showroom</option>
            <option value="csp_sunset">CSP Sunset</option>
            <option value="csp_studio_dark">CSP Dark</option>
          </select>

          <button
            onClick={() => setWireframe((w) => !w)}
            className={`px-2 py-1 rounded-md border text-[11px] flex items-center gap-1 ${
              wireframe
                ? 'bg-cyan-500/20 border-cyan-500 text-cyan-200'
                : 'bg-[#0b0e14] border-[#252e42] text-slate-400'
            }`}
          >
            <Eye className="w-3 h-3" />
            ワイヤー
          </button>
        </div>
      </div>

      {/* 3D Canvas */}
      <div className={`relative w-full flex-1 min-h-[260px] ${canvasHeightClass}`}>
        <div ref={mountRef} className="w-full h-full" />

        {/* Live 4-Wheel Telemetry HUD Overlay */}
        <div className="absolute top-2.5 left-2.5 bg-[#090c11]/88 backdrop-blur border border-[#252e42] rounded-xl px-3 py-2 text-[11px] font-mono-num space-y-1 pointer-events-none">
          <div className="text-[10px] font-bold text-cyan-300 uppercase tracking-wider">
            実効4輪アライメント &amp; 輪荷重テレメトリー
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px]">
            <div className="text-slate-300">
              <span className="text-rose-400 font-bold">LF:</span> Cam{' '}
              {(lfState?.camberWorldDeg ?? params.frontCamberDeg).toFixed(2)}° | Toe{' '}
              {(lfState?.toeDeg ?? 0).toFixed(2)}° |{' '}
              <span className="text-amber-300">{Math.round(lfState?.loadKgf ?? 340)}kgf</span>
            </div>
            <div className="text-slate-300">
              <span className="text-rose-400 font-bold">RF:</span> Cam{' '}
              {(rfState?.camberWorldDeg ?? params.frontCamberDeg).toFixed(2)}° | Toe{' '}
              {(rfState?.toeDeg ?? 0).toFixed(2)}° |{' '}
              <span className="text-amber-300">{Math.round(rfState?.loadKgf ?? 340)}kgf</span>
            </div>
            <div className="text-slate-300">
              <span className="text-cyan-400 font-bold">LR:</span> Cam{' '}
              {(lrState?.camberWorldDeg ?? params.rearCamberDeg).toFixed(2)}° | Toe{' '}
              {(lrState?.toeDeg ?? 0).toFixed(2)}° |{' '}
              <span className="text-amber-300">{Math.round(lrState?.loadKgf ?? 320)}kgf</span>
            </div>
            <div className="text-slate-300">
              <span className="text-cyan-400 font-bold">RR:</span> Cam{' '}
              {(rrState?.camberWorldDeg ?? params.rearCamberDeg).toFixed(2)}° | Toe{' '}
              {(rrState?.toeDeg ?? 0).toFixed(2)}° |{' '}
              <span className="text-amber-300">{Math.round(rrState?.loadKgf ?? 320)}kgf</span>
            </div>
          </div>
          <div className="text-[10px] text-slate-400 pt-0.5 border-t border-[#1e273a] flex items-center gap-3">
            <span>
              車高: F <strong className="text-emerald-300">{livePosture?.frontRideHeightMm ?? 115}mm</strong> / R{' '}
              <strong className="text-emerald-300">{livePosture?.rearRideHeightMm ?? 115}mm</strong>
            </span>
            <span>
              Roll角: <strong className="text-amber-300">{(livePosture?.chassisRollDeg ?? 0).toFixed(2)}°</strong>
            </span>
            <span>
              トレッド: F {params.frontTrack.toFixed(2)}m / R {params.rearTrack.toFixed(2)}m
            </span>
          </div>
        </div>
      </div>

      {/* Interactive Load, Roll & Steering Live Test Controls */}
      <div className="px-3.5 py-2.5 bg-[#0e131d] border-t border-[#222b3e] space-y-2 text-xs shrink-0">
        {/* Row 1: Live Load & Roll Scrubbers (Synchronized with Kinematics Graphs!) */}
        {(onChangeLoadFactor || onChangeLateralG) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-2 border-b border-[#1e2739]">
            {onChangeLoadFactor && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-cyan-300 font-semibold shrink-0">
                  荷重変化テスト:
                </span>
                <input
                  type="range"
                  min={0.2}
                  max={2.2}
                  step={0.05}
                  value={testLoadFactor}
                  onChange={(e) => onChangeLoadFactor(Number(e.target.value))}
                  className="flex-1 h-1.5 accent-cyan-400"
                />
                <span className="font-mono-num text-[11px] text-cyan-200 w-14 text-right">
                  {Math.round(testLoadFactor * 100)}% (1G比)
                </span>
                {Math.abs(testLoadFactor - 1.0) > 0.02 && (
                  <button
                    onClick={() => onChangeLoadFactor(1.0)}
                    className="text-[10px] bg-[#1a2233] hover:bg-[#25314a] text-slate-300 px-1.5 py-0.5 rounded"
                  >
                    1G戻す
                  </button>
                )}
              </div>
            )}

            {onChangeLateralG && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-amber-300 font-semibold shrink-0">
                  Roll旋回横Gテスト:
                </span>
                <input
                  type="range"
                  min={-1.8}
                  max={1.8}
                  step={0.05}
                  value={testLateralG}
                  onChange={(e) => onChangeLateralG(Number(e.target.value))}
                  className="flex-1 h-1.5 accent-amber-400"
                />
                <span className="font-mono-num text-[11px] text-amber-200 w-14 text-right">
                  {testLateralG >= 0 ? `+${testLateralG.toFixed(2)}` : testLateralG.toFixed(2)} G
                </span>
                {Math.abs(testLateralG) > 0.02 && (
                  <button
                    onClick={() => onChangeLateralG(0)}
                    className="text-[10px] bg-[#1a2233] hover:bg-[#25314a] text-slate-300 px-1.5 py-0.5 rounded"
                  >
                    0G戻す
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Row 2: Steering & Dynamic Oscillation Tests */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-[220px]">
            <RotateCw className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span className="text-slate-400 text-[11px] shrink-0">ステア舵角:</span>
            <input
              type="range"
              min={-1}
              max={1}
              step={0.02}
              value={steerInput}
              onChange={(e) => setSteerInput(Number(e.target.value))}
              className="flex-1 h-1.5 accent-rose-500"
            />
            <span className="font-mono-num text-rose-300 w-14 text-right text-[11px]">
              {(steerInput * maxWheelSteerDeg).toFixed(1)}°
            </span>
            {steerInput !== 0 && (
              <button
                onClick={() => setSteerInput(0)}
                className="text-[10px] text-slate-400 hover:text-slate-200 px-1.5 py-0.5 bg-[#1a2233] rounded"
              >
                中立
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                ['static', '静止'],
                ['bump', 'バンプ振動'],
                ['roll', 'ロール連続'],
                ['brake', '制動ダイブ'],
              ] as Array<[MotionTest, string]>
            ).map(([m, label]) => (
              <button
                key={m}
                onClick={() => setMotionTest(m)}
                className={`px-2 py-0.5 rounded-md border text-[11px] transition-colors ${
                  motionTest === m
                    ? 'bg-amber-500/20 border-amber-500 text-amber-200 font-semibold'
                    : 'bg-[#0b0e14] border-[#252e42] text-slate-400 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}

            <label
              className="flex items-center gap-1 text-[11px] text-slate-400 ml-1 cursor-pointer"
              title="微小なキャンバー角・トー角の変化を3D上で視認しやすく強調します"
            >
              <input
                type="checkbox"
                checked={exaggerateAngles}
                onChange={(e) => setExaggerateAngles(e.target.checked)}
                className="accent-emerald-500"
              />
              角度強調
            </label>

            <label
              className="flex items-center gap-1 text-[11px] text-slate-400 ml-1 cursor-pointer"
              title="タイヤのトー方向・キャンバー傾きを示すレーザーガイド線を表示します"
            >
              <input
                type="checkbox"
                checked={showLaserGuides}
                onChange={(e) => setShowLaserGuides(e.target.checked)}
                className="accent-cyan-500"
              />
              ガイド線
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};
