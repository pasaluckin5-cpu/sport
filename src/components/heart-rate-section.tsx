import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Collapsible } from '@/components/ui/collapsible';
import { Spacing } from '@/constants/theme';
import { useHeartRate } from '@/state/heart-rate-context';

export function HeartRateSection() {
  const { t } = useTranslation();
  const { isSupported, isScanning, devices, connectedDevice, bpm, error, startScan, stopScan, connect, disconnect } = useHeartRate();

  return (
    <Collapsible title={t('heartRate.title')}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
        {t('heartRate.hint')}
      </ThemedText>

      {!isSupported ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t('heartRate.notSupported')}
        </ThemedText>
      ) : connectedDevice ? (
        <View style={styles.block}>
          <ThemedText type="smallBold">{connectedDevice.name ?? t('heartRate.unnamedDevice')}</ThemedText>
          <ThemedText type="title">{bpm !== null ? t('heartRate.bpmValue', { bpm }) : t('heartRate.waiting')}</ThemedText>
          <Pressable onPress={disconnect} style={({ pressed }) => pressed && styles.pressed}>
            <ThemedView type="backgroundElement" style={styles.button}>
              <ThemedText type="smallBold">{t('heartRate.disconnect')}</ThemedText>
            </ThemedView>
          </Pressable>
        </View>
      ) : (
        <View style={styles.block}>
          <Pressable onPress={isScanning ? stopScan : startScan} style={({ pressed }) => pressed && styles.pressed}>
            <ThemedView type="backgroundElement" style={styles.button}>
              <ThemedText type="smallBold">{t(isScanning ? 'heartRate.stopScan' : 'heartRate.scan')}</ThemedText>
            </ThemedView>
          </Pressable>
          {isScanning && devices.length === 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              {t('heartRate.scanning')}
            </ThemedText>
          )}
          {!isScanning && devices.length === 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              {t('heartRate.scanEmpty')}
            </ThemedText>
          )}
          {devices.map((device) => (
            <Pressable key={device.id} onPress={() => connect(device)} style={({ pressed }) => pressed && styles.pressed}>
              <ThemedText type="link">{device.name ?? t('heartRate.unnamedDevice')}</ThemedText>
            </Pressable>
          ))}
          {error && (
            <ThemedText type="small" themeColor="textSecondary">
              {error}
            </ThemedText>
          )}
        </View>
      )}
    </Collapsible>
  );
}

const styles = StyleSheet.create({
  hint: {
    marginBottom: Spacing.two,
  },
  block: {
    gap: Spacing.two,
  },
  button: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
  },
  pressed: {
    opacity: 0.8,
  },
});
