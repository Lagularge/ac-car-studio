import { getIniNumber, getIniSections, getIniValue } from './iniHelpers';

// ============================================================================
// Assetto Corsa Dedicated Server Configurator
// Parses & serializes server_cfg.ini, entry_list.ini, and csp_extra_options.ini
// ============================================================================

export interface AcServerEntrySlot {
  model: string;
  skin: string;
  spectatorMode: number; // 0 or 1
  driverName: string;
  team: string;
  guid: string;
  ballast: number; // kg
  restrictor: number; // 0..100 %
}

export interface AcServerSessionPractice {
  enabled: boolean;
  name: string;
  time: number; // minutes
  isOpen: number; // 0 or 1
}

export interface AcServerSessionQualify {
  enabled: boolean;
  name: string;
  time: number; // minutes
  isOpen: number; // 0 or 1
}

export interface AcServerSessionRace {
  enabled: boolean;
  name: string;
  laps: number;
  time: number; // minutes (used when laps=0)
  waitTime: number; // seconds
  isOpen: number; // 0=closed, 1=open, 2=open with join after start
  reversedGridRacePositions: number;
  extraLap: number;
}

export interface AcServerWeatherConfig {
  graphics: string;
  baseTemperatureAmbient: number;
  baseTemperatureRoad: number;
  variationAmbient: number;
  variationRoad: number;
  windBaseSpeedMin: number;
  windBaseSpeedMax: number;
  windBaseDirection: number;
  windVariationDirection: number;
}

export interface AcServerDynamicTrackConfig {
  enabled: boolean;
  sessionStart: number; // 90..100%
  randomness: number; // 0..5
  sessionTransfer: number; // 0..100%
  lapGain: number; // laps for +1% grip
}

export interface AcServerCspExtraConfig {
  enabled: boolean;
  requireCspVersion: string; // e.g. '' or '0.1.79' or '0.2.3'
  useExtendedPhysics: boolean;
  allowWrongWay: boolean;
  maxMetersWrongWay: number;
  disableCollisions: boolean;
  noBackToPits: boolean;
  enforceBackToPitsPenalty: boolean;
  disableRainPhysics: boolean;
  pitSpeedLimitKmh: number; // 0 = track default
  pitSpeedKeepInPits: boolean;
  customRawBlock: string;
}

export interface AcServerConfig {
  name: string;
  track: string;
  configTrack: string;
  maxClients: number;
  password: string;
  adminPassword: string;
  udpPort: number;
  tcpPort: number;
  httpPort: number;
  registerToLobby: boolean;
  pickupModeEnabled: boolean;
  loopMode: boolean;
  lockedEntryList: boolean;
  sunAngle: number; // -80 .. 80 (0 = 13:00)
  timeOfDayMult: number;
  welcomeMessage: string;
  absAllowed: 0 | 1 | 2; // 0=Off, 1=Factory, 2=On
  tcAllowed: 0 | 1 | 2;
  stabilityAllowed: boolean;
  autoclutchAllowed: boolean;
  tyreBlanketsAllowed: boolean;
  forceVirtualMirror: boolean;
  fuelRate: number; // 0..300 %
  damageMultiplier: number; // 0..100 %
  tyreWearRate: number; // 0..300 %
  allowedTyresOut: number; // -1 = disabled, 2..4
  maxBallastKg: number;
  maxContactsPerKm: number; // -1 = disabled
  startRule: 0 | 1 | 2; // 0=car locked, 1=teleport, 2=drive-through
  raceGasPenaltyDisabled: boolean;
  kickQuorum: number;
  votingQuorum: number;
  voteDuration: number;
  blacklistMode: 0 | 1 | 2;
  clientSendIntervalHz: number;
  numThreads: number;
  sleepTime: number;
  weather: AcServerWeatherConfig;
  dynamicTrack: AcServerDynamicTrackConfig;
  practice: AcServerSessionPractice;
  qualify: AcServerSessionQualify;
  race: AcServerSessionRace;
  entryList: AcServerEntrySlot[];
  cspExtra: AcServerCspExtraConfig;
}

export type ServerPresetId =
  | 'trackday'
  | 'shuto_freeroam'
  | 'drift_lobby'
  | 'gt_sprint'
  | 'endurance_csp';

export interface ServerPreset {
  id: ServerPresetId;
  name: string;
  badge: string;
  description: string;
  apply: (base: AcServerConfig) => AcServerConfig;
}

export const WEATHER_OPTIONS: Array<{ id: string; label: string }> = [
  { id: '3_clear', label: '快晴 (3_clear)' },
  { id: '4_mid_clear', label: '晴れ (4_mid_clear)' },
  { id: '5_light_clouds', label: '薄曇り (5_light_clouds)' },
  { id: '6_mid_clouds', label: '曇り (6_mid_clouds)' },
  { id: '7_heavy_clouds', label: '厚い雲 (7_heavy_clouds)' },
  { id: '1_heavy_fog', label: '濃霧 (1_heavy_fog)' },
  { id: 'sol_01_clear', label: 'Sol / Pure 快晴 (sol_01_clear)' },
  { id: 'sol_03_scattered_clouds', label: 'Sol / Pure 晴れ時々曇り' },
  { id: 'sol_06_overcast', label: 'Sol / Pure 曇天' },
  { id: 'sol_21_rain', label: 'CSP / Pure 雨天 (sol_21_rain)' },
];

