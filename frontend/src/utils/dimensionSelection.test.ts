import { describe, expect, it } from 'vitest'

import {
  createDimensionIndices,
  toValidDimensionIndex,
} from './dimensionSelection'

describe('createDimensionIndices', () => {
  it('creates zero-based indices within the dimension count', () => {
    expect(createDimensionIndices(4)).toEqual([0, 1, 2, 3])
  })

  it('does not create indices for an invalid count', () => {
    expect(createDimensionIndices(0)).toEqual([])
    expect(createDimensionIndices(1.5)).toEqual([])
  })
})

describe('toValidDimensionIndex', () => {
  it('converts a select value to a number', () => {
    const selectedIndex = toValidDimensionIndex('2', 4)

    expect(selectedIndex).toBe(2)
    expect(typeof selectedIndex).toBe('number')
  })

  it('keeps indices within the dimension count', () => {
    expect(toValidDimensionIndex('-1', 3)).toBe(0)
    expect(toValidDimensionIndex('3', 3)).toBe(2)
    expect(toValidDimensionIndex('not-a-number', 3)).toBe(0)
    expect(toValidDimensionIndex('1.5', 3)).toBe(0)
    expect(toValidDimensionIndex('1', 0)).toBe(0)
  })
})
