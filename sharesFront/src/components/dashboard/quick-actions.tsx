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
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect, useContext } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { startScan, pollScanStatus, createSchedule, getSchedules, deleteSchedule } from '@/lib/scan-api';
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { postActivity } from '@/lib/api';
import { atom, useAtom } from 'jotai';
import { Play, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { getSensitivePatterns, addSensitivePattern, updateSensitivePattern, deleteSensitivePattern } from '@/lib/api';
import { exportData } from '@/lib/api';
import { Checkbox } from "@/components/ui/checkbox";
import { getScanSessions } from '@/lib/api';
import { format } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Info } from 'lucide-react';
import { getStoredCredentials, addStoredCredential, deleteStoredCredential } from '@/lib/api';
import { Trash2 } from 'lucide-react';

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
    total_shares?: number;
    total_sensitive?: number;
  };
  error?: string;
} | null>(null);

interface SensitivePattern {
  id: number;
  pattern: string;
  type: string;
  description: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface ScanSession {
  id: number;
  start_time: string;
  end_time: string | null;
  total_hosts: number;
  total_shares: number;
  total_sensitive_files: number;
  scan_status: 'running' | 'completed' | 'failed';
}

interface ScheduledJob {
  id: string;
  name: string;
  trigger: string;
  trigger_type: string;
  schedule_config: {
    day_of_week: string;
    hour: number;
    minute: number;
  };
  next_run?: string;
}

interface StoredCredential {
  id: number;
  domain: string;
  username: string;
  dc_ip: string;
  description: string;
  created_at: string;
  updated_at: string;
}

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
    ldap_port: 389,
    threads: 10,
    ou: '',
    filter: 'all',
    batch_size: 1000,
    max_depth: 5,
    scan_timeout: 30,
    host_timeout: 300,
    max_computers: 800000,
  });
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduleConfig, setScheduleConfig] = useState({
    trigger_type: 'cron',
    schedule_config: {
      day_of_week: 'mon',
      hour: 12,
      minute: 0
    }
  });
  const [schedules, setSchedules] = useState<ScheduledJob[]>([]);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [patterns, setPatterns] = useState<SensitivePattern[]>([]);
  const [newPattern, setNewPattern] = useState({
    pattern: '',
    type: '',
    description: ''
  });
  const [isAddingPattern, setIsAddingPattern] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [exportOptions, setExportOptions] = useState({
    sessionId: '',
    includeSensitive: true,
    includeRoot: false,
    includeShares: true,
  });
  const [sessions, setSessions] = useState<ScanSession[]>([]);
  const [editingPattern, setEditingPattern] = useState<SensitivePattern | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [storedCredentials, setStoredCredentials] = useState<StoredCredential[]>([]);
  const [isAddingCredential, setIsAddingCredential] = useState(false);
  const [newCredential, setNewCredential] = useState({
    domain: '',
    username: '',
    dc_ip: '',
    description: ''
  });

  const actions = [
    {
      label: 'Ad-hoc Scan',
      description: 'Start a new network scan immediately',
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
      onClick: () => {
        setScheduleMode(true);
        setIsDialogOpen(true);
      },
      disabled: false,
    },
    {
      label: 'View Schedules',
      description: 'View and manage scheduled scans',
      icon: Calendar,
      color: 'text-purple-500',
      onClick: () => setIsViewDialogOpen(true),
      disabled: false,
    },
    {
      label: 'Export Data',
      description: 'Export scan results',
      icon: Download,
      color: 'text-yellow-500',
      onClick: () => setIsExportDialogOpen(true),
      disabled: false,
    },
    {
      label: 'Settings',
      description: 'Configure scan settings',
      icon: Settings,
      color: 'text-purple-500',
      onClick: () => setIsSettingsOpen(true),
      disabled: false,
    },
  ];

  // This effect will run globally as long as there's an active scan
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    if (activeScanId) {
      pollScanStatus(activeScanId, (status) => {
        setScanStatus(status);
        
        if (status.status === 'completed') {
          const hasShares = (status.progress?.total_shares || 0) > 0;
          const totalHosts = status.progress?.total_hosts || 0;
          
          toast({
            title: "Scan Completed",
            description: hasShares 
              ? `Found ${status.progress?.total_shares || 0} shares across ${totalHosts} hosts`
              : `Scan completed but no accessible shares were found across ${totalHosts} hosts`,
            duration: Infinity,
            variant: "default"
          });

          if (Notification.permission === 'granted') {
            new Notification('Scan Completed', {
              body: hasShares 
                ? `Found ${status.progress?.total_shares || 0} shares across ${totalHosts} hosts`
                : `Scan completed but no accessible shares were found across ${totalHosts} hosts`,
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
      }).then(cleanupFn => {
        cleanup = cleanupFn;
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
        ldap_port: credentials.ldap_port,
        threads: credentials.threads,
        ou: credentials.ou || undefined,
        filter: credentials.filter,
        batch_size: credentials.batch_size,
        max_depth: credentials.max_depth,
        scan_timeout: credentials.scan_timeout,
        host_timeout: credentials.host_timeout,
        max_computers: credentials.max_computers,
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

  const handleScheduleScan = async () => {
    try {
      const result = await createSchedule(credentials, {
        trigger_type: 'cron',
        schedule_config: {
          day_of_week: scheduleConfig.schedule_config.day_of_week,
          hour: scheduleConfig.schedule_config.hour,
          minute: scheduleConfig.schedule_config.minute
        }
      });

      if (result.status === 'success') {
        toast({
          title: "Scan Scheduled",
          description: `Next run: ${new Date(result.next_run!).toLocaleString()}`,
        });
        setIsDialogOpen(false);
      } else {
        throw new Error(result.error || 'Failed to schedule scan');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to schedule scan",
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
              <AlertDescription className="space-y-2">
                {scanStatus.progress?.current_host && (
                  <div>Currently scanning: {scanStatus.progress.current_host}</div>
                )}
                <div className="text-sm text-muted-foreground mt-2">
                  You can close this panel and the scan will continue in the background. 
                  You'll be notified when it completes.
                </div>
              </AlertDescription>
            </>
          )}
          {scanStatus.status === 'completed' && (
            <>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Scan Completed</AlertTitle>
              <AlertDescription>
                {(scanStatus.progress?.total_shares || 0) > 0 ? (
                  <div className="space-y-2">
                    <p>Found {scanStatus.progress?.total_shares || 0} shares across {scanStatus.progress?.total_hosts || 0} hosts</p>
                    {(scanStatus.progress?.total_sensitive || 0) > 0 && (
                      <p className="text-yellow-600">
                        Found {scanStatus.progress?.total_sensitive || 0} potentially sensitive files
                      </p>
                    )}
                  </div>
                ) : (
                  <p>Scan completed but no accessible shares were found{' '}
                    {scanStatus.progress?.total_hosts ? 
                      `across ${scanStatus.progress.total_hosts} hosts` : 
                      ''}
                  </p>
                )}
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

  const fetchSchedules = async () => {
    try {
      const jobs = await getSchedules();
      setSchedules(jobs);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch scheduled scans",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (isViewDialogOpen) {
      fetchSchedules();
    }
  }, [isViewDialogOpen]);

  const handleDeleteSchedule = async (jobId: string) => {
    try {
      await deleteSchedule(jobId);
      toast({
        title: "Success",
        description: "Schedule deleted successfully",
      });
      fetchSchedules(); // Refresh the list
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete schedule",
        variant: "destructive",
      });
    }
  };

  const loadPatterns = async () => {
    try {
      const data = await getSensitivePatterns();
      setPatterns(data);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load sensitive patterns",
        variant: "destructive",
      });
    }
  };

  const handleAddPattern = async () => {
    try {
      const pattern = await addSensitivePattern(newPattern);
      setPatterns([...patterns, pattern]);
      setNewPattern({ pattern: '', type: '', description: '' });
      setIsAddingPattern(false);
      toast({
        title: "Success",
        description: "Pattern added successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add pattern",
        variant: "destructive",
      });
    }
  };

  const handleTogglePattern = async (id: number, enabled: boolean) => {
    try {
      const pattern = patterns.find(p => p.id === id);
      if (!pattern) return;
      
      const updated = await updateSensitivePattern(id, {
        ...pattern,
        enabled: !enabled
      });
      
      setPatterns(patterns.map(p => p.id === id ? updated : p));
      toast({
        title: "Success",
        description: "Pattern updated successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update pattern",
        variant: "destructive",
      });
    }
  };

  const handleDeletePattern = async (id: number) => {
    try {
      await deleteSensitivePattern(id);
      setPatterns(patterns.filter(p => p.id !== id));
      toast({
        title: "Success",
        description: "Pattern deleted successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete pattern",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (isSettingsOpen) {
      loadPatterns();
      loadStoredCredentials();
    }
  }, [isSettingsOpen]);

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const sessionsData = await getScanSessions();
        setSessions(sessionsData);
      } catch (error) {
        console.error('Failed to fetch sessions:', error);
        toast({
          title: "Error",
          description: "Failed to fetch scan sessions",
          variant: "destructive",
        });
      }
    };

    fetchSessions();
  }, []);

  const handleEditPattern = async () => {
    try {
      if (!editingPattern) return;
      
      const updated = await updateSensitivePattern(editingPattern.id, editingPattern);
      setPatterns(patterns.map(p => p.id === editingPattern.id ? updated : p));
      setEditingPattern(null);
      toast({
        title: "Success",
        description: "Pattern updated successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update pattern",
        variant: "destructive",
      });
    }
  };

  const loadStoredCredentials = async () => {
    try {
      const data = await getStoredCredentials();
      setStoredCredentials(data);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load stored credentials",
        variant: "destructive",
      });
    }
  };

  const handleAddCredential = async () => {
    try {
      const result = await addStoredCredential({
        domain: newCredential.domain,
        username: newCredential.username,
        dc_ip: newCredential.dc_ip,
        description: newCredential.description
      });
      setStoredCredentials(prev => [...prev, result]);
      setIsAddingCredential(false);
      setNewCredential({ domain: '', username: '', dc_ip: '', description: '' });
      toast({
        title: "Success",
        description: "Credential added successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add credential",
        variant: "destructive",
      });
    }
  };

  const handleDeleteCredential = async (id: number) => {
    try {
      await deleteStoredCredential(id);
      setStoredCredentials(storedCredentials.filter(cred => cred.id !== id));
      toast({
        title: "Success",
        description: "Credential deleted successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete credential",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {actions.map((action) => (
          <HoverCard key={action.label}>
            <HoverCardTrigger asChild>
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
            </HoverCardTrigger>
            <HoverCardContent>
              <p>{action.description}</p>
              {action.disabled && <p className="text-xs text-muted-foreground">Coming soon</p>}
            </HoverCardContent>
          </HoverCard>
        ))}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={handleCloseDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Start New Scan</DialogTitle>
            <DialogDescription>
              Enter domain credentials to start a new network scan
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="basic">Basic Settings</TabsTrigger>
              <TabsTrigger value="advanced">Advanced Settings</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4">
              <div className="grid gap-4">
                {storedCredentials.length > 0 ? (
                  <>
                    <div className="grid gap-2">
                      <div className="flex justify-between items-center">
                        <Label htmlFor="storedCred">Stored Credential</Label>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="text-xs"
                          onClick={() => setIsSettingsOpen(true)}
                        >
                          Manage Credentials
                        </Button>
                      </div>
                      <Select
                        onValueChange={(value) => {
                          const selected = storedCredentials.find(cred => cred.id.toString() === value);
                          if (selected) {
                            setCredentials(prev => ({
                              ...prev,
                              domain: selected.domain,
                              username: selected.username,
                              dc: selected.dc_ip
                            }));
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select stored credential" />
                        </SelectTrigger>
                        <SelectContent>
                          {storedCredentials.map((cred) => (
                            <SelectItem key={cred.id} value={cred.id.toString()}>
                              {cred.description || `${cred.domain}\\${cred.username}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-background px-2 text-muted-foreground">
                          Or enter credentials manually
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertTitle>No Stored Credentials</AlertTitle>
                    <AlertDescription>
                      You can store frequently used credentials in{" "}
                      <Button 
                        variant="link" 
                        className="p-0 h-auto font-normal" 
                        onClick={() => setIsSettingsOpen(true)}
                      >
                        Settings → Stored Credentials
                      </Button>
                      {" "}for quick access.
                    </AlertDescription>
                  </Alert>
                )}

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

                <div className="flex items-center space-x-2">
                  <Switch
                    checked={scheduleMode}
                    onCheckedChange={setScheduleMode}
                  />
                  <Label>Schedule Scan</Label>
                </div>

                {scheduleMode && (
                  <div className="grid gap-4">
                    <div className="grid gap-2">
                      <Label>Day of Week</Label>
                      <Select
                        value={scheduleConfig.schedule_config.day_of_week}
                        onValueChange={(value) => setScheduleConfig(prev => ({
                          ...prev,
                          schedule_config: { ...prev.schedule_config, day_of_week: value }
                        }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(day => (
                            <SelectItem key={day} value={day}>
                              {day.charAt(0).toUpperCase() + day.slice(1)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-2">
                      <Label>Time</Label>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          min="0"
                          max="23"
                          value={scheduleConfig.schedule_config.hour}
                          onChange={(e) => setScheduleConfig(prev => ({
                            ...prev,
                            schedule_config: { ...prev.schedule_config, hour: parseInt(e.target.value) }
                          }))}
                          placeholder="Hour (0-23)"
                        />
                        <Input
                          type="number"
                          min="0"
                          max="59"
                          value={scheduleConfig.schedule_config.minute}
                          onChange={(e) => setScheduleConfig(prev => ({
                            ...prev,
                            schedule_config: { ...prev.schedule_config, minute: parseInt(e.target.value) }
                          }))}
                          placeholder="Minute (0-59)"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="advanced" className="space-y-4">
              <div className="grid gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <HoverCard>
                      <HoverCardTrigger asChild>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Label htmlFor="ldap_port">LDAP Port</Label>
                            <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                          </div>
                          <Input
                            id="ldap_port"
                            type="number"
                            value={credentials.ldap_port}
                            onChange={(e) => setCredentials(prev => ({ ...prev, ldap_port: parseInt(e.target.value) }))}
                          />
                        </div>
                      </HoverCardTrigger>
                      <HoverCardContent side="top" align="start" sideOffset={5} className="w-[280px] p-4">
                        <div className="space-y-2">
                          <h4 className="font-medium">LDAP Port</h4>
                          <p className="text-sm text-muted-foreground">
                            LDAP port for domain controller connection. Default is 389
                          </p>
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                  </div>

                  <div className="grid gap-2">
                    <HoverCard>
                      <HoverCardTrigger asChild>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Label htmlFor="threads">Threads</Label>
                            <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                          </div>
                          <Input
                            id="threads"
                            type="number"
                            min="1"
                            max="100"
                            value={credentials.threads}
                            onChange={(e) => setCredentials(prev => ({ ...prev, threads: parseInt(e.target.value) }))}
                          />
                        </div>
                      </HoverCardTrigger>
                      <HoverCardContent side="top" align="start" sideOffset={5} className="w-[280px] p-4">
                        <div className="space-y-2">
                          <h4 className="font-medium">Threads</h4>
                          <p className="text-sm text-muted-foreground">
                            Number of concurrent scan threads. Must be between 1 and 100 (Default: 10)
                          </p>
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                  </div>

                  <div className="grid gap-2">
                    <HoverCard>
                      <HoverCardTrigger asChild>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Label htmlFor="ou">Organizational Unit</Label>
                            <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                          </div>
                          <Input
                            id="ou"
                            value={credentials.ou}
                            onChange={(e) => setCredentials(prev => ({ ...prev, ou: e.target.value }))}
                            placeholder="Optional"
                          />
                        </div>
                      </HoverCardTrigger>
                      <HoverCardContent side="top" align="start" sideOffset={5} className="w-[280px] p-4">
                        <div className="space-y-2">
                          <h4 className="font-medium">Organizational Unit</h4>
                          <p className="text-sm text-muted-foreground">
                            Specific OU to scan. Leave empty to scan entire domain.
                            Example format: "OU=Computers,DC=domain,DC=com"
                          </p>
                          <p className="text-sm text-muted-foreground mt-2">
                            You can also use just the OU name: "Computers"
                          </p>
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                  </div>

                  <div className="grid gap-2">
                    <HoverCard>
                      <HoverCardTrigger asChild>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Label htmlFor="filter">LDAP Filter</Label>
                            <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                          </div>
                          <Input
                            id="filter"
                            value={credentials.filter}
                            onChange={(e) => setCredentials(prev => ({ ...prev, filter: e.target.value }))}
                          />
                        </div>
                      </HoverCardTrigger>
                      <HoverCardContent side="top" align="start" sideOffset={5} className="w-[280px] p-4">
                        <div className="space-y-2">
                          <h4 className="font-medium">LDAP Filter</h4>
                          <p className="text-sm text-muted-foreground">
                            LDAP filter to refine computer search. Examples:
                          </p>
                          <ul className="text-sm text-muted-foreground list-disc pl-4 mt-1">
                            <li>(operatingSystem=*Server*) - Only servers</li>
                            <li>(name=WEB*) - Names starting with "WEB"</li>
                            <li>(|(name=WEB*)(name=APP*)) - Names starting with WEB or APP</li>
                            <li>(&(name=WEB*)(operatingSystem=*2019*)) - Web servers running 2019</li>
                          </ul>
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                  </div>

                  <div className="grid gap-2">
                    <HoverCard>
                      <HoverCardTrigger asChild>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Label htmlFor="batch_size">Batch Size</Label>
                            <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                          </div>
                          <Input
                            id="batch_size"
                            type="number"
                            value={credentials.batch_size}
                            onChange={(e) => setCredentials(prev => ({ ...prev, batch_size: parseInt(e.target.value) }))}
                          />
                        </div>
                      </HoverCardTrigger>
                      <HoverCardContent side="top" align="start" sideOffset={5} className="w-[280px] p-4">
                        <div className="space-y-2">
                          <h4 className="font-medium">Batch Size</h4>
                          <p className="text-sm text-muted-foreground">
                            Number of hosts to process in each batch. Default: 1000
                          </p>
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                  </div>

                  <div className="grid gap-2">
                    <HoverCard>
                      <HoverCardTrigger asChild>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Label htmlFor="max_depth">Max Depth</Label>
                            <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                          </div>
                          <Input
                            id="max_depth"
                            type="number"
                            min="1"
                            max="10"
                            value={credentials.max_depth}
                            onChange={(e) => setCredentials(prev => ({ ...prev, max_depth: parseInt(e.target.value) }))}
                          />
                        </div>
                      </HoverCardTrigger>
                      <HoverCardContent side="top" align="start" sideOffset={5} className="w-[280px] p-4">
                        <div className="space-y-2">
                          <h4 className="font-medium">Max Depth</h4>
                          <p className="text-sm text-muted-foreground">
                            Maximum directory depth to scan. Must be between 1 and 10 (Default: 5)
                          </p>
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                  </div>

                  <div className="grid gap-2">
                    <HoverCard>
                      <HoverCardTrigger asChild>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Label htmlFor="scan_timeout">Scan Timeout (s)</Label>
                            <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                          </div>
                          <Input
                            id="scan_timeout"
                            type="number"
                            value={credentials.scan_timeout}
                            onChange={(e) => setCredentials(prev => ({ ...prev, scan_timeout: parseInt(e.target.value) }))}
                          />
                        </div>
                      </HoverCardTrigger>
                      <HoverCardContent 
                        side="top"
                        align="start"
                        sideOffset={5}
                        className="w-[280px] p-4"
                      >
                        <div className="space-y-2">
                          <h4 className="font-medium">Scan Timeout</h4>
                          <p className="text-sm text-muted-foreground">
                            Timeout for individual share scans in seconds. Default: 30
                          </p>
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                  </div>

                  <div className="grid gap-2">
                    <HoverCard>
                      <HoverCardTrigger asChild>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Label htmlFor="host_timeout">Host Timeout (s)</Label>
                            <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                          </div>
                          <Input
                            id="host_timeout"
                            type="number"
                            value={credentials.host_timeout}
                            onChange={(e) => setCredentials(prev => ({ ...prev, host_timeout: parseInt(e.target.value) }))}
                          />
                        </div>
                      </HoverCardTrigger>
                      <HoverCardContent side="top" align="start" sideOffset={5} className="w-[280px] p-4">
                        <div className="space-y-2">
                          <h4 className="font-medium">Host Timeout</h4>
                          <p className="text-sm text-muted-foreground">
                            Timeout for entire host scan in seconds. Default: 300
                          </p>
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                  </div>

                  <div className="grid gap-2">
                    <HoverCard>
                      <HoverCardTrigger asChild>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Label htmlFor="max_computers">Max Computers</Label>
                            <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                          </div>
                          <Input
                            id="max_computers"
                            type="number"
                            value={credentials.max_computers}
                            onChange={(e) => setCredentials(prev => ({ ...prev, max_computers: parseInt(e.target.value) }))}
                          />
                        </div>
                      </HoverCardTrigger>
                      <HoverCardContent side="top" align="start" sideOffset={5} className="w-[280px] p-4">
                        <div className="space-y-2">
                          <h4 className="font-medium">Max Computers</h4>
                          <p className="text-sm text-muted-foreground">
                            Maximum number of computers to process. Default: 800000
                          </p>
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {renderScanStatus()}
          
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancel
            </Button>
            <Button 
              onClick={scheduleMode ? handleScheduleScan : handleStartScan}
              disabled={scanStatus?.status === 'running'}
            >
              {scheduleMode ? 'Schedule Scan' : 'Start Scan Now'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Scheduled Scans</DialogTitle>
            <DialogDescription>
              View and manage your scheduled network scans
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Next Run</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell>{job.name}</TableCell>
                    <TableCell>{job.trigger}</TableCell>
                    <TableCell>
                      {job.next_run ? new Date(job.next_run).toLocaleString() : 'Not scheduled'}
                    </TableCell>
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm">Delete</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Schedule</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete this scheduled scan? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeleteSchedule(job.id)}>
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
                {schedules.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center">
                      No scheduled scans found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>Configure scan and detection settings</DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="patterns">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="patterns">Sensitive Patterns</TabsTrigger>
              <TabsTrigger value="credentials">Stored Credentials</TabsTrigger>
            </TabsList>

            <TabsContent value="patterns">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium">Sensitive Patterns</h3>
                  <Button onClick={() => setIsAddingPattern(true)}>Add Pattern</Button>
                </div>
                
                {/* Add the patterns table */}
                <div className="border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Pattern</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {patterns.map((pattern) => (
                        <TableRow key={pattern.id}>
                          <TableCell className="font-mono">{pattern.pattern}</TableCell>
                          <TableCell>{pattern.type}</TableCell>
                          <TableCell>{pattern.description}</TableCell>
                          <TableCell>
                            <Switch
                              checked={pattern.enabled}
                              onCheckedChange={() => handleTogglePattern(pattern.id, pattern.enabled)}
                            />
                          </TableCell>
                          <TableCell className="text-right space-x-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingPattern(pattern)}
                            >
                              <Settings className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <AlertTriangle className="h-4 w-4 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Pattern</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete this pattern? This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDeletePattern(pattern.id)}>
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="credentials">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium">Stored Credentials</h3>
                  <Button onClick={() => setIsAddingCredential(true)}>Add Credential</Button>
                </div>

                <div className="border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Domain</TableHead>
                        <TableHead>Username</TableHead>
                        <TableHead>DC IP</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {storedCredentials.map((cred) => (
                        <TableRow key={cred.id}>
                          <TableCell>{cred.domain}</TableCell>
                          <TableCell>{cred.username}</TableCell>
                          <TableCell>{cred.dc_ip}</TableCell>
                          <TableCell>{cred.description}</TableCell>
                          <TableCell className="text-right">
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Credential</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete this credential? This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDeleteCredential(cred.id)}>
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSettingsOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isAddingPattern} onOpenChange={setIsAddingPattern}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Pattern</DialogTitle>
            <DialogDescription>
              Add a new sensitive pattern for detection
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Pattern (RegEx)</Label>
              <Input
                value={newPattern.pattern}
                onChange={(e) => setNewPattern({ ...newPattern, pattern: e.target.value })}
                placeholder="e.g., pass(word|wd)?|secret"
              />
            </div>
            <div className="grid gap-2">
              <Label>Type</Label>
              <Input
                value={newPattern.type}
                onChange={(e) => setNewPattern({ ...newPattern, type: e.target.value })}
                placeholder="e.g., credential"
              />
            </div>
            <div className="grid gap-2">
              <Label>Description</Label>
              <Input
                value={newPattern.description}
                onChange={(e) => setNewPattern({ ...newPattern, description: e.target.value })}
                placeholder="e.g., Matches password-related files"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddingPattern(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddPattern}>Add Pattern</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingPattern} onOpenChange={(open) => !open && setEditingPattern(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Pattern</DialogTitle>
            <DialogDescription>
              Modify the sensitive pattern detection settings
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Pattern (RegEx)</Label>
              <Input
                value={editingPattern?.pattern || ''}
                onChange={(e) => setEditingPattern(prev => 
                  prev ? { ...prev, pattern: e.target.value } : null
                )}
                placeholder="e.g., pass(word|wd)?|secret"
              />
            </div>
            <div className="grid gap-2">
              <Label>Type</Label>
              <Input
                value={editingPattern?.type || ''}
                onChange={(e) => setEditingPattern(prev => 
                  prev ? { ...prev, type: e.target.value } : null
                )}
                placeholder="e.g., credential"
              />
            </div>
            <div className="grid gap-2">
              <Label>Description</Label>
              <Input
                value={editingPattern?.description || ''}
                onChange={(e) => setEditingPattern(prev => 
                  prev ? { ...prev, description: e.target.value } : null
                )}
                placeholder="e.g., Matches password-related files"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingPattern(null)}>
              Cancel
            </Button>
            <Button onClick={handleEditPattern}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export Data</DialogTitle>
            <DialogDescription>
              Choose what data you want to export
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {sessions.length > 0 ? (
              <Select
                value={exportOptions.sessionId}
                onValueChange={(value) => setExportOptions(prev => ({ ...prev, sessionId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select scan session" />
                </SelectTrigger>
                <SelectContent>
                  {sessions
                    .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
                    .map((session) => (
                      <SelectItem key={session.id} value={session.id.toString()}>
                        {format(new Date(session.start_time), 'PPpp')} 
                        ({session.total_shares} shares)
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="text-center text-muted-foreground">
                No scan sessions available
              </div>
            )}

            <div className="space-y-2">
              <Label>Include in Export:</Label>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="sensitive"
                    checked={exportOptions.includeSensitive}
                    onCheckedChange={(checked) => 
                      setExportOptions(prev => ({ ...prev, includeSensitive: checked as boolean }))
                    }
                  />
                  <label htmlFor="sensitive">Sensitive Files</label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="root"
                    checked={exportOptions.includeRoot}
                    onCheckedChange={(checked) => 
                      setExportOptions(prev => ({ ...prev, includeRoot: checked as boolean }))
                    }
                  />
                  <label htmlFor="root">Root Files</label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="shares"
                    checked={exportOptions.includeShares}
                    onCheckedChange={(checked) => 
                      setExportOptions(prev => ({ ...prev, includeShares: checked as boolean }))
                    }
                  />
                  <label htmlFor="shares">Shares Information</label>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsExportDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                try {
                  await exportData({
                    sessionId: parseInt(exportOptions.sessionId),
                    includeSensitive: exportOptions.includeSensitive,
                    includeRoot: exportOptions.includeRoot,
                    includeShares: exportOptions.includeShares,
                  });
                  toast({
                    title: "Export Successful",
                    description: "Your data has been exported successfully",
                  });
                  setIsExportDialogOpen(false);
                } catch (error) {
                  toast({
                    title: "Export Failed",
                    description: error instanceof Error ? error.message : "Failed to export data",
                    variant: "destructive",
                  });
                }
              }}
              disabled={!exportOptions.sessionId || 
                (!exportOptions.includeSensitive && !exportOptions.includeRoot && !exportOptions.includeShares)}
            >
              Export
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isAddingCredential} onOpenChange={setIsAddingCredential}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Credential</DialogTitle>
            <DialogDescription>
              Store domain and username for quick access during scans
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Domain</Label>
              <Input
                value={newCredential.domain}
                onChange={(e) => setNewCredential({ ...newCredential, domain: e.target.value })}
                placeholder="company.local"
              />
            </div>
            <div className="grid gap-2">
              <Label>Domain Controller IP</Label>
              <Input
                value={newCredential.dc_ip}
                onChange={(e) => setNewCredential({ ...newCredential, dc_ip: e.target.value })}
                placeholder="192.168.1.100"
              />
            </div>
            <div className="grid gap-2">
              <Label>Username</Label>
              <Input
                value={newCredential.username}
                onChange={(e) => setNewCredential({ ...newCredential, username: e.target.value })}
                placeholder="domain\username"
              />
            </div>
            <div className="grid gap-2">
              <Label>Description</Label>
              <Input
                value={newCredential.description}
                onChange={(e) => setNewCredential({ ...newCredential, description: e.target.value })}
                placeholder="Scanner account"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddingCredential(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddCredential}>Add Credential</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}