import { formatStatus } from '../lib/formatters';

const TONE_BY_STATUS = {
  pending: 'warn',
  confirmed: 'good',
  completed: 'neutral',
  cancelled: 'bad',
  expired: 'bad',
};

export default function StatusBadge({ status }) {
  const tone = TONE_BY_STATUS[status] || 'neutral';
  return <span className={`badge badge-${tone}`}>{formatStatus(status)}</span>;
}
