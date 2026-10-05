import asyncio
from io import BytesIO
from pathlib import Path
from uuid import uuid4
from zipfile import ZipFile

import httpx
import numpy as np
import pytest
import tifffile
from PIL import Image

from app.core.config import Settings
from app.main import create_app
from app.services.zip_export import stream_archive


def make_app(storage_dir: Path):
    return create_app(
        Settings(
            max_upload_size_bytes=1024 * 1024,
            temp_storage_dir=storage_dir,
            allowed_origins=("http://localhost:5173",),
        )
    )


def make_tiff_bytes(
    array: np.ndarray,
    axes: str,
    *,
    photometric: str = "minisblack",
    planarconfig: str | None = None,
) -> bytes:
    output = BytesIO()
    tifffile.imwrite(
        output,
        array,
        ome=True,
        metadata={"axes": axes},
        photometric=photometric,
        planarconfig=planarconfig,
    )
    return output.getvalue()


def upload_and_get_zip(
    app,
    content: bytes,
    *,
    filename: str = "sample.tif",
    query: str = "",
) -> httpx.Response:
    async def send_request() -> httpx.Response:
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            upload = await client.post(
                "/api/tiff/upload",
                files={"file": (filename, content, "image/tiff")},
            )
            assert upload.status_code == 201
            return await client.get(
                f"/api/tiff/{upload.json()['file_id']}/export/zip{query}"
            )

    return asyncio.run(send_request())


def read_archive(response: httpx.Response) -> tuple[list[str], dict[str, bytes]]:
    with ZipFile(BytesIO(response.content)) as archive:
        names = archive.namelist()
        return names, {name: archive.read(name) for name in names}


def decode_png(content: bytes) -> tuple[str, np.ndarray]:
    with Image.open(BytesIO(content)) as image:
        return image.mode, np.asarray(image).copy()


@pytest.mark.parametrize("dtype", [np.uint8, np.uint16])
def test_exports_every_tzc_plane_with_deterministic_names_and_headers(
    tmp_path: Path,
    dtype: np.typing.DTypeLike,
) -> None:
    array = np.arange(2 * 2 * 3 * 4 * 5, dtype=dtype).reshape(2, 2, 3, 4, 5)
    response = upload_and_get_zip(
        make_app(tmp_path),
        make_tiff_bytes(array, "TZCYX"),
        filename="sample.ome.tif",
    )

    names, entries = read_archive(response)
    expected = [
        f"sample.ome_T{t:03d}_Z{z:03d}_C{c:03d}.png"
        for t in range(2)
        for z in range(2)
        for c in range(3)
    ]
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    assert response.headers["content-disposition"] == (
        'attachment; filename="sample.ome_stack.zip"'
    )
    assert response.headers["cache-control"] == "no-store, private"
    assert response.headers["pragma"] == "no-cache"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert names == expected
    assert len(names) == 2 * 2 * 3
    assert len(names) == len(set(names))
    assert all(
        "/" not in name and "\\" not in name and ".." not in name for name in names
    )
    assert all(decode_png(content)[1].dtype == np.uint8 for content in entries.values())


def test_absent_tzc_axes_each_count_as_one_and_unsafe_names_are_sanitized(
    tmp_path: Path,
) -> None:
    response = upload_and_get_zip(
        make_app(tmp_path),
        make_tiff_bytes(np.arange(20, dtype=np.uint8).reshape(4, 5), "YX"),
        filename=r"../unsafe\bad name.tif",
        query="?component=composite",
    )

    names, _entries = read_archive(response)
    assert names == ["bad_name_T000_Z000_C000.png"]
    assert response.headers["content-disposition"] == (
        'attachment; filename="bad_name_stack.zip"'
    )


def test_omitted_and_explicit_non_rgb_composite_have_the_same_archive_contract(
    tmp_path: Path,
) -> None:
    content = make_tiff_bytes(np.arange(20, dtype=np.uint8).reshape(4, 5), "YX")
    omitted = upload_and_get_zip(make_app(tmp_path / "omitted"), content)
    explicit = upload_and_get_zip(
        make_app(tmp_path / "explicit"),
        content,
        query="?component=composite",
    )

    assert read_archive(omitted) == read_archive(explicit)
    assert (
        omitted.headers["content-disposition"]
        == explicit.headers["content-disposition"]
    )


