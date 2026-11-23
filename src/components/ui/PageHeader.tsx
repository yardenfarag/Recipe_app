import { type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from './Text';

export type PageHeaderProps = {
  /** The screen's title, announced as its heading. One per screen. */
  title: string;
  /** A line under it, muted. */
  subtitle?: string;
  /** The screen's own actions at the end of the row (IconButtons, a small Button). */
  actions?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * The top of a screen: its title (h1, 30), an optional line under it, and its actions at the end. Leaves 20 below.
 *
 *   <PageHeader title={t('tabs.list')} subtitle={t('list.subtitle')}
 *     actions={<IconButton icon="share-outline" label={t('list.share')} trackId="list.share" onPress={share} />} />
 */
export function PageHeader({ title, subtitle, actions, style }: PageHeaderProps) {
  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, paddingBottom: 20 },
        style,
      ]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="h1">{title}</Text>
        {subtitle ? (
          <Text variant="bodySmall" tone="muted" style={{ marginTop: 6 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {actions ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 }}>{actions}</View> : null}
    </View>
  );
}
