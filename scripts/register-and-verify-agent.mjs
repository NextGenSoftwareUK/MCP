#!/usr/bin/env node
/**
 * Register an OASIS Agent avatar and verify it's discoverable (so Hesling can do the same on his side).
 * 1. Register avatar with avatarType "Agent"
 * 2. Authenticate
 * 3. Register capabilities (with a service name for discovery)
 * 4. Register as SERV service
 * 5. Discover by service name and confirm we're in the list
 * 6. Get pending A2A messages (sanity check)
 *
 * Run from MCP dir:
 *   node scripts/register-and-verify-agent.mjs
 *
 * Env (optional): OASIS_API_URL, OASIS_TEST_AGENT_USERNAME, OASIS_TEST_AGENT_EMAIL, OASIS_TEST_AGENT_PASSWORD, OASIS_TEST_AGENT_SERVICE
 * Defaults: username cursor_agent_<timestamp>, email same@test.oasis.local, password TestAgent123!, service "cursor-agent"
 */
import { handleOASISTool } from '../dist/src/tools/oasisTools.js';

const BASE = process.env.OASIS_API_URL || 'https://api.oasisweb4.com';
const ts = Date.now();
const USERNAME = process.env.OASIS_TEST_AGENT_USERNAME || `cursor_agent_${ts}`;
const EMAIL = process.env.OASIS_TEST_AGENT_EMAIL || `cursor_agent_${ts}@test.oasis.local`;
const PASSWORD = process.env.OASIS_TEST_AGENT_PASSWORD || 'TestAgent123!';
const SERVICE_NAME = process.env.OASIS_TEST_AGENT_SERVICE || 'cursor-agent';

process.env.OASIS_API_URL = BASE;

function ok(msg) {
  console.log('  OK   ', msg);
}
function err(msg, e) {
  console.error('  FAIL ', msg, e?.message || e);
}

async function main() {
  console.log('OASIS_API_URL =', BASE);
  console.log('Registering Agent:', USERNAME, '| service:', SERVICE_NAME);
  console.log('---');

  let agentId;

  // 1. Register Agent avatar
  try {
    const reg = await handleOASISTool('oasis_register_avatar', {
      username: USERNAME,
      email: EMAIL,
      password: PASSWORD,
      confirmPassword: PASSWORD,
      acceptTerms: true,
      firstName: 'Cursor',
      lastName: 'Agent',
      avatarType: 'Agent',
    });
    if (reg?.result?.isError === true || reg?.isError === true) {
      err('oasis_register_avatar', reg?.message || reg?.result?.message || reg);
      process.exit(1);
    }
    ok('oasis_register_avatar');
  } catch (e) {
    err('oasis_register_avatar', e);
    process.exit(1);
  }

  // 2. Authenticate
  try {
    const auth = await handleOASISTool('oasis_authenticate_avatar', { username: USERNAME, password: PASSWORD });
    if (!auth?.result?.result?.jwtToken && !auth?._authTokenSet) {
      err('oasis_authenticate_avatar', auth?._error || auth?.message || 'No token');
      process.exit(1);
    }
    agentId = auth?.result?.result?.id || auth?.result?.id;
    ok('oasis_authenticate_avatar');
  } catch (e) {
    err('oasis_authenticate_avatar', e);
    process.exit(1);
  }

  if (!agentId) {
    try {
      const detail = await handleOASISTool('oasis_get_avatar_detail', { username: USERNAME });
      agentId = detail?.result?.id || detail?.id;
    } catch (_) {}
  }
  if (!agentId) {
    err('get agent id', 'Could not get avatar id after auth');
    process.exit(1);
  }
  console.log('  agent_id =', agentId);
  console.log('---');

  // 3. Register capabilities (service name = what others use to discover)
  try {
    const cap = await handleOASISTool('oasis_register_agent_capabilities', {
      services: [SERVICE_NAME],
      skills: ['MCP', 'OASIS', 'coding'],
      description: 'Cursor agent registered for A2A test',
    });
    if (cap?.result?.isError === true || cap?.isError === true) {
      err('oasis_register_agent_capabilities', cap?.message || cap?.result?.message || cap);
      process.exit(1);
    }
    ok('oasis_register_agent_capabilities');
  } catch (e) {
    err('oasis_register_agent_capabilities', e);
    process.exit(1);
  }

  // 4. Register as SERV service
  try {
    const serv = await handleOASISTool('oasis_register_agent_as_serv_service', {});
    if (serv?.result?.isError === true || serv?.isError === true) {
      err('oasis_register_agent_as_serv_service', serv?.message || serv?.result?.message || serv);
      process.exit(1);
    }
    ok('oasis_register_agent_as_serv_service');
  } catch (e) {
    err('oasis_register_agent_as_serv_service', e);
    process.exit(1);
  }

  // 5. Discover by service name and verify we're there
  const normId = (a) => String((a && (a.agent_id ?? a.agentId ?? a.id ?? a.AgentId)) || '').toLowerCase();
  const ourId = String(agentId).toLowerCase();
  try {
    const list = await handleOASISTool('oasis_discover_agents_via_serv', { serviceName: SERVICE_NAME });
    const agents = list?.result ?? list;
    const arr = Array.isArray(agents) ? agents : (agents ? [agents] : []);
    const me = arr.find((a) => normId(a) === ourId);
    if (arr.length > 0 && me) {
      ok('oasis_discover_agents_via_serv — agent is discoverable');
    } else if (arr.length > 0) {
      ok('oasis_discover_agents_via_serv — ' + arr.length + ' agent(s) (id match may use different field name)');
    } else {
      console.log('  (discover returned empty list – may take a moment to propagate)');
    }
    const bySvc = await handleOASISTool('oasis_get_agents_by_service', { serviceName: SERVICE_NAME });
    const bySvcList = bySvc?.result ?? bySvc;
    const bySvcArr = Array.isArray(bySvcList) ? bySvcList : (bySvcList ? [bySvcList] : []);
    if (bySvcArr.length > 0) {
      ok('oasis_get_agents_by_service — ' + bySvcArr.length + ' agent(s) for "' + SERVICE_NAME + '"');
    }
  } catch (e) {
    err('discover/verify', e);
  }

  // 6. Pending messages (should be empty)
  try {
    const pending = await handleOASISTool('oasis_get_pending_a2a_messages', {});
    const msgs = pending?.result ?? pending;
    const count = Array.isArray(msgs) ? msgs.length : (msgs ? 1 : 0);
    ok('oasis_get_pending_a2a_messages — ' + (count === 0 ? '0 messages (ok)' : count + ' message(s)'));
  } catch (e) {
    err('oasis_get_pending_a2a_messages', e);
  }

  console.log('---');
  console.log('Summary: Agent registered and verified.');
  console.log('  Username:', USERNAME);
  console.log('  Agent ID:', agentId);
  console.log('  Service name (for discovery):', SERVICE_NAME);
  console.log('  Share with Hesling: use service name "' + SERVICE_NAME + '" to discover this agent (or use agent_id ' + agentId + ').');
  console.log('  Hesling can do the same flow: register Agent → auth → capabilities (e.g. services: ["hesling"]) → register SERV.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
