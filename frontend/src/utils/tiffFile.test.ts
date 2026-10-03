import { describe, expect, it } from 'vitest'

import {
  MAX_TIFF_FILE_SIZE_BYTES,
  clearTiffFileSelection,
  formatFileSize,
  selectTiffFile,
  validateTiffFile,
} from './tiffFile'

function createFile(name: string, size: number): File {
  return { name, size } as File
}

describe('validateTiffFile', () => {
  it.each(['sample.tif', 'sample.tiff', 'SAMPLE.TIF', 'Sample.TiFf'])(
    'accepts the TIFF extension in %s',
    (name) => {
      expect(validateTiffFile(createFile(name, 1))).toEqual({
        isValid: true,
        error: null,
      })
    },
  )

  it.each(['sample.png', 'sample.tif.png', 'sample', 'sample.tiff.txt'])(
    'rejects the unsupported extension in %s',
    (name) => {
      expect(validateTiffFile(createFile(name, 1))).toEqual({
        isValid: false,
        error: 'invalid-extension',
      })
    },
  )

  it('accepts a file exactly at the 100 MB boundary', () => {
    expect(
      validateTiffFile(createFile('boundary.tiff', MAX_TIFF_FILE_SIZE_BYTES)),
    ).toEqual({ isValid: true, error: null })
  })

  it('rejects a file one byte above the 100 MB boundary', () => {
    expect(
      validateTiffFile(
        createFile('too-large.tiff', MAX_TIFF_FILE_SIZE_BYTES + 1),
      ),
    ).toEqual({ isValid: false, error: 'file-too-large' })
  })
})

describe('file selection state', () => {
  it('replaces an old error when a valid file is selected', () => {
    const invalidState = selectTiffFile(createFile('invalid.png', 1))
    const validFile = createFile('valid.tif', 1024)
    const nextState = selectTiffFile(validFile)

    expect(invalidState.error).toBe('invalid-extension')
    expect(nextState).toEqual({ file: validFile, error: null })
  })

  it('clears both the selected file and error', () => {
    expect(clearTiffFileSelection()).toEqual({ file: null, error: null })
  })
})

describe('formatFileSize', () => {
  it('formats file sizes for display', () => {
    expect(formatFileSize(0)).toBe('0 bytes')
    expect(formatFileSize(1536)).toBe('1.5 KB')
    expect(formatFileSize(12 * 1024 * 1024)).toBe('12 MB')
  })
})
