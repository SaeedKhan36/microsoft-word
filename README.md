# Personal Editor

Personal Editor is an offline desktop word processor for Windows. It is built with Electron, React, TypeScript, and Tiptap. The project uses the `.ped` format for native documents and is designed to support Word document exchange and pen input.

## Local development

With Node.js and npm installed, run these commands from the project checkout.

```sh
npm ci
npm run dev
```

Run `npm run typecheck` to check the TypeScript code. Run `npm run build:win` to build the 64-bit Windows installer.

## Architecture

See [the architecture and build plan](docs/ARCHITECTURE.md) for the project design and roadmap.

Created in [T3 Code](https://t3.codes).
