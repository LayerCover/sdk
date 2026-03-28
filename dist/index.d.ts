import { ethers, Contract, Signer, Provider } from 'ethers-v6';
import { LayerCoverSDKError } from './errors';
export * from './adapters';
export * from './viem-adapter';
export * from './errors';
/** Internal no-op logger. Override via `options.debug` or `options.logger`. */
type LogFn = (...args: any[]) => void;
/**
 * Logger interface for SDK debug output.
 * Defaults to silent. Enable with `debug: true` or supply a custom logger.
 */
export interface SDKLogger {
    debug: LogFn;
    warn: LogFn;
    error: LogFn;
}
export type SDKEventType = 'quotes_fetched' | 'quote_revalidated' | 'purchase_prepared' | 'purchase_preparation_blocked' | 'approval_submitted' | 'approval_confirmed' | 'purchase_submitted' | 'purchase_confirmed' | 'purchase_sync_succeeded' | 'purchase_sync_failed';
export interface SDKEvent {
    type: SDKEventType;
    timestamp: string;
    chainId: number;
    deployment: string;
    data: Record<string, unknown>;
}
/**
 * Quote from a syndicate for fixed-rate coverage
 */
export interface FixedRateQuote {
    /** Unique quote identifier */
    id: string;
    /** Pool ID this quote applies to */
    poolId: number;
    /** Syndicate wallet address */
    syndicateAddress: string;
    /** Human-readable syndicate name */
    syndicateName: string;
    /** Maximum coverage available (as BigInt string) */
    coverageAmount: string;
    /** Premium rate in basis points (e.g., 500 = 5%) */
    premiumRateBps: number;
    /** Minimum coverage duration in weeks */
    minDurationWeeks: number;
    /** Maximum coverage duration in weeks */
    maxDurationWeeks: number;
    /** Quote expiration timestamp (ISO string) */
    expiresAt: string;
    /** Quote status */
    status: 'active' | 'expired' | 'filled';
    /** On-chain sell order ID (if posted) */
    orderId?: number;
    /** On-chain QuoteBook quote id for direct PurchaseGateway fills */
    quoteBookQuoteId?: string;
    /** Whether the quote requires the full premium upfront */
    requiresUpfront?: boolean;
    /** Minimum fill amount required by the on-chain quote */
    minFillAmount?: string;
    /** QuoteBook extension address associated with this quote */
    quoteBookExtension?: string;
    /** Origin of the quote */
    quoteSource?: string;
    /** When this quote snapshot was fetched by the SDK */
    fetchedAt?: string;
}
/**
 * Result of a purchase transaction
 */
