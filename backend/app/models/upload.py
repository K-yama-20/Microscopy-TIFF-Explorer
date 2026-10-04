from pydantic import BaseModel, Field


class TiffMetadata(BaseModel):
    shape: list[int]
    axes: str
    dtype: str
    width: int
    height: int
    time_points: int
    z_slices: int
    channels: int
    series_count: int
    is_rgb: bool = False
    sample_count: int = 1
    rgb_components: list[str] = Field(default_factory=list)


class UploadResponse(BaseModel):
    file_id: str
    filename: str
    metadata: TiffMetadata
