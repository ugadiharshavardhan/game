/**
 * Names and codes: the whole of the game's "account system".
 *
 * A player is an id made in their own browser, a display name, and optionally a campus. Ids and
 * team codes avoid the letters and digits people confuse when reading a code to a friend across a
 * courtyard (no O/0, I/1, S/5), because a team code is read aloud far more often than it is typed.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRTUVWXYZ23456789';

const pick = (n: number, random: () => number): string =>
  Array.from({ length: n }, () => ALPHABET[Math.floor(random() * ALPHABET.length)]).join('');

/** `PLY_8F72K91` */
export function makePlayerId(random: () => number = Math.random): string {
  return `PLY_${pick(7, random)}`;
}

/** `MOON-7K4P` — four letters everyone can read out. */
export function makeTeamCode(random: () => number = Math.random): string {
  return `MOON-${pick(4, random)}`;
}

/** What the player typed, tidied: trimmed, collapsed, and short enough to draw over a head. */
export function cleanName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, 16);
}

export function cleanCampus(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, 24);
}

/** Accepts `moon-7k4p`, `MOON 7K4P`, ` 7k4p ` — all the ways a code gets typed. */
export function normaliseTeamCode(raw: string): string {
  const letters = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const body = letters.startsWith('MOON') ? letters.slice(4) : letters;
  return body ? `MOON-${body}` : '';
}

export function isTeamCode(code: string): boolean {
  return /^MOON-[A-Z0-9]{4}$/.test(code);
}
