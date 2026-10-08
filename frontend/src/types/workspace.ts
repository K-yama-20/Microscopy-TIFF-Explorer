import type { RgbComponent, TiffMetadata } from './api'

export interface WorkspaceSelection {
  t: number
  z: number
  c: number
  component: RgbComponent
}

export type WorkspaceFileStatus = 'ready' | 'expired' | 'error'

export interface WorkspaceFile {
  clientId: string
  fileId: string
  filename: string
  displayName: string
  sizeBytes: number
  metadata: TiffMetadata
  activeSelection: WorkspaceSelection
  status: WorkspaceFileStatus
}
