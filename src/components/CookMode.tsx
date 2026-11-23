import { useKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, PanResponder, Platform, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Pressable } from '@/components/ui/Pressable';
import { Text } from '@/components/ui/Text';
import { Tile, TileLabel } from '@/components/ui/Tile';
import { HAIRLINE, KitIcon, MIN_TOUCH, Radii } from '@/components/ui/tokens';
import { useReadAloud, useReadAloudPreference } from '@/hooks/useReadAloud';
import { useRtl } from '@/hooks/useRtl';
import { useThemePreference } from '@/hooks/useThemePreference';
import { useTypography } from '@/hooks/useTypography';
import { announce } from '@/lib/a11y';
import { logTap } from '@/lib/interactionLog';
import { stepSpeech, voiceAvailability } from '@shared/lib/readAloud';
import { formatCountdown, parseStepTimers } from '@shared/lib/stepTimers';
import type { Instruction } from '@shared/types/recipe';

type CookModeProps = {
  visible: boolean;
  title: string;
  instructions: Instruction[];
  onClose: () => void;
  onCooked?: () => void;
  textDirection?: 'ltr' | 'rtl';
  /** The language the steps are shown in (after translation); read aloud picks its voice from it. */
  contentLanguage?: string | null;
};

/**
 * Full-screen, greasy-hands cook view: huge type, tap to advance, screen stays on. Night Market (PIN-177): flat on
 * the page colour, a progress bar of one segment per step, the step number in Space Grotesk, the main Next button.
 *
 * The speaker button reads each step aloud as it appears, in the recipe's language (expo-speech, see
 * useReadAloud). It is greyed out when the phone has no voice for that language; tapping it then says why.
 */
