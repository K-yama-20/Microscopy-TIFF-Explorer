import { AppHeader } from './components/AppHeader'
import { TiffUpload } from './components/TiffUpload'

export function App() {
  return (
    <div className="app-shell">
      <AppHeader />
      <main className="main-content">
        <section className="hero" aria-labelledby="hero-title">
          <p className="eyebrow">Browser-based microscopy workflow</p>
          <h1 id="hero-title">Explore microscopy TIFF files with clarity.</h1>
          <p className="hero-copy">
            Inspect dimensions and metadata, preview a selected image plane, and
            export research-ready PNG files from one focused workspace.
          </p>
          <div className="status-card" role="status">
            <span className="status-indicator" aria-hidden="true" />
            <div>
              <strong>TIFF selection is ready</strong>
              <p>
                Validate locally, then upload securely for temporary server-side
                processing.
              </p>
            </div>
          </div>
        </section>

        <TiffUpload />
      </main>
    </div>
  )
}
