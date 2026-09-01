import { useEffect, useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useAssignmentStatusForPages, useThreads, type Thread } from '../api/threads'
import { useKeyboardNav } from '../hooks/useKeyboardNav'

export interface TriageGridProps {
  coderId: string
  passNo: number
  subreddit: string
  year: string
  minComments: number
  uncodedOnly: boolean
  hydratedOnly: boolean
  search: string
  searchInputRef: React.RefObject<HTMLInputElement | null>
  onOpenThread: (thread: Thread) => void
  onEscape: () => void
  modalOpen: boolean
}

export function TriageGrid({
  coderId, passNo, subreddit, year, minComments, uncodedOnly, hydratedOnly, search,
  searchInputRef, onOpenThread, onEscape, modalOpen,
}: TriageGridProps) {
  const threadsQuery = useThreads(subreddit || undefined, hydratedOnly)
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = threadsQuery
  const allThreads = useMemo(
    () => threadsQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [threadsQuery.data])

  const pageIdChunks = useMemo(
    () => threadsQuery.data?.pages.map((p) => p.items.map((t) => t.id)) ?? [],
    [threadsQuery.data])
  const codedStatusQuery = useAssignmentStatusForPages(coderId, passNo, pageIdChunks)
  const codedStatus = codedStatusQuery.data

  const filteredThreads = useMemo(() => allThreads.filter((t) => {
    if (year) {
      const threadYear = new Date(t.created_utc * 1000).getUTCFullYear()
      if (String(threadYear) !== year) return false
    }
    if (t.num_comments < minComments) return false
    if (uncodedOnly && codedStatus[t.id]) return false
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) {
      return false
    }
    return true
  }), [allThreads, year, minComments, uncodedOnly, codedStatus, search])

  const parentRef = useRef<HTMLDivElement>(null)

  const { highlightedIndex, setHighlightedIndex } = useKeyboardNav({
    itemCount: filteredThreads.length,
    onOpen: (index) => {
      const thread = filteredThreads[index]
      if (thread) onOpenThread(thread)
    },
    onClose: onEscape,
    onFocusSearch: () => searchInputRef.current?.focus(),
    enabled: !modalOpen,
  })

  const rowVirtualizer = useVirtualizer({
    count: filteredThreads.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 10,
  })

  const virtualItems = rowVirtualizer.getVirtualItems()

  useEffect(() => {
    if (filteredThreads.length > 0) {
      rowVirtualizer.scrollToIndex(highlightedIndex, { align: 'auto' })
    }
  }, [highlightedIndex, filteredThreads.length, rowVirtualizer])

  useEffect(() => {
    const lastItem = virtualItems[virtualItems.length - 1]
    if (!lastItem) return
    if (
      lastItem.index >= filteredThreads.length - 1 &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      fetchNextPage()
    }
  }, [
    virtualItems, filteredThreads.length, hasNextPage,
    isFetchingNextPage, fetchNextPage,
  ])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid grid-cols-[3rem_minmax(8rem,0.8fr)_minmax(18rem,3fr)_5rem_7rem] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
        <span>Status</span><span>Community</span><span>Thread</span><span className="text-right">Year</span><span className="text-right">Comments</span>
      </div>
      <div ref={parentRef} className="min-h-0 flex-1 overflow-auto" data-testid="triage-grid">
      {(threadsQuery.isError || codedStatusQuery.isError) && (
        <p role="alert" className="p-3 text-sm text-red-600">
          Something went wrong loading the corpus. Try refreshing.
        </p>
      )}
      {threadsQuery.isPending && (
        <p className="p-4 text-sm text-slate-500">Loading threads…</p>
      )}
      {!threadsQuery.isPending && !threadsQuery.isError &&
        filteredThreads.length === 0 && (
          <p className="p-4 text-sm text-slate-500">
            No threads match the current filters.
          </p>
        )}
      <div
        style={{
          height: rowVirtualizer.getTotalSize(),
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualRow) => {
          const thread = filteredThreads[virtualRow.index]
          return (
            <div
              key={thread.id}
              data-testid={`row-${thread.id}`}
              onClick={() => {
                setHighlightedIndex(virtualRow.index)
                onOpenThread(thread)
              }}
              className={
                'absolute left-0 top-0 grid w-full cursor-pointer ' +
                'grid-cols-[3rem_minmax(8rem,0.8fr)_minmax(18rem,3fr)_5rem_7rem] items-center gap-3 border-b border-slate-100 px-4 text-sm transition-colors ' +
                (virtualRow.index === highlightedIndex ? 'bg-emerald-50 shadow-[inset_3px_0_0_#176145]' : 'bg-white hover:bg-slate-50')
              }
              style={{
                height: virtualRow.size,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <span aria-label={codedStatus[thread.id] ? 'Done' : 'Not done'} className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${codedStatus[thread.id] ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-400'}`}>{codedStatus[thread.id] ? '✓' : '·'}</span>
              <span className="truncate font-medium text-slate-600">{thread.subreddit}</span>
              <span className="truncate font-medium text-slate-900">{thread.title}</span>
              <span className="text-right tabular-nums text-slate-500">
                {new Date(thread.created_utc * 1000).getUTCFullYear()}
              </span>
              <span className="text-right tabular-nums text-slate-600">
                {thread.n_comments_fetched > 0 ? (
                  thread.num_comments
                ) : (
                  <span
                    className="text-xs text-gray-400"
                    title={`${thread.num_comments} reported at source, none imported yet`}
                  >
                    no comments
                  </span>
                )}
              </span>
            </div>
          )
        })}
      </div>
      </div>
    </div>
  )
}
