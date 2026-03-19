import { LayerCoverSDK, FixedRateQuote, PurchaseResult, CoveragePool } from '../../index';
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
    /** Available pools (populated when no poolId is provided, or via discoverPools) */
    pools: CoveragePool[];
    /** Manually trigger pool discovery */
    discoverPools: () => Promise<void>;
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
    /** Calculate premium for given amount and duration */
    calculatePremium: (amount: string, durationWeeks: number) => bigint | null;
    /** Purchase coverage */
    purchase: (amount: string, durationWeeks: number, onApprove?: () => void, onPurchase?: () => void) => Promise<PurchaseResult | null>;
    txStatus: string;
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
export declare function useLayerCover({ signer, policyManagerAddress, poolId, decimals, apiBaseUrl, deployment, referralCode, refreshIntervalMs, }: UseLayerCoverOptions): UseLayerCoverResult;
//# sourceMappingURL=useLayerCover.d.ts.map