export function CookMode({
  visible,
  title,
  instructions,
  onClose,
  onCooked,
  textDirection = 'ltr',
  contentLanguage = null,
}: CookModeProps) {
  const { t, i18n } = useTranslation();
  const { colors } = useThemePreference();
  const type = useTypography();
  const { rtl } = useRtl();
  const [index, setIndex] = useState(0);
  const [timerLeft, setTimerLeft] = useState<number | null>(null);
  const [timerDone, setTimerDone] = useState(false);
  const timerActive = timerLeft != null && timerLeft > 0;

  useKeepAwake();

  const steps = instructions;
  const lastIndex = Math.max(0, steps.length - 1);
  const step = steps[index];
  const done = steps.length > 0 && index >= steps.length;
  const timers = useMemo(() => (step ? parseStepTimers(step.text) : []), [step]);

  useEffect(() => {
    if (!visible) return;
    setIndex(0);
    setTimerLeft(null);
    setTimerDone(false);
  }, [visible]);

  useEffect(() => {
    setTimerLeft(null);
    setTimerDone(false);
  }, [index]);

  useEffect(() => {
    if (!timerActive) return;
    const id = setInterval(() => {
      setTimerLeft((prev) => {
        if (prev == null) return prev;
        if (prev <= 1) {
          setTimerDone(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [timerActive]);

  // Read aloud: the step as shown (translated, amounts converted), in the recipe's language.
  const { voices, queue } = useReadAloud(visible);
  const [readAloudOn, setReadAloudOn] = useReadAloudPreference();
  const [noVoiceHint, setNoVoiceHint] = useState(false);
  const appLanguage = i18n.language;
  const speechLanguage = contentLanguage ?? appLanguage;
  const stepVoice = voiceAvailability(voices, speechLanguage);
  const appVoice = voiceAvailability(voices, appLanguage);
  const voiceMissing = stepVoice.status === 'missing';
  const reading = visible && readAloudOn && !voiceMissing;
  const stepLabel = t('recipe.cookModeStep', { current: index + 1, total: steps.length });
  const speech =
    done || steps.length === 0
      ? appVoice.status === 'missing'
        ? null
        : {
            text: t('recipe.cookModeDone'),
            language: appLanguage,
            voice: appVoice.status === 'ready' ? appVoice.voice : null,
          }
      : step
        ? {
            text: stepSpeech({
              text: step.text,
              label: stepLabel,
              textLanguage: speechLanguage,
              labelLanguage: appLanguage,
            }),
            language: speechLanguage,
            voice: stepVoice.status === 'ready' ? stepVoice.voice : null,
          }
        : null;
  const speechText = speech?.text;
  const speechLang = speech?.language;
  const speechVoiceId = speech?.voice?.id;
  const speechVoiceLang = speech?.voice?.language;
  useEffect(() => {
    if (!reading) {
      queue.stop();
      return;
    }
    // A new step, or turning the speaker on, reads it. The voice list arriving late reads it again in the right voice.
    if (!speechText || !speechLang) return;
    queue.say(
      speechText,
      speechLang,
      speechVoiceId && speechVoiceLang ? { id: speechVoiceId, language: speechVoiceLang } : null,
    );
  }, [reading, speechText, speechLang, speechVoiceId, speechVoiceLang, queue]);

  const readAgain = () => {
    if (speech) queue.say(speech.text, speech.language, speech.voice);
  };

  const languageName = t(`languages.${speechLanguage.split('-')[0]}`, { defaultValue: speechLanguage });

  // Speak the new step (or the finish screen) after Next / Back / swipe, for screen readers. Not while the
  // speaker reads it, or it would be heard twice.
  const announcedIndex = useRef<number | null>(null);
  useEffect(() => {
    if (!visible) {
      announcedIndex.current = null;
      return;
    }
    if (announcedIndex.current === null) {
      announcedIndex.current = index;
      return;
    }
    if (announcedIndex.current === index) return;
    announcedIndex.current = index;
    if (reading) return;
    if (index >= steps.length) {
      announce(t('recipe.cookModeDone'));
      return;
    }
    const current = steps[index];
    if (!current) return;
    announce(
      `${t('recipe.cookModeStep', { current: index + 1, total: steps.length })}. ${current.text}`,
    );
  }, [index, visible, steps, t, reading]);

  // With the speaker on, a finished timer is read after the current step, not over it.
  const readingRef = useRef(reading);
  const appVoiceRef = useRef(appVoice);
  useEffect(() => {
    readingRef.current = reading;
    appVoiceRef.current = appVoice;
  });
  useEffect(() => {
    if (!timerDone) return;
    const voice = appVoiceRef.current;
    if (!readingRef.current) {
      announce(t('recipe.cookModeTimerDone'));
    } else if (voice.status !== 'missing') {
      queue.append(t('recipe.cookModeTimerDone'), appLanguage, voice.status === 'ready' ? voice.voice : null);
    }
  }, [timerDone, t, appLanguage, queue]);

  const goNext = useCallback(() => {
    setIndex((current) => Math.min(steps.length, current + 1));
  }, [steps.length]);

  const goBack = useCallback(() => {
    setIndex((current) => Math.max(0, current - 1));
  }, []);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 28 && Math.abs(gesture.dy) < 48,
        onPanResponderRelease: (_, gesture) => {
          const forward = rtl ? gesture.dx > 48 : gesture.dx < -48;
          const back = rtl ? gesture.dx < -48 : gesture.dx > 48;
          if (forward) {
            logTap('cook_mode.swipe', { direction: 'next' });
            goNext();
          } else if (back) {
            logTap('cook_mode.swipe', { direction: 'back' });
            goBack();
          }
        },
      }),
    [goBack, goNext, rtl],
  );

  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' || event.key === ' ') {
        event.preventDefault();
        goNext();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goBack();
      } else if (event.key === 'Escape') {
        onClose();
      }
    };
    globalThis.addEventListener?.('keydown', onKey as EventListener);
    return () => globalThis.removeEventListener?.('keydown', onKey as EventListener);
  }, [visible, goNext, goBack, onClose]);

  if (!visible) return null;

  const finished = done || steps.length === 0;
  const isLast = index >= lastIndex;
  const startAlign = textDirection === 'rtl' ? ('right' as const) : ('left' as const);

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView
        style={{ flex: 1, backgroundColor: colors.background }}
        accessibilityViewIsModal
        onAccessibilityEscape={onClose}
      >
        <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <IconButton
              variant="tile"
              icon="close"
              label={t('recipe.cookModeClose')}
              trackId="cook_mode.close"
              onPress={onClose}
            />
            <Text
              variant="bodySmall"
              weight="semibold"
              tone="muted"
              align="center"
              numberOfLines={1}
              accessibilityRole="header"
              style={{ flex: 1, minWidth: 0 }}
            >
              {title}
            </Text>
            <Pressable
              trackId="cook_mode.read_aloud.toggle"
              onPress={() => {
                if (voiceMissing) {
                  setNoVoiceHint(true);
                  return;
                }
                setReadAloudOn(!readAloudOn);
              }}
              accessibilityRole="switch"
              accessibilityLabel={
                voiceMissing
                  ? t('recipe.cookModeNoVoice', { language: languageName })
                  : t('recipe.cookModeReadAloud')
              }
              accessibilityState={{ checked: reading, disabled: voiceMissing }}
              style={({ pressed }) => ({
                width: MIN_TOUCH,
                height: MIN_TOUCH,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: Radii.control,
                borderWidth: reading ? 0 : HAIRLINE,
                borderColor: colors.border,
                backgroundColor: reading ? colors.primarySoft : pressed ? colors.backgroundElement : colors.surface,
                opacity: voiceMissing ? 0.45 : 1,
              })}
            >
              <KitIcon
                icon={reading ? 'volume-high-outline' : 'volume-mute-outline'}
                size={22}
                color={reading ? colors.primaryText : colors.text}
              />
            </Pressable>
          </View>

          {finished ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 16 }}>
              <View
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: Radii.card,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.primarySoft,
                }}
              >
                <KitIcon icon="checkmark" size={36} color={colors.primaryText} />
              </View>
              <Text
                variant="h1"
                align="center"
                style={{ fontSize: 40, lineHeight: type.rtl ? 50 : 44, letterSpacing: type.tracking(-0.03, 40) }}
              >
                {t('recipe.cookModeDone')}
              </Text>
              <View style={{ alignSelf: 'stretch', gap: 8, marginTop: 20 }}>
                {onCooked ? (
                  <Button
                    size="lg"
                    fullWidth
                    icon="checkmark-circle-outline"
                    trackId="cook_mode.mark_cooked"
                    accessibilityLabel={t('recipe.cookedAction')}
                    onPress={onCooked}
                  >
                    {t('recipe.cookedAction')}
                  </Button>
                ) : null}
                <Button
                  variant={onCooked ? 'ghost' : 'primary'}
                  size="lg"
                  fullWidth
                  trackId="cook_mode.finished.close"
                  accessibilityLabel={t('recipe.cookModeClose')}
                  onPress={onClose}
                >
                  {t('common.close')}
                </Button>
              </View>
            </View>
          ) : (
            <>
              {/* Progress: a segment per step, the ones done and the current one filled. */}
              <View
                accessible={false}
                importantForAccessibility="no-hide-descendants"
                style={{ flexDirection: 'row', gap: 4, marginTop: 20 }}
              >
                {steps.map((item, stepIndex) => (
                  <View
                    key={`${item.step}-${stepIndex}`}
                    style={{
                      flex: 1,
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: stepIndex <= index ? colors.primary : colors.backgroundElement,
                    }}
                  />
                ))}
              </View>

              <View
                style={{ marginTop: 16, minHeight: MIN_TOUCH, flexDirection: 'row', alignItems: 'center', gap: 12 }}
              >
                <TileLabel style={{ flex: 1, minWidth: 0 }}>{stepLabel}</TileLabel>
                {reading ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon="volume-high-outline"
                    trackId="cook_mode.read_aloud.replay"
                    accessibilityLabel={t('recipe.cookModeReadAgain')}
                    onPress={readAgain}
                  >
                    {t('recipe.cookModeReadAgain')}
                  </Button>
                ) : null}
              </View>

              <View style={{ marginTop: 8, minHeight: 0, flex: 1 }} {...pan.panHandlers}>
                <Pressable
                  trackId="cook_mode.step_card.next"
                  onPress={goNext}
                  style={{ flex: 1, justifyContent: 'center', gap: 12 }}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('recipe.cookModeStep', {
                    current: index + 1,
                    total: steps.length,
                  })}. ${step?.text ?? ''}`}
                  accessibilityHint={t('a11y.cookModeNextStepHint')}
                >
                  <Text
                    variant="number"
                    style={{ fontSize: 64, lineHeight: 64, textAlign: startAlign }}
                    accessible={false}
                    importantForAccessibility="no"
                  >
                    {index + 1}
                  </Text>
                  <Text
                    weight="medium"
                    style={{
                      fontSize: 28,
                      lineHeight: type.rtl ? 40 : 37,
                      writingDirection: textDirection,
                      textAlign: startAlign,
                    }}
                  >
                    {step?.text}
                  </Text>
                </Pressable>
              </View>

              {timers.length > 0 ? (
                <View style={{ marginBottom: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {timers.map((timer) => (
                    <Button
                      key={`${timer.seconds}-${timer.label}`}
                      variant="secondary"
                      icon="timer-outline"
                      trackId="cook_mode.timer.start"
                      accessibilityLabel={t('recipe.cookModeTimer', { label: timer.label })}
                      onPress={() => {
                        setTimerDone(false);
                        setTimerLeft(timer.seconds);
                      }}
                    >
                      {timer.label}
                    </Button>
                  ))}
                </View>
              ) : null}

              {timerLeft != null ? (
                <Tile
                  tone={timerDone ? 'primary' : 'element'}
                  size="md"
                  style={{ marginBottom: 12, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16 }}
                >
                  <Text
                    variant="number"
                    tone={timerDone ? 'onPrimary' : 'default'}
                    accessibilityRole="timer"
                    style={{ fontSize: 36, lineHeight: 42 }}
                  >
                    {timerDone ? t('recipe.cookModeTimerDone') : formatCountdown(timerLeft)}
                  </Text>
                </Tile>
              ) : null}

              {noVoiceHint && voiceMissing ? (
                <Text variant="caption" weight="semibold" align="center" accessibilityLiveRegion="polite" style={{ marginBottom: 8 }}>
                  {t('recipe.cookModeNoVoice', { language: languageName })}
                </Text>
              ) : null}
              {reading && Platform.OS === 'ios' ? (
                <Text variant="caption" tone="muted" align="center" style={{ marginBottom: 8 }}>
                  {t('recipe.cookModeSilentHint')}
                </Text>
              ) : null}
              <Text variant="caption" tone="muted" align="center" style={{ marginBottom: 12 }}>
                {t('recipe.cookModeTapHint')}
              </Text>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button
                  variant="outline"
                  size="lg"
                  icon="arrow-back"
                  trackId="cook_mode.prev_step"
                  accessibilityLabel={t('recipe.cookModeBack')}
                  disabled={index === 0}
                  onPress={goBack}
                  style={{ flex: 1, minHeight: 64, borderRadius: 20 }}
                >
                  {t('recipe.cookModeBack')}
                </Button>
                <Button
                  size="lg"
                  iconEnd={isLast ? 'checkmark' : 'arrow-forward'}
                  trackId="cook_mode.next_step"
                  accessibilityLabel={isLast ? t('recipe.cookModeDone') : t('recipe.cookModeNext')}
                  onPress={goNext}
                  style={{ flex: 1.4, minHeight: 64, borderRadius: 20 }}
                >
                  {isLast ? t('recipe.cookModeDone') : t('recipe.cookModeNext')}
                </Button>
              </View>
            </>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}
