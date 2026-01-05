import { ethers, Contract, Signer, Provider } from 'ethers';
export * from './adapters';
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
 * Reserve intent for intent-based purchases
 */
export interface ReserveIntent {
    solver: string;
    underwriter: string;
    poolId: number;
    minCoverageDuration: number;
    maxCoverageDuration: number;
    coverageAmount: string;
    minFillAmount: string;
    allowPartialFill: boolean;
    reservationExpiry: number;
    nonce: string;
    whitelistedBuyer?: string;
    autoAllocate: boolean;
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
export interface RateModel {
    base: bigint;
    slope1: bigint;
    slope2: bigint;
    kink: bigint;
    minRateBps: bigint;
    maxRateBps: bigint;
    overrideEnabled: boolean;
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
export declare class RateTooHighError extends Error {
    rate: number;
    maxRate: number;
    constructor(message: string, rate: number, maxRate: number);
}
export declare class NoQuotesAvailableError extends Error {
    constructor(message: string);
}
export interface LayerCoverSDKOptions {
    /** IntentOrderBook contract address (auto-resolved from chainId if not provided) */
    intentOrderBookAddress?: string;
    /** API base URL for fetching quotes (default: https://app.layercover.com) */
    apiBaseUrl?: string;
    /** Deployment identifier (e.g., 'base_sepolia_usdc') */
    deployment?: string;
    /** Chain ID (used to resolve contract addresses) */
    chainId?: number;
}
export declare class LayerCoverSDK {
    provider: Provider;
    signer?: Signer;
    policyManager: Contract;
    intentOrderBook?: Contract;
    private _apiBaseUrl;
    private _deployment;
    private _chainId;
    private _poolRegistry?;
    private _underwriterManager?;
    private _riskManager?;
    private _rateEngine?;
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
    }): Promise<{
        contracts: {
            policyManager: string;
            intentOrderBook: string;
            intentMatcher?: string;
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
     *     syndicateName: 'My Syndicate',
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
        syndicateName?: string;
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
     * Get the payment token address for a pool (usually USDC)
     */
    getPaymentToken(poolId: number): Promise<string>;
    /**
     * Get full pool metadata including token info resolved from chain
     * @param poolId The pool ID to fetch metadata for
     */
    getPoolMetadata(poolId: number): Promise<PoolMetadata>;
    /**
     * Prepare an approval transaction for the payment token
     * @param poolId The ID of the pool to buy cover from
     * @param amount The amount to approve (usually the premium)
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
    private _ensureContracts;
    static calculateNetYield(baseApy: number, costBps: number): {
        baseApy: number;
        premiumRate: number;
        netApy: number;
    };
}
