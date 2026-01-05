"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BuyCoverModal = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const theme_1 = require("../theme");
const material_1 = require("@mui/material");
const Close_1 = __importDefault(require("@mui/icons-material/Close"));
const ExpandMore_1 = __importDefault(require("@mui/icons-material/ExpandMore"));
const OpenInNew_1 = __importDefault(require("@mui/icons-material/OpenInNew"));
const ethers_1 = require("ethers");
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
 * Known error selectors from LayerCover contracts
 */
const ERROR_SELECTORS = {
    '0xa4264d34': 'Insufficient pool capacity. Try a smaller amount or shorter duration.',
    '0x8e4a23d6': 'Pool is not active. The pool may be paused or not configured.',
    '0x6a0d4594': 'Invalid pool configuration. Please contact support.',
    '0xe450d38c': 'Insufficient token balance. Please check your wallet balance.',
    '0xfb8f41b2': 'Token transfer failed. Please check your token approval.',
    '0x7939f424': 'Amount exceeds maximum coverage limit.',
    '0x3ee5aeb5': 'Unauthorized access. Please check your wallet connection.',
};
/**
 * Decode error message from contract revert
 */
function decodeError(error) {
    // Check for user rejection
    if (error?.message?.includes('user rejected') || error?.code === 'ACTION_REJECTED') {
        return 'Transaction was rejected by user.';
    }
    // Extract error data from various error formats
    let errorData = error?.data || error?.error?.data || '';
    // If error data is in the message, extract it
    if (!errorData && error?.message) {
        const match = error.message.match(/data="(0x[a-fA-F0-9]+)"/);
        if (match) {
            errorData = match[1];
        }
    }
    // Check if we have error data with a known selector
    if (errorData && typeof errorData === 'string' && errorData.startsWith('0x')) {
        const selector = errorData.slice(0, 10).toLowerCase();
        if (ERROR_SELECTORS[selector]) {
            return ERROR_SELECTORS[selector];
        }
    }
    // Check for common error patterns in message
    const msg = error?.message?.toLowerCase() || '';
    if (msg.includes('insufficient funds')) {
        return 'Insufficient funds for transaction gas fees.';
    }
    if (msg.includes('execution reverted')) {
        return 'Transaction would fail. Please try a smaller amount or contact support.';
    }
    if (msg.includes('network') || msg.includes('connection')) {
        return 'Network error. Please check your connection and try again.';
    }
    // Return a cleaner version of the original message
    if (error?.shortMessage) {
        return error.shortMessage;
    }
    return error?.message || 'Failed to get quote. Please try again.';
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
function BuyCoverModal({ open, onClose, signer, poolId, availableBalance = 0, onSuccess, theme: themeOverrides, referralCode, apiBaseUrl, }) {
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
    // Resolve PolicyManager address from signer's chain
    const [policyManagerAddress, setPolicyManagerAddress] = (0, react_1.useState)('');
    const [chainError, setChainError] = (0, react_1.useState)('');
    (0, react_1.useEffect)(() => {
        const resolveAddress = async () => {
            if (!signer)
                return;
            try {
                const network = await signer.provider?.getNetwork();
                const chainId = network?.chainId ? Number(network.chainId) : index_1.DEFAULT_CHAIN_ID;
                const address = (0, index_1.getPolicyManagerAddress)(chainId);
                setPolicyManagerAddress(address);
                setChainError('');
            }
            catch (e) {
                console.error('Failed to resolve chain:', e);
                setChainError(e.message || 'Unsupported network');
            }
        };
        resolveAddress();
    }, [signer]);
    const [activeTab, setActiveTab] = (0, react_1.useState)(0);
    const [amount, setAmount] = (0, react_1.useState)('');
    const [weeks, setWeeks] = (0, react_1.useState)(4);
    const [quote, setQuote] = (0, react_1.useState)(null);
    const [loading, setLoading] = (0, react_1.useState)(false);
    const [error, setError] = (0, react_1.useState)('');
    const [txStatus, setTxStatus] = (0, react_1.useState)('');
    const [poolMetadata, setPoolMetadata] = (0, react_1.useState)(null);
    const [metadataLoading, setMetadataLoading] = (0, react_1.useState)(true);
    // Derived values from pool metadata
    const tokenSymbol = poolMetadata?.tokenSymbol || '';
    const tokenDecimals = poolMetadata?.tokenDecimals || 6;
    const tokenLogoUrl = poolMetadata?.tokenLogoUrl;
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
            setQuote(null);
            setActiveTab(0);
        }
    }, [open]);
    // Fetch pool metadata when modal opens
    (0, react_1.useEffect)(() => {
        const fetchMetadata = async () => {
            if (!open || !signer || !policyManagerAddress) {
                return;
            }
            setMetadataLoading(true);
            try {
                const sdk = new index_1.LayerCoverSDK(signer, policyManagerAddress, { apiBaseUrl });
                const metadata = await sdk.getPoolMetadata(poolId);
                setPoolMetadata(metadata);
            }
            catch (e) {
                console.error('Failed to fetch pool metadata:', e);
                setError('Failed to load pool information');
            }
            finally {
                setMetadataLoading(false);
            }
        };
        fetchMetadata();
    }, [open, signer, policyManagerAddress, poolId]);
    // Auto-fetch quote when amount or weeks change
    (0, react_1.useEffect)(() => {
        const fetchQuote = async () => {
            if (!signer || !amount || Number(amount) <= 0) {
                setQuote(null);
                return;
            }
            try {
                const sdk = new index_1.LayerCoverSDK(signer, policyManagerAddress, { apiBaseUrl });
                const amountBigInt = (0, ethers_1.parseUnits)(amount, tokenDecimals);
                const days = weeks * 7;
                const q = await sdk.getQuote(poolId, amountBigInt, days);
                setQuote(q);
                setError('');
            }
            catch (e) {
                console.error(e);
                setQuote(null);
                const decoded = decodeError(e);
                if (decoded !== 'Transaction was rejected by user.') {
                    setError(decoded);
                }
            }
        };
        const debounce = setTimeout(fetchQuote, 500);
        return () => clearTimeout(debounce);
    }, [amount, weeks, signer, policyManagerAddress, poolId, tokenDecimals]);
    const handlePurchase = async () => {
        if (!signer || !quote)
            return;
        setLoading(true);
        setTxStatus('Purchasing...');
        try {
            const sdk = new index_1.LayerCoverSDK(signer, policyManagerAddress, { apiBaseUrl });
            // Use the unified purchase method which handles both on-chain and intent-based purchases
            const result = await sdk.purchase(poolId, quote.amount, weeks, undefined, // maxRateBps - let it use best available
            referralCode);
            setTxStatus('Success! Cover purchased.');
            console.log('Purchase result:', result);
            onSuccess?.();
            setTimeout(onClose, 2000);
        }
        catch (e) {
            console.error(e);
            setTxStatus('');
            setError(decodeError(e));
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
                    (0, jsx_runtime_1.jsx)(material_1.Box, { display: "flex", justifyContent: "center", alignItems: "center", py: 8, children: (0, jsx_runtime_1.jsx)(material_1.CircularProgress, {}) })) : activeTab === 0 ? (
                    /* Purchase Tab */
                    (0, jsx_runtime_1.jsxs)(material_1.Box, { display: "flex", flexDirection: "column", gap: 5, children: [(0, jsx_runtime_1.jsxs)(material_1.Box, { children: [(0, jsx_runtime_1.jsxs)(material_1.Stack, { direction: "row", justifyContent: "space-between", mb: 1, children: [(0, jsx_runtime_1.jsx)(material_1.Typography, { variant: "body2", fontWeight: "medium", children: "Amount" }), (0, jsx_runtime_1.jsxs)(material_1.Typography, { variant: "caption", color: "text.secondary", children: ["Enter the amount of ", tokenSymbol, " cover"] })] }), (0, jsx_runtime_1.jsx)(material_1.TextField, { value: amount, onChange: (e) => setAmount(e.target.value), type: "text", inputProps: {
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
                                        } })] }), quote && ((0, jsx_runtime_1.jsxs)(material_1.Box, { children: [(0, jsx_runtime_1.jsx)(material_1.Typography, { variant: "body2", fontWeight: "medium", mb: 1, children: "Transaction overview" }), (0, jsx_runtime_1.jsx)(material_1.Box, { sx: {
                                            backgroundColor: theme.inputBackgroundColor,
                                            borderRadius: theme.inputBorderRadius / 4,
                                            p: 2,
                                        }, children: (0, jsx_runtime_1.jsxs)(material_1.Stack, { spacing: 2, children: [(0, jsx_runtime_1.jsxs)(material_1.Stack, { direction: "row", justifyContent: "space-between", children: [(0, jsx_runtime_1.jsx)(material_1.Typography, { variant: "body2", color: "text.secondary", children: "Premium Rate" }), (0, jsx_runtime_1.jsxs)(material_1.Typography, { variant: "body2", fontWeight: "medium", children: [(quote.rateBps / 100).toFixed(2), "% APY"] })] }), (0, jsx_runtime_1.jsxs)(material_1.Stack, { direction: "row", justifyContent: "space-between", children: [(0, jsx_runtime_1.jsxs)(material_1.Typography, { variant: "body2", color: "text.secondary", children: ["Estimated Cost (", weeks, "w)"] }), (0, jsx_runtime_1.jsxs)(material_1.Typography, { variant: "body2", fontWeight: "medium", children: [(0, ethers_1.formatUnits)(quote.premium, tokenDecimals), " ", tokenSymbol] })] }), (0, jsx_runtime_1.jsxs)(material_1.Stack, { direction: "row", justifyContent: "space-between", alignItems: "center", children: [(0, jsx_runtime_1.jsx)(material_1.Typography, { variant: "body2", color: "text.secondary", children: "Coverage Amount" }), (0, jsx_runtime_1.jsxs)(material_1.Stack, { direction: "row", alignItems: "center", gap: 0.75, children: [tokenLogoUrl && ((0, jsx_runtime_1.jsx)("img", { src: tokenLogoUrl, alt: tokenSymbol, style: { width: 16, height: 16, borderRadius: '50%' } })), (0, jsx_runtime_1.jsxs)(material_1.Typography, { variant: "body2", fontWeight: "medium", children: [(0, ethers_1.formatUnits)(quote.amount, tokenDecimals), " ", tokenSymbol] })] })] }), (0, jsx_runtime_1.jsxs)(material_1.Stack, { direction: "row", justifyContent: "space-between", alignItems: "center", children: [(0, jsx_runtime_1.jsx)(material_1.Typography, { variant: "body2", color: "text.secondary", children: "Payout Token" }), (0, jsx_runtime_1.jsxs)(material_1.Stack, { direction: "row", alignItems: "center", gap: 0.75, children: [payoutTokenLogoUrl && ((0, jsx_runtime_1.jsx)("img", { src: payoutTokenLogoUrl, alt: "USDC", style: { width: 16, height: 16, borderRadius: '50%' } })), (0, jsx_runtime_1.jsx)(material_1.Typography, { variant: "body2", fontWeight: "medium", children: "USDC" })] })] })] }) })] })), error && ((0, jsx_runtime_1.jsx)(material_1.Typography, { color: "error", variant: "caption", children: error })), txStatus && ((0, jsx_runtime_1.jsx)(material_1.Typography, { color: "primary", variant: "caption", children: txStatus })), (0, jsx_runtime_1.jsx)(material_1.Button, { variant: "contained", size: "large", fullWidth: true, onClick: handlePurchase, disabled: loading || !quote || !amount, sx: {
                                    py: 1.5,
                                    borderRadius: theme.inputBorderRadius / 4,
                                    background: quote
                                        ? theme.buttonGradient
                                        : undefined,
                                    color: theme.buttonTextColor || '#ffffff',
                                    '&:hover': {
                                        background: quote
                                            ? theme.buttonGradientHover
                                            : undefined,
                                    },
                                }, children: loading ? ((0, jsx_runtime_1.jsx)(material_1.CircularProgress, { size: 24, color: "inherit" })) : quote ? ('Confirm Transaction') : ('Enter amount to get quote') })] })) : (
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
exports.BuyCoverModal = BuyCoverModal;
