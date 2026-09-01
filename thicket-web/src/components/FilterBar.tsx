import type { RefObject } from 'react'

export interface FilterBarProps {
  subreddit: string
  onSubredditChange: (value: string) => void
  communities: { name: string; thread_count: number }[]
  communitiesLoading?: boolean
  year: string
  onYearChange: (value: string) => void
  minComments: number
  onMinCommentsChange: (value: number) => void
  uncodedOnly: boolean
  onUncodedOnlyChange: (value: boolean) => void
  hydratedOnly: boolean
  onHydratedOnlyChange: (value: boolean) => void
  search: string
  onSearchChange: (value: string) => void
  searchInputRef: RefObject<HTMLInputElement | null>
}

export function FilterBar({
  subreddit, onSubredditChange,
  communities, communitiesLoading = false,
  year, onYearChange,
  minComments, onMinCommentsChange,
  uncodedOnly, onUncodedOnlyChange,
  hydratedOnly, onHydratedOnlyChange,
  search, onSearchChange,
  searchInputRef,
}: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 bg-white px-5 py-4 text-sm">
      <label className="grid gap-1 text-xs font-semibold text-slate-600">
        Community
        <select
          aria-label="Community"
          value={subreddit}
          onChange={(e) => onSubredditChange(e.target.value)}
          className="field w-40 text-sm font-normal"
          disabled={communitiesLoading}
        >
          <option value="">
            {communitiesLoading ? 'Loading…' : 'All communities'}
          </option>
          {communities.map((community) => (
            <option key={community.name} value={community.name}>
              {community.name} ({community.thread_count})
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-600">
        Year
        <input
          aria-label="Year"
          value={year}
          onChange={(e) => onYearChange(e.target.value)}
          placeholder="all"
          className="field w-24 text-sm font-normal"
        />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-600">
        Min comments
        <input
          aria-label="Min comments"
          type="number"
          value={minComments}
          onChange={(e) => onMinCommentsChange(Number(e.target.value))}
          className="field w-28 text-sm font-normal"
        />
      </label>
      <label className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
        <input
          aria-label="Uncoded only"
          type="checkbox"
          checked={uncodedOnly}
          onChange={(e) => onUncodedOnlyChange(e.target.checked)}
        />
        Uncoded only
      </label>
      <label className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
        <input
          aria-label="Hydrated comments only"
          type="checkbox"
          checked={hydratedOnly}
          onChange={(e) => onHydratedOnlyChange(e.target.checked)}
        />
        Hydrated comments only
      </label>
      <input
        ref={searchInputRef}
        aria-label="Search"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="/ search"
        className="field ml-auto w-full text-sm sm:w-64"
      />
    </div>
  )
}
