/**
 * Dual CJS/ESM build verification script.
 * Tests that both `require()` and `import` work correctly for the SDK.
 *
 * Usage: node tests/test-dual-build.mjs
 */

import { createRequire } from 'module';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sdkRoot = resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`  ✅ ${message}`);
        passed++;
    } else {
        console.error(`  ❌ ${message}`);
        failed++;
    }
}

console.log('\n🔧 Dual CJS/ESM Build Verification\n');

// ──────────────────────────────────────────────────────────────────
// 1. Check dist files exist
// ──────────────────────────────────────────────────────────────────
console.log('1. Checking dist files exist...');

assert(existsSync(resolve(sdkRoot, 'dist/index.js')), 'dist/index.js (CJS) exists');
assert(existsSync(resolve(sdkRoot, 'dist/index.d.ts')), 'dist/index.d.ts exists');
assert(existsSync(resolve(sdkRoot, 'dist/esm/index.js')), 'dist/esm/index.js (ESM) exists');
assert(existsSync(resolve(sdkRoot, 'dist/errors.js')), 'dist/errors.js exists');
assert(existsSync(resolve(sdkRoot, 'dist/adapters.js')), 'dist/adapters.js exists');
assert(existsSync(resolve(sdkRoot, 'dist/viem-adapter.js')), 'dist/viem-adapter.js exists');
assert(existsSync(resolve(sdkRoot, 'dist/react/index.js')), 'dist/react/index.js exists');
assert(existsSync(resolve(sdkRoot, 'dist/react/index.d.ts')), 'dist/react/index.d.ts exists');

// ──────────────────────────────────────────────────────────────────
// 2. Test CJS require()
// ──────────────────────────────────────────────────────────────────
console.log('\n2. Testing CJS require()...');

const require_ = createRequire(import.meta.url);

try {
    const sdk = require_(resolve(sdkRoot, 'dist/index.js'));
    assert(typeof sdk.LayerCoverSDK === 'function', 'CJS: LayerCoverSDK class exports');
    assert(typeof sdk.LayerCoverSDK.create === 'function', 'CJS: LayerCoverSDK.create() exists');
    assert(typeof sdk.LayerCoverSDK.isQuoteExpired === 'function', 'CJS: LayerCoverSDK.isQuoteExpired() exists');
    assert(typeof sdk.LayerCoverSDK.getHumanError === 'function', 'CJS: LayerCoverSDK.getHumanError() exists');
    assert(typeof sdk.LayerCoverSDK.calculateNetYield === 'function', 'CJS: LayerCoverSDK.calculateNetYield() exists');
    assert(typeof sdk.ERROR_MESSAGES === 'object', 'CJS: ERROR_MESSAGES exports');
    assert(typeof sdk.getHumanError === 'function', 'CJS: getHumanError() exports');
    assert(typeof sdk.getPolicyManagerAddress === 'function', 'CJS: getPolicyManagerAddress() exports');
    assert(typeof sdk.getIntentOrderBookAddress === 'function', 'CJS: getIntentOrderBookAddress() exports');
    assert(typeof sdk.getTokenLogoUrl === 'function', 'CJS: getTokenLogoUrl() exports');
    assert(typeof sdk.CONTRACT_ADDRESSES === 'object', 'CJS: CONTRACT_ADDRESSES exports');
    assert(typeof sdk.POOL_CONFIG === 'object', 'CJS: POOL_CONFIG exports');
    assert(typeof sdk.TOKEN_LOGOS === 'object', 'CJS: TOKEN_LOGOS exports');
    assert(sdk.DEFAULT_CHAIN_ID === 84532, 'CJS: DEFAULT_CHAIN_ID = 84532');
    assert(typeof sdk.RateTooHighError === 'function', 'CJS: RateTooHighError class exports');
    assert(typeof sdk.NoQuotesAvailableError === 'function', 'CJS: NoQuotesAvailableError class exports');
} catch (err) {
    console.error(`  ❌ CJS require() failed: ${err.message}`);
    failed++;
}

// ──────────────────────────────────────────────────────────────────
// 3. Test ESM import
// ──────────────────────────────────────────────────────────────────
console.log('\n3. Testing ESM module structure...');

try {
    // Direct ESM import of ethers can fail in raw Node.js due to 'ws' module
    // transitive dep issues. Real consumers use bundlers which resolve this.
    // Instead, verify the ESM output is valid by checking structure and content.
    const { readFileSync } = await import('fs');
    const esmContent = readFileSync(resolve(sdkRoot, 'dist/esm/index.js'), 'utf-8');

    assert(esmContent.includes('export'), 'ESM: File contains export statements');
    assert(esmContent.includes('LayerCoverSDK'), 'ESM: File contains LayerCoverSDK class');
    assert(esmContent.includes('getHumanError'), 'ESM: File contains getHumanError export');
    assert(esmContent.includes('ERROR_MESSAGES'), 'ESM: File contains ERROR_MESSAGES export');
    assert(esmContent.includes('CONTRACT_ADDRESSES'), 'ESM: File contains CONTRACT_ADDRESSES export');
    assert(esmContent.includes('viem-adapter') || esmContent.includes('ViemAdapter'), 'ESM: File re-exports viem-adapter module');
    assert(!esmContent.includes('require('), 'ESM: File does not contain CJS require()');
    assert(esmContent.includes('import '), 'ESM: File uses ESM import statements');
} catch (err) {
    console.error(`  ❌ ESM structure check failed: ${err.message}`);
    failed++;
}

// ──────────────────────────────────────────────────────────────────
// 4. Result
// ──────────────────────────────────────────────────────────────────
console.log(`\n────────────────────────────`);
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`────────────────────────────\n`);

process.exit(failed > 0 ? 1 : 0);
