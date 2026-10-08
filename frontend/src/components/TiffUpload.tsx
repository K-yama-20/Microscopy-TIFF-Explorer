import {
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

import { deleteTiff } from '../api/client'
import type { DownloadSelectionZipFunction } from '../hooks/useSelectionZipDownload'
import {
  type DownloadTiffPngFunction,
  useTiffPngDownload,
} from '../hooks/useTiffPngDownload'
import {
  type DownloadTiffZipFunction,
  useTiffZipDownload,
} from '../hooks/useTiffZipDownload'
import {
  type PreviewTiffFunction,
  useTiffPreview,
} from '../hooks/useTiffPreview'
import { type UploadTiffFunction, useTiffUpload } from '../hooks/useTiffUpload'
import type { PinnedSelection, RgbComponent } from '../types/api'
import type { WorkspaceFile, WorkspaceSelection } from '../types/workspace'
import {
  clearTiffFileSelection,
  formatFileSize,
  getTiffValidationMessage,
  selectTiffFile,
  type TiffFileSelectionState,
} from '../utils/tiffFile'
import {
  createPinnedSelection,
  getPinnedSelectionId,
  hasPinnedSelection,
  type PinnedSelectionCandidate,
} from '../utils/pinnedSelection'
import {
  createWorkspaceFile,
  getActiveClientIdAfterRemoval,
  MAX_WORKSPACE_FILES,
  updateWorkspaceSelection,
} from '../utils/workspace'
import { TiffColorComponentSelector } from './TiffColorComponentSelector'
import { TiffDimensionSelectors } from './TiffDimensionSelectors'
import { TiffMetadataPanel } from './TiffMetadataPanel'
import { TiffPreview } from './TiffPreview'
import { TiffSelectionTray } from './TiffSelectionTray'

export type DeleteTiffFunction = (
  fileId: string,
  signal?: AbortSignal,
) => Promise<void>

interface TiffUploadProps {
  uploadFile?: UploadTiffFunction
  previewFile?: PreviewTiffFunction
  downloadPng?: DownloadTiffPngFunction
  downloadZip?: DownloadTiffZipFunction
  downloadSelectionZip?: DownloadSelectionZipFunction
  deleteFile?: DeleteTiffFunction
}

const ACCEPTED_FILE_TYPES = '.tif,.tiff,image/tiff'
const DROPZONE_INSTRUCTIONS_ID = 'tiff-dropzone-instructions'
const VALIDATION_MESSAGE_ID = 'tiff-validation-message'

export function TiffUpload({
  uploadFile,
  previewFile,
  downloadPng,
  downloadZip,
  downloadSelectionZip,
  deleteFile = deleteTiff,
}: TiffUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const nextAdditionOrder = useRef(1)
  const pinnedSelectionIds = useRef(new Set<string>())
  const workspaceFilesRef = useRef<readonly WorkspaceFile[]>([])
  const [selection, setSelection] = useState<TiffFileSelectionState>(
    clearTiffFileSelection,
  )
  const [isDragging, setIsDragging] = useState(false)
  const [workspaceFiles, setWorkspaceFiles] = useState<
    readonly WorkspaceFile[]
  >([])
  const [activeClientId, setActiveClientId] = useState<string>()
  const [pinnedSelections, setPinnedSelections] = useState<
    readonly PinnedSelection[]
  >([])
  const [selectionAnnouncement, setSelectionAnnouncement] = useState('')
  const [workspaceAnnouncement, setWorkspaceAnnouncement] = useState('')
  const [cleanupWarning, setCleanupWarning] = useState('')
  const upload = useTiffUpload(uploadFile)

  const updateWorkspaceFiles = useCallback(
    (
      updater: (current: readonly WorkspaceFile[]) => readonly WorkspaceFile[],
    ) => {
      setWorkspaceFiles((current) => {
        const next = updater(current)
        workspaceFilesRef.current = next
        return next
      })
    },
    [],
  )

  const activeFile = workspaceFiles.find(
    (file) => file.clientId === activeClientId,
  )
  const activeSelection = activeFile?.activeSelection ?? {
    t: 0,
    z: 0,
    c: 0,
    component: 'composite' as RgbComponent,
  }
  const activeFileId =
    activeFile?.status === 'ready' ? activeFile.fileId : undefined
  const preview = useTiffPreview(
    { fileId: activeFileId, ...activeSelection },
    previewFile,
  )
  const pngDownload = useTiffPngDownload(
    { fileId: activeFileId, ...activeSelection },
    downloadPng,
  )
  const zipDownload = useTiffZipDownload(
    { fileId: activeFileId, component: activeSelection.component },
    downloadZip,
  )
  const currentPinnedCandidate: PinnedSelectionCandidate | undefined =
    activeFile?.status === 'ready'
      ? { file_id: activeFile.fileId, ...activeSelection }
      : undefined
  const isCurrentSelectionPinned = currentPinnedCandidate
    ? hasPinnedSelection(pinnedSelections, currentPinnedCandidate)
    : false
  const workspaceIsFull = workspaceFiles.length >= MAX_WORKSPACE_FILES
  const activeFileMissing =
    (preview.status === 'error' && preview.code === 'FILE_NOT_FOUND') ||
    (pngDownload.state.status === 'error' &&
      pngDownload.state.code === 'FILE_NOT_FOUND') ||
    (zipDownload.state.status === 'error' &&
      zipDownload.state.code === 'FILE_NOT_FOUND')

  useEffect(() => {
    if (!activeClientId || !activeFileMissing) return
    updateWorkspaceFiles((current) =>
      current.map((file) =>
        file.clientId === activeClientId
          ? { ...file, status: 'expired' as const }
          : file,
      ),
    )
    setWorkspaceAnnouncement(
      'This TIFF is no longer available. Other workspace files are unchanged.',
    )
  }, [activeClientId, activeFileMissing, updateWorkspaceFiles])

  const chooseFile = () => {
    if (workspaceIsFull || upload.state.status === 'uploading') {
      setWorkspaceAnnouncement(
        `The workspace can contain up to ${MAX_WORKSPACE_FILES} TIFF files.`,
      )
      return
    }
    inputRef.current?.click()
  }

  const updateActiveSelection = (update: Partial<WorkspaceSelection>) => {
    if (!activeClientId) return
    updateWorkspaceFiles((current) =>
      updateWorkspaceSelection(current, activeClientId, update),
    )
  }

  const clearPinnedSelections = (announcement = '') => {
    setPinnedSelections([])
    pinnedSelectionIds.current.clear()
    nextAdditionOrder.current = 1
    setSelectionAnnouncement(announcement)
  }

  const handleFile = (file: File) => {
    if (workspaceIsFull || upload.state.status === 'uploading') {
      setWorkspaceAnnouncement(
        `The workspace can contain up to ${MAX_WORKSPACE_FILES} TIFF files.`,
      )
      setIsDragging(false)
      return
    }
    upload.reset()
    setSelection(selectTiffFile(file))
    setWorkspaceAnnouncement('')
    setCleanupWarning('')
    setIsDragging(false)
  }

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) handleFile(file)
    event.target.value = ''
  }

  const handleDropzoneKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      chooseFile()
    }
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (!workspaceIsFull && upload.state.status !== 'uploading') {
      event.dataTransfer.dropEffect = 'copy'
      setIsDragging(true)
    }
  }

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDragging(false)
    }
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const file = event.dataTransfer.files[0]
    if (file) {
      handleFile(file)
      return
    }
    setIsDragging(false)
  }

  const handleClearPendingFile = () => {
    upload.reset()
    setSelection(clearTiffFileSelection())
    setIsDragging(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleUpload = async () => {
    const pendingFile = selection.file
    if (
      !pendingFile ||
      upload.state.status === 'uploading' ||
      workspaceFilesRef.current.length >= MAX_WORKSPACE_FILES
    ) {
      return
    }
    const result = await upload.startUpload(pendingFile)
    if (!result) return

    const nextFile = createWorkspaceFile(
      result,
      pendingFile.size,
      workspaceFilesRef.current,
    )
    updateWorkspaceFiles((current) => [...current, nextFile])
    setActiveClientId(nextFile.clientId)
    setSelection(clearTiffFileSelection())
    upload.reset()
    setWorkspaceAnnouncement(`Added ${nextFile.displayName} to the workspace.`)
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleAddSelection = () => {
    if (!currentPinnedCandidate || isCurrentSelectionPinned || !activeFile) {
      return
    }
    const selectionId = getPinnedSelectionId(currentPinnedCandidate)
    if (pinnedSelectionIds.current.has(selectionId)) return

    const pinnedSelection = createPinnedSelection(
      currentPinnedCandidate,
      nextAdditionOrder.current,
    )
    pinnedSelectionIds.current.add(selectionId)
    nextAdditionOrder.current += 1
    setPinnedSelections((current) => [...current, pinnedSelection])
    setSelectionAnnouncement(
      `Added ${activeFile.displayName}, T ${pinnedSelection.t}, Z ${pinnedSelection.z}, C ${pinnedSelection.c} to selected images.`,
    )
  }

  const handleActivateSelection = (pinnedSelection: PinnedSelection) => {
    const source = workspaceFilesRef.current.find(
      (file) => file.fileId === pinnedSelection.file_id,
    )
    if (!source) return

    updateWorkspaceFiles((current) =>
      updateWorkspaceSelection(current, source.clientId, {
        t: pinnedSelection.t,
        z: pinnedSelection.z,
        c: pinnedSelection.c,
        component: pinnedSelection.component,
      }),
    )
    setActiveClientId(source.clientId)
    setSelectionAnnouncement(
      `Restored ${source.displayName}, T ${pinnedSelection.t}, Z ${pinnedSelection.z}, C ${pinnedSelection.c} to the main preview.`,
    )
  }

  const handleRemoveSelection = (selectionId: string) => {
    pinnedSelectionIds.current.delete(selectionId)
    setPinnedSelections((current) =>
      current.filter((pinnedSelection) => pinnedSelection.id !== selectionId),
    )
    setSelectionAnnouncement('Removed the image from selected images.')
  }

  const handleRemoveFile = async (clientId: string) => {
    const currentFiles = workspaceFilesRef.current
    const removedIndex = currentFiles.findIndex(
      (file) => file.clientId === clientId,
    )
    const file = currentFiles[removedIndex]
    if (!file) return

    const relatedSelections = pinnedSelections.filter(
      (pinnedSelection) => pinnedSelection.file_id === file.fileId,
    )
    if (
      relatedSelections.length > 0 &&
      !window.confirm(
        `Remove ${file.displayName}? Its ${relatedSelections.length} related selected image${relatedSelections.length === 1 ? '' : 's'} will also be removed.`,
      )
    ) {
      return
    }

    const remainingFiles = currentFiles.filter(
      (workspaceFile) => workspaceFile.clientId !== clientId,
    )
    updateWorkspaceFiles(() => remainingFiles)
    setPinnedSelections((current) => {
      const remaining = current.filter(
        (pinnedSelection) => pinnedSelection.file_id !== file.fileId,
      )
      pinnedSelectionIds.current = new Set(
        remaining.map((pinnedSelection) => pinnedSelection.id),
      )
      return remaining
    })
    if (activeClientId === clientId) {
      setActiveClientId(
        getActiveClientIdAfterRemoval(currentFiles, removedIndex),
      )
    }
    setWorkspaceAnnouncement(`Removed ${file.displayName} from the workspace.`)
    setCleanupWarning('')

    try {
      await deleteFile(file.fileId)
    } catch {
      setCleanupWarning(
        `${file.displayName} was removed locally, but server cleanup could not be confirmed. The temporary file will expire automatically.`,
      )
    }
  }

  const handleResetWorkspace = () => {
    const filesToDelete = workspaceFilesRef.current
    upload.reset()
    setSelection(clearTiffFileSelection())
    updateWorkspaceFiles(() => [])
    setActiveClientId(undefined)
    clearPinnedSelections()
    setIsDragging(false)
    setWorkspaceAnnouncement('Workspace cleared.')
    setCleanupWarning('')
    if (inputRef.current) inputRef.current.value = ''

    void Promise.allSettled(
      filesToDelete.map((file) => deleteFile(file.fileId)),
    ).then((results) => {
      if (results.some((result) => result.status === 'rejected')) {
        setCleanupWarning(
          'The workspace was cleared locally, but some server cleanup could not be confirmed. Temporary files will expire automatically.',
        )
      }
    })
  }

  const descriptionIds = [
    DROPZONE_INSTRUCTIONS_ID,
    selection.error ? VALIDATION_MESSAGE_ID : null,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <section
      className="upload-card"
      aria-labelledby="upload-title"
      aria-busy={upload.state.status === 'uploading'}
    >
      <p className="card-label">TIFF workspace</p>
      <h2 id="upload-title">Upload a microscopy TIFF</h2>
      <p className="upload-intro">
        Inspect up to three temporary TIFF files and collect image planes in one
        shared selection tray.
      </p>

      <input
        ref={inputRef}
        className="visually-hidden"
        id="tiff-file-input"
        type="file"
        accept={ACCEPTED_FILE_TYPES}
        aria-label="Choose TIFF file"
        tabIndex={-1}
        disabled={workspaceIsFull || upload.state.status === 'uploading'}
        onChange={handleInputChange}
      />

      <div
        className={`dropzone${isDragging ? ' dropzone--dragging' : ''}${
          selection.error ? ' dropzone--error' : ''
        }${workspaceIsFull ? ' dropzone--disabled' : ''}`}
        role="button"
        tabIndex={workspaceIsFull ? -1 : 0}
        aria-disabled={workspaceIsFull || upload.state.status === 'uploading'}
        aria-describedby={descriptionIds}
        onClick={chooseFile}
        onKeyDown={handleDropzoneKeyDown}
        onDragEnter={handleDragOver}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <span className="dropzone-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v4.25A1.75 1.75 0 0 0 6.75 20h10.5A1.75 1.75 0 0 0 19 18.25V14" />
          </svg>
        </span>
        <strong>
          {workspaceIsFull
            ? 'Workspace limit reached'
            : isDragging
              ? 'Drop the TIFF here'
              : workspaceFiles.length > 0
                ? 'Drag and drop another TIFF'
                : 'Drag and drop a TIFF'}
        </strong>
        {!workspaceIsFull && (
          <span>
            or <span className="text-link">browse files</span>
          </span>
        )}
        <small id={DROPZONE_INSTRUCTIONS_ID}>
          .tif or .tiff, up to 100 MB each · {workspaceFiles.length} of{' '}
          {MAX_WORKSPACE_FILES} files
        </small>
      </div>

      {selection.error && (
        <p
          className="validation-message"
          id={VALIDATION_MESSAGE_ID}
          role="alert"
        >
          <span aria-hidden="true">!</span>
          {getTiffValidationMessage(selection.error)}
        </p>
      )}

      {selection.file && (
        <div className="selected-file" aria-live="polite">
          <span className="file-type" aria-hidden="true">
            TIFF
          </span>
          <div className="file-details">
            <strong title={selection.file.name}>{selection.file.name}</strong>
            <span>{formatFileSize(selection.file.size)}</span>
          </div>
          <button
            className="clear-button"
            type="button"
            onClick={handleClearPendingFile}
          >
            Clear
          </button>
        </div>
      )}

      {upload.state.status === 'uploading' && (
        <p className="upload-status" role="status">
          Uploading {selection.file?.name}…
        </p>
      )}
      {upload.state.status === 'error' && (
        <p className="upload-result upload-result--error" role="alert">
          {upload.state.message}
        </p>
      )}

      {workspaceFiles.length > 0 && (
        <section
          className="workspace-files"
          aria-labelledby="workspace-files-title"
        >
          <div className="workspace-files__header">
            <h3 id="workspace-files-title">Workspace files</h3>
            <span>
              {workspaceFiles.length} of {MAX_WORKSPACE_FILES}
            </span>
          </div>
          <ul className="workspace-files__list">
            {workspaceFiles.map((file) => (
              <li
                key={file.clientId}
                className={`workspace-file${file.clientId === activeClientId ? ' workspace-file--active' : ''}`}
              >
                <button
                  className="workspace-file__activate"
                  type="button"
                  aria-pressed={file.clientId === activeClientId}
                  onClick={() => setActiveClientId(file.clientId)}
                >
                  <strong>{file.displayName}</strong>
                  <span>
                    {formatFileSize(file.sizeBytes)} ·{' '}
                    {file.status === 'expired' ? 'Expired' : 'Ready'}
                  </span>
                </button>
                <button
                  className="clear-button workspace-file__remove"
                  type="button"
                  aria-label={`Remove ${file.displayName} from workspace`}
                  onClick={() => void handleRemoveFile(file.clientId)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="workspace-announcement" role="status" aria-live="polite">
        {workspaceAnnouncement}
      </p>
      {cleanupWarning && (
        <p className="cleanup-warning" role="alert">
          {cleanupWarning}
        </p>
      )}

      {activeFile && (
        <div className="upload-result upload-result--success">
          <div className="upload-success-heading">
            <strong>
              Upload complete · Active TIFF: {activeFile.displayName}
            </strong>
            <span>Review the file, choose a view, and export your result.</span>
          </div>
          {activeFile.status === 'expired' ? (
            <p className="expired-file" role="alert">
              This TIFF is no longer available on the server. Remove it from the
              workspace or switch to another file.
            </p>
          ) : (
            <div className="workflow-grid">
              <div className="workflow-column workflow-column--details">
                <div className="workflow-section">
                  <TiffMetadataPanel
                    upload={{
                      file_id: activeFile.fileId,
                      filename: activeFile.filename,
                      metadata: activeFile.metadata,
                    }}
                  />
                </div>
                <div className="workflow-section selection-panel">
                  <h3>Choose the view</h3>
                  <TiffDimensionSelectors
                    metadata={activeFile.metadata}
                    selectedT={activeSelection.t}
                    selectedZ={activeSelection.z}
                    selectedC={activeSelection.c}
                    onSelectedTChange={(t) => updateActiveSelection({ t })}
                    onSelectedZChange={(z) => updateActiveSelection({ z })}
                    onSelectedCChange={(c) => updateActiveSelection({ c })}
                  />
                  {activeFile.metadata.is_rgb && (
                    <TiffColorComponentSelector
                      value={activeSelection.component}
                      onChange={(component) =>
                        updateActiveSelection({ component })
                      }
                    />
                  )}
                  <div className="selection-pin-control">
                    <button
                      className="primary-button"
                      type="button"
                      disabled={
                        preview.status !== 'success' || isCurrentSelectionPinned
                      }
                      onClick={handleAddSelection}
                    >
                      {isCurrentSelectionPinned
                        ? 'Already selected'
                        : 'Add to selection'}
                    </button>
                    <p className="selection-announcement" aria-live="polite">
                      {selectionAnnouncement}
                    </p>
                  </div>
                </div>
              </div>
              <div className="workflow-column workflow-column--visual">
                <TiffPreview
                  filename={activeFile.displayName}
                  component={activeSelection.component}
                  state={preview}
                />
                <div
                  className="export-panel workflow-section"
                  aria-busy={
                    pngDownload.state.status === 'downloading' ||
                    zipDownload.state.status === 'exporting'
                  }
                >
                  <h3>Export</h3>
                  <p className="section-help">
                    PNG uses the current selection. ZIP includes every T/Z/C
                    plane for the selected RGB color component.
                  </p>
                  <div className="download-panel">
                    <button
                      className="primary-button download-button"
                      type="button"
                      disabled={pngDownload.state.status === 'downloading'}
                      onClick={() => void pngDownload.startDownload()}
                    >
                      {pngDownload.state.status === 'downloading'
                        ? 'Downloading…'
                        : 'Download PNG'}
                    </button>
                    {pngDownload.state.status === 'error' && (
                      <p className="download-error" role="alert">
                        {pngDownload.state.message}
                      </p>
                    )}
                    <button
                      className="secondary-button download-button"
                      type="button"
                      disabled={zipDownload.state.status === 'exporting'}
                      onClick={() => void zipDownload.startDownload()}
                    >
                      {zipDownload.state.status === 'exporting'
                        ? 'Exporting…'
                        : 'Export Stack as ZIP'}
                    </button>
                    {zipDownload.state.status === 'error' && (
                      <p className="download-error" role="alert">
                        {zipDownload.state.message}
                      </p>
                    )}
                  </div>
                  {pngDownload.state.status === 'downloading' && (
                    <p
                      className="operation-status"
                      role="status"
                      aria-live="polite"
                    >
                      Preparing the selected plane for download…
                    </p>
                  )}
                  {zipDownload.state.status === 'exporting' && (
                    <p
                      className="operation-status"
                      role="status"
                      aria-live="polite"
                    >
                      Rendering and packaging all stack planes…
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
          <TiffSelectionTray
            selections={pinnedSelections}
            sources={workspaceFiles}
            onActivate={handleActivateSelection}
            onRemove={handleRemoveSelection}
            onClear={() =>
              clearPinnedSelections('Cleared all selected images.')
            }
            previewFile={previewFile}
            downloadPng={downloadPng}
            downloadSelectionZip={downloadSelectionZip}
          />
        </div>
      )}

      {!activeFile && !selection.file && !selection.error && (
        <p className="empty-state" role="status">
          No TIFFs in the workspace yet. Choose a file to reveal metadata, image
          controls, preview, and export actions.
        </p>
      )}

      <div className="upload-actions">
        <button
          className="secondary-button"
          type="button"
          disabled={
            workspaceFiles.length === 0 && !selection.file && !selection.error
          }
          onClick={handleResetWorkspace}
        >
          Reset
        </button>
        <button
          className="primary-button"
          type="button"
          disabled={
            !selection.file ||
            upload.state.status === 'uploading' ||
            workspaceIsFull
          }
          onClick={() => void handleUpload()}
        >
          {upload.state.status === 'uploading'
            ? 'Uploading…'
            : workspaceFiles.length > 0
              ? 'Add TIFF'
              : 'Upload TIFF'}
        </button>
      </div>

      <p className="upload-boundary-note">
        Files are stored temporarily under opaque server-generated IDs. The
        workspace is not saved after a page reload.
      </p>
    </section>
  )
}
