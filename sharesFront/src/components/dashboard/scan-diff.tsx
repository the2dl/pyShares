import { useState, useEffect, Fragment } from 'react';
import { getScanSessions, compareScanSessions } from '@/lib/api';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Plus, Minus, FileEdit, Server, Database } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ThemeProvider } from '@/components/theme/theme-provider';
import { Toaster } from '@/components/ui/toaster';
import { Link } from 'react-router-dom';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { NavigationMenu } from '@/components/ui/navigation-menu';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { cn } from '@/lib/utils';

interface ScanSession {
  id: number;
  start_time: string;
  end_time: string;
  total_hosts: number;
  total_shares: number;
  total_sensitive_files: number;
  scan_status: string;
}

interface ShareDifference {
  hostname: string;
  share_name: string;
  session1_access_level: string;
  session2_access_level: string;
  session1_sensitive_files: number;
  session2_sensitive_files: number;
  session1_hidden_files: number;
  session2_hidden_files: number;
  session1_total_files: number;
  session2_total_files: number;
  change_type: 'added' | 'removed' | 'modified';
  file_changes?: FileChange[];
}

export function ScanDiff() {
  const [sessions, setSessions] = useState<ScanSession[]>([]);
  const [session1, setSession1] = useState<string>('');
  const [session2, setSession2] = useState<string>('');
  const [diffData, setDiffData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const data = await getScanSessions();
        setSessions(data.filter(s => s.scan_status === 'completed'));
      } catch (error) {
        console.error('Failed to fetch sessions:', error);
      }
    };
    fetchSessions();
  }, []);

  const handleCompare = async () => {
    if (!session1 || !session2) return;
    
    setLoading(true);
    try {
      const data = await compareScanSessions(
        parseInt(session1), 
        parseInt(session2)
      );
      console.log('Scan comparison data:', data);
      setDiffData(data);
    } catch (error) {
      console.error('Failed to compare sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSession1('');
    setSession2('');
    setDiffData(null);
  };

  const getChangeTypeIcon = (changeType: string) => {
    switch (changeType) {
      case 'added':
        return <Plus className="h-4 w-4 text-green-500" />;
      case 'removed':
        return <Minus className="h-4 w-4 text-red-500" />;
      case 'modified':
        return <FileEdit className="h-4 w-4 text-yellow-500" />;
      default:
        return null;
    }
  };

  const getChangeTypeBadge = (changeType: string) => {
    const variants = {
      added: 'bg-green-500',
      removed: 'bg-red-500',
      modified: 'bg-yellow-500',
    };
    return (
      <Badge variant="secondary" className={variants[changeType as keyof typeof variants]}>
        {changeType}
      </Badge>
    );
  };

  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <nav className="border-b">
        <div className="container mx-auto px-4 py-2">
          <NavigationMenu />
        </div>
      </nav>

      <div className="container mx-auto p-6">
        <Breadcrumb className="mb-6">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/">Home</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Scan Comparison</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <Card className="min-h-[800px]">
          <CardHeader>
            <CardTitle>Scan Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              <div className="flex gap-4">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <Select value={session1} onValueChange={setSession1}>
                          <SelectTrigger className="w-[300px]">
                            <SelectValue placeholder="Select first scan" />
                          </SelectTrigger>
                          <SelectContent>
                            {sessions.map((session) => (
                              <SelectItem key={session.id} value={session.id.toString()}>
                                {format(new Date(session.start_time), 'PPpp')} 
                                ({session.total_shares} shares)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Please select the older scan for baseline comparison</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <Select value={session2} onValueChange={setSession2}>
                          <SelectTrigger className="w-[300px]">
                            <SelectValue placeholder="Select second scan" />
                          </SelectTrigger>
                          <SelectContent>
                            {sessions.map((session) => (
                              <SelectItem key={session.id} value={session.id.toString()}>
                                {format(new Date(session.start_time), 'PPpp')}
                                ({session.total_shares} shares)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Select the newer scan to compare against baseline</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <Button 
                  onClick={handleCompare}
                  disabled={!session1 || !session2 || loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Comparing...
                    </>
                  ) : (
                    'Compare Scans'
                  )}
                </Button>

                <Button 
                  variant="outline"
                  onClick={handleReset}
                  disabled={loading}
                >
                  Reset
                </Button>
              </div>

              {diffData && (
                <div className="space-y-4">
                  {/* Session Summary */}
                  <div className="grid grid-cols-2 gap-4">
                    {diffData.sessions.map((session: any) => (
                      <Card key={session.id}>
                        <CardContent className="pt-6">
                          <div className="space-y-2">
                            <div className="text-sm text-muted-foreground">
                              {format(new Date(session.start_time), 'PPpp')}
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                              <div>
                                <div className="text-2xl font-bold">{session.total_hosts}</div>
                                <div className="text-xs text-muted-foreground">Hosts</div>
                              </div>
                              <div>
                                <div className="text-2xl font-bold">{session.total_shares}</div>
                                <div className="text-xs text-muted-foreground">Shares</div>
                              </div>
                              <div>
                                <div className="text-2xl font-bold">{session.total_sensitive_files}</div>
                                <div className="text-xs text-muted-foreground">Sensitive Files</div>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  <Separator />

                  {/* Changes Summary */}
                  <div className="grid grid-cols-4 gap-4">
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-2xl font-bold">{diffData.summary.total_differences}</div>
                        <div className="text-xs text-muted-foreground">Total Changes</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-2xl font-bold text-green-500">{diffData.summary.added}</div>
                        <div className="text-xs text-muted-foreground">Added</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-2xl font-bold text-red-500">{diffData.summary.removed}</div>
                        <div className="text-xs text-muted-foreground">Removed</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-2xl font-bold text-yellow-500">{diffData.summary.modified}</div>
                        <div className="text-xs text-muted-foreground">Modified</div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Detailed Changes */}
                  <ScrollArea className="h-[600px] rounded-md border">
                    <ResizablePanelGroup direction="horizontal">
                      <ResizablePanel defaultSize={50}>
                        <div className="h-full p-4 space-y-2">
                          <div className="font-mono text-sm text-muted-foreground mb-4">Baseline Scan</div>
                          {diffData.differences.map((diff: any, index: number) => (
                            <Card key={`left-${index}`} className={cn(
                              "border-l-4",
                              diff.change_type === 'removed' && "border-l-red-500 bg-red-500/10",
                              diff.change_type === 'modified' && "border-l-yellow-500"
                            )}>
                              <CardContent className="p-4">
                                <div className="font-mono text-sm">
                                  <div className="flex items-center gap-2">
                                    <Server className="h-4 w-4" />
                                    {diff.hostname}/{diff.share_name}
                                  </div>
                                  {diff.change_type === 'modified' && (
                                    <div className="mt-2 text-xs">
                                      <div>Access: {diff.session1_access_level}</div>
                                      <div>Sensitive: {diff.session1_sensitive_files || '-'}</div>
                                      <div>Hidden: {diff.session1_hidden_files || '-'}</div>
                                      <div>Total: {diff.session1_total_files || '-'}</div>
                                    </div>
                                  )}
                                  {diff.file_changes?.map((file: any, fileIndex: number) => (
                                    <div key={fileIndex} className="mt-2 pl-4 text-xs border-l">
                                      {file.change_type === 'removed' && <span className="text-red-500">- </span>}
                                      {file.change_type === 'modified' && <span className="text-yellow-500">~ </span>}
                                      {file.file_path || file.file_name}
                                    </div>
                                  ))}
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </ResizablePanel>
                      
                      <ResizableHandle />
                      
                      <ResizablePanel defaultSize={50}>
                        <div className="h-full p-4 space-y-2">
                          <div className="font-mono text-sm text-muted-foreground mb-4">Current Scan</div>
                          {diffData.differences.map((diff: any, index: number) => (
                            <Card key={`right-${index}`} className={cn(
                              "border-l-4",
                              diff.change_type === 'added' && "border-l-green-500 bg-green-500/10",
                              diff.change_type === 'modified' && "border-l-yellow-500"
                            )}>
                              <CardContent className="p-4">
                                <div className="font-mono text-sm">
                                  <div className="flex items-center gap-2">
                                    <Server className="h-4 w-4" />
                                    {diff.hostname}/{diff.share_name}
                                  </div>
                                  {diff.change_type !== 'removed' && (
                                    <div className="mt-2 text-xs">
                                      <div>Access: {diff.session2_access_level}</div>
                                      <div>Sensitive: {diff.session2_sensitive_files || '-'}</div>
                                      <div>Hidden: {diff.session2_hidden_files || '-'}</div>
                                      <div>Total: {diff.session2_total_files || '-'}</div>
                                    </div>
                                  )}
                                  {diff.file_changes?.map((file: any, fileIndex: number) => (
                                    <div key={fileIndex} className="mt-2 pl-4 text-xs border-l">
                                      {file.change_type === 'added' && <span className="text-green-500">+ </span>}
                                      {file.change_type === 'modified' && <span className="text-yellow-500">~ </span>}
                                      {file.file_path || file.file_name}
                                    </div>
                                  ))}
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </ResizablePanel>
                    </ResizablePanelGroup>
                  </ScrollArea>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      <Toaster />
    </ThemeProvider>
  );
} 