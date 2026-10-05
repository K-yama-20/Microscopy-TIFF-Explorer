// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ApiClientError,
  type DownloadedPng,
  type DownloadedZip,
} from '../api/client'
import type { DownloadTiffPngFunction } from '../hooks/useTiffPngDownload'
import type { DownloadTiffZipFunction } from '../hooks/useTiffZipDownload'
import type { PreviewTiffFunction } from '../hooks/useTiffPreview'
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
      is_rgb: false,
      sample_count: 1,
      rgb_components: [],
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

function changeSelectValue(select: HTMLSelectElement, value: string) {
  select.value = value
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

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(new Blob(['png'], { type: 'image/png' }), {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        }),
      ),
    )
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn().mockReturnValue('blob:preview'),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    })

    act(() => root.render(<TiffUpload />))
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    testEnvironment.IS_REACT_ACT_ENVIRONMENT = false
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('uses a workspace label without presenting the UI as a step-based wizard', () => {
    expect(container.textContent).toContain('TIFF workspace')
    expect(container.textContent).toContain('Upload a microscopy TIFF')
    expect(container.textContent).not.toContain('Step 1 of 3')
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
    expect(getMetadataValue(container, 'RGB')).toBe('No')
    expect(getMetadataValue(container, 'Sample count')).toBe('1')
    expect(getMetadataValue(container, 'RGB components')).toBe('None')
    expect(getSelectByLabel(container, 'Color component')).toBeNull()
  })

  it('shows RGB metadata and an independent four-option component selector', async () => {
    const uploadFile: UploadTiffFunction = vi.fn().mockResolvedValue(
      successfulUpload('rgb.ome.tif', {
        shape: [2, 5, 7, 3],
        axes: 'CYXS',
        dtype: 'uint8',
        time_points: 1,
        z_slices: 1,
        channels: 2,
        is_rgb: true,
        sample_count: 3,
        rgb_components: ['red', 'green', 'blue'],
      }),
    )
    const previewFile: PreviewTiffFunction = vi
      .fn()
      .mockResolvedValue(new Blob(['png'], { type: 'image/png' }))
    act(() =>
      root.render(
        <TiffUpload uploadFile={uploadFile} previewFile={previewFile} />,
      ),
    )

    await selectAndUpload(container)

    expect(getMetadataValue(container, 'RGB')).toBe('Yes')
    expect(getMetadataValue(container, 'Sample count')).toBe('3')
    expect(getMetadataValue(container, 'RGB components')).toBe(
      'red, green, blue',
    )
    const componentSelect = getSelectByLabel(container, 'Color component')
    const channelSelect = getSelectByLabel(container, 'Channel')
    expect(componentSelect?.value).toBe('composite')
    expect(
      Array.from(componentSelect?.options ?? [], (option) => [
        option.value,
        option.textContent,
      ]),
    ).toEqual([
      ['composite', 'RGB composite'],
      ['red', 'Red'],
      ['green', 'Green'],
      ['blue', 'Blue'],
    ])

    await act(async () => changeSelect(channelSelect!, 1))
    await act(async () => changeSelectValue(componentSelect!, 'green'))

    expect(channelSelect?.value).toBe('1')
    expect(componentSelect?.value).toBe('green')
    expect(previewFile).toHaveBeenLastCalledWith(
      '95ed59ce-198b-4f17-89da-74e17d457df3',
      { t: 0, z: 0, c: 1, component: 'green' },
      expect.any(AbortSignal),
    )
  })

  it('resets the component for upload, replacement, Reset, and Clear', async () => {
    const rgbUpload = successfulUpload('rgb.tif', {
      shape: [5, 7, 3],
      axes: 'YXS',
      dtype: 'uint8',
      time_points: 1,
      z_slices: 1,
      channels: 1,
      is_rgb: true,
      sample_count: 3,
      rgb_components: ['red', 'green', 'blue'],
    })
    const uploadFile: UploadTiffFunction = vi.fn().mockResolvedValue(rgbUpload)
    const previewFile: PreviewTiffFunction = vi
      .fn()
      .mockResolvedValue(new Blob(['png'], { type: 'image/png' }))
    act(() =>
      root.render(
        <TiffUpload uploadFile={uploadFile} previewFile={previewFile} />,
      ),
    )
    await selectAndUpload(container, 'first.tif')

    await act(async () =>
      changeSelectValue(getSelectByLabel(container, 'Color component')!, 'red'),
    )
    await act(async () => findButton(container, 'Upload TIFF')?.click())
    expect(getSelectByLabel(container, 'Color component')?.value).toBe(
      'composite',
    )

    await act(async () =>
      changeSelectValue(
        getSelectByLabel(container, 'Color component')!,
        'blue',
      ),
    )
    act(() =>
      dispatchDragEvent(getDropzone(container), 'drop', [
        createFile('replacement.tif'),
      ]),
    )
    await act(async () => findButton(container, 'Upload TIFF')?.click())
    expect(getSelectByLabel(container, 'Color component')?.value).toBe(
      'composite',
    )

    await act(async () =>
      changeSelectValue(
        getSelectByLabel(container, 'Color component')!,
        'green',
      ),
    )
    act(() => findButton(container, 'Reset')?.click())
    await selectAndUpload(container, 'after-reset.tif')
    expect(getSelectByLabel(container, 'Color component')?.value).toBe(
      'composite',
    )

    await act(async () =>
      changeSelectValue(getSelectByLabel(container, 'Color component')!, 'red'),
    )
    act(() => findButton(container, 'Clear')?.click())
    await selectAndUpload(container, 'after-clear.tif')
    expect(getSelectByLabel(container, 'Color component')?.value).toBe(
      'composite',
    )
  })

  it('refreshes preview for T, Z, and C changes', async () => {
    const uploadFile: UploadTiffFunction = vi
      .fn()
      .mockResolvedValue(successfulUpload())
    const previewFile: PreviewTiffFunction = vi
      .fn()
      .mockResolvedValue(new Blob(['png'], { type: 'image/png' }))
    act(() =>
      root.render(
        <TiffUpload uploadFile={uploadFile} previewFile={previewFile} />,
      ),
    )
    await selectAndUpload(container)

    await act(async () => changeSelect(getSelectByLabel(container, 'Time')!, 1))
    await act(async () => changeSelect(getSelectByLabel(container, 'Z')!, 2))
    await act(async () =>
      changeSelect(getSelectByLabel(container, 'Channel')!, 3),
    )

    expect(previewFile).toHaveBeenLastCalledWith(
      '95ed59ce-198b-4f17-89da-74e17d457df3',
      { t: 1, z: 2, c: 3, component: 'composite' },
      expect.any(AbortSignal),
    )
  })

  it('downloads the current T/Z/C/component without changing selection', async () => {
    const uploadFile: UploadTiffFunction = vi.fn().mockResolvedValue(
      successfulUpload('rgb.tif', {
        shape: [2, 3, 4, 5, 7, 3],
        axes: 'TZCYXS',
        dtype: 'uint8',
        is_rgb: true,
        sample_count: 3,
        rgb_components: ['red', 'green', 'blue'],
      }),
    )
    const downloadPng: DownloadTiffPngFunction = vi.fn().mockResolvedValue({
      blob: new Blob(['png'], { type: 'image/png' }),
      filename: 'rgb_T001_Z002_C003_G.png',
    })
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)
    act(() =>
      root.render(
        <TiffUpload uploadFile={uploadFile} downloadPng={downloadPng} />,
      ),
    )
    await selectAndUpload(container)
    await act(async () => changeSelect(getSelectByLabel(container, 'Time')!, 1))
    await act(async () => changeSelect(getSelectByLabel(container, 'Z')!, 2))
    await act(async () =>
      changeSelect(getSelectByLabel(container, 'Channel')!, 3),
    )
    await act(async () =>
      changeSelectValue(
        getSelectByLabel(container, 'Color component')!,
        'green',
      ),
    )
    vi.mocked(URL.createObjectURL).mockReturnValueOnce('blob:download')

    await act(async () => findButton(container, 'Download PNG')?.click())

    expect(downloadPng).toHaveBeenCalledOnce()
    expect(downloadPng).toHaveBeenCalledWith(
      '95ed59ce-198b-4f17-89da-74e17d457df3',
      { t: 1, z: 2, c: 3, component: 'green' },
      expect.any(AbortSignal),
    )
    const anchor = anchorClick.mock.instances[0] as unknown as HTMLAnchorElement
    expect(anchor.download).toBe('rgb_T001_Z002_C003_G.png')
    expect(anchor.href).toBe('blob:download')
    expect(document.body.contains(anchor)).toBe(false)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:download')
    expect(getSelectByLabel(container, 'Time')?.value).toBe('1')
    expect(getSelectByLabel(container, 'Z')?.value).toBe('2')
    expect(getSelectByLabel(container, 'Channel')?.value).toBe('3')
    expect(getSelectByLabel(container, 'Color component')?.value).toBe('green')
    expect(findButton(container, 'Download PNG')).toBeDefined()
  })

  it('shows downloading state, prevents duplicate requests, and reports errors', async () => {
    let rejectDownload: ((error: unknown) => void) | undefined
    const pendingDownload = new Promise<never>((_resolve, reject) => {
      rejectDownload = reject
    })
    const downloadPng: DownloadTiffPngFunction = vi
      .fn()
      .mockReturnValue(pendingDownload)
    const uploadFile: UploadTiffFunction = vi
      .fn()
      .mockResolvedValue(successfulUpload())
    act(() =>
      root.render(
        <TiffUpload uploadFile={uploadFile} downloadPng={downloadPng} />,
      ),
    )
    await selectAndUpload(container)

    act(() => findButton(container, 'Download PNG')?.click())
    const downloadingButton = findButton(container, 'Downloading…')
    expect(downloadingButton?.disabled).toBe(true)
    act(() => downloadingButton?.click())
    expect(downloadPng).toHaveBeenCalledOnce()

    await act(async () =>
      rejectDownload?.(
        new ApiClientError('PROCESSING_ERROR', 'Download failed safely.'),
      ),
    )
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Download failed safely.',
    )
    expect(findButton(container, 'Download PNG')?.disabled).toBe(false)
  })

  it('exports the full stack with the current component without changing T/Z/C', async () => {
    const uploadFile: UploadTiffFunction = vi.fn().mockResolvedValue(
      successfulUpload('rgb.tif', {
        shape: [2, 3, 4, 5, 7, 3],
        axes: 'TZCYXS',
        dtype: 'uint8',
        is_rgb: true,
        sample_count: 3,
        rgb_components: ['red', 'green', 'blue'],
      }),
    )
    const downloadZip: DownloadTiffZipFunction = vi.fn().mockResolvedValue({
      blob: new Blob(['zip'], { type: 'application/zip' }),
      filename: 'rgb_stack_G.zip',
    })
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)
    act(() =>
      root.render(
        <TiffUpload uploadFile={uploadFile} downloadZip={downloadZip} />,
      ),
    )
    await selectAndUpload(container)
    await act(async () => changeSelect(getSelectByLabel(container, 'Time')!, 1))
    await act(async () => changeSelect(getSelectByLabel(container, 'Z')!, 2))
    await act(async () =>
      changeSelect(getSelectByLabel(container, 'Channel')!, 3),
    )
    await act(async () =>
      changeSelectValue(
        getSelectByLabel(container, 'Color component')!,
        'green',
      ),
    )
    vi.mocked(URL.createObjectURL).mockReturnValueOnce('blob:zip-download')

    await act(async () => findButton(container, 'Export Stack as ZIP')?.click())

    expect(downloadZip).toHaveBeenCalledOnce()
    expect(downloadZip).toHaveBeenCalledWith(
      '95ed59ce-198b-4f17-89da-74e17d457df3',
      'green',
      expect.any(AbortSignal),
    )
    const anchor = anchorClick.mock.instances[0] as unknown as HTMLAnchorElement
    expect(anchor.download).toBe('rgb_stack_G.zip')
    expect(anchor.href).toBe('blob:zip-download')
    expect(document.body.contains(anchor)).toBe(false)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:zip-download')
    expect(getSelectByLabel(container, 'Time')?.value).toBe('1')
    expect(getSelectByLabel(container, 'Z')?.value).toBe('2')
    expect(getSelectByLabel(container, 'Channel')?.value).toBe('3')
    expect(getSelectByLabel(container, 'Color component')?.value).toBe('green')
  })

  it('shows ZIP exporting state, prevents duplicates, and reports errors', async () => {
    let rejectDownload: ((error: unknown) => void) | undefined
    const pendingDownload = new Promise<never>((_resolve, reject) => {
      rejectDownload = reject
    })
    const downloadZip: DownloadTiffZipFunction = vi
      .fn()
      .mockReturnValue(pendingDownload)
    const uploadFile: UploadTiffFunction = vi
      .fn()
      .mockResolvedValue(successfulUpload())
    act(() =>
      root.render(
        <TiffUpload uploadFile={uploadFile} downloadZip={downloadZip} />,
      ),
    )
    await selectAndUpload(container)

    act(() => findButton(container, 'Export Stack as ZIP')?.click())
    const exportingButton = findButton(container, 'Exporting…')
    expect(exportingButton?.disabled).toBe(true)
    act(() => exportingButton?.click())
    expect(downloadZip).toHaveBeenCalledOnce()

    await act(async () =>
      rejectDownload?.(
        new ApiClientError('PROCESSING_ERROR', 'ZIP export failed safely.'),
      ),
    )
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'ZIP export failed safely.',
    )
    expect(findButton(container, 'Export Stack as ZIP')?.disabled).toBe(false)
  })

  it('aborts in-progress exports when their active selection changes', async () => {
    const pngSignals: AbortSignal[] = []
    const zipSignals: AbortSignal[] = []
    const downloadPng: DownloadTiffPngFunction = vi.fn(
      (_fileId, _selection, signal) => {
        if (signal) pngSignals.push(signal)
        return new Promise<DownloadedPng>(() => undefined)
      },
    )
    const downloadZip: DownloadTiffZipFunction = vi.fn(
      (_fileId, _component, signal) => {
        if (signal) zipSignals.push(signal)
        return new Promise<DownloadedZip>(() => undefined)
      },
    )
    const uploadFile: UploadTiffFunction = vi.fn().mockResolvedValue(
      successfulUpload('rgb.tif', {
        shape: [2, 3, 5, 7, 3],
        axes: 'TZYXS',
        is_rgb: true,
        sample_count: 3,
        rgb_components: ['red', 'green', 'blue'],
      }),
    )
    act(() =>
      root.render(
        <TiffUpload
          uploadFile={uploadFile}
          downloadPng={downloadPng}
          downloadZip={downloadZip}
        />,
      ),
    )
    await selectAndUpload(container)

    act(() => findButton(container, 'Download PNG')?.click())
    await act(async () => changeSelect(getSelectByLabel(container, 'Z')!, 1))
    expect(pngSignals.at(-1)?.aborted).toBe(true)

    act(() => findButton(container, 'Export Stack as ZIP')?.click())
    await act(async () =>
      changeSelectValue(getSelectByLabel(container, 'Color component')!, 'red'),
    )
    expect(zipSignals.at(-1)?.aborted).toBe(true)
  })

  it('aborts ZIP export on replacement, Reset, Clear, and unmount', async () => {
    const signals: AbortSignal[] = []
    const downloadZip: DownloadTiffZipFunction = vi.fn(
      (_fileId, _component, signal) => {
        if (signal) {
          signals.push(signal)
        }
        return new Promise<DownloadedZip>(() => undefined)
      },
    )
    const uploadFile: UploadTiffFunction = vi
      .fn()
      .mockResolvedValue(successfulUpload())
    act(() =>
      root.render(
        <TiffUpload uploadFile={uploadFile} downloadZip={downloadZip} />,
      ),
    )
    await selectAndUpload(container)

    act(() => findButton(container, 'Export Stack as ZIP')?.click())
    act(() =>
      dispatchDragEvent(getDropzone(container), 'drop', [
        createFile('replacement.tif'),
      ]),
    )
    expect(signals.at(-1)?.aborted).toBe(true)

    await act(async () => findButton(container, 'Upload TIFF')?.click())
    act(() => findButton(container, 'Export Stack as ZIP')?.click())
    act(() => findButton(container, 'Reset')?.click())
    expect(signals.at(-1)?.aborted).toBe(true)

    await selectAndUpload(container, 'after-reset.tif')
    act(() => findButton(container, 'Export Stack as ZIP')?.click())
    act(() => findButton(container, 'Clear')?.click())
    expect(signals.at(-1)?.aborted).toBe(true)

    await selectAndUpload(container, 'before-unmount.tif')
    act(() => findButton(container, 'Export Stack as ZIP')?.click())
    act(() => root.unmount())
    expect(signals.at(-1)?.aborted).toBe(true)
    root = createRoot(container)
  })

  it('clears download errors and aborts work for replacement, Reset, and Clear', async () => {
    let pendingSignal: AbortSignal | undefined
    const downloadPng: DownloadTiffPngFunction = vi.fn(
      (_fileId, _selection, signal) => {
        pendingSignal = signal
        return Promise.reject(
          new ApiClientError('PROCESSING_ERROR', 'Download failed safely.'),
        )
      },
    )
    const uploadFile: UploadTiffFunction = vi
      .fn()
      .mockResolvedValue(successfulUpload())
    act(() =>
      root.render(
        <TiffUpload uploadFile={uploadFile} downloadPng={downloadPng} />,
      ),
    )
    await selectAndUpload(container)
    await act(async () => findButton(container, 'Download PNG')?.click())
    expect(container.textContent).toContain('Download failed safely.')

    act(() =>
      dispatchDragEvent(getDropzone(container), 'drop', [
        createFile('replacement.tif'),
      ]),
    )
    expect(container.textContent).not.toContain('Download failed safely.')

    await act(async () => findButton(container, 'Upload TIFF')?.click())
    const neverSettles: DownloadTiffPngFunction = vi.fn(
      (_fileId, _selection, signal) => {
        pendingSignal = signal
        return new Promise<DownloadedPng>(() => undefined)
      },
    )
    act(() =>
      root.render(
        <TiffUpload uploadFile={uploadFile} downloadPng={neverSettles} />,
      ),
    )
    act(() => findButton(container, 'Download PNG')?.click())
    act(() => findButton(container, 'Reset')?.click())
    expect(pendingSignal?.aborted).toBe(true)

    await selectAndUpload(container, 'after-reset.tif')
    act(() => findButton(container, 'Download PNG')?.click())
    act(() => findButton(container, 'Clear')?.click())
    expect(pendingSignal?.aborted).toBe(true)
  })

  it('shows preview loading, success, and structured API errors', async () => {
    let resolvePreview: ((blob: Blob) => void) | undefined
    const pendingPreview = new Promise<Blob>((resolve) => {
      resolvePreview = resolve
    })
    const uploadFile: UploadTiffFunction = vi
      .fn()
      .mockResolvedValue(successfulUpload())
    const previewFile: PreviewTiffFunction = vi
      .fn()
      .mockReturnValueOnce(pendingPreview)
      .mockRejectedValueOnce(
        new ApiClientError('PROCESSING_ERROR', 'Preview failed safely.'),
      )
    act(() =>
      root.render(
        <TiffUpload uploadFile={uploadFile} previewFile={previewFile} />,
      ),
    )

    await selectAndUpload(container)
    expect(container.textContent).toContain('Loading preview…')

    await act(async () =>
      resolvePreview?.(new Blob(['png'], { type: 'image/png' })),
    )
    expect(
      container.querySelector<HTMLImageElement>('.preview-image')?.src,
    ).toBe('blob:preview')

    await act(async () => changeSelect(getSelectByLabel(container, 'Z')!, 1))
    expect(container.querySelector('.preview-error')?.textContent).toBe(
      'Preview failed safely.',
    )
  })

  it('aborts stale requests, ignores old responses, and revokes blob URLs', async () => {
    const resolvers: Array<(blob: Blob) => void> = []
    const previewFile: PreviewTiffFunction = vi.fn(
      () =>
        new Promise<Blob>((resolve) => {
          resolvers.push(resolve)
        }),
    )
    const uploadFile: UploadTiffFunction = vi
      .fn()
      .mockResolvedValue(successfulUpload())
    const createObjectUrl = vi
      .fn()
      .mockReturnValueOnce('blob:newer')
      .mockReturnValueOnce('blob:newest')
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectUrl,
    })
    act(() =>
      root.render(
        <TiffUpload uploadFile={uploadFile} previewFile={previewFile} />,
      ),
    )
    await selectAndUpload(container)
    const firstSignal = vi.mocked(previewFile).mock.calls[0][2]

    await act(async () => changeSelect(getSelectByLabel(container, 'Z')!, 1))
    expect(firstSignal?.aborted).toBe(true)

    await act(async () =>
      resolvers[1](new Blob(['newer'], { type: 'image/png' })),
    )
    await act(async () =>
      resolvers[0](new Blob(['stale'], { type: 'image/png' })),
    )
    expect(createObjectUrl).toHaveBeenCalledOnce()
    expect(
      container.querySelector<HTMLImageElement>('.preview-image')?.src,
    ).toBe('blob:newer')

    await act(async () => changeSelect(getSelectByLabel(container, 'Z')!, 2))
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:newer')
    await act(async () =>
      resolvers[2](new Blob(['newest'], { type: 'image/png' })),
    )
    act(() => findButton(container, 'Clear')?.click())
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:newest')
  })

  it('revokes the current preview URL when unmounted', async () => {
    const uploadFile: UploadTiffFunction = vi
      .fn()
      .mockResolvedValue(successfulUpload())
    const previewFile: PreviewTiffFunction = vi
      .fn()
      .mockResolvedValue(new Blob(['png'], { type: 'image/png' }))
    act(() =>
      root.render(
        <TiffUpload uploadFile={uploadFile} previewFile={previewFile} />,
      ),
    )
    await selectAndUpload(container)

    act(() => root.unmount())

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview')
    root = createRoot(container)
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

    await act(async () => changeSelect(timeSelect!, 1))
    await act(async () => changeSelect(zSelect!, 2))
    await act(async () => changeSelect(channelSelect!, 3))

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
