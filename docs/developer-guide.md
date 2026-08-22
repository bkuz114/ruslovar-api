# Developer Guide

This guide explains how the Ruslovar API works under the hood. It is intended for developers who want to understand the code, modify it, or extend it with new features.

It assumes you have completed the Quickstart and Database Setup guides, and that you have a working local instance. It does not assume prior experience with FastAPI, but it does assume general familiarity with Python.

## What is FastAPI?

FastAPI is a Python web framework for building APIs. It is built on top of standard Python type hints and a library called Pydantic.

At its core, FastAPI lets you define routes as Python functions decorated with `@app.get` or `@app.post`. The decorator tells FastAPI what HTTP method and path the function handles.

A minimal example:

```python
from fastapi import FastAPI

app = FastAPI()

@app.get("/hello")
def hello():
    return {"message": "hello world"}
```

When a request arrives at `/hello`, FastAPI calls the `hello()` function and returns its result as JSON.

FastAPI also uses Pydantic models to define the shape of request and response data.

A minimal Pydantic model:

```python
from pydantic import BaseModel

class Message(BaseModel):
    message: str
```

You can tell FastAPI to use this model as the response type:

```python
@app.get("/hello", response_model=Message)
def hello():
    return Message(message="hello world")
```

FastAPI then validates the return value against the model, and it auto-generates API documentation from the same definition. The interactive documentation at `/docs` is built from these route definitions and Pydantic models.

In this project, FastAPI routes are defined in `app/api/`, response models are defined in `app/models.py`, and the app itself is created in `app/main.py`.

If you are unfamiliar with decorators or Pydantic models, a quick search for "Python decorators" and "Pydantic models" will provide the background you need. The rest of this guide will make more sense once those two concepts are familiar.

## Project structure

The repository is organized as follows:

```
ruslovar-api/
├── app/
│   ├── __init__.py
│   ├── main.py          # FastAPI app creation, CORS, route inclusion
│   ├── config.py        # Environment-based settings
│   ├── db.py            # MySQL connection and query functions
│   ├── models.py        # Pydantic response schemas
│   ├── services.py      # Noun lookup and response assembly
│   └── api/
│       ├── __init__.py
│       ├── router.py    # Aggregates API route modules
│       └── nouns.py     # Noun declension endpoint
├── client/
│   └── declensions.py   # CLI client for testing the API
├── docs/
├── sql/
├── run.py               # Local development entry point
├── requirements.txt
└── .env.example
```

The code is organized by concern. Each file has a single clear responsibility:

- `main.py` helper script for starting the FastAPI server
- `config.py` reads settings from environment variables or a `.env` file.
- `db.py` owns all SQL queries and the MySQL connection.
- `models.py` defines the JSON response shapes as Pydantic models.
- `services.py` contains the lookup logic: resolving words to roots and assembling declension tables.
- `api/nouns.py` defines the HTTP endpoint and maps errors to HTTP responses.
- `api/router.py` collects route modules so `main.py` only needs to import one router.

The dependency flow goes one direction:

```
HTTP route  →  service layer  →  database layer
(api/nouns.py)  (services.py)     (db.py)
```

Routes never touch SQL. Services never touch HTTP. The database layer has no knowledge of the API.

## Configuration (`.env` file)

