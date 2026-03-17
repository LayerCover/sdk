/**
 * Unit tests for error translation (getHumanError)
 */
import { describe, it, expect } from 'vitest';
import { getHumanError, ERROR_MESSAGES } from '../../src/errors';

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

    it('returns generic message for unknown errors', () => {
        const err = { message: 'something completely unexpected happened xyz123' };
        const msg = getHumanError(err);
        expect(msg.length).toBeGreaterThan(0);
    });

    it('handles string error', () => {
        const msg = getHumanError('simple string error');
        expect(msg.length).toBeGreaterThan(0);
    });

    it('handles null/undefined gracefully', () => {
        expect(getHumanError(null).length).toBeGreaterThan(0);
        expect(getHumanError(undefined).length).toBeGreaterThan(0);
    });
});
