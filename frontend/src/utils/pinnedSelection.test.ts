import { describe, expect, it } from 'vitest'

import {
  createPinnedSelection,
  getPinnedSelectionId,
  hasPinnedSelection,
} from './pinnedSelection'

const baseSelection = {
  file_id: 'file-id',
  t: 1,
  z: 2,
  c: 3,
  component: 'composite' as const,
}

describe('pinned selections', () => {
  it('creates an immutable snapshot that is unaffected by later candidates', () => {
    const candidate = { ...baseSelection }
    const selection = createPinnedSelection(candidate, 4)

    candidate.t = 0
    candidate.z = 0

    expect(selection).toMatchObject({
      file_id: 'file-id',
      t: 1,
      z: 2,
      c: 3,
      component: 'composite',
      addition_order: 4,
    })
    expect(Object.isFrozen(selection)).toBe(true)
  })

  it('uses file, coordinates, and component for exact duplicate identity', () => {
    const composite = createPinnedSelection(baseSelection, 1)
    const green = { ...baseSelection, component: 'green' as const }
    const otherFile = { ...baseSelection, file_id: 'other-file-id' }

    expect(hasPinnedSelection([composite], baseSelection)).toBe(true)
    expect(hasPinnedSelection([composite], green)).toBe(false)
    expect(hasPinnedSelection([composite], otherFile)).toBe(false)
    expect(getPinnedSelectionId(green)).not.toBe(composite.id)
    expect(getPinnedSelectionId(otherFile)).not.toBe(composite.id)
  })
})
