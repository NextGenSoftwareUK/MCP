#!/usr/bin/env node
/**
 * Test MCP tool handlers against local OASIS API.
 * Run from MCP dir: OASIS_API_URL=http://127.0.0.1:5003 node scripts/test-mcp-tools-local.mjs
 */
const { handleOASISTool } = await import('../dist/src/tools/oasisTools.js');

const base = process.env.OASIS_API_URL || 'http://127.0.0.1:5003';
process.env.OASIS_API_URL = base;
console.log('Testing MCP tools against', base);
console.log('---');

try {
  const health = await handleOASISTool('oasis_health_check', {});
  const ok = health?.status === 'healthy' || health?.data?.status === 'healthy';
  console.log(ok ? 'OK oasis_health_check' : 'FAIL oasis_health_check', JSON.stringify(health).slice(0, 120));
  if (!ok) process.exit(1);
} catch (e) {
  console.log('FAIL oasis_health_check', e.message);
  process.exit(1);
}

try {
  const chains = await handleOASISTool('oasis_get_supported_chains', {});
  const count = chains?.result?.length ?? 0;
  console.log(count >= 1 ? `OK oasis_get_supported_chains (${count} chains)` : 'FAIL oasis_get_supported_chains', String(chains?.message || '').slice(0, 80));
  if (count < 1) process.exit(1);
} catch (e) {
  console.log('FAIL oasis_get_supported_chains', e.message);
  process.exit(1);
}

console.log('---');
console.log('MCP tools OK (local API).');
