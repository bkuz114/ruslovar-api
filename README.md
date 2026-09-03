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

## Quickstart (Docker)

The project is fully containerized, with all needed images on Dockerhub. Both ARM and AMD64 architecture are supported. All you need to run it is Docker. If you don't have Docker or wish to have full control over each component, see [#quickstart-manual](#quickstart-manual)

### Requirements

- Docker with the Compose plugin (`docker compose`).

### Steps

1. Clone the repo

	```bash
	git clone https://github.com/bkuz114/ruslovar-api.git
	cd ruslovar-api
	```

2. Run Docker compose

	```bash
	docker compose up -d
	```

3. Open `http://127.0.0.1:8000/docs` (Swagger UI) and `http://127.0.0.1:8080` (demo page) in your browser and make sure they work.

	Alternatively, run a test curl command:

	```bash
	curl "http://127.0.0.1:8000/api/v1/nouns/кролик/declensions"
	```

	**IMPORTANT**: It can take 2-3 minutes for the MySQL container to fully load on the first run. Until then, the API will be unreachable.

That's it.

## Quickstart (Manual)

If you don't have access to Docker, hate it, or want full control over each component, the manual process is also documented.

### Requirements

- Python 3.10+
- MySQL 8.0

### Steps

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
python client/cli/declensions.py --word кролик
```

By default, the client prints the API response as formatted JSON. For a human-readable table, use `--table`:

```bash
python client/cli/declensions.py --word кролик --table
```

Output:

```
Корень:          кролик
Род:             муж
Одушевлённость:  одушевлённое

Единственное число:
  Именительный  кролик
  Родительный   кролика
  Дательный     кролику
  Винительный   кролика
  Творительный  кроликом
  Предложный    кролике

Множественное число:
  Именительный  кролики
  Родительный   кроликов
  Дательный     кроликам
  Винительный   кроликов
  Творительный  кроликами
  Предложный    кроликах
```

The table output supports language selection (`--lang ru` or `--lang en`), colored terminal output (`--color always`, `--color never`, or the default `--color auto`), and alternate color themes (`--theme high_contrast`).

The client assumes the FastAPI server is running at `http://127.0.0.1:8000`. Use `--url` to point to a different base URL.

Run `python client/cli/declensions.py --help` for all options.

### Color support (Git Bash on Windows)

Git Bash does not always report itself as an interactive terminal. As a result, `--color auto` may not enable colored output even when the terminal supports it. If you are using Git Bash and want colored table output, pass `--color always`.

Example:

```bash
python client/cli/declensions.py --word кролик --table --color always
```

## Demo Page

A browser-based demo page is included in `client/demo/`. It provides a simple form for entering a noun and displays the declension table.

The demo page is included in the Docker setup, running in its own nginx container on port `8080`. After running `docker compose up`, you can view it at `http://127.0.0.1:8080`.

For the non-Docker route:

1. Start a **separate** web server for the demo page:

	```bash
	cd client/demo
	python -m http.server 8080
	```

	(or your preferred web server)

2. Open `http://127.0.0.1:8080` in your browser.

(see [Demo README](client/demo/README.md) for further info.)

## Documentation

- [Quickstart](docs/quickstart.md) — setup and run instructions.
- [Database Setup](docs/database-setup.md) — preparing the MySQL database.
- [Database Schema](docs/database.md) — structure of the underlying data.
- [API Contract](docs/api.md) — endpoint and response documentation.
- [Developer Guide](docs/developer-guide.md) — architecture, request lifecycle, and extension guide.
- [Demo README](client/demo/README.md) — browser demo usage.

## License

MIT
