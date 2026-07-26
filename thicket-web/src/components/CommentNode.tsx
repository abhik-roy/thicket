import type { Code, Comment } from '../api/comments'

export interface CommentNodeProps {
  comment: Comment
  appliedCodeIds: string[]
  codesById: Record<string, Code>
  focused: boolean
  onFocus: () => void
}

export function CommentNode({
  comment, appliedCodeIds, codesById, focused, onFocus,
}: CommentNodeProps) {
  const firstCode = appliedCodeIds.length > 0
    ? codesById[appliedCodeIds[0]] : undefined

  return (
    <div
      data-testid={`comment-${comment.id}`}
      onClick={onFocus}
      className={
        'mx-4 my-2 cursor-pointer rounded-xl border px-4 py-3 text-sm transition-all ' +
        (focused ? 'border-emerald-500 bg-white shadow-md ring-2 ring-emerald-100 ' : 'border-slate-200 bg-white hover:border-slate-300 ')
      }
      style={{
        marginLeft: 16 + Math.min(Math.max(comment.depth, 0), 8) * 18,
        borderLeft: firstCode ? `3px solid ${firstCode.color}` : undefined,
      }}
    >
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span className="font-semibold text-slate-700">u/{comment.author}</span>
        {comment.is_submitter === 1 && (
          <span className="rounded bg-blue-100 px-1 text-blue-700">OP</span>
        )}
        {comment.controversiality === 1 && (
          <span className="rounded bg-orange-100 px-1 text-orange-700">
            controversial
          </span>
        )}
        <span className="ml-auto">{comment.score}</span>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-[14px] leading-6 text-slate-700">{comment.body}</p>
      {appliedCodeIds.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {appliedCodeIds.map((codeId) => (
            <span
              key={codeId}
              className="rounded-full px-2 py-0.5 text-xs text-white"
              style={{ backgroundColor: codesById[codeId]?.color ?? '#999' }}
            >
              {codesById[codeId]?.name ?? codeId}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
