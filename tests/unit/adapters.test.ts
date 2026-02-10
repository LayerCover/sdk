/**
 * Unit tests for Ethers v5 adapter
 */
import { describe, it, expect, vi } from 'vitest';
import { EthersV5Adapter } from '../../src/adapters';

describe('EthersV5Adapter', () => {
    describe('fromWeb3Provider', () => {
        it('is a static method', () => {
            expect(typeof EthersV5Adapter.fromWeb3Provider).toBe('function');
        });

        it('wraps a mock EIP-1193 provider', () => {
            const mockEIP1193 = {
                request: vi.fn(),
            };
            const mockV5 = { provider: mockEIP1193 };

            const result = EthersV5Adapter.fromWeb3Provider(mockV5);
            expect(result).toBeDefined();
        });
    });

    describe('fromJsonRpcProvider', () => {
        it('is a static method', () => {
            expect(typeof EthersV5Adapter.fromJsonRpcProvider).toBe('function');
        });

        it('extracts URL from v5 connection', () => {
            const mockV5 = { connection: { url: 'http://localhost:8545' } };
            const result = EthersV5Adapter.fromJsonRpcProvider(mockV5);
            expect(result).toBeDefined();
        });

        it('throws when URL cannot be extracted', () => {
            expect(() => EthersV5Adapter.fromJsonRpcProvider({})).toThrow();
        });
    });

    describe('fromSigner', () => {
        it('is a static method', () => {
            expect(typeof EthersV5Adapter.fromSigner).toBe('function');
        });

        it('throws when signer has no provider', async () => {
            await expect(EthersV5Adapter.fromSigner({})).rejects.toThrow(
                'v5 Signer must be connected to a provider'
            );
        });
    });
});
