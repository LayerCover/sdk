export const DEPLOYMENT_FIXTURES: Record<string, Record<string, {
    PolicyManager: string;
    IntentMatcher: string;
    PoolRegistry: string;
}>> = {
    base_sepolia: {
        usdc: {
            PolicyManager: '0xbd0Cb34253c84201F746F0A9DF062d82c0823c56',
            IntentMatcher: '0x7865f2e07dFe0d4dC4345bF5DFFFAd757a901337',
            PoolRegistry: '0xB65cE4662FFB20aE7Ddd7314B975F8A1b6dA4e59',
        },
        wsteth: {
            PolicyManager: '0x1d2c6275dC7DE388E793F6b7B73B93515dEC1B9f',
            IntentMatcher: '0x2715F9faE2e38d24D921480b85f9bCd489bFa5D4',
            PoolRegistry: '0x6218439dFd31656a8AC508D7A5e52bEF9eFEf378',
        },
    },
    avalanche_fuji: {
        usdc: {
            PolicyManager: '0x573e39aB7edfD840778C131d49AE89968bC53C0A',
            IntentMatcher: '0x67e456aa9b976FD75398d94C3Be17FBb55c865ab',
            PoolRegistry: '0xDddF32B1e6406D090B35edf770c90A18D55E75fb',
        },
    },
    ethereum_sepolia: {
        usdc: {
            PolicyManager: '0xa83A38e37153b59F329204eed0948284b046ac97',
            IntentMatcher: '0x0278E36b7e0214b0912c16460b741Ff526801e5E',
            PoolRegistry: '0x00667d277699c4a33BC699be6393c320589819A0',
        },
    },
    localhost: {
        usdc: {
            PolicyManager: '0xc5415607F07b8554354e7689B37B0ED6DAA13205',
            IntentMatcher: '0x2DacaDb603699Fa3367aBE99BB27dD88f5753274',
            PoolRegistry: '0x026EF62C333f443Ea68F6ffa659A8Faf781492b7',
        },
    },
};

export const POLICY_NFT_ABI_FIXTURE = [
    {
        inputs: [
            {
                internalType: 'uint256',
                name: 'id',
                type: 'uint256',
            },
        ],
        name: 'getPolicy',
        outputs: [
            {
                components: [
                    {
                        internalType: 'uint256',
                        name: 'coverage',
                        type: 'uint256',
                    },
                    {
                        internalType: 'uint256',
                        name: 'poolId',
                        type: 'uint256',
                    },
                    {
                        internalType: 'uint64',
                        name: 'start',
                        type: 'uint64',
                    },
                    {
                        internalType: 'uint64',
                        name: 'activation',
                        type: 'uint64',
                    },
                    {
                        internalType: 'uint64',
                        name: 'claimableFrom',
                        type: 'uint64',
                    },
                    {
                        internalType: 'uint64',
                        name: 'startBlock',
                        type: 'uint64',
                    },
                    {
                        internalType: 'bool',
                        name: 'voided',
                        type: 'bool',
                    },
                    {
                        internalType: 'uint128',
                        name: 'premiumDeposit',
                        type: 'uint128',
                    },
                    {
                        internalType: 'uint128',
                        name: 'lastDrainTime',
                        type: 'uint128',
                    },
                    {
                        components: [
                            {
                                internalType: 'address',
                                name: 'underwriter',
                                type: 'address',
                            },
                            {
                                internalType: 'uint16',
                                name: 'fixedRateBps',
                                type: 'uint16',
                            },
                            {
                                internalType: 'uint64',
                                name: 'endTime',
                                type: 'uint64',
                            },
                            {
                                internalType: 'bytes32',
                                name: 'reservationKey',
                                type: 'bytes32',
                            },
                            {
                                internalType: 'uint256',
                                name: 'reinsuredPortion',
                                type: 'uint256',
                            },
                        ],
                        internalType: 'struct Types.IntentPolicyData',
                        name: 'intent',
                        type: 'tuple',
                    },
                    {
                        components: [
                            {
                                internalType: 'address',
                                name: 'vault',
                                type: 'address',
                            },
                            {
                                internalType: 'uint256',
                                name: 'sharesInsured',
                                type: 'uint256',
                            },
                            {
                                internalType: 'uint256',
                                name: 'insuredValueUSDC',
                                type: 'uint256',
                            },
                            {
                                internalType: 'uint256',
                                name: 'pricePerShareSnapshot',
                                type: 'uint256',
                            },
                        ],
                        internalType: 'struct Types.VaultCoverSnapshot',
                        name: 'vaultCover',
                        type: 'tuple',
                    },
                ],
                internalType: 'struct Types.Policy',
                name: '',
                type: 'tuple',
            },
        ],
        stateMutability: 'view',
        type: 'function',
    },
] as const;
