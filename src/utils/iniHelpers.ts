import type { LutPoint } from '../types/ac';

/**
 * Strip inline comments starting with ; or // from an INI value
 */
export function stripIniComment(val: string): string {
  const semi = val.indexOf(';');
  const slash = val.indexOf('//');
  let cut = val.length;
  if (semi !== -1 && semi < cut) cut = semi;
  if (slash !== -1 && slash < cut) cut = slash;
  return val.slice(0, cut).trim();
}

export function getIniValue(
  iniText: string | undefined,
  section: string,
  key: string,
  fallback = ''
): string {
  if (!iniText) return fallback;
  const targetSection = section.trim().toUpperCase();
  const targetKey = key.trim().toUpperCase();
  const lines = iniText.split(/\r?\n/);

  let currentSection = '';
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('//') || trimmed.startsWith('#')) {
      continue;
    }
    if (trimmed.startsWith('[')) {
      const end = trimmed.indexOf(']');
      if (end !== -1) {
        currentSection = trimmed.slice(1, end).trim().toUpperCase();
      }
      continue;
    }
    if (currentSection !== targetSection) continue;
    const eq = rawLine.indexOf('=');
    if (eq === -1) continue;
    const k = rawLine.slice(0, eq).trim().toUpperCase();
    if (k === targetKey) {
      return stripIniComment(rawLine.slice(eq + 1));
    }
  }

  return fallback;
}

export function getIniNumber(
  iniText: string | undefined,
  section: string,
  key: string,
  fallback: number
): number {
  const raw = getIniValue(iniText, section, key, '');
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function hasIniSection(iniText: string | undefined, section: string): boolean {
  if (!iniText) return false;
  const target = `[${section.trim().toUpperCase()}]`;
  return iniText
    .split(/\r?\n/)
    .some((l) => l.trim().toUpperCase().startsWith(target));
}

export function getIniSections(iniText: string | undefined): string[] {
  if (!iniText) return [];
  const sections: string[] = [];
  for (const rawLine of iniText.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (trimmed.startsWith('[')) {
      const end = trimmed.indexOf(']');
      if (end !== -1) {
        sections.push(trimmed.slice(1, end).trim());
      }
    }
  }
  return sections;
}

/**
 * Updates or inserts a key=value pair inside a given section while preserving
 * existing comments, inline comments, ordering, and line endings.
 */
export function setIniValue(
  iniText: string | undefined,
  section: string,
  key: string,
  value: string | number
): string {
  const strVal = String(value);
  const text = iniText ?? '';
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text ? text.split(/\r?\n/) : [];

  const targetSection = section.trim().toUpperCase();
  const targetKey = key.trim().toUpperCase();

  let currentSection = '';
  let sectionStartIdx = -1;
  let sectionEndIdx = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (trimmed.startsWith('[')) {
      const end = trimmed.indexOf(']');
      if (end !== -1) {
        const secName = trimmed.slice(1, end).trim().toUpperCase();
        if (currentSection === targetSection && sectionEndIdx === lines.length) {
          sectionEndIdx = i;
        }
        currentSection = secName;
        if (secName === targetSection && sectionStartIdx === -1) {
          sectionStartIdx = i;
        }
      }
      continue;
    }

    if (currentSection === targetSection && sectionStartIdx !== -1 && sectionEndIdx === lines.length) {
      if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('//') || trimmed.startsWith('#')) {
        continue;
      }
      const eq = rawLine.indexOf('=');
      if (eq !== -1) {
        const k = rawLine.slice(0, eq).trim().toUpperCase();
        if (k === targetKey) {
          // Preserve inline comment if present
          const right = rawLine.slice(eq + 1);
          const semi = right.indexOf(';');
          const slash = right.indexOf('//');
          let commentIdx = -1;
          if (semi !== -1) commentIdx = semi;
          if (slash !== -1 && (commentIdx === -1 || slash < commentIdx)) commentIdx = slash;
          const inlineComment = commentIdx !== -1 ? `  ${right.slice(commentIdx).trim()}` : '';
          const origKey = rawLine.slice(0, eq).trim();
          lines[i] = `${origKey}=${strVal}${inlineComment}`;
          return lines.join(eol);
        }
      }
    }
  }

  // Key not found inside existing section -> insert before section end (skipping trailing blank lines)
  if (sectionStartIdx !== -1) {
    let insertAt = sectionEndIdx;
    while (insertAt > sectionStartIdx + 1 && lines[insertAt - 1].trim() === '') {
      insertAt--;
    }
    lines.splice(insertAt, 0, `${key}=${strVal}`);
    return lines.join(eol);
  }

  // Section does not exist -> append section at the end
  if (lines.length > 0 && lines[lines.length - 1].trim() !== '') {
    lines.push('');
  }
  lines.push(`[${section}]`);
  lines.push(`${key}=${strVal}`);
  return lines.join(eol) + eol;
}

export function setIniValues(
  iniText: string | undefined,
  updates: Array<[section: string, key: string, value: string | number]>
): string {
  let out = iniText ?? '';
  for (const [sec, key, val] of updates) {
    out = setIniValue(out, sec, key, val);
  }
  return out;
}

export function removeIniSection(iniText: string | undefined, section: string): string {
  if (!iniText) return '';
  const eol = iniText.includes('\r\n') ? '\r\n' : '\n';
  const target = section.trim().toUpperCase();
  const lines = iniText.split(/\r?\n/);
  const result: string[] = [];
  let skipping = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[')) {
      const end = trimmed.indexOf(']');
      if (end !== -1) {
        const sec = trimmed.slice(1, end).trim().toUpperCase();
        skipping = sec === target;
      }
    }
    if (!skipping) {
      result.push(line);
    }
  }

  return result.join(eol);
}

export function parseLut(lutText: string | undefined): LutPoint[] {
  if (!lutText) return [];
  const pts: LutPoint[] = [];
  for (const line of lutText.split(/\r?\n/)) {
    const cleaned = stripIniComment(line).trim();
    if (!cleaned || !cleaned.includes('|')) continue;
    const [rpmStr, torqueStr] = cleaned.split('|');
    const rpm = Number(rpmStr.trim());
    const torque = Number(torqueStr.trim());
    if (Number.isFinite(rpm) && Number.isFinite(torque)) {
      pts.push({ rpm, torque });
    }
  }
  return pts.sort((a, b) => a.rpm - b.rpm);
}

export function serializeLut(points: LutPoint[]): string {
  const sorted = [...points].sort((a, b) => a.rpm - b.rpm);
  return (
    sorted
      .map((p) => `${Math.round(p.rpm)}|${Number(p.torque.toFixed(1))}`)
      .join('\n') + '\n'
  );
}
