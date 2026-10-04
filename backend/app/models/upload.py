from pydantic import BaseModel


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


class UploadResponse(BaseModel):
    file_id: str
    filename: str
    metadata: TiffMetadata
