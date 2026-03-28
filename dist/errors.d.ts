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
export declare const ERROR_MESSAGES: Record<string, string>;
export interface PurchaseBlockerLike {
    code: string;
    message: string;
    quoteId?: string;
}
export declare class LayerCoverSDKError extends Error {
    code: string;
    cause?: unknown;
    constructor(message: string, code?: string, options?: {
        cause?: unknown;
    });
}
export declare class PurchaseBlockedError extends LayerCoverSDKError {
    blockers: PurchaseBlockerLike[];
    constructor(message: string, blockers: PurchaseBlockerLike[], options?: {
        cause?: unknown;
    });
}
export declare class QuoteStaleError extends LayerCoverSDKError {
    quoteId: string;
    maxAgeMs: number;
    quoteAgeMs: number | null;
    constructor(message: string, quoteId: string, maxAgeMs: number, quoteAgeMs: number | null, options?: {
        cause?: unknown;
    });
}
export declare class SignerRequiredError extends LayerCoverSDKError {
    constructor(message?: string, options?: {
        cause?: unknown;
    });
}
export declare class ChainMismatchError extends LayerCoverSDKError {
    expectedChainId: number;
    connectedChainId: number;
    expectedDeployment?: string;
    constructor(message: string, expectedChainId: number, connectedChainId: number, expectedDeployment?: string, options?: {
        cause?: unknown;
    });
}
/**
 * Decode a contract or wallet error into a human-readable message.
 *
 * Handles ethers v6 errors, raw revert data, user rejections, and common patterns.
 *
 * @param error Any error thrown during an SDK or contract interaction
 * @returns A clean, user-facing error string
 */
export declare function getHumanError(error: any): string;
//# sourceMappingURL=errors.d.ts.map