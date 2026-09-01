import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { Code } from '../api/comments'
import { useCreateCode, useMergeCode, useUpdateCode } from '../api/codebooks'
import {
  useCaptureSegment, useCreateTheme, useDeleteSegment, useDeleteTheme,
  useSegments, useThemes, useToggleThemeCode, useUpdateTheme,
  type EvidenceSegment, type SelectionDraft, type SegmentStatus,
  type Theme, type ThemeInput,
} from '../api/openCoding'

type Tab = 'capture' | 'evidence' | 'codes' | 'themes'

interface Props {
  coderId: string
  passNo: number
  codebookId: string
  threadId: string
  codes: Code[]
  selection: SelectionDraft | null
  onClearSelection: () => void
  onJumpToSource: (itemId: string) => void
  focusedAppliedCodeIds: string[]
  onToggleFocusedCode: (codeId: string) => void
  onCollapse: () => void
}

const COLORS = ['#32735f', '#316a91', '#9b5b2f', '#765594', '#a43d52', '#667329']

function shortSource(id: string) {
  const match = id.match(/p0*(\d+)$/)
  return match ? `Post ${Number(match[1])}` : id
}

function CaptureComposer({
  selection, codes, coderId, passNo, codebookId, onClear,
  focusedAppliedCodeIds, onToggleFocusedCode,
}: {
  selection: SelectionDraft | null; codes: Code[]; coderId: string
  passNo: number; codebookId: string; onClear: () => void
  focusedAppliedCodeIds: string[]; onToggleFocusedCode: (codeId: string) => void
}) {
  const capture = useCaptureSegment(codebookId)
  const [memo, setMemo] = useState('')
  const [status, setStatus] = useState<SegmentStatus>('captured')
  const [search, setSearch] = useState('')
  const [codeIds, setCodeIds] = useState<string[]>([])
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [color, setColor] = useState(COLORS[0])

  useEffect(() => {
    setMemo(''); setStatus('captured'); setSearch(''); setCodeIds([])
    setNewName(''); setNewDescription('')
  }, [selection?.itemId, selection?.startOffset, selection?.endOffset])

  const similar = useMemo(() => {
    const words = new Set(newName.toLowerCase().split(/\W+/).filter(Boolean))
    if (words.size === 0) return []
    return codes.filter((code) =>
      code.name.toLowerCase() === newName.trim().toLowerCase() ||
      code.name.toLowerCase().split(/\W+/).some((word) => words.has(word)))
      .slice(0, 4)
  }, [codes, newName])
  const filtered = codes.filter((code) =>
    code.name.toLowerCase().includes(search.toLowerCase()))

  function save(event: FormEvent) {
    event.preventDefault()
    if (!selection) return
    capture.mutate({
      item_type: 'comment', item_id: selection.itemId, coder_id: coderId,
      pass_no: passNo, start_offset: selection.startOffset,
      end_offset: selection.endOffset, selected_text: selection.selectedText,
      memo, status, codebook_id: codebookId, code_ids: codeIds,
      ...(newName.trim() ? { new_code: {
        name: newName.trim(), description: newDescription.trim(), color,
      }} : {}),
    }, { onSuccess: () => {
      window.getSelection()?.removeAllRanges()
      onClear()
    }})
  }

  if (!selection) return (<div className="grid gap-4">
    <div className="rounded-2xl border border-dashed border-emerald-300 bg-emerald-50/60 p-5 text-center">
      <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-white text-xl shadow-sm">↗</div>
      <h3 className="mt-3 font-semibold text-slate-800">Select a meaningful passage</h3>
      <p className="mt-1 text-xs leading-5 text-slate-600">
        Highlight exact words in any post. Then capture them, apply an existing
        code, or create an inductive code without leaving the reader.
      </p>
    </div>
    <section className="rounded-xl border border-slate-200 bg-white p-3">
      <span className="eyebrow">Whole-post labels</span>
      <p className="mt-1 text-xs leading-5 text-slate-500">Legacy deductive coding remains available for the focused post.</p>
      <div className="mt-2 flex flex-wrap gap-1.5">{codes.map((code) => {
        const applied = focusedAppliedCodeIds.includes(code.id)
        return <button key={code.id} onClick={() => onToggleFocusedCode(code.id)}
          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${applied ? 'text-white' : 'border-slate-200 bg-white text-slate-600'}`}
          style={{ background: applied ? code.color : undefined }}>{code.name}</button>
      })}</div>
    </section>
  </div>)

  return (
    <form onSubmit={save} className="grid gap-4">
      <div>
        <div className="flex items-center justify-between">
          <span className="eyebrow">Selected evidence</span>
          <button type="button" onClick={onClear} className="text-xs font-semibold text-slate-500 hover:text-slate-800">Clear</button>
        </div>
        <blockquote className="mt-2 max-h-36 overflow-auto rounded-xl border-l-4 border-amber-400 bg-amber-50 p-3 text-sm leading-6 text-slate-750">
          “{selection.selectedText}”
        </blockquote>
      </div>
      <label className="grid gap-1 text-xs font-semibold text-slate-700">
        Analytic note <span className="font-normal text-slate-400">optional</span>
        <textarea value={memo} onChange={(e) => setMemo(e.target.value)}
          className="field min-h-20 resize-y text-sm font-normal" placeholder="What is happening in this passage? Why retain it?" />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-700">
        Evidence status
        <select className="field text-sm font-normal" value={status}
          onChange={(e) => setStatus(e.target.value as SegmentStatus)}>
          <option value="captured">Captured — code later</option>
          <option value="uncertain">Uncertain — revisit</option>
          <option value="negative_case">Negative / deviant case</option>
          <option value="excluded">Excluded after review</option>
        </select>
      </label>
      <section className="rounded-xl border border-slate-200 bg-white p-3">
        <label className="text-xs font-semibold text-slate-700">Apply existing codes</label>
        <input className="field mt-2 w-full text-sm" value={search}
          onChange={(e) => setSearch(e.target.value)} placeholder="Search open codes…" />
        <div className="mt-2 max-h-40 space-y-1 overflow-auto pr-1">
          {filtered.map((code) => (
            <label key={code.id} className="flex cursor-pointer items-center gap-2 rounded-lg p-2 text-sm hover:bg-slate-50">
              <input type="checkbox" checked={codeIds.includes(code.id)}
                onChange={() => setCodeIds((current) => current.includes(code.id)
                  ? current.filter((id) => id !== code.id) : [...current, code.id])} />
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: code.color }} />
              <span>{code.name}</span>
            </label>
          ))}
          {filtered.length === 0 && <p className="p-2 text-xs text-slate-500">No matching codes.</p>}
        </div>
      </section>
      <section className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs font-semibold text-emerald-900">Or create a new open code</label>
          <button type="button" className="text-xs font-semibold text-emerald-800"
            onClick={() => setNewName(selection.selectedText.trim().slice(0, 100))}>Use in-vivo wording</button>
        </div>
        <div className="mt-2 flex gap-2">
          <input className="field min-w-0 flex-1 text-sm" value={newName}
            onChange={(e) => setNewName(e.target.value)} placeholder="Action-oriented code name" />
          <input aria-label="New code color" type="color" value={color}
            onChange={(e) => setColor(e.target.value)} className="field h-10 w-12 p-1" />
        </div>
        <input className="field mt-2 w-full text-sm" value={newDescription}
          onChange={(e) => setNewDescription(e.target.value)} placeholder="Working definition (optional)" />
        {similar.length > 0 && (
          <div className="mt-2 rounded-lg bg-white p-2 text-xs text-amber-800">
            <b>Compare before creating:</b> {similar.map((code) => code.name).join(' · ')}
          </div>
        )}
      </section>
      {capture.isError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-700">
        Could not capture this segment: {capture.error instanceof Error
          ? capture.error.message : 'unknown server error'}
      </p>}
      <button className="btn-primary w-full" disabled={capture.isPending}>
        {capture.isPending ? 'Saving evidence…' : newName.trim()
          ? 'Create code and save segment' : codeIds.length
            ? 'Apply codes and save segment' : 'Save uncoded segment'}
      </button>
    </form>
  )
}

function EvidenceTray({ segments, onJump }: {
  segments: EvidenceSegment[]; onJump: (itemId: string) => void
}) {
  const remove = useDeleteSegment()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const visible = segments.filter((segment) => {
    const hay = `${segment.selected_text} ${segment.memo} ${segment.codes.map((c) => c.name).join(' ')}`.toLowerCase()
    return (!query || hay.includes(query.toLowerCase())) && (!status || segment.status === status)
  })
  return (
    <div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <input className="field min-w-0 text-sm" value={query}
          onChange={(e) => setQuery(e.target.value)} placeholder="Search evidence…" />
        <select aria-label="Filter evidence status" className="field text-sm" value={status}
          onChange={(e) => setStatus(e.target.value)}>
          <option value="">All</option><option value="coded">Coded</option>
          <option value="captured">Uncoded</option><option value="uncertain">Uncertain</option>
          <option value="negative_case">Negative case</option><option value="excluded">Excluded</option>
        </select>
      </div>
      <p className="mt-3 text-xs text-slate-500">{visible.length} of {segments.length} segments</p>
      <div className="mt-2 space-y-3">
        {visible.map((segment) => (
          <article key={segment.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <button className="font-bold text-emerald-800 hover:underline" onClick={() => onJump(segment.item_id)}>{shortSource(segment.item_id)}</button>
              <span className="rounded-full bg-slate-100 px-2 py-0.5">{segment.status.replace('_', ' ')}</span>
              <button type="button" className="ml-auto text-red-600 hover:underline"
                onClick={() => { if (confirm('Delete this evidence segment?')) remove.mutate(segment.id) }}>Delete</button>
            </div>
            <blockquote className="mt-2 text-sm leading-6 text-slate-750">“{segment.selected_text}”</blockquote>
            {segment.memo && <p className="mt-2 rounded-lg bg-slate-50 p-2 text-xs leading-5 text-slate-600"><b>Memo:</b> {segment.memo}</p>}
            <div className="mt-2 flex flex-wrap gap-1">
              {segment.codes.map((code) => <span key={code.id} className="rounded-full px-2 py-0.5 text-[11px] text-white" style={{ background: code.color }}>{code.name}</span>)}
              {segment.codes.length === 0 && <span className="text-xs italic text-amber-700">Not coded yet</span>}
            </div>
          </article>
        ))}
        {visible.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No evidence segments match this view.</div>}
      </div>
    </div>
  )
}

function CodesWorkspace({ codes, segments, codebookId }: {
  codes: Code[]; segments: EvidenceSegment[]; codebookId: string
}) {
  const create = useCreateCode(codebookId)
  const update = useUpdateCode(codebookId)
  const merge = useMergeCode(codebookId)
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editColor, setEditColor] = useState(COLORS[0])
  const [mergeTarget, setMergeTarget] = useState('')
  const active = codes.find((code) => code.id === selected)
  const evidence = segments.filter((segment) => segment.codes.some((code) => code.id === selected))
  useEffect(() => {
    if (!active) return
    setEditName(active.name)
    setEditDescription(active.description ?? '')
    setEditColor(active.color)
    setMergeTarget('')
  }, [active])
  function submit(event: FormEvent) {
    event.preventDefault()
    create.mutate({ name: name.trim(), description: '', color: COLORS[codes.length % COLORS.length], hotkey: null },
      { onSuccess: (code) => { setName(''); setSelected(code.id) }})
  }
  return (
    <div>
      <form onSubmit={submit} className="flex gap-2">
        <input required value={name} onChange={(e) => setName(e.target.value)}
          className="field min-w-0 flex-1 text-sm" placeholder="Create an open code…" />
        <button className="btn-primary px-3" disabled={create.isPending}>Add</button>
      </form>
      {create.isError && <p role="alert" className="mt-2 text-xs text-red-700">That code could not be created; check for an existing name.</p>}
      <div className="mt-3 grid gap-1">
        {codes.map((code) => {
          const count = segments.filter((segment) => segment.codes.some((c) => c.id === code.id)).length
          return <button key={code.id} onClick={() => setSelected(code.id)}
            className={`flex items-center gap-2 rounded-lg border p-2 text-left text-sm ${selected === code.id ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
            <span className="h-3 w-3 rounded-full" style={{ background: code.color }} />
            <span className="min-w-0 flex-1 truncate">{code.name}</span><span className="text-xs text-slate-400">{count}</span>
          </button>
        })}
      </div>
      {active && <section className="mt-4 border-t border-slate-200 pt-4">
        <span className="eyebrow">Constant comparison</span>
        <div className="mt-2 grid gap-2 rounded-xl border border-slate-200 bg-white p-3">
          <label className="grid gap-1 text-xs font-semibold text-slate-600">Code name
            <input className="field text-sm font-normal" value={editName} onChange={(event) => setEditName(event.target.value)} />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">Working definition
            <input className="field text-sm font-normal" value={editDescription} onChange={(event) => setEditDescription(event.target.value)} />
          </label>
          <div className="flex gap-2">
            <input aria-label="Code color" type="color" className="field h-10 w-12 p-1" value={editColor} onChange={(event) => setEditColor(event.target.value)} />
            <button className="btn-primary flex-1 text-xs" disabled={!editName.trim() || update.isPending}
              onClick={() => update.mutate({ id: active.id, name: editName.trim(), description: editDescription.trim(), color: editColor, hotkey: active.hotkey })}>
              {update.isPending ? 'Saving…' : 'Save code changes'}
            </button>
          </div>
          {update.isError && <p role="alert" className="text-xs text-red-700">Could not rename this code: {update.error.message}</p>}
        </div>
        <div className="mt-2 space-y-2">{evidence.map((segment) =>
          <blockquote key={segment.id} className="rounded-lg bg-white p-2 text-xs leading-5">“{segment.selected_text}”</blockquote>)}
          {evidence.length === 0 && <p className="text-xs italic text-slate-500">No segment-level evidence yet.</p>}
        </div>
        {codes.length > 1 && <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
          <label className="grid gap-1 text-xs font-semibold text-amber-900">Merge this code into
            <select className="field text-sm font-normal" value={mergeTarget} onChange={(event) => setMergeTarget(event.target.value)}>
              <option value="">Choose the code to keep…</option>
              {codes.filter((code) => code.id !== active.id).map((code) => <option key={code.id} value={code.id}>{code.name}</option>)}
            </select>
          </label>
          <button className="btn-secondary mt-2 w-full text-xs text-amber-900" disabled={!mergeTarget || merge.isPending}
            onClick={() => {
              const target = codes.find((code) => code.id === mergeTarget)
              if (target && confirm(`Merge “${active.name}” into “${target.name}”? All labels, evidence segments, and theme links will move to “${target.name}”.`)) {
                merge.mutate({ sourceId: active.id, targetId: target.id }, { onSuccess: () => setSelected(target.id) })
              }
            }}>
            {merge.isPending ? 'Merging…' : 'Merge and remove this code'}
          </button>
          {merge.isError && <p role="alert" className="mt-2 text-xs text-red-700">Could not merge these codes: {merge.error.message}</p>}
        </div>}
      </section>}
    </div>
  )
}

const EMPTY_THEME: ThemeInput = { name: '', memo: '', color: '#68568c', status: 'candidate' }

function ThemeCard({ theme, codes }: { theme: Theme; codes: Code[] }) {
  const update = useUpdateTheme()
  const remove = useDeleteTheme()
  const toggle = useToggleThemeCode()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<ThemeInput>({
    name: theme.name, memo: theme.memo, color: theme.color, status: theme.status,
  })
  return <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm" style={{ borderLeft: `4px solid ${theme.color}` }}>
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1"><span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{theme.status}</span><h3 className="truncate font-semibold">{theme.name}</h3></div>
      <button className="text-xs font-semibold text-emerald-800" onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Edit'}</button>
    </div>
    {theme.memo && !editing && <p className="mt-2 text-xs leading-5 text-slate-600">{theme.memo}</p>}
    {editing && <div className="mt-3 grid gap-2">
      <input className="field text-sm" value={draft.name} onChange={(e) => setDraft({...draft,name:e.target.value})} />
      <textarea className="field min-h-20 text-sm" value={draft.memo} onChange={(e) => setDraft({...draft,memo:e.target.value})} placeholder="Central organizing concept, boundaries, contradictions…" />
      <div className="flex gap-2"><select className="field flex-1 text-sm" value={draft.status} onChange={(e) => setDraft({...draft,status:e.target.value as ThemeInput['status']})}>
        <option value="candidate">Candidate</option><option value="reviewing">Reviewing</option><option value="retained">Retained</option><option value="rejected">Rejected</option>
      </select><input aria-label="Theme color" type="color" className="field h-10 w-12 p-1" value={draft.color} onChange={(e) => setDraft({...draft,color:e.target.value})} /></div>
      <div className="flex gap-2"><button className="btn-primary flex-1 text-xs" onClick={() => update.mutate({id:theme.id,...draft},{onSuccess:()=>setEditing(false)})}>Save theme</button><button className="btn-secondary text-xs text-red-700" onClick={() => {if(confirm('Delete this candidate theme?'))remove.mutate(theme.id)}}>Delete</button></div>
    </div>}
    <div className="mt-3 flex flex-wrap gap-1">{theme.codes.map((code) => <span key={code.id} className="rounded-full bg-slate-100 px-2 py-1 text-[11px]">{code.name} · {code.segment_count}</span>)}{theme.codes.length===0&&<span className="text-xs italic text-slate-400">No codes grouped yet</span>}</div>
    {editing && <details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-slate-600">Group codes under this theme</summary><div className="mt-2 max-h-44 space-y-1 overflow-auto">{codes.map((code) => {const linked=theme.codes.some((c)=>c.id===code.id);return <label key={code.id} className="flex cursor-pointer items-center gap-2 rounded p-1.5 text-xs hover:bg-slate-50"><input type="checkbox" checked={linked} disabled={toggle.isPending} onChange={()=>toggle.mutate({themeId:theme.id,codeId:code.id,linked})}/><span className="h-2 w-2 rounded-full" style={{background:code.color}}/>{code.name}</label>})}</div></details>}
  </article>
}

function ThemesWorkspace({ themes, codes, codebookId }: { themes: Theme[]; codes: Code[]; codebookId: string }) {
  const create = useCreateTheme(codebookId)
  const [draft, setDraft] = useState(EMPTY_THEME)
  const grouped = new Set(themes.flatMap((theme) => theme.codes.map((code) => code.id)))
  function submit(event: FormEvent) { event.preventDefault(); create.mutate(draft,{onSuccess:()=>setDraft(EMPTY_THEME)}) }
  return <div>
    <form onSubmit={submit} className="rounded-xl border border-violet-200 bg-violet-50/50 p-3">
      <span className="eyebrow text-violet-800">New candidate theme</span>
      <input required className="field mt-2 w-full text-sm" value={draft.name} onChange={(e)=>setDraft({...draft,name:e.target.value})} placeholder="Working theme name" />
      <textarea className="field mt-2 min-h-20 w-full text-sm" value={draft.memo} onChange={(e)=>setDraft({...draft,memo:e.target.value})} placeholder="What central organizing concept might unite these codes?" />
      <button className="btn-primary mt-2 w-full" disabled={create.isPending}>Create candidate theme</button>
    </form>
    <div className="mt-3 space-y-3">{themes.map((theme)=><ThemeCard key={theme.id} theme={theme} codes={codes}/>)}</div>
    <section className="mt-4 rounded-xl border border-dashed border-slate-300 p-3"><span className="eyebrow">Ungrouped codes</span><div className="mt-2 flex flex-wrap gap-1">{codes.filter((c)=>!grouped.has(c.id)).map((code)=><span key={code.id} className="rounded-full bg-white px-2 py-1 text-xs">{code.name}</span>)}{codes.length===0?<span className="text-xs italic text-slate-500">No open codes yet. Create one while capturing evidence.</span>:codes.every((c)=>grouped.has(c.id))&&<span className="text-xs italic text-slate-500">All codes currently appear in at least one theme.</span>}</div></section>
  </div>
}

export function OpenCodingWorkbench(props: Props) {
  const { coderId, passNo, threadId, codebookId, codes, selection,
    onClearSelection, onJumpToSource, focusedAppliedCodeIds,
    onToggleFocusedCode, onCollapse } = props
  const [tab, setTab] = useState<Tab>('capture')
  const segmentsQuery = useSegments(coderId, passNo)
  const themesQuery = useThemes(codebookId)
  useEffect(() => { if (selection) setTab('capture') }, [selection])
  const segments = (segmentsQuery.data ?? []).filter(
    (segment) => segment.thread_id === threadId)
  const themes = themesQuery.data ?? []
  const tabs: [Tab,string,string][] = [
    ['capture','Capture','✦'],['evidence','Dataset',String(segments.length)],
    ['codes','Codes',String(codes.length)],['themes','Themes',String(themes.length)],
  ]
  return <aside className="open-workbench flex w-[26rem] shrink-0 flex-col border-l border-slate-200 bg-slate-50/95" data-testid="open-coding-workbench">
    <div className="mobile-workbench-bar"><span>Open-coding workspace</span><button onClick={onCollapse}>Hide ↓</button></div>
    <nav className="grid grid-cols-4 border-b border-slate-200 bg-white p-1.5">{tabs.map(([id,label,count])=><button key={id} onClick={()=>setTab(id)} className={`rounded-lg px-2 py-2 text-xs font-semibold ${tab===id?'bg-emerald-100 text-emerald-900':'text-slate-500 hover:bg-slate-50'}`}><span className="block text-[10px] font-normal opacity-70">{count}</span>{label}</button>)}</nav>
    <div className="min-h-0 flex-1 overflow-auto p-4">
      {tab==='capture'&&<CaptureComposer selection={selection} codes={codes} coderId={coderId} passNo={passNo} codebookId={codebookId} onClear={onClearSelection} focusedAppliedCodeIds={focusedAppliedCodeIds} onToggleFocusedCode={onToggleFocusedCode}/>}
      {tab==='evidence'&&<EvidenceTray segments={segments} onJump={onJumpToSource}/>}
      {tab==='codes'&&<CodesWorkspace codes={codes} segments={segments} codebookId={codebookId}/>}
      {tab==='themes'&&<ThemesWorkspace themes={themes} codes={codes} codebookId={codebookId}/>}
      {(segmentsQuery.isError||themesQuery.isError)&&<p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">The analytic workspace could not load. Check the backend connection and retry.</p>}
    </div>
  </aside>
}
