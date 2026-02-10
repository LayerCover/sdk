"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.useLayerCover = useLayerCover;
const react_1 = require("react");
const index_1 = require("../../index");
const errors_1 = require("../../errors");
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
function useLayerCover({ signer, policyManagerAddress, poolId, decimals = 6, apiBaseUrl, deployment, referralCode, refreshIntervalMs = 30000, }) {
    const [sdk, setSdk] = (0, react_1.useState)(null);
    const [pools, setPools] = (0, react_1.useState)([]);
    const [quotes, setQuotes] = (0, react_1.useState)([]);
    const [selectedQuote, setSelectedQuote] = (0, react_1.useState)(null);
    const [loading, setLoading] = (0, react_1.useState)(false);
    const [error, setError] = (0, react_1.useState)('');
    const [txStatus, setTxStatus] = (0, react_1.useState)('');
    const stopWatchRef = (0, react_1.useRef)(null);
    // Initialize SDK — supports both direct constructor and auto-config
    (0, react_1.useEffect)(() => {
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
                    instance = new index_1.LayerCoverSDK(signer, policyManagerAddress, {
                        apiBaseUrl,
                        deployment,
                    });
                }
                else {
                    // Auto-config via SDK.create()
                    instance = await index_1.LayerCoverSDK.create(signer, {
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
                    setError((0, errors_1.getHumanError)(e));
                }
            }
        };
        init();
        return () => { cancelled = true; };
    }, [signer, policyManagerAddress, apiBaseUrl, deployment]);
    // Pool discovery — auto-fetch when no poolId is set
    const discoverPools = (0, react_1.useCallback)(async () => {
        if (!sdk)
            return;
        try {
            setLoading(true);
            const poolList = await sdk.listPools();
            setPools(poolList);
        }
        catch (e) {
            setError((0, errors_1.getHumanError)(e));
        }
        finally {
            setLoading(false);
        }
    }, [sdk]);
    (0, react_1.useEffect)(() => {
        if (sdk && !poolId) {
            discoverPools();
        }
    }, [sdk, poolId, discoverPools]);
    // Quote watching with auto-refresh — activated when poolId is set
    const fetchQuotes = (0, react_1.useCallback)(async () => {
        if (!sdk || !poolId) {
            setQuotes([]);
            return;
        }
        setLoading(true);
        setError('');
        try {
            const fetched = await sdk.getFixedRateQuotes(poolId);
            const active = fetched
                .filter(q => !index_1.LayerCoverSDK.isQuoteExpired(q) && q.status === 'active');
            const sorted = index_1.LayerCoverSDK.sortQuotesByRate(active);
            setQuotes(sorted);
            if (sorted.length > 0 && !selectedQuote) {
                setSelectedQuote(sorted[0]);
            }
        }
        catch (e) {
            setQuotes([]);
            setError((0, errors_1.getHumanError)(e));
        }
        finally {
            setLoading(false);
        }
    }, [sdk, poolId, selectedQuote]);
    // Set up watchQuotes auto-refresh
    (0, react_1.useEffect)(() => {
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
    const selectQuote = (0, react_1.useCallback)((quote) => {
        setSelectedQuote(quote);
    }, []);
    const calculatePremium = (0, react_1.useCallback)((amount, durationWeeks) => {
        if (!sdk || !selectedQuote || !amount || Number(amount) <= 0) {
            return null;
        }
        try {
            const { parseUnits } = require('ethers');
            const amountBigInt = parseUnits(amount, decimals);
            const durationSeconds = durationWeeks * 7 * 24 * 60 * 60;
            return sdk.calculatePremium(amountBigInt, selectedQuote.premiumRateBps, durationSeconds);
        }
        catch {
            return null;
        }
    }, [sdk, selectedQuote, decimals]);
    const purchase = (0, react_1.useCallback)(async (amount, durationWeeks, onApprove, onPurchase) => {
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
            const { parseUnits } = await Promise.resolve().then(() => __importStar(require('ethers')));
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
            setError((0, errors_1.getHumanError)(e));
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
//# sourceMappingURL=useLayerCover.js.map