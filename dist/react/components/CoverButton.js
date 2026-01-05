"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CoverButton = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const material_1 = require("@mui/material");
const BuyCoverModal_1 = require("./BuyCoverModal");
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
function CoverButton({ signer, poolId, availableBalance = 0, onSuccess, theme, buttonText = 'Cover', disabled = false, buttonProps, referralCode, apiBaseUrl, }) {
    const [isModalOpen, setIsModalOpen] = (0, react_1.useState)(false);
    const handleSuccess = () => {
        setIsModalOpen(false);
        onSuccess?.();
    };
    return ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)(material_1.Button, { variant: "outlined", color: "success", disabled: disabled || !signer, onClick: () => setIsModalOpen(true), sx: { minWidth: '80px', ...buttonProps?.sx }, ...buttonProps, children: buttonText }), (0, jsx_runtime_1.jsx)(BuyCoverModal_1.BuyCoverModal, { open: isModalOpen, onClose: () => setIsModalOpen(false), signer: signer, poolId: poolId, availableBalance: availableBalance, onSuccess: handleSuccess, theme: theme, referralCode: referralCode, apiBaseUrl: apiBaseUrl })] }));
}
exports.CoverButton = CoverButton;
