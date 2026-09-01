import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router'
import { useCoderIdentity } from './hooks/useCoderIdentity'
import { CoderPicker } from './components/CoderPicker'
import { TriageScreen } from './screens/TriageScreen'
import { ReplyTree } from './screens/ReplyTree'
import { DatasetScreen } from './screens/DatasetScreen'
import { WorkspaceManager } from './components/WorkspaceManager'
import { useCodebooks } from './api/codebooks'
import { useCoders } from './api/threads'

function App() {
  const { identity, setIdentity, clearIdentity } = useCoderIdentity()
  const queryClient = useQueryClient()
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    localStorage.getItem('thicket:theme') === 'dark' ? 'dark' : 'light')
  const [codebookResolved, setCodebookResolved] = useState(false)
  const requestedCodebook = new URLSearchParams(window.location.search).get('codebook')
  const hadSavedCodebook = useRef(
    requestedCodebook !== null || localStorage.getItem('thicket:codebook-id') !== null)
  const [codebookId, setCodebookIdState] = useState(
    () => requestedCodebook ?? localStorage.getItem('thicket:codebook-id') ?? 'default')
  const codebooks = useCodebooks()
  const coders = useCoders()

  useEffect(() => {
    if (!identity || !coders.data) return
    if (!coders.data.some((coder) => coder.id === identity.coderId)) {
      clearIdentity()
    }
  }, [identity, coders.data, clearIdentity])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    localStorage.setItem('thicket:theme', theme)
  }, [theme])

  useEffect(() => {
    if (codebookResolved || !codebooks.data?.length) return
    const mostUsed = [...codebooks.data].sort(
      (a, b) => b.label_count - a.label_count)[0]
    const selected = codebooks.data.find((book) => book.id === codebookId)
    if (!selected || (!hadSavedCodebook.current && mostUsed.label_count > 0)) {
      setCodebookId(mostUsed.id)
    }
    setCodebookResolved(true)
  }, [codebookResolved, codebookId, codebooks.data])

  function setCodebookId(id: string) {
    localStorage.setItem('thicket:codebook-id', id)
    setCodebookIdState(id)
  }

  function workspaceSwitched() {
    queryClient.clear()
    localStorage.removeItem('thicket:codebook-id')
    hadSavedCodebook.current = false
    setCodebookIdState('default')
    setCodebookResolved(false)
    clearIdentity()
    setWorkspaceOpen(false)
  }

  return (
    <>
      {identity ? (
        <BrowserRouter>
          <Routes>
            <Route
              path="/"
              element={
                <TriageScreen
                  coderId={identity.coderId}
                  passNo={identity.passNo}
                  codebookId={codebookId}
                  onCodebookChange={setCodebookId}
                  onChangeSession={clearIdentity}
                  theme={theme}
                  onToggleTheme={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')}
                  onOpenWorkspace={() => setWorkspaceOpen(true)}
                />
              }
            />
            <Route
              path="/dataset"
              element={<DatasetScreen
                coderId={identity.coderId}
                passNo={identity.passNo}
                codebookId={codebookId}
                theme={theme}
                onToggleTheme={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')}
                onOpenWorkspace={() => setWorkspaceOpen(true)}
              />}
            />
            <Route
              path="/thread/:threadId"
              element={<ReplyTree
                coderId={identity.coderId}
                passNo={identity.passNo}
                codebookId={codebookId}
                theme={theme}
                onToggleTheme={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')}
                onOpenWorkspace={() => setWorkspaceOpen(true)}
              />}
            />
          </Routes>
        </BrowserRouter>
      ) : (
        <CoderPicker onIdentitySelected={setIdentity} />
      )}
      {workspaceOpen && (
        <WorkspaceManager
          onClose={() => setWorkspaceOpen(false)}
          onSwitched={workspaceSwitched}
        />
      )}
    </>
  )
}

export default App
