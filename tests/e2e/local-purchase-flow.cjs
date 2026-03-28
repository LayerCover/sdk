#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const process = require('node:process');
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');

const LOCALHOST_CHAIN_ID = 31337;
const DEPLOYMENT = 'localhost_usdc';
const API_BASE_URL = 'https://local.layercover.test';
const COVERAGE_AMOUNT_USDC = Number(process.env.E2E_COVERAGE_AMOUNT_USDC || 25);
const DURATION_WEEKS = Number(process.env.E2E_DURATION_WEEKS || 4);
const QUOTE_RATE_BPS = Number(process.env.E2E_QUOTE_RATE_BPS || 450);
const QUOTE_CAPACITY_USDC = Number(process.env.E2E_QUOTE_CAPACITY_USDC || 100000);

const __dirnameResolved = __dirname;
const sdkRoot = path.resolve(__dirnameResolved, '..', '..');
const repoRoot = findRepoRoot(sdkRoot);
const monorepoRoot = path.join(repoRoot, 'monorepo');
const contractsRoot = path.join(repoRoot, 'monorepo', 'packages', 'contracts');
const requireContracts = createRequire(path.join(contractsRoot, 'package.json'));
const { LayerCoverSDK } = require(path.join(sdkRoot, 'dist', 'index.js'));
let ethers;

function findRepoRoot(startDir) {
  let current = startDir;
  while (true) {
    const candidate = path.join(current, 'monorepo', 'packages', 'contracts', 'package.json');
    if (fs.existsSync(candidate)) return current;
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error('Unable to locate repository root from SDK workspace');
    }
    current = parent;
  }
}

function spawnProcess(command, args, options = {}) {
  return spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: options.stdio || 'inherit',
  });
}

function resolveHardhatBinary() {
  const candidates = [
    path.join(contractsRoot, 'node_modules', '.bin', 'hardhat'),
    path.join(monorepoRoot, 'node_modules', '.bin', 'hardhat'),
    path.join(repoRoot, 'node_modules', '.bin', 'hardhat'),
  ];

  const match = candidates.find((candidate) => fs.existsSync(candidate));
  if (!match) {
    throw new Error(`Hardhat binary not found. Checked: ${candidates.join(', ')}`);
  }
  return match;
}

