import type { TFunction } from 'i18next';

import { Equipment } from './types';

export interface EquipmentInfo {
  id: Equipment;
  emoji: string;
}

export const EQUIPMENT_CATALOG: EquipmentInfo[] = [
  { id: 'fins', emoji: '🦶' },
  { id: 'paddles', emoji: '🖐️' },
  { id: 'pullBuoy', emoji: '🧵' },
  { id: 'kickboard', emoji: '🏄' },
  { id: 'snorkel', emoji: '🤿' },
  { id: 'parachute', emoji: '🪂' },
  { id: 'tempoTrainer', emoji: '⏱️' },
  { id: 'band', emoji: '➰' },
];

export function equipmentLabel(id: Equipment, t: TFunction): string {
  return t(`equipment.${id}.label`);
}

export function equipmentDescription(id: Equipment, t: TFunction): string {
  return t(`equipment.${id}.description`);
}
