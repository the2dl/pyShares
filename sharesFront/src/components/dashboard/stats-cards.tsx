import {
  BarChart3,
  FileWarning,
  FolderSync,
  ShieldAlert,
  Timer,
  Loader2,
} from 'lucide-react';
import { DataCard } from '@/components/ui/data-card';
import { StatsDetailsDialog } from './stats-details-dialog';
import { useState, useEffect } from 'react';
import { getShareStats } from '@/lib/api';

type ActiveStat = 'shares' | 'sensitive' | 'hidden' | 'risk' | 'findings' | null;

export function StatsCards() {
  const [activeStat, setActiveStat] = useState<ActiveStat>(null);
  const [stats, setStats] = useState<ShareStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const data = await getShareStats();
        setStats(data);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch stats:', err);
        setError('Failed to load statistics');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {[...Array(5)].map((_, i) => (
          <DataCard
            key={i}
            title="Loading..."
            value=""
            icon={<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
        {error}
      </div>
    );
  }

  if (!stats) return null;

  const totalFindings = stats.totalSensitiveFiles || 0;

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <DataCard
          title="Total Shares"
          value={stats.totalShares.toLocaleString()}
          icon={<FolderSync className="h-4 w-4 text-muted-foreground" />}
          onClick={() => setActiveStat('shares')}
        />
        <DataCard
          title="Sensitive Files"
          value={stats.totalSensitiveFiles.toLocaleString()}
          icon={<FileWarning className="h-4 w-4 text-muted-foreground" />}
          onClick={() => setActiveStat('sensitive')}
        />
        <DataCard
          title="Hidden Files"
          value={stats.totalHiddenFiles.toLocaleString()}
          icon={<ShieldAlert className="h-4 w-4 text-muted-foreground" />}
          onClick={() => setActiveStat('hidden')}
        />
        <DataCard
          title="Risk Score"
          value={`${stats.riskScore}%`}
          icon={<BarChart3 className="h-4 w-4 text-muted-foreground" />}
          onClick={() => setActiveStat('risk')}
          className={
            stats.riskScore > 75
              ? 'bg-red-50 dark:bg-red-950'
              : stats.riskScore > 50
              ? 'bg-yellow-50 dark:bg-yellow-950'
              : 'bg-green-50 dark:bg-green-950'
          }
        />
        <DataCard
          title="Recent Findings"
          value={totalFindings.toLocaleString()}
          icon={<Timer className="h-4 w-4 text-muted-foreground" />}
          onClick={() => setActiveStat('findings')}
        />
      </div>

      <StatsDetailsDialog
        activeStat={activeStat}
        onClose={() => setActiveStat(null)}
        stats={stats}
      />
    </>
  );
}