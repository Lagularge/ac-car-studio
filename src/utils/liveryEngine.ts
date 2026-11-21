import * as THREE from 'three';

export type PaintPresetId =
  | 'candy'
  | 'matte'
  | 'metallic'
  | 'pearl_chameleon'
  | 'gloss_solid'
  | 'satin_metallic'
  | 'chrome'
  | 'brushed_metal'
  | 'gloss_carbon'
  | 'matte_dry_carbon'
  | 'forged_carbon'
  | 'alcantara_black'
  | 'alcantara_red'
  | 'alcantara_navy'
  | 'alcantara_grey'
  | 'leather_nappa_black'
  | 'leather_nappa_tan'
  | 'leather_nappa_bordeaux'
  | 'leather_nappa_ivory'
  | 'leather_nappa_saddle'
  | 'leather_synth_black'
  | 'leather_synth_grey'
  | 'fabric_racing_black'
  | 'fabric_racing_red'
  | 'fabric_racing_blue'
  | 'plastic_moulded_black'
  | 'plastic_moulded_grey'
  | 'plastic_hard_textured'
  | 'plastic_piano_black'
  | 'rubber_matte_seal'
  | 'titanium_brushed'
  | 'anodized_bronze';

export type SurfacePatternType =
  | 'none'
  | 'carbon_twill'
  | 'carbon_forged'
  | 'alcantara'
  | 'leather_nappa'
  | 'leather_synthetic'
  | 'plastic_moulded'
  | 'brushed_metal'
  | 'fabric_racing';

export type MaterialPresetCategory =
  | 'exterior_paint'
  | 'carbon_composite'
  | 'interior_material'
  | 'plastic_metal';

export type SkinExportResolution = 1024 | 2048 | 4096 | 8192;

export const SKIN_EXPORT_RESOLUTIONS: readonly SkinExportResolution[] = [1024, 2048, 4096, 8192];
export const DEFAULT_SKIN_EXPORT_RESOLUTION: SkinExportResolution = 4096;

export interface TextureAdjustmentParams {
  baseMode: 'paint_or_preset' | 'original_adjust';
  brightness: number;      // -100..+100 (%)
  contrast: number;        // -100..+100 (%)
  saturation: number;      // -100..+100 (%)
  hueShiftDeg: number;     // -180..+180
  gamma: number;           // 0.4..2.4 (default 1.0)
  tintColor: string;
  tintStrength: number;    // 0..1
  tintMode: 'multiply' | 'overlay' | 'color' | 'screen';
  normalStrength: number;  // 0..2.0 (default 0.85)
  exportResolution: SkinExportResolution;
}

export const DEFAULT_TEXTURE_ADJUSTMENTS: TextureAdjustmentParams = {
  baseMode: 'paint_or_preset',
  brightness: 0,
  contrast: 0,
  saturation: 0,
  hueShiftDeg: 0,
  gamma: 1.0,
  tintColor: '#ffffff',
  tintStrength: 0,
  tintMode: 'multiply',
  normalStrength: 0.85,
  exportResolution: DEFAULT_SKIN_EXPORT_RESOLUTION,
};

export interface PaintMaterialState {
  presetId: PaintPresetId;
  baseColor: string;
  secondaryColor: string;     // Gradient / Pearl shift / Flake accent
  useGradient: boolean;
  gradientAngleDeg: number;
  baseTextureBlend: number;   // 0..1 (multiply original car AO/panel lines over base paint)
  metalness: number;          // 0..1
  roughness: number;          // 0.02..0.98
  clearcoat: number;          // 0..1
  clearcoatRoughness: number; // 0.01..0.6
  fresnelMax: number;         // 0.05..1.0
  iridescence: number;        // 0..1 (Pearl / Candy / Chameleon shift)
  flakeIntensity: number;     // 0..1
  envIntensity: number;       // 0.3..2.5
  carbonPattern: boolean;
  carbonWeaveScale: number;   // Material UV tiling repeat (5..300, default 60 = fine 2x2 twill)
  surfacePattern?: SurfacePatternType;
  normalStrength?: number;    // 0.1..2.0
}

export interface PaintMaterialPreset {
  id: PaintPresetId;
  name: string;
  badge: string;
  category?: MaterialPresetCategory;
  description: string;
  swatchGradient: string;
  params: Omit<
    PaintMaterialState,
    'presetId' | 'baseColor' | 'secondaryColor' | 'useGradient' | 'gradientAngleDeg' | 'baseTextureBlend'
  >;
  suggestedBaseColor?: string;
  suggestedSecondaryColor?: string;
  suggestedTextureBlend?: number;
}

const _PCAT: ReadonlyArray<MaterialPresetCategory> = [
  'exterior_paint', 'carbon_composite', 'interior_material', 'plastic_metal',
];
const _PPAT: ReadonlyArray<SurfacePatternType> = [
  'none', 'carbon_twill', 'carbon_forged', 'alcantara', 'leather_nappa',
  'leather_synthetic', 'plastic_moulded', 'brushed_metal', 'fabric_racing',
];

type _PresetRow = readonly [
  PaintPresetId, string, string, number, string, string,
  string | null, string | null, number | null,
  number, number, number, number, number, number, number, number,
  0 | 1, number, number, number | null
];

const _PRESET_ROWS: ReadonlyArray<_PresetRow> = [
  ["candy","キャンディ塗装","CANDY",0,"高輝度メタリック下地＋極厚カラークリアコートによる奥深い艶と鮮烈な発色。","linear-gradient(135deg, #7f0024 0%, #f43f5e 45%, #fda4af 70%, #881337 100%)","#d90429","#ff758f",null,0.72,0.16,1,0.025,0.96,0.42,0.55,1.85,0,60,0,null],
  ["metallic","メタリック塗装","METALLIC",0,"微細なアルミフレークがシャープに反射する王道のスポーツカー塗装。","linear-gradient(135deg, #1d4ed8 0%, #60a5fa 50%, #1e3a8a 100%)","#1d4ed8","#93c5fd",null,0.68,0.22,0.95,0.04,0.88,0.08,0.72,1.65,0,60,0,null],
  ["pearl_chameleon","マジョーラ / パール偏光","PEARL",0,"見る角度で色彩が劇的に移ろう偏光マジョーラ・マイカパール仕上げ。","linear-gradient(135deg, #4f46e5 0%, #ec4899 45%, #06b6d4 85%, #10b981 100%)","#5b21b6","#06b6d4",null,0.78,0.17,1,0.025,0.98,1,0.82,1.92,0,60,0,null],
  ["gloss_solid","グロスソリッド","GLOSS",0,"純度の高いソリッド発色と鏡面クリアコートの純正・レーシングカラー。","linear-gradient(135deg, #facc15 0%, #fde047 50%, #ca8a04 100%)","#eab308","#fef08a",null,0.08,0.13,1,0.025,0.89,0,0,1.5,0,60,0,null],
  ["satin_metallic","サテンメタリック (半艶)","SATIN",0,"AMGマグノやBMWフローズン系の、金属ハイライトを残した上品な半艶サテン塗装。","linear-gradient(135deg, #334155 0%, #94a3b8 50%, #1e293b 100%)","#475569","#cbd5e1",null,0.56,0.54,0.18,0.34,0.44,0.06,0.52,1.05,0,60,0,null],
  ["matte","マットステルス塗装","MATTE",0,"光沢を抑えた重厚なステルス艶消し仕上げ。サーフェスラインが際立ちます。","linear-gradient(135deg, #27272a 0%, #3f3f46 50%, #18181b 100%)","#2b2d35","#4a4e5a",null,0.12,0.84,0,0.5,0.14,0,0.08,0.55,0,60,0,null],
  ["chrome","クローム鏡面メッキ","CHROME",0,"周囲の景色をそのまま映し込むフルメタルミラークローム仕上げ。","linear-gradient(135deg, #64748b 0%, #f8fafc 45%, #94a3b8 65%, #334155 100%)","#e2e8f0","#ffffff",null,1,0.04,0.4,0.02,1,0.05,0,2.35,0,60,0,null],
  ["gloss_carbon","3K 2×2 綾織クリアカーボン","CARBON",1,"極細3K 2×2綾織ウェットカーボン（512px 16×16高密度タイル＋CSP txDetail/NM対応）。","repeating-linear-gradient(45deg, #18181b 0px, #18181b 3px, #475569 3px, #475569 6px)","#48505c","#6b7280",null,0.48,0.22,1,0.025,0.92,0.08,0,1.75,1,60,1,null],
  ["matte_dry_carbon","3K 2×2 ドライカーボン (艶消し)","DRY CF",1,"GT3/LMPレーシングカーのオートクレーブ未塗装マットドライカーボン。","repeating-linear-gradient(45deg, #141518 0px, #141518 3px, #2e333d 3px, #2e333d 6px)","#353a44","#525866",null,0.36,0.64,0.12,0.35,0.38,0,0,0.95,1,60,1,null],
  ["forged_carbon","フォージドカーボン (鍛造複合材)","FORGED CF",1,"ランボルギーニ等で採用される不規則なチョップドカーボン結晶が輝くフォージドコンポジット。","linear-gradient(135deg, #18181b 0%, #52525b 35%, #27272a 65%, #71717a 100%)","#3f4550","#71717a",null,0.54,0.24,0.96,0.03,0.9,0.06,0.12,1.7,1,32,2,null],
  ["alcantara_black","アルカンターラ (チャコールブラック)","ALCANTARA",2,"ステアリング・ダッシュ・バケットシート用の起毛マイクロファイバースエード。柔らかな起毛陰影と低反射質感。","linear-gradient(135deg, #1b1d22 0%, #323640 52%, #16181c 100%)","#252830","#3f4452",0.25,0.04,0.91,0,0.55,0.16,0,0,0.45,0,45,3,0.72],
  ["alcantara_red","アルカンターラ (レーシングレッド)","ALCANTARA",2,"Type-R / RECARO / フェラーリ内装向けの深紅起毛アルカンターラ。","linear-gradient(135deg, #5c1018 0%, #9e1c2b 52%, #4a0c13 100%)","#8c1b28","#bd2d3d",0.25,0.04,0.9,0,0.55,0.17,0,0,0.48,0,45,3,0.72],
  ["alcantara_grey","アルカンターラ (アッシュグレー)","ALCANTARA",2,"ポルシェ GT3 / ランボルギーニ純正風のダークグレー・アルカンターラ。","linear-gradient(135deg, #2b2f38 0%, #4b5262 52%, #232730 100%)","#3c414d","#586070",0.25,0.04,0.9,0,0.55,0.17,0,0,0.48,0,45,3,0.72],
  ["alcantara_navy","アルカンターラ (ディープネイビー)","ALCANTARA",2,"STI / 欧州GTカー内装向けの濃紺アルカンターラ起毛素材。","linear-gradient(135deg, #142038 0%, #263d66 52%, #10192b 100%)","#1f3152","#355082",0.25,0.04,0.9,0,0.55,0.17,0,0,0.48,0,45,3,0.72],
  ["leather_nappa_black","本革 ナッパレザー (ブラック)","GENUINE LEATHER",2,"自然な革シボ（ペブルグレイン）と上品な半艶オイル光沢を持つ高級ブラック本革。","linear-gradient(135deg, #16181d 0%, #343842 48%, #121418 100%)","#21242b","#3b404c",0.28,0.06,0.56,0.16,0.36,0.34,0,0,0.78,0,42,4,0.88],
  ["leather_nappa_tan","本革 ナッパレザー (コニャックタン)","GENUINE LEATHER",2,"フェラーリ Cuoio / ポルシェ コニャック系の格調高いタンブラウン本革。","linear-gradient(135deg, #5e3116 0%, #9c582f 50%, #4a2610 100%)","#8c4c27","#b56a3e",0.25,0.06,0.54,0.18,0.35,0.36,0,0,0.82,0,42,4,0.88],
  ["leather_nappa_bordeaux","本革 ナッパレザー (ボルドーワイン)","GENUINE LEATHER",2,"ラグジュアリークーペ・GTカー向けの深みのあるワインレッド本革。","linear-gradient(135deg, #3d0e16 0%, #731d2c 50%, #2e0a10 100%)","#611825","#872738",0.25,0.06,0.55,0.18,0.35,0.36,0,0,0.8,0,42,4,0.88],
  ["leather_nappa_ivory","本革 ナッパレザー (アイボリークリーム)","GENUINE LEATHER",2,"明るく華やかなアイボリーホワイト・セミアニリン本革シート・トリム用。","linear-gradient(135deg, #b8ab96 0%, #e6dac6 50%, #9e917c 100%)","#d9ccb8","#efe6d5",0.25,0.05,0.56,0.15,0.36,0.34,0,0,0.76,0,42,4,0.85],
  ["leather_nappa_saddle","本革 ヴィンテージ・サドルブラウン","GENUINE LEATHER",2,"ヒストリックカーやクラシックGTに最適な濃いサドルブラウン本革。","linear-gradient(135deg, #382112 0%, #633d24 50%, #29170c 100%)","#52321d","#75492c",0.28,0.06,0.52,0.2,0.34,0.38,0,0,0.84,0,42,4,0.9],
  ["leather_synth_black","合皮 / ビニールレザー (純正ダッシュ黒)","SYNTH LEATHER",2,"純正ダッシュボード・ドア内張り・純正シート用の均一な細シボ合皮（ソフトパッドウレタン）。","linear-gradient(135deg, #1b1e24 0%, #2e333d 50%, #15171c 100%)","#242830","#363c47",0.3,0.05,0.68,0.06,0.44,0.24,0,0,0.62,0,58,5,0.78],
  ["leather_synth_grey","合皮 / ビニールレザー (ダークスレート)","SYNTH LEATHER",2,"90年代〜現代国産スポーツカーのダッシュボード・コンソールに多いダークグレー合皮。","linear-gradient(135deg, #2b303a 0%, #444b59 50%, #22262e 100%)","#373c47","#4c5361",0.3,0.05,0.68,0.06,0.44,0.24,0,0,0.62,0,58,5,0.78],
  ["fabric_racing_black","レーシングファブリック (ブラックメッシュ)","FABRIC",2,"BRIDE / RECARO フルバケットシート用の難燃ファブリック織り目素材。","repeating-linear-gradient(90deg, #181a20 0px, #181a20 2px, #282c36 2px, #282c36 4px)","#22252e","#363b47",0.28,0.03,0.88,0,0.55,0.15,0,0,0.46,0,75,8,0.82],
  ["fabric_racing_red","レーシングファブリック (ブリッド/レカロ赤)","FABRIC",2,"フルバケットシート定番の鮮やかなレッド・レーシングファブリック織り素材。","repeating-linear-gradient(90deg, #7a111d 0px, #7a111d 2px, #b81d2f 2px, #b81d2f 4px)","#a81829","#cf293c",0.28,0.03,0.87,0,0.55,0.16,0,0,0.48,0,75,8,0.82],
  ["fabric_racing_blue","レーシングファブリック (ブルーメッシュ)","FABRIC",2,"スポーツシート・ドアトリム向けのブルー・レーシングファブリック。","repeating-linear-gradient(90deg, #102a6b 0px, #102a6b 2px, #1d4ed8 2px, #1d4ed8 4px)","#1a44b8","#3b82f6",0.28,0.03,0.87,0,0.55,0.16,0,0,0.48,0,75,8,0.82],
  ["plastic_moulded_black","成形色ブラック樹脂 (未塗装PP/ABS)","MOULDED BLACK",3,"バンパー下部・グリル・ディフューザー・ワイパーカウル等の未塗装ブラック成形樹脂（微細梨地シボ加工）。","linear-gradient(135deg, #191b20 0%, #2c3038 50%, #14161a 100%)","#202329","#323640",0.25,0.04,0.78,0,0.5,0.2,0,0,0.54,0,70,6,0.65],
  ["plastic_moulded_grey","成形色ダークグレー樹脂 (外装/内装)","MOULDED GREY",3,"純正サイドスカート・リアディフューザー・スイッチ類に使われるダークグレー成形樹脂。","linear-gradient(135deg, #282c34 0%, #434957 50%, #21242b 100%)","#333842","#4a515e",0.25,0.04,0.76,0,0.5,0.21,0,0,0.56,0,70,6,0.65],
  ["plastic_hard_textured","内装シボ加工ハード樹脂 (コンソール)","ABS TRIM",3,"センターコンソール・コラムカバー・ピラー内張り用のシボ加工ABSハードプラスチック。","linear-gradient(135deg, #1d2026 0%, #343944 50%, #171a1f 100%)","#272b33","#3c424f",0.28,0.05,0.72,0.04,0.45,0.24,0,0,0.6,0,62,6,0.75],
  ["plastic_piano_black","ピアノブラック高光沢樹脂","PIANO BLACK",3,"高級車のインテリアパネルやグロスブラック外装トリム用の鏡面ピアノブラック樹脂。","linear-gradient(135deg, #090a0d 0%, #2e3440 48%, #050608 100%)","#0c0e12","#272c36",0.15,0.06,0.08,1,0.015,0.94,0,0,1.72,0,60,0,null],
  ["rubber_matte_seal","ウェザーストリップ・窓枠マットラバー","RUBBER",3,"ウィンドウモール・ドアシール・タイヤサイド等に適した極低反射EPDM合成ゴム質感。","linear-gradient(135deg, #141518 0%, #23252b 50%, #101114 100%)","#191b1f","#282b30",0.25,0.02,0.92,0,0.55,0.11,0,0,0.42,0,80,6,0.45],
  ["brushed_metal","ヘアライン・ブラッシュドアルミ","BRUSHED ALU",3,"シフトパネル・ペダル・ホイールリム等に最適なヘアライン研磨アルミニウム。","linear-gradient(135deg, #475569 0%, #cbd5e1 50%, #334155 100%)","#9ca6b5","#e2e8f0",null,0.92,0.34,0.2,0.24,0.8,0,0.25,1.65,0,55,7,0.65],
  ["titanium_brushed","ブラッシュド・チタン / ガンメタル","TITANIUM",3,"エキゾースト・エンジンパーツ・鍛造ホイール向けのダークチタン・ヘアライン仕上げ。","linear-gradient(135deg, #333942 0%, #7d8796 50%, #252a32 100%)","#616a78","#94a3b8",null,0.9,0.36,0.22,0.22,0.82,0.08,0.25,1.68,0,55,7,0.65],
  ["anodized_bronze","アルマイト・レーシングブロンズ","BRONZE",3,"TE37等の鍛造ホイールやキャリパーに最適なアルマイトブロンズ・メタリック。","linear-gradient(135deg, #4a3520 0%, #9c7648 50%, #382716 100%)","#7d5c36","#b88e5c",null,0.86,0.32,0.35,0.18,0.82,0.05,0.42,1.62,0,55,7,0.45],
];

