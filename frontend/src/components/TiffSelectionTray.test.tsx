// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DownloadedPng } from '../api/client'
import type { DownloadTiffPngFunction } from '../hooks/useTiffPngDownload'
import type { PreviewTiffFunction } from '../hooks/useTiffPreview'
import type { UploadTiffFunction } from '../hooks/useTiffUpload'
import type { UploadTiffResponse } from '../types/api'
import { TiffUpload } from './TiffUpload'

const testEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT: boolean
}

function uploadResponse(filename = 'sample.tif'): UploadTiffResponse {
  return {
    file_id: '95ed59ce-198b-4f17-89da-74e17d457df3',
    filename,
    metadata: {
      shape: [2, 2, 2, 8, 12, 3],
      axes: 'TZCYXS',
      dtype: 'uint16',
      width: 12,
      height: 8,
      time_points: 2,
      z_slices: 2,
      channels: 2,
      series_count: 1,
      is_rgb: true,
      sample_count: 3,
      rgb_components: ['red', 'green', 'blue'],
    },
  }
}

function findButton(container: HTMLElement, label: string) {
  return Array.from(container.querySelectorAll('button')).find(
    (button) => button.textContent === label,
  )
}

function getSelect(container: HTMLElement, id: string): HTMLSelectElement {
  const select = container.querySelector<HTMLSelectElement>(`#${id}`)
  if (!select) {
    throw new Error(`Missing select #${id}`)
  }
  return select
}

