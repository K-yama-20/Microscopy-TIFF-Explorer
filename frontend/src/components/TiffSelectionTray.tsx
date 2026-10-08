import type { DownloadTiffPngFunction } from '../hooks/useTiffPngDownload'
import { useTiffPngDownload } from '../hooks/useTiffPngDownload'
import type { DownloadSelectionZipFunction } from '../hooks/useSelectionZipDownload'
import { useSelectionZipDownload } from '../hooks/useSelectionZipDownload'
import type { PreviewTiffFunction } from '../hooks/useTiffPreview'
import { useTiffPreview } from '../hooks/useTiffPreview'
import type { PinnedSelection } from '../types/api'
import type { WorkspaceFile } from '../types/workspace'
import { getRgbComponentLabel } from '../utils/pinnedSelection'

interface TiffSelectionTrayProps {
  selections: readonly PinnedSelection[]
  sources: readonly WorkspaceFile[]
  onActivate: (selection: PinnedSelection) => void
  onRemove: (selectionId: string) => void
  onClear: () => void
  previewFile?: PreviewTiffFunction
  downloadPng?: DownloadTiffPngFunction
  downloadSelectionZip?: DownloadSelectionZipFunction
}

interface TiffSelectionTrayItemProps {
  selection: PinnedSelection
  source?: WorkspaceFile
  onActivate: (selection: PinnedSelection) => void
  onRemove: (selectionId: string) => void
  previewFile?: PreviewTiffFunction
  downloadPng?: DownloadTiffPngFunction
}

const THUMBNAIL_MAX_SIZE = 240

function getSelectionSummary(
  selection: PinnedSelection,
  source?: WorkspaceFile,
): string {
  return `${source?.displayName ?? 'Unavailable TIFF'}, T ${selection.t}, Z ${selection.z}, C ${selection.c}, ${getRgbComponentLabel(selection.component, source?.metadata.is_rgb ?? false)}`
}

function TiffSelectionTrayItem({
  selection,
  source,
  onActivate,
  onRemove,
  previewFile,
  downloadPng,
}: TiffSelectionTrayItemProps) {
  const summary = getSelectionSummary(selection, source)
  const thumbnail = useTiffPreview(
    {
      fileId: source?.status === 'ready' ? selection.file_id : undefined,
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
        disabled={!source}
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
        {source?.status !== 'ready' && thumbnail.status === 'idle' && (
          <span className="selection-thumbnail__error">Source unavailable</span>
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
        <strong title={source?.displayName}>
          {source?.displayName ?? 'Unavailable TIFF'}
        </strong>
        <span>
          T {selection.t} · Z {selection.z} · C {selection.c}
        </span>
        <span>
          {getRgbComponentLabel(
            selection.component,
            source?.metadata.is_rgb ?? false,
          )}
        </span>
      </div>

      <div className="selection-tray__actions">
        <button
          className="secondary-button selection-tray__download"
          type="button"
          disabled={
            source?.status !== 'ready' ||
            pngDownload.state.status === 'downloading'
          }
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
  sources,
  onActivate,
  onRemove,
  onClear,
  previewFile,
  downloadPng,
  downloadSelectionZip,
}: TiffSelectionTrayProps) {
  const zipDownload = useSelectionZipDownload(selections, downloadSelectionZip)

  return (
    <section
      className="selection-tray workflow-section"
      aria-labelledby="selection-tray-title"
      aria-busy={zipDownload.state.status === 'exporting'}
    >
      <div className="selection-tray__header">
        <div>
          <h3 id="selection-tray-title">Selected images</h3>
          <p className="section-help">
            Pinned views stay unchanged while you browse other image planes.
          </p>
        </div>
        <div className="selection-tray__batch-actions">
          <button
            className="primary-button selection-tray__batch-download"
            type="button"
            disabled={
              selections.length === 0 ||
              zipDownload.state.status === 'exporting'
            }
            onClick={() => void zipDownload.startDownload()}
          >
            {zipDownload.state.status === 'exporting'
              ? `Preparing selected (${selections.length})…`
              : `Download selected (${selections.length}) as ZIP`}
          </button>
          <button
            className="clear-button selection-tray__clear"
            type="button"
            disabled={selections.length === 0}
            onClick={onClear}
          >
            Clear all
          </button>
        </div>
      </div>

      {zipDownload.state.status === 'exporting' && (
        <p className="operation-status" role="status" aria-live="polite">
          Rendering and packaging the selected images…
        </p>
      )}
      {zipDownload.state.status === 'error' && (
        <p className="selection-tray__error" role="alert">
          {zipDownload.state.message}
        </p>
      )}

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
              source={sources.find(
                (source) => source.fileId === selection.file_id,
              )}
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
