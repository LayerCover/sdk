/**
 * Human-readable error messages for LayerCover contract reverts.
 *
 * Maps 4-byte error selectors to user-friendly messages. Use `LayerCoverSDK.getHumanError()`
 * for automatic extraction, or import this map for custom handling.
 *
 * @example
 * ```ts
 * import { ERROR_MESSAGES } from '@layercover/sdk';
 *
 * const selector = '0xa4264d34';
 * console.log(ERROR_MESSAGES[selector]); // "Insufficient pool capacity..."
 * ```
 */
export const ERROR_MESSAGES: Record<string, string> = {
    // ── Policy & Coverage ──────────────────────────────────────────────
    '0xa4264d34': 'Insufficient pool capacity. Try a smaller amount or shorter duration.',
    '0x8e4a23d6': 'This pool is not active. It may be paused or not yet configured.',
    '0x6a0d4594': 'Invalid pool configuration. Please contact support.',
    '0x7939f424': 'Amount exceeds the maximum coverage limit for this pool.',
    '0x3ee5aeb5': 'Unauthorized. Please check your wallet connection.',

    // ── Token & Balance ────────────────────────────────────────────────
    '0xe450d38c': 'Insufficient token balance. Please check your wallet.',
    '0xfb8f41b2': 'Token transfer failed. Please check your token approval.',

    // ── Claim & Payout ─────────────────────────────────────────────────
    // NothingToClaim()
    '0x0ced4c96': 'Nothing to claim. Your policy may not have a valid incident.',
    // UseOptimisticResolver()
    '0x71beba4a': 'This pool uses the Optimistic Oracle for claims. Please use the optimistic claim flow.',
    // PolicyNotActive(uint256)
    '0x54a1b3c4': 'This policy is not active.',
    // PolicyAlreadyTerminated(uint256)
    '0x1e2c3d4a': 'This policy has already been terminated.',
    // PolicyVoided(uint256)
    '0x45d92e1f': 'This policy was voided.',
    // BlacklistedClaimant(address)
    '0x2d8f13ab': 'This address is not eligible for claims.',

    // ── Pool & Capacity ────────────────────────────────────────────────
    // InsufficientCapacity(uint256, uint256)
    '0x8a164f66': 'Insufficient capacity in this pool. Try a smaller coverage amount.',
    // PoolPaused(uint256)
    '0x1c753aab': 'This pool is currently paused.',
    // PremiumTooLow(uint256, uint256)
    '0x4e7a1577': 'Premium amount is too low for this coverage.',
    // InvalidAmount(uint256)
    '0x2c5211c5': 'Invalid amount specified.',
    // InvalidInput(string)
    '0xa9cb9e0d': 'Invalid input parameter.',

    // ── Intent & Quote ─────────────────────────────────────────────────
    // IntentPolicyCallerNotAuthorized()
    '0x94d9a10c': 'Not authorized to execute this intent. Check wallet address.',
    // RequireFailed(string)
    '0x54f41f12': 'Transaction requirement failed.',
};

/**
 * Decode a contract or wallet error into a human-readable message.
 *
 * Handles ethers v6 errors, raw revert data, user rejections, and common patterns.
 *
 * @param error Any error thrown during an SDK or contract interaction
 * @returns A clean, user-facing error string
 */
export function getHumanError(error: any): string {
    if (!error) return 'An unknown error occurred.';

    // ── User rejection ─────────────────────────────────────────────────
    if (error?.code === 'ACTION_REJECTED' ||
        error?.message?.includes('user rejected') ||
        error?.message?.includes('User denied') ||
        error?.message?.includes('User rejected')) {
        return 'Transaction was rejected by the user.';
    }

    // ── Extract error data from various formats ────────────────────────
    let errorData: string | undefined = error?.data || error?.error?.data;

    // ethers v6 CALL_EXCEPTION format
    if (!errorData && error?.info?.error?.data) {
        errorData = error.info.error.data;
    }

    // Error data embedded in message string
    if (!errorData && error?.message) {
        const match = error.message.match(/data="(0x[a-fA-F0-9]+)"/);
        if (match) errorData = match[1];
    }

    // ── Match known selectors ──────────────────────────────────────────
    if (errorData && typeof errorData === 'string' && errorData.startsWith('0x')) {
        const selector = errorData.slice(0, 10).toLowerCase();
        if (ERROR_MESSAGES[selector]) {
            return ERROR_MESSAGES[selector];
        }
    }

    // ── Common message patterns ────────────────────────────────────────
    const msg = (error?.message || '').toLowerCase();

    if (msg.includes('insufficient funds') || error?.code === 'INSUFFICIENT_FUNDS') {
        return 'Insufficient funds for gas fees. Please add ETH to your wallet.';
    }
    if (msg.includes('nonce') && msg.includes('too low')) {
        return 'Transaction nonce conflict. Please reset your wallet or wait for pending transactions.';
    }
    if (msg.includes('replacement fee too low') || msg.includes('underpriced')) {
        return 'Transaction fee too low. Please try again with higher gas.';
    }
    if (msg.includes('execution reverted')) {
        return 'Transaction would fail on-chain. Try a smaller amount or check pool availability.';
    }
    if (msg.includes('network') || msg.includes('connection') || msg.includes('timeout')) {
        return 'Network error. Please check your connection and try again.';
    }
    if (msg.includes('chain mismatch') || msg.includes('wrong network')) {
        return 'Wrong network. Please switch to Base Sepolia in your wallet.';
    }

    // ── Ethers shortMessage fallback ───────────────────────────────────
    if (error?.shortMessage) {
        return error.shortMessage;
    }

    // ── Last resort ────────────────────────────────────────────────────
    return error?.message || 'An unexpected error occurred. Please try again.';
}
