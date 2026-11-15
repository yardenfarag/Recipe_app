import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Card } from '@/components/admin/messages/fields';
import {
  ACTION_LABELS,
  MESSAGE_LANGUAGES,
  PRESENTATION_LABELS,
} from '@/components/admin/messages/form';
import { Pressable } from '@/components/ui/Pressable';
import { useThemePreference } from '@/hooks/useThemePreference';
import {
  messageButtons,
  normalizeLanguage,
  pickContent,
  resolveContentLanguage,
  type AdminMessageDraft,
  type Tone,
} from '@/lib/inAppMessages';

/**
 * A plain picture of what the message says, per language. It is not the app's
 * own message UI (that is a different module); it only shows the content, the
 * tone, the buttons, and which language users get.
 */
export function MessagePreview({ draft }: { draft: AdminMessageDraft }) {
  const { colors } = useThemePreference();
  const [language, setLanguage] = useState<string>('en');

  const resolved = resolveContentLanguage(draft, language);
  const content = pickContent(draft, language);
  const buttons = messageButtons(draft, language);
  const rtl = resolved === 'he' || resolved === 'ar';
  const fellBack = normalizeLanguage(language) !== resolved;
  const languageLabel = MESSAGE_LANGUAGES.find((l) => l.code === language)?.label ?? language;
  const resolvedLabel = MESSAGE_LANGUAGES.find((l) => l.code === resolved)?.label ?? resolved;

  const toneColor: Record<Tone, string> = {
    info: colors.primary,
    success: colors.success,
    warning: colors.warning,
    critical: colors.danger,
  };
  const accent = toneColor[draft.tone];
  const iconName =
    draft.icon && draft.icon in Ionicons.glyphMap ? (draft.icon as keyof typeof Ionicons.glyphMap) : null;
  const closable = draft.dismissible && !draft.required;
  const hasTitle = content.title.trim().length > 0;
  const align = rtl ? ('right' as const) : ('left' as const);
  const direction = { direction: rtl ? ('rtl' as const) : ('ltr' as const) };

  const buttonRow = (
    <View className="mt-3 flex-row flex-wrap gap-2" style={direction}>
      {buttons.map((button) => (
        <View
          key={button.style}
          className="rounded-[12px] px-4 py-2"
          style={{
            backgroundColor: button.style === 'primary' ? accent : 'transparent',
            borderWidth: button.style === 'primary' ? 0 : 1,
            borderColor: accent,
          }}
        >
          <Text
            className="text-xs font-bold"
            style={{ color: button.style === 'primary' ? colors.onPrimary : accent }}
            accessibilityLabel={`${button.label}, ${ACTION_LABELS[button.action.type]}`}
          >
            {button.label}
          </Text>
        </View>
      ))}
    </View>
  );

  const text = (
    <View className="min-w-0 flex-1" style={direction}>
      <Text
        className="text-sm font-bold"
        style={{ color: hasTitle ? colors.text : colors.textSecondary, textAlign: align, writingDirection: rtl ? 'rtl' : 'ltr' }}
      >
        {hasTitle ? content.title : 'Title'}
      </Text>
      {content.body.trim() ? (
        <Text
          className="mt-1 text-xs"
          style={{ color: colors.textSecondary, textAlign: align, writingDirection: rtl ? 'rtl' : 'ltr' }}
        >
          {content.body}
        </Text>
      ) : null}
      {draft.link ? (
        <Text
          className="mt-2 text-xs font-semibold"
          style={{ color: accent, textDecorationLine: 'underline', textAlign: align }}
        >
          {content.linkLabel || 'Link'}
        </Text>
      ) : null}
    </View>
  );

  const icon = iconName ? <Ionicons name={iconName} size={22} color={accent} /> : null;
  const image = draft.imageUrl ? (
    <Image
      source={{ uri: draft.imageUrl }}
      style={{ width: '100%', height: 120, borderRadius: 12, marginBottom: 12, backgroundColor: colors.primarySoft }}
      contentFit="cover"
      accessibilityLabel="Message image"
    />
  ) : null;

  let shape: React.ReactNode;
  if (draft.presentation === 'banner') {
    shape = (
      <View className="rounded-[14px] p-3" style={[{ backgroundColor: colors.surface, borderLeftWidth: 4, borderLeftColor: accent }, direction]}>
        <View className="flex-row items-center gap-3" style={direction}>
          {icon}
          {text}
          {closable ? <Ionicons name="close" size={18} color={colors.textSecondary} /> : null}
        </View>
        {buttons.length > 0 ? <View style={{ marginStart: icon ? 34 : 0 }}>{buttonRow}</View> : null}
      </View>
    );
  } else if (draft.presentation === 'alert') {
    shape = (
      <View className="items-center rounded-[22px] p-4" style={{ backgroundColor: colors.overlay }}>
        <View className="w-full max-w-[300px] rounded-[18px] p-4" style={[{ backgroundColor: colors.surface }, direction]}>
          {text}
          {buttonRow}
        </View>
      </View>
    );
  } else if (draft.presentation === 'sheet') {
    shape = (
      <View className="rounded-[22px] p-4" style={[{ backgroundColor: colors.surface, borderTopWidth: 4, borderTopColor: accent }, direction]}>
        <View className="mb-3 h-1 w-10 self-center rounded-full" style={{ backgroundColor: colors.border }} />
        {image}
        <View className="flex-row items-start gap-3" style={direction}>
          {icon}
          {text}
        </View>
        {buttonRow}
      </View>
    );
  } else {
    shape = (
      <View className="items-center rounded-[22px] p-6" style={[{ backgroundColor: colors.surface, minHeight: 260, justifyContent: 'center' }, direction]}>
        {closable ? (
          <View className="absolute right-3 top-3">
            <Ionicons name="close" size={20} color={colors.textSecondary} />
          </View>
        ) : null}
        {image}
        {icon ? <View className="mb-2">{icon}</View> : null}
        <View className="w-full flex-row">{text}</View>
        {buttonRow}
      </View>
    );
  }

  return (
    <Card title="Preview" hint="Words, tone and buttons only. The app draws the real thing.">
      <View className="mb-3 flex-row flex-wrap gap-2" accessibilityRole="tablist">
        {MESSAGE_LANGUAGES.map((lang) => {
          const active = lang.code === language;
          return (
            <Pressable
              key={lang.code}
              trackId={`admin.messages.preview.lang.${lang.code}`}
              onPress={() => setLanguage(lang.code)}
              accessibilityRole="tab"
              accessibilityLabel={`Preview in ${lang.label}`}
              accessibilityState={{ selected: active }}
              className="rounded-full px-3 py-1.5"
              style={{ backgroundColor: active ? colors.primary : colors.primarySoft }}
            >
              <Text className="text-xs font-bold" style={{ color: active ? colors.onPrimary : colors.primary }}>
                {lang.code.toUpperCase()}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text className="mb-2 text-xs font-semibold" style={{ color: colors.textSecondary }}>
        {PRESENTATION_LABELS[draft.presentation]}
        {draft.presentation === 'banner' ? `, ${draft.bannerPosition ?? 'top'}` : ''}
        {draft.required ? ', required (cannot be closed)' : closable ? '' : ', cannot be closed'}
      </Text>

      {shape}

      <Text className="mt-3 text-xs" style={{ color: fellBack ? colors.warning : colors.textSecondary }}>
        {fellBack
          ? `No ${languageLabel} text yet: a user in ${languageLabel} sees ${resolvedLabel}.`
          : rtl
            ? `${resolvedLabel} reads right-to-left.`
            : `${resolvedLabel} reads left-to-right.`}
      </Text>
    </Card>
  );
}
