import assert from 'node:assert/strict';
import * as THREE from 'three';
import { generateAcdKey, packAcdBuffer, unpackAcdBuffer } from '../electron/services/acdCodec';
import { buildNewCarFiles } from '../electron/services/carTemplates';
import { getIniNumber, getIniValue, setIniValue, parseLut, serializeLut } from '../src/utils/iniHelpers';
import { computeCarPhysics, syncUiCarSpecsFromPhysics } from '../src/utils/physicsCalc';
import { BUILTIN_PRESETS, extractCustomPresetSnapshot, applyCustomPreset } from '../src/utils/presets';
import {
  buildKn5,
  buildProceduralCarGroup,
  createSolidColorDds,
  kn5ToThreeGroup,
  parseKn5,
  threeGroupToKn5,
  type Kn5Document,
} from '../src/utils/kn5Codec';
import { decodeDdsToRgba } from '../src/utils/cspRenderer';
import {
  deduplicateSelectedObjects,
  detectPartCategory,
  extractMultiplePartsToKn5,
  extractPartSubtreeToKn5,
  instantiateSavedPartForCar,
  replaceAllFourWheels,
  replaceNodeWithPartGroup,
} from '../src/utils/partTransfer';
import {
  DEFAULT_SKIN_EXPORT_RESOLUTION,
  DEFAULT_TEXTURE_ADJUSTMENTS,
  PAINT_MATERIAL_PRESETS,
  SKIN_EXPORT_RESOLUTIONS,
  buildCarbonMaterialDdsFiles,
  buildDecalProjection3D,
  buildMultiMaterialSkinExtConfigIni,
  buildSkinExtConfigIni,
  buildSurfacePatternDdsFiles,
  encodeRgbaToDds,
  extractMeshUvTriangles,
  mirrorDecalProjectionAcrossX,
  rasterizeUvTrianglesToMask,
} from '../src/utils/liveryEngine';
import {
  OEM_COLOR_FAMILIES,
  OEM_MANUFACTURERS,
  OEM_PAINT_COLORS,
} from '../src/data/oem_paints/oemPaintCatalog';
import {
  ENGINE_SIM_PRESETS,
  applyEngineSimToCarFiles,
  simulateEngine,
} from '../src/utils/engineSimPhysics';
import {
  DEFAULT_SOUND_SETTINGS,
  buildEngineSoundExportPayload,
} from '../src/utils/engineSoundEngine';
import {
  HistoryStack,
  NavHistoryStack,
  isUndoRedoEditableTextTarget,
} from '../src/utils/undoRedo';
import {
  CSP_TRANSMISSION_PRESETS,
  HYBRID_MANAGED_FILES,
  HYBRID_PRESETS,
  applyCspTransmissionToFiles,
  applyHybridSystemToFiles,
  createDefaultAtConfig,
  createDefaultCvtConfig,
  generateCvtRatioTable,
  parseCspTransmissionFromFiles,
  parseHybridSystemFromFiles,
} from '../src/utils/cspPowertrain';
import {
  SERVER_PRESETS,
  buildContentManagerJoinLink,
  createDefaultServerConfig,
  parseServerConfigBundle,
  serializeServerConfigBundle,
  sunAngleToTimeLabel,
} from '../src/utils/serverConfig';
import {
  compareSemver,
  formatBytesCompact,
  isNewerVersion,
  pickWindowsReleaseAsset,
} from '../src/utils/updateChecker';
import {
  analyzeSuspensionKinematics,
  computeLiveSuspensionPosture,
  extractSuspensionKinematicsInput,
} from '../src/utils/suspensionKinematics';

console.log('=== 1. ACD Codec Round-trip & Header v2 Test ===');
const key = generateAcdKey('ks_audi_sport_quattro');
console.log('Generated key for ks_audi_sport_quattro:', key);
assert.match(key, /^\d+-\d+-\d+-\d+-\d+-\d+-\d+-\d+$/);

const sampleFiles: Record<string, Buffer> = {
  'car.ini': Buffer.from('[HEADER]\nVERSION=2\n[BASIC]\nTOTALMASS=1250\n', 'utf8'),
  'power.lut': Buffer.from('0|100\n3000|320\n7000|300\n', 'utf8'),
};
const { buffer: packed } = packAcdBuffer(sampleFiles, 'ks_audi_sport_quattro');
const unpacked = unpackAcdBuffer(packed, 'ks_audi_sport_quattro');
assert.equal(unpacked.files['car.ini'].toString('utf8'), sampleFiles['car.ini'].toString('utf8'));
assert.equal(unpacked.files['power.lut'].toString('utf8'), sampleFiles['power.lut'].toString('utf8'));

// Also test v2 (-1111 header) prefixed buffer
const v2Header = Buffer.alloc(8);
v2Header.writeInt32LE(-1111, 0);
v2Header.writeInt32LE(0, 4);
const unpackedV2 = unpackAcdBuffer(Buffer.concat([v2Header, packed]), 'ks_audi_sport_quattro');
assert.equal(unpackedV2.files['car.ini'].toString('utf8'), sampleFiles['car.ini'].toString('utf8'));
console.log('PASS: ACD Codec (standard & v2 header)');

console.log('=== 2. INI Comment Preservation & LUT Test ===');
const iniWithComments = `[BASIC]\nTOTALMASS=1300 ; curb + driver\nINERTIA=1.8,1.2,4.4\n`;
const updatedIni = setIniValue(iniWithComments, 'BASIC', 'TOTALMASS', 1180);
assert.ok(updatedIni.includes('; curb + driver'), 'Inline comment must be preserved');
assert.equal(getIniNumber(updatedIni, 'BASIC', 'TOTALMASS', 0), 1180);

const lutPts = parseLut('0|80\n4000|350\n7000|310\n');
assert.equal(lutPts.length, 3);
assert.equal(parseLut(serializeLut(lutPts))[1].torque, 350);
console.log('PASS: INI & LUT helpers');

console.log('=== 3. All 5 Car Templates & Physics Engine Test ===');
const templateIds = ['fr_sports', 'drift_spec', 'awd_rally', 'ff_hothatch', 'gt3_race'] as const;
for (const tplId of templateIds) {
  const { files, uiCarJson } = buildNewCarFiles({
    folderName: `test_${tplId}`,
    name: `Test ${tplId}`,
    brand: 'Test',
    country: 'Japan',
    year: 2025,
    carClass: 'street',
    author: 'Tester',
    description: 'test',
    templateId: tplId,
    massKg: 1250,
    peakTorqueNm: 420,
    maxRpm: 8000,
    turboBoostBar: tplId === 'gt3_race' ? 0 : 1.0,
  });

  const metrics = computeCarPhysics(files);
  assert.ok(metrics.peakPowerPs > 150, `${tplId} peakPowerPs should be > 150, got ${metrics.peakPowerPs}`);
  assert.ok(metrics.gears.length >= 5, `${tplId} gears should be >= 5`);
  assert.ok(metrics.frontSpringHz > 0.5 && metrics.frontSpringHz < 10);

  const synced = syncUiCarSpecsFromPhysics(uiCarJson, metrics);
  assert.ok(synced.specs?.bhp?.includes('bhp'));
  assert.ok((synced.torqueCurve?.length ?? 0) >= 5);
  console.log(
    `PASS [${tplId}]: ${metrics.peakPowerPs} PS / ${metrics.peakTorqueNm} Nm / Top ${metrics.estimatedTopSpeedKmh} km/h / 0-100 ${metrics.estimated0To100Sec}s`
  );
}

console.log('=== 4. All 6 Built-in & Custom Presets Test ===');
const base = buildNewCarFiles({
  folderName: 'preset_test',
  name: 'Preset Base',
  brand: 'Base',
  country: 'Japan',
  year: 2020,
  carClass: 'street',
  author: 'Tester',
  description: '',
  templateId: 'fr_sports',
  massKg: 1350,
  peakTorqueNm: 350,
  maxRpm: 7500,
  turboBoostBar: 0.5,
});

for (const preset of BUILTIN_PRESETS) {
  const applied = preset.apply(base.files);
  const m = computeCarPhysics(applied);
  assert.ok(m.peakPowerPs > 100);
  if (preset.id === 'drift_pro') {
    assert.equal(getIniNumber(applied['car.ini'], 'CONTROLS', 'STEER_LOCK', 0), 560);
    assert.equal(getIniValue(applied['drivetrain.ini'], 'TRACTION', 'TYPE', ''), 'RWD');
  }
  if (preset.id === 'lightweight_track') {
    assert.ok(m.massKg < 1350);
  }
  console.log(`PASS Preset [${preset.id}]: ${m.peakPowerPs} PS, ${m.massKg} kg`);
}

