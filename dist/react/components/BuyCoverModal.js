"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BuyCoverModal = BuyCoverModal;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const theme_1 = require("../theme");
const material_1 = require("@mui/material");
const Close_1 = __importDefault(require("@mui/icons-material/Close"));
const ExpandMore_1 = __importDefault(require("@mui/icons-material/ExpandMore"));
const OpenInNew_1 = __importDefault(require("@mui/icons-material/OpenInNew"));
const ethers_1 = require("ethers-v6");
const index_1 = require("../../index");
const logo_1 = require("./logo");
// Helper to detect if a color is light (for logo selection)
function isLightColor(hexColor) {
    const hex = hexColor.replace('#', '');
    if (hex.length !== 6)
        return false;
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    // Calculate perceived luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5;
}
const WEEK_MARKS = [
    { value: 1, label: '1W' },
    { value: 13, label: '13W' },
    { value: 26, label: '26W' },
    { value: 39, label: '39W' },
    { value: 52, label: '52W' },
];
const FAQ_ITEMS = [
    {
        question: 'What is LayerCover?',
        answer: 'LayerCover is a decentralized insurance protocol that provides coverage for your DeFi positions. You can protect your supplied assets against smart contract risks, hacks, and other DeFi-related incidents.',
    },
    {
        question: 'How does coverage work?',
        answer: 'When you purchase coverage, you pay a premium based on the amount and duration you want to protect. If a covered event occurs during your coverage period, you can file a claim to receive compensation.',
    },
    {
        question: 'What events are covered?',
        answer: 'Coverage includes smart contract exploits, oracle failures, and protocol-specific risks. The exact coverage terms depend on the pool you purchase from.',
    },
    {
        question: 'How is the premium calculated?',
        answer: 'Premiums are calculated based on the coverage amount, duration, and current market rates. The rate is expressed as an annual percentage (APY) of the covered amount.',
    },
    {
        question: 'How do I file a claim?',
        answer: 'If a covered event occurs, visit the LayerCover app to file a claim. Claims are processed through a decentralized governance process to ensure fair outcomes.',
    },
];
/**
 * Decode error message from contract revert.
 * Delegates to the centralized error module.
 */
