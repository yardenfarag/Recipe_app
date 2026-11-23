import { type Href, router } from 'expo-router';
import * as Linking from 'expo-linking';
import { ScrollView, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Tile } from '@/components/ui/Tile';
import { fontFor, variantStyle } from '@/constants/typography';
import { useThemePreference } from '@/hooks/useThemePreference';
import { SUPPORT_EMAIL } from '@/lib/legal';
import { legalHref, type LegalDoc, type LegalHref } from '@/lib/legalDocs';

type Inline = LegalDoc['blocks'][number] extends infer Block
  ? Block extends { parts: infer Parts }
    ? Parts extends readonly (infer Item)[]
      ? Item
      : never
    : Block extends { items: (infer Item)[][] }
      ? Item extends readonly (infer Inner)[]
        ? Inner
        : never
      : never
  : never;

// The documents are English, so they are set in the English fonts and read left to right whatever the app language.
const EN = 'en' as const;
const LTR = { writingDirection: 'ltr', textAlign: 'left' } as const;

/** In-app privacy, terms, and deletion guides. English source text, so the page stays left to right. */
export function LegalDocumentView({ doc }: { doc: LegalDoc }) {
  const { colors } = useThemePreference();

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 48, paddingHorizontal: 20, paddingTop: 12 }}
      >
        <View style={{ maxWidth: 640, width: '100%', alignSelf: 'center' }}>
          <Text
            accessibilityRole="header"
            accessibilityLanguage="en"
            style={[variantStyle('h1', EN), LTR, { color: colors.text }]}
          >
            {doc.title}
          </Text>
          <Text style={[variantStyle('caption', EN), LTR, { marginTop: 8, color: colors.textSecondary }]}>
            {doc.meta}
          </Text>

          <View style={{ marginTop: 24, gap: 16 }}>
            {doc.blocks.map((block, index) => {
              if (block.kind === 'h2') {
                return (
                  <Text
                    key={index}
                    accessibilityRole="header"
                    accessibilityLanguage="en"
                    style={[variantStyle('h3', EN), LTR, { marginTop: 10, fontSize: 19, lineHeight: 24, color: colors.text }]}
                  >
                    {block.text}
                  </Text>
                );
              }
              if (block.kind === 'ul' || block.kind === 'ol') {
                return (
                  <View key={index} style={{ gap: 8 }}>
                    {block.items.map((item, itemIndex) => (
                      <View key={itemIndex} style={{ flexDirection: 'row', direction: 'ltr', gap: 8 }}>
                        <Text
                          accessible={false}
                          importantForAccessibility="no"
                          style={[variantStyle('bodySmall', EN), LTR, { color: colors.textSecondary, width: 18 }]}
                        >
                          {block.kind === 'ol' ? `${itemIndex + 1}.` : '•'}
                        </Text>
                        <RichLine parts={item} />
                      </View>
                    ))}
                  </View>
                );
              }
              if (block.kind === 'p' || block.kind === 'card') {
                return block.kind === 'card' ? (
                  <Tile key={index} tone="element" size="sm" padding={16}>
                    <RichLine parts={block.parts} />
                  </Tile>
                ) : (
                  <View key={index}>
                    <RichLine parts={block.parts} />
                  </View>
                );
              }
              return null;
            })}
          </View>

          <View style={{ marginTop: 28, flexDirection: 'row', direction: 'ltr', flexWrap: 'wrap', gap: 16 }}>
            {doc.related.map((item) => (
              <Text
                key={item.to}
                onPress={() => router.push(item.to as Href)}
                accessibilityRole="link"
                style={[fontFor('body', 'semibold', EN), { minHeight: 44, fontSize: 15, lineHeight: 44, color: colors.primaryText, textDecorationLine: 'underline' }]}
              >
                {item.label}
              </Text>
            ))}
          </View>
          <Text style={[variantStyle('caption', EN), LTR, { marginTop: 12, color: colors.textSecondary }]}>
            Pinch · Support{' '}
            <Text
              onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
              accessibilityRole="link"
              style={[fontFor('body', 'semibold', EN), { color: colors.primaryText }]}
            >
              {SUPPORT_EMAIL}
            </Text>
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

function RichLine({ parts }: { parts: Inline[] }) {
  const { colors } = useThemePreference();
  return (
    <Text
      accessibilityLanguage="en"
      style={[variantStyle('bodySmall', EN), LTR, { flex: 1, color: colors.text }]}
    >
      {parts.map((part, index) => {
        if (part.kind === 'strong') {
          return (
            <Text key={index} style={fontFor('body', 'bold', EN)}>
              {part.text}
            </Text>
          );
        }
        if (part.kind === 'link') {
          return (
            <Text
              key={index}
              onPress={() => openLegalTarget(part.to)}
              accessibilityRole="link"
              style={[fontFor('body', 'semibold', EN), { color: colors.primaryText, textDecorationLine: 'underline' }]}
            >
              {part.text}
            </Text>
          );
        }
        return <Text key={index}>{part.text}</Text>;
      })}
    </Text>
  );
}

function openLegalTarget(to: LegalHref | `mailto:${string}`) {
  if (to.startsWith('mailto:')) {
    void Linking.openURL(to);
    return;
  }
  router.push(to as Href);
}

export function openLegalDoc(id: Parameters<typeof legalHref>[0]) {
  router.push(legalHref(id) as Href);
}
