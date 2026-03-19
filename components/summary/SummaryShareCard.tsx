import { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { useAppTheme } from '@/contexts/ThemeContext';
import {
  projectRoutePreviewLayout,
  ROUTE_PREVIEW_COLORS,
  ROUTE_PREVIEW_LEGEND,
} from '@/lib/routePreview';
import { SummaryShareData } from '@/lib/shareService';

type SummaryShareCardProps = {
  data: SummaryShareData;
  testID?: string;
};

type StandoutHighlight = {
  name: string;
  vehicle: string | null;
  detail: string | null;
};

function splitMetricValue(value: string) {
  const match = value.match(/^(.+?)\s([A-Za-z/]+)$/);
  if (!match) {
    return { primary: value, unit: null };
  }

  return {
    primary: match[1],
    unit: match[2],
  };
}

export function SummaryShareCard({ data, testID }: SummaryShareCardProps) {
  const { theme } = useAppTheme();
  const standout = parseStandoutHighlight(data.driverHighlights[0]);
  const fuelLines = data.fuelLines.length > 0 ? data.fuelLines : ['No fuel story recorded.'];
  const hazardLines = data.hazardBreakdown.slice(0, 4);

  return (
    <View
      testID={testID}
      style={{
        borderRadius: 30,
        padding: 16,
        gap: 14,
        backgroundColor: theme.colors.surface,
      }}
    >
      <View
        style={{
          borderRadius: 26,
          paddingHorizontal: 22,
          paddingVertical: 20,
          backgroundColor: theme.colors.accent,
          gap: 6,
        }}
      >
        <Text
          style={{
            color: theme.colors.onAccent,
            fontSize: 28,
            lineHeight: 32,
            fontWeight: '800',
            letterSpacing: -0.6,
          }}
        >
          {data.title}
        </Text>
        <Text style={{ color: theme.colors.onAccent, fontSize: 16, lineHeight: 22, opacity: 0.9 }}>
          {data.subtitle}
        </Text>
        <Text style={{ color: theme.colors.onAccent, fontSize: 14, opacity: 0.76 }}>
          Generated {data.generatedDate}
        </Text>
      </View>

      {data.routePreview ? (
        <SurfaceSection>
          <Text style={eyebrowStyle(theme.colors.textSecondary)}>Route replay</Text>
          <Text style={{ color: theme.colors.textSecondary, fontSize: 15, lineHeight: 22 }}>
            A quick read on how the convoy moved, from the calmest sections to the fastest stretch.
          </Text>
          <RoutePreviewCard data={data} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {ROUTE_PREVIEW_LEGEND.map((item) => (
              <View
                key={item.label}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 999,
                  backgroundColor: theme.colors.surface,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: item.color,
                  }}
                />
                <Text style={{ color: theme.colors.textSecondary, fontSize: 12, fontWeight: '600' }}>
                  {item.label}
                </Text>
              </View>
            ))}
          </View>
        </SurfaceSection>
      ) : (
        <SurfaceSection>
          <Text style={{ color: theme.colors.textSecondary, fontSize: 15, lineHeight: 22 }}>
            Route replay unavailable.
          </Text>
        </SurfaceSection>
      )}

      <SurfaceSection>
        <Text style={eyebrowStyle(theme.colors.textSecondary)}>Run recap</Text>
        <Text style={{ color: theme.colors.textPrimary, fontSize: 13, fontWeight: '600', marginTop: 2 }}>
          Distance
        </Text>
        <MetricValue primarySize={42} unitSize={22} value={data.distanceLabel} />
        <Divider />
        <MetricRow label="Drive time" value={data.durationLabel} />
        <Divider />
        <MetricRow label="Hazards called out" value={data.hazardsLabel} />
      </SurfaceSection>

      <SurfaceSection>
        <Text style={eyebrowStyle(theme.colors.textSecondary)}>Convoy spotlight</Text>
        <Text
          style={{
            color: theme.colors.textPrimary,
            fontSize: 24,
            lineHeight: 28,
            fontWeight: '800',
            letterSpacing: -0.5,
          }}
        >
          {standout.name}
        </Text>
        {standout.vehicle ? (
          <Text style={{ color: theme.colors.textPrimary, fontSize: 17, lineHeight: 22, fontWeight: '600' }}>
            {standout.vehicle}
          </Text>
        ) : null}
        <Text style={{ color: theme.colors.textSecondary, fontSize: 15, lineHeight: 22 }}>
          {standout.detail ?? 'No driver spotlight was captured for this run.'}
        </Text>
      </SurfaceSection>

      <SurfaceSection>
        <Text style={eyebrowStyle(theme.colors.textSecondary)}>Fuel story</Text>
        <View style={{ gap: 12 }}>
          {fuelLines.map((line) => {
            const [label, value] = splitMetricLine(line);
            return <MetricRow key={line} label={label} value={value} />;
          })}
        </View>
      </SurfaceSection>

      <SurfaceSection>
        <Text style={eyebrowStyle(theme.colors.textSecondary)}>Hazards called out</Text>
        {hazardLines.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {hazardLines.map((line) => (
              <View
                key={line}
                style={{
                  borderRadius: 999,
                  backgroundColor: theme.colors.accentMuted,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  }}
                >
                <Text style={{ color: theme.colors.textPrimary, fontSize: 15, fontWeight: '600' }}>{line}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={{ color: theme.colors.textSecondary, fontSize: 15, lineHeight: 22 }}>
            No hazards were called out.
          </Text>
        )}
      </SurfaceSection>
    </View>
  );
}

function SurfaceSection({ children }: { children: ReactNode }) {
  const { theme } = useAppTheme();

  return (
    <View
      style={{
        borderRadius: 24,
        padding: 18,
        backgroundColor: theme.colors.surfaceElevated,
        borderWidth: 1,
        borderColor: theme.colors.border,
        gap: 8,
      }}
    >
      {children}
    </View>
  );
}

function MetricValue({
  value,
  primarySize,
  unitSize,
}: {
  value: string;
  primarySize: number;
  unitSize: number;
}) {
  const { theme } = useAppTheme();
  const { primary, unit } = splitMetricValue(value);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: unit ? 6 : 0 }}>
      <Text
        style={{
          color: theme.colors.textPrimary,
          fontSize: primarySize,
          lineHeight: primarySize + 4,
          fontWeight: '800',
          letterSpacing: -0.8,
          flexShrink: 1,
        }}
      >
        {primary}
      </Text>
      {unit ? (
        <Text
          style={{
            color: theme.colors.textSecondary,
            fontSize: unitSize,
            lineHeight: unitSize + 4,
            fontWeight: '600',
            marginBottom: 3,
          }}
        >
          {unit}
        </Text>
      ) : null}
    </View>
  );
}