const snap = extractCustomPresetSnapshot(base.files, 'My Snap', 'desc');
const reapplied = applyCustomPreset(base.files, snap);
assert.equal(
  getIniNumber(reapplied['car.ini'], 'BASIC', 'TOTALMASS', 0),
  getIniNumber(base.files['car.ini'], 'BASIC', 'TOTALMASS', 0)
);
console.log('PASS: Custom preset snapshot & apply');

console.log('=== 5. KN5 Binary Build & Parse Round-trip Test ===');
const procCar = buildProceduralCarGroup({
  wheelbase: 2.6,
  frontTrack: 1.54,
  rearTrack: 1.56,
  frontRadius: 0.316,
  rearRadius: 0.316,
  frontWidth: 0.24,
  rearWidth: 0.26,
});
const kn5Bytes = threeGroupToKn5(procCar);
assert.ok(kn5Bytes.byteLength > 10_000, 'KN5 binary should have geometry data');
const parsedKn5 = parseKn5(kn5Bytes);
assert.equal(parsedKn5.version, 5);
assert.ok(parsedKn5.materials.length >= 4);
let foundWheelCount = 0;
const countWheels = (n: typeof parsedKn5.root) => {
  if (/^WHEEL_(LF|RF|LR|RR)$/.test(n.name)) foundWheelCount++;
  for (const ch of n.children) countWheels(ch);
};
countWheels(parsedKn5.root);
assert.equal(foundWheelCount, 4, 'All 4 AC standard wheel nodes must survive KN5 round-trip');
console.log(`PASS: KN5 Round-trip (${(kn5Bytes.byteLength / 1024).toFixed(1)} KB, 4 wheel nodes verified)`);

console.log('=== 5b. KsEditor/CSP Lossless KN5 Round-trip (MultiMap + DDS + Tangents + SkinnedMesh) ===');
const redDds = createSolidColorDds(220, 20, 40, 255);
const decodedRed = decodeDdsToRgba(redDds);
assert.ok(decodedRed && decodedRed.width === 4 && decodedRed.height === 4);
assert.equal(decodedRed.data[0], 220);
assert.equal(decodedRed.data[1], 20);
assert.equal(decodedRed.data[2], 40);

const complexDoc: Kn5Document = {
  version: 5,
  textures: [
    { type: 0, name: 'unused_empty_slot.dds', data: new Uint8Array(0) },
    { type: 1, name: 'car_paint_d.dds', data: redDds },
    { type: 1, name: 'car_paint_nm.dds', data: createSolidColorDds(128, 128, 255, 255) },
    { type: 1, name: 'car_paint_maps.dds', data: createSolidColorDds(180, 220, 200, 255) },
    { type: 1, name: 'glass_d.dds', data: createSolidColorDds(40, 60, 80, 120) },
  ],
  materials: [
    {
      name: 'EXT_Body_Paint',
      shader: 'ksPerPixelMultiMap_damage_dirt',
      blendMode: 0,
      alphaTested: false,
      depthMode: 0,
      properties: [
        { name: 'ksAmbient', valueA: 0.35, valueB: [0, 0], valueC: [0, 0, 0], valueD: [0, 0, 0, 0] },
        { name: 'ksDiffuse', valueA: 0.42, valueB: [0, 0], valueC: [0, 0, 0], valueD: [0, 0, 0, 0] },
        { name: 'fresnelC', valueA: 0.14, valueB: [0, 0], valueC: [0, 0, 0], valueD: [0, 0, 0, 0] },
        { name: 'fresnelMaxLevel', valueA: 0.88, valueB: [0, 0], valueC: [0, 0, 0], valueD: [0, 0, 0, 0] },
      ],
      textureMappings: [
        { name: 'txDiffuse', slot: 0, texture: 'car_paint_d.dds' },
        { name: 'txNormal', slot: 1, texture: 'car_paint_nm.dds' },
        { name: 'txMaps', slot: 2, texture: 'car_paint_maps.dds' },
      ],
    },
    {
      name: 'EXT_Windscreen',
      shader: 'ksWindscreen',
      blendMode: 1,
      alphaTested: false,
      depthMode: 1,
      properties: [
        { name: 'ksDiffuse', valueA: 0.12, valueB: [0, 0], valueC: [0, 0, 0], valueD: [0, 0, 0, 0] },
        { name: 'fresnelMaxLevel', valueA: 0.95, valueB: [0, 0], valueC: [0, 0, 0], valueD: [0, 0, 0, 0] },
      ],
      textureMappings: [{ name: 'txDiffuse', slot: 0, texture: 'glass_d.dds' }],
    },
  ],
  root: {
    nodeClass: 1,
    name: 'CAR_ROOT',
    active: true,
    transform: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
    children: [
      {
        nodeClass: 2,
        name: 'GEO_BODY',
        active: true,
        transform: new Float32Array(16),
        mesh: {
          castShadows: true,
          isVisible: true,
          isTransparent: false,
          positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
          normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
          uvs: new Float32Array([0, 0, 1, 0, 0, 1]),
          tangents: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]), // distinctive tangent [0,1,0]
          indices: new Uint16Array([0, 1, 2]),
          materialId: 0,
          layer: 0,
          lodIn: 0,
          lodOut: 1500,
          boundingSphereCenter: [0.33, 0.33, 0],
          boundingSphereRadius: 0.8,
          isRenderable: true,
        },
        children: [],
      },
      {
        nodeClass: 2,
        name: 'GEO_GLASS',
        active: true,
        transform: new Float32Array(16),
        mesh: {
          castShadows: false,
          isVisible: true,
          isTransparent: true,
          positions: new Float32Array([0, 1, 0, 1, 1, 0, 0, 2, 0]),
          normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
          uvs: new Float32Array([0, 0, 1, 0, 0, 1]),
          tangents: new Float32Array([1, 0, 0, 1, 0, 0, 1, 0, 0]),
          indices: new Uint16Array([0, 1, 2]),
          materialId: 1,
          layer: 1,
          lodIn: 0,
          lodOut: 800,
          boundingSphereCenter: [0.33, 1.33, 0],
          boundingSphereRadius: 0.8,
          isRenderable: true,
        },
        children: [],
      },
      {
        nodeClass: 3,
        name: 'GEO_DRIVER_SKINNED',
        active: true,
        transform: new Float32Array(16),
        mesh: {
          castShadows: true,
          isVisible: true,
          isTransparent: false,
          positions: new Float32Array([0, 0, 0, 0.5, 0, 0, 0, 0.5, 0]),
          normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
          uvs: new Float32Array([0, 0, 1, 0, 0, 1]),
          tangents: new Float32Array([1, 0, 0, 1, 0, 0, 1, 0, 0]),
          indices: new Uint16Array([0, 1, 2]),
          materialId: 0,
          layer: 0,
          lodIn: 0,
          lodOut: 2000,
          boundingSphereCenter: [0, 0, 0],
          boundingSphereRadius: 1,
          isRenderable: true,
          bones: [{ name: 'BONE_ROOT', transform: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) }],
          skinWeights: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
          skinIndices: new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
        },
        children: [],
      },
    ],
  },
};

const rawComplexBytes = buildKn5(complexDoc);
const parsedBefore = parseKn5(rawComplexBytes);
const threeScene = kn5ToThreeGroup(parsedBefore);
const resavedBytes = threeGroupToKn5(threeScene, parsedBefore.textures);
const parsedAfter = parseKn5(resavedBytes);

const bodyMat = parsedAfter.materials.find((m) => m.name === 'EXT_Body_Paint');
const glassMat = parsedAfter.materials.find((m) => m.name === 'EXT_Windscreen');
assert.ok(bodyMat, 'EXT_Body_Paint must survive round-trip');
assert.equal(bodyMat.shader, 'ksPerPixelMultiMap_damage_dirt');
assert.equal(bodyMat.textureMappings.length, 3);
assert.equal(bodyMat.textureMappings[0].texture, 'car_paint_d.dds');
assert.equal(bodyMat.textureMappings[1].texture, 'car_paint_nm.dds');
assert.equal(bodyMat.textureMappings[2].texture, 'car_paint_maps.dds');

assert.ok(glassMat, 'EXT_Windscreen must survive round-trip');
assert.equal(glassMat.shader, 'ksWindscreen');
assert.equal(glassMat.blendMode, 1);
assert.equal(glassMat.depthMode, 1);

