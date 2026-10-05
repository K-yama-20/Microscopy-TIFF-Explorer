from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import tifffile
from PIL import Image, ImageDraw

HEIGHT = 192
WIDTH = 256


def labeled_plane(label: str, seed: int = 0) -> np.ndarray:
    """Create a high-contrast uint8 plane whose selection is easy to identify."""
    y, x = np.indices((HEIGHT, WIDTH), dtype=np.uint16)
    checker = ((x // 24 + y // 24 + seed) % 2) * 42
    stripes = ((x + seed * 19) % (36 + seed % 4 * 4)) * 3
    plane = (x * 3 + y * 2 + checker + stripes + seed * 29) % 256
    image = Image.fromarray(plane.astype(np.uint8), mode="L")
    draw = ImageDraw.Draw(image)
    draw.rectangle((7, 7, 128, 32), fill=0, outline=255, width=2)
    draw.text((13, 14), label, fill=255)
    draw.rectangle(
        (WIDTH - 55, HEIGHT - 55, WIDTH - 12, HEIGHT - 12), outline=255, width=4
    )
    return np.asarray(image).copy()


def labeled_uint16_plane(label: str, seed: int = 0) -> np.ndarray:
    plane = labeled_plane(label, seed).astype(np.uint16) * 257
    y, x = np.indices((HEIGHT, WIDTH), dtype=np.uint32)
    detail = ((x * (seed + 3) + y * (seed + 5)) % 257).astype(np.uint16)
    return np.clip(plane.astype(np.uint32) + detail, 0, 65535).astype(np.uint16)


def rgb_plane(label: str, seed: int = 0, *, dtype: np.dtype = np.uint8) -> np.ndarray:
    y, x = np.indices((HEIGHT, WIDTH), dtype=np.uint32)
    red = (x + seed * 37) % 256
    green = (y * 2 + seed * 53) % 256
    blue = (((x // 20 + y // 20 + seed) % 2) * 190 + 30) % 256
    rgb = np.stack((red, green, blue), axis=-1).astype(np.uint8)

    image = Image.fromarray(rgb, mode="RGB")
    draw = ImageDraw.Draw(image)
    draw.rectangle((7, 7, 148, 32), fill=(0, 0, 0), outline=(255, 255, 255), width=2)
    draw.text((13, 14), label, fill=(255, 255, 255))
    draw.rectangle(
        (WIDTH - 55, HEIGHT - 55, WIDTH - 12, HEIGHT - 12),
        outline=(255, 255, 255),
        width=4,
    )
    result = np.asarray(image).copy()

    if dtype == np.dtype(np.uint16):
        scales = np.array((180, 240, 257), dtype=np.uint16)
        return result.astype(np.uint16) * scales
    return result


def write_gray(
    path: Path,
    array: np.ndarray,
    axes: str,
    *,
    compression: str | None = None,
) -> None:
    tifffile.imwrite(
        path,
        array,
        ome=True,
        metadata={"axes": axes},
        photometric="minisblack",
        compression=compression,
    )


def write_rgb(
    path: Path,
    array: np.ndarray,
    axes: str,
    *,
    planarconfig: str,
) -> None:
    tifffile.imwrite(
        path,
        array,
        ome=True,
        metadata={"axes": axes},
        photometric="rgb",
        planarconfig=planarconfig,
    )


def generate(output_dir: Path) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    generated: list[Path] = []

    def output(name: str) -> Path:
        path = output_dir / name
        generated.append(path)
        return path

    write_gray(
        output("01_grayscale_uint8_yx.tif"),
        labeled_plane("uint8 YX", 1),
        "YX",
    )

    z_stack = np.stack([labeled_uint16_plane(f"uint16 Z{z}", 10 + z) for z in range(4)])
    write_gray(output("02_zstack_uint16_zyx.ome.tif"), z_stack, "ZYX")

    channels = np.stack([labeled_plane(f"Channel C{c}", 20 + c * 3) for c in range(3)])
    write_gray(output("03_channels_uint8_cyx.ome.tif"), channels, "CYX")

    full = np.empty((2, 3, 2, HEIGHT, WIDTH), dtype=np.uint16)
    for t in range(2):
        for z in range(3):
            for c in range(2):
                seed = 30 + t * 12 + z * 3 + c
                full[t, z, c] = labeled_uint16_plane(f"T{t} Z{z} C{c}", seed)
    write_gray(output("04_full_uint16_tzcyx.ome.tif"), full, "TZCYX")

    interleaved = rgb_plane("RGB YXS", 50)
    write_rgb(
        output("05_rgb_uint8_yxs_interleaved.ome.tif"),
        interleaved,
        "YXS",
        planarconfig="contig",
    )

    planar = np.moveaxis(
        rgb_plane("RGB SYX uint16", 60, dtype=np.dtype(np.uint16)), -1, 0
    )
    write_rgb(
        output("06_rgb_uint16_syx_planar.ome.tif"),
        planar,
        "SYX",
        planarconfig="separate",
    )

    channel_rgb = np.stack(
        [rgb_plane(f"Microscope C{c} + RGB", 70 + c * 11) for c in range(2)]
    )
    write_rgb(
        output("07_channels_rgb_uint8_cyxs.ome.tif"),
        channel_rgb,
        "CYXS",
        planarconfig="contig",
    )

    write_gray(
        output("08_constant_uint16_yx.tiff"),
        np.full((HEIGHT, WIDTH), 12345, dtype=np.uint16),
        "YX",
    )

    write_gray(
        output("09_lzw_uint8_yx.tif"),
        labeled_plane("LZW uint8", 80),
        "YX",
        compression="lzw",
    )

    write_gray(
        output("90_unsupported_float32_yx.tif"),
        labeled_plane("float32 error", 90).astype(np.float32) / 255,
        "YX",
    )

    write_rgb(
        output("91_unsupported_rgba_uint8_yxs.tif"),
        np.concatenate(
            (
                rgb_plane("RGBA error", 91),
                np.full((HEIGHT, WIDTH, 1), 255, dtype=np.uint8),
            ),
            axis=-1,
        ),
        "YXS",
        planarconfig="contig",
    )

    return generated


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate small TIFF files for manual browser verification."
    )
    parser.add_argument(
        "output_dir",
        nargs="?",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "manual-test-data",
    )
    args = parser.parse_args()

    for path in generate(args.output_dir.resolve()):
        print(path)


if __name__ == "__main__":
    main()
