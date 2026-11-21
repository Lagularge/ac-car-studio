// ============================================================================
// GitHub Release Update Checker Helpers (Semver comparison & Asset matching)
// ============================================================================

export const APP_GITHUB_OWNER = 'Lagularge';
export const APP_GITHUB_REPO = 'ac-car-studio';
export const APP_GITHUB_REPO_URL = `https://github.com/${APP_GITHUB_OWNER}/${APP_GITHUB_REPO}`;
export const APP_GITHUB_RELEASES_URL = `${APP_GITHUB_REPO_URL}/releases`;
export const APP_GITHUB_LATEST_RELEASE_API = `https://api.github.com/repos/${APP_GITHUB_OWNER}/${APP_GITHUB_REPO}/releases/latest`;

export interface ParsedSemver {
  major: number;
  minor: number;
  patch: number;
  prerelease: string;
}

export interface GitHubReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

export function normalizeVersionTag(version: string): string {
  return version.trim().replace(/^[vV]/, '');
}

export function parseSemver(version: string): ParsedSemver {
  const clean = normalizeVersionTag(version);
  const [corePart, ...preParts] = clean.split('-');
  const nums = corePart.split('.').map((s) => {
    const n = Number.parseInt(s, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  });
  return {
    major: nums[0] ?? 0,
    minor: nums[1] ?? 0,
    patch: nums[2] ?? 0,
    prerelease: preParts.join('-').trim(),
  };
}

/**
 * Returns > 0 if `latest` is newer than `current`, 0 if equal, < 0 if older.
 */
export function compareSemver(latest: string, current: string): number {
  const a = parseSemver(latest);
  const b = parseSemver(current);
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  // Release without prerelease tag is newer than prerelease of same core version
  if (a.prerelease && !b.prerelease) return -1;
  if (!a.prerelease && b.prerelease) return 1;
  return a.prerelease.localeCompare(b.prerelease);
}

export function isNewerVersion(latestTag: string, currentVersion: string): boolean {
  return compareSemver(latestTag, currentVersion) > 0;
}

/**
 * Selects the best Windows distributable binary from GitHub Release assets
 * (prefers portable/setup .exe over .zip).
 */
export function pickWindowsReleaseAsset(
  assets: GitHubReleaseAsset[] | undefined
): GitHubReleaseAsset | null {
  if (!assets || assets.length === 0) return null;
  const exes = assets.filter((a) => a.name.toLowerCase().endsWith('.exe'));
  if (exes.length > 0) {
    const portable = exes.find((a) => /portable/i.test(a.name));
    return portable ?? exes[0];
  }
  const zips = assets.filter(
    (a) => a.name.toLowerCase().endsWith('.zip') && /win|x64/i.test(a.name)
  );
  if (zips.length > 0) return zips[0];
  return null;
}

export function formatBytesCompact(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}
