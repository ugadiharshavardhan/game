#!/usr/bin/env node
/**
 * End-to-end check of the real stack: Clerk sign-in tokens -> Supabase RPCs, RLS and Realtime.
 *
 *   node tools/e2e/team-flow.mjs
 *
 * Needs CLERK_SECRET_KEY (a development instance: sk_test_…), VITE_SUPABASE_URL and
 * VITE_SUPABASE_PUBLISHABLE_KEY in .env.local. It creates two throwaway Clerk users, has one
 * make a team and the other join it by code from a separate client, readies both, starts a round,
 * watches the private team channel announce the changes, leaves, and deletes the Clerk users.
 * The profiles/teams it made stay in the database under the names "E2E A"/"E2E B"; their ids are
 * printed so they can be removed.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map(([, k, v]) => [k, v.replace(/^['"]|['"]$/g, '')]),
);
const { CLERK_SECRET_KEY, VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY } = { ...env, ...process.env };
if (!CLERK_SECRET_KEY?.startsWith('sk_test_')) throw new Error('CLERK_SECRET_KEY must be a development (sk_test_) key');
if (!VITE_SUPABASE_URL || !VITE_SUPABASE_PUBLISHABLE_KEY) throw new Error('Supabase env missing');

const clerk = async (path, body) => {
  const res = await fetch(`https://api.clerk.com/v1${path}`, {
    method: body === undefined ? 'DELETE' : 'POST',
    headers: { Authorization: `Bearer ${CLERK_SECRET_KEY}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Clerk ${path}: ${res.status} ${JSON.stringify(json)}`);
  return json;
};

const results = [];
let failed = false;
const check = (name, ok, detail = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed = true;
  console.log(results.at(-1));
};

async function player(label) {
  const tag = Math.random().toString(36).slice(2, 8);
  const user = await clerk('/users', {
    email_address: [`e2e+${label.toLowerCase()}_${tag}@example.com`],
    password: `E2e-${tag}-Pass!93`,
    skip_password_checks: true,
    first_name: `E2E ${label}`,
  });
  const session = await clerk('/sessions', { user_id: user.id });
  const token = async () => (await clerk(`/sessions/${session.id}/tokens`, {})).jwt;
  const db = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, { accessToken: token });
  const call = async (fn, args = {}) => {
    const { data, error } = await db.rpc(fn, args);
    if (error) throw Object.assign(new Error(`${fn}: ${error.code} ${error.message}`), { pg: error });
    return data;
  };
  return { label, user, token, db, call };
}

const a = await player('A');
const b = await player('B');
console.log(`clerk users: ${a.user.id}, ${b.user.id}`);

try {
  const claims = JSON.parse(Buffer.from((await a.token()).split('.')[1], 'base64url').toString());
  check('Clerk session token carries role=authenticated', claims.role === 'authenticated', `role=${claims.role}`);

  try {
    await a.call('get_my_team');
    check('Supabase accepts the Clerk token', true);
  } catch (error) {
    check('Supabase accepts the Clerk token', false, error.message);
    throw new Error('Supabase does not trust Clerk yet: add Clerk under Authentication -> Third-Party Auth');
  }

  const pa = await a.call('ensure_profile', { p_display_name: 'E2E A', p_campus: 'Hyderabad' });
  await b.call('ensure_profile', { p_display_name: 'E2E B', p_campus: '' });
  check('profiles saved', pa?.id === a.user.id, pa?.username);

  const created = await a.call('create_team', { p_team_name: 'E2E Moon Crew' });
  const code = created.team.team_code;
  check('A creates a team and gets a code from the database', /^[A-HJ-NP-Z2-9]{6}$/.test(code), code);

  const messy = `${code.slice(0, 3).toLowerCase()}-${code.slice(3).toLowerCase()}`;
  const preview = await b.call('get_team_by_code', { p_team_code: messy });
  check('B (another client) finds the team by code, typed messily', preview.team_code === code && preview.member_count === 1, messy);

  // A listens on the private team channel before B joins.
  const heard = [];
  const channel = a.db.channel(`team:${created.team.id}`, { config: { private: true } });
  channel.on('broadcast', { event: 'db_change' }, ({ payload }) => heard.push(payload.table));
  const subscribed = await new Promise((resolve) => {
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') resolve(true);
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') resolve(false);
    });
    setTimeout(() => resolve(false), 10000);
  });
  check('A joins the private Realtime team channel', subscribed);

  const joined = await b.call('join_team', { p_team_code: code });
  check('B joins by code', joined.members.length === 2);

  try {
    await b.call('join_team', { p_team_code: 'ZZZZZZ' });
    check('an unknown code is refused', false);
  } catch (error) {
    check('an unknown code is refused', error.pg?.message === 'ALREADY_IN_TEAM' || error.pg?.message === 'TEAM_NOT_FOUND', error.pg?.message);
  }

  await b.call('set_ready', { p_ready: true });
  await a.call('set_ready', { p_ready: true });
  const started = await a.call('start_game');
  check('host starts the round for both', started.session.status === 'in_progress' && started.session_players.length === 2);

  const bView = await b.call('get_my_team');
  check('B sees the same round', bView.session.id === started.session.id);

  await new Promise((r) => setTimeout(r, 1500));
  check('the team channel announced the changes', heard.includes('team_members') && heard.includes('game_sessions'), heard.join(','));
  await a.db.removeChannel(channel);

  const { data: peek } = await b.db.from('teams').select('team_code');
  check('RLS: B only sees their own team', (peek ?? []).length === 1 && peek[0].team_code === code);

  const anon = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY);
  const { error: anonError } = await anon.rpc('create_team', { p_team_name: 'nope' });
  check('signed-out callers cannot create teams', !!anonError, anonError?.code);

  await a.call('save_settings', { p_settings: { volume: 0.4, quality: 'low' } });
  await a.call('update_profile_details', { p_character: 'pujari', p_gender: 'other' });
  const me = await a.call('get_my_profile');
  check('settings and avatar saved to the profile', me.settings.volume === 0.4 && me.character === 'pujari');

  await a.call('leave_session', { p_session_id: started.session.id });
  await b.call('leave_session', { p_session_id: started.session.id });
  await b.call('leave_team');
  await a.call('leave_team');
  check('both leave cleanly', (await a.call('get_my_team')) === null);
} catch (error) {
  console.error(`\nstopped: ${error.message}`);
  failed = true;
} finally {
  await clerk(`/users/${a.user.id}`).catch(() => {});
  await clerk(`/users/${b.user.id}`).catch(() => {});
  console.log(`\ncleanup: deleted Clerk users. Database rows for ${a.user.id}, ${b.user.id} remain.`);
}

console.log(failed ? '\nE2E FAILED' : '\nE2E PASSED');
process.exit(failed ? 1 : 0);
