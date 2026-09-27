import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { type Href, router, usePathname } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { CookieMark } from '@/components/CookieMark';
import { useWebIntro } from '@/hooks/useWebIntro';
import { captureWebIntroClick, captureWebIntroViewed } from '@/lib/analytics';
import { openLegalDoc } from '@/components/LegalDocument';
import { LEGAL_URLS, openLegalUrl } from '@/lib/legal';
import { isAppHome, openAppStore } from '@/lib/webIntro';

/** App icon fill — sRGB 0.76863, 0.35686, 0.47843. */
const PINK = '#C45B7A';
const PINK_BRIGHT = '#F0A8C4';
const NIGHT = '#070508';
const CREAM = '#F7F2F4';
const MUTED = '#C3B0B8';
const LINE = 'rgba(232, 168, 188, 0.22)';
const GLASS = 'rgba(255, 255, 255, 0.045)';
const WELL = 'rgba(196, 91, 122, 0.2)';

/** Matches `expo.web.name` / `expo.web.shortName` in app.json, which the static export writes into index.html. */
const WEB_TITLE = Constants.expoConfig?.web?.name ?? 'Pinch';
const APP_TITLE = Constants.expoConfig?.web?.shortName ?? 'Pinch';

const RECIPES = [
  { title: 'Miso butter noodles', meta: '25 min · dinner', swatch: '#E8A0B8' },
  { title: 'Lemon roast chicken', meta: '45 min · weekend', swatch: '#F0C2A4' },
  { title: 'Brown butter cookies', meta: '30 min · baking', swatch: '#E8D0A0' },
] as const;

const FEATURES: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}[] = [
  {
    icon: 'sparkles-outline',
    title: 'Snap a link',
    body: 'Share from TikTok, Instagram, or YouTube, or paste the link yourself.',
  },
  {
    icon: 'book-outline',
    title: 'Save it to your kitchen',
    body: 'Preview the recipe, tap save, and find it again in your library.',
  },
  {
    icon: 'cart-outline',
    title: 'Shopping list',
    body: 'Send the ingredients to a list you can check off at the store.',
  },
  {
    icon: 'play-outline',
    title: 'Cook along',
    body: 'Keep the source video beside the steps while you cook.',
  },
  {
    icon: 'albums-outline',
    title: 'Collections',
    body: 'Group recipes for dinner, baking, or easy weeknights.',
  },
];

/** Public web intro. Native builds never mount this screen. */
export function WebIntroPage() {
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const { dismiss } = useWebIntro();
  const compact = width < 760;

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.title = WEB_TITLE;
    }
    captureWebIntroViewed();
  }, []);

  async function continueOnWeb() {
    captureWebIntroClick('continue');
    await dismiss();
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.title = APP_TITLE;
    }
    if (!isAppHome(pathname)) {
      router.replace('/' as Href);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: NIGHT }}>
      <IntroAtmosphere />
      <ScrollView
        style={{ flex: 1, backgroundColor: 'transparent' }}
        contentContainerStyle={{
          alignItems: 'center',
          paddingBottom: 72,
          paddingTop: compact ? 36 : 56,
        }}
      >
      <View style={{ alignItems: 'center', paddingHorizontal: 24, maxWidth: 760, width: '100%' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <CookieMark size={28} color={PINK} />
          <Text style={{ fontSize: 22, fontWeight: '700', color: CREAM, letterSpacing: -0.4 }}>
            Pinch
          </Text>
        </View>

        <Text
          accessibilityRole="header"
          style={{
            marginTop: compact ? 28 : 40,
            textAlign: 'center',
            fontSize: compact ? 44 : 64,
            lineHeight: compact ? 52 : 70,
            fontWeight: '700',
            letterSpacing: compact ? -1.2 : -1.8,
            color: CREAM,
          }}
        >
          {compact ? 'See it.\n' : 'See it. '}
          <Text style={{ color: PINK_BRIGHT }}>Snap it.{compact ? '\n' : ' '}</Text>
          Cook it.
        </Text>

        <Text
          style={{
            marginTop: 18,
            maxWidth: 540,
            textAlign: 'center',
            fontSize: compact ? 17 : 18,
            lineHeight: 28,
            color: MUTED,
          }}
        >
          Share it from TikTok, Instagram, or YouTube. Pinch pulls out the ingredients and steps,
          then keeps them in your kitchen.
        </Text>
      </View>

      <View
        style={{
          marginTop: 32,
          width: '100%',
          maxWidth: compact ? 320 : 560,
          flexDirection: compact ? 'column' : 'row',
          justifyContent: 'center',
          gap: 12,
          paddingHorizontal: 24,
          zIndex: 2,
        }}
      >
        <AppStoreButton />
        <ContinueButton onPress={() => void continueOnWeb()} />
      </View>

      <View style={{ marginTop: compact ? 28 : -22, alignItems: 'center', width: '100%' }}>
        <View style={{ width: 280, height: 470 }}>
          <IntroPhone />
        </View>
      </View>

      <View style={{ marginTop: compact ? 56 : 88, width: '100%', maxWidth: 980, paddingHorizontal: 24 }}>
        <Text
          accessibilityRole="header"
          style={{
            textAlign: 'center',
            fontSize: compact ? 32 : 40,
            lineHeight: compact ? 38 : 46,
            fontWeight: '700',
            letterSpacing: -0.8,
            color: CREAM,
          }}
        >
          From the clip to the counter.
        </Text>
        <Text
          style={{
            marginTop: 12,
            textAlign: 'center',
            fontSize: 17,
            lineHeight: 26,
            color: MUTED,
          }}
        >
          The recipe, the list, and the video, kept in one kitchen.
        </Text>

        <View
          style={{
            marginTop: 32,
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: 16,
          }}
        >
          {FEATURES.map((feature) => (
            <View
              key={feature.title}
              style={{
                width: compact ? '100%' : 292,
                maxWidth: 420,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: LINE,
                backgroundColor: GLASS,
                padding: 22,
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: WELL,
                }}
              >
                <Ionicons name={feature.icon} size={20} color={PINK_BRIGHT} />
              </View>
              <Text style={{ marginTop: 16, fontSize: 18, fontWeight: '700', color: CREAM }}>
                {feature.title}
              </Text>
              <Text style={{ marginTop: 8, fontSize: 15, lineHeight: 22, color: MUTED }}>
                {feature.body}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={{ marginTop: 64, alignItems: 'center', gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <FooterLink label="Privacy" onPress={() => openLegalDoc('privacy')} />
          <Text style={{ color: MUTED }}>·</Text>
          <FooterLink label="Terms" onPress={() => openLegalDoc('terms')} />
          <Text style={{ color: MUTED }}>·</Text>
          <FooterLink label="Support" onPress={() => void openLegalUrl(LEGAL_URLS.supportMailto)} />
        </View>
        <Text style={{ fontSize: 13, color: MUTED }}>© {new Date().getFullYear()} Pinch</Text>
      </View>
      </ScrollView>
    </View>
  );
}

function IntroAtmosphere() {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
      <LinearGradient
        colors={['#140910', '#070508', '#09070A']}
        locations={[0, 0.42, 1]}
        style={StyleSheet.absoluteFill}
      />
      <GlowOrb color="rgba(196, 91, 122, 0.28)" size={560} top={-200} left={-140} duration={9000} />
      <GlowOrb color="rgba(240, 168, 196, 0.12)" size={440} top={-60} right={-180} duration={11000} />
      <GlowOrb color="rgba(90, 28, 52, 0.34)" size={420} bottom={-160} left={-60} duration={13000} />
      <GlowOrb color="rgba(196, 91, 122, 0.16)" size={280} bottom={40} right={80} duration={10000} />
    </View>
  );
}

function GlowOrb({
  color,
  size,
  top,
  bottom,
  left,
  right,
  duration,
}: {
  color: string;
  size: number;
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  duration: number;
}) {
  const reduceMotion = useReducedMotion();
  const drift = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    drift.value = withRepeat(
      withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [drift, duration, reduceMotion]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: reduceMotion ? 0 : drift.value * 22 - 11 },
      { translateX: reduceMotion ? 0 : drift.value * 14 - 7 },
    ],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          top,
          bottom,
          left,
          right,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          ...(Platform.OS === 'web' ? { filter: `blur(${Math.round(size * 0.16)}px)` } : null),
        },
        style,
      ]}
    />
  );
}

