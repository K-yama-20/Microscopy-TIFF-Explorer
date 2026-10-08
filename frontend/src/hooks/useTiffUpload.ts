import { useCallback, useEffect, useRef, useState } from 'react'

import { ApiClientError, uploadTiff } from '../api/client'
import type { UploadTiffResponse } from '../types/api'

export type UploadTiffFunction = (
  file: File,
  signal?: AbortSignal,
) => Promise<UploadTiffResponse>

export type TiffUploadState =
  | { status: 'idle' }
  | { status: 'uploading' }
  | { status: 'success'; upload: UploadTiffResponse }
  | { status: 'error'; message: string }

const IDLE_UPLOAD_STATE: TiffUploadState = { status: 'idle' }

function getUploadErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message
  }

  return 'The TIFF file could not be uploaded. Please try again.'
}

export function useTiffUpload(uploadFile: UploadTiffFunction = uploadTiff) {
  const [state, setState] = useState<TiffUploadState>(IDLE_UPLOAD_STATE)
  const activeRequest = useRef<
    { id: number; controller: AbortController } | undefined
  >(undefined)
  const nextRequestId = useRef(0)

  const reset = useCallback(() => {
    activeRequest.current?.controller.abort()
    activeRequest.current = undefined
    nextRequestId.current += 1
    setState(IDLE_UPLOAD_STATE)
  }, [])

  const startUpload = useCallback(
    async (file: File): Promise<UploadTiffResponse | undefined> => {
      if (activeRequest.current) {
        return undefined
      }

      const request = {
        id: ++nextRequestId.current,
        controller: new AbortController(),
      }
      activeRequest.current = request
      setState({ status: 'uploading' })

      try {
        const upload = await uploadFile(file, request.controller.signal)
        if (activeRequest.current?.id === request.id) {
          activeRequest.current = undefined
          setState({ status: 'success', upload })
          return upload
        }
      } catch (error) {
        if (
          activeRequest.current?.id === request.id &&
          !(error instanceof DOMException && error.name === 'AbortError')
        ) {
          activeRequest.current = undefined
          setState({ status: 'error', message: getUploadErrorMessage(error) })
        }
      }
      return undefined
    },
    [uploadFile],
  )

  useEffect(
    () => () => {
      activeRequest.current?.controller.abort()
    },
    [],
  )

  return { state, startUpload, reset }
}
