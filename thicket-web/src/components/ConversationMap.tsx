import type { Code, Comment } from '../api/comments'

export interface ConversationMapProps {
  comments: Comment[]
  labelDetails: Record<string, { label_id: string; code_id: string }[]>
  codesById: Record<string, Code>
  focusedId?: string
  onOpen: (comment: Comment, index: number) => void
}

function firstLine(body: string): string {
  const line = body.split(/\r?\n/, 1)[0].trim()
  return line || '(empty comment)'
}

export function ConversationMap({
  comments, labelDetails, codesById, focusedId, onOpen,
}: ConversationMapProps) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-5" data-testid="conversation-map">
      <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <span>Each branch follows the Reddit reply structure.</span>
        <span className="ml-auto">Node colors show applied codes.</span>
      </div>
      <div className="grid gap-2">
        {comments.map((comment, index) => {
          const applied = labelDetails[comment.id] ?? []
          const colors = applied.map((label) =>
            codesById[label.code_id]?.color ?? '#94a3b8')
          const depth = Math.min(Math.max(comment.depth, 0), 12)
          return (
            <div
              key={comment.id}
              data-testid={`comment-${comment.id}`}
              className="relative"
              style={{ marginLeft: depth * 28 }}
            >
              {depth > 0 && (
                <>
                  <span
                    aria-hidden="true"
                    className="absolute -left-4 -top-3 h-[calc(50%+0.75rem)] border-l-2 border-slate-300"
                  />
                  <span
                    aria-hidden="true"
                    className="absolute -left-4 top-1/2 w-4 border-t-2 border-slate-300"
                  />
                </>
              )}
              <button
                type="button"
                data-testid={`map-node-${comment.id}`}
                onClick={() => onOpen(comment, index)}
                className={
                  'relative flex w-full items-center gap-3 overflow-hidden rounded-xl border bg-white px-3 py-2.5 text-left shadow-sm transition hover:-translate-y-px hover:border-emerald-400 hover:shadow-md ' +
                  (focusedId === comment.id
                    ? 'border-emerald-500 ring-2 ring-emerald-100'
                    : 'border-slate-200')
                }
                style={{
                  borderLeftColor: colors[0],
                  borderLeftWidth: colors.length ? 5 : undefined,
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-800">
                    {firstLine(comment.body)}
                  </span>
                  <span className="mt-1 block text-[11px] text-slate-500">
                    u/{comment.author} · {comment.score} points
                    {comment.is_submitter === 1 ? ' · OP' : ''}
                  </span>
                </span>
                {colors.length > 0 && (
                  <span className="flex shrink-0 gap-1" aria-label={`${colors.length} applied codes`}>
                    {colors.map((color, colorIndex) => (
                      <span
                        key={`${color}-${colorIndex}`}
                        className="h-3 w-3 rounded-full ring-1 ring-black/10"
                        style={{ backgroundColor: color }}
                      >
                        <span className="sr-only">
                          {codesById[applied[colorIndex].code_id]?.name ??
                            applied[colorIndex].code_id}
                        </span>
                      </span>
                    ))}
                  </span>
                )}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
