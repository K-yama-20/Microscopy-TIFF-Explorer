import { describe, expect, it } from 'vitest'

import type { TiffMetadata, UploadTiffResponse } from '../types/api'
import type { WorkspaceFile } from '../types/workspace'
import {
  createWorkspaceFile,
  getActiveClientIdAfterRemoval,
  getAvailableDisplayName,
  updateWorkspaceSelection,
} from './workspace'

const metadata: TiffMetadata = {
  shape: [2, 3, 5, 7],
  axes: 'ZCYX',
  dtype: 'uint16',
  width: 7,
  height: 5,
  time_points: 1,
  z_slices: 2,
  channels: 3,
  series_count: 1,
  is_rgb: false,
  sample_count: 1,
  rgb_components: [],
}

function upload(fileId: string, filename = 'sample.tif'): UploadTiffResponse {
  return { file_id: fileId, filename, metadata }
}

describe('workspace files', () => {
  it('creates stable opaque identity and zeroed per-file selection', () => {
    const file = createWorkspaceFile(upload('file-1'), 1024, [])

    expect(file).toMatchObject({
      fileId: 'file-1',
      filename: 'sample.tif',
      displayName: 'sample.tif',
      sizeBytes: 1024,
      status: 'ready',
      activeSelection: { t: 0, z: 0, c: 0, component: 'composite' },
    })
    expect(file.clientId).toBeTruthy()
  })

  it('assigns same-name labels once without using them as identity', () => {
    const first = createWorkspaceFile(upload('file-1'), 1, [])
    const second = createWorkspaceFile(upload('file-2'), 1, [first])
    const third = createWorkspaceFile(upload('file-3'), 1, [first, second])

    expect([first.displayName, second.displayName, third.displayName]).toEqual([
      'sample.tif',
      'sample.tif (2)',
      'sample.tif (3)',
    ])
    expect(
      new Set([first.clientId, second.clientId, third.clientId]).size,
    ).toBe(3)
    expect(getAvailableDisplayName('sample.tif', [second, third])).toBe(
      'sample.tif',
    )
  })

  it('updates only the selected client ID and chooses next then previous on removal', () => {
    const files: WorkspaceFile[] = [
      createWorkspaceFile(upload('file-1', 'first.tif'), 1, []),
      createWorkspaceFile(upload('file-2', 'second.tif'), 1, []),
      createWorkspaceFile(upload('file-3', 'third.tif'), 1, []),
    ]
    const updated = updateWorkspaceSelection(files, files[1].clientId, {
      z: 1,
      c: 2,
    })

    expect(updated[0]).toBe(files[0])
    expect(updated[1].activeSelection).toMatchObject({ z: 1, c: 2 })
    expect(updated[2]).toBe(files[2])
    expect(getActiveClientIdAfterRemoval(files, 1)).toBe(files[2].clientId)
    expect(getActiveClientIdAfterRemoval(files, 2)).toBe(files[1].clientId)
    expect(getActiveClientIdAfterRemoval([files[0]], 0)).toBeUndefined()
  })
})
