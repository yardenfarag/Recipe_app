import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import { Pressable } from '@/components/ui/Pressable';
import { HAIRLINE, Radii } from '@/components/ui/tokens';
import { fontFor, tracking, variantStyle } from '@/constants/typography';
import { useThemePreference } from '@/hooks/useThemePreference';
import type { AppLanguageCode } from '@shared/lib/appLanguages';
import type { ButtonAction, ClickedButton } from '@shared/lib/inAppMessages';

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

/**
 * Night Market type in the message's own language (which can differ from the app's): the fonts, tracking and line
 * height of a kit variant.
 */
export function messageType(view: MessageView) {
  const language = view.contentLanguage as AppLanguageCode;
  return {
    variant: (name: Parameters<typeof variantStyle>[0]) => variantStyle(name, language),
    button: (fontSize: number) => ({
      ...fontFor('display', 'bold', language),
      fontSize,
      letterSpacing: tracking(-0.01, fontSize, language),
    }),
    body: (weight: Parameters<typeof fontFor>[1]) => fontFor('body', weight, language),
  };
}

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
  const type = messageType(view);
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
            borderRadius: Radii.inner,
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
            height: 48,
            width: 48,
            borderRadius: Radii.inner,
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
            ...type.variant('h2'),
            marginTop: 14,
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
            ...type.variant('bodySmall'),
            marginTop: showTitle ? 8 : 12,
            color: colors.textSecondary,
            textAlign,
            writingDirection,
          }}
        >
          {view.body}
        </Text>
      ) : null}
      {view.buttons.length > 0 ? (
        <View style={{ marginTop: 24, gap: 8 }}>
          {view.buttons.map((button) => {
            const primary = button.style === 'primary';
            return (
              <Pressable
                key={`${button.kind}:${button.label}`}
                trackId={`${trackPrefix}.${button.kind}`}
                onPress={() => onAction(button.kind, button.action)}
                accessibilityRole="button"
                accessibilityLabel={button.label}
                style={({ pressed }) => ({
                  minHeight: 52,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: Radii.inner,
                  paddingHorizontal: 20,
                  paddingVertical: 12,
                  backgroundColor: primary ? tone.accent : pressed ? colors.backgroundElement : colors.surface,
                  borderWidth: primary ? 0 : HAIRLINE,
                  borderColor: colors.border,
                  opacity: pressed && primary ? 0.88 : 1,
                })}
              >
                <Text
                  style={{
                    ...(primary ? type.button(16) : { ...type.body('semibold'), fontSize: 16 }),
                    textAlign: 'center',
                    color: primary ? tone.onAccent : colors.text,
                  }}
                >
                  {button.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {view.link ? (
        <Pressable
          trackId={`${trackPrefix}.link`}
          onPress={() => onAction('link', { type: 'link', url: view.link?.url ?? '' })}
          accessibilityRole="link"
          accessibilityLabel={view.link.label}
          style={{ marginTop: 12, minHeight: 44, justifyContent: 'center' }}
        >
          <Text
            style={{
              ...type.body('semibold'),
              fontSize: 15,
              textDecorationLine: 'underline',
              color: tone.accent === colors.primary ? colors.primaryText : colors.text,
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
            borderRadius: Radii.inner,
            paddingHorizontal: 16,
            paddingVertical: 12,
            backgroundColor: pressed ? colors.backgroundElement : 'transparent',
          })}
        >
          <Text style={{ ...type.body('semibold'), fontSize: 15, textAlign: 'center', color: colors.textSecondary }}>
            {closeButton.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
