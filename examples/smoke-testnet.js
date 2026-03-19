#!/usr/bin/env node
/**
 * smoke-testnet.js
 *
 * Testnet smoke script for SDK integration:
 *   create -> listPools -> getBestRate -> purchase (optional execute)
 *
 * Default mode is --dry-run (safe): no transaction is sent.
 *
 * Usage examples:
 *   node examples/smoke-testnet.js --dry-run
 *   PRIVATE_KEY=0x... node examples/smoke-testnet.js --execute --pool-id=1 --amount-usdc=25 --weeks=4
 */

const { ethers } = require('ethers-v6');
const { LayerCoverSDK } = require('../dist/index.js');

const DEFAULTS = {
    rpcUrl: process.env.RPC_URL || 'https://sepolia.base.org',
    apiBaseUrl: process.env.API_BASE_URL || 'https://app.layercover.com',
    deployment: process.env.DEPLOYMENT || 'base_sepolia_usdc',
    chainId: Number(process.env.CHAIN_ID || 84532),
    poolId: Number(process.env.POOL_ID || 1),
    amountUsdc: Number(process.env.COVERAGE_AMOUNT_USDC || 25),
    weeks: Number(process.env.DURATION_WEEKS || 4),
    maxRateBps: process.env.MAX_RATE_BPS ? Number(process.env.MAX_RATE_BPS) : undefined,
    requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS || 15000),
    maxRetries: Number(process.env.MAX_RETRIES || 2),
    retryDelayMs: Number(process.env.RETRY_DELAY_MS || 300),
    txConfirmations: Number(process.env.TX_CONFIRMATIONS || 1),
    txWaitTimeoutMs: Number(process.env.TX_WAIT_TIMEOUT_MS || 180000),
    autoPool: process.env.AUTO_POOL === '1' || process.env.AUTO_POOL === 'true',
};

function parseArgs(argv) {
    const args = {
        dryRun: true,
        execute: false,
        help: false,
        autoPool: DEFAULTS.autoPool,
    };

    for (const arg of argv) {
        if (arg === '--help' || arg === '-h') args.help = true;
        else if (arg === '--dry-run') args.dryRun = true;
        else if (arg === '--execute') {
            args.execute = true;
            args.dryRun = false;
        } else if (arg.startsWith('--pool-id=')) args.poolId = Number(arg.split('=')[1]);
        else if (arg.startsWith('--amount-usdc=')) args.amountUsdc = Number(arg.split('=')[1]);
        else if (arg.startsWith('--weeks=')) args.weeks = Number(arg.split('=')[1]);
        else if (arg.startsWith('--max-rate-bps=')) args.maxRateBps = Number(arg.split('=')[1]);
        else if (arg.startsWith('--rpc-url=')) args.rpcUrl = arg.split('=').slice(1).join('=');
        else if (arg.startsWith('--api-base-url=')) args.apiBaseUrl = arg.split('=').slice(1).join('=');
        else if (arg.startsWith('--deployment=')) args.deployment = arg.split('=').slice(1).join('=');
        else if (arg.startsWith('--chain-id=')) args.chainId = Number(arg.split('=')[1]);
        else if (arg === '--auto-pool') args.autoPool = true;
    }

    return { ...DEFAULTS, ...args };
}

function printHelp() {
    console.log(`
LayerCover SDK Smoke Test (testnet)

Usage:
  node examples/smoke-testnet.js [--dry-run] [--execute] [options]

Modes:
  --dry-run         Safe mode (default). Runs full read checks and purchase prechecks, no tx sent.
  --execute         Executes sdk.purchase(...) and sends transactions (requires PRIVATE_KEY + funds).

Options:
  --pool-id=<n>         Pool ID (default: ${DEFAULTS.poolId})
  --amount-usdc=<n>     Coverage amount in USDC units (default: ${DEFAULTS.amountUsdc})
  --weeks=<n>           Duration in weeks (default: ${DEFAULTS.weeks})
  --max-rate-bps=<n>    Optional max acceptable rate
  --rpc-url=<url>       RPC URL (default from RPC_URL or ${DEFAULTS.rpcUrl})
  --api-base-url=<url>  API base URL (default from API_BASE_URL or ${DEFAULTS.apiBaseUrl})
  --deployment=<name>   Deployment (default: ${DEFAULTS.deployment})
  --chain-id=<n>        Chain ID (default: ${DEFAULTS.chainId})
  --auto-pool           If the requested pool has no active quotes, try the first pool that does.

Environment:
  PRIVATE_KEY           Required only for --execute
  RPC_URL, API_BASE_URL, DEPLOYMENT, CHAIN_ID, POOL_ID, COVERAGE_AMOUNT_USDC, DURATION_WEEKS, MAX_RATE_BPS
  REQUEST_TIMEOUT_MS, MAX_RETRIES, RETRY_DELAY_MS, TX_CONFIRMATIONS, TX_WAIT_TIMEOUT_MS
`);
}

function validateConfig(cfg) {
    const requiredNumbers = [
        ['chainId', cfg.chainId, 1],
        ['poolId', cfg.poolId, 1],
        ['amountUsdc', cfg.amountUsdc, 0.000001],
        ['weeks', cfg.weeks, 1],
    ];

    for (const [name, value, min] of requiredNumbers) {
        if (!Number.isFinite(value) || value < min) {
            throw new Error(`${name} must be >= ${min}`);
        }
    }

    if (cfg.maxRateBps !== undefined && (!Number.isFinite(cfg.maxRateBps) || cfg.maxRateBps <= 0)) {
        throw new Error('maxRateBps must be > 0 when provided');
    }
}

