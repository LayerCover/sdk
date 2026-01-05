import { BuyCoverTheme } from '../theme';
export interface BuyCoverModalProps {
    /** Whether the modal is open */
    open: boolean;
    /** Callback when modal is closed */
    onClose: () => void;
    /** Ethers v6 signer instance */
    signer: any;
    /** Pool ID to purchase cover from */
    poolId: number;
    /** User's available balance of the token (optional, for display only) */
    availableBalance?: number;
    /** Callback when purchase is successful */
    onSuccess?: () => void;
    /** Custom theme overrides for visual styling */
    theme?: Partial<BuyCoverTheme>;
    /** Optional referral code for partner fee earning (max 31 characters) */
    referralCode?: string;
    /** Optional API base URL for quotes (default: https://app.layercover.com) */
    apiBaseUrl?: string;
}
/**
 * Ready-to-use Buy Cover modal component.
 * Import from `@layercover/sdk/react` and provide a signer.
 *
 * @example
 * ```tsx
 * import { BuyCoverModal } from '@layercover/sdk/react';
 *
 * <BuyCoverModal
 *   open={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   signer={mySigner}
 *   poolId={1}
 * />
 * ```
 */
export declare function BuyCoverModal({ open, onClose, signer, poolId, availableBalance, onSuccess, theme: themeOverrides, referralCode, apiBaseUrl, }: BuyCoverModalProps): import("react/jsx-runtime").JSX.Element;
