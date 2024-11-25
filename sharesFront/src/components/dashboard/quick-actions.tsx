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
import { useState, useEffect } from 'react';
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

interface QuickActionsProps {
  onActionComplete?: () => void;
}

export function QuickActions({ onActionComplete }: QuickActionsProps) {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeScanId, setActiveScanId] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<{
    status: 'running' | 'completed' | 'failed';
    progress?: {
      total_hosts?: number;
      processed_hosts?: number;
      current_host?: string;
    };
    error?: string;
  } | null>(null);
  
  const [credentials, setCredentials] = useState({
    dc: '',
    domain: '',
    username: '',
    password: '',
  });

  useEffect(() => {
    if (activeScanId) {
      const cleanup = pollScanStatus(activeScanId, (status) => {
        setScanStatus(status);
        
        // Show toast notifications for status changes
        if (status.status === 'completed') {
          toast({
            title: "Scan Completed",
            description: "Network scan has finished successfully",
            duration: 5000,
          });
        } else if (status.status === 'failed') {
          toast({
            title: "Scan Failed",
            description: status.error || "An error occurred during the scan",
            variant: "destructive",
            duration: 5000,
          });
        }
      });
      
      return cleanup;
    }
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

  const actions = [
    {
      icon: PlayCircle,
      label: 'Start Scan',
      description: 'Run a new scan on all shares',
      onClick: () => setIsDialogOpen(true),
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
      onClick: () => {
        onActionComplete?.();
      },
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

  return (
    <>
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
                      onClick={() => action.onClick()}
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

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
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
              onClick={() => {
                if (scanStatus?.status === 'running') {
                  toast({
                    title: "Scan in Progress",
                    description: "You can close this dialog. The scan will continue in the background.",
                  });
                }
                setIsDialogOpen(false);
              }}
            >
              Close
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
    </>
  );
}