import { useEffect, useState, type FormEvent } from 'react'
import { useCodes, type Code } from '../api/comments'
import {
  useCodebooks, useCreateCode, useCreateCodebook, useDeleteCode,
  useDeleteCodebook, useUpdateCode, type CodeInput,
} from '../api/codebooks'

export interface CodebookManagerProps {
  selectedId: string
  onSelect: (id: string) => void
  onClose: () => void
}

const EMPTY_CODE: CodeInput = {
  name: '', description: '', color: '#167d66', hotkey: null,
}

function CodeRow({ code, codebookId }: { code: Code; codebookId: string }) {
  const [draft, setDraft] = useState<CodeInput>({
    name: code.name,
    description: code.description ?? '',
    color: code.color,
    hotkey: code.hotkey,
  })
  const update = useUpdateCode(codebookId)
  const remove = useDeleteCode(codebookId)

  return (
    <div className="grid grid-cols-[1fr_5rem_4rem_auto] gap-2">
      <input
        aria-label={`Code name ${code.name}`}
        value={draft.name}
        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        className="field text-sm"
      />
      <input
        aria-label={`Color for ${code.name}`}
        type="color"
        value={draft.color}
        onChange={(e) => setDraft({ ...draft, color: e.target.value })}
        className="field h-10 p-1"
      />
      <select
        aria-label={`Hotkey for ${code.name}`}
        value={draft.hotkey ?? ''}
        onChange={(e) => setDraft({
          ...draft, hotkey: e.target.value || null,
        })}
        className="field text-sm"
      >
        <option value="">—</option>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((key) => (
          <option key={key} value={key}>{key}</option>
        ))}
      </select>
      <div className="flex gap-1">
        <button
          type="button"
          className="btn-secondary text-xs"
          disabled={!draft.name.trim() || update.isPending}
          onClick={() => update.mutate({ id: code.id, ...draft })}
        >
          Save
        </button>
        <button
          type="button"
          className="btn-secondary text-xs text-red-700"
          disabled={remove.isPending}
          onClick={() => remove.mutate(code.id)}
        >
          Delete
        </button>
      </div>
      <textarea
        aria-label={`Code description ${code.name}`}
        value={draft.description}
        onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        placeholder="Inclusion, exclusion, and boundary guidance"
        className="field col-span-full min-h-16 text-sm"
      />
      {(update.isError || remove.isError) && (
        <p role="alert" className="col-span-full text-xs text-red-700">
          Could not save this change. Codes already used in labels cannot be
          deleted.
        </p>
      )}
    </div>
  )
}

export function CodebookManager({
  selectedId, onSelect, onClose,
}: CodebookManagerProps) {
  const codebooks = useCodebooks()
  const codes = useCodes(selectedId)
  const createBook = useCreateCodebook()
  const deleteBook = useDeleteCodebook()
  const createCode = useCreateCode(selectedId)
  const [bookName, setBookName] = useState('')
  const [newCode, setNewCode] = useState<CodeInput>(EMPTY_CODE)

  useEffect(() => {
    if (codebooks.data?.length &&
        !codebooks.data.some((book) => book.id === selectedId)) {
      onSelect(codebooks.data[0].id)
    }
  }, [codebooks.data, selectedId, onSelect])

  function addBook(event: FormEvent) {
    event.preventDefault()
    createBook.mutate(
      { name: bookName, description: '' },
      { onSuccess: (book) => {
        setBookName('')
        onSelect(book.id)
      }},
    )
  }

  function addCode(event: FormEvent) {
    event.preventDefault()
    createCode.mutate(newCode, {
      onSuccess: () => setNewCode(EMPTY_CODE),
    })
  }

  return (
    <div
      role="dialog"
      aria-label="Manage codebooks"
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4"
    >
      <section className="surface max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl p-6">
        <header className="flex items-start gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-800">
              Coding configuration
            </p>
            <h2 className="mt-1 text-xl font-semibold">Codebooks and codes</h2>
            <p className="mt-2 text-sm text-slate-600">
              Choose the active codebook or create one for your project.
            </p>
          </div>
          <button
            type="button" onClick={onClose} aria-label="Close codebook manager"
            className="ml-auto btn-secondary"
          >
            Close
          </button>
        </header>

        <div className="mt-6 flex flex-wrap gap-2">
          <select
            aria-label="Active codebook"
            className="field min-w-64"
            value={selectedId}
            onChange={(e) => onSelect(e.target.value)}
          >
            {(codebooks.data ?? []).map((book) => (
              <option key={book.id} value={book.id}>
                {book.name} ({book.label_count} applied labels)
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-secondary text-red-700"
            disabled={selectedId === 'default' || deleteBook.isPending}
            onClick={() => deleteBook.mutate(selectedId)}
          >
            Delete codebook
          </button>
        </div>

        <form onSubmit={addBook} className="mt-4 flex gap-2">
          <input
            required
            aria-label="New codebook name"
            value={bookName}
            onChange={(e) => setBookName(e.target.value)}
            placeholder="New codebook name"
            className="field flex-1"
          />
          <button className="btn-primary" disabled={createBook.isPending}>
            Create codebook
          </button>
        </form>

        <div className="mt-7 border-t border-slate-200 pt-5">
          <h3 className="font-semibold">Codes in active codebook</h3>
          <div className="mt-3 grid gap-2">
            {(codes.data ?? []).map((code) => (
              <CodeRow key={code.id} code={code} codebookId={selectedId} />
            ))}
          </div>
          <form
            onSubmit={addCode}
            className="mt-4 grid grid-cols-[1fr_5rem_4rem_auto] gap-2"
          >
            <input
              required
              aria-label="New code name"
              value={newCode.name}
              onChange={(e) => setNewCode({ ...newCode, name: e.target.value })}
              placeholder="New code"
              className="field"
            />
            <input
              aria-label="New code color"
              type="color"
              value={newCode.color}
              onChange={(e) => setNewCode({ ...newCode, color: e.target.value })}
              className="field h-10 p-1"
            />
            <select
              aria-label="New code hotkey"
              value={newCode.hotkey ?? ''}
              onChange={(e) => setNewCode({
                ...newCode, hotkey: e.target.value || null,
              })}
              className="field"
            >
              <option value="">—</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((key) => (
                <option key={key} value={key}>{key}</option>
              ))}
            </select>
            <button className="btn-primary" disabled={createCode.isPending}>
              Add code
            </button>
          </form>
        </div>
        {(createBook.isError || deleteBook.isError || createCode.isError) && (
          <p role="alert" className="mt-4 text-sm text-red-700">
            The change could not be saved. A codebook containing used codes
            cannot be deleted.
          </p>
        )}
      </section>
    </div>
  )
}
