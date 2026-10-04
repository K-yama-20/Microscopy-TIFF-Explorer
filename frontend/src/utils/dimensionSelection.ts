export function createDimensionIndices(count: number): number[] {
  if (!Number.isInteger(count) || count <= 0) {
    return []
  }

  return Array.from({ length: count }, (_, index) => index)
}

export function toValidDimensionIndex(value: string, count: number): number {
  if (!Number.isInteger(count) || count <= 0) {
    return 0
  }

  const parsedValue = Number(value)

  if (!Number.isInteger(parsedValue)) {
    return 0
  }

  return Math.min(Math.max(parsedValue, 0), count - 1)
}
