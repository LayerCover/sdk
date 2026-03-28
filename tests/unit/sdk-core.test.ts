/**
 * Unit tests for SDK core: premium calculation, net yield, static helpers,
 * constants, and error classes.
 */
import { describe, it, expect, vi } from 'vitest';
import {
    LayerCoverSDK,
    RateTooHighError,
    NoQuotesAvailableError,
    PurchaseBlockedError,
    QuoteStaleError,
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
import { Wallet, JsonRpcProvider, Interface, AbiCoder } from 'ethers-v6';
import fs from 'node:fs';

function loadDeploymentJsonCandidates(network: string, instance = 'usdc') {
    const candidates = [
        new URL(`../../../monorepo/packages/contracts/deployments/${network}/${instance}.json`, import.meta.url),
        new URL(`../../../docs-site/packages/contracts/deployments/${network}/${instance}.json`, import.meta.url),
    ];

    return candidates
        .filter((candidate) => fs.existsSync(candidate))
        .map((candidate) => JSON.parse(fs.readFileSync(candidate, 'utf8')));
}

function loadPolicyNftAbi() {
    const candidate = new URL('../../../subgraph/abis/PolicyNFT.json', import.meta.url);
    const artifact = JSON.parse(fs.readFileSync(candidate, 'utf8'));
    return artifact.abi ?? artifact;
}

// ──────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────

describe('Constants', () => {
    it('DEFAULT_CHAIN_ID is Ethereum Sepolia (11155111)', () => {
        expect(DEFAULT_CHAIN_ID).toBe(11155111);
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
            const candidates = loadDeploymentJsonCandidates(network);
            const actual = CONTRACT_ADDRESSES[chainId];

            expect(
                candidates.some((deployment) =>
                    actual.policyManager === deployment.PolicyManager
                    && actual.intentOrderBook === deployment.IntentMatcher
                    && actual.poolRegistry === deployment.PoolRegistry
                )
            ).toBe(true);
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
            const candidates = loadDeploymentJsonCandidates(network, instance);
            const actual = DEPLOYMENT_FALLBACK_CONFIGS[name];

            expect(
                candidates.some((deployment) =>
                    actual.chainId === chainId
                    && actual.contracts.policyManager === deployment.PolicyManager
                    && actual.contracts.intentOrderBook === deployment.IntentMatcher
                    && actual.contracts.poolRegistry === deployment.PoolRegistry
                )
            ).toBe(true);
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

    it('prepareBuyFromQuoteTx encodes a PurchaseGateway buy request', async () => {
        const sdk = createSdk();
        const purchaseGatewayAddress = '0x' + '55'.repeat(20);
        (sdk as any)._resolvePurchaseGatewayAddress = vi.fn().mockResolvedValue(purchaseGatewayAddress);

        const referralCode = '0x' + '11'.repeat(32);
        const tx = await sdk.prepareBuyFromQuoteTx(7, 1234n, 604800, referralCode);

        expect(tx.to).toBe(purchaseGatewayAddress);
        expect(typeof tx.data).toBe('string');

        const gatewayIface = new Interface(['function buy(bytes purchaseRequest) returns (uint256)']);
        const parsed = gatewayIface.parseTransaction({ data: String(tx.data), value: 0n });
        expect(parsed?.name).toBe('buy');

        const [request] = AbiCoder.defaultAbiCoder().decode(
            ['tuple(uint256 quoteId, uint256 coverageAmount, uint64 duration, bytes32 referralCode, address vault, uint256 sharesToCover, bytes extensionData)'],
            parsed?.args?.[0]
        );
        expect(request.quoteId).toBe(7n);
        expect(request.coverageAmount).toBe(1234n);
        expect(request.duration).toBe(604800n);
        expect(request.referralCode).toBe(referralCode);
    });

    it('getBestExecutableQuote skips quotes that cannot fill the request', async () => {
        const sdk = createSdk();
        vi.spyOn(sdk, 'getActiveQuotes').mockResolvedValue([
            {
                id: 'quote-a',
                poolId: 1,
                syndicateAddress: '0x' + '22'.repeat(20),
                syndicateName: 'Alpha',
                coverageAmount: '1000000',
                premiumRateBps: 300,
                minDurationWeeks: 1,
                maxDurationWeeks: 12,
                expiresAt: new Date(Date.now() + 60_000).toISOString(),
                status: 'active',
                quoteBookQuoteId: '7',
                quoteSource: 'quotebook',
                minFillAmount: '500',
            },
            {
                id: 'quote-b',
                poolId: 1,
                syndicateAddress: '0x' + '33'.repeat(20),
                syndicateName: 'Beta',
                coverageAmount: '1000000',
                premiumRateBps: 325,
                minDurationWeeks: 1,
                maxDurationWeeks: 12,
                expiresAt: new Date(Date.now() + 60_000).toISOString(),
                status: 'active',
                quoteBookQuoteId: '8',
                quoteSource: 'quotebook',
                minFillAmount: '0',
            },
        ]);

        const quote = await sdk.getBestExecutableQuote(1, 100n, 4);
        expect(quote?.id).toBe('quote-b');
    });

    it('preparePurchase returns transactions and approval state for executable quotes', async () => {
        const provider = new JsonRpcProvider('http://localhost:8545', undefined, { staticNetwork: true });
        const signer = Wallet.createRandom().connect(provider);
        const onEvent = vi.fn();
        const sdk = new LayerCoverSDK(signer, '0x' + '11'.repeat(20), {
            apiBaseUrl: 'https://test.layercover.com',
            deployment: 'base_sepolia_usdc',
            chainId: 84532,
            onEvent,
        });
        const quote = {
            id: 'quote-1',
            poolId: 1,
            syndicateAddress: '0x' + '22'.repeat(20),
            syndicateName: 'Alpha',
            coverageAmount: '1000000',
            premiumRateBps: 300,
            minDurationWeeks: 1,
            maxDurationWeeks: 12,
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            status: 'active' as const,
            quoteBookQuoteId: '7',
            quoteSource: 'quotebook',
            minFillAmount: '250',
        };

        vi.spyOn(sdk, 'getActiveQuotes').mockResolvedValue([quote]);
        vi.spyOn(sdk, 'prepareBuyFromQuoteTx').mockResolvedValue({ to: '0x' + '44'.repeat(20), data: '0x1234' });
        vi.spyOn(sdk, 'prepareApprovalTx').mockResolvedValue({ to: '0x' + '55'.repeat(20), data: '0x5678' });
        (sdk as any)._previewDirectQuoteBookPurchase = vi.fn().mockResolvedValue({
            purchaseGatewayAddress: '0x' + '66'.repeat(20),
            paymentTokenAddress: '0x' + '77'.repeat(20),
            premiumDeposit: 123n,
            requiresUpfront: true,
        });
        (sdk as any)._getTokenAllowance = vi.fn().mockResolvedValue(0n);
        (sdk as any)._assertConfiguredChain = vi.fn();

        const preparation = await sdk.preparePurchase(1, 500n, 4, undefined, '0x' + '11'.repeat(32));

        expect(preparation.status).toBe('approval_required');
        expect(preparation.blockers).toEqual([]);
        expect(preparation.quote?.id).toBe('quote-1');
        expect(preparation.premiumDeposit).toBe(123n);
        expect(preparation.approvalNeeded).toBe(true);
        expect(preparation.approvalTx?.to).toBe('0x' + '55'.repeat(20));
        expect(preparation.purchaseTx?.to).toBe('0x' + '44'.repeat(20));
        expect(preparation.minFillAmount).toBe(250n);
        expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({
            type: 'purchase_prepared',
        }));
    });

    it('preparePurchaseFromQuote preserves the selected quote even when cheaper quotes exist', async () => {
        const sdk = createSdk();
        const selectedQuote = {
            id: 'quote-selected',
            poolId: 1,
            syndicateAddress: '0x' + '22'.repeat(20),
            syndicateName: 'Selected',
            coverageAmount: '1000000',
            premiumRateBps: 350,
            minDurationWeeks: 1,
            maxDurationWeeks: 12,
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            status: 'active' as const,
            quoteBookQuoteId: '9',
            quoteSource: 'quotebook',
            minFillAmount: '0',
        };

        vi.spyOn(sdk, 'prepareBuyFromQuoteTx').mockResolvedValue({ to: '0x' + '44'.repeat(20), data: '0x1234' });
        vi.spyOn(sdk, 'prepareApprovalTx').mockResolvedValue({ to: '0x' + '55'.repeat(20), data: '0x5678' });
        (sdk as any)._previewDirectQuoteBookPurchase = vi.fn().mockResolvedValue({
            purchaseGatewayAddress: '0x' + '66'.repeat(20),
            paymentTokenAddress: '0x' + '77'.repeat(20),
            premiumDeposit: 88n,
            requiresUpfront: true,
        });

        const preparation = await sdk.preparePurchaseFromQuote(selectedQuote, 500n, 4);

        expect(preparation.status).toBe('signer_required');
        expect(preparation.quote?.id).toBe('quote-selected');
        expect(preparation.purchaseTx?.to).toBe('0x' + '44'.repeat(20));
    });

    it('preparePurchase returns structured blockers when no quote is executable', async () => {
        const onEvent = vi.fn();
        const sdk = new LayerCoverSDK(new JsonRpcProvider('http://localhost:8545', undefined, { staticNetwork: true }), '0x' + '11'.repeat(20), {
            apiBaseUrl: 'https://test.layercover.com',
            deployment: 'base_sepolia_usdc',
            chainId: 84532,
            onEvent,
        });
        vi.spyOn(sdk, 'getActiveQuotes').mockResolvedValue([
            {
                id: 'quote-a',
                poolId: 1,
                syndicateAddress: '0x' + '22'.repeat(20),
                syndicateName: 'Alpha',
                coverageAmount: '50',
                premiumRateBps: 250,
                minDurationWeeks: 1,
                maxDurationWeeks: 52,
                expiresAt: new Date(Date.now() + 60_000).toISOString(),
                status: 'active',
                quoteBookQuoteId: '7',
                quoteSource: 'quotebook',
                minFillAmount: '0',
            },
            {
                id: 'quote-b',
                poolId: 1,
                syndicateAddress: '0x' + '33'.repeat(20),
                syndicateName: 'Beta',
                coverageAmount: '200',
                premiumRateBps: 300,
                minDurationWeeks: 6,
                maxDurationWeeks: 12,
                expiresAt: new Date(Date.now() + 60_000).toISOString(),
                status: 'active',
                quoteBookQuoteId: '8',
                quoteSource: 'quotebook',
                minFillAmount: '500',
            },
        ]);

        const preparation = await sdk.preparePurchase(1, 100n, 4);

        expect(preparation.status).toBe('blocked');
        expect(preparation.quote).toBeNull();
        expect(preparation.purchaseTx).toBeUndefined();
        expect(preparation.blockers.map((blocker) => blocker.code)).toEqual([
            'AMOUNT_EXCEEDS_CAPACITY',
            'AMOUNT_BELOW_MIN_FILL',
            'DURATION_OUT_OF_RANGE',
        ]);
        expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({
            type: 'purchase_preparation_blocked',
        }));
    });

    it('purchase routes QuoteBook quotes through the direct purchase path', async () => {
        const provider = new JsonRpcProvider('http://localhost:8545', undefined, { staticNetwork: true });
        const signer = Wallet.createRandom().connect(provider);
        const sdk = new LayerCoverSDK(signer, '0x' + '11'.repeat(20), {
            apiBaseUrl: 'https://test.layercover.com',
            deployment: 'base_sepolia_usdc',
            chainId: 84532,
        });

        (sdk as any)._assertConfiguredChain = vi.fn();
        vi.spyOn(sdk, 'getFixedRateQuotes').mockResolvedValue([
            {
                id: 'quote-1',
                poolId: 1,
                syndicateAddress: '0x' + '22'.repeat(20),
                syndicateName: 'Alpha',
                coverageAmount: '1000000',
                premiumRateBps: 300,
                minDurationWeeks: 1,
                maxDurationWeeks: 12,
                expiresAt: new Date(Date.now() + 60_000).toISOString(),
                status: 'active',
                orderId: 7,
                quoteBookQuoteId: '7',
                quoteSource: 'quotebook',
            },
        ]);
        const directSpy = vi.spyOn(sdk as any, '_executeDirectQuoteBookPurchase').mockResolvedValue({ txHash: '0xabc' });

        const result = await sdk.purchase(1, 1n, 1);
        expect(result.txHash).toBe('0xabc');
        expect(directSpy).toHaveBeenCalledOnce();
    });

    it('purchase uses the first executable quote rather than the first quoted rate', async () => {
        const provider = new JsonRpcProvider('http://localhost:8545', undefined, { staticNetwork: true });
        const signer = Wallet.createRandom().connect(provider);
        const sdk = new LayerCoverSDK(signer, '0x' + '11'.repeat(20), {
            apiBaseUrl: 'https://test.layercover.com',
            deployment: 'base_sepolia_usdc',
            chainId: 84532,
        });

        (sdk as any)._assertConfiguredChain = vi.fn();
        vi.spyOn(sdk, 'getActiveQuotes').mockResolvedValue([
            {
                id: 'quote-unfillable',
                poolId: 1,
                syndicateAddress: '0x' + '22'.repeat(20),
                syndicateName: 'Alpha',
                coverageAmount: '10',
                premiumRateBps: 300,
                minDurationWeeks: 1,
                maxDurationWeeks: 12,
                expiresAt: new Date(Date.now() + 60_000).toISOString(),
                status: 'active',
                quoteBookQuoteId: '7',
                quoteSource: 'quotebook',
            },
            {
                id: 'quote-fillable',
                poolId: 1,
                syndicateAddress: '0x' + '33'.repeat(20),
                syndicateName: 'Beta',
                coverageAmount: '1000000',
                premiumRateBps: 325,
                minDurationWeeks: 1,
                maxDurationWeeks: 12,
                expiresAt: new Date(Date.now() + 60_000).toISOString(),
                status: 'active',
                quoteBookQuoteId: '8',
                quoteSource: 'quotebook',
            },
        ]);
        const purchaseQuoteSpy = vi.spyOn(sdk, 'purchaseQuote').mockResolvedValue({ txHash: '0xdef' });

        const result = await sdk.purchase(1, 500n, 1);
        expect(result.txHash).toBe('0xdef');
        expect(purchaseQuoteSpy).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'quote-fillable' }),
            500n,
            1,
            undefined,
            '0x' + '00'.repeat(32)
        );
    });

    it('purchaseQuote executes the selected quote directly', async () => {
        const provider = new JsonRpcProvider('http://localhost:8545', undefined, { staticNetwork: true });
        const signer = Wallet.createRandom().connect(provider);
        const sdk = new LayerCoverSDK(signer, '0x' + '11'.repeat(20), {
            apiBaseUrl: 'https://test.layercover.com',
            deployment: 'base_sepolia_usdc',
            chainId: 84532,
        });
        const quote = {
            id: 'quote-selected',
            poolId: 1,
            syndicateAddress: '0x' + '22'.repeat(20),
            syndicateName: 'Alpha',
            coverageAmount: '1000000',
            premiumRateBps: 300,
            minDurationWeeks: 1,
            maxDurationWeeks: 12,
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            status: 'active' as const,
            quoteBookQuoteId: '7',
            quoteSource: 'quotebook',
        };

        (sdk as any)._assertConfiguredChain = vi.fn();
        const directSpy = vi.spyOn(sdk as any, '_executeDirectQuoteBookPurchase').mockResolvedValue({ txHash: '0xabc' });

        const result = await sdk.purchaseQuote(quote, 100n, 4);
        expect(result.txHash).toBe('0xabc');
        expect(directSpy).toHaveBeenCalledWith(quote, 100n, 2419200, '0x' + '00'.repeat(32));
    });

    it('purchase rejects legacy non-QuoteBook quotes', async () => {
        const provider = new JsonRpcProvider('http://localhost:8545', undefined, { staticNetwork: true });
        const signer = Wallet.createRandom().connect(provider);
        const sdk = new LayerCoverSDK(signer, '0x' + '11'.repeat(20), {
            apiBaseUrl: 'https://test.layercover.com',
            deployment: 'base_sepolia_usdc',
            chainId: 84532,
        });

        (sdk as any)._assertConfiguredChain = vi.fn();
        vi.spyOn(sdk, 'getFixedRateQuotes').mockResolvedValue([
            {
                id: 'quote-1',
                poolId: 1,
                syndicateAddress: '0x' + '22'.repeat(20),
                syndicateName: 'Alpha',
                coverageAmount: '1000000',
                premiumRateBps: 300,
                minDurationWeeks: 1,
                maxDurationWeeks: 12,
                expiresAt: new Date(Date.now() + 60_000).toISOString(),
                status: 'active',
            },
        ]);

        await expect(sdk.purchase(1, 1n, 1)).rejects.toThrow('Quote quote-1 is not an executable QuoteBook quote.');
    });

    it('purchaseQuote throws PurchaseBlockedError for non-executable selected quotes', async () => {
        const provider = new JsonRpcProvider('http://localhost:8545', undefined, { staticNetwork: true });
        const signer = Wallet.createRandom().connect(provider);
        const sdk = new LayerCoverSDK(signer, '0x' + '11'.repeat(20), {
            apiBaseUrl: 'https://test.layercover.com',
            deployment: 'base_sepolia_usdc',
            chainId: 84532,
        });
        const quote = {
            id: 'quote-selected',
            poolId: 1,
            syndicateAddress: '0x' + '22'.repeat(20),
            syndicateName: 'Alpha',
            coverageAmount: '10',
            premiumRateBps: 300,
            minDurationWeeks: 1,
            maxDurationWeeks: 12,
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            status: 'active' as const,
            quoteBookQuoteId: '7',
            quoteSource: 'quotebook',
        };

        (sdk as any)._assertConfiguredChain = vi.fn();

        await expect(sdk.purchaseQuote(quote, 100n, 4)).rejects.toBeInstanceOf(PurchaseBlockedError);
    });

    it('purchaseQuote throws QuoteStaleError when a selected quote is stale and gone', async () => {
        const provider = new JsonRpcProvider('http://localhost:8545', undefined, { staticNetwork: true });
        const signer = Wallet.createRandom().connect(provider);
        const sdk = new LayerCoverSDK(signer, '0x' + '11'.repeat(20), {
            apiBaseUrl: 'https://test.layercover.com',
            deployment: 'base_sepolia_usdc',
            chainId: 84532,
        });
        const quote = {
            id: 'quote-selected',
            poolId: 1,
            syndicateAddress: '0x' + '22'.repeat(20),
            syndicateName: 'Alpha',
            coverageAmount: '1000000',
            premiumRateBps: 300,
            minDurationWeeks: 1,
            maxDurationWeeks: 12,
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            fetchedAt: new Date(Date.now() - 60_000).toISOString(),
            status: 'active' as const,
            quoteBookQuoteId: '7',
            quoteSource: 'quotebook',
        };

        (sdk as any)._assertConfiguredChain = vi.fn();
        vi.spyOn(sdk, 'getActiveQuotes').mockResolvedValue([]);

        await expect(sdk.purchaseQuote(quote, 100n, 4)).rejects.toBeInstanceOf(QuoteStaleError);
    });

    it('getPolicy uses the current PolicyNFT tuple shape', async () => {
        const sdk = createSdk();
        (sdk as any)._policyNFTAddress = '0x' + '66'.repeat(20);

        const nft = await (sdk as any)._getPolicyNFT();
        const getPolicy = nft.interface.getFunction('getPolicy');
        const outputs = getPolicy.outputs?.[0]?.components ?? [];
        const intentComponents = outputs.find((component: any) => component.name === 'intent')?.components ?? [];

        const artifactGetPolicy = loadPolicyNftAbi().find((entry: any) => entry.type === 'function' && entry.name === 'getPolicy');
        const artifactIntentComponents = artifactGetPolicy.outputs?.[0]?.components?.find((component: any) => component.name === 'intent')?.components ?? [];

        expect(intentComponents.map((component: any) => component.name)).toEqual(
            artifactIntentComponents.map((component: any) => component.name)
        );
        expect(intentComponents.map((component: any) => component.name)).not.toContain('cancellationPenaltyBps');
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

describe('LayerCoverSDK.isQuoteStale', () => {
    it('returns true for expired quotes even without fetchedAt', () => {
        const quote = {
            id: 'stale-1', poolId: 1, syndicateAddress: '0x1', syndicateName: 'Test',
            coverageAmount: '1000', premiumRateBps: 500, minDurationWeeks: 1,
            maxDurationWeeks: 12, expiresAt: '2020-01-01T00:00:00Z',
            status: 'active' as const,
        };
        expect(LayerCoverSDK.isQuoteStale(quote)).toBe(true);
    });

    it('returns true for old cached quotes', () => {
        const quote = {
            id: 'stale-2', poolId: 1, syndicateAddress: '0x1', syndicateName: 'Test',
            coverageAmount: '1000', premiumRateBps: 500, minDurationWeeks: 1,
            maxDurationWeeks: 12, expiresAt: new Date(Date.now() + 60_000).toISOString(),
            fetchedAt: new Date(Date.now() - 60_000).toISOString(),
            status: 'active' as const,
        };
        expect(LayerCoverSDK.getQuoteAgeMs(quote)).toBeGreaterThan(30_000);
        expect(LayerCoverSDK.isQuoteStale(quote)).toBe(true);
    });

    it('returns false for fresh quotes', () => {
        const quote = {
            id: 'stale-3', poolId: 1, syndicateAddress: '0x1', syndicateName: 'Test',
            coverageAmount: '1000', premiumRateBps: 500, minDurationWeeks: 1,
            maxDurationWeeks: 12, expiresAt: new Date(Date.now() + 60_000).toISOString(),
            fetchedAt: new Date().toISOString(),
            status: 'active' as const,
        };
        expect(LayerCoverSDK.isQuoteStale(quote)).toBe(false);
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
