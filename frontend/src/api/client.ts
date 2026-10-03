import type { ApiErrorResponse, UploadTiffResponse } from '../types/api'

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
    typeof value.filename === 'string'
  )
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
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
