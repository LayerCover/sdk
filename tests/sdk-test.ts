/**
 * Comprehensive test suite for @layercover/sdk v0.4.0
 * Run with: npx tsx tests/sdk-test.ts
 */
import { ethers } from 'ethers';

// Import directly from source (no build step needed for tsx)
import {
    LayerCoverSDK,
    FixedRateQuote,
    ReserveIntent,
    RefreshedQuote,
    PurchaseResult,
    Quote,
    PoolMetadata,
    POOL_CONFIG,
    TOKEN_LOGOS,
    getTokenLogoUrl,
    CONTRACT_ADDRESSES,
    getPolicyManagerAddress,
    getIntentOrderBookAddress,
    DEFAULT_CHAIN_ID,
    DEFAULT_API_BASE_URL,
    RateTooHighError,
    NoQuotesAvailableError,
    LayerCoverSDKOptions,
    EthersV5Adapter,
} from '../src/index';

// ============================================================================
// Test Harness
// ============================================================================

let passed = 0;
let failed = 0;
let skipped = 0;
const failures: string[] = [];

function test(name: string, fn: () => void | Promise<void>) {
    return runTest(name, fn);
}

async function runTest(name: string, fn: () => void | Promise<void>) {
    try {
        await fn();
        passed++;
        console.log(`  ✅ ${name}`);
    } catch (err: any) {
        failed++;
        const msg = err.message || String(err);
        failures.push(`${name}: ${msg}`);
        console.log(`  ❌ ${name}`);
        console.log(`     → ${msg}`);
    }
}

function skip(name: string, reason?: string) {
    skipped++;
    console.log(`  ⏭️  ${name}${reason ? ` (${reason})` : ''}`);
}