const bodyNode = parsedAfter.root.children.find((c) => c.name === 'GEO_BODY');
const glassNode = parsedAfter.root.children.find((c) => c.name === 'GEO_GLASS');
const skinNode = parsedAfter.root.children.find((c) => c.name === 'GEO_DRIVER_SKINNED');
assert.ok(bodyNode && bodyNode.nodeClass === 2 && bodyNode.mesh);
assert.equal(bodyNode.mesh.tangents[1], 1, 'Original tangent [0,1,0] must be preserved!');
assert.equal(bodyNode.mesh.indices.length, 3, 'Indexed geometry must stay indexed!');
assert.ok(glassNode && glassNode.mesh);
assert.equal(glassNode.mesh.isTransparent, true);
assert.equal(glassNode.mesh.castShadows, false);
assert.equal(glassNode.mesh.layer, 1);
assert.ok(skinNode && skinNode.nodeClass === 3 && skinNode.mesh?.bones?.length === 1, 'SkinnedMesh & bones must survive!');
console.log('PASS: KsEditor/CSP Lossless KN5 Round-trip (MultiMap, Windscreen, DDS, Tangents, Flags, SkinnedMesh)');

console.log('=== 6. Engine Physics Simulator (All 10 Presets) & Car Patch Test ===');
for (const engPreset of ENGINE_SIM_PRESETS) {
  const res = simulateEngine(engPreset);
  assert.ok(res.peakPowerPs > 150 && res.peakPowerPs < 2500, `${engPreset.id} power out of range: ${res.peakPowerPs}`);
  assert.ok(res.firingAnglesDeg.length >= 3);
  assert.equal(res.primaryLengthsMm.length, res.firingAnglesDeg.length);
  console.log(
    `PASS EngineSim [${engPreset.id}]: ${res.displacementCc}cc / ${res.peakPowerPs} PS @ ${res.peakPowerRpm} / ${res.peakTorqueNm} Nm`
  );
}
const rb26 = ENGINE_SIM_PRESETS[1];
const rb26Res = simulateEngine(rb26);
const patchedFiles = applyEngineSimToCarFiles(rb26, rb26Res, base.files);
const patchedMetrics = computeCarPhysics(patchedFiles);
assert.ok(
  Math.abs(patchedMetrics.peakPowerPs - rb26Res.peakPowerPs) < rb26Res.peakPowerPs * 0.12,
  `Patched car physics (${patchedMetrics.peakPowerPs}) should match engine sim (${rb26Res.peakPowerPs})`
);
console.log(`PASS: EngineSim -> Car Patch verified (Sim ${rb26Res.peakPowerPs} PS vs Car ${patchedMetrics.peakPowerPs} PS)`);

console.log('=== 7. Engine-Sim Offline Sound Pack WAV + CSP Lua Runtime Test ===');
const soundPayload = buildEngineSoundExportPayload(rb26, rb26Res, DEFAULT_SOUND_SETTINGS);
assert.equal(
  soundPayload.samples.length,
  24,
  'Turbo export should produce 11 EXT + 11 INT loops + 1 BOV + 1 Backfire WAV (24 total)'
);
for (const sample of soundPayload.samples) {
  const hdr = new TextDecoder('ascii').decode(sample.wavBytes.subarray(0, 4));
  const wave = new TextDecoder('ascii').decode(sample.wavBytes.subarray(8, 12));
  assert.equal(hdr, 'RIFF');
  assert.equal(wave, 'WAVE');
  const minBytes = sample.loadType === 'fx' ? 30_000 : 100_000;
  assert.ok(sample.wavBytes.byteLength > minBytes, `${sample.fileName} WAV too small (${sample.wavBytes.byteLength})`);
  // Verify non-silent audio signal across sample
  const dv = new DataView(sample.wavBytes.buffer, sample.wavBytes.byteOffset + 44);
  const scanLen = Math.min(4000, Math.floor((sample.wavBytes.byteLength - 44) / 2));
  let maxAmp = 0;
  for (let i = 0; i < scanLen; i++) {
    const s = Math.abs(dv.getInt16(i * 2, true));
    if (s > maxAmp) maxAmp = s;
  }
  assert.ok(maxAmp > 1000 && maxAmp <= 32767, `${sample.fileName} audio amplitude out of range (${maxAmp})`);
}
assert.ok(soundPayload.extConfigIni.includes('[SCRIPT_...]'), 'ext_config.ini must register CSP [SCRIPT_...]');
assert.ok(
  soundPayload.extConfigIni.includes('SCRIPT = ac_car_studio_engine_sound.lua'),
  'ext_config.ini must load ac_car_studio_engine_sound.lua'
);
assert.ok(soundPayload.cspLuaScript.includes('ac.AudioEvent.fromFile'), 'Lua runtime must use ac.AudioEvent.fromFile');
assert.ok(soundPayload.cspLuaScript.includes('ac.CarAudioTweak.setVolume'), 'Lua runtime must silence stock engine via CarAudioTweak');
assert.ok(soundPayload.cspLuaScript.includes('function update(dt)'), 'Lua runtime must define update(dt)');
assert.ok(soundPayload.cspLuaScript.includes('function script.update(dt)'), 'Lua runtime must define script.update(dt)');
console.log(`PASS: Sound Pack + CSP Lua Synthesis (${soundPayload.samples.length} valid 16-bit PCM WAVs + EXT/INT Lua Runtime)`);

// Also test V8 Crossplane (NA) with H-Pipe + ITB + High Metallic Ringing & Gear Whine
const v8Cross = ENGINE_SIM_PRESETS.find((p) => p.id === 'v8_crossplane_62')!;
const v8Res = simulateEngine(v8Cross);
const v8Sound = buildEngineSoundExportPayload(v8Cross, v8Res, {
  ...DEFAULT_SOUND_SETTINGS,
  crossoverType: 'H_PIPE',
  intakeType: 'ITB_INDIVIDUAL',
  interferenceStrength: 1.2,
  exhaustRasp: 0.9,
  mechanicalLevel: 1.0,
  metallicRinging: 1.1,
  gearWhineLevel: 0.6,
});
assert.equal(v8Sound.samples.length, 23, 'NA export should produce 11 EXT + 11 INT + 1 Backfire WAV (23 total)');
for (const s of v8Sound.samples) {
  const dv = new DataView(s.wavBytes.buffer, s.wavBytes.byteOffset + 44);
  const scanLen = Math.min(4000, Math.floor((s.wavBytes.byteLength - 44) / 2));
  let maxAmp = 0;
  for (let i = 0; i < scanLen; i++) {
    const val = Math.abs(dv.getInt16(i * 2, true));
    if (val > maxAmp) maxAmp = val;
  }
  assert.ok(maxAmp > 1000 && maxAmp <= 32767, `Invalid amplitude ${maxAmp} in ${s.fileName}`);
}
console.log('PASS: Engine-Sim v4 Detailed Sound (Dual EXT/INT + ITB + Metallic + H-Pipe Interference)');

console.log('=== 8. Part Extraction, Safe Texture Namespace Merge & 4-Wheel Swap Test ===');
assert.equal(detectPartCategory('WHEEL_LF'), 'wheel');
assert.equal(detectPartCategory('STEER_HR'), 'steering');
assert.equal(detectPartCategory('BUCKET_SEAT_L'), 'seat');
assert.equal(detectPartCategory('REAR_WING'), 'wing');

const donorCar = buildProceduralCarGroup({
  wheelbase: 2.55,
  frontTrack: 1.50,
  rearTrack: 1.50,
  frontRadius: 0.30,
  rearRadius: 0.30,
  frontWidth: 0.23,
  rearWidth: 0.23,
});
const donorWheelLf = donorCar.getObjectByName('WHEEL_LF')!;
assert.ok(donorWheelLf);
const extractedWheel = extractPartSubtreeToKn5(donorWheelLf, []);
assert.ok(extractedWheel.kn5Bytes.byteLength > 2000);
assert.equal(extractedWheel.sourceSide, 'left');

