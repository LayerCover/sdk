import { ethers, Contract, Signer, Provider } from 'ethers';
export * from './adapters';
export * from './viem-adapter';
export { ERROR_MESSAGES, getHumanError } from './errors';
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
}
/**
 * Reserve intent for intent-based (Flash Quote) purchases.
 * Represents a syndicate's signed commitment to underwrite coverage.
 * Obtained via {@link LayerCoverSDK.refreshQuote}.
 */
export interface ReserveIntent {
    /** Solver/relayer address that coordinates the match */
    solver: string;
    /** Syndicate (underwriter) address providing coverage */
    underwriter: string;
    /** Pool ID this intent applies to */
    poolId: number;
    /** Minimum coverage duration in seconds */
    minCoverageDuration: number;
    /** Maximum coverage duration in seconds */
    maxCoverageDuration: number;
    /** Maximum coverage amount (as BigInt string) */
    coverageAmount: string;
    /** Minimum fill amount (as BigInt string); 0 = no minimum */
    minFillAmount: string;
    /** Whether the buyer can partially fill this intent */
    allowPartialFill: boolean;
    /** Unix timestamp when this reservation expires */
    reservationExpiry: number;
    /** Unique nonce to prevent replay */
    nonce: string;
    /** Optional: restrict to a specific buyer address */
    whitelistedBuyer?: string;
    /** Minimum premium rate in basis points (seller's floor) */
    minPremiumBps: number;
    /** Cancellation penalty in basis points */
    cancellationPenaltyBps: number;
    /** @internal Alias for `underwriter` in API responses */
    maker?: string;
    /** @internal Alias for `minCoverageDuration` */
    minDuration?: number;
    /** @internal Alias for `maxCoverageDuration` */
    maxDuration?: number;
    /** @internal Alias for `reservationExpiry` */
    expiry?: number;
    /** @internal Whether upfront premium deposit is required */
    requiresUpfront?: boolean;
    /** @internal Random salt for uniqueness */
    salt?: string;
    /** @internal Alias for `minPremiumBps` */
    premiumRateBps?: number;
}
/**
 * Refreshed quote with fresh reservation (Flash Quote)
 */
export interface RefreshedQuote {
    reserveIntent: ReserveIntent;
    signature: string;
}
/**
 * Result of a purchase transaction
 */
export interface PurchaseResult {
    txHash: string;
    policyId?: string;
}
/**
 * @deprecated Use FixedRateQuote instead
 */
export interface Quote {
    poolId: number;
    amount: bigint;
    period: number;
    rateBps: number;
    premium: bigint;
    minDeposit: bigint;
    capacity: bigint;
}
/**
 * On-chain rate model parameters for a coverage pool.
 * Uses a two-slope (kink) model similar to Aave/Compound interest rate curves.
 */
