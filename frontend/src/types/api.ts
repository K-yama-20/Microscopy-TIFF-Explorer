export interface HealthResponse {
  status: 'ok'
}

export interface UploadTiffResponse {
  file_id: string
  filename: string
}

export interface ApiErrorResponse {
  error: {
    code: string
    message: string
  }
}
