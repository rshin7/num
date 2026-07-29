# Num

Num is a local-first calculator workbook for the browser. Write one expression per line and see results beside it. The interface is React/Vite; the calculator itself runs in a .NET WebAssembly module exposed to JavaScript with `[JSExport]`.

It is an independent open-source project, released under the Apache License 2.0.

## Features

- Exact base-10 calculations with C# `decimal`, including money amounts.
- Variables, parentheses, percentages, `abs`, `round`, `min`, and `max`.
- Currency-aware `$`, `€`, `£`, and `¥` arithmetic.
- Notes with `#`, local browser persistence, compressed URL sharing, and JSON import/export.
- A responsive editor/results layout for desktop and mobile screens.

## Requirements

- Node.js 20 or newer
- .NET SDK 10

The first engine build downloads official .NET browser-WASM packages. No globally installed .NET WASM workload is required.

## Getting started

```sh
npm install
npm run dev
```

Open the local address printed by Vite. The calculator begins with a blank workbook.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Build the calculator engine and start Vite. |
| `npm run build` | Create the production site in `dist/`. |
| `npm run test` | Build the WASM engine and run its integration tests. |
| `npm run preview` | Serve a completed production build. |

## Calculator syntax

```text
income = $3,500
rent = $1,450
income - rent            # $2,050
round(8.875%, 3)         # 0.089
```

Assignments set variables but do not add to the running total. Ordinary expression lines do. Addition and subtraction require matching currency symbols; multiplying or dividing a currency by a plain number is supported.

## Data and sharing

The active workbook is stored in the browser's `localStorage`; Num has no account system or database. **Share** compresses the workbook into the URL fragment, so the fragment is self-contained and is not sent to a web server. The link therefore changes when its contents change. Use **↓** to export JSON and **↑** to import a previously exported workbook. Imports are validated before replacing the active workbook.

## Project structure

- `src/` — React UI, syntax display, sharing helpers, and WASM bridge.
- `src/NumEngine/` — .NET decimal expression parser and `[JSExport]` API.
- `test/` — Node integration tests against the generated WASM export.
- `public/wasm/` — generated runtime bundle; never commit it.

## Contributing

Contributions are welcome. Please keep changes focused, add or update tests for calculator behavior, and run `npm run test` and `npm run build` before opening a pull request.

## License

Copyright 2026 Richard Shin.

Licensed under the [Apache License, Version 2.0](LICENSE).