export interface PurchaseResult {
    txHash: string;
    policyId?: string;
}
export type PurchaseBlockerCode = 'NO_ACTIVE_QUOTES' | 'RATE_TOO_HIGH' | 'QUOTE_STALE' | 'NON_EXECUTABLE_QUOTE' | 'AMOUNT_EXCEEDS_CAPACITY' | 'AMOUNT_BELOW_MIN_FILL' | 'DURATION_OUT_OF_RANGE' | 'SIGNER_REQUIRED' | 'CHAIN_MISMATCH';
export interface PurchaseBlocker {
    code: PurchaseBlockerCode;
    message: string;
    quoteId?: string;
}
interface PreparedPurchaseBase {
    quote: FixedRateQuote | null;
    coverageAmount: bigint;
    durationWeeks: number;
    durationSeconds: number;
    referralCode: string;
}
export interface PreparedPurchaseBlocked extends PreparedPurchaseBase {
    status: 'blocked';
    blockers: PurchaseBlocker[];
    paymentTokenAddress?: undefined;
    purchaseGatewayAddress?: undefined;
    quoteBookQuoteId?: undefined;
    requiresUpfront?: undefined;
    minFillAmount?: undefined;
    premium?: undefined;
    premiumDeposit?: undefined;
    approvalAmount?: undefined;
    approvalNeeded?: undefined;
    approvalTx?: undefined;
    purchaseTx?: undefined;
}
interface PreparedExecutablePurchaseBase extends PreparedPurchaseBase {
    quote: FixedRateQuote;
    blockers: PurchaseBlocker[];
    paymentTokenAddress?: string;
    purchaseGatewayAddress?: string;
    quoteBookQuoteId?: string;
    requiresUpfront?: boolean;
    minFillAmount?: bigint;
    premium?: bigint;
    premiumDeposit?: bigint;
    approvalAmount?: bigint;
    approvalTx?: ethers.TransactionRequest;
    purchaseTx?: ethers.TransactionRequest;
}
export interface PreparedPurchaseReady extends PreparedExecutablePurchaseBase {
    status: 'ready';
    blockers: [];
    paymentTokenAddress: string;
    purchaseGatewayAddress: string;
    quoteBookQuoteId: string;
    requiresUpfront: boolean;
    minFillAmount: bigint;
    premium: bigint;
    premiumDeposit: bigint;
    approvalAmount: bigint;
    approvalNeeded: false;
    approvalTx?: undefined;
    purchaseTx: ethers.TransactionRequest;
}
export interface PreparedPurchaseApprovalRequired extends PreparedExecutablePurchaseBase {
    status: 'approval_required';
    blockers: [];
    paymentTokenAddress: string;
    purchaseGatewayAddress: string;
    quoteBookQuoteId: string;
    requiresUpfront: boolean;
    minFillAmount: bigint;
    premium: bigint;
    premiumDeposit: bigint;
    approvalAmount: bigint;
    approvalNeeded: true;
    approvalTx: ethers.TransactionRequest;
    purchaseTx: ethers.TransactionRequest;
}
export interface PreparedPurchaseSignerRequired extends PreparedExecutablePurchaseBase {
    status: 'signer_required';
    paymentTokenAddress: string;
    purchaseGatewayAddress: string;
    quoteBookQuoteId: string;
    requiresUpfront: boolean;
    minFillAmount: bigint;
    premium: bigint;
    premiumDeposit: bigint;
    approvalAmount: bigint;
    approvalNeeded?: undefined;
    approvalTx: ethers.TransactionRequest;
    purchaseTx: ethers.TransactionRequest;
}
export interface PreparedPurchaseChainMismatch extends PreparedExecutablePurchaseBase {
    status: 'chain_mismatch';
    paymentTokenAddress: string;
    purchaseGatewayAddress: string;
    quoteBookQuoteId: string;
    requiresUpfront: boolean;
    minFillAmount: bigint;
    premium: bigint;
    premiumDeposit: bigint;
    approvalAmount: bigint;
    approvalNeeded?: undefined;
    approvalTx: ethers.TransactionRequest;
    purchaseTx: ethers.TransactionRequest;
}
export type PreparedPurchase = PreparedPurchaseBlocked | PreparedPurchaseReady | PreparedPurchaseApprovalRequired | PreparedPurchaseSignerRequired | PreparedPurchaseChainMismatch;
export interface SyndicateDepositOptions {
    /** Defaults to signer address. Must equal signer for current Syndicate auth model. */
    receiver?: string;
    /** Optional explicit min shares bound. If omitted, SDK derives it from previewDeposit and slippageBps. */
    minShares?: bigint;
    /** Slippage tolerance in bps when deriving minShares. Default: 50 (0.5%). */
    slippageBps?: number;
    /** Absolute unix timestamp deadline override. */
    deadline?: number;
    /** Relative deadline in seconds from now when `deadline` is not provided. Default: 900s. */
    deadlineSeconds?: number;
}
export interface SyndicateMintOptions {
    /** Defaults to signer address. Must equal signer for current Syndicate auth model. */
    receiver?: string;
    /** Optional explicit max assets bound. If omitted, SDK derives it from previewMint and slippageBps. */
    maxAssets?: bigint;
    /** Slippage tolerance in bps when deriving maxAssets. Default: 50 (0.5%). */
    slippageBps?: number;
    /** Absolute unix timestamp deadline override. */
    deadline?: number;
    /** Relative deadline in seconds from now when `deadline` is not provided. Default: 900s. */
    deadlineSeconds?: number;
}
export interface SyndicateDeadlineOptions {
    /** Absolute unix timestamp deadline override. */
    deadline?: number;
    /** Relative deadline in seconds from now when `deadline` is not provided. Default: 900s. */
    deadlineSeconds?: number;
}
export interface SyndicateUpkeepOptions extends SyndicateDeadlineOptions {
    /** Minimum required harvested amount when using guarded upkeep path. */
    minHarvestAmount?: bigint;
}
export interface PoolMetadata {
    poolId: number;
    /** Pool display name (e.g., "Aave USDC Pool") */
    poolName: string;
    /** Payment token address */
    tokenAddress: string;
    /** Token symbol (e.g., "USDC") */
    tokenSymbol: string;
    /** Token decimals (e.g., 6) */
    tokenDecimals: number;
    /** Token display name (e.g., "USD Coin") */
    tokenName: string;
    /** Token logo URL */
    tokenLogoUrl: string;
    /** Payout token symbol (usually USDC) */
    payoutTokenSymbol: string;
    /** Payout token logo URL */
    payoutTokenLogoUrl: string;
}
/**
 * Detailed on-chain policy data returned by getPolicyDetails / getMyPolicies
 */
export interface UserPolicy {
    /** On-chain policy NFT ID */
    policyId: number;
    /** Owner wallet address */
    owner: string;
    /** Pool ID the policy belongs to */
    poolId: number;
    /** Coverage amount (raw BigInt string, in token decimals) */
    coverage: string;
    /** Policy start timestamp (unix seconds) */
    startTimestamp: number;
    /** Policy activation timestamp */
    activationTimestamp: number;
    /** Earliest timestamp a claim can be filed */
    claimableFrom: number;
    /** Whether the policy has been voided */
    voided: boolean;
    /** Remaining premium deposit (raw BigInt string) */
    premiumDeposit: string;
    /** Fixed rate in basis points */
    fixedRateBps: number;
    /** Policy end timestamp (unix seconds) */
    endTimestamp: number;
    /** Underwriter (syndicate) address */
    underwriter: string;
    /** Cancellation penalty in basis points */
    cancellationPenaltyBps: number;
    /** Whether the policy is currently active on-chain */
    isActive: boolean;
    /** Human-readable status */
    status: 'active' | 'expired' | 'cancelled' | 'voided';
    /** Vault cover info (if applicable) */
    vaultCover?: {
        vault: string;
        sharesInsured: string;
        insuredValueUSDC: string;
    };
}
/**
 * Enriched pool data for 3rd-party discovery.
 * Returned by `listPools()` and `getPool()` — no need to know pool IDs upfront.
 */
