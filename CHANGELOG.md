# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] - 2026-02-08

### Added

- **Configurable Debug Logger**: SDK output is now silent by default
  - `options.debug: true` enables console output
  - Supply a custom `SDKLogger` for structured logging
  - Exports `SDKLogger` interface for TypeScript consumers

### Fixed

- **Premium Calculation Consistency**: `purchase()` now uses the canonical `calculatePremium()` method instead of local constants (was using 365.25 days; now unified to 365 days)
- **Policy ID Extraction**: `purchase()` now uses proper `PolicyCreated`/`IntentMatched` event parsing instead of blindly reading the first indexed topic from receipt logs
- **Mainnet Zero-Address Trap**: Removed hardcoded `0x000...` addresses for Base Mainnet that would silently fail; SDK now throws on unsupported chains
- **BuyCoverModal Deprecated API**: Migrated from deprecated `Quote`/`getQuote()` to `FixedRateQuote`/`getFixedRateQuotes()` with `LayerCoverSDK.create()` factory

### Changed

- Peer dependencies updated: React ^17-19, MUI ^5-7, added `@emotion/react` and `@emotion/styled`
- All `console.log`/`console.warn` calls replaced with configurable logger

## [0.4.0] - 2026-01-20

### Added

- **Pool Discovery API**: Discover available coverage pools via API
  - `listPools()` - Fetch pools with category/chain filtering
  - `getQuotesWithPools()` - Combined pool + quote discovery
  - `getPoolByName()` / `getPoolById()` - Targeted pool lookup
  - Pool categories: `vault_cover`, `stablecoin_depeg`, `parametric`
- **Policy Lifecycle Management**: Full policy CRUD operations
  - `getMyPolicies()` - List wallet's policies (API + on-chain fallback)
  - `getPolicyDetails()` - Get detailed policy info by ID
  - `isPolicyActive()` - Check active status on-chain
  - `prepareCancelCoverTx()` / `prepareLapsePolicyTx()` - Lifecycle transactions
- **Quote Watching**: Live quote monitoring with automatic refresh
  - `watchQuotes()` - Returns cleanup function, configurable interval
  - Built-in expiration and status filtering
- **Quote Utilities**: Static helpers for quote evaluation
  - `isQuoteExpired()`, `sortQuotesByRate()`, `filterActiveQuotes()`
- **Viem/Wagmi Adapter**: First-class support for viem wallet clients
  - `ViemAdapter.fromWalletClient()` / `fromPublicClient()`
- **Pool Metadata**: On-chain token resolution
  - `getPoolMetadata()` - Returns token symbol, decimals, logo URLs

### Changed

- `useLayerCover` hook now supports pool discovery and `refreshIntervalMs` option
- `calculateNetYield()` promoted to static helper

## [0.3.0] - 2026-01-05

### Added

- **Dynamic Contract Configuration**: SDK now fetches contract addresses from API
  - `LayerCoverSDK.create()` - Factory method that auto-fetches configuration
  - `LayerCoverSDK.fetchConfig()` - Fetch configuration without creating instance
  - Configuration is cached for 5 minutes
- Fallback to hardcoded addresses if API is unreachable

### Changed

- Updated README with recommended initialization using `create()` method

## [0.2.0] - 2026-01-05

### Added

- **Quote Submission for Underwriters**: Syndicates can now programmatically submit coverage quotes
  - `submitQuote()` - Submit a new coverage quote with EIP-712 signatures
  - `cancelQuote()` - Cancel an existing quote
  - `getSyndicateQuotes()` - Get all quotes for a syndicate
  - `getSyndicateExposure()` - Get total quoted exposure
- API documentation for programmatic underwriting

### Changed

- Updated README with quote submission documentation
- Added `.npmignore` for cleaner npm publishing

## [0.1.0] - 2025-12-28

### Added

- Initial release
- Fixed-rate quote system (`getFixedRateQuotes()`, `refreshQuote()`)
- Purchase methods (`purchase()`, `purchaseWithIntent()`, `prepareBuyFromQuoteTx()`)
- Premium calculation utilities (`calculatePremium()`, `calculateNetYield()`)
- React hook (`useLayerCover`)
- React components (`CoverButton`, `BuyCoverModal`)
- Error classes (`RateTooHighError`, `NoQuotesAvailableError`)
- Support for Base Sepolia testnet
