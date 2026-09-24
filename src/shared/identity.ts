/**
 * Names and codes.
 *
 * Team codes are made by the database (`private.random_code`), never here: six characters from an
 * alphabet without the letters and digits people confuse when reading a code aloud (no I/1, O/0).
 * This file only tidies what a player typed before it is sent.
 */
export const TEAM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const TEAM_CODE_LENGTH = 6;

/** What the player typed, tidied: trimmed, collapsed, and short enough to draw over a head. */
export function cleanName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, 16);
}

export function cleanCampus(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, 24);
}

/** Accepts ` ms7k2p `, `MS7-K2P`, `ms 7k 2p` — all the ways a code gets typed. */
export function normaliseTeamCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, TEAM_CODE_LENGTH);
}

export function isTeamCode(code: string): boolean {
  return new RegExp(`^[${TEAM_CODE_ALPHABET}]{${TEAM_CODE_LENGTH}}$`).test(code);
}

export function generateTeamCode(): string {
  let code = '';
  for (let i = 0; i < TEAM_CODE_LENGTH; i++) {
    const idx = Math.floor(Math.random() * TEAM_CODE_ALPHABET.length);
    code += TEAM_CODE_ALPHABET[idx];
  }
  return code;
}

