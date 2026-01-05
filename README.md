# LayerCover SDK Integration Guide

This SDK allows you to natively integrate LayerCover insurance into your dApp. Users can purchase fixed-rate cover for their deposits directly within your UI.

## 1. Installation

```bash
npm install @layercover/sdk ethers
```

## 2. Integration Flow

### Import & Initialize

```typescript
import { LayerCoverSDK } from '@layercover/sdk';
import { ethers } from 'ethers';

// 1. Setup Provider/Signer
const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();

// 2. Initialize SDK (Recommended: Auto-fetch configuration)
const sdk = await LayerCoverSDK.create(signer, { chainId: 84532 });

// Alternative: Manual initialization with specific addresses
// const sdk = new LayerCoverSDK(signer, policyManagerAddress, {
//     apiBaseUrl: 'https://app.layercover.com',
//     deployment: 'base_sepolia_usdc',
//     chainId: 84532,
// });
```

> **Note:** The `LayerCoverSDK.create()` method automatically fetches the latest
> contract addresses from the API, so you never need to update hardcoded addresses.

### Steps to Purchase (Fixed-Rate)

The purchase flow consists of 4 steps: **Fetch Quotes** -> **Select Quote** -> **Approve** -> **Buy**.

```typescript
// A. Fetch Available Quotes
const poolId = 1; // Pool ID for your protocol
const quotes = await sdk.getFixedRateQuotes(poolId);

if (quotes.length === 0) {
    console.log("No quotes available from underwriters");
    return;
}

// B. Select Best Quote (sorted by rate, lowest first)
const bestQuote = quotes[0];
console.log(`Best rate: ${bestQuote.premiumRateBps / 100}% from ${bestQuote.syndicateName}`);

// C. Calculate Premium
const coverAmount = ethers.parseUnits("1000", 6); // 1000 USDC
const durationWeeks = 4;
const durationSeconds = durationWeeks * 7 * 24 * 60 * 60;
const premium = sdk.calculatePremium(coverAmount, bestQuote.premiumRateBps, durationSeconds);

// D. Approve & Purchase
const approveTx = await sdk.prepareApprovalTx(poolId, premium);
await signer.sendTransaction(approveTx);

// E. Purchase (simplified method)
const result = await sdk.purchase(poolId, coverAmount, durationWeeks);
console.log(`Cover Purchased! TX: ${result.txHash}`);
if (result.policyId) {
    console.log(`Policy ID: ${result.policyId}`);
}
```

### Alternative: Direct Order Purchase

If a quote has an on-chain sell order, you can use the simpler path:

```typescript
if (bestQuote.orderId) {
    const purchaseTx = await sdk.prepareBuyFromQuoteTx(
        bestQuote.orderId,
        coverAmount,
        durationSeconds
    );
    await signer.sendTransaction(purchaseTx);
}
```

## 3. Displaying "Net APY"

You can use the helper to show users their "Insured APY".

```typescript
const baseApy = 8.0; // Your protocol's APY (e.g., 8%)
const { netApy } = LayerCoverSDK.calculateNetYield(baseApy, bestQuote.premiumRateBps);

console.log(`Base APY: ${baseApy}%`);
console.log(`Insured APY: ${netApy.toFixed(2)}%`); // e.g., "5.00%"
```

## 4. React Hook

For React applications, use the provided hook:

```tsx
import { useLayerCover } from '@layercover/sdk/react';

function CoverageWidget({ signer, poolId }) {
    const {
        quotes,
        selectedQuote,
        bestRate,
        loading,
        error,
        fetchQuotes,
        selectQuote,
        calculatePremium,
        purchase,
        txStatus,
    } = useLayerCover({
        signer,
        policyManagerAddress: '0x...',
        poolId,
        decimals: 6,
    });

    const handlePurchase = async () => {
        const result = await purchase('1000', 4); // 1000 USDC, 4 weeks
        if (result) {
            console.log('Purchased!', result.policyId);
        }
    };

    return (
        <div>
            {bestRate && <p>Best Rate: {bestRate / 100}%</p>}
            <button onClick={handlePurchase} disabled={loading}>
                {txStatus || 'Buy Cover'}
            </button>
            {error && <p style={{color: 'red'}}>{error}</p>}
        </div>
    );
}
```

