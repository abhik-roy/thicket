import { useState, type FormEvent } from 'react'
import { useArcticImport } from '../api/threads'

export interface ArcticImportPanelProps {
  onClose: () => void
}

export function ArcticImportPanel({ onClose }: ArcticImportPanelProps) {
  const [subreddit, setSubreddit] = useState('')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(25)
  const [hydrate, setHydrate] = useState(true)
  const importer = useArcticImport()

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    importer.mutate({ subreddit, query, limit, hydrate })
  }

  return (
    <div
      role="dialog"
      aria-label="Import from Arctic Shift"
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4 backdrop-blur-[2px]"
    >
      <form
        onSubmit={handleSubmit}
        className="surface w-full max-w-lg rounded-2xl p-6 shadow-2xl"
      >
        <div className="flex items-start gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-800">
              Optional source adapter
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">
              Import Reddit threads
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Search the Arctic Shift archive. Results and comments are written
              only to your local corpus database.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close importer"
            className="ml-auto rounded-lg px-3 py-2 text-slate-500 hover:bg-slate-100"
          >
            ✕
          </button>
        </div>

        <div className="mt-6 grid gap-4">
          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            Subreddit
            <input
              required
              value={subreddit}
              onChange={(event) => setSubreddit(event.target.value)}
              placeholder="e.g. AskAcademia"
              className="field text-sm font-normal"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            Search query
            <input
              required
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="e.g. peer review"
              className="field text-sm font-normal"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            Maximum threads
            <input
              type="number"
              min={1}
              max={100}
              value={limit}
              onChange={(event) => setLimit(Number(event.target.value))}
              className="field text-sm font-normal"
            />
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={hydrate}
              onChange={(event) => setHydrate(event.target.checked)}
            />
            Fetch complete comment trees
          </label>
        </div>

        {importer.isError && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            Import failed. Check the query and your connection, then try again.
          </p>
        )}
        {importer.data && (
          <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
            Stored {importer.data.stored} threads and {importer.data.comments}
            {' '}comments locally.
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Close
          </button>
          <button
            type="submit"
            disabled={importer.isPending}
            className="btn-primary"
          >
            {importer.isPending ? 'Importing…' : 'Import threads'}
          </button>
        </div>
      </form>
    </div>
  )
}
