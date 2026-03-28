import { useState, useEffect, useCallback, useRef } from 'react';
import { LayerCoverSDK, FixedRateQuote, PurchaseResult, CoveragePool, PreparedPurchase } from '../../index';
import { getHumanError } from '../../errors';
import type { Signer, Provider } from 'ethers-v6';

export interface UseLayerCoverOptions {
    /** Ethers v6 signer (for purchases) or provider (for read-only) */
    signer?: Signer | Provider;
    /** Policy manager address — optional if using SDK.create() auto-config */
    policyManagerAddress?: string;
    /** Pool ID to fetch quotes for (optional: omit to browse pools first) */
    poolId?: number;
    /** Token decimals (default: 6 for USDC) */
    decimals?: number;
    /** Optional API base URL (default: https://app.layercover.com) */
    apiBaseUrl?: string;
    /** Optional deployment identifier */
    deployment?: string;
    /** Optional referral code (bytes32 hex string) */
    referralCode?: string;
    /** Auto-refresh quotes interval in ms (default: 30000, set 0 to disable) */
    refreshIntervalMs?: number;
}

export interface UseLayerCoverResult {
    sdk: LayerCoverSDK | null;

    // ── Pool Discovery ──────────────────────────────────────────
    /** Available pools (populated when no poolId is provided, or via discoverPools) */
    pools: CoveragePool[];
    /** Manually trigger pool discovery */
    discoverPools: () => Promise<void>;

    // ── Quotes ──────────────────────────────────────────────────
    /** Active (non-expired) quotes, sorted by rate */
    quotes: FixedRateQuote[];
    /** Currently selected quote */
    selectedQuote: FixedRateQuote | null;
    /** Best available rate in basis points */
    bestRate: number | null;
    /** Select a specific quote */
    selectQuote: (quote: FixedRateQuote | null) => void;
    /** Manually refresh quotes */
    fetchQuotes: () => Promise<void>;

    // ── Premium & Purchase ──────────────────────────────────────
    /** Calculate premium for given amount and duration */
    calculatePremium: (amount: string, durationWeeks: number) => bigint | null;
    /** Prepare approval/purchase transactions and blocker metadata */
    preparePurchase: (amount: string, durationWeeks: number) => Promise<PreparedPurchase | null>;
    /** Purchase coverage */
    purchase: (amount: string, durationWeeks: number, onApprove?: () => void, onPurchase?: () => void) => Promise<PurchaseResult | null>;
    txStatus: string;

    // ── State ───────────────────────────────────────────────────
    loading: boolean;
    error: string;
}

/**
 * React hook for interacting with LayerCover SDK.
 *
 * Provides pool discovery, live auto-refreshing quotes, and purchase functionality.
 *
 * @example Basic usage with poolId
 * ```tsx
 * const { quotes, bestRate, purchase } = useLayerCover({
 *     signer,
 *     poolId: 1,
 *     apiBaseUrl: 'https://app.layercover.com',
 * });
 * ```
 *
 * @example Pool discovery mode (no poolId)
 * ```tsx
 * const { pools, discoverPools, quotes, purchase } = useLayerCover({
 *     signer,
 *     apiBaseUrl: 'https://app.layercover.com',
 * });
 * // pools is populated automatically — user picks one, then you set poolId
 * ```
 */
