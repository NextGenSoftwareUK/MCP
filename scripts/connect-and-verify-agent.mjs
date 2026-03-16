#!/usr/bin/env node
/**
 * Connect to our OASIS agent (authenticate) and verify we're that agent.
 * Use this to prove the credentials work. For **this Cursor chat** to be the agent,
 * you must authenticate from Cursor (ask the AI to call oasis_authenticate_avatar).
 *
 * Env: OASIS_AGENT_USERNAME, OASIS_AGENT_PASSWORD (required), OASIS_API_URL (optional)
 *
 * Run from MCP dir:
 *   OASIS_AGENT_USERNAME=cursor_agent_1772035997068 OASIS_AGENT_PASSWORD='TestAgent123!' node scripts/connect-and-verify-agent.mjs
 */
import { handleOASISTool } from '../dist/src/tools/oasisTools.js';

const BASE = process.env.OASIS_API_URL || 'https://api.oasisweb4.com';
const USERNAME = process.env.OASIS_AGENT_USERNAME;
const PASSWORD = process.env.OASIS_AGENT_PASSWORD;

process.env.OASIS_API_URL = BASE;

if (!USERNAME || !PASSWORD) {
  console.error('Set OASIS_AGENT_USERNAME and OASIS_AGENT_PASSWORD');
  process.exit(1);
}

async function main() {
  console.log('OASIS_API_URL =', BASE);
  console.log('Authenticating as:', USERNAME);
  console.log('---');

  let agentId;

  try {
    const auth = await handleOASISTool('oasis_authenticate_avatar', { username: USERNAME, password: PASSWORD });
    if (!auth?.result?.result?.jwtToken && !auth?._authTokenSet) {
      console.error('FAIL auth — no token:', auth?._error || auth?.message || JSON.stringify(auth).slice(0, 200));
      process.exit(1);
    }
    agentId = auth?.result?.result?.id || auth?.result?.id;
    console.log('  OK   oasis_authenticate_avatar');
    console.log('  agent_id =', agentId);
  } catch (e) {
    console.error('  FAIL oasis_authenticate_avatar', e?.message || e);
    process.exit(1);
  }

  try {
    const detail = await handleOASISTool('oasis_get_avatar_detail', { username: USERNAME });
    const id = detail?.result?.id ?? detail?.id;
    const name = detail?.result?.username ?? detail?.username ?? USERNAME;
    if (id && id === agentId) {
      console.log('  OK   oasis_get_avatar_detail — identity matches:', name);
    } else {
      console.log('  OK   oasis_get_avatar_detail —', name, '| id:', id || agentId);
    }
  } catch (e) {
    console.error('  FAIL oasis_get_avatar_detail', e?.message || e);
  }

  try {
    const pending = await handleOASISTool('oasis_get_pending_a2a_messages', {});
    const msgs = pending?.result ?? pending;
    const count = Array.isArray(msgs) ? msgs.length : (msgs ? 1 : 0);
    console.log('  OK   oasis_get_pending_a2a_messages —', count, 'message(s)');
  } catch (e) {
    console.error('  FAIL oasis_get_pending_a2a_messages', e?.message || e);
  }

  console.log('---');
  console.log('Connected as agent:', agentId);
  console.log('(This script runs in Node; to use this identity in Cursor, authenticate from Cursor — see AGENT_TO_AGENT_TEST.md)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
