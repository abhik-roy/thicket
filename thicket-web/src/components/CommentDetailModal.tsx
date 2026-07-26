import type { Code, Comment } from '../api/comments'

interface CommentDetailModalProps {
  comment: Comment
  codes: Code[]
  appliedCodeIds: string[]
  disabled: boolean
  onClose: () => void
  onToggleCode: (codeId: string) => void
}

export function CommentDetailModal({
  comment, codes, appliedCodeIds, disabled, onClose, onToggleCode,
}: CommentDetailModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Full comment"
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <article className="surface max-h-[88vh] w-full max-w-3xl overflow-auto rounded-2xl p-6 shadow-xl">
        <header className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-800">u/{comment.author}</span>
          {comment.is_submitter === 1 && (
            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">OP</span>
          )}
          <span className="text-xs text-slate-500">{comment.score} points</span>
          <button type="button" onClick={onClose} className="btn-secondary ml-auto">
            Close
          </button>
        </header>
        <p className="mt-5 whitespace-pre-wrap text-[15px] leading-7 text-slate-800">
          {comment.body}
        </p>
        <section className="mt-6 border-t border-slate-200 pt-4">
          <h3 className="text-sm font-semibold">Color code this comment</h3>
          <p className="mt-1 text-xs text-slate-500">
            Select any number of codes. Their colors will appear on the tree node.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {codes.map((code) => {
              const applied = appliedCodeIds.includes(code.id)
              return (
                <button
                  key={code.id}
                  type="button"
                  aria-pressed={applied}
                  disabled={disabled}
                  onClick={() => onToggleCode(code.id)}
                  className={
                    'rounded-full border px-3 py-1.5 text-sm font-medium disabled:opacity-60 ' +
                    (applied
                      ? 'border-transparent text-white'
                      : 'border-slate-300 bg-white text-slate-700')
                  }
                  style={{ backgroundColor: applied ? code.color : undefined }}
                >
                  <span
                    className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: code.color }}
                  />
                  {code.name}
                </button>
              )
            })}
          </div>
        </section>
      </article>
    </div>
  )
}
