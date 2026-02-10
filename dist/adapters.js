"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EthersV5Adapter = void 0;
const ethers_1 = require("ethers");
/**
 * Helpers to adapt Ethers v5 objects to Ethers v6 for SDK compatibility.
 */
class EthersV5Adapter {
    /**
     * Creates a v6 BrowserProvider from an Ethers v5 Web3Provider.
     * Use this when your dApp uses window.ethereum wrapped in v5.
     * @param v5Provider An ethers v5 Web3Provider (or any object with a .provider EIP-1193 property)
     */
    static fromWeb3Provider(v5Provider) {
        // In v5 Web3Provider, the underlying EIP-1193 provider is at .provider
        const externalProvider = v5Provider.provider || v5Provider;
        return new ethers_1.BrowserProvider(externalProvider);
    }
    /**
     * Creates a v6 JsonRpcProvider from an Ethers v5 JsonRpcProvider.
     * Use this for backend/script integrations targeting a specific URL.
     * @param v5Provider An ethers v5 JsonRpcProvider
     */
    static fromJsonRpcProvider(v5Provider) {
        // Extract URL. v5 stores it in connection.url usually
        const url = v5Provider.connection?.url || v5Provider._getConnection()?.url;
        if (!url)
            throw new Error("Could not extract URL from v5 Provider");
        return new ethers_1.JsonRpcProvider(url);
    }
    /**
     * Creates a v6 JsonRpcSigner from an Ethers v5 Signer.
     * Effectively "upgrades" the signer to be compatible with the SDK.
     * @param v5Signer An ethers v5 JsonRpcSigner
     */
    static async fromSigner(v5Signer) {
        if (!v5Signer.provider) {
            throw new Error("v5 Signer must be connected to a provider");
        }
        // Try to detect if it's a Web3Provider (browser) or just RPC
        let v6Provider;
        if (v5Signer.provider.jsonRpcFetchFunc || v5Signer.provider.provider) {
            // Likely Web3Provider
            v6Provider = this.fromWeb3Provider(v5Signer.provider);
        }
        else {
            // Fallback to extraction (likely JsonRpcProvider)
            try {
                v6Provider = this.fromJsonRpcProvider(v5Signer.provider);
            }
            catch {
                // Last resort: treat the v5 provider's request method as the transport? 
                // Simplest is to assume Web3Provider for most UI signers.
                v6Provider = this.fromWeb3Provider(v5Signer.provider);
            }
        }
        const address = await v5Signer.getAddress();
        return v6Provider.getSigner(address);
    }
}
exports.EthersV5Adapter = EthersV5Adapter;
//# sourceMappingURL=adapters.js.map