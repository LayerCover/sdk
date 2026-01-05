const { LayerCoverSDK } = require('../dist/index.js');
const { ethers } = require('ethers');

// Optional: Pass PRIVATE_KEY env var to execute the transaction
// e.g. PRIVATE_KEY=0x... node examples/basic-usage.js
const PRIVATE_KEY = process.env.PRIVATE_KEY;

async function main() {
    console.log("=== LayerCover SDK - Fixed-Rate Coverage Example ===\n");

    // 1. Setup provider (Base Sepolia)
    const rpcUrl = 'https://sepolia.base.org';
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    // 2. Setup Signer if key provided
    let sdk;
    let signer;

    // Address from packages/contracts/deployments/base_sepolia/instances/usdc.json
    const policyManagerAddr = '0x33807f8c7b35E7233e33aFCDB6b3fea0C535c015';

    // Configure SDK with API endpoint
    const sdkOptions = {
        apiBaseUrl: 'https://app.layercover.com',
        deployment: 'base_sepolia_usdc',
        chainId: 84532,
    };

    if (PRIVATE_KEY) {
        signer = new ethers.Wallet(PRIVATE_KEY, provider);
        console.log(`Using wallet: ${signer.address}`);
        sdk = new LayerCoverSDK(signer, policyManagerAddr, sdkOptions);
    } else {
        console.log("No PRIVATE_KEY provided. Running in read-only mode.");
        sdk = new LayerCoverSDK(provider, policyManagerAddr, sdkOptions);
    }

    // 3. Fetch Fixed-Rate Quotes
    const poolId = 1; // Pool 1 (e.g., Usual USDC)

    console.log(`\nFetching fixed-rate quotes for Pool ${poolId}...`);
    try {
        const quotes = await sdk.getFixedRateQuotes(poolId);

        if (quotes.length === 0) {
            console.log("❌ No quotes available for this pool.");
            console.log("   Quotes are provided by underwriters (syndicates).");
            console.log("   Try again later or check a different pool.");
            return;
        }

        console.log(`✓ Found ${quotes.length} quote(s):\n`);

        quotes.forEach((q, idx) => {
            console.log(`  Quote ${idx + 1}:`);
            console.log(`    Syndicate: ${q.syndicateName} (${q.syndicateAddress.slice(0, 10)}...)`);
            console.log(`    Rate: ${(q.premiumRateBps / 100).toFixed(2)}% APR`);
            console.log(`    Coverage: ${ethers.formatUnits(q.coverageAmount, 6)} USDC available`);
            console.log(`    Duration: ${q.minDurationWeeks}-${q.maxDurationWeeks} weeks`);
            console.log(`    On-chain Order: ${q.orderId ? `#${q.orderId}` : 'No (API quote)'}`);
            console.log('');
        });

        // 4. Select Best Quote
        const bestQuote = quotes[0]; // Already sorted by rate
        console.log(`✓ Best rate: ${(bestQuote.premiumRateBps / 100).toFixed(2)}% from ${bestQuote.syndicateName}`);

        // 5. Calculate Premium
        const coverAmount = ethers.parseUnits('1000', 6); // 1000 USDC
        const durationWeeks = 4;
        const durationSeconds = durationWeeks * 7 * 24 * 60 * 60;

        const premium = sdk.calculatePremium(coverAmount, bestQuote.premiumRateBps, durationSeconds);

        console.log(`\n--- Quote for 1000 USDC coverage, ${durationWeeks} weeks ---`);
        console.log(`  Rate: ${(bestQuote.premiumRateBps / 100).toFixed(2)}% APR`);
        console.log(`  Premium: ${ethers.formatUnits(premium, 6)} USDC`);
        console.log(`  Effective Cost: ${((Number(premium) / Number(coverAmount)) * 100).toFixed(4)}%`);

        // 6. Calculate Net Yield
        const baseApy = 8.0; // Example: protocol offers 8% APY
        const { netApy } = LayerCoverSDK.calculateNetYield(baseApy, bestQuote.premiumRateBps);
        console.log(`\n  Base APY: ${baseApy.toFixed(2)}%`);
        console.log(`  Insured APY: ${netApy.toFixed(2)}%`);

        // 7. Prepare Transaction (if signer available)
        if (signer && bestQuote.orderId) {
            console.log("\n--- Transaction Preparation ---");

            const tx = await sdk.prepareBuyFromQuoteTx(
                bestQuote.orderId,
                coverAmount,
                durationSeconds
            );

            console.log("✓ Transaction prepared:");
            console.log(`  To: ${tx.to}`);
            console.log(`  Data: ${tx.data?.toString().substring(0, 50)}...`);

            // To execute, uncomment:
            // console.log("\nExecuting purchase...");
            // const result = await sdk.purchase(poolId, coverAmount, durationWeeks);
            // console.log(`✓ Cover purchased! TX: ${result.txHash}`);
            // if (result.policyId) console.log(`  Policy ID: ${result.policyId}`);

            console.log("\n⚠️ Skipping actual send to avoid accidental spend.");
            console.log("   To execute, use: sdk.purchase(poolId, coverAmount, durationWeeks)");
        } else if (signer && !bestQuote.orderId) {
            console.log("\n--- Intent-Based Purchase ---");
            console.log("This quote requires the full intent flow (2 transactions).");
            console.log("Use sdk.purchase() or sdk.purchaseWithIntent() to execute.");

            // To execute intent-based purchase:
            // const result = await sdk.purchase(poolId, coverAmount, durationWeeks);
            // console.log(`✓ Cover purchased! TX: ${result.txHash}`);
        }

    } catch (e) {
        console.error("❌ Error:", e.message || e);
    }
}

main().catch(console.error);
