import { ethers, Contract, Signer, Provider } from 'ethers';
export * from './adapters';


const BPS = 10000n;
const SECS_YEAR = 31536000n;

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
    // Base Sepolia (testnet)
    84532: {
        policyManager: '0x33807f8c7b35E7233e33aFCDB6b3fea0C535c015',
        intentOrderBook: '0x6952Df9bf4615b73B005C79AB19FD53385eD96ae',
    },
    // Base Mainnet (future)
    8453: {
        policyManager: '0x0000000000000000000000000000000000000000',
        intentOrderBook: '0x0000000000000000000000000000000000000000',
    },
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

export class RateTooHighError extends Error {
    constructor(message: string, public rate: number, public maxRate: number) {
        super(message);
        this.name = "RateTooHighError";
    }
}

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
    /** API base URL for fetching quotes (default: https://app.layercover.com) */
    apiBaseUrl?: string;
    /** Deployment identifier (e.g., 'base_sepolia_usdc') */
    deployment?: string;
    /** Chain ID (used to resolve contract addresses) */
    chainId?: number;
}

// ============================================================================
// MAIN SDK CLASS
// ============================================================================

export class LayerCoverSDK {
    provider: Provider;
    signer?: Signer;
    policyManager: Contract;
    intentOrderBook?: Contract;

    private _apiBaseUrl: string;
    private _deployment: string;
    private _chainId: number;

    // Cache addresses
    private _poolRegistry?: Contract;
    private _underwriterManager?: Contract;
    private _riskManager?: Contract;
    private _rateEngine?: Contract;

