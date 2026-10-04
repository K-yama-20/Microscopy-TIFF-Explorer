export interface HealthResponse {
  status: 'ok'
}

export interface TiffMetadata {
  shape: number[]
  axes: string
  dtype: 'uint8' | 'uint16'
  width: number
  height: number
  time_points: number
  z_slices: number
  channels: number
  series_count: number
  is_rgb: boolean
  sample_count: number
  rgb_components: RgbComponentName[]
}

export type RgbComponent = 'composite' | 'red' | 'green' | 'blue'

export type RgbComponentName = Exclude<RgbComponent, 'composite'>

export interface PreviewSelection {
  t: number
  z: number
  c: number
  component?: RgbComponent
}

export interface UploadTiffResponse {
  file_id: string
  filename: string
  metadata: TiffMetadata
}

export interface ApiErrorResponse {
  error: {
    code: string
    message: string
  }
}
