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

**Using viem/wagmi** instead of ethers? No extra install is needed because the adapter is built in.

## Quick Start

### 3-Line React Widget

```tsx
import { CoverButton } from '@layercover/sdk/react';

<CoverButton signer={signer} poolId={1} deployment="ethereum_sepolia_usdc" />
```

### Headless SDK

```ts
import { LayerCoverSDK } from '@layercover/sdk';

// Auto-configure from API for a specific deployment (recommended)
const sdk = await LayerCoverSDK.create(signer, {
  deployment: 'ethereum_sepolia_usdc',
});

// Browse pools
const pools = await sdk.listPools();

// Preflight the best executable quote
const amount = 25_000000n;
const preparation = await sdk.preparePurchase(pools[0].poolId, amount, 4);

if (preparation.blockers.length > 0) {
  throw new Error(preparation.blockers.map((blocker) => blocker.message).join(' '));
}

// Send approval only when needed, then send purchase
if (preparation.approvalTx) {
  await signer.sendTransaction(preparation.approvalTx);
}
await signer.sendTransaction(preparation.purchaseTx!);
```

### Viem / Wagmi

```ts
import { LayerCoverSDK, ViemAdapter } from '@layercover/sdk';

const signer = ViemAdapter.fromWalletClient(walletClient);
const sdk = await LayerCoverSDK.create(signer, {
  deployment: 'ethereum_sepolia_usdc',
});
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
| `sdk.getBestRate(poolId)` | Best (lowest) **active** rate available in basis points |
| `sdk.getBestExecutableQuote(poolId, amount, weeks, maxRateBps?)` | Cheapest active quote that can actually fill the requested purchase |
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
| `sdk.preparePurchase(poolId, amount, weeks, maxRateBps?, referralCode?)` | Returns the executable quote, blockers, and prepared approval/purchase txs |
| `sdk.preparePurchaseFromQuote(quote, amount, weeks, maxRateBps?, referralCode?)` | Preflight a specific selected quote without auto-switching to another quote |
| `sdk.refreshSelectedQuote(quote)` | Refresh a pinned quote against the latest active pool quotes |
| `sdk.revalidateQuoteForPurchase(quote, { maxAgeMs? })` | Revalidate a cached quote before execution if it may be stale |
| `sdk.purchase(poolId, amount, weeks, maxRateBps?, referralCode?)` | Buy coverage from the best executable QuoteBook quote |
| `sdk.purchaseQuote(quote, amount, weeks, maxRateBps?, referralCode?)` | Execute a specific selected QuoteBook quote |
| `sdk.prepareBuyFromQuoteTx(orderId, amount, durationSecs, referralCode?)` | Prepare a direct `PurchaseGateway.buy(...)` transaction |
| `sdk.prepareApprovalTx(poolId, amount)` | Prepare an ERC-20 approval for the `PurchaseGateway` |

Recommended buyer flow:

```ts
const preparation = await sdk.preparePurchase(poolId, coverAmount, 4);

if (preparation.blockers.length > 0) {
  console.error(preparation.blockers);
  return;
}

if (preparation.approvalTx) {
  await signer.sendTransaction(preparation.approvalTx);
}

