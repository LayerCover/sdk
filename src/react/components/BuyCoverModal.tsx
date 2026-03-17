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
import { formatUnits, parseUnits } from 'ethers-v6';
import { LayerCoverSDK, FixedRateQuote, PoolMetadata } from '../../index';
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
    /** Optional deployment identifier (for example, `avalanche_fuji_usdc`) */
    deployment?: string;
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
 * Decode error message from contract revert.
 * Delegates to the centralized error module.
 */
import { getHumanError as decodeError } from '../../errors';

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
    deployment,
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

    // SDK instance — created once from signer, auto-resolves contract addresses
    const [sdk, setSdk] = useState<LayerCoverSDK | null>(null);
    const [chainError, setChainError] = useState<string>('');

    useEffect(() => {
        const initSdk = async () => {
            if (!open) return;
            if (!signer) {
                setSdk(null);
                setChainError('Wallet not connected');
                return;
            }
            try {
                const instance = await LayerCoverSDK.create(signer, { apiBaseUrl, deployment });
                setSdk(instance);
                setChainError('');
            } catch (e: any) {
                console.error('Failed to initialize SDK:', e);
                const message = e?.message || 'Unsupported network';
                setSdk(null);
                setChainError(message);
                setError(message);
            }
        };
        initSdk();
    }, [open, signer, apiBaseUrl, deployment]);

    const [activeTab, setActiveTab] = useState(0);
    const [amount, setAmount] = useState('');
    const [weeks, setWeeks] = useState(4);
    const [bestQuote, setBestQuote] = useState<FixedRateQuote | null>(null);
    const [estimatedPremium, setEstimatedPremium] = useState<bigint | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [txStatus, setTxStatus] = useState('');
    const [poolMetadata, setPoolMetadata] = useState<PoolMetadata | null>(null);
    const [metadataLoading, setMetadataLoading] = useState(false);

    // Derived values from pool metadata
    const tokenSymbol = poolMetadata?.tokenSymbol || '';
    const tokenDecimals = poolMetadata?.tokenDecimals || 6;
    const tokenLogoUrl = poolMetadata?.tokenLogoUrl;
    const payoutTokenSymbol = poolMetadata?.payoutTokenSymbol || 'USDC';
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
            setBestQuote(null);
            setEstimatedPremium(null);
            setActiveTab(0);
            setMetadataLoading(true);
        }
    }, [open]);

    // Fetch pool metadata when modal opens
    useEffect(() => {
        const fetchMetadata = async () => {
            if (!open) {
                setMetadataLoading(false);
                return;
            }
            if (!sdk) {
                if (chainError) setMetadataLoading(false);
                return;
            }
            setMetadataLoading(true);
            try {
                const metadata = await sdk.getPoolMetadata(poolId);
                setPoolMetadata(metadata);
            } catch (e: any) {
                console.warn('Failed to fetch pool metadata:', e);
                setPoolMetadata(null);
            } finally {
                setMetadataLoading(false);
            }
        };
        fetchMetadata();
    }, [open, sdk, poolId, chainError]);

    // Auto-fetch quote when amount or weeks change
    useEffect(() => {
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
                    .filter(q => q.status === 'active' && !LayerCoverSDK.isQuoteExpired(q))
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
                const amountBigInt = parseUnits(amount, tokenDecimals);
                const durationSeconds = weeks * 7 * 24 * 60 * 60;
                const premium = sdk.calculatePremium(amountBigInt, best.premiumRateBps, durationSeconds);
                setEstimatedPremium(premium);
                setError('');
            } catch (e: any) {
                console.error(e);
                setBestQuote(null);
                setEstimatedPremium(null);
                const decoded = decodeError(e);
                if (decoded !== 'Transaction was rejected by user.') {
                    setError(decoded);
                }
            }
        };

        const debounce = setTimeout(fetchQuote, 500);
        return () => clearTimeout(debounce);
    }, [amount, weeks, sdk, poolId, tokenDecimals]);

    const handlePurchase = async () => {
        if (!sdk || !bestQuote) return;
        setLoading(true);
        setTxStatus('Purchasing...');

        try {
            const amountBigInt = parseUnits(amount, tokenDecimals);

            // Use the unified purchase method which handles both on-chain and intent-based purchases
            const result = await sdk.purchase(
                poolId,
                amountBigInt,
                weeks,
                undefined, // maxRateBps - let it use best available
                referralCode
            );

            setTxStatus('Success! Cover purchased.');
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
                    ) : chainError ? (
                        <Alert severity="error">{chainError}</Alert>
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
                                        Enter the amount of {tokenSymbol ? `${tokenSymbol} ` : ''}cover
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
                            {bestQuote && estimatedPremium !== null && (
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
                                                    {(bestQuote.premiumRateBps / 100).toFixed(2)}% APY
                                                </Typography>
                                            </Stack>
                                            <Stack direction="row" justifyContent="space-between">
                                                <Typography variant="body2" color="text.secondary">
                                                    Estimated Cost ({weeks}w)
                                                </Typography>
                                                <Typography variant="body2" fontWeight="medium">
                                                    {formatUnits(estimatedPremium, tokenDecimals)}{' '}
                                                    {payoutTokenSymbol}
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
                                                        {amount} {tokenSymbol}
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
                                                            alt={payoutTokenSymbol}
                                                            style={{ width: 16, height: 16, borderRadius: '50%' }}
                                                        />
                                                    )}
                                                    <Typography variant="body2" fontWeight="medium">
                                                        {payoutTokenSymbol}
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
                                disabled={loading || !bestQuote || !amount}
                                sx={{
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
                                }}
                            >
                                {loading ? (
                                    <CircularProgress size={24} color="inherit" />
                                ) : bestQuote ? (
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
