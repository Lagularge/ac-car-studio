export type OemColorFamilyId =
  | 'ALL'
  | 'WHITE'
  | 'BLACK'
  | 'SILVER_GREY'
  | 'RED'
  | 'BLUE'
  | 'YELLOW_ORANGE'
  | 'GREEN'
  | 'PURPLE_SPECIAL';

export interface OemColorFamilyMeta {
  id: OemColorFamilyId;
  label: string;
  swatchHex: string;
}

export const OEM_COLOR_FAMILIES: OemColorFamilyMeta[] = [
  { id: 'ALL', label: 'すべて', swatchHex: 'linear-gradient(135deg,#ef4444,#3b82f6,#10b981,#eab308)' },
  { id: 'WHITE', label: 'ホワイト系', swatchHex: '#f8fafc' },
  { id: 'BLACK', label: 'ブラック系', swatchHex: '#18181b' },
  { id: 'SILVER_GREY', label: 'シルバー・グレー系', swatchHex: '#94a3b8' },
  { id: 'RED', label: 'レッド系', swatchHex: '#e11d48' },
  { id: 'BLUE', label: 'ブルー系', swatchHex: '#2563eb' },
  { id: 'YELLOW_ORANGE', label: 'イエロー・オレンジ系', swatchHex: '#f59e0b' },
  { id: 'GREEN', label: 'グリーン系', swatchHex: '#10b981' },
  { id: 'PURPLE_SPECIAL', label: 'パープル・特殊偏光', swatchHex: '#9333ea' },
];

export interface OemManufacturerMeta {
  id: string;
  name: string;
  jpName: string;
  country: string;
  accentHex: string;
  monogram: string;
  /** Keywords to match loaded AC car brand names for automatic real badge linking */
  matchKeywords: string[];
}

export const OEM_MANUFACTURERS: OemManufacturerMeta[] = [
  {
    id: 'nissan',
    name: 'NISSAN / NISMO',
    jpName: '日産',
    country: 'JPN',
    accentHex: '#e11d48',
    monogram: 'NISSAN',
    matchKeywords: ['nissan', 'nismo', 'datsun'],
  },
  {
    id: 'toyota',
    name: 'TOYOTA / LEXUS / GR',
    jpName: 'トヨタ・レクサス',
    country: 'JPN',
    accentHex: '#ef4444',
    monogram: 'GR',
    matchKeywords: ['toyota', 'lexus', 'gazoo'],
  },
  {
    id: 'honda',
    name: 'HONDA / ACURA',
    jpName: 'ホンダ',
    country: 'JPN',
    accentHex: '#dc2626',
    monogram: 'H',
    matchKeywords: ['honda', 'acura'],
  },
  {
    id: 'mazda',
    name: 'MAZDA',
    jpName: 'マツダ',
    country: 'JPN',
    accentHex: '#be123c',
    monogram: 'M',
    matchKeywords: ['mazda'],
  },
  {
    id: 'subaru',
    name: 'SUBARU / STI',
    jpName: 'スバル',
    country: 'JPN',
    accentHex: '#2563eb',
    monogram: 'STI',
    matchKeywords: ['subaru', 'sti'],
  },
  {
    id: 'mitsubishi',
    name: 'MITSUBISHI',
    jpName: '三菱',
    country: 'JPN',
    accentHex: '#dc2626',
    monogram: 'MITSU',
    matchKeywords: ['mitsubishi', 'ralliart'],
  },
  {
    id: 'ferrari',
    name: 'FERRARI',
    jpName: 'フェラーリ',
    country: 'ITA',
    accentHex: '#eab308',
    monogram: 'SF',
    matchKeywords: ['ferrari'],
  },
  {
    id: 'lamborghini',
    name: 'LAMBORGHINI',
    jpName: 'ランボルギーニ',
    country: 'ITA',
    accentHex: '#f59e0b',
    monogram: 'LAMBO',
    matchKeywords: ['lamborghini'],
  },
  {
    id: 'porsche',
    name: 'PORSCHE',
    jpName: 'ポルシェ',
    country: 'GER',
    accentHex: '#d97706',
    monogram: 'PORSCHE',
    matchKeywords: ['porsche', 'ruf'],
  },
  {
    id: 'bmw',
    name: 'BMW / M',
    jpName: 'BMW',
    country: 'GER',
    accentHex: '#3b82f6',
    monogram: 'BMW M',
    matchKeywords: ['bmw'],
  },
  {
    id: 'mercedes',
    name: 'MERCEDES-AMG',
    jpName: 'メルセデス・AMG',
    country: 'GER',
    accentHex: '#06b6d4',
    monogram: 'AMG',
    matchKeywords: ['mercedes', 'amg'],
  },
  {
    id: 'mclaren',
    name: 'McLAREN',
    jpName: 'マクラーレン',
    country: 'GBR',
    accentHex: '#f97316',
    monogram: 'McL',
    matchKeywords: ['mclaren'],
  },
];

