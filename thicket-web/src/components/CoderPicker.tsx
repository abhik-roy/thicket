import { useState, type FormEvent } from 'react'
import { useCoders, useCreateCoder } from '../api/threads'
import type { CoderIdentity } from '../hooks/useCoderIdentity'

export interface CoderPickerProps {
  onIdentitySelected: (identity: CoderIdentity) => void
}

export function CoderPicker({ onIdentitySelected }: CoderPickerProps) {
  const { data: coders, isPending, isError: codersError } = useCoders()
  const createCoder = useCreateCoder()
  const [selectedId, setSelectedId] = useState('')
  const [newName, setNewName] = useState('')
  const [passNo, setPassNo] = useState(1)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (selectedId) {
      onIdentitySelected({ coderId: selectedId, passNo })
      return
    }
    const trimmed = newName.trim()
    if (!trimmed) return
    const id = trimmed.toLowerCase().replace(/\s+/g, '-')
    try {
      const coder = await createCoder.mutateAsync({ id, name: trimmed })
      onIdentitySelected({ coderId: coder.id, passNo })
    } catch {
      // createCoder.isError / createCoder.error are tracked by the
      // mutation hook itself and rendered below -- nothing else to do here.
    }
  }

  return (
    <main className="app-shell grid min-h-screen place-items-center p-6">
    <form onSubmit={handleSubmit} className="surface w-full max-w-md rounded-2xl p-8 shadow-sm">
      <div className="mb-7">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-800">Thicket</p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Start a coding session</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Choose your identity and independent coding pass. Your selection stays on this device.</p>
      </div>
      {isPending ? (
        <p>Loading coders...</p>
      ) : (
        <select
          aria-label="Coder"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="field mb-4 w-full"
        >
          <option value="">-- pick a coder --</option>
          {coders?.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      )}
      {codersError && (
        <p role="alert" className="mb-3 text-sm text-red-600">
          Could not load coders. Try refreshing.
        </p>
      )}
      <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wider text-slate-400"><span className="h-px flex-1 bg-slate-200" />or add a coder<span className="h-px flex-1 bg-slate-200" /></div>
      <input
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        placeholder="New coder name"
        className="field mb-5 w-full"
      />
      {createCoder.isError && (
        <p role="alert" className="mb-3 text-sm text-red-600">
          Could not create that coder. Try again.
        </p>
      )}
      <label className="mb-6 block text-sm font-medium text-slate-700">
        Independent coding pass
        <select
          aria-label="Pass"
          value={passNo}
          onChange={(e) => setPassNo(Number(e.target.value))}
          className="field ml-3"
        >
          <option value={1}>1</option>
          <option value={2}>2</option>
        </select>
      </label>
      <button
        type="submit"
        className="btn-primary w-full"
      >
        Continue
      </button>
    </form>
    </main>
  )
}
