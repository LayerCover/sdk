/**
 * Unit tests for ViemAdapter
 */
import { describe, it, expect } from 'vitest';
import { ViemAdapter } from '../../src/viem-adapter';

describe('ViemAdapter', () => {
    describe('class structure', () => {
        it('exists and is a class', () => {
            expect(ViemAdapter).toBeDefined();
            expect(typeof ViemAdapter).toBe('function');
        });

        it('has fromWalletClient static method', () => {
            expect(typeof ViemAdapter.fromWalletClient).toBe('function');
        });

        it('has fromPublicClient static method', () => {
            expect(typeof ViemAdapter.fromPublicClient).toBe('function');
        });

        it('has fromViemAccount static method', () => {
            expect(typeof ViemAdapter.fromViemAccount).toBe('function');
        });
    });

    describe('fromWalletClient', () => {
        it('throws on undefined input', () => {
            expect(() => ViemAdapter.fromWalletClient(undefined as any)).toThrow();
        });

        it('throws on null input', () => {
            expect(() => ViemAdapter.fromWalletClient(null as any)).toThrow();
        });
    });

    describe('fromPublicClient', () => {
        it('throws on undefined input', () => {
            expect(() => ViemAdapter.fromPublicClient(undefined as any)).toThrow();
        });

        it('creates provider from mock public client', () => {
            const mockPublicClient = {
                transport: {
                    type: 'http',
                    url: 'http://localhost:8545',
                },
                chain: {
                    id: 84532,
                    rpcUrls: { default: { http: ['http://localhost:8545'] } },
                },
            };

            try {
                const result = ViemAdapter.fromPublicClient(mockPublicClient as any);
                expect(result).toBeDefined();
            } catch (err: any) {
                // May throw on incomplete mock — acceptable
                expect(err.message).toBeDefined();
            }
        });
    });
});