export interface CoveragePool {
    /** On-chain pool ID */
    poolId: number;
    /** Human-readable pool name (e.g., "DAI", "Gauntlet Prime USDC", "California Earthquake (M6.0+)") */
    name: string;
    /** High-level category: "stablecoin_depeg", "vault_cover", "parametric", "other" */
    category: string;
    /** Pool type: "stablecoin", "vault", "catastrophe", "agriculture", "defi" */
    type: string;
    /** Pool sub-category if applicable (e.g., "earthquake", "hurricane", "bridge") */
    subCategory?: string;
    /** Available coverage in base units (BigInt string) */
    availableCoverage: string;
    /** Total coverage already sold in base units (BigInt string) */
    totalCoverageSold: string;
    /** Best available premium rate in basis points, 0 if no quotes */
    bestRateBps: number;
    /** Risk rating (e.g., "A", "AA", "B", "C") */
    riskRating: string;
    /** URL-friendly slug (e.g., "dai-base", "usdc-gauntlet-prime-usdc") */
    slug: string;
    /** Token symbol for the covered asset */
    tokenSymbol: string;
    /** Logo URL for the covered asset */
    tokenLogoUrl: string;
    /** Whether this pool uses an optimistic oracle for claims */
    isOptimisticOracle: boolean;
    /** Whether this pool is deprecated and should not be shown to new buyers */
    deprecated: boolean;
    /** Deployment instance (e.g., "base_sepolia_usdc") */
    deployment: string;
}
/**
 * Options for filtering pools in `listPools()`
 */
export interface ListPoolsOptions {
    /** Filter by category (e.g., "vault_cover", "stablecoin_depeg", "parametric") */
    category?: string;
    /** Filter by type (e.g., "stablecoin", "vault", "catastrophe") */
    type?: string;
    /** If true, include deprecated pools (default: false) */
    includeDeprecated?: boolean;
    /** If true, only return pools that have available coverage (default: false) */
    onlyWithCoverage?: boolean;
}
/**
 * Static pool configuration for off-chain metadata (logos, display names)
 * This can be extended or overridden by integrators
 */
export declare const POOL_CONFIG: Record<number, {
    poolName: string;
    tokenLogoUrl: string;
}>;
/**
 * Token symbol to logo URL mapping
 * Used to resolve token logos dynamically from chain data
 * Order matters - more specific tokens should come before generic ones
 */
export declare const TOKEN_LOGOS: Record<string, string>;
/**
 * Get token logo URL from symbol
 */
export declare function getTokenLogoUrl(symbol: string): string;
/**
 * Legacy chain-level fallback addresses.
 * Prefer deployment-aware config via `/api/config` when available.
 */
export declare const CONTRACT_ADDRESSES: Record<number, {
    policyManager: string;
    intentOrderBook: string;
    poolRegistry?: string;
    capitalPool?: string;
    purchaseGateway?: string;
    quoteBookExtension?: string;
    systemRegistry?: string;
}>;
type FallbackDeploymentConfig = {
    chainId: number;
    contracts: {
        policyManager: string;
        intentOrderBook: string;
        poolRegistry?: string;
        purchaseGateway?: string;
        quoteBookExtension?: string;
        systemRegistry?: string;
    };
};
export declare const DEPLOYMENT_FALLBACK_CONFIGS: Record<string, FallbackDeploymentConfig>;
/**
 * Get the PolicyManager address for a given chain
 * @param chainId The chain ID
 * @returns The PolicyManager contract address
 */
export declare function getPolicyManagerAddress(chainId: number): string;
/**
 * Get the IntentOrderBook address for a given chain
 * @param chainId The chain ID
 * @returns The IntentOrderBook contract address
 */
export declare function getIntentOrderBookAddress(chainId: number): string;
/**
 * Default chain ID for LayerCover (Ethereum Sepolia testnet)
 */
export declare const DEFAULT_CHAIN_ID = 11155111;
/**
 * Default API base URL for LayerCover
 */
export declare const DEFAULT_API_BASE_URL = "https://app.layercover.com";
/**
 * Thrown when the best available premium rate exceeds the caller's maximum.
 * Contains both the actual rate and the requested ceiling for UI messaging.
 */
export declare class RateTooHighError extends LayerCoverSDKError {
    rate: number;
    maxRate: number;
    constructor(message: string, rate: number, maxRate: number);
}
/**
 * Thrown when no underwriter quotes are available for a pool.
 * This typically means no syndicates are currently offering coverage.
 */
