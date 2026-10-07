from pydantic import BaseModel, ConfigDict, StrictInt, StrictStr


class SelectionExportItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    file_id: StrictStr
    t: StrictInt
    z: StrictInt
    c: StrictInt
    component: StrictStr


class SelectionExportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[SelectionExportItem]
