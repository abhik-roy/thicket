import type { Code, Comment } from '../api/comments'
import type { EvidenceSegment, SelectionDraft } from '../api/openCoding'
import { TreeConnectors } from './TreeConnectors'

export interface CommentNodeProps {
  comment: Comment
  appliedCodeIds: string[]
  codesById: Record<string, Code>
  focused: boolean
  onFocus: () => void
  segments?: EvidenceSegment[]
  onTextSelect?: (selection: SelectionDraft) => void
  indentReplies?: boolean
  treeDepth?: number
  ancestorContinues?: boolean[]
  isLastSibling?: boolean
  targetSegmentId?: string | null
}

export function CommentNode({
  comment, appliedCodeIds, codesById, focused, onFocus,
  segments = [], onTextSelect, indentReplies = true,
  treeDepth = comment.depth, ancestorContinues = [], isLastSibling = true,
  targetSegmentId = null,
}: CommentNodeProps) {
  const firstCode = appliedCodeIds.length > 0
    ? codesById[appliedCodeIds[0]] : undefined
  const postMatch = comment.id.match(/p0*(\d+)$/)
  const postLabel = postMatch ? `Post ${Number(postMatch[1])}` : comment.id

  function captureSelection(event: React.MouseEvent<HTMLParagraphElement>) {
    if (!onTextSelect) return
    const element = event.currentTarget
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return
    const range = selection.getRangeAt(0)
    if (!element.contains(range.startContainer) ||
        !element.contains(range.endContainer)) return
    const before = document.createRange()
    before.selectNodeContents(element)
    before.setEnd(range.startContainer, range.startOffset)
    const startOffset = before.toString().length
    const selectedText = range.toString()
    if (!selectedText.trim()) return
    onTextSelect({
      itemId: comment.id,
      startOffset,
      endOffset: startOffset + selectedText.length,
      selectedText,
    })
  }

  function highlightedBody() {
    const valid = segments.filter((segment) =>
      segment.start_offset >= 0 && segment.end_offset <= comment.body.length)
    if (valid.length === 0) return comment.body
    const boundaries = Array.from(new Set([
      0, comment.body.length,
      ...valid.flatMap((segment) => [segment.start_offset, segment.end_offset]),
    ])).sort((a, b) => a - b)
    return boundaries.slice(0, -1).map((start, index) => {
      const end = boundaries[index + 1]
      const covering = valid.filter((segment) =>
        segment.start_offset <= start && segment.end_offset >= end)
      const text = comment.body.slice(start, end)
      if (covering.length === 0) return text
      const color = covering[0].codes[0]?.color ?? '#d99a2b'
      const codeNames = Array.from(new Set(
        covering.flatMap((segment) => segment.codes.map((code) => code.name))))
      const evidenceCodes = codeNames.length > 0
        ? codeNames.join(' · ') : 'Uncoded evidence'
      const isTarget = covering.some((segment) => segment.id === targetSegmentId)
      return (
        <mark
          key={`${start}-${end}`}
          data-evidence-codes={evidenceCodes}
          className={`evidence-highlight rounded-sm px-0.5 text-inherit ${isTarget ? 'target-evidence' : ''}`}
          style={{ backgroundColor: isTarget ? '#fde68a' : `${color}30`, boxShadow: `inset 0 -2px ${color}` }}
        >
          {text}
        </mark>
      )
    })
  }

  return (
    <div
      data-testid={`comment-${comment.id}`}
      onClick={onFocus}
      className={
        'relative mx-4 my-2 cursor-pointer rounded-xl border px-4 py-3 text-sm transition-all ' +
        (focused ? 'border-emerald-500 bg-white shadow-md ring-2 ring-emerald-100 ' : 'border-slate-200 bg-white hover:border-slate-300 ')
      }
      style={{
        marginLeft: 16 + (indentReplies
          ? Math.min(Math.max(treeDepth, 0), 12) * 28 : 0),
        borderLeft: firstCode ? `3px solid ${firstCode.color}` : undefined,
      }}
    >
      {indentReplies && <TreeConnectors depth={Math.min(treeDepth, 12)}
        ancestorContinues={ancestorContinues.slice(0, 12)}
        isLastSibling={isLastSibling} />}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-600">{postLabel}</span>
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
      <p
        data-source-body={comment.id}
        onMouseUp={captureSelection}
        className="mt-2 whitespace-pre-wrap text-[14px] leading-6 text-slate-700 selection:bg-amber-200"
      >
        {highlightedBody()}
      </p>
      {segments.length > 0 && (
        <p className="mt-2 text-[11px] font-medium text-amber-700">
          {segments.length} saved evidence {segments.length === 1 ? 'segment' : 'segments'}
        </p>
      )}
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
