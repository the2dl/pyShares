import { useState, useEffect, useCallback } from 'react';
import {
  ReactFlow,
  Node,
  Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ThemeProvider } from '@/components/theme/theme-provider';
import { NavigationMenu } from '@/components/ui/navigation-menu';
import { Link } from 'react-router-dom';
import { Loader2, Folder, File, Shield, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getShares, getShareStructure, getScanSessions } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format } from 'date-fns';
import type { ScanSession } from '@/types';
import { ChevronDownIcon } from '@radix-ui/react-icons';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Move node components outside of NetworkMap
const ShareNode = ({ data, isExpanded }: { data: any, isExpanded: boolean }) => (
  <div 
    className={`px-4 py-2 shadow-lg rounded-md border bg-background min-w-[200px] cursor-pointer
      ${isExpanded ? 'border-blue-500' : ''}
      hover:border-blue-300 transition-colors duration-200`}
  >
    <Handle
      type="source"
      position={Position.Right}
      style={{ visibility: 'hidden' }}
    />
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Folder className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{data.label}</span>
      </div>
      <ChevronDownIcon 
        className={`h-4 w-4 transition-transform duration-200
          ${isExpanded ? 'rotate-180' : ''}`}
      />
    </div>
    {data.stats && (
      <div className="mt-2 text-xs text-muted-foreground">
        <div>Files: {data.stats.total_files}</div>
        <div>Sensitive: {data.stats.sensitive_files}</div>
      </div>
    )}
  </div>
);

const FileNode = ({ data }: { data: any }) => (
  <div className={`px-4 py-2 shadow-lg rounded-md border bg-background ${
    data.sensitive ? 'border-red-500' : ''
  }`}>
    <Handle
      type="target"
      position={Position.Left}
      style={{ visibility: 'hidden' }}
    />
    <div className="flex items-center gap-2">
      {data.sensitive ? (
        <Shield className="h-4 w-4 text-red-500" />
      ) : (
        <File className="h-4 w-4 text-muted-foreground" />
      )}
      <span className="max-w-[200px] truncate" title={data.label}>
        {data.label}
      </span>
      {data.sensitive && (
        <Badge variant="destructive" className="ml-2">
          Sensitive
        </Badge>
      )}
    </div>
    {data.sensitive && data.detectionTypes && (
      <div className="mt-1 flex gap-1 flex-wrap">
        {data.detectionTypes.map((type: string, index: number) => (
          <Badge key={index} variant="outline" className="text-xs">
            {type}
          </Badge>
        ))}
      </div>
    )}
  </div>
);

// Add a new FolderNode component
const FolderNode = ({ data }: { data: any }) => (
  <div className="px-4 py-2 shadow-lg rounded-md border bg-background min-w-[150px]">
    <Handle
      type="target"
      position={Position.Left}
      style={{ visibility: 'hidden' }}
    />
    <Handle
      type="source"
      position={Position.Right}
      style={{ visibility: 'hidden' }}
    />
    <div className="flex items-center gap-2">
      <Folder className="h-4 w-4 text-muted-foreground" />
      <span className="font-medium">{data.label}</span>
    </div>
  </div>
);

// Register node types outside of the component
const nodeTypes = {
  share: ShareNode,
  file: FileNode,
  folder: FolderNode,
};

