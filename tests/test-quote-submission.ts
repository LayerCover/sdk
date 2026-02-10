/**
 * Test script for SDK quote submission functionality
 * Run with: npx tsx test-quote-submission.ts
 */
import { ethers } from 'ethers';

// Test configuration
const API_BASE_URL = 'http://localhost:3000'; // Frontend dev server
const CHAIN_ID = 84532; // Base Sepolia
const TEST_POOL_ID = 1;

// Use a test private key (Hardhat account #0)
const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

async function testQuoteSubmissionAPI() {
    console.log('=== Testing Quote Submission API ===\n');

    const wallet = new ethers.Wallet(TEST_PRIVATE_KEY);
    // Use getAddress to get properly checksummed address
    const syndicateAddress = '0x52f1985F95b4D6E3E3F0bfdC7f45A615D9caD97a';

    console.log('Signer address:', wallet.address);
    console.log('Syndicate address:', syndicateAddress);
    console.log('');

    // Test 1: Get current exposure
    console.log('--- Test 1: Get Syndicate Exposure ---');
    try {
        const exposureRes = await fetch(
            `${API_BASE_URL}/api/quotes/exposure?syndicateAddress=${syndicateAddress}`
        );
        const exposureData = await exposureRes.json();
        console.log('Current exposure:', exposureData);
    } catch (error) {
        console.error('Error getting exposure:', error);
    }
    console.log('');

    // Test 2: Get existing quotes
    console.log('--- Test 2: Get Syndicate Quotes ---');
    try {
        const quotesRes = await fetch(
            `${API_BASE_URL}/api/quotes?syndicateAddress=${syndicateAddress}`
        );
        const quotesData = await quotesRes.json();
        console.log('Existing quotes count:', quotesData.count);
        if (quotesData.quotes?.length > 0) {
            console.log('First quote:', quotesData.quotes[0].id);
        }
    } catch (error) {
        console.error('Error getting quotes:', error);
    }
    console.log('');

    // Test 3: Submit a new quote (using direct API call)
    console.log('--- Test 3: Submit Quote (API) ---');
    try {
        // Prepare coverage parameters
        const coverageAmount = ethers.parseUnits('1000', 6); // 1000 USDC
        const premiumRateBps = 500; // 5%
        const minDurationWeeks = 4;
        const maxDurationWeeks = 12;
        const expiryHours = 24;

        const minCoverageDuration = minDurationWeeks * 7 * 24 * 60 * 60;
        const maxCoverageDuration = maxDurationWeeks * 7 * 24 * 60 * 60;
        const reservationExpiry = Math.floor(Date.now() / 1000) + expiryHours * 60 * 60;
        const nonce = Date.now();
        const salt = ethers.hexlify(ethers.randomBytes(32));

        // Create Reserve Intent
        const reserveIntent = {
            solver: wallet.address,
            underwriter: syndicateAddress,
            poolId: TEST_POOL_ID,
            minCoverageDuration,
            maxCoverageDuration,
            coverageAmount: coverageAmount.toString(),
            minFillAmount: coverageAmount.toString(),
            allowPartialFill: false,
            reservationExpiry,
            nonce: nonce.toString(),
            whitelistedBuyer: ethers.ZeroAddress,
            minPremiumBps: premiumRateBps,
            cancellationPenaltyBps: 0,
        };

        // Sign Reserve Intent (EIP-712)
        const reserveDomain = {
            name: 'Syndicate',
            version: '1',
            chainId: CHAIN_ID,
            verifyingContract: syndicateAddress,
        };

        const reserveTypes = {
            ReserveIntent: [
                { name: 'solver', type: 'address' },
                { name: 'underwriter', type: 'address' },
                { name: 'poolId', type: 'uint256' },
                { name: 'minCoverageDuration', type: 'uint32' },
                { name: 'maxCoverageDuration', type: 'uint32' },
                { name: 'coverageAmount', type: 'uint256' },
                { name: 'minFillAmount', type: 'uint256' },
                { name: 'allowPartialFill', type: 'bool' },
                { name: 'reservationExpiry', type: 'uint64' },
                { name: 'nonce', type: 'uint96' },
                { name: 'whitelistedBuyer', type: 'address' },
                { name: 'minPremiumBps', type: 'uint16' },
                { name: 'cancellationPenaltyBps', type: 'uint16' },
            ],
        };

        const reserveValue = {
            solver: reserveIntent.solver,
            underwriter: reserveIntent.underwriter,
            poolId: reserveIntent.poolId,
            minCoverageDuration: reserveIntent.minCoverageDuration,
            maxCoverageDuration: reserveIntent.maxCoverageDuration,
            coverageAmount: BigInt(reserveIntent.coverageAmount),
            minFillAmount: BigInt(reserveIntent.minFillAmount),
            allowPartialFill: reserveIntent.allowPartialFill,
            reservationExpiry: reserveIntent.reservationExpiry,
            nonce: BigInt(reserveIntent.nonce),
            whitelistedBuyer: reserveIntent.whitelistedBuyer,
            minPremiumBps: reserveIntent.minPremiumBps,
            cancellationPenaltyBps: reserveIntent.cancellationPenaltyBps,
        };

        const reserveSignature = await wallet.signTypedData(reserveDomain, reserveTypes, reserveValue);
        console.log('Reserve signature generated');

        // Create Coverage Intent
        const coverageIntent = {
            maker: syndicateAddress,
            poolId: TEST_POOL_ID,
            coverageAmount: coverageAmount.toString(),
            premiumRateBps,
            minDuration: minCoverageDuration,
            maxDuration: maxCoverageDuration,
            nonce: nonce.toString(),
            expiry: reservationExpiry,
            salt,
            requiresUpfront: true,
            cancellationPenaltyBps: 0,
            minFillAmount: coverageAmount.toString(),
            whitelistedBuyer: ethers.ZeroAddress,
        };

        // Sign Coverage Intent
        const intentMatcherAddress = '0x6952Df9bf4615b73B005C79AB19FD53385eD96ae'; // Base Sepolia IntentMatcher
        const intentDomain = {
            name: 'IntentMatcher',
            version: '1',
            chainId: CHAIN_ID,
            verifyingContract: intentMatcherAddress,
        };

        const intentTypes = {
            CoverageIntent: [
                { name: 'maker', type: 'address' },
                { name: 'poolId', type: 'uint256' },
                { name: 'coverageAmount', type: 'uint256' },
                { name: 'premiumRateBps', type: 'uint256' },
                { name: 'minDuration', type: 'uint256' },
                { name: 'maxDuration', type: 'uint256' },
                { name: 'nonce', type: 'uint256' },
                { name: 'expiry', type: 'uint256' },
                { name: 'salt', type: 'uint256' },
                { name: 'requiresUpfront', type: 'bool' },
                { name: 'cancellationPenaltyBps', type: 'uint16' },
                { name: 'minFillAmount', type: 'uint256' },
                { name: 'whitelistedBuyer', type: 'address' },
            ],
        };

        const intentValue = {
            maker: coverageIntent.maker,
            poolId: coverageIntent.poolId,
            coverageAmount: BigInt(coverageIntent.coverageAmount),
            premiumRateBps: coverageIntent.premiumRateBps,
            minDuration: coverageIntent.minDuration,
            maxDuration: coverageIntent.maxDuration,
            nonce: BigInt(coverageIntent.nonce),
            expiry: coverageIntent.expiry,
            salt: BigInt(coverageIntent.salt),
            requiresUpfront: coverageIntent.requiresUpfront,
            cancellationPenaltyBps: coverageIntent.cancellationPenaltyBps,
            minFillAmount: BigInt(coverageIntent.minFillAmount),
            whitelistedBuyer: coverageIntent.whitelistedBuyer,
        };

        const intentSignature = await wallet.signTypedData(intentDomain, intentTypes, intentValue);
        console.log('Intent signature generated');

        // Submit to API
        const quoteData = {
            poolId: TEST_POOL_ID,
            deployment: 'base_sepolia_usdc',
            syndicateAddress,
            syndicateName: 'Test Syndicate',
            coverageAmount: coverageAmount.toString(),
            premiumRateBps,
            minDurationWeeks,
            maxDurationWeeks,
            reserveIntent,
            signature: reserveSignature,
            coverageIntent,
            intentSignature,
        };

        const submitRes = await fetch(`${API_BASE_URL}/api/quotes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(quoteData),
        });

        const submitData = await submitRes.json();
        console.log('Quote submission result:', submitRes.status, submitData.success ? '✅' : '❌');
        if (submitData.quote) {
            console.log('Quote ID:', submitData.quote.id);
        }
        if (submitData.error) {
            console.log('Error:', submitData.error);
        }
    } catch (error: any) {
        console.error('Error submitting quote:', error.message || error);
    }
    console.log('');

    // Test 4: Verify exposure increased
    console.log('--- Test 4: Verify Exposure Updated ---');
    try {
        const exposureRes = await fetch(
            `${API_BASE_URL}/api/quotes/exposure?syndicateAddress=${syndicateAddress}`
        );
        const exposureData = await exposureRes.json();
        console.log('Updated exposure:', exposureData);
    } catch (error) {
        console.error('Error getting exposure:', error);
    }
    console.log('');

    console.log('=== Tests Complete ===');
}

/**
 * Test invalid quote submissions - should all be rejected
 */
async function testInvalidQuoteSubmissions() {
    console.log('\n=== Testing Invalid Quote Submissions ===\n');

    const wallet = new ethers.Wallet(TEST_PRIVATE_KEY);
    const syndicateAddress = '0x52f1985F95b4D6E3E3F0bfdC7f45A615D9caD97a';

    // Helper to submit a quote with given data
    async function submitQuote(quoteData: any, testName: string): Promise<{ status: number; data: any }> {
        console.log(`--- ${testName} ---`);
        const res = await fetch(`${API_BASE_URL}/api/quotes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(quoteData),
        });
        const data = await res.json();
        const passed = !data.success; // Invalid quotes should NOT succeed
        console.log(`Status: ${res.status}, Success: ${data.success}, Expected failure: ${passed ? '✅' : '❌'}`);
        if (data.error) console.log(`Error: ${data.error}`);
        console.log('');
        return { status: res.status, data };
    }

    // Test 5: Missing poolId
    await submitQuote({
        deployment: 'base_sepolia_usdc',
        syndicateAddress,
        coverageAmount: '1000000000',
        premiumRateBps: 500,
        minDurationWeeks: 4,
        maxDurationWeeks: 12,
    }, 'Test 5: Missing poolId');

    // Test 6: Missing syndicateAddress
    await submitQuote({
        poolId: 1,
        deployment: 'base_sepolia_usdc',
        coverageAmount: '1000000000',
        premiumRateBps: 500,
        minDurationWeeks: 4,
        maxDurationWeeks: 12,
    }, 'Test 6: Missing syndicateAddress');

    // Test 7: Missing coverageAmount
    await submitQuote({
        poolId: 1,
        deployment: 'base_sepolia_usdc',
        syndicateAddress,
        premiumRateBps: 500,
        minDurationWeeks: 4,
        maxDurationWeeks: 12,
    }, 'Test 7: Missing coverageAmount');

    // Test 8: Missing premiumRateBps
    await submitQuote({
        poolId: 1,
        deployment: 'base_sepolia_usdc',
        syndicateAddress,
        coverageAmount: '1000000000',
        minDurationWeeks: 4,
        maxDurationWeeks: 12,
    }, 'Test 8: Missing premiumRateBps');

    // Test 9: Invalid poolId (negative)
    await submitQuote({
        poolId: -1,
        deployment: 'base_sepolia_usdc',
        syndicateAddress,
        coverageAmount: '1000000000',
        premiumRateBps: 500,
        minDurationWeeks: 4,
        maxDurationWeeks: 12,
    }, 'Test 9: Invalid poolId (negative)');

    // Test 10: Zero coverage amount
    await submitQuote({
        poolId: 1,
        deployment: 'base_sepolia_usdc',
        syndicateAddress,
        coverageAmount: '0',
        premiumRateBps: 500,
        minDurationWeeks: 4,
        maxDurationWeeks: 12,
    }, 'Test 10: Zero coverage amount');

    // Test 11: Negative premium rate
    await submitQuote({
        poolId: 1,
        deployment: 'base_sepolia_usdc',
        syndicateAddress,
        coverageAmount: '1000000000',
        premiumRateBps: -100,
        minDurationWeeks: 4,
        maxDurationWeeks: 12,
    }, 'Test 11: Negative premium rate');

    // Test 12: Min duration > Max duration
    await submitQuote({
        poolId: 1,
        deployment: 'base_sepolia_usdc',
        syndicateAddress,
        coverageAmount: '1000000000',
        premiumRateBps: 500,
        minDurationWeeks: 12,
        maxDurationWeeks: 4,
    }, 'Test 12: Min duration > Max duration');

    // Test 13: Invalid syndicateAddress format
    await submitQuote({
        poolId: 1,
        deployment: 'base_sepolia_usdc',
        syndicateAddress: 'not-an-address',
        coverageAmount: '1000000000',
        premiumRateBps: 500,
        minDurationWeeks: 4,
        maxDurationWeeks: 12,
    }, 'Test 13: Invalid syndicateAddress format');

    // Test 14: Excessively high premium rate (>100%)
    await submitQuote({
        poolId: 1,
        deployment: 'base_sepolia_usdc',
        syndicateAddress,
        coverageAmount: '1000000000',
        premiumRateBps: 15000, // 150%
        minDurationWeeks: 4,
        maxDurationWeeks: 12,
    }, 'Test 14: Excessively high premium rate (150%)');

    // Test 15: Zero duration weeks
    await submitQuote({
        poolId: 1,
        deployment: 'base_sepolia_usdc',
        syndicateAddress,
        coverageAmount: '1000000000',
        premiumRateBps: 500,
        minDurationWeeks: 0,
        maxDurationWeeks: 0,
    }, 'Test 15: Zero duration weeks');

    console.log('=== Invalid Quote Tests Complete ===\n');
}

// Run all tests
async function runAllTests() {
    await testQuoteSubmissionAPI();
    await testInvalidQuoteSubmissions();
}

runAllTests().catch(console.error);

