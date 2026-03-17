import { useState, useEffect, useCallback, useRef } from 'react';
import { LayerCoverSDK } from '../../index';
import { getHumanError } from '../../errors';
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
export function useLayerCover({ signer, policyManagerAddress, poolId, decimals = 6, apiBaseUrl, deployment, referralCode, refreshIntervalMs = 30000, }) {
    const [sdk, setSdk] = useState(null);
    const [pools, setPools] = useState([]);
    const [quotes, setQuotes] = useState([]);
    const [selectedQuote, setSelectedQuote] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [txStatus, setTxStatus] = useState('');
    const stopWatchRef = useRef(null);
    // Initialize SDK — supports both direct constructor and auto-config
    useEffect(() => {
        let cancelled = false;
        const init = async () => {
            if (!signer) {
                setSdk(null);
                return;
            }
            try {
                let instance;
                if (policyManagerAddress) {
                    // Direct constructor (backward compatible)
                    instance = new LayerCoverSDK(signer, policyManagerAddress, {
                        apiBaseUrl,
                        deployment,
                    });
                }
                else {
                    // Auto-config via SDK.create()
                    instance = await LayerCoverSDK.create(signer, {
                        apiBaseUrl,
                        deployment,
                    });
                }
                if (!cancelled) {
                    setSdk(instance);
                }
            }
            catch (e) {
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
        if (!sdk)
            return;
        try {
            setLoading(true);
            const poolList = await sdk.listPools();
            setPools(poolList);
        }
        catch (e) {
            setError(getHumanError(e));
        }
        finally {
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
        }
        catch (e) {
            setQuotes([]);
            setError(getHumanError(e));
        }
        finally {
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
        if (!sdk || !poolId || refreshIntervalMs <= 0)
            return;
        const stop = sdk.watchQuotes(poolId, (freshQuotes) => {
            setQuotes(freshQuotes);
            if (freshQuotes.length > 0) {
                setSelectedQuote(prev => prev ? freshQuotes.find(q => q.id === prev.id) || freshQuotes[0] : freshQuotes[0]);
            }
        }, { refreshIntervalMs });
        stopWatchRef.current = stop;
        return () => {
            stop();
            stopWatchRef.current = null;
        };
    }, [sdk, poolId, refreshIntervalMs]);
    const selectQuote = useCallback((quote) => {
        setSelectedQuote(quote);
    }, []);
    const calculatePremium = useCallback((amount, durationWeeks) => {
        if (!sdk || !selectedQuote || !amount || Number(amount) <= 0) {
            return null;
        }
        try {
            const { parseUnits } = require('ethers-v6');
            const amountBigInt = parseUnits(amount, decimals);
            const durationSeconds = durationWeeks * 7 * 24 * 60 * 60;
            return sdk.calculatePremium(amountBigInt, selectedQuote.premiumRateBps, durationSeconds);
        }
        catch {
            return null;
        }
    }, [sdk, selectedQuote, decimals]);
    const purchase = useCallback(async (amount, durationWeeks, onApprove, onPurchase) => {
        if (!sdk || !signer) {
            setError('SDK or signer not available');
            return null;
        }
        if (!selectedQuote) {
            setError('No quote selected.');
            return null;
        }
        setLoading(true);
        setTxStatus('Preparing...');
        setError('');
        try {
            const { parseUnits } = await import('ethers-v6');
            const coverageAmount = parseUnits(amount, decimals);
            const durationSeconds = durationWeeks * 7 * 24 * 60 * 60;
            const premium = sdk.calculatePremium(coverageAmount, selectedQuote.premiumRateBps, durationSeconds);
            const premiumWithBuffer = (premium * 105n) / 100n;
            setTxStatus('Approving...');
            const approveTx = await sdk.prepareApprovalTx(poolId, premiumWithBuffer);
            const approveResult = await signer.sendTransaction(approveTx);
            await approveResult.wait();
            onApprove?.();
            setTxStatus('Purchasing...');
            let result;
            if (selectedQuote.orderId) {
                const purchaseTx = await sdk.prepareBuyFromQuoteTx(selectedQuote.orderId, coverageAmount, durationSeconds, referralCode);
                const purchaseResult = await signer.sendTransaction(purchaseTx);
                await purchaseResult.wait();
                result = { txHash: purchaseResult.hash };
            }
            else {
                result = await sdk.purchaseWithIntent(selectedQuote, coverageAmount, durationSeconds, referralCode);
            }
            onPurchase?.();
            setTxStatus('Success! Cover purchased.');
            return result;
        }
        catch (e) {
            setTxStatus('');
            setError(getHumanError(e));
            return null;
        }
        finally {
            setLoading(false);
        }
    }, [sdk, signer, selectedQuote, poolId, decimals, referralCode]);
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
        purchase,
        txStatus,
    };
}
