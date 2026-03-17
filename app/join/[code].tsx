import { useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

import JoinRunScreen from '@/app/join';

export default function DeepLinkJoinScreen() {
  const { code } = useLocalSearchParams<{ code?: string }>();

  useEffect(() => {
    // Intentionally kept for future analytics or deep-link side effects.
    void code;
  }, [code]);

  return <JoinRunScreen />;
}
