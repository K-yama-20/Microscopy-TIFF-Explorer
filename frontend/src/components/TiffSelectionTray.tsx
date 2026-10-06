import type { DownloadTiffPngFunction } from '../hooks/useTiffPngDownload'
import { useTiffPngDownload } from '../hooks/useTiffPngDownload'
import type { PreviewTiffFunction } from '../hooks/useTiffPreview'
import { useTiffPreview } from '../hooks/useTiffPreview'
import type { PinnedSelection } from '../types/api'
import { getRgbComponentLabel } from '../utils/pinnedSelection'

interface TiffSelectionTrayProps {
  selections: readonly PinnedSelection[]
  onActivate: (selection: PinnedSelection) => void
  onRemove: (selectionId: string) => void
  onClear: () => void
  previewFile?: PreviewTiffFunction
  downloadPng?: DownloadTiffPngFunction
}

interface TiffSelectionTrayItemProps {
  selection: PinnedSelection
  onActivate: (selection: PinnedSelection) => void
  onRemove: (selectionId: string) => void
  previewFile?: PreviewTiffFunction
  downloadPng?: DownloadTiffPngFunction
}

const THUMBNAIL_MAX_SIZE = 240

function getSelectionSummary(selection: PinnedSelection): string {
  return `${selection.filename}, T ${selection.t}, Z ${selection.z}, C ${selection.c}, ${getRgbComponentLabel(selection.component, selection.is_rgb)}`
}

function TiffSelectionTrayItem({
  selection,
  onActivate,
  onRemove,
  previewFile,
  downloadPng,
}: TiffSelectionTrayItemProps) {
  const summary = getSelectionSummary(selection)
  const thumbnail = useTiffPreview(
    {
      fileId: selection.file_id,
      t: selection.t,
      z: selection.z,
      c: selection.c,
      component: selection.component,
      maxSize: THUMBNAIL_MAX_SIZE,
    },
    previewFile,
  )
  const pngDownload = useTiffPngDownload(
    {
      fileId: selection.file_id,
      t: selection.t,
      z: selection.z,
      c: selection.c,
      component: selection.component,
    },
    downloadPng,
  )

  return (
    <li
      className="selection-tray__item"
      data-selection-id={selection.id}
      data-addition-order={selection.addition_order}
    >
      <button
        className="selection-thumbnail"
        type="button"
        aria-label={`Show ${summary} in the main preview`}
        aria-busy={thumbnail.status === 'loading'}
        onClick={() => onActivate(selection)}
      >
        {thumbnail.status === 'loading' && (
          <span className="selection-thumbnail__status" role="status">
            Loading thumbnail…
          </span>
        )}
        {thumbnail.status === 'error' && (
          <span className="selection-thumbnail__error" role="alert">
            {thumbnail.message}
          </span>
        )}
        {thumbnail.status === 'success' && (
          <img
            src={thumbnail.objectUrl}
            alt={`${summary} thumbnail`}
            width={THUMBNAIL_MAX_SIZE}
            height={THUMBNAIL_MAX_SIZE}
          />
        )}
      </button>

      <div className="selection-tray__details">
        <strong title={selection.filename}>{selection.filename}</strong>
        <span>
          T {selection.t} · Z {selection.z} · C {selection.c}
        </span>
        <span>
          {getRgbComponentLabel(selection.component, selection.is_rgb)}
        </span>
      </div>

      <div className="selection-tray__actions">
        <button
          className="secondary-button selection-tray__download"
          type="button"
          disabled={pngDownload.state.status === 'downloading'}
          aria-label={`Download ${summary} as PNG`}
          onClick={() => void pngDownload.startDownload()}
        >
          {pngDownload.state.status === 'downloading'
            ? 'Downloading…'
            : 'Download PNG'}
        </button>
        <button
          className="clear-button selection-tray__remove"
          type="button"
          aria-label={`Remove ${summary} from selection`}
          onClick={() => onRemove(selection.id)}
        >
          Remove
        </button>
      </div>

      {pngDownload.state.status === 'error' && (
        <p className="selection-tray__error" role="alert">
          {pngDownload.state.message}
        </p>
      )}
    </li>
  )
}

export function TiffSelectionTray({
  selections,
  onActivate,
  onRemove,
  onClear,
  previewFile,
  downloadPng,
}: TiffSelectionTrayProps) {
  return (
    <section
      className="selection-tray workflow-section"
      aria-labelledby="selection-tray-title"
    >
      <div className="selection-tray__header">
        <div>
          <h3 id="selection-tray-title">Selected images</h3>
          <p className="section-help">
            Pinned views stay unchanged while you browse other image planes.
          </p>
        </div>
        <button
          className="clear-button selection-tray__clear"
          type="button"
          disabled={selections.length === 0}
          onClick={onClear}
        >
          Clear all
        </button>
      </div>

      {selections.length === 0 ? (
        <p className="selection-tray__empty">
          No images selected. Add the current preview to build a temporary
          selection.
        </p>
      ) : (
        <ol className="selection-tray__list">
          {selections.map((selection) => (
            <TiffSelectionTrayItem
              key={selection.id}
              selection={selection}
              onActivate={onActivate}
              onRemove={onRemove}
              previewFile={previewFile}
              downloadPng={downloadPng}
            />
          ))}
        </ol>
      )}
    </section>
  )
}
