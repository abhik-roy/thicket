import type { Code } from '../api/comments'

export interface CodePaletteProps {
  codes: Code[]
  appliedCodeIds: string[]
  onToggleCode: (codeId: string) => void
  disabled?: boolean
  isLoading?: boolean
  isError?: boolean
}

export function CodePalette({
  codes, appliedCodeIds, onToggleCode,
  disabled = false, isLoading = false, isError = false,
}: CodePaletteProps) {
  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-slate-200 bg-slate-50 p-4" data-testid="code-palette">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-slate-900">Code focused comment</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">Click a code or use its number key. Multiple codes are allowed.</p>
      </div>
      <div className="flex flex-col gap-2">
      {isLoading && (
        <p className="text-sm text-slate-500">Loading codebook…</p>
      )}
      {isError && (
        <p role="alert" className="text-sm text-red-700">
          Could not load the codebook. Refresh to try again.
        </p>
      )}
      {!isLoading && !isError && codes.length === 0 && (
        <p className="text-sm text-amber-800">
          This codebook has no codes yet.
        </p>
      )}
      {codes.map((code) => {
        const applied = appliedCodeIds.includes(code.id)
        return (
          <button
            key={code.id}
            type="button"
            onClick={() => onToggleCode(code.id)}
            aria-pressed={applied}
            disabled={disabled}
            className={
              'flex min-h-10 items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm font-medium transition-all disabled:cursor-wait disabled:opacity-60 ' +
              (applied ? 'border-transparent text-white shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300')
            }
            style={{
              backgroundColor: applied ? code.color : undefined,
            }}
          >
            <span className={`kbd ${applied ? 'border-white/40 bg-white/15 text-white' : ''}`}>{code.hotkey}</span>
            <span>{code.name}</span>
          </button>
        )
      })}
      </div>
    </aside>
  )
}
