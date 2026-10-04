// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiClientError } from '../api/client'
import type { UploadTiffFunction } from '../hooks/useTiffUpload'
import type { UploadTiffResponse } from '../types/api'
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

function findButton(container: HTMLElement, label: string) {
  return Array.from(container.querySelectorAll('button')).find(
    (button) => button.textContent === label,
  )
}

function successfulUpload(filename = 'sample.tif'): UploadTiffResponse {
  return {
    file_id: '95ed59ce-198b-4f17-89da-74e17d457df3',
    filename,
    metadata: {
      shape: [2, 3, 4, 5, 7],
      axes: 'TZCYX',
      dtype: 'uint16',
      width: 7,
      height: 5,
      time_points: 2,
      z_slices: 3,
      channels: 4,
      series_count: 1,
    },
  }
}

function getMetadataValue(container: HTMLElement, label: string) {
  const term = Array.from(container.querySelectorAll('dt')).find(
    (candidate) => candidate.textContent === label,
  )
  return term?.nextElementSibling?.textContent
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

    const clearButton = findButton(container, 'Clear')

    act(() => clearButton?.click())

    expect(container.textContent).not.toContain('selected.tiff')
    expect(
      container.querySelector<HTMLButtonElement>('.primary-button')?.disabled,
    ).toBe(true)
  })

  it('prevents duplicate submission and shows the uploading state', () => {
    const uploadFile = vi.fn(
      () => new Promise<UploadTiffResponse>(() => undefined),
    )
    act(() => root.render(<TiffUpload uploadFile={uploadFile} />))
    act(() =>
      dispatchDragEvent(getDropzone(container), 'drop', [
        createFile('busy.tif'),
      ]),
    )

    const uploadButton = findButton(container, 'Upload TIFF')
    act(() => uploadButton?.click())
    act(() => findButton(container, 'Uploading…')?.click())

    expect(uploadFile).toHaveBeenCalledOnce()
    expect(findButton(container, 'Uploading…')?.disabled).toBe(true)
    expect(container.textContent).toContain('Uploading busy.tif…')
    expect(
      container.querySelector('.upload-card')?.getAttribute('aria-busy'),
    ).toBe('true')
  })

  it('shows normalized metadata after a successful upload', async () => {
    const uploadFile: UploadTiffFunction = vi
      .fn()
      .mockResolvedValue(successfulUpload('server-sample.tif'))
    act(() => root.render(<TiffUpload uploadFile={uploadFile} />))
    act(() =>
      dispatchDragEvent(getDropzone(container), 'drop', [
        createFile('client-sample.tif'),
      ]),
    )

    await act(async () => findButton(container, 'Upload TIFF')?.click())

    expect(container.textContent).toContain('Upload complete')
    expect(container.textContent).toContain('server-sample.tif')
    expect(container.textContent).toContain(
      '95ed59ce-198b-4f17-89da-74e17d457df3',
    )
    expect(getMetadataValue(container, 'Filename')).toBe('server-sample.tif')
    expect(getMetadataValue(container, 'Shape')).toBe('2 × 3 × 4 × 5 × 7')
    expect(getMetadataValue(container, 'Axes')).toBe('TZCYX')
    expect(getMetadataValue(container, 'Data type')).toBe('uint16')
    expect(getMetadataValue(container, 'Width')).toBe('7')
    expect(getMetadataValue(container, 'Height')).toBe('5')
    expect(getMetadataValue(container, 'Time points')).toBe('2')
    expect(getMetadataValue(container, 'Z slices')).toBe('3')
    expect(getMetadataValue(container, 'Channels')).toBe('4')
    expect(getMetadataValue(container, 'Series count')).toBe('1')
  })

  it('shows a user-facing API error', async () => {
    const uploadFile: UploadTiffFunction = vi
      .fn()
      .mockRejectedValue(
        new ApiClientError(
          'FILE_TOO_LARGE',
          'The TIFF file exceeds the maximum allowed size.',
        ),
      )
    act(() => root.render(<TiffUpload uploadFile={uploadFile} />))
    act(() =>
      dispatchDragEvent(getDropzone(container), 'drop', [
        createFile('large.tif'),
      ]),
    )

    await act(async () => findButton(container, 'Upload TIFF')?.click())

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'The TIFF file exceeds the maximum allowed size.',
    )
  })

  it('clears a successful upload when Reset is pressed', async () => {
    const uploadFile: UploadTiffFunction = vi
      .fn()
      .mockResolvedValue(successfulUpload())
    act(() => root.render(<TiffUpload uploadFile={uploadFile} />))
    act(() =>
      dispatchDragEvent(getDropzone(container), 'drop', [
        createFile('selected.tif'),
      ]),
    )
    await act(async () => findButton(container, 'Upload TIFF')?.click())
    expect(container.textContent).toContain('Upload complete')

    act(() => findButton(container, 'Reset')?.click())

    expect(container.textContent).not.toContain('Upload complete')
    expect(container.textContent).not.toContain('selected.tif')
    expect(container.querySelector('.tiff-metadata')).toBeNull()
  })

  it('clears previous metadata when a replacement file is selected', async () => {
    const uploadFile: UploadTiffFunction = vi
      .fn()
      .mockResolvedValue(successfulUpload())
    act(() => root.render(<TiffUpload uploadFile={uploadFile} />))
    act(() =>
      dispatchDragEvent(getDropzone(container), 'drop', [
        createFile('selected.tif'),
      ]),
    )
    await act(async () => findButton(container, 'Upload TIFF')?.click())
    expect(container.querySelector('.tiff-metadata')).not.toBeNull()

    act(() =>
      dispatchDragEvent(getDropzone(container), 'drop', [
        createFile('replacement.tif'),
      ]),
    )

    expect(container.querySelector('.tiff-metadata')).toBeNull()
    expect(container.textContent).not.toContain('Upload complete')
    expect(container.textContent).toContain('replacement.tif')
  })

  it('clears an API error when the file is replaced', async () => {
    const uploadFile: UploadTiffFunction = vi
      .fn()
      .mockRejectedValue(new ApiClientError('UPLOAD_FAILED', 'Upload failed.'))
    act(() => root.render(<TiffUpload uploadFile={uploadFile} />))
    act(() =>
      dispatchDragEvent(getDropzone(container), 'drop', [
        createFile('first.tif'),
      ]),
    )
    await act(async () => findButton(container, 'Upload TIFF')?.click())
    expect(container.textContent).toContain('Upload failed.')

    act(() =>
      dispatchDragEvent(getDropzone(container), 'drop', [
        createFile('replacement.tiff'),
      ]),
    )

    expect(container.textContent).not.toContain('Upload failed.')
    expect(container.textContent).toContain('replacement.tiff')
  })
})