export function NetworkMap() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedShare, setSelectedShare] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'hostname' | 'share_name'>('hostname');
  const [hasSearched, setHasSearched] = useState(false);
  const [sessions, setSessions] = useState<ScanSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<number | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const sessionsData = await getScanSessions();
        setSessions(sessionsData);
        
        // Find and select the latest session by comparing start_time
        if (sessionsData.length > 0) {
          const latestSession = sessionsData.reduce((latest, current) => {
            return new Date(current.start_time) > new Date(latest.start_time) ? current : latest;
          });
          setSelectedSession(latestSession.id);
        }
      } catch (error) {
        console.error('Failed to fetch sessions:', error);
        setError('Failed to load scan sessions');
      }
    };

    fetchSessions();
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim() || !selectedSession) {
      setError('Please enter a search term and select a session');
      return;
    }

    console.log('Starting search with:', { searchTerm, filterType, selectedSession });
    setLoading(true);
    setError(null);
    setHasSearched(true);
    
    try {
      // Always limit network map results to 20 shares
      const shares = await getShares(
        searchTerm,
        undefined,
        filterType,
        searchTerm,
        selectedSession?.toString(),
        1,  // page
        20  // limit
      );
      
      console.log(`Fetched ${shares.length} shares`);
      
      if (shares.length === 0) {
        setError('No shares found matching your search');
        setNodes([]);
        setEdges([]);
        return;
      }

      // Create nodes from the shares
      const shareNodes = shares.map((share, index) => ({
        id: `share-${share.id}`,
        type: 'share',
        position: { 
          x: 100 + (index * 250), 
          y: 100
        },
        data: {
          id: `share-${share.id}`,
          label: `${share.hostname}/${share.share_name}`,
          shareId: share.id,
          stats: {
            total_files: share.total_files || 0,
            sensitive_files: share.sensitive_file_count || 0,
          },
          isExpanded: expandedNodes.has(`share-${share.id}`),
        },
      }));

      setNodes(shareNodes);
      setEdges([]);

      // Set warning message if results were limited, but still show the results
      if (shares.length === 20) {
        setError('Note: Showing first 20 matching shares. Please refine your search for more specific results.');
      } else {
        setError(null);
      }
      
    } catch (error) {
      console.error('Failed to fetch shares:', error);
      setError('Failed to load shares. Please try again.');
      setNodes([]);
      setEdges([]);
    } finally {
      setLoading(false);
    }
  };

  // Handle node click with minimal initial load
  const onNodeClick = useCallback(async (event: any, node: Node) => {
    if (!node.data.shareId) return;

    if (expandedNodes.has(node.id)) {
      setExpandedNodes(prev => {
        const next = new Set(prev);
        next.delete(node.id);
        return next;
      });
      
      // Remove all child nodes and edges
      setNodes(nds => nds.filter(n => !n.data.parentId || n.data.parentId !== node.id));
      setEdges(eds => eds.filter(e => !e.source.startsWith(node.id) && !e.target.startsWith(`file-${node.data.shareId}`)));
      
      return;
    }

    try {
      const structure = await getShareStructure(node.data.shareId, 1, 10);
      console.log(`Fetched structure:`, structure);
      
      setExpandedNodes(prev => new Set(prev).add(node.id));

      const newNodes: Node[] = [];
      const newEdges: Edge[] = [];
      
      // Group files by their folder path
      const folderStructure: { [key: string]: any[] } = {};
      structure.files.forEach((file: any) => {
        const folderPath = file.file_path.split('/').slice(0, -1).join('/') || '/';
        if (!folderStructure[folderPath]) {
          folderStructure[folderPath] = [];
        }
        folderStructure[folderPath].push(file);
      });

      // Calculate initial positions
      const FOLDER_SPACING = 200;
      const FILE_SPACING = 100;
      let currentY = node.position.y - (Object.keys(folderStructure).length * FOLDER_SPACING) / 2;

      // Create folder nodes and their files
      Object.entries(folderStructure).forEach(([folderPath, files], folderIndex) => {
        const folderId = `folder-${node.data.shareId}-${folderIndex}`;
        
        // Add folder node
        newNodes.push({
          id: folderId,
          type: 'folder',
          position: { 
            x: node.position.x + 300,
            y: currentY
          },
          data: {
            label: folderPath === '/' ? 'Root' : folderPath.split('/').pop(),
            parentId: node.id
          }
        });

        // Connect share to folder
        newEdges.push({
          id: `edge-${node.id}-${folderId}`,
          source: node.id,
          target: folderId,
          type: 'smoothstep',
          style: { stroke: '#94a3b8', strokeWidth: 2 },
        });

        // Add files for this folder
        files.forEach((file: any, fileIndex: number) => {
          const fileNodeId = `file-${node.data.shareId}-${folderIndex}-${fileIndex}`;
          
          newNodes.push({
            id: fileNodeId,
            type: 'file',
            position: { 
              x: node.position.x + 600,
              y: currentY + (fileIndex * FILE_SPACING) - ((files.length - 1) * FILE_SPACING) / 2
            },
            data: {
              label: file.file_name,
              sensitive: file.is_sensitive,
              detectionTypes: file.detection_types,
              parentId: folderId
            }
          });

          // Connect folder to file
          newEdges.push({
            id: `edge-${folderId}-${fileNodeId}`,
            source: folderId,
            target: fileNodeId,
            type: 'smoothstep',
            animated: file.is_sensitive,
            style: { 
              stroke: file.is_sensitive ? '#ef4444' : '#94a3b8',
              strokeWidth: 2
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 20,
              height: 20,
              color: file.is_sensitive ? '#ef4444' : '#94a3b8',
            },
          });
        });

        currentY += FOLDER_SPACING;
      });

      setNodes(nds => [...nds, ...newNodes]);
      setEdges(eds => [...eds, ...newEdges]);

      // Fit view after adding new nodes
      setTimeout(() => {
        const flowInstance = document.querySelector('.react-flow')
          ?.reactFlowInstance;
        if (flowInstance) {
          flowInstance.fitView({ padding: 0.2 });
        }
      }, 50);

    } catch (error) {
      console.error('Failed to fetch share structure:', error);
      setError('Failed to load file structure. Please try again.');
    }
  }, [expandedNodes]);

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
              <BreadcrumbPage>Network Map</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <Card className="min-h-[800px]">
          <CardHeader>
            <CardTitle>Network Share Map</CardTitle>
            <form onSubmit={handleSearch} className="flex gap-4 items-end mt-4">
              <div className="grid w-full max-w-sm items-center gap-1.5">
                <Label htmlFor="session">Scan Session</Label>
                <Select
                  value={selectedSession?.toString() || ''}
                  onValueChange={(value) => setSelectedSession(Number(value))}
                >
                  <SelectTrigger className="w-[300px]">
                    <SelectValue placeholder="Select scan session" />
                  </SelectTrigger>
                  <SelectContent>
                    {sessions.map((session) => (
                      <SelectItem key={session.id} value={session.id.toString()}>
                        {format(new Date(session.start_time), 'MMM d, yyyy HH:mm')} 
                        {' - '}
                        {session.total_shares} shares
                        {session.error_message && ' (Partial)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid w-full max-w-sm items-center gap-1.5">
                <Label htmlFor="filter-type">Search By</Label>
                <Select
                  value={filterType}
                  onValueChange={(value: 'hostname' | 'share_name') => setFilterType(value)}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Select filter type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hostname">Hostname</SelectItem>
                    <SelectItem value="share_name">Share Name</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid w-full max-w-sm items-center gap-1.5">
                <Label htmlFor="search">Search Term</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Input
                        type="text"
                        id="search"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder={`Enter ${filterType === 'hostname' ? 'hostname' : 'share name'}...`}
                        className="w-[300px]"
                      />
                    </TooltipTrigger>
                    {filterType === 'hostname' && (
                      <TooltipContent>
                        <p>Only the first 20 shares will be displayed</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Search
                  </>
                )}
              </Button>
            </form>
          </CardHeader>
          <CardContent className="h-[700px]">
            {error && !nodes.length ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-red-500">{error}</div>
              </div>
            ) : !hasSearched ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Enter a hostname or share name to begin
              </div>
            ) : nodes.length > 0 ? (
              <>
                {error && (
                  <div className="mb-4 p-2 bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 rounded">
                    {error}
                  </div>
                )}
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onNodeClick={onNodeClick}
                  nodeTypes={nodeTypes}
                  fitView
                  minZoom={0.1}
                  maxZoom={1.5}
                  defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
                  connectionMode="loose"
                  snapToGrid={false}
                  elementsSelectable={true}
                  nodesConnectable={false}
                  fitViewOptions={{ padding: 0.2 }}
                >
                  <Background />
                  <Controls />
                </ReactFlow>
              </>
            ) : loading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </ThemeProvider>
  );
} 