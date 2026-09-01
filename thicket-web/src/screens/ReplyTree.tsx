import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import {
  useCodes, useComments, useCreateLabel, useDeleteLabel,
  useLabelDetailsForPages, useMarkThreadDone, useUnmarkThreadDone,
} from '../api/comments'
import { useAssignmentStatus } from '../api/threads'
import { buildVisibleOrder } from '../lib/commentTree'
import { useCommentTreeNav } from '../hooks/useCommentTreeNav'
import { CommentNode } from '../components/CommentNode'
import { ConversationMap } from '../components/ConversationMap'
import { CommentDetailModal } from '../components/CommentDetailModal'
import { OpenCodingWorkbench } from '../components/OpenCodingWorkbench'
import { useSegments, type SelectionDraft } from '../api/openCoding'
import { HeaderActions, type HeaderActionsProps } from '../components/HeaderActions'

export interface ReplyTreeProps extends Partial<HeaderActionsProps> {
  coderId: string
  passNo: number
  codebookId: string
}

export function ReplyTree({ coderId, passNo, codebookId, theme = 'light', onToggleTheme = () => {}, onOpenWorkspace = () => {} }: ReplyTreeProps) {
  const { threadId = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const sourceParams = new URLSearchParams(location.search)
  const targetPostId = sourceParams.get('post')
  const targetSegmentId = sourceParams.get('segment')
  const [showOnlyCoded, setShowOnlyCoded] = useState(false)
  const [viewMode, setViewMode] = useState<'map' | 'detail'>('detail')
  const [orderMode, setOrderMode] = useState<'timeline' | 'replies'>('timeline')
  const [openCommentId, setOpenCommentId] = useState<string | null>(null)
  const [selection, setSelection] = useState<SelectionDraft | null>(null)
  const [workbenchOpen, setWorkbenchOpen] = useState(true)

  const commentsQuery = useComments(threadId)
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = commentsQuery
  const allComments = useMemo(
    () => commentsQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [commentsQuery.data])
  const pageIdChunks = useMemo(
    () => commentsQuery.data?.pages.map((p) => p.items.map((c) => c.id)) ?? [],
    [commentsQuery.data])

  const labelDetailsQuery = useLabelDetailsForPages(coderId, passNo, pageIdChunks)
  const labelDetails = labelDetailsQuery.data

  const codesQuery = useCodes(codebookId)
  const codes = useMemo(() => codesQuery.data ?? [], [codesQuery.data])
  const codesById = useMemo(
    () => Object.fromEntries(codes.map((c) => [c.id, c])), [codes])
  const hotkeyToCodeId = useMemo(
    () => Object.fromEntries(
      codes.filter((c) => c.hotkey).map((c) => [c.hotkey as string, c.id])),
    [codes])
  const segmentsQuery = useSegments(coderId, passNo, threadId)
  const segmentsByItem = useMemo(() => {
    const result: Record<string, NonNullable<typeof segmentsQuery.data>> = {}
    for (const segment of segmentsQuery.data ?? []) {
      ;(result[segment.item_id] ??= []).push(segment)
    }
    return result
  }, [segmentsQuery.data])

  const assignmentStatusQuery = useAssignmentStatus(
    coderId, passNo, threadId ? [threadId] : [])
  const alreadyDone = assignmentStatusQuery.data?.[threadId] ?? false

  const visibleOrder = useMemo(() => (
    orderMode === 'timeline'
      ? [...allComments].sort((a, b) =>
          a.created_utc - b.created_utc || a.id.localeCompare(b.id))
      : buildVisibleOrder(allComments)
  ), [allComments, orderMode])
  const displayedComments = useMemo(() => (
    showOnlyCoded
      ? visibleOrder.filter((c) => (labelDetails[c.id] ?? []).length > 0)
      : visibleOrder
  ), [visibleOrder, showOnlyCoded, labelDetails])

  const createLabel = useCreateLabel()
  const deleteLabel = useDeleteLabel()
  const markDone = useMarkThreadDone()
  const unmarkDone = useUnmarkThreadDone()

  function toggleCodeOnComment(index: number, codeId: string) {
    if (createLabel.isPending || deleteLabel.isPending) return
    const comment = displayedComments[index]
    if (!comment) return
    const applied = labelDetails[comment.id] ?? []
    const existing = applied.find((l) => l.code_id === codeId)
    if (existing) {
      deleteLabel.mutate({ labelId: existing.label_id, coderId, passNo })
    } else {
      createLabel.mutate({ itemId: comment.id, codeId, coderId, passNo })
    }
  }

  function handleMarkDone() {
    if (!threadId || markDone.isPending || unmarkDone.isPending) return
    const mutation = alreadyDone ? unmarkDone : markDone
    mutation.mutate(
      { coderId, threadId, passNo },
      { onSuccess: () => navigate('/') },
    )
  }

  const parentRef = useRef<HTMLDivElement>(null)
  const { focusedIndex, setFocusedIndex } = useCommentTreeNav({
    itemCount: displayedComments.length,
    onToggleCode: (index, hotkey) => {
      const codeId = hotkeyToCodeId[hotkey]
      if (codeId) toggleCodeOnComment(index, codeId)
    },
    onMarkDone: handleMarkDone,
    onBack: () => {
      if (openCommentId) setOpenCommentId(null)
      else navigate('/')
    },
  })

  const rowVirtualizer = useVirtualizer({
    count: displayedComments.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 70,
    overscan: 10,
  })
  const virtualItems = rowVirtualizer.getVirtualItems()

  useEffect(() => {
    if (displayedComments.length > 0) {
      rowVirtualizer.scrollToIndex(focusedIndex, { align: 'auto' })
    }
  }, [focusedIndex, displayedComments.length, rowVirtualizer])

  useEffect(() => {
    const lastItem = virtualItems[virtualItems.length - 1]
    if (!lastItem) return
    if (
      lastItem.index >= displayedComments.length - 1 &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      fetchNextPage()
    }
  }, [
    virtualItems, displayedComments.length, hasNextPage,
    isFetchingNextPage, fetchNextPage,
  ])

  useEffect(() => {
    if (!targetPostId || commentsQuery.isPending) return
    const index = displayedComments.findIndex((comment) => comment.id === targetPostId)
    if (index >= 0) {
      setViewMode('detail')
      setFocusedIndex(index)
      requestAnimationFrame(() => rowVirtualizer.scrollToIndex(index, { align: 'center' }))
    } else if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage()
    }
  }, [targetPostId, displayedComments, commentsQuery.isPending, hasNextPage,
    isFetchingNextPage, fetchNextPage, rowVirtualizer, setFocusedIndex])

  const focusedComment = displayedComments[focusedIndex]
  const focusedAppliedCodeIds = focusedComment
    ? (labelDetails[focusedComment.id] ?? []).map((label) => label.code_id) : []
  const openComment = openCommentId
    ? displayedComments.find((comment) => comment.id === openCommentId)
    : undefined

  return (
    <main className="app-shell flex h-screen flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-5 py-3 text-sm shadow-sm">
        <Link to="/" className="btn-secondary inline-flex items-center">← Work queue</Link>
        <Link to={`/dataset?codebook=${encodeURIComponent(codebookId)}&coder=${encodeURIComponent(coderId)}&pass=${passNo}`} className="btn-secondary inline-flex items-center">Dataset</Link>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-800">Reply coding</p>
          <p className="mt-0.5 font-mono text-xs text-slate-500">{threadId}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${alreadyDone ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
          {alreadyDone ? '✅ marked done' : '— not yet done'}
        </span>
        <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-1">
          <button
            type="button"
            aria-pressed={viewMode === 'map'}
            onClick={() => setViewMode('map')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${viewMode === 'map' ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-600'}`}
          >
            Tree map
          </button>
          <button
            type="button"
            aria-pressed={viewMode === 'detail'}
            onClick={() => setViewMode('detail')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${viewMode === 'detail' ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-600'}`}
          >
            Full text
          </button>
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-1" aria-label="Post order">
          <button
            type="button"
            aria-pressed={orderMode === 'timeline'}
            onClick={() => setOrderMode('timeline')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${orderMode === 'timeline' ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-600'}`}
          >
            Original order
          </button>
          <button
            type="button"
            aria-pressed={orderMode === 'replies'}
            onClick={() => setOrderMode('replies')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${orderMode === 'replies' ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-600'}`}
          >
            Reply tree
          </button>
        </div>
        <label className="ml-auto flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700">
          <input
            type="checkbox"
            checked={showOnlyCoded}
            onChange={(e) => setShowOnlyCoded(e.target.checked)}
          />
          Show only coded comments
        </label>
        <button
          type="button"
          onClick={handleMarkDone}
          disabled={markDone.isPending || unmarkDone.isPending}
          className={alreadyDone ? 'btn-secondary' : 'btn-primary'}
        >
          {markDone.isPending || unmarkDone.isPending
            ? 'Saving…'
            : alreadyDone ? 'Unmark done (Enter)' : 'Mark done (Enter)'}
        </button>
        <HeaderActions theme={theme} onToggleTheme={onToggleTheme} onOpenWorkspace={onOpenWorkspace} />
      </header>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <section ref={parentRef} className="min-w-0 flex-1 overflow-auto bg-slate-100/70 py-2" data-testid="comment-tree">
          {(commentsQuery.isError || labelDetailsQuery.isError ||
            assignmentStatusQuery.isError) && (
            <p role="alert" className="p-3 text-sm text-red-600">
              Something went wrong loading this thread. Try refreshing.
            </p>
          )}
          {(createLabel.isError || deleteLabel.isError ||
            markDone.isError || unmarkDone.isError) && (
            <p role="alert" className="m-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              Your change could not be saved. Check the connection and try again.
            </p>
          )}
          {commentsQuery.isPending && (
            <p className="p-4 text-sm text-slate-500">Loading comments…</p>
          )}
          {commentsQuery.data && allComments.length === 0 && (
            <p className="p-3 text-sm text-gray-500">
              No comments have been scraped for this thread yet.
            </p>
          )}
          {commentsQuery.data && allComments.length > 0 &&
            displayedComments.length === 0 && (
              <p className="p-4 text-sm text-slate-500">
                No coded comments to show. Turn off the filter to resume coding.
              </p>
            )}
          {viewMode === 'map' && (
            <ConversationMap
              comments={displayedComments}
              labelDetails={labelDetails}
              codesById={codesById}
              focusedId={focusedComment?.id}
              onOpen={(comment, index) => {
                setFocusedIndex(index)
                setOpenCommentId(comment.id)
              }}
            />
          )}
          {viewMode === 'detail' && (
          <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
            {virtualItems.map((virtualRow) => {
              const comment = displayedComments[virtualRow.index]
              return (
                <div
                  key={comment.id}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    position: 'absolute', top: 0, left: 0, width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <CommentNode
                    comment={comment}
                    appliedCodeIds={
                      (labelDetails[comment.id] ?? []).map((l) => l.code_id)
                    }
                    codesById={codesById}
                    focused={virtualRow.index === focusedIndex}
                    onFocus={() => setFocusedIndex(virtualRow.index)}
                    segments={segmentsByItem[comment.id] ?? []}
                    onTextSelect={setSelection}
                    indentReplies={orderMode === 'replies'}
                    targetSegmentId={targetSegmentId}
                  />
                </div>
              )
            })}
          </div>
          )}
        </section>
        {!openComment && workbenchOpen && <OpenCodingWorkbench
          coderId={coderId}
          passNo={passNo}
          codebookId={codebookId}
          threadId={threadId}
          codes={codes}
          selection={selection}
          onClearSelection={() => setSelection(null)}
          onJumpToSource={(itemId) => {
            const index = displayedComments.findIndex((comment) => comment.id === itemId)
            if (index >= 0) {
              setFocusedIndex(index)
              rowVirtualizer.scrollToIndex(index, { align: 'center' })
            }
          }}
          focusedAppliedCodeIds={focusedAppliedCodeIds}
          onToggleFocusedCode={(codeId) => toggleCodeOnComment(focusedIndex, codeId)}
          onCollapse={() => setWorkbenchOpen(false)}
        />}
        {!openComment && !workbenchOpen && (
          <button className="open-workbench-launch btn-primary" onClick={() => setWorkbenchOpen(true)}>
            Open coding workspace ↑
          </button>
        )}
      </div>
      {openComment && (
        <CommentDetailModal
          comment={openComment}
          codes={codes}
          appliedCodeIds={(labelDetails[openComment.id] ?? []).map(
            (label) => label.code_id)}
          disabled={createLabel.isPending || deleteLabel.isPending}
          onClose={() => setOpenCommentId(null)}
          onToggleCode={(codeId) => {
            const index = displayedComments.findIndex(
              (comment) => comment.id === openComment.id)
            if (index >= 0) toggleCodeOnComment(index, codeId)
          }}
        />
      )}
      <footer className="flex items-center gap-3 border-t border-slate-200 bg-white px-5 py-2 text-xs text-slate-500">
        <span><span className="kbd">J</span> <span className="kbd">K</span> move</span>
        <span><span className="kbd">1–9</span> code</span>
        <span><span className="kbd">Enter</span> finish</span>
        <span><span className="kbd">Esc</span> back</span>
        <span className="ml-auto tabular-nums">{displayedComments.length} comments loaded</span>
      </footer>
    </main>
  )
}