export type OemFinishKind = 'solid' | 'metallic' | 'pearl' | 'candy' | 'matte' | 'chameleon';

export interface OemPaintEntry {
  id: string;
  manufacturerId: string;
  code: string;
  nameJp: string;
  nameEn: string;
  family: Exclude<OemColorFamilyId, 'ALL'>;
  finish: OemFinishKind;
  baseColor: string;
  secondaryColor: string;
  modelHint?: string;
  metalness: number;
  roughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  fresnelMax: number;
  iridescence: number;
  flakeIntensity: number;
  envIntensity: number;
}

const _FAM: ReadonlyArray<Exclude<OemColorFamilyId, 'ALL'>> = [
  'WHITE', 'BLACK', 'SILVER_GREY', 'RED', 'BLUE', 'YELLOW_ORANGE', 'GREEN', 'PURPLE_SPECIAL',
];
const _FIN: ReadonlyArray<OemFinishKind> = [
  'solid', 'metallic', 'pearl', 'candy', 'matte', 'chameleon',
];

type _OemRow = readonly [
  string, string, string, string, number, number, string, string, string,
  number, number, number, number, number, number, number, number
];

const _OEM_GROUPS: ReadonlyArray<readonly [string, ReadonlyArray<_OemRow>]> = [
  ["nissan", [
    ["nis_tv2","TV2","ベイサイドブルー","Bayside Blue",4,1,"#0f4fd6","#60a5fa","BNR34 Skyline GT-R V-Spec",0.72,0.19,1,0.03,0.92,0.14,0.76,1.75],
    ["nis_jw0","JW0","ミレニアムジェイド","Millennium Jade",6,1,"#78866b","#b5c4a1","BNR34 GT-R V-Spec II Nür",0.68,0.22,0.98,0.04,0.88,0.12,0.68,1.65],
    ["nis_lx0","LX0","ミッドナイトパープル III","Midnight Purple III",7,5,"#311457","#0e7490","BNR34 Skyline GT-R Limited",0.8,0.16,1,0.025,0.98,0.95,0.82,1.92],
    ["nis_lp2","LP2","ミッドナイトパープル","Midnight Purple Pearl",7,2,"#2a163d","#6d28d9","BCNR33 Skyline GT-R",0.64,0.2,0.96,0.035,0.9,0.45,0.65,1.7],
    ["nis_qm1","QM1","ホワイト (純正ソリッド)","Cloud White",0,0,"#f3f4f6","#ffffff","BNR32 / BCNR33 / BNR34 / S15",0.06,0.14,0.96,0.03,0.86,0,0,1.45],
    ["nis_qx1","QX1","ホワイトパール (3コート)","White Pearl 3P",0,2,"#f8fafc","#e0f2fe","BNR34 / S15 / Z33",0.32,0.16,1,0.03,0.9,0.22,0.45,1.55],
    ["nis_kh3","KH3","スーパーブラック","Super Black",1,0,"#101216","#27272a","BNR32 / BCNR33 / BNR34 / R35",0.12,0.12,1,0.025,0.92,0,0,1.65],
    ["nis_kh2","KH2","ガングレーメタリック","Gun Grey Metallic",2,1,"#3f444e","#71717a","BNR32 Skyline GT-R",0.7,0.24,0.92,0.04,0.86,0.05,0.72,1.6],
    ["nis_ky0","KY0","ダイヤモンドシルバーメタリック","Diamond Silver Metallic",2,1,"#b0b7c3","#e2e8f0","BNR34 / Z33 / R35",0.78,0.2,0.96,0.035,0.9,0.04,0.78,1.72],
    ["nis_ar2","AR2","アクティブレッド","Active Red",3,0,"#c8102e","#f43f5e","BNR34 / S15 Silvia",0.08,0.14,0.98,0.03,0.89,0,0,1.52],
    ["nis_ev1","EV1","ライトニングイエロー","Lightning Yellow",5,0,"#facc15","#fef08a","BNR34 / S15 Spec-R",0.08,0.14,0.98,0.03,0.88,0,0,1.5],
    ["nis_ean","EAN","アルティメイトシャイニーオレンジ","Katsura Orange Metallic",5,3,"#d9530f","#fbbf24","R35 GT-R Track Edition",0.74,0.17,1,0.025,0.95,0.36,0.75,1.85],
  ]],
  ["toyota", [
    ["toy_040","040","スーパーホワイト II","Super White II",0,0,"#f5f7fa","#ffffff","JZA80 Supra / AE86 / GR86",0.06,0.14,0.96,0.03,0.86,0,0,1.45],
    ["toy_202","202","ブラック (ソリッド202)","Astral Black",1,0,"#0e1014","#1f242d","JZA80 Supra / JZX100 Chaser",0.1,0.11,1,0.02,0.93,0,0,1.68],
    ["toy_3p0","3P0","スーパーレッド V","Renaissance Red",3,0,"#cf1020","#fb7185","JZA80 Supra / A90 GR Supra",0.08,0.13,0.98,0.03,0.89,0,0,1.54],
    ["toy_8b6","8B6","トロピカルブルーメタリック","Royal Sapphire Pearl",4,2,"#143c9c","#60a5fa","JZA80 SupraRZ",0.68,0.19,0.98,0.03,0.91,0.25,0.72,1.72],
    ["toy_8x2","8X2","ストラクチュラルブルー","Structural Blue (LC500)",4,3,"#0936a8","#38bdf8","Lexus LC500 / LFA",0.82,0.14,1,0.02,0.97,0.52,0.84,1.95],
    ["toy_6q7","6Q7","ダークグリーンマイカ","Imperial Jade Mica",6,2,"#113a2d","#34d399","JZA80 Supra / JZX100",0.64,0.21,0.96,0.035,0.88,0.2,0.66,1.62],
    ["toy_1g3","1G3","グレーメタリック","Magnetic Gray Metallic",2,1,"#4b525c","#94a3b8","GR86 / GR Yaris / Supra",0.72,0.22,0.95,0.035,0.88,0.06,0.72,1.64],
    ["toy_5a3","5A3","イエロー (LFA / スープラ)","Pearl Yellow",5,2,"#eab308","#fef08a","Lexus LFA / JZA80",0.34,0.16,1,0.03,0.9,0.18,0.45,1.58],
  ]],
  ["honda", [
    ["hon_nh0","NH-0","チャンピオンシップホワイト","Championship White",0,0,"#f4f1e8","#ffffff","NSX-R / Civic Type R EK9・FD2・FK8・FL5 / DC2",0.05,0.15,0.96,0.03,0.86,0,0,1.45],
    ["hon_r77","R-77","フォーミュラレッド","Formula Red",3,0,"#d11124","#fb7185","NA1/NA2 NSX / S2000",0.08,0.13,0.98,0.03,0.89,0,0,1.54],
    ["hon_y52p","Y-52P","インディイエロー・パール","Indy Yellow Pearl",5,2,"#f5b800","#fef08a","NSX / S2000 / Civic Type R",0.42,0.16,0.98,0.03,0.9,0.22,0.55,1.62],
    ["hon_yr525m","YR-525M","ニューイモラオレンジ・パール","New Imola Orange Pearl",5,2,"#d95b12","#fdba74","NA2 NSX-R / S2000",0.66,0.18,1,0.03,0.92,0.28,0.68,1.72],
    ["hon_b502p","B-502P","ロングビーチブルー・パール","Long Beach Blue Pearl",4,2,"#1254c7","#7dd3fc","NA2 NSX / S2000",0.7,0.18,1,0.03,0.93,0.26,0.72,1.75],
    ["hon_nh547","NH-547","ベルリナブラック","Berlina Black",1,0,"#111318","#27272a","NSX / S2000 / Integra",0.1,0.12,1,0.025,0.92,0,0,1.65],
    ["hon_nh630m","NH-630M","シルバーストーンメタリック","Silverstone Metallic",2,1,"#7f8794","#cbd5e1","S2000 AP1/AP2 / NSX",0.75,0.21,0.96,0.035,0.89,0.05,0.74,1.66],
    ["hon_g70p","G-70P","シャーロットグリーン・パール","Brooklands Green Pearl",6,2,"#143828","#34d399","NA1 NSX",0.6,0.2,0.96,0.035,0.88,0.22,0.62,1.62],
  ]],
  ["mazda", [
    ["maz_46v","46V","ソウルレッドクリスタルメタリック","Soul Red Crystal Metallic",3,3,"#a8091e","#ff4d6d","ND Roadster / RX-Vision / FD3S Restomod",0.78,0.14,1,0.02,0.97,0.45,0.72,1.92],
    ["maz_46g","46G","マシングレープレミアムメタリック","Machine Grey Metallic",2,1,"#484d56","#94a3b8","ND Roadster / Mazda3",0.82,0.18,1,0.03,0.93,0.06,0.78,1.78],
    ["maz_20p","20P","イノセントブルーマイカ","Innocent Blue Mica",4,2,"#133a94","#60a5fa","FD3S RX-7 Type RS / Spirit R",0.68,0.19,0.98,0.03,0.91,0.24,0.7,1.7],
    ["maz_hz","HZ","サンバーストイエロー","Sunburst Yellow",5,0,"#f5c400","#fef08a","FD3S RX-7 Type R Bathurst R",0.08,0.14,0.98,0.03,0.88,0,0,1.5],
    ["maz_pt","PT","シャストホワイト","Chaste White",0,0,"#f4f6f9","#ffffff","FD3S RX-7 / NA Roadster",0.06,0.14,0.96,0.03,0.86,0,0,1.45],
    ["maz_pz","PZ","ブリリアントブラック","Brilliant Black",1,0,"#101216","#27272a","FD3S RX-7 / FC3S",0.1,0.12,1,0.025,0.92,0,0,1.65],
    ["maz_25g","25G","チタニウムグレーメタリック II","Titanium Grey Metallic",2,1,"#6b707b","#cbd5e1","FD3S RX-7 Spirit R",0.76,0.2,0.96,0.03,0.9,0.08,0.74,1.68],
  ]],
  ["subaru", [
    ["sub_02c","02C","WRブルー・マイカ","World Rally Blue Mica",4,2,"#0e46b5","#60a5fa","Impreza WRX STI GDB / GRB / VAB / BRZ",0.7,0.19,0.98,0.03,0.92,0.22,0.75,1.72],
    ["sub_74f","74F","ソニックブルー・マイカ","Sonic Blue Mica",4,2,"#1b4f9c","#93c5fd","Impreza 22B STI / GC8",0.68,0.2,0.96,0.035,0.9,0.2,0.7,1.68],
    ["sub_51e","51E","ピュアホワイト","Aspen White",0,0,"#f5f7fa","#ffffff","WRX STI Spec C / GC8",0.06,0.14,0.96,0.03,0.86,0,0,1.45],
    ["sub_c1f","C1F","サンライズイエロー","Sunrise Yellow",5,2,"#f5c71a","#fef08a","WRX STI S207 / BRZ STI Sport",0.35,0.16,0.98,0.03,0.89,0.15,0.45,1.56],
    ["sub_32j","32J","オブシディアンブラック・パール","Obsidian Black Pearl",1,2,"#12141a","#3f3f46","WRX STI / Legacy",0.45,0.15,1,0.025,0.93,0.12,0.55,1.68],
    ["sub_m7y","M7Y","イグニッションレッド","Ignition Red",3,0,"#d11528","#fb7185","BRZ ZD8 / WRX",0.08,0.14,0.98,0.03,0.89,0,0,1.52],
  ]],
  ["mitsubishi", [
    ["mit_p26","P26","パッションレッド","Palma Red / Tommi Mäkinen Red",3,0,"#cc0e22","#fb7185","Lancer Evolution VI TME / IX / X",0.08,0.14,0.98,0.03,0.89,0,0,1.52],
    ["mit_w83","W83","スコーティアホワイト","Scotia White",0,0,"#f5f7fa","#ffffff","Lancer Evolution III - IX RS/GSR",0.06,0.14,0.96,0.03,0.86,0,0,1.45],
    ["mit_y77","Y77","ダンデライオンイエロー","Dandelion Yellow",5,0,"#f4be00","#fef08a","Lancer Evolution V / VII / VIII",0.08,0.14,0.98,0.03,0.88,0,0,1.5],
    ["mit_d06","D06","ライトニングブルーマイカ","Octane Blue Pearl",4,2,"#1049b0","#60a5fa","Lancer Evolution IX / X",0.68,0.19,0.98,0.03,0.91,0.22,0.7,1.7],
    ["mit_x42","X42","アメジストブラック・パール","Tarmac Black Pearl",1,2,"#13141a","#4c1d95","Lancer Evolution VIII / IX MR",0.48,0.15,1,0.025,0.93,0.18,0.56,1.68],
    ["mit_a39","A39","ミディアムパープリッシュグレーマイカ","Graphite Grey Pearl",2,1,"#4a4e58","#94a3b8","Lancer Evolution IX MR",0.72,0.21,0.96,0.035,0.89,0.08,0.72,1.66],
  ]],
  ["ferrari", [
    ["fer_322","FER 322","ロッソコルサ (伝統レーシングレッド)","Rosso Corsa",3,0,"#d40000","#ff4d4d","F40 / F50 / 458 / 488 / F8 / 296 GTB",0.08,0.11,1,0.02,0.93,0,0,1.62],
    ["fer_scud","FER 323","ロッソスクーデリア","Rosso Scuderia",3,0,"#e6190e","#fb7185","430 Scuderia / 458 Speciale / SF90",0.1,0.11,1,0.02,0.93,0,0,1.64],
    ["fer_fiorano","FER 321","ロッソフィオラーノ (深紅メタリック)","Rosso Fiorano",3,3,"#7a0b18","#e11d48","599 GTB / 812 Superfast / Roma",0.72,0.15,1,0.02,0.96,0.35,0.68,1.86],
    ["fer_102","FER 102","ジアッロモデナ (モデナイエロー)","Giallo Modena",5,0,"#f7c800","#fef08a","F355 / 360 / 458 / F12tdf",0.08,0.12,1,0.02,0.91,0,0,1.56],
    ["fer_505","FER 505","ブルーツールドフランス","Blu Tour de France",4,1,"#123682","#60a5fa","550 / 458 / 812 Competizione",0.72,0.17,1,0.025,0.93,0.18,0.72,1.76],
    ["fer_101","FER 101","アルジェントニュルブルクリンク","Argento Nürburgring",2,1,"#b5bcc6","#f1f5f9","550 Maranello / 360 / 575M",0.8,0.18,0.98,0.03,0.91,0.04,0.78,1.75],
    ["fer_700","FER 700","グリジオシルバーストーン","Grigio Silverstone",2,1,"#484d54","#94a3b8","458 / 488 Pista / F12",0.76,0.19,0.98,0.03,0.9,0.06,0.74,1.72],
    ["fer_1250","FER 1250","ネロデイトナ","Nero Daytona Metallic",1,1,"#121317","#3f3f46","288 GTO / 458 / LaFerrari",0.52,0.14,1,0.02,0.94,0.06,0.58,1.74],
    ["fer_100","FER 100","ビアンコアヴス","Bianco Avus",0,0,"#f6f7f9","#ffffff","458 Speciale / 488 Challenge",0.06,0.12,1,0.02,0.89,0,0,1.5],
    ["fer_verde","FER 611","ヴェルデブリティッシュ","Verde British Racing",6,0,"#0e3b26","#34d399","812 / Tailor Made GT",0.14,0.14,1,0.025,0.9,0.05,0.12,1.58],
  ]],
  ["lamborghini", [
    ["lam_mantis","LMB-VM","ヴェルデマンティス (パールグリーン)","Verde Mantis Pearl",6,2,"#58b814","#bef264","Huracán Performante / Aventador SVJ",0.56,0.15,1,0.02,0.94,0.3,0.68,1.78],
    ["lam_borealis","LMB-AB","アランチョボレアリス (パールオレンジ)","Arancio Borealis",5,2,"#f26400","#fde047","Gallardo / Murciélago SV / Huracán",0.62,0.15,1,0.02,0.95,0.34,0.72,1.82],
    ["lam_orion","LMB-GO","ジアッロオリオン (パールイエロー)","Giallo Orion",5,2,"#f5be00","#fef08a","Aventador / Murciélago / Diablo",0.52,0.15,1,0.02,0.93,0.25,0.65,1.75],
    ["lam_mars","LMB-RM","ロッソマーズ","Rosso Mars Metallic",3,1,"#c9121e","#fb7185","Aventador / Huracán EVO",0.66,0.16,1,0.025,0.94,0.22,0.7,1.78],
    ["lam_cepheus","LMB-BC","ブルーセフェウス","Blu Cepheus Pearl",4,2,"#1685d8","#a5f3fc","Aventador SV / Huracán STO",0.58,0.15,1,0.02,0.94,0.28,0.66,1.76],
    ["lam_viola","LMB-VP","ヴィオラパルシファエ","Viola Parsifae / SE30 Purple",7,2,"#5b1e82","#e879f9","Diablo SE30 / Aventador SVJ",0.74,0.16,1,0.025,0.96,0.58,0.76,1.88],
    ["lam_telesto","LMB-GT","グリジオテレスト","Grigio Telesto",2,0,"#58606b","#94a3b8","Gallardo Superleggera / Huracán",0.22,0.16,0.98,0.03,0.89,0.05,0.2,1.58],
    ["lam_nemesis","LMB-NN","ネロネメシス (ステルス艶消し黒)","Nero Nemesis Matte",1,4,"#1b1d22","#3f3f46","Reventón / Aventador Stealth",0.16,0.82,0,0.48,0.16,0,0.08,0.55],
  ]],
  ["porsche", [
    ["por_80k","80K","ガーズレッド (インドレッド)","Guards Red",3,0,"#d91414","#fb7185","911 GT3 / 930 Turbo / 964 / 993",0.06,0.12,1,0.02,0.92,0,0,1.58],
    ["por_m7x","M7X","マイアミブルー","Miami Blue",4,0,"#0093b8","#67e8f9","991.2 GT3 RS / 718 GT4",0.08,0.13,1,0.025,0.91,0,0,1.56],
    ["por_d7","D7","シャークブルー","Shark Blue",4,0,"#0062cc","#60a5fa","992 GT3 / GT3 RS",0.08,0.12,1,0.02,0.92,0,0,1.58],
    ["por_2d8","2D8","リザードグリーン","Lizard Green",6,0,"#48b81c","#a3e635","991.2 GT3 RS",0.08,0.13,1,0.025,0.91,0,0,1.55],
    ["por_1s","1S","レーシングイエロー","Racing Yellow",5,0,"#f7c600","#fef08a","911 GT3 / Cayman GT4",0.06,0.12,1,0.02,0.9,0,0,1.54],
    ["por_m2b","M2B","ラヴァオレンジ","Lava Orange",5,0,"#e85118","#fdba74","991.1 GT3 RS",0.1,0.13,1,0.025,0.91,0,0,1.56],
    ["por_m9a","M9A","クレヨン (チョークグレー)","Crayon / Chalk",2,0,"#b9bab5","#e5e7eb","992 GT3 / Taycan / GT4 RS",0.08,0.15,0.98,0.03,0.88,0,0,1.48],
    ["por_m7z","M7Z","GTシルバーメタリック","GT Silver Metallic",2,1,"#a2a9b2","#e2e8f0","Carrera GT / 911 GT3 RS",0.78,0.19,0.98,0.03,0.91,0.04,0.76,1.74],
    ["por_m4a","M4A","ウルトラヴァイオレット","Ultraviolet",7,0,"#4c1d7a","#a855f7","991.1 GT3 RS",0.08,0.13,1,0.025,0.91,0,0,1.56],
  ]],
  ["bmw", [
    ["bmw_300","300","アルピンホワイト III","Alpine White III",0,0,"#f5f6f8","#ffffff","M3 E46・E92・F80 / M4 GT3",0.06,0.13,0.98,0.025,0.88,0,0,1.48],
    ["bmw_b68","B68","ヤスマリーナブル―メタリック","Yas Marina Blue Metallic",4,1,"#2570b8","#93c5fd","F80 M3 / F82 M4",0.68,0.19,0.98,0.03,0.91,0.16,0.7,1.7],
    ["bmw_c1g","C1G","アイルオブマングリーン","Isle of Man Green Metallic",6,1,"#0e6b48","#6ee7b7","G80 M3 / G82 M4",0.74,0.18,1,0.025,0.93,0.24,0.76,1.78],
    ["bmw_b67","B67","オースティンイエローメタリック","Austin Yellow Metallic",5,1,"#c79e10","#fde047","F82 M4 / E46 M3 Phoenix Yellow",0.72,0.19,0.98,0.03,0.92,0.22,0.74,1.74],
    ["bmw_b50","B50","サヒールオレンジメタリック","Sakhir Orange Metallic",3,1,"#c92e18","#fb923c","F80 M3 / F82 M4 / M6",0.7,0.18,0.98,0.03,0.92,0.2,0.72,1.74],
    ["bmw_475","475","ブラックサファイアメタリック","Black Sapphire Metallic",1,1,"#121419","#3f3f46","M2 / M3 / M4 / M5",0.52,0.15,1,0.025,0.93,0.05,0.58,1.7],
  ]],
  ["mercedes", [
    ["amg_297","297","セレナイトグレーマグノ (AMGマット)","Designo Selenite Grey Magno",2,4,"#4a4f57","#71717a","AMG GT R / C63S / E63S",0.48,0.68,0.08,0.38,0.32,0,0.45,0.85],
    ["amg_378","378","AMGグリーンヘルマグノ","AMG Green Hell Magno",6,4,"#1b8a36","#4ade80","AMG GT R Pro",0.46,0.56,0.14,0.3,0.42,0.12,0.52,1.05],
    ["amg_278","278","AMGソーラービームイエロー","AMG Solarbeam Yellow",5,3,"#e3a000","#fef08a","AMG GT S / SLS AMG Black Series",0.72,0.16,1,0.025,0.94,0.28,0.74,1.82],
    ["amg_775","775","イリジウムシルバーメタリック","Iridium Silver Metallic",2,1,"#b8c0c9","#f1f5f9","SLS AMG / C63 / AMG GT3",0.82,0.18,0.98,0.03,0.92,0.04,0.78,1.78],
    ["amg_996","996","ヒヤシンスレッドメタリック","Designo Hyacinth Red Metallic",3,3,"#9e1122","#fb7185","AMG GT / E63S",0.74,0.16,1,0.025,0.95,0.34,0.72,1.84],
  ]],
  ["mclaren", [
    ["mcl_papaya","MCL-PS","パパイヤスパーク (伝統マクラーレンオレンジ)","Papaya Spark Metallic",5,1,"#f56e00","#fde047","720S / 765LT / P1 / Senna",0.68,0.16,1,0.02,0.94,0.26,0.72,1.8],
    ["mcl_volcano_red","MCL-VR","ボルケーノレッド","Volcano Red",3,3,"#a60d1e","#fb923c","P1 / 650S / 720S",0.76,0.15,1,0.02,0.96,0.42,0.76,1.88],
    ["mcl_aurora","MCL-AB","オーロラブルー","Aurora Blue Metallic",4,1,"#0e367a","#38bdf8","720S / 675LT",0.72,0.17,1,0.025,0.93,0.22,0.72,1.76],
    ["mcl_lantana","MCL-LP","ランタナパープル","Lantana Purple",7,2,"#3f1670","#c084fc","720S / 765LT MSO",0.74,0.16,1,0.025,0.95,0.48,0.74,1.84],
  ]],
];

export const OEM_PAINT_COLORS: OemPaintEntry[] = _OEM_GROUPS.flatMap(([manufacturerId, rows]) =>
  rows.map(([id, code, nameJp, nameEn, fi, fni, baseColor, secondaryColor, modelHint, metalness, roughness, clearcoat, clearcoatRoughness, fresnelMax, iridescence, flakeIntensity, envIntensity]) => {
    const entry: OemPaintEntry = {
      id, manufacturerId, code, nameJp, nameEn,
      family: _FAM[fi], finish: _FIN[fni],
      baseColor, secondaryColor,
      ...(modelHint ? { modelHint } : {}),
      metalness, roughness, clearcoat, clearcoatRoughness, fresnelMax, iridescence, flakeIntensity, envIntensity,
    };
    return entry;
  })
);
