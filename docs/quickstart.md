# Quickstart

This guide walks through setting up and running the Ruslovar API locally.

Before starting, complete the [Database Setup](database-setup.md) guide. You should have a MySQL database named `runouns` with the `nouns_morf` table populated and indexed.

## Prerequisites

- Python 3.10 or higher
- MySQL installed and running
- The `runouns` database ready (see Database Setup)

Verify Python is installed:

```bash
python --version
```

You should see `Python 3.10.x` or newer.

## 1. Clone the repository

```bash
git clone https://github.com/bkuz114/ruslovar-api.git
cd ruslovar-api
```

## 2. Create a virtual environment

A virtual environment keeps this project's dependencies isolated from other Python projects on your machine. Set it up below.

(Note: If you prefer to install dependencies globally instead of using a virtual environment, skip this step. A virtual environment is recommended, but not required.)

Create the environment:

```bash
python -m venv venv
```

Activate it:

**Windows (Command Prompt or PowerShell):**

```bash
venv\Scripts\activate
```

**Windows (GitBash):**

```bash
source venv/Scripts/activate
```

**macOS / Linux:**

```bash
source venv/bin/activate
```

You should see `(venv)` appear at the start of your terminal prompt. This means the virtual environment is active.

## 3. Install dependencies

```bash
pip install -r requirements.txt
```

## 4. Configure the `.env` file

The API reads database connection settings from a `.env` file in the repository root (the directory where `run.py` lives).

Copy the example file:

```bash
cp .env.example .env
```

Or on Windows (Command Prompt):

```bash
copy .env.example .env
```

Open `.env` in a text editor and set the values to match your MySQL setup:

```
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=YOUR_MYSQL_PASSWORD
DB_NAME=runouns
CORS_ORIGINS=*
```

Replace `YOUR_MYSQL_PASSWORD` with the password you use for MySQL.

**Important:** The `.env` file must be in the same directory from which you run the server. If you run the server from the repository root, the `.env` file belongs in the repository root.

## 5. Run the server

From the repository root:

```bash
python run.py
```

You should see output similar to:

```
INFO:     Uvicorn running on http://127.0.0.1:8000
```

The server is now running on `http://127.0.0.1:8000`.

## 6. Verify it works

Choose one of the following methods to confirm the API is working.

### Option A: Swagger UI (browser)

Open your browser and go to:

```
http://127.0.0.1:8000/docs
```

This loads the interactive Swagger UI. You should see the endpoint `GET /api/v1/nouns/{word}/declensions` listed.

To test it:

1. Click on the endpoint to expand it.
2. Click "Try it out".
3. In the `word` field, type `кролик`.
4. Click "Execute".

You should see a `200` response with JSON containing the declension table for `кролик`.

### Option B: CLI client

Open a second terminal, activate the virtual environment again if needed, and run:

```bash
python client/declensions.py --word кролик
```

You should see the declension table printed as formatted JSON.

Try a declined form to see automatic root resolution:

```bash
python client/declensions.py --word кролика
```

### Option C: curl

```bash
curl "http://127.0.0.1:8000/api/v1/nouns/кролик/declensions"
```

Or for a declined form:

```bash
curl "http://127.0.0.1:8000/api/v1/nouns/кролика/declensions"
```

The response is the same JSON you would see in the Swagger UI.

## Troubleshooting

### Server starts but requests fail with 500 and database connection error

Check the database credentials in `.env`. Make sure `DB_PASSWORD` matches your MySQL root password, and that `DB_USER` and `DB_NAME` are correct.

Confirm MySQL is running:

```bash
mysql -u root -p -e "SELECT 1;"
```

### Server can't find the `.env` file

The `.env` file must be in the current working directory when you run `python run.py`. If you run the server from a different directory, the file will not be found and default values will be used.

Run the server from the repository root, or move the `.env` file to wherever you are running the command from.

### Port 8000 is already in use

If you see an error like `address already in use`, another process is using port 8000. Either stop that process, or change the port in `run.py` to something else (e.g., 8001).

### The Swagger UI loads but the page is blank

If you are offline or behind a restrictive firewall, the Swagger UI may fail to load because it fetches assets from a CDN. This is a known limitation. The API itself still works; only the documentation page is affected.

## Next Steps

Once the server is running, you can explore the full API contract in [API Documentation](api.md) or read about the database structure in [Database Schema](database.md).