await signer.sendTransaction(preparation.purchaseTx!);
```

If your UI lets the user pick an individual quote, pin execution to that quote:

```ts
const pinned = await sdk.preparePurchaseFromQuote(selectedQuote, coverAmount, 4);
if (pinned.status === 'approval_required' && pinned.approvalTx) {
  await signer.sendTransaction(pinned.approvalTx);
}
if (pinned.status === 'ready' || pinned.status === 'approval_required') {
  await signer.sendTransaction(pinned.purchaseTx);
}
```

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

## For Underwriters

| Method | Description |
|--------|-------------|
| `sdk.getSyndicateQuotes(address, includeClosed?)` | List quotes for a syndicate |
| `sdk.getSyndicateExposure(address)` | Total quoted exposure and active quote count |

Quote creation and cancellation are now on-chain QuoteBook responsibilities and are not exposed through this SDK.

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

- `RateTooHighError`: thrown when no quote meets the `maxRateBps` constraint
- `NoQuotesAvailableError`: thrown when a pool has no active quotes
- `PurchaseBlockedError`: thrown when quotes exist but none can fill the requested amount or duration
- `QuoteStaleError`: thrown when a selected quote is stale and no longer matches live liquidity
- `SignerRequiredError` / `ChainMismatchError`: thrown when execution prerequisites are missing

For observability, pass `onEvent` in SDK config to receive structured lifecycle events such as
`quotes_fetched`, `quote_revalidated`, `purchase_prepared`, `approval_submitted`,
`purchase_submitted`, `purchase_confirmed`, and `purchase_sync_succeeded`.

## React Hooks & Components

```tsx
import { useLayerCover, BuyCoverModal, CoverButton } from '@layercover/sdk/react';
```

- **`<CoverButton>`**: Drop-in button that opens a purchase modal
- **`<BuyCoverModal>`**: Standalone modal with pool picker, quotes, and purchase flow
- **`useLayerCover()`**: Hook with live quotes, pool discovery, and `preparePurchase()` preflight support

For multi-chain integrations, pass `deployment` explicitly to React helpers so the SDK resolves the correct network and contract set.

## Configuration

The SDK auto-discovers contract addresses via the `/api/config` endpoint. You can override defaults:

```ts
const sdk = await LayerCoverSDK.create(signer, {
  apiBaseUrl: 'https://your-deployment.com',  // Default: https://app.layercover.com
  chainId: 11155111,                           // Ethereum Sepolia
  deployment: 'ethereum_sepolia_usdc',         // Recommended explicit deployment
  requestTimeoutMs: 15_000,                    // Default: 15000
  maxRetries: 2,                               // Default: 2 (idempotent API calls)
  retryDelayMs: 300,                           // Default: 300 (exponential backoff base)
  txConfirmations: 1,                          // Default: 1
  txWaitTimeoutMs: 180_000,                    // Default: 180000
  onEvent: (event) => console.log(event.type, event.data),
});
```

Or construct manually with known addresses:

```ts
const sdk = new LayerCoverSDK(signer, policyManagerAddress, {
  purchaseGatewayAddress: '0x...',
  apiBaseUrl: 'http://localhost:3001',
  requestTimeoutMs: 20_000,
  maxRetries: 1,
  txConfirmations: 2,
});
```

Referral code note:
`purchase(...)` and `prepareBuyFromQuoteTx(...)` expect `referralCode` as bytes32 hex (`0x` + 64 hex chars).

## Testnet Smoke Test

From `sdk/`:

```bash
# Safe mode (no tx sent): create -> listPools -> getBestRate -> purchase prechecks
yarn smoke:testnet

# Live transaction mode (sends tx)
PRIVATE_KEY=0x... yarn smoke:testnet:execute
```

Script:
- `examples/smoke-testnet.js`
- `tests/e2e/local-purchase-flow.mjs`

Common options:

```bash
node examples/smoke-testnet.js --dry-run --pool-id=1 --amount-usdc=25 --weeks=4
node examples/smoke-testnet.js --execute --pool-id=1 --amount-usdc=25 --weeks=4 --max-rate-bps=700
```

Controlled local end-to-end harness:

```bash
npm run test:e2e:local
```

This runs the purchase flow inside Hardhat's in-process network, stubs `/api/config`, `/api/pools/list`, `/api/quotes/batch`, and `/api/purchase/sync` in memory, seeds a real QuoteBook quote, executes a real SDK purchase, and verifies the minted policy plus sync callback.

## Documentation

Full docs at [docs.layercover.com/sdk](https://docs.layercover.com/sdk).

## License

MIT
