"use strict";
/**
 * LayerCover SDK - Theme System
 *
 * Allows partners to customize the visual appearance of the BuyCoverModal
 * to match their application's branding.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.presetThemes = exports.carbonTheme = exports.compoundTheme = exports.eulerTheme = exports.aaveTheme = exports.darkTheme = exports.lightTheme = exports.createTheme = exports.defaultTheme = void 0;
/**
 * Default LayerCover theme with blue gradient accents
 */
exports.defaultTheme = {
    // Modal container
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    // Colors
    primaryColor: '#3b82f6',
    textColor: '#ffffff',
    textSecondaryColor: 'rgba(255, 255, 255, 0.7)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    // Button gradient
    buttonGradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
    buttonGradientHover: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
    buttonTextColor: '#ffffff',
    // Input styling
    inputBackgroundColor: 'rgba(255, 255, 255, 0.05)',
    inputBorderRadius: 8,
    // Info alert
    infoBackgroundColor: 'rgba(59, 130, 246, 0.1)',
    infoBorderColor: 'rgba(59, 130, 246, 0.3)',
    // FAQ accordion
    accordionBackgroundColor: 'rgba(255, 255, 255, 0.05)',
    accordionExpandedBackgroundColor: 'rgba(255, 255, 255, 0.08)',
};
/**
 * Create a custom theme by merging partial overrides with the default theme.
 *
 * @example
 * ```tsx
 * const myTheme = createTheme({
 *   backgroundColor: '#0a0a1a',
 *   buttonGradient: 'linear-gradient(135deg, #ff6b6b 0%, #ee5a5a 100%)',
 * });
 * ```
 */
function createTheme(overrides) {
    return {
        ...exports.defaultTheme,
        ...overrides,
    };
}
exports.createTheme = createTheme;
// ============================================================================
// EXAMPLE THEMES
// ============================================================================
/**
 * Light mode theme - clean and bright with blue accents
 * Best for applications with light backgrounds
 */
exports.lightTheme = {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    primaryColor: '#3b82f6',
    textColor: '#1a1a2e',
    textSecondaryColor: 'rgba(26, 26, 46, 0.6)',
    borderColor: 'rgba(0, 0, 0, 0.1)',
    buttonGradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
    buttonGradientHover: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
    buttonTextColor: '#ffffff',
    inputBackgroundColor: '#f0f7ff',
    inputBorderRadius: 12,
    infoBackgroundColor: 'rgba(59, 130, 246, 0.1)',
    infoBorderColor: 'rgba(59, 130, 246, 0.3)',
    accordionBackgroundColor: '#f8fafc',
    accordionExpandedBackgroundColor: '#f0f7ff',
};
/**
 * Dark mode theme - sleek and modern
 * LayerCover's signature purple gradient style
 */
exports.darkTheme = exports.defaultTheme;
/**
 * Aave theme - matches Aave's dark navy color scheme
 * Features: Deep navy background, teal/cyan accents, green highlights
 */
exports.aaveTheme = {
    backgroundColor: '#1b2030',
    borderRadius: 12,
    primaryColor: '#2EBAC6',
    textColor: '#ffffff',
    textSecondaryColor: 'rgba(255, 255, 255, 0.6)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    buttonGradient: 'linear-gradient(135deg, #ffffff 0%, #e5e7eb 100%)',
    buttonGradientHover: 'linear-gradient(135deg, #f3f4f6 0%, #d1d5db 100%)',
    buttonTextColor: '#1b2030',
    inputBackgroundColor: 'rgba(255, 255, 255, 0.04)',
    inputBorderRadius: 8,
    infoBackgroundColor: 'rgba(46, 186, 198, 0.1)',
    infoBorderColor: 'rgba(46, 186, 198, 0.3)',
    accordionBackgroundColor: 'rgba(255, 255, 255, 0.03)',
    accordionExpandedBackgroundColor: 'rgba(255, 255, 255, 0.06)',
};
/**
 * Euler theme - matches Euler's dark teal color scheme
 * Features: Deep teal background, cyan/mint accents, rounded corners
 */
exports.eulerTheme = {
    backgroundColor: '#0d1f23',
    borderRadius: 16,
    primaryColor: '#2dd4bf',
    textColor: '#ffffff',
    textSecondaryColor: 'rgba(255, 255, 255, 0.6)',
    borderColor: 'rgba(45, 212, 191, 0.2)',
    buttonGradient: 'linear-gradient(135deg, #2dd4bf 0%, #14b8a6 100%)',
    buttonGradientHover: 'linear-gradient(135deg, #26c4b0 0%, #0fa898 100%)',
    buttonTextColor: '#ffffff',
    inputBackgroundColor: 'rgba(45, 212, 191, 0.08)',
    inputBorderRadius: 12,
    infoBackgroundColor: 'rgba(45, 212, 191, 0.1)',
    infoBorderColor: 'rgba(45, 212, 191, 0.25)',
    accordionBackgroundColor: 'rgba(45, 212, 191, 0.05)',
    accordionExpandedBackgroundColor: 'rgba(45, 212, 191, 0.1)',
};
/**
 * Compound theme - matches Compound's green color scheme
 * Features: Dark background with signature Compound green
 */
exports.compoundTheme = {
    backgroundColor: '#0d1117',
    borderRadius: 12,
    primaryColor: '#00d395',
    textColor: '#ffffff',
    textSecondaryColor: 'rgba(255, 255, 255, 0.6)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    buttonGradient: 'linear-gradient(135deg, #00d395 0%, #00b380 100%)',
    buttonGradientHover: 'linear-gradient(135deg, #00c088 0%, #00a070 100%)',
    buttonTextColor: '#ffffff',
    inputBackgroundColor: 'rgba(255, 255, 255, 0.05)',
    inputBorderRadius: 8,
    infoBackgroundColor: 'rgba(0, 211, 149, 0.1)',
    infoBorderColor: 'rgba(0, 211, 149, 0.3)',
    accordionBackgroundColor: 'rgba(255, 255, 255, 0.03)',
    accordionExpandedBackgroundColor: 'rgba(255, 255, 255, 0.06)',
};
/**
 * Carbon theme - dark charcoal with blue accents
 * Features: Clean modern dark UI with blue button and slider
 */
exports.carbonTheme = {
    backgroundColor: '#1a1a1e',
    borderRadius: 12,
    primaryColor: '#3b82f6',
    textColor: '#ffffff',
    textSecondaryColor: 'rgba(255, 255, 255, 0.6)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    buttonGradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
    buttonGradientHover: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
    buttonTextColor: '#ffffff',
    inputBackgroundColor: 'rgba(255, 255, 255, 0.04)',
    inputBorderRadius: 8,
    infoBackgroundColor: 'rgba(234, 179, 8, 0.15)',
    infoBorderColor: 'rgba(234, 179, 8, 0.4)',
    accordionBackgroundColor: 'rgba(255, 255, 255, 0.03)',
    accordionExpandedBackgroundColor: 'rgba(255, 255, 255, 0.06)',
};
/**
 * All available preset themes
 */
exports.presetThemes = {
    default: exports.defaultTheme,
    light: exports.lightTheme,
    dark: exports.darkTheme,
    aave: exports.aaveTheme,
    euler: exports.eulerTheme,
    compound: exports.compoundTheme,
    carbon: exports.carbonTheme,
};
