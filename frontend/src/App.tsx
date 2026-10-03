import { AppHeader } from './components/AppHeader'

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
              <strong>Project foundation is ready</strong>
              <p>
                TIFF upload and inspection will arrive in the next milestone.
              </p>
            </div>
          </div>
        </section>

        <aside className="workflow-card" aria-label="Planned workflow">
          <p className="card-label">MVP workflow</p>
          <ol>
            <li>Upload a TIFF file</li>
            <li>Inspect T, Z, and C dimensions</li>
            <li>Preview and export image planes</li>
          </ol>
          <p className="privacy-note">
            Files will be processed temporarily and will not be stored as a
            permanent library.
          </p>
        </aside>
      </main>
    </div>
  )
}