export const PAINT_MATERIAL_PRESETS: PaintMaterialPreset[] = _PRESET_ROWS.map((
  [id, name, badge, ci, description, swatchGradient, sBase, sSec, sBlend, metalness, roughness, clearcoat, clearcoatRoughness, fresnelMax, iridescence, flakeIntensity, envIntensity, cPat, carbonWeaveScale, pi, nStr]
) => {
  const params: PaintMaterialPreset['params'] = {
    metalness, roughness, clearcoat, clearcoatRoughness, fresnelMax, iridescence, flakeIntensity, envIntensity,
    carbonPattern: cPat === 1, carbonWeaveScale,
    ...(pi >= 0 ? { surfacePattern: _PPAT[pi] } : {}),
    ...(nStr !== null ? { normalStrength: nStr } : {}),
  };
  return {
    id, name, badge,
    ...(ci >= 0 ? { category: _PCAT[ci] } : {}),
    description, swatchGradient,
    ...(sBase !== null ? { suggestedBaseColor: sBase } : {}),
    ...(sSec !== null ? { suggestedSecondaryColor: sSec } : {}),
    ...(sBlend !== null ? { suggestedTextureBlend: sBlend } : {}),
    params,
  };
});

export type DecalKind =
  | 'image'
  | 'stripe_center'
  | 'stripe_slash'
  | 'number_plate_circle'
  | 'number_plate_gt'
  | 'checker_band'
  | 'star'
  | 'arrow'
  | 'text'
  | 'mesh_uv_mask';

export type DecalProjectionMode = 'camera' | 'surface';

export interface DecalProjection3D {
  mode: DecalProjectionMode;
  /** 3D hit point on vehicle surface in world/car coordinates (meters) */
  origin: [number, number, number];
  /** Unit vector pointing FROM viewer/normal INTO the car surface */
  forward: [number, number, number];
  /** Unit horizontal right axis in 3D projection plane */
  right: [number, number, number];
  /** Unit vertical up axis in 3D projection plane */
  up: [number, number, number];
  /** Physical projected width on car body (meters) */
  widthM: number;
  /** Physical projected height on car body (meters) */
  heightM: number;
  /** Projection depth half-range along forward axis (meters, GT7 投影深度) */
  depthM: number;
  /** Surface normal angle cutoff (degrees 15..90, GT7 角度制限) */
  angleLimitDeg: number;
}

export interface LiveryLayer {
  id: string;
  name: string;
  kind: DecalKind;
  visible: boolean;
  u: number;           // 0..1 (fallback for 2D UV layers / mini-map marker)
  v: number;           // 0..1
  scaleX: number;      // 0.02..2.5 (fraction of canvas width for legacy 2D layers)
  scaleY: number;      // 0.02..2.5
  rotationDeg: number; // -180..180
  opacity: number;     // 0..1
  flipX: boolean;
  flipY?: boolean;
  blendMode: GlobalCompositeOperation;
  color: string;
  accentColor?: string;
  text?: string;
  imageDataUrl?: string;
  /** GT7-style 3D camera/surface orthographic projection parameters (projects directly onto 3D car model) */
  projection3d?: DecalProjection3D;
  /** Optional 3D mesh UUID + UV triangles [u0,v0,u1,v1,u2,v2,...] for model-conforming part material paste */
  meshUuid?: string;
  meshUvTriangles?: Float32Array;
  meshSurfacePattern?: SurfacePatternType;
  meshPatternScale?: number;
}

export interface CarbonWeaveBuffers {
  size: number;
  detailRgba: Uint8Array;
  normalRgba: Uint8Array;
  roughnessRgba: Uint8Array;
  metalnessRgba: Uint8Array;
}

let cachedCarbonBuffers: CarbonWeaveBuffers | null = null;

export const CARBON_TILE_CYCLES = 16; // 16x16 seamless 2x2 twill cycles per 512x512 tile (32px/cycle, 8px/tow)

/**
 * Generates seamless 512x512 high-density (16x16 cycles = 64x64 tows) 2x2 twill carbon-fiber
 * PBR material maps (Detail Albedo, Tangent-Space Normal, Roughness, Metalness) in pure TypeScript.
 * Packing 16x16 cycles into the detail tile ensures razor-fine automotive 3K carbon weave in:
 *  - Assetto Corsa + CSP (detailUVMultiplier = 60 -> 960 effective cycles across UV!)
 *  - Content Manager Custom Showroom / Vanilla AC (even at low native detailUVMultiplier = 15..30!)
 *  - Live 3D Livery Studio preview (1:1 density parity with AC/CSP!)
 */
export function generateCarbonWeaveBuffers(size = 512, cycles = CARBON_TILE_CYCLES): CarbonWeaveBuffers {
  if (cachedCarbonBuffers && cachedCarbonBuffers.size === size) {
    return cachedCarbonBuffers;
  }

  const pxCount = size * size;
  const detailRgba = new Uint8Array(pxCount * 4);
  const normalRgba = new Uint8Array(pxCount * 4);
  const roughnessRgba = new Uint8Array(pxCount * 4);
  const metalnessRgba = new Uint8Array(pxCount * 4);

  const cell = size / (4 * cycles); // 4x4 tows per 2x2 twill cycle * `cycles` repeats per tile

  const clampByte = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));

  for (let y = 0; y < size; y++) {
    const ty = Math.floor(y / cell) % 4;
    const ly = (y % cell) / cell; // 0..1 across Y
    for (let x = 0; x < size; x++) {
      const tx = Math.floor(x / cell) % 4;
      const lx = (x % cell) / cell; // 0..1 across X

      const twillSlot = (tx + ty) % 4;
      const isWarp = twillSlot < 2; // Horizontal tow on top vs Vertical tow on top

      let detailVal: number;
      let detailAlpha: number;
      let roughVal: number;
      let metalVal: number;
      let nx: number;
      let ny: number;

      if (isWarp) {
        // Horizontal fiber bundle passing over 2 crossings
        const uSpan = (twillSlot + lx) / 2; // 0..1 along tow arch
        const crossArch = Math.sin(ly * Math.PI); // 0 at seam, 1 at crown
        const longArch = Math.sin(uSpan * Math.PI);
        const microStrand = 0.94 + 0.06 * Math.sin(ly * Math.PI * 10);
        const seamMask = Math.pow(crossArch, 0.42);

        detailVal = (0.20 + 0.78 * seamMask * (0.66 + 0.34 * longArch)) * microStrand;
        detailAlpha = 0.35 + 0.60 * seamMask * (0.65 + 0.35 * longArch);
        roughVal = 0.68 - 0.46 * seamMask * (0.6 + 0.4 * longArch);
        metalVal = 0.25 + 0.70 * seamMask * (0.65 + 0.35 * longArch);

        nx = -Math.cos(uSpan * Math.PI) * 0.38 * seamMask;
        ny = -Math.cos(ly * Math.PI) * 0.62;
      } else {
        // Vertical fiber bundle passing over 2 crossings (darker contrasting reflection angle)
        const vSpan = (twillSlot - 2 + ly) / 2; // 0..1 along tow arch
        const crossArch = Math.sin(lx * Math.PI);
        const longArch = Math.sin(vSpan * Math.PI);
        const microStrand = 0.94 + 0.06 * Math.sin(lx * Math.PI * 10);
        const seamMask = Math.pow(crossArch, 0.42);

        detailVal = (0.14 + 0.42 * seamMask * (0.64 + 0.36 * longArch)) * microStrand;
        detailAlpha = 0.28 + 0.42 * seamMask * (0.65 + 0.35 * longArch);
        roughVal = 0.76 - 0.36 * seamMask * (0.6 + 0.4 * longArch);
        metalVal = 0.16 + 0.42 * seamMask * (0.65 + 0.35 * longArch);

        nx = -Math.cos(lx * Math.PI) * 0.62;
        ny = -Math.cos(vSpan * Math.PI) * 0.38 * seamMask;
      }

      const nz = Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny));
      const idx = (y * size + x) * 4;

      const dByte = clampByte(detailVal);
      detailRgba[idx] = dByte;
      detailRgba[idx + 1] = dByte;
      detailRgba[idx + 2] = Math.min(255, Math.round(dByte * 1.04)); // subtle cool graphite tint
      detailRgba[idx + 3] = clampByte(detailAlpha); // AC ksPerPixelMultiMap specular flake/sheen channel

      normalRgba[idx] = clampByte(nx * 0.5 + 0.5);
      normalRgba[idx + 1] = clampByte(ny * 0.5 + 0.5);
      normalRgba[idx + 2] = clampByte(nz * 0.5 + 0.5);
      normalRgba[idx + 3] = 255;

      const rByte = clampByte(roughVal);
      roughnessRgba[idx] = rByte;
      roughnessRgba[idx + 1] = rByte;
      roughnessRgba[idx + 2] = rByte;
      roughnessRgba[idx + 3] = 255;

      const mByte = clampByte(metalVal);
      metalnessRgba[idx] = mByte;
      metalnessRgba[idx + 1] = mByte;
      metalnessRgba[idx + 2] = mByte;
      metalnessRgba[idx + 3] = 255;
    }
  }

  const out: CarbonWeaveBuffers = { size, detailRgba, normalRgba, roughnessRgba, metalnessRgba };
  cachedCarbonBuffers = out;
  return out;
}

const cachedSurfaceBuffers = new Map<string, CarbonWeaveBuffers>();
const cachedSurfaceTextures = new Map<
  SurfacePatternType,
  {
    detailTex: THREE.DataTexture;
    normalTex: THREE.DataTexture;
    roughnessTex: THREE.DataTexture;
    metalnessTex: THREE.DataTexture;
  }
>();

