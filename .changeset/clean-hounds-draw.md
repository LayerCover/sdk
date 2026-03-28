---
'@layercover/sdk': minor
---

Align the SDK with the live QuoteBook purchase flow and remove legacy buyer APIs.

- add `getBestExecutableQuote()` and `preparePurchase()` for executable-quote selection, blocker reporting, and prepared approval/purchase transactions
- route buyer React helpers through the same preflight path so the displayed quote matches the executable transaction
- remove legacy intent-based buyer and quote-management methods from the SDK surface
- update docs and examples to use `ethereum_sepolia_usdc` and the `preparePurchase()` happy path
