interface Props {
  depth: number
  ancestorContinues: boolean[]
  isLastSibling: boolean
  spacing?: number
}

export function TreeConnectors({
  depth, ancestorContinues, isLastSibling, spacing = 28,
}: Props) {
  if (depth === 0) return null
  const junction = -spacing / 2
  return <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0">
    {ancestorContinues.map((continues, level) => continues && (
      <span key={level} className="absolute -top-2 -bottom-2 border-l-2 border-slate-300"
        style={{ left: -(depth - level) * spacing - spacing / 2 }} />
    ))}
    <span className={`absolute -top-2 border-l-2 border-slate-300 ${isLastSibling ? 'h-[calc(50%+0.5rem)]' : '-bottom-2'}`}
      style={{ left: junction }} />
    <span className="absolute top-1/2 border-t-2 border-slate-300"
      style={{ left: junction, width: spacing / 2 }} />
  </span>
}
