interface TreeNode {
  id: string
  parent_id: string | null
}

export interface TreeLayoutRow<T> {
  item: T
  depth: number
  ancestorContinues: boolean[]
  isLastSibling: boolean
}

function bareCommentId(parentId: string | null): string | null {
  if (parentId === null || parentId.startsWith('t3_')) return null
  return parentId.startsWith('t1_') ? parentId.slice(3) : parentId
}

/**
 * Depth-first pre-order flattening of a flat, id-ordered comment list into
 * render order. Iterative (not recursive) -- a deep reply chain must not
 * risk a JS call-stack overflow, the same class of bug already hit once in
 * this project's scraper-side comment-depth resolution.
 */
export function buildTreeLayout<T extends TreeNode>(comments: T[]): TreeLayoutRow<T>[] {
  const knownIds = new Set(comments.map((c) => c.id))
  const byParent = new Map<string | null, T[]>()
  for (const comment of comments) {
    // A comment whose parent isn't present in this input set (e.g. the
    // parent was deleted/removed by Reddit and never stored) is treated
    // as its own root rather than silently dropped -- an orphaned reply
    // is still a real, codeable comment.
    const parentId = bareCommentId(comment.parent_id)
    const key = parentId !== null && knownIds.has(parentId) ? parentId : null
    const siblings = byParent.get(key)
    if (siblings) {
      siblings.push(comment)
    } else {
      byParent.set(key, [comment])
    }
  }

  const visible: TreeLayoutRow<T>[] = []
  const roots = byParent.get(null) ?? []
  const stack: Array<{
    item: T
    depth: number
    ancestorContinues: boolean[]
    isLastSibling: boolean
  }> = roots.map((item) => ({
    item, depth: 0, ancestorContinues: [],
    isLastSibling: true,
  })).reverse()
  while (stack.length > 0) {
    const current = stack.pop() as TreeLayoutRow<T>
    visible.push(current)
    const children = byParent.get(current.item.id)
    if (children) {
      for (let i = children.length - 1; i >= 0; i--) {
        stack.push({
          item: children[i],
          depth: current.depth + 1,
          ancestorContinues: [
            ...current.ancestorContinues,
            !current.isLastSibling,
          ],
          isLastSibling: i === children.length - 1,
        })
      }
    }
  }
  return visible
}

export function buildVisibleOrder<T extends TreeNode>(comments: T[]): T[] {
  return buildTreeLayout(comments).map((row) => row.item)
}
