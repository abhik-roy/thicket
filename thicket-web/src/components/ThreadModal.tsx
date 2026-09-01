import { useState } from 'react'
import { Link } from 'react-router'
import type { Thread } from '../api/threads'

export interface ThreadModalProps {
  thread: Thread
  codedByMe: boolean
  onClose: () => void
  onUnmarkDone?: () => void
  unmarking?: boolean
}

export function ThreadModal({
  thread, codedByMe, onClose, onUnmarkDone, unmarking = false,
}: ThreadModalProps) {
  const hasComments = thread.hydrated === 1 && thread.n_comments_fetched > 0
  const [expanded, setExpanded] = useState(false)
  return (
    <div
      role="dialog"
      aria-label={`Preview — ${thread.id}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[2px]"
    >
      <div className={`surface relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-2xl shadow-2xl transition-all ${expanded ? 'max-w-[96vw]' : 'max-w-4xl'}`}>
        <div className="flex items-center border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-800">{thread.subreddit}</span>
            <span>{new Date(thread.created_utc * 1000).toISOString().slice(0, 10)}</span>
            <span className="text-slate-300">•</span>
            <span>{codedByMe ? 'Completed by you' : 'Not yet coded'}</span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <button type="button" onClick={() => setExpanded((value) => !value)} aria-label={expanded ? 'Restore preview size' : 'Expand preview'} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100">
              {expanded ? 'Restore' : 'Expand'}
            </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-lg px-3 py-2 text-lg leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-900"
        >
          ✕
        </button>
          </div>
        </div>
        <div className="overflow-y-auto px-6 py-6 sm:px-8">
          <h2 className="max-w-4xl text-xl font-semibold leading-8 tracking-tight text-slate-950 sm:text-2xl">{thread.title}</h2>
          <div className="mt-5 whitespace-pre-wrap text-[15px] leading-7 text-slate-700">
            {thread.selftext || <span className="italic text-slate-400">No post body.</span>}
          </div>
        </div>
        <div className="border-t border-slate-200 bg-slate-50 px-6 py-4">
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-600">
          <div><b>{thread.score}</b> score</div>
          <div>
            <b>{thread.num_comments}</b> reported at source ·{' '}
            <b>{thread.n_comments_fetched}</b> fetched
          </div>
          <div><b>u/{thread.author}</b> author</div>
        </div>
        {!hasComments && (
          <p role="status" className="mt-3 rounded bg-amber-50 p-2 text-xs text-amber-900">
            {thread.hydrated === 1
              ? 'The source returned no comments for this thread, so there is no reply tree to open.'
              : 'Comments are not available in the local corpus. This thread has not been hydrated yet.'}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {hasComments ? (
            <Link
              to={`/thread/${thread.id}`}
              className="btn-primary text-sm"
            >
              Open thread →
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="cursor-not-allowed rounded bg-gray-300 px-3 py-1.5 text-sm text-gray-600"
            >
              Reply tree unavailable
            </button>
          )}
          {codedByMe && onUnmarkDone && (
            <button
              type="button"
              onClick={onUnmarkDone}
              disabled={unmarking}
              className="btn-secondary text-sm"
            >
              {unmarking ? 'Unmarking…' : 'Unmark done'}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary text-sm"
          >
            Close (Esc)
          </button>
        </div>
        </div>
      </div>
    </div>
  )
}
