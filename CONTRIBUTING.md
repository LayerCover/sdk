# Contributing to LayerCover SDK

Thank you for your interest in contributing to the LayerCover SDK! This is an open-source project and we welcome contributions from the community.

## Development Setup

1. Fork and clone the repo:

   ```bash
   git clone https://github.com/layercover/sdk.git
   cd sdk
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Build the SDK:

   ```bash
   npm run build
   ```

4. Run tests:

   ```bash
   npm test
   ```

## Project Structure

```text
├── src/                # TypeScript source files
│   ├── index.ts        # Main SDK class & types
│   ├── errors.ts       # Error message mapping
│   ├── adapters.ts     # Ethers v5 → v6 adapter
│   ├── viem-adapter.ts # viem/wagmi adapter
│   └── react/          # React components and hooks
│       ├── components/ # BuyCoverModal, CoverButton
│       ├── hooks/      # useLayerCover
│       └── theme.ts    # Preset themes
├── dist/               # Built output (generated)
├── examples/           # Usage examples
├── tests/              # Test files
├── README.md           # Documentation
└── package.json        # Package configuration
```

## Making Changes

1. Create a feature branch from `main`:

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes in `src/`

3. Build and test:

   ```bash
   npm run build
   npm test
   ```

4. Open a pull request against `main`

## Code Style

- Use TypeScript for all new code
- Follow existing formatting conventions
- Add JSDoc comments for public methods
- Update README.md for new features
- Add a changeset (`npx changeset`) describing your change

## Reporting Issues

- Use [GitHub Issues](https://github.com/layercover/sdk/issues)
- Include reproduction steps
- Specify SDK version and environment

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

## Questions?

- Discord: [discord.gg/layercover](https://discord.gg/layercover)
- Documentation: [docs.layercover.com](https://docs.layercover.com)
