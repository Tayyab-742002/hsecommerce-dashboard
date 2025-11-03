import { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

interface KPICardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: string;
    isPositive: boolean;
  };
}

export const KPICard = ({ title, value, icon: Icon, trend }: KPICardProps) => {
  return (
    <Card className="kpi-card">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <h3 className="text-3xl font-bold mt-2">{value}</h3>
          {trend && (
            <p className={`text-xs mt-2 ${trend.isPositive ? 'text-success' : 'text-destructive'}`}>
              {trend.value}
            </p>
          )}
        </div>
        <div className="p-3 bg-primary/10 rounded-lg">
          <Icon className="h-6 w-6 text-primary" />
        </div>
      </div>
    </Card>
  );
};