export function createDefaultServerConfig(): AcServerConfig {
  return {
    name: 'AC Car Studio Server',
    track: 'imola',
    configTrack: '',
    maxClients: 16,
    password: '',
    adminPassword: 'changeme',
    udpPort: 9600,
    tcpPort: 9600,
    httpPort: 8081,
    registerToLobby: true,
    pickupModeEnabled: true,
    loopMode: true,
    lockedEntryList: false,
    sunAngle: 16,
    timeOfDayMult: 1,
    welcomeMessage: 'Welcome to AC Car Studio Server!',
    absAllowed: 1,
    tcAllowed: 1,
    stabilityAllowed: false,
    autoclutchAllowed: true,
    tyreBlanketsAllowed: true,
    forceVirtualMirror: true,
    fuelRate: 100,
    damageMultiplier: 0,
    tyreWearRate: 100,
    allowedTyresOut: 2,
    maxBallastKg: 50,
    maxContactsPerKm: -1,
    startRule: 2,
    raceGasPenaltyDisabled: true,
    kickQuorum: 85,
    votingQuorum: 80,
    voteDuration: 20,
    blacklistMode: 1,
    clientSendIntervalHz: 18,
    numThreads: 2,
    sleepTime: 1,
    weather: {
      graphics: '3_clear',
      baseTemperatureAmbient: 24,
      baseTemperatureRoad: 30,
      variationAmbient: 2,
      variationRoad: 2,
      windBaseSpeedMin: 3,
      windBaseSpeedMax: 12,
      windBaseDirection: 45,
      windVariationDirection: 15,
    },
    dynamicTrack: {
      enabled: true,
      sessionStart: 97,
      randomness: 1,
      sessionTransfer: 90,
      lapGain: 10,
    },
    practice: {
      enabled: true,
      name: 'Practice',
      time: 120,
      isOpen: 1,
    },
    qualify: {
      enabled: false,
      name: 'Qualify',
      time: 15,
      isOpen: 1,
    },
    race: {
      enabled: false,
      name: 'Race',
      laps: 10,
      time: 0,
      waitTime: 60,
      isOpen: 1,
      reversedGridRacePositions: 0,
      extraLap: 0,
    },
    entryList: [],
    cspExtra: {
      enabled: true,
      requireCspVersion: '0.1.79',
      useExtendedPhysics: true,
      allowWrongWay: false,
      maxMetersWrongWay: 0,
      disableCollisions: false,
      noBackToPits: false,
      enforceBackToPitsPenalty: false,
      disableRainPhysics: false,
      pitSpeedLimitKmh: 0,
      pitSpeedKeepInPits: false,
      customRawBlock: '',
    },
  };
}

