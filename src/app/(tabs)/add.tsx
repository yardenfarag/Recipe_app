import Ionicons from "@expo/vector-icons/Ionicons";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { router } from "expo-router";
import { useShareIntentContext } from "expo-share-intent";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Platform, Pressable, Text, View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useReducedMotion,
} from "react-native-reanimated";

import { BrandHeader } from "@/components/BrandHeader";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Screen } from "@/components/Screen";
import { SnapExtractingView } from "@/components/SnapExtractingView";
import {
  SnapIntentToggle,
  useSnapIntentProgress,
  type SnapIntent,
} from "@/components/SnapIntentToggle";
import { TextInput } from "@/components/text-input";
import { TokenPurchaseSheet } from "@/components/TokenPurchaseSheet";
import { FormContentWidth } from "@/constants/theme";
import { useAuth } from "@/hooks/useAuth";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { useLanguagePreference } from "@/hooks/useLanguagePreference";
import { useProfile } from "@/hooks/useProfile";
import { useRtl } from "@/hooks/useRtl";
import { useThemePreference } from "@/hooks/useThemePreference";
import { showNotice } from "@/lib/confirmAction";
import { isFoodGateReject, shouldOfferInvent } from "@/lib/contentGate";
import { clearExtractionRequestId } from "@/lib/extractionRequestId";
import { findExistingGuestRecipe } from "@/lib/findExistingRecipe";
import {
  getGuestExtractionsRemaining,
  setGuestExtractionsRemaining,
} from "@/lib/guestExtractionUsage";
import { kitchenInstruction } from "@/lib/kitchenProfile";
import {
  fileUriToBase64,
  pickCompressedRecipeImage,
} from "@/lib/pickCompressedImage";
import { detectPlatform, normalizeSocialUrl } from "@/lib/platformUrls";
import { FREE_MONTHLY_EXTRACT_LIMIT } from "@/lib/quotas";
import {
  captureRecipeExtracted,
  type RecipeEntrySource,
} from "@/lib/analytics";
import { setRecipeDraft } from "@/lib/recipeDraft";
import { recipeIsInvented } from "@/lib/recipeOrigin";
import type {
  ExtractResult,
  ExtractedRecipe,
} from "@/lib/supabase/extractRecipe";
import {
  extractRecipe,
  extractRecipeFromImage,
  extractionOutcomeIsUncertain,
} from "@/lib/supabase/extractRecipe";
import {
  inventRecipe,
  inventRecipeFromImage,
} from "@/lib/supabase/inventRecipe";
import { fetchCloudKitchenProfile } from "@/lib/supabase/kitchen";
import { transformRecipe } from "@/lib/supabase/transformRecipe";

type Banner = {
  kind: "error" | "info" | "limit" | "credits";
  message: string;
} | null;

type InventFollowUp =
  | { kind: "photo"; base64: string; mimeType: string; source: RecipeEntrySource }
  | { kind: "url"; url: string; source: RecipeEntrySource };