    constructor(
        providerOrSigner: Provider | Signer,
        policyManagerAddress: string,
        options: LayerCoverSDKOptions = {}
    ) {
        if ('signMessage' in providerOrSigner) {
            this.signer = providerOrSigner as Signer;
            this.provider = this.signer.provider!;
        } else {
            this.provider = providerOrSigner as Provider;
        }

        this._apiBaseUrl = options.apiBaseUrl || DEFAULT_API_BASE_URL;
        this._deployment = options.deployment || 'base_sepolia_usdc';
        this._chainId = options.chainId || DEFAULT_CHAIN_ID;

        this.policyManager = new Contract(
            policyManagerAddress,
            [
                'function poolRegistry() view returns (address)',
                'function riskManager() view returns (address)',
                'function underwriterManager() view returns (address)',
                'function rateEngine() view returns (address)',
                'function capitalPool() view returns (address)',
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
                    // Buy from existing on-chain sell order (with referral code)
                    'function buyFromQuote(uint256 orderId, uint256 coverageAmount, uint256 duration, bool requiresUpfront, bytes32 referralCode) external returns (uint256 policyId)',
                    // Post a buy order (with referral code)
                    'function postBuyOrder(tuple(address taker, uint256 poolId, uint256 coverageAmount, uint256 maxPremiumRateBps, uint256 duration, uint256 premiumDeposit, uint256 nonce, uint256 expiry, uint256 salt, bytes32 referralCode) order) external returns (uint256 orderId)',
                    // Fill a buy order with intent
                    'function fillBuyOrder(uint256 orderId, uint256 offerRateBps, uint256 fillAmount, bool requiresUpfront, tuple(address solver, address underwriter, uint256 poolId, uint256 minCoverageDuration, uint256 maxCoverageDuration, uint256 coverageAmount, uint256 minFillAmount, bool allowPartialFill, uint256 reservationExpiry, uint256 nonce, address whitelistedBuyer, bool autoAllocate) reserveIntent, bytes signature) external returns (uint256 policyId)',
                    // Get sell order details
                    'function getSellOrder(uint256 orderId) view returns (tuple(address syndicate, address solver, uint256 poolId, uint256 minCoverageDuration, uint256 maxCoverageDuration, uint256 remainingCoverage, uint256 minFillAmount, uint256 rateBps, uint64 expiry, bytes32 reservationKey, bool cancelled, bool filled))',
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
    } = {}): Promise<{
        contracts: {
            policyManager: string;
            intentOrderBook: string;
            intentMatcher?: string;
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

        console.log('[LayerCover SDK] Fetching config from:', url);

        const response = await fetch(url);
        if (!response.ok) {
            console.warn('[LayerCover SDK] Failed to fetch config, using fallback addresses');
            // Fallback to hardcoded addresses
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
                apiBaseUrl: apiBase,
            };
        }

        const data = await response.json();

        // Cache the config for 5 minutes
        LayerCoverSDK._cachedConfig = {
            contracts: data.contracts,
            chainId: data.chainId || options.chainId || DEFAULT_CHAIN_ID,
            apiBaseUrl: data.apiBaseUrl || apiBase,
            deployment: data.deployment || options.deployment,
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
        } = {}
    ): Promise<LayerCoverSDK> {
        // Check cache (valid for 5 minutes)
        const cacheValid = LayerCoverSDK._cachedConfig &&
            (Date.now() - LayerCoverSDK._cachedConfig.fetchedAt) < 5 * 60 * 1000;

        const config = cacheValid
            ? LayerCoverSDK._cachedConfig!
            : await LayerCoverSDK.fetchConfig(options);

        return new LayerCoverSDK(providerOrSigner, config.contracts.policyManager, {
            intentOrderBookAddress: config.contracts.intentOrderBook,
            apiBaseUrl: config.apiBaseUrl,
            chainId: config.chainId,
            deployment: config.deployment,
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
        const url = `${this._apiBaseUrl}/api/quotes?poolId=${poolId}&deployment=${this._deployment}`;
        console.log('[LayerCover SDK] Fetching quotes from:', url);

        const response = await fetch(url);
        console.log('[LayerCover SDK] Response status:', response.status);
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
        const url = `${this._apiBaseUrl}/api/quotes`;

        const response = await fetch(url, {
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
        return {
            reserveIntent: data.reserveIntent,
            signature: data.signature,
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
        const quotes = await this.getFixedRateQuotes(poolId);
        if (quotes.length === 0) return null;
        return quotes[0].premiumRateBps;
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
        if (!this.intentOrderBook) {
            throw new Error('IntentOrderBook not configured');
        }

        return await this.intentOrderBook.buyFromQuote.populateTransaction(
            orderId,
            coverageAmount,
            durationSeconds,
            true, // requiresUpfront
            referralCode || ethers.ZeroHash
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
        if (!this.signer) {
            throw new Error('Signer required for purchase');
        }
        if (!this.intentOrderBook) {
            throw new Error('IntentOrderBook not configured');
        }

        const signerAddress = await this.signer.getAddress();

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
            await approveTx.wait();
        }

        // 4. Post buy order
        const buyOrder = {
            taker: signerAddress,
            poolId: quote.poolId,
            coverageAmount: coverageAmount,
            maxPremiumRateBps: Math.round(quote.premiumRateBps * 1.01), // 1% slippage
            duration: durationSeconds,
            premiumDeposit: premiumWithBuffer,
            nonce: Math.floor(Date.now() / 1000),
            expiry: Math.floor(Date.now() / 1000) + 3600, // 1 hour
            salt: Math.floor(Math.random() * 1000000),
            referralCode: referralCode || ethers.ZeroHash,
        };

        const postTx = await this.intentOrderBook.postBuyOrder(buyOrder);
        const postReceipt = await postTx.wait();

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
        const intentStruct = {
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
            autoAllocate: reserveIntent.autoAllocate,
        };

        const fillTx = await this.intentOrderBook.fillBuyOrder(
            orderId,
            quote.premiumRateBps,
            coverageAmount,
            true, // requiresUpfront
            intentStruct,
            signature
        );

        const fillReceipt = await fillTx.wait();

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
        // 1. Fetch available quotes
        const quotes = await this.getFixedRateQuotes(poolId);

        if (quotes.length === 0) {
            throw new NoQuotesAvailableError(
                `No quotes available for pool ${poolId}. ` +
                'Coverage can only be purchased when underwriters provide quotes.'
            );
        }

        // 2. Select best quote
        const bestQuote = quotes[0];

        if (maxRateBps && bestQuote.premiumRateBps > maxRateBps) {
            throw new RateTooHighError(
                `Best available rate ${bestQuote.premiumRateBps} bps exceeds max ${maxRateBps} bps`,
                bestQuote.premiumRateBps,
                maxRateBps
            );
        }

        const durationSeconds = durationWeeks * 7 * 24 * 60 * 60;

        // 3. Purchase using appropriate path
        if (bestQuote.orderId) {
            // Use simple buyFromQuote for on-chain orders
            if (!this.signer) throw new Error('Signer required for purchase');

            // Approve first
            const premium = this.calculatePremium(coverageAmount, bestQuote.premiumRateBps, durationSeconds);
            const premiumWithBuffer = (premium * 105n) / 100n;

            const paymentToken = await this.getPaymentToken(poolId);
            const tokenContract = new Contract(
                paymentToken,
                ['function approve(address spender, uint256 amount) returns (bool)'],
                this.signer
            );

            const orderBookAddress = await this.intentOrderBook!.getAddress();
            const approveTx = await tokenContract.approve(orderBookAddress, premiumWithBuffer);
            await approveTx.wait();

            // Execute purchase
            const tx = await this.intentOrderBook!.buyFromQuote(
                bestQuote.orderId,
                coverageAmount,
                durationSeconds,
                true,
                referralCode || ethers.ZeroHash
            );
            const receipt = await tx.wait();

            // Extract policy ID
            const iface = new ethers.Interface([
                'event SellOrderFilled(uint256 indexed orderId, address indexed buyer, uint256 amount, uint256 policyId)',
            ]);
            let policyId: string | undefined;
            for (const log of receipt.logs) {
                try {
                    const parsed = iface.parseLog(log);
                    if (parsed?.name === 'SellOrderFilled') {
                        policyId = parsed.args.policyId.toString();
                        break;
                    }
                } catch {
                    continue;
                }
            }

            return { txHash: tx.hash, policyId };
        } else {
            // Use full intent flow
            return await this.purchaseWithIntent(bestQuote, coverageAmount, durationSeconds, referralCode);
        }
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
    async submitQuote(params: {
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
    }> {
        if (!this.signer) {
            throw new Error('Signer required to submit quotes');
        }

        const {
            poolId,
            syndicateAddress,
            syndicateName = 'Unknown',
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

        const signerAddress = await this.signer.getAddress();
        const network = await this.provider.getNetwork();
        const chainId = Number(network.chainId);

        // Calculate durations in seconds
        const minCoverageDuration = minDurationWeeks * 7 * 24 * 60 * 60;
        const maxCoverageDuration = maxDurationWeeks * 7 * 24 * 60 * 60;

        // Calculate expiry
        const reservationExpiry = Math.floor(Date.now() / 1000) + expiryHours * 60 * 60;

        // Generate nonce and salt
        const nonce = Date.now();
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
            nonce: nonce.toString(),
            whitelistedBuyer,
            autoAllocate: true,
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
            minDuration: minCoverageDuration,
            maxDuration: maxCoverageDuration,
            nonce: nonce.toString(),
            expiry: reservationExpiry,
            salt,
            requiresUpfront: true,
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
            syndicateName,
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

        const response = await fetch(`${this._apiBaseUrl}/api/quotes`, {
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
        const response = await fetch(`${this._apiBaseUrl}/api/quotes?quoteId=${encodeURIComponent(quoteId)}`, {
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

        const response = await fetch(url);
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
        const response = await fetch(
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
     * Get the payment token address for a pool (usually USDC)
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
     * Prepare an approval transaction for the payment token
     * @param poolId The ID of the pool to buy cover from
     * @param amount The amount to approve (usually the premium)
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

        if (bestQuote.orderId) {
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

    // ========================================================================
    // STATIC HELPERS
    // ========================================================================

    static calculateNetYield(baseApy: number, costBps: number) {
        return {
            baseApy,
            premiumRate: costBps / 100, // bps to %
            netApy: baseApy - (costBps / 100)
        };
    }
}
