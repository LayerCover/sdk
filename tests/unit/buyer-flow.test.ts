import { describe, it, expect, vi } from 'vitest';
import { JsonRpcProvider, Wallet } from 'ethers-v6';
import { LayerCoverSDK, FixedRateQuote, PurchaseBlockedError, QuoteStaleError } from '../../src/index';

function createSignerSdk(): LayerCoverSDK {
    const provider = new JsonRpcProvider('http://localhost:8545', undefined, { staticNetwork: true });
    const signer = Wallet.createRandom().connect(provider);
    return new LayerCoverSDK(signer, '0x' + '11'.repeat(20), {
        apiBaseUrl: 'https://test.layercover.com',
        deployment: 'ethereum_sepolia_usdc',
        chainId: 11155111,
    });
}

function makeQuote(overrides: Partial<FixedRateQuote> = {}): FixedRateQuote {
    return {
        id: 'quote-default',
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
        minFillAmount: '0',
        ...overrides,
    };
}

describe('buyer flow integration', () => {
    it('preparePurchase and purchase stay aligned on the same executable quote', async () => {
        const sdk = createSignerSdk();
        const unfillable = makeQuote({ id: 'quote-a', coverageAmount: '10', premiumRateBps: 250, quoteBookQuoteId: '7' });
        const fillable = makeQuote({ id: 'quote-b', coverageAmount: '1000000', premiumRateBps: 300, quoteBookQuoteId: '8' });

        vi.spyOn(sdk, 'getActiveQuotes').mockResolvedValue([unfillable, fillable]);
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

        const preparation = await sdk.preparePurchase(1, 500n, 4);
        expect(preparation.status).toBe('approval_required');
        expect(preparation.quote?.id).toBe('quote-b');

        const executeSpy = vi.spyOn(sdk as any, '_executeDirectQuoteBookPurchase').mockResolvedValue({ txHash: '0xabc' });
        const purchase = await sdk.purchase(1, 500n, 4);

        expect(purchase.txHash).toBe('0xabc');
        expect(executeSpy).toHaveBeenCalledWith(fillable, 500n, 2419200, '0x' + '00'.repeat(32));
    });

    it('preparePurchaseFromQuote and purchaseQuote preserve an explicitly selected quote', async () => {
        const sdk = createSignerSdk();
        const selectedQuote = makeQuote({
            id: 'quote-selected',
            syndicateName: 'Selected',
            premiumRateBps: 425,
            quoteBookQuoteId: '99',
        });

        vi.spyOn(sdk, 'prepareBuyFromQuoteTx').mockResolvedValue({ to: '0x' + '44'.repeat(20), data: '0x1234' });
        vi.spyOn(sdk, 'prepareApprovalTx').mockResolvedValue({ to: '0x' + '55'.repeat(20), data: '0x5678' });
        (sdk as any)._previewDirectQuoteBookPurchase = vi.fn().mockResolvedValue({
            purchaseGatewayAddress: '0x' + '66'.repeat(20),
            paymentTokenAddress: '0x' + '77'.repeat(20),
            premiumDeposit: 123n,
            requiresUpfront: true,
        });
        (sdk as any)._getTokenAllowance = vi.fn().mockResolvedValue(999n);
        (sdk as any)._assertConfiguredChain = vi.fn();

        const preparation = await sdk.preparePurchaseFromQuote(selectedQuote, 500n, 4);
        expect(preparation.status).toBe('ready');
        expect(preparation.quote.id).toBe('quote-selected');

        const executeSpy = vi.spyOn(sdk as any, '_executeDirectQuoteBookPurchase').mockResolvedValue({ txHash: '0xdef' });
        const purchase = await sdk.purchaseQuote(selectedQuote, 500n, 4);

        expect(purchase.txHash).toBe('0xdef');
        expect(executeSpy).toHaveBeenCalledWith(selectedQuote, 500n, 2419200, '0x' + '00'.repeat(32));
    });

    it('purchaseQuote revalidates stale selected quotes before execution', async () => {
        const sdk = createSignerSdk();
        const staleQuote = makeQuote({
            id: 'quote-selected',
            fetchedAt: new Date(Date.now() - 60_000).toISOString(),
            coverageAmount: '100',
        });
        const refreshedQuote = makeQuote({
            id: 'quote-selected',
            fetchedAt: new Date().toISOString(),
            coverageAmount: '1000000',
            premiumRateBps: 315,
        });

        vi.spyOn(sdk, 'getActiveQuotes').mockResolvedValue([refreshedQuote]);
        (sdk as any)._assertConfiguredChain = vi.fn();

        const executeSpy = vi.spyOn(sdk as any, '_executeDirectQuoteBookPurchase').mockResolvedValue({ txHash: '0x987' });
        const purchase = await sdk.purchaseQuote(staleQuote, 500n, 4);

        expect(purchase.txHash).toBe('0x987');
        expect(executeSpy).toHaveBeenCalledWith(refreshedQuote, 500n, 2419200, '0x' + '00'.repeat(32));
    });

    it('purchaseQuote throws QuoteStaleError when a stale selected quote disappears', async () => {
        const sdk = createSignerSdk();
        const staleQuote = makeQuote({
            id: 'quote-selected',
            fetchedAt: new Date(Date.now() - 60_000).toISOString(),
        });

        vi.spyOn(sdk, 'getActiveQuotes').mockResolvedValue([]);
        (sdk as any)._assertConfiguredChain = vi.fn();

        await expect(sdk.purchaseQuote(staleQuote, 500n, 4)).rejects.toBeInstanceOf(QuoteStaleError);
    });

    it('purchase throws PurchaseBlockedError when quotes exist but none can execute', async () => {
        const sdk = createSignerSdk();
        const tooSmall = makeQuote({ id: 'quote-a', coverageAmount: '10', quoteBookQuoteId: '7' });
        const wrongDuration = makeQuote({ id: 'quote-b', minDurationWeeks: 8, maxDurationWeeks: 12, quoteBookQuoteId: '8' });

        vi.spyOn(sdk, 'getActiveQuotes').mockResolvedValue([tooSmall, wrongDuration]);
        (sdk as any)._assertConfiguredChain = vi.fn();

        await expect(sdk.purchase(1, 500n, 4)).rejects.toBeInstanceOf(PurchaseBlockedError);
    });
});
