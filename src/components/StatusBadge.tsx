import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export const StatusBadge = ({ status, className }: StatusBadgeProps) => {
  const getStatusClass = (status: string) => {
    const lowerStatus = status.toLowerCase();
    
    if (lowerStatus.includes('pending') || lowerStatus.includes('draft')) {
      return 'status-pending';
    }
    if (lowerStatus.includes('approved') || lowerStatus.includes('completed') || 
        lowerStatus.includes('delivered') || lowerStatus.includes('active')) {
      return 'status-approved';
    }
    if (lowerStatus.includes('progress') || lowerStatus.includes('picking') || 
        lowerStatus.includes('packed') || lowerStatus.includes('transit')) {
      return 'status-in-progress';
    }
    if (lowerStatus.includes('cancelled') || lowerStatus.includes('inactive') || 
        lowerStatus.includes('suspended')) {
      return 'status-cancelled';
    }
    
    return 'status-pending';
  };

  return (
    <span className={cn('status-badge', getStatusClass(status), className)}>
      {status}
    </span>
  );
};