// Swap all 4 wheels on a different target car (larger 19-inch diameter)
const targetCar = buildProceduralCarGroup({
  wheelbase: 2.75,
  frontTrack: 1.64,
  rearTrack: 1.66,
  frontRadius: 0.34,
  rearRadius: 0.35,
  frontWidth: 0.26,
  rearWidth: 0.29,
});
const swapRes = replaceAllFourWheels(
  targetCar,
  extractedWheel.kn5Bytes,
  {
    id: 'part_wheel_test01',
    name: 'Test 5-Spoke Wheel',
    category: 'wheel',
    sourceCarId: 'donor_car',
    sourceNodeName: 'WHEEL_LF',
    sourceSide: extractedWheel.sourceSide,
    bboxSize: extractedWheel.bboxSize,
    sizeBytes: extractedWheel.kn5Bytes.byteLength,
    createdAt: new Date().toISOString(),
  },
  [],
  true
);
assert.equal(swapRes.replacedCount, 4, 'All 4 wheels must be swapped');

// Verify texture collision protection when merging a part with conflicting texture name
const targetTex = [{ type: 1, name: 'car_paint_d.dds', data: createSolidColorDds(10, 20, 240, 255) }];
const extractedPartWithTex = extractPartSubtreeToKn5(threeScene.getObjectByName('GEO_BODY')!, parsedBefore.textures);
const instRes = instantiateSavedPartForCar(extractedPartWithTex.kn5Bytes, 'part_coltest', targetTex);
assert.ok(instRes.addedTextures >= 1, 'Conflicting texture must be safely namespaced & added');
assert.ok(
  instRes.mergedTextures.some((t) => t.name === 'car_paint_d.dds') &&
    instRes.mergedTextures.some((t) => t.name.includes('car_paint_d.dds') && t.name !== 'car_paint_d.dds'),
  'Original car texture must stay untouched while imported part texture is namespaced'
);

// Export the 4-wheel-swapped car back to valid KN5
const swappedCarKn5 = threeGroupToKn5(targetCar, swapRes.mergedTextures);
const parsedSwapped = parseKn5(swappedCarKn5);
let swappedWheelCount = 0;
const countSwappedWheels = (n: typeof parsedSwapped.root) => {
  if (/^WHEEL_(LF|RF|LR|RR)$/.test(n.name)) swappedWheelCount++;
  for (const ch of n.children) countSwappedWheels(ch);
};
countSwappedWheels(parsedSwapped.root);
assert.equal(swappedWheelCount, 4, 'All 4 AC wheel node names must survive swap + KN5 export');

// Multi-part Shift+Click selection deduplication & combined KN5 extraction test
{
  const multiScene = new THREE.Group();
  const groupA = new THREE.Group();
  groupA.name = 'AERO_KIT_FRONT';
  const childA = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.1, 0.4),
    new THREE.MeshStandardMaterial({ color: '#111111' })
  );
  childA.name = 'SPLITTER_MAIN';
  childA.position.set(0, 0.2, 2.0);
  groupA.add(childA);

  const partB = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.2, 0.3),
    new THREE.MeshStandardMaterial({ color: '#e11d48' })
  );
  partB.name = 'REAR_WING_BLADE';
  partB.position.set(0, 1.2, -2.0);

  multiScene.add(groupA, partB);
  multiScene.updateMatrixWorld(true);

  // Deduplication: selecting groupA + childA + partB must collapse to [groupA, partB]
  const deduped = deduplicateSelectedObjects([groupA, childA, partB, partB]);
  assert.equal(deduped.length, 2, 'Ancestor+child & duplicate UUIDs must deduplicate to 2 root parts');

  const multiRes = extractMultiplePartsToKn5([groupA, childA, partB], []);
  assert.equal(multiRes.partCount, 2, 'Multi-part extraction must bundle 2 deduplicated parts');
  assert.ok(multiRes.bboxSize[2] > 3.8, `Combined Z span must preserve relative distance (~4.35m), got ${multiRes.bboxSize[2]}`);
  const parsedMulti = parseKn5(multiRes.kn5Bytes);
  let foundSplitter = false;
  let foundWing = false;
  const walkMulti = (n: typeof parsedMulti.root) => {
    if (n.name === 'SPLITTER_MAIN') foundSplitter = true;
    if (n.name === 'REAR_WING_BLADE') foundWing = true;
    for (const c of n.children) walkMulti(c);
  };
  walkMulti(parsedMulti.root);
  assert.ok(foundSplitter && foundWing, 'Extracted multi-part KN5 must contain BOTH selected parts');
}
console.log('PASS: Part Library Extraction (Single + Multi-Part), Texture Collision Protection & 4-Wheel Swap');

console.log('=== 9. Livery Studio DDS Encode, OEM Catalog, Interior/Plastic Surface Maps & Multi-Material CSP Test ===');
assert.ok(PAINT_MATERIAL_PRESETS.length >= 25, `Expected >= 25 material presets, got ${PAINT_MATERIAL_PRESETS.length}`);
assert.ok(OEM_MANUFACTURERS.length >= 12, 'Should include at least 12 major car manufacturers');
assert.ok(OEM_COLOR_FAMILIES.length >= 9, 'Should include all coarse color families');
assert.ok(OEM_PAINT_COLORS.length >= 75, `Expected >= 75 OEM paint colors, got ${OEM_PAINT_COLORS.length}`);

// Verify interior & plastic moulded presets exist
const alcantaraPreset = PAINT_MATERIAL_PRESETS.find((p) => p.id === 'alcantara_black')!;
const nappaPreset = PAINT_MATERIAL_PRESETS.find((p) => p.id === 'leather_nappa_black')!;
const synthPreset = PAINT_MATERIAL_PRESETS.find((p) => p.id === 'leather_synth_black')!;
const mouldedBlackPreset = PAINT_MATERIAL_PRESETS.find((p) => p.id === 'plastic_moulded_black')!;
assert.ok(alcantaraPreset && alcantaraPreset.params.surfacePattern === 'alcantara');
assert.ok(nappaPreset && nappaPreset.params.surfacePattern === 'leather_nappa');
assert.ok(synthPreset && synthPreset.params.surfacePattern === 'leather_synthetic');
assert.ok(mouldedBlackPreset && mouldedBlackPreset.params.surfacePattern === 'plastic_moulded');

const sampleRgba = new Uint8Array([255, 10, 40, 255, 10, 200, 255, 255, 255, 255, 0, 255, 0, 0, 0, 255]);
const ddsBuf = encodeRgbaToDds(2, 2, sampleRgba);
const decDds = decodeDdsToRgba(ddsBuf);
assert.ok(decDds && decDds.width === 2 && decDds.height === 2);
assert.equal(decDds.data[0], 255);
assert.equal(decDds.data[1], 10);
assert.equal(decDds.data[2], 40);
assert.equal(decDds.data[5], 200);

const candyPreset = PAINT_MATERIAL_PRESETS.find((p) => p.id === 'candy')!;
const extIni = buildSkinExtConfigIni('EXT_Body_Paint', {
  presetId: 'candy',
  baseColor: '#d90429',
  secondaryColor: '#ff758f',
  useGradient: false,
  gradientAngleDeg: 0,
  baseTextureBlend: 0.4,
  ...candyPreset.params,
});
assert.ok(extIni.includes('MATERIALS = EXT_Body_Paint'));
assert.ok(extIni.includes('extColoredReflection'));

const carbonPreset = PAINT_MATERIAL_PRESETS.find((p) => p.id === 'gloss_carbon')!;
const carbonIni = buildSkinExtConfigIni(
  'EXT_Hood_Carbon',
  {
    presetId: 'gloss_carbon',
    baseColor: '#48505c',
    secondaryColor: '#6b7280',
    useGradient: false,
    gradientAngleDeg: 0,
    baseTextureBlend: 0.4,
    ...carbonPreset.params,
  },
  { diffuseTexName: 'skin_body.dds' }
);
assert.ok(carbonIni.includes('[SHADER_REPLACEMENT_ACCS_SKIN_0]'));
assert.ok(carbonIni.includes('SHADER = ksPerPixelMultiMap_NMDetail'));
assert.ok(carbonIni.includes('FILLING_MISSING_TEXTURES = 1'));
assert.ok(carbonIni.includes('useDetail, 1'));
assert.ok(carbonIni.includes('detailUVMultiplier, 60'));
assert.ok(carbonIni.includes('RESOURCE_FILE_0 = skin_body.dds'));
assert.ok(carbonIni.includes('RESOURCE_FILE_1 = carbon_detail.dds'));
assert.ok(carbonIni.includes('RESOURCE_FILE_2 = carbon_detail_nm.dds'));