## 5. Quote Structure

Each `FixedRateQuote` contains:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique quote identifier |
| `poolId` | number | Risk pool ID |
| `syndicateAddress` | string | Underwriter wallet address |
| `syndicateName` | string | Human-readable underwriter name |
| `coverageAmount` | string | Available coverage (BigInt as string) |
| `premiumRateBps` | number | Rate in basis points (500 = 5%) |
| `minDurationWeeks` | number | Minimum coverage duration |
| `maxDurationWeeks` | number | Maximum coverage duration |
| `orderId` | number? | On-chain sell order ID if posted |

## 6. Error Handling

```typescript
import { RateTooHighError, NoQuotesAvailableError } from '@layercover/sdk';

try {
    // Pass maxRateBps to fail if rate exceeds limit
    await sdk.purchase(poolId, amount, weeks, 500); // max 5%
} catch (e) {
    if (e instanceof RateTooHighError) {
        console.error(`Rate ${e.rate} bps exceeds max ${e.maxRate} bps`);
    } else if (e instanceof NoQuotesAvailableError) {
        console.error("No underwriter quotes available for this pool");
    }
}
```

## 7. Contract Addresses

| Chain | PolicyManager | IntentOrderBook |
|-------|--------------|-----------------|
| Base Sepolia (84532) | `0x33807f8c7b35E7233e33aFCDB6b3fea0C535c015` | `0x6952Df9bf4615b73B005C79AB19FD53385eD96ae` |

## Migration from Variable-Rate

> ⚠️ **Breaking Change**: The protocol has transitioned to 100% fixed-rate coverage.

The following methods are deprecated:

- `getQuote()` → Use `getFixedRateQuotes()`
- `preparePurchaseTx()` → Use `prepareBuyFromQuoteTx()` or `purchase()`

See [migration guide](https://docs.layercover.com/sdk-migration) for details.

## 8. Quote Submission (For Underwriters)

Syndicates can programmatically submit coverage quotes:

```typescript
import { LayerCoverSDK } from '@layercover/sdk';
import { ethers } from 'ethers';

const signer = await provider.getSigner();
const sdk = new LayerCoverSDK(signer, policyManagerAddr, {
    apiBaseUrl: 'https://app.layercover.com',
    chainId: 84532,
});

// Submit a quote
const result = await sdk.submitQuote({
    poolId: 1,
    syndicateAddress: '0xYourSyndicateVault...',
    syndicateName: 'My Syndicate',
    coverageAmount: ethers.parseUnits('10000', 6), // 10,000 USDC
    premiumRateBps: 500, // 5% APY
    minDurationWeeks: 4,
    maxDurationWeeks: 12,
});

console.log('Quote submitted:', result.quoteId);

// Get syndicate exposure
const exposure = await sdk.getSyndicateExposure('0xYourSyndicateVault...');
console.log(`Total exposure: $${exposure.totalExposure}`);
console.log(`Active quotes: ${exposure.activeQuoteCount}`);

// Get all quotes for a syndicate
const quotes = await sdk.getSyndicateQuotes('0xYourSyndicateVault...');

// Cancel a quote
await sdk.cancelQuote(result.quoteId);
```

### Quote Submission Methods

| Method | Description |
|--------|-------------|
| `submitQuote(params)` | Submit a new coverage quote with EIP-712 signatures |
| `cancelQuote(quoteId)` | Cancel an existing quote |
| `getSyndicateQuotes(address)` | Get all quotes for a syndicate |
| `getSyndicateExposure(address)` | Get total quoted exposure |

## 9. Support

- **Documentation**: [docs.layercover.com](https://docs.layercover.com)
- **Discord**: [discord.gg/layercover](https://discord.gg/layercover)
- **GitHub Issues**: Report bugs or request features