function runInsideHardhat() {
  const hardhatBinary = resolveHardhatBinary();
  const scriptPath = path.relative(contractsRoot, __filename);

  return new Promise((resolve, reject) => {
    const child = spawnProcess(
      hardhatBinary,
      ['run', scriptPath, '--network', 'hardhat'],
      {
        cwd: contractsRoot,
        env: {
          ...process.env,
          LAYERCOVER_E2E_IN_HARDHAT: '1',
        },
      }
    );

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Hardhat e2e runner exited with code ${code ?? 1}`));
    });
  });
}

function parseSyndicateAddress(factory, receipt) {
  for (const log of receipt.logs) {
    try {
      const parsed = factory.interface.parseLog(log);
      if (parsed?.name === 'SyndicateCreated') {
        return parsed.args.syndicate;
      }
    } catch {
      continue;
    }
  }

  throw new Error('Failed to parse SyndicateCreated event');
}

function responseJson(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function installApiStub({ manifest, pool, quote, syncCalls }) {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    if (!url.href.startsWith(API_BASE_URL)) {
      if (typeof originalFetch === 'function') {
        return originalFetch(input, init);
      }
      throw new Error(`Unexpected fetch outside e2e API stub: ${url.href}`);
    }

    if (url.pathname === '/api/config') {
      return responseJson({
        success: true,
        deployment: DEPLOYMENT,
        chainId: LOCALHOST_CHAIN_ID,
        contracts: {
          policyManager: manifest.PolicyManager,
          policyNFT: manifest.PolicyNFT,
          intentOrderBook: manifest.PurchaseGateway,
          intentMatcher: manifest.PurchaseGateway,
          purchaseGateway: manifest.PurchaseGateway,
          quoteBookExtension: manifest.QuoteBookExtension,
          systemRegistry: manifest.SystemRegistry,
          poolRegistry: manifest.PoolRegistry,
        },
        apiBaseUrl: API_BASE_URL,
      });
    }

    if (url.pathname === '/api/pools/list') {
      return responseJson({ pools: [pool] });
    }

    if (url.pathname === '/api/quotes/batch') {
      const poolIds = String(url.searchParams.get('poolIds') || '')
        .split(',')
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value));

      return responseJson({
        quotes: Object.fromEntries(
          poolIds.map((poolId) => [poolId, poolId === quote.poolId ? [quote] : []])
        ),
      });
    }

    if (url.pathname === '/api/purchase/sync') {
      const bodyText = init?.body ? String(init.body) : '{}';
      syncCalls.push(JSON.parse(bodyText));
      return responseJson({ success: true });
    }

    return responseJson({ error: `Unhandled route ${url.pathname}` }, 404);
  };

  return () => {
    globalThis.fetch = originalFetch;
  };
}

async function deployCoreV1() {
  const envKeys = [
    'DEPLOY_MODE',
    'DEPLOY_PROFILE',
    'INSTANCE',
    'ENABLE_REINSURANCE_MODULES',
    'ENABLE_SHARED_ASSET_CONTROLLER',
    'ENABLE_ORACLE_INFRASTRUCTURE',
    'ENABLE_ECOSYSTEM_OPTIMISTIC_MARKETS',
  ];
  const envSnapshot = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

  process.env.DEPLOY_MODE = 'fresh';
  process.env.DEPLOY_PROFILE = 'core-v1';
  process.env.INSTANCE = 'usdc';
  delete process.env.ENABLE_REINSURANCE_MODULES;
  delete process.env.ENABLE_SHARED_ASSET_CONTROLLER;
  delete process.env.ENABLE_ORACLE_INFRASTRUCTURE;
  delete process.env.ENABLE_ECOSYSTEM_OPTIMISTIC_MARKETS;

  const { loadConfig } = require(path.join(contractsRoot, 'scripts', 'deployment', 'config-loader.js'));
  const { deployCore } = require(path.join(contractsRoot, 'scripts', 'deployment', 'stages', '01_core.js'));
  const { configureCore } = require(path.join(contractsRoot, 'scripts', 'deployment', 'stages', '02_configure_core.js'));
  const { deployFactories } = require(path.join(contractsRoot, 'scripts', 'deployment', 'stages', '03_factories.js'));
  const { deployGovernance } = require(path.join(contractsRoot, 'scripts', 'deployment', 'stages', '04_governance.js'));
  const { configureMarkets } = require(path.join(contractsRoot, 'scripts', 'deployment', 'stages', '05_markets.js'));

  const [deployer] = await ethers.getSigners();
  const config = loadConfig();
  config.RESOLVED_DEPLOY_PROFILE = config.RESOLVED_DEPLOY_PROFILE || config.DEPLOY_PROFILE;
  assert.equal(config.DEPLOY_PROFILE, 'core-v1', 'Expected core-v1 deployment profile for e2e harness');
  let state = {};

  try {
    state = await deployCore(deployer, config, state);
    state = await configureCore(deployer, config, state);
    state = await deployFactories(deployer, config, state);
    state = await deployGovernance(deployer, config, state);
    state = await configureMarkets(deployer, config, state);
  } finally {
    for (const key of envKeys) {
      if (envSnapshot[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = envSnapshot[key];
      }
    }
  }

  return { config, state };
}

async function seedExecutableQuote({ state, config }) {
  const [deployer, buyer] = await ethers.getSigners();
  const underwritingAsset = state.UnderwritingAsset;
  assert(underwritingAsset, 'Expected a mock underwriting asset for hardhat e2e');

  const tokenDecimals = config.TOKEN_DECIMALS ?? 6;
  const coverageAmount = ethers.parseUnits(String(COVERAGE_AMOUNT_USDC), tokenDecimals);
  const quoteCapacity = ethers.parseUnits(String(QUOTE_CAPACITY_USDC), tokenDecimals);
  const deployerCapital = ethers.parseUnits('500000', tokenDecimals);
  const buyerBalance = ethers.parseUnits('25000', tokenDecimals);
  const targetPoolId = 0;

  await (await underwritingAsset.mint(deployer.address, deployerCapital)).wait();
  await (await underwritingAsset.mint(buyer.address, buyerBalance)).wait();

  const createSyndicateTx = await state.SyndicateFactory.createSyndicate(
    underwritingAsset.target,
    deployer.address,
    deployer.address,
    100,
    'SDK E2E Syndicate',
    'SDKE2E'
  );
  const createSyndicateReceipt = await createSyndicateTx.wait();
  const syndicateAddress = parseSyndicateAddress(state.SyndicateFactory, createSyndicateReceipt);
  const syndicate = await ethers.getContractAt('Syndicate', syndicateAddress, deployer);

  try {
    await (
      await syndicate.configureVault({
        strategyConfig: { minDepositDuration: 0, performanceFeeBps: 100 },
        depositCap: 0,
        idleYieldThreshold: 0,
      })
    ).wait();
  } catch {
    const legacySyndicate = new ethers.Contract(
      syndicateAddress,
      [
        'function configureVault((tuple(uint32 minDepositDuration,uint16 performanceFeeBps) strategyConfig,uint256 depositCap,uint256 idleYieldThreshold,uint8 defaultYieldPlatform) config) external',
      ],
      deployer
    );
    await (
      await legacySyndicate.configureVault({
        strategyConfig: { minDepositDuration: 0, performanceFeeBps: 100 },
        depositCap: 0,
        idleYieldThreshold: 0,
        defaultYieldPlatform: 1,
      })
    ).wait();
  }

  await (await syndicate.setDepositLockPreference(90 * 24 * 60 * 60)).wait();
  await (await underwritingAsset.approve(syndicateAddress, deployerCapital)).wait();
  await (await syndicate.deposit(deployerCapital, deployer.address)).wait();

  const availableDurationShares = await syndicate.availableSharesForExactDuration(28 * 24 * 60 * 60);
  assert(availableDurationShares > 0n, 'Expected seeded syndicate duration capacity');

  await (await syndicate.allocate(targetPoolId, quoteCapacity)).wait();

  const nextQuoteId = await state.QuoteBookExtension.nextQuoteId();
  const expiry = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
  const minFillAmount = ethers.parseUnits('10', tokenDecimals);

  await (
    await state.QuoteBookExtension.createQuote({
      underwriter: syndicateAddress,
      poolId: targetPoolId,
      coverageAmount: quoteCapacity,
      premiumRateBps: QUOTE_RATE_BPS,
      minDuration: 7 * 24 * 60 * 60,
      maxDuration: 12 * 7 * 24 * 60 * 60,
      minFillAmount,
      expiry,
      requiresUpfront: true,
    })
  ).wait();

  return {
    buyer,
    targetPoolId,
    underwritingAsset,
    coverageAmount,
    quoteCapacity,
    quoteId: nextQuoteId,
    syndicateAddress,
    apiQuote: {
      id: `localhost-quote-${nextQuoteId.toString()}`,
      poolId: targetPoolId,
      deployment: DEPLOYMENT,
      syndicateAddress,
      syndicateName: 'SDK E2E Syndicate',
      coverageAmount: quoteCapacity.toString(),
      premiumRateBps: QUOTE_RATE_BPS,
      minDurationWeeks: 1,
      maxDurationWeeks: 12,
      expiresAt: new Date(expiry * 1000).toISOString(),
      status: 'active',
      requiresUpfront: true,
      metadata: {
        quoteBookQuoteId: nextQuoteId.toString(),
        quoteBookExtension: state.QuoteBookExtension.target,
        quoteSource: 'quotebook',
        minFillAmount: minFillAmount.toString(),
      },
    },
  };
}

async function wireQuoteBookIntentMatcher(state) {
  const intentMatcherId = ethers.keccak256(ethers.toUtf8Bytes('INTENT_MATCHER'));
  await (
    await state.ProtocolConfigurator.setSystemContract(intentMatcherId, state.QuoteBookExtension.target)
  ).wait();
  const configured = await state.SystemRegistry.getSystemContract(intentMatcherId);
  assert.equal(
    configured.toLowerCase(),
    state.QuoteBookExtension.target.toLowerCase(),
    'Expected INTENT_MATCHER to point at QuoteBookExtension for direct-purchase e2e'
  );
}

async function executeHarness() {
  const { config, state } = await deployCoreV1();
  const poolCount = Number(await state.PoolRegistry.getPoolCount());
  assert(poolCount > 0, 'Expected at least one configured pool on hardhat');

  await wireQuoteBookIntentMatcher(state);
  const seeded = await seedExecutableQuote({ state, config });
  const syncCalls = [];
  const events = [];
  const restoreFetch = installApiStub({
    manifest: {
      PolicyManager: state.PolicyManager.target,
      PolicyNFT: state.PolicyNFT.target,
      PurchaseGateway: state.PurchaseGateway.target,
      QuoteBookExtension: state.QuoteBookExtension.target,
      SystemRegistry: state.SystemRegistry.target,
      PoolRegistry: state.PoolRegistry.target,
    },
    pool: {
      poolId: seeded.targetPoolId,
      id: seeded.targetPoolId,
      poolName: 'USDC Prime',
      label: 'USDC Prime',
      category: 'vault_cover',
      type: 'vault',
      riskRating: 'AAA',
      availableCoverage: seeded.quoteCapacity.toString(),
      totalCoverageSold: '0',
      tokenAddress: seeded.underwritingAsset.target,
      underlyingTokenAddress: seeded.underwritingAsset.target,
      underlyingTokenSymbol: config.TOKEN_SYMBOL || 'USDC',
      protocolTokenDecimals: config.TOKEN_DECIMALS ?? 6,
      underlyingAssetDecimals: config.TOKEN_DECIMALS ?? 6,
      isOptimisticOracle: false,
      deployment: DEPLOYMENT,
    },
    quote: seeded.apiQuote,
    syncCalls,
  });

  try {
    const sdk = await LayerCoverSDK.create(seeded.buyer, {
      apiBaseUrl: API_BASE_URL,
      chainId: LOCALHOST_CHAIN_ID,
      deployment: DEPLOYMENT,
      txConfirmations: 1,
      txWaitTimeoutMs: 120000,
      requestTimeoutMs: 5000,
      maxRetries: 0,
      onEvent: (event) => events.push(event),
    });

    const pools = await sdk.listPools();
    assert.equal(pools.length, 1, 'Expected a single stubbed pool');
    assert.equal(pools[0].poolId, seeded.targetPoolId);

    const preparation = await sdk.preparePurchase(seeded.targetPoolId, seeded.coverageAmount, DURATION_WEEKS);
    assert.equal(preparation.status, 'approval_required');
    assert(preparation.quote, 'Expected preparePurchase() to return a quote');

    const result = await sdk.purchaseQuote(preparation.quote, seeded.coverageAmount, DURATION_WEEKS);
    assert(result.policyId, 'Expected a policyId from purchaseQuote()');

    const policy = await sdk.getPolicyDetails(Number(result.policyId));
    const onChainQuote = await state.QuoteBookExtension.getQuote(seeded.quoteId);

    assert.equal(policy.poolId, seeded.targetPoolId);
    assert.equal(policy.coverage, seeded.coverageAmount.toString());
    assert.equal(policy.owner.toLowerCase(), seeded.buyer.address.toLowerCase());
    assert.equal(policy.fixedRateBps, QUOTE_RATE_BPS);
    assert.equal(policy.underwriter.toLowerCase(), seeded.syndicateAddress.toLowerCase());
    assert.equal(
      onChainQuote.remainingCoverage.toString(),
      (seeded.quoteCapacity - seeded.coverageAmount).toString()
    );
    assert.equal(syncCalls.length, 1, 'Expected purchase sync to be called exactly once');
    assert.equal(syncCalls[0].quoteId, seeded.apiQuote.id);
    assert.equal(syncCalls[0].policyId, result.policyId);

    const eventTypes = events.map((event) => event.type);
    assert(eventTypes.includes('purchase_prepared'), 'Expected purchase_prepared event');
    assert(eventTypes.includes('approval_submitted'), 'Expected approval_submitted event');
    assert(eventTypes.includes('purchase_confirmed'), 'Expected purchase_confirmed event');
    assert(eventTypes.includes('purchase_sync_succeeded'), 'Expected purchase_sync_succeeded event');

    process.stdout.write(
      `${JSON.stringify({
        success: true,
        deployment: DEPLOYMENT,
        chainId: LOCALHOST_CHAIN_ID,
        poolId: seeded.targetPoolId,
        quoteId: seeded.quoteId.toString(),
        policyId: result.policyId,
        txHash: result.txHash,
        buyer: seeded.buyer.address,
        underwriter: seeded.syndicateAddress,
        remainingCoverage: onChainQuote.remainingCoverage.toString(),
        syncCalls: syncCalls.length,
      }, null, 2)}\n`
    );
  } finally {
    restoreFetch();
  }
}

async function main() {
  if (process.env.LAYERCOVER_E2E_IN_HARDHAT !== '1') {
    await runInsideHardhat();
    return;
  }

  ({ ethers } = requireContracts('hardhat'));
  await executeHarness();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
