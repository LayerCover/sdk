import { useState, useEffect, useCallback } from 'react';
import { LayerCoverSDK, FixedRateQuote, PurchaseResult } from '../../index';
import type { Signer } from 'ethers';

export interface UseLayerCoverOptions {
    signer?: Signer;
    policyManagerAddress: string;
    poolId: number;
    decimals?: number;
    /** Optional API base URL (default: https://app.layercover.com) */
    apiBaseUrl?: string;
    /** Optional deployment identifier */
    deployment?: string;
    /** Optional referral code (bytes32 hex string) */
    referralCode?: string;
}

export interface UseLayerCoverResult {
    sdk: LayerCoverSDK | null;
    /** Available fixed-rate quotes */
    quotes: FixedRateQuote[];
    /** Currently selected quote */
    selectedQuote: FixedRateQuote | null;
    /** Best available rate in basis points */
    bestRate: number | null;
    loading: boolean;
    error: string;
    /** Fetch available quotes for the pool */
    fetchQuotes: () => Promise<void>;
    /** Select a specific quote */
    selectQuote: (quote: FixedRateQuote | null) => void;
    /** Calculate premium for given amount and duration */
    calculatePremium: (amount: string, durationWeeks: number) => bigint | null;
    /** Purchase coverage */
    purchase: (amount: string, durationWeeks: number, onApprove?: () => void, onPurchase?: () => void) => Promise<PurchaseResult | null>;
    txStatus: string;
}

/**
 * React hook for interacting with LayerCover SDK.
 * Provides fixed-rate quote fetching and purchase functionality.
 */
export function useLayerCover({
    signer,
    policyManagerAddress,
    poolId,
    decimals = 6,
    apiBaseUrl,
    deployment,
    referralCode,
}: UseLayerCoverOptions): UseLayerCoverResult {
    const [sdk, setSdk] = useState<LayerCoverSDK | null>(null);
    const [quotes, setQuotes] = useState<FixedRateQuote[]>([]);
    const [selectedQuote, setSelectedQuote] = useState<FixedRateQuote | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [txStatus, setTxStatus] = useState('');

    // Initialize SDK when signer is available
    useEffect(() => {
        if (signer && policyManagerAddress) {
            try {
                const instance = new LayerCoverSDK(signer as any, policyManagerAddress, {
                    apiBaseUrl,
                    deployment,
                });
                setSdk(instance);
            } catch (e: any) {
                setError(e.message || 'Failed to initialize SDK');
            }
        } else {
            setSdk(null);
        }
    }, [signer, policyManagerAddress, apiBaseUrl, deployment]);

    // Fetch quotes when SDK and poolId are ready
    const fetchQuotes = useCallback(async () => {
        if (!sdk) {
            setQuotes([]);
            return;
        }

        setLoading(true);
        setError('');

        try {
            const fetchedQuotes = await sdk.getFixedRateQuotes(poolId);
            setQuotes(fetchedQuotes);

            // Auto-select best quote if none selected
            if (fetchedQuotes.length > 0 && !selectedQuote) {
                setSelectedQuote(fetchedQuotes[0]);
            }
        } catch (e: any) {
            console.error('Fetch quotes error:', e);
            setQuotes([]);
            setError(e.message || 'Failed to fetch quotes');
        } finally {
            setLoading(false);
        }
    }, [sdk, poolId, selectedQuote]);

    // Auto-fetch quotes on mount
    useEffect(() => {
        if (sdk && poolId) {
            fetchQuotes();
        }
    }, [sdk, poolId]); // Note: intentionally not including fetchQuotes to avoid loop

    const selectQuote = useCallback((quote: FixedRateQuote | null) => {
        setSelectedQuote(quote);
    }, []);

    const calculatePremium = useCallback(
        (amount: string, durationWeeks: number): bigint | null => {
            if (!sdk || !selectedQuote || !amount || Number(amount) <= 0) {
                return null;
            }

            try {
                const { parseUnits } = require('ethers');
                const amountBigInt = parseUnits(amount, decimals);
                const durationSeconds = durationWeeks * 7 * 24 * 60 * 60;
                return sdk.calculatePremium(amountBigInt, selectedQuote.premiumRateBps, durationSeconds);
            } catch (e) {
                console.error('Calculate premium error:', e);
                return null;
            }
        },
        [sdk, selectedQuote, decimals]
    );

    const purchase = useCallback(
        async (
            amount: string,
            durationWeeks: number,
            onApprove?: () => void,
            onPurchase?: () => void
        ): Promise<PurchaseResult | null> => {
            if (!sdk || !signer) {
                setError('SDK or signer not available');
                return null;
            }

            if (!selectedQuote) {
                setError('No quote selected. Please fetch and select a quote first.');
                return null;
            }

            setLoading(true);
            setTxStatus('Preparing...');
            setError('');

            try {
                const { parseUnits } = await import('ethers');
                const coverageAmount = parseUnits(amount, decimals);
                const durationSeconds = durationWeeks * 7 * 24 * 60 * 60;

                // Calculate premium
                const premium = sdk.calculatePremium(
                    coverageAmount,
                    selectedQuote.premiumRateBps,
                    durationSeconds
                );
                const premiumWithBuffer = (premium * 105n) / 100n;

                // Approve
                setTxStatus('Approving...');
                const approveTx = await sdk.prepareApprovalTx(poolId, premiumWithBuffer);
                const approveResult = await (signer as any).sendTransaction(approveTx);
                await approveResult.wait();
                onApprove?.();

                // Purchase
                setTxStatus('Purchasing...');

                let result: PurchaseResult;

                if (selectedQuote.orderId) {
                    // Use buyFromQuote for on-chain orders
                    const purchaseTx = await sdk.prepareBuyFromQuoteTx(
                        selectedQuote.orderId,
                        coverageAmount,
                        durationSeconds,
                        referralCode
                    );
                    const purchaseResult = await (signer as any).sendTransaction(purchaseTx);
                    const receipt = await purchaseResult.wait();
                    result = { txHash: purchaseResult.hash };
                } else {
                    // Use full intent flow
                    result = await sdk.purchaseWithIntent(
                        selectedQuote,
                        coverageAmount,
                        durationSeconds,
                        referralCode
                    );
                }

                onPurchase?.();
                setTxStatus('Success! Cover purchased.');

                // Refresh quotes after purchase
                await fetchQuotes();

                return result;
            } catch (e: any) {
                console.error('Purchase error:', e);
                setTxStatus('');
                setError(e.message || 'Purchase failed');
                return null;
            } finally {
                setLoading(false);
            }
        },
        [sdk, signer, selectedQuote, poolId, decimals, fetchQuotes]
    );

    // Computed: best rate
    const bestRate = quotes.length > 0 ? quotes[0].premiumRateBps : null;

    return {
        sdk,
        quotes,
        selectedQuote,
        bestRate,
        loading,
        error,
        fetchQuotes,
        selectQuote,
        calculatePremium,
        purchase,
        txStatus,
    };
}
