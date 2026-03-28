import { ethers, Contract } from 'ethers-v6';
import { getHumanError as _getHumanError, LayerCoverSDKError, PurchaseBlockedError, QuoteStaleError, SignerRequiredError, ChainMismatchError, } from './errors';
export * from './adapters';
export * from './viem-adapter';
export * from './errors';
const BPS = 10000n;
const SECS_YEAR = 31536000n; // 365 days exactly — canonical for premium math
const MAX_BPS = 10000;
const DEFAULT_GUARDED_DEADLINE_SECONDS = 15 * 60;
const DEFAULT_GUARDED_DEPOSIT_SLIPPAGE_BPS = 50;
const DEFAULT_GUARDED_MINT_SLIPPAGE_BPS = 50;
const NOOP_LOG = () => { };
function createLogger(debug) {
    if (typeof debug === 'object' && debug !== null)
        return debug;
    if (debug)
        return { debug: console.log.bind(console), warn: console.warn.bind(console), error: console.error.bind(console) };
    return { debug: NOOP_LOG, warn: NOOP_LOG, error: console.error.bind(console) };
}
/**
 * Static pool configuration for off-chain metadata (logos, display names)
 * This can be extended or overridden by integrators
 */
export const POOL_CONFIG = {
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
export const TOKEN_LOGOS = {
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
export function getTokenLogoUrl(symbol) {
    if (!symbol)
        return DEFAULT_TOKEN_LOGO;
    // Check exact match first
    if (TOKEN_LOGOS[symbol])
        return TOKEN_LOGOS[symbol];
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
export const CONTRACT_ADDRESSES = {
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
export const DEPLOYMENT_FALLBACK_CONFIGS = {
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
export function getPolicyManagerAddress(chainId) {
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
export function getIntentOrderBookAddress(chainId) {
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
const DEFAULT_DEPLOYMENT_BY_CHAIN = {
    11155111: 'ethereum_sepolia_usdc',
    84532: 'base_sepolia_usdc',
    43113: 'avalanche_fuji_usdc',
    31337: 'localhost_usdc',
};
const DEFAULT_API_TIMEOUT_MS = 15000;
const DEFAULT_API_RETRIES = 2;
const DEFAULT_API_RETRY_DELAY_MS = 300;
const DEFAULT_TX_CONFIRMATIONS = 1;
const DEFAULT_TX_WAIT_TIMEOUT_MS = 180000;
const DEFAULT_QUOTE_STALE_MS = 30000;
/**
 * Thrown when the best available premium rate exceeds the caller's maximum.
 * Contains both the actual rate and the requested ceiling for UI messaging.
 */
export class RateTooHighError extends LayerCoverSDKError {
    constructor(message, rate, maxRate) {
        super(message, 'RATE_TOO_HIGH');
        this.rate = rate;
        this.maxRate = maxRate;
    }
}
/**
 * Thrown when no underwriter quotes are available for a pool.
 * This typically means no syndicates are currently offering coverage.
 */
export class NoQuotesAvailableError extends LayerCoverSDKError {
    constructor(message /* , public poolId: number */) {
        super(message, 'NO_ACTIVE_QUOTES');
    }
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
    constructor(providerOrSigner, policyManagerAddress, options = {}) {
        if ('signMessage' in providerOrSigner) {
            this.signer = providerOrSigner;
            if (!this.signer.provider) {
                throw new Error('Signer must be connected to a provider');
            }
            this.provider = this.signer.provider;
        }
        else {
            this.provider = providerOrSigner;
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
        this._requestTimeoutMs = Math.max(1000, options.requestTimeoutMs ?? DEFAULT_API_TIMEOUT_MS);
        this._maxRetries = Math.max(0, options.maxRetries ?? DEFAULT_API_RETRIES);
        this._retryDelayMs = Math.max(0, options.retryDelayMs ?? DEFAULT_API_RETRY_DELAY_MS);
        this._txConfirmations = Math.max(1, options.txConfirmations ?? DEFAULT_TX_CONFIRMATIONS);
        this._txWaitTimeoutMs = Math.max(1000, options.txWaitTimeoutMs ?? DEFAULT_TX_WAIT_TIMEOUT_MS);
        this.policyManager = new Contract(policyManagerAddress, [
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
        ], this.signer || this.provider);
    }
    _emitEvent(type, data = {}) {
        if (!this._onEvent)
            return;
        try {
            this._onEvent({
                type,
                timestamp: new Date().toISOString(),
                chainId: this._chainId,
                deployment: this._deployment,
                data,
            });
        }
        catch (error) {
            this._log.warn('[LayerCover SDK] onEvent callback failed:', error?.message || String(error));
        }
    }
    _emitPreparedPurchaseEvent(result, source) {
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
    _buildPurchaseBlockedError(blockers) {
        const message = blockers.length > 0
            ? blockers.map((blocker) => blocker.message).join(' ')
            : 'Purchase is blocked.';
        return new PurchaseBlockedError(message, blockers);
    }
    static _getDefaultDeploymentForChain(chainId) {
        if (!chainId)
            return undefined;
        return DEFAULT_DEPLOYMENT_BY_CHAIN[chainId];
    }
    static _getFallbackDeploymentConfig(deployment) {
        if (!deployment)
            return undefined;
        return DEPLOYMENT_FALLBACK_CONFIGS[deployment];
    }
    static _isCacheValid(cache, requestedApiBase, options) {
        if ((Date.now() - cache.fetchedAt) >= 5 * 60 * 1000)
            return false;
        if (cache.apiBaseUrl !== requestedApiBase)
            return false;
        if (options.deployment) {
            if ((cache.deployment || DEFAULT_DEPLOYMENT) !== options.deployment)
                return false;
        }
        else if (options.chainId) {
            if (cache.chainId !== options.chainId)
                return false;
            const defaultDeployment = LayerCoverSDK._getDefaultDeploymentForChain(options.chainId);
            if (defaultDeployment && (cache.deployment || DEFAULT_DEPLOYMENT) !== defaultDeployment)
                return false;
        }
        else if ((cache.deployment || DEFAULT_DEPLOYMENT) !== DEFAULT_DEPLOYMENT) {
            return false;
        }
        if (options.chainId && cache.chainId !== options.chainId)
            return false;
        return true;
    }
    static _configFallback(options) {
        const apiBaseUrl = (options.apiBaseUrl || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
        if (options.deployment) {
            const deploymentConfig = LayerCoverSDK._getFallbackDeploymentConfig(options.deployment);
            if (!deploymentConfig) {
                throw new Error(`Unable to resolve deployment "${options.deployment}" without /api/config. ` +
                    'Pass explicit contract addresses or a supported chainId.');
            }
            if (options.chainId && deploymentConfig.chainId !== options.chainId) {
                throw new Error(`Deployment "${options.deployment}" is configured for chain ${deploymentConfig.chainId}, not ${options.chainId}`);
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
    static async fetchConfig(options = {}) {
        const apiBase = (options.apiBaseUrl || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
        // Build query params
        const params = new URLSearchParams();
        if (options.chainId)
            params.set('chainId', options.chainId.toString());
        if (options.deployment)
            params.set('deployment', options.deployment);
        const url = `${apiBase}/api/config${params.toString() ? '?' + params.toString() : ''}`;
        // Debug logging handled per-instance; static method uses console sparingly
        let response;
        try {
            response = await LayerCoverSDK._fetchWithPolicy(url, {}, {
                timeoutMs: options.requestTimeoutMs ?? DEFAULT_API_TIMEOUT_MS,
                retries: options.maxRetries ?? DEFAULT_API_RETRIES,
                retryDelayMs: options.retryDelayMs ?? DEFAULT_API_RETRY_DELAY_MS,
            });
        }
        catch {
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
            let match;
            if (options.deployment) {
                match = data.deployments.find((d) => d.name === options.deployment);
                if (!match) {
                    throw new Error(`Deployment "${options.deployment}" not found in API config response`);
                }
            }
            else if (options.chainId) {
                match = data.deployments.find((d) => d.chainId === options.chainId);
                if (!match) {
                    throw new Error(`No deployment found in API config response for chainId ${options.chainId}`);
                }
            }
            else {
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
        const deploymentFallback = LayerCoverSDK._getFallbackDeploymentConfig(resolvedDeployment)?.contracts || {};
        const chainFallbackAddresses = CONTRACT_ADDRESSES[resolvedChainId] || {};
        contracts = {
            ...contracts,
            policyManager: contracts.policyManager || deploymentFallback.policyManager || chainFallbackAddresses.policyManager,
            intentOrderBook: contracts.intentOrderBook ||
                contracts.intentMatcher ||
                deploymentFallback.intentOrderBook ||
                chainFallbackAddresses.intentOrderBook,
            intentMatcher: contracts.intentMatcher ||
                contracts.intentOrderBook ||
                deploymentFallback.intentOrderBook ||
                chainFallbackAddresses.intentOrderBook,
            purchaseGateway: contracts.purchaseGateway ||
                deploymentFallback.purchaseGateway ||
                chainFallbackAddresses.purchaseGateway,
            quoteBookExtension: contracts.quoteBookExtension ||
                contracts.purchaseExtension ||
                deploymentFallback.quoteBookExtension ||
                chainFallbackAddresses.quoteBookExtension,
            systemRegistry: contracts.systemRegistry ||
                deploymentFallback.systemRegistry ||
                chainFallbackAddresses.systemRegistry,
            poolRegistry: contracts.poolRegistry || deploymentFallback.poolRegistry || chainFallbackAddresses.poolRegistry,
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
    static async create(providerOrSigner, options = {}) {
        const requestedApiBase = (options.apiBaseUrl || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
        // Check cache (valid for 5 minutes)
        const cacheValid = LayerCoverSDK._cachedConfig &&
            LayerCoverSDK._isCacheValid(LayerCoverSDK._cachedConfig, requestedApiBase, {
                chainId: options.chainId,
                deployment: options.deployment,
            });
        const config = cacheValid
            ? LayerCoverSDK._cachedConfig
            : await LayerCoverSDK.fetchConfig({
                apiBaseUrl: requestedApiBase,
                chainId: options.chainId,
                deployment: options.deployment,
                requestTimeoutMs: options.requestTimeoutMs,
                maxRetries: options.maxRetries,
                retryDelayMs: options.retryDelayMs,
            });
        return new LayerCoverSDK(providerOrSigner, config.contracts.policyManager, {
            policyNFTAddress: config.contracts.policyNFT,
            poolRegistryAddress: config.contracts.poolRegistry,
            purchaseGatewayAddress: config.contracts.purchaseGateway,
            quoteBookExtensionAddress: config.contracts.quoteBookExtension,
            systemRegistryAddress: config.contracts.systemRegistry,
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
    _mapFixedRateQuote(q) {
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
            coverageAmount: q.coverageAmount?.toString() ||
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
            minFillAmount: q?.metadata?.minFillAmount?.toString()
                || q?.coverageIntent?.minFillAmount?.toString()
                || q?.reserveIntent?.minFillAmount?.toString(),
            quoteBookExtension: q?.metadata?.quoteBookExtension,
            quoteSource: q?.metadata?.quoteSource,
            fetchedAt,
        };
    }
    _normalizeFixedRateQuotes(rawQuotes) {
        return (rawQuotes || [])
            .map((quote) => this._mapFixedRateQuote(quote))
            .sort((a, b) => a.premiumRateBps - b.premiumRateBps);
    }
    async _fetchQuotesBatch(poolIds) {
        if (poolIds.length === 0)
            return {};
        const url = `${this._apiBaseUrl}/api/quotes/batch?poolIds=${poolIds.join(',')}&deployment=${encodeURIComponent(this._deployment)}`;
        this._log.debug('[LayerCover SDK] Fetching quotes batch from:', url);
        const response = await this._fetchApi(url);
        this._log.debug('[LayerCover SDK] Batch response status:', response.status);
        if (!response.ok) {
            throw new Error(`Failed to fetch quotes: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        const payload = data?.quotes && typeof data.quotes === 'object' ? data.quotes : {};
        return Object.fromEntries(poolIds.map((poolId) => [
            poolId,
            this._normalizeFixedRateQuotes(payload[String(poolId)] || payload[poolId] || []),
        ]));
    }
    /**
     * Fetch available fixed-rate quotes from the orderbook API
     * @param poolId The pool ID to fetch quotes for
     * @returns Array of available quotes sorted by rate (lowest first)
     */
    async getFixedRateQuotes(poolId) {
        this._assertInteger('poolId', poolId, 0);
        try {
            const quotesByPool = await this._fetchQuotesBatch([poolId]);
            const quotes = quotesByPool[poolId] || [];
            this._emitEvent('quotes_fetched', { poolId, count: quotes.length, source: 'batch' });
            return quotes;
        }
        catch (error) {
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
    calculatePremium(coverageAmount, rateBps, durationSeconds) {
        const rateBn = BigInt(rateBps);
        const durationBn = BigInt(durationSeconds);
        return (coverageAmount * rateBn * durationBn) / (SECS_YEAR * BPS);
    }
    /**
     * Get the best (lowest) rate available for a pool
     * @param poolId The pool ID
     * @returns Best rate in basis points, or null if no quotes available
     */
    async getBestRate(poolId) {
        this._assertInteger('poolId', poolId, 0);
        const quotes = await this.getActiveQuotes(poolId);
        if (quotes.length === 0)
            return null;
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
    async getBestExecutableQuote(poolId, coverageAmount, durationWeeks, maxRateBps) {
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
    async preparePurchase(poolId, coverageAmount, durationWeeks, maxRateBps, referralCode) {
        this._assertInteger('poolId', poolId, 0);
        this._assertPositiveBigInt('coverageAmount', coverageAmount);
        this._assertInteger('durationWeeks', durationWeeks, 1);
        const normalizedReferralCode = this._normalizeReferralCode(referralCode);
        const quotes = await this.getActiveQuotes(poolId);
        const quote = quotes.find((candidate) => this._getQuoteExecutionBlockers(candidate, coverageAmount, durationWeeks, maxRateBps).length === 0) || null;
        if (!quote) {
            const preparation = this._createBlockedPurchasePreparation(null, coverageAmount, durationWeeks, normalizedReferralCode, this._summarizePurchaseBlockers(quotes, coverageAmount, durationWeeks, maxRateBps));
            this._emitPreparedPurchaseEvent(preparation, 'pool');
            return preparation;
        }
        const preparation = await this._buildPurchasePreparationForQuote(quote, coverageAmount, durationWeeks, normalizedReferralCode);
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
    async preparePurchaseFromQuote(quote, coverageAmount, durationWeeks, maxRateBps, referralCode) {
        this._assertPositiveBigInt('coverageAmount', coverageAmount);
        this._assertInteger('durationWeeks', durationWeeks, 1);
        const normalizedReferralCode = this._normalizeReferralCode(referralCode);
        const { quote: liveQuote } = await this._revalidateQuoteSelection(quote);
        if (!liveQuote) {
            const preparation = this._createBlockedPurchasePreparation(quote, coverageAmount, durationWeeks, normalizedReferralCode, [{
                    code: 'QUOTE_STALE',
                    message: `Quote ${quote.id} is no longer available and must be refreshed before purchase.`,
                    quoteId: quote.id,
                }]);
            this._emitPreparedPurchaseEvent(preparation, 'quote');
            return preparation;
        }
        const blockers = this._getQuoteExecutionBlockers(liveQuote, coverageAmount, durationWeeks, maxRateBps);
        if (blockers.length > 0) {
            const preparation = this._createBlockedPurchasePreparation(liveQuote, coverageAmount, durationWeeks, normalizedReferralCode, blockers);
            this._emitPreparedPurchaseEvent(preparation, 'quote');
            return preparation;
        }
        const preparation = await this._buildPurchasePreparationForQuote(liveQuote, coverageAmount, durationWeeks, normalizedReferralCode);
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
    async listPools(options = {}) {
        const url = `${this._apiBaseUrl}/api/pools/list?deployment=${encodeURIComponent(this._deployment)}`;
        const response = await this._fetchApi(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch pools: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        const rawPools = data.pools || [];
        let pools = rawPools.map((p) => ({
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
    async getPool(poolId) {
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
    async getQuotesWithPools(options = {}) {
        const pools = await this.listPools(options);
        const results = await Promise.all(pools.map(async (pool) => {
            try {
                const quotes = await this.getFixedRateQuotes(pool.poolId);
                const activeQuotes = quotes.filter(q => !LayerCoverSDK.isQuoteExpired(q));
                return {
                    pool,
                    bestQuote: activeQuotes.length > 0 ? activeQuotes[0] : null,
                };
            }
            catch {
                return { pool, bestQuote: null };
            }
        }));
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
    static isQuoteExpired(quote) {
        if (!quote.expiresAt)
            return false;
        return new Date(quote.expiresAt).getTime() < Date.now();
    }
    /**
     * Get the age of a locally cached quote snapshot in milliseconds.
     *
     * @param quote The quote to inspect
     * @returns Quote age in milliseconds, or null if the SDK does not know when it was fetched
     */
    static getQuoteAgeMs(quote) {
        if (!quote.fetchedAt)
            return null;
        const fetchedAtMs = new Date(quote.fetchedAt).getTime();
        if (!Number.isFinite(fetchedAtMs))
            return null;
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
    static isQuoteStale(quote, maxAgeMs = DEFAULT_QUOTE_STALE_MS) {
        if (LayerCoverSDK.isQuoteExpired(quote))
            return true;
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
    async getActiveQuotes(poolId) {
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
    async refreshSelectedQuote(quote) {
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
    async revalidateQuoteForPurchase(quote, options = {}) {
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
    static sortQuotesByRate(quotes) {
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
    async prepareBuyFromQuoteTx(orderId, coverageAmount, durationSeconds, referralCode) {
        this._assertInteger('orderId', orderId, 0);
        this._assertPositiveBigInt('coverageAmount', coverageAmount);
        this._assertInteger('durationSeconds', durationSeconds, 1);
        const normalizedReferralCode = this._normalizeReferralCode(referralCode);
        const purchaseGatewayAddress = await this._resolvePurchaseGatewayAddress();
        const purchaseRequest = this._encodeQuoteBookPurchaseRequest(BigInt(orderId), coverageAmount, durationSeconds, normalizedReferralCode);
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
    async purchase(poolId, coverageAmount, durationWeeks, maxRateBps, referralCode) {
        this._assertInteger('poolId', poolId, 0);
        this._assertPositiveBigInt('coverageAmount', coverageAmount);
        this._assertInteger('durationWeeks', durationWeeks, 1);
        if (!this.signer)
            throw new SignerRequiredError('Signer required for purchase');
        await this._assertConfiguredChain();
        const normalizedReferralCode = this._normalizeReferralCode(referralCode);
        const quotes = await this.getActiveQuotes(poolId);
        if (quotes.length === 0) {
            throw new NoQuotesAvailableError(`No quotes available for pool ${poolId}. ` +
                'Coverage can only be purchased when underwriters provide quotes.');
        }
        const selectedQuote = quotes.find((quote) => this._getQuoteExecutionBlockers(quote, coverageAmount, durationWeeks, maxRateBps).length === 0);
        if (!selectedQuote) {
            const blockers = this._summarizePurchaseBlockers(quotes, coverageAmount, durationWeeks, maxRateBps);
            if (maxRateBps !== undefined && blockers.some((blocker) => blocker.code === 'RATE_TOO_HIGH')) {
                throw new RateTooHighError(`Best available rate ${quotes[0].premiumRateBps} bps exceeds max ${maxRateBps} bps`, quotes[0].premiumRateBps, maxRateBps);
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
    async purchaseQuote(quote, coverageAmount, durationWeeks, maxRateBps, referralCode) {
        this._assertPositiveBigInt('coverageAmount', coverageAmount);
        this._assertInteger('durationWeeks', durationWeeks, 1);
        if (!this.signer)
            throw new SignerRequiredError('Signer required for purchase');
        await this._assertConfiguredChain();
        const { quote: liveQuote, quoteAgeMs } = await this._revalidateQuoteSelection(quote);
        if (!liveQuote) {
            throw new QuoteStaleError(`Quote ${quote.id} is no longer available and must be refreshed before purchase.`, quote.id, DEFAULT_QUOTE_STALE_MS, quoteAgeMs);
        }
        const blockers = this._getQuoteExecutionBlockers(liveQuote, coverageAmount, durationWeeks, maxRateBps);
        if (blockers.length > 0) {
            if (maxRateBps !== undefined && blockers.some((blocker) => blocker.code === 'RATE_TOO_HIGH')) {
                throw new RateTooHighError(`Selected quote rate ${liveQuote.premiumRateBps} bps exceeds max ${maxRateBps} bps`, liveQuote.premiumRateBps, maxRateBps);
            }
            throw this._buildPurchaseBlockedError(blockers);
        }
        const normalizedReferralCode = this._normalizeReferralCode(referralCode);
        const durationSeconds = durationWeeks * 7 * 24 * 60 * 60;
        return this._executeDirectQuoteBookPurchase(liveQuote, coverageAmount, durationSeconds, normalizedReferralCode);
    }
    _isQuoteBookQuote(quote) {
        return quote.quoteSource === 'quotebook'
            || quote.quoteBookQuoteId !== undefined
            || quote.quoteBookExtension !== undefined;
    }
    _getQuoteMinFillAmount(quote) {
        if (!quote.minFillAmount)
            return 0n;
        try {
            return BigInt(quote.minFillAmount);
        }
        catch {
            return 0n;
        }
    }
    _getQuoteExecutionBlockers(quote, coverageAmount, durationWeeks, maxRateBps) {
        const blockers = [];
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
        }
        catch {
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
                message: `Quote ${quote.id} supports durations between ${quote.minDurationWeeks} and ${quote.maxDurationWeeks} weeks.`,
                quoteId: quote.id,
            });
        }
        return blockers;
    }
    _summarizePurchaseBlockers(quotes, coverageAmount, durationWeeks, maxRateBps) {
        if (quotes.length === 0) {
            return [{
                    code: 'NO_ACTIVE_QUOTES',
                    message: 'No active quotes are available for this pool.',
                }];
        }
        const blockersByCode = new Map();
        for (const quote of quotes) {
            for (const blocker of this._getQuoteExecutionBlockers(quote, coverageAmount, durationWeeks, maxRateBps)) {
                if (!blockersByCode.has(blocker.code)) {
                    blockersByCode.set(blocker.code, blocker);
                }
            }
        }
        return Array.from(blockersByCode.values());
    }
    _findMatchingQuote(quotes, selectedQuote) {
        return quotes.find((candidate) => {
            if (candidate.id === selectedQuote.id)
                return true;
            if (candidate.quoteBookQuoteId
                && selectedQuote.quoteBookQuoteId
                && candidate.quoteBookQuoteId === selectedQuote.quoteBookQuoteId) {
                return true;
            }
            if (candidate.orderId !== undefined
                && selectedQuote.orderId !== undefined
                && candidate.orderId === selectedQuote.orderId) {
                return true;
            }
            return false;
        }) || null;
    }
    async _revalidateQuoteSelection(quote, maxAgeMs = DEFAULT_QUOTE_STALE_MS) {
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
    _createBlockedPurchasePreparation(quote, coverageAmount, durationWeeks, referralCode, blockers) {
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
    async _buildPurchasePreparationForQuote(quote, coverageAmount, durationWeeks, referralCode) {
        const durationSeconds = durationWeeks * 7 * 24 * 60 * 60;
        const minFillAmount = this._getQuoteMinFillAmount(quote);
        const premium = this.calculatePremium(coverageAmount, quote.premiumRateBps, durationSeconds);
        const preview = await this._previewDirectQuoteBookPurchase(quote, coverageAmount, durationSeconds);
        const quoteBookQuoteId = String(this._resolveQuoteBookQuoteId(quote));
        const purchaseTx = await this.prepareBuyFromQuoteTx(Number(this._resolveQuoteBookQuoteId(quote)), coverageAmount, durationSeconds, referralCode);
        const basePreparation = {
            quote,
            coverageAmount,
            durationWeeks,
            durationSeconds,
            referralCode,
            blockers: [],
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
        }
        catch (error) {
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
        const allowance = await this._getTokenAllowance(preview.paymentTokenAddress, signerAddress, preview.purchaseGatewayAddress);
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
    _resolveQuoteBookQuoteId(quote) {
        const rawQuoteId = quote.quoteBookQuoteId ?? quote.orderId;
        if (rawQuoteId === undefined || rawQuoteId === null || rawQuoteId === '') {
            throw new Error('Selected quote is missing an on-chain QuoteBook quote id');
        }
        try {
            return BigInt(rawQuoteId);
        }
        catch {
            throw new Error(`Selected quote has an invalid QuoteBook quote id: ${String(rawQuoteId)}`);
        }
    }
    _encodeQuoteBookPurchaseRequest(quoteId, coverageAmount, durationSeconds, referralCode) {
        return ethers.AbiCoder.defaultAbiCoder().encode([
            'tuple(uint256 quoteId, uint256 coverageAmount, uint64 duration, bytes32 referralCode, address vault, uint256 sharesToCover, bytes extensionData)',
        ], [[
                quoteId,
                coverageAmount,
                BigInt(durationSeconds),
                referralCode,
                ethers.ZeroAddress,
                0n,
                '0x',
            ]]);
    }
    async _resolveQuoteBookExtensionAddress(quote) {
        const candidateFromQuote = quote?.quoteBookExtension;
        if (candidateFromQuote && candidateFromQuote !== ethers.ZeroAddress) {
            this._quoteBookExtensionAddress = candidateFromQuote;
            return candidateFromQuote;
        }
        if (this._quoteBookExtensionAddress && this._quoteBookExtensionAddress !== ethers.ZeroAddress) {
            return this._quoteBookExtensionAddress;
        }
        if (!this._systemRegistryAddress || this._systemRegistryAddress === ethers.ZeroAddress) {
            throw new Error(`QuoteBookExtension is not configured for deployment ${this._deployment}. ` +
                'Pass quoteBookExtensionAddress/systemRegistryAddress or use a deployment that exposes PurchaseGateway.');
        }
        const registry = new Contract(this._systemRegistryAddress, LayerCoverSDK.SYSTEM_REGISTRY_ABI, this.provider);
        const extensionAddress = await registry.getSystemContract(LayerCoverSDK.PURCHASE_EXTENSION_SYSTEM_ID).catch((error) => {
            throw new Error(`Failed to resolve QuoteBookExtension from SystemRegistry: ${error?.message || String(error)}`);
        });
        if (!extensionAddress || extensionAddress === ethers.ZeroAddress) {
            throw new Error(`QuoteBookExtension is not registered in SystemRegistry for deployment ${this._deployment}`);
        }
        this._quoteBookExtensionAddress = extensionAddress;
        return extensionAddress;
    }
    async _resolvePurchaseGatewayAddress(quote) {
        if (this._purchaseGatewayAddress && this._purchaseGatewayAddress !== ethers.ZeroAddress) {
            return this._purchaseGatewayAddress;
        }
        const quoteBookExtensionAddress = await this._resolveQuoteBookExtensionAddress(quote);
        const quoteBookExtension = new Contract(quoteBookExtensionAddress, LayerCoverSDK.QUOTE_BOOK_EXTENSION_RUNTIME_ABI, this.provider);
        const gatewayAddress = await quoteBookExtension.GATEWAY().catch((error) => {
            throw new Error(`Failed to resolve PurchaseGateway from QuoteBookExtension: ${error?.message || String(error)}`);
        });
        if (!gatewayAddress || gatewayAddress === ethers.ZeroAddress) {
            throw new Error(`PurchaseGateway is not configured for deployment ${this._deployment}`);
        }
        this._purchaseGatewayAddress = gatewayAddress;
        return gatewayAddress;
    }
    async _previewDirectQuoteBookPurchase(quote, coverageAmount, durationSeconds) {
        const purchaseGatewayAddress = await this._resolvePurchaseGatewayAddress(quote);
        const purchaseGateway = new Contract(purchaseGatewayAddress, LayerCoverSDK.PURCHASE_GATEWAY_ABI, this.provider);
        const requiresUpfront = quote.requiresUpfront ?? true;
        const premiumDeposit = await purchaseGateway.previewRequiredDeposit(coverageAmount, quote.premiumRateBps, durationSeconds, requiresUpfront);
        const paymentTokenAddress = await this.getPaymentToken(quote.poolId);
        return {
            purchaseGatewayAddress,
            paymentTokenAddress,
            premiumDeposit,
            requiresUpfront,
        };
    }
    async _getTokenAllowance(tokenAddress, owner, spender) {
        const tokenContract = new Contract(tokenAddress, ['function allowance(address owner, address spender) view returns (uint256)'], this.provider);
        return tokenContract.allowance(owner, spender);
    }
    async _executeDirectQuoteBookPurchase(quote, coverageAmount, durationSeconds, normalizedReferralCode) {
        if (!this.signer)
            throw new SignerRequiredError('Signer required for purchase');
        const quoteBookQuoteId = this._resolveQuoteBookQuoteId(quote);
        const signerAddress = await this.signer.getAddress();
        const preview = await this._previewDirectQuoteBookPurchase(quote, coverageAmount, durationSeconds);
        const purchaseGatewayAddress = preview.purchaseGatewayAddress;
        const purchaseGateway = new Contract(purchaseGatewayAddress, LayerCoverSDK.PURCHASE_GATEWAY_ABI, this.signer);
        const paymentToken = preview.paymentTokenAddress;
        const tokenContract = new Contract(paymentToken, [
            'function approve(address spender, uint256 amount) returns (bool)',
            'function allowance(address owner, address spender) view returns (uint256)',
        ], this.signer);
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
        const purchaseRequest = this._encodeQuoteBookPurchaseRequest(quoteBookQuoteId, coverageAmount, durationSeconds, normalizedReferralCode);
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
        await this._syncFilledQuote(quote.id, tx.hash, coverageAmount, policyId, policyLogIndex).catch((error) => {
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
    _extractPolicyResultFromReceipt(receipt) {
        const iface = new ethers.Interface([
            'event PolicyCreated(uint256 indexed policyId, address indexed holder, uint256 poolId)',
            'event IntentPolicyCreated(uint256 indexed policyId, address indexed buyer, address indexed underwriter, uint256 poolId, uint256 coverageAmount, uint256 premiumRateBps, uint256 duration, bytes32 reservationKey)',
            'event IntentMatched(address indexed underwriter, address indexed buyer, uint256 indexed poolId, uint256 coverageAmount, uint256 premiumRateBps, uint256 duration, uint256 policyId)',
            'event PurchaseExecuted(address indexed extension, address indexed buyer, address indexed underwriter, uint256 policyId, uint256 poolId, uint256 coverageAmount, uint256 premiumDeposit, uint16 premiumRateBps, uint64 duration)',
        ]);
        for (const log of receipt.logs) {
            try {
                const parsed = iface.parseLog(log);
                if (!parsed)
                    continue;
                if (parsed.name === 'PolicyCreated'
                    || parsed.name === 'IntentPolicyCreated'
                    || parsed.name === 'IntentMatched'
                    || parsed.name === 'PurchaseExecuted') {
                    const policyId = parsed.args.policyId.toString();
                    const maybeIndex = log.index;
                    return {
                        policyId,
                        policyLogIndex: typeof maybeIndex === 'number' && Number.isInteger(maybeIndex) && maybeIndex >= 0
                            ? maybeIndex
                            : undefined,
                    };
                }
            }
            catch {
                continue;
            }
        }
        return {};
    }
    async _syncFilledQuote(quoteId, txHashRaw, coverageAmount, policyId, policyLogIndex) {
        const txHash = txHashRaw.toLowerCase();
        const idempotencyKey = `sdk-purchase-confirm:${this._chainId}:${txHash}:${quoteId}`;
        const syncPayload = {
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
            throw new Error(syncError?.error
                || syncResponse.statusText
                || `purchase/sync HTTP ${syncResponse.status}`);
        }
        this._emitEvent('purchase_sync_succeeded', {
            quoteId,
            txHash,
            policyId: policyId ?? null,
        });
    }
    /**
     * Get quotes for a specific syndicate
     * @param syndicateAddress The syndicate address
     * @param includeClosed Whether to include cancelled/filled quotes
     */
    async getSyndicateQuotes(syndicateAddress, includeClosed = false) {
        const normalizedSyndicateAddress = syndicateAddress.toLowerCase();
        try {
            const pools = await this.listPools({ includeDeprecated: true });
            const poolIds = [...new Set(pools.map((pool) => pool.poolId))];
            const quotesByPool = await this._fetchQuotesBatch(poolIds);
            if (includeClosed) {
                this._log.warn('[LayerCover SDK] includeClosed=true requested, but /api/quotes/batch only returns active orderbook quotes.');
            }
            const quotes = Object.values(quotesByPool)
                .flat()
                .filter((quote) => quote.syndicateAddress.toLowerCase() === normalizedSyndicateAddress)
                .filter((quote) => includeClosed || (!LayerCoverSDK.isQuoteExpired(quote) && quote.status === 'active'));
            return LayerCoverSDK.sortQuotesByRate(quotes);
        }
        catch (error) {
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
    async getSyndicateExposure(syndicateAddress) {
        try {
            const quotes = await this.getSyndicateQuotes(syndicateAddress);
            const totalExposure = quotes.reduce((sum, quote) => sum + BigInt(quote.coverageAmount || '0'), 0n);
            return {
                totalExposure: totalExposure.toString(),
                activeQuoteCount: quotes.length,
            };
        }
        catch (error) {
            const message = String(error?.message || '');
            if (!message.includes('404')) {
                throw error;
            }
        }
        const response = await this._fetchApi(`${this._apiBaseUrl}/api/quotes/exposure?syndicateAddress=${encodeURIComponent(syndicateAddress)}`);
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
    async getPaymentToken(poolId) {
        this._assertInteger('poolId', poolId, 0);
        return this._getSettlementAssetAddress();
    }
    /**
     * Get full pool metadata including token info resolved from chain
     * @param poolId The pool ID to fetch metadata for
     */
    async getPoolMetadata(poolId) {
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
    async prepareApprovalTx(poolId, amount) {
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
    async depositToSyndicate(syndicateAddress, assets, options = {}) {
        if (!this.signer)
            throw new Error('Signer required for syndicate deposits');
        this._assertPositiveBigInt('assets', assets);
        await this._assertConfiguredChain();
        const signerAddress = await this.signer.getAddress();
        const receiver = options.receiver ?? signerAddress;
        if (ethers.getAddress(receiver) !== ethers.getAddress(signerAddress)) {
            throw new Error('receiver must equal signer address for syndicate deposits');
        }
        const syndicate = new Contract(syndicateAddress, [
            'function previewDeposit(uint256 assets) view returns (uint256)',
            'function deposit(uint256 assets, address receiver) returns (uint256)',
            'function depositWithMinShares(uint256 assets, address receiver, uint256 minShares, uint256 deadline) returns (uint256)',
        ], this.signer);
        const minShares = options.minShares ?? await this._deriveMinSharesFromPreview(syndicate, assets, options.slippageBps ?? DEFAULT_GUARDED_DEPOSIT_SLIPPAGE_BPS);
        const deadline = this._resolveDeadline(options.deadline, options.deadlineSeconds);
        try {
            return await syndicate.depositWithMinShares(assets, receiver, minShares, deadline);
        }
        catch (error) {
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
    async mintSyndicateShares(syndicateAddress, shares, options = {}) {
        if (!this.signer)
            throw new Error('Signer required for syndicate mints');
        this._assertPositiveBigInt('shares', shares);
        await this._assertConfiguredChain();
        const signerAddress = await this.signer.getAddress();
        const receiver = options.receiver ?? signerAddress;
        if (ethers.getAddress(receiver) !== ethers.getAddress(signerAddress)) {
            throw new Error('receiver must equal signer address for syndicate mints');
        }
        const syndicate = new Contract(syndicateAddress, [
            'function previewMint(uint256 shares) view returns (uint256)',
            'function mint(uint256 shares, address receiver) returns (uint256)',
            'function mintWithMaxAssets(uint256 shares, address receiver, uint256 maxAssets, uint256 deadline) returns (uint256)',
        ], this.signer);
        const maxAssets = options.maxAssets ?? await this._deriveMaxAssetsFromPreview(syndicate, shares, options.slippageBps ?? DEFAULT_GUARDED_MINT_SLIPPAGE_BPS);
        const deadline = this._resolveDeadline(options.deadline, options.deadlineSeconds);
        try {
            return await syndicate.mintWithMaxAssets(shares, receiver, maxAssets, deadline);
        }
        catch (error) {
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
    async harvestSyndicateYield(syndicateAddress, minAmount = 0n, options = {}) {
        if (!this.signer)
            throw new Error('Signer required for syndicate harvest');
        if (typeof minAmount !== 'bigint' || minAmount < 0n) {
            throw new Error('minAmount must be a bigint >= 0');
        }
        await this._assertConfiguredChain();
        const syndicate = new Contract(syndicateAddress, [
            'function harvestYield(uint256 minAmount) returns (uint256)',
            'function harvestYieldWithDeadline(uint256 minAmount, uint256 deadline) returns (uint256)',
        ], this.signer);
        const deadline = this._resolveDeadline(options.deadline, options.deadlineSeconds);
        try {
            return await syndicate.harvestYieldWithDeadline(minAmount, deadline);
        }
        catch (error) {
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
    async runSyndicateUpkeep(syndicateAddress, options = {}) {
        if (!this.signer)
            throw new Error('Signer required for syndicate upkeep');
        await this._assertConfiguredChain();
        const minHarvestAmount = options.minHarvestAmount ?? 0n;
        if (typeof minHarvestAmount !== 'bigint' || minHarvestAmount < 0n) {
            throw new Error('minHarvestAmount must be a bigint >= 0');
        }
        const syndicate = new Contract(syndicateAddress, [
            'function upkeep()',
            'function upkeepWithMinHarvest(uint256 minHarvestAmount, uint256 deadline)',
        ], this.signer);
        const deadline = this._resolveDeadline(options.deadline, options.deadlineSeconds);
        try {
            return await syndicate.upkeepWithMinHarvest(minHarvestAmount, deadline);
        }
        catch (error) {
            if (LayerCoverSDK._isMethodUnavailableError(error)) {
                return await syndicate.upkeep();
            }
            throw error;
        }
    }
    // ========================================================================
    // PRIVATE HELPERS
    // ========================================================================
    static async _sleep(ms) {
        await new Promise(resolve => setTimeout(resolve, ms));
    }
    static _isRetryableStatus(status) {
        return status === 408 || status === 429 || status >= 500;
    }
    static _isRetryableFetchError(error) {
        const message = String(error?.message || '').toLowerCase();
        return message.includes('network')
            || message.includes('fetch')
            || message.includes('timeout')
            || message.includes('timed out')
            || message.includes('econnreset')
            || message.includes('etimedout')
            || message.includes('socket');
    }
    static async _fetchWithPolicy(url, init, policy) {
        const method = (init.method || 'GET').toUpperCase();
        const idempotentMethods = method === 'GET' || method === 'HEAD' || method === 'OPTIONS' || method === 'DELETE';
        const retries = (idempotentMethods || policy.retryOnNonIdempotent)
            ? Math.max(0, policy.retries)
            : 0;
        let lastError;
        for (let attempt = 0; attempt <= retries; attempt++) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), policy.timeoutMs);
            try {
                const response = await fetch(url, { ...init, signal: controller.signal });
                clearTimeout(timeout);
                if (LayerCoverSDK._isRetryableStatus(response.status) && attempt < retries) {
                    try {
                        await response.body?.cancel();
                    }
                    catch { }
                    policy.logger?.warn(`[LayerCover SDK] API retry ${attempt + 1}/${retries} after HTTP ${response.status}: ${method} ${url}`);
                    await LayerCoverSDK._sleep(policy.retryDelayMs * (2 ** attempt));
                    continue;
                }
                return response;
            }
            catch (error) {
                clearTimeout(timeout);
                const timedOut = error?.name === 'AbortError';
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
    async _fetchApi(url, init = {}, options = {}) {
        return LayerCoverSDK._fetchWithPolicy(url, init, {
            timeoutMs: options.timeoutMs ?? this._requestTimeoutMs,
            retries: options.retries ?? this._maxRetries,
            retryDelayMs: this._retryDelayMs,
            retryOnNonIdempotent: options.retryOnNonIdempotent ?? false,
            logger: this._log,
        });
    }
    async _waitForTx(tx) {
        const receipt = await tx.wait(this._txConfirmations, this._txWaitTimeoutMs);
        if (!receipt) {
            throw new Error(`Transaction ${tx.hash} was not confirmed`);
        }
        if (receipt.status === 0) {
            throw new Error(`Transaction ${tx.hash} reverted`);
        }
        return receipt;
    }
    _assertInteger(name, value, min) {
        if (!Number.isInteger(value) || value < min) {
            throw new Error(`${name} must be an integer >= ${min}`);
        }
    }
    _assertPositiveBigInt(name, value) {
        if (typeof value !== 'bigint' || value <= 0n) {
            throw new Error(`${name} must be > 0`);
        }
    }
    _normalizeBps(bps, fallback) {
        const raw = bps == null ? fallback : Math.floor(bps);
        const clamped = !Number.isFinite(raw)
            ? fallback
            : Math.max(0, Math.min(MAX_BPS, raw));
        return BigInt(clamped);
    }
    _resolveDeadline(deadline, deadlineSeconds) {
        if (deadline != null) {
            this._assertInteger('deadline', deadline, 0);
            return deadline;
        }
        if (deadlineSeconds != null) {
            this._assertInteger('deadlineSeconds', deadlineSeconds, 1);
        }
        return Math.floor(Date.now() / 1000) + (deadlineSeconds ?? DEFAULT_GUARDED_DEADLINE_SECONDS);
    }
    async _deriveMinSharesFromPreview(syndicate, assets, slippageBps) {
        const previewShares = await syndicate.previewDeposit(assets);
        const slippage = this._normalizeBps(slippageBps, DEFAULT_GUARDED_DEPOSIT_SLIPPAGE_BPS);
        return (previewShares * (BPS - slippage)) / BPS;
    }
    async _deriveMaxAssetsFromPreview(syndicate, shares, slippageBps) {
        const previewAssets = await syndicate.previewMint(shares);
        const slippage = this._normalizeBps(slippageBps, DEFAULT_GUARDED_MINT_SLIPPAGE_BPS);
        return (previewAssets * (BPS + slippage)) / BPS;
    }
    static _hasRevertData(error) {
        const err = error;
        const candidates = [
            err?.data,
            err?.error?.data,
            err?.error?.error?.data,
        ];
        return candidates.some((candidate) => typeof candidate === 'string' && candidate !== '0x');
    }
    static _isMethodUnavailableError(error) {
        const err = error;
        const message = [
            err?.reason,
            err?.message,
            err?.shortMessage,
            err?.error?.message,
            err?.data?.message,
        ]
            .filter((value) => typeof value === 'string')
            .join(' ')
            .toLowerCase();
        if (message.includes('is not a function')
            || message.includes('no matching function')
            || message.includes('no matching fragment')
            || message.includes('unknown function')
            || message.includes('function selector was not recognized')
            || message.includes('method not found')
            || message.includes('unsupported operation')) {
            return true;
        }
        return (!LayerCoverSDK._hasRevertData(error)
            && (message.includes('missing revert data')
                || message.includes('cannot estimate gas')
                || message.includes('execution reverted')));
    }
    _normalizeReferralCode(referralCode) {
        if (!referralCode)
            return ethers.ZeroHash;
        if (!/^0x[a-fA-F0-9]{64}$/.test(referralCode)) {
            throw new Error('referralCode must be a bytes32 hex string (0x + 64 hex chars)');
        }
        return referralCode.toLowerCase();
    }
    async _assertConfiguredChain() {
        const network = await this.provider.getNetwork();
        const connectedChainId = Number(network.chainId);
        if (connectedChainId !== this._chainId) {
            throw this._createChainMismatchError(connectedChainId);
        }
    }
    _createChainMismatchError(connectedChainId) {
        const deploymentSuffix = this._deployment ? ` (deployment ${this._deployment})` : '';
        return new ChainMismatchError(`Chain mismatch: SDK configured for ${this._chainId}${deploymentSuffix}, signer connected to ${connectedChainId}`, this._chainId, connectedChainId, this._deployment);
    }
    async _ensureContracts() {
        if (this._poolRegistry)
            return;
        let regAddr = this._poolRegistryAddress || CONTRACT_ADDRESSES[this._chainId]?.poolRegistry || ethers.ZeroAddress;
        if (regAddr === ethers.ZeroAddress) {
            try {
                regAddr = await this.policyManager.poolRegistry();
            }
            catch (error) {
                this._log.warn('[LayerCover SDK] poolRegistry() unavailable:', error?.message || String(error));
            }
        }
        if (regAddr === ethers.ZeroAddress) {
            let registryAddr = ethers.ZeroAddress;
            try {
                registryAddr = await this.policyManager.REGISTRY();
            }
            catch (error) {
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
                    }
                    catch (error) {
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
    async _getSettlementAssetAddress() {
        if (this._settlementAssetAddress) {
            return this._settlementAssetAddress;
        }
        const capitalPoolAddress = await this.policyManager.capitalPool().catch((error) => {
            throw new Error(`Failed to resolve CapitalPool address for chain ${this._chainId}: ${error?.message || String(error)}`);
        });
        if (!capitalPoolAddress || capitalPoolAddress === ethers.ZeroAddress) {
            throw new Error(`Failed to resolve CapitalPool address for chain ${this._chainId}`);
        }
        const capitalPool = new Contract(capitalPoolAddress, [
            'function asset() view returns (address)',
        ], this.provider);
        const settlementAssetAddress = await capitalPool.asset().catch((error) => {
            throw new Error(`Failed to resolve underwriting asset for chain ${this._chainId}: ${error?.message || String(error)}`);
        });
        if (!settlementAssetAddress || settlementAssetAddress === ethers.ZeroAddress) {
            throw new Error(`Failed to resolve underwriting asset for chain ${this._chainId}`);
        }
        this._settlementAssetAddress = settlementAssetAddress;
        return settlementAssetAddress;
    }
    async _getCoveredTokenAddress(poolId) {
        await this._ensureContracts();
        const poolRegistry = this._poolRegistry;
        if (typeof poolRegistry?.getPoolVaultCoverConfig === 'function') {
            try {
                const [protocolToken] = await poolRegistry.getPoolVaultCoverConfig(poolId);
                if (protocolToken && protocolToken !== ethers.ZeroAddress) {
                    return protocolToken;
                }
            }
            catch (error) {
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
            }
            catch (error) {
                this._log.warn('[LayerCover SDK] getPoolStaticData() unavailable:', error?.message || String(error));
            }
        }
        return this._getSettlementAssetAddress();
    }
    static _randomUint(bytes) {
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
    static calculateNetYield(baseApy, costBps) {
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
    watchQuotes(poolId, callback, options = {}) {
        this._assertInteger('poolId', poolId, 0);
        const interval = options.refreshIntervalMs ?? 30000;
        this._assertInteger('refreshIntervalMs', interval, 1000);
        const filterExpired = options.filterExpired ?? true;
        const filterInactive = options.filterInactive ?? true;
        let stopped = false;
        let inFlight = false;
        const refresh = async () => {
            if (stopped || inFlight)
                return;
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
            }
            catch (err) {
                // Silently continue on network errors — the next cycle will retry
                this._log.warn('[LayerCover SDK] Quote refresh failed:', err.message);
            }
            finally {
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
    async _getPolicyNFT() {
        if (!this._policyNFT) {
            // Try pre-configured address first, fall back to on-chain lookup
            let nftAddr = this._policyNFTAddress || '';
            if (!nftAddr) {
                nftAddr = await this.policyManager.policyNFT();
            }
            this._policyNFT = new Contract(nftAddr, [
                // ERC721 enumeration
                'function balanceOf(address owner) view returns (uint256)',
                'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
                'function ownerOf(uint256 tokenId) view returns (address)',
                'function totalSupply() view returns (uint256)',
                // Policy data
                'function getPolicy(uint256 id) view returns (tuple(uint256 coverage, uint256 poolId, uint64 start, uint64 activation, uint64 claimableFrom, uint64 startBlock, bool voided, uint128 premiumDeposit, uint128 lastDrainTime, tuple(address underwriter, uint16 fixedRateBps, uint64 endTime, bytes32 reservationKey, uint256 reinsuredPortion) intent, tuple(address vault, uint256 sharesInsured, uint256 insuredValueUSDC, uint256 pricePerShareSnapshot) vaultCover))',
            ], this.signer || this.provider);
        }
        return this._policyNFT;
    }
    /**
     * Map raw on-chain policy struct to a clean UserPolicy object.
     * @internal
     */
    _mapPolicy(policyId, owner, raw, active) {
        const now = Math.floor(Date.now() / 1000);
        const endTime = Number(raw.intent.endTime);
        let status = 'active';
        if (raw.voided)
            status = 'voided';
        else if (BigInt(raw.coverage) === 0n)
            status = 'cancelled';
        else if (!active || now > endTime)
            status = 'expired';
        const policy = {
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
    async getMyPolicies(ownerAddress) {
        // Primary: use the API endpoint (same as the dashboard)
        try {
            const url = `${this._apiBaseUrl}/api/policies/user/${ownerAddress.toLowerCase()}`;
            const response = await this._fetchApi(url);
            if (response.ok) {
                const data = await response.json();
                if (data.policies && Array.isArray(data.policies)) {
                    return data.policies.map((p) => ({
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
                        status: p.isActive ? 'active' : 'expired',
                    })).sort((a, b) => b.startTimestamp - a.startTimestamp);
                }
            }
        }
        catch (apiErr) {
            this._log.warn('[LayerCover SDK] API policy fetch failed, trying on-chain:', apiErr.message);
        }
        // Fallback: on-chain via PolicyNFT
        let nft;
        try {
            nft = await this._getPolicyNFT();
        }
        catch (err) {
            this._log.warn('[LayerCover SDK] Could not resolve PolicyNFT contract — getMyPolicies unavailable:', err.message);
            return [];
        }
        const balance = Number(await nft.balanceOf(ownerAddress));
        if (balance === 0)
            return [];
        // Fetch all token IDs in parallel
        const idPromises = Array.from({ length: balance }, (_, i) => nft.tokenOfOwnerByIndex(ownerAddress, i));
        const tokenIds = await Promise.all(idPromises);
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
    async getPolicyDetails(policyId) {
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
    async isPolicyActive(policyId) {
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
    async prepareCancelCoverTx(policyId) {
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
    async prepareLapsePolicyTx(policyId) {
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
    static getHumanError(error) {
        return _getHumanError(error);
    }
}
// ========================================================================
// STATIC FACTORY METHODS
// ========================================================================
/**
 * Configuration fetched from the API
 */
LayerCoverSDK._cachedConfig = null;
LayerCoverSDK.PURCHASE_GATEWAY_ABI = [
    'function buy(bytes purchaseRequest) returns (uint256)',
    'function previewRequiredDeposit(uint256 coverageAmount, uint16 premiumRateBps, uint64 duration, bool requiresUpfront) view returns (uint256)',
];
LayerCoverSDK.QUOTE_BOOK_EXTENSION_RUNTIME_ABI = [
    'function GATEWAY() view returns (address)',
];
LayerCoverSDK.SYSTEM_REGISTRY_ABI = [
    'function getSystemContract(bytes32 id) view returns (address)',
];
LayerCoverSDK.PURCHASE_EXTENSION_SYSTEM_ID = '0xe9552cedfafd72645d3dcd42e34bff1d2c48fcca512f96af4475ae7a72581574';