function RoutePreviewCard({ data }: { data: SummaryShareData }) {
  const { theme } = useAppTheme();
  const layout = projectRoutePreviewLayout(data.routePreview, 320, 180, 18);
  if (!layout) {
    return null;
  }
  const projectedPoints = layout.projectedPoints;

  return (
    <View
      style={{
        aspectRatio: 16 / 9,
        borderRadius: 24,
        overflow: 'hidden',
        backgroundColor: '#EEF3F8',
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      <View style={{ ...absoluteFill, backgroundColor: '#EEF3F8' }} />
      <View
        style={{
          position: 'absolute',
          top: 18,
          right: 18,
          bottom: 18,
          left: 18,
          borderRadius: 20,
          backgroundColor: '#E7EEF6',
        }}
      />

      {layout.contextPaths.map((path, index) => (
        <Polyline key={`context-${index}`} points={path} color="#FFFFFF" width={5} opacity={0.72} />
      ))}

      <Polyline points={projectedPoints} color="#D2DCE8" width={14} />

      {layout.colorRuns.map((run, index) => (
        <Polyline
          key={`route-run-${index}`}
          points={run.points}
          color={ROUTE_PREVIEW_COLORS[run.bucket]}
          width={9}
        />
      ))}

      <View
        style={{
          left: projectedPoints[0].x - 7,
          top: projectedPoints[0].y - 7,
          position: 'absolute',
          width: 12,
          height: 12,
          borderRadius: 6,
          backgroundColor: '#FFFFFF',
          borderWidth: 2,
          borderColor: '#6E90B2',
        }}
      />
      <View
        style={{
          left: projectedPoints[projectedPoints.length - 1].x - 7,
          top: projectedPoints[projectedPoints.length - 1].y - 7,
          position: 'absolute',
          width: 12,
          height: 12,
          borderRadius: 6,
          backgroundColor: '#FFFFFF',
          borderWidth: 2,
          borderColor: '#0F172A',
        }}
      />
    </View>
  );
}

function Polyline({
  points,
  color,
  width,
  opacity = 1,
}: {
  points: Array<{ x: number; y: number }>;
  color: string;
  width: number;
  opacity?: number;
}) {
  if (points.length < 2) {
    return null;
  }

  return (
    <>
      {points.slice(1).map((point, index) => {
        const previousPoint = points[index];
        const dx = point.x - previousPoint.x;
        const dy = point.y - previousPoint.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const midpointX = previousPoint.x + dx / 2;
        const midpointY = previousPoint.y + dy / 2;
        const rotation = `${Math.atan2(dy, dx)}rad`;

        return (
          <View
            key={`${color}-${index}-${length}`}
            style={{
              position: 'absolute',
              left: midpointX - length / 2,
              top: midpointY - width / 2,
              width: length,
              height: width,
              borderRadius: 999,
              backgroundColor: color,
              opacity,
              transform: [{ rotate: rotation }],
            }}
          />
        );
      })}
    </>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  const { theme } = useAppTheme();

  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
      <Text style={{ color: theme.colors.textSecondary, fontSize: 16, lineHeight: 22 }}>{label}</Text>
      <Text
        style={{
          color: theme.colors.textPrimary,
          fontSize: 18,
          lineHeight: 22,
          fontWeight: '600',
          flexShrink: 1,
          textAlign: 'right',
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function Divider() {
  const { theme } = useAppTheme();
  return <View style={{ height: 1, backgroundColor: theme.colors.border }} />;
}

function splitMetricLine(line: string) {
  const separatorIndex = line.indexOf(':');
  if (separatorIndex === -1) {
    return [line, ''] as const;
  }

  return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1).trim()] as const;
}

function parseStandoutHighlight(line?: string): StandoutHighlight {
  if (!line) {
    return {
      name: 'No convoy spotlight',
      vehicle: null,
      detail: 'No driver spotlight was captured for this run.',
    };
  }

  const [name, vehicle, detail] = line.split(' • ');
  return {
    name: name ?? line,
    vehicle: vehicle ?? null,
    detail: detail ?? null,
  };
}

function eyebrowStyle(color: string) {
  return {
    color,
    fontSize: 12,
    fontWeight: '600' as const,
    letterSpacing: 0.45,
    textTransform: 'uppercase' as const,
  };
}

const absoluteFill = {
  position: 'absolute' as const,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};
