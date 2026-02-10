import { BrowserProvider, JsonRpcProvider, JsonRpcSigner } from 'ethers';
/**
 * Adapter to use viem/wagmi clients with the LayerCover SDK.
 *
 * @example
 * ```ts
 * import { ViemAdapter } from '@layercover/sdk';
 * import { useWalletClient, usePublicClient } from 'wagmi';
 *
 * const { data: walletClient } = useWalletClient();
 * const signer = ViemAdapter.fromWalletClient(walletClient);
 * const sdk = await LayerCoverSDK.create(signer);
 * ```
 */
export declare class ViemAdapter {
    /**
     * Creates an ethers v6 BrowserProvider + Signer from a viem WalletClient.
     * Use this with wagmi's `useWalletClient()` hook.
     *
     * @param walletClient A viem WalletClient (from wagmi or standalone viem)
     * @returns An ethers v6 JsonRpcSigner ready for the SDK
     */
    static fromWalletClient(walletClient: any): JsonRpcSigner;
    /**
     * Creates an ethers v6 JsonRpcProvider from a viem PublicClient.
     * Use this for read-only access (pool browsing, quote fetching).
     *
     * @param publicClient A viem PublicClient (from wagmi or standalone viem)
     * @returns An ethers v6 provider
     */
    static fromPublicClient(publicClient: any): JsonRpcProvider | BrowserProvider;
    /**
     * Creates an ethers v6 Signer from a viem Account + transport.
     * Use this for server-side or script usage with viem private key accounts.
     *
     * @param account A viem LocalAccount (from privateKeyToAccount, mnemonicToAccount, etc.)
     * @param transport A viem transport (http, webSocket, etc.)
     * @param chain The target chain object ({ id, name, ... })
     * @returns An ethers v6 JsonRpcSigner
     */
    static fromViemAccount(account: any, transport: any, chain?: any): JsonRpcSigner;
}
//# sourceMappingURL=viem-adapter.d.ts.map