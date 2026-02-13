import { ethers, Contract, Signer, Provider } from 'ethers';
import { getHumanError as _getHumanError } from './errors';
export * from './adapters';
export * from './viem-adapter';
export { ERROR_MESSAGES, getHumanError } from './errors';


const BPS = 10000n;
const SECS_YEAR = 31536000n; // 365 days exactly — canonical for premium math

/** Internal no-op logger. Override via `options.debug` or `options.logger`. */
type LogFn = (...args: any[]) => void;
const NOOP_LOG: LogFn = () => { };

/**
 * Logger interface for SDK debug output.
 * Defaults to silent. Enable with `debug: true` or supply a custom logger.
 */
export interface SDKLogger {
    debug: LogFn;
    warn: LogFn;
    error: LogFn;
}

function createLogger(debug: boolean | SDKLogger | undefined): SDKLogger {
    if (typeof debug === 'object' && debug !== null) return debug;
    if (debug) return { debug: console.log.bind(console), warn: console.warn.bind(console), error: console.error.bind(console) };
    return { debug: NOOP_LOG, warn: NOOP_LOG, error: console.error.bind(console) };
}

// ============================================================================
// TYPES - Fixed Rate Model
// ============================================================================

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
    // --- API alias fields (coverageIntent shape from /api/quotes PUT) ---
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
export const POOL_CONFIG: Record<number, { poolName: string; tokenLogoUrl: string }> = {
    1: {
        poolName: 'Aave USDC Protection',
        tokenLogoUrl: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png',
    },
    2: {
        poolName: 'Aave USDT Protection',
        tokenLogoUrl: 'https://cryptologos.cc/logos/tether-usdt-logo.png',
    },
    3: {
        poolName: 'Aave ETH Protection',
        tokenLogoUrl: 'https://cryptologos.cc/logos/ethereum-eth-logo.png',
    },
};

/**
 * Token symbol to logo URL mapping
 * Used to resolve token logos dynamically from chain data
 * Order matters - more specific tokens should come before generic ones
 */
export const TOKEN_LOGOS: Record<string, string> = {
    'USDT': 'https://cryptologos.cc/logos/tether-usdt-logo.png',
    'USDC': 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png',
    'WETH': 'https://cryptologos.cc/logos/ethereum-eth-logo.png',
    'ETH': 'https://cryptologos.cc/logos/ethereum-eth-logo.png',
    'DAI': 'https://cryptologos.cc/logos/multi-collateral-dai-dai-logo.png',
    'WBTC': 'https://cryptologos.cc/logos/wrapped-bitcoin-wbtc-logo.png',
    'BTC': 'https://cryptologos.cc/logos/bitcoin-btc-logo.png',
};

const DEFAULT_TOKEN_LOGO = 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png';

// Ordered list for matching - longer/more specific tokens first
const TOKEN_MATCH_ORDER = ['WETH', 'WBTC', 'USDT', 'USDC', 'ETH', 'DAI', 'BTC'];

/**
 * Get token logo URL from symbol
 */
export function getTokenLogoUrl(symbol: string): string {
    if (!symbol) return DEFAULT_TOKEN_LOGO;

    // Check exact match first
    if (TOKEN_LOGOS[symbol]) return TOKEN_LOGOS[symbol];

    // Check if symbol contains a known token in priority order
    const upperSymbol = symbol.toUpperCase();
    for (const key of TOKEN_MATCH_ORDER) {
        if (upperSymbol.includes(key)) {
            return TOKEN_LOGOS[key];
        }
    }

    return DEFAULT_TOKEN_LOGO;
}

const DEFAULT_POOL_CONFIG = {
    poolName: 'LayerCover Protection',
};

const USDC_LOGO_URL = 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png';

/**
 * Contract addresses for LayerCover deployments
 * Key is chainId
 */
export const CONTRACT_ADDRESSES: Record<number, {
    policyManager: string;
    intentOrderBook: string;
    capitalPool?: string;
}> = {
    // Base Sepolia (testnet) — synced with /api/config as of Feb 2026
    84532: {
        policyManager: '0xbd0Cb34253c84201F746F0A9DF062d82c0823c56',
        intentOrderBook: '0x7865f2e07dFe0d4dC4345bF5DFFFAd757a901337',
    },
    // Base Mainnet — addresses will be populated at mainnet launch.
    // Intentionally omitted to prevent silent misconfiguration.
};

/**
 * Get the PolicyManager address for a given chain
 * @param chainId The chain ID
 * @returns The PolicyManager contract address
 */
export function getPolicyManagerAddress(chainId: number): string {
    const addresses = CONTRACT_ADDRESSES[chainId];
    if (!addresses) {
        throw new Error(`LayerCover is not deployed on chain ${chainId}`);
    }
    return addresses.policyManager;
}

/**
 * Get the IntentOrderBook address for a given chain
 * @param chainId The chain ID
 * @returns The IntentOrderBook contract address
 */
export function getIntentOrderBookAddress(chainId: number): string {
    const addresses = CONTRACT_ADDRESSES[chainId];
    if (!addresses) {
        throw new Error(`LayerCover is not deployed on chain ${chainId}`);
    }
    return addresses.intentOrderBook;
}

/**
 * Default chain ID for LayerCover (Base Sepolia testnet)
 */
export const DEFAULT_CHAIN_ID = 84532;

/**
 * Default API base URL for LayerCover
 */
export const DEFAULT_API_BASE_URL = 'https://app.layercover.com';
const DEFAULT_DEPLOYMENT = 'base_sepolia_usdc';
const DEFAULT_API_TIMEOUT_MS = 15_000;
const DEFAULT_API_RETRIES = 2;
const DEFAULT_API_RETRY_DELAY_MS = 300;
const DEFAULT_TX_CONFIRMATIONS = 1;
const DEFAULT_TX_WAIT_TIMEOUT_MS = 180_000;

/**
 * Thrown when the best available premium rate exceeds the caller's maximum.
 * Contains both the actual rate and the requested ceiling for UI messaging.
 */
export class RateTooHighError extends Error {
    constructor(message: string, public rate: number, public maxRate: number) {
        super(message);
        this.name = "RateTooHighError";
    }
}

/**
 * Thrown when no underwriter quotes are available for a pool.
 * This typically means no syndicates are currently offering coverage.
 */
export class NoQuotesAvailableError extends Error {
    constructor(message: string /* , public poolId: number */) {
        super(message);
        this.name = "NoQuotesAvailableError";
    }
}

// ============================================================================
// SDK Options
// ============================================================================

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

// ============================================================================
// MAIN SDK CLASS
// ============================================================================

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
export class LayerCoverSDK {
    /** Ethers v6 provider for read-only calls */
    provider: Provider;
    /** Ethers v6 signer for write operations (undefined in read-only mode) */
    signer?: Signer;
    /** PolicyManager contract instance */
    policyManager: Contract;
    /** IntentOrderBook contract instance (undefined if not deployed on this chain) */
    intentOrderBook?: Contract;

    private _apiBaseUrl: string;
    private _deployment: string;
    private _chainId: number;
    private _log: SDKLogger;
    private _requestTimeoutMs: number;
    private _maxRetries: number;
    private _retryDelayMs: number;
    private _txConfirmations: number;
    private _txWaitTimeoutMs: number;

    /** @internal Lazily resolved contract cache */
    private _poolRegistry?: Contract;
    private _underwriterManager?: Contract;
    private _riskManager?: Contract;
    private _rateEngine?: Contract;
    private _policyNFT?: Contract;
    private _policyNFTAddress?: string;

