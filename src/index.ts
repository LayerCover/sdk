import { ethers, Contract, Signer, Provider } from 'ethers-v6';
import {
    getHumanError as _getHumanError,
    LayerCoverSDKError,
    PurchaseBlockedError,
    QuoteStaleError,
    SignerRequiredError,
    ChainMismatchError,
} from './errors';
export * from './adapters';
export * from './viem-adapter';
export * from './errors';


const BPS = 10000n;
const SECS_YEAR = 31536000n; // 365 days exactly — canonical for premium math
const MAX_BPS = 10_000;
const DEFAULT_GUARDED_DEADLINE_SECONDS = 15 * 60;
const DEFAULT_GUARDED_DEPOSIT_SLIPPAGE_BPS = 50;
const DEFAULT_GUARDED_MINT_SLIPPAGE_BPS = 50;

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

export type SDKEventType =
    | 'quotes_fetched'
    | 'quote_revalidated'
    | 'purchase_prepared'
    | 'purchase_preparation_blocked'
    | 'approval_submitted'
    | 'approval_confirmed'
    | 'purchase_submitted'
    | 'purchase_confirmed'
    | 'purchase_sync_succeeded'
    | 'purchase_sync_failed';

export interface SDKEvent {
    type: SDKEventType;
    timestamp: string;
    chainId: number;
    deployment: string;
    data: Record<string, unknown>;
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

export type PurchaseBlockerCode =
    | 'NO_ACTIVE_QUOTES'
    | 'RATE_TOO_HIGH'
    | 'QUOTE_STALE'
    | 'NON_EXECUTABLE_QUOTE'
    | 'AMOUNT_EXCEEDS_CAPACITY'
    | 'AMOUNT_BELOW_MIN_FILL'
    | 'DURATION_OUT_OF_RANGE'
    | 'SIGNER_REQUIRED'
    | 'CHAIN_MISMATCH';

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

export type PreparedPurchase =
    | PreparedPurchaseBlocked
    | PreparedPurchaseReady
    | PreparedPurchaseApprovalRequired
    | PreparedPurchaseSignerRequired
    | PreparedPurchaseChainMismatch;

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
 * Legacy chain-level fallback addresses.
 * Prefer deployment-aware config via `/api/config` when available.
 */
export const CONTRACT_ADDRESSES: Record<number, {
    policyManager: string;
    intentOrderBook: string;
    poolRegistry?: string;
    capitalPool?: string;
    purchaseGateway?: string;
    quoteBookExtension?: string;
    systemRegistry?: string;
}> = {
    // Base Sepolia (testnet) — synced with /api/config as of Mar 2026
    84532: {
        policyManager: '0xbd0Cb34253c84201F746F0A9DF062d82c0823c56',
        intentOrderBook: '0x7865f2e07dFe0d4dC4345bF5DFFFAd757a901337',
        poolRegistry: '0xB65cE4662FFB20aE7Ddd7314B975F8A1b6dA4e59',
        systemRegistry: '0xa78504e117Af2474f9F0cEEc3B019188C8E610cA',
    },
    // Avalanche Fuji (testnet)
    43113: {
        policyManager: '0x573e39aB7edfD840778C131d49AE89968bC53C0A',
        intentOrderBook: '0x67e456aa9b976FD75398d94C3Be17FBb55c865ab',
        poolRegistry: '0xDddF32B1e6406D090B35edf770c90A18D55E75fb',
        systemRegistry: '0xa040D40bAa1927B30DCB212A087adf35E8aBBdDB',
    },
    // Ethereum Sepolia (testnet)
    11155111: {
        policyManager: '0xa83A38e37153b59F329204eed0948284b046ac97',
        intentOrderBook: '0x0278E36b7e0214b0912c16460b741Ff526801e5E',
        poolRegistry: '0x00667d277699c4a33BC699be6393c320589819A0',
        purchaseGateway: '0x0cF27022394E7FddFc649d394Bc4c7467Ec08006',
        quoteBookExtension: '0x9155cF88A39ceFDea0D66af20488E3685F3bb2eA',
        systemRegistry: '0xf285ca9d47d7C939b80F5fF85E4Ccd9559e4982E',
    },
    // Local development
    31337: {
        policyManager: '0xc5415607F07b8554354e7689B37B0ED6DAA13205',
        intentOrderBook: '0x2DacaDb603699Fa3367aBE99BB27dD88f5753274',
        poolRegistry: '0x026EF62C333f443Ea68F6ffa659A8Faf781492b7',
        systemRegistry: '0x9FEAeF4F619dAc60ac3936Ab0ebB1cdD72818002',
    },
};

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

export const DEPLOYMENT_FALLBACK_CONFIGS: Record<string, FallbackDeploymentConfig> = {
    base_sepolia_usdc: {
        chainId: 84532,
        contracts: {
            policyManager: '0xbd0Cb34253c84201F746F0A9DF062d82c0823c56',
            intentOrderBook: '0x7865f2e07dFe0d4dC4345bF5DFFFAd757a901337',
            poolRegistry: '0xB65cE4662FFB20aE7Ddd7314B975F8A1b6dA4e59',
            systemRegistry: '0xa78504e117Af2474f9F0cEEc3B019188C8E610cA',
        },
    },
    base_sepolia_wsteth: {
        chainId: 84532,
        contracts: {
            policyManager: '0x1d2c6275dC7DE388E793F6b7B73B93515dEC1B9f',
            intentOrderBook: '0x2715F9faE2e38d24D921480b85f9bCd489bFa5D4',
            poolRegistry: '0x6218439dFd31656a8AC508D7A5e52bEF9eFEf378',
            systemRegistry: '0xa78504e117Af2474f9F0cEEc3B019188C8E610cA',
        },
    },
    avalanche_fuji_usdc: {
        chainId: 43113,
        contracts: {
            policyManager: '0x573e39aB7edfD840778C131d49AE89968bC53C0A',
            intentOrderBook: '0x67e456aa9b976FD75398d94C3Be17FBb55c865ab',
            poolRegistry: '0xDddF32B1e6406D090B35edf770c90A18D55E75fb',
            systemRegistry: '0xa040D40bAa1927B30DCB212A087adf35E8aBBdDB',
        },
    },
    ethereum_sepolia_usdc: {
        chainId: 11155111,
        contracts: {
            policyManager: '0xa83A38e37153b59F329204eed0948284b046ac97',
            intentOrderBook: '0x0278E36b7e0214b0912c16460b741Ff526801e5E',
            poolRegistry: '0x00667d277699c4a33BC699be6393c320589819A0',
            purchaseGateway: '0x0cF27022394E7FddFc649d394Bc4c7467Ec08006',
            quoteBookExtension: '0x9155cF88A39ceFDea0D66af20488E3685F3bb2eA',
            systemRegistry: '0xf285ca9d47d7C939b80F5fF85E4Ccd9559e4982E',
        },
    },
    localhost_usdc: {
        chainId: 31337,
        contracts: {
            policyManager: '0xc5415607F07b8554354e7689B37B0ED6DAA13205',
            intentOrderBook: '0x2DacaDb603699Fa3367aBE99BB27dD88f5753274',
            poolRegistry: '0x026EF62C333f443Ea68F6ffa659A8Faf781492b7',
            systemRegistry: '0x9FEAeF4F619dAc60ac3936Ab0ebB1cdD72818002',
        },
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
 * Default chain ID for LayerCover (Ethereum Sepolia testnet)
 */
export const DEFAULT_CHAIN_ID = 11155111;

/**
 * Default API base URL for LayerCover
 */
export const DEFAULT_API_BASE_URL = 'https://app.layercover.com';
const DEFAULT_DEPLOYMENT = 'ethereum_sepolia_usdc';
const DEFAULT_DEPLOYMENT_BY_CHAIN: Record<number, string> = {
    11155111: 'ethereum_sepolia_usdc',
    84532: 'base_sepolia_usdc',
    43113: 'avalanche_fuji_usdc',
    31337: 'localhost_usdc',
};
const DEFAULT_API_TIMEOUT_MS = 15_000;
const DEFAULT_API_RETRIES = 2;
const DEFAULT_API_RETRY_DELAY_MS = 300;
const DEFAULT_TX_CONFIRMATIONS = 1;
const DEFAULT_TX_WAIT_TIMEOUT_MS = 180_000;
const DEFAULT_QUOTE_STALE_MS = 30_000;

/**
 * Thrown when the best available premium rate exceeds the caller's maximum.
 * Contains both the actual rate and the requested ceiling for UI messaging.
 */
export class RateTooHighError extends LayerCoverSDKError {
    constructor(message: string, public rate: number, public maxRate: number) {
        super(message, 'RATE_TOO_HIGH');
    }
}

/**
 * Thrown when no underwriter quotes are available for a pool.
 * This typically means no syndicates are currently offering coverage.
 */
export class NoQuotesAvailableError extends LayerCoverSDKError {
    constructor(message: string /* , public poolId: number */) {
        super(message, 'NO_ACTIVE_QUOTES');
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

    private _apiBaseUrl: string;
    private _deployment: string;
    private _chainId: number;
    private _log: SDKLogger;
    private _onEvent?: (event: SDKEvent) => void;
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
    private _poolRegistryAddress?: string;
    private _settlementAssetAddress?: string;
    private _purchaseGatewayAddress?: string;
    private _quoteBookExtensionAddress?: string;
    private _systemRegistryAddress?: string;

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

        this._chainId = options.chainId || DEFAULT_CHAIN_ID;
        this._apiBaseUrl = (options.apiBaseUrl || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
        this._deployment = options.deployment || LayerCoverSDK._getDefaultDeploymentForChain(this._chainId) || DEFAULT_DEPLOYMENT;
        this._policyNFTAddress = options.policyNFTAddress;
        this._poolRegistryAddress = options.poolRegistryAddress || CONTRACT_ADDRESSES[this._chainId]?.poolRegistry;
        this._purchaseGatewayAddress = options.purchaseGatewayAddress || CONTRACT_ADDRESSES[this._chainId]?.purchaseGateway;
        this._quoteBookExtensionAddress = options.quoteBookExtensionAddress || CONTRACT_ADDRESSES[this._chainId]?.quoteBookExtension;
        this._systemRegistryAddress = options.systemRegistryAddress || CONTRACT_ADDRESSES[this._chainId]?.systemRegistry;
        this._log = createLogger(options.debug);
        this._onEvent = options.onEvent;
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
                'function REGISTRY() view returns (address)',
                'function policyNFT() view returns (address)',
                'function isPolicyActive(uint256 policyId) view returns (bool)',
                'function cancelCover(uint256 policyId)',
                'function lapsePolicy(uint256 policyId)',
            ],
            this.signer || this.provider
        );

    }

    private _emitEvent(type: SDKEventType, data: Record<string, unknown> = {}): void {
        if (!this._onEvent) return;

        try {
            this._onEvent({
                type,
                timestamp: new Date().toISOString(),
                chainId: this._chainId,
                deployment: this._deployment,
                data,
            });
        } catch (error: any) {
            this._log.warn('[LayerCover SDK] onEvent callback failed:', error?.message || String(error));
        }
    }

    private _emitPreparedPurchaseEvent(result: PreparedPurchase, source: 'pool' | 'quote'): void {
        const eventType = result.status === 'blocked'
            ? 'purchase_preparation_blocked'
            : 'purchase_prepared';

        this._emitEvent(eventType, {
            source,
            status: result.status,
            quoteId: result.quote?.id ?? null,
            poolId: result.quote?.poolId ?? null,
            coverageAmount: result.coverageAmount.toString(),
            durationWeeks: result.durationWeeks,
            blockerCodes: result.blockers.map((blocker) => blocker.code),
        });
    }

    private _buildPurchaseBlockedError(blockers: PurchaseBlocker[]): PurchaseBlockedError {
        const message = blockers.length > 0
            ? blockers.map((blocker) => blocker.message).join(' ')
            : 'Purchase is blocked.';
        return new PurchaseBlockedError(message, blockers);
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
            poolRegistry?: string;
            purchaseGateway?: string;
            quoteBookExtension?: string;
            systemRegistry?: string;
        };
        chainId: number;
        apiBaseUrl: string;
        deployment?: string;
        fetchedAt: number;
    } | null = null;

    private static _getDefaultDeploymentForChain(chainId?: number): string | undefined {
        if (!chainId) return undefined;
        return DEFAULT_DEPLOYMENT_BY_CHAIN[chainId];
    }

    private static _getFallbackDeploymentConfig(deployment?: string): FallbackDeploymentConfig | undefined {
        if (!deployment) return undefined;
        return DEPLOYMENT_FALLBACK_CONFIGS[deployment];
    }

    private static _isCacheValid(
        cache: NonNullable<typeof LayerCoverSDK._cachedConfig>,
        requestedApiBase: string,
        options: { chainId?: number; deployment?: string }
    ): boolean {
        if ((Date.now() - cache.fetchedAt) >= 5 * 60 * 1000) return false;
        if (cache.apiBaseUrl !== requestedApiBase) return false;

        if (options.deployment) {
            if ((cache.deployment || DEFAULT_DEPLOYMENT) !== options.deployment) return false;
        } else if (options.chainId) {
            if (cache.chainId !== options.chainId) return false;

            const defaultDeployment = LayerCoverSDK._getDefaultDeploymentForChain(options.chainId);
            if (defaultDeployment && (cache.deployment || DEFAULT_DEPLOYMENT) !== defaultDeployment) return false;
        } else if ((cache.deployment || DEFAULT_DEPLOYMENT) !== DEFAULT_DEPLOYMENT) {
            return false;
        }

        if (options.chainId && cache.chainId !== options.chainId) return false;
        return true;
    }

    private static _configFallback(options: {
        apiBaseUrl?: string;
        chainId?: number;
        deployment?: string;
    }): {
        contracts: {
            policyManager: string;
            intentOrderBook: string;
            poolRegistry?: string;
            purchaseGateway?: string;
            quoteBookExtension?: string;
            systemRegistry?: string;
        };
        chainId: number;
        apiBaseUrl: string;
        deployment?: string;
    } {
        const apiBaseUrl = (options.apiBaseUrl || DEFAULT_API_BASE_URL).replace(/\/+$/, '');

        if (options.deployment) {
            const deploymentConfig = LayerCoverSDK._getFallbackDeploymentConfig(options.deployment);
            if (!deploymentConfig) {
                throw new Error(
                    `Unable to resolve deployment "${options.deployment}" without /api/config. ` +
                    'Pass explicit contract addresses or a supported chainId.'
                );
            }
            if (options.chainId && deploymentConfig.chainId !== options.chainId) {
                throw new Error(
                    `Deployment "${options.deployment}" is configured for chain ${deploymentConfig.chainId}, not ${options.chainId}`
                );
            }

            return {
                contracts: {
                    policyManager: deploymentConfig.contracts.policyManager,
                    intentOrderBook: deploymentConfig.contracts.intentOrderBook,
                    poolRegistry: deploymentConfig.contracts.poolRegistry,
                    purchaseGateway: deploymentConfig.contracts.purchaseGateway,
                    quoteBookExtension: deploymentConfig.contracts.quoteBookExtension,
                    systemRegistry: deploymentConfig.contracts.systemRegistry,
                },
                chainId: deploymentConfig.chainId,
                apiBaseUrl,
                deployment: options.deployment,
            };
        }

        const chainId = options.chainId || DEFAULT_CHAIN_ID;
        const addresses = CONTRACT_ADDRESSES[chainId];
        if (!addresses) {
            throw new Error(`No configuration available for chainId ${chainId}`);
        }
        return {
            contracts: {
                policyManager: addresses.policyManager,
                intentOrderBook: addresses.intentOrderBook,
                poolRegistry: addresses.poolRegistry,
                purchaseGateway: addresses.purchaseGateway,
                quoteBookExtension: addresses.quoteBookExtension,
                systemRegistry: addresses.systemRegistry,
            },
            chainId,
            apiBaseUrl,
            deployment: LayerCoverSDK._getDefaultDeploymentForChain(chainId) || DEFAULT_DEPLOYMENT,
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
            poolRegistry?: string;
            purchaseGateway?: string;
            quoteBookExtension?: string;
            systemRegistry?: string;
        };
        chainId: number;
        apiBaseUrl: string;
        deployment?: string;
    }> {
        const apiBase = (options.apiBaseUrl || DEFAULT_API_BASE_URL).replace(/\/+$/, '');

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
        let resolvedChainId = data.chainId || options.chainId;
        let resolvedDeployment = data.deployment || options.deployment;

        if (!contracts && data.deployments && Array.isArray(data.deployments)) {
            let match: any;
            if (options.deployment) {
                match = data.deployments.find((d: any) => d.name === options.deployment);
                if (!match) {
                    throw new Error(`Deployment "${options.deployment}" not found in API config response`);
                }
            } else if (options.chainId) {
                match = data.deployments.find((d: any) => d.chainId === options.chainId);
                if (!match) {
                    throw new Error(`No deployment found in API config response for chainId ${options.chainId}`);
                }
            } else {
                match = data.deployments[0];
            }

            if (match) {
                contracts = match.contracts;
                resolvedChainId = match.chainId || resolvedChainId;
                resolvedDeployment = match.name || resolvedDeployment;
            }
        }

        if (!contracts) {
            throw new Error('No contracts found in API config response');
        }

        resolvedChainId = resolvedChainId || DEFAULT_CHAIN_ID;
        resolvedDeployment =
            resolvedDeployment ||
            LayerCoverSDK._getDefaultDeploymentForChain(resolvedChainId) ||
            DEFAULT_DEPLOYMENT;

        if (options.chainId && resolvedChainId !== options.chainId) {
            throw new Error(`Deployment resolved to chain ${resolvedChainId}, expected ${options.chainId}`);
        }
        if (options.deployment && resolvedDeployment !== options.deployment) {
            throw new Error(`Deployment resolved to "${resolvedDeployment}", expected "${options.deployment}"`);
        }

        const deploymentFallback: Partial<FallbackDeploymentConfig['contracts']> =
            LayerCoverSDK._getFallbackDeploymentConfig(resolvedDeployment)?.contracts || {};
        const chainFallbackAddresses = CONTRACT_ADDRESSES[resolvedChainId] || {};
        contracts = {
            ...contracts,
            policyManager:
                contracts.policyManager || deploymentFallback.policyManager || chainFallbackAddresses.policyManager,
            intentOrderBook:
                contracts.intentOrderBook ||
                contracts.intentMatcher ||
                deploymentFallback.intentOrderBook ||
                chainFallbackAddresses.intentOrderBook,
            intentMatcher:
                contracts.intentMatcher ||
                contracts.intentOrderBook ||
                deploymentFallback.intentOrderBook ||
                chainFallbackAddresses.intentOrderBook,
            purchaseGateway:
                contracts.purchaseGateway ||
                deploymentFallback.purchaseGateway ||
                chainFallbackAddresses.purchaseGateway,
            quoteBookExtension:
                contracts.quoteBookExtension ||
                contracts.purchaseExtension ||
                deploymentFallback.quoteBookExtension ||
                chainFallbackAddresses.quoteBookExtension,
            systemRegistry:
                contracts.systemRegistry ||
                deploymentFallback.systemRegistry ||
                chainFallbackAddresses.systemRegistry,
            poolRegistry:
                contracts.poolRegistry || deploymentFallback.poolRegistry || chainFallbackAddresses.poolRegistry,
        };

        if (!contracts.policyManager || !contracts.intentOrderBook) {
            throw new Error(`Incomplete contracts in API config for chain ${resolvedChainId}`);
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
            onEvent?: (event: SDKEvent) => void;
            requestTimeoutMs?: number;
            maxRetries?: number;
            retryDelayMs?: number;
            txConfirmations?: number;
            txWaitTimeoutMs?: number;
        } = {}
    ): Promise<LayerCoverSDK> {
        const requestedApiBase = (options.apiBaseUrl || DEFAULT_API_BASE_URL).replace(/\/+$/, '');

        // Check cache (valid for 5 minutes)
        const cacheValid = LayerCoverSDK._cachedConfig &&
            LayerCoverSDK._isCacheValid(LayerCoverSDK._cachedConfig, requestedApiBase, {
                chainId: options.chainId,
                deployment: options.deployment,
            });

        const config = cacheValid
            ? LayerCoverSDK._cachedConfig!
            : await LayerCoverSDK.fetchConfig({
                apiBaseUrl: requestedApiBase,
                chainId: options.chainId,
                deployment: options.deployment,
                requestTimeoutMs: options.requestTimeoutMs,
                maxRetries: options.maxRetries,
                retryDelayMs: options.retryDelayMs,
            });

        return new LayerCoverSDK(providerOrSigner, config.contracts.policyManager, {
            policyNFTAddress: (config.contracts as any).policyNFT,
            poolRegistryAddress: (config.contracts as any).poolRegistry,
            purchaseGatewayAddress: (config.contracts as any).purchaseGateway,
            quoteBookExtensionAddress: (config.contracts as any).quoteBookExtension,
            systemRegistryAddress: (config.contracts as any).systemRegistry,
            apiBaseUrl: requestedApiBase,
            chainId: config.chainId,
            deployment: config.deployment || DEFAULT_DEPLOYMENT,
            debug: options.debug,
            onEvent: options.onEvent,
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

    private _mapFixedRateQuote(q: any): FixedRateQuote {
        const fetchedAt = new Date().toISOString();
        const quoteBookQuoteId = q?.metadata?.quoteBookQuoteId;
        const numericOrderId = quoteBookQuoteId != null
            ? Number(quoteBookQuoteId)
            : (Number.isFinite(Number(q?.orderId)) ? Number(q.orderId) : undefined);

        return {
            id: q.id,
            poolId: Number(q.poolId),
            syndicateAddress: q.syndicateAddress || q.address,
            syndicateName: q.syndicateName || q.address || q.syndicateAddress || 'Unknown',
            coverageAmount:
                q.coverageAmount?.toString() ||
                q.remainingCoverage?.toString() ||
                q.coverageIntent?.coverageAmount ||
                q.reserveIntent?.coverageAmount ||
                '0',
            premiumRateBps: Number(q.premiumRateBps),
            minDurationWeeks: Number(q.minDurationWeeks),
            maxDurationWeeks: Number(q.maxDurationWeeks),
            expiresAt: q.expiresAt,
            status: q.status || 'active',
            orderId: numericOrderId,
            quoteBookQuoteId: quoteBookQuoteId != null ? String(quoteBookQuoteId) : undefined,
            requiresUpfront: q.requiresUpfront ?? q.coverageIntent?.requiresUpfront,
            minFillAmount:
                q?.metadata?.minFillAmount?.toString()
                || q?.coverageIntent?.minFillAmount?.toString()
                || q?.reserveIntent?.minFillAmount?.toString(),
            quoteBookExtension: q?.metadata?.quoteBookExtension,
            quoteSource: q?.metadata?.quoteSource,
            fetchedAt,
        };
    }

    private _normalizeFixedRateQuotes(rawQuotes: any[]): FixedRateQuote[] {
        return (rawQuotes || [])
            .map((quote: any) => this._mapFixedRateQuote(quote))
            .sort((a, b) => a.premiumRateBps - b.premiumRateBps);
    }

    private async _fetchQuotesBatch(poolIds: number[]): Promise<Record<number, FixedRateQuote[]>> {
        if (poolIds.length === 0) return {};

        const url = `${this._apiBaseUrl}/api/quotes/batch?poolIds=${poolIds.join(',')}&deployment=${encodeURIComponent(this._deployment)}`;
        this._log.debug('[LayerCover SDK] Fetching quotes batch from:', url);

        const response = await this._fetchApi(url);
        this._log.debug('[LayerCover SDK] Batch response status:', response.status);
        if (!response.ok) {
            throw new Error(`Failed to fetch quotes: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const payload = data?.quotes && typeof data.quotes === 'object' ? data.quotes : {};

        return Object.fromEntries(
            poolIds.map((poolId) => [
                poolId,
                this._normalizeFixedRateQuotes(payload[String(poolId)] || payload[poolId] || []),
            ])
        );
    }

    /**
     * Fetch available fixed-rate quotes from the orderbook API
     * @param poolId The pool ID to fetch quotes for
     * @returns Array of available quotes sorted by rate (lowest first)
     */
    async getFixedRateQuotes(poolId: number): Promise<FixedRateQuote[]> {
        this._assertInteger('poolId', poolId, 0);

        try {
            const quotesByPool = await this._fetchQuotesBatch([poolId]);
            const quotes = quotesByPool[poolId] || [];
            this._emitEvent('quotes_fetched', { poolId, count: quotes.length, source: 'batch' });
            return quotes;
        } catch (error: any) {
            const message = String(error?.message || '');
            if (!message.includes('404')) {
                throw error;
            }
        }

        // Backward compatibility for environments that still serve the old read route.
        const legacyUrl = `${this._apiBaseUrl}/api/quotes?poolId=${poolId}&deployment=${encodeURIComponent(this._deployment)}`;
        this._log.debug('[LayerCover SDK] Falling back to legacy quotes route:', legacyUrl);

        const response = await this._fetchApi(legacyUrl);
        this._log.debug('[LayerCover SDK] Legacy response status:', response.status);
        if (!response.ok) {
            throw new Error(`Failed to fetch quotes: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const quotes = this._normalizeFixedRateQuotes(data.quotes || []);
        this._emitEvent('quotes_fetched', { poolId, count: quotes.length, source: 'legacy' });
        return quotes;
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
        this._assertInteger('poolId', poolId, 0);
        const quotes = await this.getActiveQuotes(poolId);
        if (quotes.length === 0) return null;
        return quotes[0].premiumRateBps;
    }

    /**
     * Get the cheapest active quote that is executable for the requested amount and duration.
     *
     * @param poolId The pool ID
     * @param coverageAmount Desired coverage amount
     * @param durationWeeks Desired duration in weeks
     * @param maxRateBps Optional maximum acceptable premium rate
     * @returns The cheapest executable quote, or null if none can satisfy the request
     */
    async getBestExecutableQuote(
        poolId: number,
        coverageAmount: bigint,
        durationWeeks: number,
        maxRateBps?: number
    ): Promise<FixedRateQuote | null> {
        this._assertInteger('poolId', poolId, 0);
        this._assertPositiveBigInt('coverageAmount', coverageAmount);
        this._assertInteger('durationWeeks', durationWeeks, 1);

        const quotes = await this.getActiveQuotes(poolId);
        for (const quote of quotes) {
            if (this._getQuoteExecutionBlockers(quote, coverageAmount, durationWeeks, maxRateBps).length === 0) {
                return quote;
            }
        }

        return null;
    }

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
    async preparePurchase(
        poolId: number,
        coverageAmount: bigint,
        durationWeeks: number,
        maxRateBps?: number,
        referralCode?: string
    ): Promise<PreparedPurchase> {
        this._assertInteger('poolId', poolId, 0);
        this._assertPositiveBigInt('coverageAmount', coverageAmount);
        this._assertInteger('durationWeeks', durationWeeks, 1);

        const normalizedReferralCode = this._normalizeReferralCode(referralCode);
        const quotes = await this.getActiveQuotes(poolId);
        const quote = quotes.find((candidate) =>
            this._getQuoteExecutionBlockers(candidate, coverageAmount, durationWeeks, maxRateBps).length === 0
        ) || null;

        if (!quote) {
            const preparation = this._createBlockedPurchasePreparation(
                null,
                coverageAmount,
                durationWeeks,
                normalizedReferralCode,
                this._summarizePurchaseBlockers(quotes, coverageAmount, durationWeeks, maxRateBps)
            );
            this._emitPreparedPurchaseEvent(preparation, 'pool');
            return preparation;
        }

        const preparation = await this._buildPurchasePreparationForQuote(
            quote,
            coverageAmount,
            durationWeeks,
            normalizedReferralCode
        );
        this._emitPreparedPurchaseEvent(preparation, 'pool');
        return preparation;
    }

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
    async preparePurchaseFromQuote(
        quote: FixedRateQuote,
        coverageAmount: bigint,
        durationWeeks: number,
        maxRateBps?: number,
        referralCode?: string
    ): Promise<PreparedPurchase> {
        this._assertPositiveBigInt('coverageAmount', coverageAmount);
        this._assertInteger('durationWeeks', durationWeeks, 1);

        const normalizedReferralCode = this._normalizeReferralCode(referralCode);
        const { quote: liveQuote } = await this._revalidateQuoteSelection(quote);
        if (!liveQuote) {
            const preparation = this._createBlockedPurchasePreparation(
                quote,
                coverageAmount,
                durationWeeks,
                normalizedReferralCode,
                [{
                    code: 'QUOTE_STALE',
                    message: `Quote ${quote.id} is no longer available and must be refreshed before purchase.`,
                    quoteId: quote.id,
                }]
            );
            this._emitPreparedPurchaseEvent(preparation, 'quote');
            return preparation;
        }

        const blockers = this._getQuoteExecutionBlockers(liveQuote, coverageAmount, durationWeeks, maxRateBps);
        if (blockers.length > 0) {
            const preparation = this._createBlockedPurchasePreparation(
                liveQuote,
                coverageAmount,
                durationWeeks,
                normalizedReferralCode,
                blockers
            );
            this._emitPreparedPurchaseEvent(preparation, 'quote');
            return preparation;
        }

        const preparation = await this._buildPurchasePreparationForQuote(
            liveQuote,
            coverageAmount,
            durationWeeks,
            normalizedReferralCode
        );
        this._emitPreparedPurchaseEvent(preparation, 'quote');
        return preparation;
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
     * Get the age of a locally cached quote snapshot in milliseconds.
     *
     * @param quote The quote to inspect
     * @returns Quote age in milliseconds, or null if the SDK does not know when it was fetched
     */
    static getQuoteAgeMs(quote: FixedRateQuote): number | null {
        if (!quote.fetchedAt) return null;
        const fetchedAtMs = new Date(quote.fetchedAt).getTime();
        if (!Number.isFinite(fetchedAtMs)) return null;
        return Math.max(0, Date.now() - fetchedAtMs);
    }

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
    static isQuoteStale(quote: FixedRateQuote, maxAgeMs = DEFAULT_QUOTE_STALE_MS): boolean {
        if (LayerCoverSDK.isQuoteExpired(quote)) return true;
        const quoteAgeMs = LayerCoverSDK.getQuoteAgeMs(quote);
        return quoteAgeMs !== null && quoteAgeMs > maxAgeMs;
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
     * Refresh a previously selected quote against the latest active quotes for its pool.
     *
     * Returns the updated quote when it still exists, otherwise null.
     *
     * @param quote The previously selected quote
     * @returns The fresh matching quote, or null if it no longer exists
     */
    async refreshSelectedQuote(quote: FixedRateQuote): Promise<FixedRateQuote | null> {
        const activeQuotes = await this.getActiveQuotes(quote.poolId);
        const refreshedQuote = this._findMatchingQuote(activeQuotes, quote);

        this._emitEvent('quote_revalidated', {
            poolId: quote.poolId,
            quoteId: quote.id,
            matched: !!refreshedQuote,
            refreshed: !!refreshedQuote,
            maxAgeMs: DEFAULT_QUOTE_STALE_MS,
            quoteAgeMs: LayerCoverSDK.getQuoteAgeMs(quote),
        });

        return refreshedQuote;
    }

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
    async revalidateQuoteForPurchase(
        quote: FixedRateQuote,
        options: { maxAgeMs?: number } = {}
    ): Promise<FixedRateQuote | null> {
        const result = await this._revalidateQuoteSelection(quote, options.maxAgeMs ?? DEFAULT_QUOTE_STALE_MS);
        return result.quote;
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
        const normalizedReferralCode = this._normalizeReferralCode(referralCode);
        const purchaseGatewayAddress = await this._resolvePurchaseGatewayAddress();
        const purchaseRequest = this._encodeQuoteBookPurchaseRequest(
            BigInt(orderId),
            coverageAmount,
            durationSeconds,
            normalizedReferralCode
        );

        const purchaseGatewayIface = new ethers.Interface(LayerCoverSDK.PURCHASE_GATEWAY_ABI);
        return {
            to: purchaseGatewayAddress,
            data: purchaseGatewayIface.encodeFunctionData('buy', [purchaseRequest]),
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
        this._assertInteger('poolId', poolId, 0);
        this._assertPositiveBigInt('coverageAmount', coverageAmount);
        this._assertInteger('durationWeeks', durationWeeks, 1);
        if (!this.signer) throw new SignerRequiredError('Signer required for purchase');
        await this._assertConfiguredChain();
        const normalizedReferralCode = this._normalizeReferralCode(referralCode);
        const quotes = await this.getActiveQuotes(poolId);
        if (quotes.length === 0) {
            throw new NoQuotesAvailableError(
                `No quotes available for pool ${poolId}. ` +
                'Coverage can only be purchased when underwriters provide quotes.'
            );
        }

        const selectedQuote = quotes.find((quote) =>
            this._getQuoteExecutionBlockers(quote, coverageAmount, durationWeeks, maxRateBps).length === 0
        );

        if (!selectedQuote) {
            const blockers = this._summarizePurchaseBlockers(quotes, coverageAmount, durationWeeks, maxRateBps);
            if (maxRateBps !== undefined && blockers.some((blocker) => blocker.code === 'RATE_TOO_HIGH')) {
                throw new RateTooHighError(
                    `Best available rate ${quotes[0].premiumRateBps} bps exceeds max ${maxRateBps} bps`,
                    quotes[0].premiumRateBps,
                    maxRateBps
                );
            }
            throw this._buildPurchaseBlockedError(blockers);
        }

        return this.purchaseQuote(selectedQuote, coverageAmount, durationWeeks, maxRateBps, normalizedReferralCode);
    }

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
    async purchaseQuote(
        quote: FixedRateQuote,
        coverageAmount: bigint,
        durationWeeks: number,
        maxRateBps?: number,
        referralCode?: string
    ): Promise<PurchaseResult> {
        this._assertPositiveBigInt('coverageAmount', coverageAmount);
        this._assertInteger('durationWeeks', durationWeeks, 1);
        if (!this.signer) throw new SignerRequiredError('Signer required for purchase');
        await this._assertConfiguredChain();

        const { quote: liveQuote, quoteAgeMs } = await this._revalidateQuoteSelection(quote);
        if (!liveQuote) {
            throw new QuoteStaleError(
                `Quote ${quote.id} is no longer available and must be refreshed before purchase.`,
                quote.id,
                DEFAULT_QUOTE_STALE_MS,
                quoteAgeMs
            );
        }

        const blockers = this._getQuoteExecutionBlockers(liveQuote, coverageAmount, durationWeeks, maxRateBps);
        if (blockers.length > 0) {
            if (maxRateBps !== undefined && blockers.some((blocker) => blocker.code === 'RATE_TOO_HIGH')) {
                throw new RateTooHighError(
                    `Selected quote rate ${liveQuote.premiumRateBps} bps exceeds max ${maxRateBps} bps`,
                    liveQuote.premiumRateBps,
                    maxRateBps
                );
            }
            throw this._buildPurchaseBlockedError(blockers);
        }

        const normalizedReferralCode = this._normalizeReferralCode(referralCode);
        const durationSeconds = durationWeeks * 7 * 24 * 60 * 60;
        return this._executeDirectQuoteBookPurchase(liveQuote, coverageAmount, durationSeconds, normalizedReferralCode);
    }

    private _isQuoteBookQuote(quote: FixedRateQuote): boolean {
        return quote.quoteSource === 'quotebook'
            || quote.quoteBookQuoteId !== undefined
            || quote.quoteBookExtension !== undefined;
    }

    private _getQuoteMinFillAmount(quote: FixedRateQuote): bigint {
        if (!quote.minFillAmount) return 0n;

        try {
            return BigInt(quote.minFillAmount);
        } catch {
            return 0n;
        }
    }

    private _getQuoteExecutionBlockers(
        quote: FixedRateQuote,
        coverageAmount: bigint,
        durationWeeks: number,
        maxRateBps?: number
    ): PurchaseBlocker[] {
        const blockers: PurchaseBlocker[] = [];

        if (maxRateBps !== undefined && quote.premiumRateBps > maxRateBps) {
            blockers.push({
                code: 'RATE_TOO_HIGH',
                message: `Quote ${quote.id} is ${quote.premiumRateBps} bps, above the max ${maxRateBps} bps.`,
                quoteId: quote.id,
            });
        }

        if (!this._isQuoteBookQuote(quote)) {
            blockers.push({
                code: 'NON_EXECUTABLE_QUOTE',
                message: `Quote ${quote.id} is not an executable QuoteBook quote.`,
                quoteId: quote.id,
            });
        }

        let quoteCapacity = 0n;
        try {
            quoteCapacity = BigInt(quote.coverageAmount || '0');
        } catch {
            quoteCapacity = 0n;
        }

        if (coverageAmount > quoteCapacity) {
            blockers.push({
                code: 'AMOUNT_EXCEEDS_CAPACITY',
                message: `Quote ${quote.id} only has ${quote.coverageAmount} of remaining capacity.`,
                quoteId: quote.id,
            });
        }

        const minFillAmount = this._getQuoteMinFillAmount(quote);
        if (coverageAmount < minFillAmount) {
            blockers.push({
                code: 'AMOUNT_BELOW_MIN_FILL',
                message: `Quote ${quote.id} requires at least ${minFillAmount.toString()} coverage to fill.`,
                quoteId: quote.id,
            });
        }

        if (durationWeeks < quote.minDurationWeeks || durationWeeks > quote.maxDurationWeeks) {
            blockers.push({
                code: 'DURATION_OUT_OF_RANGE',
                message:
                    `Quote ${quote.id} supports durations between ${quote.minDurationWeeks} and ${quote.maxDurationWeeks} weeks.`,
                quoteId: quote.id,
            });
        }

        return blockers;
    }

    private _summarizePurchaseBlockers(
        quotes: FixedRateQuote[],
        coverageAmount: bigint,
        durationWeeks: number,
        maxRateBps?: number
    ): PurchaseBlocker[] {
        if (quotes.length === 0) {
            return [{
                code: 'NO_ACTIVE_QUOTES',
                message: 'No active quotes are available for this pool.',
            }];
        }

        const blockersByCode = new Map<PurchaseBlockerCode, PurchaseBlocker>();
        for (const quote of quotes) {
            for (const blocker of this._getQuoteExecutionBlockers(quote, coverageAmount, durationWeeks, maxRateBps)) {
                if (!blockersByCode.has(blocker.code)) {
                    blockersByCode.set(blocker.code, blocker);
                }
            }
        }

        return Array.from(blockersByCode.values());
    }

    private _findMatchingQuote(quotes: FixedRateQuote[], selectedQuote: FixedRateQuote): FixedRateQuote | null {
        return quotes.find((candidate) => {
            if (candidate.id === selectedQuote.id) return true;
            if (
                candidate.quoteBookQuoteId
                && selectedQuote.quoteBookQuoteId
                && candidate.quoteBookQuoteId === selectedQuote.quoteBookQuoteId
            ) {
                return true;
            }
            if (
                candidate.orderId !== undefined
                && selectedQuote.orderId !== undefined
                && candidate.orderId === selectedQuote.orderId
            ) {
                return true;
            }
            return false;
        }) || null;
    }

    private async _revalidateQuoteSelection(
        quote: FixedRateQuote,
        maxAgeMs = DEFAULT_QUOTE_STALE_MS
    ): Promise<{
        quote: FixedRateQuote | null;
        stale: boolean;
        quoteAgeMs: number | null;
    }> {
        const quoteAgeMs = LayerCoverSDK.getQuoteAgeMs(quote);
        const stale = LayerCoverSDK.isQuoteStale(quote, maxAgeMs);

        if (!stale) {
            return { quote, stale: false, quoteAgeMs };
        }

        const refreshedQuote = await this.refreshSelectedQuote(quote);
        return {
            quote: refreshedQuote,
            stale: true,
            quoteAgeMs,
        };
    }

    private _createBlockedPurchasePreparation(
        quote: FixedRateQuote | null,
        coverageAmount: bigint,
        durationWeeks: number,
        referralCode: string,
        blockers: PurchaseBlocker[]
    ): PreparedPurchaseBlocked {
        return {
            status: 'blocked',
            quote,
            coverageAmount,
            durationWeeks,
            durationSeconds: durationWeeks * 7 * 24 * 60 * 60,
            referralCode,
            blockers,
        };
    }

    private async _buildPurchasePreparationForQuote(
        quote: FixedRateQuote,
        coverageAmount: bigint,
        durationWeeks: number,
        referralCode: string
    ): Promise<PreparedPurchase> {
        const durationSeconds = durationWeeks * 7 * 24 * 60 * 60;
        const minFillAmount = this._getQuoteMinFillAmount(quote);
        const premium = this.calculatePremium(coverageAmount, quote.premiumRateBps, durationSeconds);
        const preview = await this._previewDirectQuoteBookPurchase(quote, coverageAmount, durationSeconds);
        const quoteBookQuoteId = String(this._resolveQuoteBookQuoteId(quote));
        const purchaseTx = await this.prepareBuyFromQuoteTx(
            Number(this._resolveQuoteBookQuoteId(quote)),
            coverageAmount,
            durationSeconds,
            referralCode
        );

        const basePreparation = {
            quote,
            coverageAmount,
            durationWeeks,
            durationSeconds,
            referralCode,
            blockers: [] as [],
            quoteBookQuoteId,
            purchaseGatewayAddress: preview.purchaseGatewayAddress,
            paymentTokenAddress: preview.paymentTokenAddress,
            requiresUpfront: preview.requiresUpfront,
            minFillAmount,
            premium,
            premiumDeposit: preview.premiumDeposit,
            approvalAmount: preview.premiumDeposit,
            purchaseTx,
        };

        if (!this.signer) {
            return {
                status: 'signer_required',
                ...basePreparation,
                blockers: [{
                    code: 'SIGNER_REQUIRED',
                    message: 'A signer is required to execute approval and purchase transactions.',
                }],
                approvalTx: await this.prepareApprovalTx(quote.poolId, preview.premiumDeposit),
            };
        }

        try {
            await this._assertConfiguredChain();
        } catch (error: any) {
            return {
                status: 'chain_mismatch',
                ...basePreparation,
                blockers: [{
                    code: 'CHAIN_MISMATCH',
                    message: error?.message || 'Signer is connected to the wrong chain for this deployment.',
                }],
                approvalTx: await this.prepareApprovalTx(quote.poolId, preview.premiumDeposit),
            };
        }

        const signerAddress = await this.signer.getAddress();
        const allowance = await this._getTokenAllowance(
            preview.paymentTokenAddress,
            signerAddress,
            preview.purchaseGatewayAddress
        );

        if (allowance < preview.premiumDeposit) {
            return {
                status: 'approval_required',
                ...basePreparation,
                approvalNeeded: true,
                approvalTx: await this.prepareApprovalTx(quote.poolId, preview.premiumDeposit),
            };
        }

        return {
            status: 'ready',
            ...basePreparation,
            approvalNeeded: false,
        };
    }

    private _resolveQuoteBookQuoteId(quote: FixedRateQuote): bigint {
        const rawQuoteId = quote.quoteBookQuoteId ?? quote.orderId;
        if (rawQuoteId === undefined || rawQuoteId === null || rawQuoteId === '') {
            throw new Error('Selected quote is missing an on-chain QuoteBook quote id');
        }

        try {
            return BigInt(rawQuoteId);
        } catch {
            throw new Error(`Selected quote has an invalid QuoteBook quote id: ${String(rawQuoteId)}`);
        }
    }

    private _encodeQuoteBookPurchaseRequest(
        quoteId: bigint,
        coverageAmount: bigint,
        durationSeconds: number,
        referralCode: string
    ): string {
        return ethers.AbiCoder.defaultAbiCoder().encode(
            [
                'tuple(uint256 quoteId, uint256 coverageAmount, uint64 duration, bytes32 referralCode, address vault, uint256 sharesToCover, bytes extensionData)',
            ],
            [[
                quoteId,
                coverageAmount,
                BigInt(durationSeconds),
                referralCode,
                ethers.ZeroAddress,
                0n,
                '0x',
            ]]
        );
    }

    private async _resolveQuoteBookExtensionAddress(quote?: FixedRateQuote): Promise<string> {
        const candidateFromQuote = quote?.quoteBookExtension;
        if (candidateFromQuote && candidateFromQuote !== ethers.ZeroAddress) {
            this._quoteBookExtensionAddress = candidateFromQuote;
            return candidateFromQuote;
        }

        if (this._quoteBookExtensionAddress && this._quoteBookExtensionAddress !== ethers.ZeroAddress) {
            return this._quoteBookExtensionAddress;
        }

        if (!this._systemRegistryAddress || this._systemRegistryAddress === ethers.ZeroAddress) {
            throw new Error(
                `QuoteBookExtension is not configured for deployment ${this._deployment}. ` +
                'Pass quoteBookExtensionAddress/systemRegistryAddress or use a deployment that exposes PurchaseGateway.'
            );
        }

        const registry = new Contract(
            this._systemRegistryAddress,
            LayerCoverSDK.SYSTEM_REGISTRY_ABI,
            this.provider
        );
        const extensionAddress = await registry.getSystemContract(LayerCoverSDK.PURCHASE_EXTENSION_SYSTEM_ID).catch((error: any) => {
            throw new Error(
                `Failed to resolve QuoteBookExtension from SystemRegistry: ${error?.message || String(error)}`
            );
        });

        if (!extensionAddress || extensionAddress === ethers.ZeroAddress) {
            throw new Error(`QuoteBookExtension is not registered in SystemRegistry for deployment ${this._deployment}`);
        }

        this._quoteBookExtensionAddress = extensionAddress;
        return extensionAddress;
    }

    private async _resolvePurchaseGatewayAddress(quote?: FixedRateQuote): Promise<string> {
        if (this._purchaseGatewayAddress && this._purchaseGatewayAddress !== ethers.ZeroAddress) {
            return this._purchaseGatewayAddress;
        }

        const quoteBookExtensionAddress = await this._resolveQuoteBookExtensionAddress(quote);
        const quoteBookExtension = new Contract(
            quoteBookExtensionAddress,
            LayerCoverSDK.QUOTE_BOOK_EXTENSION_RUNTIME_ABI,
            this.provider
        );
        const gatewayAddress = await quoteBookExtension.GATEWAY().catch((error: any) => {
            throw new Error(`Failed to resolve PurchaseGateway from QuoteBookExtension: ${error?.message || String(error)}`);
        });

        if (!gatewayAddress || gatewayAddress === ethers.ZeroAddress) {
            throw new Error(`PurchaseGateway is not configured for deployment ${this._deployment}`);
        }

        this._purchaseGatewayAddress = gatewayAddress;
        return gatewayAddress;
    }

    private async _previewDirectQuoteBookPurchase(
        quote: FixedRateQuote,
        coverageAmount: bigint,
        durationSeconds: number
    ): Promise<{
        purchaseGatewayAddress: string;
        paymentTokenAddress: string;
        premiumDeposit: bigint;
        requiresUpfront: boolean;
    }> {
        const purchaseGatewayAddress = await this._resolvePurchaseGatewayAddress(quote);
        const purchaseGateway = new Contract(
            purchaseGatewayAddress,
            LayerCoverSDK.PURCHASE_GATEWAY_ABI,
            this.provider
        );

        const requiresUpfront = quote.requiresUpfront ?? true;
        const premiumDeposit: bigint = await purchaseGateway.previewRequiredDeposit(
            coverageAmount,
            quote.premiumRateBps,
            durationSeconds,
            requiresUpfront
        );
        const paymentTokenAddress = await this.getPaymentToken(quote.poolId);

        return {
            purchaseGatewayAddress,
            paymentTokenAddress,
            premiumDeposit,
            requiresUpfront,
        };
    }

    private async _getTokenAllowance(
        tokenAddress: string,
        owner: string,
        spender: string
    ): Promise<bigint> {
        const tokenContract = new Contract(
            tokenAddress,
            ['function allowance(address owner, address spender) view returns (uint256)'],
            this.provider
        );

        return tokenContract.allowance(owner, spender);
    }

    private async _executeDirectQuoteBookPurchase(
        quote: FixedRateQuote,
        coverageAmount: bigint,
        durationSeconds: number,
        normalizedReferralCode: string
    ): Promise<PurchaseResult> {
        if (!this.signer) throw new SignerRequiredError('Signer required for purchase');

        const quoteBookQuoteId = this._resolveQuoteBookQuoteId(quote);
        const signerAddress = await this.signer.getAddress();
        const preview = await this._previewDirectQuoteBookPurchase(quote, coverageAmount, durationSeconds);
        const purchaseGatewayAddress = preview.purchaseGatewayAddress;
        const purchaseGateway = new Contract(
            purchaseGatewayAddress,
            LayerCoverSDK.PURCHASE_GATEWAY_ABI,
            this.signer
        );

        const paymentToken = preview.paymentTokenAddress;
        const tokenContract = new Contract(
            paymentToken,
            [
                'function approve(address spender, uint256 amount) returns (bool)',
                'function allowance(address owner, address spender) view returns (uint256)',
            ],
            this.signer
        );

        const allowance = await tokenContract.allowance(signerAddress, purchaseGatewayAddress);
        if (allowance < preview.premiumDeposit) {
            this._log.debug('[LayerCover SDK] Approving PurchaseGateway spend…');
            const approveTx = await tokenContract.approve(purchaseGatewayAddress, ethers.MaxUint256);
            this._emitEvent('approval_submitted', {
                quoteId: quote.id,
                txHash: approveTx.hash,
                approvalAmount: ethers.MaxUint256.toString(),
                requiredAmount: preview.premiumDeposit.toString(),
                tokenAddress: paymentToken,
                spender: purchaseGatewayAddress,
            });
            await this._waitForTx(approveTx);
            this._log.debug('[LayerCover SDK] Approval confirmed');
            this._emitEvent('approval_confirmed', {
                quoteId: quote.id,
                txHash: approveTx.hash,
            });
        }

        const purchaseRequest = this._encodeQuoteBookPurchaseRequest(
            quoteBookQuoteId,
            coverageAmount,
            durationSeconds,
            normalizedReferralCode
        );

        this._log.debug('[LayerCover SDK] Executing direct QuoteBook purchase…');
        const tx = await purchaseGateway.buy(purchaseRequest);
        this._emitEvent('purchase_submitted', {
            quoteId: quote.id,
            txHash: tx.hash,
            quoteBookQuoteId: quoteBookQuoteId.toString(),
            coverageAmount: coverageAmount.toString(),
            durationSeconds,
        });
        const receipt = await this._waitForTx(tx);
        this._log.debug('[LayerCover SDK] Direct purchase confirmed:', tx.hash);

        const { policyId, policyLogIndex } = this._extractPolicyResultFromReceipt(receipt);
        this._emitEvent('purchase_confirmed', {
            quoteId: quote.id,
            txHash: tx.hash,
            policyId: policyId ?? null,
            quoteBookQuoteId: quoteBookQuoteId.toString(),
        });
        await this._syncFilledQuote(quote.id, tx.hash, coverageAmount, policyId, policyLogIndex).catch((error: any) => {
            this._log.warn('[LayerCover SDK] Failed to sync filled quote:', error?.message || String(error));
            this._emitEvent('purchase_sync_failed', {
                quoteId: quote.id,
                txHash: tx.hash,
                policyId: policyId ?? null,
                error: error?.message || String(error),
            });
        });

        return { txHash: tx.hash, policyId };
    }

    private _extractPolicyResultFromReceipt(receipt: ethers.TransactionReceipt): {
        policyId?: string;
        policyLogIndex?: number;
    } {
        const iface = new ethers.Interface([
            'event PolicyCreated(uint256 indexed policyId, address indexed holder, uint256 poolId)',
            'event IntentPolicyCreated(uint256 indexed policyId, address indexed buyer, address indexed underwriter, uint256 poolId, uint256 coverageAmount, uint256 premiumRateBps, uint256 duration, bytes32 reservationKey)',
            'event IntentMatched(address indexed underwriter, address indexed buyer, uint256 indexed poolId, uint256 coverageAmount, uint256 premiumRateBps, uint256 duration, uint256 policyId)',
            'event PurchaseExecuted(address indexed extension, address indexed buyer, address indexed underwriter, uint256 policyId, uint256 poolId, uint256 coverageAmount, uint256 premiumDeposit, uint16 premiumRateBps, uint64 duration)',
        ]);

        for (const log of receipt.logs) {
            try {
                const parsed = iface.parseLog(log);
                if (!parsed) continue;
                if (
                    parsed.name === 'PolicyCreated'
                    || parsed.name === 'IntentPolicyCreated'
                    || parsed.name === 'IntentMatched'
                    || parsed.name === 'PurchaseExecuted'
                ) {
                    const policyId = parsed.args.policyId.toString();
                    const maybeIndex = (log as { index?: unknown }).index;
                    return {
                        policyId,
                        policyLogIndex:
                            typeof maybeIndex === 'number' && Number.isInteger(maybeIndex) && maybeIndex >= 0
                                ? maybeIndex
                                : undefined,
                    };
                }
            } catch {
                continue;
            }
        }

        return {};
    }

    private async _syncFilledQuote(
        quoteId: string,
        txHashRaw: string,
        coverageAmount: bigint,
        policyId?: string,
        policyLogIndex?: number
    ): Promise<void> {
        const txHash = txHashRaw.toLowerCase();
        const idempotencyKey = `sdk-purchase-confirm:${this._chainId}:${txHash}:${quoteId}`;

        const syncPayload: Record<string, unknown> = {
            quoteId,
            txHash,
            filledAmount: coverageAmount.toString(),
            idempotencyKey,
        };
        if (policyId) {
            syncPayload.policyId = policyId;
        }
        if (policyLogIndex !== undefined) {
            syncPayload.logIndex = policyLogIndex;
        }

        const syncResponse = await this._fetchApi(`${this._apiBaseUrl}/api/purchase/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(syncPayload),
        }, {
            retryOnNonIdempotent: true,
        });

        if (!syncResponse.ok) {
            const syncError = await syncResponse.json().catch(() => ({}));
            throw new Error(
                syncError?.error
                || syncResponse.statusText
                || `purchase/sync HTTP ${syncResponse.status}`
            );
        }

        this._emitEvent('purchase_sync_succeeded', {
            quoteId,
            txHash,
            policyId: policyId ?? null,
        });
    }

    private static readonly PURCHASE_GATEWAY_ABI = [
        'function buy(bytes purchaseRequest) returns (uint256)',
        'function previewRequiredDeposit(uint256 coverageAmount, uint16 premiumRateBps, uint64 duration, bool requiresUpfront) view returns (uint256)',
    ];

    private static readonly QUOTE_BOOK_EXTENSION_RUNTIME_ABI = [
        'function GATEWAY() view returns (address)',
    ];

    private static readonly SYSTEM_REGISTRY_ABI = [
        'function getSystemContract(bytes32 id) view returns (address)',
    ];

    private static readonly PURCHASE_EXTENSION_SYSTEM_ID =
        '0xe9552cedfafd72645d3dcd42e34bff1d2c48fcca512f96af4475ae7a72581574';

    /**
     * Get quotes for a specific syndicate
     * @param syndicateAddress The syndicate address
     * @param includeClosed Whether to include cancelled/filled quotes
     */
    async getSyndicateQuotes(syndicateAddress: string, includeClosed = false): Promise<FixedRateQuote[]> {
        const normalizedSyndicateAddress = syndicateAddress.toLowerCase();

        try {
            const pools = await this.listPools({ includeDeprecated: true });
            const poolIds = [...new Set(pools.map((pool) => pool.poolId))];
            const quotesByPool = await this._fetchQuotesBatch(poolIds);

            if (includeClosed) {
                this._log.warn(
                    '[LayerCover SDK] includeClosed=true requested, but /api/quotes/batch only returns active orderbook quotes.'
                );
            }

            const quotes = Object.values(quotesByPool)
                .flat()
                .filter((quote) => quote.syndicateAddress.toLowerCase() === normalizedSyndicateAddress)
                .filter((quote) => includeClosed || (!LayerCoverSDK.isQuoteExpired(quote) && quote.status === 'active'));

            return LayerCoverSDK.sortQuotesByRate(quotes);
        } catch (error: any) {
            const message = String(error?.message || '');
            if (!message.includes('404')) {
                throw error;
            }
        }

        // Backward compatibility for environments that still serve the old syndicate route.
        const url = `${this._apiBaseUrl}/api/quotes?syndicateAddress=${encodeURIComponent(syndicateAddress)}&includeClosed=${includeClosed}`;
        const response = await this._fetchApi(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch syndicate quotes: ${response.status}`);
        }

        const data = await response.json();
        return this._normalizeFixedRateQuotes(data.quotes || []);
    }

    /**
     * Get total quoted exposure for a syndicate
     * @param syndicateAddress The syndicate address
     */
    async getSyndicateExposure(syndicateAddress: string): Promise<{
        totalExposure: string;
        activeQuoteCount: number;
    }> {
        try {
            const quotes = await this.getSyndicateQuotes(syndicateAddress);
            const totalExposure = quotes.reduce((sum, quote) => sum + BigInt(quote.coverageAmount || '0'), 0n);
            return {
                totalExposure: totalExposure.toString(),
                activeQuoteCount: quotes.length,
            };
        } catch (error: any) {
            const message = String(error?.message || '');
            if (!message.includes('404')) {
                throw error;
            }
        }

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
        this._assertInteger('poolId', poolId, 0);
        return this._getSettlementAssetAddress();
    }

    /**
     * Get full pool metadata including token info resolved from chain
     * @param poolId The pool ID to fetch metadata for
     */
    async getPoolMetadata(poolId: number): Promise<PoolMetadata> {
        await this._ensureContracts();

        const tokenAddress = await this._getCoveredTokenAddress(poolId);

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
        const spenderAddress = await this._resolvePurchaseGatewayAddress();

        const token = new Contract(tokenAddress, [
            'function approve(address spender, uint256 amount) external returns (bool)'
        ], this.signer || this.provider);

        return await token.approve.populateTransaction(spenderAddress, amount);
    }

    // ========================================================================
    // SYNDICATE VAULT OPERATIONS
    // ========================================================================

    /**
     * Deposit assets into a Syndicate vault.
     * Prefers guarded `depositWithMinShares` and falls back to legacy `deposit` when unavailable.
     */
    async depositToSyndicate(
        syndicateAddress: string,
        assets: bigint,
        options: SyndicateDepositOptions = {}
    ): Promise<ethers.TransactionResponse> {
        if (!this.signer) throw new Error('Signer required for syndicate deposits');
        this._assertPositiveBigInt('assets', assets);
        await this._assertConfiguredChain();

        const signerAddress = await this.signer.getAddress();
        const receiver = options.receiver ?? signerAddress;
        if (ethers.getAddress(receiver) !== ethers.getAddress(signerAddress)) {
            throw new Error('receiver must equal signer address for syndicate deposits');
        }

        const syndicate = new Contract(
            syndicateAddress,
            [
                'function previewDeposit(uint256 assets) view returns (uint256)',
                'function deposit(uint256 assets, address receiver) returns (uint256)',
                'function depositWithMinShares(uint256 assets, address receiver, uint256 minShares, uint256 deadline) returns (uint256)',
            ],
            this.signer
        );

        const minShares = options.minShares ?? await this._deriveMinSharesFromPreview(
            syndicate,
            assets,
            options.slippageBps ?? DEFAULT_GUARDED_DEPOSIT_SLIPPAGE_BPS
        );
        const deadline = this._resolveDeadline(options.deadline, options.deadlineSeconds);

        try {
            return await syndicate.depositWithMinShares(assets, receiver, minShares, deadline);
        } catch (error) {
            if (LayerCoverSDK._isMethodUnavailableError(error)) {
                return await syndicate.deposit(assets, receiver);
            }
            throw error;
        }
    }

    /**
     * Mint Syndicate shares.
     * Prefers guarded `mintWithMaxAssets` and falls back to legacy `mint` when unavailable.
     */
    async mintSyndicateShares(
        syndicateAddress: string,
        shares: bigint,
        options: SyndicateMintOptions = {}
    ): Promise<ethers.TransactionResponse> {
        if (!this.signer) throw new Error('Signer required for syndicate mints');
        this._assertPositiveBigInt('shares', shares);
        await this._assertConfiguredChain();

        const signerAddress = await this.signer.getAddress();
        const receiver = options.receiver ?? signerAddress;
        if (ethers.getAddress(receiver) !== ethers.getAddress(signerAddress)) {
            throw new Error('receiver must equal signer address for syndicate mints');
        }

        const syndicate = new Contract(
            syndicateAddress,
            [
                'function previewMint(uint256 shares) view returns (uint256)',
                'function mint(uint256 shares, address receiver) returns (uint256)',
                'function mintWithMaxAssets(uint256 shares, address receiver, uint256 maxAssets, uint256 deadline) returns (uint256)',
            ],
            this.signer
        );

        const maxAssets = options.maxAssets ?? await this._deriveMaxAssetsFromPreview(
            syndicate,
            shares,
            options.slippageBps ?? DEFAULT_GUARDED_MINT_SLIPPAGE_BPS
        );
        const deadline = this._resolveDeadline(options.deadline, options.deadlineSeconds);

        try {
            return await syndicate.mintWithMaxAssets(shares, receiver, maxAssets, deadline);
        } catch (error) {
            if (LayerCoverSDK._isMethodUnavailableError(error)) {
                return await syndicate.mint(shares, receiver);
            }
            throw error;
        }
    }

    /**
     * Harvest yield from a Syndicate vault.
     * Prefers guarded `harvestYieldWithDeadline` and falls back to legacy `harvestYield` when unavailable.
     */
    async harvestSyndicateYield(
        syndicateAddress: string,
        minAmount: bigint = 0n,
        options: SyndicateDeadlineOptions = {}
    ): Promise<ethers.TransactionResponse> {
        if (!this.signer) throw new Error('Signer required for syndicate harvest');
        if (typeof minAmount !== 'bigint' || minAmount < 0n) {
            throw new Error('minAmount must be a bigint >= 0');
        }
        await this._assertConfiguredChain();

        const syndicate = new Contract(
            syndicateAddress,
            [
                'function harvestYield(uint256 minAmount) returns (uint256)',
                'function harvestYieldWithDeadline(uint256 minAmount, uint256 deadline) returns (uint256)',
            ],
            this.signer
        );
        const deadline = this._resolveDeadline(options.deadline, options.deadlineSeconds);

        try {
            return await syndicate.harvestYieldWithDeadline(minAmount, deadline);
        } catch (error) {
            if (LayerCoverSDK._isMethodUnavailableError(error)) {
                return await syndicate.harvestYield(minAmount);
            }
            throw error;
        }
    }

    /**
     * Run Syndicate upkeep.
     * Prefers guarded `upkeepWithMinHarvest` and falls back to legacy `upkeep` when unavailable.
     */
    async runSyndicateUpkeep(
        syndicateAddress: string,
        options: SyndicateUpkeepOptions = {}
    ): Promise<ethers.TransactionResponse> {
        if (!this.signer) throw new Error('Signer required for syndicate upkeep');
        await this._assertConfiguredChain();

        const minHarvestAmount = options.minHarvestAmount ?? 0n;
        if (typeof minHarvestAmount !== 'bigint' || minHarvestAmount < 0n) {
            throw new Error('minHarvestAmount must be a bigint >= 0');
        }

        const syndicate = new Contract(
            syndicateAddress,
            [
                'function upkeep()',
                'function upkeepWithMinHarvest(uint256 minHarvestAmount, uint256 deadline)',
            ],
            this.signer
        );
        const deadline = this._resolveDeadline(options.deadline, options.deadlineSeconds);

        try {
            return await syndicate.upkeepWithMinHarvest(minHarvestAmount, deadline);
        } catch (error) {
            if (LayerCoverSDK._isMethodUnavailableError(error)) {
                return await syndicate.upkeep();
            }
            throw error;
        }
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

    private _normalizeBps(bps: number | undefined, fallback: number): bigint {
        const raw = bps == null ? fallback : Math.floor(bps);
        const clamped = !Number.isFinite(raw)
            ? fallback
            : Math.max(0, Math.min(MAX_BPS, raw));
        return BigInt(clamped);
    }

    private _resolveDeadline(deadline?: number, deadlineSeconds?: number): number {
        if (deadline != null) {
            this._assertInteger('deadline', deadline, 0);
            return deadline;
        }

        if (deadlineSeconds != null) {
            this._assertInteger('deadlineSeconds', deadlineSeconds, 1);
        }
        return Math.floor(Date.now() / 1000) + (deadlineSeconds ?? DEFAULT_GUARDED_DEADLINE_SECONDS);
    }

    private async _deriveMinSharesFromPreview(syndicate: Contract, assets: bigint, slippageBps: number): Promise<bigint> {
        const previewShares: bigint = await syndicate.previewDeposit(assets);
        const slippage = this._normalizeBps(slippageBps, DEFAULT_GUARDED_DEPOSIT_SLIPPAGE_BPS);
        return (previewShares * (BPS - slippage)) / BPS;
    }

    private async _deriveMaxAssetsFromPreview(syndicate: Contract, shares: bigint, slippageBps: number): Promise<bigint> {
        const previewAssets: bigint = await syndicate.previewMint(shares);
        const slippage = this._normalizeBps(slippageBps, DEFAULT_GUARDED_MINT_SLIPPAGE_BPS);
        return (previewAssets * (BPS + slippage)) / BPS;
    }

    private static _hasRevertData(error: unknown): boolean {
        const err = error as any;
        const candidates = [
            err?.data,
            err?.error?.data,
            err?.error?.error?.data,
        ];
        return candidates.some((candidate: unknown) => typeof candidate === 'string' && candidate !== '0x');
    }

    private static _isMethodUnavailableError(error: unknown): boolean {
        const err = error as any;
        const message = [
            err?.reason,
            err?.message,
            err?.shortMessage,
            err?.error?.message,
            err?.data?.message,
        ]
            .filter((value: unknown): value is string => typeof value === 'string')
            .join(' ')
            .toLowerCase();

        if (
            message.includes('is not a function')
            || message.includes('no matching function')
            || message.includes('no matching fragment')
            || message.includes('unknown function')
            || message.includes('function selector was not recognized')
            || message.includes('method not found')
            || message.includes('unsupported operation')
        ) {
            return true;
        }

        return (
            !LayerCoverSDK._hasRevertData(error)
            && (
                message.includes('missing revert data')
                || message.includes('cannot estimate gas')
                || message.includes('execution reverted')
            )
        );
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
            throw this._createChainMismatchError(connectedChainId);
        }
    }

    private _createChainMismatchError(connectedChainId: number): ChainMismatchError {
        const deploymentSuffix = this._deployment ? ` (deployment ${this._deployment})` : '';
        return new ChainMismatchError(
            `Chain mismatch: SDK configured for ${this._chainId}${deploymentSuffix}, signer connected to ${connectedChainId}`,
            this._chainId,
            connectedChainId,
            this._deployment
        );
    }

    private async _ensureContracts() {
        if (this._poolRegistry) return;

        let regAddr =
            this._poolRegistryAddress || CONTRACT_ADDRESSES[this._chainId]?.poolRegistry || ethers.ZeroAddress;

        if (regAddr === ethers.ZeroAddress) {
            try {
                regAddr = await this.policyManager.poolRegistry();
            } catch (error: any) {
                this._log.warn('[LayerCover SDK] poolRegistry() unavailable:', error?.message || String(error));
            }
        }

        if (regAddr === ethers.ZeroAddress) {
            let registryAddr = ethers.ZeroAddress;
            try {
                registryAddr = await (this.policyManager as any).REGISTRY();
            } catch (error: any) {
                this._log.warn('[LayerCover SDK] REGISTRY() unavailable:', error?.message || String(error));
            }

            if (registryAddr !== ethers.ZeroAddress) {
                const registry = new Contract(registryAddr, [
                    'function getPoolRegistry() view returns (address)',
                    'function getPoolAllocations() view returns (address)',
                    'function getRiskManager() view returns (address)'
                ], this.provider);

                if (regAddr === ethers.ZeroAddress) {
                    try {
                        regAddr = await registry.getPoolRegistry();
                    } catch (error: any) {
                        this._log.warn('[LayerCover SDK] getPoolRegistry() unavailable:', error?.message || String(error));
                    }
                }

            }
        }

        if (regAddr === ethers.ZeroAddress) {
            throw new Error(`Failed to resolve PoolRegistry address for chain ${this._chainId}`);
        }

        this._poolRegistry = new Contract(regAddr, [
            'function getPoolStaticData(uint256 poolId) view returns (address token, uint256 sold, bool paused, address feeRecipient, uint256 claimFee, uint8 riskRating, bool useEscrow, bool isYieldRewardPool, uint256 coverageCap, bool usesOptimisticOracle, bytes32 oracleQuestionCID)',
            'function getPoolVaultCoverConfig(uint256 poolId) view returns (address protocolToken, bool usesVaultCover)',
            'function getPoolCoverageCap(uint256 poolId) view returns (uint256)',
            'function getPoolCoverageSold(uint256 poolId) view returns (uint256)',
            'function getPoolFeeConfig(uint256 poolId) view returns (uint256 claimFeeBps, address feeRecipient)',
            'function getPoolRiskRating(uint256 poolId) view returns (uint8)',
            'function isPoolPaused(uint256 poolId) view returns (bool)',
            'function isOptimisticPool(uint256 poolId) view returns (bool)',
            'function getPoolOracleQuestionCID(uint256 poolId) view returns (bytes32)',
        ], this.provider);

    }

    private async _getSettlementAssetAddress(): Promise<string> {
        if (this._settlementAssetAddress) {
            return this._settlementAssetAddress;
        }

        const capitalPoolAddress = await this.policyManager.capitalPool().catch((error: any) => {
            throw new Error(
                `Failed to resolve CapitalPool address for chain ${this._chainId}: ${error?.message || String(error)}`
            );
        });

        if (!capitalPoolAddress || capitalPoolAddress === ethers.ZeroAddress) {
            throw new Error(`Failed to resolve CapitalPool address for chain ${this._chainId}`);
        }

        const capitalPool = new Contract(capitalPoolAddress, [
            'function asset() view returns (address)',
        ], this.provider);

        const settlementAssetAddress = await capitalPool.asset().catch((error: any) => {
            throw new Error(
                `Failed to resolve underwriting asset for chain ${this._chainId}: ${error?.message || String(error)}`
            );
        });

        if (!settlementAssetAddress || settlementAssetAddress === ethers.ZeroAddress) {
            throw new Error(`Failed to resolve underwriting asset for chain ${this._chainId}`);
        }

        this._settlementAssetAddress = settlementAssetAddress;
        return settlementAssetAddress;
    }

    private async _getCoveredTokenAddress(poolId: number): Promise<string> {
        await this._ensureContracts();

        const poolRegistry = this._poolRegistry as any;

        if (typeof poolRegistry?.getPoolVaultCoverConfig === 'function') {
            try {
                const [protocolToken] = await poolRegistry.getPoolVaultCoverConfig(poolId);
                if (protocolToken && protocolToken !== ethers.ZeroAddress) {
                    return protocolToken;
                }
            } catch (error: any) {
                this._log.warn('[LayerCover SDK] getPoolVaultCoverConfig() unavailable:', error?.message || String(error));
            }
        }

        if (typeof poolRegistry?.getPoolStaticData === 'function') {
            try {
                const staticData = await poolRegistry.getPoolStaticData(poolId);
                const tokenAddress = staticData?.protocolTokenToCover || staticData?.token || staticData?.[0];
                if (tokenAddress && tokenAddress !== ethers.ZeroAddress) {
                    return tokenAddress;
                }
            } catch (error: any) {
                this._log.warn('[LayerCover SDK] getPoolStaticData() unavailable:', error?.message || String(error));
            }
        }

        return this._getSettlementAssetAddress();
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
        this._assertInteger('poolId', poolId, 0);
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
                    'function getPolicy(uint256 id) view returns (tuple(uint256 coverage, uint256 poolId, uint64 start, uint64 activation, uint64 claimableFrom, uint64 startBlock, bool voided, uint128 premiumDeposit, uint128 lastDrainTime, tuple(address underwriter, uint16 fixedRateBps, uint64 endTime, bytes32 reservationKey, uint256 reinsuredPortion) intent, tuple(address vault, uint256 sharesInsured, uint256 insuredValueUSDC, uint256 pricePerShareSnapshot) vaultCover))',
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
            cancellationPenaltyBps: Number(raw.intent.cancellationPenaltyBps ?? 0),
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
