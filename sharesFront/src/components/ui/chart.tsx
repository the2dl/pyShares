import { Line, LineChart as RechartsLineChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from 'recharts';

interface ChartProps {
  data: any[];
  categories: string[];
  index: string;
  colors: string[];
  valueFormatter: (value: number) => string;
  showLegend?: boolean;
  showXAxis?: boolean;
  showYAxis?: boolean;
  showTooltip?: boolean;
  startEndOnly?: boolean;
}

export function LineChart({
  data,
  categories,
  index,
  colors,
  valueFormatter,
  showLegend = true,
  showXAxis = true,
  showYAxis = true,
  showTooltip = true,
  startEndOnly = false,
}: ChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <RechartsLineChart data={data}>
        {showXAxis && (
          <XAxis
            dataKey={index}
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            allowDuplicatedCategory={true}
            scale="auto"
            tickFormatter={(value) => {
              if (startEndOnly) {
                const isFirst = data[0][index] === value;
                const isLast = data[data.length - 1][index] === value;
                return isFirst || isLast ? value : '';
              }
              return value;
            }}
          />
        )}
        {showYAxis && (
          <YAxis
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            allowDuplicatedCategory={true}
            scale="auto"
            tickFormatter={valueFormatter}
          />
        )}
        {showTooltip && (
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload) return null;
              return (
                <div className="rounded-lg border bg-background p-2 shadow-sm">
                  <div className="grid grid-cols-2 gap-2">
                    {payload.map((category, i) => (
                      <div key={i} className="flex flex-col">
                        <span className="text-[0.70rem] uppercase text-muted-foreground">
                          {category.name}
                        </span>
                        <span className="font-bold text-muted-foreground">
                          {valueFormatter(category.value as number)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }}
          />
        )}
        {showLegend && (
          <Legend
            content={({ payload }) => {
              if (!payload) return null;
              return (
                <div className="flex flex-wrap gap-4">
                  {payload.map((category, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: category.color }}
                      />
                      <span className="text-sm text-muted-foreground">
                        {category.value}
                      </span>
                    </div>
                  ))}
                </div>
              );
            }}
          />
        )}
        {categories.map((category, i) => (
          <Line
            key={category}
            type="monotone"
            dataKey={category}
            stroke={colors[i]}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </RechartsLineChart>
    </ResponsiveContainer>
  );
}