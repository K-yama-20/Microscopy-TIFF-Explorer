import asyncio
import csv
from dataclasses import replace
from io import BytesIO, StringIO
from pathlib import Path
from uuid import UUID, uuid4
from zipfile import ZipFile

import httpx
import numpy as np
import pytest
import tifffile
from PIL import Image

from app.core.config import Settings
from app.main import create_app
from app.services.selection_export import MAX_SELECTION_SOURCE_BYTES
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


async def upload(
    client: httpx.AsyncClient,
    content: bytes,
    filename: str = "sample.tif",
) -> str:
    response = await client.post(
        "/api/tiff/upload",
        files={"file": (filename, content, "image/tiff")},
    )
    assert response.status_code == 201
    return response.json()["file_id"]


def send_selection(app, items: list[dict]) -> httpx.Response:
    async def send() -> httpx.Response:
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            return await client.post("/api/exports/selection", json={"items": items})

    return asyncio.run(send())


def upload_many_and_send(
    app,
    sources: list[tuple[str, bytes]],
    build_items,
) -> tuple[httpx.Response, list[str]]:
    async def send() -> tuple[httpx.Response, list[str]]:
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            file_ids = [
                await upload(client, content, filename) for filename, content in sources
            ]
            response = await client.post(
                "/api/exports/selection",
                json={"items": build_items(file_ids)},
            )
            return response, file_ids

    return asyncio.run(send())


def item(
    file_id: str,
    *,
    t: int = 0,
    z: int = 0,
    c: int = 0,
    component: str = "composite",
) -> dict:
    return {
        "file_id": file_id,
        "t": t,
        "z": z,
        "c": c,
        "component": component,
    }


def read_archive(response: httpx.Response) -> tuple[list[str], dict[str, bytes]]:
    with ZipFile(BytesIO(response.content)) as archive:
        names = archive.namelist()
        return names, {name: archive.read(name) for name in names}


def decode_png(content: bytes) -> tuple[str, np.ndarray]:
    with Image.open(BytesIO(content)) as image:
        return image.mode, np.asarray(image).copy()


def test_exports_multiple_selections_with_manifest_and_download_headers(
    tmp_path: Path,
) -> None:
    array = (np.arange(3 * 5 * 7, dtype=np.uint16) * 100).reshape(3, 5, 7)
    response, _ = upload_many_and_send(
        make_app(tmp_path),
        [("sample-a.ome.tif", make_tiff_bytes(array, "ZYX"))],
        lambda ids: [item(ids[0], z=2), item(ids[0], z=0)],
    )

    names, entries = read_archive(response)
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    assert response.headers["content-disposition"] == (
        'attachment; filename="microscopy-selection.zip"'
    )
    assert response.headers["content-length"] == str(len(response.content))
    assert names == [
        "01_sample-a.ome/sample-a.ome_T000_Z002_C000.png",
        "01_sample-a.ome/sample-a.ome_T000_Z000_C000.png",
        "manifest.csv",
    ]
    rows = list(csv.DictReader(StringIO(entries["manifest.csv"].decode())))
    assert [row["z"] for row in rows] == ["2", "0"]
    assert [row["archive_path"] for row in rows] == names[:2]
    assert all(row["source_filename"] == "sample-a.ome.tif" for row in rows)
    assert all("file_id" not in row for row in rows)
    assert str(tmp_path).encode() not in entries["manifest.csv"]


def test_accepts_multiple_files_and_numbers_folders_by_first_appearance(
    tmp_path: Path,
) -> None:
    source = make_tiff_bytes(
        np.arange(2 * 4 * 5, dtype=np.uint8).reshape(2, 4, 5), "ZYX"
    )
    response, _ = upload_many_and_send(
        make_app(tmp_path),
        [("same name.tif", source), ("same name.tif", source)],
        lambda ids: [item(ids[1], z=0), item(ids[0], z=0), item(ids[1], z=1)],
    )

    names, entries = read_archive(response)
    assert names[:-1] == [
        "01_same_name/same_name_T000_Z000_C000.png",
        "02_same_name/same_name_T000_Z000_C000.png",
        "01_same_name/same_name_T000_Z001_C000.png",
    ]
    rows = list(csv.DictReader(StringIO(entries["manifest.csv"].decode())))
    assert [row["archive_path"] for row in rows] == names[:-1]


@pytest.mark.parametrize(
    ("payload", "code"),
    [
        ([], "EMPTY_SELECTION"),
        ([item("not-a-uuid")], "FILE_NOT_FOUND"),
        ([item(str(uuid4()))], "FILE_NOT_FOUND"),
    ],
)
def test_rejects_empty_malformed_and_missing_sources(
    tmp_path: Path,
    payload: list[dict],
    code: str,
) -> None:
    response = send_selection(make_app(tmp_path), payload)

    assert response.status_code in {404, 422}
    assert response.json()["error"]["code"] == code
    assert str(tmp_path) not in response.text
    assert "Traceback" not in response.text


