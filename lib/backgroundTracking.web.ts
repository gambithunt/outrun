export const BACKGROUND_TRACKING_TASK_NAME = 'clubrun-background-location';

type BackgroundTrackingStartResult = {
  enabled: boolean;
  reason: 'granted' | 'permission_denied';
};

export function ensureBackgroundTrackingTaskRegisteredWithExpo() {
  return;
}

export async function startBackgroundTrackingWithExpo(): Promise<BackgroundTrackingStartResult> {
  return {
    enabled: false,
    reason: 'permission_denied',
  };
}

export async function stopBackgroundTrackingWithExpo() {
  return;
}
