import { useEffect, useState, type FormEvent } from 'react'
import {
  useDiscoveredDatabases, useSwitchWorkspace, useWorkspace,
} from '../api/workspace'

export interface WorkspaceManagerProps {
  onClose: () => void
  onSwitched: () => void
}

export function WorkspaceManager({
  onClose, onSwitched,
}: WorkspaceManagerProps) {
  const workspace = useWorkspace()
  const discovered = useDiscoveredDatabases()
  const switchWorkspace = useSwitchWorkspace()
  const [corpusPath, setCorpusPath] = useState('')
  const [labelsPath, setLabelsPath] = useState('')
  const [createMissing, setCreateMissing] = useState(false)

  useEffect(() => {
    if (!workspace.data) return
    setCorpusPath(workspace.data.corpus_db)
    setLabelsPath(workspace.data.labels_db)
  }, [workspace.data])

  function submit(event: FormEvent) {
    event.preventDefault()
    switchWorkspace.mutate({
      corpus_db: corpusPath,
      labels_db: labelsPath,
      create_missing: createMissing,
    }, {
      onSuccess: onSwitched,
    })
  }

  const paths = discovered.data?.paths ?? []

  return (
    <div
      role="dialog"
      aria-label="Manage workspace"
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4"
    >
      <form
        onSubmit={submit}
        className="surface max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl p-6"
      >
        <header className="flex items-start gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-800">
              Local workspace
            </p>
            <h2 className="mt-1 text-xl font-semibold">Corpus and coding data</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Select an existing corpus and its labels database, or create a
              new local pair. Switching never uploads or deletes either file.
            </p>
          </div>
          <button
            type="button" onClick={onClose} aria-label="Close workspace manager"
            className="ml-auto btn-secondary"
          >
            Close
          </button>
        </header>

        {workspace.isPending && (
          <p className="mt-5 text-sm text-slate-500">Loading workspace…</p>
        )}
        {workspace.isError && (
          <p role="alert" className="mt-5 text-sm text-red-700">
            Could not read the current workspace.
          </p>
        )}
        {workspace.data && (
          <div className="mt-5 grid grid-cols-5 gap-2">
            {Object.entries(workspace.data.counts).map(([name, count]) => (
              <div key={name} className="rounded-lg bg-slate-100 p-2 text-center">
                <div className="font-semibold tabular-nums">{count}</div>
                <div className="text-[11px] capitalize text-slate-500">{name}</div>
              </div>
            ))}
          </div>
        )}

        <datalist id="thicket-database-paths">
          {paths.map((path) => <option key={path} value={path} />)}
        </datalist>

        <div className="mt-6 grid gap-4">
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Corpus database
            <input
              required
              list="thicket-database-paths"
              value={corpusPath}
              onChange={(event) => setCorpusPath(event.target.value)}
              placeholder="/path/to/corpus.db"
              className="field font-mono text-xs font-normal"
            />
            <span className="text-xs font-normal text-slate-500">
              Contains source threads and replies.
            </span>
          </label>
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Labels database
            <input
              required
              list="thicket-database-paths"
              value={labelsPath}
              onChange={(event) => setLabelsPath(event.target.value)}
              placeholder="/path/to/labels.db"
              className="field font-mono text-xs font-normal"
            />
            <span className="text-xs font-normal text-slate-500">
              Contains coders, codebooks, labels, passes, and completion.
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={createMissing}
              onChange={(event) => setCreateMissing(event.target.checked)}
              className="mt-1"
            />
            <span>
              Create missing database files
              <span className="block text-xs text-slate-500">
                Leave off when opening existing work to catch path mistakes.
              </span>
            </span>
          </label>
        </div>

        {switchWorkspace.isError && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {switchWorkspace.error.message}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            type="submit"
            disabled={switchWorkspace.isPending || !corpusPath || !labelsPath}
            className="btn-primary"
          >
            {switchWorkspace.isPending ? 'Switching…' : 'Use this workspace'}
          </button>
        </div>
      </form>
    </div>
  )
}