export const SERVER_PRESETS: ServerPreset[] = [
  {
    id: 'trackday',
    name: 'トラックデイ / フリー走行',
    badge: 'TRACK DAY',
    description: '180分プラクティス常設・途中参加自由・ダメージ0%・タイヤウォーマーONの定番走行会設定。',
    apply: (base) => ({
      ...base,
      pickupModeEnabled: true,
      loopMode: true,
      damageMultiplier: 0,
      fuelRate: 50,
      tyreWearRate: 50,
      tyreBlanketsAllowed: true,
      allowedTyresOut: -1,
      practice: { enabled: true, name: 'Track Day', time: 180, isOpen: 1 },
      qualify: { ...base.qualify, enabled: false },
      race: { ...base.race, enabled: false },
      cspExtra: {
        ...base.cspExtra,
        enabled: true,
        useExtendedPhysics: true,
        allowWrongWay: false,
        disableCollisions: false,
      },
    }),
  },
  {
    id: 'shuto_freeroam',
    name: '首都高 / 峠フリーローム (CSP)',
    badge: 'FREE ROAM',
    description: '逆走ペナルティ無効・CSP拡張物理ON (AT/CVT車両対応)・燃料/摩耗/ダメージOFFの長時間フリーローム。',
    apply: (base) => ({
      ...base,
      pickupModeEnabled: true,
      loopMode: true,
      damageMultiplier: 0,
      fuelRate: 0,
      tyreWearRate: 0,
      allowedTyresOut: -1,
      raceGasPenaltyDisabled: true,
      sunAngle: 48,
      practice: { enabled: true, name: 'Free Roam', time: 360, isOpen: 1 },
      qualify: { ...base.qualify, enabled: false },
      race: { ...base.race, enabled: false },
      cspExtra: {
        ...base.cspExtra,
        enabled: true,
        requireCspVersion: '0.1.79',
        useExtendedPhysics: true,
        allowWrongWay: true,
        maxMetersWrongWay: 0,
        disableCollisions: false,
      },
    }),
  },
  {
    id: 'drift_lobby',
    name: 'ドリフトロビー',
    badge: 'DRIFT',
    description: 'タイヤ摩耗0%・ダメージ0%・アシスト任意・常時オープンで連続追走が楽しめるドリフト専用設定。',
    apply: (base) => ({
      ...base,
      pickupModeEnabled: true,
      loopMode: true,
      absAllowed: 2,
      tcAllowed: 2,
      stabilityAllowed: true,
      damageMultiplier: 0,
      fuelRate: 0,
      tyreWearRate: 0,
      allowedTyresOut: -1,
      practice: { enabled: true, name: 'Drift Session', time: 240, isOpen: 1 },
      qualify: { ...base.qualify, enabled: false },
      race: { ...base.race, enabled: false },
      cspExtra: {
        ...base.cspExtra,
        enabled: true,
        useExtendedPhysics: true,
        allowWrongWay: true,
      },
    }),
  },
  {
    id: 'gt_sprint',
    name: 'GT スプリントレース',
    badge: 'GT RACE',
    description: '練習15分 → 予選15分 → 決勝12周。ダメージ50%・燃料/タイヤ100%・4輪脱輪2本までの本格レース。',
    apply: (base) => ({
      ...base,
      pickupModeEnabled: true,
      loopMode: true,
      absAllowed: 1,
      tcAllowed: 1,
      stabilityAllowed: false,
      damageMultiplier: 50,
      fuelRate: 100,
      tyreWearRate: 100,
      allowedTyresOut: 2,
      startRule: 2,
      practice: { enabled: true, name: 'Practice', time: 15, isOpen: 1 },
      qualify: { enabled: true, name: 'Qualify', time: 15, isOpen: 1 },
      race: {
        enabled: true,
        name: 'Sprint Race',
        laps: 12,
        time: 0,
        waitTime: 60,
        isOpen: 1,
        reversedGridRacePositions: 0,
        extraLap: 0,
      },
      cspExtra: {
        ...base.cspExtra,
        enabled: true,
        useExtendedPhysics: true,
        allowWrongWay: false,
        enforceBackToPitsPenalty: true,
      },
    }),
  },
  {
    id: 'endurance_csp',
    name: '耐久レース & 動的路面 (60分)',
    badge: 'ENDURANCE',
    description: '時間制60分決勝＋動的路面グリップ進行＋時間加速4倍＋CSP拡張物理ONの本格耐久イベント向け。',
    apply: (base) => ({
      ...base,
      pickupModeEnabled: true,
      loopMode: true,
      absAllowed: 1,
      tcAllowed: 1,
      stabilityAllowed: false,
      damageMultiplier: 75,
      fuelRate: 100,
      tyreWearRate: 100,
      timeOfDayMult: 4,
      allowedTyresOut: 2,
      dynamicTrack: {
        enabled: true,
        sessionStart: 94,
        randomness: 2,
        sessionTransfer: 90,
        lapGain: 8,
      },
      practice: { enabled: true, name: 'Free Practice', time: 20, isOpen: 1 },
      qualify: { enabled: true, name: 'Qualifying', time: 15, isOpen: 1 },
      race: {
        enabled: true,
        name: '60m Endurance',
        laps: 0,
        time: 60,
        waitTime: 90,
        isOpen: 1,
        reversedGridRacePositions: 0,
        extraLap: 1,
      },
      cspExtra: {
        ...base.cspExtra,
        enabled: true,
        requireCspVersion: '0.2.0',
        useExtendedPhysics: true,
        allowWrongWay: false,
        noBackToPits: true,
        pitSpeedLimitKmh: 80,
        pitSpeedKeepInPits: true,
      },
    }),
  },
];

// ============================================================================
// Sun Angle <-> Clock Time Helper (AC SUN_ANGLE: -80 = 08:00, 0 = 13:00, +80 = 18:00)
// ============================================================================

