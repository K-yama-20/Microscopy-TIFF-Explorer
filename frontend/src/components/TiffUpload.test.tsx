// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiClientError } from '../api/client'
import type { UploadTiffFunction } from '../hooks/useTiffUpload'
import type { TiffMetadata, UploadTiffResponse } from '../types/api'
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

function successfulUpload(
  filename = 'sample.tif',
  metadataOverrides: Partial<TiffMetadata> = {},
): UploadTiffResponse {
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
      ...metadataOverrides,
    },
  }
}

function getMetadataValue(container: HTMLElement, label: string) {
  const term = Array.from(container.querySelectorAll('dt')).find(
    (candidate) => candidate.textContent === label,
  )
  return term?.nextElementSibling?.textContent
}

function getSelectByLabel(
  container: HTMLElement,
  label: string,
): HTMLSelectElement | null {
  const labelElement = Array.from(container.querySelectorAll('label')).find(
    (candidate) => candidate.textContent === label,
  )

  if (!labelElement?.htmlFor) {
    return null
  }

  return container.querySelector<HTMLSelectElement>(`#${labelElement.htmlFor}`)
}

function changeSelect(select: HTMLSelectElement, value: number) {
  select.value = String(value)
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

async function selectAndUpload(
  container: HTMLElement,
  filename = 'selected.tif',
) {
  act(() =>
    dispatchDragEvent(getDropzone(container), 'drop', [createFile(filename)]),
  )
  await act(async () => findButton(container, 'Upload TIFF')?.click())
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

  it('does not show dimension selectors for YX metadata', async () => {
    const uploadFile: UploadTiffFunction = vi.fn().mockResolvedValue(
      successfulUpload('yx.tif', {
        shape: [5, 7],
        axes: 'YX',
        time_points: 1,
        z_slices: 1,
        channels: 1,
      }),
    )
    act(() => root.render(<TiffUpload uploadFile={uploadFile} />))

    await selectAndUpload(container)

    expect(getSelectByLabel(container, 'Time')).toBeNull()
    expect(getSelectByLabel(container, 'Z')).toBeNull()
    expect(getSelectByLabel(container, 'Channel')).toBeNull()
    expect(container.querySelector('.dimension-selectors')).toBeNull()
  })

  it('shows only the zero-based Z selector for ZYX metadata', async () => {
    const uploadFile: UploadTiffFunction = vi.fn().mockResolvedValue(
      successfulUpload('zyx.tif', {
        shape: [3, 5, 7],
        axes: 'ZYX',
        time_points: 1,
        z_slices: 3,
        channels: 1,
      }),
    )
    act(() => root.render(<TiffUpload uploadFile={uploadFile} />))

    await selectAndUpload(container)

    const zSelect = getSelectByLabel(container, 'Z')
    expect(zSelect).not.toBeNull()
    expect(
      Array.from(zSelect?.options ?? [], (option) => option.value),
    ).toEqual(['0', '1', '2'])
    expect(getSelectByLabel(container, 'Time')).toBeNull()
    expect(getSelectByLabel(container, 'Channel')).toBeNull()
  })

  it('shows the Channel selector for CYX metadata even when its count is one', async () => {
    const uploadFile: UploadTiffFunction = vi.fn().mockResolvedValue(
      successfulUpload('cyx.tif', {
        shape: [1, 5, 7],
        axes: 'CYX',
        time_points: 1,
        z_slices: 1,
        channels: 1,
      }),
    )
    act(() => root.render(<TiffUpload uploadFile={uploadFile} />))

    await selectAndUpload(container)

    const channelSelect = getSelectByLabel(container, 'Channel')
    expect(channelSelect).not.toBeNull()
    expect(channelSelect?.options).toHaveLength(1)
    expect(channelSelect?.value).toBe('0')
    expect(getSelectByLabel(container, 'Time')).toBeNull()
    expect(getSelectByLabel(container, 'Z')).toBeNull()
  })

  it('shows Z and Channel but not Time for ZCYX metadata', async () => {
    const uploadFile: UploadTiffFunction = vi.fn().mockResolvedValue(
      successfulUpload('zcyx.tif', {
        shape: [3, 4, 5, 7],
        axes: 'ZCYX',
        time_points: 1,
        z_slices: 3,
        channels: 4,
      }),
    )
    act(() => root.render(<TiffUpload uploadFile={uploadFile} />))

    await selectAndUpload(container)

    expect(getSelectByLabel(container, 'Time')).toBeNull()
    expect(getSelectByLabel(container, 'Z')).not.toBeNull()
    expect(getSelectByLabel(container, 'Channel')).not.toBeNull()
  })

  it('shows all selectors at index zero for TZCYX metadata', async () => {
    const uploadFile: UploadTiffFunction = vi
      .fn()
      .mockResolvedValue(successfulUpload())
    act(() => root.render(<TiffUpload uploadFile={uploadFile} />))

    await selectAndUpload(container)

    expect(getSelectByLabel(container, 'Time')?.value).toBe('0')
    expect(getSelectByLabel(container, 'Z')?.value).toBe('0')
    expect(getSelectByLabel(container, 'Channel')?.value).toBe('0')
  })

  it('updates each selected index and keeps option counts in range', async () => {
    const uploadFile: UploadTiffFunction = vi
      .fn()
      .mockResolvedValue(successfulUpload())
    act(() => root.render(<TiffUpload uploadFile={uploadFile} />))

    await selectAndUpload(container)

    const timeSelect = getSelectByLabel(container, 'Time')
    const zSelect = getSelectByLabel(container, 'Z')
    const channelSelect = getSelectByLabel(container, 'Channel')

    expect(timeSelect?.options).toHaveLength(2)
    expect(zSelect?.options).toHaveLength(3)
    expect(channelSelect?.options).toHaveLength(4)

    act(() => {
      changeSelect(timeSelect!, 1)
      changeSelect(zSelect!, 2)
      changeSelect(channelSelect!, 3)
    })

    expect(timeSelect?.value).toBe('1')
    expect(zSelect?.value).toBe('2')
    expect(channelSelect?.value).toBe('3')
  })

  it('resets selections and removes absent selectors for a newly uploaded file', async () => {
    const uploadFile: UploadTiffFunction = vi
      .fn()
      .mockResolvedValueOnce(successfulUpload('first.tif'))
      .mockResolvedValueOnce(
        successfulUpload('second.tif', {
          shape: [2, 5, 7],
          axes: 'ZYX',
          time_points: 1,
          z_slices: 2,
          channels: 1,
        }),
      )
    act(() => root.render(<TiffUpload uploadFile={uploadFile} />))
    await selectAndUpload(container, 'first.tif')

    act(() => {
      changeSelect(getSelectByLabel(container, 'Time')!, 1)
      changeSelect(getSelectByLabel(container, 'Z')!, 2)
      changeSelect(getSelectByLabel(container, 'Channel')!, 3)
    })

    act(() =>
      dispatchDragEvent(getDropzone(container), 'drop', [
        createFile('second.tif'),
      ]),
    )
    expect(container.querySelector('.dimension-selectors')).toBeNull()

    await act(async () => findButton(container, 'Upload TIFF')?.click())

    expect(getSelectByLabel(container, 'Time')).toBeNull()
    expect(getSelectByLabel(container, 'Channel')).toBeNull()
    expect(getSelectByLabel(container, 'Z')?.value).toBe('0')
    expect(getSelectByLabel(container, 'Z')?.options).toHaveLength(2)
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
    expect(container.querySelector('.dimension-selectors')).toBeNull()

    await selectAndUpload(container, 'after-reset.tif')
    expect(getSelectByLabel(container, 'Time')?.value).toBe('0')
    expect(getSelectByLabel(container, 'Z')?.value).toBe('0')
    expect(getSelectByLabel(container, 'Channel')?.value).toBe('0')
  })

  it('clears metadata and selectors when Clear is pressed', async () => {
    const uploadFile: UploadTiffFunction = vi
      .fn()
      .mockResolvedValue(successfulUpload())
    act(() => root.render(<TiffUpload uploadFile={uploadFile} />))
    await selectAndUpload(container)

    act(() => changeSelect(getSelectByLabel(container, 'Z')!, 2))
    act(() => findButton(container, 'Clear')?.click())

    expect(container.querySelector('.tiff-metadata')).toBeNull()
    expect(container.querySelector('.dimension-selectors')).toBeNull()
    expect(container.textContent).not.toContain('Upload complete')

    await selectAndUpload(container, 'after-clear.tif')
    expect(getSelectByLabel(container, 'Time')?.value).toBe('0')
    expect(getSelectByLabel(container, 'Z')?.value).toBe('0')
    expect(getSelectByLabel(container, 'Channel')?.value).toBe('0')
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
