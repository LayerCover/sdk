# Contributing to LayerCover SDK

Thank you for your interest in contributing to the LayerCover SDK!

## Development Setup

1. Clone the repository:

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

## Project Structure

```
sdk/
├── src/                # TypeScript source files
│   ├── index.ts        # Main SDK class
│   ├── adapters/       # Protocol adapters (Aave, etc.)
│   └── react/          # React components and hooks
├── dist/               # Built output (generated)
├── examples/           # Usage examples
├── tests/              # Test files
├── README.md           # Documentation
└── package.json        # Package configuration
```

## Making Changes

1. Create a feature branch:

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes in `src/`

3. Build and test:

   ```bash
   npm run build
   ```

4. Submit a pull request

## Code Style

- Use TypeScript for all new code
- Follow existing formatting conventions
- Add JSDoc comments for public methods
- Update README.md for new features

## Reporting Issues

- Use GitHub Issues
- Include reproduction steps
- Specify SDK version and environment

## Questions?

- Discord: [discord.gg/layercover](https://discord.gg/layercover)
- Documentation: [docs.layercover.com](https://docs.layercover.com)