@pytest.mark.parametrize(
    ("component", "sample", "suffix"),
    [("red", 0, "R"), ("green", 1, "G"), ("blue", 2, "B")],
)
def test_exports_only_requested_rgb_component_as_grayscale(
    tmp_path: Path,
    component: str,
    sample: int,
    suffix: str,
) -> None:
    array = np.zeros((2, 4, 5, 3), dtype=np.uint8)
    array[..., 0] = 10
    array[..., 1] = 20
    array[..., 2] = 30
    response = upload_and_get_zip(
        make_app(tmp_path),
        make_tiff_bytes(
            array,
            "ZYXS",
            photometric="rgb",
            planarconfig="contig",
        ),
        query=f"?component={component}",
    )

    names, entries = read_archive(response)
    assert names == [
        f"sample_T000_Z000_C000_{suffix}.png",
        f"sample_T000_Z001_C000_{suffix}.png",
    ]
    assert f"sample_stack_{suffix}.zip" in response.headers["content-disposition"]
    for content in entries.values():
        mode, pixels = decode_png(content)
        assert mode == "L"
        assert np.all(pixels == (sample + 1) * 10)


@pytest.mark.parametrize(
    ("axes", "shape", "planarconfig"),
    [("YXS", (4, 5, 3), "contig"), ("SYX", (3, 4, 5), "separate")],
)
def test_rgb_sample_axis_does_not_multiply_entry_count(
    tmp_path: Path,
    axes: str,
    shape: tuple[int, ...],
    planarconfig: str,
) -> None:
    array = np.arange(np.prod(shape), dtype=np.uint8).reshape(shape)
    response = upload_and_get_zip(
        make_app(tmp_path),
        make_tiff_bytes(
            array,
            axes,
            photometric="rgb",
            planarconfig=planarconfig,
        ),
    )

    names, entries = read_archive(response)
    assert names == ["sample_T000_Z000_C000_RGB.png"]
    mode, _pixels = decode_png(entries[names[0]])
    assert mode == "RGB"


def test_interleaved_and_planar_rgb_have_equivalent_archive_structures(
    tmp_path: Path,
) -> None:
    interleaved = np.arange(4 * 5 * 3, dtype=np.uint8).reshape(4, 5, 3)
    planar = np.moveaxis(interleaved, -1, 0)
    interleaved_response = upload_and_get_zip(
        make_app(tmp_path / "interleaved"),
        make_tiff_bytes(
            interleaved,
            "YXS",
            photometric="rgb",
            planarconfig="contig",
        ),
        query="?component=blue",
    )
    planar_response = upload_and_get_zip(
        make_app(tmp_path / "planar"),
        make_tiff_bytes(
            planar,
            "SYX",
            photometric="rgb",
            planarconfig="separate",
        ),
        query="?component=blue",
    )

    interleaved_names, interleaved_entries = read_archive(interleaved_response)
    planar_names, planar_entries = read_archive(planar_response)
    assert interleaved_names == planar_names == ["sample_T000_Z000_C000_B.png"]
    np.testing.assert_array_equal(
        decode_png(interleaved_entries[interleaved_names[0]])[1],
        decode_png(planar_entries[planar_names[0]])[1],
    )


def test_c_and_s_axes_remain_independent(tmp_path: Path) -> None:
    array = np.zeros((2, 4, 5, 3), dtype=np.uint8)
    array[0, ..., 1] = 20
    array[1, ..., 1] = 90
    response = upload_and_get_zip(
        make_app(tmp_path),
        make_tiff_bytes(
            array,
            "CYXS",
            photometric="rgb",
            planarconfig="contig",
        ),
        query="?component=green",
    )

    names, entries = read_archive(response)
    assert names == [
        "sample_T000_Z000_C000_G.png",
        "sample_T000_Z000_C001_G.png",
    ]
    assert np.all(decode_png(entries[names[0]])[1] == 20)
    assert np.all(decode_png(entries[names[1]])[1] == 90)


