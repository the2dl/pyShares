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
import { useState, useEffect, useContext } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { startScan, pollScanStatus } from '@/lib/scan-api';
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { postActivity } from '@/lib/api';
import { atom, useAtom } from 'jotai';
import { Play, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

interface QuickActionsProps {
  onActionComplete?: () => void;
}

// Define global atoms for scan state
export const activeScanAtom = atom<string | null>(null);
export const scanStatusAtom = atom<{
  status: 'running' | 'completed' | 'failed';
  progress?: {
    total_hosts?: number;
    processed_hosts?: number;
    current_host?: string;
  };
  error?: string;
} | null>(null);

export function QuickActions({ onActionComplete }: QuickActionsProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeScanId, setActiveScanId] = useAtom(activeScanAtom);
  const [scanStatus, setScanStatus] = useAtom(scanStatusAtom);
  const [minimizedScans, setMinimizedScans] = useState<{[key: string]: boolean}>({});
  const { toast } = useToast();
  const [credentials, setCredentials] = useState({
    dc: '',
    domain: '',
    username: '',
    password: '',
  });

  const actions = [
    {
      label: 'Start Scan',
      description: 'Start a new network scan',
      icon: Play,
      color: 'text-green-500',
      onClick: () => setIsDialogOpen(true),
      disabled: false,
    },
    {
      label: 'Schedule Scan',
      description: 'Schedule a future scan',
      icon: Calendar,
      color: 'text-blue-500',
      onClick: () => {},
      disabled: true, // Disabled
    },
    {
      label: 'Export Data',
      description: 'Export scan results',
      icon: Download,
      color: 'text-yellow-500',
      onClick: () => {},
      disabled: true, // Disabled
    },
    {
      label: 'Settings',
      description: 'Configure scan settings',
      icon: Settings,
      color: 'text-purple-500',
      onClick: () => {},
      disabled: true, // Disabled
    },
  ];

  // This effect will run globally as long as there's an active scan
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    if (activeScanId) {
      cleanup = pollScanStatus(activeScanId, (status) => {
        setScanStatus(status);
        
        if (status.status === 'completed') {
          toast({
            title: "Scan Completed",
            description: "Network scan has finished successfully",
            duration: Infinity,
            variant: "default"
          });

          if (Notification.permission === 'granted') {
            new Notification('Scan Completed', {
              body: 'Network scan has finished successfully',
              icon: '/path-to-your-icon.png'
            });
          }
        } else if (status.status === 'failed') {
          toast({
            title: "Scan Failed",
            description: status.error || "An error occurred during the scan",
            variant: "destructive",
            duration: Infinity,
          });

          if (Notification.permission === 'granted') {
            new Notification('Scan Failed', {
              body: status.error || "An error occurred during the scan",
              icon: '/path-to-your-icon.png'
            });
          }
        }
      });
    }

    return () => {
      if (cleanup && typeof cleanup === 'function') {
        cleanup();
      }
    };
  }, [activeScanId]);

  const handleStartScan = async () => {
    try {
      const result = await startScan({
        dc: credentials.dc,
        domain: credentials.domain,
        username: credentials.username,
        password: credentials.password,
      });

      setActiveScanId(result.scan_id);
      setScanStatus({ status: 'running' });
      
      toast({
        title: "Scan Started",
        description: `Scan ID: ${result.scan_id}`,
      });
    } catch (error) {
      console.error('Failed to start scan:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to start scan",
        variant: "destructive",
      });
    }
  };

  const renderScanStatus = () => {
    if (!scanStatus) return null;

    const progress = scanStatus.progress?.processed_hosts && scanStatus.progress?.total_hosts
      ? (scanStatus.progress.processed_hosts / scanStatus.progress.total_hosts) * 100
      : 0;

    return (
      <div className="space-y-4 mt-6">
        <Alert variant={
          scanStatus.status === 'completed' ? 'default' :
          scanStatus.status === 'failed' ? 'destructive' : 
          'default'
        }>
          {scanStatus.status === 'running' && (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertTitle>Scan in Progress</AlertTitle>
              <AlertDescription>
                {scanStatus.progress?.current_host && (
                  <div>Currently scanning: {scanStatus.progress.current_host}</div>
                )}
              </AlertDescription>
            </>
          )}
          {scanStatus.status === 'completed' && (
            <>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Scan Completed</AlertTitle>
              <AlertDescription>
                Network scan has finished successfully
              </AlertDescription>
            </>
          )}
          {scanStatus.status === 'failed' && (
            <>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Scan Failed</AlertTitle>
              <AlertDescription>
                {scanStatus.error || "An error occurred during the scan"}
              </AlertDescription>
            </>
          )}
        </Alert>

        {scanStatus.status === 'running' && scanStatus.progress && (
          <div className="space-y-2">
            <Progress value={progress} className="w-full" />
            <div className="text-sm text-muted-foreground">
              {scanStatus.progress.processed_hosts} / {scanStatus.progress.total_hosts} hosts scanned
            </div>
          </div>
        )}
      </div>
    );
  };

  const handleCloseDialog = () => {
    if (scanStatus?.status === 'running') {
      // Store the minimized state for this scan
      setMinimizedScans(prev => ({
        ...prev,
        [activeScanId!]: true
      }));
      
      toast({
        title: "Scan Running in Background",
        description: "You'll be notified when the scan completes.",
        duration: 5000,
      });
    }
    setIsDialogOpen(false);
  };

  // Add a component to show active scans
  const renderActiveScansBadge = () => {
    if (activeScanId && scanStatus?.status === 'running') {
      return (
        <div 
          className="absolute -top-2 -right-2 bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs cursor-pointer"
          onClick={() => setIsDialogOpen(true)}
        >
          1
        </div>
      );
    }
    return null;
  };

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {actions.map((action) => (
          <Tooltip key={action.label}>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                className="w-full h-24 flex flex-col items-center justify-center gap-2"
                onClick={action.onClick}
                disabled={action.disabled} // Apply disabled state
              >
                <action.icon className={cn("h-8 w-8", action.color, {
                  "opacity-50": action.disabled // Add opacity when disabled
                })} />
                <span className={cn("text-sm font-medium", {
                  "opacity-50": action.disabled // Add opacity to text when disabled
                })}>{action.label}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{action.description}</p>
              {action.disabled && <p className="text-xs text-muted-foreground">Coming soon</p>}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={handleCloseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start New Scan</DialogTitle>
            <DialogDescription>
              Enter domain credentials to start a new network scan
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="dc">Domain Controller IP</Label>
              <Input
                id="dc"
                value={credentials.dc}
                onChange={(e) => setCredentials(prev => ({ ...prev, dc: e.target.value }))}
                placeholder="192.168.1.100"
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="domain">Domain</Label>
              <Input
                id="domain"
                value={credentials.domain}
                onChange={(e) => setCredentials(prev => ({ ...prev, domain: e.target.value }))}
                placeholder="company.local"
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={credentials.username}
                onChange={(e) => setCredentials(prev => ({ ...prev, username: e.target.value }))}
                placeholder="domain\username"
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={credentials.password}
                onChange={(e) => setCredentials(prev => ({ ...prev, password: e.target.value }))}
              />
            </div>
          </div>
          
          {renderScanStatus()}
          
          <div className="flex justify-end gap-3">
            <Button 
              variant="outline" 
              onClick={handleCloseDialog}
            >
              {scanStatus?.status === 'running' ? 'Minimize' : 'Close'}
            </Button>
            <Button 
              onClick={handleStartScan}
              disabled={scanStatus?.status === 'running'}
            >
              {scanStatus?.status === 'running' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Scanning...
                </>
              ) : 'Start Scan'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}