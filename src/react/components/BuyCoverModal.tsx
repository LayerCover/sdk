import React, { useState, useEffect, useMemo } from 'react';
import { BuyCoverTheme, defaultTheme } from '../theme';
import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Alert,
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogContent,
    IconButton,
    InputAdornment,
    Slider,
    Stack,
    Tab,
    Tabs,
    TextField,
    Typography,
    createTheme as createMuiTheme,
    ThemeProvider,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { formatUnits, parseUnits } from 'ethers';
import { LayerCoverSDK, Quote, PoolMetadata, getPolicyManagerAddress, DEFAULT_CHAIN_ID } from '../../index';
import { LAYERCOVER_LOGO_DARK, LAYERCOVER_LOGO_LIGHT } from './logo';

// Helper to detect if a color is light (for logo selection)
function isLightColor(hexColor: string): boolean {
    const hex = hexColor.replace('#', '');
    if (hex.length !== 6) return false;
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    // Calculate perceived luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5;
}

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
        answer:
            'LayerCover is a decentralized insurance protocol that provides coverage for your DeFi positions. You can protect your supplied assets against smart contract risks, hacks, and other DeFi-related incidents.',
    },
    {
        question: 'How does coverage work?',
        answer:
            'When you purchase coverage, you pay a premium based on the amount and duration you want to protect. If a covered event occurs during your coverage period, you can file a claim to receive compensation.',
    },
    {
        question: 'What events are covered?',
        answer:
            'Coverage includes smart contract exploits, oracle failures, and protocol-specific risks. The exact coverage terms depend on the pool you purchase from.',
    },
    {
        question: 'How is the premium calculated?',
        answer:
            'Premiums are calculated based on the coverage amount, duration, and current market rates. The rate is expressed as an annual percentage (APY) of the covered amount.',
    },
    {
        question: 'How do I file a claim?',
        answer:
            'If a covered event occurs, visit the LayerCover app to file a claim. Claims are processed through a decentralized governance process to ensure fair outcomes.',
    },
];

/**
 * Known error selectors from LayerCover contracts
 */
