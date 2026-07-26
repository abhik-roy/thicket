import { useEffect, useState } from 'react'
import { useFileBrowser } from '../api/workspace'

interface DatabaseFilePickerProps {
  title: string
  initialPath: string
  allowNew: boolean
  onCancel: () => void
  onSelect: (path: string) => void
}

function parentDirectory(path: string) {
  const separator = path.includes('\\') ? '\\' : '/'
  const index = path.lastIndexOf(separator)
  return index > 0 ? path.slice(0, index) : null
}

export function DatabaseFilePicker({
  title, initialPath, allowNew, onCancel, onSelect,
}: DatabaseFilePickerProps) {
  const [directory, setDirectory] = useState<string | null>(
    parentDirectory(initialPath),
  )
  const [filename, setFilename] = useState('')
  const listing = useFileBrowser(directory, true)

  useEffect(() => {
    if (!directory && listing.data) setDirectory(listing.data.directory)
  }, [directory, listing.data])

  const selectedDirectory = listing.data?.directory ?? directory ?? ''
  const newPath = selectedDirectory && filename
    ? `${selectedDirectory.replace(/[\\/]$/, '')}/${filename}` : ''

  return (
    <div
      role="dialog"
      aria-label={title}
      className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/60 p-4"
    >
      <div className="surface flex max-h-[80vh] w-full max-w-xl flex-col rounded-2xl p-5">
        <header className="flex items-center gap-3">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button type="button" onClick={onCancel} className="btn-secondary ml-auto">
            Cancel
          </button>
        </header>
        <p className="mt-3 break-all rounded-lg bg-slate-100 p-2 font-mono text-xs text-slate-600">
          {selectedDirectory || 'Home folder'}
        </p>

        <div className="mt-3 min-h-48 overflow-auto rounded-xl border border-slate-200">
          {listing.isPending && (
            <p className="p-4 text-sm text-slate-500">Opening folder…</p>
          )}
          {listing.isError && (
            <p role="alert" className="p-4 text-sm text-red-700">
              {listing.error.message}
            </p>
          )}
          {listing.data?.parent && (
            <button
              type="button"
              onClick={() => setDirectory(listing.data!.parent)}
              className="block w-full border-b border-slate-100 px-4 py-3 text-left text-sm hover:bg-emerald-50"
            >
              📁 <span className="ml-2">Up one folder</span>
            </button>
          )}
          {listing.data?.entries.map((entry) => (
            <button
              type="button"
              key={entry.path}
              onClick={() => entry.kind === 'directory'
                ? setDirectory(entry.path) : onSelect(entry.path)}
              className="block w-full border-b border-slate-100 px-4 py-3 text-left text-sm hover:bg-emerald-50"
            >
              {entry.kind === 'directory' ? '📁' : '▣'}
              <span className="ml-2">{entry.name}</span>
            </button>
          ))}
          {listing.data && listing.data.entries.length === 0 && (
            <p className="p-4 text-sm text-slate-500">
              No folders or database files here.
            </p>
          )}
        </div>

        {allowNew && (
          <div className="mt-4">
            <label className="grid gap-1 text-sm font-semibold text-slate-700">
              New database filename
              <input
                value={filename}
                onChange={(event) => setFilename(event.target.value)}
                placeholder="research.db"
                className="field font-mono text-xs font-normal"
              />
            </label>
            <button
              type="button"
              disabled={!/\.(db|sqlite|sqlite3)$/i.test(filename)}
              onClick={() => onSelect(newPath)}
              className="btn-primary mt-3"
            >
              Choose new database
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
