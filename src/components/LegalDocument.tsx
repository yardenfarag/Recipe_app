import { type Href, router } from 'expo-router';
import * as Linking from 'expo-linking';
import { ScrollView, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
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

/** In-app privacy, terms, and deletion guides. English source text, so the page stays left to right. */
export function LegalDocumentView({ doc }: { doc: LegalDoc }) {
  const { colors } = useThemePreference();

  return (
    <Screen dense>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 48, paddingHorizontal: 20, paddingTop: 8 }}
      >
        <View style={{ maxWidth: 640, width: '100%', alignSelf: 'center' }}>
          <Text
            style={{
              color: colors.text,
              fontSize: 28,
              fontWeight: '700',
              letterSpacing: -0.4,
              writingDirection: 'ltr',
              textAlign: 'left',
            }}
          >
            {doc.title}
          </Text>
          <Text
            style={{
              marginTop: 8,
              color: colors.textSecondary,
              fontSize: 13,
              writingDirection: 'ltr',
              textAlign: 'left',
            }}
          >
            {doc.meta}
          </Text>

          <View style={{ marginTop: 20, gap: 16 }}>
            {doc.blocks.map((block, index) => {
              if (block.kind === 'h2') {
                return (
                  <Text
                    key={index}
                    style={{
                      marginTop: 8,
                      color: colors.text,
                      fontSize: 18,
                      fontWeight: '700',
                      writingDirection: 'ltr',
                      textAlign: 'left',
                    }}
                  >
                    {block.text}
                  </Text>
                );
              }
              if (block.kind === 'ul' || block.kind === 'ol') {
                return (
                  <View key={index} style={{ gap: 8 }}>
                    {block.items.map((item, itemIndex) => (
                      <View key={itemIndex} style={{ flexDirection: 'row', gap: 8 }}>
                        <Text style={{ color: colors.textSecondary, width: 18, textAlign: 'left' }}>
                          {block.kind === 'ol' ? `${itemIndex + 1}.` : '•'}
                        </Text>
                        <RichLine parts={item} />
                      </View>
                    ))}
                  </View>
                );
              }
              if (block.kind === 'p' || block.kind === 'card') {
                return (
                  <View
                    key={index}
                    style={
                      block.kind === 'card'
                        ? {
                            borderRadius: 18,
                            borderWidth: 1,
                            borderColor: colors.frostedBorder,
                            backgroundColor: colors.frosted,
                            padding: 14,
                          }
                        : undefined
                    }
                  >
                    <RichLine parts={block.parts} />
                  </View>
                );
              }
              return null;
            })}
          </View>

          <View style={{ marginTop: 28, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {doc.related.map((item) => (
              <Text
                key={item.to}
                onPress={() => router.push(item.to as Href)}
                style={{ color: colors.primary, fontSize: 14, fontWeight: '600' }}
              >
                {item.label}
              </Text>
            ))}
          </View>
          <Text
            style={{ marginTop: 18, color: colors.textSecondary, fontSize: 13, textAlign: 'left' }}
          >
            Pinch · Support{' '}
            <Text
              onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
              style={{ color: colors.primary, fontWeight: '600' }}
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
      style={{
        flex: 1,
        color: colors.text,
        fontSize: 15,
        lineHeight: 22,
        writingDirection: 'ltr',
        textAlign: 'left',
      }}
    >
      {parts.map((part, index) => {
        if (part.kind === 'strong') {
          return (
            <Text key={index} style={{ fontWeight: '700' }}>
              {part.text}
            </Text>
          );
        }
        if (part.kind === 'link') {
          return (
            <Text
              key={index}
              onPress={() => openLegalTarget(part.to)}
              style={{ color: colors.primary, fontWeight: '600' }}
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
