import type {
  ApiErrorResponse,
  PreviewSelection,
  RgbComponent,
  RgbComponentName,
  SelectionExportItem,
  TiffMetadata,
  UploadTiffResponse,
} from '../types/api'

const DEFAULT_API_BASE_URL = 'http://localhost:8000'

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? DEFAULT_API_BASE_URL

export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiClientError'
  }
}

export interface DownloadedPng {
  blob: Blob
  filename: string
}

export interface DownloadedZip {
  blob: Blob
  filename: string
}

function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (!value || typeof value !== 'object' || !('error' in value)) {
    return false
  }

  const error = value.error
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string' &&
    'message' in error &&
    typeof error.message === 'string'
  )
}

function isUploadTiffResponse(value: unknown): value is UploadTiffResponse {
  return (
    !!value &&
    typeof value === 'object' &&
    'file_id' in value &&
    typeof value.file_id === 'string' &&
    'filename' in value &&
    typeof value.filename === 'string' &&
    'metadata' in value &&
    isTiffMetadata(value.metadata)
  )
}

function isTiffMetadata(value: unknown): value is TiffMetadata {
  if (!value || typeof value !== 'object') {
    return false
  }

  const isPositiveInteger = (candidate: unknown) =>
    typeof candidate === 'number' &&
    Number.isInteger(candidate) &&
    candidate > 0
  const rgbComponentNames: RgbComponentName[] = ['red', 'green', 'blue']

  return (
    'shape' in value &&
    Array.isArray(value.shape) &&
    value.shape.length > 0 &&
    value.shape.every(isPositiveInteger) &&
    'axes' in value &&
    typeof value.axes === 'string' &&
    value.axes.length === value.shape.length &&
    'dtype' in value &&
    (value.dtype === 'uint8' || value.dtype === 'uint16') &&
    'width' in value &&
    isPositiveInteger(value.width) &&
    'height' in value &&
    isPositiveInteger(value.height) &&
    'time_points' in value &&
    isPositiveInteger(value.time_points) &&
    'z_slices' in value &&
    isPositiveInteger(value.z_slices) &&
    'channels' in value &&
    isPositiveInteger(value.channels) &&
    'series_count' in value &&
    isPositiveInteger(value.series_count) &&
    'is_rgb' in value &&
    typeof value.is_rgb === 'boolean' &&
    'sample_count' in value &&
    isPositiveInteger(value.sample_count) &&
    'rgb_components' in value &&
    Array.isArray(value.rgb_components) &&
    (value.is_rgb
      ? value.sample_count === 3 &&
        value.rgb_components.length === 3 &&
        value.rgb_components.every(
          (component, index) => component === rgbComponentNames[index],
        )
      : value.sample_count === 1 && value.rgb_components.length === 0)
  )
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function safeDownloadFilename(
  contentDisposition: string | null,
  extension: '.png' | '.zip',
  fallback: string,
): string {
  if (!contentDisposition) {
    return fallback
  }

  const extendedMatch = contentDisposition.match(
    /(?:^|;)\s*filename\*=UTF-8''([^;]+)/i,
  )
  const quotedMatch = contentDisposition.match(/(?:^|;)\s*filename="([^"]*)"/i)
  const unquotedMatch = contentDisposition.match(
    /(?:^|;)\s*filename=([^;\s]*)/i,
  )
  let candidate = extendedMatch?.[1] ?? quotedMatch?.[1] ?? unquotedMatch?.[1]

  if (extendedMatch && candidate) {
    try {
      candidate = decodeURIComponent(candidate)
    } catch {
      return fallback
    }
  }

  if (!candidate) {
    return fallback
  }

  const basename = candidate.replaceAll('\\', '/').split('/').at(-1) ?? ''
  const withoutControls = Array.from(basename, (character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 31 || codePoint === 127 ? '_' : character
  }).join('')
  const sanitized = withoutControls
    .replace(/["<>:|?*]/g, '_')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '')

  if (!sanitized || !sanitized.toLowerCase().endsWith(extension)) {
    return fallback
  }

  return sanitized
}

export async function uploadTiff(
  file: File,
  signal?: AbortSignal,
): Promise<UploadTiffResponse> {
  const formData = new FormData()
  formData.append('file', file)

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/api/tiff/upload`, {
      method: 'POST',
      body: formData,
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }

    throw new ApiClientError(
      'NETWORK_ERROR',
      'Could not reach the upload service. Please try again.',
    )
  }

  const payload = await readJson(response)
  if (!response.ok) {
    if (isApiErrorResponse(payload)) {
      throw new ApiClientError(payload.error.code, payload.error.message)
    }

    throw new ApiClientError(
      'UPLOAD_FAILED',
      'The TIFF file could not be uploaded. Please try again.',
    )
  }

  if (!isUploadTiffResponse(payload)) {
    throw new ApiClientError(
      'INVALID_RESPONSE',
      'The upload service returned an unexpected response. Please try again.',
    )
  }

  return payload
}

export async function fetchTiffPreview(
  fileId: string,
  selection: PreviewSelection,
  signal?: AbortSignal,
  maxSize?: number,
): Promise<Blob> {
  const query = new URLSearchParams({
    t: String(selection.t),
    z: String(selection.z),
    c: String(selection.c),
    component: selection.component ?? 'composite',
  })
  if (maxSize !== undefined) {
    query.set('max_size', String(maxSize))
  }

  let response: Response
  try {
    response = await fetch(
      `${API_BASE_URL}/api/tiff/${encodeURIComponent(fileId)}/preview?${query}`,
      { signal },
    )
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }

    throw new ApiClientError(
      'NETWORK_ERROR',
      'Could not reach the preview service. Please try again.',
    )
  }

  if (!response.ok) {
    const payload = await readJson(response)
    if (isApiErrorResponse(payload)) {
      throw new ApiClientError(payload.error.code, payload.error.message)
    }

    throw new ApiClientError(
      'PROCESSING_ERROR',
      'The image preview could not be generated. Please try again.',
    )
  }

  if (!response.headers.get('Content-Type')?.startsWith('image/png')) {
    throw new ApiClientError(
      'INVALID_RESPONSE',
      'The preview service returned an unexpected response. Please try again.',
    )
  }

  return response.blob()
}

export async function downloadTiffPng(
  fileId: string,
  selection: PreviewSelection,
  signal?: AbortSignal,
): Promise<DownloadedPng> {
  const query = new URLSearchParams({
    t: String(selection.t),
    z: String(selection.z),
    c: String(selection.c),
    component: selection.component ?? 'composite',
  })

  let response: Response
  try {
    response = await fetch(
      `${API_BASE_URL}/api/tiff/${encodeURIComponent(fileId)}/export/png?${query}`,
      { signal },
    )
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }

    throw new ApiClientError(
      'NETWORK_ERROR',
      'Could not reach the PNG export service. Please try again.',
    )
  }

  if (!response.ok) {
    const payload = await readJson(response)
    if (isApiErrorResponse(payload)) {
      throw new ApiClientError(payload.error.code, payload.error.message)
    }

    throw new ApiClientError(
      'PROCESSING_ERROR',
      'The PNG export could not be generated. Please try again.',
    )
  }

  if (!response.headers.get('Content-Type')?.startsWith('image/png')) {
    throw new ApiClientError(
      'INVALID_RESPONSE',
      'The PNG export service returned an unexpected response. Please try again.',
    )
  }

  return {
    blob: await response.blob(),
    filename: safeDownloadFilename(
      response.headers.get('Content-Disposition'),
      '.png',
      'image.png',
    ),
  }
}

export async function downloadTiffZip(
  fileId: string,
  component: RgbComponent = 'composite',
  signal?: AbortSignal,
): Promise<DownloadedZip> {
  const query = new URLSearchParams({ component })

  let response: Response
  try {
    response = await fetch(
      `${API_BASE_URL}/api/tiff/${encodeURIComponent(fileId)}/export/zip?${query}`,
      { signal },
    )
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }

    throw new ApiClientError(
      'NETWORK_ERROR',
      'Could not reach the ZIP export service. Please try again.',
    )
  }

  if (!response.ok) {
    const payload = await readJson(response)
    if (isApiErrorResponse(payload)) {
      throw new ApiClientError(payload.error.code, payload.error.message)
    }

    throw new ApiClientError(
      'PROCESSING_ERROR',
      'The ZIP export could not be generated. Please try again.',
    )
  }

  if (!response.headers.get('Content-Type')?.startsWith('application/zip')) {
    throw new ApiClientError(
      'INVALID_RESPONSE',
      'The ZIP export service returned an unexpected response. Please try again.',
    )
  }

  return {
    blob: await response.blob(),
    filename: safeDownloadFilename(
      response.headers.get('Content-Disposition'),
      '.zip',
      'images.zip',
    ),
  }
}

export async function downloadSelectionZip(
  items: readonly SelectionExportItem[],
  signal?: AbortSignal,
): Promise<DownloadedZip> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/api/exports/selection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }

    throw new ApiClientError(
      'NETWORK_ERROR',
      'Could not reach the selected-image export service. Please try again.',
    )
  }

  if (!response.ok) {
    const payload = await readJson(response)
    if (isApiErrorResponse(payload)) {
      throw new ApiClientError(payload.error.code, payload.error.message)
    }

    throw new ApiClientError(
      'PROCESSING_ERROR',
      'The selected-image ZIP could not be generated. Please try again.',
    )
  }

  if (!response.headers.get('Content-Type')?.startsWith('application/zip')) {
    throw new ApiClientError(
      'INVALID_RESPONSE',
      'The selected-image export service returned an unexpected response. Please try again.',
    )
  }

  return {
    blob: await response.blob(),
    filename: safeDownloadFilename(
      response.headers.get('Content-Disposition'),
      '.zip',
      'microscopy-selection.zip',
    ),
  }
}
