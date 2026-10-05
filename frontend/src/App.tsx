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
            Inspect metadata and image planes, then download the current view as
            PNG or export the complete TIFF stack as ZIP.
          </p>
          <ul className="capability-list" aria-label="Upload requirements">
            <li>TIFF files</li>
            <li>Up to 100 MB</li>
          </ul>
        </section>

        <TiffUpload />
      </main>
    </div>
  )
}
