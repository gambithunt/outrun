import { Image, Text, View } from 'react-native';

import { useAppTheme } from '@/contexts/ThemeContext';
import { SummaryShareData } from '@/lib/shareService';

type SummaryShareCardProps = {
  data: SummaryShareData;
  testID?: string;
};

export function SummaryShareCard({ data, testID }: SummaryShareCardProps) {
  const { theme } = useAppTheme();

  return (
    <View
      testID={testID}
      style={{
        borderRadius: 28,
        padding: 20,
        gap: 16,
        backgroundColor: theme.colors.surfaceElevated,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      <View
        style={{
          borderRadius: 24,
          padding: 20,
          backgroundColor: theme.colors.accent,
          gap: 6,
        }}
      >
        <Text style={{ color: theme.colors.onAccent, fontSize: 28, fontWeight: '800' }}>
          {data.title}
        </Text>
        <Text style={{ color: theme.colors.onAccent, opacity: 0.86 }}>{data.subtitle}</Text>
        <Text style={{ color: theme.colors.onAccent, opacity: 0.72 }}>
          Generated {data.generatedDate}
        </Text>
      </View>

      {data.routeThumbnailUri ? (
        <Image
          source={{ uri: data.routeThumbnailUri }}
          style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 24 }}
          resizeMode="cover"
        />
      ) : (
        <View
          style={{
            borderRadius: 24,
            padding: 18,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
          }}
        >
          <Text style={{ color: theme.colors.textSecondary }}>Route preview unavailable.</Text>
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <ShareStat label="Distance" value={data.distanceLabel} />
        <ShareStat label="Drive Time" value={data.durationLabel} />
        <ShareStat label="Hazards" value={data.hazardsLabel} />
      </View>

      <ShareSection title="Fuel totals" lines={data.fuelLines} emptyLabel="No fuel data recorded." />
      <ShareSection
        title="Driver highlights"
        lines={data.driverHighlights}
        emptyLabel="No driver summary data available."
      />
      <ShareSection
        title="Hazard breakdown"
        lines={data.hazardBreakdown}
        emptyLabel="No hazards were reported."
      />
    </View>
  );
}

function ShareStat({ label, value }: { label: string; value: string }) {
  const { theme } = useAppTheme();

  return (
    <View
      style={{
        flex: 1,
        borderRadius: 20,
        padding: 14,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      <Text style={{ color: theme.colors.textSecondary, fontSize: 12, textTransform: 'uppercase' }}>
        {label}
      </Text>
      <Text style={{ color: theme.colors.textPrimary, marginTop: 6, fontWeight: '700' }}>{value}</Text>
    </View>
  );
}

function ShareSection({
  title,
  lines,
  emptyLabel,
}: {
  title: string;
  lines: string[];
  emptyLabel: string;
}) {
  const { theme } = useAppTheme();

  return (
    <View
      style={{
        borderRadius: 20,
        padding: 16,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.border,
        gap: 8,
      }}
    >
      <Text style={{ color: theme.colors.textSecondary }}>{title}</Text>
      {(lines.length > 0 ? lines : [emptyLabel]).map((line) => (
        <Text key={`${title}-${line}`} style={{ color: theme.colors.textPrimary, lineHeight: 20 }}>
          {line}
        </Text>
      ))}
    </View>
  );
}
