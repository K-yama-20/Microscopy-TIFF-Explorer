// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { TiffUpload } from './TiffUpload'

const testEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT: boolean
}

function createFile(name: string, size = 1024): File {
  return new File([new Uint8Array(size)], name)
}

function getDropzone(container: HTMLElement): HTMLElement {
  const dropzone = container.querySelector<HTMLElement>('[role="button"]')

  if (!dropzone) {
    throw new Error('Dropzone was not rendered.')
  }

  return dropzone
}

function dispatchDragEvent(
  element: HTMLElement,
  type: 'dragenter' | 'dragleave' | 'drop',
  files: File[] = [],
) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', {
    value: { files, dropEffect: 'none' },
  })

  element.dispatchEvent(event)
}

describe('TiffUpload', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    testEnvironment.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)

    act(() => root.render(<TiffUpload />))
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    testEnvironment.IS_REACT_ACT_ENVIRONMENT = false
  })

  it('shows and clears the visual dragging state', () => {
    const dropzone = getDropzone(container)

    act(() => dispatchDragEvent(dropzone, 'dragenter'))
    expect(dropzone.classList.contains('dropzone--dragging')).toBe(true)
    expect(dropzone.textContent).toContain('Drop the TIFF here')

    act(() => dispatchDragEvent(dropzone, 'dragleave'))
    expect(dropzone.classList.contains('dropzone--dragging')).toBe(false)
  })

  it('accepts a TIFF dropped on the dropzone', () => {
    const file = createFile('dropped.tif')

    act(() => dispatchDragEvent(getDropzone(container), 'drop', [file]))

    expect(container.textContent).toContain('dropped.tif')
    expect(
      container.querySelector<HTMLButtonElement>('.primary-button')?.disabled,
    ).toBe(false)
  })

  it('clears a prior error when a valid replacement is dropped', () => {
    const dropzone = getDropzone(container)

    act(() => dispatchDragEvent(dropzone, 'drop', [createFile('invalid.png')]))
    expect(container.querySelector('[role="alert"]')).not.toBeNull()

    act(() =>
      dispatchDragEvent(dropzone, 'drop', [createFile('replacement.TIFF')]),
    )
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(container.textContent).toContain('replacement.TIFF')
  })

  it('clears the current file selection', () => {
    act(() =>
      dispatchDragEvent(getDropzone(container), 'drop', [
        createFile('selected.tiff'),
      ]),
    )

    const clearButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Clear',
    )

    act(() => clearButton?.click())

    expect(container.textContent).not.toContain('selected.tiff')
    expect(
      container.querySelector<HTMLButtonElement>('.primary-button')?.disabled,
    ).toBe(true)
  })
})
