import {
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  useRef,
  useState,
} from 'react'

import type { PinnedSelection, RgbComponent } from '../types/api'
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
import { TiffDimensionSelectors } from './TiffDimensionSelectors'
import { TiffColorComponentSelector } from './TiffColorComponentSelector'
import { TiffMetadataPanel } from './TiffMetadataPanel'
import { TiffPreview } from './TiffPreview'
import { TiffSelectionTray } from './TiffSelectionTray'

interface TiffUploadProps {
  uploadFile?: UploadTiffFunction
  previewFile?: PreviewTiffFunction
  downloadPng?: DownloadTiffPngFunction
  downloadZip?: DownloadTiffZipFunction
  downloadSelectionZip?: DownloadSelectionZipFunction
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
}: TiffUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const nextAdditionOrder = useRef(1)
  const pinnedSelectionIds = useRef(new Set<string>())
  const [selection, setSelection] = useState<TiffFileSelectionState>(
    clearTiffFileSelection,
  )
  const [isDragging, setIsDragging] = useState(false)
  const [selectedT, setSelectedT] = useState(0)
  const [selectedZ, setSelectedZ] = useState(0)
  const [selectedC, setSelectedC] = useState(0)
  const [selectedComponent, setSelectedComponent] =
    useState<RgbComponent>('composite')
  const [pinnedSelections, setPinnedSelections] = useState<
    readonly PinnedSelection[]
  >([])
  const [selectionAnnouncement, setSelectionAnnouncement] = useState('')
  const upload = useTiffUpload(uploadFile)
  const successfulUpload =
    upload.state.status === 'success' ? upload.state.upload : undefined
  const preview = useTiffPreview(
    {
      fileId: successfulUpload?.file_id,
      t: selectedT,
      z: selectedZ,
      c: selectedC,
      component: selectedComponent,
    },
    previewFile,
  )
  const pngDownload = useTiffPngDownload(
    {
      fileId: successfulUpload?.file_id,
      t: selectedT,
      z: selectedZ,
      c: selectedC,
      component: selectedComponent,
    },
    downloadPng,
  )
  const zipDownload = useTiffZipDownload(
    {
      fileId: successfulUpload?.file_id,
      component: selectedComponent,
    },
    downloadZip,
  )
  const currentPinnedCandidate: PinnedSelectionCandidate | undefined =
    successfulUpload
      ? {
          file_id: successfulUpload.file_id,
          filename: successfulUpload.filename,
          is_rgb: successfulUpload.metadata.is_rgb,
          t: selectedT,
          z: selectedZ,
          c: selectedC,
          component: selectedComponent,
        }
      : undefined
  const isCurrentSelectionPinned = currentPinnedCandidate
    ? hasPinnedSelection(pinnedSelections, currentPinnedCandidate)
    : false

  const chooseFile = () => inputRef.current?.click()

  const resetDimensionSelections = () => {
    setSelectedT(0)
    setSelectedZ(0)
    setSelectedC(0)
    setSelectedComponent('composite')
  }

  const clearPinnedSelections = () => {
    setPinnedSelections([])
    pinnedSelectionIds.current.clear()
    nextAdditionOrder.current = 1
    setSelectionAnnouncement('')
  }

  const handleFile = (file: File) => {
    upload.reset()
    resetDimensionSelections()
    clearPinnedSelections()
    setSelection(selectTiffFile(file))
    setIsDragging(false)
  }

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]

    if (file) {
      handleFile(file)
    }

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
    event.dataTransfer.dropEffect = 'copy'
    setIsDragging(true)
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

  const handleClear = () => {
    upload.reset()
    resetDimensionSelections()
    clearPinnedSelections()
    setSelection(clearTiffFileSelection())
    setIsDragging(false)

    if (inputRef.current) {
      inputRef.current.value = ''
    }
  }

  const handleUpload = async () => {
    if (selection.file && upload.state.status !== 'uploading') {
      resetDimensionSelections()
      clearPinnedSelections()
      await upload.startUpload(selection.file)
    }
  }

  const handleAddSelection = () => {
    if (!currentPinnedCandidate || isCurrentSelectionPinned) {
      return
    }

    const selectionId = getPinnedSelectionId(currentPinnedCandidate)
    if (pinnedSelectionIds.current.has(selectionId)) {
      return
    }

    const pinnedSelection = createPinnedSelection(
      currentPinnedCandidate,
      nextAdditionOrder.current,
    )
    pinnedSelectionIds.current.add(selectionId)
    nextAdditionOrder.current += 1
    setPinnedSelections((current) => [...current, pinnedSelection])
    setSelectionAnnouncement(
      `Added T ${pinnedSelection.t}, Z ${pinnedSelection.z}, C ${pinnedSelection.c} to selected images.`,
    )
  }

  const handleActivateSelection = (pinnedSelection: PinnedSelection) => {
    if (pinnedSelection.file_id !== successfulUpload?.file_id) {
      return
    }

    setSelectedT(pinnedSelection.t)
    setSelectedZ(pinnedSelection.z)
    setSelectedC(pinnedSelection.c)
    setSelectedComponent(pinnedSelection.component)
    setSelectionAnnouncement(
      `Restored T ${pinnedSelection.t}, Z ${pinnedSelection.z}, C ${pinnedSelection.c} to the main preview.`,
    )
  }

  const handleRemoveSelection = (selectionId: string) => {
    pinnedSelectionIds.current.delete(selectionId)
    setPinnedSelections((current) =>
      current.filter((pinnedSelection) => pinnedSelection.id !== selectionId),
    )
    setSelectionAnnouncement('Removed the image from selected images.')
  }

  const handleClearAllSelections = () => {
    setPinnedSelections([])
    pinnedSelectionIds.current.clear()
    nextAdditionOrder.current = 1
    setSelectionAnnouncement('Cleared all selected images.')
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
        Choose one supported image to inspect its metadata, image planes, and
        export options.
      </p>

      <input
        ref={inputRef}
        className="visually-hidden"
        id="tiff-file-input"
        type="file"
        accept={ACCEPTED_FILE_TYPES}
        aria-label="Choose TIFF file"
        tabIndex={-1}
        onChange={handleInputChange}
      />

      <div
        className={`dropzone${isDragging ? ' dropzone--dragging' : ''}${
          selection.error ? ' dropzone--error' : ''
        }`}
        role="button"
        tabIndex={0}
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
          {isDragging ? 'Drop the TIFF here' : 'Drag and drop a TIFF'}
        </strong>
        <span>
          or <span className="text-link">browse files</span>
        </span>
        <small id={DROPZONE_INSTRUCTIONS_ID}>.tif or .tiff, up to 100 MB</small>
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
          <button className="clear-button" type="button" onClick={handleClear}>
            Clear
          </button>
        </div>
      )}

      {upload.state.status === 'uploading' && (
        <p className="upload-status" role="status">
          Uploading {selection.file?.name}…
        </p>
      )}

      {upload.state.status === 'success' && (
        <div className="upload-result upload-result--success">
          <div className="upload-success-heading">
            <strong role="status">Upload complete</strong>
            <span>Review the file, choose a view, and export your result.</span>
          </div>
          <div className="workflow-grid">
            <div className="workflow-column workflow-column--details">
              <div className="workflow-section">
                <TiffMetadataPanel upload={upload.state.upload} />
              </div>
              <div className="workflow-section selection-panel">
                <h3>Choose the view</h3>
                <TiffDimensionSelectors
                  metadata={upload.state.upload.metadata}
                  selectedT={selectedT}
                  selectedZ={selectedZ}
                  selectedC={selectedC}
                  onSelectedTChange={setSelectedT}
                  onSelectedZChange={setSelectedZ}
                  onSelectedCChange={setSelectedC}
                />
                {upload.state.upload.metadata.is_rgb && (
                  <TiffColorComponentSelector
                    value={selectedComponent}
                    onChange={setSelectedComponent}
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
                filename={upload.state.upload.filename}
                component={selectedComponent}
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
                  PNG uses the current selection. ZIP includes every T/Z/C plane
                  for the selected RGB color component.
                </p>
                <div className="download-panel">
                  <button
                    className="primary-button download-button"
                    type="button"
                    disabled={
                      !successfulUpload ||
                      pngDownload.state.status === 'downloading'
                    }
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
                    disabled={
                      !successfulUpload ||
                      zipDownload.state.status === 'exporting'
                    }
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
          <TiffSelectionTray
            selections={pinnedSelections}
            onActivate={handleActivateSelection}
            onRemove={handleRemoveSelection}
            onClear={handleClearAllSelections}
            previewFile={previewFile}
            downloadPng={downloadPng}
            downloadSelectionZip={downloadSelectionZip}
          />
        </div>
      )}

      {upload.state.status === 'error' && (
        <p className="upload-result upload-result--error" role="alert">
          {upload.state.message}
        </p>
      )}

      {upload.state.status === 'idle' &&
        !selection.file &&
        !selection.error && (
          <p className="empty-state" role="status">
            No TIFF selected yet. Choose a file to reveal metadata, image
            controls, preview, and export actions.
          </p>
        )}

      <div className="upload-actions">
        <button
          className="secondary-button"
          type="button"
          disabled={!selection.file && !selection.error}
          onClick={handleClear}
        >
          Reset
        </button>
        <button
          className="primary-button"
          type="button"
          disabled={!selection.file || upload.state.status === 'uploading'}
          onClick={handleUpload}
        >
          {upload.state.status === 'uploading' ? 'Uploading…' : 'Upload TIFF'}
        </button>
      </div>

      <p className="upload-boundary-note">
        Files are stored temporarily under an opaque server-generated ID.
      </p>
    </section>
  )
}
