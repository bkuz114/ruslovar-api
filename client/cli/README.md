# Ruslovar CLI Client

A thin command-line client for looking up Russian noun declensions from the Ruslovar API.

## Requirements

- Python 3.10+
- `httpx` (install with `pip install httpx`)

## Prerequisites

The CLI expects the Ruslovar API server to be running. By default, it connects to:

```
http://127.0.0.1:8000
```

If your server runs elsewhere, use `--url`:

```bash
python client/cli/declensions.py --word кролик --url http://localhost:9000
```

## Usage

```bash
python client/cli/declensions.py --word кролик
```

Output:

```json
{
  "word": "кролик",
  "matches": [
    {
      "root": "кролик",
      "invariant": false,
      "gender": "муж",
      "animacy": true,
      "singular": {
        "nominative": "кролик",
        "genitive": "кролика",
        "dative": "кролику",
        "accusative": "кролика",
        "instrumental": "кроликом",
        "prepositional": "кролике"
      },
      "plural": [
        {
          "nominative": "кролики",
          "genitive": "кроликов",
          "dative": "кроликам",
          "accusative": "кроликов",
          "instrumental": "кроликами",
          "prepositional": "кроликах"
        }
      ],
      "additional_forms": {
        "partitive": null,
        "locative": null,
        "vocative": null,
        "counting": null
      }
    }
  ]
}
```

By default, the client prints the API response as formatted JSON. For a human-readable table, use `--table`:

```bash
python client/cli/declensions.py --word кролик --table
```

Ouptut:

```text
$ python client/cli/declensions.py --word кролик --table
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

## Options

| Option | Description |
|---|---|
| `--word` | The Russian noun to look up (required). |
| `--table`, `-t` | Format the response as a human-readable table instead of JSON. |
| `--strict` | Require the word to be in dictionary form. |
| `--url` | Base URL of the Ruslovar API. Default: `http://127.0.0.1:8000`. |
| `--lang` | Language for table labels: `ru` or `en`. Default: `ru`. |
| `--color` | Color mode: `auto`, `always`, or `never`. Default: `auto`. |
| `--theme` | Color theme for table output. Use `--help` to see available themes. |

Run `python client/cli/declensions.py --help` for the full list.

## Language support

The table output can be displayed in Russian or English. This affects labels and metadata such as case names, gender, and section headings. It does not translate the declined forms themselves.

Russian (default):

```bash
python client/cli/declensions.py --word кролик --table --lang ru
```

English:

```bash
python client/cli/declensions.py --word кролик --table --lang en
```

## Color support

Colored output is enabled automatically when the terminal is detected as a TTY (interactive terminal). If colors do not appear (for example, in Git Bash on Windows), force them with:

```bash
python client/cli/declensions.py --word кролик --table --color always
```

### **Important**: Color support on Git Bash for Windows

Git Bash does not always report itself as a TTY. As a result, `--color auto` may not enable colored output even when the terminal supports it. **If you are using Git Bash and want colored table output, pass `--color always`.**

Example:

```bash
python client/cli/declensions.py --word кролик --table --color always
```

## Color themes

The table output supports multiple color themes. Themes are selected with `--theme`:

```bash
python client/cli/declensions.py --word кролик --table --theme high_contrast
```

Available themes include:

- `default`
- `high_contrast`
- `monochrome`
- `midnight`
- `ocean`
- `forest`
- `solarized`
- `dracula`
- `cyberpunk`
- `pastel`
- `sunset`
- `rainbow`

You can also use `random` to select a theme at random:

```bash
python client/cli/declensions.py --word кролик --table --theme random
```

Use `--help` to see the full list for your installed version.

**See note above regarding color support if running in Git Bash for Windows**.

## Example output

**basic usage (JSON)**

![cli-client-screenshots-basic-usage](https://raw.githubusercontent.com/bkuz114/ruslovar-api/main/docs/images/cli-client/cli-client-screenshots-basic-usage.png)

**Table**

![cli-client-screenshots-basic-table](https://raw.githubusercontent.com/bkuz114/ruslovar-api/main/docs/images/cli-client/cli-client-screenshots-table.png)

**english localization**

![cli-client-screenshots-english](https://raw.githubusercontent.com/bkuz114/ruslovar-api/main/docs/images/cli-client/cli-client-screenshots-english.png)

**default color theme**

![cli-client-screenshots-color-output1](https://raw.githubusercontent.com/bkuz114/ruslovar-api/main/docs/images/cli-client/cli-client-screenshots-color-1.png)

**`--theme sunset`**

![cli-client-screenshots-color-output2](https://raw.githubusercontent.com/bkuz114/ruslovar-api/main/docs/images/cli-client/cli-client-screenshots-color-2.png)
