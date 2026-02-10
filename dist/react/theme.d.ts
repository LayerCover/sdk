/**
 * LayerCover SDK - Theme System
 *
 * Allows partners to customize the visual appearance of the BuyCoverModal
 * to match their application's branding.
 */
export interface BuyCoverTheme {
    /** Background color of the modal dialog */
    backgroundColor: string;
    /** Border radius of the modal (in pixels) */
    borderRadius: number;
    /** Primary accent color (tabs, active states) */
    primaryColor: string;
    /** Main text color */
    textColor: string;
    /** Secondary/muted text color */
    textSecondaryColor: string;
    /** Border/divider color */
    borderColor: string;
    /** Primary button background gradient */
    buttonGradient: string;
    /** Primary button hover gradient */
    buttonGradientHover: string;
    /** Primary button text color (default: white) */
    buttonTextColor: string;
    /** Background color of input fields */
    inputBackgroundColor: string;
    /** Border radius of inputs (in pixels) */
    inputBorderRadius: number;
    /** Background color for info alerts */
    infoBackgroundColor: string;
    /** Border color for info alerts */
    infoBorderColor: string;
    /** Background color for accordion items */
    accordionBackgroundColor: string;
    /** Background color for expanded accordion items */
    accordionExpandedBackgroundColor: string;
}
/**
 * Default LayerCover theme with blue gradient accents
 */
export declare const defaultTheme: BuyCoverTheme;
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
export declare function createTheme(overrides: Partial<BuyCoverTheme>): BuyCoverTheme;
/**
 * Light mode theme - clean and bright with blue accents
 * Best for applications with light backgrounds
 */
export declare const lightTheme: BuyCoverTheme;
/**
 * Dark mode theme - sleek and modern
 * LayerCover's signature purple gradient style
 */
export declare const darkTheme: BuyCoverTheme;
/**
 * Aave theme - matches Aave's dark navy color scheme
 * Features: Deep navy background, teal/cyan accents, green highlights
 */
export declare const aaveTheme: BuyCoverTheme;
/**
 * Euler theme - matches Euler's dark teal color scheme
 * Features: Deep teal background, cyan/mint accents, rounded corners
 */
export declare const eulerTheme: BuyCoverTheme;
/**
 * Compound theme - matches Compound's green color scheme
 * Features: Dark background with signature Compound green
 */
export declare const compoundTheme: BuyCoverTheme;
/**
 * Carbon theme - dark charcoal with blue accents
 * Features: Clean modern dark UI with blue button and slider
 */
export declare const carbonTheme: BuyCoverTheme;
/**
 * All available preset themes
 */
export declare const presetThemes: {
    readonly default: BuyCoverTheme;
    readonly light: BuyCoverTheme;
    readonly dark: BuyCoverTheme;
    readonly aave: BuyCoverTheme;
    readonly euler: BuyCoverTheme;
    readonly compound: BuyCoverTheme;
    readonly carbon: BuyCoverTheme;
};
export type PresetThemeName = keyof typeof presetThemes;
//# sourceMappingURL=theme.d.ts.map