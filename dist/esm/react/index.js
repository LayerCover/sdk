/**
 * LayerCover SDK - React Components
 *
 * Import ready-to-use React components and hooks for integrating LayerCover
 * into any React application.
 *
 * @example
 * ```tsx
 * import { BuyCoverModal, useLayerCover, createTheme } from '@layercover/sdk/react';
 * ```
 */
export { BuyCoverModal } from './components/BuyCoverModal';
export { CoverButton } from './components/CoverButton';
export { useLayerCover } from './hooks/useLayerCover';
export { defaultTheme, createTheme, 
// Preset themes
lightTheme, darkTheme, aaveTheme, eulerTheme, compoundTheme, carbonTheme, presetThemes, } from './theme';
