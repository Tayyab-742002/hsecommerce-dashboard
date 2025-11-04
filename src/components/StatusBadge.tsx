import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export const StatusBadge = ({ status, className }: StatusBadgeProps) => {
  const getStatusClass = (status: string) => {
    const lowerStatus = status.toLowerCase();

    // Exact pills for requested statuses
    if (lowerStatus.includes('pending')) return 'status-pending';
    if (lowerStatus.includes('processing') || lowerStatus.includes('in_process')) return 'status-processing';
    if (lowerStatus.includes('ready')) return 'status-ready';
    if (lowerStatus.includes('in transit') || lowerStatus.includes('in_transit') || lowerStatus.includes('transit')) return 'status-in-transit';
    if (lowerStatus.includes('completed') || lowerStatus.includes('delivered')) return 'status-completed';
    if (lowerStatus.includes('cancelled')) return 'status-cancelled';

    // Fallbacks to previous generic styles
    if (lowerStatus.includes('approved') || lowerStatus.includes('active')) return 'status-approved';
    if (lowerStatus.includes('progress') || lowerStatus.includes('picking') || lowerStatus.includes('packed')) return 'status-in-progress';

    return 'status-pending';
  };

  return (
    <span className={cn('status-badge', getStatusClass(status), className)}>
      {status}
    </span>
  );
};