export function sunAngleToTimeLabel(sunAngle: number): string {
  const clamped = Math.max(-80, Math.min(80, sunAngle));
  const totalMinutes = Math.round(13 * 60 + (clamped / 16) * 60);
  const hh = Math.floor(totalMinutes / 60);
  const mm = Math.abs(totalMinutes % 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// ============================================================================
// Parsers
// ============================================================================

export function parseEntryListIni(text: string | undefined): AcServerEntrySlot[] {
  if (!text || !text.trim()) return [];
  const sections = getIniSections(text).filter((s) => /^CAR_\d+$/i.test(s));
  sections.sort((a, b) => Number(a.split('_')[1]) - Number(b.split('_')[1]));
  return sections.map((sec) => ({
    model: getIniValue(text, sec, 'MODEL', ''),
    skin: getIniValue(text, sec, 'SKIN', ''),
    spectatorMode: Math.round(getIniNumber(text, sec, 'SPECTATOR_MODE', 0)),
    driverName: getIniValue(text, sec, 'DRIVERNAME', ''),
    team: getIniValue(text, sec, 'TEAM', ''),
    guid: getIniValue(text, sec, 'GUID', ''),
    ballast: Math.round(getIniNumber(text, sec, 'BALLAST', 0)),
    restrictor: Math.round(getIniNumber(text, sec, 'RESTRICTOR', 0)),
  }));
}

export function parseServerConfigBundle(
  serverCfgIni: string | undefined,
  entryListIni: string | undefined,
  cspExtraOptionsIni: string | undefined
): AcServerConfig {
  const def = createDefaultServerConfig();
  const cfg = serverCfgIni ?? '';
  const csp = cspExtraOptionsIni ?? '';

  const rawTrack = getIniValue(cfg, 'SERVER', 'TRACK', def.track);
  // Support Content Manager CSP-version-tagged track string: csp/1770/../imola
  let track = rawTrack;
  let parsedCspVer = def.cspExtra.requireCspVersion;
  const cspTrackMatch = rawTrack.match(/^csp\/(\d+)\/\.\.\/(.+)$/i);
  if (cspTrackMatch) {
    track = cspTrackMatch[2];
    const buildNum = Number(cspTrackMatch[1]);
    if (buildNum >= 2650) parsedCspVer = '0.2.3';
    else if (buildNum >= 2500) parsedCspVer = '0.2.0';
    else if (buildNum >= 2144) parsedCspVer = '0.1.79';
    else parsedCspVer = '0.1.76';
  } else if (cfg.trim().length > 0) {
    parsedCspVer = '';
  }

  const absRaw = Math.round(getIniNumber(cfg, 'SERVER', 'ABS_ALLOWED', def.absAllowed));
  const tcRaw = Math.round(getIniNumber(cfg, 'SERVER', 'TC_ALLOWED', def.tcAllowed));
  const startRaw = Math.round(getIniNumber(cfg, 'SERVER', 'START_RULE', def.startRule));
  const blRaw = Math.round(getIniNumber(cfg, 'SERVER', 'BLACKLIST_MODE', def.blacklistMode));

  const sections = new Set(getIniSections(cfg).map((s) => s.toUpperCase()));
  const hasAnyCfg = cfg.trim().length > 0;

  const parsedEntries = parseEntryListIni(entryListIni);
  const carsStr = getIniValue(cfg, 'SERVER', 'CARS', '');
  const fallbackEntries: AcServerEntrySlot[] =
    parsedEntries.length > 0
      ? parsedEntries
      : carsStr
          .split(';')
          .map((c) => c.trim())
          .filter(Boolean)
          .map((model) => ({
            model,
            skin: '',
            spectatorMode: 0,
            driverName: '',
            team: '',
            guid: '',
            ballast: 0,
            restrictor: 0,
          }));

  const hasCsp = csp.trim().length > 0;

  return {
    name: getIniValue(cfg, 'SERVER', 'NAME', def.name),
    track,
    configTrack: getIniValue(cfg, 'SERVER', 'CONFIG_TRACK', def.configTrack),
    maxClients: Math.max(1, Math.round(getIniNumber(cfg, 'SERVER', 'MAX_CLIENTS', def.maxClients))),
    password: getIniValue(cfg, 'SERVER', 'PASSWORD', def.password),
    adminPassword: getIniValue(cfg, 'SERVER', 'ADMIN_PASSWORD', def.adminPassword),
    udpPort: Math.round(getIniNumber(cfg, 'SERVER', 'UDP_PORT', def.udpPort)),
    tcpPort: Math.round(getIniNumber(cfg, 'SERVER', 'TCP_PORT', def.tcpPort)),
    httpPort: Math.round(getIniNumber(cfg, 'SERVER', 'HTTP_PORT', def.httpPort)),
    registerToLobby: getIniNumber(cfg, 'SERVER', 'REGISTER_TO_LOBBY', 1) === 1,
    pickupModeEnabled: getIniNumber(cfg, 'SERVER', 'PICKUP_MODE_ENABLED', 1) === 1,
    loopMode: getIniNumber(cfg, 'SERVER', 'LOOP_MODE', 1) === 1,
    lockedEntryList: getIniNumber(cfg, 'SERVER', 'LOCKED_ENTRY_LIST', 0) === 1,
    sunAngle: getIniNumber(cfg, 'SERVER', 'SUN_ANGLE', def.sunAngle),
    timeOfDayMult: getIniNumber(cfg, 'SERVER', 'TIME_OF_DAY_MULT', def.timeOfDayMult),
    welcomeMessage: getIniValue(cfg, 'SERVER', 'WELCOME_MESSAGE', def.welcomeMessage),
    absAllowed: absRaw === 0 ? 0 : absRaw === 2 ? 2 : 1,
    tcAllowed: tcRaw === 0 ? 0 : tcRaw === 2 ? 2 : 1,
    stabilityAllowed: getIniNumber(cfg, 'SERVER', 'STABILITY_ALLOWED', 0) === 1,
    autoclutchAllowed: getIniNumber(cfg, 'SERVER', 'AUTOCLUTCH_ALLOWED', 1) === 1,
    tyreBlanketsAllowed: getIniNumber(cfg, 'SERVER', 'TYRE_BLANKETS_ALLOWED', 1) === 1,
    forceVirtualMirror: getIniNumber(cfg, 'SERVER', 'FORCE_VIRTUAL_MIRROR', 1) === 1,
    fuelRate: Math.round(getIniNumber(cfg, 'SERVER', 'FUEL_RATE', def.fuelRate)),
    damageMultiplier: Math.round(getIniNumber(cfg, 'SERVER', 'DAMAGE_MULTIPLIER', def.damageMultiplier)),
    tyreWearRate: Math.round(getIniNumber(cfg, 'SERVER', 'TYRE_WEAR_RATE', def.tyreWearRate)),
    allowedTyresOut: Math.round(getIniNumber(cfg, 'SERVER', 'ALLOWED_TYRES_OUT', def.allowedTyresOut)),
    maxBallastKg: Math.round(getIniNumber(cfg, 'SERVER', 'MAX_BALLAST_KG', def.maxBallastKg)),
    maxContactsPerKm: Math.round(getIniNumber(cfg, 'SERVER', 'MAX_CONTACTS_PER_KM', def.maxContactsPerKm)),
    startRule: startRaw === 0 ? 0 : startRaw === 1 ? 1 : 2,
    raceGasPenaltyDisabled: getIniNumber(cfg, 'SERVER', 'RACE_GAS_PENALTY_DISABLED', 1) === 1,
    kickQuorum: Math.round(getIniNumber(cfg, 'SERVER', 'KICK_QUORUM', def.kickQuorum)),
    votingQuorum: Math.round(getIniNumber(cfg, 'SERVER', 'VOTING_QUORUM', def.votingQuorum)),
    voteDuration: Math.round(getIniNumber(cfg, 'SERVER', 'VOTE_DURATION', def.voteDuration)),
    blacklistMode: blRaw === 0 ? 0 : blRaw === 2 ? 2 : 1,
    clientSendIntervalHz: Math.round(
      getIniNumber(cfg, 'SERVER', 'CLIENT_SEND_INTERVAL_HZ', def.clientSendIntervalHz)
    ),
    numThreads: Math.round(getIniNumber(cfg, 'SERVER', 'NUM_THREADS', def.numThreads)),
    sleepTime: Math.round(getIniNumber(cfg, 'SERVER', 'SLEEP_TIME', def.sleepTime)),
    weather: {
      graphics: getIniValue(cfg, 'WEATHER_0', 'GRAPHICS', def.weather.graphics),
      baseTemperatureAmbient: Math.round(
        getIniNumber(cfg, 'WEATHER_0', 'BASE_TEMPERATURE_AMBIENT', def.weather.baseTemperatureAmbient)
      ),
      baseTemperatureRoad: Math.round(
        getIniNumber(cfg, 'WEATHER_0', 'BASE_TEMPERATURE_ROAD', def.weather.baseTemperatureRoad)
      ),
      variationAmbient: Math.round(
        getIniNumber(cfg, 'WEATHER_0', 'VARIATION_AMBIENT', def.weather.variationAmbient)
      ),
      variationRoad: Math.round(
        getIniNumber(cfg, 'WEATHER_0', 'VARIATION_ROAD', def.weather.variationRoad)
      ),
      windBaseSpeedMin: Math.round(
        getIniNumber(cfg, 'WEATHER_0', 'WIND_BASE_SPEED_MIN', def.weather.windBaseSpeedMin)
      ),
      windBaseSpeedMax: Math.round(
        getIniNumber(cfg, 'WEATHER_0', 'WIND_BASE_SPEED_MAX', def.weather.windBaseSpeedMax)
      ),
      windBaseDirection: Math.round(
        getIniNumber(cfg, 'WEATHER_0', 'WIND_BASE_DIRECTION', def.weather.windBaseDirection)
      ),
      windVariationDirection: Math.round(
        getIniNumber(cfg, 'WEATHER_0', 'WIND_VARIATION_DIRECTION', def.weather.windVariationDirection)
      ),
    },
    dynamicTrack: {
      enabled: hasAnyCfg ? sections.has('DYNAMIC_TRACK') : def.dynamicTrack.enabled,
      sessionStart: Math.round(
        getIniNumber(cfg, 'DYNAMIC_TRACK', 'SESSION_START', def.dynamicTrack.sessionStart)
      ),
      randomness: Math.round(
        getIniNumber(cfg, 'DYNAMIC_TRACK', 'RANDOMNESS', def.dynamicTrack.randomness)
      ),
      sessionTransfer: Math.round(
        getIniNumber(cfg, 'DYNAMIC_TRACK', 'SESSION_TRANSFER', def.dynamicTrack.sessionTransfer)
      ),
      lapGain: Math.round(getIniNumber(cfg, 'DYNAMIC_TRACK', 'LAP_GAIN', def.dynamicTrack.lapGain)),
    },
    practice: {
      enabled: hasAnyCfg ? sections.has('PRACTICE') : def.practice.enabled,
      name: getIniValue(cfg, 'PRACTICE', 'NAME', def.practice.name),
      time: Math.round(getIniNumber(cfg, 'PRACTICE', 'TIME', def.practice.time)),
      isOpen: Math.round(getIniNumber(cfg, 'PRACTICE', 'IS_OPEN', def.practice.isOpen)),
    },
    qualify: {
      enabled: hasAnyCfg ? sections.has('QUALIFY') : def.qualify.enabled,
      name: getIniValue(cfg, 'QUALIFY', 'NAME', def.qualify.name),
      time: Math.round(getIniNumber(cfg, 'QUALIFY', 'TIME', def.qualify.time)),
      isOpen: Math.round(getIniNumber(cfg, 'QUALIFY', 'IS_OPEN', def.qualify.isOpen)),
    },
    race: {
      enabled: hasAnyCfg ? sections.has('RACE') : def.race.enabled,
      name: getIniValue(cfg, 'RACE', 'NAME', def.race.name),
      laps: Math.round(getIniNumber(cfg, 'RACE', 'LAPS', def.race.laps)),
      time: Math.round(getIniNumber(cfg, 'RACE', 'TIME', def.race.time)),
      waitTime: Math.round(getIniNumber(cfg, 'RACE', 'WAIT_TIME', def.race.waitTime)),
      isOpen: Math.round(getIniNumber(cfg, 'RACE', 'IS_OPEN', def.race.isOpen)),
      reversedGridRacePositions: Math.round(
        getIniNumber(cfg, 'RACE', 'REVERSED_GRID_RACE_POSITIONS', def.race.reversedGridRacePositions)
      ),
      extraLap: Math.round(getIniNumber(cfg, 'RACE', 'RACE_EXTRA_LAP', def.race.extraLap)),
    },
    entryList: fallbackEntries,
    cspExtra: {
      enabled: hasCsp ? true : def.cspExtra.enabled,
      requireCspVersion: parsedCspVer,
      useExtendedPhysics: getIniNumber(csp, 'EXTRA_RULES', 'USE_EXTENDED_PHYSICS', hasCsp ? 0 : 1) === 1,
      allowWrongWay: getIniNumber(csp, 'EXTRA_RULES', 'ALLOW_WRONG_WAY', 0) === 1,
      maxMetersWrongWay: Math.round(getIniNumber(csp, 'EXTRA_RULES', 'MAX_METERS_WRONG_WAY', 0)),
      disableCollisions: getIniNumber(csp, 'EXTRA_RULES', 'DISABLE_COLLISIONS', 0) === 1,
      noBackToPits: getIniNumber(csp, 'EXTRA_RULES', 'NO_BACK_TO_PITS', 0) === 1,
      enforceBackToPitsPenalty:
        getIniNumber(csp, 'EXTRA_RULES', 'ENFORCE_BACK_TO_PITS_PENALTY', 0) === 1,
      disableRainPhysics: getIniNumber(csp, 'EXTRA_RULES', 'DISABLE_RAIN_PHYSICS', 0) === 1,
      pitSpeedLimitKmh: Math.round(getIniNumber(csp, 'PITS_SPEED_LIMITER', 'SPEED_KMH', 0)),
      pitSpeedKeepInPits: getIniNumber(csp, 'PITS_SPEED_LIMITER', 'KEEP_COLLISIONS', 0) === 1,
      customRawBlock: '',
    },
  };
}

// ============================================================================
// Serializers
// ============================================================================

const CSP_VERSION_TO_BUILD: Record<string, number> = {
  '0.1.76': 1770,
  '0.1.79': 2144,
  '0.2.0': 2500,
  '0.2.3': 2651,
};

export function serializeServerConfigBundle(config: AcServerConfig): {
  serverCfgIni: string;
  entryListIni: string;
  cspExtraOptionsIni: string;
  uniqueCarIds: string[];
} {
  const uniqueCarIds = Array.from(
    new Set(config.entryList.map((e) => e.model.trim()).filter(Boolean))
  );

  // Build track string (optionally prefixing csp/<build>/../ when CSP minimum version is enforced)
  const cleanTrack = config.track.trim() || 'imola';
  const cspBuild = config.cspExtra.enabled
    ? CSP_VERSION_TO_BUILD[config.cspExtra.requireCspVersion] ?? 0
    : 0;
  const serializedTrack = cspBuild > 0 ? `csp/${cspBuild}/../${cleanTrack}` : cleanTrack;

  const lines: string[] = [
    '[SERVER]',
    `NAME=${config.name.trim() || 'AC Car Studio Server'}`,
    `CARS=${uniqueCarIds.join(';')}`,
    `CONFIG_TRACK=${config.configTrack.trim()}`,
    `TRACK=${serializedTrack}`,
    `SUN_ANGLE=${Math.round(config.sunAngle)}`,
    `PASSWORD=${config.password}`,
    `ADMIN_PASSWORD=${config.adminPassword || 'changeme'}`,
    `UDP_PORT=${Math.round(config.udpPort)}`,
    `TCP_PORT=${Math.round(config.tcpPort)}`,
    `HTTP_PORT=${Math.round(config.httpPort)}`,
    `MAX_BALLAST_KG=${Math.round(config.maxBallastKg)}`,
    'QUALIFY_MAX_WAIT_PERC=120',
    `RACE_PIT_WINDOW_START=0`,
    `RACE_PIT_WINDOW_END=0`,
    `REVERSED_GRID_RACE_POSITIONS=${Math.round(config.race.reversedGridRacePositions)}`,
    `LOCKED_ENTRY_LIST=${config.lockedEntryList ? 1 : 0}`,
    `PICKUP_MODE_ENABLED=${config.pickupModeEnabled ? 1 : 0}`,
    `LOOP_MODE=${config.loopMode ? 1 : 0}`,
    `SLEEP_TIME=${Math.max(1, Math.round(config.sleepTime))}`,
    `CLIENT_SEND_INTERVAL_HZ=${Math.max(10, Math.min(60, Math.round(config.clientSendIntervalHz)))}`,
    'SEND_BUFFER_SIZE=0',
    'RECV_BUFFER_SIZE=0',
    `RACE_OVER_TIME=180`,
    `KICK_QUORUM=${Math.round(config.kickQuorum)}`,
    `VOTING_QUORUM=${Math.round(config.votingQuorum)}`,
    `VOTE_DURATION=${Math.round(config.voteDuration)}`,
    `BLACKLIST_MODE=${config.blacklistMode}`,
    `FUEL_RATE=${Math.round(config.fuelRate)}`,
    `DAMAGE_MULTIPLIER=${Math.round(config.damageMultiplier)}`,
    `TYRE_WEAR_RATE=${Math.round(config.tyreWearRate)}`,
    `ALLOWED_TYRES_OUT=${Math.round(config.allowedTyresOut)}`,
    `ABS_ALLOWED=${config.absAllowed}`,
    `TC_ALLOWED=${config.tcAllowed}`,
    `START_RULE=${config.startRule}`,
    `RACE_GAS_PENALTY_DISABLED=${config.raceGasPenaltyDisabled ? 1 : 0}`,
    `TIME_OF_DAY_MULT=${Math.max(0, Math.round(config.timeOfDayMult))}`,
    'RESULT_SCREEN_TIME=60',
    `MAX_CONTACTS_PER_KM=${Math.round(config.maxContactsPerKm)}`,
    `STABILITY_ALLOWED=${config.stabilityAllowed ? 1 : 0}`,
    `AUTOCLUTCH_ALLOWED=${config.autoclutchAllowed ? 1 : 0}`,
    `TYRE_BLANKETS_ALLOWED=${config.tyreBlanketsAllowed ? 1 : 0}`,
    `FORCE_VIRTUAL_MIRROR=${config.forceVirtualMirror ? 1 : 0}`,
    `REGISTER_TO_LOBBY=${config.registerToLobby ? 1 : 0}`,
    `MAX_CLIENTS=${Math.max(1, Math.round(config.maxClients))}`,
    `NUM_THREADS=${Math.max(1, Math.round(config.numThreads))}`,
    'UDP_PLUGIN_LOCAL_PORT=0',
    'UDP_PLUGIN_ADDRESS=',
    'AUTH_PLUGIN_ADDRESS=',
    `LEGAL_TYRES=`,
    `WELCOME_MESSAGE=${config.welcomeMessage}`,
  ];

  if (config.practice.enabled) {
    lines.push(
      '',
      '[PRACTICE]',
      `NAME=${config.practice.name || 'Practice'}`,
      `TIME=${Math.max(1, Math.round(config.practice.time))}`,
      `IS_OPEN=${config.practice.isOpen}`
    );
  }

  if (config.qualify.enabled) {
    lines.push(
      '',
      '[QUALIFY]',
      `NAME=${config.qualify.name || 'Qualify'}`,
      `TIME=${Math.max(1, Math.round(config.qualify.time))}`,
      `IS_OPEN=${config.qualify.isOpen}`
    );
  }

  if (config.race.enabled) {
    lines.push(
      '',
      '[RACE]',
      `NAME=${config.race.name || 'Race'}`,
      `LAPS=${Math.max(0, Math.round(config.race.laps))}`,
      `TIME=${Math.max(0, Math.round(config.race.time))}`,
      `WAIT_TIME=${Math.max(10, Math.round(config.race.waitTime))}`,
      `IS_OPEN=${config.race.isOpen}`,
      `RACE_EXTRA_LAP=${config.race.extraLap ? 1 : 0}`
    );
  }

  if (config.dynamicTrack.enabled) {
    lines.push(
      '',
      '[DYNAMIC_TRACK]',
      `SESSION_START=${Math.round(config.dynamicTrack.sessionStart)}`,
      `RANDOMNESS=${Math.round(config.dynamicTrack.randomness)}`,
      `SESSION_TRANSFER=${Math.round(config.dynamicTrack.sessionTransfer)}`,
      `LAP_GAIN=${Math.max(1, Math.round(config.dynamicTrack.lapGain))}`
    );
  }

  lines.push(
    '',
    '[WEATHER_0]',
    `GRAPHICS=${config.weather.graphics || '3_clear'}`,
    `BASE_TEMPERATURE_AMBIENT=${Math.round(config.weather.baseTemperatureAmbient)}`,
    `BASE_TEMPERATURE_ROAD=${Math.round(config.weather.baseTemperatureRoad)}`,
    `VARIATION_AMBIENT=${Math.round(config.weather.variationAmbient)}`,
    `VARIATION_ROAD=${Math.round(config.weather.variationRoad)}`,
    `WIND_BASE_SPEED_MIN=${Math.round(config.weather.windBaseSpeedMin)}`,
    `WIND_BASE_SPEED_MAX=${Math.round(config.weather.windBaseSpeedMax)}`,
    `WIND_BASE_DIRECTION=${Math.round(config.weather.windBaseDirection)}`,
    `WIND_VARIATION_DIRECTION=${Math.round(config.weather.windVariationDirection)}`
  );

  // Entry List INI
  const entryLines: string[] = [];
  config.entryList.forEach((slot, idx) => {
    if (idx > 0) entryLines.push('');
    entryLines.push(
      `[CAR_${idx}]`,
      `MODEL=${slot.model.trim()}`,
      `SKIN=${slot.skin.trim()}`,
      `SPECTATOR_MODE=${slot.spectatorMode ? 1 : 0}`,
      `DRIVERNAME=${slot.driverName.trim()}`,
      `TEAM=${slot.team.trim()}`,
      `GUID=${slot.guid.trim()}`,
      `BALLAST=${Math.max(0, Math.round(slot.ballast))}`,
      `RESTRICTOR=${Math.max(0, Math.min(100, Math.round(slot.restrictor)))}`
    );
  });

  // CSP Extra Options INI
  const cspLines: string[] = [
    '; Generated by AC Car Studio — Custom Shaders Patch Server Extra Options',
    '[EXTRA_RULES]',
    `USE_EXTENDED_PHYSICS=${config.cspExtra.useExtendedPhysics ? 1 : 0}`,
    `ALLOW_WRONG_WAY=${config.cspExtra.allowWrongWay ? 1 : 0}`,
  ];
  if (config.cspExtra.maxMetersWrongWay > 0) {
    cspLines.push(`MAX_METERS_WRONG_WAY=${Math.round(config.cspExtra.maxMetersWrongWay)}`);
  }
  if (config.cspExtra.disableCollisions) {
    cspLines.push('DISABLE_COLLISIONS=1');
  }
  if (config.cspExtra.noBackToPits) {
    cspLines.push('NO_BACK_TO_PITS=1');
  }
  if (config.cspExtra.enforceBackToPitsPenalty) {
    cspLines.push('ENFORCE_BACK_TO_PITS_PENALTY=1');
  }
  if (config.cspExtra.disableRainPhysics) {
    cspLines.push('DISABLE_RAIN_PHYSICS=1');
  }

  if (config.cspExtra.pitSpeedLimitKmh > 0 || config.cspExtra.pitSpeedKeepInPits) {
    cspLines.push('', '[PITS_SPEED_LIMITER]');
    if (config.cspExtra.pitSpeedLimitKmh > 0) {
      cspLines.push(`SPEED_KMH=${Math.round(config.cspExtra.pitSpeedLimitKmh)}`);
    }
    cspLines.push(`KEEP_COLLISIONS=${config.cspExtra.pitSpeedKeepInPits ? 1 : 0}`);
  }

  if (config.cspExtra.customRawBlock.trim()) {
    cspLines.push('', config.cspExtra.customRawBlock.trim());
  }

  return {
    serverCfgIni: lines.join('\r\n') + '\r\n',
    entryListIni: entryLines.length > 0 ? entryLines.join('\r\n') + '\r\n' : '',
    cspExtraOptionsIni: cspLines.join('\r\n') + '\r\n',
    uniqueCarIds,
  };
}

export function buildContentManagerJoinLink(
  hostOrIp: string,
  httpPort: number,
  password?: string
): string {
  const host = hostOrIp.trim() || '127.0.0.1';
  const port = Math.round(httpPort) || 8081;
  let url = `https://acstuff.ru/s/q:race/online/join?ip=${encodeURIComponent(host)}&httpPort=${port}`;
  if (password && password.trim()) {
    url += `&password=${encodeURIComponent(password.trim())}`;
  }
  return url;
}
