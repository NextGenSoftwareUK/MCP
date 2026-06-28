#!/usr/bin/env node
/**
 * End-to-end test: MCP + OASIS API working together (read and write).
 * Verifies that the API works with the MCP so people can actually use the stack.
 * 1. Authenticates as OASIS_ADMIN (set OASIS_ADMIN_PASSWORD or use default).
 * 2. Runs all read tools, then write tools (register, karma, wallet, mint, update, etc.).
 *
 * Run from repo root: node MCP/scripts/test-all-mcp-endpoints.mjs
 * Or from MCP: OASIS_API_URL=http://127.0.0.1:5003 node scripts/test-all-mcp-endpoints.mjs
 *
 * Optional: RUN_WRITE_TESTS=0 to skip write tests (read-only run).
 */
import { handleOASISTool } from '../dist/src/tools/oasisTools.js';
import fs from 'fs';
import path from 'path';

const BASE = process.env.OASIS_API_URL || 'http://127.0.0.1:5003';
const USER = process.env.OASIS_ADMIN_USER || 'OASIS_ADMIN';
const PASS = process.env.OASIS_ADMIN_PASSWORD || 'Uppermall1!';
const RUN_WRITE = process.env.RUN_WRITE_TESTS !== '0';

process.env.OASIS_API_URL = BASE;

const results = { ok: [], fail: [], skip: [] };

function pass(name) {
  results.ok.push(name);
  console.log('  OK   ' + name);
}
function fail(name, err) {
  results.fail.push(name);
  const msg = (err && (err.message || err.response?.data?.message || err.response?.status)) || String(err).slice(0, 120);
  console.log('  FAIL ' + name + ' — ' + msg);
}
function skip(name, reason) {
  results.skip.push(name);
  console.log('  SKIP ' + name + (reason ? ' — ' + reason : ''));
}

async function run(name, fn) {
  try {
    const out = await fn();
    if (out && (out.isError === true || (out.result && out.result.isError === true))) {
      fail(name, out.message || out.result?.message || 'API returned isError');
      return;
    }
    pass(name);
  } catch (e) {
    fail(name, e);
  }
}

