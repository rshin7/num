# Num

Num is a local-first calculator workbook for the browser. Write one expression per line and see results beside it. The interface is React/Vite with TypeScript; the calculator itself runs in a .NET WebAssembly module exposed to JavaScript with `[JSExport]`.

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

## Deploy to Netlify

This repository includes `netlify.toml`. Connect the repository in Netlify and
use `npm run build` as the build command with `dist` as the publish directory.
The build script installs .NET 10 when the Netlify image does not already have
it; Netlify then serves the generated static site.

### Optional GitHub Gist sync

The `netlify/functions/` directory contains a stateless GitHub App OAuth flow
and an authenticated Gist proxy. It stores the user's GitHub token only in an
encrypted, HTTP-only cookie; it does not require a database.

Create the GitHub App with only the account-level **Gists: Read and write**
permission. Set its callback URL to:

```text
https://YOUR-SITE.netlify.app/.netlify/functions/github-auth-callback
```

Leave GitHub App webhooks inactive: this integration does not receive GitHub
events. Add the variables listed in `.env.example` through the Netlify UI, not
in `netlify.toml` or the repository. Use a unique `NUM_SESSION_SECRET` of at
least 32 characters. The Gist endpoint accepts encrypted workbook content; the
browser encryption and sync UI can be added once the GitHub App is registered.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Build the calculator engine and start Vite. |
| `npm run build` | Create the production site in `dist/`. |
| `npm run check` | Run strict TypeScript type checking. |
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

The active workbook is stored in the browser's `localStorage`; Num has no account system or database. The workbook is compressed into the URL fragment after a brief pause in typing, so the address bar is always ready to share without adding browser-history entries. The fragment is self-contained and is not sent to a web server. Use **Copy link** to copy it, **↓** to export JSON, and **↑** to import a previously exported workbook. Imports are validated before replacing the active workbook.

## Project structure

- `src/` — TypeScript React UI, syntax display, sharing helpers, and WASM bridge.
- `src/NumEngine/` — .NET decimal expression parser and `[JSExport]` API.
- `test/` — Node integration tests against the generated WASM export.
- `public/wasm/` — generated runtime bundle; never commit it.

## Contributing

Contributions are welcome. Please keep changes focused, add or update tests for calculator behavior, and run `npm run test` and `npm run build` before opening a pull request.

## License

Copyright 2026 Richard Shin.

Licensed under the [Apache License, Version 2.0](LICENSE).
