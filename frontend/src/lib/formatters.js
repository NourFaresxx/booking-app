/** Formats an integer cents amount as a localized currency string. */
export function formatMoney(cents, currency = 'usd') {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format((cents ?? 0) / 100);
}

/** e.g. "Mon, Nov 3, 09:00 AM" in the viewer's local timezone. */
export function formatDateTime(isoString) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(isoString));
}

/** e.g. "09:00 AM" — used once the day is already shown as a group heading. */
export function formatTime(isoString) {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(
    new Date(isoString)
  );
}

/** e.g. "Monday, November 3" — a day-grouping heading in the viewer's zone. */
export function formatDayHeading(isoString) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date(isoString));
}

const STATUS_LABELS = {
  pending: 'Payment pending',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  completed: 'Completed',
  expired: 'Expired',
};

export function formatStatus(status) {
  return STATUS_LABELS[status] || status;
}
