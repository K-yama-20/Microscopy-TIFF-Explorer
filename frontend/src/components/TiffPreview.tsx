import type { TiffPreviewState } from '../hooks/useTiffPreview'
import type { RgbComponent } from '../types/api'

interface TiffPreviewProps {
  filename: string
  component: RgbComponent
  state: TiffPreviewState
}

export function TiffPreview({ filename, component, state }: TiffPreviewProps) {
  return (
    <section
      className="preview-panel workflow-section"
      aria-labelledby="preview-title"
      aria-busy={state.status === 'loading'}
    >
      <h3 id="preview-title">Image preview</h3>
      {state.status === 'loading' && (
        <p className="preview-status" role="status">
          Loading preview…
        </p>
      )}
      {state.status === 'error' && (
        <p className="preview-error" role="alert">
          {state.message}
        </p>
      )}
      {state.status === 'success' && (
        <div className="preview-frame">
          <img
            className="preview-image"
            src={state.objectUrl}
            alt={`${component === 'composite' ? 'Composite' : component} preview of ${filename}`}
          />
        </div>
      )}
    </section>
  )
}
