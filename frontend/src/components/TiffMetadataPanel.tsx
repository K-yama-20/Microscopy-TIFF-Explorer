import type { UploadTiffResponse } from '../types/api'

interface TiffMetadataPanelProps {
  upload: UploadTiffResponse
}

export function TiffMetadataPanel({ upload }: TiffMetadataPanelProps) {
  const { file_id: fileId, filename, metadata } = upload

  return (
    <section className="metadata-panel" aria-labelledby="metadata-title">
      <h3 id="metadata-title">TIFF metadata</h3>
      <dl className="tiff-metadata">
        <div>
          <dt>Filename</dt>
          <dd>{filename}</dd>
        </div>
        <div>
          <dt>Shape</dt>
          <dd>{metadata.shape.join(' × ')}</dd>
        </div>
        <div>
          <dt>Axes</dt>
          <dd>{metadata.axes}</dd>
        </div>
        <div>
          <dt>Data type</dt>
          <dd>{metadata.dtype}</dd>
        </div>
        <div>
          <dt>Width</dt>
          <dd>{metadata.width}</dd>
        </div>
        <div>
          <dt>Height</dt>
          <dd>{metadata.height}</dd>
        </div>
        <div>
          <dt>Time points</dt>
          <dd>{metadata.time_points}</dd>
        </div>
        <div>
          <dt>Z slices</dt>
          <dd>{metadata.z_slices}</dd>
        </div>
        <div>
          <dt>Channels</dt>
          <dd>{metadata.channels}</dd>
        </div>
        <div>
          <dt>Series count</dt>
          <dd>{metadata.series_count}</dd>
        </div>
        <div>
          <dt>RGB</dt>
          <dd>{metadata.is_rgb ? 'Yes' : 'No'}</dd>
        </div>
        <div>
          <dt>Sample count</dt>
          <dd>{metadata.sample_count}</dd>
        </div>
        <div>
          <dt>RGB components</dt>
          <dd>
            {metadata.rgb_components.length > 0
              ? metadata.rgb_components.join(', ')
              : 'None'}
          </dd>
        </div>
      </dl>
      <p className="metadata-help">
        Channels are microscopy acquisitions on axis C. RGB components are
        grouped color samples on axis S.
      </p>
      <code className="file-id">File ID: {fileId}</code>
    </section>
  )
}
