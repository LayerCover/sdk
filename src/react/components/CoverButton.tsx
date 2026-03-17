import React, { useState } from 'react';
import { Button, ButtonProps } from '@mui/material';
import { BuyCoverModal } from './BuyCoverModal';
import { BuyCoverTheme } from '../theme';

export interface CoverButtonProps {
    /** Ethers v6 signer instance */
    signer: any;
    /** Pool ID to purchase cover from */
    poolId: number;
    /** User's available balance of the token (optional, for display only) */
    availableBalance?: number;
    /** Callback when purchase is successful */
    onSuccess?: () => void;
    /** Custom theme overrides for the modal */
    theme?: Partial<BuyCoverTheme>;
    /** Button text (default: "Cover") */
    buttonText?: string;
    /** Whether the button is disabled */
    disabled?: boolean;
    /** Additional button props */
    buttonProps?: Omit<ButtonProps, 'onClick' | 'disabled' | 'variant' | 'color'>;
    /** Optional referral code for partner fee earning (max 31 characters) */
    referralCode?: string;
    /** Optional API base URL for quotes (default: https://app.layercover.com) */
    apiBaseUrl?: string;
    /** Optional deployment identifier (for example, `avalanche_fuji_usdc`) */
    deployment?: string;
}

/**
 * All-in-one Cover button with integrated modal.
 * 
 * This is the easiest way to add LayerCover coverage to your app.
 * Just drop in this component and it handles everything.
 *
 * @example
 * ```tsx
 * import { CoverButton } from '@layercover/sdk/react';
 *
 * <CoverButton
 *   signer={signer}
 *   poolId={1}
 *   availableBalance={100}
 * />
 * ```
 */
export function CoverButton({
    signer,
    poolId,
    availableBalance = 0,
    onSuccess,
    theme,
    buttonText = 'Cover',
    disabled = false,
    buttonProps,
    referralCode,
    apiBaseUrl,
    deployment,
}: CoverButtonProps) {
    const [isModalOpen, setIsModalOpen] = useState(false);

    const handleSuccess = () => {
        setIsModalOpen(false);
        onSuccess?.();
    };

    return (
        <>
            <Button
                variant="outlined"
                color="success"
                disabled={disabled || !signer}
                onClick={() => setIsModalOpen(true)}
                sx={{ minWidth: '80px', ...buttonProps?.sx }}
                {...buttonProps}
            >
                {buttonText}
            </Button>
            <BuyCoverModal
                open={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                signer={signer}
                poolId={poolId}
                availableBalance={availableBalance}
                onSuccess={handleSuccess}
                theme={theme}
                referralCode={referralCode}
                apiBaseUrl={apiBaseUrl}
                deployment={deployment}
            />
        </>
    );
}
