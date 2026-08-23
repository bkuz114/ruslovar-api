# Ruslovar API

A FastAPI server that provides Russian noun declensions from the [sshra/database-russian-morphology](https://github.com/sshra/database-russian-morphology) dataset.

The API queries a local MySQL database containing Russian noun morphology data and returns structured JSON with full declension tables for any Russian noun.

## Features

- Resolve any declined noun to its dictionary form automatically.
- Return all singular and plural declensions, including rare and archaic forms.
- Strict mode for requiring dictionary form.
- Interactive Swagger UI documentation at `/docs`.
- Fully offline-capable: no CDN dependency for Swagger UI.
- Bilingual browser demo (Russian / English) for testing the API.
- CLI client for quick lookups from the terminal.

## Requirements

- Python 3.10+
- MySQL with the `runouns` database imported (see [Database Setup](docs/database-setup.md))

## Quickstart

Follow the [Quickstart guide](docs/quickstart.md) to set up the database, configure the environment, and run the server locally.

In short:

```bash
# 1. Set up the database (see docs/database-setup.md)

# 2. Install dependencies
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt

# 3. Configure the environment
cp .env.example .env
# (then edit .env with details of your local runouns database)

# 4. Run the server
python run.py
```

Then open `http://127.0.0.1:8000/docs` in your browser.

## Documentation

- [Quickstart](docs/quickstart.md) — setup and run instructions.
- [Database Setup](docs/database-setup.md) — preparing the MySQL database.
- [Database Schema](docs/database.md) — structure of the underlying data.
- [API Contract](docs/api.md) — endpoint and response documentation.
- [Developer Guide](docs/developer-guide.md) — architecture, request lifecycle, and extension guide.
- [Demo README](client/demo/README.md) — browser demo usage.

## CLI client

The repository includes a thin CLI client for testing the API from the terminal:

```bash
python client/declensions.py --word кролик
```

## Demo Page

A browser-based demo page is included in `client/demo/`. It provides a simple form for entering a noun and displays the declension table.

To run the demo, see the [Demo README](client/demo/README.md).

In short:

1. Start a **separate** web server for the demo page:

```bash
cd client/demo
python -m http.server 8080
```

(or your preferred web server)

2. Open `http://127.0.0.1:8080` in your browser.

## License

MIT
