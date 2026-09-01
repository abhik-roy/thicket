import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface EvidenceCode {
  id: string
  name: string
  color: string
}

interface Props {
  children: ReactNode
  codes: EvidenceCode[]
  className: string
  style: React.CSSProperties
}

interface TooltipPosition { left: number; top: number; below: boolean }

export function EvidenceHighlight({ children, codes, className, style }: Props) {
  const [tooltip, setTooltip] = useState<TooltipPosition | null>(null)

  function showTooltip(element: HTMLElement) {
    const rect = element.getBoundingClientRect()
    const width = Math.min(420, window.innerWidth - 24)
    const left = Math.max(width / 2 + 12,
      Math.min(rect.left + rect.width / 2, window.innerWidth - width / 2 - 12))
    const below = rect.top < 130
    setTooltip({ left, top: below ? rect.bottom + 10 : rect.top - 10, below })
  }

  return <>
    <mark
      className={className}
      style={style}
      data-evidence-codes={codes.map((code) => code.name).join(' · ') || 'Uncoded evidence'}
      onMouseEnter={(event) => showTooltip(event.currentTarget)}
      onMouseLeave={() => setTooltip(null)}
    >{children}</mark>
    {tooltip && createPortal(
      <div role="tooltip" className="evidence-tooltip"
        style={{ left: tooltip.left, top: tooltip.top,
          transform: `translate(-50%, ${tooltip.below ? '0' : '-100%'})` }}>
        <p>Codes for this selection</p>
        <div>
          {codes.length > 0 ? codes.map((code) => <span key={code.id}
            style={{ backgroundColor: code.color }}>{code.name}</span>) :
            <span className="evidence-tooltip-uncoded">Uncoded evidence</span>}
        </div>
      </div>, document.body)}
  </>
}
