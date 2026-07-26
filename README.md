# Thicket

Thicket is a standalone, local-first qualitative coding application. It
provides a work queue, hierarchical conversation viewer, custom codebooks,
independent coding passes, completion tracking, reliability analysis, and
exports in one focused workspace.

The software is topic-agnostic. Its optional Arctic Shift adapter imports
Reddit conversations, but data collection is not required to use the coding
workspace.

## What stays local

Source material and human coding work are never committed by default:

- `data/corpus.db` contains imported source material;
- `data/labels.db` contains coders, codebooks, labels, and completion status;
- `output/`, `exports/`, `config.yaml`, and logs are also ignored.

Back up `data/labels.db`. It contains irreplaceable human work. The public
repository contains application code, examples, and tests only.

## Install and run

Requirements are Python 3.11–3.13, Node.js 20+, and npm. Internet access is
needed only when using an online importer.

```bash
git clone https://github.com/abhik-roy/thicket.git
cd thicket

python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt

cd thicket-web
npm install
cd ..
```

Start the API:

```bash
uvicorn thicket.main:app --host 127.0.0.1 --port 8000
```

Start the frontend in a second terminal:

```bash
cd thicket-web
npm run dev -- --host 127.0.0.1
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). Thicket creates both
SQLite databases and the neutral starter codebook automatically.

To store the databases elsewhere:

```bash
export THICKET_CORPUS_DB=/absolute/path/to/corpus.db
export THICKET_LABELS_DB=/absolute/path/to/labels.db
```

## How coding works

1. Select or create a coder identity and choose a coding pass.
2. Import a corpus or open an existing local corpus.
3. Use **Manage codes** to select a codebook, create a project codebook, and
   add, rename, recolor, assign hotkeys to, or delete unused codes.
4. Filter the work queue and open an item.
5. Focus a reply, then click one or more codes or press its `1`–`9` hotkey.
   Selecting an applied code again removes that label.
6. Review the conversation and choose **Mark done**. Completion status is
   separate from labels, so a thread can be unmarked without losing coding.

Every label records the item, code, coder, pass, and timestamp. Changes save
immediately to `data/labels.db`. Multiple codes may be applied to the same
reply.

Codes that have already been used cannot be deleted, which prevents a codebook
edit from silently destroying labels. Custom codebooks containing used codes
are protected for the same reason.

## Coding passes and blindness

A coding pass is an independent layer of coding for one coder. Passes are not
workflow stages and pass 2 does not overwrite pass 1.

For example:

```text
Coder A · Pass 1 ── labels and completion visible only in A/1
Coder B · Pass 1 ── separate blind labels for agreement analysis
Coder A · Pass 2 ── a fresh recode, isolated from A/1 and B/1
```

The interface queries labels using both the active coder and pass. While
working as Coder A in Pass 1, it does not show Coder B's labels or even Coder
A's Pass 2 labels. Completion markers are isolated the same way. This supports:

- independent double-coding by two people using the same pass number;
- test–retest coding by one person using two pass numbers;
- agreement and adjudication after blind coding is complete.

Changing sessions only changes which layer is visible; it does not delete or
merge existing work. Confirm the coder and pass badge before coding.

## Keyboard controls

In the queue:

- `J` / `K` moves between rows;
- `Enter` opens the highlighted item;
- `/` focuses title search;
- `Escape` closes the preview.

In reply coding:

- `J` / `K` moves between replies;
- `1`–`9` toggles the matching code;
- `Enter` marks or unmarks completion;
- `Escape` returns to the queue.

## Optional Arctic Shift import

Choose **Import threads**, enter a subreddit and query, choose 1–100 results,
and decide whether to fetch complete reply trees. No Reddit API credentials are
needed. Imported content is written only to `data/corpus.db`.

## Backups and production build

Stop active coding before copying the labels database. With SQLite WAL mode,
back up these files together when present:

```text
data/labels.db
data/labels.db-wal
data/labels.db-shm
```

Build the frontend with:

```bash
cd thicket-web
npm run build
```

Set `VITE_API_URL` before starting or building when the API is not available at
the frontend's default origin.

## Troubleshooting

- Empty queue: clear restrictive filters and confirm the corpus database has
  imported items.
- Missing reply tree: import with complete reply hydration enabled.
- Empty palette: open **Manage codes**, select a codebook, and add a code.
- Import failure: verify the subreddit/query and retry with a smaller limit.
- Connection error: confirm the API responds at
  `http://127.0.0.1:8000/health`.

## Research responsibility

Follow applicable ethics guidance, minimize collection, protect identities,
avoid reverse-searchable quotations where appropriate, document inclusion
criteria, and follow source-platform terms and applicable law. Thicket supports
coding; it does not replace ethical review or methodological judgment.

## Development

```bash
python -m pytest
cd thicket-web
npm test
npm run build
npm run lint
```