// Verify Multi-Material ext_config.ini (Body + Alcantara Steering + Moulded Black Plastic Trim)
const multiIni = buildMultiMaterialSkinExtConfigIni([
  {
    materialName: 'EXT_Body_Paint',
    paintState: {
      presetId: 'candy',
      baseColor: '#003399',
      secondaryColor: '#3b82f6',
      useGradient: false,
      gradientAngleDeg: 0,
      baseTextureBlend: 0.4,
      ...candyPreset.params,
    },
  },
  {
    materialName: 'INT_Steering_Alcantara',
    paintState: {
      presetId: 'alcantara_black',
      baseColor: '#22242a',
      secondaryColor: '#333640',
      useGradient: false,
      gradientAngleDeg: 0,
      baseTextureBlend: 0.5,
      ...alcantaraPreset.params,
    },
    diffuseTexName: 'int_steer.dds',
  },
  {
    materialName: 'EXT_Plastic_Trim',
    paintState: {
      presetId: 'plastic_moulded_black',
      baseColor: '#1a1c20',
      secondaryColor: '#272a30',
      useGradient: false,
      gradientAngleDeg: 0,
      baseTextureBlend: 0.5,
      ...mouldedBlackPreset.params,
    },
    diffuseTexName: 'ext_plastic.dds',
  },
]);
assert.ok(multiIni.includes('[SHADER_REPLACEMENT_ACCS_SKIN_0]'));
assert.ok(multiIni.includes('[SHADER_REPLACEMENT_ACCS_SKIN_1]'));
assert.ok(multiIni.includes('[SHADER_REPLACEMENT_ACCS_SKIN_2]'));
assert.ok(multiIni.includes('RESOURCE_FILE_1 = alcantara_detail.dds'));
assert.ok(multiIni.includes('RESOURCE_FILE_2 = alcantara_detail_nm.dds'));
assert.ok(multiIni.includes('RESOURCE_FILE_1 = plastic_moulded_detail.dds'));

const carbonFiles = buildCarbonMaterialDdsFiles({ detailTexName: 'metal_detail.dds' });
assert.equal(carbonFiles.length, 3, 'Should include carbon_detail.dds, carbon_detail_nm.dds, and native metal_detail.dds');
for (const cf of carbonFiles) {
  const dec = decodeDdsToRgba(cf.bytes);
  assert.ok(dec && dec.width === 512 && dec.height === 512, `${cf.fileName} must be valid 512x512 DDS`);
  const mipCount = new DataView(cf.bytes.buffer, cf.bytes.byteOffset).getUint32(28, true);
  assert.equal(mipCount, 10, `${cf.fileName} must contain full 10-level mipmap chain for DX11/AC`);
}

for (const pat of ['alcantara', 'leather_nappa', 'leather_synthetic', 'plastic_moulded'] as const) {
  const pFiles = buildSurfacePatternDdsFiles(pat);
  assert.equal(pFiles.length, 2, `${pat} should produce detail and detail_nm DDS`);
  const dec = decodeDdsToRgba(pFiles[0].bytes);
  assert.ok(dec && dec.width === 512 && dec.height === 512, `${pFiles[0].fileName} must be valid 512x512 DDS`);
}
console.log('PASS: Livery Studio OEM Paint Catalog, Interior/Plastic Surface Maps & Multi-Material Skin Export');

console.log('=== 10. Suspension Kinematics, Load Sweep (Camber/Toe/RideHeight) & Roll Behavior Test ===');
const suspKinInput = extractSuspensionKinematicsInput(base.files);
const suspAnalysis = analyzeSuspensionKinematics(suspKinInput);
assert.equal(suspAnalysis.loadSweep.length, 23, 'Load sweep should cover 0.2x to 2.4x in 0.1 steps');
assert.equal(suspAnalysis.rollSweep.length, 19, 'Roll sweep should cover 0.0G to 1.8G in 0.1G steps');
assert.ok(
  suspAnalysis.loadSweep[22].frontCamberDeg < suspAnalysis.loadSweep[0].frontCamberDeg,
  'Negative camber should gain under heavy vertical compression load'
);
assert.ok(
  suspAnalysis.loadSweep[22].frontRideHeightMm < suspAnalysis.loadSweep[0].frontRideHeightMm,
  'Ride height must decrease under heavy vertical load'
);
assert.ok(
  suspAnalysis.rollSweep[15].rollAngleDeg > 0.5 && suspAnalysis.rollSweep[15].rollAngleDeg < 8.0,
  `Roll angle at 1.5G out of expected range: ${suspAnalysis.rollSweep[15].rollAngleDeg}`
);
assert.ok(
  suspAnalysis.rollSweep[15].frontOuterLoadKgf > suspAnalysis.rollSweep[15].frontInnerLoadKgf,
  'Outer wheel must carry higher vertical load during cornering roll'
);
const livePosture = computeLiveSuspensionPosture(suspAnalysis, 1.4, 1.2, 0);
assert.ok(livePosture.chassisRollDeg > 0.5, 'Live posture must compute positive roll angle at +1.2G');
assert.ok(
  livePosture.wheels.LF.loadKgf > livePosture.wheels.RF.loadKgf,
  'Left outer wheel (LF) must carry more load than right inner wheel (RF) at +1.2G'
);
console.log(
  `PASS: Suspension Kinematics & Roll Telemetry (Roll Gradient ${suspAnalysis.rollGradientDegPerG} deg/G, Front LLTD ${suspAnalysis.frontRollStiffnessSharePct}%)`
);

console.log('=== 11. Undo/Redo HistoryStack (Coalescing + Eviction) & Mouse NavHistoryStack Test ===');
const evictedItems: string[] = [];
const hist = new HistoryStack<{ before: number; after: number; tag: string }>({
  maxEntries: 3,
  coalesceMs: 400,
  onEvict: (v) => evictedItems.push(v.tag),
});
// Coalesced rapid slider drag collapses into 1 crisp undo step
hist.push({ before: 10, after: 12, tag: 'drag1' }, {
  label: 'Spring',
  coalesceKey: 'k1',
  now: 1000,
  mergeCoalesced: (e, inc) => ({ before: e.before, after: inc.after, tag: inc.tag }),
});
hist.push({ before: 12, after: 18, tag: 'drag2' }, {
  label: 'Spring',
  coalesceKey: 'k1',
  now: 1250,
  mergeCoalesced: (e, inc) => ({ before: e.before, after: inc.after, tag: inc.tag }),
});
assert.equal(hist.undoCount, 1, 'Coalesced slider edits should form 1 undo entry');
const u1 = hist.undo();
assert.ok(u1 && u1.value.before === 10 && u1.value.after === 18);
assert.equal(hist.canUndo, false);
assert.equal(hist.canRedo, true);
const r1 = hist.redo();
assert.ok(r1 && r1.value.after === 18);
// Push new edit after undo clears redo branch and invokes onEvict
hist.undo();
hist.push({ before: 10, after: 25, tag: 'branch' }, { now: 2000 });
assert.equal(hist.canRedo, false);
assert.ok(evictedItems.includes('drag2'), 'Discarded redo entry must trigger onEvict');
// Cap eviction test
hist.push({ before: 25, after: 30, tag: 'e2' }, { now: 3000 });
hist.push({ before: 30, after: 35, tag: 'e3' }, { now: 4000 });
hist.push({ before: 35, after: 40, tag: 'e4' }, { now: 5000 });
assert.equal(hist.undoCount, 3);
assert.ok(evictedItems.includes('branch'), 'Oldest entry past maxEntries must trigger onEvict');

// Navigation Back/Forward History Stack test (Mouse Side Buttons)
const nav = new NavHistoryStack<{ screen: string; tab?: string }>(
  { screen: 'home' },
  (a, b) => a.screen === b.screen && a.tab === b.tab
);
assert.equal(nav.canBack, false);
assert.equal(nav.push({ screen: 'home' }), false, 'Duplicate consecutive route must be ignored');
assert.equal(nav.push({ screen: 'car_select' }), true);
assert.equal(nav.push({ screen: 'workspace', tab: 'suspension' }), true);
assert.equal(nav.push({ screen: 'workspace', tab: 'livery' }), true);
assert.equal(nav.canBack, true);
assert.equal(nav.canForward, false);
assert.deepEqual(nav.back(), { screen: 'workspace', tab: 'suspension' });
assert.deepEqual(nav.back(), { screen: 'car_select' });
assert.equal(nav.canForward, true);
assert.deepEqual(nav.forward(), { screen: 'workspace', tab: 'suspension' });
// Branching forward clears stale future
nav.push({ screen: 'workspace', tab: 'model3d' });
assert.equal(nav.canForward, false);
assert.deepEqual(nav.current, { screen: 'workspace', tab: 'model3d' });

