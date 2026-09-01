export interface HeaderActionsProps {
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  onOpenWorkspace: () => void
}

export function HeaderActions({ theme, onToggleTheme, onOpenWorkspace }: HeaderActionsProps) {
  return <div className="flex items-center gap-2">
    <button type="button" className="btn-secondary text-xs" onClick={onToggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
      {theme === 'dark' ? '☀ Light' : '◐ Dark'}
    </button>
    <button type="button" className="btn-secondary text-xs" onClick={onOpenWorkspace}>Workspace</button>
  </div>
}
