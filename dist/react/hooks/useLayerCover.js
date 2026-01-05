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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.useLayerCover = void 0;
const react_1 = require("react");
const index_1 = require("../../index");
/**
 * React hook for interacting with LayerCover SDK.
 * Provides fixed-rate quote fetching and purchase functionality.
 */
function useLayerCover({ signer, policyManagerAddress, poolId, decimals = 6, apiBaseUrl, deployment, referralCode, }) {
    const [sdk, setSdk] = (0, react_1.useState)(null);
    const [quotes, setQuotes] = (0, react_1.useState)([]);
    const [selectedQuote, setSelectedQuote] = (0, react_1.useState)(null);
    const [loading, setLoading] = (0, react_1.useState)(false);
    const [error, setError] = (0, react_1.useState)('');
    const [txStatus, setTxStatus] = (0, react_1.useState)('');
    // Initialize SDK when signer is available
    (0, react_1.useEffect)(() => {
        if (signer && policyManagerAddress) {
            try {
                const instance = new index_1.LayerCoverSDK(signer, policyManagerAddress, {
                    apiBaseUrl,
                    deployment,
                });
                setSdk(instance);
            }
            catch (e) {
                setError(e.message || 'Failed to initialize SDK');
            }
        }
        else {
            setSdk(null);
        }
    }, [signer, policyManagerAddress, apiBaseUrl, deployment]);
    // Fetch quotes when SDK and poolId are ready
    const fetchQuotes = (0, react_1.useCallback)(async () => {
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
        }
        catch (e) {
            console.error('Fetch quotes error:', e);
            setQuotes([]);
            setError(e.message || 'Failed to fetch quotes');
        }
        finally {
            setLoading(false);
        }
    }, [sdk, poolId, selectedQuote]);
    // Auto-fetch quotes on mount
    (0, react_1.useEffect)(() => {
        if (sdk && poolId) {
            fetchQuotes();
        }
    }, [sdk, poolId]); // Note: intentionally not including fetchQuotes to avoid loop
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
        catch (e) {
            console.error('Calculate premium error:', e);
            return null;
        }
    }, [sdk, selectedQuote, decimals]);
    const purchase = (0, react_1.useCallback)(async (amount, durationWeeks, onApprove, onPurchase) => {
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
            const { parseUnits } = await Promise.resolve().then(() => __importStar(require('ethers')));
            const coverageAmount = parseUnits(amount, decimals);
            const durationSeconds = durationWeeks * 7 * 24 * 60 * 60;
            // Calculate premium
            const premium = sdk.calculatePremium(coverageAmount, selectedQuote.premiumRateBps, durationSeconds);
            const premiumWithBuffer = (premium * 105n) / 100n;
            // Approve
            setTxStatus('Approving...');
            const approveTx = await sdk.prepareApprovalTx(poolId, premiumWithBuffer);
            const approveResult = await signer.sendTransaction(approveTx);
            await approveResult.wait();
            onApprove?.();
            // Purchase
            setTxStatus('Purchasing...');
            let result;
            if (selectedQuote.orderId) {
                // Use buyFromQuote for on-chain orders
                const purchaseTx = await sdk.prepareBuyFromQuoteTx(selectedQuote.orderId, coverageAmount, durationSeconds, referralCode);
                const purchaseResult = await signer.sendTransaction(purchaseTx);
                const receipt = await purchaseResult.wait();
                result = { txHash: purchaseResult.hash };
            }
            else {
                // Use full intent flow
                result = await sdk.purchaseWithIntent(selectedQuote, coverageAmount, durationSeconds, referralCode);
            }
            onPurchase?.();
            setTxStatus('Success! Cover purchased.');
            // Refresh quotes after purchase
            await fetchQuotes();
            return result;
        }
        catch (e) {
            console.error('Purchase error:', e);
            setTxStatus('');
            setError(e.message || 'Purchase failed');
            return null;
        }
        finally {
            setLoading(false);
        }
    }, [sdk, signer, selectedQuote, poolId, decimals, fetchQuotes]);
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
exports.useLayerCover = useLayerCover;
