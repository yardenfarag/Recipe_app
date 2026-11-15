import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import { Pressable } from '@/components/ui/Pressable';
import { useThemePreference } from '@/hooks/useThemePreference';
import type { ButtonAction, ClickedButton } from '@/lib/inAppMessages';

import { resolveIconName, toneColors } from './tone';
import type { MessageView } from './viewModel';

export type MessageActionHandler = (kind: ClickedButton, action: ButtonAction) => void;

type MessageContentProps = {
  view: MessageView;
  /** Fixed tap-log prefix such as `in_app_message.sheet`; buttons log `.primary`, `.secondary`, `.link`. */
  trackPrefix: string;
  onAction: MessageActionHandler;
  /** The sheet puts the title in its own header. */
  showTitle?: boolean;
  align?: 'start' | 'center';
  /** A last, quiet button that closes the message (an alert whose buttons all do something). */
  closeButton?: { label: string; onPress: () => void };
};

/** Icon, image, title, body, buttons and link: the inside of a card, a sheet or the full-screen page. */
export function MessageContent({
  view,
  trackPrefix,
  onAction,
  showTitle = true,
  align = 'start',
  closeButton,
}: MessageContentProps) {
  const { colors } = useThemePreference();
  const { message } = view;
  const tone = toneColors(message.tone, colors);
  const iconName = resolveIconName(message.icon, message.tone, Ionicons.glyphMap);
  const centered = align === 'center';
  const textAlign = centered ? 'center' : view.rtl ? 'right' : 'left';
  const writingDirection = view.rtl ? 'rtl' : 'ltr';

  return (
    <View style={{ width: '100%', direction: writingDirection }}>
      {message.imageUrl ? (
        <Image
          source={{ uri: message.imageUrl }}
          style={{
            width: '100%',
            aspectRatio: 16 / 9,
            borderRadius: 16,
            backgroundColor: tone.soft,
            marginBottom: 16,
          }}
          contentFit="cover"
          // Decorative: the title and body say it all.
          accessible={false}
        />
      ) : null}
      <View style={{ alignItems: centered ? 'center' : 'flex-start' }}>
        <View
          style={{
            height: 44,
            width: 44,
            borderRadius: 22,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: tone.soft,
          }}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          <Ionicons name={iconName as keyof typeof Ionicons.glyphMap} size={24} color={tone.accent} />
        </View>
      </View>
      {showTitle ? (
        <Text
          accessibilityRole="header"
          style={{
            marginTop: 12,
            fontSize: 20,
            fontWeight: '700',
            color: colors.text,
            textAlign,
            writingDirection,
          }}
        >
          {view.title}
        </Text>
      ) : null}
      {view.body ? (
        <Text
          style={{
            marginTop: showTitle ? 8 : 12,
            fontSize: 15,
            lineHeight: 22,
            color: colors.textSecondary,
            textAlign,
            writingDirection,
          }}
        >
          {view.body}
        </Text>
      ) : null}
      {view.buttons.length > 0 ? (
        <View style={{ marginTop: 20, gap: 8 }}>
          {view.buttons.map((button) => (
            <Pressable
              key={`${button.kind}:${button.label}`}
              trackId={`${trackPrefix}.${button.kind}`}
              onPress={() => onAction(button.kind, button.action)}
              accessibilityRole="button"
              accessibilityLabel={button.label}
              style={({ pressed }) => ({
                minHeight: 48,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 22,
                paddingHorizontal: 16,
                paddingVertical: 12,
                opacity: pressed ? 0.8 : 1,
                backgroundColor: button.style === 'primary' ? tone.accent : colors.surface,
                borderWidth: button.style === 'primary' ? 0 : 1,
                borderColor: colors.border,
              })}
            >
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: '700',
                  textAlign: 'center',
                  color: button.style === 'primary' ? tone.onAccent : colors.text,
                }}
              >
                {button.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {view.link ? (
        <Pressable
          trackId={`${trackPrefix}.link`}
          onPress={() => onAction('link', { type: 'link', url: view.link?.url ?? '' })}
          accessibilityRole="link"
          accessibilityLabel={view.link.label}
          style={{ marginTop: 14, minHeight: 44, justifyContent: 'center' }}
        >
          <Text
            style={{
              fontSize: 15,
              fontWeight: '600',
              textDecorationLine: 'underline',
              color: tone.accent === colors.primary ? colors.primary : colors.text,
              textAlign,
              writingDirection,
            }}
          >
            {view.link.label}
          </Text>
        </Pressable>
      ) : null}
      {closeButton ? (
        <Pressable
          trackId={`${trackPrefix}.close_button`}
          onPress={closeButton.onPress}
          accessibilityRole="button"
          accessibilityLabel={closeButton.label}
          style={({ pressed }) => ({
            marginTop: 8,
            minHeight: 48,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 22,
            paddingHorizontal: 16,
            paddingVertical: 12,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text style={{ fontSize: 15, fontWeight: '600', textAlign: 'center', color: colors.textSecondary }}>
            {closeButton.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