export function useLayerCover({
    signer,
    policyManagerAddress,
    poolId,
    decimals = 6,
    apiBaseUrl,
    deployment,
    referralCode,
    refreshIntervalMs = 30_000,
}: UseLayerCoverOptions): UseLayerCoverResult {
    const [sdk, setSdk] = useState<LayerCoverSDK | null>(null);
    const [pools, setPools] = useState<CoveragePool[]>([]);
    const [quotes, setQuotes] = useState<FixedRateQuote[]>([]);
    const [selectedQuote, setSelectedQuote] = useState<FixedRateQuote | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [txStatus, setTxStatus] = useState('');
    const stopWatchRef = useRef<(() => void) | null>(null);

    // Initialize SDK — supports both direct constructor and auto-config
    useEffect(() => {
        let cancelled = false;

        const init = async () => {
            if (!signer) {
                setSdk(null);
                return;
            }

            try {
                let instance: LayerCoverSDK;

                if (policyManagerAddress) {
                    // Direct constructor (backward compatible)
                    instance = new LayerCoverSDK(signer as any, policyManagerAddress, {
                        apiBaseUrl,
                        deployment,
                    });
                } else {
                    // Auto-config via SDK.create()
                    instance = await LayerCoverSDK.create(signer as any, {
                        apiBaseUrl,
                        deployment,
                    });
                }

                if (!cancelled) {
                    setSdk(instance);
                }
            } catch (e: any) {
                if (!cancelled) {
                    setError(getHumanError(e));
                }
            }
        };

        init();
        return () => { cancelled = true; };
    }, [signer, policyManagerAddress, apiBaseUrl, deployment]);

    // Pool discovery — auto-fetch when no poolId is set
    const discoverPools = useCallback(async () => {
        if (!sdk) return;
        try {
            setLoading(true);
            const poolList = await sdk.listPools();
            setPools(poolList);
        } catch (e: any) {
            setError(getHumanError(e));
        } finally {
            setLoading(false);
        }
    }, [sdk]);

    useEffect(() => {
        if (sdk && !poolId) {
            discoverPools();
        }
    }, [sdk, poolId, discoverPools]);

    // Quote watching with auto-refresh — activated when poolId is set
    const fetchQuotes = useCallback(async () => {
        if (!sdk || !poolId) {
            setQuotes([]);
            return;
        }
        setLoading(true);
        setError('');
        try {
            const fetched = await sdk.getFixedRateQuotes(poolId);
            const active = fetched
                .filter(q => !LayerCoverSDK.isQuoteExpired(q) && q.status === 'active');
            const sorted = LayerCoverSDK.sortQuotesByRate(active);
            setQuotes(sorted);
            if (sorted.length > 0 && !selectedQuote) {
                setSelectedQuote(sorted[0]);
            }
        } catch (e: any) {
            setQuotes([]);
            setError(getHumanError(e));
        } finally {
            setLoading(false);
        }
    }, [sdk, poolId, selectedQuote]);

    // Set up watchQuotes auto-refresh
    useEffect(() => {
        // Clean up previous watcher
        if (stopWatchRef.current) {
            stopWatchRef.current();
            stopWatchRef.current = null;
        }

        if (!sdk || !poolId || refreshIntervalMs <= 0) return;

        const stop = sdk.watchQuotes(poolId, (freshQuotes) => {
            setQuotes(freshQuotes);
            if (freshQuotes.length > 0) {
                setSelectedQuote(prev =>
                    prev ? freshQuotes.find(q => q.id === prev.id) || freshQuotes[0] : freshQuotes[0]
                );
            }
        }, { refreshIntervalMs });

        stopWatchRef.current = stop;

        return () => {
            stop();
            stopWatchRef.current = null;
        };
    }, [sdk, poolId, refreshIntervalMs]);

    const selectQuote = useCallback((quote: FixedRateQuote | null) => {
        setSelectedQuote(quote);
    }, []);

    const calculatePremium = useCallback(
        (amount: string, durationWeeks: number): bigint | null => {
            if (!sdk || !selectedQuote || !amount || Number(amount) <= 0) {
                return null;
            }
            try {
                const { parseUnits } = require('ethers-v6');
                const amountBigInt = parseUnits(amount, decimals);
                const durationSeconds = durationWeeks * 7 * 24 * 60 * 60;
                return sdk.calculatePremium(amountBigInt, selectedQuote.premiumRateBps, durationSeconds);
            } catch {
                return null;
            }
        },
        [sdk, selectedQuote, decimals]
    );

    const preparePurchase = useCallback(
        async (amount: string, durationWeeks: number): Promise<PreparedPurchase | null> => {
            if (!sdk || !poolId) {
                setError('SDK or pool not available');
                return null;
            }

            try {
                const { parseUnits } = await import('ethers-v6');
                const coverageAmount = parseUnits(amount, decimals);
                const preparation = selectedQuote
                    ? await sdk.preparePurchaseFromQuote(
                        selectedQuote,
                        coverageAmount,
                        durationWeeks,
                        undefined,
                        referralCode
                    )
                    : await sdk.preparePurchase(
                        poolId,
                        coverageAmount,
                        durationWeeks,
                        undefined,
                        referralCode
                    );
                if (preparation.quote) {
                    setSelectedQuote(preparation.quote);
                }

                if (preparation.status === 'blocked' || preparation.status === 'signer_required' || preparation.status === 'chain_mismatch') {
                    setError(preparation.blockers.map((blocker) => blocker.message).join(' '));
                } else {
                    setError('');
                }

                return preparation;
            } catch (e: any) {
                setError(getHumanError(e));
                return null;
            }
        },
        [sdk, poolId, decimals, referralCode, selectedQuote]
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
            if (!poolId) {
                setError('Pool not available.');
                return null;
            }

            setLoading(true);
            setTxStatus('Preparing...');
            setError('');

            try {
                const preparation = await preparePurchase(amount, durationWeeks);
                if (!preparation) {
                    return null;
                }
                if (preparation.status === 'blocked' || preparation.status === 'signer_required' || preparation.status === 'chain_mismatch') {
                    throw new Error(preparation.blockers.map((blocker) => blocker.message).join(' '));
                }
                if (!preparation.purchaseTx) {
                    throw new Error('Purchase transaction could not be prepared');
                }

                if (preparation.approvalTx) {
                    setTxStatus('Approving...');
                    const approveResult = await (signer as any).sendTransaction(preparation.approvalTx);
                    await approveResult.wait();
                    onApprove?.();
                }

                setTxStatus('Purchasing...');
                const purchaseResult = await (signer as any).sendTransaction(preparation.purchaseTx);
                await purchaseResult.wait();
                const result: PurchaseResult = { txHash: purchaseResult.hash };

                onPurchase?.();
                setTxStatus('Success! Cover purchased.');
                return result;
            } catch (e: any) {
                setTxStatus('');
                setError(getHumanError(e));
                return null;
            } finally {
                setLoading(false);
            }
        },
        [sdk, signer, poolId, preparePurchase]
    );

    const bestRate = quotes.length > 0 ? quotes[0].premiumRateBps : null;

    return {
        sdk,
        pools,
        discoverPools,
        quotes,
        selectedQuote,
        bestRate,
        loading,
        error,
        fetchQuotes,
        selectQuote,
        calculatePremium,
        preparePurchase,
        purchase,
        txStatus,
    };
}