function hash2d(ix: number, iy: number, seed = 1337): number {
  let h = (ix * 374761393 + iy * 668265263 + seed * 1442695041) | 0;
  h = ((h ^ (h >>> 13)) * 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Generates seamless 512x512 procedural PBR maps (Detail Albedo, Tangent-Space Normal, Roughness, Metalness)
 * for all 8 automotive surface patterns:
 * - `carbon_twill`: 3K 2x2 twill carbon fiber
 * - `carbon_forged`: chopped carbon-fiber composite facets
 * - `alcantara`: ultra-fine micro-suede nap with directional soft scatter
 * - `leather_nappa`: smooth organic pebble grain full-grain automotive leather
 * - `leather_synthetic`: uniform machine-embossed vinyl/synthetic leather pebble grain
 * - `plastic_moulded`: VDI-27 automotive injection-moulded PP/ABS micro-stipple trim
 * - `brushed_metal`: anisotropic hairline brushed aluminum / titanium
 * - `fabric_racing`: tight 1x1 plain-weave Recaro/Bride racing seat cloth mesh
 */
export function generateSurfacePatternBuffers(
  pattern: SurfacePatternType,
  size = 512
): CarbonWeaveBuffers {
  if (pattern === 'carbon_twill' || pattern === 'none') {
    return generateCarbonWeaveBuffers(size, CARBON_TILE_CYCLES);
  }
  const key = `${pattern}_${size}`;
  const hit = cachedSurfaceBuffers.get(key);
  if (hit) return hit;

  const pxCount = size * size;
  const detailRgba = new Uint8Array(pxCount * 4);
  const normalRgba = new Uint8Array(pxCount * 4);
  const roughnessRgba = new Uint8Array(pxCount * 4);
  const metalnessRgba = new Uint8Array(pxCount * 4);
  const heightField = new Float32Array(pxCount);
  const roughField = new Float32Array(pxCount);
  const metalField = new Float32Array(pxCount);
  const detailField = new Float32Array(pxCount);

  const clampByte = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));

  if (pattern === 'carbon_forged') {
    // Voronoi chopped-tow facets with multi-angle directional sheen (precomputed grid cells)
    const grid = 14;
    const cellSz = size / grid;
    const cellCount = grid * grid;
    const cellOx = new Float32Array(cellCount);
    const cellOy = new Float32Array(cellCount);
    const cellCos = new Float32Array(cellCount);
    const cellSin = new Float32Array(cellCount);
    const cellSeed = new Float32Array(cellCount);
    for (let gy = 0; gy < grid; gy++) {
      for (let gx = 0; gx < grid; gx++) {
        const ci = gy * grid + gx;
        cellOx[ci] = 0.15 + 0.7 * hash2d(gx, gy, 11);
        cellOy[ci] = 0.15 + 0.7 * hash2d(gx, gy, 23);
        const ang = hash2d(gx, gy, 37) * Math.PI;
        cellCos[ci] = Math.cos(ang);
        cellSin[ci] = Math.sin(ang);
        cellSeed[ci] = hash2d(gx, gy, 59);
      }
    }
    const invEdgeSpan = 1 / (cellSz * 0.18);
    for (let y = 0; y < size; y++) {
      const cy = Math.floor(y / cellSz);
      for (let x = 0; x < size; x++) {
        const cx = Math.floor(x / cellSz);
        let bestD = 1e9;
        let secondD = 1e9;
        let bestCi = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = cy + dy;
          const gy = (ny + grid) % grid;
          const rowOff = gy * grid;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx;
            const gx = (nx + grid) % grid;
            const ci = rowOff + gx;
            const px = (nx + cellOx[ci]) * cellSz;
            const py = (ny + cellOy[ci]) * cellSz;
            const ddx = x - px;
            const ddy = y - py;
            const cA = cellCos[ci];
            const sA = cellSin[ci];
            const along = (ddx * cA + ddy * sA) * 0.65;
            const across = (-ddx * sA + ddy * cA) * 1.45;
            const dist = Math.sqrt(along * along + across * across);
            if (dist < bestD) {
              secondD = bestD;
              bestD = dist;
              bestCi = ci;
            } else if (dist < secondD) {
              secondD = dist;
            }
          }
        }
        const bestSeed = cellSeed[bestCi];
        const edge = Math.min(1, Math.max(0, (secondD - bestD) * invEdgeSpan));
        const strand = 0.94 + 0.06 * Math.sin((x * cellCos[bestCi] + y * cellSin[bestCi]) * 1.3);
        const facetReflect = (0.28 + 0.68 * bestSeed) * (0.75 + 0.25 * edge) * strand;
        const idx = y * size + x;
        heightField[idx] = (0.35 + 0.55 * bestSeed) * Math.pow(edge, 0.35);
        detailField[idx] = facetReflect;
        roughField[idx] = 0.58 - 0.36 * bestSeed * edge;
        metalField[idx] = 0.22 + 0.55 * bestSeed;
      }
    }
  } else if (pattern === 'alcantara') {
    // Ultra-fine suede microfiber nap + subtle directional brushing wave
    for (let y = 0; y < size; y++) {
      const nyNorm = (y / size) * Math.PI * 2;
      for (let x = 0; x < size; x++) {
        const nxNorm = (x / size) * Math.PI * 2;
        const n1 = hash2d(x, y, 101);
        const n2 = hash2d((x >> 1) % (size >> 1), (y >> 1) % (size >> 1), 202);
        const brushWave =
          0.5 +
          0.28 * Math.sin(nxNorm * 3 + Math.sin(nyNorm * 2) * 1.4) +
          0.22 * Math.cos(nyNorm * 4 - nxNorm * 2);
        const fiber = 0.52 * n1 + 0.30 * n2 + 0.18 * brushWave;
        const idx = y * size + x;
        heightField[idx] = fiber;
        // Subtle modulation centered near 0.72 so diffuse multiply doesn't darken pastel/colored Alcantara
        detailField[idx] = 0.64 + 0.22 * (fiber - 0.5);
        roughField[idx] = 0.84 + 0.14 * (1 - fiber);
        metalField[idx] = 0.02;
      }
    }
  } else if (pattern === 'leather_nappa' || pattern === 'leather_synthetic') {
    // Voronoi cellular pebble grain (organic Nappa vs uniform embossed Synthetic, precomputed cell offsets)
    const isSynth = pattern === 'leather_synthetic';
    const grid = isSynth ? 36 : 28;
    const cellSz = size / grid;
    const invCellSz = 1 / cellSz;
    const jitter = isSynth ? 0.45 : 0.78;
    const cellCount = grid * grid;
    const cellOx = new Float32Array(cellCount);
    const cellOy = new Float32Array(cellCount);
    for (let gy = 0; gy < grid; gy++) {
      for (let gx = 0; gx < grid; gx++) {
        const ci = gy * grid + gx;
        cellOx[ci] = 0.5 + (hash2d(gx, gy, 303) - 0.5) * jitter;
        cellOy[ci] = 0.5 + (hash2d(gx, gy, 404) - 0.5) * jitter;
      }
    }
    const creaseGain = isSynth ? 2.6 : 2.1;
    const domeExp = isSynth ? 0.42 : 0.55;
    const poreGain = isSynth ? 0.05 : 0.09;
    const roughBase = isSynth ? 0.44 : 0.52;
    const metalVal = isSynth ? 0.05 : 0.03;
    for (let y = 0; y < size; y++) {
      const cy = Math.floor(y * invCellSz);
      for (let x = 0; x < size; x++) {
        const cx = Math.floor(x * invCellSz);
        let d1 = 1e9;
        let d2 = 1e9;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = cy + dy;
          const rowOff = ((ny + grid) % grid) * grid;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx;
            const ci = rowOff + ((nx + grid) % grid);
            const ddx = x - (nx + cellOx[ci]) * cellSz;
            const ddy = y - (ny + cellOy[ci]) * cellSz;
            const dist = Math.sqrt(ddx * ddx + ddy * ddy) * invCellSz;
            if (dist < d1) {
              d2 = d1;
              d1 = dist;
            } else if (dist < d2) {
              d2 = dist;
            }
          }
        }
        const crease = Math.max(0, Math.min(1, (d2 - d1) * creaseGain));
        const dome = Math.pow(crease, domeExp) * (1 - 0.18 * d1);
        const microPore = hash2d(x, y, 505) * poreGain;
        const hVal = Math.max(0, Math.min(1, dome - microPore));
        const idx = y * size + x;
        heightField[idx] = hVal;
        detailField[idx] = 0.62 + 0.24 * hVal;
        roughField[idx] = roughBase + 0.32 * (1 - hVal);
        metalField[idx] = metalVal;
      }
    }
  } else if (pattern === 'plastic_moulded') {
    // Automotive VDI-27 EDM micro-stipple injection-moulded PP/ABS grain
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const fine = hash2d(x, y, 601);
        const med =
          0.25 *
          (hash2d(x >> 1, y >> 1, 602) +
            hash2d(((x + 1) >> 1) % (size >> 1), y >> 1, 602) +
            hash2d(x >> 1, ((y + 1) >> 1) % (size >> 1), 602) +
            hash2d(((x + 1) >> 1) % (size >> 1), ((y + 1) >> 1) % (size >> 1), 602));
        const stipple = Math.pow(0.45 * fine + 0.55 * med, 0.85);
        const idx = y * size + x;
        heightField[idx] = stipple;
        detailField[idx] = 0.65 + 0.20 * (stipple - 0.5);
        roughField[idx] = 0.64 + 0.24 * (1 - stipple);
        metalField[idx] = 0.03;
      }
    }
  } else if (pattern === 'brushed_metal') {
    // Anisotropic horizontal hairline brushed metal
    for (let y = 0; y < size; y++) {
      const rowSeed1 = hash2d(0, y, 701);
      const rowSeed2 = hash2d(0, (y * 2) % size, 702);
      for (let x = 0; x < size; x++) {
        const u = (x / size) * Math.PI * 2;
        const streak =
          0.45 * rowSeed1 +
          0.30 * rowSeed2 +
          0.15 * Math.sin(u * 4 + rowSeed1 * 12) +
          0.10 * hash2d(x >> 3, y, 703);
        const idx = y * size + x;
        heightField[idx] = streak;
        detailField[idx] = 0.58 + 0.34 * streak;
        roughField[idx] = 0.22 + 0.22 * (1 - streak);
        metalField[idx] = 0.85 + 0.14 * streak;
      }
    }
  } else if (pattern === 'fabric_racing') {
    // Tight 1x1 plain-weave technical racing seat mesh (16x16 threads per tile)
    const threads = 32;
    const cell = size / threads;
    for (let y = 0; y < size; y++) {
      const ty = Math.floor(y / cell);
      const ly = (y % cell) / cell;
      for (let x = 0; x < size; x++) {
        const tx = Math.floor(x / cell);
        const lx = (x % cell) / cell;
        const warpTop = (tx + ty) % 2 === 0;
        const archX = Math.sin(lx * Math.PI);
        const archY = Math.sin(ly * Math.PI);
        const crown = warpTop
          ? Math.pow(archY, 0.45) * (0.65 + 0.35 * archX)
          : Math.pow(archX, 0.45) * (0.65 + 0.35 * archY) * 0.88;
        const micro = 0.92 + 0.08 * hash2d(x, y, 801);
        const hVal = crown * micro;
        const idx = y * size + x;
        heightField[idx] = hVal;
        detailField[idx] = 0.56 + 0.32 * hVal;
        roughField[idx] = 0.78 + 0.18 * (1 - hVal);
        metalField[idx] = 0.02;
      }
    }
  }

  // Derive tangent-space normals from seamless heightField finite differences
  const bumpGain =
    pattern === 'leather_nappa' || pattern === 'leather_synthetic'
      ? 2.4
      : pattern === 'fabric_racing' || pattern === 'carbon_forged'
        ? 2.2
        : pattern === 'plastic_moulded'
          ? 1.9
          : 1.5;

  for (let y = 0; y < size; y++) {
    const ym = (y - 1 + size) % size;
    const yp = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;
      const dhdx = (heightField[y * size + xp] - heightField[y * size + xm]) * bumpGain;
      const dhdy = (heightField[yp * size + x] - heightField[ym * size + x]) * bumpGain;
      let nx = -dhdx;
      let ny = -dhdy;
      let nz = 1.0;
      const len = Math.sqrt(nx * nx + ny * ny + 1.0) || 1;
      nx /= len;
      ny /= len;
      nz /= len;

      const idx = y * size + x;
      const p4 = idx * 4;
      const dByte = clampByte(detailField[idx]);
      detailRgba[p4] = dByte;
      detailRgba[p4 + 1] = dByte;
      detailRgba[p4 + 2] = dByte;
      detailRgba[p4 + 3] = clampByte(1 - roughField[idx] * 0.75);

      normalRgba[p4] = clampByte(nx * 0.5 + 0.5);
      normalRgba[p4 + 1] = clampByte(ny * 0.5 + 0.5);
      normalRgba[p4 + 2] = clampByte(nz * 0.5 + 0.5);
      normalRgba[p4 + 3] = 255;

      const rByte = clampByte(roughField[idx]);
      roughnessRgba[p4] = rByte;
      roughnessRgba[p4 + 1] = rByte;
      roughnessRgba[p4 + 2] = rByte;
      roughnessRgba[p4 + 3] = 255;

      const mByte = clampByte(metalField[idx]);
      metalnessRgba[p4] = mByte;
      metalnessRgba[p4 + 1] = mByte;
      metalnessRgba[p4 + 2] = mByte;
      metalnessRgba[p4 + 3] = 255;
    }
  }

  const out: CarbonWeaveBuffers = { size, detailRgba, normalRgba, roughnessRgba, metalnessRgba };
  cachedSurfaceBuffers.set(key, out);
  return out;
}

export function getSurfacePatternTextures(pattern: SurfacePatternType, repeatScale: number) {
  const effectivePattern: SurfacePatternType = pattern === 'none' ? 'carbon_twill' : pattern;
  let texSet = cachedSurfaceTextures.get(effectivePattern);
  if (!texSet) {
    const bufs = generateSurfacePatternBuffers(effectivePattern, 512);
    const makeTex = (data: Uint8Array, srgb: boolean) => {
      const tex = new THREE.DataTexture(data, bufs.size, bufs.size, THREE.RGBAFormat);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.anisotropy = 16;
      tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      tex.userData.__sharedCache = true;
      tex.needsUpdate = true;
      return tex;
    };
    texSet = {
      detailTex: makeTex(bufs.detailRgba, false),
      normalTex: makeTex(bufs.normalRgba, false),
      roughnessTex: makeTex(bufs.roughnessRgba, false),
      metalnessTex: makeTex(bufs.metalnessRgba, false),
    };
    cachedSurfaceTextures.set(effectivePattern, texSet);
  }

  const safeScale = Math.max(4, Math.min(300, repeatScale || 60));
  texSet.detailTex.repeat.set(safeScale, safeScale);
  texSet.normalTex.repeat.set(safeScale, safeScale);
  texSet.roughnessTex.repeat.set(safeScale, safeScale);
  texSet.metalnessTex.repeat.set(safeScale, safeScale);
  return texSet;
}

export function getSurfacePatternFilePrefix(pattern: SurfacePatternType): string {
  if (pattern === 'carbon_twill' || pattern === 'none') return 'carbon';
  return pattern;
}

/**
 * Generates seamless mipmapped 512x512 DDS detail & normal maps for any active SurfacePatternType
 * (`carbon_detail.dds` / `carbon_detail_nm.dds` for carbon_twill, or `<pattern>_detail.dds` / `<pattern>_detail_nm.dds`).
 */
export function buildSurfacePatternDdsFiles(
  pattern: SurfacePatternType,
  overrideNames?: {
    detailTexName?: string;
    detailNmTexName?: string;
  }
): Array<{ fileName: string; bytes: Uint8Array }> {
  if (pattern === 'none') return [];
  if (pattern === 'carbon_twill') {
    return buildCarbonMaterialDdsFiles(overrideNames);
  }
  const bufs = generateSurfacePatternBuffers(pattern, 512);
  const detailDds = encodeRgbaToDds(bufs.size, bufs.size, bufs.detailRgba, {
    generateMipmaps: true,
    isNormalMap: false,
  });
  const normalDds = encodeRgbaToDds(bufs.size, bufs.size, bufs.normalRgba, {
    generateMipmaps: true,
    isNormalMap: true,
  });

  const prefix = getSurfacePatternFilePrefix(pattern);
  const files: Array<{ fileName: string; bytes: Uint8Array }> = [
    { fileName: `${prefix}_detail.dds`, bytes: detailDds },
    { fileName: `${prefix}_detail_nm.dds`, bytes: normalDds },
  ];

  const seen = new Set(files.map((f) => f.fileName.toLowerCase()));
  const origDetail = overrideNames?.detailTexName?.trim();
  if (origDetail && /\.dds$/i.test(origDetail) && !seen.has(origDetail.toLowerCase())) {
    files.push({ fileName: origDetail, bytes: detailDds });
    seen.add(origDetail.toLowerCase());
  }
  const origDetailNm = overrideNames?.detailNmTexName?.trim();
  if (origDetailNm && /\.dds$/i.test(origDetailNm) && !seen.has(origDetailNm.toLowerCase())) {
    files.push({ fileName: origDetailNm, bytes: normalDds });
    seen.add(origDetailNm.toLowerCase());
  }
  return files;
}

/**
 * Generates seamless mipmapped 512x512 high-density (16x16 cycles) DDS material detail textures
 * (`carbon_detail.dds` & `carbon_detail_nm.dds`) for AC + CSP ext_config.ini, plus optional copies
 * matching the car material's native txDetail / txDetailNM filenames for Vanilla AC & CM Showroom override.
 */
export function buildCarbonMaterialDdsFiles(overrideNames?: {
  detailTexName?: string;
  detailNmTexName?: string;
}): Array<{ fileName: string; bytes: Uint8Array }> {
  const bufs = generateCarbonWeaveBuffers(512, CARBON_TILE_CYCLES);
  const detailDds = encodeRgbaToDds(bufs.size, bufs.size, bufs.detailRgba, {
    generateMipmaps: true,
    isNormalMap: false,
  });
  const normalDds = encodeRgbaToDds(bufs.size, bufs.size, bufs.normalRgba, {
    generateMipmaps: true,
    isNormalMap: true,
  });

  const files: Array<{ fileName: string; bytes: Uint8Array }> = [
    { fileName: 'carbon_detail.dds', bytes: detailDds },
    { fileName: 'carbon_detail_nm.dds', bytes: normalDds },
  ];

  const seen = new Set(files.map((f) => f.fileName.toLowerCase()));
  const origDetail = overrideNames?.detailTexName?.trim();
  if (origDetail && /\.dds$/i.test(origDetail) && !seen.has(origDetail.toLowerCase())) {
    files.push({ fileName: origDetail, bytes: detailDds });
    seen.add(origDetail.toLowerCase());
  }
  const origDetailNm = overrideNames?.detailNmTexName?.trim();
  if (origDetailNm && /\.dds$/i.test(origDetailNm) && !seen.has(origDetailNm.toLowerCase())) {
    files.push({ fileName: origDetailNm, bytes: normalDds });
    seen.add(origDetailNm.toLowerCase());
  }

  return files;
}

export function resolveActiveSurfacePattern(state: PaintMaterialState): SurfacePatternType {
  if (state.surfacePattern && state.surfacePattern !== 'none') {
    return state.surfacePattern;
  }
  return state.carbonPattern ? 'carbon_twill' : 'none';
}

/**
 * Applies PaintMaterialState directly to a Three.js MeshPhysicalMaterial for live CSP-style preview.
 * Supports all 8 procedural surface patterns (Carbon Twill, Forged Carbon, Alcantara, Nappa Leather,
 * Synthetic Leather, Moulded Plastic, Brushed Metal, Racing Fabric) via high-frequency tiled PBR maps.
 */
export function applyPaintMaterialToThree(
  mat: THREE.MeshPhysicalMaterial,
  state: PaintMaterialState
) {
  // Snapshot original car material PBR maps once so turning surface pattern off cleanly restores them
  if (!mat.userData.__origPbrMaps) {
    mat.userData.__origPbrMaps = {
      normalMap: mat.normalMap,
      normalScale: mat.normalScale.clone(),
      roughnessMap: mat.roughnessMap,
      metalnessMap: mat.metalnessMap,
    };
  }

  const activePattern = resolveActiveSurfacePattern(state);
  const hasPattern = activePattern !== 'none';
  const detailBlendStrength =
    activePattern === 'carbon_twill' || activePattern === 'carbon_forged'
      ? 0.88
      : activePattern === 'brushed_metal' || activePattern === 'fabric_racing'
        ? 0.42
        : 0.28;

  // Install lightweight shader hook once for fine material-level surface detail modulation (like CSP txDetail)
  if (!mat.userData.__carbonUniforms) {
    const maps = getSurfacePatternTextures(
      hasPattern ? activePattern : 'carbon_twill',
      state.carbonWeaveScale || 60
    );
    const uniforms = {
      uCarbonEnabled: { value: hasPattern ? detailBlendStrength : 0.0 },
      uCarbonDetailMap: { value: maps.detailTex },
    };
    mat.userData.__carbonUniforms = uniforms;
    const prevCompile = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader, renderer) => {
      prevCompile?.call(mat, shader, renderer);
      shader.uniforms.uCarbonEnabled = uniforms.uCarbonEnabled;
      shader.uniforms.uCarbonDetailMap = uniforms.uCarbonDetailMap;
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
uniform float uCarbonEnabled;
uniform sampler2D uCarbonDetailMap;`
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
#ifdef USE_NORMALMAP
  if ( uCarbonEnabled > 0.01 ) {
    vec3 cWeave = texture2D( uCarbonDetailMap, vNormalMapUv ).rgb;
    diffuseColor.rgb *= mix( vec3( 1.0 ), cWeave * 1.42, uCarbonEnabled );
  }
#endif`
        );
    };
    mat.customProgramCacheKey = () => 'ac_livery_surface_detail_v2';
    mat.needsUpdate = true;
  }

  const prevPattern = (mat.userData.__prevSurfacePattern as SurfacePatternType | undefined) ?? 'none';
  mat.userData.__prevSurfacePattern = activePattern;
  mat.userData.__prevCarbonActive = hasPattern;
  mat.userData.__carbonUniforms.uCarbonEnabled.value = hasPattern ? detailBlendStrength : 0.0;

  mat.color.set('#ffffff'); // Color is baked into the live canvas texture!
  mat.metalness = state.metalness;
  mat.roughness = state.roughness;
  mat.clearcoat = state.clearcoat;
  mat.clearcoatRoughness = state.clearcoatRoughness;
  mat.reflectivity = state.fresnelMax;
  mat.envMapIntensity = state.envIntensity;
  mat.iridescence = state.iridescence;
  mat.iridescenceIOR = state.presetId === 'pearl_chameleon' ? 1.55 : 1.3;
  mat.iridescenceThicknessRange =
    state.presetId === 'pearl_chameleon' ? [180, 620] : [120, 340];

  if (hasPattern) {
    const maps = getSurfacePatternTextures(activePattern, state.carbonWeaveScale || 60);
    mat.userData.__carbonUniforms.uCarbonDetailMap.value = maps.detailTex;
    mat.normalMap = maps.normalTex;
    const nStrength = Math.max(0.05, Math.min(2.0, state.normalStrength ?? 0.85));
    mat.normalScale.set(nStrength, nStrength);
    mat.roughnessMap = maps.roughnessTex;
    mat.metalnessMap = maps.metalnessTex;
  } else {
    const orig = mat.userData.__origPbrMaps as {
      normalMap: THREE.Texture | null;
      normalScale: THREE.Vector2;
      roughnessMap: THREE.Texture | null;
      metalnessMap: THREE.Texture | null;
    };
    mat.normalMap = orig.normalMap;
    mat.normalScale.copy(orig.normalScale);
    mat.roughnessMap = orig.roughnessMap;
    mat.metalnessMap = orig.metalnessMap;
  }

  if (prevPattern !== activePattern) {
    mat.needsUpdate = true;
  }
}

