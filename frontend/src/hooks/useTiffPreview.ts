import { useEffect, useRef, useState } from 'react'

import { ApiClientError, fetchTiffPreview } from '../api/client'
import type { PreviewSelection } from '../types/api'

export type PreviewTiffFunction = (
  fileId: string,
  selection: PreviewSelection,
  signal?: AbortSignal,
  maxSize?: number,
) => Promise<Blob>

export type TiffPreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; objectUrl: string }
  | { status: 'error'; message: string }

interface UseTiffPreviewOptions extends PreviewSelection {
  fileId?: string
  maxSize?: number
}

const IDLE_PREVIEW_STATE: TiffPreviewState = { status: 'idle' }

function getPreviewErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message
  }

  return 'The image preview could not be generated. Please try again.'
}

export function useTiffPreview(
  { fileId, t, z, c, component = 'composite', maxSize }: UseTiffPreviewOptions,
  previewFile: PreviewTiffFunction = fetchTiffPreview,
) {
  const [state, setState] = useState<TiffPreviewState>(IDLE_PREVIEW_STATE)
  const activeRequest = useRef<
    { id: number; controller: AbortController } | undefined
  >(undefined)
  const nextRequestId = useRef(0)
  const objectUrl = useRef<string | undefined>(undefined)

  useEffect(() => {
    activeRequest.current?.controller.abort()
    activeRequest.current = undefined

    if (objectUrl.current) {
      URL.revokeObjectURL(objectUrl.current)
      objectUrl.current = undefined
    }

    if (!fileId) {
      setState(IDLE_PREVIEW_STATE)
      return
    }

    const request = {
      id: ++nextRequestId.current,
      controller: new AbortController(),
    }
    activeRequest.current = request
    setState({ status: 'loading' })

    const previewPromise =
      maxSize === undefined
        ? previewFile(fileId, { t, z, c, component }, request.controller.signal)
        : previewFile(
            fileId,
            { t, z, c, component },
            request.controller.signal,
            maxSize,
          )

    void previewPromise
      .then((blob) => {
        if (activeRequest.current?.id !== request.id) {
          return
        }

        const nextObjectUrl = URL.createObjectURL(blob)
        if (activeRequest.current?.id !== request.id) {
          URL.revokeObjectURL(nextObjectUrl)
          return
        }

        activeRequest.current = undefined
        objectUrl.current = nextObjectUrl
        setState({ status: 'success', objectUrl: nextObjectUrl })
      })
      .catch((error: unknown) => {
        if (
          activeRequest.current?.id === request.id &&
          !(error instanceof DOMException && error.name === 'AbortError')
        ) {
          activeRequest.current = undefined
          setState({ status: 'error', message: getPreviewErrorMessage(error) })
        }
      })

    return () => {
      if (activeRequest.current?.id === request.id) {
        request.controller.abort()
        activeRequest.current = undefined
      }
    }
  }, [c, component, fileId, maxSize, previewFile, t, z])

  useEffect(
    () => () => {
      activeRequest.current?.controller.abort()
      if (objectUrl.current) {
        URL.revokeObjectURL(objectUrl.current)
        objectUrl.current = undefined
      }
    },
    [],
  )

  return state
}
