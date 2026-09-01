import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { useUnmarkThreadDone } from '../api/comments'
import { useAssignmentStatus, useCommunities, type Thread } from '../api/threads'
import { FilterBar } from '../components/FilterBar'
import { TriageGrid } from '../components/TriageGrid'
import { ThreadModal } from '../components/ThreadModal'
import { ArcticImportPanel } from '../components/ArcticImportPanel'
import { CodebookManager } from '../components/CodebookManager'
import { HeaderActions, type HeaderActionsProps } from '../components/HeaderActions'

export interface TriageScreenProps extends Partial<HeaderActionsProps> {
  coderId: string
  passNo: number
  codebookId: string
  onCodebookChange: (id: string) => void
  onChangeSession?: () => void
}

export function TriageScreen({
  coderId, passNo, codebookId, onCodebookChange, onChangeSession,
  theme = 'light', onToggleTheme = () => {}, onOpenWorkspace = () => {},
}: TriageScreenProps) {
  const [subreddit, setSubreddit] = useState('')
  const [year, setYear] = useState('')
  const [minComments, setMinComments] = useState(0)
  const [uncodedOnly, setUncodedOnly] = useState(false)
  const [hydratedOnly, setHydratedOnly] = useState(true)
  const [search, setSearch] = useState('')
  const [openThread, setOpenThread] = useState<Thread | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [codebookOpen, setCodebookOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const assignmentStatusQuery = useAssignmentStatus(
    coderId, passNo, openThread ? [openThread.id] : [])
  const unmarkDone = useUnmarkThreadDone()
  const communitiesQuery = useCommunities()

  return (
    <main className="app-shell flex h-screen flex-col p-3 sm:p-5">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-800">Thicket · qualitative coding</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Thread work queue</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/dataset?codebook=${encodeURIComponent(codebookId)}&coder=${encodeURIComponent(coderId)}&pass=${passNo}`}
            className="btn-secondary inline-flex items-center text-xs"
          >
            View dataset
          </Link>
          <button
            type="button"
            onClick={() => setCodebookOpen(true)}
            className="btn-secondary text-xs"
          >
            Manage codes
          </button>
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="btn-primary text-xs"
          >
            Import threads
          </button>
          <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">
            Coder {coderId} · Pass {passNo}
          </div>
          {onChangeSession && (
            <button
              type="button"
              onClick={onChangeSession}
              className="btn-secondary text-xs"
            >
              Change session
            </button>
          )}
          <HeaderActions theme={theme} onToggleTheme={onToggleTheme} onOpenWorkspace={onOpenWorkspace} />
        </div>
      </header>
      <section className="surface flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl shadow-sm">
      <FilterBar
        subreddit={subreddit} onSubredditChange={setSubreddit}
        communities={communitiesQuery.data?.items ?? []}
        communitiesLoading={communitiesQuery.isPending}
        year={year} onYearChange={setYear}
        minComments={minComments} onMinCommentsChange={setMinComments}
        uncodedOnly={uncodedOnly} onUncodedOnlyChange={setUncodedOnly}
        hydratedOnly={hydratedOnly} onHydratedOnlyChange={setHydratedOnly}
        search={search} onSearchChange={setSearch}
        searchInputRef={searchInputRef}
      />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <TriageGrid
          coderId={coderId} passNo={passNo}
          subreddit={subreddit} year={year} minComments={minComments}
          uncodedOnly={uncodedOnly} search={search}
          hydratedOnly={hydratedOnly}
          searchInputRef={searchInputRef}
          onOpenThread={setOpenThread}
          onEscape={() => setOpenThread(null)}
          modalOpen={openThread !== null}
        />
      </div>
      {openThread && (
        <ThreadModal
          thread={openThread}
          codedByMe={assignmentStatusQuery.data?.[openThread.id] ?? false}
          onUnmarkDone={() => {
            unmarkDone.mutate(
              { coderId, threadId: openThread.id, passNo },
            )
          }}
          unmarking={unmarkDone.isPending}
          onClose={() => setOpenThread(null)}
        />
      )}
      {importOpen && (
        <ArcticImportPanel onClose={() => setImportOpen(false)} />
      )}
      {codebookOpen && (
        <CodebookManager
          selectedId={codebookId}
          onSelect={onCodebookChange}
          onClose={() => setCodebookOpen(false)}
        />
      )}
      </section>
    </main>
  )
}
