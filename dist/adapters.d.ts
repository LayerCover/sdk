import { BrowserProvider, JsonRpcProvider, JsonRpcSigner } from 'ethers';
/**
 * Helpers to adapt Ethers v5 objects to Ethers v6 for SDK compatibility.
 */
export declare class EthersV5Adapter {
    /**
     * Creates a v6 BrowserProvider from an Ethers v5 Web3Provider.
     * Use this when your dApp uses window.ethereum wrapped in v5.
     * @param v5Provider An ethers v5 Web3Provider (or any object with a .provider EIP-1193 property)
     */
    static fromWeb3Provider(v5Provider: any): BrowserProvider;
    /**
     * Creates a v6 JsonRpcProvider from an Ethers v5 JsonRpcProvider.
     * Use this for backend/script integrations targeting a specific URL.
     * @param v5Provider An ethers v5 JsonRpcProvider
     */
    static fromJsonRpcProvider(v5Provider: any): JsonRpcProvider;
    /**
     * Creates a v6 JsonRpcSigner from an Ethers v5 Signer.
     * Effectively "upgrades" the signer to be compatible with the SDK.
     * @param v5Signer An ethers v5 JsonRpcSigner
     */
    static fromSigner(v5Signer: any): Promise<JsonRpcSigner>;
}
//# sourceMappingURL=adapters.d.ts.map