def test_rejects_exact_and_canonically_equivalent_duplicates(tmp_path: Path) -> None:
    file_id = str(uuid4())
    exact = send_selection(make_app(tmp_path / "exact"), [item(file_id), item(file_id)])
    canonical = send_selection(
        make_app(tmp_path / "canonical"),
        [item(file_id), item(file_id.replace("-", ""))],
    )

    for response in (exact, canonical):
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "DUPLICATE_SELECTION"


def test_rejects_item_and_distinct_file_limits(tmp_path: Path) -> None:
    file_id = str(uuid4())
    too_many_items = [item(file_id, z=index) for index in range(51)]
    too_many_files = [item(str(uuid4())) for _ in range(4)]

    for index, payload in enumerate((too_many_items, too_many_files)):
        response = send_selection(make_app(tmp_path / str(index)), payload)
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "BATCH_LIMIT_EXCEEDED"


def test_rejects_combined_recorded_source_size_limit(tmp_path: Path) -> None:
    app = make_app(tmp_path)
    source = make_tiff_bytes(np.zeros((4, 5), dtype=np.uint8), "YX")

    async def prepare() -> list[str]:
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as client:
            return [
                await upload(client, source, f"source-{index}.tif")
                for index in range(2)
            ]

    file_ids = asyncio.run(prepare())
    manager = app.state.temporary_file_manager
    for file_id in file_ids:
        parsed = UUID(file_id)
        manager._uploads[parsed] = replace(  # noqa: SLF001
            manager._uploads[parsed],  # noqa: SLF001
            size_bytes=MAX_SELECTION_SOURCE_BYTES // 2 + 1,
        )

    response = send_selection(app, [item(file_id) for file_id in file_ids])

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "BATCH_LIMIT_EXCEEDED"
    assert manager._active_uses == {}  # noqa: SLF001


@pytest.mark.parametrize(
    ("selection", "code"),
    [
        ({"t": 1}, "INVALID_DIMENSION_INDEX"),
        ({"z": -1}, "INVALID_DIMENSION_INDEX"),
        ({"c": 1}, "INVALID_DIMENSION_INDEX"),
        ({"component": "cyan"}, "INVALID_RGB_COMPONENT"),
        ({"component": "red"}, "INVALID_RGB_COMPONENT"),
    ],
)
def test_invalid_item_fails_the_whole_request_without_partial_zip(
    tmp_path: Path,
    selection: dict,
    code: str,
) -> None:
    response, _ = upload_many_and_send(
        make_app(tmp_path),
        [("sample.tif", make_tiff_bytes(np.zeros((4, 5), dtype=np.uint8), "YX"))],
        lambda ids: [item(ids[0]), item(ids[0], **selection)],
    )

    assert response.status_code == 422
    assert response.headers["content-type"].startswith("application/json")
    assert response.json()["error"]["code"] == code


@pytest.mark.parametrize("dtype", [np.uint8, np.uint16])
def test_grayscale_pixels_match_existing_png_export(
    tmp_path: Path,
    dtype: np.typing.DTypeLike,
) -> None:
    app = make_app(tmp_path)
    array = np.arange(4 * 5, dtype=dtype).reshape(4, 5)

    async def send() -> tuple[httpx.Response, httpx.Response]:
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as client:
            file_id = await upload(client, make_tiff_bytes(array, "YX"))
            archive = await client.post(
                "/api/exports/selection", json={"items": [item(file_id)]}
            )
            png = await client.get(f"/api/tiff/{file_id}/export/png")
            return archive, png

    archive, png = asyncio.run(send())
    names, entries = read_archive(archive)
    assert entries[names[0]] == png.content
    assert decode_png(entries[names[0]])[1].dtype == np.uint8


@pytest.mark.parametrize(
    ("component", "mode", "expected"),
    [
        ("composite", "RGB", None),
        ("red", "L", 10),
        ("green", "L", 20),
        ("blue", "L", 30),
    ],
)
def test_rgb_components_and_microscopy_channels_remain_independent(
    tmp_path: Path,
    component: str,
    mode: str,
    expected: int | None,
) -> None:
    array = np.zeros((2, 4, 5, 3), dtype=np.uint8)
    array[0, ..., 0], array[0, ..., 1], array[0, ..., 2] = 1, 2, 3
    array[1, ..., 0], array[1, ..., 1], array[1, ..., 2] = 10, 20, 30
    response, _ = upload_many_and_send(
        make_app(tmp_path),
        [
            (
                "rgb.tif",
                make_tiff_bytes(
                    array, "CYXS", photometric="rgb", planarconfig="contig"
                ),
            )
        ],
        lambda ids: [item(ids[0], c=1, component=component)],
    )

    names, entries = read_archive(response)
    decoded_mode, pixels = decode_png(entries[names[0]])
    assert decoded_mode == mode
    if expected is not None:
        assert np.all(pixels == expected)
    else:
        np.testing.assert_array_equal(pixels[0, 0], np.array([10, 20, 30]))