function fmt(value, decimals = 6) {
    return Number(ethers.formatUnits(value, decimals)).toLocaleString(undefined, {
        maximumFractionDigits: 6,
    });
}

function normalizePrivateKey(raw) {
    if (!raw) return undefined;
    return raw.startsWith('0x') ? raw : `0x${raw}`;
}

async function main() {
    const cfg = parseArgs(process.argv.slice(2));
    if (cfg.help) {
        printHelp();
        return;
    }
    validateConfig(cfg);

    const privateKey = normalizePrivateKey(process.env.PRIVATE_KEY);
    if (cfg.execute && !privateKey) {
        throw new Error('PRIVATE_KEY is required when using --execute');
    }

    const provider = new ethers.JsonRpcProvider(cfg.rpcUrl, cfg.chainId, { staticNetwork: true });
    const signer = privateKey ? new ethers.Wallet(privateKey, provider) : undefined;

    console.log('═══════════════════════════════════════════════');
    console.log('  LayerCover SDK Smoke Test');
    console.log('═══════════════════════════════════════════════');
    console.log(`Mode:        ${cfg.execute ? 'EXECUTE' : 'DRY RUN'}`);
    console.log(`RPC:         ${cfg.rpcUrl}`);
    console.log(`API:         ${cfg.apiBaseUrl}`);
    console.log(`Deployment:  ${cfg.deployment}`);
    console.log(`Chain ID:    ${cfg.chainId}`);
    console.log(`Pool ID:     ${cfg.poolId}`);
    console.log(`Amount:      ${cfg.amountUsdc} USDC`);
    console.log(`Duration:    ${cfg.weeks} weeks`);
    if (cfg.maxRateBps) console.log(`Max Rate:    ${cfg.maxRateBps} bps`);
    if (signer) console.log(`Signer:      ${signer.address}`);

    const sdk = await LayerCoverSDK.create(signer || provider, {
        apiBaseUrl: cfg.apiBaseUrl,
        chainId: cfg.chainId,
        deployment: cfg.deployment,
        requestTimeoutMs: cfg.requestTimeoutMs,
        maxRetries: cfg.maxRetries,
        retryDelayMs: cfg.retryDelayMs,
        txConfirmations: cfg.txConfirmations,
        txWaitTimeoutMs: cfg.txWaitTimeoutMs,
    });

    console.log('\n[1/4] listPools()');
    const pools = await sdk.listPools();
    if (!Array.isArray(pools) || pools.length === 0) {
        throw new Error('No pools returned from listPools()');
    }
    console.log(`✓ Pools discovered: ${pools.length}`);

    let selectedPoolId = cfg.poolId;
    let pool = pools.find((p) => p.poolId === selectedPoolId);
    if (!pool) {
        throw new Error(`Pool ${selectedPoolId} not found in discovered pools`);
    }
    console.log(`✓ Pool found: ${pool.name} (${pool.category})`);

    console.log('\n[2/4] getBestRate(poolId)');
    let bestRateBps = await sdk.getBestRate(selectedPoolId);
    let searchedQuotedPool = false;
    if (bestRateBps == null && cfg.autoPool && !cfg.execute) {
        searchedQuotedPool = true;
        console.log(`• Pool ${selectedPoolId} has no active quotes, searching for a quoted pool...`);
        for (const candidate of pools) {
            const candidateRate = await sdk.getBestRate(candidate.poolId);
            if (candidateRate != null) {
                selectedPoolId = candidate.poolId;
                pool = candidate;
                bestRateBps = candidateRate;
                console.log(`✓ Switched to pool ${selectedPoolId}: ${pool.name} (${pool.category})`);
                break;
            }
        }
    }
    if (bestRateBps == null) {
        if (searchedQuotedPool) {
            throw new Error(`No active quotes available on deployment ${cfg.deployment}`);
        }
        throw new Error(`No active quotes available for pool ${selectedPoolId}`);
    }
    console.log(`✓ Best active rate: ${bestRateBps} bps (${(bestRateBps / 100).toFixed(2)}%)`);

    console.log('\n[3/4] purchase prechecks');
    const quotes = await sdk.getActiveQuotes(selectedPoolId);
    if (quotes.length === 0) {
        throw new Error(`No active quotes available for pool ${selectedPoolId}`);
    }
    const bestQuote = quotes[0];
    const amount = ethers.parseUnits(String(cfg.amountUsdc), 6);
    const durationSeconds = cfg.weeks * 7 * 24 * 60 * 60;
    const premium = sdk.calculatePremium(amount, bestQuote.premiumRateBps, durationSeconds);
    console.log(`✓ Selected quote: ${bestQuote.id} @ ${bestQuote.premiumRateBps} bps`);
    console.log(`✓ Selected pool: ${selectedPoolId} (${pool.name})`);
    console.log(`✓ Est premium: ${fmt(premium)} USDC`);
    console.log(`✓ Quote path: ${bestQuote.orderId !== undefined && bestQuote.orderId !== null ? 'on-chain order' : 'intent flow'}`);

    console.log('\n[4/4] purchase()');
    if (!cfg.execute) {
        console.log('✓ Dry run complete (no transaction sent)');
        console.log('  To execute live tx: add --execute and set PRIVATE_KEY');
        return;
    }

    if (!signer) {
        throw new Error('Signer is required for execute mode');
    }

    const result = await sdk.purchase(selectedPoolId, amount, cfg.weeks, cfg.maxRateBps);
    console.log('✓ Purchase submitted');
    console.log(`  Tx hash:   ${result.txHash}`);
    if (result.policyId) console.log(`  Policy ID: ${result.policyId}`);
}

main().catch((err) => {
    console.error(`\n❌ Smoke test failed: ${err?.message || err}`);
    process.exit(1);
});
