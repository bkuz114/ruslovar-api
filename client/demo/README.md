# Ruslovar API Demo

A simple browser-based demo for the Ruslovar API. Allows users to enter a Russian noun and view its declension table.

## Prerequisites

- The Ruslovar API server must be running. See the main project Quickstart for setup instructions.
- A web server to serve the demo files locally. Any static file server will work. Options include:

  - Python: `python -m http.server 8080`
  - PHP: `php -S 127.0.0.1:8080`
  - Node: `npx serve`

  You may use whichever server you prefer.

## Setup

### 1. Configure the API URL

Edit `config.json` and set `api_base_url` to the URL where your Ruslovar API instance is running. The default is:

```json
{
  "api_base_url": "http://127.0.0.1:8000"
}
```

If the API is on a remote machine, use its address instead (e.g., `http://192.168.1.100:8000`).

### 2. Serve the demo

From this directory (`client/demo/`), start a static file server. For example:

**Python:**

```bash
python -m http.server 8080
```

**PHP:**

```bash
php -S 127.0.0.1:8080
```

**Node:**

```bash
npx serve -l 8080
```

### 3. Open the demo

Open the following URL in your browser:

```
http://127.0.0.1:8080
```

## Usage

- Enter a Russian noun in the input field (e.g., `кролик`).
- Optionally enable strict mode to require dictionary form.
- Press Enter or click the submit button.
- View the declension table.

The demo supports both Russian and English UI. Toggle the language using the buttons in the top right corner. Your preference is saved in browser local storage.

## How it works

The demo is a static web page that makes HTTP requests directly to the Ruslovar API. It does not have its own backend.

- `index.html` — page structure
- `assets/demo.css` — styling
- `assets/demo.js` — client-side logic
- `config.json` — API URL configuration

No frameworks, no build step, no external dependencies.

## Troubleshooting

**The demo loads, but lookups fail with a network error.**

Check that the API server is running and that `api_base_url` in `config.json` points at it. Also confirm the API has CORS configured to allow requests from this demo's origin.

**The API is running, but requests are blocked by CORS.**

The Ruslovar API's CORS settings are controlled by the `CORS_ORIGINS` variable in its `.env` file. For local development, setting `CORS_ORIGINS=*` allows requests from any origin.