const errors_1 = require("../../errors");
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
function BuyCoverModal({ open, onClose, signer, poolId, availableBalance = 0, onSuccess, theme: themeOverrides, referralCode, apiBaseUrl, deployment, }) {
    // Merge custom theme with defaults
    const theme = (0, react_1.useMemo)(() => ({ ...theme_1.defaultTheme, ...themeOverrides }), [themeOverrides]);
    // Create MUI theme from our custom theme
    const muiTheme = (0, react_1.useMemo)(() => (0, material_1.createTheme)({
        palette: {
            mode: 'dark',
            primary: {
                main: theme.primaryColor,
            },
            text: {
                primary: theme.textColor,
                secondary: theme.textSecondaryColor,
            },
            background: {
                paper: theme.backgroundColor,
                default: theme.backgroundColor,
            },
            divider: theme.borderColor,
        },
        components: {
            MuiSlider: {
                styleOverrides: {
                    root: {
                        color: theme.primaryColor,
                    },
                },
            },
        },
    }), [theme]);
    // SDK instance — created once from signer, auto-resolves contract addresses
    const [sdk, setSdk] = (0, react_1.useState)(null);
    const [chainError, setChainError] = (0, react_1.useState)('');
    (0, react_1.useEffect)(() => {
        const initSdk = async () => {
            if (!open)
                return;
            if (!signer) {
                setSdk(null);
                setChainError('Wallet not connected');
                return;
            }
            try {
                const instance = await index_1.LayerCoverSDK.create(signer, { apiBaseUrl, deployment });
                setSdk(instance);
                setChainError('');
            }
            catch (e) {
                console.error('Failed to initialize SDK:', e);
                const message = e?.message || 'Unsupported network';
                setSdk(null);
                setChainError(message);
                setError(message);
            }
        };
        initSdk();
    }, [open, signer, apiBaseUrl, deployment]);
    const [activeTab, setActiveTab] = (0, react_1.useState)(0);
    const [amount, setAmount] = (0, react_1.useState)('');
    const [weeks, setWeeks] = (0, react_1.useState)(4);
    const [bestQuote, setBestQuote] = (0, react_1.useState)(null);
    const [estimatedPremium, setEstimatedPremium] = (0, react_1.useState)(null);
    const [loading, setLoading] = (0, react_1.useState)(false);
    const [error, setError] = (0, react_1.useState)('');
    const [txStatus, setTxStatus] = (0, react_1.useState)('');
    const [poolMetadata, setPoolMetadata] = (0, react_1.useState)(null);
    const [metadataLoading, setMetadataLoading] = (0, react_1.useState)(false);
    // Derived values from pool metadata
    const tokenSymbol = poolMetadata?.tokenSymbol || '';
    const tokenDecimals = poolMetadata?.tokenDecimals || 6;
    const tokenLogoUrl = poolMetadata?.tokenLogoUrl;
    const payoutTokenSymbol = poolMetadata?.payoutTokenSymbol || 'USDC';
    const payoutTokenLogoUrl = poolMetadata?.payoutTokenLogoUrl;
    const endDate = (0, react_1.useMemo)(() => {
        const date = new Date();
        date.setDate(date.getDate() + weeks * 7);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }, [weeks]);
    (0, react_1.useEffect)(() => {
        if (open) {
            setError('');
            setTxStatus('');
            setBestQuote(null);
            setEstimatedPremium(null);
            setActiveTab(0);
            setMetadataLoading(true);
        }
    }, [open]);
    // Fetch pool metadata when modal opens
    (0, react_1.useEffect)(() => {
        const fetchMetadata = async () => {
            if (!open) {
                setMetadataLoading(false);
                return;
            }
            if (!sdk) {
                if (chainError)
                    setMetadataLoading(false);
                return;
            }
            setMetadataLoading(true);
            try {
                const metadata = await sdk.getPoolMetadata(poolId);
                setPoolMetadata(metadata);
            }
            catch (e) {
                console.warn('Failed to fetch pool metadata:', e);
                setPoolMetadata(null);
            }
            finally {
                setMetadataLoading(false);
            }
        };
        fetchMetadata();
    }, [open, sdk, poolId, chainError]);
    // Auto-fetch quote when amount or weeks change
    (0, react_1.useEffect)(() => {
        const fetchQuote = async () => {
            if (!sdk || !amount || Number(amount) <= 0) {
                setBestQuote(null);
                setEstimatedPremium(null);
                if (!chainError) {
                    setError('');
                }
                return;
            }
            try {
                const quotes = await sdk.getFixedRateQuotes(poolId);
                // Get best (cheapest) active quote
                const activeQuotes = quotes
                    .filter(q => q.status === 'active' && !index_1.LayerCoverSDK.isQuoteExpired(q))
                    .sort((a, b) => a.premiumRateBps - b.premiumRateBps);
                if (activeQuotes.length === 0) {
                    setBestQuote(null);
                    setEstimatedPremium(null);
                    setError('No active quotes available for this pool');
                    return;
                }
                const best = activeQuotes[0];
                setBestQuote(best);
                // Calculate premium for display
                const amountBigInt = (0, ethers_1.parseUnits)(amount, tokenDecimals);
                const durationSeconds = weeks * 7 * 24 * 60 * 60;
                const premium = sdk.calculatePremium(amountBigInt, best.premiumRateBps, durationSeconds);
                setEstimatedPremium(premium);
                setError('');
            }
            catch (e) {
                console.error(e);
                setBestQuote(null);
                setEstimatedPremium(null);
                const decoded = (0, errors_1.getHumanError)(e);
                if (decoded !== 'Transaction was rejected by user.') {
                    setError(decoded);
                }
            }
        };
        const debounce = setTimeout(fetchQuote, 500);
        return () => clearTimeout(debounce);
    }, [amount, weeks, sdk, poolId, tokenDecimals]);
    const handlePurchase = async () => {
        if (!sdk || !bestQuote)
            return;
        setLoading(true);
        setTxStatus('Purchasing...');
        try {
            const amountBigInt = (0, ethers_1.parseUnits)(amount, tokenDecimals);
            // Use the unified purchase method which handles both on-chain and intent-based purchases
            const result = await sdk.purchase(poolId, amountBigInt, weeks, undefined, // maxRateBps - let it use best available
            referralCode);
            setTxStatus('Success! Cover purchased.');
            onSuccess?.();
            setTimeout(onClose, 2000);
        }
        catch (e) {
            console.error(e);
            setTxStatus('');
            setError((0, errors_1.getHumanError)(e));
        }
        finally {
            setLoading(false);
        }
    };
    const handleMaxClick = () => {
        setAmount(availableBalance.toString());
    };
    return ((0, jsx_runtime_1.jsx)(material_1.ThemeProvider, { theme: muiTheme, children: (0, jsx_runtime_1.jsxs)(material_1.Dialog, { open: open, onClose: onClose, maxWidth: "xs", fullWidth: true, PaperProps: {
                sx: {
                    backgroundColor: theme.backgroundColor,
                    borderRadius: theme.borderRadius / 4,
                },
            }, children: [(0, jsx_runtime_1.jsx)(material_1.Box, { sx: { borderBottom: 1, borderColor: theme.borderColor, px: 2, pt: 1 }, children: (0, jsx_runtime_1.jsxs)(material_1.Stack, { direction: "row", justifyContent: "space-between", alignItems: "center", children: [(0, jsx_runtime_1.jsxs)(material_1.Tabs, { value: activeTab, onChange: (_, v) => setActiveTab(v), sx: {
                                    '& .MuiTab-root': {
                                        textTransform: 'none',
                                        fontWeight: 'medium',
                                        minWidth: 'auto',
                                        px: 2,
                                    },
                                }, children: [(0, jsx_runtime_1.jsx)(material_1.Tab, { label: "Purchase" }), (0, jsx_runtime_1.jsx)(material_1.Tab, { label: "How it works" })] }), (0, jsx_runtime_1.jsx)(material_1.IconButton, { onClick: onClose, size: "small", sx: { color: 'grey.500' }, children: (0, jsx_runtime_1.jsx)(Close_1.default, {}) })] }) }), (0, jsx_runtime_1.jsx)(material_1.DialogContent, { children: metadataLoading ? (
                    /* Loading state */
                    (0, jsx_runtime_1.jsx)(material_1.Box, { display: "flex", justifyContent: "center", alignItems: "center", py: 8, children: (0, jsx_runtime_1.jsx)(material_1.CircularProgress, {}) })) : chainError ? ((0, jsx_runtime_1.jsx)(material_1.Alert, { severity: "error", children: chainError })) : activeTab === 0 ? (
                    /* Purchase Tab */
                    (0, jsx_runtime_1.jsxs)(material_1.Box, { display: "flex", flexDirection: "column", gap: 5, children: [(0, jsx_runtime_1.jsxs)(material_1.Box, { children: [(0, jsx_runtime_1.jsxs)(material_1.Stack, { direction: "row", justifyContent: "space-between", mb: 1, children: [(0, jsx_runtime_1.jsx)(material_1.Typography, { variant: "body2", fontWeight: "medium", children: "Amount" }), (0, jsx_runtime_1.jsxs)(material_1.Typography, { variant: "caption", color: "text.secondary", children: ["Enter the amount of ", tokenSymbol ? `${tokenSymbol} ` : '', "cover"] })] }), (0, jsx_runtime_1.jsx)(material_1.TextField, { value: amount, onChange: (e) => setAmount(e.target.value), type: "text", inputProps: {
                                            inputMode: 'decimal',
                                            pattern: '[0-9]*\\.?[0-9]*',
                                        }, fullWidth: true, placeholder: "0.00", InputProps: {
                                            endAdornment: ((0, jsx_runtime_1.jsx)(material_1.InputAdornment, { position: "end", children: (0, jsx_runtime_1.jsxs)(material_1.Stack, { direction: "row", alignItems: "center", gap: 0.75, children: [tokenLogoUrl && ((0, jsx_runtime_1.jsx)("img", { src: tokenLogoUrl, alt: tokenSymbol, style: { width: 20, height: 20, borderRadius: '50%' } })), (0, jsx_runtime_1.jsx)(material_1.Typography, { fontWeight: "bold", children: tokenSymbol })] }) })),
                                            sx: {
                                                fontSize: '1.5rem',
                                                backgroundColor: theme.inputBackgroundColor,
                                                borderRadius: theme.inputBorderRadius / 4,
                                            },
                                        } }), (0, jsx_runtime_1.jsxs)(material_1.Stack, { direction: "row", justifyContent: "space-between", mt: 0.5, children: [(0, jsx_runtime_1.jsxs)(material_1.Typography, { variant: "caption", color: "text.secondary", children: ["$", (Number(amount) || 0).toFixed(2)] }), (0, jsx_runtime_1.jsxs)(material_1.Stack, { direction: "row", alignItems: "center", gap: 1, children: [(0, jsx_runtime_1.jsxs)(material_1.Typography, { variant: "caption", color: "text.secondary", children: ["Available: ", availableBalance.toFixed(2)] }), (0, jsx_runtime_1.jsx)(material_1.Button, { size: "small", variant: "outlined", onClick: handleMaxClick, sx: { minWidth: 'auto', px: 1, py: 0, fontSize: '0.7rem' }, children: "MAX" })] })] })] }), (0, jsx_runtime_1.jsxs)(material_1.Box, { children: [(0, jsx_runtime_1.jsxs)(material_1.Stack, { direction: "row", justifyContent: "space-between", alignItems: "baseline", mb: 2, children: [(0, jsx_runtime_1.jsx)(material_1.Typography, { variant: "body2", fontWeight: "medium", children: "Coverage Duration" }), (0, jsx_runtime_1.jsxs)(material_1.Box, { textAlign: "right", children: [(0, jsx_runtime_1.jsxs)(material_1.Typography, { variant: "h6", fontWeight: "bold", children: [weeks, " Week", weeks !== 1 ? 's' : ''] }), (0, jsx_runtime_1.jsxs)(material_1.Typography, { variant: "caption", color: "text.secondary", children: ["Ends ", endDate] })] })] }), (0, jsx_runtime_1.jsx)(material_1.Slider, { value: weeks, onChange: (_, v) => setWeeks(v), min: 1, max: 52, marks: WEEK_MARKS, sx: {
                                            color: theme.primaryColor,
                                            '& .MuiSlider-markLabel': {
                                                color: 'text.secondary',
                                                fontSize: '0.75rem',
                                            },
                                        } })] }), bestQuote && estimatedPremium !== null && ((0, jsx_runtime_1.jsxs)(material_1.Box, { children: [(0, jsx_runtime_1.jsx)(material_1.Typography, { variant: "body2", fontWeight: "medium", mb: 1, children: "Transaction overview" }), (0, jsx_runtime_1.jsx)(material_1.Box, { sx: {
                                            backgroundColor: theme.inputBackgroundColor,
                                            borderRadius: theme.inputBorderRadius / 4,
                                            p: 2,
                                        }, children: (0, jsx_runtime_1.jsxs)(material_1.Stack, { spacing: 2, children: [(0, jsx_runtime_1.jsxs)(material_1.Stack, { direction: "row", justifyContent: "space-between", children: [(0, jsx_runtime_1.jsx)(material_1.Typography, { variant: "body2", color: "text.secondary", children: "Premium Rate" }), (0, jsx_runtime_1.jsxs)(material_1.Typography, { variant: "body2", fontWeight: "medium", children: [(bestQuote.premiumRateBps / 100).toFixed(2), "% APY"] })] }), (0, jsx_runtime_1.jsxs)(material_1.Stack, { direction: "row", justifyContent: "space-between", children: [(0, jsx_runtime_1.jsxs)(material_1.Typography, { variant: "body2", color: "text.secondary", children: ["Estimated Cost (", weeks, "w)"] }), (0, jsx_runtime_1.jsxs)(material_1.Typography, { variant: "body2", fontWeight: "medium", children: [(0, ethers_1.formatUnits)(estimatedPremium, tokenDecimals), ' ', payoutTokenSymbol] })] }), (0, jsx_runtime_1.jsxs)(material_1.Stack, { direction: "row", justifyContent: "space-between", alignItems: "center", children: [(0, jsx_runtime_1.jsx)(material_1.Typography, { variant: "body2", color: "text.secondary", children: "Coverage Amount" }), (0, jsx_runtime_1.jsxs)(material_1.Stack, { direction: "row", alignItems: "center", gap: 0.75, children: [tokenLogoUrl && ((0, jsx_runtime_1.jsx)("img", { src: tokenLogoUrl, alt: tokenSymbol, style: { width: 16, height: 16, borderRadius: '50%' } })), (0, jsx_runtime_1.jsxs)(material_1.Typography, { variant: "body2", fontWeight: "medium", children: [amount, " ", tokenSymbol] })] })] }), (0, jsx_runtime_1.jsxs)(material_1.Stack, { direction: "row", justifyContent: "space-between", alignItems: "center", children: [(0, jsx_runtime_1.jsx)(material_1.Typography, { variant: "body2", color: "text.secondary", children: "Payout Token" }), (0, jsx_runtime_1.jsxs)(material_1.Stack, { direction: "row", alignItems: "center", gap: 0.75, children: [payoutTokenLogoUrl && ((0, jsx_runtime_1.jsx)("img", { src: payoutTokenLogoUrl, alt: payoutTokenSymbol, style: { width: 16, height: 16, borderRadius: '50%' } })), (0, jsx_runtime_1.jsx)(material_1.Typography, { variant: "body2", fontWeight: "medium", children: payoutTokenSymbol })] })] })] }) })] })), error && ((0, jsx_runtime_1.jsx)(material_1.Typography, { color: "error", variant: "caption", children: error })), txStatus && ((0, jsx_runtime_1.jsx)(material_1.Typography, { color: "primary", variant: "caption", children: txStatus })), (0, jsx_runtime_1.jsx)(material_1.Button, { variant: "contained", size: "large", fullWidth: true, onClick: handlePurchase, disabled: loading || !bestQuote || !amount, sx: {
                                    py: 1.5,
                                    borderRadius: theme.inputBorderRadius / 4,
                                    background: bestQuote
                                        ? theme.buttonGradient
                                        : undefined,
                                    color: theme.buttonTextColor || '#ffffff',
                                    '&:hover': {
                                        background: bestQuote
                                            ? theme.buttonGradientHover
                                            : undefined,
                                    },
                                }, children: loading ? ((0, jsx_runtime_1.jsx)(material_1.CircularProgress, { size: 24, color: "inherit" })) : bestQuote ? ('Confirm Transaction') : ('Enter amount to get quote') })] })) : (
                    /* How it works Tab */
                    (0, jsx_runtime_1.jsx)(material_1.Box, { display: "flex", flexDirection: "column", gap: 1.5, children: FAQ_ITEMS.map((item, index) => ((0, jsx_runtime_1.jsxs)(material_1.Accordion, { disableGutters: true, elevation: 0, sx: {
                                backgroundColor: theme.accordionBackgroundColor,
                                borderRadius: `${theme.inputBorderRadius}px !important`,
                                '&:before': { display: 'none' },
                                '&.Mui-expanded': {
                                    backgroundColor: theme.accordionExpandedBackgroundColor,
                                },
                            }, children: [(0, jsx_runtime_1.jsx)(material_1.AccordionSummary, { expandIcon: (0, jsx_runtime_1.jsx)(ExpandMore_1.default, { sx: { color: 'text.secondary' } }), sx: { px: 2, py: 0.5 }, children: (0, jsx_runtime_1.jsx)(material_1.Typography, { variant: "body2", fontWeight: "600", children: item.question }) }), (0, jsx_runtime_1.jsx)(material_1.AccordionDetails, { sx: { px: 2, pb: 2, pt: 0 }, children: (0, jsx_runtime_1.jsx)(material_1.Typography, { variant: "body2", color: "text.secondary", sx: { lineHeight: 1.6 }, children: item.answer }) })] }, index))) })) }), (0, jsx_runtime_1.jsxs)(material_1.Box, { component: "a", href: `https://app.layercover.com/cover/${poolId}`, target: "_blank", rel: "noopener noreferrer", sx: {
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: 1,
                        py: 2,
                        borderTop: 1,
                        borderColor: theme.borderColor,
                        textDecoration: 'none',
                        cursor: 'pointer',
                        transition: 'opacity 0.2s',
                        '&:hover': {
                            opacity: 0.8,
                        },
                    }, children: [(0, jsx_runtime_1.jsx)(material_1.Typography, { variant: "caption", color: "text.secondary", children: "Powered by" }), (0, jsx_runtime_1.jsx)(material_1.Box, { component: "img", src: isLightColor(theme.backgroundColor) ? logo_1.LAYERCOVER_LOGO_LIGHT : logo_1.LAYERCOVER_LOGO_DARK, alt: "LayerCover", onError: (e) => {
                                // Fallback to text if image fails to load
                                const target = e.currentTarget;
                                target.style.display = 'none';
                                const fallback = document.createElement('span');
                                fallback.textContent = '🛡️ LayerCover';
                                fallback.style.fontWeight = 'bold';
                                fallback.style.fontSize = '0.875rem';
                                fallback.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                                fallback.style.webkitBackgroundClip = 'text';
                                fallback.style.webkitTextFillColor = 'transparent';
                                target.parentNode?.insertBefore(fallback, target.nextSibling);
                            }, sx: {
                                height: 24,
                                objectFit: 'contain',
                            } }), (0, jsx_runtime_1.jsx)(OpenInNew_1.default, { sx: { fontSize: 14, color: 'text.secondary' } })] })] }) }));
}
//# sourceMappingURL=BuyCoverModal.js.map
