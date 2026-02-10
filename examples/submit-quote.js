#!/usr/bin/env node
/**
 * submit-quote.js — Submit a coverage quote to the LayerCover orderbook
 *
 * Usage:
 *   SYNDICATE_MANAGER_PK=0x... node examples/submit-quote.js
 *
 * Optional env vars:
 *   API_URL              — API base URL (default: http://localhost:3001)
 *   DEPLOYMENT           — Deployment name (default: base_sepolia_usdc)
 *   SYNDICATE_ADDRESS    — Syndicate vault address (required)
 *   POOL_ID              — Pool to underwrite (default: 1)
 *   COVERAGE_AMOUNT_USDC — Coverage in USDC (default: 10000)
 *   PREMIUM_RATE_BPS     — Annual premium in bps (default: 500 = 5%)
 *   MIN_DURATION_WEEKS   — Minimum duration (default: 4)
 *   MAX_DURATION_WEEKS   — Maximum duration (default: 12)
 *   EXPIRY_HOURS         — Quote validity in hours (default: 24)
 */

const { ethers } = require('ethers');

// --------------------------------------------------------------------------
// Config from environment
// --------------------------------------------------------------------------
const API_URL = process.env.API_URL || 'http://localhost:3001';
const DEPLOYMENT = process.env.DEPLOYMENT || 'base_sepolia_usdc';
const SYNDICATE_ADDRESS = process.env.SYNDICATE_ADDRESS;
const MANAGER_PK = process.env.SYNDICATE_MANAGER_PK;
const POOL_ID = Number(process.env.POOL_ID || 1);
const COVERAGE_USDC = Number(process.env.COVERAGE_AMOUNT_USDC || 10000);
const PREMIUM_BPS = Number(process.env.PREMIUM_RATE_BPS || 500);
const MIN_WEEKS = Number(process.env.MIN_DURATION_WEEKS || 4);
const MAX_WEEKS = Number(process.env.MAX_DURATION_WEEKS || 12);
const EXPIRY_HOURS = Number(process.env.EXPIRY_HOURS || 24);

// --------------------------------------------------------------------------
// Option A: Using the SDK (recommended — 6 lines of code)
// --------------------------------------------------------------------------
async function submitWithSDK() {
    // npm install @layercover/sdk ethers
    const { LayerCoverSDK } = require('@layercover/sdk');

    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://sepolia.base.org');
    const signer = new ethers.Wallet(MANAGER_PK, provider);

    // Provide the PolicyManager address from your deployment
    const policyManagerAddress = process.env.POLICY_MANAGER_ADDRESS || '0x...';

    const sdk = new LayerCoverSDK(signer, policyManagerAddress, {
        apiBaseUrl: API_URL,
    });

    console.log('\n📦 Submitting quote via SDK...\n');

    const result = await sdk.submitQuote({
        poolId: POOL_ID,
        syndicateAddress: SYNDICATE_ADDRESS,
        coverageAmount: ethers.parseUnits(String(COVERAGE_USDC), 6),
        premiumRateBps: PREMIUM_BPS,
        minDurationWeeks: MIN_WEEKS,
        maxDurationWeeks: MAX_WEEKS,
        expiryHours: EXPIRY_HOURS,
    });

    console.log('✅ Quote submitted!');
    console.log(`   ID:       ${result.quoteId}`);
    console.log(`   Pool:     ${result.quote.poolId}`);
    console.log(`   Amount:   ${result.quote.coverageAmount}`);
    console.log(`   Rate:     ${result.quote.premiumRateBps} bps (${result.quote.premiumRateBps / 100}%)`);
    console.log(`   Expires:  ${result.quote.expiresAt}`);

    // Check exposure
    const exposure = await sdk.getSyndicateExposure(SYNDICATE_ADDRESS);
    console.log(`\n📊 Syndicate exposure: ${exposure.totalExposure} (${exposure.activeQuoteCount} active quotes)`);

    return result;
}

