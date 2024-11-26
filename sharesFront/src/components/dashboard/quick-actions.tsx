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
          
          <div className="flex items-center space-x-2 mb-4">
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
          
          {renderScanStatus()}
          
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancel
            </Button>
            <Button 
              onClick={scheduleMode ? handleScheduleScan : handleStartScan}
              disabled={scanStatus?.status === 'running'}
            >
              {scheduleMode ? 'Schedule Scan' : 'Start Scan Now'}
            </Button>
          </div>
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
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>
              Manage sensitive pattern detection settings
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setIsAddingPattern(true)}>Add Pattern</Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pattern</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patterns.map((pattern) => (
                  <TableRow key={pattern.id}>
                    <TableCell>{pattern.pattern}</TableCell>
                    <TableCell>{pattern.type}</TableCell>
                    <TableCell>{pattern.description}</TableCell>
                    <TableCell>
                      <Switch
                        checked={pattern.enabled}
                        onCheckedChange={() => handleTogglePattern(pattern.id, pattern.enabled)}
                      />
                    </TableCell>
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm">Delete</Button>
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

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSettingsOpen(false)}>
              Close
            </Button>
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
    </div>
  );
}