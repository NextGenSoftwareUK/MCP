#!/usr/bin/env node
/**
 * Authenticate as our OASIS agent and get a JWT for the MCP server.
 * Use this so Cursor (or any MCP client) can act as that agent without
 * calling oasis_authenticate_avatar in-session.
 *
 * Options:
 *   --print   Only print the JWT and instructions; do not write .env
 *   --env     (default) Merge OASIS_API_KEY and OASIS_API_URL into MCP/.env
 *
 * Env: OASIS_AGENT_USERNAME, OASIS_AGENT_PASSWORD (required), OASIS_API_URL (optional)
 *
 * Run from repo root or MCP dir:
 *   OASIS_AGENT_USERNAME=cursor_agent_1772035997068 OASIS_AGENT_PASSWORD='TestAgent123!' node MCP/scripts/get-agent-jwt.mjs
 *   # or from MCP dir:
 *   OASIS_AGENT_USERNAME=cursor_agent_1772035997068 OASIS_AGENT_PASSWORD='TestAgent123!' node scripts/get-agent-jwt.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import axios from 'axios';
import https from 'https';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve MCP dir: script lives in MCP/scripts, so MCP is parent of __dirname
const MCP_DIR = path.resolve(__dirname, '..');
const ENV_PATH = path.join(MCP_DIR, '.env');

// Load existing .env so we can read OASIS_API_URL / credentials if not in process env
dotenv.config({ path: ENV_PATH });

const BASE = process.env.OASIS_API_URL || 'https://api.oasisweb4.com';
const USERNAME = process.env.OASIS_AGENT_USERNAME;
const PASSWORD = process.env.OASIS_AGENT_PASSWORD;
const PRINT_ONLY = process.argv.includes('--print');

if (!USERNAME || !PASSWORD) {
  console.error('Set OASIS_AGENT_USERNAME and OASIS_AGENT_PASSWORD (or add them to MCP/.env)');
  process.exit(1);
}

function extractJwt(data) {
  return data?.result?.result?.jwtToken ?? data?.result?.jwtToken ?? data?.jwtToken ?? null;
}

async function main() {
  console.log('OASIS API:', BASE);
  console.log('Authenticating as:', USERNAME);

  const client = axios.create({
    baseURL: BASE,
    headers: { 'Content-Type': 'application/json' },
    timeout: 15000,
    httpsAgent: new https.Agent({ rejectUnauthorized: false }),
  });

  const { data } = await client.post('/api/avatar/authenticate', {
    username: USERNAME,
    password: PASSWORD,
  }).catch((err) => {
    console.error('Auth request failed:', err.response?.data || err.message);
    process.exit(1);
  });

  const jwt = extractJwt(data);
  if (!jwt || typeof jwt !== 'string') {
    console.error('No JWT in response. Keys:', data ? Object.keys(data) : []);
    process.exit(1);
  }

  console.log('JWT obtained successfully.\n');

  if (PRINT_ONLY) {
    console.log('--- JWT (set OASIS_API_KEY or OASIS_JWT_TOKEN in the env used by your MCP server) ---');
    console.log(jwt);
    console.log('---');
    console.log('\nTo use in Cursor with local MCP: run without --print to write MCP/.env, then restart Cursor (or reload MCP).');
    return;
  }

  // Merge into MCP/.env
  let lines = [];
  if (fs.existsSync(ENV_PATH)) {
    const raw = fs.readFileSync(ENV_PATH, 'utf8');
    lines = raw.split(/\r?\n/);
  }

  const updates = {
    OASIS_API_KEY: jwt,
    OASIS_API_URL: BASE,
  };

  const seen = new Set();
  const out = [];
  for (const line of lines) {
    let written = false;
    for (const key of Object.keys(updates)) {
      if (line.startsWith(key + '=')) {
        out.push(`${key}=${updates[key]}`);
        seen.add(key);
        written = true;
        break;
      }
    }
    if (!written) out.push(line);
  }
  for (const key of Object.keys(updates)) {
    if (!seen.has(key)) out.push(`${key}=${updates[key]}`);
  }

  fs.writeFileSync(ENV_PATH, out.join('\n') + (out[out.length - 1] === '' ? '' : '\n'), 'utf8');
  console.log('Wrote OASIS_API_KEY and OASIS_API_URL to', ENV_PATH);
  console.log('\nNext: restart Cursor (or reload the OASIS MCP server) so it picks up the new .env.');
  console.log('Then this chat can act as the agent: discover and message other agents via OASIS tools.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
