import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useCodes, type Code } from '../api/comments'
import { useCreateCode } from '../api/codebooks'
import {
  useAddSegmentCode, useCreateTheme, useDeleteSegment, useRemoveSegmentCode, useSegments,
  useThemes, useToggleSegmentTheme, useUpdateSegment,
  type EvidenceSegment, type SegmentStatus, type Theme,
} from '../api/openCoding'
import { HeaderActions, type HeaderActionsProps } from '../components/HeaderActions'

interface Props extends HeaderActionsProps { coderId: string; passNo: number; codebookId: string }
type Scope = 'all' | 'uncoded' | 'uncertain' | `theme:${string}` | `code:${string}`
const COLORS = ['#32735f', '#8a5a24', '#526b9a', '#865b88', '#9a4f50', '#49777b']
const statusLabels: Record<SegmentStatus, string> = { captured: 'Captured', coded: 'Coded', uncertain: 'Uncertain', excluded: 'Excluded', negative_case: 'Negative case' }

function postLabel(segment: EvidenceSegment) {
  const match = segment.item_id.match(/p0*(\d+)$/)
  return match ? `Post ${Number(match[1])}` : segment.item_id
}

function UnitEditor({ segment, codes, themes, codebookId, onDirtyChange }: { segment: EvidenceSegment; codes: Code[]; themes: Theme[]; codebookId: string; onDirtyChange: (dirty: boolean) => void }) {
  const update = useUpdateSegment()
  const addCode = useAddSegmentCode()
  const removeCode = useRemoveSegmentCode()
  const toggleTheme = useToggleSegmentTheme()
  const createCode = useCreateCode(codebookId)
  const [memo, setMemo] = useState(segment.memo)
  const [status, setStatus] = useState(segment.status)
  const [newCode, setNewCode] = useState('')
  const [codeSearch, setCodeSearch] = useState('')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const dirty = memo !== segment.memo || status !== segment.status
  useEffect(() => { onDirtyChange(dirty) }, [dirty, onDirtyChange])
  const visibleCodes = codes.filter((code) => code.name.toLocaleLowerCase().includes(codeSearch.trim().toLocaleLowerCase()))
  function mutationFeedback(action: () => void) { setSaveState('saving'); action() }
  function createAndApply(event: FormEvent) {
    event.preventDefault()
    const name = newCode.trim()
    if (!name) return
    createCode.mutate({ name, description: '', color: COLORS[codes.length % COLORS.length], hotkey: null }, { onSuccess: (code) => {
      setSaveState('saving')
      addCode.mutate({ segmentId: segment.id, codeId: code.id }, { onSuccess: () => setSaveState('saved'), onError: () => setSaveState('error') }); setNewCode('')
    } })
  }
  return <div className="mt-5 grid gap-5 border-t border-slate-200 pt-5 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,.7fr)]">
    <section>
      <p className="eyebrow">Analytic note</p>
      <textarea className="field mt-2 min-h-28 w-full resize-y text-sm leading-6" value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="What is happening in this data unit? Record interpretations, questions, and contradictions…" />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select className="field text-sm" value={status} onChange={(event) => setStatus(event.target.value as SegmentStatus)} aria-label="Evidence status">{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <button className="btn-primary" disabled={update.isPending || !dirty} onClick={() => { setSaveState('saving'); update.mutate({ id: segment.id, memo, status }, { onSuccess: () => setSaveState('saved'), onError: () => setSaveState('error') }) }}>{update.isPending ? 'Saving…' : 'Save note'}</button>
        {dirty && <span className="text-xs font-semibold text-amber-700">Unsaved changes</span>}
      </div>
    </section>
    <section>
      <p className="eyebrow">Inductive codes</p>
      <form className="mt-2 flex gap-2" onSubmit={createAndApply}><input className="field min-w-0 flex-1 text-sm" value={newCode} onChange={(event) => setNewCode(event.target.value)} placeholder="Name a new code…" /><button className="btn-primary px-3" disabled={!newCode.trim() || createCode.isPending}>Create + apply</button></form>
      {createCode.isError && <p role="alert" className="mt-1 text-xs text-red-700">Use a unique code name.</p>}
      <div className="mt-3 max-h-40 space-y-1 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
        {codes.length > 6 && <input className="field mb-1 w-full text-sm" value={codeSearch} onChange={(event) => setCodeSearch(event.target.value)} placeholder="Find an existing code…" aria-label="Find an existing code" />}
        {visibleCodes.map((code) => { const linked = segment.codes.some((item) => item.id === code.id); return <label key={code.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-white"><input type="checkbox" checked={linked} disabled={addCode.isPending || removeCode.isPending} onChange={() => mutationFeedback(() => linked ? removeCode.mutate({ segmentId: segment.id, codeId: code.id }, { onSuccess: () => setSaveState('saved'), onError: () => setSaveState('error') }) : addCode.mutate({ segmentId: segment.id, codeId: code.id }, { onSuccess: () => setSaveState('saved'), onError: () => setSaveState('error') }))} /><span className="h-2.5 w-2.5 rounded-full" style={{ background: code.color }} /><span>{code.name}</span></label> })}
        {codes.length === 0 && <p className="p-2 text-xs italic text-slate-500">No predetermined codes. Create the first code from this passage.</p>}
      </div>
      <p className="eyebrow mt-5">Sections / themes</p>
      <div className="mt-2 space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-2">
        {themes.map((theme) => { const linked = segment.themes.some((item) => item.id === theme.id); return <label key={theme.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-white"><input type="checkbox" checked={linked} disabled={toggleTheme.isPending} onChange={() => mutationFeedback(() => toggleTheme.mutate({ segmentId: segment.id, themeId: theme.id, linked }, { onSuccess: () => setSaveState('saved'), onError: () => setSaveState('error') }))} /><span className="h-2.5 w-2.5 rounded-full" style={{ background: theme.color }} /><span>{theme.name}</span></label> })}
        {themes.length === 0 && <p className="p-2 text-xs italic text-slate-500">Create an emerging theme in the sidebar, then place this unit under it.</p>}
      </div>
      <p aria-live="polite" className={`mt-2 text-xs font-semibold ${saveState === 'error' ? 'text-red-700' : 'text-emerald-700'}`}>{saveState === 'saving' ? 'Saving changes…' : saveState === 'saved' ? 'All changes saved' : saveState === 'error' ? 'Could not save. Try again.' : 'Code and theme selections save automatically.'}</p>
    </section>
  </div>
}

function ThemeCreator({ codebookId }: { codebookId: string }) {
  const create = useCreateTheme(codebookId); const [name, setName] = useState('')
  function submit(event: FormEvent) { event.preventDefault(); if (!name.trim()) return; create.mutate({ name: name.trim(), memo: '', color: '#68568c', status: 'candidate' }, { onSuccess: () => setName('') }) }
  return <form onSubmit={submit} className="mt-3"><label className="eyebrow" htmlFor="new-theme">New emerging theme</label><div className="mt-1 flex gap-1.5"><input id="new-theme" className="field min-w-0 flex-1 text-sm" value={name} onChange={(event) => setName(event.target.value)} placeholder="Working title…" /><button className="btn-primary px-3" disabled={!name.trim() || create.isPending}>Add</button></div></form>
}

export function DatasetScreen({ coderId, passNo, codebookId, theme, onToggleTheme, onOpenWorkspace }: Props) {
  const segmentsQuery = useSegments(coderId, passNo); const codesQuery = useCodes(codebookId); const themesQuery = useThemes(codebookId)
  const deleteSegment = useDeleteSegment()
  const [query, setQuery] = useState(''); const [scope, setScope] = useState<Scope>('all'); const [expanded, setExpanded] = useState<string | null>(null)
  const [dirtySegment, setDirtySegment] = useState<string | null>(null)
  const [navigationOpen, setNavigationOpen] = useState(false)
  const [codesOpen, setCodesOpen] = useState(false)
  const segments = useMemo(() => segmentsQuery.data ?? [], [segmentsQuery.data]); const codes = useMemo(() => codesQuery.data ?? [], [codesQuery.data]); const themes = useMemo(() => themesQuery.data ?? [], [themesQuery.data])
  const filtered = useMemo(() => { const needle = query.trim().toLocaleLowerCase(); return segments.filter((segment) => {
    if (scope === 'uncoded' && segment.codes.length > 0) return false
    if (scope === 'uncertain' && segment.status !== 'uncertain') return false
    if (scope.startsWith('theme:') && !segment.themes.some((theme) => `theme:${theme.id}` === scope)) return false
    if (scope.startsWith('code:') && !segment.codes.some((code) => `code:${code.id}` === scope)) return false
    return !needle || [segment.selected_text, segment.context_text, segment.memo, segment.author ?? '', ...segment.codes.map((code) => code.name), ...segment.themes.map((theme) => theme.name)].some((value) => value.toLocaleLowerCase().includes(needle))
  }) }, [segments, scope, query])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirtySegment) event.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirtySegment])
  function canLeaveEditor() {
    return !dirtySegment || window.confirm('This analytic note has unsaved changes. Discard them?')
  }
  function chooseScope(next: Scope) {
    if (!canLeaveEditor()) return
    setExpanded(null); setDirtySegment(null); setScope(next); setNavigationOpen(false)
  }
  const scopeLabel = scope === 'all' ? 'All data units' : scope === 'uncoded' ? 'Needs coding' : scope === 'uncertain' ? 'Uncertain / revisit' : scope.startsWith('theme:') ? themes.find((item) => `theme:${item.id}` === scope)?.name ?? 'Theme' : codes.find((item) => `code:${item.id}` === scope)?.name ?? 'Code'

  return <main className="app-shell min-h-screen">
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur sm:px-6"><div className="mx-auto flex max-w-[92rem] flex-wrap items-center gap-3"><Link to="/" onClick={(event) => { if (!canLeaveEditor()) event.preventDefault() }} className="btn-secondary inline-flex items-center">← Work queue</Link><div><p className="eyebrow">Inductive analysis</p><h1 className="text-lg font-bold text-slate-900">Evidence dataset</h1></div><div className="ml-auto hidden text-xs text-slate-500 sm:block">{coderId} · Pass {passNo}</div><HeaderActions theme={theme} onToggleTheme={onToggleTheme} onOpenWorkspace={onOpenWorkspace} /></div></header>
    <div className="mx-auto grid max-w-[92rem] items-start gap-5 px-4 py-5 md:grid-cols-[15rem_minmax(0,1fr)] sm:px-6">
      <button type="button" className="surface flex items-center rounded-xl p-3 text-left md:hidden" onClick={() => setNavigationOpen(!navigationOpen)} aria-expanded={navigationOpen}><span className="min-w-0 flex-1"><span className="eyebrow block">Current dataset view</span><span className="font-semibold">{scopeLabel}</span> <span className="text-sm text-slate-500">· {filtered.length} units</span></span><span aria-hidden="true">{navigationOpen ? '▲' : '▼'}</span></button>
      <aside className={`surface rounded-xl p-3 md:sticky md:top-20 ${navigationOpen ? 'block' : 'hidden md:block'}`}>
        <p className="eyebrow px-2 py-1">Dataset views</p><nav className="mt-1 space-y-1" aria-label="Dataset views">{([['all', 'All data units', segments.length], ['uncoded', 'Needs coding', segments.filter((item) => item.codes.length === 0).length], ['uncertain', 'Uncertain / revisit', segments.filter((item) => item.status === 'uncertain').length]] as const).map(([id, label, count]) => <button key={id} onClick={() => chooseScope(id)} className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-sm ${scope === id ? 'bg-emerald-100 font-semibold text-emerald-950' : 'text-slate-700 hover:bg-slate-50'}`}><span className="flex-1">{label}</span><span className="text-xs tabular-nums text-slate-500">{count}</span></button>)}</nav>
        <div className="my-3 border-t border-slate-200" /><p className="eyebrow px-2 py-1">Sections / themes</p><nav className="mt-1 space-y-1">{themes.map((theme) => <button key={theme.id} onClick={() => chooseScope(`theme:${theme.id}`)} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${scope === `theme:${theme.id}` ? 'bg-violet-100 font-semibold text-violet-950' : 'text-slate-700 hover:bg-slate-50'}`}><span className="h-2.5 w-2.5 rounded-full" style={{ background: theme.color }} /><span className="min-w-0 flex-1 truncate">{theme.name}</span><span className="text-xs text-slate-500">{segments.filter((item) => item.themes.some((value) => value.id === theme.id)).length}</span></button>)}{themes.length === 0 && <p className="px-2 py-2 text-xs leading-5 text-slate-500">Themes begin empty and emerge from your coding.</p>}</nav>
        <ThemeCreator codebookId={codebookId} /><div className="my-4 border-t border-slate-200" /><dl className="grid grid-cols-2 gap-2 px-2 text-xs"><div><dt className="text-slate-500">Units</dt><dd className="mt-0.5 text-lg font-bold">{segments.length}</dd></div><div><dt className="text-slate-500">Open codes</dt><dd className="mt-0.5 text-lg font-bold">{codes.length}</dd></div></dl>
        {codes.length > 0 && <div className="mt-3 border-t border-slate-200 pt-3"><button className="flex w-full items-center px-2 py-1 text-left" onClick={() => setCodesOpen(!codesOpen)} aria-expanded={codesOpen}><span className="eyebrow flex-1">Compare by code</span><span className="text-xs">{codesOpen ? '▲' : '▼'}</span></button>{codesOpen && <nav className="mt-1 max-h-52 space-y-1 overflow-auto">{codes.map((code) => <button key={code.id} onClick={() => chooseScope(`code:${code.id}`)} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${scope === `code:${code.id}` ? 'bg-blue-100 font-semibold text-blue-950' : 'text-slate-700 hover:bg-slate-50'}`}><span className="h-2.5 w-2.5 rounded-full" style={{ background: code.color }} /><span className="min-w-0 flex-1 truncate">{code.name}</span><span className="text-xs text-slate-500">{segments.filter((item) => item.codes.some((value) => value.id === code.id)).length}</span></button>)}</nav>}</div>}
      </aside>
      <section className="min-w-0">
        <div className="surface sticky top-[4.5rem] z-10 mb-4 rounded-xl p-3 shadow-sm"><input className="field w-full" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search evidence, notes, codes, or themes…" /></div>
        {(segmentsQuery.isError || codesQuery.isError || themesQuery.isError) && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-red-700">The analysis dataset could not be loaded.</p>}{segmentsQuery.isPending && <p className="py-12 text-center text-slate-500">Loading the dataset…</p>}{!segmentsQuery.isPending && filtered.length === 0 && <div className="surface rounded-xl px-6 py-14 text-center"><p className="font-semibold text-slate-800">No data units in this view.</p><p className="mt-1 text-sm text-slate-500">Capture a passage from the corpus or choose another section.</p><Link to="/" className="btn-primary mt-4 inline-flex items-center">Choose a corpus thread →</Link></div>}
        <ol className="space-y-4">{filtered.map((segment) => { const isOpen = expanded === segment.id; const sourceParams = new URLSearchParams({ segment: segment.id, post: segment.item_id, codebook: codebookId, coder: coderId, pass: String(passNo) }); return <li key={segment.id} className="surface w-full rounded-xl p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500"><span className="rounded bg-slate-100 px-2 py-1 font-mono font-semibold text-slate-700">{postLabel(segment)}</span><span className="font-semibold text-slate-700">{segment.author || 'Unknown author'}</span><span>·</span><span>{statusLabels[segment.status]}</span><span className="ml-auto truncate font-mono text-[10px]" title={segment.thread_id}>{segment.thread_id}</span></div>
          <blockquote className="mt-4 border-l-4 border-amber-400 bg-amber-50/70 px-4 py-3 text-[15px] leading-7 text-slate-800">“{segment.selected_text}”</blockquote>{segment.memo && !isOpen && <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600"><span className="font-semibold text-slate-800">Memo:</span> {segment.memo}</p>}
          <div className="mt-3 flex flex-wrap gap-1.5">{segment.themes.map((theme) => <span key={theme.id} className="rounded-full border px-2.5 py-1 text-xs font-semibold" style={{ borderColor: theme.color, color: theme.color }}>{theme.name}</span>)}{segment.codes.map((code) => <span key={code.id} className="rounded-full px-2.5 py-1 text-xs font-semibold text-white" style={{ background: code.color }}>{code.name}</span>)}{segment.codes.length === 0 && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs italic text-slate-500">Not coded yet</span>}</div>
          {isOpen && <UnitEditor segment={segment} codes={codes} themes={themes} codebookId={codebookId} onDirtyChange={(dirty) => setDirtySegment(dirty ? segment.id : null)} />}
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4"><button className={isOpen ? 'btn-primary' : 'btn-secondary'} onClick={() => { if (isOpen && !canLeaveEditor()) return; setDirtySegment(null); setExpanded(isOpen ? null : segment.id) }}>{isOpen ? 'Close coding' : 'Code / organize'}</button><Link className="btn-secondary inline-flex items-center" onClick={(event) => { if (!canLeaveEditor()) event.preventDefault() }} to={`/thread/${encodeURIComponent(segment.thread_id)}?${sourceParams.toString()}`}>Highlighted context →</Link><Link className="btn-secondary inline-flex items-center" onClick={(event) => { if (!canLeaveEditor()) event.preventDefault() }} to={`/thread/${encodeURIComponent(segment.thread_id)}?codebook=${encodeURIComponent(codebookId)}&coder=${encodeURIComponent(coderId)}&pass=${passNo}`}>Corpus thread</Link><button type="button" className="btn-secondary text-red-700" disabled={deleteSegment.isPending} title="Remove this captured selection; the corpus post is not deleted" onClick={() => { if (window.confirm('Remove this captured selection from the dataset? Its code and theme links will also be removed. The original corpus post will not be deleted.')) deleteSegment.mutate(segment.id, { onSuccess: () => { setExpanded(null); setDirtySegment(null) } }) }}>{deleteSegment.isPending ? 'Removing…' : 'Remove selection'}</button>{segment.permalink && <a className="ml-auto text-xs font-semibold text-emerald-800 hover:underline" onClick={(event) => { if (!canLeaveEditor()) event.preventDefault() }} href={segment.permalink} target="_blank" rel="noreferrer">Original source ↗</a>}</div>
        </li> })}</ol>
      </section>
    </div>
  </main>
}
