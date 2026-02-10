import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['tests/unit/**/*.test.ts'],
        globals: true,
        environment: 'node',
        testTimeout: 10_000,
        // ethers v6 imports 'ws' as ESM named export which fails in Node's
        // native ESM. Tell Vitest to inline (bundle) these deps so the
        // CJS → ESM interop is handled automatically.
        deps: {
            inline: ['ethers', 'ws'],
        },
        server: {
            deps: {
                inline: ['ethers', 'ws'],
            },
        },
    },
});
