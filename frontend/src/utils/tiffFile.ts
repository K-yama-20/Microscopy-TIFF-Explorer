export const MAX_TIFF_FILE_SIZE_BYTES = 100 * 1024 * 1024

export type TiffFileValidationError = 'invalid-extension' | 'file-too-large'

export interface TiffFileValidationResult {
  isValid: boolean
  error: TiffFileValidationError | null
}

export interface TiffFileSelectionState<TFile extends File = File> {
  file: TFile | null
  error: TiffFileValidationError | null
}

const TIFF_EXTENSION_PATTERN = /\.tiff?$/i

export function validateTiffFile(
  file: Pick<File, 'name' | 'size'>,
): TiffFileValidationResult {
  if (!TIFF_EXTENSION_PATTERN.test(file.name)) {
    return { isValid: false, error: 'invalid-extension' }
  }

  if (file.size > MAX_TIFF_FILE_SIZE_BYTES) {
    return { isValid: false, error: 'file-too-large' }
  }

  return { isValid: true, error: null }
}

export function selectTiffFile<TFile extends File>(
  file: TFile,
): TiffFileSelectionState<TFile> {
  const validation = validateTiffFile(file)

  return validation.isValid
    ? { file, error: null }
    : { file: null, error: validation.error }
}

export function clearTiffFileSelection(): TiffFileSelectionState {
  return { file: null, error: null }
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) {
    return '0 bytes'
  }

  const units = ['bytes', 'KB', 'MB', 'GB']
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  )
  const value = bytes / 1024 ** unitIndex
  const fractionDigits = unitIndex === 0 || value >= 10 ? 0 : 1

  return `${value.toFixed(fractionDigits)} ${units[unitIndex]}`
}

export function getTiffValidationMessage(
  error: TiffFileValidationError,
): string {
  if (error === 'file-too-large') {
    return 'This file is larger than 100 MB. Choose a smaller TIFF file.'
  }

  return 'Choose a TIFF file with a .tif or .tiff extension.'
}
