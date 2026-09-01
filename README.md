# Thicket

Thicket is a local-first qualitative analysis workspace for coding conversations and other threaded text. It keeps source material and analysis on your computer while providing a focused interface for close reading, inductive open coding, structured codebooks, evidence organization, independent coding passes, and export.

Thicket is free software licensed under the [GNU General Public License v3.0](LICENSE).

## What Thicket does

- Opens local SQLite workspaces without uploading research data.
- Presents long discussions as a chronological reader or reply tree.
- Captures exact passages as evidence with source offsets and context.
- Creates open codes in place while reading.
- Organizes codes and evidence into candidate themes.
- Supports deductive whole-post coding with reusable codebooks.
- Keeps each coder and coding pass separate for blind or repeat coding.
- Tracks completed threads and supports reliability analysis and export.
- Imports Reddit discussions through the optional Arctic Shift adapter.
- Switches safely between corpus and labels databases from the interface.

## Quick start

Thicket requires Python 3.11 or newer, Node.js 20 or newer, and npm.

```bash
git clone https://github.com/abhik-roy/thicket.git
cd thicket
./thicket.sh setup
./thicket.sh start
```

Open <http://127.0.0.1:8000>. The first launch creates an empty local workspace in `data/` and a neutral starter codebook.

The launcher builds the web interface and serves the complete application from one local process. Run `./thicket.sh setup` again after dependency changes.

## Your first analysis

1. Open **Workspace** and choose an existing `corpus.db` and `labels.db`, or create a new pair.
2. Select or create your coder identity and choose a coding pass.
3. Select a codebook, or create one with **Manage codes**.
4. Open a thread from the work queue.
5. Highlight a meaningful passage to save it as evidence, apply an existing code, or create a new open code.
6. Open **Dataset** to review evidence, revise memos, connect codes, and develop themes.

Whole-post coding remains available in the thread reader. Click a code or use its `1`–`9` hotkey to apply it to the focused post.

## Workspaces and privacy

A workspace is a pair of SQLite files:

- `corpus.db` contains source threads and posts.
- `labels.db` contains coder identities, codebooks, labels, evidence segments, themes, assignments, and audit history.

These files, along with `.env`, logs, exports, and local configuration, are ignored by Git. Thicket does not include telemetry or a hosted service. Network access is only needed when installing dependencies or using an online importer.

Back up the labels database: it contains irreplaceable analysis. Stop Thicket before copying an active database. If SQLite `-wal` and `-shm` files are present, copy them alongside the database.

## Coding sessions

Every label and evidence segment belongs to a coder and pass. For example:

```text
Coder A · Pass 1  → first independent analysis
Coder B · Pass 1  → blind second-coder analysis
Coder A · Pass 2  → repeat analysis by Coder A
```

Changing sessions changes the visible analytic layer; it does not merge or delete work. Thicket validates stored coder identities when a workspace changes so an identity from one project cannot silently write into another.

## Keyboard controls

In the work queue:

- `J` / `K`: move between rows
- `Enter`: open the selected thread
- `/`: focus title search
- `Escape`: close the preview

In the thread reader:

- `J` / `K`: move between posts
- `1`–`9`: toggle the corresponding code
- `Enter`: mark or unmark the thread as complete
- `Escape`: return to the queue

## Development

Install dependencies and run both development servers:

```bash
./thicket.sh setup
./thicket.sh dev
```

The API runs at <http://127.0.0.1:8000> and Vite at <http://127.0.0.1:5173>.

Run all checks with:

```bash
./thicket.sh test
```

The equivalent commands are:

```bash
.venv/bin/python -m pytest
npm --prefix thicket-web test
npm --prefix thicket-web run lint
npm --prefix thicket-web run build
```

The default backend suite skips the external Arctic Shift smoke test. Run it
explicitly, with network access, using `.venv/bin/python -m pytest -m live`.

## Manual production launch

```bash
cd thicket-web
VITE_API_URL= npm run build
cd ..
THICKET_STATIC_DIR="$PWD/thicket-web/dist" \
  .venv/bin/uvicorn thicket.main:app --host 127.0.0.1 --port 8000
```

Thicket has no authentication, and its workspace picker can browse files readable by the process. Keep it bound to localhost unless you add authentication and filesystem confinement.

## Data import

Use **Import threads** for the optional Arctic Shift Reddit importer. No Reddit API credentials are required. Researchers remain responsible for applicable ethics review, data minimization, participant protection, platform terms, and legal requirements. Thicket supports methodological work; it does not replace research judgment.

## Contributing

Bug reports and focused pull requests are welcome. Before submitting a change, run `./thicket.sh test` and avoid committing source corpora, labels databases, exports, credentials, or identifiable research data.

## License

Copyright © 2026 Abhik Roy

Thicket is licensed under the [GNU General Public License, version 3](LICENSE). You may use, study, modify, and redistribute it under the terms of that license.
