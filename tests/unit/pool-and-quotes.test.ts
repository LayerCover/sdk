/**
 * Unit tests for pool discovery and quote methods (with mocked fetch)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LayerCoverSDK } from '../../src/index';
import { JsonRpcProvider } from 'ethers';

// ──────────────────────────────────────────────────────────────
// Test helpers
// ──────────────────────────────────────────────────────────────

function createMockSDK(): LayerCoverSDK {
    // Create a minimal SDK instance with a fake provider (no real RPC)
    const provider = new JsonRpcProvider('http://localhost:8545', undefined, { staticNetwork: true });
    return new LayerCoverSDK(provider, '0x' + '11'.repeat(20), {
        apiBaseUrl: 'https://test.layercover.com',
        deployment: 'test_deployment',
        chainId: 84532,
    });
}

const mockPools = [
    {
        poolId: 1, poolName: 'DAI', category: 'stablecoin_depeg', type: 'stablecoin',
        availableCoverage: '1000000', totalCoverageSold: '500000', premiumRateBps: 300,
        riskRating: 'A', slug: 'dai', underlyingTokenSymbol: 'DAI',
        deprecated: false,
    },
    {
        poolId: 2, poolName: 'Aave USDC', category: 'vault_cover', type: 'vault',
        availableCoverage: '5000000', totalCoverageSold: '2000000', premiumRateBps: 500,
        riskRating: 'AA', slug: 'aave-usdc', underlyingTokenSymbol: 'USDC',
        deprecated: false,
    },
    {
        poolId: 3, poolName: 'Deprecated Pool', category: 'other', type: 'other',
        availableCoverage: '0', totalCoverageSold: '100', premiumRateBps: 0,
        riskRating: 'C', slug: 'old', underlyingTokenSymbol: 'OLD',
        deprecated: true,
    },
];

const mockQuotes = [
    {
        id: 'q1', poolId: 1, syndicateAddress: '0xaaa', syndicateName: 'Alpha',
        coverageAmount: '500000', premiumRateBps: 300, minDurationWeeks: 1,
        maxDurationWeeks: 12, expiresAt: new Date(Date.now() + 86400000).toISOString(),
        status: 'active',
    },
    {
        id: 'q2', poolId: 1, syndicateAddress: '0xbbb', syndicateName: 'Beta',
        coverageAmount: '300000', premiumRateBps: 500, minDurationWeeks: 2,
        maxDurationWeeks: 8, expiresAt: new Date(Date.now() + 86400000).toISOString(),
        status: 'active',
    },
    {
        id: 'q3', poolId: 1, syndicateAddress: '0xccc', syndicateName: 'Gamma',
        coverageAmount: '100000', premiumRateBps: 200, minDurationWeeks: 4,
        maxDurationWeeks: 24, expiresAt: '2020-01-01T00:00:00Z', // expired
        status: 'active',
    },
];

// ──────────────────────────────────────────────────────────────
// Mock fetch
// ──────────────────────────────────────────────────────────────

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock as any;
});

afterEach(() => {
    vi.restoreAllMocks();
});

// ──────────────────────────────────────────────────────────────
// listPools
// ──────────────────────────────────────────────────────────────

describe('listPools', () => {
    it('fetches and maps pools from API', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ pools: mockPools }),
        });

        const sdk = createMockSDK();
        const pools = await sdk.listPools();

        expect(fetchMock).toHaveBeenCalledOnce();
        // Deprecated pool should be filtered out by default
        expect(pools).toHaveLength(2);
        expect(pools[0].poolId).toBe(1);
        expect(pools[0].name).toBe('DAI');
        expect(pools[0].category).toBe('stablecoin_depeg');
    });

    it('includes deprecated pools when requested', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ pools: mockPools }),
        });

        const sdk = createMockSDK();
        const pools = await sdk.listPools({ includeDeprecated: true });
        expect(pools).toHaveLength(3);
    });

    it('filters by category', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ pools: mockPools }),
        });

        const sdk = createMockSDK();
        const pools = await sdk.listPools({ category: 'vault_cover' });
        expect(pools).toHaveLength(1);
        expect(pools[0].category).toBe('vault_cover');
    });

    it('filters by type', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ pools: mockPools }),
        });

        const sdk = createMockSDK();
        const pools = await sdk.listPools({ type: 'stablecoin' });
        expect(pools).toHaveLength(1);
    });

    it('filters by available coverage', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ pools: mockPools }),
        });

        const sdk = createMockSDK();
        const pools = await sdk.listPools({ includeDeprecated: true, onlyWithCoverage: true });
        // Pool 3 has '0' coverage and should be filtered
        expect(pools).toHaveLength(2);
    });

    it('throws on HTTP error', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
        });

        const sdk = createMockSDK();
        await expect(sdk.listPools()).rejects.toThrow('Failed to fetch pools');
    });
});

// ──────────────────────────────────────────────────────────────
// getPool
// ──────────────────────────────────────────────────────────────

describe('getPool', () => {
    it('returns pool by ID', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ pools: mockPools }),
        });

        const sdk = createMockSDK();
        const pool = await sdk.getPool(1);
        expect(pool).not.toBeNull();
        expect(pool?.poolId).toBe(1);
    });

    it('returns null for non-existent pool', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ pools: mockPools }),
        });

        const sdk = createMockSDK();
        const pool = await sdk.getPool(999);
        expect(pool).toBeNull();
    });
});

// ──────────────────────────────────────────────────────────────
// getFixedRateQuotes
// ──────────────────────────────────────────────────────────────

describe('getFixedRateQuotes', () => {
    it('fetches quotes sorted by rate', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ quotes: mockQuotes }),
        });

        const sdk = createMockSDK();
        const quotes = await sdk.getFixedRateQuotes(1);

        expect(quotes).toHaveLength(3);
        // Sorted: 200(q3), 300(q1), 500(q2)
        expect(quotes[0].premiumRateBps).toBe(200);
        expect(quotes[1].premiumRateBps).toBe(300);
        expect(quotes[2].premiumRateBps).toBe(500);
    });

    it('throws on HTTP error', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: false,
            status: 404,
            statusText: 'Not Found',
        });

        const sdk = createMockSDK();
        await expect(sdk.getFixedRateQuotes(1)).rejects.toThrow('Failed to fetch quotes');
    });

    it('handles empty quotes', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ quotes: [] }),
        });

        const sdk = createMockSDK();
        const quotes = await sdk.getFixedRateQuotes(1);
        expect(quotes).toHaveLength(0);
    });
});

// ──────────────────────────────────────────────────────────────
// getActiveQuotes
// ──────────────────────────────────────────────────────────────

describe('getActiveQuotes', () => {
    it('filters out expired quotes', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ quotes: mockQuotes }),
        });

        const sdk = createMockSDK();
        const active = await sdk.getActiveQuotes(1);

        // q3 has expired date, so only q1 and q2 should remain
        expect(active).toHaveLength(2);
        expect(active.find(q => q.id === 'q3')).toBeUndefined();
    });
});

// ──────────────────────────────────────────────────────────────
// getBestRate
// ──────────────────────────────────────────────────────────────

describe('getBestRate', () => {
    it('returns lowest rate', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ quotes: mockQuotes }),
        });

        const sdk = createMockSDK();
        const best = await sdk.getBestRate(1);
        expect(best).toBe(200); // q3 has rate 200 (even though expired)
    });

    it('returns null when no quotes', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ quotes: [] }),
        });

        const sdk = createMockSDK();
        const best = await sdk.getBestRate(1);
        expect(best).toBeNull();
    });
});

// ──────────────────────────────────────────────────────────────
// refreshQuote
// ──────────────────────────────────────────────────────────────

describe('refreshQuote', () => {
    it('sends PUT request and returns intent + signature', async () => {
        const mockIntent = {
            solver: '0x123', underwriter: '0x456', poolId: 1,
            coverageAmount: '1000000', nonce: '42',
        };
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                reserveIntent: mockIntent,
                signature: '0xsig123',
            }),
        });

        const sdk = createMockSDK();
        const result = await sdk.refreshQuote('q1', 1000000n, 604800);

        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('/api/quotes'),
            expect.objectContaining({ method: 'PUT' })
        );
        expect(result.reserveIntent).toEqual(mockIntent);
        expect(result.signature).toBe('0xsig123');
    });

    it('handles coverageIntent alias format', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                coverageIntent: { poolId: 1 },
                intentSignature: '0xsig456',
            }),
        });

        const sdk = createMockSDK();
        const result = await sdk.refreshQuote('q1', 1000000n, 604800);
        expect(result.reserveIntent).toEqual({ poolId: 1 });
        expect(result.signature).toBe('0xsig456');
    });

    it('throws on HTTP error', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: false,
            status: 400,
            json: async () => ({ error: 'Quote expired' }),
        });

        const sdk = createMockSDK();
        await expect(sdk.refreshQuote('q1', 1000000n, 604800)).rejects.toThrow('Quote expired');
    });
});

// ──────────────────────────────────────────────────────────────
// cancelQuote
// ──────────────────────────────────────────────────────────────

describe('cancelQuote', () => {
    it('sends DELETE request', async () => {
        fetchMock.mockResolvedValueOnce({ ok: true });

        const sdk = createMockSDK();
        const result = await sdk.cancelQuote('q1');
        expect(result).toBe(true);
        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('quoteId=q1'),
            expect.objectContaining({ method: 'DELETE' })
        );
    });

    it('throws on HTTP error', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: false,
            status: 404,
            json: async () => ({ error: 'Quote not found' }),
        });

        const sdk = createMockSDK();
        await expect(sdk.cancelQuote('q999')).rejects.toThrow('Quote not found');
    });
});

// ──────────────────────────────────────────────────────────────
// getSyndicateQuotes
// ──────────────────────────────────────────────────────────────

describe('getSyndicateQuotes', () => {
    it('fetches quotes for a syndicate', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ quotes: [mockQuotes[0]] }),
        });

        const sdk = createMockSDK();
        const quotes = await sdk.getSyndicateQuotes('0xaaa');
        expect(quotes).toHaveLength(1);
        expect(quotes[0].syndicateAddress).toBe('0xaaa');
    });
});

// ──────────────────────────────────────────────────────────────
// getSyndicateExposure
// ──────────────────────────────────────────────────────────────

describe('getSyndicateExposure', () => {
    it('fetches exposure data', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ totalExposure: '2000000', activeQuoteCount: 5 }),
        });

        const sdk = createMockSDK();
        const exposure = await sdk.getSyndicateExposure('0xaaa');
        expect(exposure.totalExposure).toBe('2000000');
        expect(exposure.activeQuoteCount).toBe(5);
    });

    it('defaults to 0 for missing fields', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({}),
        });

        const sdk = createMockSDK();
        const exposure = await sdk.getSyndicateExposure('0xaaa');
        expect(exposure.totalExposure).toBe('0');
        expect(exposure.activeQuoteCount).toBe(0);
    });
});

// ──────────────────────────────────────────────────────────────
// fetchConfig (static)
// ──────────────────────────────────────────────────────────────

describe('LayerCoverSDK.fetchConfig', () => {
    beforeEach(() => {
        // Clear cached config
        LayerCoverSDK._cachedConfig = null;
    });

    it('fetches config from API', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                contracts: {
                    policyManager: '0x1111111111111111111111111111111111111111',
                    intentOrderBook: '0x2222222222222222222222222222222222222222',
                },
                chainId: 84532,
            }),
        });

        const config = await LayerCoverSDK.fetchConfig({ chainId: 84532 });
        expect(config.contracts.policyManager).toMatch(/^0x/);
        expect(config.chainId).toBe(84532);
    });

    it('falls back to hardcoded addresses on API failure', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: false,
            status: 500,
        });

        const config = await LayerCoverSDK.fetchConfig({ chainId: 84532 });
        expect(config.contracts.policyManager).toMatch(/^0x/);
    });

    it('handles deployments array format', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                deployments: [
                    {
                        name: 'base_sepolia_usdc',
                        chainId: 84532,
                        contracts: {
                            policyManager: '0x3333333333333333333333333333333333333333',
                            intentOrderBook: '0x4444444444444444444444444444444444444444',
                        },
                    },
                ],
            }),
        });

        const config = await LayerCoverSDK.fetchConfig({ deployment: 'base_sepolia_usdc' });
        expect(config.contracts.policyManager).toBe('0x3333333333333333333333333333333333333333');
    });
});
