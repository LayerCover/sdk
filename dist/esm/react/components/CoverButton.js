import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Button } from '@mui/material';
import { BuyCoverModal } from './BuyCoverModal';
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
export function CoverButton({ signer, poolId, availableBalance = 0, onSuccess, theme, buttonText = 'Cover', disabled = false, buttonProps, referralCode, apiBaseUrl, deployment, }) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const handleSuccess = () => {
        setIsModalOpen(false);
        onSuccess?.();
    };
    return (_jsxs(_Fragment, { children: [_jsx(Button, { variant: "outlined", color: "success", disabled: disabled || !signer, onClick: () => setIsModalOpen(true), sx: { minWidth: '80px', ...buttonProps?.sx }, ...buttonProps, children: buttonText }), _jsx(BuyCoverModal, { open: isModalOpen, onClose: () => setIsModalOpen(false), signer: signer, poolId: poolId, availableBalance: availableBalance, onSuccess: handleSuccess, theme: theme, referralCode: referralCode, apiBaseUrl: apiBaseUrl, deployment: deployment })] }));
}
