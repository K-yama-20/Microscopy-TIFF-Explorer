import type { PinnedSelection, RgbComponent } from '../types/api'

export interface PinnedSelectionCandidate {
  file_id: string
  t: number
  z: number
  c: number
  component: RgbComponent
}

export function getPinnedSelectionId(
  selection: Pick<
    PinnedSelectionCandidate,
    'file_id' | 't' | 'z' | 'c' | 'component'
  >,
): string {
  return [
    selection.file_id,
    selection.t,
    selection.z,
    selection.c,
    selection.component,
  ].join(':')
}

export function createPinnedSelection(
  candidate: PinnedSelectionCandidate,
  additionOrder: number,
): PinnedSelection {
  return Object.freeze({
    ...candidate,
    id: getPinnedSelectionId(candidate),
    addition_order: additionOrder,
  })
}

export function hasPinnedSelection(
  selections: readonly PinnedSelection[],
  candidate: Pick<
    PinnedSelectionCandidate,
    'file_id' | 't' | 'z' | 'c' | 'component'
  >,
): boolean {
  const id = getPinnedSelectionId(candidate)
  return selections.some((selection) => selection.id === id)
}

export function getRgbComponentLabel(
  component: RgbComponent,
  isRgb: boolean,
): string {
  if (component === 'composite') {
    return isRgb ? 'RGB composite' : 'Composite'
  }

  return component[0].toUpperCase() + component.slice(1)
}