export interface RateModel {
    /** Base rate (before utilization adjustment) */
    base: bigint;
    /** Slope before the kink point */
    slope1: bigint;
    /** Slope after the kink point (steeper) */
    slope2: bigint;
    /** Utilization threshold where slope changes */
    kink: bigint;
    /** Floor rate in basis points */
    minRateBps: bigint;
    /** Ceiling rate in basis points */
    maxRateBps: bigint;
    /** Whether the rate model override is active */
    overrideEnabled: boolean;
    /** Override rate in basis points (used when `overrideEnabled` is true) */
    overrideRateBps: bigint;
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
 * Contract addresses for LayerCover deployments
 * Key is chainId
 */
export declare const CONTRACT_ADDRESSES: Record<number, {
    policyManager: string;
    intentOrderBook: string;
    capitalPool?: string;
}>;
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
 * Default chain ID for LayerCover (Base Sepolia testnet)
 */
export declare const DEFAULT_CHAIN_ID = 84532;
/**
 * Default API base URL for LayerCover
 */
export declare const DEFAULT_API_BASE_URL = "https://app.layercover.com";
/**
 * Thrown when the best available premium rate exceeds the caller's maximum.
 * Contains both the actual rate and the requested ceiling for UI messaging.
 */
export declare class RateTooHighError extends Error {
    rate: number;
    maxRate: number;
    constructor(message: string, rate: number, maxRate: number);
}
/**
 * Thrown when no underwriter quotes are available for a pool.
 * This typically means no syndicates are currently offering coverage.
 */
export declare class NoQuotesAvailableError extends Error {
    constructor(message: string);
}
export interface LayerCoverSDKOptions {
    /** IntentOrderBook contract address (auto-resolved from chainId if not provided) */
    intentOrderBookAddress?: string;
    /** PolicyNFT contract address (auto-resolved from on-chain if not provided) */
    policyNFTAddress?: string;
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
    /** IntentOrderBook contract instance (undefined if not deployed on this chain) */
    intentOrderBook?: Contract;
    private _apiBaseUrl;
    private _deployment;
    private _chainId;
    private _log;
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
    constructor(providerOrSigner: Provider | Signer, policyManagerAddress: string, options?: LayerCoverSDKOptions);
    /**
     * Configuration fetched from the API
     */
    static _cachedConfig: {
        contracts: {
            policyManager: string;
            intentOrderBook: string;
            intentMatcher?: string;
        };
        chainId: number;
        apiBaseUrl: string;
        deployment?: string;
        fetchedAt: number;
    } | null;
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
        requestTimeoutMs?: number;
        maxRetries?: number;
        retryDelayMs?: number;
        txConfirmations?: number;
        txWaitTimeoutMs?: number;
    }): Promise<LayerCoverSDK>;
    /**
     * Fetch available fixed-rate quotes from the orderbook API
     * @param poolId The pool ID to fetch quotes for
     * @returns Array of available quotes sorted by rate (lowest first)
     */
    getFixedRateQuotes(poolId: number): Promise<FixedRateQuote[]>;
    /**
     * Refresh a quote to get a fresh reservation (Flash Quote)
     * This is required before executing an intent-based purchase.
     * The returned reservation is valid for ~10 minutes.
     *
     * @param quoteId The quote ID to refresh
     * @param amount Coverage amount to reserve
     * @param durationSeconds Coverage duration in seconds
     * @returns Fresh reserve intent and signature
     */
    refreshQuote(quoteId: string, amount: bigint, durationSeconds: number): Promise<RefreshedQuote>;
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
     * Execute a full purchase flow using the intent system.
     * Use this when the quote doesn't have an on-chain sell order (orderId).
     *
     * Steps:
     * 1. Refresh the quote to get a fresh reservation
     * 2. Approve premium spending
     * 3. Post buy order
     * 4. Fill buy order with the reserve intent
     *
     * @param quote The quote to purchase from
     * @param coverageAmount Amount of coverage to purchase
     * @param durationSeconds Duration in seconds
     * @param referralCode Optional referral code (bytes32)
     * @returns Transaction hash and policy ID
     */
    purchaseWithIntent(quote: FixedRateQuote, coverageAmount: bigint, durationSeconds: number, referralCode?: string): Promise<PurchaseResult>;
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
     * EIP-712 domain for Reserve Intent signing
     */
    private static readonly RESERVE_INTENT_DOMAIN;
    /**
     * EIP-712 types for Reserve Intent
     */
    private static readonly RESERVE_INTENT_TYPES;
    /**
     * EIP-712 domain for Coverage Intent signing
     */
    private static readonly COVERAGE_INTENT_DOMAIN;
    /**
     * EIP-712 types for Coverage Intent
     */
    private static readonly COVERAGE_INTENT_TYPES;
    /**
     * Submit a new coverage quote to the orderbook.
     * This allows syndicates to programmatically provide liquidity.
     *
     * The signer must be the syndicate manager or an authorized solver.
     *
     * @param params Quote parameters
     * @returns Quote submission result with signatures
     *
     * @example
     * ```typescript
     * const sdk = new LayerCoverSDK(signer, policyManagerAddress, { apiBaseUrl: 'https://app.layercover.com' });
     *
     * const result = await sdk.submitQuote({
     *     poolId: 1,
     *     syndicateAddress: '0x...',
     *     coverageAmount: ethers.parseUnits('10000', 6), // 10,000 USDC
     *     premiumRateBps: 500, // 5% APY
     *     minDurationWeeks: 4,
     *     maxDurationWeeks: 12,
     * });
     *
     * console.log('Quote submitted:', result.quoteId);
     * ```
     */
    submitQuote(params: {
        poolId: number;
        syndicateAddress: string;
        coverageAmount: bigint;
        premiumRateBps: number;
        minDurationWeeks: number;
        maxDurationWeeks: number;
        allowPartialFill?: boolean;
        minFillAmount?: bigint;
        expiryHours?: number;
        whitelistedBuyer?: string;
        intentMatcherAddress?: string;
    }): Promise<{
        quoteId: string;
        quote: FixedRateQuote;
        reserveIntent: ReserveIntent;
        coverageIntent: any;
        reserveSignature: string;
        intentSignature: string;
    }>;
    /**
     * Cancel an existing quote
     * @param quoteId The quote ID to cancel
     */
    cancelQuote(quoteId: string): Promise<boolean>;
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
     * @deprecated Use getFixedRateQuotes() for the current fixed-rate model.
     * This method is no longer supported as the protocol has transitioned to
     * 100% fixed-rate coverage.
     */
    getQuote(poolId: number, coverAmount: bigint, periodDays: number, maxRateBps?: number): Promise<Quote>;
    /**
     * @deprecated Use prepareBuyFromQuoteTx() or purchase() for the fixed-rate model.
     */
    preparePurchaseTx(poolId: number, coverAmount: bigint, maxPremium: bigint, referralCode?: string, durationSeconds?: number): Promise<ethers.TransactionRequest>;
    private static _sleep;
    private static _isRetryableStatus;
    private static _isRetryableFetchError;
    private static _fetchWithPolicy;
    private _fetchApi;
    private _waitForTx;
    private _assertInteger;
    private _assertPositiveBigInt;
    private _normalizeReferralCode;
    private _assertConfiguredChain;
    private _ensureContracts;
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