// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiClientError, uploadTiff } from './client'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('uploadTiff', () => {
  it('sends the selected file as multipart data without setting Content-Type', async () => {
    const responseBody = {
      file_id: '95ed59ce-198b-4f17-89da-74e17d457df3',
      filename: 'sample.tif',
      metadata: {
        shape: [2, 3, 5, 7],
        axes: 'ZCYX',
        dtype: 'uint16',
        width: 7,
        height: 5,
        time_points: 1,
        z_slices: 2,
        channels: 3,
        series_count: 1,
      },
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(responseBody), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const file = new File([new Uint8Array([1, 2, 3])], 'sample.tif')

    await expect(uploadTiff(file)).resolves.toEqual(responseBody)

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/api\/tiff\/upload$/)
    expect(request.method).toBe('POST')
    expect(request.headers).toBeUndefined()
    expect(request.body).toBeInstanceOf(FormData)
    expect((request.body as FormData).get('file')).toBe(file)
  })

  it('turns a structured API error into a client error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 'FILE_TOO_LARGE',
              message: 'The TIFF file exceeds the maximum allowed size.',
            },
          }),
          { status: 413, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )

    await expect(uploadTiff(new File(['x'], 'sample.tif'))).rejects.toEqual(
      new ApiClientError(
        'FILE_TOO_LARGE',
        'The TIFF file exceeds the maximum allowed size.',
      ),
    )
  })

  it('rejects a successful response with invalid metadata', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            file_id: '95ed59ce-198b-4f17-89da-74e17d457df3',
            filename: 'sample.tif',
            metadata: {
              shape: [5, 7],
              axes: 'YX',
              dtype: 'float32',
              width: 7,
              height: 5,
              time_points: 1,
              z_slices: 1,
              channels: 1,
              series_count: 1,
            },
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )

    await expect(uploadTiff(new File(['x'], 'sample.tif'))).rejects.toEqual(
      new ApiClientError(
        'INVALID_RESPONSE',
        'The upload service returned an unexpected response. Please try again.',
      ),
    )
  })
})
