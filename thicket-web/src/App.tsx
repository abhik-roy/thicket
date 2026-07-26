import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router'
import { useCoderIdentity } from './hooks/useCoderIdentity'
import { CoderPicker } from './components/CoderPicker'
import { TriageScreen } from './screens/TriageScreen'
import { ReplyTree } from './screens/ReplyTree'
import { WorkspaceManager } from './components/WorkspaceManager'

function App() {
  const { identity, setIdentity, clearIdentity } = useCoderIdentity()
  const queryClient = useQueryClient()
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [codebookId, setCodebookIdState] = useState(
    () => localStorage.getItem('thicket:codebook-id') ?? 'default')

  function setCodebookId(id: string) {
    localStorage.setItem('thicket:codebook-id', id)
    setCodebookIdState(id)
  }

  function workspaceSwitched() {
    queryClient.clear()
    localStorage.removeItem('thicket:codebook-id')
    setCodebookIdState('default')
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
                />
              }
            />
            <Route
              path="/thread/:threadId"
              element={<ReplyTree
                coderId={identity.coderId}
                passNo={identity.passNo}
                codebookId={codebookId}
              />}
            />
          </Routes>
        </BrowserRouter>
      ) : (
        <CoderPicker onIdentitySelected={setIdentity} />
      )}
      <button
        type="button"
        onClick={() => setWorkspaceOpen(true)}
        className="btn-secondary fixed bottom-4 right-4 z-30 shadow-lg"
      >
        Workspace
      </button>
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
