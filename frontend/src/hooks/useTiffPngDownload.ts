import { useCallback, useEffect, useRef, useState } from 'react'

import {
  ApiClientError,
  downloadTiffPng,
  type DownloadedPng,
} from '../api/client'
import type { PreviewSelection } from '../types/api'

export type DownloadTiffPngFunction = (
  fileId: string,
  selection: PreviewSelection,
  signal?: AbortSignal,
) => Promise<DownloadedPng>

export type TiffPngDownloadState =
  | { status: 'idle' }
  | { status: 'downloading' }
  | { status: 'error'; message: string; code?: string }

interface UseTiffPngDownloadOptions extends PreviewSelection {
  fileId?: string
}

const IDLE_DOWNLOAD_STATE: TiffPngDownloadState = { status: 'idle' }

function getDownloadErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message
  }

  return 'The PNG export could not be downloaded. Please try again.'
}

export function useTiffPngDownload(
  { fileId, t, z, c, component = 'composite' }: UseTiffPngDownloadOptions,
  downloadFile: DownloadTiffPngFunction = downloadTiffPng,
) {
  const [state, setState] = useState<TiffPngDownloadState>(IDLE_DOWNLOAD_STATE)
  const activeRequest = useRef<
    { id: number; controller: AbortController } | undefined
  >(undefined)
  const nextRequestId = useRef(0)

  useEffect(() => {
    activeRequest.current?.controller.abort()
    activeRequest.current = undefined
    setState(IDLE_DOWNLOAD_STATE)
  }, [c, component, fileId, t, z])

  useEffect(
    () => () => {
      activeRequest.current?.controller.abort()
      activeRequest.current = undefined
    },
    [],
  )

  const startDownload = useCallback(async () => {
    if (!fileId || activeRequest.current) {
      return
    }

    const request = {
      id: ++nextRequestId.current,
      controller: new AbortController(),
    }
    activeRequest.current = request
    setState({ status: 'downloading' })

    try {
      const result = await downloadFile(
        fileId,
        { t, z, c, component },
        request.controller.signal,
      )
      if (activeRequest.current?.id !== request.id) {
        return
      }

      const objectUrl = URL.createObjectURL(result.blob)
      try {
        if (activeRequest.current?.id !== request.id) {
          return
        }

        const anchor = document.createElement('a')
        anchor.href = objectUrl
        anchor.download = result.filename
        anchor.hidden = true
        document.body.append(anchor)
        try {
          anchor.click()
        } finally {
          anchor.remove()
        }
      } finally {
        URL.revokeObjectURL(objectUrl)
      }

      if (activeRequest.current?.id === request.id) {
        activeRequest.current = undefined
        setState(IDLE_DOWNLOAD_STATE)
      }
    } catch (error) {
      if (
        activeRequest.current?.id === request.id &&
        !(error instanceof DOMException && error.name === 'AbortError')
      ) {
        activeRequest.current = undefined
        setState({
          status: 'error',
          message: getDownloadErrorMessage(error),
          code: error instanceof ApiClientError ? error.code : undefined,
        })
      }
    }
  }, [c, component, downloadFile, fileId, t, z])

  return { state, startDownload }
}
