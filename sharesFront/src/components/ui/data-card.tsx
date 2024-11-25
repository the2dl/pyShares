import { cn } from '@/lib/utils';

interface DataCardProps {
  title: string;
  value: string | number;
  icon?: React.ReactNode;
  onClick?: () => void;
}

export function DataCard({ title, value, icon, onClick }: DataCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-4 text-card-foreground shadow-sm transition-colors',
        onClick && 'cursor-pointer hover:bg-accent'
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between space-x-4">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        {icon}
      </div>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}