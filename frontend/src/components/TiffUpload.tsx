import {
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  useRef,
  useState,
} from 'react'

import { type UploadTiffFunction, useTiffUpload } from '../hooks/useTiffUpload'
import {
  clearTiffFileSelection,
  formatFileSize,
  getTiffValidationMessage,
  selectTiffFile,
  type TiffFileSelectionState,
} from '../utils/tiffFile'

interface TiffUploadProps {
  uploadFile?: UploadTiffFunction
}

const ACCEPTED_FILE_TYPES = '.tif,.tiff,image/tiff'
const DROPZONE_INSTRUCTIONS_ID = 'tiff-dropzone-instructions'
const VALIDATION_MESSAGE_ID = 'tiff-validation-message'

export function TiffUpload({ uploadFile }: TiffUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [selection, setSelection] = useState<TiffFileSelectionState>(
    clearTiffFileSelection,
  )
  const [isDragging, setIsDragging] = useState(false)
  const upload = useTiffUpload(uploadFile)

  const chooseFile = () => inputRef.current?.click()

  const handleFile = (file: File) => {
    upload.reset()
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
    setSelection(clearTiffFileSelection())
    setIsDragging(false)

    if (inputRef.current) {
      inputRef.current.value = ''
    }
  }

  const handleUpload = async () => {
    if (selection.file && upload.state.status !== 'uploading') {
      await upload.startUpload(selection.file)
    }
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
      <p className="card-label">Step 1 of 3</p>
      <h2 id="upload-title">Choose your TIFF</h2>
      <p className="upload-intro">
        Select one microscopy image to begin. It will be sent to temporary,
        server-controlled storage when you upload it.
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
            <strong>{selection.file.name}</strong>
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
        <div className="upload-result upload-result--success" role="status">
          <strong>Upload complete</strong>
          <span>{upload.state.upload.filename}</span>
          <code>{upload.state.upload.file_id}</code>
        </div>
      )}

      {upload.state.status === 'error' && (
        <p className="upload-result upload-result--error" role="alert">
          {upload.state.message}
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