The API reads its settings from environment variables or a `.env` file. This file does not exist by default — you create it by copying `.env.example` (a helper file contained in this repo's root):

```bash
cp .env.example .env
```

The file contains key-value pairs:

```
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=YOUR_MYSQL_PASSWORD
DB_NAME=runouns
CORS_ORIGINS=*
```

These settings are loaded by `app/config.py` using Pydantic. Each field in the `Settings` class corresponds to a key in this file. If a key is missing, Pydantic falls back to the default value defined in the class.

### Location of `.env` file

**The `.env` file must be in the current working directory when you run the server.** Since the expected workflow is to run `python run.py` from the repo root (see [Running the server](#running-the-server)), the `.env` file belongs in the repo root.

The `.env` file is git-ignored and should never be committed. It contains local credentials.

## Running the server

The project includes a `run.py` entry point at the repo root:

```bash
python run.py
```

This starts uvicorn on `http://127.0.0.1:8000`. The server runs with auto-reload enabled, so changes to the code are picked up automatically during development.

Your `.env` file must be in the repo root (or whichever directory you start the server from), as described in the Quickstart.

Alternatively, the server can be started directly with uvicorn:

```bash
uvicorn app.main:app --reload
```

The `app.main:app` string tells uvicorn to import the `app` object from the `app.main` module.

While the server is running, you can:

- Open the Swagger UI at `http://127.0.0.1:8000/docs`
- Use the CLI client: `python client/declensions.py --word кролик`
- Make requests with curl or a browser

The server should stay running while you explore the code. If you make changes, auto-reload will restart it.

## Request lifecycle

When a client requests a noun declension, the request flows through the following layers:

```
Client (browser / CLI / curl)
        │
        ▼
FastAPI app (main.py)
        │
        ▼
Route handler (api/nouns.py)
        │
        ▼
Service layer (services.py)
        │
        ▼
Database access (db.py)
        │
        ▼
MySQL (nouns_morf)
```

The response flows back up through the same layers.

Here is what happens at each step for a request like:

```
GET /api/v1/nouns/кролика/declensions?strict=false
```

### 1. FastAPI routes the request

The route is defined in `app/api/nouns.py`:

```python
@router.get("/{word}/declensions")
def get_noun_declensions(word: str, strict: bool = False):
    ...
```

FastAPI matches the path, extracts `word = "кролика"` and `strict = False`, and calls the function.

### 2. The route handler calls the service layer

The handler in `api/nouns.py` does not perform lookups itself. It calls `services.get_noun_declensions()`:

```python
try:
    return services.get_noun_declensions(word=word, strict=strict)
except LookupError as e:
    raise HTTPException(status_code=404, detail=str(e))
```

If the service layer raises a `LookupError` (word not found, not a dictionary form in strict mode), the route converts it into a 404 response with a clear message.

### 3. The service layer resolves the word and fetches rows

`services.py` is where the actual lookup happens. It:

1. Looks up the input word in the database.
2. If the word is not a dictionary root, it follows parent references to the root.
3. Fetches all singular declensions of the root.
4. Finds the nominative plural form, if one exists.
5. Fetches all plural declensions.
6. Assembles the rows into the response structure.

All database access goes through `db.py`. The service layer never writes SQL directly.

### 4. The database layer executes queries

`db.py` contains functions for each query the service layer needs:

- `lookup_word()` — find a word by surface form.
- `lookup_by_code()` — find a row by its unique code.
- `get_children()` — find all rows whose parent is a given code.
- `find_nominative_plural()` — find the nominative plural for a root.

Each function opens a cursor, executes a parameterized SQL query, and returns rows as dictionaries.

### 5. The response is validated and returned

The service layer returns a `NounDeclensionResponse` Pydantic object. FastAPI validates it against the model and serializes it to JSON. The client receives the full declension table.

## The database lookup

The database structure is documented in full in [Database Schema](database.md). The essential points:

- Each word form is a row in `nouns_morf`.
- Each row has a `code` and a `code_parent`.
- Dictionary roots have `code_parent = 0`.
- Singular declensions point directly to their root.
- Plural declensions point to the nominative plural, which points to the root.

This creates a two-level hierarchy:

```
root form (code_parent = 0)
├── singular declensions (code_parent = root.code)
└── nominative plural (code_parent = root.code, plural = 1)
    └── plural declensions (code_parent = nom_pl.code)
```

The lookup algorithm in `services.py` walks this hierarchy:

1. Look up the input word.
2. If `code_parent != 0`, follow the parent chain until reaching a row with `code_parent = 0`. This is the dictionary root.
3. Fetch all children of the root that are singular (`plural = 0`).
4. Find the nominative plural child (`plural = 1` and `wcase = 'им'`).
5. Fetch all children of the nominative plural.
6. Assemble the rows into the response structure, grouping by grammatical case.

The indexes described in the Database Setup guide make these lookups fast. Without them, queries on `word`, `code`, and `code_parent` would require full table scans over 760,000 rows.

## Extending the project

The structure is designed so that adding a new grammar type is additive, not a rewrite.

Consider adding adjective declensions as a concrete example.

### 1. Add database queries

The adjective data lives in a different table (`ruadjectives.adjectives_morf`) with a similar parent-child structure. New query functions would be added to `db.py`:

```python
def lookup_adjective(conn, word: str) -> dict | None:
    ...

def get_adjective_children(conn, parent_code: int) -> list[dict]:
    ...
```

Existing functions remain unchanged.

### 2. Add response models

New Pydantic models would be added to `models.py`, or a new models file could be created for adjectives. The noun models stay as they are.

### 3. Add service logic

A new function like `get_adjective_declensions()` would be added to `services.py` or to a new service module. It would follow the same pattern: resolve, fetch, assemble.

### 4. Add a route

A new route module `app/api/adjectives.py` would define the adjective endpoints, following the same pattern as `nouns.py`. It would be included in `api/router.py`.

### 5. Update the client and docs

`client/declensions.py` could gain a `--grammar` flag, or a separate client script could be added. The API docs and database docs would be extended.

No existing code needs to be rewritten. Each layer grows without breaking what is already there.

## Where to go next

- [API Contract](api.md) — the full HTTP contract.
- [Database Schema](database.md) — the structure of the MySQL data.
- [Quickstart](quickstart.md) — setup and run instructions.
- [Database Setup](database-setup.md) — preparing the MySQL database.