    constructor(
        providerOrSigner: Provider | Signer,
        policyManagerAddress: string,
        options: LayerCoverSDKOptions = {}
    ) {
        if ('signMessage' in providerOrSigner) {
            this.signer = providerOrSigner as Signer;
            if (!this.signer.provider) {
                throw new Error('Signer must be connected to a provider');
            }
            this.provider = this.signer.provider;
        } else {
            this.provider = providerOrSigner as Provider;
        }

        this._apiBaseUrl = options.apiBaseUrl || DEFAULT_API_BASE_URL;
        this._deployment = options.deployment || DEFAULT_DEPLOYMENT;
        this._chainId = options.chainId || DEFAULT_CHAIN_ID;
        this._policyNFTAddress = options.policyNFTAddress;
        this._log = createLogger(options.debug);
        this._requestTimeoutMs = Math.max(1_000, options.requestTimeoutMs ?? DEFAULT_API_TIMEOUT_MS);
        this._maxRetries = Math.max(0, options.maxRetries ?? DEFAULT_API_RETRIES);
        this._retryDelayMs = Math.max(0, options.retryDelayMs ?? DEFAULT_API_RETRY_DELAY_MS);
        this._txConfirmations = Math.max(1, options.txConfirmations ?? DEFAULT_TX_CONFIRMATIONS);
        this._txWaitTimeoutMs = Math.max(1_000, options.txWaitTimeoutMs ?? DEFAULT_TX_WAIT_TIMEOUT_MS);

        this.policyManager = new Contract(
            policyManagerAddress,
            [
                'function poolRegistry() view returns (address)',
                'function riskManager() view returns (address)',
                'function underwriterManager() view returns (address)',
                'function rateEngine() view returns (address)',
                'function capitalPool() view returns (address)',
                'function policyNFT() view returns (address)',
                'function isPolicyActive(uint256 policyId) view returns (bool)',
                'function cancelCover(uint256 policyId)',
                'function lapsePolicy(uint256 policyId)',
            ],
            this.signer || this.provider
        );

        // Initialize IntentOrderBook
        const orderBookAddress = options.intentOrderBookAddress ||
            CONTRACT_ADDRESSES[this._chainId]?.intentOrderBook;

        if (orderBookAddress && orderBookAddress !== ethers.ZeroAddress) {
            this.intentOrderBook = new Contract(
                orderBookAddress,
                [
                    // Buy from existing on-chain sell order (with vault coverage support and referral code)
                    'function buyFromQuote(uint256 orderId, uint256 coverageAmount, uint256 duration, address vault, uint256 sharesToCover, bool requiresUpfront, bytes32 referralCode) external returns (uint256 policyId)',
                    // Post a buy order (with referral code)
                    'function postBuyOrder(tuple(address taker, uint256 poolId, uint256 coverageAmount, uint256 maxPremiumRateBps, uint256 duration, uint256 premiumDeposit, uint256 nonce, uint256 expiry, uint256 salt, bytes32 referralCode) order) external returns (uint256 orderId)',
                    // Fill a buy order with intent (with vault coverage support)
                    'function fillBuyOrder(uint256 orderId, uint256 offerRateBps, uint256 fillAmount, address vault, uint256 sharesToCover, bool requiresUpfront, tuple(address solver, address underwriter, uint256 poolId, uint32 minCoverageDuration, uint32 maxCoverageDuration, uint256 coverageAmount, uint256 minFillAmount, bool allowPartialFill, uint64 reservationExpiry, uint96 nonce, address whitelistedBuyer, uint16 minPremiumBps, uint16 cancellationPenaltyBps) reserveIntent, bytes signature) external returns (uint256 policyId)',
                    // Get sell order details
                    'function getSellOrder(uint256 orderId) view returns (tuple(address syndicate, address solver, uint256 poolId, uint256 minCoverageDuration, uint256 maxCoverageDuration, uint256 remainingCoverage, uint256 minFillAmount, uint256 rateBps, uint64 expiry, bytes32 reservationKey, bool cancelled, bool filled, uint16 cancellationPenaltyBps))',
                    'function getUnfilledSellOrders(uint256 poolId) view returns (uint256[])',
                ],
                this.signer || this.provider
            );
        }
    }

