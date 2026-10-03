export function AppHeader() {
  return (
    <header className="app-header">
      <a className="brand" href="/" aria-label="Microscopy TIFF Explorer home">
        <span className="brand-mark" aria-hidden="true">
          M
        </span>
        <span>Microscopy TIFF Explorer</span>
      </a>
      <span className="version-badge">MVP</span>
    </header>
  )
}
