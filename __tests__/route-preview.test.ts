import { projectRoutePreviewLayout, smoothSpeedBuckets } from '@/lib/routePreview';

describe('routePreview helpers', () => {
  it('smooths isolated speed spikes into calmer runs', () => {
    expect(smoothSpeedBuckets([1, 3, 1, 2, 2])).toEqual([1, 1, 1, 2, 2]);
  });

  it('projects a preview into merged color runs with background context', () => {
    const layout = projectRoutePreviewLayout(
      {
        points: [
          [-26.2041, 28.0473],
          [-26.18, 28.08],
          [-26.12, 28.14],
          [-26.05, 28.2],
          [-26.0, 28.24],
        ],
        speedBuckets: [1, 3, 1, 1],
      },
      320,
      180,
      18
    );

    expect(layout?.projectedPoints).toHaveLength(5);
    expect(layout?.colorRuns.map((run) => run.bucket)).toEqual([1]);
    expect(layout?.contextPaths.length).toBeGreaterThan(1);
  });
});
