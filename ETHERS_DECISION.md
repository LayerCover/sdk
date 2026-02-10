# Dependency Decision: ethers v6 vs viem

**Decision:** Keep ethers v6 as the SDK's core dependency.  
**Date:** 2026-02-08  
**Status:** Accepted

## Context

The LayerCover frontend is migrating from ethers v5 to viem/wagmi. The question is whether the SDK should follow suit to maintain consistency.

## Decision

The SDK retains ethers v6 (`^6.15.0`) as its sole runtime dependency. Viem/wagmi users are supported via `ViemAdapter`, which ships as part of the SDK.

## Rationale

| Factor | ethers v6 (current) | viem (alternative) |
|--------|---------------------|--------------------|
| Migration cost | Zero | ~2000-line rewrite |
| Partner compatibility | Most dApps on ethers v5/v6 | Growing but not universal |
| Bundle overhead | ~120KB gzipped | ~35KB gzipped |
| Adapter story | `EthersV5Adapter` for v5 partners | `ViemAdapter` for viem partners |

1. **ViemAdapter already bridges the gap** — `ViemAdapter.fromWalletClient(walletClient)` gives viem/wagmi users a fully compatible signer in one line. No friction.
2. **Rewrite risk** — Migrating 2200 lines of contract interactions for no user-facing benefit.
3. **Dependency count unchanged** — Swapping ethers for viem replaces one dep with another.
4. **Backward compatibility** — Partners on ethers v5 use `EthersV5Adapter`. A viem-native SDK would break this integration path.

## Consequences

- SDK consumers on viem/wagmi must use `ViemAdapter` (documented in README).
- Future consideration: if ethers v6 is deprecated or viem reaches >80% market share, revisit.
- The `ViemAdapter` must be maintained alongside any SDK contract call changes.
