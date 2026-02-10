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
export class ViemAdapter {
    /**
     * Creates an ethers v6 BrowserProvider + Signer from a viem WalletClient.
     * Use this with wagmi's `useWalletClient()` hook.
     *
     * @param walletClient A viem WalletClient (from wagmi or standalone viem)
     * @returns An ethers v6 JsonRpcSigner ready for the SDK
     */
    static fromWalletClient(walletClient: any): JsonRpcSigner {
        if (!walletClient?.transport) {
            throw new Error('Invalid WalletClient: missing transport. Did you pass a PublicClient instead?');
        }

        // viem WalletClient exposes an EIP-1193 provider via its transport
        const provider = new BrowserProvider(walletClient.transport, {
            chainId: walletClient.chain?.id,
            name: walletClient.chain?.name || 'unknown',
        });

        // The WalletClient's account address
        const address = walletClient.account?.address;
        if (!address) {
            throw new Error('WalletClient has no account. Ensure the wallet is connected.');
        }

        // Return a signer bound to that address
        // We use a synchronous approach by using getSigner() result directly 
        // since BrowserProvider wraps EIP-1193 which is already connected
        return new JsonRpcSigner(provider, address);
    }

    /**
     * Creates an ethers v6 JsonRpcProvider from a viem PublicClient.
     * Use this for read-only access (pool browsing, quote fetching).
     *
     * @param publicClient A viem PublicClient (from wagmi or standalone viem)
     * @returns An ethers v6 provider
     */
    static fromPublicClient(publicClient: any): JsonRpcProvider | BrowserProvider {
        if (!publicClient?.transport) {
            throw new Error('Invalid PublicClient: missing transport.');
        }

        const transport = publicClient.transport;

        // If the transport has a URL (http transport), use JsonRpcProvider
        if (transport.url) {
            return new JsonRpcProvider(transport.url, {
                chainId: publicClient.chain?.id,
                name: publicClient.chain?.name || 'unknown',
            });
        }

        // Otherwise wrap EIP-1193 transport (e.g. custom, fallback)
        return new BrowserProvider(transport, {
            chainId: publicClient.chain?.id,
            name: publicClient.chain?.name || 'unknown',
        });
    }

    /**
     * Creates an ethers v6 Signer from a viem Account + transport.
     * Use this for server-side or script usage with viem private key accounts.
     *
     * @param account A viem LocalAccount (from privateKeyToAccount, mnemonicToAccount, etc.)
     * @param transport A viem transport (http, webSocket, etc.)
     * @param chain The target chain object ({ id, name, ... })
     * @returns An ethers v6 JsonRpcSigner
     */
    static fromViemAccount(account: any, transport: any, chain?: any): JsonRpcSigner {
        if (!account?.address) {
            throw new Error('Invalid account: missing address.');
        }

        const provider = new BrowserProvider(transport, chain ? {
            chainId: chain.id,
            name: chain.name || 'unknown',
        } : undefined);

        return new JsonRpcSigner(provider, account.address);
    }
}