async function changeSelect(select: HTMLSelectElement, value: string) {
  await act(async () => {
    select.value = value
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

async function chooseAndUpload(
  container: HTMLElement,
  filename = 'sample.tif',
) {
  const dropzone = container.querySelector<HTMLElement>('.dropzone')
  if (!dropzone) {
    throw new Error('Dropzone was not rendered.')
  }

  const drop = new Event('drop', { bubbles: true, cancelable: true })
  Object.defineProperty(drop, 'dataTransfer', {
    value: {
      files: [new File([new Uint8Array(20)], filename)],
      dropEffect: 'none',
    },
  })

  act(() => dropzone.dispatchEvent(drop))
  await act(async () => findButton(container, 'Upload TIFF')?.click())
}

describe('single-TIFF selection tray', () => {
  let container: HTMLDivElement
  let root: Root
  let isMounted: boolean
  let uploadFile: ReturnType<typeof vi.fn<UploadTiffFunction>>
  let previewFile: ReturnType<typeof vi.fn<PreviewTiffFunction>>
  let downloadPng: ReturnType<typeof vi.fn<DownloadTiffPngFunction>>
  let createdUrls: string[]

  beforeEach(() => {
    testEnvironment.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    isMounted = true
    createdUrls = []

    uploadFile = vi.fn<UploadTiffFunction>().mockResolvedValue(uploadResponse())
    previewFile = vi
      .fn<PreviewTiffFunction>()
      .mockResolvedValue(new Blob(['png'], { type: 'image/png' }))
    downloadPng = vi.fn<DownloadTiffPngFunction>().mockResolvedValue({
      blob: new Blob(['export'], { type: 'image/png' }),
      filename: 'sample_T000_Z000_C000_RGB.png',
    } satisfies DownloadedPng)

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => {
        const url = `blob:selection-${createdUrls.length + 1}`
        createdUrls.push(url)
        return url
      }),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    act(() =>
      root.render(
        <TiffUpload
          uploadFile={uploadFile}
          previewFile={previewFile}
          downloadPng={downloadPng}
        />,
      ),
    )
  })

  afterEach(() => {
    if (isMounted) {
      act(() => root.unmount())
    }
    container.remove()
    testEnvironment.IS_REACT_ACT_ENVIRONMENT = false
    vi.restoreAllMocks()
  })

  it('keeps pins immutable, prevents exact duplicates, separates RGB components, and restores a pin', async () => {
    await chooseAndUpload(container)

    const addButton = findButton(container, 'Add to selection')
    expect(addButton).toBeDefined()
    await act(async () => {
      addButton?.click()
      addButton?.click()
    })

    let items = container.querySelectorAll('.selection-tray__item')
    expect(items).toHaveLength(1)
    expect(items[0].textContent).toContain('T 0 · Z 0 · C 0')
    expect(items[0].textContent).toContain('RGB composite')
    expect(items[0].getAttribute('data-addition-order')).toBe('1')

    const duplicateButton = findButton(container, 'Already selected')
    expect(duplicateButton?.disabled).toBe(true)
    duplicateButton?.click()
    expect(container.querySelectorAll('.selection-tray__item')).toHaveLength(1)

    await changeSelect(
      getSelect(container, 'color-component-selector'),
      'green',
    )
    await act(async () => findButton(container, 'Add to selection')?.click())

    items = container.querySelectorAll('.selection-tray__item')
    expect(items).toHaveLength(2)
    expect(items[0].textContent).toContain('T 0 · Z 0 · C 0')
    expect(items[0].textContent).toContain('RGB composite')
    expect(items[1].textContent).toContain('T 0 · Z 0 · C 0')
    expect(items[1].textContent).toContain('Green')
    expect(items[1].getAttribute('data-addition-order')).toBe('2')

    await changeSelect(getSelect(container, 'time-selector'), '1')
    expect(items[0].textContent).toContain('T 0 · Z 0 · C 0')
    expect(items[1].textContent).toContain('T 0 · Z 0 · C 0')

    const firstThumbnail = items[0].querySelector<HTMLButtonElement>(
      '.selection-thumbnail',
    )
    await act(async () => firstThumbnail?.click())

    expect(getSelect(container, 'time-selector').value).toBe('0')
    expect(getSelect(container, 'color-component-selector').value).toBe(
      'composite',
    )
    expect(container.querySelectorAll('.selection-tray__item')).toHaveLength(2)
    expect(
      previewFile.mock.calls.filter((call) => call[3] === 240),
    ).toHaveLength(2)
  })

  it('downloads the pinned coordinates through the existing PNG API and supports removal and clear-all', async () => {
    await chooseAndUpload(container)
    await act(async () => findButton(container, 'Add to selection')?.click())
    await changeSelect(getSelect(container, 'z-selector'), '1')
    await changeSelect(getSelect(container, 'color-component-selector'), 'blue')
    await act(async () => findButton(container, 'Add to selection')?.click())

    const items = container.querySelectorAll('.selection-tray__item')
    const secondDownload = items[1].querySelector<HTMLButtonElement>(
      '.selection-tray__download',
    )
    await act(async () => secondDownload?.click())

    expect(downloadPng).toHaveBeenCalledWith(
      '95ed59ce-198b-4f17-89da-74e17d457df3',
      { t: 0, z: 1, c: 0, component: 'blue' },
      expect.any(AbortSignal),
    )

    const firstRemove = items[0].querySelector<HTMLButtonElement>(
      '.selection-tray__remove',
    )
    act(() => firstRemove?.click())
    expect(container.querySelectorAll('.selection-tray__item')).toHaveLength(1)
    expect(container.textContent).toContain('T 0 · Z 1 · C 0')

    act(() => findButton(container, 'Clear all')?.click())
    expect(container.querySelectorAll('.selection-tray__item')).toHaveLength(0)
    expect(container.textContent).toContain('No images selected')
  })

  it('revokes thumbnail URLs on removal, clear-all, replacement, and unmount', async () => {
    await chooseAndUpload(container)
    await act(async () => findButton(container, 'Add to selection')?.click())
    const firstThumbnailUrl = createdUrls[1]

    await changeSelect(getSelect(container, 'time-selector'), '1')
    await act(async () => findButton(container, 'Add to selection')?.click())
    const secondThumbnailUrl = createdUrls[3]

    const firstItem = container.querySelector('.selection-tray__item')
    act(() =>
      firstItem
        ?.querySelector<HTMLButtonElement>('.selection-tray__remove')
        ?.click(),
    )
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(firstThumbnailUrl)

    act(() => findButton(container, 'Clear all')?.click())
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(secondThumbnailUrl)

    await act(async () => findButton(container, 'Add to selection')?.click())
    const replacementThumbnailUrl = createdUrls.at(-1)
    const dropzone = container.querySelector<HTMLElement>('.dropzone')
    const replacementDrop = new Event('drop', {
      bubbles: true,
      cancelable: true,
    })
    Object.defineProperty(replacementDrop, 'dataTransfer', {
      value: {
        files: [new File(['replacement'], 'replacement.tif')],
        dropEffect: 'none',
      },
    })
    act(() => dropzone?.dispatchEvent(replacementDrop))
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(replacementThumbnailUrl)

    await act(async () => findButton(container, 'Upload TIFF')?.click())
    await act(async () => findButton(container, 'Add to selection')?.click())
    const unmountThumbnailUrl = createdUrls.at(-1)

    act(() => root.unmount())
    isMounted = false
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(unmountThumbnailUrl)
  })
})