    // ========================================================================
    // STATIC FACTORY METHODS
    // ========================================================================

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
    } | null = null;

    private static _configFallback(options: {
        apiBaseUrl?: string;
        chainId?: number;
        deployment?: string;
    }): {
        contracts: {
            policyManager: string;
            intentOrderBook: string;
        };
        chainId: number;
        apiBaseUrl: string;
        deployment?: string;
    } {
        const chainId = options.chainId || DEFAULT_CHAIN_ID;
        const addresses = CONTRACT_ADDRESSES[chainId];
        if (!addresses) {
            throw new Error(`No configuration available for chainId ${chainId}`);
        }
        return {
            contracts: {
                policyManager: addresses.policyManager,
                intentOrderBook: addresses.intentOrderBook,
            },
            chainId,
            apiBaseUrl: options.apiBaseUrl || DEFAULT_API_BASE_URL,
            deployment: options.deployment || DEFAULT_DEPLOYMENT,
        };
    }

    /**
     * Fetch configuration from the LayerCover API.
     * This allows the SDK to dynamically get contract addresses without hardcoding.
     * 
     * @param options Configuration options
     * @returns Contract configuration
     */
    static async fetchConfig(options: {
        apiBaseUrl?: string;
        chainId?: number;
        deployment?: string;
        requestTimeoutMs?: number;
        maxRetries?: number;
        retryDelayMs?: number;
    } = {}): Promise<{
        contracts: {
            policyManager: string;
            intentOrderBook: string;
            intentMatcher?: string;
            policyNFT?: string;
        };
        chainId: number;
        apiBaseUrl: string;
        deployment?: string;
    }> {
        const apiBase = options.apiBaseUrl || DEFAULT_API_BASE_URL;

        // Build query params
        const params = new URLSearchParams();
        if (options.chainId) params.set('chainId', options.chainId.toString());
        if (options.deployment) params.set('deployment', options.deployment);

        const url = `${apiBase}/api/config${params.toString() ? '?' + params.toString() : ''}`;

        // Debug logging handled per-instance; static method uses console sparingly

        let response: Response;
        try {
            response = await LayerCoverSDK._fetchWithPolicy(url, {}, {
                timeoutMs: options.requestTimeoutMs ?? DEFAULT_API_TIMEOUT_MS,
                retries: options.maxRetries ?? DEFAULT_API_RETRIES,
                retryDelayMs: options.retryDelayMs ?? DEFAULT_API_RETRY_DELAY_MS,
            });
        } catch {
            return LayerCoverSDK._configFallback(options);
        }
        if (!response.ok) {
            // Fallback silently — integrators can detect via returned config
            return LayerCoverSDK._configFallback({ ...options, apiBaseUrl: apiBase });
        }

        const data = await response.json();

        // Handle both formats:
        //   1. Direct: { contracts: {...}, chainId, ... }
        //   2. Deployments array: { deployments: [{ name, chainId, contracts }] }
        let contracts = data.contracts;
        let resolvedChainId = data.chainId || options.chainId || DEFAULT_CHAIN_ID;
        let resolvedDeployment = data.deployment || options.deployment || DEFAULT_DEPLOYMENT;

        if (!contracts && data.deployments && Array.isArray(data.deployments)) {
            // Find the best matching deployment
            const targetDeployment = options.deployment || 'base_sepolia_usdc';
            const match = data.deployments.find((d: any) => d.name === targetDeployment)
                || data.deployments.find((d: any) => d.chainId === (options.chainId || DEFAULT_CHAIN_ID))
                || data.deployments[0];

            if (match) {
                contracts = match.contracts;
                resolvedChainId = match.chainId || resolvedChainId;
                resolvedDeployment = match.name || resolvedDeployment;
            }
        }

        if (!contracts) {
            throw new Error('No contracts found in API config response');
        }

        // Cache the config for 5 minutes
        LayerCoverSDK._cachedConfig = {
            contracts,
            chainId: resolvedChainId,
            apiBaseUrl: data.apiBaseUrl || apiBase,
            deployment: resolvedDeployment,
            fetchedAt: Date.now(),
        };

        return LayerCoverSDK._cachedConfig;
    }

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
    static async create(
        providerOrSigner: Provider | Signer,
        options: {
            apiBaseUrl?: string;
            chainId?: number;
            deployment?: string;
            debug?: boolean | SDKLogger;
            requestTimeoutMs?: number;
            maxRetries?: number;
            retryDelayMs?: number;
            txConfirmations?: number;
            txWaitTimeoutMs?: number;
        } = {}
    ): Promise<LayerCoverSDK> {
        const requestedApiBase = options.apiBaseUrl || DEFAULT_API_BASE_URL;
        const requestedChainId = options.chainId || DEFAULT_CHAIN_ID;
        const requestedDeployment = options.deployment || DEFAULT_DEPLOYMENT;

        // Check cache (valid for 5 minutes)
        const cacheValid = LayerCoverSDK._cachedConfig &&
            (Date.now() - LayerCoverSDK._cachedConfig.fetchedAt) < 5 * 60 * 1000 &&
            LayerCoverSDK._cachedConfig.apiBaseUrl === requestedApiBase &&
            LayerCoverSDK._cachedConfig.chainId === requestedChainId &&
            (LayerCoverSDK._cachedConfig.deployment || DEFAULT_DEPLOYMENT) === requestedDeployment;

        const config = cacheValid
            ? LayerCoverSDK._cachedConfig!
            : await LayerCoverSDK.fetchConfig({
                apiBaseUrl: options.apiBaseUrl,
                chainId: options.chainId,
                deployment: options.deployment,
                requestTimeoutMs: options.requestTimeoutMs,
                maxRetries: options.maxRetries,
                retryDelayMs: options.retryDelayMs,
            });

        return new LayerCoverSDK(providerOrSigner, config.contracts.policyManager, {
            intentOrderBookAddress: config.contracts.intentOrderBook,
            policyNFTAddress: (config.contracts as any).policyNFT,
            apiBaseUrl: options.apiBaseUrl || config.apiBaseUrl,
            chainId: config.chainId,
            deployment: config.deployment || DEFAULT_DEPLOYMENT,
            debug: options.debug,
            requestTimeoutMs: options.requestTimeoutMs,
            maxRetries: options.maxRetries,
            retryDelayMs: options.retryDelayMs,
            txConfirmations: options.txConfirmations,
            txWaitTimeoutMs: options.txWaitTimeoutMs,
        });
    }

    // ========================================================================
    // FIXED-RATE QUOTE METHODS (NEW)
    // ========================================================================

    /**
     * Fetch available fixed-rate quotes from the orderbook API
     * @param poolId The pool ID to fetch quotes for
     * @returns Array of available quotes sorted by rate (lowest first)
     */
    async getFixedRateQuotes(poolId: number): Promise<FixedRateQuote[]> {
        const url = `${this._apiBaseUrl}/api/quotes?poolId=${poolId}&deployment=${encodeURIComponent(this._deployment)}`;
        this._log.debug('[LayerCover SDK] Fetching quotes from:', url);

        const response = await this._fetchApi(url);
        this._log.debug('[LayerCover SDK] Response status:', response.status);
        if (!response.ok) {
            throw new Error(`Failed to fetch quotes: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const quotes: FixedRateQuote[] = (data.quotes || []).map((q: any) => ({
            id: q.id,
            poolId: q.poolId,
            syndicateAddress: q.syndicateAddress,
            syndicateName: q.syndicateName || 'Unknown',
            coverageAmount: q.coverageAmount?.toString() || q.reserveIntent?.coverageAmount || '0',
            premiumRateBps: Number(q.premiumRateBps),
            minDurationWeeks: Number(q.minDurationWeeks),
            maxDurationWeeks: Number(q.maxDurationWeeks),
            expiresAt: q.expiresAt,
            status: q.status || 'active',
            orderId: q.orderId,
        }));

        // Sort by rate (lowest first)
        return quotes.sort((a, b) => a.premiumRateBps - b.premiumRateBps);
    }

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
    async refreshQuote(
        quoteId: string,
        amount: bigint,
        durationSeconds: number
    ): Promise<RefreshedQuote> {
        if (!quoteId || !quoteId.trim()) {
            throw new Error('quoteId is required');
        }
        this._assertPositiveBigInt('amount', amount);
        this._assertInteger('durationSeconds', durationSeconds, 1);

        const url = `${this._apiBaseUrl}/api/quotes`;

        const response = await this._fetchApi(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                quoteId,
                amount: amount.toString(),
                duration: durationSeconds,
                chainId: this._chainId,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Failed to refresh quote: ${response.status}`);
        }

        const data = await response.json();
        // API returns coverageIntent, normalize to reserveIntent shape
        const intent = data.reserveIntent || data.coverageIntent;
        return {
            reserveIntent: intent,
            signature: data.signature || data.intentSignature,
        };
    }

    /**
     * Calculate the premium for a given coverage amount, rate, and duration
     * @param coverageAmount Amount to cover (in wei/smallest unit)
     * @param rateBps Rate in basis points (e.g., 500 = 5%)
     * @param durationSeconds Duration in seconds
     * @returns Premium amount (in wei/smallest unit)
     */
    calculatePremium(coverageAmount: bigint, rateBps: number, durationSeconds: number): bigint {
        const rateBn = BigInt(rateBps);
        const durationBn = BigInt(durationSeconds);
        return (coverageAmount * rateBn * durationBn) / (SECS_YEAR * BPS);
    }

    /**
     * Get the best (lowest) rate available for a pool
     * @param poolId The pool ID
     * @returns Best rate in basis points, or null if no quotes available
     */
    async getBestRate(poolId: number): Promise<number | null> {
        this._assertInteger('poolId', poolId, 1);
        const quotes = await this.getActiveQuotes(poolId);
        if (quotes.length === 0) return null;
        return quotes[0].premiumRateBps;
    }

    // ========================================================================
    // POOL DISCOVERY METHODS
    // ========================================================================

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
    async listPools(options: ListPoolsOptions = {}): Promise<CoveragePool[]> {
        const url = `${this._apiBaseUrl}/api/pools/list?deployment=${encodeURIComponent(this._deployment)}`;

        const response = await this._fetchApi(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch pools: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const rawPools: any[] = data.pools || [];

        let pools: CoveragePool[] = rawPools.map((p: any) => ({
            poolId: p.poolId ?? p.id,
            name: p.poolName || p.label || `Pool ${p.poolId ?? p.id}`,
            category: p.category || 'other',
            type: p.type || p.poolCategory || 'unknown',
            subCategory: p.subCategory,
            availableCoverage: String(p.availableCoverage || '0'),
            totalCoverageSold: String(p.totalCoverageSold || '0'),
            bestRateBps: Number(p.premiumRateBps || 0),
            riskRating: String(p.riskRating || '—'),
            slug: p.slug || '',
            tokenSymbol: p.underlyingTokenSymbol || p.label || '',
            tokenLogoUrl: p.metadata?.logo || p.metadata?.protocolLogo || getTokenLogoUrl(p.underlyingTokenSymbol || p.label || ''),
            isOptimisticOracle: Boolean(p.isOptimisticOracle),
            deprecated: Boolean(p.deprecated),
            deployment: p.deployment || this._deployment,
        }));

        // Apply filters
        if (!options.includeDeprecated) {
            pools = pools.filter(p => !p.deprecated);
        }
        if (options.category) {
            pools = pools.filter(p => p.category === options.category);
        }
        if (options.type) {
            pools = pools.filter(p => p.type === options.type);
        }
        if (options.onlyWithCoverage) {
            pools = pools.filter(p => p.availableCoverage !== '0');
        }

        return pools;
    }

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
    async getPool(poolId: number): Promise<CoveragePool | null> {
        const pools = await this.listPools({ includeDeprecated: true });
        return pools.find(p => p.poolId === poolId) || null;
    }

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
    async getQuotesWithPools(
        options: ListPoolsOptions = {}
    ): Promise<Array<{ pool: CoveragePool; bestQuote: FixedRateQuote | null }>> {
        const pools = await this.listPools(options);

        const results = await Promise.all(
            pools.map(async (pool) => {
                try {
                    const quotes = await this.getFixedRateQuotes(pool.poolId);
                    const activeQuotes = quotes.filter(q => !LayerCoverSDK.isQuoteExpired(q));
                    return {
                        pool,
                        bestQuote: activeQuotes.length > 0 ? activeQuotes[0] : null,
                    };
                } catch {
                    return { pool, bestQuote: null };
                }
            })
        );

        return results;
    }

    // ========================================================================
    // QUOTE LIFECYCLE HELPERS
    // ========================================================================

    /**
     * Check whether a fixed-rate quote has expired.
     *
     * @param quote The quote to check
     * @returns true if the quote's expiresAt is in the past
     */
    static isQuoteExpired(quote: FixedRateQuote): boolean {
        if (!quote.expiresAt) return false;
        return new Date(quote.expiresAt).getTime() < Date.now();
    }

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
    async getActiveQuotes(poolId: number): Promise<FixedRateQuote[]> {
        const quotes = await this.getFixedRateQuotes(poolId);
        return quotes.filter(q => !LayerCoverSDK.isQuoteExpired(q) && q.status === 'active');
    }

    /**
     * Sort quotes by premium rate (cheapest first).
     * Utility for integrators who fetch quotes separately and need to re-sort.
     *
     * @param quotes Array of quotes to sort
     * @returns New array sorted by premiumRateBps ascending
     */
    static sortQuotesByRate(quotes: FixedRateQuote[]): FixedRateQuote[] {
        return [...quotes].sort((a, b) => a.premiumRateBps - b.premiumRateBps);
    }

    // ========================================================================
    // PURCHASE METHODS (NEW)
    // ========================================================================

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
    async prepareBuyFromQuoteTx(
        orderId: number,
        coverageAmount: bigint,
        durationSeconds: number,
        referralCode?: string
    ): Promise<ethers.TransactionRequest> {
        this._assertInteger('orderId', orderId, 0);
        this._assertPositiveBigInt('coverageAmount', coverageAmount);
        this._assertInteger('durationSeconds', durationSeconds, 1);
        if (!this.intentOrderBook) {
            throw new Error('IntentOrderBook not configured');
        }
        const normalizedReferralCode = this._normalizeReferralCode(referralCode);

        return await this.intentOrderBook.buyFromQuote.populateTransaction(
            orderId,
            coverageAmount,
            durationSeconds,
            ethers.ZeroAddress, // vault (not used for standard coverage)
            0,                  // sharesToCover (not used for standard coverage)
            true, // requiresUpfront
            normalizedReferralCode
        );
    }

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
    async purchaseWithIntent(
        quote: FixedRateQuote,
        coverageAmount: bigint,
        durationSeconds: number,
        referralCode?: string
    ): Promise<PurchaseResult> {
        this._assertInteger('quote.poolId', quote?.poolId, 1);
        this._assertPositiveBigInt('coverageAmount', coverageAmount);
        this._assertInteger('durationSeconds', durationSeconds, 1);
        if (!this.signer) {
            throw new Error('Signer required for purchase');
        }
        if (!this.intentOrderBook) {
            throw new Error('IntentOrderBook not configured');
        }
        await this._assertConfiguredChain();
        const normalizedReferralCode = this._normalizeReferralCode(referralCode);

        const signerAddress = await this.signer.getAddress();
        const now = Math.floor(Date.now() / 1000);

        // 1. Refresh quote to get fresh reservation
        const { reserveIntent, signature } = await this.refreshQuote(
            quote.id,
            coverageAmount,
            durationSeconds
        );

        // 2. Calculate premium with buffer
        const premium = this.calculatePremium(coverageAmount, quote.premiumRateBps, durationSeconds);
        const premiumWithBuffer = (premium * 105n) / 100n; // 5% buffer

        // 3. Approve payment token
        const paymentToken = await this.getPaymentToken(quote.poolId);
        const tokenContract = new Contract(
            paymentToken,
            [
                'function approve(address spender, uint256 amount) returns (bool)',
                'function allowance(address owner, address spender) view returns (uint256)',
            ],
            this.signer
        );

        const orderBookAddress = await this.intentOrderBook.getAddress();
        const allowance = await tokenContract.allowance(signerAddress, orderBookAddress);

        if (allowance < premiumWithBuffer) {
            const approveTx = await tokenContract.approve(orderBookAddress, ethers.MaxUint256);
            await this._waitForTx(approveTx);
        }

        // 4. Post buy order
        const buyOrder = {
            taker: signerAddress,
            poolId: quote.poolId,
            coverageAmount: coverageAmount,
            maxPremiumRateBps: Math.round(quote.premiumRateBps * 1.01), // 1% slippage
            duration: durationSeconds,
            premiumDeposit: premiumWithBuffer,
            nonce: LayerCoverSDK._randomUint(12),
            expiry: now + 3600, // 1 hour
            salt: LayerCoverSDK._randomUint(32),
            referralCode: normalizedReferralCode,
        };

        const postTx = await this.intentOrderBook.postBuyOrder(buyOrder);
        const postReceipt = await this._waitForTx(postTx);

        // Extract order ID from event
        const orderBookInterface = new ethers.Interface([
            'event BuyOrderPosted(uint256 indexed orderId, address indexed buyer, uint256 poolId, uint256 initialCoverage, uint256 maxRateBps, uint32 duration, uint256 premiumDeposit)',
        ]);

        let orderId: bigint | null = null;
        for (const log of postReceipt.logs) {
            try {
                const parsed = orderBookInterface.parseLog(log);
                if (parsed?.name === 'BuyOrderPosted') {
                    orderId = parsed.args.orderId;
                    break;
                }
            } catch {
                continue;
            }
        }

        if (orderId === null) {
            throw new Error('Failed to extract order ID from transaction');
        }

        // 5. Fill buy order with reserve intent
        // Map API field names (maker/minDuration/maxDuration) to contract struct fields
        const intentStruct = {
            solver: reserveIntent.solver || reserveIntent.maker || ethers.ZeroAddress,
            underwriter: reserveIntent.underwriter || reserveIntent.maker || ethers.ZeroAddress,
            poolId: reserveIntent.poolId,
            minCoverageDuration: reserveIntent.minCoverageDuration || reserveIntent.minDuration || 0,
            maxCoverageDuration: reserveIntent.maxCoverageDuration || reserveIntent.maxDuration || 0,
            coverageAmount: BigInt(reserveIntent.coverageAmount),
            minFillAmount: BigInt(reserveIntent.minFillAmount || '0'),
            allowPartialFill: reserveIntent.allowPartialFill ?? false,
            reservationExpiry: reserveIntent.reservationExpiry || reserveIntent.expiry || 0,
            nonce: BigInt(reserveIntent.nonce),
            whitelistedBuyer: reserveIntent.whitelistedBuyer || ethers.ZeroAddress,
            minPremiumBps: reserveIntent.minPremiumBps ?? 0,
            cancellationPenaltyBps: reserveIntent.cancellationPenaltyBps ?? 0,
        };

        const fillTx = await this.intentOrderBook.fillBuyOrder(
            orderId,
            quote.premiumRateBps,
            coverageAmount,
            ethers.ZeroAddress, // vault (not used for standard coverage)
            0,                  // sharesToCover (not used for standard coverage)
            true, // requiresUpfront
            intentStruct,
            signature
        );

        const fillReceipt = await this._waitForTx(fillTx);

        // Extract policy ID from event
        const fillInterface = new ethers.Interface([
            'event BuyOrderFilled(uint256 indexed orderId, address indexed filler, uint256 policyId)',
        ]);

        let policyId: string | undefined;
        for (const log of fillReceipt.logs) {
            try {
                const parsed = fillInterface.parseLog(log);
                if (parsed?.name === 'BuyOrderFilled') {
                    policyId = parsed.args.policyId.toString();
                    break;
                }
            } catch {
                continue;
            }
        }

        return {
            txHash: fillTx.hash,
            policyId,
        };
    }

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
    async purchase(
        poolId: number,
        coverageAmount: bigint,
        durationWeeks: number,
        maxRateBps?: number,
        referralCode?: string
    ): Promise<PurchaseResult> {
        this._assertInteger('poolId', poolId, 1);
        this._assertPositiveBigInt('coverageAmount', coverageAmount);
        this._assertInteger('durationWeeks', durationWeeks, 1);
        if (!this.signer) throw new Error('Signer required for purchase');
        if (!this.intentOrderBook) throw new Error('IntentMatcher not configured');
        await this._assertConfiguredChain();
        const normalizedReferralCode = this._normalizeReferralCode(referralCode);

        const signerAddress = await this.signer.getAddress();
        const intentMatcherAddress = await this.intentOrderBook.getAddress();
        const now = Math.floor(Date.now() / 1000);

        // 1. Fetch available quotes
        const quotes = await this.getFixedRateQuotes(poolId);

        if (quotes.length === 0) {
            throw new NoQuotesAvailableError(
                `No quotes available for pool ${poolId}. ` +
                'Coverage can only be purchased when underwriters provide quotes.'
            );
        }

        const bestQuote = quotes[0];

        if (maxRateBps && bestQuote.premiumRateBps > maxRateBps) {
            throw new RateTooHighError(
                `Best available rate ${bestQuote.premiumRateBps} bps exceeds max ${maxRateBps} bps`,
                bestQuote.premiumRateBps,
                maxRateBps
            );
        }

        const durationSeconds = durationWeeks * 7 * 24 * 60 * 60;

        // 2. Refresh quote to get fresh coverageIntent + signature
        const refreshUrl = `${this._apiBaseUrl}/api/quotes`;
        const refreshResponse = await this._fetchApi(refreshUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                quoteId: bestQuote.id,
                amount: coverageAmount.toString(),
                duration: durationSeconds,
                chainId: this._chainId,
            }),
        });

        if (!refreshResponse.ok) {
            const errorData = await refreshResponse.json().catch(() => ({}));
            throw new Error(errorData.error || `Failed to refresh quote: ${refreshResponse.status}`);
        }

        const refreshData = await refreshResponse.json();
        const coverageIntent = refreshData.coverageIntent || refreshData.reserveIntent;
        const intentSignature = refreshData.intentSignature || refreshData.signature;

        if (!coverageIntent || !intentSignature) {
            throw new Error('Quote refresh failed: missing coverageIntent or signature');
        }

        // 3. Calculate premium with 5% buffer (uses module-level SECS_YEAR / BPS)
        const premium = this.calculatePremium(coverageAmount, bestQuote.premiumRateBps, durationSeconds);
        const premiumWithBuffer = (premium * 105n) / 100n;

        // 4. Approve IntentMatcher to spend premium
        const paymentToken = await this.getPaymentToken(poolId);
        const tokenContract = new Contract(
            paymentToken,
            [
                'function approve(address spender, uint256 amount) returns (bool)',
                'function allowance(address owner, address spender) view returns (uint256)',
            ],
            this.signer
        );

        const allowance = await tokenContract.allowance(signerAddress, intentMatcherAddress);
        if (allowance < premiumWithBuffer) {
            this._log.debug('[LayerCover SDK] Approving premium spend…');
            const approveTx = await tokenContract.approve(intentMatcherAddress, ethers.MaxUint256);
            await this._waitForTx(approveTx);
            this._log.debug('[LayerCover SDK] Approval confirmed');
        }

        // 5. Build buyer order
        const buyerOrder = {
            taker: signerAddress,
            poolId: poolId,
            coverageAmount: coverageAmount,
            maxPremiumRateBps: Math.round(bestQuote.premiumRateBps * 1.05), // 5% slippage
            duration: durationSeconds,
            premiumDeposit: premiumWithBuffer,
            nonce: LayerCoverSDK._randomUint(12),
            expiry: now + 3600, // 1 hour
            salt: LayerCoverSDK._randomUint(32),
            referralCode: normalizedReferralCode,
        };

        // 6. EIP-712 sign the buy order
        const domain = {
            name: 'IntentMatcher',
            version: '1',
            chainId: this._chainId,
            verifyingContract: intentMatcherAddress,
        };

        const buyOrderTypes = {
            CoverageBuyOrder: [
                { name: 'taker', type: 'address' },
                { name: 'poolId', type: 'uint256' },
                { name: 'coverageAmount', type: 'uint256' },
                { name: 'maxPremiumRateBps', type: 'uint256' },
                { name: 'duration', type: 'uint256' },
                { name: 'premiumDeposit', type: 'uint256' },
                { name: 'nonce', type: 'uint256' },
                { name: 'expiry', type: 'uint256' },
                { name: 'salt', type: 'uint256' },
                { name: 'referralCode', type: 'bytes32' },
            ],
        };

        this._log.debug('[LayerCover SDK] Signing buy order (EIP-712)…');
        const orderSignature = await this.signer.signTypedData(domain, buyOrderTypes, buyerOrder);

        // 7. Build seller intent struct from coverageIntent
        const sellerIntent = {
            maker: coverageIntent.maker,
            poolId: coverageIntent.poolId,
            coverageAmount: BigInt(coverageIntent.coverageAmount),
            premiumRateBps: coverageIntent.premiumRateBps,
            minDuration: coverageIntent.minDuration,
            maxDuration: coverageIntent.maxDuration,
            nonce: BigInt(coverageIntent.nonce),
            expiry: coverageIntent.expiry,
            salt: BigInt(coverageIntent.salt),
            requiresUpfront: coverageIntent.requiresUpfront ?? true,
            cancellationPenaltyBps: coverageIntent.cancellationPenaltyBps ?? 0,
            minFillAmount: BigInt(coverageIntent.minFillAmount ?? '0'),
            whitelistedBuyer: coverageIntent.whitelistedBuyer || ethers.ZeroAddress,
        };

        // 8. Call executeMatchedIntent on IntentMatcher
        const EXECUTE_MATCHED_INTENT_ABI = [
            'function executeMatchedIntent(tuple(address maker, uint256 poolId, uint256 coverageAmount, uint256 premiumRateBps, uint256 minDuration, uint256 maxDuration, uint256 nonce, uint256 expiry, uint256 salt, bool requiresUpfront, uint16 cancellationPenaltyBps, uint256 minFillAmount, address whitelistedBuyer)[] intents, bytes[] intentSignatures, tuple(address taker, uint256 poolId, uint256 coverageAmount, uint256 maxPremiumRateBps, uint256 duration, uint256 premiumDeposit, uint256 nonce, uint256 expiry, uint256 salt, bytes32 referralCode) order, bytes orderSignature, uint256[] fillAmounts, address vault, uint256 sharesToCover) returns (uint256[])',
        ];

        const intentMatcher = new Contract(intentMatcherAddress, EXECUTE_MATCHED_INTENT_ABI, this.signer);

        this._log.debug('[LayerCover SDK] Executing purchase…');
        const tx = await intentMatcher.executeMatchedIntent(
            [sellerIntent],          // intents[]
            [intentSignature],       // intentSignatures[]
            buyerOrder,              // order
            orderSignature,          // orderSignature (EIP-712 signed)
            [coverageAmount],        // fillAmounts[]
            ethers.ZeroAddress,      // vault (not used for standard coverage)
            0                        // sharesToCover
        );
        const receipt = await this._waitForTx(tx);
        this._log.debug('[LayerCover SDK] Purchase confirmed:', tx.hash);

        // 9. Extract policy ID from PolicyCreated event
        const policyCreatedIface = new ethers.Interface([
            'event PolicyCreated(uint256 indexed policyId, address indexed holder, uint256 poolId)',
            'event IntentMatched(uint256 indexed policyId, address indexed buyer, address indexed seller)',
        ]);
        let policyId: string | undefined;
        for (const log of receipt.logs) {
            try {
                const parsed = policyCreatedIface.parseLog(log);
                if (parsed && (parsed.name === 'PolicyCreated' || parsed.name === 'IntentMatched')) {
                    policyId = parsed.args.policyId.toString();
                    break;
                }
            } catch {
                continue;
            }
        }

        // Mark quote as filled
        try {
            await this._fetchApi(`${this._apiBaseUrl}/api/quotes`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    updates: [{ quoteId: bestQuote.id, filledAmount: coverageAmount.toString() }]
                }),
            });
        } catch {
            // Non-critical
        }

        return { txHash: tx.hash, policyId };
    }

    // ========================================================================
    // QUOTE SUBMISSION (FOR SYNDICATES/UNDERWRITERS)
    // ========================================================================

    /**
     * EIP-712 domain for Reserve Intent signing
     */
    private static readonly RESERVE_INTENT_DOMAIN = {
        name: 'Syndicate',
        version: '1',
    };

    /**
     * EIP-712 types for Reserve Intent
     */
    private static readonly RESERVE_INTENT_TYPES = {
        ReserveIntent: [
            { name: 'solver', type: 'address' },
            { name: 'underwriter', type: 'address' },
            { name: 'poolId', type: 'uint256' },
            { name: 'minCoverageDuration', type: 'uint32' },
            { name: 'maxCoverageDuration', type: 'uint32' },
            { name: 'coverageAmount', type: 'uint256' },
            { name: 'minFillAmount', type: 'uint256' },
            { name: 'allowPartialFill', type: 'bool' },
            { name: 'reservationExpiry', type: 'uint64' },
            { name: 'nonce', type: 'uint96' },
            { name: 'whitelistedBuyer', type: 'address' },
            { name: 'minPremiumBps', type: 'uint16' },
            { name: 'cancellationPenaltyBps', type: 'uint16' },
        ],
    };

    /**
     * EIP-712 domain for Coverage Intent signing
     */
    private static readonly COVERAGE_INTENT_DOMAIN = {
        name: 'IntentMatcher',
        version: '1',
    };

    /**
     * EIP-712 types for Coverage Intent
     */
    private static readonly COVERAGE_INTENT_TYPES = {
        CoverageIntent: [
            { name: 'maker', type: 'address' },
            { name: 'poolId', type: 'uint256' },
            { name: 'coverageAmount', type: 'uint256' },
            { name: 'premiumRateBps', type: 'uint256' },
            { name: 'minDuration', type: 'uint256' },
            { name: 'maxDuration', type: 'uint256' },
            { name: 'nonce', type: 'uint256' },
            { name: 'expiry', type: 'uint256' },
            { name: 'salt', type: 'uint256' },
            { name: 'requiresUpfront', type: 'bool' },
            { name: 'cancellationPenaltyBps', type: 'uint16' },
            { name: 'minFillAmount', type: 'uint256' },
            { name: 'whitelistedBuyer', type: 'address' },
        ],
    };

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
    async submitQuote(params: {
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
    }> {
        if (!this.signer) {
            throw new Error('Signer required to submit quotes');
        }

        const {
            poolId,
            syndicateAddress,
            coverageAmount,
            premiumRateBps,
            minDurationWeeks,
            maxDurationWeeks,
            allowPartialFill = false,
            minFillAmount,
            expiryHours = 24,
            whitelistedBuyer = ethers.ZeroAddress,
            intentMatcherAddress,
        } = params;
        this._assertInteger('poolId', poolId, 1);
        this._assertPositiveBigInt('coverageAmount', coverageAmount);
        this._assertInteger('premiumRateBps', premiumRateBps, 1);
        this._assertInteger('minDurationWeeks', minDurationWeeks, 1);
        this._assertInteger('maxDurationWeeks', maxDurationWeeks, minDurationWeeks);
        this._assertInteger('expiryHours', expiryHours, 1);

        const signerAddress = await this.signer.getAddress();
        const network = await this.provider.getNetwork();
        const chainId = Number(network.chainId);
        if (chainId !== this._chainId) {
            throw new Error(`Chain mismatch: SDK configured for ${this._chainId}, signer connected to ${chainId}`);
        }

        // Calculate durations in seconds
        const minCoverageDuration = minDurationWeeks * 7 * 24 * 60 * 60;
        const maxCoverageDuration = maxDurationWeeks * 7 * 24 * 60 * 60;

        // Calculate expiry
        const reservationExpiry = Math.floor(Date.now() / 1000) + expiryHours * 60 * 60;

        // Generate nonce and salt
        const nonce = LayerCoverSDK._randomUint(12).toString();
        const salt = ethers.hexlify(ethers.randomBytes(32));

        // Create Reserve Intent
        const reserveIntent: ReserveIntent = {
            solver: signerAddress,
            underwriter: syndicateAddress,
            poolId,
            minCoverageDuration,
            maxCoverageDuration,
            coverageAmount: coverageAmount.toString(),
            minFillAmount: (minFillAmount ?? (allowPartialFill ? 0n : coverageAmount)).toString(),
            allowPartialFill,
            reservationExpiry,
            nonce,
            whitelistedBuyer,
            minPremiumBps: premiumRateBps, // Use premium rate as the floor
            cancellationPenaltyBps: 0, // No early cancellation penalty by default
        };

        // Sign Reserve Intent
        const reserveDomain = {
            ...LayerCoverSDK.RESERVE_INTENT_DOMAIN,
            chainId,
            verifyingContract: syndicateAddress,
        };

        const reserveValue = {
            solver: reserveIntent.solver,
            underwriter: reserveIntent.underwriter,
            poolId: reserveIntent.poolId,
            minCoverageDuration: reserveIntent.minCoverageDuration,
            maxCoverageDuration: reserveIntent.maxCoverageDuration,
            coverageAmount: BigInt(reserveIntent.coverageAmount),
            minFillAmount: BigInt(reserveIntent.minFillAmount),
            allowPartialFill: reserveIntent.allowPartialFill,
            reservationExpiry: reserveIntent.reservationExpiry,
            nonce: BigInt(reserveIntent.nonce),
            whitelistedBuyer: reserveIntent.whitelistedBuyer || ethers.ZeroAddress,
            minPremiumBps: reserveIntent.minPremiumBps,
            cancellationPenaltyBps: reserveIntent.cancellationPenaltyBps,
        };

        const reserveSignature = await (this.signer as any).signTypedData(
            reserveDomain,
            LayerCoverSDK.RESERVE_INTENT_TYPES,
            reserveValue
        );

        // Create Coverage Intent
        const coverageIntent = {
            maker: syndicateAddress,
            poolId,
            coverageAmount: coverageAmount.toString(),
            premiumRateBps,
            minPremiumBps: 0,
            minDuration: minCoverageDuration,
            maxDuration: maxCoverageDuration,
            nonce,
            expiry: reservationExpiry,
            salt,
            requiresUpfront: true,
            cancellationPenaltyBps: 0,
            minFillAmount: (minFillAmount ?? (allowPartialFill ? 0n : coverageAmount)).toString(),
            whitelistedBuyer: whitelistedBuyer || ethers.ZeroAddress,
        };

        // Resolve IntentMatcher address
        let intentMatcher = intentMatcherAddress;
        if (!intentMatcher) {
            const addresses = CONTRACT_ADDRESSES[chainId];
            intentMatcher = addresses?.intentOrderBook;
        }

        if (!intentMatcher || intentMatcher === ethers.ZeroAddress) {
            throw new Error(`IntentMatcher address not found for chain ${chainId}. Provide intentMatcherAddress in params.`);
        }

        // Sign Coverage Intent
        const intentDomain = {
            ...LayerCoverSDK.COVERAGE_INTENT_DOMAIN,
            chainId,
            verifyingContract: intentMatcher,
        };

        const intentValue = {
            maker: coverageIntent.maker,
            poolId: coverageIntent.poolId,
            coverageAmount: BigInt(coverageIntent.coverageAmount),
            premiumRateBps: coverageIntent.premiumRateBps,
            minDuration: coverageIntent.minDuration,
            maxDuration: coverageIntent.maxDuration,
            nonce: BigInt(coverageIntent.nonce),
            expiry: coverageIntent.expiry,
            salt: BigInt(coverageIntent.salt),
            requiresUpfront: coverageIntent.requiresUpfront,
            cancellationPenaltyBps: coverageIntent.cancellationPenaltyBps,
            minFillAmount: BigInt(coverageIntent.minFillAmount),
            whitelistedBuyer: coverageIntent.whitelistedBuyer,
        };

        const intentSignature = await (this.signer as any).signTypedData(
            intentDomain,
            LayerCoverSDK.COVERAGE_INTENT_TYPES,
            intentValue
        );

        // Submit to API
        const quoteData = {
            poolId,
            deployment: this._deployment,
            syndicateAddress,
            coverageAmount: coverageAmount.toString(),
            premiumRateBps,
            minDurationWeeks,
            maxDurationWeeks,
            whitelistedBuyer: whitelistedBuyer !== ethers.ZeroAddress ? whitelistedBuyer : undefined,
            reserveIntent,
            signature: reserveSignature,
            coverageIntent,
            intentSignature,
            createdAt: new Date().toISOString(),
        };

        const response = await this._fetchApi(`${this._apiBaseUrl}/api/quotes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(quoteData),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Failed to submit quote: ${response.status}`);
        }

        const result = await response.json();

        return {
            quoteId: result.quote.id,
            quote: {
                id: result.quote.id,
                poolId: result.quote.poolId,
                syndicateAddress: result.quote.syndicateAddress,
                syndicateName: result.quote.syndicateName,
                coverageAmount: result.quote.coverageAmount,
                premiumRateBps: result.quote.premiumRateBps,
                minDurationWeeks: result.quote.minDurationWeeks,
                maxDurationWeeks: result.quote.maxDurationWeeks,
                expiresAt: result.quote.expiresAt,
                status: result.quote.status,
            },
            reserveIntent,
            coverageIntent,
            reserveSignature,
            intentSignature,
        };
    }

    /**
     * Cancel an existing quote
     * @param quoteId The quote ID to cancel
     */
    async cancelQuote(quoteId: string): Promise<boolean> {
        const response = await this._fetchApi(`${this._apiBaseUrl}/api/quotes?quoteId=${encodeURIComponent(quoteId)}`, {
            method: 'DELETE',
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Failed to cancel quote: ${response.status}`);
        }

        return true;
    }

    /**
     * Get quotes for a specific syndicate
     * @param syndicateAddress The syndicate address
     * @param includeClosed Whether to include cancelled/filled quotes
     */
    async getSyndicateQuotes(syndicateAddress: string, includeClosed = false): Promise<FixedRateQuote[]> {
        const url = `${this._apiBaseUrl}/api/quotes?syndicateAddress=${encodeURIComponent(syndicateAddress)}&includeClosed=${includeClosed}`;

        const response = await this._fetchApi(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch syndicate quotes: ${response.status}`);
        }

        const data = await response.json();
        return (data.quotes || []).map((q: any) => ({
            id: q.id,
            poolId: q.poolId,
            syndicateAddress: q.syndicateAddress,
            syndicateName: q.syndicateName || 'Unknown',
            coverageAmount: q.coverageAmount?.toString() || q.reserveIntent?.coverageAmount || '0',
            premiumRateBps: Number(q.premiumRateBps),
            minDurationWeeks: Number(q.minDurationWeeks),
            maxDurationWeeks: Number(q.maxDurationWeeks),
            expiresAt: q.expiresAt,
            status: q.status || 'active',
            orderId: q.orderId,
        }));
    }

    /**
     * Get total quoted exposure for a syndicate
     * @param syndicateAddress The syndicate address
     */
    async getSyndicateExposure(syndicateAddress: string): Promise<{
        totalExposure: string;
        activeQuoteCount: number;
    }> {
        const response = await this._fetchApi(
            `${this._apiBaseUrl}/api/quotes/exposure?syndicateAddress=${encodeURIComponent(syndicateAddress)}`
        );

        if (!response.ok) {
            throw new Error(`Failed to fetch syndicate exposure: ${response.status}`);
        }

        const data = await response.json();
        return {
            totalExposure: data.totalExposure || '0',
            activeQuoteCount: data.activeQuoteCount || 0,
        };
    }

    // ========================================================================
    // UTILITY METHODS
    // ========================================================================

    /**
     * Get the payment token address for a pool (usually USDC).
     *
     * @param poolId The pool ID to query
     * @returns ERC-20 token address used for premium payments in this pool
     */
    async getPaymentToken(poolId: number): Promise<string> {
        await this._ensureContracts();
        const staticData = await this._poolRegistry!.getPoolStaticData(poolId);
        return staticData[0];
    }

    /**
     * Get full pool metadata including token info resolved from chain
     * @param poolId The pool ID to fetch metadata for
     */
    async getPoolMetadata(poolId: number): Promise<PoolMetadata> {
        await this._ensureContracts();

        // Get token address from pool static data
        const staticData = await this._poolRegistry!.getPoolStaticData(poolId);
        const tokenAddress: string = staticData[0];

        // Create token contract to read metadata
        const tokenContract = new Contract(tokenAddress, [
            'function symbol() view returns (string)',
            'function decimals() view returns (uint8)',
            'function name() view returns (string)',
        ], this.provider);

        // Fetch token metadata from chain
        const [tokenSymbol, tokenDecimals, tokenName] = await Promise.all([
            tokenContract.symbol(),
            tokenContract.decimals(),
            tokenContract.name(),
        ]);

        // Get static pool config or use defaults
        const poolConfig = POOL_CONFIG[poolId] || DEFAULT_POOL_CONFIG;

        // Derive token logo from symbol (more reliable than pool config)
        const tokenLogoUrl = getTokenLogoUrl(tokenSymbol);

        return {
            poolId,
            poolName: poolConfig.poolName || `${tokenSymbol} Protection`,
            tokenAddress,
            tokenSymbol,
            tokenDecimals: Number(tokenDecimals),
            tokenName,
            tokenLogoUrl,
            payoutTokenSymbol: 'USDC',
            payoutTokenLogoUrl: USDC_LOGO_URL,
        };
    }

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
    async prepareApprovalTx(poolId: number, amount: bigint) {
        const tokenAddress = await this.getPaymentToken(poolId);
        const orderBookAddress = this.intentOrderBook
            ? await this.intentOrderBook.getAddress()
            : await this.policyManager.getAddress();

        const token = new Contract(tokenAddress, [
            'function approve(address spender, uint256 amount) external returns (bool)'
        ], this.signer || this.provider);

        return await token.approve.populateTransaction(orderBookAddress, amount);
    }

    // ========================================================================
    // DEPRECATED METHODS
    // ========================================================================

    /**
     * @deprecated Use getFixedRateQuotes() for the current fixed-rate model.
     * This method is no longer supported as the protocol has transitioned to
     * 100% fixed-rate coverage.
     */
    async getQuote(poolId: number, coverAmount: bigint, periodDays: number, maxRateBps?: number): Promise<Quote> {
        console.warn(
            'DEPRECATION WARNING: getQuote() is deprecated. ' +
            'The protocol now uses fixed-rate quotes via getFixedRateQuotes(). ' +
            'See https://docs.layercover.com/sdk-migration for migration guide.'
        );

        // Attempt to use fixed-rate quotes instead
        const quotes = await this.getFixedRateQuotes(poolId);

        if (quotes.length === 0) {
            throw new NoQuotesAvailableError(
                'No quotes available. The protocol now uses fixed-rate quotes. ' +
                'Use getFixedRateQuotes() instead.'
            );
        }

        const bestQuote = quotes[0];
        const durationSeconds = periodDays * 86400;
        const premium = this.calculatePremium(coverAmount, bestQuote.premiumRateBps, durationSeconds);

        if (maxRateBps && bestQuote.premiumRateBps > maxRateBps) {
            throw new RateTooHighError(
                `Rate ${bestQuote.premiumRateBps} bps exceeds max ${maxRateBps} bps`,
                bestQuote.premiumRateBps,
                maxRateBps
            );
        }

        return {
            poolId,
            amount: coverAmount,
            period: durationSeconds,
            rateBps: bestQuote.premiumRateBps,
            premium,
            minDeposit: premium,
            capacity: BigInt(bestQuote.coverageAmount),
        };
    }

    /**
     * @deprecated Use prepareBuyFromQuoteTx() or purchase() for the fixed-rate model.
     */
    async preparePurchaseTx(poolId: number, coverAmount: bigint, maxPremium: bigint, referralCode?: string, durationSeconds?: number) {
        console.warn(
            'DEPRECATION WARNING: preparePurchaseTx() is deprecated. ' +
            'Use prepareBuyFromQuoteTx() or purchase() for the fixed-rate model.'
        );

        // Get best quote and prepare transaction
        const quotes = await this.getFixedRateQuotes(poolId);

        if (quotes.length === 0) {
            throw new NoQuotesAvailableError('No quotes available for this pool');
        }

        const bestQuote = quotes[0];

        if (bestQuote.orderId !== undefined && bestQuote.orderId !== null) {
            // Use buyFromQuote path
            // Use provided duration or fallback to max duration (legacy behavior)
            const duration = durationSeconds || bestQuote.maxDurationWeeks * 7 * 24 * 60 * 60;
            return await this.prepareBuyFromQuoteTx(bestQuote.orderId, coverAmount, duration);
        }

        throw new Error(
            'No on-chain orders available. Use the purchase() method for intent-based purchases.'
        );
    }

    // ========================================================================
    // PRIVATE HELPERS
    // ========================================================================

    private static async _sleep(ms: number): Promise<void> {
        await new Promise(resolve => setTimeout(resolve, ms));
    }

    private static _isRetryableStatus(status: number): boolean {
        return status === 408 || status === 429 || status >= 500;
    }

    private static _isRetryableFetchError(error: unknown): boolean {
        const message = String((error as any)?.message || '').toLowerCase();
        return message.includes('network')
            || message.includes('fetch')
            || message.includes('timeout')
            || message.includes('timed out')
            || message.includes('econnreset')
            || message.includes('etimedout')
            || message.includes('socket');
    }

    private static async _fetchWithPolicy(
        url: string,
        init: RequestInit,
        policy: {
            timeoutMs: number;
            retries: number;
            retryDelayMs: number;
            retryOnNonIdempotent?: boolean;
            logger?: SDKLogger;
        }
    ): Promise<Response> {
        const method = (init.method || 'GET').toUpperCase();
        const idempotentMethods = method === 'GET' || method === 'HEAD' || method === 'OPTIONS' || method === 'DELETE';
        const retries = (idempotentMethods || policy.retryOnNonIdempotent)
            ? Math.max(0, policy.retries)
            : 0;

        let lastError: unknown;

        for (let attempt = 0; attempt <= retries; attempt++) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), policy.timeoutMs);

            try {
                const response = await fetch(url, { ...init, signal: controller.signal });
                clearTimeout(timeout);

                if (LayerCoverSDK._isRetryableStatus(response.status) && attempt < retries) {
                    try {
                        await response.body?.cancel();
                    } catch { }
                    policy.logger?.warn(`[LayerCover SDK] API retry ${attempt + 1}/${retries} after HTTP ${response.status}: ${method} ${url}`);
                    await LayerCoverSDK._sleep(policy.retryDelayMs * (2 ** attempt));
                    continue;
                }

                return response;
            } catch (error) {
                clearTimeout(timeout);

                const timedOut = (error as any)?.name === 'AbortError';
                lastError = timedOut
                    ? new Error(`Request timed out after ${policy.timeoutMs}ms: ${method} ${url}`)
                    : error;

                if (attempt < retries && (timedOut || LayerCoverSDK._isRetryableFetchError(error))) {
                    policy.logger?.warn(`[LayerCover SDK] API retry ${attempt + 1}/${retries} after ${timedOut ? 'timeout' : 'network error'}: ${method} ${url}`);
                    await LayerCoverSDK._sleep(policy.retryDelayMs * (2 ** attempt));
                    continue;
                }

                throw lastError;
            }
        }

        throw (lastError instanceof Error
            ? lastError
            : new Error(`Request failed: ${method} ${url}`));
    }

    private async _fetchApi(
        url: string,
        init: RequestInit = {},
        options: { retries?: number; timeoutMs?: number; retryOnNonIdempotent?: boolean } = {}
    ): Promise<Response> {
        return LayerCoverSDK._fetchWithPolicy(url, init, {
            timeoutMs: options.timeoutMs ?? this._requestTimeoutMs,
            retries: options.retries ?? this._maxRetries,
            retryDelayMs: this._retryDelayMs,
            retryOnNonIdempotent: options.retryOnNonIdempotent ?? false,
            logger: this._log,
        });
    }

    private async _waitForTx(tx: ethers.TransactionResponse): Promise<ethers.TransactionReceipt> {
        const receipt = await tx.wait(this._txConfirmations, this._txWaitTimeoutMs);
        if (!receipt) {
            throw new Error(`Transaction ${tx.hash} was not confirmed`);
        }
        if (receipt.status === 0) {
            throw new Error(`Transaction ${tx.hash} reverted`);
        }
        return receipt;
    }

    private _assertInteger(name: string, value: unknown, min: number): void {
        if (!Number.isInteger(value) || (value as number) < min) {
            throw new Error(`${name} must be an integer >= ${min}`);
        }
    }

    private _assertPositiveBigInt(name: string, value: unknown): void {
        if (typeof value !== 'bigint' || value <= 0n) {
            throw new Error(`${name} must be > 0`);
        }
    }

    private _normalizeReferralCode(referralCode?: string): string {
        if (!referralCode) return ethers.ZeroHash;
        if (!/^0x[a-fA-F0-9]{64}$/.test(referralCode)) {
            throw new Error('referralCode must be a bytes32 hex string (0x + 64 hex chars)');
        }
        return referralCode.toLowerCase();
    }

    private async _assertConfiguredChain(): Promise<void> {
        const network = await this.provider.getNetwork();
        const connectedChainId = Number(network.chainId);
        if (connectedChainId !== this._chainId) {
            throw new Error(`Chain mismatch: SDK configured for ${this._chainId}, signer connected to ${connectedChainId}`);
        }
    }

    private async _ensureContracts() {
        if (this._poolRegistry) return;

        // Only try to fetch address once
        let engineAddr = ethers.ZeroAddress;
        try {
            engineAddr = await this.policyManager.rateEngine();
        } catch { }

        const [regAddr, umAddr, rmAddr] = await Promise.all([
            this.policyManager.poolRegistry(),
            this.policyManager.underwriterManager(),
            this.policyManager.riskManager()
        ]);

        // Updated ABI
        this._poolRegistry = new Contract(regAddr, [
            'function getPoolStaticData(uint256 poolId) view returns (address token, uint256 sold, bool paused, address feeRecipient, uint16 claimFee, uint8 riskRating, bool useEscrow)',
            'function getPoolRateModel(uint256 poolId) view returns (tuple(uint256 base, uint256 slope1, uint256 slope2, uint256 kink, uint256 minRateBps, uint256 maxRateBps, bool overrideEnabled, uint256 overrideRateBps))'
        ], this.provider);

        this._underwriterManager = new Contract(umAddr, [
            'function getPoolCapitalHeadroom(uint256 poolId) view returns (uint256 activeCapital, uint256 availableCoverage)'
        ], this.provider);

        if (engineAddr !== ethers.ZeroAddress) {
            this._rateEngine = new Contract(engineAddr, [
                'function previewRate(uint256 poolId, uint256 sold, uint256 availableCapital) view returns (uint256)'
            ], this.provider);
        }
    }

    private static _randomUint(bytes: number): bigint {
        return ethers.toBigInt(ethers.randomBytes(bytes));
    }

    // ========================================================================
    // STATIC HELPERS
    // ========================================================================

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
    static calculateNetYield(baseApy: number, costBps: number) {
        return {
            baseApy,
            premiumRate: costBps / 100, // bps to %
            netApy: baseApy - (costBps / 100)
        };
    }

    // ========================================================================
    // QUOTE WATCHING
    // ========================================================================

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
    watchQuotes(
        poolId: number,
        callback: (quotes: FixedRateQuote[]) => void,
        options: {
            /** Refresh interval in ms (default: 30000 = 30s) */
            refreshIntervalMs?: number;
            /** Filter out expired quotes (default: true) */
            filterExpired?: boolean;
            /** Only include 'active' status quotes (default: true) */
            filterInactive?: boolean;
        } = {}
    ): () => void {
        this._assertInteger('poolId', poolId, 1);
        const interval = options.refreshIntervalMs ?? 30_000;
        this._assertInteger('refreshIntervalMs', interval, 1_000);
        const filterExpired = options.filterExpired ?? true;
        const filterInactive = options.filterInactive ?? true;
        let stopped = false;
        let inFlight = false;

        const refresh = async () => {
            if (stopped || inFlight) return;
            inFlight = true;
            try {
                let quotes = await this.getFixedRateQuotes(poolId);

                if (filterExpired) {
                    quotes = quotes.filter(q => !LayerCoverSDK.isQuoteExpired(q));
                }
                if (filterInactive) {
                    quotes = quotes.filter(q => q.status === 'active');
                }

                // Sort by rate (cheapest first)
                quotes = LayerCoverSDK.sortQuotesByRate(quotes);

                if (!stopped) {
                    callback(quotes);
                }
            } catch (err) {
                // Silently continue on network errors — the next cycle will retry
                this._log.warn('[LayerCover SDK] Quote refresh failed:', (err as Error).message);
            } finally {
                inFlight = false;
            }
        };

        // Initial fetch immediately
        refresh();

        // Set up recurring refresh
        const timer = setInterval(refresh, interval);

        // Return cleanup function
        return () => {
            stopped = true;
            clearInterval(timer);
        };
    }

    // ========================================================================
    // POLICY LIFECYCLE
    // ========================================================================

    /**
     * Resolve the PolicyNFT contract (cached after first call).
     * @internal
     */
    private async _getPolicyNFT(): Promise<Contract> {
        if (!this._policyNFT) {
            // Try pre-configured address first, fall back to on-chain lookup
            let nftAddr: string = this._policyNFTAddress || '';
            if (!nftAddr) {
                nftAddr = await this.policyManager.policyNFT();
            }
            this._policyNFT = new Contract(
                nftAddr,
                [
                    // ERC721 enumeration
                    'function balanceOf(address owner) view returns (uint256)',
                    'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
                    'function ownerOf(uint256 tokenId) view returns (address)',
                    'function totalSupply() view returns (uint256)',
                    // Policy data
                    'function getPolicy(uint256 id) view returns (tuple(uint256 coverage, uint256 poolId, uint64 start, uint64 activation, uint64 claimableFrom, uint64 startBlock, bool voided, uint128 premiumDeposit, uint128 lastDrainTime, tuple(address underwriter, uint16 fixedRateBps, uint16 cancellationPenaltyBps, uint64 endTime, bytes32 reservationKey, uint256 reinsuredPortion) intent, tuple(address vault, uint256 sharesInsured, uint256 insuredValueUSDC, uint256 pricePerShareSnapshot) vaultCover))',
                ],
                this.signer || this.provider
            );
        }
        return this._policyNFT;
    }

    /**
     * Map raw on-chain policy struct to a clean UserPolicy object.
     * @internal
     */
    private _mapPolicy(policyId: number, owner: string, raw: any, active: boolean): UserPolicy {
        const now = Math.floor(Date.now() / 1000);
        const endTime = Number(raw.intent.endTime);
        let status: UserPolicy['status'] = 'active';

        if (raw.voided) status = 'voided';
        else if (BigInt(raw.coverage) === 0n) status = 'cancelled';
        else if (!active || now > endTime) status = 'expired';

        const policy: UserPolicy = {
            policyId,
            owner,
            poolId: Number(raw.poolId),
            coverage: raw.coverage.toString(),
            startTimestamp: Number(raw.start),
            activationTimestamp: Number(raw.activation),
            claimableFrom: Number(raw.claimableFrom),
            voided: raw.voided,
            premiumDeposit: raw.premiumDeposit.toString(),
            fixedRateBps: Number(raw.intent.fixedRateBps),
            endTimestamp: endTime,
            underwriter: raw.intent.underwriter,
            cancellationPenaltyBps: Number(raw.intent.cancellationPenaltyBps),
            isActive: active,
            status,
        };

        // Include vault cover info if present
        if (raw.vaultCover && raw.vaultCover.vault !== ethers.ZeroAddress) {
            policy.vaultCover = {
                vault: raw.vaultCover.vault,
                sharesInsured: raw.vaultCover.sharesInsured.toString(),
                insuredValueUSDC: raw.vaultCover.insuredValueUSDC.toString(),
            };
        }

        return policy;
    }

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
    async getMyPolicies(ownerAddress: string): Promise<UserPolicy[]> {
        // Primary: use the API endpoint (same as the dashboard)
        try {
            const url = `${this._apiBaseUrl}/api/policies/user/${ownerAddress.toLowerCase()}`;
            const response = await this._fetchApi(url);
            if (response.ok) {
                const data = await response.json();
                if (data.policies && Array.isArray(data.policies)) {
                    return data.policies.map((p: any) => ({
                        policyId: Number(p.id),
                        owner: p.holder || ownerAddress,
                        poolId: Number(p.poolId || 0),
                        coverage: p.coverage || '0',
                        startTimestamp: Number(p.start || 0),
                        activationTimestamp: Number(p.activation || 0),
                        claimableFrom: Number(p.claimableFrom || 0),
                        voided: false,
                        premiumDeposit: p.premiumDeposit || '0',
                        fixedRateBps: Number(p.intent?.fixedRateBps || 0),
                        endTimestamp: Number(p.intent?.endTime || 0),
                        underwriter: p.intent?.underwriter || ethers.ZeroAddress,
                        cancellationPenaltyBps: 0,
                        isActive: Boolean(p.isActive),
                        status: p.isActive ? 'active' as const : 'expired' as const,
                    })).sort((a: UserPolicy, b: UserPolicy) => b.startTimestamp - a.startTimestamp);
                }
            }
        } catch (apiErr: any) {
            this._log.warn('[LayerCover SDK] API policy fetch failed, trying on-chain:', apiErr.message);
        }

        // Fallback: on-chain via PolicyNFT
        let nft: Contract;
        try {
            nft = await this._getPolicyNFT();
        } catch (err: any) {
            this._log.warn('[LayerCover SDK] Could not resolve PolicyNFT contract — getMyPolicies unavailable:', err.message);
            return [];
        }
        const balance = Number(await nft.balanceOf(ownerAddress));

        if (balance === 0) return [];

        // Fetch all token IDs in parallel
        const idPromises = Array.from({ length: balance }, (_, i) =>
            nft.tokenOfOwnerByIndex(ownerAddress, i)
        );
        const tokenIds: bigint[] = await Promise.all(idPromises);

        // Fetch policy data + active status in parallel
        const policyPromises = tokenIds.map(async (id) => {
            const policyId = Number(id);
            const [raw, active] = await Promise.all([
                nft.getPolicy(policyId),
                this.policyManager.isPolicyActive(policyId),
            ]);
            return this._mapPolicy(policyId, ownerAddress, raw, active);
        });

        const policies = await Promise.all(policyPromises);

        // Sort by most recent first
        return policies.sort((a, b) => b.startTimestamp - a.startTimestamp);
    }

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
    async getPolicyDetails(policyId: number): Promise<UserPolicy> {
        const nft = await this._getPolicyNFT();

        const [raw, owner, active] = await Promise.all([
            nft.getPolicy(policyId),
            nft.ownerOf(policyId),
            this.policyManager.isPolicyActive(policyId),
        ]);

        return this._mapPolicy(policyId, owner, raw, active);
    }

    /**
     * Check if a policy is currently active on-chain.
     *
     * @param policyId On-chain policy NFT ID
     * @returns True if active and funded
     */
    async isPolicyActive(policyId: number): Promise<boolean> {
        return this.policyManager.isPolicyActive(policyId);
    }

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
    async prepareCancelCoverTx(policyId: number): Promise<{ to: string; data: string }> {
        const data = this.policyManager.interface.encodeFunctionData('cancelCover', [policyId]);
        return {
            to: await this.policyManager.getAddress(),
            data,
        };
    }

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
    async prepareLapsePolicyTx(policyId: number): Promise<{ to: string; data: string }> {
        const data = this.policyManager.interface.encodeFunctionData('lapsePolicy', [policyId]);
        return {
            to: await this.policyManager.getAddress(),
            data,
        };
    }

    // ========================================================================
    // ERROR TRANSLATION
    // ========================================================================

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
    static getHumanError(error: any): string {
        return _getHumanError(error);
    }
}
