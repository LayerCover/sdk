"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.presetThemes = exports.carbonTheme = exports.compoundTheme = exports.eulerTheme = exports.aaveTheme = exports.darkTheme = exports.lightTheme = exports.createTheme = exports.defaultTheme = exports.useLayerCover = exports.CoverButton = exports.BuyCoverModal = void 0;
var BuyCoverModal_1 = require("./components/BuyCoverModal");
Object.defineProperty(exports, "BuyCoverModal", { enumerable: true, get: function () { return BuyCoverModal_1.BuyCoverModal; } });
var CoverButton_1 = require("./components/CoverButton");
Object.defineProperty(exports, "CoverButton", { enumerable: true, get: function () { return CoverButton_1.CoverButton; } });
var useLayerCover_1 = require("./hooks/useLayerCover");
Object.defineProperty(exports, "useLayerCover", { enumerable: true, get: function () { return useLayerCover_1.useLayerCover; } });
var theme_1 = require("./theme");
Object.defineProperty(exports, "defaultTheme", { enumerable: true, get: function () { return theme_1.defaultTheme; } });
Object.defineProperty(exports, "createTheme", { enumerable: true, get: function () { return theme_1.createTheme; } });
// Preset themes
Object.defineProperty(exports, "lightTheme", { enumerable: true, get: function () { return theme_1.lightTheme; } });
Object.defineProperty(exports, "darkTheme", { enumerable: true, get: function () { return theme_1.darkTheme; } });
Object.defineProperty(exports, "aaveTheme", { enumerable: true, get: function () { return theme_1.aaveTheme; } });
Object.defineProperty(exports, "eulerTheme", { enumerable: true, get: function () { return theme_1.eulerTheme; } });
Object.defineProperty(exports, "compoundTheme", { enumerable: true, get: function () { return theme_1.compoundTheme; } });
Object.defineProperty(exports, "carbonTheme", { enumerable: true, get: function () { return theme_1.carbonTheme; } });
Object.defineProperty(exports, "presetThemes", { enumerable: true, get: function () { return theme_1.presetThemes; } });