def test_zip_pixels_match_single_png_exports(tmp_path: Path) -> None:
    array = (np.arange(2 * 4 * 5, dtype=np.uint16) * 100).reshape(2, 4, 5)
    app = make_app(tmp_path)

    async def send_requests() -> tuple[httpx.Response, list[httpx.Response]]:
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            upload = await client.post(
                "/api/tiff/upload",
                files={
                    "file": (
                        "sample.tif",
                        make_tiff_bytes(array, "ZYX"),
                        "image/tiff",
                    )
                },
            )
            file_id = upload.json()["file_id"]
            archive = await client.get(f"/api/tiff/{file_id}/export/zip")
            pngs = [
                await client.get(f"/api/tiff/{file_id}/export/png?z={z}")
                for z in range(2)
            ]
            return archive, pngs

    archive_response, png_responses = asyncio.run(send_requests())
    names, entries = read_archive(archive_response)
    for name, png_response in zip(names, png_responses, strict=True):
        assert entries[name] == png_response.content


@pytest.mark.parametrize("component", ["cyan", "red", "green", "blue"])
def test_rejects_unknown_or_non_rgb_components(
    tmp_path: Path,
    component: str,
) -> None:
    response = upload_and_get_zip(
        make_app(tmp_path),
        make_tiff_bytes(np.zeros((4, 5), dtype=np.uint8), "YX"),
        query=f"?component={component}",
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_RGB_COMPONENT"


def test_missing_or_malformed_file_id_returns_file_not_found(tmp_path: Path) -> None:
    app = make_app(tmp_path)

    async def send_requests() -> list[httpx.Response]:
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            return [
                await client.get(f"/api/tiff/{uuid4()}/export/zip"),
                await client.get("/api/tiff/not-a-uuid/export/zip"),
            ]

    for response in asyncio.run(send_requests()):
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "FILE_NOT_FOUND"
        assert str(tmp_path) not in response.text
        assert "Traceback" not in response.text


def test_processing_failure_closes_archive_and_exposes_no_details(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    created_archives: list[BytesIO] = []

    def create_archive(*_args, **_kwargs) -> BytesIO:
        archive = BytesIO()
        created_archives.append(archive)
        return archive

    monkeypatch.setattr(
        "app.services.zip_export.tempfile.SpooledTemporaryFile",
        create_archive,
    )
    monkeypatch.setattr(
        "app.services.zip_export.render_array_plane_png",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("secret path")),
    )
    response = upload_and_get_zip(
        make_app(tmp_path),
        make_tiff_bytes(np.zeros((4, 5), dtype=np.uint8), "YX"),
    )

    assert response.status_code == 500
    assert response.json()["error"]["code"] == "PROCESSING_ERROR"
    assert "secret path" not in response.text
    assert str(tmp_path) not in response.text
    assert created_archives[0].closed
    assert list(tmp_path.glob("*.zip")) == []


def test_successful_response_closes_archive_without_persisting_zip(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    created_archives: list[BytesIO] = []

    def create_archive(*_args, **_kwargs) -> BytesIO:
        archive = BytesIO()
        created_archives.append(archive)
        return archive

    monkeypatch.setattr(
        "app.services.zip_export.tempfile.SpooledTemporaryFile",
        create_archive,
    )
    response = upload_and_get_zip(
        make_app(tmp_path),
        make_tiff_bytes(np.zeros((4, 5), dtype=np.uint8), "YX"),
    )

    assert response.status_code == 200
    assert created_archives[0].closed
    assert list(tmp_path.glob("*.zip")) == []


def test_stream_closes_temporary_archive_when_consumer_stops() -> None:
    archive = BytesIO(b"x" * (1024 * 1024 + 1))
    stream = stream_archive(archive)

    assert next(stream)
    stream.close()

    assert archive.closed
