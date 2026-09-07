import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

interface StepperProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}

export function Stepper({ value, min, max, step = 1, suffix, onChange }: StepperProps) {
  return (
    <View style={styles.row}>
      <Pressable
        disabled={value <= min}
        onPress={() => onChange(Math.max(min, value - step))}
        style={({ pressed }) => pressed && styles.pressed}>
        <ThemedView type="backgroundElement" style={styles.button}>
          <ThemedText type="smallBold">−</ThemedText>
        </ThemedView>
      </Pressable>
      <ThemedText type="default" style={styles.value}>
        {value}
        {suffix ? ` ${suffix}` : ''}
      </ThemedText>
      <Pressable
        disabled={value >= max}
        onPress={() => onChange(Math.min(max, value + step))}
        style={({ pressed }) => pressed && styles.pressed}>
        <ThemedView type="backgroundElement" style={styles.button}>
          <ThemedText type="smallBold">+</ThemedText>
        </ThemedView>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  button: {
    width: Spacing.five,
    height: Spacing.five,
    borderRadius: Spacing.five / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
  value: {
    minWidth: 72,
    textAlign: 'center',
  },
});