export declare class NoQuotesAvailableError extends LayerCoverSDKError {
    constructor(message: string);
}
export interface LayerCoverSDKOptions {
    /** IntentOrderBook contract address (auto-resolved from chainId if not provided) */
    intentOrderBookAddress?: string;
    /** PolicyNFT contract address (auto-resolved from on-chain if not provided) */
    policyNFTAddress?: string;
    /** PoolRegistry contract address (optional explicit override) */
    poolRegistryAddress?: string;
    /** PurchaseGateway contract address for direct QuoteBook purchases */
    purchaseGatewayAddress?: string;
    /** QuoteBookExtension contract address */
    quoteBookExtensionAddress?: string;
    /** SystemRegistry contract address for runtime contract discovery */
    systemRegistryAddress?: string;
    /** API base URL for fetching quotes (default: https://app.layercover.com) */
    apiBaseUrl?: string;
    /** Deployment identifier (e.g., 'base_sepolia_usdc') */
    deployment?: string;
    /** Chain ID (used to resolve contract addresses) */
    chainId?: number;
    /** HTTP timeout for SDK API requests (milliseconds). Default: 15000 */
    requestTimeoutMs?: number;
    /** Max retry attempts for transient API failures (idempotent methods only). Default: 2 */
    maxRetries?: number;
    /** Base delay before retries (milliseconds, exponential backoff). Default: 300 */
    retryDelayMs?: number;
    /** Required confirmations before SDK treats a tx as final. Default: 1 */
    txConfirmations?: number;
    /** Max time to wait for tx confirmation (milliseconds). Default: 180000 */
    txWaitTimeoutMs?: number;
    /**
     * Enable SDK debug logging. Pass `true` for console output,
     * or provide a custom `SDKLogger` for structured logging.
     * Default: silent (no console output).
     */
    debug?: boolean | SDKLogger;
    /** Optional structured lifecycle event hook for quotes, preflight, and transactions. */
    onEvent?: (event: SDKEvent) => void;
}
/**
 * Main entry point for interacting with the LayerCover protocol.
 *
 * Provides methods for pool discovery, quote fetching, coverage purchasing,
 * policy management, and syndicate operations. Supports both read-only
 * (provider) and write (signer) modes.
 *
 * @example
 * ```ts
 * // Recommended: auto-fetch config
 * const sdk = await LayerCoverSDK.create(signer, { chainId: 84532 });
 *
 * // List pools and buy coverage
 * const pools = await sdk.listPools({ category: 'vault_cover' });
 * const quotes = await sdk.getFixedRateQuotes(pools[0].poolId);
 * const result = await sdk.purchase(pools[0].poolId, amount, 4);
 * ```
 */
