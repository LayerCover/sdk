# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
