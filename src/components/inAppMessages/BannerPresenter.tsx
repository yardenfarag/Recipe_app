import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { Platform, Text, View } from 'react-native';

import { Pressable } from '@/components/ui/Pressable';
import { useThemePreference } from '@/hooks/useThemePreference';

import { CloseButton } from './CloseButton';
import type { MessageActionHandler } from './MessageContent';
import { resolveIconName, toneColors } from './tone';
import type { MessageView } from './viewModel';

const TRACK = 'in_app_message.banner';

/**
 * A strip, custom on every platform (neither iOS nor Android has an in-app
 * banner; see docs/research/07-in-app-messages-native-components.md). The
 * message's own tone colours it. Never blocks the screen under it.
 * `inset` is the safe-area padding on the screen edge it sits against.
 */
export function BannerPresenter({
  view,
  onAction,
  onClose,
  edge,
  inset = 0,
}: {
  view: MessageView;
  onAction: MessageActionHandler;
  onClose: () => void;
  edge: 'top' | 'bottom';
  inset?: number;
}) {
  const { colors } = useThemePreference();
  const { message } = view;
  const tone = toneColors(message.tone, colors);
  const iconName = resolveIconName(message.icon, message.tone, Ionicons.glyphMap);
  const textAlign = view.rtl ? 'right' : 'left';
  const writingDirection = view.rtl ? 'rtl' : 'ltr';

  // Web: Escape closes a dismissible banner while focus is inside it.
  const keyProps =
    Platform.OS === 'web' && view.dismissible
      ? ({
          onKeyDown: (event: { key?: string }) => {
            if (event.key === 'Escape') onClose();
          },
        } as object)
      : null;

  return (
    <View
      accessibilityRole="alert"
      {...keyProps}
      style={{
        width: '100%',
        backgroundColor: tone.soft,
        borderColor: tone.accent,
        borderTopWidth: edge === 'bottom' ? 2 : 0,
        borderBottomWidth: edge === 'top' ? 2 : 0,
        paddingTop: edge === 'top' ? inset : 0,
        paddingBottom: edge === 'bottom' ? inset : 0,
        direction: writingDirection,
      }}
    >
      <View
        style={{
          width: '100%',
          maxWidth: 960,
          alignSelf: 'center',
          paddingHorizontal: 16,
          paddingVertical: 10,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <View style={{ flex: 1, minWidth: 200, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {message.imageUrl ? (
            <Image
              source={{ uri: message.imageUrl }}
              style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: colors.surface }}
              contentFit="cover"
              accessible={false}
            />
          ) : (
            <View accessible={false} importantForAccessibility="no-hide-descendants">
              <Ionicons name={iconName as keyof typeof Ionicons.glyphMap} size={26} color={tone.accent} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text
              style={{ fontSize: 15, fontWeight: '700', color: colors.text, textAlign, writingDirection }}
              numberOfLines={2}
            >
              {view.title}
            </Text>
            {view.body ? (
              <Text
                style={{ marginTop: 2, fontSize: 13, lineHeight: 18, color: colors.textSecondary, textAlign, writingDirection }}
                numberOfLines={3}
              >
                {view.body}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {view.link ? (
            <Pressable
              trackId={`${TRACK}.link`}
              onPress={() => onAction('link', { type: 'link', url: view.link?.url ?? '' })}
              accessibilityRole="link"
              accessibilityLabel={view.link.label}
              style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 4 }}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', textDecorationLine: 'underline', color: colors.text }}>
                {view.link.label}
              </Text>
            </Pressable>
          ) : null}
          {view.buttons.map((button) => (
            <Pressable
              key={`${button.kind}:${button.label}`}
              trackId={`${TRACK}.${button.kind}`}
              onPress={() => onAction(button.kind, button.action)}
              accessibilityRole="button"
              accessibilityLabel={button.label}
              style={({ pressed }) => ({
                minHeight: 40,
                justifyContent: 'center',
                borderRadius: 20,
                paddingHorizontal: 16,
                opacity: pressed ? 0.8 : 1,
                backgroundColor: button.style === 'primary' ? tone.accent : colors.surface,
                borderWidth: button.style === 'primary' ? 0 : 1,
                borderColor: colors.border,
              })}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '700',
                  color: button.style === 'primary' ? tone.onAccent : colors.text,
                }}
              >
                {button.label}
              </Text>
            </Pressable>
          ))}
          {view.dismissible ? <CloseButton trackId={`${TRACK}.close`} onPress={onClose} size={36} /> : null}
        </View>
      </View>
    </View>
  );
}
