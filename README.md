# PDF Letterhead

Desktop app for applying a company letterhead PDF as a background to one or more input PDFs.

## Stack

- Tauri 2
- Nuxt 4
- Vue 3
- TypeScript
- pdf-lib

## What it does

- Select one letterhead PDF.
- Select one or more input PDFs.
- Select an output directory.
- Generate one output PDF per input file.
- Preserve each input page size.
- Overlay the input page on top of the letterhead background.
- Support English, Polish, and German UI text.

## Scripts

- `npm run dev` - run the Tauri app in development mode.
- `npm run build` - build the Tauri app for distribution.
- `npm run build:renderer` - build the Nuxt renderer bundle.
- `npm run typecheck` - run TypeScript type checking.

## Development

1. Install dependencies.
2. Run `npm run dev`.
3. Tauri launches the Nuxt renderer through its native shell.

## Production build

1. Run `npm run build`.
2. The Nuxt static output is bundled into the Tauri application.

## Notes and limitations

- PDF processing happens locally inside the Tauri frontend process.
- Encrypted PDFs are not supported.
- The app uses a practical page-overlay approach via `pdf-lib`; it does not preserve interactive PDF form behavior.
- The UI is client-side only and stores the selected language in localStorage.
- Packaging assumes a standard Tauri desktop target and a writable output directory.
