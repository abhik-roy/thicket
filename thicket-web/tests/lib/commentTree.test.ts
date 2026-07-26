import { describe, expect, it } from 'vitest'
import { buildVisibleOrder } from '../../src/lib/commentTree'

interface TestNode {
  id: string
  parent_id: string | null
}

function node(id: string, parentId: string | null): TestNode {
  return { id, parent_id: parentId }
}

describe('buildVisibleOrder', () => {
  it('returns top-level comments in their given order when there are no replies', () => {
    const comments = [node('a', null), node('b', null)]
    expect(buildVisibleOrder(comments).map((c) => c.id)).toEqual(['a', 'b'])
  })

  it('recognizes Reddit t1_ parent fullnames and t3_ thread roots', () => {
    const comments = [
      node('root', 't3_thread'),
      node('other-root', 't3_thread'),
      node('child', 't1_root'),
      node('grandchild', 't1_child'),
    ]
    expect(buildVisibleOrder(comments).map((c) => c.id)).toEqual([
      'root', 'child', 'grandchild', 'other-root',
    ])
  })

  it('places a reply immediately after its parent, before the next sibling', () => {
    const comments = [node('a', null), node('b', null), node('a1', 'a')]
    expect(buildVisibleOrder(comments).map((c) => c.id))
      .toEqual(['a', 'a1', 'b'])
  })

  it('walks a deeply nested chain in order', () => {
    const comments = [
      node('a', null), node('a1', 'a'), node('a1a', 'a1'), node('a1a1', 'a1a'),
    ]
    expect(buildVisibleOrder(comments).map((c) => c.id))
      .toEqual(['a', 'a1', 'a1a', 'a1a1'])
  })

  it('handles multiple children under the same parent in their given order', () => {
    const comments = [node('a', null), node('a1', 'a'), node('a2', 'a')]
    expect(buildVisibleOrder(comments).map((c) => c.id))
      .toEqual(['a', 'a1', 'a2'])
  })

  it('handles multiple top-level threads each with their own replies', () => {
    const comments = [
      node('a', null), node('a1', 'a'), node('b', null), node('b1', 'b'),
    ]
    expect(buildVisibleOrder(comments).map((c) => c.id))
      .toEqual(['a', 'a1', 'b', 'b1'])
  })

  it('returns an empty array for no comments', () => {
    expect(buildVisibleOrder([])).toEqual([])
  })

  it('treats a comment whose parent is not in the input as a root, rather than dropping it', () => {
    const comments = [
      node('a', null),
      // 'orphan' replies to 'missing-parent', which is NOT in this list
      // (e.g. Reddit deleted/removed the parent and never returned it)
      node('orphan', 'missing-parent'),
      node('orphan-child', 'orphan'),
    ]
    expect(buildVisibleOrder(comments).map((c) => c.id))
      .toEqual(['a', 'orphan', 'orphan-child'])
  })

  it('does not crash on a deep chain (no stack overflow)', () => {
    const comments: TestNode[] = [node('c0', null)]
    for (let i = 1; i < 5000; i++) {
      comments.push(node(`c${i}`, `c${i - 1}`))
    }
    const result = buildVisibleOrder(comments)
    expect(result).toHaveLength(5000)
    expect(result[4999].id).toBe('c4999')
  })
})
