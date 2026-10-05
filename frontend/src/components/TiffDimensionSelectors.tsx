import type { ChangeEvent } from 'react'

import type { TiffMetadata } from '../types/api'
import {
  createDimensionIndices,
  toValidDimensionIndex,
} from '../utils/dimensionSelection'

interface TiffDimensionSelectorsProps {
  metadata: TiffMetadata
  selectedT: number
  selectedZ: number
  selectedC: number
  onSelectedTChange: (value: number) => void
  onSelectedZChange: (value: number) => void
  onSelectedCChange: (value: number) => void
}

interface DimensionSelectProps {
  id: string
  label: string
  count: number
  value: number
  onChange: (value: number) => void
}

function DimensionSelect({
  id,
  label,
  count,
  value,
  onChange,
}: DimensionSelectProps) {
  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onChange(toValidDimensionIndex(event.target.value, count))
  }

  return (
    <div className="dimension-control">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={handleChange}>
        {createDimensionIndices(count).map((index) => (
          <option key={index} value={index}>
            {index}
          </option>
        ))}
      </select>
    </div>
  )
}

export function TiffDimensionSelectors({
  metadata,
  selectedT,
  selectedZ,
  selectedC,
  onSelectedTChange,
  onSelectedZChange,
  onSelectedCChange,
}: TiffDimensionSelectorsProps) {
  const hasTime = metadata.axes.includes('T')
  const hasZ = metadata.axes.includes('Z')
  const hasChannel = metadata.axes.includes('C')

  if (!hasTime && !hasZ && !hasChannel) {
    return null
  }

  return (
    <fieldset className="dimension-selectors">
      <legend>Microscopy dimensions</legend>
      <p className="selector-help">
        Choose the time point, Z slice, and acquisition channel (C).
      </p>
      <div className="dimension-selectors__controls">
        {hasTime && (
          <DimensionSelect
            id="time-selector"
            label="Time"
            count={metadata.time_points}
            value={selectedT}
            onChange={onSelectedTChange}
          />
        )}
        {hasZ && (
          <DimensionSelect
            id="z-selector"
            label="Z"
            count={metadata.z_slices}
            value={selectedZ}
            onChange={onSelectedZChange}
          />
        )}
        {hasChannel && (
          <DimensionSelect
            id="channel-selector"
            label="Channel"
            count={metadata.channels}
            value={selectedC}
            onChange={onSelectedCChange}
          />
        )}
      </div>
    </fieldset>
  )
}
