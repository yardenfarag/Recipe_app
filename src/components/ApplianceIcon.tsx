import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';

import type { ApplianceKey } from '@/lib/appliances';

type GlyphName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/**
 * One icon per catalog key (ADR 017). A Record, so adding a key without an icon is a type error.
 * All from MaterialCommunityIcons for a consistent line style; swap any entry here to change it app-wide.
 */
export const APPLIANCE_GLYPHS: Record<ApplianceKey, GlyphName> = {
  stovetop: 'stove',
  oven: 'toaster-oven',
  microwave: 'microwave',
  toaster: 'toaster',
  grill: 'grill-outline',
  air_fryer: 'fan',
  deep_fryer: 'pot-steam',
  slow_cooker: 'pot-steam-outline',
  pressure_cooker: 'gauge',
  rice_cooker: 'rice',
  sous_vide: 'thermometer-water',
  blender: 'blender',
  immersion_blender: 'blender-outline',
  food_processor: 'cog-outline',
  stand_mixer: 'bowl-mix',
  hand_mixer: 'bowl-mix-outline',
  spice_grinder: 'grain',
  mortar_and_pestle: 'mortar-pestle',
  kitchen_thermometer: 'thermometer-probe',
  kitchen_scale: 'scale',
  zester: 'fruit-citrus',
  mandoline: 'knife',
  cast_iron_pan: 'pan',
  dutch_oven: 'pot',
  wok: 'bowl-outline',
  springform_pan: 'cake-variant',
  pizza_stone: 'pizza',
  ice_cream_maker: 'ice-cream',
  waffle_maker: 'grid',
  juicer: 'cup-water',
  dehydrator: 'weather-sunny',
  smoker: 'smoke',
};

export function ApplianceIcon({ appliance, size = 18, color }: { appliance: ApplianceKey; size?: number; color: string }) {
  return (
    <MaterialCommunityIcons
      name={APPLIANCE_GLYPHS[appliance]}
      size={size}
      color={color}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
