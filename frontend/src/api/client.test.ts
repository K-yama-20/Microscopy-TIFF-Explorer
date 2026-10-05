// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  ApiClientError,
  downloadTiffPng,
  downloadTiffZip,
  fetchTiffPreview,
  uploadTiff,
} from './client'

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

describe('downloadTiffPng', () => {
  it('requests the selected plane and returns its PNG and safe filename', async () => {
    const png = new Blob(['png'], { type: 'image/png' })
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(png, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Content-Disposition':
            'attachment; filename="sample_T001_Z002_C003_B.png"',
        },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await downloadTiffPng('file id', {
      t: 1,
      z: 2,
      c: 3,
      component: 'blue',
    })

    expect(result.blob.type).toBe('image/png')
    expect(result.filename).toBe('sample_T001_Z002_C003_B.png')
    expect(fetchMock.mock.calls[0][0]).toMatch(
      /\/api\/tiff\/file%20id\/export\/png\?t=1&z=2&c=3&component=blue$/,
    )
  })

  it.each([
    [null, 'image.png'],
    ['attachment', 'image.png'],
    ['attachment; filename="../../unsafe.png"', 'unsafe.png'],
    ['attachment; filename="not-a-png.txt"', 'image.png'],
    ['attachment; filename="bad:name.png"', 'bad_name.png'],
  ])(
    'uses a safe filename for Content-Disposition %s',
    async (contentDisposition, expected) => {
      const headers = new Headers({ 'Content-Type': 'image/png' })
      if (contentDisposition) {
        headers.set('Content-Disposition', contentDisposition)
      }
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            new Response(new Blob(['png']), { status: 200, headers }),
          ),
      )

      await expect(
        downloadTiffPng('file-id', { t: 0, z: 0, c: 0 }),
      ).resolves.toMatchObject({ filename: expected })
    },
  )

  it('turns a structured export error into a client error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 'INVALID_RGB_COMPONENT',
              message: 'Choose a valid RGB component.',
            },
          }),
          { status: 422, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )

    await expect(
      downloadTiffPng('file-id', {
        t: 0,
        z: 0,
        c: 0,
        component: 'red',
      }),
    ).rejects.toEqual(
      new ApiClientError(
        'INVALID_RGB_COMPONENT',
        'Choose a valid RGB component.',
      ),
    )
  })

  it('reports network failures clearly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))

    await expect(
      downloadTiffPng('file-id', { t: 0, z: 0, c: 0 }),
    ).rejects.toEqual(
      new ApiClientError(
        'NETWORK_ERROR',
        'Could not reach the PNG export service. Please try again.',
      ),
    )
  })

  it('rejects a non-PNG success response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('not png', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        }),
      ),
    )

    await expect(
      downloadTiffPng('file-id', { t: 0, z: 0, c: 0 }),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })
})

describe('downloadTiffZip', () => {
  it('requests only the component and returns a ZIP with a safe filename', async () => {
    const zip = new Blob(['zip'], { type: 'application/zip' })
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(zip, {
        status: 200,
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': 'attachment; filename="sample_stack_B.zip"',
        },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()

    const result = await downloadTiffZip('file id', 'blue', controller.signal)

    expect(result.blob.type).toBe('application/zip')
    expect(result.filename).toBe('sample_stack_B.zip')
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/api\/tiff\/file%20id\/export\/zip\?component=blue$/)
    expect(url).not.toMatch(/[?&][tzc]=/)
    expect(request.signal).toBe(controller.signal)
  })

  it('defaults the component to composite', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Blob(['zip']), {
        status: 200,
        headers: { 'Content-Type': 'application/zip' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await downloadTiffZip('file-id')

    expect(fetchMock.mock.calls[0][0]).toMatch(/component=composite$/)
  })

  it.each([
    [null, 'images.zip'],
    ['attachment', 'images.zip'],
    ['attachment; filename="../../unsafe.zip"', 'unsafe.zip'],
    ['attachment; filename="not-a-zip.png"', 'images.zip'],
    ['attachment; filename="bad:name.zip"', 'bad_name.zip'],
  ])(
    'uses a safe ZIP filename for Content-Disposition %s',
    async (contentDisposition, expected) => {
      const headers = new Headers({ 'Content-Type': 'application/zip' })
      if (contentDisposition) {
        headers.set('Content-Disposition', contentDisposition)
      }
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            new Response(new Blob(['zip']), { status: 200, headers }),
          ),
      )

      await expect(downloadTiffZip('file-id')).resolves.toMatchObject({
        filename: expected,
      })
    },
  )

  it('turns a structured ZIP export error into a client error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 'INVALID_RGB_COMPONENT',
              message: 'Choose a valid RGB component.',
            },
          }),
          { status: 422, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )

    await expect(downloadTiffZip('file-id', 'red')).rejects.toEqual(
      new ApiClientError(
        'INVALID_RGB_COMPONENT',
        'Choose a valid RGB component.',
      ),
    )
  })

  it('rejects a non-ZIP success response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('not zip', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        }),
      ),
    )

    await expect(downloadTiffZip('file-id')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
  })
})
