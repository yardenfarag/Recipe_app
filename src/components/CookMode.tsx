import Ionicons from '@expo/vector-icons/Ionicons';
import { useKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  PanResponder,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useRtl } from '@/hooks/useRtl';
import { useThemePreference } from '@/hooks/useThemePreference';
import { announce } from '@/lib/a11y';
import { formatCountdown, parseStepTimers } from '@/lib/stepTimers';
import type { Instruction } from '@/types/recipe';

type CookModeProps = {
  visible: boolean;
  title: string;
  instructions: Instruction[];
  onClose: () => void;
  onCooked?: () => void;
  textDirection?: 'ltr' | 'rtl';
};

/**
 * Full-screen, greasy-hands cook view: huge type, tap to advance, screen stays on.
 */
export function CookMode({
  visible,
  title,
  instructions,
  onClose,
  onCooked,
  textDirection = 'ltr',
}: CookModeProps) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
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

  // Speak the new step (or the finish screen) after Next / Back / swipe.
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
    if (index >= steps.length) {
      announce(t('recipe.cookModeDone'));
      return;
    }
    const current = steps[index];
    if (!current) return;
    announce(
      `${t('recipe.cookModeStep', { current: index + 1, total: steps.length })}. ${current.text}`,
    );
  }, [index, visible, steps, t]);

  useEffect(() => {
    if (timerDone) announce(t('recipe.cookModeTimerDone'));
  }, [timerDone, t]);

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
          if (forward) goNext();
          else if (back) goBack();
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

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView
        className="flex-1"
        style={{ backgroundColor: colors.background }}
        accessibilityViewIsModal
        onAccessibilityEscape={onClose}
      >
        <View className="flex-1 px-5 pt-2 pb-4">
          <View className="flex-row items-center justify-between gap-3">
            <Pressable
              onPress={onClose}
              hitSlop={12}
              className="h-12 w-12 items-center justify-center rounded-full active:opacity-80"
              style={{ backgroundColor: colors.frosted }}
              accessibilityRole="button"
              accessibilityLabel={t('recipe.cookModeClose')}
            >
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
            <Text
              className="min-w-0 flex-1 text-center text-sm font-semibold"
              style={{ color: colors.textSecondary }}
              numberOfLines={1}
              accessibilityRole="header"
            >
              {title}
            </Text>
            <View className="h-12 w-12" />
          </View>

          {done || steps.length === 0 ? (
            <View className="flex-1 items-center justify-center px-4">
              <Text
                className="text-center text-4xl font-bold leading-tight"
                style={{ color: colors.text }}
                accessibilityRole="header"
              >
                {t('recipe.cookModeDone')}
              </Text>
              {onCooked ? (
                <Pressable
                  onPress={onCooked}
                  className="mt-8 min-h-[56px] items-center justify-center rounded-3xl px-8 active:opacity-80"
                  style={{ backgroundColor: colors.primary }}
                  accessibilityRole="button"
                  accessibilityLabel={t('recipe.cookedAction')}
                >
                  <Text className="text-lg font-bold" style={{ color: colors.onPrimary }}>
                    {t('recipe.cookedAction')}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={onClose}
                className="mt-4 min-h-[44px] items-center justify-center px-4"
                accessibilityRole="button"
                accessibilityLabel={t('recipe.cookModeClose')}
              >
                <Text className="text-base font-semibold" style={{ color: colors.primary }}>
                  {t('common.close')}
                </Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text
                className="mt-6 text-sm font-semibold uppercase tracking-wide"
                style={{ color: colors.textSecondary }}
              >
                {t('recipe.cookModeStep', { current: index + 1, total: steps.length })}
              </Text>

              <View className="mt-4 min-h-0 flex-1" {...pan.panHandlers}>
                <Pressable
                  onPress={goNext}
                  className="flex-1 justify-center"
                  accessibilityRole="button"
                  accessibilityLabel={`${t('recipe.cookModeStep', {
                    current: index + 1,
                    total: steps.length,
                  })}. ${step?.text ?? ''}`}
                  accessibilityHint={t('a11y.cookModeNextStepHint')}
                >
                  <Text
                    className="text-[32px] font-semibold leading-10"
                    style={{
                      color: colors.text,
                      writingDirection: textDirection,
                      textAlign: textDirection === 'rtl' ? 'right' : 'left',
                    }}
                  >
                    {step?.text}
                  </Text>
                </Pressable>
              </View>

              {timers.length > 0 ? (
                <View className="mb-4 flex-row flex-wrap gap-2">
                  {timers.map((timer) => (
                    <Pressable
                      key={`${timer.seconds}-${timer.label}`}
                      onPress={() => {
                        setTimerDone(false);
                        setTimerLeft(timer.seconds);
                      }}
                      className="min-h-[48px] items-center justify-center rounded-full px-4 active:opacity-80"
                      style={{ backgroundColor: colors.accentSoft }}
                      accessibilityRole="button"
                      accessibilityLabel={t('recipe.cookModeTimer', { label: timer.label })}
                    >
                      <Text className="text-base font-bold" style={{ color: colors.accent }}>
                        {timer.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              {timerLeft != null ? (
                <View
                  className="mb-4 items-center rounded-3xl px-4 py-3"
                  style={{ backgroundColor: timerDone ? colors.accentSoft : colors.primarySoft }}
                >
                  <Text
                    className="text-3xl font-bold tabular-nums"
                    style={{ color: timerDone ? colors.accent : colors.primary }}
                    accessibilityRole="timer"
                  >
                    {timerDone ? t('recipe.cookModeTimerDone') : formatCountdown(timerLeft)}
                  </Text>
                </View>
              ) : null}

              <Text className="mb-3 text-center text-xs" style={{ color: colors.textSecondary }}>
                {t('recipe.cookModeTapHint')}
              </Text>

              <View className="flex-row gap-3">
                <Pressable
                  onPress={goBack}
                  disabled={index === 0}
                  className="min-h-[64px] flex-1 items-center justify-center rounded-3xl px-3 py-2 active:opacity-80"
                  style={{
                    backgroundColor: colors.frosted,
                    opacity: index === 0 ? 0.45 : 1,
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t('recipe.cookModeBack')}
                  accessibilityState={{ disabled: index === 0 }}
                >
                  <Text className="text-lg font-bold" style={{ color: colors.text }}>
                    {t('recipe.cookModeBack')}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={goNext}
                  className="min-h-[64px] flex-[1.4] items-center justify-center rounded-3xl px-3 py-2 active:opacity-80"
                  style={{ backgroundColor: colors.primary }}
                  accessibilityRole="button"
                  accessibilityLabel={
                    index >= lastIndex ? t('recipe.cookModeDone') : t('recipe.cookModeNext')
                  }
                >
                  <Text className="text-lg font-bold" style={{ color: colors.onPrimary }}>
                    {index >= lastIndex ? t('recipe.cookModeDone') : t('recipe.cookModeNext')}
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}