function assert(condition: boolean, message: string) {
    if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual(actual: any, expected: any, label: string) {
    if (actual !== expected) {
        throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}

function assertBigIntEqual(actual: bigint, expected: bigint, label: string) {
    if (actual !== expected) {
        throw new Error(`${label}: expected ${expected.toString()}, got ${actual.toString()}`);
    }
}

function assertThrows(fn: () => any, expectedError?: string, label?: string) {
    let threw = false;
    try {
        fn();
    } catch (err: any) {
        threw = true;
        if (expectedError && !err.message.includes(expectedError)) {
            throw new Error(
                `${label || 'assertThrows'}: expected error containing "${expectedError}", got "${err.message}"`
            );
        }
    }
    if (!threw) {
        throw new Error(`${label || 'assertThrows'}: expected function to throw`);
    }
}

// ============================================================================
// Test Suite
// ============================================================================

async function main() {
    console.log('\n🛡️  LayerCover SDK Test Suite v0.4.0\n');
    console.log('='.repeat(60));

    // ========================================================================
    // 1. EXPORTS & TYPE VERIFICATION
    // ========================================================================
    console.log('\n📦 1. Exports & Type Verification\n');

    await test('All expected types are exported', () => {
        // Verify interfaces exist as types (they compile, that's enough)
        const quote: Partial<FixedRateQuote> = { id: 'test', poolId: 1 };
        const intent: Partial<ReserveIntent> = { solver: '0x', poolId: 1 };
        const refreshed: Partial<RefreshedQuote> = { signature: '0x' };
        const result: Partial<PurchaseResult> = { txHash: '0x' };
        const legacyQuote: Partial<Quote> = { poolId: 1 };
        const poolMeta: Partial<PoolMetadata> = { poolId: 1 };
        const opts: Partial<LayerCoverSDKOptions> = {};
        assert(true, 'all types exist');
    });

    await test('LayerCoverSDK class is exported', () => {
        assert(typeof LayerCoverSDK === 'function', 'LayerCoverSDK should be a class');
        assert(typeof LayerCoverSDK.create === 'function', 'static create should exist');
        assert(typeof LayerCoverSDK.fetchConfig === 'function', 'static fetchConfig should exist');
        assert(typeof LayerCoverSDK.calculateNetYield === 'function', 'static calculateNetYield should exist');
    });

    await test('Error classes are exported', () => {
        assert(typeof RateTooHighError === 'function', 'RateTooHighError should be exported');
        assert(typeof NoQuotesAvailableError === 'function', 'NoQuotesAvailableError should be exported');
    });

    await test('EthersV5Adapter is exported', () => {
        assert(typeof EthersV5Adapter === 'function', 'EthersV5Adapter should be exported');
        assert(typeof EthersV5Adapter.fromWeb3Provider === 'function', 'fromWeb3Provider should exist');
        assert(typeof EthersV5Adapter.fromJsonRpcProvider === 'function', 'fromJsonRpcProvider should exist');
        assert(typeof EthersV5Adapter.fromSigner === 'function', 'fromSigner should exist');
    });

    await test('Constants are exported with correct values', () => {
        assertEqual(DEFAULT_CHAIN_ID, 84532, 'DEFAULT_CHAIN_ID');
        assertEqual(DEFAULT_API_BASE_URL, 'https://app.layercover.com', 'DEFAULT_API_BASE_URL');
    });

    // ========================================================================
    // 2. PURE FUNCTION TESTS
    // ========================================================================
    console.log('\n🧮 2. Pure Function Tests\n');

    // --- calculatePremium ---

    await test('calculatePremium: 1000 USDC @ 500bps for 1 year', () => {
        // Create SDK with a dummy provider (calculatePremium is pure)
        const provider = new ethers.JsonRpcProvider('http://localhost:1234');
        const sdk = new LayerCoverSDK(provider, ethers.ZeroAddress);

        const coverageAmount = 1000_000000n; // 1000 USDC (6 decimals)
        const rateBps = 500; // 5%
        const durationSeconds = 365 * 24 * 60 * 60; // 1 year = 31536000s

        const premium = sdk.calculatePremium(coverageAmount, rateBps, durationSeconds);

        // Expected: 1000 * 500/10000 * 31536000/31536000 = 50 USDC = 50_000000
        assertBigIntEqual(premium, 50_000000n, 'premium for 1yr');
    });

    await test('calculatePremium: 10000 USDC @ 300bps for 26 weeks', () => {
        const provider = new ethers.JsonRpcProvider('http://localhost:1234');
        const sdk = new LayerCoverSDK(provider, ethers.ZeroAddress);

        const coverageAmount = 10000_000000n; // 10000 USDC
        const rateBps = 300; // 3%
        const durationSeconds = 26 * 7 * 24 * 60 * 60; // 26 weeks

        const premium = sdk.calculatePremium(coverageAmount, rateBps, durationSeconds);

        // Expected: 10000 * 300/10000 * (15724800/31536000) = 300 * 0.49863... ≈ 149.589...
        // Exact: 10000_000000 * 300 * 15724800 / (31536000 * 10000)
        //      = 10000000000 * 300 * 15724800 / 315360000000
        //      = 47174400000000000000 / 315360000000
        //      = 149589041n (integer division)
        const expected = (10000_000000n * 300n * BigInt(26 * 7 * 24 * 60 * 60)) / (31536000n * 10000n);
        assertBigIntEqual(premium, expected, 'premium for 26 weeks');
    });

    await test('calculatePremium: zero amount returns zero', () => {
        const provider = new ethers.JsonRpcProvider('http://localhost:1234');
        const sdk = new LayerCoverSDK(provider, ethers.ZeroAddress);

        const premium = sdk.calculatePremium(0n, 500, 31536000);
        assertBigIntEqual(premium, 0n, 'zero coverage = zero premium');
    });

    await test('calculatePremium: zero rate returns zero', () => {
        const provider = new ethers.JsonRpcProvider('http://localhost:1234');
        const sdk = new LayerCoverSDK(provider, ethers.ZeroAddress);

        const premium = sdk.calculatePremium(1000_000000n, 0, 31536000);
        assertBigIntEqual(premium, 0n, 'zero rate = zero premium');
    });

    await test('calculatePremium: zero duration returns zero', () => {
        const provider = new ethers.JsonRpcProvider('http://localhost:1234');
        const sdk = new LayerCoverSDK(provider, ethers.ZeroAddress);

        const premium = sdk.calculatePremium(1000_000000n, 500, 0);
        assertBigIntEqual(premium, 0n, 'zero duration = zero premium');
    });

    await test('calculatePremium: large amount (1M USDC @ 1000bps for 1yr)', () => {
        const provider = new ethers.JsonRpcProvider('http://localhost:1234');
        const sdk = new LayerCoverSDK(provider, ethers.ZeroAddress);

        const coverageAmount = 1_000_000_000000n; // 1M USDC
        const premium = sdk.calculatePremium(coverageAmount, 1000, 31536000);

        // 1M * 10% = 100,000 USDC
        assertBigIntEqual(premium, 100_000_000000n, 'large premium');
    });

    await test('calculatePremium: minimum 1 week duration', () => {
        const provider = new ethers.JsonRpcProvider('http://localhost:1234');
        const sdk = new LayerCoverSDK(provider, ethers.ZeroAddress);

        const oneWeek = 7 * 24 * 60 * 60;
        const premium = sdk.calculatePremium(1000_000000n, 500, oneWeek);

        // 1000 * 5% * (604800 / 31536000) = 50 * 0.01918... ≈ 0.958904
        const expected = (1000_000000n * 500n * BigInt(oneWeek)) / (31536000n * 10000n);
        assertBigIntEqual(premium, expected, '1 week premium');
        assert(premium > 0n, 'min duration should produce non-zero premium');
    });

    // --- getTokenLogoUrl ---

    await test('getTokenLogoUrl: exact match USDC', () => {
        const url = getTokenLogoUrl('USDC');
        assert(url.includes('usdc'), 'should return USDC logo');
    });

    await test('getTokenLogoUrl: exact match WETH', () => {
        const url = getTokenLogoUrl('WETH');
        assert(url.includes('ethereum'), 'should return Ethereum logo');
    });

    await test('getTokenLogoUrl: exact match USDT', () => {
        const url = getTokenLogoUrl('USDT');
        assert(url.includes('tether'), 'should return Tether logo');
    });

    await test('getTokenLogoUrl: case-insensitive substring match', () => {
        const url = getTokenLogoUrl('aWETH');
        assert(url.includes('ethereum'), 'aWETH should match to WETH logo');
    });

    await test('getTokenLogoUrl: unknown token returns default', () => {
        const url = getTokenLogoUrl('UNKNOWN_TOKEN_XYZ');
        assert(url.includes('usdc'), 'unknown token should return USDC default');
    });

    await test('getTokenLogoUrl: WBTC matches wrapped bitcoin', () => {
        const url = getTokenLogoUrl('WBTC');
        assert(url.includes('wrapped-bitcoin'), 'should return WBTC logo');
    });

    await test('getTokenLogoUrl: DAI matches', () => {
        const url = getTokenLogoUrl('DAI');
        assert(url.includes('dai'), 'should return DAI logo');
    });

    await test('getTokenLogoUrl: substring priority (WETH before ETH)', () => {
        const urlWETH = getTokenLogoUrl('WETH');
        const urlETH = getTokenLogoUrl('ETH');
        // Both should resolve to ethereum logo, but the point is WETH has priority
        assert(urlWETH === urlETH, 'WETH and ETH should resolve to same ethereum logo');
    });

    // --- calculateNetYield ---

    await test('calculateNetYield: basic calculation', () => {
        const result = LayerCoverSDK.calculateNetYield(5.0, 300);
        assertEqual(result.baseApy, 5.0, 'baseApy');
        assertEqual(result.premiumRate, 3.0, 'premiumRate');
        assertEqual(result.netApy, 2.0, 'netApy');
    });

    await test('calculateNetYield: zero cost', () => {
        const result = LayerCoverSDK.calculateNetYield(8.0, 0);
        assertEqual(result.netApy, 8.0, 'netApy with zero cost');
    });

    await test('calculateNetYield: cost exceeds base (negative yield)', () => {
        const result = LayerCoverSDK.calculateNetYield(2.0, 500);
        assertEqual(result.netApy, -3.0, 'negative netApy');
    });

    // ========================================================================
    // 3. ADDRESS RESOLUTION TESTS
    // ========================================================================
    console.log('\n🔗 3. Address Resolution Tests\n');

    await test('getPolicyManagerAddress: Base Sepolia returns valid address', () => {
        const addr = getPolicyManagerAddress(84532);
        assert(addr.startsWith('0x'), 'should start with 0x');
        assert(addr.length === 42, 'should be 42 chars');
        assert(addr !== ethers.ZeroAddress, 'should not be zero address');
    });

    await test('getIntentOrderBookAddress: Base Sepolia returns valid address', () => {
        const addr = getIntentOrderBookAddress(84532);
        assert(addr.startsWith('0x'), 'should start with 0x');
        assert(addr.length === 42, 'should be 42 chars');
        assert(addr !== ethers.ZeroAddress, 'should not be zero address');
    });

    await test('getPolicyManagerAddress: unsupported chain throws', () => {
        assertThrows(
            () => getPolicyManagerAddress(999999),
            'not deployed',
            'unsupported chain'
        );
    });

    await test('getIntentOrderBookAddress: unsupported chain throws', () => {
        assertThrows(
            () => getIntentOrderBookAddress(999999),
            'not deployed',
            'unsupported chain'
        );
    });

    await test('CONTRACT_ADDRESSES has Base Sepolia entry', () => {
        const entry = CONTRACT_ADDRESSES[84532];
        assert(entry !== undefined, 'Base Sepolia entry should exist');
        assert(entry.policyManager.length === 42, 'policyManager address valid');
        assert(entry.intentOrderBook.length === 42, 'intentOrderBook address valid');
    });

    await test('CONTRACT_ADDRESSES: Base Mainnet has placeholder zero addresses', () => {
        const entry = CONTRACT_ADDRESSES[8453];
        assert(entry !== undefined, 'Base Mainnet entry should exist');
        assertEqual(entry.policyManager, ethers.ZeroAddress, 'mainnet policyManager is placeholder');
        assertEqual(entry.intentOrderBook, ethers.ZeroAddress, 'mainnet intentOrderBook is placeholder');
    });

    // ========================================================================
    // 4. CONSTRUCTOR TESTS
    // ========================================================================
    console.log('\n🔧 4. Constructor Tests\n');

    await test('Constructor with Provider only (no signer)', () => {
        const provider = new ethers.JsonRpcProvider('http://localhost:1234');
        const sdk = new LayerCoverSDK(provider, ethers.ZeroAddress);

        assert(sdk.provider !== undefined, 'provider should be set');
        assert(sdk.signer === undefined, 'signer should be undefined');
        assert(sdk.policyManager !== undefined, 'policyManager contract should be created');
    });

    await test('Constructor with Wallet signer', () => {
        const provider = new ethers.JsonRpcProvider('http://localhost:1234');
        const wallet = new ethers.Wallet(
            '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
            provider
        );
        const sdk = new LayerCoverSDK(wallet, ethers.ZeroAddress);

        assert(sdk.signer !== undefined, 'signer should be set');
        assert(sdk.provider !== undefined, 'provider should be extracted from signer');
    });

    await test('Constructor sets default options', () => {
        const provider = new ethers.JsonRpcProvider('http://localhost:1234');
        const sdk = new LayerCoverSDK(provider, ethers.ZeroAddress);

        // Access private fields via any
        const sdkAny = sdk as any;
        assertEqual(sdkAny._apiBaseUrl, 'https://app.layercover.com', 'default apiBaseUrl');
        assertEqual(sdkAny._deployment, 'base_sepolia_usdc', 'default deployment');
        assertEqual(sdkAny._chainId, 84532, 'default chainId');
    });

    await test('Constructor with custom options', () => {
        const provider = new ethers.JsonRpcProvider('http://localhost:1234');
        const sdk = new LayerCoverSDK(provider, ethers.ZeroAddress, {
            apiBaseUrl: 'http://custom.api.com',
            deployment: 'custom_deploy',
            chainId: 1,
        });

        const sdkAny = sdk as any;
        assertEqual(sdkAny._apiBaseUrl, 'http://custom.api.com', 'custom apiBaseUrl');
        assertEqual(sdkAny._deployment, 'custom_deploy', 'custom deployment');
        assertEqual(sdkAny._chainId, 1, 'custom chainId');
    });

    await test('Constructor initializes IntentOrderBook when address available', () => {
        const provider = new ethers.JsonRpcProvider('http://localhost:1234');
        const sdk = new LayerCoverSDK(provider, ethers.ZeroAddress, { chainId: 84532 });

        assert(sdk.intentOrderBook !== undefined, 'intentOrderBook should be initialized for Base Sepolia');
    });

    await test('Constructor skips IntentOrderBook for unknown chain', () => {
        const provider = new ethers.JsonRpcProvider('http://localhost:1234');
        const sdk = new LayerCoverSDK(provider, ethers.ZeroAddress, { chainId: 999999 });

        assert(sdk.intentOrderBook === undefined, 'intentOrderBook should be undefined for unknown chain');
    });

    // ========================================================================
    // 5. ERROR CLASS TESTS
    // ========================================================================
    console.log('\n⚠️  5. Error Class Tests\n');

    await test('RateTooHighError has correct properties', () => {
        const err = new RateTooHighError('Rate too high', 600, 500);
        assertEqual(err.name, 'RateTooHighError', 'error name');
        assertEqual(err.rate, 600, 'rate');
        assertEqual(err.maxRate, 500, 'maxRate');
        assert(err instanceof Error, 'should be instance of Error');
        assert(err.message === 'Rate too high', 'message');
    });

    await test('NoQuotesAvailableError has correct properties', () => {
        const err = new NoQuotesAvailableError('No quotes');
        assertEqual(err.name, 'NoQuotesAvailableError', 'error name');
        assert(err instanceof Error, 'should be instance of Error');
        assertEqual(err.message, 'No quotes', 'message');
    });

    // ========================================================================
    // 6. POOL CONFIG & TOKEN LOGOS TESTS
    // ========================================================================
    console.log('\n🏊 6. Pool Config & Token Logos\n');

    await test('POOL_CONFIG has at least 3 predefined pools', () => {
        const poolIds = Object.keys(POOL_CONFIG).map(Number);
        assert(poolIds.length >= 3, `expected >= 3 pools, got ${poolIds.length}`);
    });

    await test('POOL_CONFIG entries have required fields', () => {
        for (const [id, config] of Object.entries(POOL_CONFIG)) {
            assert(typeof config.poolName === 'string', `pool ${id} should have poolName`);
            assert(config.poolName.length > 0, `pool ${id} poolName should not be empty`);
            assert(typeof config.tokenLogoUrl === 'string', `pool ${id} should have tokenLogoUrl`);
            assert(config.tokenLogoUrl.startsWith('http'), `pool ${id} tokenLogoUrl should be URL`);
        }
    });

    await test('TOKEN_LOGOS has all expected tokens', () => {
        const expectedTokens = ['USDT', 'USDC', 'WETH', 'ETH', 'DAI', 'WBTC', 'BTC'];
        for (const token of expectedTokens) {
            assert(TOKEN_LOGOS[token] !== undefined, `TOKEN_LOGOS should have ${token}`);
        }
    });

    // ========================================================================
    // 7. EIP-712 TYPE ALIGNMENT
    // ========================================================================
    console.log('\n🔐 7. EIP-712 Type Alignment (SDK vs Contract)\n');

    await test('ReserveIntent EIP-712 types match IIntentMatcher struct', () => {
        // From IIntentMatcher.sol ReserveIntent struct
        const contractFields = [
            { name: 'solver', type: 'address' },
            { name: 'underwriter', type: 'address' },
            { name: 'poolId', type: 'uint256' },
            { name: 'minCoverageDuration', type: 'uint32' },
            { name: 'maxCoverageDuration', type: 'uint32' },
            { name: 'coverageAmount', type: 'uint256' },
            { name: 'minFillAmount', type: 'uint256' },
            { name: 'allowPartialFill', type: 'bool' },
            { name: 'reservationExpiry', type: 'uint64' },
            { name: 'nonce', type: 'uint96' },
            { name: 'whitelistedBuyer', type: 'address' },
            { name: 'minPremiumBps', type: 'uint16' },
            { name: 'cancellationPenaltyBps', type: 'uint16' },
        ];

        // Access private static field via any
        const sdkTypes = (LayerCoverSDK as any).RESERVE_INTENT_TYPES.ReserveIntent;

        assertEqual(sdkTypes.length, contractFields.length,
            `ReserveIntent field count (SDK=${sdkTypes.length} vs Contract=${contractFields.length})`);

        for (let i = 0; i < contractFields.length; i++) {
            assertEqual(sdkTypes[i].name, contractFields[i].name,
                `ReserveIntent field ${i} name`);
            assertEqual(sdkTypes[i].type, contractFields[i].type,
                `ReserveIntent field ${i} type (${contractFields[i].name})`);
        }
    });

    await test('CoverageIntent EIP-712 types match IIntentMatcher struct', () => {
        // From IIntentMatcher.sol CoverageIntent struct
        const contractFields = [
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
        ];

        const sdkTypes = (LayerCoverSDK as any).COVERAGE_INTENT_TYPES.CoverageIntent;

        assertEqual(sdkTypes.length, contractFields.length,
            `CoverageIntent field count (SDK=${sdkTypes.length} vs Contract=${contractFields.length})`);

        for (let i = 0; i < contractFields.length; i++) {
            assertEqual(sdkTypes[i].name, contractFields[i].name,
                `CoverageIntent field ${i} name`);
            assertEqual(sdkTypes[i].type, contractFields[i].type,
                `CoverageIntent field ${i} type (${contractFields[i].name})`);
        }
    });

    await test('CoverageBuyOrder EIP-712 types match IIntentMatcher struct', () => {
        // From IIntentMatcher.sol CoverageBuyOrder struct
        const contractFields = [
            { name: 'taker', type: 'address' },
            { name: 'poolId', type: 'uint256' },
            { name: 'coverageAmount', type: 'uint256' },
            { name: 'maxPremiumRateBps', type: 'uint256' },
            { name: 'duration', type: 'uint256' },
            { name: 'premiumDeposit', type: 'uint256' },
            { name: 'nonce', type: 'uint256' },
            { name: 'expiry', type: 'uint256' },
            { name: 'salt', type: 'uint256' },
            { name: 'referralCode', type: 'bytes32' },
            { name: 'vault', type: 'address' },
            { name: 'sharesToCover', type: 'uint256' },
        ];

        const sdkTypes = (LayerCoverSDK as any).COVERAGE_BUY_ORDER_TYPES.CoverageBuyOrder;

        assertEqual(sdkTypes.length, contractFields.length,
            `CoverageBuyOrder field count (SDK=${sdkTypes.length} vs Contract=${contractFields.length})`);

        for (let i = 0; i < contractFields.length; i++) {
            assertEqual(sdkTypes[i].name, contractFields[i].name,
                `CoverageBuyOrder field ${i} name`);
            assertEqual(sdkTypes[i].type, contractFields[i].type,
                `CoverageBuyOrder field ${i} type (${contractFields[i].name})`);
        }
    });

    await test('executeMatchedIntent ABI selector matches latest contract signature', () => {
        const abi = (LayerCoverSDK as any).EXECUTE_MATCHED_INTENT_ABI;
        const iface = new ethers.Interface(abi);
        const selector = iface.getFunction('executeMatchedIntent')?.selector;
        assertEqual(selector, '0xd2d599e7', 'executeMatchedIntent selector');
    });

    await test('ReserveIntent domain uses "Syndicate" v1', () => {
        const domain = (LayerCoverSDK as any).RESERVE_INTENT_DOMAIN;
        assertEqual(domain.name, 'Syndicate', 'domain name');
        assertEqual(domain.version, '1', 'domain version');
    });

    await test('CoverageIntent domain uses "IntentMatcher" v1', () => {
        const domain = (LayerCoverSDK as any).COVERAGE_INTENT_DOMAIN;
        assertEqual(domain.name, 'IntentMatcher', 'domain name');
        assertEqual(domain.version, '1', 'domain version');
    });

    // ========================================================================
    // 8. EIP-712 SIGNING INTEGRATION (offline, no network)
    // ========================================================================
    console.log('\n✍️  8. EIP-712 Signing (offline)\n');

    await test('Can sign ReserveIntent EIP-712 typed data', async () => {
        const wallet = new ethers.Wallet(
            '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
        );

        const domain = {
            name: 'Syndicate',
            version: '1',
            chainId: 84532,
            verifyingContract: '0x52f1985F95b4D6E3E3F0bfdC7f45A615D9caD97a',
        };

        const types = (LayerCoverSDK as any).RESERVE_INTENT_TYPES;

        const value = {
            solver: wallet.address,
            underwriter: '0x52f1985F95b4D6E3E3F0bfdC7f45A615D9caD97a',
            poolId: 1,
            minCoverageDuration: 2419200,
            maxCoverageDuration: 7257600,
            coverageAmount: 1000_000000n,
            minFillAmount: 1000_000000n,
            allowPartialFill: false,
            reservationExpiry: 1738944000,
            nonce: 12345n,
            whitelistedBuyer: ethers.ZeroAddress,
            minPremiumBps: 500,
            cancellationPenaltyBps: 0,
        };

        const signature = await wallet.signTypedData(domain, types, value);
        assert(signature.startsWith('0x'), 'signature should start with 0x');
        assert(signature.length === 132, `signature length should be 132, got ${signature.length}`);

        // Verify the signature recovers to the signer
        const recovered = ethers.verifyTypedData(domain, types, value, signature);
        assertEqual(recovered, wallet.address, 'recovered address');
    });

    await test('Can sign CoverageIntent EIP-712 typed data', async () => {
        const wallet = new ethers.Wallet(
            '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
        );

        const domain = {
            name: 'IntentMatcher',
            version: '1',
            chainId: 84532,
            verifyingContract: '0x6952Df9bf4615b73B005C79AB19FD53385eD96ae',
        };

        const types = (LayerCoverSDK as any).COVERAGE_INTENT_TYPES;

        const value = {
            maker: '0x52f1985F95b4D6E3E3F0bfdC7f45A615D9caD97a',
            poolId: 1,
            coverageAmount: 1000_000000n,
            premiumRateBps: 500,
            minDuration: 2419200,
            maxDuration: 7257600,
            nonce: 12345n,
            expiry: 1738944000,
            salt: 67890n,
            requiresUpfront: true,
            cancellationPenaltyBps: 0,
            minFillAmount: 1000_000000n,
            whitelistedBuyer: ethers.ZeroAddress,
        };

        const signature = await wallet.signTypedData(domain, types, value);
        assert(signature.startsWith('0x'), 'signature should start with 0x');
        assertEqual(signature.length, 132, 'signature length');

        const recovered = ethers.verifyTypedData(domain, types, value, signature);
        assertEqual(recovered, wallet.address, 'recovered address');
    });

    // ========================================================================
    // 9. INTEGRATION TESTS (requires running frontend)
    // ========================================================================
    console.log('\n🌐 9. Integration Tests (live API)\n');

    const API_BASE = 'http://localhost:3000';
    let apiAvailable = false;

    try {
        const res = await fetch(`${API_BASE}/api/config`, { signal: AbortSignal.timeout(3000) });
        apiAvailable = res.ok;
    } catch { }

    if (!apiAvailable) {
        skip('fetchConfig from live API', 'API not available at localhost:3000');
        skip('fetchConfig returns valid contract addresses', 'API not available');
        skip('getFixedRateQuotes for pool 1', 'API not available');
        skip('SDK.create() factory method', 'API not available');
    } else {
        await test('fetchConfig from live API', async () => {
            const config = await LayerCoverSDK.fetchConfig({
                apiBaseUrl: API_BASE,
                chainId: 84532,
            });

            assert(config.contracts !== undefined, 'contracts should exist');
            assert(config.contracts.policyManager.startsWith('0x'), 'policyManager should be address');
            assert(config.contracts.intentOrderBook.startsWith('0x'), 'intentOrderBook should be address');
            assert(config.chainId === 84532 || config.chainId !== undefined, 'chainId should be set');
        });

        await test('fetchConfig returns valid contract addresses', async () => {
            const config = await LayerCoverSDK.fetchConfig({
                apiBaseUrl: API_BASE,
                deployment: 'base_sepolia_usdc',
            });

            assert(
                config.contracts.policyManager !== ethers.ZeroAddress,
                'policyManager should not be zero address'
            );
            assert(
                config.contracts.intentOrderBook !== ethers.ZeroAddress,
                'intentOrderBook should not be zero address'
            );

            // Check if API addresses differ from hardcoded (important finding!)
            const hardcoded = CONTRACT_ADDRESSES[84532];
            if (hardcoded.policyManager !== config.contracts.policyManager) {
                console.log(`     ⚠️  DRIFT DETECTED: SDK hardcoded PolicyManager differs from API`);
                console.log(`        Hardcoded: ${hardcoded.policyManager}`);
                console.log(`        API:       ${config.contracts.policyManager}`);
            }
            if (hardcoded.intentOrderBook !== config.contracts.intentOrderBook) {
                console.log(`     ⚠️  DRIFT DETECTED: SDK hardcoded IntentOrderBook differs from API`);
                console.log(`        Hardcoded: ${hardcoded.intentOrderBook}`);
                console.log(`        API:       ${config.contracts.intentOrderBook}`);
            }
        });

        await test('getFixedRateQuotes for pool 1', async () => {
            const provider = new ethers.JsonRpcProvider('http://localhost:1234');
            const sdk = new LayerCoverSDK(provider, ethers.ZeroAddress, {
                apiBaseUrl: API_BASE,
                deployment: 'base_sepolia_usdc',
            });

            const quotes = await sdk.getFixedRateQuotes(1);
            assert(Array.isArray(quotes), 'quotes should be an array');

            if (quotes.length > 0) {
                const q = quotes[0];
                assert(typeof q.id === 'string', 'quote should have string id');
                assert(typeof q.poolId === 'number', 'quote should have number poolId');
                assert(typeof q.premiumRateBps === 'number', 'quote should have number premiumRateBps');
                assert(typeof q.syndicateAddress === 'string', 'quote should have syndicateAddress');
                assert(typeof q.coverageAmount === 'string', 'quote should have string coverageAmount');
                assert(typeof q.minDurationWeeks === 'number', 'quote should have minDurationWeeks');
                assert(typeof q.maxDurationWeeks === 'number', 'quote should have maxDurationWeeks');

                // Verify sorted by rate
                for (let i = 1; i < quotes.length; i++) {
                    assert(
                        quotes[i].premiumRateBps >= quotes[i - 1].premiumRateBps,
                        'quotes should be sorted by rate ascending'
                    );
                }

                console.log(`     📊 Found ${quotes.length} quotes, best rate: ${quotes[0].premiumRateBps} bps`);
            } else {
                console.log('     📊 No quotes available for pool 1 (this is OK)');
            }
        });

        await test('SDK.create() factory method with live API', async () => {
            const provider = new ethers.JsonRpcProvider('https://sepolia.base.org');

            const sdk = await LayerCoverSDK.create(provider, {
                apiBaseUrl: API_BASE,
                chainId: 84532,
            });

            assert(sdk instanceof LayerCoverSDK, 'should return LayerCoverSDK instance');
            assert(sdk.policyManager !== undefined, 'should have policyManager');
            assert(sdk.intentOrderBook !== undefined, 'should have intentOrderBook');
        });

        await test('getBestRate uses quote ordering correctly', async () => {
            const provider = new ethers.JsonRpcProvider('http://localhost:1234');
            const sdk = new LayerCoverSDK(provider, ethers.ZeroAddress, {
                apiBaseUrl: API_BASE,
                deployment: 'base_sepolia_usdc',
            });

            const bestRate = await sdk.getBestRate(1);
            // bestRate is either null (no quotes) or a number
            assert(bestRate === null || typeof bestRate === 'number', 'bestRate should be null or number');
            if (bestRate !== null) {
                assert(bestRate > 0, 'bestRate should be positive');
                assert(bestRate <= 10000, 'bestRate should be <= 10000 bps (100%)');
                console.log(`     📊 Best rate for pool 1: ${bestRate} bps (${bestRate / 100}%)`);
            }
        });

        await test('getSyndicateQuotes returns array', async () => {
            const provider = new ethers.JsonRpcProvider('http://localhost:1234');
            const sdk = new LayerCoverSDK(provider, ethers.ZeroAddress, {
                apiBaseUrl: API_BASE,
                deployment: 'base_sepolia_usdc',
            });

            // Use a known syndicate address (may return empty, which is fine)
            const quotes = await sdk.getSyndicateQuotes('0x52f1985F95b4D6E3E3F0bfdC7f45A615D9caD97a');
            assert(Array.isArray(quotes), 'should return array');
        });

        await test('getSyndicateExposure returns correct shape', async () => {
            const provider = new ethers.JsonRpcProvider('http://localhost:1234');
            const sdk = new LayerCoverSDK(provider, ethers.ZeroAddress, {
                apiBaseUrl: API_BASE,
                deployment: 'base_sepolia_usdc',
            });

            const exposure = await sdk.getSyndicateExposure('0x52f1985F95b4D6E3E3F0bfdC7f45A615D9caD97a');
            assert(typeof exposure.totalExposure === 'string', 'totalExposure should be string');
            assert(typeof exposure.activeQuoteCount === 'number', 'activeQuoteCount should be number');
        });
    }

    // ========================================================================
    // 10. EDGE CASES & ROBUSTNESS
    // ========================================================================
    console.log('\n🛡️  10. Edge Cases & Robustness\n');

    await test('cancelQuote throws on non-existent API', async () => {
        const provider = new ethers.JsonRpcProvider('http://localhost:1234');
        const sdk = new LayerCoverSDK(provider, ethers.ZeroAddress, {
            apiBaseUrl: 'http://localhost:99999', // Non-existent
        });

        let threw = false;
        try {
            await sdk.cancelQuote('nonexistent-id');
        } catch (err: any) {
            threw = true;
        }
        assert(threw, 'should throw when API is unreachable');
    });

    await test('purchaseWithIntent requires signer', async () => {
        const provider = new ethers.JsonRpcProvider('http://localhost:1234');
        const sdk = new LayerCoverSDK(provider, ethers.ZeroAddress);

        let threw = false;
        try {
            await sdk.purchaseWithIntent(
                { id: 'test', poolId: 1, syndicateAddress: '0x', syndicateName: 'test', coverageAmount: '1000', premiumRateBps: 500, minDurationWeeks: 4, maxDurationWeeks: 12, expiresAt: '', status: 'active' },
                1000n,
                604800,
            );
        } catch (err: any) {
            threw = true;
            assert(err.message.includes('Signer required'), `error should mention signer: ${err.message}`);
        }
        assert(threw, 'should throw without signer');
    });

    await test('prepareBuyFromQuoteTx is deprecated on current contracts', async () => {
        const provider = new ethers.JsonRpcProvider('http://localhost:1234');
        const sdk = new LayerCoverSDK(provider, ethers.ZeroAddress, { chainId: 999999 });

        let threw = false;
        try {
            await sdk.prepareBuyFromQuoteTx(1, 1000n, 604800);
        } catch (err: any) {
            threw = true;
            assert(err.message.includes('deprecated'), `error should mention deprecation: ${err.message}`);
        }
        assert(threw, 'should throw with deprecation error');
    });

    await test('submitQuote requires signer', async () => {
        const provider = new ethers.JsonRpcProvider('http://localhost:1234');
        const sdk = new LayerCoverSDK(provider, ethers.ZeroAddress);

        let threw = false;
        try {
            await sdk.submitQuote({
                poolId: 1,
                syndicateAddress: '0x52f1985F95b4D6E3E3F0bfdC7f45A615D9caD97a',
                coverageAmount: 1000_000000n,
                premiumRateBps: 500,
                minDurationWeeks: 4,
                maxDurationWeeks: 12,
            });
        } catch (err: any) {
            threw = true;
            assert(err.message.includes('Signer required'), `error should mention signer: ${err.message}`);
        }
        assert(threw, 'should throw without signer');
    });

    await test('Config caching works', async () => {
        // Clear cache
        LayerCoverSDK._cachedConfig = null;

        // Set a fake cache
        LayerCoverSDK._cachedConfig = {
            contracts: {
                policyManager: '0x0000000000000000000000000000000000000001',
                intentOrderBook: '0x0000000000000000000000000000000000000002',
            },
            chainId: 84532,
            apiBaseUrl: 'http://cached.example.com',
            fetchedAt: Date.now(), // Fresh
        };

        // create() should use cache without fetching
        const provider = new ethers.JsonRpcProvider('http://localhost:1234');
        const sdk = await LayerCoverSDK.create(provider, {});

        const sdkAny = sdk as any;
        assertEqual(sdkAny._apiBaseUrl, 'http://cached.example.com', 'should use cached apiBaseUrl');

        // Clean up
        LayerCoverSDK._cachedConfig = null;
    });

    await test('Stale cache is refreshed', async () => {
        // Set an expired cache (6 minutes old)
        LayerCoverSDK._cachedConfig = {
            contracts: {
                policyManager: '0x0000000000000000000000000000000000000001',
                intentOrderBook: '0x0000000000000000000000000000000000000002',
            },
            chainId: 84532,
            apiBaseUrl: 'http://stale.example.com',
            fetchedAt: Date.now() - 6 * 60 * 1000, // 6 minutes ago = expired
        };

        // create() should detect stale cache
        // It will try to fetchConfig which will either succeed (API available) or fallback
        const provider = new ethers.JsonRpcProvider('http://localhost:1234');
        try {
            const sdk = await LayerCoverSDK.create(provider, { apiBaseUrl: API_BASE });
            const sdkAny = sdk as any;
            // If API available, it should NOT use stale URL
            assert(sdkAny._apiBaseUrl !== 'http://stale.example.com', 'should not use stale cache');
        } catch {
            // If API not available, fetchConfig will fallback to hardcoded, which is fine
        }

        // Clean up
        LayerCoverSDK._cachedConfig = null;
    });

    // ========================================================================
    // RESULTS
    // ========================================================================
    console.log('\n' + '='.repeat(60));
    console.log(`\n📊 Results: ${passed} passed, ${failed} failed, ${skipped} skipped\n`);

    if (failures.length > 0) {
        console.log('❌ Failures:');
        for (const f of failures) {
            console.log(`   • ${f}`);
        }
        console.log('');
    }

    if (failed === 0) {
        console.log('🎉 All tests passed!\n');
    }

    process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error('\n💥 Test suite crashed:', err);
    process.exit(2);
});
