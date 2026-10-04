// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiClientError, fetchTiffPreview, uploadTiff } from './client'

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
        is_rgb: false,
        sample_count: 1,
        rgb_components: [],
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

  it('accepts and validates RGB metadata fields', async () => {
    const responseBody = {
      file_id: '95ed59ce-198b-4f17-89da-74e17d457df3',
      filename: 'rgb.tif',
      metadata: {
        shape: [5, 7, 3],
        axes: 'YXS',
        dtype: 'uint8',
        width: 7,
        height: 5,
        time_points: 1,
        z_slices: 1,
        channels: 1,
        series_count: 1,
        is_rgb: true,
        sample_count: 3,
        rgb_components: ['red', 'green', 'blue'],
      },
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(responseBody), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    await expect(uploadTiff(new File(['x'], 'rgb.tif'))).resolves.toEqual(
      responseBody,
    )
  })
})

describe('fetchTiffPreview', () => {
  it('requests T/Z/C and defaults the component to composite', async () => {
    const png = new Blob(['png'], { type: 'image/png' })
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(png, {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchTiffPreview('file id', { t: 1, z: 2, c: 3 })

    expect(result.type).toBe('image/png')
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(
      /\/api\/tiff\/file%20id\/preview\?t=1&z=2&c=3&component=composite$/,
    )
    expect(request.signal).toBeUndefined()
  })

  it('includes an explicitly selected RGB component', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Blob(['png']), {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await fetchTiffPreview('file-id', {
      t: 0,
      z: 0,
      c: 2,
      component: 'blue',
    })

    expect(fetchMock.mock.calls[0][0]).toMatch(/component=blue$/)
  })

  it('turns a structured preview error into a client error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 'INVALID_DIMENSION_INDEX',
              message: 'One or more indices are out of range.',
            },
          }),
          { status: 422, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )

    await expect(
      fetchTiffPreview('file-id', { t: 99, z: 0, c: 0 }),
    ).rejects.toEqual(
      new ApiClientError(
        'INVALID_DIMENSION_INDEX',
        'One or more indices are out of range.',
      ),
    )
  })
})
