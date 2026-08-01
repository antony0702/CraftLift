import { useTranslation } from 'react-i18next'
import type { PropertyField } from '@shared/properties'
import type { ServerProperties } from '@shared/types'
import { Field } from './Ui'

/**
 * The server.properties fields.
 *
 * The create wizard and the settings tab share this rendering, not just the
 * field table. Written separately, the layout, the wording and the direction
 * of the tickboxes would drift apart, and the user would find that what they
 * filled in when creating is not the same thing they see afterwards.
 */
export default function PropertyFields({
  fields,
  values,
  onChange
}: {
  fields: PropertyField[]
  values: ServerProperties
  onChange: (key: string, value: string) => void
}): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <>
      {fields.map((field) => {
        const value = values[field.key] ?? ''
        const label = t(`props.fields.${field.key}.label`)
        const hint = t(`props.fields.${field.key}.hint`)

        if (field.kind === 'bool') {
          // For negated fields the tick is the opposite of the stored value:
          // ticking it turns the setting off
          const on = value === 'true'
          const checked = field.negate ? !on : on
          return (
            <label className="checkbox" key={field.key}>
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(field.key, String(field.negate ? !e.target.checked : e.target.checked))}
              />
              <span>
                {label} <span className="muted small">— {hint}</span>
              </span>
            </label>
          )
        }

        return (
          <Field key={field.key} label={label} hint={hint}>
            {field.kind === 'select' ? (
              <select value={value} onChange={(e) => onChange(field.key, e.target.value)}>
                {field.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {t(`props.values.${opt}`, opt)}
                  </option>
                ))}
              </select>
            ) : field.kind === 'number' ? (
              <input
                type="number"
                min={field.min}
                max={field.max}
                value={value}
                onChange={(e) => onChange(field.key, e.target.value)}
              />
            ) : (
              <input type="text" value={value} onChange={(e) => onChange(field.key, e.target.value)} />
            )}
          </Field>
        )
      })}
    </>
  )
}
