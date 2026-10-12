import { useMemo } from 'react';
import { formatDayHeading, formatTime } from '../lib/formatters';

/**
 * Groups slots by local calendar day and renders one button per slot.
 *
 * Grouping happens in the viewer's own timezone (via formatDayHeading), not
 * the resource's — a slot that reads as "9:00 PM Tuesday" to the resource's
 * timezone should still be grouped under whichever day it falls on for the
 * person looking at the screen.
 */
export default function SlotPicker({ slots, selected, onSelect }) {
  const groups = useMemo(() => {
    const byDay = new Map();
    for (const slot of slots) {
      const key = formatDayHeading(slot.start);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push(slot);
    }
    return byDay;
  }, [slots]);

  if (slots.length === 0) {
    return <p className="slot-empty">No slots in this range.</p>;
  }

  return (
    <div className="slot-groups">
      {Array.from(groups.entries()).map(([day, daySlots]) => (
        <div key={day} className="slot-group">
          <h4>{day}</h4>
          <div className="slot-grid">
            {daySlots.map((slot) => {
              const isSelected = selected?.start === slot.start;
              const { label, title } = describeSlot(slot);
              return (
                <button
                  key={slot.start}
                  type="button"
                  disabled={!slot.bookable}
                  className={`slot-btn${isSelected ? ' slot-btn-selected' : ''}`}
                  onClick={() => onSelect(slot)}
                  title={title}
                >
                  <span>{formatTime(slot.start)}</span>
                  <span className="slot-remaining">{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// `bookable` collapses three different reasons into one flag — out of
// capacity, already started, or (in principle) a deactivated resource — and
// a slot that's simply in the past isn't actually "Full". Re-derive the real
// reason here so the label matches what's true rather than always saying Full.
function describeSlot(slot) {
  if (slot.bookable) {
    return { label: `${slot.remaining} left`, title: `${slot.remaining} seat(s) left` };
  }
  if (new Date(slot.start).getTime() <= Date.now()) {
    return { label: 'Past', title: 'This time has already passed' };
  }
  return { label: 'Full', title: 'Fully booked' };
}