// --------------------------------------------------------------------------
// Option B: Using the raw REST API (no SDK dependency)
// --------------------------------------------------------------------------
async function submitWithAPI() {
    console.log('\n📦 Submitting quote via raw API...\n');

    // 1. Discover IntentMatcher address
    const configRes = await fetch(`${API_URL}/api/config?deployment=${DEPLOYMENT}`);
    const config = await configRes.json();
    const chainId = config.chainId;
    const intentMatcherAddress = config.contracts?.intentMatcher;

    if (!intentMatcherAddress) {
        throw new Error('IntentMatcher address not found in config. Check deployment name.');
    }

    console.log(`   Chain:          ${chainId}`);
    console.log(`   IntentMatcher:  ${intentMatcherAddress}`);

    // 2. Build CoverageIntent
    const coverageAmount = ethers.parseUnits(String(COVERAGE_USDC), 6);
    const intent = {
        maker: SYNDICATE_ADDRESS,
        poolId: POOL_ID,
        coverageAmount: coverageAmount.toString(),
        premiumRateBps: PREMIUM_BPS,
        minPremiumBps: 0,
        minDuration: MIN_WEEKS * 7 * 86400,
        maxDuration: MAX_WEEKS * 7 * 86400,
        nonce: Date.now().toString(),
        expiry: Math.floor(Date.now() / 1000) + EXPIRY_HOURS * 3600,
        salt: ethers.hexlify(ethers.randomBytes(32)),
        requiresUpfront: true,
        cancellationPenaltyBps: 0,
        minFillAmount: '0',
        whitelistedBuyer: ethers.ZeroAddress,
    };

    // 3. EIP-712 sign the CoverageIntent
    const signer = new ethers.Wallet(MANAGER_PK);
    const domain = {
        name: 'IntentMatcher',
        version: '1',
        chainId,
        verifyingContract: intentMatcherAddress,
    };
    const types = {
        CoverageIntent: [
            { name: 'maker', type: 'address' },
            { name: 'poolId', type: 'uint256' },
            { name: 'coverageAmount', type: 'uint256' },
            { name: 'premiumRateBps', type: 'uint256' },
            { name: 'minDuration', type: 'uint256' },
            { name: 'maxDuration', type: 'uint256' },
            { name: 'nonce', type: 'uint256' },
            { name: 'expiry', type: 'uint256' },
            { name: 'salt', type: 'uint256' },
            { name: 'requiresUpfront', type: 'bool' },
            { name: 'cancellationPenaltyBps', type: 'uint16' },
            { name: 'minFillAmount', type: 'uint256' },
            { name: 'whitelistedBuyer', type: 'address' },
        ],
    };
    const intentSignature = await signer.signTypedData(domain, types, {
        ...intent,
        coverageAmount: BigInt(intent.coverageAmount),
        nonce: BigInt(intent.nonce),
        salt: BigInt(intent.salt),
        minFillAmount: BigInt(intent.minFillAmount),
    });

    // 4. Submit to API
    const res = await fetch(`${API_URL}/api/quotes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            poolId: POOL_ID,
            deployment: DEPLOYMENT,
            syndicateAddress: SYNDICATE_ADDRESS,
            coverageAmount: intent.coverageAmount,
            premiumRateBps: PREMIUM_BPS,
            minDurationWeeks: MIN_WEEKS,
            maxDurationWeeks: MAX_WEEKS,
            coverageIntent: intent,
            intentSignature,
        }),
    });

    const result = await res.json();

    if (!result.success) {
        console.error('❌ Quote rejected:', result.error);
        if (result.currentExposure) {
            console.error(`   Current exposure:    ${result.currentExposure}`);
            console.error(`   Available capacity:  ${result.availableCapacity}`);
        }
        process.exit(1);
    }

    console.log('✅ Quote submitted!');
    console.log(`   ID:       ${result.quote.id}`);
    console.log(`   Status:   ${result.quote.status}`);

    // 5. Check exposure
    const expRes = await fetch(
        `${API_URL}/api/quotes/exposure?syndicateAddress=${SYNDICATE_ADDRESS}`
    );
    const exposure = await expRes.json();
    console.log(`\n📊 Syndicate exposure: ${exposure.totalExposure} (${exposure.activeQuoteCount} active quotes)`);

    return result;
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------
(async () => {
    // Validate required env vars
    if (!MANAGER_PK) {
        console.error('❌ Set SYNDICATE_MANAGER_PK environment variable');
        process.exit(1);
    }
    if (!SYNDICATE_ADDRESS) {
        console.error('❌ Set SYNDICATE_ADDRESS environment variable');
        process.exit(1);
    }

    console.log('═══════════════════════════════════════════════');
    console.log('  LayerCover — Programmatic Quote Submission');
    console.log('═══════════════════════════════════════════════');
    console.log(`  API:        ${API_URL}`);
    console.log(`  Deployment: ${DEPLOYMENT}`);
    console.log(`  Syndicate:  ${SYNDICATE_ADDRESS}`);
    console.log(`  Pool:       ${POOL_ID}`);
    console.log(`  Amount:     ${COVERAGE_USDC} USDC`);
    console.log(`  Rate:       ${PREMIUM_BPS} bps (${PREMIUM_BPS / 100}%)`);
    console.log(`  Duration:   ${MIN_WEEKS}-${MAX_WEEKS} weeks`);
    console.log(`  Expiry:     ${EXPIRY_HOURS} hours`);

    // Use the mode specified by env var, default to raw API (no extra deps)
    const mode = process.env.USE_SDK ? 'sdk' : 'api';

    try {
        if (mode === 'sdk') {
            await submitWithSDK();
        } else {
            await submitWithAPI();
        }
    } catch (err) {
        console.error('\n❌ Error:', err.message);
        process.exit(1);
    }
})();
