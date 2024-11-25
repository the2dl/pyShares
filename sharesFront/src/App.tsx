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
import { getShares } from '@/lib/api';
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
import { ActivityIcon } from "lucide-react";

function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedShare, setSelectedShare] = useState<Share | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detectionFilter, setDetectionFilter] = useState<DetectionType | 'all'>('all');
  const [shares, setShares] = useState<Share[]>([]);
  const [loading, setLoading] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'hostname' | 'share_name'>('all');
  const [filterValue, setFilterValue] = useState('');

  // Function to fetch shares from the API
  const fetchShares = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getShares(
        searchQuery, 
        detectionFilter === 'all' ? undefined : detectionFilter,
        filterType === 'all' ? undefined : filterType,
        filterValue
      );
      setShares(data);
    } catch (error) {
      console.error('Failed to fetch shares:', error);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, detectionFilter, filterType, filterValue]);

  // Update shares when filter changes
  useEffect(() => {
    fetchShares();
  }, [fetchShares, detectionFilter, filterType, filterValue]);

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
        <nav className="border-b">
          <div className="container mx-auto px-4 py-2 flex justify-between items-center">
            <NavigationMenu>
              <NavigationMenuList>
                <NavigationMenuItem>
                  <NavigationMenuLink 
                    className="text-lg font-semibold"
                    href="/"
                  >
                    FileShare Scanner
                  </NavigationMenuLink>
                </NavigationMenuItem>
                <NavigationMenuItem>
                  <NavigationMenuTrigger>Dashboard</NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <ul className="grid w-[200px] gap-3 p-4">
                      <li>
                        <NavigationMenuLink href="/shares">Shares</NavigationMenuLink>
                      </li>
                      <li>
                        <NavigationMenuLink href="/sensitive">Sensitive Files</NavigationMenuLink>
                      </li>
                    </ul>
                  </NavigationMenuContent>
                </NavigationMenuItem>
                <NavigationMenuItem>
                  <NavigationMenuTrigger>Settings</NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <ul className="grid w-[200px] gap-3 p-4">
                      <li>
                        <NavigationMenuLink href="/settings">Preferences</NavigationMenuLink>
                      </li>
                    </ul>
                  </NavigationMenuContent>
                </NavigationMenuItem>
              </NavigationMenuList>
            </NavigationMenu>

            <div className="flex items-center gap-4">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Sheet open={activityOpen} onOpenChange={setActivityOpen}>
                      <SheetTrigger asChild>
                        <span>
                          <Button variant="ghost" size="icon">
                            <ActivityIcon className="h-5 w-5" />
                          </Button>
                        </span>
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
                  <Select
                    value={filterType}
                    onValueChange={(value) => setFilterType(value as 'all' | 'hostname' | 'share_name')}
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

                  {filterType !== 'all' && (
                    <Input
                      placeholder={`Enter ${filterType === 'hostname' ? 'hostname' : 'share name'}...`}
                      value={filterValue}
                      onChange={(e) => setFilterValue(e.target.value)}
                      className="w-[200px]"
                    />
                  )}

                  <Select
                    value={detectionFilter}
                    onValueChange={(value) => setDetectionFilter(value as DetectionType | 'all')}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Filter by type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="credential">Credentials</SelectItem>
                      <SelectItem value="pii">PII</SelectItem>
                      <SelectItem value="financial">Financial</SelectItem>
                      <SelectItem value="hr">HR</SelectItem>
                      <SelectItem value="sensitive">Sensitive</SelectItem>
                      <SelectItem value="security">Security</SelectItem>
                    </SelectContent>
                  </Select>
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
      </TooltipProvider>
    </ThemeProvider>
  );
}

export default App;