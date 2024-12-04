import { useState, useCallback, useEffect } from 'react';
import { mockShares, mockSensitiveFiles, mockStats } from '@/data/mock';
import { StatsCards } from '@/components/dashboard/stats-cards';
import { SharesTable } from '@/components/dashboard/shares-table';
import { ShareDetails } from '@/components/dashboard/share-details';
import { ActivityTimeline } from '@/components/dashboard/activity-timeline';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { getShares, getScanSessions, getSensitivePatterns, logout } from '@/lib/api';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TrendCharts } from '@/components/dashboard/trend-charts';
import { QuickActions } from '@/components/dashboard/quick-actions';
import { Logo } from '@/components/ui/logo';
import type { Share, DetectionType } from '@/types';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/toaster';
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ActivityIcon, Rocket, LogOut } from "lucide-react";
import { ScanDiff } from '@/components/dashboard/scan-diff';
import { Link, useNavigate } from 'react-router-dom';
import { navigationMenuTriggerStyle } from "@/components/ui/navigation-menu"
import { format } from 'date-fns';
import { NetworkMap } from '@/components/dashboard/network-map';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Provider as JotaiProvider } from 'jotai';
import { ScanMonitor } from '@/components/scan-monitor';
import { ChevronDown, ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { subscribeToEvents } from '@/lib/scan-api';
import { useToast } from '@/hooks/use-toast';
import { X } from "lucide-react";
import { useAuth } from '@/components/auth/auth-provider';

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
  },
  {
    path: "/scan-comparison",
    element: <ScanDiff />,
  },
  {
    path: "/network-map",
    element: <NetworkMap />,
  },
]);

type ScanEvent = {
  type: 'scan_complete' | 'scan_error';
  scan_id: string;
  domain: string;
  timestamp: string;
  stats?: {
    total_hosts: number;
    total_shares: number;
    total_sensitive: number;
  };
  error?: string;
};

function Root() {
  return (
    <JotaiProvider>
      <RouterProvider router={router} />
    </JotaiProvider>
  );
}