// Editable text vs numeric/slider target detection
assert.equal(isUndoRedoEditableTextTarget({ tagName: 'TEXTAREA' } as unknown as EventTarget), true);
assert.equal(isUndoRedoEditableTextTarget({ tagName: 'INPUT', type: 'text' } as unknown as EventTarget), true);
assert.equal(isUndoRedoEditableTextTarget({ tagName: 'INPUT', type: 'range' } as unknown as EventTarget), false);
assert.equal(isUndoRedoEditableTextTarget({ tagName: 'INPUT', type: 'number' } as unknown as EventTarget), false);
assert.equal(isUndoRedoEditableTextTarget({ tagName: 'CANVAS' } as unknown as EventTarget), false);
console.log('PASS: Undo/Redo HistoryStack & Mouse Side-Button NavHistoryStack verified');

console.log('=== 12. 3D Mesh UV Mask (DirectX V + Zero-Seam) & GT7 3D Decal Projection Math Test ===');
{
  // 12a. DirectX V orientation (NO 1-v flip), winding normalization & no edge-bleed at u==1.0
  const geom1 = new THREE.BufferGeometry();
  geom1.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3)
  );
  // Intentionally negative 2D signed UV area & touching u == 1.0 edge
  geom1.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute([0.2, 0.1, 0.2, 0.3, 1.0, 0.1], 2)
  );
  const mesh1 = new THREE.Mesh(geom1, new THREE.MeshStandardMaterial());
  const tris1 = extractMeshUvTriangles(mesh1);
  assert.equal(tris1.length, 6, 'Triangle touching u=1.0 must emit exactly 1 triangle (zero u=0 edge bleed)');
  const vs1 = [tris1[1], tris1[3], tris1[5]];
  assert.ok(
    Math.min(...vs1) >= 0.09 && Math.max(...vs1) <= 0.31,
    `DirectX V coords must stay in [0.1, 0.3] without 1-v inversion, got ${vs1.join(',')}`
  );
  const signedArea1 =
    (tris1[2] - tris1[0]) * (tris1[5] - tris1[1]) - (tris1[3] - tris1[1]) * (tris1[4] - tris1[0]);
  assert.ok(signedArea1 > 0, `2D UV triangle winding must be normalized positive (got ${signedArea1})`);

  // 12b. UV seam-crossing triangle [0.85 .. 1.15] emits 2 wrapped copies intersecting [0, 1]
  const geomSeam = new THREE.BufferGeometry();
  geomSeam.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3)
  );
  geomSeam.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute([0.85, 0.2, 1.15, 0.2, 0.95, 0.4], 2)
  );
  const trisSeam = extractMeshUvTriangles(new THREE.Mesh(geomSeam, new THREE.MeshStandardMaterial()));
  assert.equal(trisSeam.length, 12, 'Seam-crossing triangle spanning [0.85, 1.15] must emit 2 wrapped UV copies');

  // 12c. GT7 Camera & Surface 3D Projection orthonormal basis (side view + top-down roof view)
  const checkOrtho = (p: ReturnType<typeof buildDecalProjection3D>, label: string) => {
    const f = new THREE.Vector3(...p.forward);
    const r = new THREE.Vector3(...p.right);
    const u = new THREE.Vector3(...p.up);
    assert.ok(Math.abs(f.length() - 1) < 1e-3, `${label}: forward must be unit length`);
    assert.ok(Math.abs(r.length() - 1) < 1e-3, `${label}: right must be unit length`);
    assert.ok(Math.abs(u.length() - 1) < 1e-3, `${label}: up must be unit length`);
    assert.ok(Math.abs(f.dot(r)) < 1e-3, `${label}: forward ⟂ right`);
    assert.ok(Math.abs(f.dot(u)) < 1e-3, `${label}: forward ⟂ up`);
    assert.ok(Math.abs(r.dot(u)) < 1e-3, `${label}: right ⟂ up`);
  };

  const sideCamProj = buildDecalProjection3D({
    hitPoint: new THREE.Vector3(0.88, 0.78, 0.12),
    surfaceNormal: new THREE.Vector3(1, 0.08, 0).normalize(),
    cameraPosition: new THREE.Vector3(4.8, 1.05, 0.12),
    cameraUp: new THREE.Vector3(0, 1, 0),
    mode: 'camera',
    widthM: 0.55,
    heightM: 0.42,
    depthM: 0.35,
    angleLimitDeg: 70,
  });
  checkOrtho(sideCamProj, 'Side Camera Mode');
  assert.ok(sideCamProj.forward[0] < -0.95, 'Side camera projection must fire inward along -X');

  const roofTopProj = buildDecalProjection3D({
    hitPoint: new THREE.Vector3(0, 1.24, -0.1),
    surfaceNormal: new THREE.Vector3(0, 1, 0),
    cameraPosition: new THREE.Vector3(0, 5.8, -0.1),
    cameraUp: new THREE.Vector3(0, 0, -1),
    mode: 'surface',
    widthM: 0.9,
    heightM: 0.6,
  });
  checkOrtho(roofTopProj, 'Top-Down Roof Surface Mode');
  assert.ok(roofTopProj.forward[1] < -0.99, 'Roof surface projection must fire downward along -Y');

  // 12d. GT7 Opposite-Side X=0 Mirroring (Symmetric vs Readable Text)
  const symMirror = mirrorDecalProjectionAcrossX(sideCamProj, 25, false, false);
  checkOrtho(symMirror.projection3d, 'Symmetric Mirror');
  assert.ok(Math.abs(symMirror.projection3d.origin[0] + 0.88) < 1e-3, 'Mirror must reflect origin.x across X=0');
  assert.ok(symMirror.projection3d.forward[0] > 0.95, 'Mirror forward must flip to +X into left door');
  assert.equal(symMirror.flipX, true, 'Symmetric mirror must toggle flipX');
  assert.equal(symMirror.rotationDeg, -25, 'Symmetric mirror must negate rotationDeg');

  const readableMirror = mirrorDecalProjectionAcrossX(sideCamProj, 25, false, true);
  checkOrtho(readableMirror.projection3d, 'Readable Text Mirror');
  assert.ok(Math.abs(readableMirror.projection3d.origin[0] + 0.88) < 1e-3);
  assert.equal(readableMirror.flipX, false, 'Readable opposite-side duplicate must preserve flipX');
  assert.equal(readableMirror.rotationDeg, 25, 'Readable opposite-side duplicate must preserve rotationDeg');

  // 12e. High-poly mesh (40,000 tris) MUST extract ALL triangles with zero subsampling/skipping
  const hiPolyTris = 40000;
  const hiPos = new Float32Array(hiPolyTris * 9);
  const hiUv = new Float32Array(hiPolyTris * 6);
  for (let t = 0; t < hiPolyTris; t++) {
    const off = t * 6;
    const gx = (t % 200) / 200;
    const gy = Math.floor(t / 200) / 200;
    hiUv[off] = gx;
    hiUv[off + 1] = gy;
    hiUv[off + 2] = gx + 0.004;
    hiUv[off + 3] = gy;
    hiUv[off + 4] = gx;
    hiUv[off + 5] = gy + 0.004;
  }
  const hiGeom = new THREE.BufferGeometry();
  hiGeom.setAttribute('position', new THREE.BufferAttribute(hiPos, 3));
  hiGeom.setAttribute('uv', new THREE.BufferAttribute(hiUv, 2));
  const hiExtracted = extractMeshUvTriangles(new THREE.Mesh(hiGeom, new THREE.MeshStandardMaterial()));
  assert.equal(
    hiExtracted.length,
    hiPolyTris * 6,
    `High-poly mesh must extract 100% of ${hiPolyTris} triangles without skipping (got ${hiExtracted.length / 6})`
  );

  // 12f. Subdivided 20x20 quad grid (800 adjacent triangles) must rasterize 100% SOLID with ZERO unpainted base-color gaps
  const gridN = 20;
  const gridPos: number[] = [];
  const gridUv: number[] = [];
  for (let gy = 0; gy < gridN; gy++) {
    for (let gx = 0; gx < gridN; gx++) {
      const u0 = 0.1 + (gx / gridN) * 0.8;
      const u1 = 0.1 + ((gx + 1) / gridN) * 0.8;
      const v0 = 0.1 + (gy / gridN) * 0.8;
      const v1 = 0.1 + ((gy + 1) / gridN) * 0.8;
      // 2 triangles per quad (intentionally mixed winding to verify zero winding holes)
      gridPos.push(0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0);
      gridUv.push(u0, v0, u1, v0, u1, v1, u0, v0, u0, v1, u1, v1);
    }
  }
  const gridGeom = new THREE.BufferGeometry();
  gridGeom.setAttribute('position', new THREE.Float32BufferAttribute(gridPos, 3));
  gridGeom.setAttribute('uv', new THREE.Float32BufferAttribute(gridUv, 2));
  const gridTris = extractMeshUvTriangles(new THREE.Mesh(gridGeom, new THREE.MeshStandardMaterial()));
  assert.equal(gridTris.length, gridN * gridN * 2 * 6);
  const gridMask = rasterizeUvTrianglesToMask(gridTris, 256, 256, 1);
  let missedInteriorPx = 0;
  for (let py = 27; py <= 229; py++) {
    for (let px = 27; px <= 229; px++) {
      if (gridMask.mask[py * 256 + px] !== 255) missedInteriorPx++;
    }
  }
  assert.equal(
    missedInteriorPx,
    0,
    `Zero unpainted interior base-color pixels/triangles allowed inside mesh grid (missed: ${missedInteriorPx})`
  );
  assert.equal(gridMask.mask[5 * 256 + 5], 0, 'Mask must stay 0 outside the mesh UV island');

  // 12g. Tiled UV triangle spanning > 1.2 UV units must NOT be skipped
  const tiledGeom = new THREE.BufferGeometry();
  tiledGeom.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  tiledGeom.setAttribute('uv', new THREE.Float32BufferAttribute([0.1, 0.2, 2.3, 0.2, 0.1, 0.5], 2));
  const tiledTris = extractMeshUvTriangles(new THREE.Mesh(tiledGeom, new THREE.MeshStandardMaterial()));
  assert.ok(tiledTris.length >= 18, `Tiled UV triangle spanning [0.1, 2.3] must emit wrapped copies (got ${tiledTris.length / 6})`);

  // 12h. Default Skin Resolution 4096x4096 & selectable resolution presets [1024, 2048, 4096, 8192]
  assert.equal(DEFAULT_SKIN_EXPORT_RESOLUTION, 4096, 'Default skin export resolution must be 4096x4096');
  assert.equal(DEFAULT_TEXTURE_ADJUSTMENTS.exportResolution, 4096);
  assert.deepEqual([...SKIN_EXPORT_RESOLUTIONS], [1024, 2048, 4096, 8192]);
}
console.log('PASS: 3D Mesh UV Mask (DirectX V + Zero-Seam + Zero-Gap Rasterizer), 4096px Default & GT7 3D Decal Projection Math verified');