function IntroPhone() {
  return (
    <View
      style={{
        flex: 1,
        borderRadius: 40,
        borderWidth: 8,
        borderColor: '#F3D5E0',
        backgroundColor: '#1A1218',
        overflow: 'hidden',
        paddingTop: 14,
        paddingHorizontal: 14,
        shadowColor: PINK,
        shadowOpacity: 0.35,
        shadowRadius: 36,
        shadowOffset: { width: 0, height: 22 },
      }}
    >
      <View
        style={{
          alignSelf: 'center',
          width: 88,
          height: 22,
          borderRadius: 12,
          backgroundColor: '#070507',
          marginBottom: 16,
        }}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <CookieMark size={18} color={PINK} />
        <Text style={{ fontSize: 16, fontWeight: '700', color: CREAM }}>Library</Text>
      </View>
      <View style={{ gap: 10 }}>
        {RECIPES.map((recipe) => (
          <View
            key={recipe.title}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              backgroundColor: '#2A1C24',
              borderRadius: 16,
              padding: 8,
            }}
          >
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 12,
                backgroundColor: recipe.swatch,
              }}
            />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: CREAM }} numberOfLines={1}>
                {recipe.title}
              </Text>
              <Text style={{ marginTop: 3, fontSize: 11, color: MUTED }}>{recipe.meta}</Text>
            </View>
          </View>
        ))}
      </View>
      <View style={{ flex: 1 }} />
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingHorizontal: 8,
          paddingBottom: 16,
          paddingTop: 10,
        }}
      >
        <Ionicons name="book" size={18} color={PINK_BRIGHT} />
        <Ionicons name="compass-outline" size={18} color={MUTED} />
        <Ionicons name="sparkles-outline" size={18} color={MUTED} />
        <Ionicons name="cart-outline" size={18} color={MUTED} />
        <Ionicons name="settings-outline" size={18} color={MUTED} />
      </View>
    </View>
  );
}

function AppStoreButton() {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel="Download on the App Store"
      onPress={() => {
        captureWebIntroClick('app_store');
        void openAppStore();
      }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        paddingHorizontal: 16,
        minHeight: 56,
        opacity: pressed ? 0.88 : 1,
      })}
    >
      <Ionicons name="logo-apple" size={22} color="#000000" />
      <View>
        <Text style={{ color: '#000000', fontSize: 10, letterSpacing: 0.2 }}>Download on the</Text>
        <Text style={{ color: '#000000', fontSize: 16, fontWeight: '700' }}>App Store</Text>
      </View>
    </Pressable>
  );
}

function ContinueButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Continue on the web"
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: PINK,
        borderRadius: 14,
        paddingHorizontal: 18,
        minHeight: 56,
        opacity: pressed ? 0.88 : 1,
      })}
    >
      <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' }}>Continue on the web</Text>
    </Pressable>
  );
}

function FooterLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
    >
      <Text style={{ fontSize: 14, fontWeight: '600', color: MUTED }}>{label}</Text>
    </Pressable>
  );
}
