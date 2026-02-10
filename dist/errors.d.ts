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