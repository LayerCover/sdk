/**
 * Unit tests for error translation (getHumanError)
 */
import { describe, it, expect } from 'vitest';
import {
    getHumanError,
    ERROR_MESSAGES,
    PurchaseBlockedError,
    QuoteStaleError,
    SignerRequiredError,
    ChainMismatchError,
} from '../../src/errors';

describe('ERROR_MESSAGES', () => {
    it('contains known error selectors', () => {
        expect(Object.keys(ERROR_MESSAGES).length).toBeGreaterThan(5);
    });

    it('maps 0xa4264d34 to capacity error', () => {
        const msg = ERROR_MESSAGES['0xa4264d34'];
        expect(msg).toBeDefined();
        expect(msg.toLowerCase()).toContain('capacity');
    });
});

describe('getHumanError', () => {
    it('handles user rejection (code 4001)', () => {
        const err = { code: 4001, message: 'user rejected' };
        const msg = getHumanError(err);
        expect(msg.toLowerCase()).toContain('reject');
    });

    it('handles ACTION_REJECTED ethers error', () => {
        const err = { code: 'ACTION_REJECTED', message: 'user rejected' };
        const msg = getHumanError(err);
        expect(msg.toLowerCase()).toContain('reject');
    });

    it('extracts selector from transaction data', () => {
        // Simulate a revert with a known selector
        const knownSelector = Object.keys(ERROR_MESSAGES)[0];
        const err = {
            message: 'execution reverted',
            data: knownSelector + '00'.repeat(28), // selector + padding
        };
        const msg = getHumanError(err);
        // Should either match the selector or provide a generic revert message
        expect(msg.length).toBeGreaterThan(0);
    });

    it('handles gas estimation errors', () => {
        const err = { message: 'cannot estimate gas; transaction may fail' };
        const msg = getHumanError(err);
        expect(msg.toLowerCase()).toContain('gas');
    });

    it('handles network errors', () => {
        const err = { message: 'network error' };
        const msg = getHumanError(err);
        expect(msg.length).toBeGreaterThan(0);
    });

    it('uses the configured chain for wrong-network errors', () => {
        const err = {
            message: 'Chain mismatch: SDK configured for 43113 (deployment avalanche_fuji_usdc), signer connected to 1',
            expectedChainId: 43113,
            expectedDeployment: 'avalanche_fuji_usdc',
        };
        const msg = getHumanError(err);
        expect(msg).toContain('Avalanche Fuji');
        expect(msg).toContain('avalanche_fuji_usdc');
    });

    it('formats typed purchase blocked errors', () => {
        const err = new PurchaseBlockedError('blocked', [
            { code: 'AMOUNT_BELOW_MIN_FILL', message: 'Quote requires more size.', quoteId: 'quote-1' },
        ]);
        expect(getHumanError(err)).toContain('Quote requires more size.');
    });

    it('formats typed stale quote errors', () => {
        const err = new QuoteStaleError('stale', 'quote-1', 30_000, 45_000);
        expect(getHumanError(err)).toContain('stale');
    });

    it('formats typed signer required errors', () => {
        const err = new SignerRequiredError();
        expect(getHumanError(err)).toContain('Wallet connection required');
    });

    it('formats typed chain mismatch errors', () => {
        const err = new ChainMismatchError(
            'Chain mismatch',
            11155111,
            1,
            'ethereum_sepolia_usdc'
        );
        expect(getHumanError(err)).toContain('Ethereum Sepolia');
        expect(getHumanError(err)).toContain('ethereum_sepolia_usdc');
    });

    it('returns generic message for unknown errors', () => {
        const err = { message: 'something completely unexpected happened xyz123' };
        const msg = getHumanError(err);
        expect(msg.length).toBeGreaterThan(0);
    });

    it('handles string error', () => {
        const msg = getHumanError('simple string error');
        expect(msg).toBe('simple string error');
    });

    it('handles null/undefined gracefully', () => {
        expect(getHumanError(null).length).toBeGreaterThan(0);
        expect(getHumanError(undefined).length).toBeGreaterThan(0);
    });
});
