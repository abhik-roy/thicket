import { useEffect, useMemo, useState } from 'react'
import type { Code } from '../api/comments'
import type { EvidenceSegment } from '../api/openCoding'
import { useMergeCode, useSplitCode, useUpdateCode } from '../api/codebooks'

interface Props { codes: Code[]; segments: EvidenceSegment[]; codebookId: string }
type Action = 'edit' | 'merge' | 'split'

export function DatasetCodeManager({ codes, segments, codebookId }: Props) {
  const update = useUpdateCode(codebookId)
  const merge = useMergeCode(codebookId)
  const split = useSplitCode(codebookId)
  const [open, setOpen] = useState(false)
  const [codeId, setCodeId] = useState('')
  const [action, setAction] = useState<Action>('edit')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState('#32735f')
  const [mergeTarget, setMergeTarget] = useState('')
  const [splitName, setSplitName] = useState('')
  const [splitSegments, setSplitSegments] = useState<string[]>([])
  const active = codes.find((code) => code.id === codeId)
  const evidence = useMemo(() => segments.filter((segment) =>
    segment.codes.some((code) => code.id === codeId)), [segments, codeId])

  useEffect(() => {
    if (!active) return
    setName(active.name); setDescription(active.description ?? '')
    setColor(active.color); setMergeTarget(''); setSplitName('')
    setSplitSegments([])
  }, [active])

  return <section className="surface rounded-xl p-3">
    <button type="button" className="flex w-full items-center text-left"
      onClick={() => setOpen(!open)} aria-expanded={open}>
      <span className="eyebrow flex-1">Code management</span>
      <span className="text-xs">{open ? '▲' : '▼'}</span>
    </button>
    {open && <div className="mt-3 border-t border-slate-200 pt-3">
      <label className="grid gap-1 text-xs font-semibold text-slate-600">Code
        <select className="field min-w-0 text-sm font-normal" value={codeId}
          onChange={(event) => setCodeId(event.target.value)}>
          <option value="">Choose a code…</option>
          {codes.map((code) => <option key={code.id} value={code.id}>{code.name}</option>)}
        </select>
      </label>
      {active && <>
        <div className="mt-3 grid grid-cols-3 rounded-lg bg-slate-100 p-1">
          {(['edit', 'merge', 'split'] as const).map((value) => <button key={value}
            type="button" onClick={() => setAction(value)}
            className={`rounded-md px-1 py-1.5 text-[11px] font-bold capitalize ${action === value ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-500'}`}>
            {value}
          </button>)}
        </div>
        {action === 'edit' && <div className="mt-3 grid gap-2">
          <input className="field min-w-0 text-sm" aria-label="Code name"
            value={name} onChange={(event) => setName(event.target.value)} />
          <textarea className="field min-h-20 text-sm" aria-label="Code definition"
            placeholder="Working definition…" value={description}
            onChange={(event) => setDescription(event.target.value)} />
          <label className="flex items-center gap-2 text-xs text-slate-600">Color
            <input type="color" value={color} aria-label="Code color"
              onChange={(event) => setColor(event.target.value)} />
          </label>
          <button className="btn-primary text-xs" disabled={!name.trim() || update.isPending}
            onClick={() => update.mutate({ id: active.id, name: name.trim(),
              description: description.trim(), color, hotkey: active.hotkey })}>
            {update.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </div>}
        {action === 'merge' && <div className="mt-3 grid gap-2">
          <p className="text-xs leading-5 text-slate-500">Move every use of <b>{active.name}</b> into the code you keep.</p>
          <select className="field min-w-0 text-sm" aria-label="Code to keep"
            value={mergeTarget} onChange={(event) => setMergeTarget(event.target.value)}>
            <option value="">Code to keep…</option>
            {codes.filter((code) => code.id !== active.id).map((code) =>
              <option key={code.id} value={code.id}>{code.name}</option>)}
          </select>
          <button className="btn-secondary text-xs text-amber-800"
            disabled={!mergeTarget || merge.isPending} onClick={() => {
              const target = codes.find((code) => code.id === mergeTarget)
              if (target && confirm(`Merge “${active.name}” into “${target.name}”? This moves all labels, segments, and theme links, then removes “${active.name}”.`)) {
                merge.mutate({ sourceId: active.id, targetId: target.id },
                  { onSuccess: () => setCodeId(target.id) })
              }
            }}>{merge.isPending ? 'Merging…' : 'Merge and remove'}</button>
        </div>}
        {action === 'split' && <div className="mt-3 grid gap-2">
          <p className="text-xs leading-5 text-slate-500">Create a narrower code and choose which evidence units move to it. Whole-post labels stay on the original.</p>
          <input className="field min-w-0 text-sm" placeholder="New code name…"
            aria-label="New split code name" value={splitName}
            onChange={(event) => setSplitName(event.target.value)} />
          <div className="max-h-52 space-y-1 overflow-auto rounded-lg border border-slate-200 p-1.5">
            {evidence.map((segment) => <label key={segment.id}
              className="flex cursor-pointer gap-2 rounded-md p-1.5 text-[11px] leading-4 hover:bg-slate-50">
              <input type="checkbox" className="mt-0.5" checked={splitSegments.includes(segment.id)}
                onChange={() => setSplitSegments((selected) => selected.includes(segment.id)
                  ? selected.filter((id) => id !== segment.id) : [...selected, segment.id])} />
              <span className="line-clamp-3">“{segment.selected_text}”</span>
            </label>)}
            {evidence.length === 0 && <p className="p-2 text-xs italic text-slate-500">This code has no segment-level evidence to split.</p>}
          </div>
          <p className="text-[11px] text-slate-500">{splitSegments.length} of {evidence.length} selected</p>
          <button className="btn-primary text-xs"
            disabled={!splitName.trim() || splitSegments.length === 0 || split.isPending}
            onClick={() => {
              if (confirm(`Create “${splitName.trim()}” and move ${splitSegments.length} selected evidence ${splitSegments.length === 1 ? 'unit' : 'units'} from “${active.name}”?`)) {
                split.mutate({ sourceId: active.id, name: splitName.trim(),
                  description: active.description ?? '', color: active.color,
                  segmentIds: splitSegments }, { onSuccess: (code) => {
                    setCodeId(code.id); setAction('edit')
                  } })
              }
            }}>{split.isPending ? 'Splitting…' : 'Create split code'}</button>
        </div>}
        {(update.isError || merge.isError || split.isError) &&
          <p role="alert" className="mt-2 text-xs text-red-700">The code change could not be completed. Check for a duplicate name and try again.</p>}
      </>}
      {codes.length === 0 && <p className="text-xs italic text-slate-500">Create a code from a data unit first.</p>}
    </div>}
  </section>
}
