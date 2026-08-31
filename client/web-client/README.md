# Ruslovar API Demo

A browser-based webapp for the Ruslovar API. Allows users to query Russian nouns and view declension tables.

## Prerequisites

- The Ruslovar API server must be running. See the main project Quickstart for setup instructions.
- A web server to serve the web client files locally. Any static file server will work. Options include:

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

### 2. Serve the web client

From this directory (`client/web-client/`), start a static file server. For example:

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

### 3. Open the web client

Open the following URL in your browser:

```
http://127.0.0.1:8080
```

## Usage

The web client provides two views for querying Russian nouns:

**Single Noun Lookup**

- Select **Single Word** from the view dropdown.
- Enter a Russian noun in the input field (e.g., `кролик`).
- Optionally enable strict mode to require dictionary form.
- Press Enter or click the submit button.
- View the declension table.

**Batch Noun Lookup**

- Select **Batch Lookup** from the view dropdown.
- Upload a plain text file containing one word per line.
- Optionally use `#` headings to organize words into categories.
- Optionally include YAML frontmatter for file metadata (e.g., `title`).
- Click the submit button to send the batch request.
- Results are grouped by category and displayed in collapsible sections.

The web client supports both Russian and English UI. Toggle the language using the buttons in the top right corner. Your preference is saved in browser local storage.

## How it works

The web client is a static web app that makes HTTP requests directly to the Ruslovar API. It does not have its own backend.

- `index.html` — application shell
- `css/` — stylesheets (base, components, view-specific)
- `js/core/` — core services (config, i18n, data layer, store, parsers, DOM utilities, view registry)
- `js/views/` — individual views (single noun lookup, batch noun lookup)
- `config.json` — API URL configuration

No frameworks, no build step, no external dependencies.

For a detailed architecture overview, see documents in `docs/developer/web-client/`. (starting point: `docs/developer/web-client/developer-web-client.md`).

## Troubleshooting

**The web client loads, but lookups fail with a network error.**

Check that the API server is running and that `api_base_url` in `config.json` points at it. Also confirm the API has CORS configured to allow requests from this demo's origin.

**The API is running, but requests are blocked by CORS.**

The Ruslovar API's CORS settings are controlled by the `CORS_ORIGINS` variable in its `.env` file. For local development, setting `CORS_ORIGINS=*` allows requests from any origin.