console.log('=== 13. CSP AT & CVT Transmission Generator, Parser & Author Lua Preservation Test ===');
{
  const customAuthorLua = '-- Custom user dash script\nlocal userCounter = 0\nfunction script.update(dt)\n  userCounter = userCounter + dt\nend\n';
  const baseWithAuthorLua = { ...base.files, 'script.lua': customAuthorLua };

  // 13a. Apply 8-Speed Sport CSP AT
  const atPreset = CSP_TRANSMISSION_PRESETS.find((p) => p.id === 'at_8_sport')!;
  const atCfg = {
    mode: 'csp_at' as const,
    at: { ...createDefaultAtConfig(), ...(atPreset.apply(8000, 900).at ?? {}) },
    cvt: createDefaultCvtConfig(8000, 900),
  };
  const atFiles = applyCspTransmissionToFiles(baseWithAuthorLua, atCfg, {
    maxRpm: 8000,
    idleRpm: 900,
    regenerateGearRatios: true,
  });
  assert.equal(getIniValue(atFiles['car.ini'], 'HEADER', 'VERSION', ''), 'extended-2', 'CSP AT must enable VERSION=extended-2');
  assert.equal(getIniNumber(atFiles['drivetrain.ini'], 'GEARS', 'COUNT', 0), 8, '8AT must have 8 forward gears');
  assert.ok(atFiles['drivetrain.ini'].includes('[SCRIPT_AUTOMATIC_GEARBOX]'));
  assert.ok(atFiles['script.lua'].includes('shared/physics/automatic-transmission'));
  assert.ok(atFiles['script.lua'].includes('local userCounter = 0'), 'Must preserve pre-existing author Lua');
  const parsedAt = parseCspTransmissionFromFiles(atFiles, 8000, 900);
  assert.equal(parsedAt.mode, 'csp_at');
  assert.equal(parsedAt.at.gears, 8);
  assert.equal(computeCarPhysics(atFiles).transmissionMode, 'csp_at');

  // 13b. Switch to 14-Step CSP CVT (D-Step)
  const cvtPreset = CSP_TRANSMISSION_PRESETS.find((p) => p.id === 'cvt_step7')!;
  const cvtPatch = cvtPreset.apply(8000, 900);
  const cvtCfg = {
    mode: 'csp_cvt' as const,
    at: createDefaultAtConfig(),
    cvt: { ...createDefaultCvtConfig(8000, 900), ...(cvtPatch.cvt ?? {}) },
  };
  const cvtRatios = generateCvtRatioTable(cvtCfg.cvt);
  assert.equal(cvtRatios.length, 14);
  for (let i = 1; i < cvtRatios.length; i++) {
    assert.ok(cvtRatios[i] < cvtRatios[i - 1], 'CVT virtual pulley ratios must decrease monotonically');
  }
  const cvtFiles = applyCspTransmissionToFiles(atFiles, cvtCfg, {
    maxRpm: 8000,
    idleRpm: 900,
    regenerateGearRatios: true,
  });
  assert.ok(!cvtFiles['drivetrain.ini'].includes('[SCRIPT_AUTOMATIC_GEARBOX]'), 'CVT must remove AT section');
  assert.ok(cvtFiles['drivetrain.ini'].includes('[SCRIPT_CVT]'));
  assert.equal(getIniNumber(cvtFiles['drivetrain.ini'], 'GEARS', 'COUNT', 0), 14);
  assert.ok(cvtFiles['script.lua'].includes('_acStudioTxMode = "csp_cvt"'));
  assert.ok(cvtFiles['script.lua'].includes('local userCounter = 0'), 'CVT switch must preserve author Lua');
  const parsedCvt = parseCspTransmissionFromFiles(cvtFiles, 8000, 900);
  assert.equal(parsedCvt.mode, 'csp_cvt');
  assert.equal(parsedCvt.cvt.virtualSteps, 14);
  assert.equal(parsedCvt.cvt.steppedShiftMode, true);
  assert.equal(computeCarPhysics(cvtFiles).gears.length, 14, 'physicsCalc must compute all 14 CVT virtual ratios');

  // 13c. Revert back to Manual cleanly
  const mtFiles = applyCspTransmissionToFiles(cvtFiles, {
    ...cvtCfg,
    mode: 'manual',
  });
  assert.equal(parseCspTransmissionFromFiles(mtFiles, 8000, 900).mode, 'manual');
  assert.ok(!mtFiles['script.lua'].includes('_acStudioTxMode'), 'Manual revert must strip CSP TX block');
  assert.ok(mtFiles['script.lua'].includes('local userCounter = 0'), 'Manual revert must keep original author Lua');
}
console.log('PASS: CSP AT & CVT Transmission Generation, Round-Trip Parsing & Author Lua Preservation');

