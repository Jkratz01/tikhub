# TikHub Custom API Docs

A clean, frontend-only documentation UI generated from `openapi.json`.

## Features

- Loads and renders all endpoints from the OpenAPI file
- Search + tag filters for fast navigation
- Global API key (memory only) and per-endpoint key override
- In-page request testing for each endpoint
- Python and JavaScript request snippet toggle
- Success/error example response panels

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

## Build

```bash
npm run build
npm run preview
```

## Security and Storage Notes

- API keys are only kept in React state (memory) and are cleared on page refresh.
- No cookies or localStorage are used for key persistence.
- Browser-based requests may still be affected by CORS settings on the API server.
