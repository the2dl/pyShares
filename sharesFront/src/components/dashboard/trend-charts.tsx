import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart } from '@/components/ui/chart';
import { getDetectionTrends, getSensitivePatterns } from '@/lib/api';
import { Loader2 } from 'lucide-react';

export function TrendCharts() {
  const [data, setData] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Fetch detection types from patterns
        const patterns = await getSensitivePatterns();
        const uniqueTypes = Array.from(new Set(patterns.map(p => p.type)));
        
        // Fetch trend data
        const trends = await getDetectionTrends();
        
        // Filter out detection types with no data
        const activeTypes = uniqueTypes.filter(type => 
          trends.some(point => point[type] && point[type] > 0)
        );
        
        setCategories(activeTypes);
        setData(trends);
      } catch (err) {
        console.error('Failed to fetch data:', err);
        setError('Failed to load detection trends');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
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
            categories={categories}
            index="date"
            colors={['hsl(var(--primary))']}
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