const cachedFlakeTile = {
  key: '',
  canvas: null as HTMLCanvasElement | null,
};

function getCachedFlakeTile(secondaryColor: string, flakeIntensity: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const key = `${secondaryColor}_${Math.round(flakeIntensity * 50)}`;
  if (cachedFlakeTile.key === key && cachedFlakeTile.canvas) {
    return cachedFlakeTile.canvas;
  }
  const fTile = cachedFlakeTile.canvas ?? document.createElement('canvas');
  fTile.width = 64;
  fTile.height = 64;
  const fctx = fTile.getContext('2d');
  if (!fctx) return null;
  fctx.clearRect(0, 0, 64, 64);
  let seed = 4242;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 180; i++) {
    const alpha = rnd() * 0.14 * flakeIntensity;
    fctx.fillStyle =
      i % 3 === 0 ? secondaryColor : `rgba(255,255,255,${alpha.toFixed(3)})`;
    fctx.globalAlpha = alpha;
    fctx.fillRect((rnd() * 64) | 0, (rnd() * 64) | 0, 1.5, 1.5);
  }
  cachedFlakeTile.key = key;
  cachedFlakeTile.canvas = fTile;
  return fTile;
}

const cached2dPatternTiles = new Map<SurfacePatternType, HTMLCanvasElement>();

function get2dSurfaceGrainTile(pattern: SurfacePatternType): HTMLCanvasElement | null {
  if (typeof document === 'undefined' || pattern === 'none' || pattern === 'carbon_twill') {
    return null;
  }
  const hit = cached2dPatternTiles.get(pattern);
  if (hit) return hit;

  const tile = document.createElement('canvas');
  tile.width = 64;
  tile.height = 64;
  const tctx = tile.getContext('2d');
  if (!tctx) return null;

  const bufs = generateSurfacePatternBuffers(pattern, 512);
  const imgData = tctx.createImageData(64, 64);
  const dst = imgData.data;
  const step = 512 / 64;
  for (let y = 0; y < 64; y++) {
    const sy = Math.min(511, Math.floor(y * step));
    for (let x = 0; x < 64; x++) {
      const sx = Math.min(511, Math.floor(x * step));
      const si = (sy * 512 + sx) * 4;
      const di = (y * 64 + x) * 4;
      const v = bufs.detailRgba[si];
      dst[di] = v;
      dst[di + 1] = v;
      dst[di + 2] = v;
      dst[di + 3] = 255;
    }
  }
  tctx.putImageData(imgData, 0, 0);
  cached2dPatternTiles.set(pattern, tile);
  return tile;
}

function hasActiveColorGrading(adj?: TextureAdjustmentParams): boolean {
  if (!adj) return false;
  return (
    Math.abs(adj.brightness) > 0.005 ||
    Math.abs(adj.contrast) > 0.005 ||
    Math.abs(adj.saturation) > 0.005 ||
    Math.abs(adj.hueShiftDeg) > 0.5 ||
    Math.abs(adj.gamma - 1.0) > 0.01 ||
    adj.tintStrength > 0.01
  );
}

function applyColorGradingInPlace(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  adj: TextureAdjustmentParams
) {
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;
  const br = adj.brightness * 255;
  const cf = Math.pow(1 + adj.contrast, 2);
  const sat = Math.max(0, 1 + adj.saturation);
  const invGamma = 1 / Math.max(0.25, Math.min(2.8, adj.gamma || 1.0));
  const useGamma = Math.abs(invGamma - 1.0) > 0.01;
  const hueRad = (adj.hueShiftDeg * Math.PI) / 180;
  const useHue = Math.abs(adj.hueShiftDeg) > 0.5;
  const cosH = Math.cos(hueRad);
  const sinH = Math.sin(hueRad);

  const tintRgb = adj.tintStrength > 0.01 ? new THREE.Color(adj.tintColor || '#ffffff') : null;
  const tr = tintRgb ? tintRgb.r * 255 : 255;
  const tg = tintRgb ? tintRgb.g * 255 : 255;
  const tb = tintRgb ? tintRgb.b * 255 : 255;
  const tStr = adj.tintStrength;
  const tMode = adj.tintMode;

  const gammaLut = new Uint8Array(256);
  if (useGamma) {
    for (let i = 0; i < 256; i++) {
      gammaLut[i] = Math.max(0, Math.min(255, Math.round(Math.pow(i / 255, invGamma) * 255)));
    }
  }

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i];
    let g = d[i + 1];
    let b = d[i + 2];

    // 1. Brightness & Contrast
    r = (r - 128) * cf + 128 + br;
    g = (g - 128) * cf + 128 + br;
    b = (b - 128) * cf + 128 + br;

    // 2. Hue rotation in YIQ-like luma/chroma plane
    if (useHue) {
      const y = 0.299 * r + 0.587 * g + 0.114 * b;
      const cr = r - y;
      const cb = b - y;
      const nCr = cr * cosH - cb * sinH;
      const nCb = cr * sinH + cb * cosH;
      r = y + nCr;
      b = y + nCb;
      g = (y - 0.299 * r - 0.114 * b) / 0.587;
    }

    // 3. Saturation
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = luma + (r - luma) * sat;
    g = luma + (g - luma) * sat;
    b = luma + (b - luma) * sat;

    // 4. Optional Color Tint
    if (tintRgb) {
      if (tMode === 'multiply') {
        r = r * (1 - tStr) + (r * tr) / 255 * tStr;
        g = g * (1 - tStr) + (g * tg) / 255 * tStr;
        b = b * (1 - tStr) + (b * tb) / 255 * tStr;
      } else if (tMode === 'screen') {
        const sr = 255 - ((255 - r) * (255 - tr)) / 255;
        const sg = 255 - ((255 - g) * (255 - tg)) / 255;
        const sb = 255 - ((255 - b) * (255 - tb)) / 255;
        r = r * (1 - tStr) + sr * tStr;
        g = g * (1 - tStr) + sg * tStr;
        b = b * (1 - tStr) + sb * tStr;
      } else {
        // overlay
        const ov = (base: number, blend: number) =>
          base < 128 ? (2 * base * blend) / 255 : 255 - (2 * (255 - base) * (255 - blend)) / 255;
        r = r * (1 - tStr) + ov(Math.max(0, Math.min(255, r)), tr) * tStr;
        g = g * (1 - tStr) + ov(Math.max(0, Math.min(255, g)), tg) * tStr;
        b = b * (1 - tStr) + ov(Math.max(0, Math.min(255, b)), tb) * tStr;
      }
    }

    let ri = Math.max(0, Math.min(255, Math.round(r)));
    let gi = Math.max(0, Math.min(255, Math.round(g)));
    let bi = Math.max(0, Math.min(255, Math.round(b)));

    // 5. Gamma
    if (useGamma) {
      ri = gammaLut[ri];
      gi = gammaLut[gi];
      bi = gammaLut[bi];
    }

    d[i] = ri;
    d[i + 1] = gi;
    d[i + 2] = bi;
  }

  ctx.putImageData(imgData, 0, 0);
}

// ===== Shared Scratch Canvases & World-Space Mesh Cache for Zero-Seam Masking & GT7 3D Decal Projection =====
let scratchMaskCanvas: HTMLCanvasElement | null = null;
let scratchMaskFillCanvas: HTMLCanvasElement | null = null;
let scratchMaskBuf: Uint8Array | null = null;
let scratchMaskDilateBuf: Uint8Array | null = null;
let scratchDecalGraphicCanvas: HTMLCanvasElement | null = null;
let scratchProjCanvas: HTMLCanvasElement | null = null;
let scratchProjImgData: ImageData | null = null;
let scratchProjStampBuf: Uint32Array | null = null;
let scratchProjStampCounter = 1;

interface CachedUvMaskLayer {
  w: number;
  h: number;
  minX: number;
  minY: number;
  dw: number;
  dh: number;
  canvas: HTMLCanvasElement;
}

const uvMaskCanvasCache = new WeakMap<Float32Array, CachedUvMaskLayer>();

/**
 * Frees large temporary scratch canvases & pixel buffers (critical after 4096px / 8192px skin export).
 */
export function releaseLiveryScratchBuffers(): void {
  const zeroCanvas = (c: HTMLCanvasElement | null) => {
    if (c) {
      c.width = 0;
      c.height = 0;
    }
  };
  zeroCanvas(scratchMaskCanvas);
  zeroCanvas(scratchMaskFillCanvas);
  zeroCanvas(scratchDecalGraphicCanvas);
  zeroCanvas(scratchProjCanvas);
  scratchMaskCanvas = null;
  scratchMaskFillCanvas = null;
  scratchMaskBuf = null;
  scratchMaskDilateBuf = null;
  scratchDecalGraphicCanvas = null;
  scratchProjCanvas = null;
  scratchProjImgData = null;
  scratchProjStampBuf = null;
  scratchProjStampCounter = 1;
}

interface CachedMeshProjTriangles {
  triCount: number;
  /** [x0,y0,z0, x1,y1,z1, x2,y2,z2, ...] in world space */
  pos: Float32Array;
  /** [nx,ny,nz, ...] unit face normal per triangle */
  norm: Float32Array;
  /** [u0,v0, u1,v1, u2,v2, ...] continuous per-triangle UVs (DirectX top-left V, anchored to [0,1]) */
  uv: Float32Array;
  /** World matrix signature so cache refreshes cleanly if mesh transform ever changes */
  matSig: string;
}

const meshProjCache = new WeakMap<THREE.Mesh, CachedMeshProjTriangles>();

function getMatrixSignature(m: THREE.Matrix4): string {
  const e = m.elements;
  return `${e[0].toFixed(4)},${e[5].toFixed(4)},${e[10].toFixed(4)},${e[12].toFixed(4)},${e[13].toFixed(4)},${e[14].toFixed(4)}`;
}

function getMeshProjectionTriangles(mesh: THREE.Mesh): CachedMeshProjTriangles | null {
  const geom = mesh.geometry;
  if (!geom) return null;
  const posAttr = geom.attributes.position;
  const uvAttr = geom.attributes.uv;
  if (!posAttr || !uvAttr || posAttr.count < 3) return null;

  mesh.updateMatrixWorld();
  const sig = getMatrixSignature(mesh.matrixWorld);
  const hit = meshProjCache.get(mesh);
  if (hit && hit.matSig === sig) return hit;

  const idxAttr = geom.index;
  const rawTris = idxAttr ? Math.floor(idxAttr.count / 3) : Math.floor(posAttr.count / 3);
  const pos = new Float32Array(rawTris * 9);
  const norm = new Float32Array(rawTris * 3);
  const uv = new Float32Array(rawTris * 6);

  const mw = mesh.matrixWorld;
  const v0 = new THREE.Vector3();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const fn = new THREE.Vector3();

  let count = 0;
  for (let t = 0; t < rawTris; t++) {
    const i0 = idxAttr ? idxAttr.getX(t * 3) : t * 3;
    const i1 = idxAttr ? idxAttr.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = idxAttr ? idxAttr.getX(t * 3 + 2) : t * 3 + 2;

    v0.fromBufferAttribute(posAttr, i0).applyMatrix4(mw);
    v1.fromBufferAttribute(posAttr, i1).applyMatrix4(mw);
    v2.fromBufferAttribute(posAttr, i2).applyMatrix4(mw);

    e1.subVectors(v1, v0);
    e2.subVectors(v2, v0);
    fn.crossVectors(e1, e2);
    const nLen = fn.length();
    if (nLen < 1e-9) continue;
    fn.divideScalar(nLen);

    const rawU0 = uvAttr.getX(i0);
    const rawV0 = uvAttr.getY(i0);
    const rawU1 = uvAttr.getX(i1);
    const rawV1 = uvAttr.getY(i1);
    const rawU2 = uvAttr.getX(i2);
    const rawV2 = uvAttr.getY(i2);

    // Shift triangle cleanly into [0,1] anchor tile preserving exact edge continuity (DirectX V = top-to-bottom)
    const baseU = Math.floor(rawU0);
    const baseV = Math.floor(rawV0);

    const pOff = count * 9;
    pos[pOff] = v0.x; pos[pOff + 1] = v0.y; pos[pOff + 2] = v0.z;
    pos[pOff + 3] = v1.x; pos[pOff + 4] = v1.y; pos[pOff + 5] = v1.z;
    pos[pOff + 6] = v2.x; pos[pOff + 7] = v2.y; pos[pOff + 8] = v2.z;

    const nOff = count * 3;
    norm[nOff] = fn.x; norm[nOff + 1] = fn.y; norm[nOff + 2] = fn.z;

    const uOff = count * 6;
    uv[uOff] = rawU0 - baseU;
    uv[uOff + 1] = rawV0 - baseV;
    uv[uOff + 2] = rawU1 - baseU;
    uv[uOff + 3] = rawV1 - baseV;
    uv[uOff + 4] = rawU2 - baseU;
    uv[uOff + 5] = rawV2 - baseV;
    count++;
  }

  const cached: CachedMeshProjTriangles = {
    triCount: count,
    pos: count === rawTris ? pos : pos.subarray(0, count * 9),
    norm: count === rawTris ? norm : norm.subarray(0, count * 3),
    uv: count === rawTris ? uv : uv.subarray(0, count * 6),
    matSig: sig,
  };
  meshProjCache.set(mesh, cached);
  return cached;
}

/**
 * Builds an orthonormal 3D Decal Projection basis (GT7 "カメラに合わせる" or "ボディ表面に合わせる").
 * Guarantees upright alignment with the user's current 3D screen view from ANY angle (including top-down roof/hood!).
 */