export declare class LayerCoverSDK {
    /** Ethers v6 provider for read-only calls */
    provider: Provider;
    /** Ethers v6 signer for write operations (undefined in read-only mode) */
    signer?: Signer;
    /** PolicyManager contract instance */
    policyManager: Contract;
    private _apiBaseUrl;
    private _deployment;
    private _chainId;
    private _log;
    private _onEvent?;
    private _requestTimeoutMs;
    private _maxRetries;
    private _retryDelayMs;
    private _txConfirmations;
    private _txWaitTimeoutMs;
    /** @internal Lazily resolved contract cache */
    private _poolRegistry?;
    private _underwriterManager?;
    private _riskManager?;
    private _rateEngine?;
    private _policyNFT?;
    private _policyNFTAddress?;
    private _poolRegistryAddress?;
    private _settlementAssetAddress?;
    private _purchaseGatewayAddress?;
    private _quoteBookExtensionAddress?;
    private _systemRegistryAddress?;
    constructor(providerOrSigner: Provider | Signer, policyManagerAddress: string, options?: LayerCoverSDKOptions);
    private _emitEvent;
    private _emitPreparedPurchaseEvent;
    private _buildPurchaseBlockedError;
    /**
     * Configuration fetched from the API
     */
    static _cachedConfig: {
        contracts: {
            policyManager: string;
            intentOrderBook: string;
            intentMatcher?: string;
            poolRegistry?: string;
            purchaseGateway?: string;
            quoteBookExtension?: string;
            systemRegistry?: string;
        };
        chainId: number;
        apiBaseUrl: string;
        deployment?: string;
        fetchedAt: number;
    } | null;
    private static _getDefaultDeploymentForChain;
    private static _getFallbackDeploymentConfig;
    private static _isCacheValid;
    private static _configFallback;
    /**
     * Fetch configuration from the LayerCover API.
     * This allows the SDK to dynamically get contract addresses without hardcoding.
     *
     * @param options Configuration options
     * @returns Contract configuration
     */
    static fetchConfig(options?: {
        apiBaseUrl?: string;
        chainId?: number;
        deployment?: string;
        requestTimeoutMs?: number;
        maxRetries?: number;
        retryDelayMs?: number;
    }): Promise<{
        contracts: {
            policyManager: string;
            intentOrderBook: string;
            intentMatcher?: string;
            policyNFT?: string;
            poolRegistry?: string;
            purchaseGateway?: string;
            quoteBookExtension?: string;
            systemRegistry?: string;
        };
        chainId: number;
        apiBaseUrl: string;
        deployment?: string;
    }>;
    /**
     * Create an SDK instance by automatically fetching configuration from the API.
     * This is the recommended way to initialize the SDK as it ensures you always
     * have the latest contract addresses.
     *
     * @param providerOrSigner Ethers provider or signer
     * @param options Configuration options
     * @returns Initialized SDK instance
     *
     * @example
     * ```typescript
     * // Auto-fetch config for Base Sepolia
     * const sdk = await LayerCoverSDK.create(signer, { chainId: 84532 });
     *
     * // Auto-fetch config for specific deployment
     * const sdk = await LayerCoverSDK.create(signer, { deployment: 'base_sepolia_usdc' });
     * ```
     */
    static create(providerOrSigner: Provider | Signer, options?: {
        apiBaseUrl?: string;
        chainId?: number;
        deployment?: string;
        debug?: boolean | SDKLogger;
        onEvent?: (event: SDKEvent) => void;
        requestTimeoutMs?: number;
        maxRetries?: number;
        retryDelayMs?: number;
        txConfirmations?: number;
        txWaitTimeoutMs?: number;
    }): Promise<LayerCoverSDK>;
    private _mapFixedRateQuote;
    private _normalizeFixedRateQuotes;
    private _fetchQuotesBatch;
    /**
     * Fetch available fixed-rate quotes from the orderbook API
     * @param poolId The pool ID to fetch quotes for
     * @returns Array of available quotes sorted by rate (lowest first)
     */
    getFixedRateQuotes(poolId: number): Promise<FixedRateQuote[]>;
    /**
     * Calculate the premium for a given coverage amount, rate, and duration
     * @param coverageAmount Amount to cover (in wei/smallest unit)
     * @param rateBps Rate in basis points (e.g., 500 = 5%)
     * @param durationSeconds Duration in seconds
     * @returns Premium amount (in wei/smallest unit)
     */
    calculatePremium(coverageAmount: bigint, rateBps: number, durationSeconds: number): bigint;
    /**
     * Get the best (lowest) rate available for a pool
     * @param poolId The pool ID
     * @returns Best rate in basis points, or null if no quotes available
     */
    getBestRate(poolId: number): Promise<number | null>;
    /**
     * Get the cheapest active quote that is executable for the requested amount and duration.
     *
     * @param poolId The pool ID
     * @param coverageAmount Desired coverage amount
     * @param durationWeeks Desired duration in weeks
     * @param maxRateBps Optional maximum acceptable premium rate
     * @returns The cheapest executable quote, or null if none can satisfy the request
     */
    getBestExecutableQuote(poolId: number, coverageAmount: bigint, durationWeeks: number, maxRateBps?: number): Promise<FixedRateQuote | null>;
    /**
     * Prepare a full buyer preflight for the current QuoteBook path.
     * Returns the selected quote, approval/purchase transactions, and structured blockers.
     *
     * @param poolId Pool to purchase from
     * @param coverageAmount Amount of coverage
     * @param durationWeeks Duration in weeks
     * @param maxRateBps Optional maximum acceptable rate
     * @param referralCode Optional referral code (bytes32)
     * @returns Prepared purchase state including transactions and blockers
     */
    preparePurchase(poolId: number, coverageAmount: bigint, durationWeeks: number, maxRateBps?: number, referralCode?: string): Promise<PreparedPurchase>;
    /**
     * Prepare a buyer preflight for a specific quote selected by the integrator.
     * This preserves quote choice instead of auto-switching to a cheaper executable quote.
     *
     * @param quote The exact quote to validate and prepare against
     * @param coverageAmount Amount of coverage
     * @param durationWeeks Duration in weeks
     * @param maxRateBps Optional maximum acceptable rate
     * @param referralCode Optional referral code (bytes32)
     * @returns Prepared purchase state for the selected quote
     */
    preparePurchaseFromQuote(quote: FixedRateQuote, coverageAmount: bigint, durationWeeks: number, maxRateBps?: number, referralCode?: string): Promise<PreparedPurchase>;
    /**
     * List all available coverage pools with enriched metadata.
     * This is the primary discovery method for 3rd-party integrators — no need
     * to know pool IDs upfront.
     *
     * @param options Optional filters (category, type, includeDeprecated, onlyWithCoverage)
     * @returns Array of enriched CoveragePool objects
     *
     * @example
     * ```typescript
     * // Get all active pools
     * const pools = await sdk.listPools();
     *
     * // Get only vault cover pools
     * const vaultPools = await sdk.listPools({ category: 'vault_cover' });
     *
     * // Get only stablecoin pools with available coverage
     * const stablePools = await sdk.listPools({ type: 'stablecoin', onlyWithCoverage: true });
     * ```
     */
    listPools(options?: ListPoolsOptions): Promise<CoveragePool[]>;
    /**
     * Get a single pool by ID with enriched metadata.
     *
     * @param poolId The pool ID to look up
     * @returns Enriched CoveragePool or null if not found
     *
     * @example
     * ```typescript
     * const pool = await sdk.getPool(1);
     * console.log(pool?.name); // "DAI"
     * console.log(pool?.category); // "stablecoin_depeg"
     * ```
     */
    getPool(poolId: number): Promise<CoveragePool | null>;
    /**
     * Get pools enriched with their best available quote.
     * Combines pool discovery with quote fetching in a single call.
     *
     * @param options Optional ListPoolsOptions filters
     * @returns Array of pools with a `bestQuote` field attached
     *
     * @example
     * ```typescript
     * const pools = await sdk.getQuotesWithPools({ category: 'vault_cover' });
     * for (const { pool, bestQuote } of pools) {
     *     if (bestQuote) {
     *         console.log(`${pool.name}: ${bestQuote.premiumRateBps / 100}%`);
     *     }
     * }
     * ```
     */
    getQuotesWithPools(options?: ListPoolsOptions): Promise<Array<{
        pool: CoveragePool;
        bestQuote: FixedRateQuote | null;
    }>>;
    /**
     * Check whether a fixed-rate quote has expired.
     *
     * @param quote The quote to check
     * @returns true if the quote's expiresAt is in the past
     */
    static isQuoteExpired(quote: FixedRateQuote): boolean;
    /**
     * Get the age of a locally cached quote snapshot in milliseconds.
     *
     * @param quote The quote to inspect
     * @returns Quote age in milliseconds, or null if the SDK does not know when it was fetched
     */
    static getQuoteAgeMs(quote: FixedRateQuote): number | null;
    /**
     * Check whether a quote snapshot is too old to trust for execution without revalidation.
     *
     * A quote is considered stale when it has already expired, or when the SDK fetched it
     * longer ago than the supplied freshness threshold.
     *
     * @param quote The quote to inspect
     * @param maxAgeMs Maximum acceptable quote age in milliseconds
     * @returns true if the quote should be refreshed before execution
     */
    static isQuoteStale(quote: FixedRateQuote, maxAgeMs?: number): boolean;
    /**
     * Fetch only active (non-expired) quotes for a pool, sorted by rate.
     *
     * @param poolId The pool ID
     * @returns Active quotes sorted by premiumRateBps ascending
     *
     * @example
     * ```typescript
     * const quotes = await sdk.getActiveQuotes(1);
     * // All quotes are guaranteed non-expired
     * ```
     */
    getActiveQuotes(poolId: number): Promise<FixedRateQuote[]>;
    /**
     * Refresh a previously selected quote against the latest active quotes for its pool.
     *
     * Returns the updated quote when it still exists, otherwise null.
     *
     * @param quote The previously selected quote
     * @returns The fresh matching quote, or null if it no longer exists
     */
    refreshSelectedQuote(quote: FixedRateQuote): Promise<FixedRateQuote | null>;
    /**
     * Revalidate a quote before purchase if the local snapshot is stale.
     *
     * If the quote is still fresh, the original quote is returned. If it is stale, the SDK
     * fetches active quotes for the same pool and returns the matching live quote when present.
     *
     * @param quote The quote to validate
     * @param options Optional freshness threshold override
     * @returns The original or refreshed quote, or null if the selected quote is no longer available
     */
    revalidateQuoteForPurchase(quote: FixedRateQuote, options?: {
        maxAgeMs?: number;
    }): Promise<FixedRateQuote | null>;
    /**
     * Sort quotes by premium rate (cheapest first).
     * Utility for integrators who fetch quotes separately and need to re-sort.
     *
     * @param quotes Array of quotes to sort
     * @returns New array sorted by premiumRateBps ascending
     */
    static sortQuotesByRate(quotes: FixedRateQuote[]): FixedRateQuote[];
    /**
     * Prepare a transaction to buy from an existing on-chain sell order.
     * This is the simplest purchase path when a syndicate has posted an order.
     *
     * @param orderId The on-chain sell order ID
     * @param coverageAmount Amount of coverage to purchase
     * @param durationSeconds Duration in seconds
     * @param referralCode Optional referral code (bytes32)
     * @returns Populated transaction ready to send
     */
    prepareBuyFromQuoteTx(orderId: number, coverageAmount: bigint, durationSeconds: number, referralCode?: string): Promise<ethers.TransactionRequest>;
    /**
     * Simplified purchase method - automatically chooses best path
     *
     * @param poolId Pool to purchase from
     * @param coverageAmount Amount of coverage
     * @param durationWeeks Duration in weeks
     * @param maxRateBps Optional maximum acceptable rate
     * @param referralCode Optional referral code (bytes32)
     * @returns Transaction hash and policy ID
     */
    purchase(poolId: number, coverageAmount: bigint, durationWeeks: number, maxRateBps?: number, referralCode?: string): Promise<PurchaseResult>;
    /**
     * Execute a purchase against a specific quote selected by the integrator.
     *
     * @param quote The exact quote to execute against
     * @param coverageAmount Amount of coverage
     * @param durationWeeks Duration in weeks
     * @param maxRateBps Optional maximum acceptable rate
     * @param referralCode Optional referral code (bytes32)
     * @returns Transaction hash and policy ID
     */
    purchaseQuote(quote: FixedRateQuote, coverageAmount: bigint, durationWeeks: number, maxRateBps?: number, referralCode?: string): Promise<PurchaseResult>;
    private _isQuoteBookQuote;
    private _getQuoteMinFillAmount;
    private _getQuoteExecutionBlockers;
    private _summarizePurchaseBlockers;
    private _findMatchingQuote;
    private _revalidateQuoteSelection;
    private _createBlockedPurchasePreparation;
    private _buildPurchasePreparationForQuote;
    private _resolveQuoteBookQuoteId;
    private _encodeQuoteBookPurchaseRequest;
    private _resolveQuoteBookExtensionAddress;
    private _resolvePurchaseGatewayAddress;
    private _previewDirectQuoteBookPurchase;
    private _getTokenAllowance;
    private _executeDirectQuoteBookPurchase;
    private _extractPolicyResultFromReceipt;
    private _syncFilledQuote;
    private static readonly PURCHASE_GATEWAY_ABI;
    private static readonly QUOTE_BOOK_EXTENSION_RUNTIME_ABI;
    private static readonly SYSTEM_REGISTRY_ABI;
    private static readonly PURCHASE_EXTENSION_SYSTEM_ID;
    /**
     * Get quotes for a specific syndicate
     * @param syndicateAddress The syndicate address
     * @param includeClosed Whether to include cancelled/filled quotes
     */
    getSyndicateQuotes(syndicateAddress: string, includeClosed?: boolean): Promise<FixedRateQuote[]>;
    /**
     * Get total quoted exposure for a syndicate
     * @param syndicateAddress The syndicate address
     */
    getSyndicateExposure(syndicateAddress: string): Promise<{
        totalExposure: string;
        activeQuoteCount: number;
    }>;
    /**
     * Get the payment token address for a pool (usually USDC).
     *
     * @param poolId The pool ID to query
     * @returns ERC-20 token address used for premium payments in this pool
     */
    getPaymentToken(poolId: number): Promise<string>;
    /**
     * Get full pool metadata including token info resolved from chain
     * @param poolId The pool ID to fetch metadata for
     */
    getPoolMetadata(poolId: number): Promise<PoolMetadata>;
    /**
     * Prepare an ERC-20 approval transaction for the payment token.
     * Call this before `purchase()` or `prepareBuyFromQuoteTx()` to ensure
     * the contract can spend the buyer's premium.
     *
     * @param poolId The ID of the pool to buy cover from
     * @param amount The amount to approve (usually the premium + buffer)
     * @returns Populated transaction ready to send via `signer.sendTransaction()`
     *
     * @example
     * ```ts
     * const approveTx = await sdk.prepareApprovalTx(1, premium);
     * await signer.sendTransaction(approveTx);
     * ```
     */
    prepareApprovalTx(poolId: number, amount: bigint): Promise<ethers.ContractTransaction>;
    /**
     * Deposit assets into a Syndicate vault.
     * Prefers guarded `depositWithMinShares` and falls back to legacy `deposit` when unavailable.
     */
    depositToSyndicate(syndicateAddress: string, assets: bigint, options?: SyndicateDepositOptions): Promise<ethers.TransactionResponse>;
    /**
     * Mint Syndicate shares.
     * Prefers guarded `mintWithMaxAssets` and falls back to legacy `mint` when unavailable.
     */
    mintSyndicateShares(syndicateAddress: string, shares: bigint, options?: SyndicateMintOptions): Promise<ethers.TransactionResponse>;
    /**
     * Harvest yield from a Syndicate vault.
     * Prefers guarded `harvestYieldWithDeadline` and falls back to legacy `harvestYield` when unavailable.
     */
    harvestSyndicateYield(syndicateAddress: string, minAmount?: bigint, options?: SyndicateDeadlineOptions): Promise<ethers.TransactionResponse>;
    /**
     * Run Syndicate upkeep.
     * Prefers guarded `upkeepWithMinHarvest` and falls back to legacy `upkeep` when unavailable.
     */
    runSyndicateUpkeep(syndicateAddress: string, options?: SyndicateUpkeepOptions): Promise<ethers.TransactionResponse>;
    private static _sleep;
    private static _isRetryableStatus;
    private static _isRetryableFetchError;
    private static _fetchWithPolicy;
    private _fetchApi;
    private _waitForTx;
    private _assertInteger;
    private _assertPositiveBigInt;
    private _normalizeBps;
    private _resolveDeadline;
    private _deriveMinSharesFromPreview;
    private _deriveMaxAssetsFromPreview;
    private static _hasRevertData;
    private static _isMethodUnavailableError;
    private _normalizeReferralCode;
    private _assertConfiguredChain;
    private _createChainMismatchError;
    private _ensureContracts;
    private _getSettlementAssetAddress;
    private _getCoveredTokenAddress;
    private static _randomUint;
    /**
     * Calculate the net yield after deducting insurance cost.
     * Useful for showing integrators the true yield on insured positions.
     *
     * @param baseApy The underlying protocol's APY (e.g., 5.2 for 5.2%)
     * @param costBps Insurance premium rate in basis points (e.g., 500 = 5%)
     * @returns Object with `baseApy`, `premiumRate` (as %), and `netApy`
     *
     * @example
     * ```ts
     * const yield = LayerCoverSDK.calculateNetYield(5.2, 300);
     * // { baseApy: 5.2, premiumRate: 3, netApy: 2.2 }
     * ```
     */
    static calculateNetYield(baseApy: number, costBps: number): {
        baseApy: number;
        premiumRate: number;
        netApy: number;
    };
    /**
     * Watch quotes for a pool with automatic refresh and expiration filtering.
     * Returns an unsubscribe function to stop watching.
     *
     * @param poolId Pool to watch quotes for
     * @param callback Called with fresh quotes on each refresh cycle
     * @param options Refresh interval and filtering options
     * @returns Cleanup function to stop watching
     *
     * @example
     * ```ts
     * const stop = sdk.watchQuotes(1, (quotes) => {
     *     console.log(`${quotes.length} active quotes`);
     *     updateUI(quotes);
     * }, { refreshIntervalMs: 15_000 });
     *
     * // Later: stop watching
     * stop();
     * ```
     */
    watchQuotes(poolId: number, callback: (quotes: FixedRateQuote[]) => void, options?: {
        /** Refresh interval in ms (default: 30000 = 30s) */
        refreshIntervalMs?: number;
        /** Filter out expired quotes (default: true) */
        filterExpired?: boolean;
        /** Only include 'active' status quotes (default: true) */
        filterInactive?: boolean;
    }): () => void;
    /**
     * Resolve the PolicyNFT contract (cached after first call).
     * @internal
     */
    private _getPolicyNFT;
    /**
     * Map raw on-chain policy struct to a clean UserPolicy object.
     * @internal
     */
    private _mapPolicy;
    /**
     * Get all policies owned by a wallet address.
     *
     * @param ownerAddress Wallet address to query
     * @returns Array of UserPolicy objects (most recent first)
     *
     * @example
     * ```ts
     * const policies = await sdk.getMyPolicies('0xabc...');
     * const active = policies.filter(p => p.isActive);
     * ```
     */
    getMyPolicies(ownerAddress: string): Promise<UserPolicy[]>;
    /**
     * Get detailed information about a specific policy.
     *
     * @param policyId On-chain policy NFT ID
     * @returns UserPolicy with full details
     *
     * @example
     * ```ts
     * const policy = await sdk.getPolicyDetails(42);
     * console.log(`Coverage: ${policy.coverage}, Active: ${policy.isActive}`);
     * ```
     */
    getPolicyDetails(policyId: number): Promise<UserPolicy>;
    /**
     * Check if a policy is currently active on-chain.
     *
     * @param policyId On-chain policy NFT ID
     * @returns True if active and funded
     */
    isPolicyActive(policyId: number): Promise<boolean>;
    /**
     * Prepare a transaction to cancel an active policy and receive a refund.
     * Only callable by the policy owner. May incur a cancellation penalty.
     *
     * @param policyId The policy to cancel
     * @returns Unsigned transaction to send via signer
     *
     * @example
     * ```ts
     * const tx = await sdk.prepareCancelCoverTx(42);
     * const receipt = await signer.sendTransaction(tx);
     * await receipt.wait();
     * ```
     */
    prepareCancelCoverTx(policyId: number): Promise<{
        to: string;
        data: string;
    }>;
    /**
     * Prepare a transaction to lapse an expired policy and claim remaining premium.
     * Only callable by the policy owner after the policy has naturally expired.
     *
     * @param policyId The policy to lapse
     * @returns Unsigned transaction to send via signer
     *
     * @example
     * ```ts
     * const tx = await sdk.prepareLapsePolicyTx(42);
     * const receipt = await signer.sendTransaction(tx);
     * await receipt.wait();
     * ```
     */
    prepareLapsePolicyTx(policyId: number): Promise<{
        to: string;
        data: string;
    }>;
    /**
     * Translate a contract error into a human-readable message.
     * Handles contract reverts, user rejections, gas errors, and network issues.
     *
     * @param error Any error thrown during SDK or contract interaction
     * @returns A clean, user-facing error string
     *
     * @example
     * ```ts
     * try {
     *     await sdk.purchase(poolId, amount, weeks);
     * } catch (err) {
     *     const msg = LayerCoverSDK.getHumanError(err);
     *     showToast(msg); // "Insufficient pool capacity. Try a smaller amount."
     * }
     * ```
     */
    static getHumanError(error: any): string;
}
//# sourceMappingURL=index.d.ts.map