def test_manifest_escapes_csv_and_prevents_formula_injection(tmp_path: Path) -> None:
    filename = "+SUM(1,2).tif"
    response, _ = upload_many_and_send(
        make_app(tmp_path),
        [(filename, make_tiff_bytes(np.zeros((4, 5), dtype=np.uint8), "YX"))],
        lambda ids: [item(ids[0])],
    )

    names, entries = read_archive(response)
    assert names[0].startswith("01_SUM_1_2/")
    manifest = entries["manifest.csv"].decode()
    assert '"\'+SUM(1,2).tif"' in manifest
    row = next(csv.DictReader(StringIO(manifest)))
    assert row["source_filename"] == "'+SUM(1,2).tif"


def test_each_source_primary_series_is_loaded_once(tmp_path: Path, monkeypatch) -> None:
    app = make_app(tmp_path)
    source = make_tiff_bytes(np.zeros((2, 4, 5), dtype=np.uint8), "ZYX")
    real_tiff_file = tifffile.TiffFile
    opened: list[Path] = []

    async def prepare() -> list[str]:
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as client:
            return [
                await upload(client, source, f"source-{index}.tif")
                for index in range(2)
            ]

    file_ids = asyncio.run(prepare())

    def counting_tiff_file(path):
        opened.append(Path(path))
        return real_tiff_file(path)

    monkeypatch.setattr(
        "app.services.selection_export.tifffile.TiffFile", counting_tiff_file
    )
    response = send_selection(
        app,
        [item(file_ids[0], z=0), item(file_ids[1], z=1), item(file_ids[0], z=1)],
    )

    assert response.status_code == 200
    assert len(opened) == 2
    assert len(set(opened)) == 2


def test_success_failure_and_interruption_close_spools_and_release_leases(
    tmp_path: Path,
    monkeypatch,
) -> None:
    created: list[BytesIO] = []

    def create_archive(*_args, **_kwargs):
        archive = BytesIO()
        created.append(archive)
        return archive

    monkeypatch.setattr(
        "app.services.selection_export.tempfile.SpooledTemporaryFile", create_archive
    )
    app = make_app(tmp_path)
    source = make_tiff_bytes(np.zeros((4, 5), dtype=np.uint8), "YX")
    success, file_ids = upload_many_and_send(
        app,
        [("sample.tif", source)],
        lambda ids: [item(ids[0])],
    )
    assert success.status_code == 200
    assert created[-1].closed
    assert app.state.temporary_file_manager._active_uses == {}  # noqa: SLF001

    failure = send_selection(app, [item(file_ids[0], z=1)])
    assert failure.status_code == 422
    assert created[-1].closed
    assert app.state.temporary_file_manager._active_uses == {}  # noqa: SLF001

    archive = BytesIO(b"x" * (1024 * 1024 + 1))
    stream = stream_archive(archive)
    assert next(stream)
    stream.close()
    assert archive.closed


def test_unexpected_processing_failure_closes_spool_and_exposes_no_details(
    tmp_path: Path,
    monkeypatch,
) -> None:
    created: list[BytesIO] = []

    def create_archive(*_args, **_kwargs):
        archive = BytesIO()
        created.append(archive)
        return archive

    monkeypatch.setattr(
        "app.services.selection_export.tempfile.SpooledTemporaryFile", create_archive
    )
    monkeypatch.setattr(
        "app.services.selection_export.render_array_plane_png",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            RuntimeError(f"secret path: {tmp_path}")
        ),
    )
    app = make_app(tmp_path)
    source = make_tiff_bytes(np.zeros((4, 5), dtype=np.uint8), "YX")
    response, _ = upload_many_and_send(
        app,
        [("sample.tif", source)],
        lambda ids: [item(ids[0])],
    )

    assert response.status_code == 500
    assert response.json()["error"]["code"] == "PROCESSING_ERROR"
    assert str(tmp_path) not in response.text
    assert "RuntimeError" not in response.text
    assert created[0].closed
    assert app.state.temporary_file_manager._active_uses == {}  # noqa: SLF001


def test_removed_source_is_rejected_and_no_archive_is_returned(tmp_path: Path) -> None:
    app = make_app(tmp_path)
    source = make_tiff_bytes(np.zeros((4, 5), dtype=np.uint8), "YX")

    async def prepare() -> str:
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as client:
            return await upload(client, source)

    file_id = asyncio.run(prepare())
    app.state.temporary_file_manager.remove(UUID(file_id))
    response = send_selection(app, [item(file_id)])

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "FILE_NOT_FOUND"
    assert list(tmp_path.glob("*.zip")) == []