export function buildDecalProjection3D(params: {
  hitPoint: THREE.Vector3;
  surfaceNormal: THREE.Vector3;
  cameraPosition: THREE.Vector3;
  cameraUp: THREE.Vector3;
  mode: DecalProjectionMode;
  widthM: number;
  heightM: number;
  depthM?: number;
  angleLimitDeg?: number;
}): DecalProjection3D {
  const fwd = new THREE.Vector3();
  if (params.mode === 'surface') {
    fwd.copy(params.surfaceNormal).negate();
  } else {
    fwd.subVectors(params.hitPoint, params.cameraPosition);
  }
  if (fwd.lengthSq() < 1e-8) {
    fwd.set(0, 0, -1);
  } else {
    fwd.normalize();
  }

  const refUp = params.cameraUp.clone();
  if (refUp.lengthSq() < 1e-6) refUp.set(0, 1, 0);
  else refUp.normalize();

  let right = new THREE.Vector3().crossVectors(fwd, refUp);
  if (right.lengthSq() < 1e-6) {
    const altUp = Math.abs(fwd.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
    right.crossVectors(fwd, altUp);
  }
  right.normalize();

  const up = new THREE.Vector3().crossVectors(right, fwd).normalize();

  return {
    mode: params.mode,
    origin: [
      Number(params.hitPoint.x.toFixed(4)),
      Number(params.hitPoint.y.toFixed(4)),
      Number(params.hitPoint.z.toFixed(4)),
    ],
    forward: [
      Number(fwd.x.toFixed(5)),
      Number(fwd.y.toFixed(5)),
      Number(fwd.z.toFixed(5)),
    ],
    right: [
      Number(right.x.toFixed(5)),
      Number(right.y.toFixed(5)),
      Number(right.z.toFixed(5)),
    ],
    up: [
      Number(up.x.toFixed(5)),
      Number(up.y.toFixed(5)),
      Number(up.z.toFixed(5)),
    ],
    widthM: Number(Math.max(0.04, Math.min(4.5, params.widthM)).toFixed(3)),
    heightM: Number(Math.max(0.04, Math.min(4.5, params.heightM)).toFixed(3)),
    depthM: Number(Math.max(0.04, Math.min(2.5, params.depthM ?? 0.35)).toFixed(3)),
    angleLimitDeg: Math.round(Math.max(15, Math.min(90, params.angleLimitDeg ?? 70))),
  };
}

/**
 * Mirrors a GT7 3D Decal Projection across the car's left-right symmetry plane (X = 0).
 * - `keepReadable = false`: Symmetric mirror duplicate (arrows, stripes, diagonal graphics mirror front-to-back)
 * - `keepReadable = true`: Readable opposite-side duplicate (numbers & sponsor text stay left-to-right readable)
 */
export function mirrorDecalProjectionAcrossX(
  proj: DecalProjection3D,
  rotationDeg: number,
  flipX: boolean,
  keepReadable: boolean
): { projection3d: DecalProjection3D; rotationDeg: number; flipX: boolean } {
  const origin: [number, number, number] = [
    Number((-proj.origin[0]).toFixed(4)),
    proj.origin[1],
    proj.origin[2],
  ];
  const fwd = new THREE.Vector3(-proj.forward[0], proj.forward[1], proj.forward[2]).normalize();
  const up = new THREE.Vector3(-proj.up[0], proj.up[1], proj.up[2]).normalize();
  const right = new THREE.Vector3().crossVectors(fwd, up);
  if (right.lengthSq() < 1e-6) {
    right.set(-proj.right[0], proj.right[1], proj.right[2]);
  }
  right.normalize();
  const orthoUp = new THREE.Vector3().crossVectors(right, fwd).normalize();

  return {
    projection3d: {
      ...proj,
      origin,
      forward: [Number(fwd.x.toFixed(5)), Number(fwd.y.toFixed(5)), Number(fwd.z.toFixed(5))],
      right: [Number(right.x.toFixed(5)), Number(right.y.toFixed(5)), Number(right.z.toFixed(5))],
      up: [Number(orthoUp.x.toFixed(5)), Number(orthoUp.y.toFixed(5)), Number(orthoUp.z.toFixed(5))],
    },
    rotationDeg: keepReadable ? rotationDeg : -rotationDeg,
    flipX: keepReadable ? flipX : !flipX,
  };
}

/**
 * Shared vector/image decal graphic renderer centered at (0, 0) within drawW x drawH.
 * Used by BOTH GT7 3D Camera/Surface Decal Projection and legacy 2D UV layers.
 */
function drawDecalGraphicCentered(
  ctx: CanvasRenderingContext2D,
  layer: LiveryLayer,
  drawW: number,
  drawH: number,
  imageCache: Map<string, HTMLImageElement>
) {
  if (layer.kind === 'image' && layer.imageDataUrl) {
    const img = imageCache.get(layer.imageDataUrl);
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    }
  } else if (layer.kind === 'stripe_center') {
    ctx.fillStyle = layer.color;
    ctx.fillRect(-drawW * 0.45, -drawH / 2, drawW * 0.38, drawH);
    ctx.fillRect(drawW * 0.07, -drawH / 2, drawW * 0.38, drawH);
    if (layer.accentColor) {
      ctx.fillStyle = layer.accentColor;
      ctx.fillRect(-drawW * 0.50, -drawH / 2, drawW * 0.03, drawH);
      ctx.fillRect(drawW * 0.47, -drawH / 2, drawW * 0.03, drawH);
    }
  } else if (layer.kind === 'stripe_slash') {
    ctx.fillStyle = layer.color;
    ctx.beginPath();
    ctx.moveTo(-drawW * 0.5, drawH * 0.5);
    ctx.lineTo(-drawW * 0.1, -drawH * 0.5);
    ctx.lineTo(drawW * 0.5, -drawH * 0.5);
    ctx.lineTo(drawW * 0.1, drawH * 0.5);
    ctx.closePath();
    ctx.fill();
    if (layer.accentColor) {
      ctx.fillStyle = layer.accentColor;
      ctx.beginPath();
      ctx.moveTo(-drawW * 0.62, drawH * 0.5);
      ctx.lineTo(-drawW * 0.22, -drawH * 0.5);
      ctx.lineTo(-drawW * 0.14, -drawH * 0.5);
      ctx.lineTo(-drawW * 0.54, drawH * 0.5);
      ctx.closePath();
      ctx.fill();
    }
  } else if (layer.kind === 'number_plate_circle') {
    const r = Math.min(drawW, drawH) * 0.46;
    ctx.fillStyle = layer.color;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(3, r * 0.06);
    ctx.strokeStyle = layer.accentColor || '#111827';
    ctx.stroke();

    ctx.fillStyle = layer.accentColor || '#111827';
    ctx.font = `900 ${Math.round(r * 1.15)}px Impact, Arial Black, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(layer.text || '07', 0, r * 0.06);
  } else if (layer.kind === 'number_plate_gt') {
    const inset = Math.max(3, drawW * 0.025);
    const iw = drawW - inset * 2;
    const ih = drawH - inset * 2;
    ctx.fillStyle = layer.color;
    ctx.fillRect(-iw / 2, -ih / 2, iw, ih);
    ctx.fillStyle = layer.accentColor || '#e11d48';
    ctx.fillRect(-iw / 2, -ih / 2, iw, ih * 0.26);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = Math.max(3, iw * 0.03);
    ctx.strokeRect(-iw / 2, -ih / 2, iw, ih);

    ctx.fillStyle = '#0f172a';
    ctx.font = `900 ${Math.round(ih * 0.55)}px Impact, Arial Black, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(layer.text || '24', 0, ih * 0.14);
  } else if (layer.kind === 'checker_band') {
    const cols = 12;
    const rows = 3;
    const cw = drawW / cols;
    const ch = drawH / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? layer.color : layer.accentColor || '#0f172a';
        ctx.fillRect(-drawW / 2 + c * cw, -drawH / 2 + r * ch, cw + 0.5, ch + 0.5);
      }
    }
  } else if (layer.kind === 'star') {
    const outerR = Math.min(drawW, drawH) * 0.46;
    const innerR = outerR * 0.42;
    ctx.fillStyle = layer.color;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 === 0 ? outerR : innerR;
      const a = (i * Math.PI) / 5 - Math.PI / 2;
      if (i === 0) ctx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
      else ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    ctx.closePath();
    ctx.fill();
  } else if (layer.kind === 'arrow') {
    ctx.fillStyle = layer.color;
    ctx.beginPath();
    ctx.moveTo(drawW * 0.48, 0);
    ctx.lineTo(-drawW * 0.08, -drawH * 0.46);
    ctx.lineTo(-drawW * 0.08, -drawH * 0.21);
    ctx.lineTo(-drawW * 0.48, -drawH * 0.21);
    ctx.lineTo(-drawW * 0.48, drawH * 0.21);
    ctx.lineTo(-drawW * 0.08, drawH * 0.21);
    ctx.lineTo(-drawW * 0.08, drawH * 0.46);
    ctx.closePath();
    ctx.fill();
  } else if (layer.kind === 'text') {
    const fontSize = Math.max(18, Math.round(drawH * 0.68));
    ctx.font = `900 italic ${fontSize}px Impact, "Segoe UI Black", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (layer.accentColor) {
      ctx.strokeStyle = layer.accentColor;
      ctx.lineWidth = Math.max(3, fontSize * 0.12);
      ctx.strokeText(layer.text || 'RACING', 0, 0);
    }
    ctx.fillStyle = layer.color;
    ctx.fillText(layer.text || 'RACING', 0, 0);
  }
}

/**
 * Exact software barycentric rasterizer for 3D mesh UV triangles (`[u0,v0,u1,v1,u2,v2,...]`)
 * with conservative edge coverage, degenerate sliver edge-walking, and separable morphological dilation.
 * Guarantees 100% solid coverage of EVERY polygon in a mesh with ZERO skipped triangles,
 * ZERO winding-rule holes, and ZERO base-color triangles left between adjacent polygons!
 */
export function rasterizeUvTrianglesToMask(
  tris: Float32Array,
  w: number,
  h: number,
  dilateRadius = w >= 4096 ? 2 : 1,
  reuseBuffers?: { maskBuf: Uint8Array; dilateBuf: Uint8Array }
): { mask: Uint8Array; minX: number; minY: number; maxX: number; maxY: number } {
  const totalPx = w * h;
  const mask =
    reuseBuffers && reuseBuffers.maskBuf.length === totalPx
      ? reuseBuffers.maskBuf
      : new Uint8Array(totalPx);
  mask.fill(0);

  let dirtyMinX = w;
  let dirtyMinY = h;
  let dirtyMaxX = -1;
  let dirtyMaxY = -1;

  const markPixel = (px: number, py: number) => {
    if (px < 0 || px >= w || py < 0 || py >= h) return;
    mask[py * w + px] = 255;
    if (px < dirtyMinX) dirtyMinX = px;
    if (px > dirtyMaxX) dirtyMaxX = px;
    if (py < dirtyMinY) dirtyMinY = py;
    if (py > dirtyMaxY) dirtyMaxY = py;
  };

  const rasterEdge = (ax: number, ay: number, bx: number, by: number) => {
    const dist = Math.hypot(bx - ax, by - ay);
    const steps = Math.max(1, Math.min(w + h, Math.ceil(dist * 2)));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const px = Math.floor(ax + (bx - ax) * t);
      const py = Math.floor(ay + (by - ay) * t);
      if (px >= 0 && px < w && py >= 0 && py < h) {
        markPixel(px, py);
      }
    }
  };

  const wMax = w - 1;
  const hMax = h - 1;

  for (let i = 0; i + 5 < tris.length; i += 6) {
    const x0 = tris[i] * w;
    const y0 = tris[i + 1] * h;
    const x1 = tris[i + 2] * w;
    const y1 = tris[i + 3] * h;
    const x2 = tris[i + 4] * w;
    const y2 = tris[i + 5] * h;

    const minPx = Math.max(0, Math.floor(Math.min(x0, x1, x2)) - 1);
    const maxPx = Math.min(wMax, Math.ceil(Math.max(x0, x1, x2)) + 1);
    const minPy = Math.max(0, Math.floor(Math.min(y0, y1, y2)) - 1);
    const maxPy = Math.min(hMax, Math.ceil(Math.max(y0, y1, y2)) + 1);
    if (minPx > maxPx || minPy > maxPy) continue;

    const area = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
    const absArea = Math.abs(area);
    if (absArea < 0.08) {
      // Degenerate or ultra-skinny bevel sliver: walk all 3 edges so ZERO cracks remain
      rasterEdge(x0, y0, x1, y1);
      rasterEdge(x1, y1, x2, y2);
      rasterEdge(x2, y2, x0, y0);
      continue;
    }

    const invArea = 1.0 / area;
    const edgeLen =
      Math.hypot(x1 - x0, y1 - y0) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x0 - x2, y0 - y2);
    // Conservative +0.75px edge coverage closes every sub-pixel boundary between adjacent triangles
    const tol = Math.min(0.4, (0.75 * edgeLen) / absArea);

    const a0 = (y1 - y2) * invArea;
    const b0 = (x2 - x1) * invArea;
    const a1 = (y2 - y0) * invArea;
    const b1 = (x0 - x2) * invArea;

    for (let py = minPy; py <= maxPy; py++) {
      const fyOff = py + 0.5 - y2;
      const rowOff = py * w;
      const w0Base = b0 * fyOff;
      const w1Base = b1 * fyOff;
      let hitRow = false;
      for (let px = minPx; px <= maxPx; px++) {
        const fxOff = px + 0.5 - x2;
        const w0 = a0 * fxOff + w0Base;
        if (w0 < -tol) continue;
        const w1 = a1 * fxOff + w1Base;
        if (w1 < -tol) continue;
        const w2 = 1.0 - w0 - w1;
        if (w2 < -tol) continue;
        mask[rowOff + px] = 255;
        if (px < dirtyMinX) dirtyMinX = px;
        if (px > dirtyMaxX) dirtyMaxX = px;
        hitRow = true;
      }
      if (hitRow) {
        if (py < dirtyMinY) dirtyMinY = py;
        if (py > dirtyMaxY) dirtyMaxY = py;
      }
    }
  }

  if (dirtyMaxX < dirtyMinX || dirtyMaxY < dirtyMinY) {
    return { mask, minX: 0, minY: 0, maxX: -1, maxY: -1 };
  }

  // Fast separable box dilation inside dirty rect closes micro-gaps & pads UV island borders for mipmaps
  const r = Math.max(0, Math.min(4, Math.round(dilateRadius)));
  if (r > 0) {
    const tmp =
      reuseBuffers && reuseBuffers.dilateBuf.length === totalPx
        ? reuseBuffers.dilateBuf
        : new Uint8Array(totalPx);

    const xStart = Math.max(0, dirtyMinX - r);
    const xEnd = Math.min(wMax, dirtyMaxX + r);
    const yStart = Math.max(0, dirtyMinY - r);
    const yEnd = Math.min(hMax, dirtyMaxY + r);

    // Horizontal pass (mask -> tmp)
    for (let y = dirtyMinY; y <= dirtyMaxY; y++) {
      const rowOff = y * w;
      for (let x = xStart; x <= xEnd; x++) {
        let on = 0;
        const lx0 = x - r < 0 ? 0 : x - r;
        const lx1 = x + r > wMax ? wMax : x + r;
        for (let lx = lx0; lx <= lx1; lx++) {
          if (mask[rowOff + lx]) {
            on = 255;
            break;
          }
        }
        tmp[rowOff + x] = on;
      }
    }
    // Clear rows just above/below dirtyMinY..dirtyMaxY in tmp so vertical pass never reads stale bytes
    for (let y = yStart; y < dirtyMinY; y++) {
      tmp.fill(0, y * w + xStart, y * w + xEnd + 1);
    }
    for (let y = dirtyMaxY + 1; y <= yEnd; y++) {
      tmp.fill(0, y * w + xStart, y * w + xEnd + 1);
    }

    // Vertical pass (tmp -> mask)
    for (let y = yStart; y <= yEnd; y++) {
      const ly0 = y - r < 0 ? 0 : y - r;
      const ly1 = y + r > hMax ? hMax : y + r;
      const dstRow = y * w;
      for (let x = xStart; x <= xEnd; x++) {
        let on = 0;
        for (let ly = ly0; ly <= ly1; ly++) {
          if (tmp[ly * w + x]) {
            on = 255;
            break;
          }
        }
        mask[dstRow + x] = on;
      }
    }

    dirtyMinX = xStart;
    dirtyMaxX = xEnd;
    dirtyMinY = yStart;
    dirtyMaxY = yEnd;
  }

  return { mask, minX: dirtyMinX, minY: dirtyMinY, maxX: dirtyMaxX, maxY: dirtyMaxY };
}

/**
 * Renders a 3D mesh UV part-paste mask using exact software barycentric rasterization +
 * morphological gutter dilation + 2-pass destination-in compositing.
 * Zero skipped polygons, zero unpainted base-color triangles, zero white hairlines!
 */
function renderMeshUvMaskLayer(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  layer: LiveryLayer,
  baseOriginalCanvas: HTMLCanvasElement | null,
  baseTextureBlend: number
) {
  const tris = layer.meshUvTriangles;
  if (!tris || tris.length < 6 || typeof document === 'undefined') return;

  // Reuse cached rasterized silhouette mask during live interactive editing (<= 2048px)
  const canCache = w <= 2048 && h <= 2048;
  let maskSourceCanvas: HTMLCanvasElement;
  let dMinX = 0;
  let dMinY = 0;
  let dW = 0;
  let dH = 0;

  const cached = canCache ? uvMaskCanvasCache.get(tris) : undefined;
  if (cached && cached.w === w && cached.h === h) {
    maskSourceCanvas = cached.canvas;
    dMinX = cached.minX;
    dMinY = cached.minY;
    dW = cached.dw;
    dH = cached.dh;
  } else {
    const totalPx = w * h;
    if (!scratchMaskBuf || scratchMaskBuf.length !== totalPx) {
      scratchMaskBuf = new Uint8Array(totalPx);
    }
    if (!scratchMaskDilateBuf || scratchMaskDilateBuf.length !== totalPx) {
      scratchMaskDilateBuf = new Uint8Array(totalPx);
    }
    const dilateR = w >= 4096 ? 2 : 1;
    const rast = rasterizeUvTrianglesToMask(tris, w, h, dilateR, {
      maskBuf: scratchMaskBuf,
      dilateBuf: scratchMaskDilateBuf,
    });
    if (rast.maxX < rast.minX || rast.maxY < rast.minY) return;

    dMinX = rast.minX;
    dMinY = rast.minY;
    dW = rast.maxX - rast.minX + 1;
    dH = rast.maxY - rast.minY + 1;

    if (canCache) {
      const cacheCanvas = document.createElement('canvas');
      cacheCanvas.width = dW;
      cacheCanvas.height = dH;
      const cctx = cacheCanvas.getContext('2d');
      if (!cctx) return;
      const img = cctx.createImageData(dW, dH);
      const dst = img.data;
      const mBuf = rast.mask;
      for (let y = 0; y < dH; y++) {
        const srcRow = (dMinY + y) * w + dMinX;
        let di = (y * dW) << 2;
        for (let x = 0; x < dW; x++) {
          const a = mBuf[srcRow + x];
          if (a) {
            dst[di] = 255;
            dst[di + 1] = 255;
            dst[di + 2] = 255;
            dst[di + 3] = 255;
          }
          di += 4;
        }
      }
      cctx.putImageData(img, 0, 0);
      uvMaskCanvasCache.set(tris, {
        w,
        h,
        minX: dMinX,
        minY: dMinY,
        dw: dW,
        dh: dH,
        canvas: cacheCanvas,
      });
      maskSourceCanvas = cacheCanvas;
    } else {
      // High-res export (4096 / 8192): size scratch canvas strictly to dirty bounding box to save RAM
      if (!scratchMaskCanvas) scratchMaskCanvas = document.createElement('canvas');
      if (scratchMaskCanvas.width !== dW || scratchMaskCanvas.height !== dH) {
        scratchMaskCanvas.width = dW;
        scratchMaskCanvas.height = dH;
      }
      const mctx = scratchMaskCanvas.getContext('2d');
      if (!mctx) return;
      const img = mctx.createImageData(dW, dH);
      const dst = img.data;
      const mBuf = rast.mask;
      for (let y = 0; y < dH; y++) {
        const srcRow = (dMinY + y) * w + dMinX;
        let di = (y * dW) << 2;
        for (let x = 0; x < dW; x++) {
          const a = mBuf[srcRow + x];
          if (a) {
            dst[di] = 255;
            dst[di + 1] = 255;
            dst[di + 2] = 255;
            dst[di + 3] = 255;
          }
          di += 4;
        }
      }
      mctx.putImageData(img, 0, 0);
      maskSourceCanvas = scratchMaskCanvas;
    }
  }

  // Pass 2: Render color + surface grain + original AO multiply strictly within dirty rect (dW x dH), then clip via destination-in
  if (!scratchMaskFillCanvas) scratchMaskFillCanvas = document.createElement('canvas');
  if (scratchMaskFillCanvas.width !== dW || scratchMaskFillCanvas.height !== dH) {
    scratchMaskFillCanvas.width = dW;
    scratchMaskFillCanvas.height = dH;
  }
  const fctx = scratchMaskFillCanvas.getContext('2d');
  if (!fctx) return;

  fctx.save();
  fctx.globalCompositeOperation = 'source-over';
  fctx.globalAlpha = 1;
  fctx.fillStyle = layer.color;
  fctx.fillRect(0, 0, dW, dH);

  if (layer.meshSurfacePattern && layer.meshSurfacePattern !== 'none') {
    const partTile =
      layer.meshSurfacePattern === 'carbon_twill'
        ? get2dSurfaceGrainTile('fabric_racing')
        : get2dSurfaceGrainTile(layer.meshSurfacePattern);
    if (partTile) {
      const pat = fctx.createPattern(partTile, 'repeat');
      if (pat) {
        fctx.globalCompositeOperation = 'overlay';
        fctx.globalAlpha = 0.35;
        fctx.fillStyle = pat;
        fctx.fillRect(0, 0, dW, dH);
      }
    }
  }

  if (baseOriginalCanvas && baseTextureBlend > 0.05) {
    fctx.globalCompositeOperation = 'multiply';
    fctx.globalAlpha = Math.min(0.85, baseTextureBlend);
    fctx.drawImage(
      baseOriginalCanvas,
      (dMinX / w) * baseOriginalCanvas.width,
      (dMinY / h) * baseOriginalCanvas.height,
      (dW / w) * baseOriginalCanvas.width,
      (dH / h) * baseOriginalCanvas.height,
      0,
      0,
      dW,
      dH
    );
  }

  // Strictly mask to dilated part silhouette (transparent everywhere outside the clicked 3D mesh!)
  fctx.globalCompositeOperation = 'destination-in';
  fctx.globalAlpha = 1;
  fctx.drawImage(maskSourceCanvas, 0, 0);
  fctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = layer.blendMode || 'source-over';
  ctx.globalAlpha = layer.opacity;
  ctx.drawImage(scratchMaskFillCanvas, dMinX, dMinY);
  ctx.restore();
}

/**
 * Projects a GT7-style 3D camera/surface decal directly onto the car's 3D meshes and rasterizes
 * the exact projection into the car's UV texture canvas (bilinear sampling, angle-limit feathering,
 * projection depth cutoff, and 0.75px UV seam dilation with zero double-blending).
 */
export function project3dDecalOntoCanvas(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  layer: LiveryLayer,
  targetMeshes: THREE.Mesh[],
  imageCache: Map<string, HTMLImageElement>
): boolean {
  const proj = layer.projection3d;
  if (!proj || targetMeshes.length === 0 || typeof document === 'undefined') return false;

  // 1. Render the decal graphic once into a crisp reusable offscreen canvas scaled to output resolution
  const aspect = Math.max(0.15, Math.min(6.5, proj.widthM / Math.max(0.02, proj.heightM)));
  const maxDim = w >= 8192 ? 1536 : w >= 4096 ? 1024 : w >= 2048 ? 512 : 384;
  const dw = aspect >= 1 ? maxDim : Math.max(48, Math.round(maxDim * aspect));
  const dh = aspect >= 1 ? Math.max(48, Math.round(maxDim / aspect)) : maxDim;

  if (!scratchDecalGraphicCanvas) {
    scratchDecalGraphicCanvas = document.createElement('canvas');
  }
  if (scratchDecalGraphicCanvas.width !== dw || scratchDecalGraphicCanvas.height !== dh) {
    scratchDecalGraphicCanvas.width = dw;
    scratchDecalGraphicCanvas.height = dh;
  }
  const gctx = scratchDecalGraphicCanvas.getContext('2d');
  if (!gctx) return false;
  gctx.save();
  gctx.setTransform(1, 0, 0, 1, 0, 0);
  gctx.clearRect(0, 0, dw, dh);
  gctx.translate(dw / 2, dh / 2);
  drawDecalGraphicCentered(gctx, layer, dw - 4, dh - 4, imageCache);
  gctx.restore();
  const decalPixels = gctx.getImageData(0, 0, dw, dh).data;

  // 2. Prepare reusable UV projection scratch canvas + stamp buffer
  if (!scratchProjCanvas) {
    scratchProjCanvas = document.createElement('canvas');
  }
  if (scratchProjCanvas.width !== w || scratchProjCanvas.height !== h) {
    scratchProjCanvas.width = w;
    scratchProjCanvas.height = h;
    scratchProjImgData = null;
  }
  const pctx = scratchProjCanvas.getContext('2d');
  if (!pctx) return false;
  if (!scratchProjImgData || scratchProjImgData.width !== w || scratchProjImgData.height !== h) {
    scratchProjImgData = pctx.createImageData(w, h);
  }
  if (!scratchProjStampBuf || scratchProjStampBuf.length !== w * h) {
    scratchProjStampBuf = new Uint32Array(w * h);
    scratchProjStampCounter = 1;
  }

  if (scratchProjStampCounter >= 0xfffffff0) {
    scratchProjStampBuf.fill(0);
    scratchProjStampCounter = 1;
  }
  const padStamp = scratchProjStampCounter++;
  const exactStamp = scratchProjStampCounter++;
  const outData = scratchProjImgData.data;
  const stampBuf = scratchProjStampBuf;

  // 3. Precompute rotated projector orthonormal basis in 3D world space
  const ox = proj.origin[0], oy = proj.origin[1], oz = proj.origin[2];
  const fx = proj.forward[0], fy = proj.forward[1], fz = proj.forward[2];
  const rad = (layer.rotationDeg * Math.PI) / 180;
  const cosR = Math.cos(rad);
  const sinR = Math.sin(rad);
  // Clockwise on screen (matches Canvas2D ctx.rotate and GT7 decal rotation)
  const rx = proj.right[0] * cosR - proj.up[0] * sinR;
  const ry = proj.right[1] * cosR - proj.up[1] * sinR;
  const rz = proj.right[2] * cosR - proj.up[2] * sinR;
  const ux = proj.right[0] * sinR + proj.up[0] * cosR;
  const uy = proj.right[1] * sinR + proj.up[1] * cosR;
  const uz = proj.right[2] * sinR + proj.up[2] * cosR;

  const invHalfW = 2.0 / Math.max(0.02, proj.widthM);
  const invHalfH = 2.0 / Math.max(0.02, proj.heightM);
  const depthM = Math.max(0.03, proj.depthM);
  const cosLimit = Math.cos((Math.max(10, Math.min(89.5, proj.angleLimitDeg)) * Math.PI) / 180);
  const flipX = Boolean(layer.flipX);
  const flipY = Boolean(layer.flipY);

  let dirtyMinX = w;
  let dirtyMinY = h;
  let dirtyMaxX = -1;
  let dirtyMaxY = -1;
  const dwMax = dw - 1;
  const dhMax = dh - 1;

  for (const mesh of targetMeshes) {
    const cached = getMeshProjectionTriangles(mesh);
    if (!cached) continue;
    const { triCount, pos, norm, uv } = cached;

    for (let t = 0; t < triCount; t++) {
      // Fast reject #1: Angle limit (GT7 角度制限) & backface cull
      const nOff = t * 3;
      const ndot = -(norm[nOff] * fx + norm[nOff + 1] * fy + norm[nOff + 2] * fz);
      if (ndot < cosLimit) continue;
      const angleFade =
        ndot < cosLimit + 0.1 ? Math.max(0, Math.min(1, (ndot - cosLimit) / 0.1)) : 1.0;

      // Fast reject #2: Project 3 vertices into projector normalized coords (lx, ly in [-1,1], lz in [-depthM,depthM])
      const pOff = t * 9;
      const dx0 = pos[pOff] - ox, dy0 = pos[pOff + 1] - oy, dz0 = pos[pOff + 2] - oz;
      const dx1 = pos[pOff + 3] - ox, dy1 = pos[pOff + 4] - oy, dz1 = pos[pOff + 5] - oz;
      const dx2 = pos[pOff + 6] - ox, dy2 = pos[pOff + 7] - oy, dz2 = pos[pOff + 8] - oz;

      const lx0 = (dx0 * rx + dy0 * ry + dz0 * rz) * invHalfW;
      const lx1 = (dx1 * rx + dy1 * ry + dz1 * rz) * invHalfW;
      const lx2 = (dx2 * rx + dy2 * ry + dz2 * rz) * invHalfW;
      if ((lx0 < -1 && lx1 < -1 && lx2 < -1) || (lx0 > 1 && lx1 > 1 && lx2 > 1)) continue;

      const ly0 = (dx0 * ux + dy0 * uy + dz0 * uz) * invHalfH;
      const ly1 = (dx1 * ux + dy1 * uy + dz1 * uz) * invHalfH;
      const ly2 = (dx2 * ux + dy2 * uy + dz2 * uz) * invHalfH;
      if ((ly0 < -1 && ly1 < -1 && ly2 < -1) || (ly0 > 1 && ly1 > 1 && ly2 > 1)) continue;

      const lz0 = dx0 * fx + dy0 * fy + dz0 * fz;
      const lz1 = dx1 * fx + dy1 * fy + dz1 * fz;
      const lz2 = dx2 * fx + dy2 * fy + dz2 * fz;
      if ((lz0 < -depthM && lz1 < -depthM && lz2 < -depthM) || (lz0 > depthM && lz1 > depthM && lz2 > depthM)) {
        continue;
      }

      // 4. Exact Barycentric Rasterization into UV texture coordinates (DirectX top-left V)
      const uOff = t * 6;
      const x0 = uv[uOff] * w;
      const y0 = uv[uOff + 1] * h;
      const x1 = uv[uOff + 2] * w;
      const y1 = uv[uOff + 3] * h;
      const x2 = uv[uOff + 4] * w;
      const y2 = uv[uOff + 5] * h;

      const area = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
      if (Math.abs(area) < 0.05) continue;
      const invArea = 1.0 / area;

      const edgeLen =
        Math.hypot(x1 - x0, y1 - y0) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x0 - x2, y0 - y2);
      const padTol = Math.min(0.18, (0.75 * edgeLen) / Math.max(1, Math.abs(area)));

      const minPx = Math.floor(Math.min(x0, x1, x2)) - 1;
      const maxPx = Math.ceil(Math.max(x0, x1, x2)) + 1;
      const minPy = Math.floor(Math.min(y0, y1, y2)) - 1;
      const maxPy = Math.ceil(Math.max(y0, y1, y2)) + 1;

      if (maxPx - minPx > w * 1.5 || maxPy - minPy > h * 1.5) continue;

      const a0 = (y1 - y2) * invArea;
      const b0 = (x2 - x1) * invArea;
      const a1 = (y2 - y0) * invArea;
      const b1 = (x0 - x2) * invArea;

      for (let rawY = minPy; rawY <= maxPy; rawY++) {
        const py = ((rawY % h) + h) % h;
        const fyOff = rawY + 0.5 - y2;
        for (let rawX = minPx; rawX <= maxPx; rawX++) {
          const fxOff = rawX + 0.5 - x2;
          const w0 = a0 * fxOff + b0 * fyOff;
          const w1 = a1 * fxOff + b1 * fyOff;
          const w2 = 1.0 - w0 - w1;

          const isExact = w0 >= -1e-4 && w1 >= -1e-4 && w2 >= -1e-4;
          if (!isExact && (w0 < -padTol || w1 < -padTol || w2 < -padTol)) continue;

          const px = ((rawX % w) + w) % w;
          const pIdx = py * w + px;
          const prevStamp = stampBuf[pIdx];
          if (prevStamp === exactStamp) continue;
          if (!isExact && prevStamp === padStamp) continue;

          const lx = w0 * lx0 + w1 * lx1 + w2 * lx2;
          if (lx < -1 || lx > 1) continue;
          const ly = w0 * ly0 + w1 * ly1 + w2 * ly2;
          if (ly < -1 || ly > 1) continue;
          const lz = w0 * lz0 + w1 * lz1 + w2 * lz2;
          if (lz < -depthM || lz > depthM) continue;

          // Bilinear sample from decal graphic canvas
          const su = ((flipX ? -lx : lx) * 0.5 + 0.5) * dwMax;
          const sv = ((flipY ? ly : -ly) * 0.5 + 0.5) * dhMax;
          const sx0 = su | 0;
          const sy0 = sv | 0;
          const sx1 = sx0 < dwMax ? sx0 + 1 : dwMax;
          const sy1 = sy0 < dhMax ? sy0 + 1 : dhMax;
          const tx = su - sx0;
          const ty = sv - sy0;
          const itx = 1 - tx;
          const ity = 1 - ty;

          const i00 = (sy0 * dw + sx0) << 2;
          const i10 = (sy0 * dw + sx1) << 2;
          const i01 = (sy1 * dw + sx0) << 2;
          const i11 = (sy1 * dw + sx1) << 2;

          const w00 = itx * ity;
          const w10 = tx * ity;
          const w01 = itx * ty;
          const w11 = tx * ty;

          const aSample =
            decalPixels[i00 + 3] * w00 +
            decalPixels[i10 + 3] * w10 +
            decalPixels[i01 + 3] * w01 +
            decalPixels[i11 + 3] * w11;
          const finalA = (aSample * angleFade + 0.5) | 0;
          if (finalA <= 0) continue;

          // Alpha-weighted RGB interpolation prevents dark fringes around transparent edges
          const aw00 = decalPixels[i00 + 3] * w00;
          const aw10 = decalPixels[i10 + 3] * w10;
          const aw01 = decalPixels[i01 + 3] * w01;
          const aw11 = decalPixels[i11 + 3] * w11;
          const awSum = aw00 + aw10 + aw01 + aw11;
          const invAw = awSum > 1e-4 ? 1 / awSum : 0;

          const d4 = pIdx << 2;
          outData[d4] = ((decalPixels[i00] * aw00 + decalPixels[i10] * aw10 + decalPixels[i01] * aw01 + decalPixels[i11] * aw11) * invAw + 0.5) | 0;
          outData[d4 + 1] = ((decalPixels[i00 + 1] * aw00 + decalPixels[i10 + 1] * aw10 + decalPixels[i01 + 1] * aw01 + decalPixels[i11 + 1] * aw11) * invAw + 0.5) | 0;
          outData[d4 + 2] = ((decalPixels[i00 + 2] * aw00 + decalPixels[i10 + 2] * aw10 + decalPixels[i01 + 2] * aw01 + decalPixels[i11 + 2] * aw11) * invAw + 0.5) | 0;
          outData[d4 + 3] = finalA;
          stampBuf[pIdx] = isExact ? exactStamp : padStamp;

          if (px < dirtyMinX) dirtyMinX = px;
          if (px > dirtyMaxX) dirtyMaxX = px;
          if (py < dirtyMinY) dirtyMinY = py;
          if (py > dirtyMaxY) dirtyMaxY = py;
        }
      }
    }
  }

  if (dirtyMaxX < dirtyMinX || dirtyMaxY < dirtyMinY) return false;

  const dwDirty = dirtyMaxX - dirtyMinX + 1;
  const dhDirty = dirtyMaxY - dirtyMinY + 1;

  pctx.putImageData(scratchProjImgData, 0, 0, dirtyMinX, dirtyMinY, dwDirty, dhDirty);
  ctx.save();
  ctx.globalCompositeOperation = layer.blendMode || 'source-over';
  ctx.globalAlpha = layer.opacity;
  ctx.drawImage(
    scratchProjCanvas,
    dirtyMinX,
    dirtyMinY,
    dwDirty,
    dhDirty,
    dirtyMinX,
    dirtyMinY,
    dwDirty,
    dhDirty
  );
  ctx.restore();

  // Zero out ONLY the dirty pixels we wrote so the next decal starts clean in ~0.05ms
  for (let y = dirtyMinY; y <= dirtyMaxY; y++) {
    const rowStart = (y * w + dirtyMinX) << 2;
    outData.fill(0, rowStart, rowStart + (dwDirty << 2));
  }
  return true;
}

/**
 * Composes all layers (Base Paint or Original Texture + Color Grading + Surface Micro-Grain +
 * Original AO/Panel Lines + 3D Mesh UV Part Paste Layers + GT7 3D-Projected Decals + Direct Paint Layer)
 * onto the target 2D canvas.
 */
export function composeLiveryCanvas(
  outCanvas: HTMLCanvasElement,
  paintState: PaintMaterialState,
  baseOriginalCanvas: HTMLCanvasElement | null,
  layers: LiveryLayer[],
  imageCache: Map<string, HTMLImageElement>,
  directPaintCanvas: HTMLCanvasElement | null,
  textureAdjust?: TextureAdjustmentParams,
  targetMeshes?: THREE.Mesh[],
  fallbackBaseColor?: string
) {
  const w = outCanvas.width;
  const h = outCanvas.height;
  const ctx = outCanvas.getContext('2d');
  if (!ctx) return;

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  const isOriginalAdjustMode = textureAdjust?.baseMode === 'original_adjust';

  if (isOriginalAdjustMode) {
    if (baseOriginalCanvas) {
      // Draw original car texture at 100% fidelity
      ctx.drawImage(baseOriginalCanvas, 0, 0, w, h);
    } else {
      // Untextured material fallback: preserve original material color instead of blinding white
      ctx.fillStyle = fallbackBaseColor || paintState.baseColor || '#2a303c';
      ctx.fillRect(0, 0, w, h);
    }
    if (hasActiveColorGrading(textureAdjust)) {
      applyColorGradingInPlace(ctx, w, h, textureAdjust!);
    }
  } else {
    // 1. Base Paint Layer (Solid or 2-Tone Gradient)
    if (paintState.useGradient) {
      const rad = (paintState.gradientAngleDeg * Math.PI) / 180;
      const cx = w / 2;
      const cy = h / 2;
      const r = Math.hypot(w, h) / 2;
      const grad = ctx.createLinearGradient(
        cx - Math.cos(rad) * r,
        cy - Math.sin(rad) * r,
        cx + Math.cos(rad) * r,
        cy + Math.sin(rad) * r
      );
      grad.addColorStop(0, paintState.baseColor);
      grad.addColorStop(1, paintState.secondaryColor);
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = paintState.baseColor;
    }
    ctx.fillRect(0, 0, w, h);

    // Subtle metallic/candy flake micro-sparkle baked into texture (reuses cached 64x64 tile)
    if (paintState.flakeIntensity > 0.05) {
      const fTile = getCachedFlakeTile(paintState.secondaryColor, paintState.flakeIntensity);
      if (fTile) {
        const pat = ctx.createPattern(fTile, 'repeat');
        if (pat) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = pat;
          ctx.fillRect(0, 0, w, h);
          ctx.restore();
        }
      }
    }

    // Subtle 2D surface micro-grain for non-carbon patterns (Alcantara, Leather, Moulded Plastic, Brushed Metal, Fabric, Forged Carbon)
    const activePattern = resolveActiveSurfacePattern(paintState);
    const grainTile = get2dSurfaceGrainTile(activePattern);
    if (grainTile) {
      const pat = ctx.createPattern(grainTile, 'repeat');
      if (pat) {
        ctx.save();
        ctx.globalCompositeOperation = 'overlay';
        ctx.globalAlpha =
          activePattern === 'carbon_forged'
            ? 0.45
            : activePattern === 'fabric_racing' || activePattern === 'brushed_metal'
              ? 0.28
              : 0.20;
        ctx.fillStyle = pat;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
    }

    // 2. Preserve Original Car Texture AO & Panel Lines via Multiply Blend
    if (baseOriginalCanvas && paintState.baseTextureBlend > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = Math.min(1, Math.max(0, paintState.baseTextureBlend));
      ctx.drawImage(baseOriginalCanvas, 0, 0, w, h);
      ctx.restore();
    }

    if (hasActiveColorGrading(textureAdjust)) {
      applyColorGradingInPlace(ctx, w, h, textureAdjust!);
    }
  }

  // 3. Decal / Image / Vector Shape / 3D Mesh UV Part Paste Layers (bottom to top)
  for (const layer of layers) {
    if (!layer.visible || layer.opacity <= 0.005) continue;

    // 3D Model-Conforming Part UV Region Material Paste Layer (Zero-seam dilated mask!)
    if (layer.kind === 'mesh_uv_mask' && layer.meshUvTriangles && layer.meshUvTriangles.length >= 6) {
      renderMeshUvMaskLayer(ctx, w, h, layer, baseOriginalCanvas, paintState.baseTextureBlend);
      continue;
    }

    // GT7-Style 3D Camera/Surface Projected Decal Layer!
    if (layer.projection3d && targetMeshes && targetMeshes.length > 0) {
      project3dDecalOntoCanvas(ctx, w, h, layer, targetMeshes, imageCache);
      continue;
    }

    // Legacy 2D UV-space decal fallback
    ctx.save();
    ctx.globalCompositeOperation = layer.blendMode || 'source-over';
    ctx.globalAlpha = layer.opacity;
    ctx.translate(layer.u * w, layer.v * h);
    ctx.rotate((layer.rotationDeg * Math.PI) / 180);
    if (layer.flipX || layer.flipY) {
      ctx.scale(layer.flipX ? -1 : 1, layer.flipY ? -1 : 1);
    }
    drawDecalGraphicCentered(ctx, layer, layer.scaleX * w, layer.scaleY * h, imageCache);
    ctx.restore();
  }

  // 4. Direct 3D Brush Paint Layer
  if (directPaintCanvas) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(directPaintCanvas, 0, 0, w, h);
    ctx.restore();
  }

  ctx.restore();
}

/**
 * Estimates the optimal UV detail repeat multiplier (`detailUVMultiplier`) for a given 3D mesh group
 * by measuring the ratio of 3D world-space surface area to UV-space area.
 * This ensures carbon weave, leather pebble grain, and Alcantara nap scale naturally to the actual
 * 3D model geometry (e.g. ~22-35x for small interior steering wheels, ~60-95x for full exterior body shells).
 */
export function estimateOptimalUvDetailScale(
  meshes: THREE.Mesh[],
  pattern: SurfacePatternType = 'carbon_twill'
): number {
  const baseTargetCyclesPerMeter =
    pattern === 'carbon_forged'
      ? 1.15
      : pattern === 'leather_nappa' || pattern === 'leather_synthetic'
        ? 1.55
        : pattern === 'alcantara' || pattern === 'plastic_moulded'
          ? 1.75
          : 1.45; // carbon_twill / fabric_racing / brushed_metal

  if (!meshes || meshes.length === 0) {
    return Math.round(45 * baseTargetCyclesPerMeter);
  }

  let totalWorldArea = 0;
  let totalUvArea = 0;
  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const cross = new THREE.Vector3();

  for (const mesh of meshes) {
    const geom = mesh.geometry;
    if (!geom) continue;
    const pos = geom.attributes.position;
    const uv = geom.attributes.uv;
    if (!pos || !uv || pos.count < 3) continue;

    mesh.updateMatrixWorld();
    const mw = mesh.matrixWorld;
    const idxAttr = geom.index;
    const triCount = idxAttr ? Math.floor(idxAttr.count / 3) : Math.floor(pos.count / 3);
    const step = Math.max(1, Math.floor(triCount / 600));

    for (let t = 0; t < triCount; t += step) {
      const i0 = idxAttr ? idxAttr.getX(t * 3) : t * 3;
      const i1 = idxAttr ? idxAttr.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = idxAttr ? idxAttr.getX(t * 3 + 2) : t * 3 + 2;

      vA.fromBufferAttribute(pos, i0).applyMatrix4(mw);
      vB.fromBufferAttribute(pos, i1).applyMatrix4(mw);
      vC.fromBufferAttribute(pos, i2).applyMatrix4(mw);
      e1.subVectors(vB, vA);
      e2.subVectors(vC, vA);
      const wArea = 0.5 * cross.crossVectors(e1, e2).length();

      const u0 = uv.getX(i0);
      const v0 = uv.getY(i0);
      const u1 = uv.getX(i1);
      const v1 = uv.getY(i1);
      const u2 = uv.getX(i2);
      const v2 = uv.getY(i2);
      const uvArea = 0.5 * Math.abs((u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0));

      if (wArea > 1e-7 && uvArea > 1e-7 && uvArea < 0.25) {
        totalWorldArea += wArea;
        totalUvArea += uvArea;
      }
    }
  }

  if (totalWorldArea <= 1e-5 || totalUvArea <= 1e-6) {
    return Math.round(45 * baseTargetCyclesPerMeter);
  }

  // Effective meters per 0..1 UV span
  const metersPerUvUnit = Math.sqrt(totalWorldArea / totalUvArea);
  // Each 512x512 detail tile already packs 16 cycles (~48mm at 3mm/cycle), so 1 meter needs ~20.8 tiles
  const rawScale = metersPerUvUnit * 15.5 * baseTargetCyclesPerMeter;
  return Math.round(Math.max(18, Math.min(180, rawScale)));
}

/**
 * Extracts ALL continuous 2D canvas UV triangles `[u0, v0, u1, v1, u2, v2, ...]` for a clicked 3D mesh
 * in DirectX / KN5 top-left UV space (matching `CanvasTexture.flipY = false`).
 * NEVER subsamples/skips polygons (even on 100k+ triangle mod cars) and wraps seam-crossing & tiled UVs
 * cleanly into [0, 1] so ZERO unpainted base-color triangles ever remain between polygons!
 */
export function extractMeshUvTriangles(mesh: THREE.Mesh): Float32Array {
  const geom = mesh.geometry;
  if (!geom) return new Float32Array(0);
  const uv = geom.attributes.uv;
  if (!uv || uv.count < 3) return new Float32Array(0);

  const idxAttr = geom.index;
  const triCount = idxAttr ? Math.floor(idxAttr.count / 3) : Math.floor(uv.count / 3);
  const out: number[] = [];

  for (let t = 0; t < triCount; t++) {
    const i0 = idxAttr ? idxAttr.getX(t * 3) : t * 3;
    const i1 = idxAttr ? idxAttr.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = idxAttr ? idxAttr.getX(t * 3 + 2) : t * 3 + 2;

    const rawU0 = uv.getX(i0);
    const rawV0 = uv.getY(i0);
    const rawU1 = uv.getX(i1);
    const rawV1 = uv.getY(i1);
    const rawU2 = uv.getX(i2);
    const rawV2 = uv.getY(i2);
    if (
      !Number.isFinite(rawU0) ||
      !Number.isFinite(rawV0) ||
      !Number.isFinite(rawU1) ||
      !Number.isFinite(rawV1) ||
      !Number.isFinite(rawU2) ||
      !Number.isFinite(rawV2)
    ) {
      continue;
    }

    // Anchor triangle into [0,1] preserving exact edge continuity (NO inverted 1-v!)
    const baseU = Math.floor(rawU0);
    const baseV = Math.floor(rawV0);
    const u0 = rawU0 - baseU;
    const v0 = rawV0 - baseV;
    let u1 = rawU1 - baseU;
    let v1 = rawV1 - baseV;
    let u2 = rawU2 - baseU;
    let v2 = rawV2 - baseV;

    // Normalize 2D UV winding to positive signed area
    if ((u1 - u0) * (v2 - v0) - (v1 - v0) * (u2 - u0) < 0) {
      const tuTmp = u1;
      const tvTmp = v1;
      u1 = u2;
      v1 = v2;
      u2 = tuTmp;
      v2 = tvTmp;
    }

    const minU = Math.min(u0, u1, u2);
    const maxU = Math.max(u0, u1, u2);
    const minV = Math.min(v0, v1, v2);
    const maxV = Math.max(v0, v1, v2);

    // Emit tile copies intersecting [0, 1] x [0, 1] cleanly (supports both normal [0,1] and tiled UVs!)
    let minTileU: number;
    let maxTileU: number;
    if (minU >= -1e-6 && maxU <= 1 + 1e-6) {
      minTileU = 0;
      maxTileU = 0;
    } else {
      minTileU = Math.floor(minU + 1e-6);
      maxTileU = Math.max(minTileU, Math.floor(maxU - 1e-6));
      if (maxTileU - minTileU > 8) {
        maxTileU = minTileU + 8;
      }
    }

    let minTileV: number;
    let maxTileV: number;
    if (minV >= -1e-6 && maxV <= 1 + 1e-6) {
      minTileV = 0;
      maxTileV = 0;
    } else {
      minTileV = Math.floor(minV + 1e-6);
      maxTileV = Math.max(minTileV, Math.floor(maxV - 1e-6));
      if (maxTileV - minTileV > 8) {
        maxTileV = minTileV + 8;
      }
    }

    for (let tu = minTileU; tu <= maxTileU; tu++) {
      for (let tv = minTileV; tv <= maxTileV; tv++) {
        out.push(u0 - tu, v0 - tv, u1 - tu, v1 - tv, u2 - tu, v2 - tv);
      }
    }
  }

  return new Float32Array(out);
}

/**
 * Computes the local 3D-to-UV Jacobian aspect ratio (`|dP/dU| / |dP/dV|`) on a raycast-hit triangle
 * so decals placed or dragged on the 3D car automatically compensate for non-uniform UV stretching.
 */
export function computeHitUvJacobian(
  mesh: THREE.Mesh,
  faceIndex?: number | null
): { aspectUOverV: number } {
  if (faceIndex == null || faceIndex < 0) return { aspectUOverV: 1 };
  const geom = mesh.geometry;
  if (!geom) return { aspectUOverV: 1 };
  const pos = geom.attributes.position;
  const uv = geom.attributes.uv;
  if (!pos || !uv) return { aspectUOverV: 1 };

  const idxAttr = geom.index;
  const base = faceIndex * 3;
  if (idxAttr ? base + 2 >= idxAttr.count : base + 2 >= pos.count) {
    return { aspectUOverV: 1 };
  }

  const i0 = idxAttr ? idxAttr.getX(base) : base;
  const i1 = idxAttr ? idxAttr.getX(base + 1) : base + 1;
  const i2 = idxAttr ? idxAttr.getX(base + 2) : base + 2;

  mesh.updateMatrixWorld();
  const p0 = new THREE.Vector3().fromBufferAttribute(pos, i0).applyMatrix4(mesh.matrixWorld);
  const p1 = new THREE.Vector3().fromBufferAttribute(pos, i1).applyMatrix4(mesh.matrixWorld);
  const p2 = new THREE.Vector3().fromBufferAttribute(pos, i2).applyMatrix4(mesh.matrixWorld);

  const du1 = uv.getX(i1) - uv.getX(i0);
  const dv1 = uv.getY(i1) - uv.getY(i0);
  const du2 = uv.getX(i2) - uv.getX(i0);
  const dv2 = uv.getY(i2) - uv.getY(i0);

  const det = du1 * dv2 - du2 * dv1;
  if (Math.abs(det) < 1e-7) return { aspectUOverV: 1 };

  const dp1 = new THREE.Vector3().subVectors(p1, p0);
  const dp2 = new THREE.Vector3().subVectors(p2, p0);

  // dP/dU and dP/dV in 3D world space
  const dPdU = new THREE.Vector3()
    .addScaledVector(dp1, dv2 / det)
    .addScaledVector(dp2, -dv1 / det);
  const dPdV = new THREE.Vector3()
    .addScaledVector(dp1, -du2 / det)
    .addScaledVector(dp2, du1 / det);

  const lenU = dPdU.length();
  const lenV = dPdV.length();
  if (lenU < 1e-5 || lenV < 1e-5) return { aspectUOverV: 1 };

  // Clamp ratio to safe range [0.45, 2.25] so extreme seam triangles don't distort decals
  const ratio = Math.max(0.45, Math.min(2.25, lenU / lenV));
  return { aspectUOverV: Number(ratio.toFixed(3)) };
}

/**
 * Builds an alpha-only mask canvas of ONLY decals + direct brush paint (transparent background).
 * In Assetto Corsa's `ksPerPixelMultiMap` shaders, `txDiffuse` alpha = 0 enables `txDetail` (carbon weave)
 * while alpha = 255 hides `txDetail` (clean painted decals/sponsors over carbon).
 */
export function buildCarbonDiffuseRgbaWithDetailMask(
  compositeCanvas: HTMLCanvasElement,
  layers: LiveryLayer[],
  imageCache: Map<string, HTMLImageElement>,
  directPaintCanvas: HTMLCanvasElement | null,
  targetMeshes?: THREE.Mesh[]
): Uint8Array {
  const w = compositeCanvas.width;
  const h = compositeCanvas.height;
  const baseData = compositeCanvas.getContext('2d')!.getImageData(0, 0, w, h).data;
  const out = new Uint8Array(baseData.length);
  out.set(baseData);

  // Render decals & direct brush strokes onto an empty transparent canvas to get the decal alpha mask
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = w;
  maskCanvas.height = h;
  const mctx = maskCanvas.getContext('2d');
  if (mctx) {
    mctx.clearRect(0, 0, w, h);
    if (layers.some((l) => l.visible && l.opacity > 0.005) || directPaintCanvas) {
      // Reuse composeLiveryCanvas's decal & direct paint rendering by drawing on transparent base
      const dummyState: PaintMaterialState = {
        presetId: 'gloss_solid',
        baseColor: 'rgba(0,0,0,0)',
        secondaryColor: 'rgba(0,0,0,0)',
        useGradient: false,
        gradientAngleDeg: 0,
        baseTextureBlend: 0,
        metalness: 0,
        roughness: 0.2,
        clearcoat: 0,
        clearcoatRoughness: 0.1,
        fresnelMax: 0.5,
        iridescence: 0,
        flakeIntensity: 0,
        envIntensity: 1,
        carbonPattern: false,
        carbonWeaveScale: 90,
      };
      composeLiveryCanvas(
        maskCanvas,
        dummyState,
        null,
        layers,
        imageCache,
        directPaintCanvas,
        undefined,
        targetMeshes
      );
    }
    const maskData = mctx.getImageData(0, 0, w, h).data;
    for (let i = 0; i < w * h; i++) {
      // Bare carbon -> alpha 0 (100% txDetail visible); opaque decal/paint -> alpha 255 (0% txDetail)
      out[i * 4 + 3] = maskData[i * 4 + 3];
    }
  } else {
    for (let i = 0; i < w * h; i++) {
      out[i * 4 + 3] = 0;
    }
  }

  return out;
}

function isPowerOfTwo(n: number): boolean {
  return n >= 1 && (n & (n - 1)) === 0;
}

function downsampleRgba2x(
  src: Uint8Array | Uint8ClampedArray,
  srcW: number,
  srcH: number,
  isNormalMap: boolean
): { data: Uint8Array; width: number; height: number } {
  const dstW = Math.max(1, srcW >> 1);
  const dstH = Math.max(1, srcH >> 1);
  const dst = new Uint8Array(dstW * dstH * 4);

  for (let y = 0; y < dstH; y++) {
    const sy0 = Math.min(srcH - 1, y * 2);
    const sy1 = Math.min(srcH - 1, y * 2 + 1);
    for (let x = 0; x < dstW; x++) {
      const sx0 = Math.min(srcW - 1, x * 2);
      const sx1 = Math.min(srcW - 1, x * 2 + 1);

      const i00 = (sy0 * srcW + sx0) * 4;
      const i10 = (sy0 * srcW + sx1) * 4;
      const i01 = (sy1 * srcW + sx0) * 4;
      const i11 = (sy1 * srcW + sx1) * 4;
      const di = (y * dstW + x) * 4;

      if (isNormalMap) {
        let nx =
          (src[i00] + src[i10] + src[i01] + src[i11]) / (4 * 255) * 2 - 1;
        let ny =
          (src[i00 + 1] + src[i10 + 1] + src[i01 + 1] + src[i11 + 1]) / (4 * 255) * 2 - 1;
        let nz =
          (src[i00 + 2] + src[i10 + 2] + src[i01 + 2] + src[i11 + 2]) / (4 * 255) * 2 - 1;
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len;
        ny /= len;
        nz /= len;
        dst[di] = Math.max(0, Math.min(255, Math.round((nx * 0.5 + 0.5) * 255)));
        dst[di + 1] = Math.max(0, Math.min(255, Math.round((ny * 0.5 + 0.5) * 255)));
        dst[di + 2] = Math.max(0, Math.min(255, Math.round((nz * 0.5 + 0.5) * 255)));
        dst[di + 3] = 255;
      } else {
        dst[di] = (src[i00] + src[i10] + src[i01] + src[i11] + 2) >> 2;
        dst[di + 1] = (src[i00 + 1] + src[i10 + 1] + src[i01 + 1] + src[i11 + 1] + 2) >> 2;
        dst[di + 2] = (src[i00 + 2] + src[i10 + 2] + src[i01 + 2] + src[i11 + 2] + 2) >> 2;
        dst[di + 3] = (src[i00 + 3] + src[i10 + 3] + src[i01 + 3] + src[i11 + 3] + 2) >> 2;
      }
    }
  }
  return { data: dst, width: dstW, height: dstH };
}

/**
 * Encodes an RGBA pixel buffer into a valid uncompressed 32-bit BGRA DDS (with optional full mipmap chain)
 * compatible with Assetto Corsa DirectX 11, Content Manager, KsEditor, and CSP.
 */
export function encodeRgbaToDds(
  width: number,
  height: number,
  rgba: Uint8ClampedArray | Uint8Array,
  options?: { generateMipmaps?: boolean; isNormalMap?: boolean }
): Uint8Array {
  const wantMips =
    (options?.generateMipmaps ?? (isPowerOfTwo(width) && isPowerOfTwo(height) && width >= 4 && height >= 4)) &&
    isPowerOfTwo(width) &&
    isPowerOfTwo(height);
  const isNormal = Boolean(options?.isNormalMap);

  // Precompute mip dimensions & total byte size upfront so we allocate `out` once and stream mips with minimal peak RAM (safe up to 8192x8192!)
  const mipDims: Array<{ width: number; height: number }> = [{ width, height }];
  let totalPixelBytes = width * height * 4;
  if (wantMips) {
    let cw = width;
    let ch = height;
    while (cw > 1 || ch > 1) {
      cw = Math.max(1, cw >> 1);
      ch = Math.max(1, ch >> 1);
      mipDims.push({ width: cw, height: ch });
      totalPixelBytes += cw * ch * 4;
    }
  }

  const out = new Uint8Array(128 + totalPixelBytes);
  const view = new DataView(out.buffer);

  const mipCount = mipDims.length;
  const dwFlags =
    0x1 | 0x2 | 0x4 | 0x8 | 0x1000 | (mipCount > 1 ? 0x20000 : 0); // + DDSD_MIPMAPCOUNT
  const dwCaps = mipCount > 1 ? 0x8 | 0x1000 | 0x400000 : 0x1000; // DDSCAPS_COMPLEX | TEXTURE | MIPMAP

  view.setUint32(0, 0x20534444, true); // 'DDS '
  view.setUint32(4, 124, true);        // dwSize
  view.setUint32(8, dwFlags, true);
  view.setUint32(12, height, true);
  view.setUint32(16, width, true);
  view.setUint32(20, width * 4, true);
  view.setUint32(28, mipCount, true);

  view.setUint32(76, 32, true);
  view.setUint32(80, 0x41, true); // DDPF_RGB | DDPF_ALPHAPIXELS
  view.setUint32(84, 0, true);
  view.setUint32(88, 32, true);
  view.setUint32(92, 0x00ff0000, true); // R
  view.setUint32(96, 0x0000ff00, true); // G
  view.setUint32(100, 0x000000ff, true); // B
  view.setUint32(104, 0xff000000, true); // A
  view.setUint32(108, dwCaps, true);

  // Stream mip 0 -> mip N directly into `out`, immediately freeing each previous intermediate mip level
  let offset = 128;
  let curW = width;
  let curH = height;
  let curData: Uint8Array | Uint8ClampedArray = rgba;

  for (let level = 0; level < mipCount; level++) {
    const px = curW * curH;
    for (let i = 0; i < px; i++) {
      const s = i * 4;
      const d = offset + s;
      out[d] = curData[s + 2];     // B
      out[d + 1] = curData[s + 1]; // G
      out[d + 2] = curData[s];     // R
      out[d + 3] = curData[s + 3]; // A
    }
    offset += px * 4;

    if (level + 1 < mipCount) {
      const next = downsampleRgba2x(curData, curW, curH, isNormal);
      curW = next.width;
      curH = next.height;
      curData = next.data;
    }
  }

  return out;
}

function hexToRgbNorm(hex: string): [number, number, number] {
  const c = new THREE.Color(hex);
  return [Number(c.r.toFixed(3)), Number(c.g.toFixed(3)), Number(c.b.toFixed(3))];
}

export interface SkinMaterialShaderEntry {
  materialName: string;
  paintState: PaintMaterialState;
  diffuseTexName?: string;
}

function buildSingleMaterialShaderSection(
  index: number,
  entry: SkinMaterialShaderEntry
): string {
  const { materialName, paintState } = entry;
  const safeMat = materialName.trim() || 'Body_Paint';
  const ksSpec = Number((0.1 + paintState.clearcoat * 0.45 + paintState.metalness * 0.45).toFixed(3));
  const ksSpecExp = Math.round(
    Math.max(12, Math.min(250, 240 * Math.pow(1 - paintState.roughness, 1.8)))
  );
  const fresnelC = Number(
    Math.max(0.02, Math.min(0.95, paintState.metalness * 0.42 + paintState.clearcoat * 0.12)).toFixed(3)
  );
  const isMatteLike =
    paintState.presetId === 'matte' ||
    paintState.presetId.startsWith('alcantara_') ||
    paintState.presetId === 'plastic_moulded_black' ||
    paintState.presetId === 'plastic_moulded_grey' ||
    paintState.presetId === 'rubber_matte_seal';
  const fresnelExp = isMatteLike ? 2.5 : paintState.presetId === 'candy' ? 5.0 : 4.2;
  const sunSpec = Number((paintState.clearcoat * 10 + paintState.metalness * 6).toFixed(2));
  const sunSpecExp = Math.round(Math.max(30, ksSpecExp * 1.1));

  const headerExtra: string[] = [];
  const extraLines: string[] = [];
  let propIdx = 9;
  let resIdx = 0;

  if (paintState.presetId === 'candy' || paintState.presetId === 'pearl_chameleon') {
    const [r2, g2, b2] = hexToRgbNorm(paintState.secondaryColor);
    extraLines.push(
      `PROP_${propIdx++} = extColoredReflection, ${(0.55 + paintState.iridescence * 0.45).toFixed(2)}`
    );
    extraLines.push(`PROP_${propIdx++} = extColoredBaseReflection, ${paintState.metalness.toFixed(2)}`);
    extraLines.push(`; Pearl/Candy secondary tint hint: ${r2}, ${g2}, ${b2}`);
  }
  if (
    paintState.presetId === 'chrome' ||
    paintState.presetId === 'brushed_metal' ||
    paintState.presetId === 'titanium_brushed' ||
    paintState.presetId === 'anodized_bronze'
  ) {
    extraLines.push(`PROP_${propIdx++} = extColoredReflection, 1.0`);
    extraLines.push(`PROP_${propIdx++} = extColoredBaseReflection, 1.0`);
  }

  const activePattern = resolveActiveSurfacePattern(paintState);
  if (activePattern !== 'none') {
    const weaveRepeat = Math.round(Math.max(5, Math.min(300, paintState.carbonWeaveScale || 60)));
    const prefix = getSurfacePatternFilePrefix(activePattern);
    const normalBlend = Number(Math.max(0.15, Math.min(1.5, paintState.normalStrength ?? 0.65)).toFixed(2));
    // Force MultiMap_NMDetail so every car material supports fine txDetail + txDetailNM without missing slots
    headerExtra.push('SHADER = ksPerPixelMultiMap_NMDetail');
    headerExtra.push('FILLING_MISSING_TEXTURES = 1');

    extraLines.push(`PROP_${propIdx++} = useDetail, 1`);
    extraLines.push(`PROP_${propIdx++} = detailUVMultiplier, ${weaveRepeat}`);
    extraLines.push(`PROP_${propIdx++} = detailNormalBlend, ${normalBlend}`);

    if (entry.diffuseTexName) {
      extraLines.push(`RESOURCE_${resIdx} = txDiffuse`);
      extraLines.push(`RESOURCE_FILE_${resIdx} = ${entry.diffuseTexName}`);
      resIdx++;
    }
    extraLines.push(`RESOURCE_${resIdx} = txDetail`);
    extraLines.push(`RESOURCE_FILE_${resIdx} = ${prefix}_detail.dds`);
    resIdx++;
    extraLines.push(`RESOURCE_${resIdx} = txDetailNM`);
    extraLines.push(`RESOURCE_FILE_${resIdx} = ${prefix}_detail_nm.dds`);
    resIdx++;
  }

  return `[SHADER_REPLACEMENT_ACCS_SKIN_${index}]
ACTIVE = 1
MATERIALS = ${safeMat}${headerExtra.length ? '\n' + headerExtra.join('\n') : ''}
PROP_0 = ksAmbient, ${(isMatteLike ? 0.28 : 0.35).toFixed(2)}
PROP_1 = ksDiffuse, ${(paintState.presetId === 'chrome' ? 0.12 : 0.46).toFixed(2)}
PROP_2 = ksSpecular, ${ksSpec}
PROP_3 = ksSpecularEXP, ${ksSpecExp}
PROP_4 = fresnelC, ${fresnelC}
PROP_5 = fresnelEXP, ${fresnelExp}
PROP_6 = fresnelMaxLevel, ${paintState.fresnelMax.toFixed(2)}
PROP_7 = sunSpecular, ${sunSpec}
PROP_8 = sunSpecularEXP, ${sunSpecExp}
${extraLines.join('\n')}`;
}

/**
 * Generates a multi-material skin-local CSP ext_config.ini containing [SHADER_REPLACEMENT_ACCS_SKIN_0..N]
 * for all edited materials on the car (body paint, carbon parts, interior Alcantara/leather, plastic trim, etc.).
 */
export function buildMultiMaterialSkinExtConfigIni(entries: SkinMaterialShaderEntry[]): string {
  if (!entries || entries.length === 0) return '';
  const summary = entries.map((e) => `${e.materialName}(${e.paintState.presetId})`).join(', ');
  const sections = entries.map((entry, idx) => buildSingleMaterialShaderSection(idx, entry));
  return `; Generated by AC Car Studio — Livery & Paint Studio (${summary})\n${sections.join('\n\n')}\n`;
}

/**
 * Generates a skin-local CSP ext_config.ini [SHADER_REPLACEMENT_ACCS_SKIN_0] block that reproduces
 * Candy, Matte, Metallic, Pearl/Chameleon, Chrome, Brushed, Interior Alcantara/Leather, Moulded Plastic,
 * or fine material-based Carbon finishes directly inside Assetto Corsa + CSP!
 */
export function buildSkinExtConfigIni(
  materialName: string,
  paintState: PaintMaterialState,
  options?: { diffuseTexName?: string }
): string {
  return buildMultiMaterialSkinExtConfigIni([
    {
      materialName,
      paintState,
      diffuseTexName: options?.diffuseTexName,
    },
  ]);
}

/**
 * Renders a crisp 64x64 livery.png badge (Content Manager / AC skin selector swatch).
 */
export async function renderLiveryBadgePngBytes(
  baseColor: string,
  secondaryColor: string,
  carNumber: string
): Promise<Uint8Array | undefined> {
  if (typeof document === 'undefined') return undefined;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  if (!ctx) return undefined;

  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 64, 64);

  ctx.fillStyle = secondaryColor;
  ctx.beginPath();
  ctx.moveTo(40, 0);
  ctx.lineTo(64, 0);
  ctx.lineTo(24, 64);
  ctx.lineTo(0, 64);
  ctx.closePath();
  ctx.fill();

  if (carNumber.trim()) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(6, 20, 52, 24);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(carNumber.trim().slice(0, 3), 32, 33);
  }

  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'));
  if (!blob) return undefined;
  return new Uint8Array(await blob.arrayBuffer());
}
