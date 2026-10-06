import { useCallback, useEffect, useRef, useState } from 'react'

import {
  ApiClientError,
  downloadSelectionZip,
  type DownloadedZip,
} from '../api/client'
import type { PinnedSelection, SelectionExportItem } from '../types/api'

export type DownloadSelectionZipFunction = (
  items: readonly SelectionExportItem[],
  signal?: AbortSignal,
) => Promise<DownloadedZip>

export type SelectionZipDownloadState =
  | { status: 'idle' }
  | { status: 'exporting' }
  | { status: 'error'; message: string }

const IDLE_DOWNLOAD_STATE: SelectionZipDownloadState = { status: 'idle' }

function getDownloadErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message
  }

  return 'The selected-image ZIP could not be downloaded. Please try again.'
}

function toExportItems(
  selections: readonly PinnedSelection[],
): SelectionExportItem[] {
  return selections.map(({ file_id, t, z, c, component }) => ({
    file_id,
    t,
    z,
    c,
    component,
  }))
}

export function useSelectionZipDownload(
  selections: readonly PinnedSelection[],
  downloadFile: DownloadSelectionZipFunction = downloadSelectionZip,
) {
  const [state, setState] =
    useState<SelectionZipDownloadState>(IDLE_DOWNLOAD_STATE)
  const activeRequest = useRef<
    { id: number; controller: AbortController } | undefined
  >(undefined)
  const nextRequestId = useRef(0)

  useEffect(() => {
    activeRequest.current?.controller.abort()
    activeRequest.current = undefined
    setState(IDLE_DOWNLOAD_STATE)
  }, [selections])

  useEffect(
    () => () => {
      activeRequest.current?.controller.abort()
      activeRequest.current = undefined
    },
    [],
  )

  const startDownload = useCallback(async () => {
    if (selections.length === 0 || activeRequest.current) {
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
        toExportItems(selections),
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
  }, [downloadFile, selections])

  return { state, startDownload }
}
