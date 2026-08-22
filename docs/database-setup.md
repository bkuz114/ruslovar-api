# Database Setup

This guide walks through setting up the MySQL database required by the Ruslovar API.

The API does not store dictionary data in Python. It queries a local MySQL database at runtime. The data comes from the [sshra/database-russian-morphology](https://github.com/sshra/database-russian-morphology) project, which provides SQL dumps of Russian morphological data.

The table used for noun declensions is `nouns_morf` inside a database called `runouns`. The original upstream dump contains no indexes on lookup-critical columns, which makes queries slow. This project adds three indexes to make word lookups fast.

Two setup paths are available:

- **Option A (recommended):** Use a prepared dump that already includes the indexes. Fastest path to a working setup.
- **Option B (reproducible):** Download the original upstream dump and add the indexes yourself. For users who want full control or wish to make further modifications.

---

## Prerequisites

### Install MySQL

Install MySQL on your platform if you have not already done so:

- Windows: https://dev.mysql.com/doc/refman/8.0/en/windows-installation.html
- macOS: https://dev.mysql.com/doc/refman/8.0/en/macos-installation.html
- Linux: https://dev.mysql.com/doc/refman/8.0/en/linux-installation.html

### Verify MySQL is working

Open a terminal and check that the MySQL client is available:

```bash
mysql --version
```

You should see output similar to:

```
mysql  Ver 8.0.x for ...
```

Next, confirm the MySQL server is running and accessible:

```bash
mysql -u root -p -e "SELECT 1;"
```

Enter your MySQL root password when prompted. If the server is running, you should see:

```
+---+
| 1 |
+---+
| 1 |
+---+
```

If either command fails:

- Make sure the MySQL service is started (platform-dependent).
- Make sure the `mysql` client is in your PATH.
- Check your root password.

Once both commands succeed, continue below.

---

## Option A: Use the prepared dump (recommended)

This dump already includes the indexes described in this guide. It is identical to the upstream data, with only the indexes added.

### 1. Download the prepared dump

Download the prepared SQL dump from:

[PLACEHOLDER_URL]

Save it to a location you can access from the terminal.

### 2. Create the database

```bash
mysql -u root -p -e "CREATE DATABASE runouns;"
```

### 3. Import the dump

```bash
mysql -u root -p runouns < path/to/prepared_dump.sql
```

Replace `path/to/prepared_dump.sql` with the actual path.

**Note**: This step may take several minutes depending on your machine.

### 4. Verify

Skip to the Verification section below.

---

## Option B: Replicate from upstream

Use this path if you want to start from the original Sshra dump and make your own modifications. This is also the fully reproducible path.

### 1. Download the upstream dump

Download the nouns dump from the Sshra repository:

```
https://github.com/sshra/database-russian-morphology/raw/master/words-russian-nouns-morf.sql.gz
```

### 2. Unpack the file

```bash
gzip -d words-russian-nouns-morf.sql.gz
```

This produces `words-russian-nouns-morf.sql`.

### 3. Create the database

```bash
mysql -u root -p -e "CREATE DATABASE runouns;"
```

### 4. Import the upstream dump

```bash
mysql -u root -p runouns < words-russian-nouns-morf.sql
```

Replace `words-russian-nouns-morf.sql` with the actual path.

**Note**: This step may take several minutes depending on your machine.

### 5. Add indexes

Run the provided SQL file to add the indexes:

```bash
mysql -u root -p runouns < sql/add_noun_indexes.sql
```

**Note**: The file contains:

```sql
CREATE INDEX code_idx ON nouns_morf (code);
CREATE INDEX code_parent_idx ON nouns_morf (code_parent);
CREATE INDEX word_idx ON nouns_morf (word(5));
```

These indexes match the reference setup used by this project.

### 6. Verify

Proceed to the Verification section.

---

## Verification

Confirm the table exists and contains the expected number of rows:

```bash
mysql -u root -p runouns -e "SELECT COUNT(*) FROM nouns_morf;"
```

Expected output:

```
+----------+
| COUNT(*) |
+----------+
|   767694 |
+----------+
```

If you used Option B, also confirm the indexes are present:

```bash
mysql -u root -p runouns -e "SHOW INDEXES FROM nouns_morf;"
```

You should see entries for `code_idx`, `code_parent_idx`, and `word_idx` in addition to the primary key.

---

## Next Steps

With the database ready, continue to the Quickstart guide to configure the API and start the server.
