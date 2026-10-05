import { useCallback, useEffect, useRef, useState } from 'react'

import {
  ApiClientError,
  downloadTiffZip,
  type DownloadedZip,
} from '../api/client'
import type { RgbComponent } from '../types/api'

export type DownloadTiffZipFunction = (
  fileId: string,
  component?: RgbComponent,
  signal?: AbortSignal,
) => Promise<DownloadedZip>

export type TiffZipDownloadState =
  | { status: 'idle' }
  | { status: 'exporting' }
  | { status: 'error'; message: string }

interface UseTiffZipDownloadOptions {
  fileId?: string
  component?: RgbComponent
}

const IDLE_DOWNLOAD_STATE: TiffZipDownloadState = { status: 'idle' }

function getDownloadErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message
  }

  return 'The ZIP export could not be downloaded. Please try again.'
}

export function useTiffZipDownload(
  { fileId, component = 'composite' }: UseTiffZipDownloadOptions,
  downloadFile: DownloadTiffZipFunction = downloadTiffZip,
) {
  const [state, setState] = useState<TiffZipDownloadState>(IDLE_DOWNLOAD_STATE)
  const activeRequest = useRef<
    { id: number; controller: AbortController } | undefined
  >(undefined)
  const nextRequestId = useRef(0)

  useEffect(() => {
    activeRequest.current?.controller.abort()
    activeRequest.current = undefined
    setState(IDLE_DOWNLOAD_STATE)
  }, [fileId])

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
    setState({ status: 'exporting' })

    try {
      const result = await downloadFile(
        fileId,
        component,
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
        setState({ status: 'error', message: getDownloadErrorMessage(error) })
      }
    }
  }, [component, downloadFile, fileId])

  return { state, startDownload }
}
