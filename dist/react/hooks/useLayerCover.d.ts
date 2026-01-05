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
export declare function useLayerCover({ signer, policyManagerAddress, poolId, decimals, apiBaseUrl, deployment, referralCode, }: UseLayerCoverOptions): UseLayerCoverResult;
