import type { ChangeEvent } from 'react'

import type { RgbComponent } from '../types/api'

interface TiffColorComponentSelectorProps {
  value: RgbComponent
  onChange: (value: RgbComponent) => void
}

const COMPONENT_OPTIONS: { value: RgbComponent; label: string }[] = [
  { value: 'composite', label: 'RGB composite' },
  { value: 'red', label: 'Red' },
  { value: 'green', label: 'Green' },
  { value: 'blue', label: 'Blue' },
]

const COMPONENT_HELP_ID = 'color-component-help'

export function TiffColorComponentSelector({
  value,
  onChange,
}: TiffColorComponentSelectorProps) {
  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onChange(event.target.value as RgbComponent)
  }

  return (
    <div className="color-component-selector">
      <label htmlFor="color-component-selector">Color component</label>
      <p id={COMPONENT_HELP_ID}>
        RGB samples are grouped colors within each image plane. They are
        independent of the microscopy Channel selector above.
      </p>
      <select
        id="color-component-selector"
        value={value}
        aria-describedby={COMPONENT_HELP_ID}
        onChange={handleChange}
      >
        {COMPONENT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}
