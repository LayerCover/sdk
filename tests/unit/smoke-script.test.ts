import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

describe('smoke-testnet example', () => {
    it('uses the installed ethers-v6 dependency', () => {
        const source = fs.readFileSync(new URL('../../examples/smoke-testnet.js', import.meta.url), 'utf8');
        expect(source).toContain("require('ethers-v6')");
        expect(source).not.toContain("require('ethers')");
    });
});
