interface TreeNode {
  id: string
  parent_id: string | null
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
export function buildVisibleOrder<T extends TreeNode>(comments: T[]): T[] {
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

  const visible: T[] = []
  const stack: T[] = [...(byParent.get(null) ?? [])].reverse()
  while (stack.length > 0) {
    const current = stack.pop() as T
    visible.push(current)
    const children = byParent.get(current.id)
    if (children) {
      for (let i = children.length - 1; i >= 0; i--) {
        stack.push(children[i])
      }
    }
  }
  return visible
}
