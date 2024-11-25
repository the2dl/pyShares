import { useState, useEffect, useRef, forwardRef } from 'react';
import { Share, DetectionType, SensitiveFile } from '@/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronRight, ArrowUpDown, ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';
import { getShares, getSensitiveFiles } from '@/lib/api';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface SharesTableProps {
  shares: Share[];
  onViewDetails: (shareId: number) => void;
  searchQuery: string;
  detectionFilter: DetectionType | 'all';
  filterType: 'all' | 'hostname' | 'share_name';
  filterValue: string;
}

const ITEMS_PER_PAGE = 10;
const MAX_VISIBLE_PAGES = 10;

type SortConfig = {
  column: keyof Share | 'sensitive_count';
  direction: 'asc' | 'desc';
} | null;

const TableSortHeader = ({ 
  children, 
  column, 
  sortConfig, 
  onSort,
  align = 'left'
}: { 
  children: React.ReactNode; 
  column: keyof Share | 'sensitive_count'; 
  sortConfig: SortConfig; 
  onSort: (column: keyof Share | 'sensitive_count') => void;
  align?: 'left' | 'center' | 'right';
}) => (
  <TableHead 
    onClick={() => onSort(column)} 
    className={`cursor-pointer select-none group ${align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'}`}
  >
    {children}
    <div className="inline-flex items-center text-muted-foreground ml-1">
      {sortConfig?.column === column ? (
        sortConfig.direction === 'asc' ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )
      ) : (
        <ArrowUpDown className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
    </div>
  </TableHead>
);

const filterShares = (
  shares: Share[], 
  searchQuery: string,
  filterType: 'all' | 'hostname' | 'share_name',
  filterValue: string
): Share[] => {
  if (filterType !== 'all' && filterValue.trim()) {
    const normalizedFilterValue = filterValue.toLowerCase().trim();
    return shares.filter(share => {
      if (filterType === 'hostname') {
        return share.hostname.toLowerCase().includes(normalizedFilterValue);
      } else {
        return share.share_name.toLowerCase().includes(normalizedFilterValue);
      }
    });
  }
  return shares;
};

const TooltipButton = forwardRef<
  HTMLButtonElement,
  React.ComponentProps<typeof Button>
>((props, ref) => (
  <Button ref={ref} {...props} />
));
TooltipButton.displayName = 'TooltipButton';

export function SharesTable({
  shares,
  onViewDetails,
  searchQuery,
  detectionFilter,
  filterType,
  filterValue,
}: SharesTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingCounts, setLoadingCounts] = useState<Record<number, boolean>>({});
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const mountedRef = useRef(true);

  const sortData = (data: Share[]) => {
    if (!sortConfig) return data;

    return [...data].sort((a, b) => {
      if (sortConfig.column === 'sensitive_count') {
        const aCount = a.sensitive_file_count || 0;
        const bCount = b.sensitive_file_count || 0;
        return sortConfig.direction === 'asc' ? aCount - bCount : bCount - aCount;
      }

      const aValue = a[sortConfig.column];
      const bValue = b[sortConfig.column];

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortConfig.direction === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortConfig.direction === 'asc'
          ? aValue - bValue
          : bValue - aValue;
      }

      if (aValue instanceof Date && bValue instanceof Date) {
        return sortConfig.direction === 'asc'
          ? aValue.getTime() - bValue.getTime()
          : bValue.getTime() - aValue.getTime();
      }

      return 0;
    });
  };
  
  const safeShares = shares || [];
  const filteredShares = filterShares(safeShares, searchQuery, filterType, filterValue);
  const totalPages = Math.ceil(filteredShares.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;

  const sortedShares = sortData(filteredShares);
  const paginatedShares = sortedShares.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  useEffect(() => {
    // Reset on unmount
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const getAccessLevelBadge = (level: Share['access_level']) => {
    const levelConfig: Record<string, { color: string; description: string }> = {
      'Access Denied': { 
        color: 'bg-gray-600 hover:bg-gray-700', 
        description: 'No access permitted' 
      },
      'Read Only': { 
        color: 'bg-green-600 hover:bg-green-700', 
        description: 'Read-only access to files and folders' 
      },
      'Read/Write': { 
        color: 'bg-yellow-500 hover:bg-yellow-600', 
        description: 'Can read and modify files' 
      },
      'Full Access': { 
        color: 'bg-red-600 hover:bg-red-700', 
        description: 'Complete access - High risk' 
      },
      'List': { 
        color: 'bg-blue-600 hover:bg-blue-700', 
        description: 'Can only list directory contents' 
      },
      'Special': { 
        color: 'bg-purple-600 hover:bg-purple-700', 
        description: 'Custom permissions set' 
      }
    };

    // Log the actual value we're receiving for debugging
    if (!levelConfig[level]) {
      console.log('Unknown access level:', level);
    }

    const config = levelConfig[level] || { 
      color: 'bg-gray-400 hover:bg-gray-500', 
      description: `Unknown access level: ${level}` 
    };
    
    return {
      color: config.color,
      description: config.description
    };
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

  const handleSort = (column: keyof Share | 'sensitive_count') => {
    setSortConfig(current => {
      if (current?.column === column) {
        return current.direction === 'asc'
          ? { column, direction: 'desc' }
          : null;
      }
      return { column, direction: 'asc' };
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Network Shares</CardTitle>
        {searchQuery && (
          <p className="text-sm text-muted-foreground">
            Showing shares that contain "{searchQuery}" in their name, hostname, sensitive files, or root files
          </p>
        )}
      </CardHeader>
      <CardContent>
        <TooltipProvider>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableSortHeader column="hostname" sortConfig={sortConfig} onSort={handleSort} align="left">
                    Hostname
                  </TableSortHeader>
                  <TableSortHeader column="share_name" sortConfig={sortConfig} onSort={handleSort} align="left">
                    Share Name
                  </TableSortHeader>
                  <TableSortHeader column="access_level" sortConfig={sortConfig} onSort={handleSort} align="left">
                    Access Level
                  </TableSortHeader>
                  <TableSortHeader column="total_files" sortConfig={sortConfig} onSort={handleSort} align="right">
                    Total Files
                  </TableSortHeader>
                  <TableSortHeader column="hidden_files" sortConfig={sortConfig} onSort={handleSort} align="right">
                    Hidden Files
                  </TableSortHeader>
                  <TableSortHeader column="sensitive_count" sortConfig={sortConfig} onSort={handleSort} align="right">
                    Sensitive Files
                  </TableSortHeader>
                  <TableSortHeader column="scan_time" sortConfig={sortConfig} onSort={handleSort} align="left">
                    Last Scan
                  </TableSortHeader>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center">Loading...</TableCell>
                  </TableRow>
                ) : paginatedShares.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center">No shares found</TableCell>
                  </TableRow>
                ) : (
                  paginatedShares.map((share) => (
                    <TableRow key={share.id}>
                      <TableCell className="font-medium">{share.hostname}</TableCell>
                      <TableCell>{share.share_name}</TableCell>
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge
                              className={`${getAccessLevelBadge(share.access_level).color} text-white hover:${getAccessLevelBadge(share.access_level).color}`}
                            >
                              {share.access_level}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            {getAccessLevelBadge(share.access_level).description}
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="text-right">
                        {(share.total_files || 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {(share.hidden_files || 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge
                                variant="secondary"
                                className={
                                  share.sensitive_file_count > 0
                                    ? 'bg-yellow-500'
                                    : 'bg-green-500'
                                }
                              >
                                {share.sensitive_file_count}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              {share.sensitive_file_count === 0
                                ? 'No sensitive files detected'
                                : `${share.sensitive_file_count} sensitive files found`}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </TableCell>
                      <TableCell>{format(new Date(share.scan_time), 'MMM d, yyyy HH:mm')}</TableCell>
                      <TableCell className="text-right">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onViewDetails(share.id)}
                            >
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>View share details</TooltipContent>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex justify-center">
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
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}