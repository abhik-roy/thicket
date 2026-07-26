import { useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'
import { useCoderIdentity } from './hooks/useCoderIdentity'
import { CoderPicker } from './components/CoderPicker'
import { TriageScreen } from './screens/TriageScreen'
import { ReplyTree } from './screens/ReplyTree'

function App() {
  const { identity, setIdentity, clearIdentity } = useCoderIdentity()
  const [codebookId, setCodebookIdState] = useState(
    () => localStorage.getItem('thicket:codebook-id') ?? 'default')

  function setCodebookId(id: string) {
    localStorage.setItem('thicket:codebook-id', id)
    setCodebookIdState(id)
  }

  if (!identity) {
    return <CoderPicker onIdentitySelected={setIdentity} />
  }

  return (
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
  )
}

export default App
