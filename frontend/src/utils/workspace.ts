import type { UploadTiffResponse } from '../types/api'
import type { WorkspaceFile, WorkspaceSelection } from '../types/workspace'

export const MAX_WORKSPACE_FILES = 3

function createClientId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `workspace-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function getAvailableDisplayName(
  filename: string,
  files: readonly WorkspaceFile[],
): string {
  const usedNames = new Set(files.map((file) => file.displayName))
  if (!usedNames.has(filename)) {
    return filename
  }

  let suffix = 2
  while (usedNames.has(`${filename} (${suffix})`)) {
    suffix += 1
  }
  return `${filename} (${suffix})`
}

export function createWorkspaceFile(
  upload: UploadTiffResponse,
  sizeBytes: number,
  files: readonly WorkspaceFile[],
): WorkspaceFile {
  return {
    clientId: createClientId(),
    fileId: upload.file_id,
    filename: upload.filename,
    displayName: getAvailableDisplayName(upload.filename, files),
    sizeBytes,
    metadata: upload.metadata,
    activeSelection: { t: 0, z: 0, c: 0, component: 'composite' },
    status: 'ready',
  }
}

export function updateWorkspaceSelection(
  files: readonly WorkspaceFile[],
  clientId: string,
  update: Partial<WorkspaceSelection>,
): WorkspaceFile[] {
  return files.map((file) =>
    file.clientId === clientId
      ? {
          ...file,
          activeSelection: { ...file.activeSelection, ...update },
        }
      : file,
  )
}

export function getActiveClientIdAfterRemoval(
  files: readonly WorkspaceFile[],
  removedIndex: number,
): string | undefined {
  return files[removedIndex + 1]?.clientId ?? files[removedIndex - 1]?.clientId
}
