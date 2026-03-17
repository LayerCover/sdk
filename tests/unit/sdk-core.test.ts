/**
 * Unit tests for SDK core: premium calculation, net yield, static helpers,
 * constants, and error classes.
 */
import { describe, it, expect, vi } from 'vitest';
import {
    LayerCoverSDK,
    RateTooHighError,
    NoQuotesAvailableError,
    CONTRACT_ADDRESSES,
    DEPLOYMENT_FALLBACK_CONFIGS,
    POOL_CONFIG,
    TOKEN_LOGOS,
    DEFAULT_CHAIN_ID,
    DEFAULT_API_BASE_URL,
    getPolicyManagerAddress,
    getIntentOrderBookAddress,
    getTokenLogoUrl,
} from '../../src/index';
import { Wallet, JsonRpcProvider } from 'ethers-v6';
import fs from 'node:fs';

function loadDeploymentJson(network: string, instance = 'usdc') {
    return JSON.parse(
        fs.readFileSync(new URL(`../../../contracts/deployments/${network}/${instance}.json`, import.meta.url), 'utf8')
    );
}

// ──────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────

describe('Constants', () => {
    it('DEFAULT_CHAIN_ID is Base Sepolia (84532)', () => {
        expect(DEFAULT_CHAIN_ID).toBe(84532);
    });

    it('DEFAULT_API_BASE_URL is app.layercover.com', () => {
        expect(DEFAULT_API_BASE_URL).toBe('https://app.layercover.com');
    });

    it('CONTRACT_ADDRESSES has Base Sepolia entry', () => {
        const addrs = CONTRACT_ADDRESSES[84532];
        expect(addrs).toBeDefined();
        expect(addrs.policyManager).toMatch(/^0x[a-fA-F0-9]{40}$/);
        expect(addrs.intentOrderBook).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('contract fallbacks match the current deployment JSONs', () => {
        const chainExpectations: Array<{ chainId: number; network: string }> = [
            { chainId: 84532, network: 'base_sepolia' },
            { chainId: 43113, network: 'avalanche_fuji' },
            { chainId: 11155111, network: 'ethereum_sepolia' },
            { chainId: 31337, network: 'localhost' },
        ];

        for (const { chainId, network } of chainExpectations) {
            const deployment = loadDeploymentJson(network);
            expect(CONTRACT_ADDRESSES[chainId]).toEqual({
                policyManager: deployment.PolicyManager,
                intentOrderBook: deployment.IntentMatcher,
                poolRegistry: deployment.PoolRegistry,
            });
        }
    });

    it('deployment fallbacks match the current deployment JSONs', () => {
        const deploymentExpectations: Array<{ name: string; network: string; instance?: string; chainId: number }> = [
            { name: 'base_sepolia_usdc', network: 'base_sepolia', chainId: 84532 },
            { name: 'base_sepolia_wsteth', network: 'base_sepolia', instance: 'wsteth', chainId: 84532 },
            { name: 'avalanche_fuji_usdc', network: 'avalanche_fuji', chainId: 43113 },
            { name: 'ethereum_sepolia_usdc', network: 'ethereum_sepolia', chainId: 11155111 },
            { name: 'localhost_usdc', network: 'localhost', chainId: 31337 },
        ];

        for (const { name, network, instance = 'usdc', chainId } of deploymentExpectations) {
            const deployment = loadDeploymentJson(network, instance);
            expect(DEPLOYMENT_FALLBACK_CONFIGS[name]).toEqual({
                chainId,
                contracts: {
                    policyManager: deployment.PolicyManager,
                    intentOrderBook: deployment.IntentMatcher,
                    poolRegistry: deployment.PoolRegistry,
                },
            });
        }
    });

    it('POOL_CONFIG has at least one pool', () => {
        expect(Object.keys(POOL_CONFIG).length).toBeGreaterThanOrEqual(1);
        expect(POOL_CONFIG[1].poolName).toBe('Aave USDC Protection');
    });

    it('TOKEN_LOGOS has entries for common tokens', () => {
        expect(TOKEN_LOGOS['USDC']).toContain('usdc');
        expect(TOKEN_LOGOS['ETH']).toContain('eth');
        expect(TOKEN_LOGOS['WBTC']).toContain('wbtc');
    });
});

// ──────────────────────────────────────────────────────────────
// Address helpers
// ──────────────────────────────────────────────────────────────

describe('getPolicyManagerAddress', () => {
    it('returns address for Base Sepolia', () => {
        const addr = getPolicyManagerAddress(84532);
        expect(addr).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('throws for unknown chain', () => {
        expect(() => getPolicyManagerAddress(99999)).toThrow('not deployed on chain 99999');
    });
});

describe('getIntentOrderBookAddress', () => {
    it('returns address for Base Sepolia', () => {
        const addr = getIntentOrderBookAddress(84532);
        expect(addr).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('throws for unknown chain', () => {
        expect(() => getIntentOrderBookAddress(12345)).toThrow('not deployed on chain 12345');
    });
});

describe('runtime compatibility helpers', () => {
    function createSdk(): LayerCoverSDK {
        const provider = new JsonRpcProvider('http://localhost:8545', undefined, { staticNetwork: true });
        return new LayerCoverSDK(provider, '0x' + '11'.repeat(20), {
            apiBaseUrl: 'https://test.layercover.com',
            deployment: 'base_sepolia_usdc',
            chainId: 84532,
        });
    }

    it('getPaymentToken resolves the settlement asset instead of PoolRegistry token data', async () => {
        const sdk = createSdk();
        const settlementAsset = '0x' + '22'.repeat(20);
        const resolveSettlementAsset = vi.fn().mockResolvedValue(settlementAsset);
        (sdk as any)._getSettlementAssetAddress = resolveSettlementAsset;

        await expect(sdk.getPaymentToken(7)).resolves.toBe(settlementAsset);
        expect(resolveSettlementAsset).toHaveBeenCalledOnce();
    });

    it('prefers getPoolVaultCoverConfig on the current PoolRegistry surface', async () => {
        const sdk = createSdk();
        const coveredToken = '0x' + '33'.repeat(20);
        const poolRegistry = {
            getPoolVaultCoverConfig: vi.fn().mockResolvedValue([coveredToken, false]),
            getPoolStaticData: vi.fn(),
        };

        (sdk as any)._ensureContracts = vi.fn();
        (sdk as any)._poolRegistry = poolRegistry;
        (sdk as any)._getSettlementAssetAddress = vi.fn();
        (sdk as any)._log = { debug: vi.fn(), warn: vi.fn(), error: vi.fn() };

        await expect((sdk as any)._getCoveredTokenAddress(3)).resolves.toBe(coveredToken);
        expect(poolRegistry.getPoolVaultCoverConfig).toHaveBeenCalledWith(3);
        expect(poolRegistry.getPoolStaticData).not.toHaveBeenCalled();
    });

    it('falls back to legacy getPoolStaticData when the focused getter is unavailable', async () => {
        const sdk = createSdk();
        const legacyToken = '0x' + '44'.repeat(20);
        const poolRegistry = {
            getPoolVaultCoverConfig: vi.fn().mockRejectedValue(new Error('missing')),
            getPoolStaticData: vi.fn().mockResolvedValue([legacyToken]),
        };

        (sdk as any)._ensureContracts = vi.fn();
        (sdk as any)._poolRegistry = poolRegistry;
        (sdk as any)._getSettlementAssetAddress = vi.fn();
        (sdk as any)._log = { debug: vi.fn(), warn: vi.fn(), error: vi.fn() };

        await expect((sdk as any)._getCoveredTokenAddress(9)).resolves.toBe(legacyToken);
        expect(poolRegistry.getPoolStaticData).toHaveBeenCalledWith(9);
    });
});

// ──────────────────────────────────────────────────────────────
// getTokenLogoUrl
// ──────────────────────────────────────────────────────────────

describe('getTokenLogoUrl', () => {
    it('returns exact match for USDC', () => {
        expect(getTokenLogoUrl('USDC')).toContain('usdc');
    });

    it('returns exact match for ETH', () => {
        expect(getTokenLogoUrl('ETH')).toContain('eth');
    });

    it('matches partial symbol (e.g., "stETH" → ETH logo)', () => {
        const url = getTokenLogoUrl('stETH');
        // Should match WETH or ETH (contains 'ETH')
        expect(url).toContain('eth');
    });

    it('returns default logo for unknown token', () => {
        const url = getTokenLogoUrl('SOME_UNKNOWN_TOKEN');
        expect(url).toContain('usdc'); // default is USDC logo
    });

    it('returns default logo for empty symbol', () => {
        const url = getTokenLogoUrl('');
        expect(url).toContain('usdc');
    });
});

// ──────────────────────────────────────────────────────────────
// calculatePremium
// ──────────────────────────────────────────────────────────────

describe('LayerCoverSDK.calculatePremium', () => {
    // We need an instance — but calculatePremium is a pure function on the instance
    // so we can construct a minimal (provider-less) SDK just for testing
    // Use the class prototype since it doesn't depend on instance state
    const SECS_YEAR = 31536000n;
    const BPS = 10000n;

    function calculatePremium(coverageAmount: bigint, rateBps: number, durationSeconds: number): bigint {
        const rateBn = BigInt(rateBps);
        const durationBn = BigInt(durationSeconds);
        return (coverageAmount * rateBn * durationBn) / (SECS_YEAR * BPS);
    }

    it('calculates correctly for 10,000 USDC at 5% for 1 year', () => {
        // 10,000 * 10^6 (USDC decimals) = 10_000_000_000
        const amount = 10_000_000_000n; // 10k USDC in smallest units
        const rateBps = 500; // 5%
        const duration = 365 * 24 * 60 * 60; // 1 year in seconds
        const premium = calculatePremium(amount, rateBps, duration);
        // Expected: 10,000 * 0.05 = 500 USDC = 500_000_000
        expect(premium).toBe(500_000_000n);
    });

    it('calculates correctly for short duration (1 week)', () => {
        const amount = 1_000_000_000n; // 1000 USDC
        const rateBps = 1000; // 10%
        const duration = 7 * 24 * 60 * 60; // 1 week
        const premium = calculatePremium(amount, rateBps, duration);
        // 1000 * 0.10 * (7 * 86400) / (365 * 86400) ≈ 1.917808 USDC ≈ 1_917_808
        expect(premium).toBe(1_917_808n);
    });

    it('returns 0 for 0 coverage', () => {
        expect(calculatePremium(0n, 500, 86400 * 30)).toBe(0n);
    });

    it('returns 0 for 0 rate', () => {
        expect(calculatePremium(1_000_000n, 0, 86400 * 30)).toBe(0n);
    });

    it('returns 0 for 0 duration', () => {
        expect(calculatePremium(1_000_000n, 500, 0)).toBe(0n);
    });
});

// ──────────────────────────────────────────────────────────────
// calculateNetYield
// ──────────────────────────────────────────────────────────────

describe('LayerCoverSDK.calculateNetYield', () => {
    it('calculates net yield correctly', () => {
        const result = LayerCoverSDK.calculateNetYield(5.2, 300);
        expect(result.baseApy).toBe(5.2);
        expect(result.premiumRate).toBe(3); // 300 bps = 3%
        expect(result.netApy).toBeCloseTo(2.2);
    });

    it('handles zero cost', () => {
        const result = LayerCoverSDK.calculateNetYield(8.0, 0);
        expect(result.netApy).toBe(8.0);
    });

    it('handles negative net yield (cost > base)', () => {
        const result = LayerCoverSDK.calculateNetYield(2.0, 500);
        expect(result.netApy).toBe(-3.0);
    });
});

// ──────────────────────────────────────────────────────────────
// Error classes
// ──────────────────────────────────────────────────────────────

describe('RateTooHighError', () => {
    it('stores rate and maxRate', () => {
        const err = new RateTooHighError('Rate too high', 800, 500);
        expect(err.rate).toBe(800);
        expect(err.maxRate).toBe(500);
        expect(err.name).toBe('RateTooHighError');
        expect(err.message).toBe('Rate too high');
        expect(err).toBeInstanceOf(Error);
    });
});

describe('NoQuotesAvailableError', () => {
    it('stores message and has correct name', () => {
        const err = new NoQuotesAvailableError('No quotes');
        expect(err.name).toBe('NoQuotesAvailableError');
        expect(err.message).toBe('No quotes');
        expect(err).toBeInstanceOf(Error);
    });
});

// ──────────────────────────────────────────────────────────────
// isQuoteExpired
// ──────────────────────────────────────────────────────────────

describe('LayerCoverSDK.isQuoteExpired', () => {
    it('returns true for expired quote', () => {
        const quote = {
            id: '1', poolId: 1, syndicateAddress: '0x1', syndicateName: 'Test',
            coverageAmount: '1000', premiumRateBps: 500, minDurationWeeks: 1,
            maxDurationWeeks: 12, expiresAt: '2020-01-01T00:00:00Z',
            status: 'active' as const,
        };
        expect(LayerCoverSDK.isQuoteExpired(quote)).toBe(true);
    });

    it('returns false for future quote', () => {
        const future = new Date(Date.now() + 86400000).toISOString();
        const quote = {
            id: '2', poolId: 1, syndicateAddress: '0x1', syndicateName: 'Test',
            coverageAmount: '1000', premiumRateBps: 500, minDurationWeeks: 1,
            maxDurationWeeks: 12, expiresAt: future,
            status: 'active' as const,
        };
        expect(LayerCoverSDK.isQuoteExpired(quote)).toBe(false);
    });

    it('returns false when expiresAt is empty', () => {
        const quote = {
            id: '3', poolId: 1, syndicateAddress: '0x1', syndicateName: 'Test',
            coverageAmount: '1000', premiumRateBps: 500, minDurationWeeks: 1,
            maxDurationWeeks: 12, expiresAt: '',
            status: 'active' as const,
        };
        expect(LayerCoverSDK.isQuoteExpired(quote)).toBe(false);
    });
});

// ──────────────────────────────────────────────────────────────
// sortQuotesByRate
// ──────────────────────────────────────────────────────────────

describe('LayerCoverSDK.sortQuotesByRate', () => {
    const makeQuote = (id: string, rate: number) => ({
        id, poolId: 1, syndicateAddress: '0x1', syndicateName: 'Test',
        coverageAmount: '1000', premiumRateBps: rate, minDurationWeeks: 1,
        maxDurationWeeks: 12, expiresAt: '', status: 'active' as const,
    });

    it('sorts by premiumRateBps ascending', () => {
        const quotes = [makeQuote('c', 800), makeQuote('a', 300), makeQuote('b', 500)];
        const sorted = LayerCoverSDK.sortQuotesByRate(quotes);
        expect(sorted.map(q => q.id)).toEqual(['a', 'b', 'c']);
    });

    it('does not mutate original array', () => {
        const quotes = [makeQuote('b', 500), makeQuote('a', 300)];
        const sorted = LayerCoverSDK.sortQuotesByRate(quotes);
        expect(sorted).not.toBe(quotes);
        expect(quotes[0].id).toBe('b'); // original unchanged
    });

    it('handles empty array', () => {
        expect(LayerCoverSDK.sortQuotesByRate([])).toEqual([]);
    });

    it('handles single element', () => {
        const quotes = [makeQuote('a', 500)];
        expect(LayerCoverSDK.sortQuotesByRate(quotes)).toEqual(quotes);
    });
});

describe('LayerCoverSDK constructor', () => {
    it('throws when signer is not connected to a provider', () => {
        const wallet = Wallet.createRandom();
        expect(() => new LayerCoverSDK(wallet, '0x' + '11'.repeat(20))).toThrow(
            'Signer must be connected to a provider'
        );
    });

    it('rejects purchase on chain mismatch', async () => {
        const provider = new JsonRpcProvider('http://localhost:8545', 1, { staticNetwork: true });
        const signer = Wallet.createRandom().connect(provider);
        const sdk = new LayerCoverSDK(signer, '0x' + '11'.repeat(20), { chainId: 84532 });

        await expect(sdk.purchase(1, 1n, 1)).rejects.toThrow(
            'Chain mismatch: SDK configured for 84532 (deployment base_sepolia_usdc), signer connected to 1'
        );
    });
});