const ERROR_SELECTORS: Record<string, string> = {
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
function decodeError(error: any): string {
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
export function BuyCoverModal({
    open,
    onClose,
    signer,
    poolId,
    availableBalance = 0,
    onSuccess,
    theme: themeOverrides,
    referralCode,
    apiBaseUrl,
}: BuyCoverModalProps) {
    // Merge custom theme with defaults
    const theme: BuyCoverTheme = useMemo(
        () => ({ ...defaultTheme, ...themeOverrides }),
        [themeOverrides]
    );

    // Create MUI theme from our custom theme
    const muiTheme = useMemo(
        () =>
            createMuiTheme({
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
            }),
        [theme]
    );

    // Resolve PolicyManager address from signer's chain
    const [policyManagerAddress, setPolicyManagerAddress] = useState<string>('');
    const [chainError, setChainError] = useState<string>('');

    useEffect(() => {
        const resolveAddress = async () => {
            if (!signer) return;
            try {
                const network = await signer.provider?.getNetwork();
                const chainId = network?.chainId ? Number(network.chainId) : DEFAULT_CHAIN_ID;
                const address = getPolicyManagerAddress(chainId);
                setPolicyManagerAddress(address);
                setChainError('');
            } catch (e: any) {
                console.error('Failed to resolve chain:', e);
                setChainError(e.message || 'Unsupported network');
            }
        };
        resolveAddress();
    }, [signer]);
    const [activeTab, setActiveTab] = useState(0);
    const [amount, setAmount] = useState('');
    const [weeks, setWeeks] = useState(4);
    const [quote, setQuote] = useState<Quote | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [txStatus, setTxStatus] = useState('');
    const [poolMetadata, setPoolMetadata] = useState<PoolMetadata | null>(null);
    const [metadataLoading, setMetadataLoading] = useState(true);

    // Derived values from pool metadata
    const tokenSymbol = poolMetadata?.tokenSymbol || '';
    const tokenDecimals = poolMetadata?.tokenDecimals || 6;
    const tokenLogoUrl = poolMetadata?.tokenLogoUrl;
    const payoutTokenLogoUrl = poolMetadata?.payoutTokenLogoUrl;

    const endDate = useMemo(() => {
        const date = new Date();
        date.setDate(date.getDate() + weeks * 7);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }, [weeks]);

    useEffect(() => {
        if (open) {
            setError('');
            setTxStatus('');
            setQuote(null);
            setActiveTab(0);
        }
    }, [open]);

    // Fetch pool metadata when modal opens
    useEffect(() => {
        const fetchMetadata = async () => {
            if (!open || !signer || !policyManagerAddress) {
                return;
            }
            setMetadataLoading(true);
            try {
                const sdk = new LayerCoverSDK(signer, policyManagerAddress, { apiBaseUrl });
                const metadata = await sdk.getPoolMetadata(poolId);
                setPoolMetadata(metadata);
            } catch (e: any) {
                console.error('Failed to fetch pool metadata:', e);
                setError('Failed to load pool information');
            } finally {
                setMetadataLoading(false);
            }
        };
        fetchMetadata();
    }, [open, signer, policyManagerAddress, poolId]);

    // Auto-fetch quote when amount or weeks change
    useEffect(() => {
        const fetchQuote = async () => {
            if (!signer || !amount || Number(amount) <= 0) {
                setQuote(null);
                return;
            }

            try {
                const sdk = new LayerCoverSDK(signer, policyManagerAddress, { apiBaseUrl });
                const amountBigInt = parseUnits(amount, tokenDecimals);
                const days = weeks * 7;
                const q = await sdk.getQuote(poolId, amountBigInt, days);
                setQuote(q);
                setError('');
            } catch (e: any) {
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
        if (!signer || !quote) return;
        setLoading(true);
        setTxStatus('Purchasing...');

        try {
            const sdk = new LayerCoverSDK(signer, policyManagerAddress, { apiBaseUrl });

            // Use the unified purchase method which handles both on-chain and intent-based purchases
            const result = await sdk.purchase(
                poolId,
                quote.amount,
                weeks,
                undefined, // maxRateBps - let it use best available
                referralCode
            );

            setTxStatus('Success! Cover purchased.');
            console.log('Purchase result:', result);
            onSuccess?.();
            setTimeout(onClose, 2000);
        } catch (e: any) {
            console.error(e);
            setTxStatus('');
            setError(decodeError(e));
        } finally {
            setLoading(false);
        }
    };

    const handleMaxClick = () => {
        setAmount(availableBalance.toString());
    };

    return (
        <ThemeProvider theme={muiTheme}>
            <Dialog
                open={open}
                onClose={onClose}
                maxWidth="xs"
                fullWidth
                PaperProps={{
                    sx: {
                        backgroundColor: theme.backgroundColor,
                        borderRadius: theme.borderRadius / 4,
                    },
                }}
            >
                {/* Header with tabs */}
                <Box sx={{ borderBottom: 1, borderColor: theme.borderColor, px: 2, pt: 1 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Tabs
                            value={activeTab}
                            onChange={(_, v) => setActiveTab(v)}
                            sx={{
                                '& .MuiTab-root': {
                                    textTransform: 'none',
                                    fontWeight: 'medium',
                                    minWidth: 'auto',
                                    px: 2,
                                },
                            }}
                        >
                            <Tab label="Purchase" />
                            <Tab label="How it works" />
                        </Tabs>
                        <IconButton onClick={onClose} size="small" sx={{ color: 'grey.500' }}>
                            <CloseIcon />
                        </IconButton>
                    </Stack>
                </Box>

                <DialogContent>
                    {metadataLoading ? (
                        /* Loading state */
                        <Box display="flex" justifyContent="center" alignItems="center" py={8}>
                            <CircularProgress />
                        </Box>
                    ) : activeTab === 0 ? (
                        /* Purchase Tab */
                        <Box display="flex" flexDirection="column" gap={5}>
                            {/* Amount Input */}
                            <Box>
                                <Stack direction="row" justifyContent="space-between" mb={1}>
                                    <Typography variant="body2" fontWeight="medium">
                                        Amount
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        Enter the amount of {tokenSymbol} cover
                                    </Typography>
                                </Stack>
                                <TextField
                                    value={amount}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAmount(e.target.value)}
                                    type="text"
                                    inputProps={{
                                        inputMode: 'decimal',
                                        pattern: '[0-9]*\\.?[0-9]*',
                                    }}
                                    fullWidth
                                    placeholder="0.00"
                                    InputProps={{
                                        endAdornment: (
                                            <InputAdornment position="end">
                                                <Stack direction="row" alignItems="center" gap={0.75}>
                                                    {tokenLogoUrl && (
                                                        <img
                                                            src={tokenLogoUrl}
                                                            alt={tokenSymbol}
                                                            style={{ width: 20, height: 20, borderRadius: '50%' }}
                                                        />
                                                    )}
                                                    <Typography fontWeight="bold">{tokenSymbol}</Typography>
                                                </Stack>
                                            </InputAdornment>
                                        ),
                                        sx: {
                                            fontSize: '1.5rem',
                                            backgroundColor: theme.inputBackgroundColor,
                                            borderRadius: theme.inputBorderRadius / 4,
                                        },
                                    }}
                                />
                                <Stack direction="row" justifyContent="space-between" mt={0.5}>
                                    <Typography variant="caption" color="text.secondary">
                                        ${(Number(amount) || 0).toFixed(2)}
                                    </Typography>
                                    <Stack direction="row" alignItems="center" gap={1}>
                                        <Typography variant="caption" color="text.secondary">
                                            Available: {availableBalance.toFixed(2)}
                                        </Typography>
                                        <Button
                                            size="small"
                                            variant="outlined"
                                            onClick={handleMaxClick}
                                            sx={{ minWidth: 'auto', px: 1, py: 0, fontSize: '0.7rem' }}
                                        >
                                            MAX
                                        </Button>
                                    </Stack>
                                </Stack>
                            </Box>

                            {/* Duration Slider */}
                            <Box>
                                <Stack direction="row" justifyContent="space-between" alignItems="baseline" mb={2}>
                                    <Typography variant="body2" fontWeight="medium">
                                        Coverage Duration
                                    </Typography>
                                    <Box textAlign="right">
                                        <Typography variant="h6" fontWeight="bold">
                                            {weeks} Week{weeks !== 1 ? 's' : ''}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            Ends {endDate}
                                        </Typography>
                                    </Box>
                                </Stack>
                                <Slider
                                    value={weeks}
                                    onChange={(_: Event, v: number | number[]) => setWeeks(v as number)}
                                    min={1}
                                    max={52}
                                    marks={WEEK_MARKS}
                                    sx={{
                                        color: theme.primaryColor,
                                        '& .MuiSlider-markLabel': {
                                            color: 'text.secondary',
                                            fontSize: '0.75rem',
                                        },
                                    }}
                                />
                            </Box>

                            {/* Transaction Overview */}
                            {quote && (
                                <Box>
                                    <Typography variant="body2" fontWeight="medium" mb={1}>
                                        Transaction overview
                                    </Typography>
                                    <Box
                                        sx={{
                                            backgroundColor: theme.inputBackgroundColor,
                                            borderRadius: theme.inputBorderRadius / 4,
                                            p: 2,
                                        }}
                                    >
                                        <Stack spacing={2}>
                                            <Stack direction="row" justifyContent="space-between">
                                                <Typography variant="body2" color="text.secondary">
                                                    Premium Rate
                                                </Typography>
                                                <Typography variant="body2" fontWeight="medium">
                                                    {(quote.rateBps / 100).toFixed(2)}% APY
                                                </Typography>
                                            </Stack>
                                            <Stack direction="row" justifyContent="space-between">
                                                <Typography variant="body2" color="text.secondary">
                                                    Estimated Cost ({weeks}w)
                                                </Typography>
                                                <Typography variant="body2" fontWeight="medium">
                                                    {formatUnits(quote.premium, tokenDecimals)} {tokenSymbol}
                                                </Typography>
                                            </Stack>
                                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                                                <Typography variant="body2" color="text.secondary">
                                                    Coverage Amount
                                                </Typography>
                                                <Stack direction="row" alignItems="center" gap={0.75}>
                                                    {tokenLogoUrl && (
                                                        <img
                                                            src={tokenLogoUrl}
                                                            alt={tokenSymbol}
                                                            style={{ width: 16, height: 16, borderRadius: '50%' }}
                                                        />
                                                    )}
                                                    <Typography variant="body2" fontWeight="medium">
                                                        {formatUnits(quote.amount, tokenDecimals)} {tokenSymbol}
                                                    </Typography>
                                                </Stack>
                                            </Stack>
                                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                                                <Typography variant="body2" color="text.secondary">
                                                    Payout Token
                                                </Typography>
                                                <Stack direction="row" alignItems="center" gap={0.75}>
                                                    {payoutTokenLogoUrl && (
                                                        <img
                                                            src={payoutTokenLogoUrl}
                                                            alt="USDC"
                                                            style={{ width: 16, height: 16, borderRadius: '50%' }}
                                                        />
                                                    )}
                                                    <Typography variant="body2" fontWeight="medium">
                                                        USDC
                                                    </Typography>
                                                </Stack>
                                            </Stack>
                                        </Stack>
                                    </Box>
                                </Box>
                            )}

                            {/* Error Display */}
                            {error && (
                                <Typography color="error" variant="caption">
                                    {error}
                                </Typography>
                            )}

                            {/* Status Display */}
                            {txStatus && (
                                <Typography color="primary" variant="caption">
                                    {txStatus}
                                </Typography>
                            )}

                            {/* Confirm Button */}
                            <Button
                                variant="contained"
                                size="large"
                                fullWidth
                                onClick={handlePurchase}
                                disabled={loading || !quote || !amount}
                                sx={{
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
                                }}
                            >
                                {loading ? (
                                    <CircularProgress size={24} color="inherit" />
                                ) : quote ? (
                                    'Confirm Transaction'
                                ) : (
                                    'Enter amount to get quote'
                                )}
                            </Button>
                        </Box>
                    ) : (
                        /* How it works Tab */
                        <Box display="flex" flexDirection="column" gap={1.5}>
                            {FAQ_ITEMS.map((item, index) => (
                                <Accordion
                                    key={index}
                                    disableGutters
                                    elevation={0}
                                    sx={{
                                        backgroundColor: theme.accordionBackgroundColor,
                                        borderRadius: `${theme.inputBorderRadius}px !important`,
                                        '&:before': { display: 'none' },
                                        '&.Mui-expanded': {
                                            backgroundColor: theme.accordionExpandedBackgroundColor,
                                        },
                                    }}
                                >
                                    <AccordionSummary
                                        expandIcon={
                                            <ExpandMoreIcon sx={{ color: 'text.secondary' }} />
                                        }
                                        sx={{ px: 2, py: 0.5 }}
                                    >
                                        <Typography variant="body2" fontWeight="600">
                                            {item.question}
                                        </Typography>
                                    </AccordionSummary>
                                    <AccordionDetails sx={{ px: 2, pb: 2, pt: 0 }}>
                                        <Typography
                                            variant="body2"
                                            color="text.secondary"
                                            sx={{ lineHeight: 1.6 }}
                                        >
                                            {item.answer}
                                        </Typography>
                                    </AccordionDetails>
                                </Accordion>
                            ))}
                        </Box>
                    )}
                </DialogContent>

                {/* Powered by LayerCover footer */}
                <Box
                    component="a"
                    href={`https://app.layercover.com/cover/${poolId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{
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
                    }}
                >
                    <Typography variant="caption" color="text.secondary">
                        Powered by
                    </Typography>
                    <Box
                        component="img"
                        src={isLightColor(theme.backgroundColor) ? LAYERCOVER_LOGO_LIGHT : LAYERCOVER_LOGO_DARK}
                        alt="LayerCover"
                        onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
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
                        }}
                        sx={{
                            height: 24,
                            objectFit: 'contain',
                        }}
                    />
                    <OpenInNewIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                </Box>
            </Dialog>
        </ThemeProvider>
    );
}