async function main() {
  console.log('OASIS_API_URL =', BASE);
  console.log('Authenticating as', USER, '...');
  let avatarId;
  try {
    const auth = await handleOASISTool('oasis_authenticate_avatar', { username: USER, password: PASS });
    if (!auth || (auth._authTokenSet !== true && !auth?.result?.result?.jwtToken)) {
      fail('oasis_authenticate_avatar', auth?._error || auth?.message || 'No token');
      console.log('Cannot continue without auth.');
      printSummary();
      process.exit(1);
    }
    pass('oasis_authenticate_avatar');
    avatarId = auth?.result?.result?.id || auth?.result?.id;
    if (!avatarId) {
      const ad = await handleOASISTool('oasis_get_avatar_detail', { username: USER });
      avatarId = ad?.result?.id || ad?.id;
    }
    if (!avatarId) avatarId = '0df19747-fa32-4c2f-a6b8-b55ed76d04af'; // fallback from prior test
  } catch (e) {
    fail('oasis_authenticate_avatar', e);
    console.log('Cannot continue without auth.');
    printSummary();
    process.exit(1);
  }
  console.log('avatarId =', avatarId);
  console.log('---');

  // No auth required
  await run('oasis_health_check', () => handleOASISTool('oasis_health_check', {}));
  await run('oasis_get_supported_chains', () => handleOASISTool('oasis_get_supported_chains', {}));

  // Auth + avatarId
  await run('oasis_get_avatar_detail', () => handleOASISTool('oasis_get_avatar_detail', { avatarId }));
  await run('oasis_get_provider_wallets', () => handleOASISTool('oasis_get_provider_wallets', { avatarId }));
  await run('oasis_get_nfts', () => handleOASISTool('oasis_get_nfts', { avatarId }));
  await run('oasis_get_geo_nfts', () => handleOASISTool('oasis_get_geo_nfts', { avatarId }));
  await run('oasis_get_karma_stats', () => handleOASISTool('oasis_get_karma_stats', { avatarId }));
  await run('oasis_get_karma_history', () => handleOASISTool('oasis_get_karma_history', { avatarId }));
  await run('oasis_get_karma_akashic_records', () => handleOASISTool('oasis_get_karma_akashic_records', { avatarId }));
  await run('oasis_get_portfolio_value', () => handleOASISTool('oasis_get_portfolio_value', { avatarId }));
  await run('oasis_get_default_wallet', () => handleOASISTool('oasis_get_default_wallet', { avatarId, providerType: 'SolanaOASIS' }));
  await run('oasis_get_wallets_by_chain', () => handleOASISTool('oasis_get_wallets_by_chain', { avatarId, chain: 'solana' }));

  // get_karma uses GET /api/karma/{id} which may 404 on ONODE (use get_karma_stats instead)
  await run('oasis_get_karma', () => handleOASISTool('oasis_get_karma', { avatarId }));

  // get_wallet uses GET /api/wallet/{avatarId} — ONODE may not have this route
  await run('oasis_get_wallet', () => handleOASISTool('oasis_get_wallet', { avatarId }));

  // Need walletId from provider wallets for these
  let walletId;
  try {
    const pw = await handleOASISTool('oasis_get_provider_wallets', { avatarId });
    const sol = pw?.result?.SolanaOASIS || pw?.SolanaOASIS;
    if (Array.isArray(sol) && sol.length) walletId = sol[0].walletId || sol[0].id;
  } catch (_) {}
  if (walletId) {
    await run('oasis_get_wallet_analytics', () => handleOASISTool('oasis_get_wallet_analytics', { avatarId, walletId }));
    await run('oasis_get_wallet_tokens', () => handleOASISTool('oasis_get_wallet_tokens', { avatarId, walletId }));
  } else {
    skip('oasis_get_wallet_analytics', 'no walletId');
    skip('oasis_get_wallet_tokens', 'no walletId');
  }

  // NFT by id — get first nft id from get_nfts
  let nftId;
  try {
    const nfts = await handleOASISTool('oasis_get_nfts', { avatarId });
    const list = nfts?.result || nfts;
    if (Array.isArray(list) && list.length) nftId = list[0].id || list[0].nftId;
  } catch (_) {}
  if (nftId) {
    await run('oasis_get_nft', () => handleOASISTool('oasis_get_nft', { nftId }));
  } else {
    skip('oasis_get_nft', 'no nftId');
  }

  // Search / list (may require Wizard for get_all_*)
  await run('oasis_search_holons', () => handleOASISTool('oasis_search_holons', {}));
  await run('oasis_get_all_avatar_details', () => handleOASISTool('oasis_get_all_avatar_details', {}));
  await run('oasis_get_all_nfts', () => handleOASISTool('oasis_get_all_nfts', {}));
  await run('oasis_get_all_geo_nfts', () => handleOASISTool('oasis_get_all_geo_nfts', {}));

  // Karma weightings (need valid karma type enum)
  await run('oasis_get_positive_karma_weighting', () => handleOASISTool('oasis_get_positive_karma_weighting', { karmaType: 'LevelUp' }));
  await run('oasis_get_negative_karma_weighting', () => handleOASISTool('oasis_get_negative_karma_weighting', { karmaType: 'Stealing' }));

  // A2A / agents (may 404 or empty)
  await run('oasis_get_all_agents', () => handleOASISTool('oasis_get_all_agents', {}));
  await run('oasis_get_agents_by_service', () => handleOASISTool('oasis_get_agents_by_service', { serviceName: 'test' }));
  await run('oasis_get_my_agents', () => handleOASISTool('oasis_get_my_agents', {}));
  await run('oasis_get_pending_a2a_messages', () => handleOASISTool('oasis_get_pending_a2a_messages', {}));
  await run('oasis_discover_agents_via_serv', () => handleOASISTool('oasis_discover_agents_via_serv', {}));

  // Token metadata (public Solana mint — use a known devnet mint or placeholder)
  skip('oasis_get_token_metadata_by_mint', 'needs real mint');
  skip('oasis_get_nft_by_hash', 'needs hash');
  skip('oasis_get_transaction', 'needs tx hash');
  skip('oasis_get_holon', 'needs holonId');
  skip('oasis_get_nfts_for_mint_address', 'needs mint address');
  skip('oasis_get_geo_nfts_for_mint_address', 'needs mint address');
  skip('oasis_get_agent_card', 'needs agentId');

  // --- Write tests: MCP + API together (so people can actually use the stack) ---
  if (RUN_WRITE) {
    console.log('---');
    console.log('Write tests (MCP → API)');
    console.log('---');

    await run('oasis_add_karma', () =>
      handleOASISTool('oasis_add_karma', {
        avatarId,
        KarmaType: 'LevelUp',
        karmaSourceType: 'dApp',
        KaramSourceTitle: 'MCP E2E test',
        KarmaSourceDesc: 'Testing MCP + API write path',
      })
    );

    const testUsername = 'mcp_e2e_' + Date.now();
    const testEmail = testUsername + '@test.oasis.local';
    await run('oasis_register_avatar', () =>
      handleOASISTool('oasis_register_avatar', {
        username: testUsername,
        email: testEmail,
        password: 'TestPass123!',
        confirmPassword: 'TestPass123!',
        acceptTerms: true,
        firstName: 'MCP',
        lastName: 'E2E',
        avatarType: 'User',
      })
    );

    await run('oasis_create_solana_wallet', () =>
      handleOASISTool('oasis_create_solana_wallet', { avatarId })
    );

    await run('oasis_mint_nft', () =>
      handleOASISTool('oasis_mint_nft', {
        JSONMetaDataURL: 'https://jsonplaceholder.typicode.com/posts/1',
        Symbol: 'MCPE2E',
        Title: 'MCP E2E Test NFT',
        NumberToMint: 1,
        Cluster: 'devnet',
      })
    );

    const defaultWalletId = walletId;
    if (defaultWalletId) {
      await run('oasis_set_default_wallet', () =>
        handleOASISTool('oasis_set_default_wallet', {
          avatarId,
          walletId: defaultWalletId,
          providerType: 'SolanaOASIS',
        })
      );
    } else {
      skip('oasis_set_default_wallet', 'no walletId');
    }

    await run('oasis_update_avatar', () =>
      handleOASISTool('oasis_update_avatar', {
        avatarId,
        updates: { title: 'MCP E2E test run' },
      })
    );

    await run('oasis_save_holon', () =>
      handleOASISTool('oasis_save_holon', {
        holon: {
          name: 'MCP E2E holon',
          description: 'Test holon from MCP E2E',
          holonType: 'Test',
        },
      })
    );

    await run('oasis_remove_karma', () =>
      handleOASISTool('oasis_remove_karma', {
        avatarId,
        KarmaType: 'Other',
        karmaSourceType: 'dApp',
        KaramSourceTitle: 'MCP E2E test',
        KarmaSourceDesc: 'Reversing test karma',
      })
    );

    let mintedNftId;
    try {
      const nftsAfter = await handleOASISTool('oasis_get_nfts', { avatarId });
      const list = nftsAfter?.result || nftsAfter;
      if (Array.isArray(list) && list.length) {
        const mcpNft = list.find((n) => n.symbol === 'MCPE2E' || n.title === 'MCP E2E Test NFT') || list[list.length - 1];
        mintedNftId = mcpNft?.id || mcpNft?.nftId;
      }
    } catch (_) {}
    if (mintedNftId) {
      await run('oasis_place_geo_nft', () =>
        handleOASISTool('oasis_place_geo_nft', {
          originalOASISNFTId: mintedNftId,
          latitude: 51.5074,
          longitude: -0.1278,
        })
      );
    } else {
      skip('oasis_place_geo_nft', 'no minted NFT id');
    }

    await run('oasis_create_wallet_full', () =>
      handleOASISTool('oasis_create_wallet_full', {
        avatarId,
        WalletProviderType: 'SolanaOASIS',
        Name: 'MCP E2E wallet',
        GenerateKeyPair: true,
        IsDefaultWallet: false,
      })
    );

    const tmpFile = path.join(process.cwd(), 'mcp-e2e-upload-test.txt');
    try {
      fs.writeFileSync(tmpFile, 'MCP E2E upload test\n', 'utf8');
      await run('oasis_upload_file', () =>
        handleOASISTool('oasis_upload_file', { filePath: tmpFile })
      );
    } catch (e) {
      fail('oasis_upload_file', e);
    } finally {
      try { fs.unlinkSync(tmpFile); } catch (_) {}
    }

    skip('oasis_send_transaction', 'requires real transfer; test manually');
    skip('oasis_send_nft', 'requires two wallets; test manually');
    skip('oasis_import_wallet_private_key', 'security-sensitive; test manually');
    skip('oasis_import_wallet_public_key', 'test manually');
    skip('oasis_create_nft', 'Glif/image flow; test manually');
    skip('oasis_execute_ai_workflow', 'workflow-specific; test manually');
    skip('oasis_register_agent_capabilities', 'needs agent avatar; test manually');
    skip('oasis_register_agent_as_serv_service', 'needs capabilities first; test manually');
    skip('oasis_register_openserv_agent', 'test manually');
    skip('oasis_send_a2a_jsonrpc_request', 'needs target agent; test manually');
    skip('oasis_mark_a2a_message_processed', 'needs message id; test manually');
    skip('oasis_vote_positive_karma_weighting', 'test manually');
    skip('oasis_vote_negative_karma_weighting', 'test manually');
    skip('oasis_load_all_holons', 'test manually');
    skip('oasis_update_holon', 'needs holonId; test manually');
    skip('oasis_delete_holon', 'destructive; test manually');
    skip('oasis_advanced_search', 'test manually');
    skip('oasis_create_wallet', 'basic; covered by create_solana_wallet');
    skip('oasis_create_ethereum_wallet', 'same pattern as Solana; test manually');
  } else {
    console.log('---');
    console.log('Write tests skipped (RUN_WRITE_TESTS=0)');
    skip('oasis_add_karma', 'RUN_WRITE_TESTS=0');
    skip('oasis_register_avatar', 'RUN_WRITE_TESTS=0');
    skip('oasis_mint_nft', 'RUN_WRITE_TESTS=0');
    skip('oasis_create_solana_wallet', 'RUN_WRITE_TESTS=0');
    skip('oasis_set_default_wallet', 'RUN_WRITE_TESTS=0');
    skip('oasis_update_avatar', 'RUN_WRITE_TESTS=0');
    skip('oasis_save_holon', 'RUN_WRITE_TESTS=0');
    skip('oasis_remove_karma', 'RUN_WRITE_TESTS=0');
    skip('oasis_place_geo_nft', 'RUN_WRITE_TESTS=0');
    skip('oasis_create_wallet_full', 'RUN_WRITE_TESTS=0');
    skip('oasis_upload_file', 'RUN_WRITE_TESTS=0');
  }

  printSummary();
  process.exit(results.fail.length > 0 ? 1 : 0);
}

function printSummary() {
  console.log('---');
  console.log('Summary: OK', results.ok.length, '| FAIL', results.fail.length, '| SKIP', results.skip.length);
  if (results.fail.length) {
    console.log('Failed:', results.fail.join(', '));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
