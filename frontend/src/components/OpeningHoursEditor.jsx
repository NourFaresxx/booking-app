const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DEFAULT_ROW = { dayOfWeek: 1, start: '09:00', end: '17:00' };

/**
 * Controlled editor for a resource's recurring weekly opening hours.
 *
 * An empty array has a specific meaning on the backend — "bookable any
 * time" — so this is modeled as a toggle (any time vs. a specific weekly
 * schedule) rather than just "a list that happens to be empty", which would
 * be easy to land in by accident while editing rows.
 */
export default function OpeningHoursEditor({ value, onChange }) {
  const hasSchedule = value.length > 0;

  function updateRow(index, patch) {
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index) {
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <div className="hours-editor">
      <label className="hours-toggle">
        <input
          type="checkbox"
          checked={hasSchedule}
          onChange={(e) => onChange(e.target.checked ? [{ ...DEFAULT_ROW }] : [])}
        />
        Specific opening hours (unchecked = bookable any time)
      </label>

      {hasSchedule && (
        <div className="hours-rows">
          {value.map((row, index) => (
            <div className="hours-row" key={index}>
              <select
                value={row.dayOfWeek}
                onChange={(e) => updateRow(index, { dayOfWeek: Number(e.target.value) })}
              >
                {DAYS.map((day, dayIndex) => (
                  <option key={day} value={dayIndex}>
                    {day}
                  </option>
                ))}
              </select>
              <input
                type="time"
                value={row.start}
                onChange={(e) => updateRow(index, { start: e.target.value })}
              />
              <span className="hours-row-sep">to</span>
              <input
                type="time"
                value={row.end}
                onChange={(e) => updateRow(index, { end: e.target.value })}
              />
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={() => removeRow(index)}
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={() => onChange([...value, { ...DEFAULT_ROW }])}
          >
            + Add window
          </button>
        </div>
      )}
    </div>
  );
}
