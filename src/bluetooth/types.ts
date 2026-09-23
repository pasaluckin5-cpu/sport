export interface BleDevice {
  id: string;
  name: string | null;
}

/**
 * Platform-split: ble-engine.native.ts (react-native-ble-plx, real BLE) on iOS/Android,
 * ble-engine.web.ts (a no-op stub) on web — Metro picks the right one per platform via the file
 * extension, so react-native-ble-plx (a native module with no web build) never gets bundled for
 * web. Both implement this same interface.
 */
export interface BleEngine {
  isSupported: boolean;
  /** Starts scanning for devices advertising the standard Heart Rate service. Returns a function
   *  that stops the scan. */
  scanForHeartRateDevices(onDeviceFound: (device: BleDevice) => void, onError: (message: string) => void): () => void;
  /** Connects and subscribes to heart-rate notifications. Resolves to a function that
   *  disconnects and unsubscribes. */
  connect(deviceId: string, onBpm: (bpm: number) => void, onDisconnected: (reason: string | null) => void): Promise<() => void>;
}
