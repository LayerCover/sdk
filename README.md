# @layercover/sdk

The official SDK for integrating [LayerCover](https://layercover.com) decentralized insurance into any application.

## Install

```bash
npm install @layercover/sdk ethers
```

**Optional peer dependencies** (for React components):

```bash
npm install @mui/material @mui/icons-material @emotion/react @emotion/styled react
```

**Using viem/wagmi** instead of ethers? No extra install needed — the adapter is built in.

## Quick Start

### 3-Line React Widget

```tsx
import { CoverButton } from '@layercover/sdk/react';

<CoverButton signer={signer} poolId={1} />
```

### Headless SDK

```ts
import { LayerCoverSDK } from '@layercover/sdk';

// Auto-configure from API (recommended)
const sdk = await LayerCoverSDK.create(signer);

// Browse pools
const pools = await sdk.listPools();

// Get quotes & purchase
const quotes = await sdk.getActiveQuotes(pools[0].poolId);
const result = await sdk.purchase(pools[0].poolId, coverAmount, durationWeeks);
```

### Viem / Wagmi

```ts
import { LayerCoverSDK, ViemAdapter } from '@layercover/sdk';

const signer = ViemAdapter.fromWalletClient(walletClient);
const sdk = await LayerCoverSDK.create(signer);
```

## API Reference

### Pool Discovery

| Method | Description |
|--------|-------------|
| `sdk.listPools(options?)` | List all coverage pools with metadata. Filter by `category`, `type`, or `onlyWithCoverage` |
| `sdk.getPool(poolId)` | Get a single pool by ID |
| `sdk.getQuotesWithPools(options?)` | Pools enriched with their best available quote in a single call |
| `sdk.getPoolMetadata(poolId)` | Full on-chain pool metadata including token info |
| `sdk.getPaymentToken(poolId)` | Payment token address for a pool (usually USDC) |

### Quotes

| Method | Description |
|--------|-------------|
| `sdk.getFixedRateQuotes(poolId)` | All available fixed-rate quotes, sorted by rate |
| `sdk.getActiveQuotes(poolId)` | Only active (non-expired) quotes, sorted by rate |
| `sdk.isQuoteExpired(quote)` | Check if a quote has expired |
| `sdk.sortQuotesByRate(quotes)` | Sort quotes by premium rate (cheapest first) |
| `sdk.refreshQuote(quoteId, amount, durationSecs)` | Get a fresh reservation (valid ~10 minutes) |
| `sdk.getBestRate(poolId)` | Best (lowest) **active** rate available in basis points |
| `sdk.watchQuotes(poolId, callback, options?)` | Live quote stream with auto-refresh. Returns unsubscribe function |

### Premium Calculation

```ts
const premium = sdk.calculatePremium(
  coverageAmount,   // bigint (in token smallest units)
  rateBps,          // e.g., 500 = 5% annual
  durationSeconds
);
```

### Purchase

| Method | Description |
|--------|-------------|
| `sdk.purchase(poolId, amount, weeks, maxRateBps?, referralCode?)` | **Simplified** — auto-picks the best quote and path |
| `sdk.purchaseWithIntent(quote, amount, durationSecs, referralCode?)` | Intent-based purchase with approval + matching |
| `sdk.prepareBuyFromQuoteTx(orderId, amount, durationSecs, referralCode?)` | Prepare TX for on-chain sell orders |
| `sdk.prepareApprovalTx(poolId, amount)` | Prepare an ERC-20 approval for premium |

### Policy Management

```ts
// List all policies for a wallet
const policies = await sdk.getMyPolicies('0xabc...');
const active = policies.filter(p => p.isActive);

// Get details for a specific policy
const policy = await sdk.getPolicyDetails(42);
console.log(`Coverage: ${policy.coverage}, Status: ${policy.status}`);

// Cancel an active policy (may incur penalty)
const cancelTx = await sdk.prepareCancelCoverTx(42);
await signer.sendTransaction(cancelTx);

// Lapse an expired policy and claim remaining premium
const lapseTx = await sdk.prepareLapsePolicyTx(42);
await signer.sendTransaction(lapseTx);
```

| Method | Description |
|--------|-------------|
| `sdk.getMyPolicies(ownerAddress)` | All policies owned by an address (newest first) |
| `sdk.getPolicyDetails(policyId)` | Full on-chain policy details |
| `sdk.isPolicyActive(policyId)` | Check if a policy is currently active |
| `sdk.prepareCancelCoverTx(policyId)` | Prepare a cancellation transaction |
| `sdk.prepareLapsePolicyTx(policyId)` | Prepare a lapse transaction for an expired policy |

## For Underwriters (Programmatic Quoting)

Syndicates can submit, manage, and cancel coverage quotes on the orderbook — no UI required:

```ts
// Submit a quote (handles EIP-712 signing automatically)
const result = await sdk.submitQuote({
  poolId: 1,
  syndicateAddress: '0xYourSyndicate...',
  coverageAmount: ethers.parseUnits('10000', 6),
  premiumRateBps: 500,   // 5% annual
  minDurationWeeks: 4,
  maxDurationWeeks: 12,
});
console.log('Quote live:', result.quoteId);

// Monitor exposure
const exposure = await sdk.getSyndicateExposure('0xYourSyndicate...');

// List & cancel quotes
const quotes = await sdk.getSyndicateQuotes('0xYourSyndicate...');
await sdk.cancelQuote(result.quoteId);
```

| Method | Description |
|--------|-------------|
| `sdk.submitQuote(params)` | Submit a signed quote to the orderbook |
| `sdk.getSyndicateQuotes(address, includeClosed?)` | List quotes for a syndicate |
| `sdk.getSyndicateExposure(address)` | Total quoted exposure and active quote count |
| `sdk.cancelQuote(quoteId)` | Cancel an active quote |

See [`examples/submit-quote.js`](examples/submit-quote.js) for a runnable script.

## Error Handling

The SDK provides structured error translation for on-chain reverts, wallet rejections, and network issues:

```ts
try {
  await sdk.purchase(1, amount, 4);
} catch (err) {
  const msg = LayerCoverSDK.getHumanError(err);
  // "Insufficient pool capacity. Try a smaller amount or shorter duration."
  // "Transaction was rejected by the user."
  // "Insufficient funds for gas fees. Please add ETH to your wallet."
  showToast(msg);
}
```

You can also import the error map directly for custom handling:

```ts
import { ERROR_MESSAGES, getHumanError } from '@layercover/sdk';

// ERROR_MESSAGES maps 4-byte selectors to user-friendly strings
const selector = '0xa4264d34';
console.log(ERROR_MESSAGES[selector]);
// "Insufficient pool capacity. Try a smaller amount or shorter duration."
```

Custom error classes are available for specific scenarios:

- `RateTooHighError` — thrown when no quote meets the `maxRateBps` constraint
- `NoQuotesAvailableError` — thrown when a pool has no active quotes

## React Hooks & Components

```tsx
import { useLayerCover, BuyCoverModal, CoverButton } from '@layercover/sdk/react';
```

- **`<CoverButton>`** — Drop-in button that opens a purchase modal
- **`<BuyCoverModal>`** — Standalone modal with pool picker, quotes, and purchase flow
- **`useLayerCover()`** — Hook with live quotes, pool discovery, and purchase

## Configuration

The SDK auto-discovers contract addresses via the `/api/config` endpoint. You can override defaults:

```ts
const sdk = await LayerCoverSDK.create(signer, {
  apiBaseUrl: 'https://your-deployment.com',  // Default: https://app.layercover.com
  chainId: 84532,                              // Default: Base Sepolia (84532)
  deployment: 'base_sepolia_usdc',             // Default: auto-detected
  requestTimeoutMs: 15_000,                    // Default: 15000
  maxRetries: 2,                               // Default: 2 (idempotent API calls)
  retryDelayMs: 300,                           // Default: 300 (exponential backoff base)
  txConfirmations: 1,                          // Default: 1
  txWaitTimeoutMs: 180_000,                    // Default: 180000
});
```

Or construct manually with known addresses:

```ts
const sdk = new LayerCoverSDK(signer, policyManagerAddress, {
  intentOrderBookAddress: '0x...',
  apiBaseUrl: 'http://localhost:3001',
  requestTimeoutMs: 20_000,
  maxRetries: 1,
  txConfirmations: 2,
});
```

Referral code note:
`purchase(...)` and `prepareBuyFromQuoteTx(...)` expect `referralCode` as bytes32 hex (`0x` + 64 hex chars).

## Testnet Smoke Test

From `packages/sdk`:

```bash
# Safe mode (no tx sent): create -> listPools -> getBestRate -> purchase prechecks
yarn smoke:testnet

# Live transaction mode (sends tx)
PRIVATE_KEY=0x... yarn smoke:testnet:execute
```

Script:
- `examples/smoke-testnet.js`

Common options:

```bash
node examples/smoke-testnet.js --dry-run --pool-id=1 --amount-usdc=25 --weeks=4
node examples/smoke-testnet.js --execute --pool-id=1 --amount-usdc=25 --weeks=4 --max-rate-bps=700
```

## Documentation

Full docs at [docs.layercover.com/sdk](https://docs.layercover.com/sdk).

## License

MIT
