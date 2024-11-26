import { format } from 'date-fns';
import { FileWarning, FolderSync, Shield, AlertCircle, Info, LucideIcon, ChevronDown, ChevronUp, ArrowUpDown } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { useState, useEffect } from 'react';
import { getActivities } from '@/lib/api';
import { Activity } from '@/types';

// Add icon mapping
const activityIcons: Record<string, LucideIcon> = {
  'sensitive': FileWarning,
  'scan': FolderSync,
  'security': Shield,
  'alert': AlertCircle,
  'info': Info,
};

type SortConfig = {
  column: keyof Activity | null;
  direction: 'asc' | 'desc';
};

const TableSortHeader = ({ 
  children, 
  column, 
  sortConfig, 
  onSort 
}: { 
  children: React.ReactNode; 
  column: keyof Activity; 
  sortConfig: SortConfig; 
  onSort: (column: keyof Activity) => void;
}) => (
  <TableHead 
    onClick={() => onSort(column)} 
    className="cursor-pointer select-none group"
  >
    <div className="flex items-center justify-between">
      <span>{children}</span>
      <div className="flex items-center text-muted-foreground">
        {sortConfig.column === column ? (
          sortConfig.direction === 'asc' ? (
            <ChevronUp className="h-4 w-4 ml-1" />
          ) : (
            <ChevronDown className="h-4 w-4 ml-1" />
          )
        ) : (
          <ArrowUpDown className="h-4 w-4 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </div>
    </div>
  </TableHead>
);

export function ActivityTimeline() {
  const [currentPage, setCurrentPage] = useState(1);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalPages, setTotalPages] = useState(1);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ column: 'timestamp', direction: 'desc' });

  const ITEMS_PER_PAGE = 20;
  const MAX_VISIBLE_PAGES = 5;

  useEffect(() => {
    const fetchActivities = async () => {
      try {
        setLoading(true);
        const response = await getActivities(currentPage, ITEMS_PER_PAGE);
        setActivities(response.data);
        setTotalPages(response.pagination.totalPages);
      } catch (error) {
        console.error('Failed to fetch activities:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchActivities();
  }, [currentPage]);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'text-red-500';
      case 'medium':
        return 'text-yellow-500';
      case 'low':
        return 'text-blue-500';
      case 'info':
      default:
        return 'text-green-500';
    }
  };

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    
    if (totalPages <= MAX_VISIBLE_PAGES) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    pages.push(1);

    let startPage = Math.max(2, currentPage - Math.floor(MAX_VISIBLE_PAGES / 2));
    let endPage = Math.min(totalPages - 1, startPage + MAX_VISIBLE_PAGES - 3);
    
    if (endPage === totalPages - 1) {
      startPage = Math.max(2, endPage - (MAX_VISIBLE_PAGES - 3));
    }

    if (startPage > 2) {
      pages.push('...');
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    if (endPage < totalPages - 1) {
      pages.push('...');
    }

    if (totalPages > 1) {
      pages.push(totalPages);
    }

    return pages;
  };

  const handleSort = (column: keyof Activity) => {
    setSortConfig(current => ({
      column,
      direction: current.column === column && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const sortedActivities = [...activities].sort((a, b) => {
    if (!sortConfig.column) return 0;

    const aValue = a[sortConfig.column];
    const bValue = b[sortConfig.column];

    if (sortConfig.column === 'timestamp') {
      return sortConfig.direction === 'asc'
        ? new Date(aValue).getTime() - new Date(bValue).getTime()
        : new Date(bValue).getTime() - new Date(aValue).getTime();
    }

    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return sortConfig.direction === 'asc'
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    }

    return 0;
  });

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableSortHeader column="timestamp" sortConfig={sortConfig} onSort={handleSort}>
                Time
              </TableSortHeader>
              <TableSortHeader column="message" sortConfig={sortConfig} onSort={handleSort}>
                Event
              </TableSortHeader>
              <TableSortHeader column="details" sortConfig={sortConfig} onSort={handleSort}>
                Details
              </TableSortHeader>
              <TableSortHeader column="location" sortConfig={sortConfig} onSort={handleSort}>
                Location
              </TableSortHeader>
              <TableSortHeader column="severity" sortConfig={sortConfig} onSort={handleSort}>
                Severity
              </TableSortHeader>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedActivities.map((activity) => {
              const Icon = activityIcons[activity.type] || Info;
              return (
                <TableRow key={activity.id}>
                  <TableCell className="whitespace-nowrap">
                    {format(new Date(activity.timestamp), 'HH:mm:ss')}
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(activity.timestamp), 'MMM d, yyyy')}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-2">
                          <Icon className={`h-4 w-4 ${getSeverityColor(activity.severity)}`} />
                          <span className="font-medium truncate">{activity.message}</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>{activity.details}</TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell className="max-w-[300px]">
                    <span className="line-clamp-2">{activity.details}</span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-sm">
                    {activity.location}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={`${getSeverityColor(activity.severity)}`}
                    >
                      {activity.severity}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center pt-4">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className={currentPage === 1 ? 'pointer-events-none opacity-50' : ''}
                />
              </PaginationItem>

              {getPageNumbers().map((page, index) => (
                <PaginationItem key={index}>
                  {typeof page === 'number' ? (
                    <PaginationLink
                      onClick={() => setCurrentPage(page)}
                      isActive={currentPage === page}
                    >
                      {page}
                    </PaginationLink>
                  ) : (
                    <span className="px-4 py-2">...</span>
                  )}
                </PaginationItem>
              ))}

              <PaginationItem>
                <PaginationNext
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className={currentPage === totalPages ? 'pointer-events-none opacity-50' : ''}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  );
}