console.log('=== 14. Hybrid Electric Motor + Regenerative Braking + Unified CSP Lua Coexistence Test ===');
{
  const baseMetrics = computeCarPhysics(base.files);
  // First enable CSP CVT, then layer Sport PHEV Hybrid on top!
  const cvtFiles = applyCspTransmissionToFiles(
    base.files,
    {
      mode: 'csp_cvt',
      at: createDefaultAtConfig(),
      cvt: createDefaultCvtConfig(baseMetrics.maxRpm, baseMetrics.idleRpm),
    },
    { maxRpm: baseMetrics.maxRpm, idleRpm: baseMetrics.idleRpm, regenerateGearRatios: true }
  );

  const phevPreset = HYBRID_PRESETS.find((p) => p.id === 'sport_phev')!;
  const phevCfg = phevPreset.build(baseMetrics.maxRpm);
  const hybridFiles = applyHybridSystemToFiles(cvtFiles, phevCfg);

  for (const reqFile of HYBRID_MANAGED_FILES) {
    assert.ok(hybridFiles[reqFile] && hybridFiles[reqFile].trim().length > 0, `${reqFile} must be generated`);
  }
  assert.equal(getIniNumber(hybridFiles['ers.ini'], 'KINETIC', 'BRAKE_REAR_CORRECTION', 0), 1);
  assert.equal(getIniNumber(hybridFiles['ers.ini'], 'KINETIC', 'HAS_BUTTON_OVERRIDE', 0), 1);
  assert.ok(hybridFiles['ctrl_ers_0.ini'].includes('Eco / Charge'));
  assert.ok(hybridFiles['ctrl_ers_2.ini'].includes('Sport / Attack'));

  // Unified script.lua must contain BOTH CVT and Hybrid blocks without overwriting either!
  assert.ok(hybridFiles['script.lua'].includes('_acStudioUpdateTx(dt)'), 'Unified Lua must dispatch CVT');
  assert.ok(hybridFiles['script.lua'].includes('_acStudioUpdateHybrid(dt)'), 'Unified Lua must dispatch Hybrid');

  // Motor & Regen LUT monotonicity & non-negativity
  const motorPts = parseLut(hybridFiles['kers_torque_power.lut']);
  const coastPts = parseLut(hybridFiles['kers_torque_coast.lut']);
  assert.ok(motorPts.length >= 6 && motorPts[0].torque === phevCfg.motorPeakTorqueNm, 'Motor must deliver peak torque from 0 RPM');
  assert.ok(coastPts.length >= 5 && coastPts[0].torque === 0, 'Regen coast drag must be 0 Nm at 0 RPM');
  assert.ok(Math.max(...coastPts.map((p) => p.torque)) > 40, 'Regen coast LUT must generate meaningful regen drag');

  // PhysicsCalc combined system power & torque check
  const hybMetrics = computeCarPhysics(hybridFiles);
  assert.equal(hybMetrics.hasHybrid, true);
  assert.ok(
    (hybMetrics.combinedPeakPowerPs ?? 0) > baseMetrics.peakPowerPs + 150,
    `Hybrid 150kW motor should boost combined power significantly (ICE ${baseMetrics.peakPowerPs} -> Combined ${hybMetrics.combinedPeakPowerPs})`
  );
  assert.ok(
    (hybMetrics.combinedPeakTorqueNm ?? 0) > baseMetrics.peakTorqueNm + 200,
    'Hybrid motor must raise combined system torque'
  );

  // Round-trip parse
  const parsedHyb = parseHybridSystemFromFiles(hybridFiles, baseMetrics.maxRpm);
  assert.equal(parsedHyb.enabled, true);
  assert.ok(Math.abs(parsedHyb.motorPeakKw - phevCfg.motorPeakKw) <= 5);
  assert.ok(Math.abs(parsedHyb.motorPeakTorqueNm - phevCfg.motorPeakTorqueNm) <= 5);

  // Disable hybrid cleanly while keeping CVT intact!
  const removedHybFiles = applyHybridSystemToFiles(hybridFiles, { ...phevCfg, enabled: false });
  for (const f of HYBRID_MANAGED_FILES) {
    assert.equal(removedHybFiles[f], undefined, `${f} must be removed when Hybrid is disabled`);
  }
  assert.ok(removedHybFiles['script.lua'].includes('_acStudioUpdateTx(dt)'), 'Disabling Hybrid must keep CSP CVT active');
  assert.ok(!removedHybFiles['script.lua'].includes('_acStudioUpdateHybrid(dt)'));
}
console.log('PASS: Hybrid Electric Motor, Regenerative Braking, Combined Dyno & Unified CSP Lua verified');

console.log('=== 15. Assetto Corsa Dedicated Server Configurator (server_cfg / entry_list / csp_extra) Test ===');
{
  const shutoPreset = SERVER_PRESETS.find((p) => p.id === 'shuto_freeroam')!;
  const srvCfg = shutoPreset.apply({
    ...createDefaultServerConfig(),
    name: 'Tokyo C1 Midnight CSP',
    track: 'shuto_revival_project_beta',
    configTrack: 'shibaura_pa',
    password: 'drift',
    httpPort: 8085,
    entryList: [
      { model: 'ks_nissan_gtr', skin: 'pearl_white', spectatorMode: 0, driverName: '', team: '', guid: '', ballast: 0, restrictor: 0 },
      { model: 'ks_nissan_gtr', skin: 'bayside_blue', spectatorMode: 0, driverName: '', team: '', guid: '', ballast: 20, restrictor: 5 },
      { model: 'ks_mazda_rx7_tuned', skin: 'yellow', spectatorMode: 0, driverName: 'Taro', team: 'C1', guid: '76561198000000001', ballast: 0, restrictor: 0 },
    ],
  });

  const out = serializeServerConfigBundle(srvCfg);
  assert.deepEqual(out.uniqueCarIds, ['ks_nissan_gtr', 'ks_mazda_rx7_tuned']);
  assert.ok(out.serverCfgIni.includes('CARS=ks_nissan_gtr;ks_mazda_rx7_tuned'));
  assert.ok(out.serverCfgIni.includes('TRACK=csp/2144/../shuto_revival_project_beta'));
  assert.ok(out.serverCfgIni.includes('CONFIG_TRACK=shibaura_pa'));
  assert.ok(out.entryListIni.includes('[CAR_0]') && out.entryListIni.includes('[CAR_2]'));
  assert.ok(out.cspExtraOptionsIni.includes('ALLOW_WRONG_WAY=1'));
  assert.ok(out.cspExtraOptionsIni.includes('USE_EXTENDED_PHYSICS=1'));

  // Full round-trip parse check
  const parsedSrv = parseServerConfigBundle(
    out.serverCfgIni,
    out.entryListIni,
    out.cspExtraOptionsIni
  );
  assert.equal(parsedSrv.name, 'Tokyo C1 Midnight CSP');
  assert.equal(parsedSrv.track, 'shuto_revival_project_beta');
  assert.equal(parsedSrv.configTrack, 'shibaura_pa');
  assert.equal(parsedSrv.cspExtra.requireCspVersion, '0.1.79');
  assert.equal(parsedSrv.cspExtra.allowWrongWay, true);
  assert.equal(parsedSrv.cspExtra.useExtendedPhysics, true);
  assert.equal(parsedSrv.entryList.length, 3);
  assert.equal(parsedSrv.entryList[1].ballast, 20);
  assert.equal(parsedSrv.entryList[2].guid, '76561198000000001');

  // Helpers check
  assert.equal(sunAngleToTimeLabel(0), '13:00');
  assert.equal(sunAngleToTimeLabel(-80), '08:00');
  assert.equal(sunAngleToTimeLabel(80), '18:00');
  const joinUrl = buildContentManagerJoinLink('203.0.113.10', 8085, 'drift');
  assert.equal(joinUrl, 'https://acstuff.ru/s/q:race/online/join?ip=203.0.113.10&httpPort=8085&password=drift');
}
console.log('PASS: Assetto Corsa Dedicated Server Configurator, CSP Rules & Entry List Round-Trip verified');

console.log('=== 16. GitHub Release Update Checker (Semver & Windows Asset Picker) Test ===');
{
  assert.equal(compareSemver('v1.0.1', '1.0.0') > 0, true);
  assert.equal(compareSemver('v1.2.0', '1.1.9') > 0, true);
  assert.equal(compareSemver('v2.0.0', '1.9.9') > 0, true);
  assert.equal(compareSemver('v1.0.0', '1.0.0'), 0);
  assert.equal(compareSemver('1.0.0-beta.1', '1.0.0') < 0, true);
  assert.equal(isNewerVersion('v1.0.1', '1.0.0'), true);
  assert.equal(isNewerVersion('v1.0.0', '1.0.0'), false);
  assert.equal(isNewerVersion('v0.9.9', '1.0.0'), false);

  const picked = pickWindowsReleaseAsset([
    { name: 'source.tar.gz', browser_download_url: 'https://example.com/a.tar.gz', size: 1000 },
    { name: 'AC-Car-Studio-Online-Setup.exe', browser_download_url: 'https://example.com/online.exe', size: 22_000 },
    { name: 'AC-Car-Studio-1.0.1-setup.exe', browser_download_url: 'https://example.com/s.exe', size: 50_000_000 },
    { name: 'AC-Car-Studio-1.0.1-win-portable.exe', browser_download_url: 'https://example.com/p.exe', size: 82_000_000 },
  ]);
  assert.ok(picked && picked.name === 'AC-Car-Studio-1.0.1-win-portable.exe', 'Should prefer portable .exe asset and ignore bootstrap online-setup.exe');
  assert.equal(formatBytesCompact(82 * 1024 * 1024), '82.0 MB');
}
console.log('PASS: GitHub Release Update Checker Semver & Windows Asset Picker verified');

console.log('ALL CORE TESTS PASSED!');
