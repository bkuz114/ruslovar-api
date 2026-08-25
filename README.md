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

The detailed setup process is documented here: [Quickstart guide](docs/quickstart.md). In short:

1. Clone the repo

	```bash
	git clone https://github.com/bkuz114/ruslovar-api.git
	cd ruslovar-api
	```

2. Import and setup the `runouns` database (see [Database Setup](docs/database-setup.md))

3. Install dependencies for FastAPI server

	```bash
	python -m venv venv
	source venv/bin/activate  # or venv\Scripts\activate on Windows
	pip install -r requirements.txt
	```

4. Configure the FastAPI environment with details of your local `runouns` database

	```bash
	cp .env.example .env
	# then edit .env with details of your local runouns database
	```

5. Start the FastAPI server

	```bash
	python run.py
	```

6. Open `http://127.0.0.1:8000/docs` (Swagger UI) in your browser.

	Alternatively, run a test curl command:

	```bash
	curl "http://127.0.0.1:8000/api/v1/nouns/кролик/declensions"
	```

## CLI client

The repository includes a thin CLI client for testing the API from the terminal:

```bash
python client/declensions.py --word кролик
```

(Note: it assumes a base URL for the FastAPI server of `http://127.0.0.1:8000`; to change, supply `--url` argument.)

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

## Documentation

- [Quickstart](docs/quickstart.md) — setup and run instructions.
- [Database Setup](docs/database-setup.md) — preparing the MySQL database.
- [Database Schema](docs/database.md) — structure of the underlying data.
- [API Contract](docs/api.md) — endpoint and response documentation.
- [Developer Guide](docs/developer-guide.md) — architecture, request lifecycle, and extension guide.
- [Demo README](client/demo/README.md) — browser demo usage.

## License

MIT
