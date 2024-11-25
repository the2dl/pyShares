import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Download,
  PlayCircle,
  RefreshCw,
  Settings,
  Share2,
  AlertTriangle,
  FileWarning,
  Shield,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';

const actions = [
  {
    icon: PlayCircle,
    label: 'Start Scan',
    description: 'Run a new scan on all shares',
    onClick: () => {},
    color: 'text-green-500',
  },
  {
    icon: Shield,
    label: 'Security Check',
    description: 'Run security assessment',
    onClick: () => {},
    color: 'text-blue-500',
  },
  {
    icon: FileWarning,
    label: 'Risk Analysis',
    description: 'View risk report',
    onClick: () => {},
    color: 'text-yellow-500',
  },
  {
    icon: AlertTriangle,
    label: 'Alerts',
    description: 'View active alerts',
    onClick: () => {},
    color: 'text-red-500',
  },
  {
    icon: Download,
    label: 'Export',
    description: 'Download scan results',
    onClick: () => {},
    color: 'text-purple-500',
  },
  {
    icon: RefreshCw,
    label: 'Refresh',
    description: 'Update dashboard data',
    onClick: () => {},
    color: 'text-teal-500',
  },
  {
    icon: Settings,
    label: 'Settings',
    description: 'Configure scan options',
    onClick: () => {},
    color: 'text-gray-500',
  },
  {
    icon: Share2,
    label: 'Share',
    description: 'Share dashboard results',
    onClick: () => {},
    color: 'text-indigo-500',
  },
];

export function QuickActions() {
  const { toast } = useToast();

  const handleAction = (action: typeof actions[0]) => {
    toast({
      title: action.label,
      description: `${action.description} - Coming soon!`,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
        <CardDescription>Common tasks and operations</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          <TooltipProvider>
            {actions.map((action) => (
              <Tooltip key={action.label}>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-12 w-full"
                    onClick={() => handleAction(action)}
                  >
                    <action.icon className={`h-5 w-5 ${action.color}`} />
                    <span className="sr-only">{action.label}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="font-medium">{action.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {action.description}
                  </p>
                </TooltipContent>
              </Tooltip>
            ))}
          </TooltipProvider>
        </div>
      </CardContent>
    </Card>
  );
}