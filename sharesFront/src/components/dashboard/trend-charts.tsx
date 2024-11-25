import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart } from '@/components/ui/chart';
import { getDetectionTrends } from '@/lib/api';
import { Loader2 } from 'lucide-react';

export function TrendCharts() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTrends = async () => {
      try {
        setLoading(true);
        setError(null);
        const trends = await getDetectionTrends();
        setData(trends);
      } catch (err) {
        console.error('Failed to fetch trends:', err);
        setError('Failed to load detection trends');
      } finally {
        setLoading(false);
      }
    };

    fetchTrends();
  }, []);

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Detection Trends (30 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[300px] items-center justify-center text-destructive">
            {error}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Detection Trends (30 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[300px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Detection Trends (30 Days)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <LineChart
            data={data}
            categories={['credential', 'pii', 'financial', 'hr', 'security', 'sensitive']}
            index="date"
            colors={[
              'hsl(var(--primary))',         // credential - blue
              'hsl(var(--destructive))',      // pii - red
              'hsl(var(--success))',          // financial - green
              'hsl(var(--warning))',          // hr - yellow/orange
              'hsl(var(--secondary))',        // security - purple
              'hsl(var(--muted-foreground))' // sensitive - gray
            ]}
            valueFormatter={(value: number) => value.toString()}
            showLegend
            showXAxis
            showYAxis
            showTooltip
            startEndOnly={false}
          />
        </div>
      </CardContent>
    </Card>
  );
}