import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppTextInput } from '@/components/ui/AppTextInput';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useAuthSession } from '@/contexts/AuthContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { getSuggestedMakes, getSuggestedModels } from '@/lib/carData';
import {
  loadDriverProfileDraft,
  saveDriverProfileDraft,
  saveDriverProfileWithFirebase,
} from '@/lib/profileService';
import { listGarageCarsWithFirebase, loadUserProfileWithFirebase } from '@/lib/userProfileService';
import { useRunSessionStore } from '@/stores/runSessionStore';
import { FuelType, GarageCar } from '@/types/domain';

const FUEL_TYPES: FuelType[] = ['petrol', 'diesel', 'electric', 'hybrid'];

export default function DriverProfileScreen() {
  const router = useRouter();
  const { runId, code } = useLocalSearchParams<{ runId?: string; code?: string }>();
  const auth = useAuthSession();
  const { theme } = useAppTheme();
  const setSession = useRunSessionStore((state) => state.setSession);
  const [name, setName] = useState('');
  const [carMake, setCarMake] = useState('');
  const [carModel, setCarModel] = useState('');
  const [engineSize, setEngineSize] = useState('');
  const [engineUnit, setEngineUnit] = useState<'cc' | 'litres'>('litres');
  const [fuelType, setFuelType] = useState<FuelType>('petrol');
  const [fuelEfficiency, setFuelEfficiency] = useState('');
  const [garage, setGarage] = useState<GarageCar[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function applyGarageCar(car: GarageCar) {
    setCarMake(car.make);
    setCarModel(car.model);
    setFuelType(car.fuelType);
  }

  function applyDraft(input: {
    name: string;
    carMake: string;
    carModel: string;
    engineSize: string;
    engineUnit: 'cc' | 'litres';
    fuelType: FuelType;
    fuelEfficiency: string;
  }) {
    setName(input.name);
    setCarMake(input.carMake);
    setCarModel(input.carModel);
    setEngineSize(input.engineSize);
    setEngineUnit(input.engineUnit);
    setFuelType(input.fuelType);
    setFuelEfficiency(input.fuelEfficiency);
  }

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const draft = await loadDriverProfileDraft();
      if (cancelled) {
        return;
      }

      if (draft) {
        applyDraft({
          name: draft.name,
          carMake: draft.carMake,
          carModel: draft.carModel,
          engineSize: draft.engineSize ?? '',
          engineUnit: draft.engineUnit ?? 'litres',
          fuelType: draft.fuelType,
          fuelEfficiency: draft.fuelEfficiency ? String(draft.fuelEfficiency) : '',
        });
        return;
      }

      if (!auth.userId || auth.isAnonymous) {
        return;
      }

      const [profile, cars] = await Promise.all([
        loadUserProfileWithFirebase(auth.userId),
        listGarageCarsWithFirebase(auth.userId),
      ]);
      if (cancelled) {
        return;
      }

      if (profile) {
        setName(profile.displayName);
      }
      setGarage(cars);
      if (cars[0]) {
        applyGarageCar(cars[0]);
      }
    }

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, [auth.isAnonymous, auth.userId]);

  const makeSuggestions = useMemo(() => getSuggestedMakes(carMake), [carMake]);
  const modelSuggestions = useMemo(() => getSuggestedModels(carMake, carModel), [carMake, carModel]);

  async function handleSaveProfile() {
    setError(null);
    setIsSubmitting(true);

    try {
      const saved = await saveDriverProfileWithFirebase(runId ?? '', {
        name,
        carMake,
        carModel,
        engineSize,
        engineUnit,
        fuelType,
        fuelEfficiency,
      });

      await saveDriverProfileDraft(saved.profile);
      setSession({
        runId: runId ?? '',
        driverId: saved.driverId,
        driverName: saved.profile.name,
        joinCode: code ?? null,
        role: 'driver',
        status: 'draft',
      });
      router.push(`/run/${runId}/map`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to save driver profile.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Screen scrollable testID="screen-driver-profile" contentContainerStyle={{ gap: 16, paddingBottom: 48 }}>
      <AppCard>
        <Text
          style={{
            color: theme.colors.textPrimary,
            fontSize: 28,
            fontWeight: '800',
          }}
        >
          Driver Profile
        </Text>
        <Text style={{ color: theme.colors.textSecondary, lineHeight: 22 }}>
          This profile is used for live map labels and post-run fuel estimates. It is cached locally
          on your device for the next join.
        </Text>
      </AppCard>

      <AppCard>
        {garage.length > 0 ? (
          <View style={{ gap: 10 }}>
            <Text style={{ color: theme.colors.textPrimary, fontWeight: '700' }}>Saved garage</Text>
            <View style={{ gap: 10 }}>
              {garage.map((car) => (
                <AppButton
                  key={car.id}
                  label={`${car.nickname}: ${car.make} ${car.model}`}
                  onPress={() => applyGarageCar(car)}
                  variant="secondary"
                  size="compact"
                  testID={`button-garage-car-${car.id}`}
                />
              ))}
            </View>
          </View>
        ) : null}
        <AppTextInput
          label="Display name"
          value={name}
          onChangeText={setName}
          placeholder="Jamie"
          testID="input-driver-name"
        />
        <AppTextInput
          label="Car make"
          value={carMake}
          onChangeText={setCarMake}
          placeholder="BMW"
          testID="input-car-make"
        />
        <SuggestionRow
          suggestions={makeSuggestions}
          onSelect={setCarMake}
          testIDPrefix="suggestion-make"
        />
        <AppTextInput
          label="Car model"
          value={carModel}
          onChangeText={setCarModel}
          placeholder="M3 Competition"
          testID="input-car-model"
        />
        <SuggestionRow
          suggestions={modelSuggestions}
          onSelect={setCarModel}
          testIDPrefix="suggestion-model"
        />
        <AppTextInput
          label="Engine size"
          value={engineSize}
          onChangeText={setEngineSize}
          placeholder={engineUnit === 'litres' ? '3.0' : '3000'}
          testID="input-engine-size"
        />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <AppButton
            label="Litres"
            onPress={() => setEngineUnit('litres')}
            variant={engineUnit === 'litres' ? 'primary' : 'secondary'}
            testID="engine-unit-litres"
          />
          <AppButton
            label="CC"
            onPress={() => setEngineUnit('cc')}
            variant={engineUnit === 'cc' ? 'primary' : 'secondary'}
            testID="engine-unit-cc"
          />
        </View>
        <Text style={{ color: theme.colors.textPrimary, fontWeight: '700' }}>Fuel type</Text>
        <View style={{ gap: 12 }}>
          {FUEL_TYPES.map((value) => (
            <AppButton
              key={value}
              label={value.charAt(0).toUpperCase() + value.slice(1)}
              onPress={() => setFuelType(value)}
              variant={fuelType === value ? 'primary' : 'secondary'}
              testID={`fuel-type-${value}`}
            />
          ))}
        </View>
        <AppTextInput
          label={fuelType === 'electric' ? 'Efficiency (mi/kWh)' : 'Fuel efficiency (MPG)'}
          value={fuelEfficiency}
          onChangeText={setFuelEfficiency}
          placeholder={fuelType === 'electric' ? '3.6' : '28'}
          testID="input-fuel-efficiency"
        />
        {error ? <Text style={{ color: theme.colors.danger }}>{error}</Text> : null}
        {isSubmitting ? <LoadingSpinner /> : null}
        <AppButton label="Save and Join Run" onPress={handleSaveProfile} testID="button-save-profile" />
      </AppCard>
    </Screen>
  );
}

function SuggestionRow({
  suggestions,
  onSelect,
  testIDPrefix,
}: {
  suggestions: string[];
  onSelect: (value: string) => void;
  testIDPrefix: string;
}) {
  const { theme } = useAppTheme();

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {suggestions.map((suggestion) => (
        <Pressable
          key={suggestion}
          accessibilityRole="button"
          onPress={() => onSelect(suggestion)}
          style={{
            borderRadius: 999,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surfaceElevated,
            paddingHorizontal: 12,
            paddingVertical: 6,
          }}
          testID={`${testIDPrefix}-${suggestion}`}
        >
          <Text style={{ color: theme.colors.textPrimary, fontSize: 12 }}>{suggestion}</Text>
        </Pressable>
      ))}
    </View>
  );
}
