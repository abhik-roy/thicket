import type { Code, Comment } from '../api/comments'
import type { EvidenceSegment } from '../api/openCoding'
import { buildTreeLayout } from '../lib/commentTree'
import { TreeConnectors } from './TreeConnectors'
import { EvidenceHighlight } from './EvidenceHighlight'

export interface ConversationMapProps {
  comments: Comment[]
  labelDetails: Record<string, { label_id: string; code_id: string }[]>
  codesById: Record<string, Code>
  segmentsByItem: Record<string, EvidenceSegment[]>
  focusedId?: string
  onOpen: (comment: Comment, index: number) => void
}

function firstLine(body: string): string {
  const line = body.split(/\r?\n/, 1)[0].trim()
  return line || '(empty comment)'
}

export function ConversationMap({
  comments, labelDetails, codesById, segmentsByItem, focusedId, onOpen,
}: ConversationMapProps) {
  const layout = buildTreeLayout(comments)
  const indexById = Object.fromEntries(
    comments.map((comment, index) => [comment.id, index]))
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-5" data-testid="conversation-map">
      <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <span>Lines show which post replies to which parent.</span>
        <span className="ml-auto">Saved selections remain highlighted.</span>
      </div>
      <div className="grid gap-2">
        {layout.map(({ item: comment, depth, ancestorContinues, isLastSibling }) => {
          const applied = labelDetails[comment.id] ?? []
          const colors = applied.map((label) =>
            codesById[label.code_id]?.color ?? '#94a3b8')
          const segments = segmentsByItem[comment.id] ?? []
          const shownDepth = Math.min(depth, 12)
          return (
            <div key={comment.id} data-testid={`comment-${comment.id}`}
              className="relative" style={{ marginLeft: shownDepth * 28 }}>
              <TreeConnectors depth={shownDepth}
                ancestorContinues={ancestorContinues.slice(0, 12)}
                isLastSibling={isLastSibling} />
              <button type="button" data-testid={`map-node-${comment.id}`}
                onClick={() => onOpen(comment, indexById[comment.id])}
                className={'relative flex w-full items-start gap-3 rounded-xl border bg-white px-3 py-2.5 text-left shadow-sm transition hover:border-emerald-400 hover:shadow-md ' +
                  (focusedId === comment.id
                    ? 'border-emerald-500 ring-2 ring-emerald-100'
                    : 'border-slate-200')}
                style={{ borderLeftColor: colors[0], borderLeftWidth: colors.length ? 5 : undefined }}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-800">
                    {firstLine(comment.body)}
                  </span>
                  {segments.length > 0 && <span className="mt-2 grid gap-1.5">
                    {segments.slice(0, 2).map((segment) => <EvidenceHighlight key={segment.id}
                      codes={segment.codes}
                      className="evidence-highlight block rounded-md border-l-2 px-2 py-1 text-xs font-normal leading-5 text-slate-700"
                      style={{ backgroundColor: `${segment.codes[0]?.color ?? '#d99a2b'}20`, borderColor: segment.codes[0]?.color ?? '#d99a2b' }}>
                      “{segment.selected_text}”
                    </EvidenceHighlight>)}
                    {segments.length > 2 && <span className="text-[11px] font-medium text-amber-700">+{segments.length - 2} more saved selections</span>}
                  </span>}
                  <span className="mt-1 block text-[11px] text-slate-500">
                    u/{comment.author} · {comment.score} points
                    {comment.is_submitter === 1 ? ' · OP' : ''}
                  </span>
                </span>
                {colors.length > 0 && <span className="flex shrink-0 gap-1" aria-label={`${colors.length} applied codes`}>
                  {colors.map((color, colorIndex) => <span key={`${color}-${colorIndex}`}
                    className="h-3 w-3 rounded-full ring-1 ring-black/10" style={{ backgroundColor: color }}>
                    <span className="sr-only">{codesById[applied[colorIndex].code_id]?.name ?? applied[colorIndex].code_id}</span>
                  </span>)}
                </span>}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
