import { BleManager } from 'react-native-ble-plx';

import { BleEngine } from './types';

// Standard Bluetooth SIG GATT Heart Rate service/characteristic — supported by most consumer HR
// chest straps and many watches (not swim-specific hardware, which has no public API at all;
// see docs/supabase-architecture.md's "Still open" section for why this is the realistic scope).
const HEART_RATE_SERVICE_UUID = '0000180d-0000-1000-8000-00805f9b34fb';
const HEART_RATE_MEASUREMENT_UUID = '00002a37-0000-1000-8000-00805f9b34fb';

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Manual base64 decode — avoids depending on `atob`/Node's Buffer being present in the RN JS
 *  runtime, since react-native-ble-plx hands characteristic values back as base64 strings. */
function base64ToBytes(base64: string): number[] {
  const bytes: number[] = [];
  let buffer = 0;
  let bitsCollected = 0;
  for (const char of base64) {
    const value = BASE64_CHARS.indexOf(char);
    if (value === -1) continue; // padding ('=') or whitespace
    buffer = (buffer << 6) | value;
    bitsCollected += 6;
    if (bitsCollected >= 8) {
      bitsCollected -= 8;
      bytes.push((buffer >> bitsCollected) & 0xff);
    }
  }
  return bytes;
}

/** Bluetooth SIG Heart Rate Measurement format: byte 0 is flags (bit 0 = value is uint16 instead
 *  of uint8), followed by the BPM value in the corresponding width, little-endian. */
function parseHeartRateMeasurement(base64Value: string): number | null {
  const bytes = base64ToBytes(base64Value);
  if (bytes.length < 2) return null;
  const is16Bit = (bytes[0] & 0x1) !== 0;
  if (is16Bit) {
    if (bytes.length < 3) return null;
    return bytes[1] | (bytes[2] << 8);
  }
  return bytes[1];
}

let manager: BleManager | null = null;
function getManager(): BleManager {
  if (!manager) manager = new BleManager();
  return manager;
}

export const bleEngine: BleEngine = {
  isSupported: true,

  scanForHeartRateDevices(onDeviceFound, onError) {
    const seen = new Set<string>();
    getManager().startDeviceScan([HEART_RATE_SERVICE_UUID], null, (error, device) => {
      if (error) {
        onError(error.message);
        return;
      }
      if (device && !seen.has(device.id)) {
        seen.add(device.id);
        onDeviceFound({ id: device.id, name: device.name });
      }
    });
    return () => getManager().stopDeviceScan();
  },

  async connect(deviceId, onBpm, onDisconnected) {
    const ble = getManager();
    const device = await ble.connectToDevice(deviceId);
    await device.discoverAllServicesAndCharacteristics();

    const subscription = device.monitorCharacteristicForService(
      HEART_RATE_SERVICE_UUID,
      HEART_RATE_MEASUREMENT_UUID,
      (error, characteristic) => {
        if (error) {
          onDisconnected(error.message);
          return;
        }
        if (characteristic?.value) {
          const bpm = parseHeartRateMeasurement(characteristic.value);
          if (bpm !== null) onBpm(bpm);
        }
      },
    );

    const disconnectSubscription = device.onDisconnected((error) => {
      onDisconnected(error?.message ?? null);
    });

    return () => {
      subscription.remove();
      disconnectSubscription.remove();
      device.cancelConnection().catch(() => {});
    };
  },
};