// Share → Pinch needs native share-intent code (ADR 010); Expo Go can't receive it.
const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export default function AddRecipeScreen() {
  const { t } = useTranslation();
  const { language } = useLanguagePreference();
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<SnapIntent>("extract");
  const [loading, setLoading] = useState(false);
  const [statusIndex, setStatusIndex] = useState(0);
  const [banner, setBanner] = useState<Banner>(null);
  const [, setGuestExtractsRemaining] = useState<number | null>(null);
  const [extractingPhoto, setExtractingPhoto] = useState(false);
  const [jobKind, setJobKind] = useState<"extract" | "invent">("extract");
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [inventOffer, setInventOffer] = useState<{
    followUp: InventFollowUp;
    dishGuess?: string;
    allowExtract: boolean;
  } | null>(null);
  const { hasShareIntent, shareIntent, resetShareIntent } =
    useShareIntentContext();
  const { user } = useAuth();
  const {
    freeExtractsRemaining,
    purchasedCredits,
    totalCredits,
    refresh: refreshProfile,
  } = useProfile();
  const { colors } = useThemePreference();
  const { isMediumUp } = useBreakpoint();
  const { chevronForward } = useRtl();
  const intentProgress = useSnapIntentProgress(mode);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    let active = true;
    if (user) {
      setGuestExtractsRemaining(null);
      return;
    }
    getGuestExtractionsRemaining().then((remaining) => {
      if (active) setGuestExtractsRemaining(remaining);
    });
    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    if (!loading) {
      setStatusIndex(0);
      return;
    }
    const lineCount = jobKind === "invent" ? 3 : 4;
    const id = setInterval(() => {
      setStatusIndex((i) => (i + 1) % lineCount);
    }, 2800);
    return () => clearInterval(id);
  }, [loading, jobKind]);

  useEffect(() => {
    if (!hasShareIntent) return;

    const files = shareIntent.files;
    const imageFile = files?.find((file) =>
      (file.mimeType ?? "").startsWith("image/"),
    );
    if (imageFile?.path) {
      resetShareIntent();
      void handleSharedImage(imageFile.path);
      return;
    }

    // Wait until the payload is present — on Android hasShareIntent can flip
    // true a tick before webUrl/text are hydrated; resetting early drops the share.
    const raw = shareIntent.webUrl ?? shareIntent.text ?? "";
    if (!raw.trim()) return;

    const sharedUrl = normalizeSocialUrl(raw);
    resetShareIntent();
    if (sharedUrl) {
      setUrl(sharedUrl);
      void handleGetRecipe(sharedUrl, "extract", "share");
    } else {
      setBanner({
        kind: "error",
        message: t("snap.invalidShare"),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasShareIntent, shareIntent.webUrl, shareIntent.text, shareIntent.files]);

  function promptGuestExtractLimit() {
    router.push("/auth?mode=signup&reason=extract_limit");
  }

  function promptCreditLimit() {
    setBanner({
      kind: "credits",
      message: t("snap.creditLimitBody", { limit: FREE_MONTHLY_EXTRACT_LIMIT }),
    });
  }

  async function applyExtractResult(
    result: ExtractResult,
    requestKey: string,
    source: RecipeEntrySource,
    followUp?: InventFollowUp,
  ): Promise<boolean> {
    if (
      (!result.recipe || result.cached) &&
      result.request_id &&
      !extractionOutcomeIsUncertain(result.code)
    ) {
      try {
        await clearExtractionRequestId(requestKey, result.request_id);
      } catch (error) {
        console.warn("[extraction] request acknowledgement failed", error);
      }
    }

    if (typeof result.guest_extracts_remaining === "number") {
      await setGuestExtractionsRemaining(result.guest_extracts_remaining);
      setGuestExtractsRemaining(result.guest_extracts_remaining);
    }
    if (user) {
      await refreshProfile();
    }

    if (
      result.code === "insufficient_credits" ||
      result.code === "subscription_required" ||
      result.code === "insufficient_tokens"
    ) {
      promptCreditLimit();
      return false;
    }

    if (result.code === "auth_required" || result.code === "guest_id_required") {
      router.push("/auth?mode=signup&reason=extract_limit");
      return false;
    }

    if (result.code === "guest_limit") {
      await setGuestExtractionsRemaining(0);
      setGuestExtractsRemaining(0);
      await promptGuestExtractLimit();
      return false;
    }

    if (result.code === "video_too_long") {
      setBanner({
        kind: "error",
        message: result.message ?? t("snap.videoTooLong"),
      });
      return false;
    }

    if (result.code === "invalid_url") {
      setBanner({ kind: "error", message: t("snap.invalidUrl") });
      return false;
    }

    if (result.code === "gate_unavailable") {
      setBanner({ kind: "error", message: t("snap.gateFailed") });
      return false;
    }

    if (result.code === "daily_limit") {
      setBanner({ kind: "info", message: t("snap.gateDailyLimit") });
      return false;
    }

    if (isFoodGateReject(result.code)) {
      setBanner({
        kind: "error",
        message:
          result.platform === "photo"
            ? t("snap.notFood")
            : t("snap.notFoodLink"),
      });
      return false;
    }

    if (shouldOfferInvent(result.code) && followUp) {
      setLoading(false);
      setExtractingPhoto(false);
      setInventOffer({
        followUp,
        dishGuess: result.dish_guess,
        allowExtract: result.code === "looks_like_dish",
      });
      return false;
    }

    if (result.cached && result.recipe && "id" in result.recipe) {
      router.push(`/recipe/${result.recipe.id}`);
      setUrl("");
      return true;
    }

    if (result.status === "coming_soon") {
      setBanner({
        kind: "info",
        message: result.message ?? t("snap.comingSoon"),
      });
      return false;
    }

    if (result.status === "failed" || !result.recipe) {
      setBanner({
        kind: "error",
        message: result.message ?? t("snap.notFound"),
      });
      return false;
    }

    let recipeToPreview: ExtractedRecipe = result.recipe;
    captureRecipeExtracted({
      source,
      mode: recipeIsInvented(recipeToPreview) ? "invent" : "extract",
    });
    if (
      user &&
      recipeToPreview.ingredients.length > 0 &&
      !recipeIsInvented(recipeToPreview)
    ) {
      try {
        const kitchen = await fetchCloudKitchenProfile(user.id);
        const instruction = kitchen.autoApplyOnExtract
          ? kitchenInstruction(kitchen)
          : null;
        if (instruction) {
          const adapted = await transformRecipe(
            kitchen.diets[0] ?? "custom",
            {
              title: recipeToPreview.title,
              servings: recipeToPreview.servings,
              ingredients: recipeToPreview.ingredients,
              instructions: recipeToPreview.instructions,
              calories: recipeToPreview.calories,
              original_url: recipeToPreview.original_url,
            },
            instruction,
            { kitchenAutoApply: true },
          );
          if (adapted.status === "ok" && adapted.recipe) {
            recipeToPreview = {
              ...recipeToPreview,
              servings: adapted.recipe.servings,
              ingredients: adapted.recipe.ingredients,
              instructions: adapted.recipe.instructions,
              calories: adapted.recipe.calories,
              kitchen_adapted_summary: adapted.recipe.summary,
              kitchen_original: {
                title: result.recipe.title,
                servings: result.recipe.servings,
                ingredients: result.recipe.ingredients,
                instructions: result.recipe.instructions,
                calories: result.recipe.calories,
              },
            };
          } else {
            await showNotice(
              t("recipe.kitchenAutoApplyFailedTitle"),
              t("recipe.kitchenAutoApplyFailed"),
            );
          }
        }
      } catch (error) {
        console.warn("[kitchen] auto-apply skipped", error);
        await showNotice(
          t("recipe.kitchenAutoApplyFailedTitle"),
          t("recipe.kitchenAutoApplyFailed"),
        );
      }
    }

    try {
      await setRecipeDraft(
        recipeToPreview,
        result.request_id
          ? { url: requestKey, requestId: result.request_id }
          : undefined,
      );
    } catch (error) {
      console.warn("[recipe-draft] persistence failed", error);
    }
    router.push("/recipe/preview");
    setUrl("");
    return true;
  }

  async function runPhotoInvent(
    base64: string,
    mimeType: string,
    source: RecipeEntrySource,
    alreadyGated = false,
  ): Promise<boolean> {
    setBanner(null);
    setExtractingPhoto(true);
    setJobKind("invent");
    setLoading(true);
    try {
      const result = await inventRecipeFromImage(base64, mimeType, language, {
        alreadyGated,
      });
      const key = `invent-photo:${base64.length}:${base64.slice(0, 64)}`;
      return applyExtractResult(result, key, source);
    } catch {
      setBanner({ kind: "error", message: t("snap.inventFailed") });
      return false;
    } finally {
      setLoading(false);
      setExtractingPhoto(false);
    }
  }

  async function runUrlInvent(
    target: string,
    source: RecipeEntrySource,
    alreadyGated = false,
  ): Promise<boolean> {
    setBanner(null);
    setJobKind("invent");
    setLoading(true);
    try {
      const result = await inventRecipe(target, language, { alreadyGated });
      return applyExtractResult(result, `invent:${target}`, source);
    } catch {
      setBanner({ kind: "error", message: t("snap.inventFailed") });
      return false;
    } finally {
      setLoading(false);
    }
  }

  function requireAccount(): boolean {
    if (user) return true;
    router.push("/auth?mode=signup&reason=extract_limit");
    return false;
  }

  async function runPhotoExtract(
    base64: string,
    mimeType: string,
    source: RecipeEntrySource,
    intent: SnapIntent = mode,
  ) {
    if (loading) return;
    if (!requireAccount()) return;

    setBanner(null);
    setExtractingPhoto(true);
    if (intent === "invent") {
      await runPhotoInvent(base64, mimeType, source);
      return;
    }

    setJobKind("extract");
    setLoading(true);
    try {
      const result = await extractRecipeFromImage(base64, mimeType);
      const key = `photo:${base64.length}:${base64.slice(0, 64)}`;
      await applyExtractResult(result, key, source, {
        kind: "photo",
        base64,
        mimeType,
        source,
      });
    } catch {
      setBanner({ kind: "error", message: t("snap.genericError") });
    } finally {
      setLoading(false);
      setExtractingPhoto(false);
    }
  }

  async function handleSharedImage(path: string) {
    const image = await fileUriToBase64(path);
    if (!image) {
      setBanner({ kind: "error", message: t("snap.invalidShareImage") });
      return;
    }
    await runPhotoExtract(image.base64, image.mimeType, "share", "extract");
  }

  async function handlePickPhoto(source: "camera" | "library") {
    if (loading) return;
    const image = await pickCompressedRecipeImage(source, {
      permissionTitle: t("settings.permissionNeededTitle"),
      permissionCamera: t("settings.permissionCamera"),
      permissionLibrary: t("settings.permissionLibrary"),
      readFailedTitle: t("settings.imageReadFailedTitle"),
      readFailedBody: t("snap.photoTooLarge"),
    });
    if (!image) return;
    await runPhotoExtract(image.base64, image.mimeType, source);
  }

  function handlePhotoEntry() {
    if (Platform.OS === "web") {
      void handlePickPhoto("library");
      return;
    }
    Alert.alert(
      mode === "invent" ? t("snap.inventPhotoTitle") : t("snap.photoTitle"),
      mode === "invent" ? t("snap.inventPhotoHint") : t("snap.photoHint"),
      [
        {
          text: t("settings.takePhoto"),
          onPress: () => void handlePickPhoto("camera"),
        },
        {
          text: t("settings.chooseLibrary"),
          onPress: () => void handlePickPhoto("library"),
        },
        { text: t("common.cancel"), style: "cancel" },
      ],
    );
  }

  async function handleGetRecipe(
    overrideUrl?: string,
    intent: SnapIntent = mode,
    source: RecipeEntrySource = "url",
  ) {
    if (loading) return;
    const target = normalizeSocialUrl(overrideUrl ?? url);
    if (!target) {
      setBanner({
        kind: "error",
        message: t("snap.invalidUrl"),
      });
      return;
    }

    if (!requireAccount()) return;

    setBanner(null);
    setUrl(target);

    try {
      // Guests: check local library. Signed-in users: extract-recipe handles duplicates server-side.
      if (!user) {
        const existing = await findExistingGuestRecipe(
          target,
          intent === "invent" ? "invented" : "extracted",
        );
        if (existing) {
          router.push(`/recipe/${existing.id}`);
          setUrl("");
          return;
        }

        const remaining = await getGuestExtractionsRemaining();
        setGuestExtractsRemaining(remaining);
        if (remaining <= 0) {
          await promptGuestExtractLimit();
          return;
        }
      }

      if (intent === "invent") {
        await runUrlInvent(target, source);
        return;
      }

      setJobKind("extract");
      setLoading(true);
      const result = await extractRecipe(target);
      await applyExtractResult(result, target, source, {
        kind: "url",
        url: target,
        source,
      });
    } catch {
      setBanner({ kind: "error", message: t("snap.genericError") });
    } finally {
      setLoading(false);
    }
  }

  async function acceptInventOffer() {
    const offer = inventOffer;
    if (!offer) return;
    setInventOffer(null);
    if (offer.followUp.kind === "photo") {
      await runPhotoInvent(
        offer.followUp.base64,
        offer.followUp.mimeType,
        offer.followUp.source,
        true,
      );
      return;
    }
    await runUrlInvent(offer.followUp.url, offer.followUp.source, true);
  }

  async function extractAnywayFromOffer() {
    const offer = inventOffer;
    if (!offer) return;
    setInventOffer(null);
    setBanner(null);
    setJobKind("extract");
    setLoading(true);
    if (offer.followUp.kind === "photo") setExtractingPhoto(true);
    try {
      if (offer.followUp.kind === "photo") {
        const result = await extractRecipeFromImage(
          offer.followUp.base64,
          offer.followUp.mimeType,
          { forceExtract: true },
        );
        const key = `photo:${offer.followUp.base64.length}:${offer.followUp.base64.slice(0, 64)}`;
        await applyExtractResult(result, key, offer.followUp.source, offer.followUp);
      } else {
        const result = await extractRecipe(offer.followUp.url, {
          forceExtract: true,
        });
        await applyExtractResult(
          result,
          offer.followUp.url,
          offer.followUp.source,
          offer.followUp,
        );
      }
    } catch {
      setBanner({ kind: "error", message: t("snap.genericError") });
    } finally {
      setLoading(false);
      setExtractingPhoto(false);
    }
  }

  const canSubmit = Boolean(url.trim());
  const inventing = jobKind === "invent";
  const readingLine = extractingPhoto
    ? t("snap.statusReadingPhoto")
    : detectPlatform(url) === "web"
      ? t("snap.statusReadingPage")
      : t("snap.statusReadingVideo");
  const statusLines = inventing
    ? ([
        readingLine,
        t("snap.statusFiguringDish"),
        t("snap.statusWritingHome"),
      ] as const)
    : ([
        readingLine,
        t("snap.statusIngredients"),
        t("snap.statusWritingSteps"),
        t("snap.statusAlmost"),
      ] as const);

  const signedInQuotaLabel = (() => {
    if (!user || totalCredits == null) return null;
    return t("snap.creditsRemaining", {
      total: totalCredits,
      free: freeExtractsRemaining ?? 0,
      purchased: purchasedCredits ?? 0,
    });
  })();

  if (loading) {
    return (
      <Screen dense tabScreen>
        <SnapExtractingView
          statusLines={statusLines}
          statusIndex={statusIndex}
        />
      </Screen>
    );
  }

  return (
    <Screen dense tabScreen>
      <View
        className="flex-1 px-5 pt-1"
        style={
          isMediumUp
            ? { maxWidth: FormContentWidth, width: "100%", alignSelf: "center" }
            : undefined
        }
      >
        <BrandHeader
          copyKey={mode}
          title={mode === "invent" ? t("snap.inventTitle") : t("snap.title")}
          subtitle={
            mode === "invent" ? t("snap.inventSubtitle") : t("snap.subtitle")
          }
        />

        <Animated.View
          className="mb-6 mt-6"
          layout={reduceMotion ? undefined : LinearTransition.duration(280)}
        >
          <View className="mb-4">
            <SnapIntentToggle
              mode={mode}
              progress={intentProgress}
              extractLabel={t("snap.modeExtract")}
              inventLabel={t("snap.modeInvent")}
              onChange={(next) => {
                setMode(next);
                if (banner) setBanner(null);
              }}
            />
          </View>

          {mode === "invent" ? (
            <Animated.Text
              entering={reduceMotion ? undefined : FadeIn.duration(220)}
              exiting={reduceMotion ? undefined : FadeOut.duration(140)}
              className="mb-3 text-xs leading-5"
              style={{ color: colors.textSecondary }}
            >
              {t("snap.inventDisclaimer")}
            </Animated.Text>
          ) : null}

          <Animated.Text
            key={`url-label-${mode}`}
            entering={reduceMotion ? undefined : FadeIn.duration(200)}
            className="mb-2 text-sm font-semibold"
            style={{ color: colors.text }}
          >
            {mode === "invent" ? t("snap.inventUrlLabel") : t("snap.urlLabel")}
          </Animated.Text>
          {signedInQuotaLabel ? (
            <Text
              className="mb-2 text-xs font-medium"
              style={{ color: colors.accent }}
            >
              {signedInQuotaLabel}
            </Text>
          ) : null}
          <View
            className="mb-3 flex-row items-center rounded-[22px] px-3.5"
            style={{ backgroundColor: colors.surface, overflow: "hidden" }}
          >
            <Ionicons
              name="link-outline"
              size={18}
              color={colors.textSecondary}
            />
            <TextInput
              className="flex-1 px-3 py-4 text-base"
              style={{ color: colors.text }}
              placeholder={
                mode === "invent"
                  ? t("snap.inventUrlPlaceholder")
                  : t("snap.urlPlaceholder")
              }
              placeholderTextColor={colors.textSecondary}
              value={url}
              onChangeText={(text) => {
                setUrl(text);
                if (banner) setBanner(null);
              }}
              onSubmitEditing={() => {
                if (canSubmit) void handleGetRecipe();
              }}
              returnKeyType="go"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <Pressable
              onPress={() => void handleGetRecipe()}
              disabled={!canSubmit}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={
                mode === "invent" ? t("snap.modeInvent") : t("tabs.snap")
              }
              className="h-10 w-10 items-center justify-center rounded-full"
              style={{
                backgroundColor: canSubmit
                  ? mode === "invent"
                    ? colors.accent
                    : colors.primary
                  : colors.backgroundElement,
                opacity: canSubmit ? 1 : 0.55,
              }}
            >
              <Ionicons
                name={mode === "invent" ? "restaurant-outline" : chevronForward}
                size={18}
                color={canSubmit ? "#fff" : colors.textSecondary}
              />
            </Pressable>
          </View>

          {banner && (
            <View
              className="mb-3 rounded-[22px] px-4 py-3"
              style={{
                backgroundColor:
                  banner.kind === "error"
                    ? colors.dangerSoft
                    : colors.primarySoft,
                overflow: "hidden",
              }}
            >
              <Text
                className="text-sm leading-5"
                style={{
                  color:
                    banner.kind === "error" ? colors.danger : colors.primary,
                }}
              >
                {banner.message}
              </Text>
              {banner.kind === "credits" && (
                <Pressable
                  className="mt-3 self-start rounded-2xl px-4 py-2"
                  style={{ backgroundColor: colors.primary }}
                  onPress={() => setCreditsOpen(true)}
                >
                  <Text className="text-sm font-bold text-white">
                    {t("credits.buyAction")}
                  </Text>
                </Pressable>
              )}
            </View>
          )}

          <Pressable
            className="min-h-[48px] items-center justify-center rounded-[22px] py-3.5"
            style={{ backgroundColor: colors.surface, overflow: "hidden" }}
            onPress={handlePhotoEntry}
          >
            <View className="flex-row items-center gap-2">
              <Ionicons
                name="camera-outline"
                size={18}
                color={colors.primary}
              />
              <Animated.Text
                key={`photo-${mode}`}
                entering={reduceMotion ? undefined : FadeIn.duration(200)}
                className="text-base font-bold"
                style={{ color: colors.text }}
              >
                {mode === "invent"
                  ? t("snap.inventPhotoAction")
                  : t("snap.photoAction")}
              </Animated.Text>
            </View>
          </Pressable>
        </Animated.View>

        <View
          className="rounded-[22px] p-4 mt-4"
          style={{ backgroundColor: colors.accentSoft, overflow: "hidden" }}
        >
          <View className="mb-1.5 flex-row items-center gap-2">
            <Ionicons name="share-outline" size={16} color={colors.accent} />
            <Text
              className="text-sm font-semibold"
              style={{ color: colors.text }}
            >
              {t("snap.shareTitle")}
            </Text>
          </View>
          <Text
            className="text-xs leading-5"
            style={{ color: colors.textSecondary }}
          >
            {isExpoGo ? t("snap.shareBodyExpoGo") : t("snap.shareBody")}
          </Text>
        </View>
        <TokenPurchaseSheet
          visible={creditsOpen}
          onClose={() => setCreditsOpen(false)}
          onPurchased={() => refreshProfile()}
        />
        <ConfirmDialog
          visible={inventOffer != null}
          title={t("snap.inventConfirmTitle")}
          message={
            inventOffer?.dishGuess?.trim()
              ? t("snap.inventConfirmBody", {
                  dish: inventOffer.dishGuess.trim(),
                })
              : t("snap.inventConfirmBodyGeneric")
          }
          confirmLabel={t("snap.inventConfirm")}
          cancelLabel={t("common.notNow")}
          secondaryLabel={
            inventOffer?.allowExtract ? t("snap.extractAnyway") : undefined
          }
          onConfirm={() => void acceptInventOffer()}
          onCancel={() => setInventOffer(null)}
          onSecondary={
            inventOffer?.allowExtract
              ? () => void extractAnywayFromOffer()
              : undefined
          }
        />
      </View>
    </Screen>
  );
}