export function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedShare, setSelectedShare] = useState<Share | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detectionFilter, setDetectionFilter] = useState<DetectionType | 'all'>('all');
  const [shares, setShares] = useState<Share[]>([]);
  const [loading, setLoading] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'hostname' | 'share_name'>('all');
  const [filterValue, setFilterValue] = useState('');
  const [sessions, setSessions] = useState<ScanSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<string>('all');
  const { toast } = useToast();
  const [detectionTypes, setDetectionTypes] = useState<string[]>([]);
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
      localStorage.removeItem('authToken');
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
      toast({
        title: "Logout Failed",
        description: "There was an error logging out. Please try again.",
        variant: "destructive"
      });
    }
  };

  useEffect(() => {
    const loadInitialData = async () => {
      if (!isAuthenticated) return;
      
      try {
        await loadDetectionTypes();
        await fetchSessions();
        await fetchShares();
      } catch (error) {
        console.error('Failed to load initial data:', error);
      }
    };

    loadInitialData();
  }, [isAuthenticated]);

  const loadDetectionTypes = async () => {
    try {
      const patterns = await getSensitivePatterns();
      console.log('Loaded patterns:', patterns);
      const types = [...new Set(patterns.map(p => p.type))];
      console.log('Unique types:', types);
      setDetectionTypes(types);
    } catch (error) {
      console.error('Failed to load detection types:', error);
    }
  };

  const fetchSessions = async () => {
    try {
      const data = await getScanSessions();
      const completedSessions = data.filter(s => s.scan_status === 'completed');
      setSessions(completedSessions);
      
      if (completedSessions.length > 0) {
        const latestSession = completedSessions.sort(
          (a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
        )[0];
        setSelectedSession(latestSession.id.toString());
      }
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
    }
  };

  useEffect(() => {
    console.log('Setting up event subscription...');
    const unsubscribe = subscribeToEvents((event) => {
      console.log('Received event in App:', event);
      
      if (event.type === 'scan_complete') {
        toast({
          title: "Scan Completed Successfully",
          description: (
            <div className="mt-2 space-y-2">
              <p><strong>Domain:</strong> {event.domain}</p>
              <p><strong>Statistics:</strong></p>
              <ul className="list-disc pl-4">
                <li>Total Hosts: {event.stats.total_hosts}</li>
                <li>Total Shares: {event.stats.total_shares}</li>
                <li>Sensitive Files: {event.stats.total_sensitive}</li>
              </ul>
              <p className="text-sm text-muted-foreground">
                Scan ID: {event.scan_id}
              </p>
            </div>
          ),
          variant: "default",
          action: (close) => (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={close}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          ),
        });
      } else if (event.type === 'scan_error') {
        toast({
          title: "Scan Failed",
          description: `Error: ${event.error}`,
          variant: "destructive",
          action: (close) => (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={close}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          ),
        });
      }
    });

    return () => {
      console.log('Cleaning up event subscription...');
      unsubscribe();
    };
  }, [toast]);

  const fetchShares = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getShares(
        searchQuery, 
        detectionFilter === 'all' ? undefined : detectionFilter,
        filterType === 'all' ? undefined : filterType,
        filterValue,
        selectedSession === 'all' ? undefined : parseInt(selectedSession)
      );
      setShares(data);
    } catch (error) {
      console.error('Failed to fetch shares:', error);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, detectionFilter, filterType, filterValue, selectedSession]);

  const handleRefresh = useCallback(async () => {
    await fetchShares();
  }, [fetchShares]);

  const handleViewDetails = (shareId: number) => {
    const share = shares.find((s) => s.id === shareId);
    if (share) {
      setSelectedShare(share);
      setDetailsOpen(true);
    }
  };

  const filteredShares = shares;  // Filtering is now handled by the API

  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <TooltipProvider>
        <ScanMonitor />
        <nav className="border-b">
          <div className="container mx-auto px-4 py-2 flex justify-between items-center">
            <NavigationMenu>
              <NavigationMenuList>
                <NavigationMenuItem>
                  <Link to="/" className={navigationMenuTriggerStyle()}>
                    <Logo className="mr-2 h-5 w-5" />
                    FileShare Scanner
                  </Link>
                </NavigationMenuItem>

                <NavigationMenuItem>
                  <NavigationMenuTrigger>Dashboard</NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <ul className="grid w-[200px] gap-3 p-4">
                      <li>
                        <Link to="/" className={navigationMenuTriggerStyle()}>
                          Overview
                        </Link>
                      </li>
                      <li>
                        <Link to="/scan-comparison" className={navigationMenuTriggerStyle()}>
                          Scan Comparison
                        </Link>
                      </li>
                      <li>
                        <Link to="/network-map" className={navigationMenuTriggerStyle()}>
                          Network Map
                        </Link>
                      </li>
                    </ul>
                  </NavigationMenuContent>
                </NavigationMenuItem>
              </NavigationMenuList>
            </NavigationMenu>

            <div className="flex items-center gap-4">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={handleLogout}>
                    <LogOut className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Logout</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Sheet open={quickActionsOpen} onOpenChange={setQuickActionsOpen}>
                      <SheetTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <Rocket className="h-5 w-5" />
                        </Button>
                      </SheetTrigger>
                      <SheetContent className="w-full sm:w-[600px] overflow-y-auto p-6">
                        <SheetHeader className="mb-6">
                          <SheetTitle>Quick Actions</SheetTitle>
                        </SheetHeader>
                        <QuickActions onActionComplete={() => setQuickActionsOpen(false)} />
                      </SheetContent>
                    </Sheet>
                  </div>
                </TooltipTrigger>
                <TooltipContent>Quick Actions</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Sheet open={activityOpen} onOpenChange={setActivityOpen}>
                      <SheetTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <ActivityIcon className="h-5 w-5" />
                        </Button>
                      </SheetTrigger>
                      <SheetContent className="w-full sm:w-[1200px] lg:w-[1400px] overflow-y-auto p-6">
                        <SheetHeader className="mb-6">
                          <SheetTitle>Recent Activity</SheetTitle>
                        </SheetHeader>
                        <ActivityTimeline />
                      </SheetContent>
                    </Sheet>
                  </div>
                </TooltipTrigger>
                <TooltipContent>View Recent Activity</TooltipContent>
              </Tooltip>
              <ThemeToggle />
            </div>
          </div>
        </nav>

        <div className="min-h-screen">
          <main className="container mx-auto p-4 space-y-4">
            <StatsCards />

            <div className="grid gap-4 md:grid-cols-1">
              <TrendCharts />
            </div>

            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
              <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4 w-full lg:w-auto">
                <div className="relative w-full lg:w-[600px]">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="w-full">
                        <Input
                          placeholder="Search shares and files..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-8 w-full"
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs">
                      Search across share names, hostnames, sensitive files, and root files
                    </TooltipContent>
                  </Tooltip>
                </div>

                <div className="flex flex-wrap gap-4">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div>
                          <Select value={selectedSession} onValueChange={setSelectedSession}>
                            <SelectTrigger className="w-[300px]">
                              <SelectValue placeholder="Select scan session" />
                            </SelectTrigger>
                            <SelectContent>
                              {sessions
                                .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
                                .map((session) => (
                                  <SelectItem key={session.id} value={session.id.toString()}>
                                    {format(new Date(session.start_time), 'PPpp')} 
                                    ({session.total_shares} shares)
                                    {session.id.toString() === selectedSession && " (Current)"}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Filter results by scan session</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <Select
                    value={filterType}
                    onValueChange={(value) => {
                      setFilterType(value as 'all' | 'hostname' | 'share_name');
                      // Reset filter value when changing types
                      setFilterValue('');
                    }}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Filter by" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Fields</SelectItem>
                      <SelectItem value="hostname">Hostname</SelectItem>
                      <SelectItem value="share_name">Share Name</SelectItem>
                    </SelectContent>
                  </Select>

                  {filterType === 'all' ? (
                    <Select
                      value={detectionFilter}
                      onValueChange={(value) => setDetectionFilter(value as DetectionType | 'all')}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Filter by type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        {detectionTypes.map(type => (
                          <SelectItem key={type} value={type}>
                            {type.charAt(0).toUpperCase() + type.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      placeholder={`Enter ${filterType === 'hostname' ? 'hostname' : 'share name'}...`}
                      value={filterValue}
                      onChange={(e) => setFilterValue(e.target.value)}
                      className="w-[180px]"
                    />
                  )}
                </div>
              </div>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    onClick={handleRefresh}
                    disabled={loading}
                  >
                    {loading ? 'Refreshing...' : 'Refresh Data'}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Update dashboard with latest data</TooltipContent>
              </Tooltip>
            </div>

            <SharesTable
              shares={filteredShares}
              onViewDetails={handleViewDetails}
              searchQuery={searchQuery}
              detectionFilter={detectionFilter}
              filterType={filterType}
              filterValue={filterValue}
            />
          </main>

          <ShareDetails
            share={selectedShare}
            open={detailsOpen}
            onOpenChange={setDetailsOpen}
            searchQuery={searchQuery}
            detectionFilter={detectionFilter}
          />
        </div>
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  );
}

export default Root;
