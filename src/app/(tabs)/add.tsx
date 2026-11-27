import Ionicons from "@expo/vector-icons/Ionicons";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useShareIntentContext } from "expo-share-intent";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Platform, ScrollView, View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useReducedMotion,
} from "react-native-reanimated";

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
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { Tile } from "@/components/ui/Tile";
import { HAIRLINE, KitIcon, MIN_TOUCH, Radii, type IconName } from "@/components/ui/tokens";
import { CreditsPill } from "@/components/ui/TopBar";
import { FormContentWidth } from "@/constants/theme";
import { useAuth } from "@/hooks/useAuth";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { useLanguagePreference } from "@/hooks/useLanguagePreference";
import { useProfile } from "@/hooks/useProfile";
import { useRtl } from "@/hooks/useRtl";
import { useThemePreference } from "@/hooks/useThemePreference";
import { useTypography } from "@/hooks/useTypography";
import { announce } from "@/lib/a11y";
import { haptics } from "@/lib/haptics";
import { logTap } from "@/lib/interactionLog";
import { showNotice } from "@/lib/dialog";
import { claimShare, releaseShareClaim } from "@/lib/shareIntentClaim";
import { creditPurchasesOfferedOn } from "@/lib/purchases";
import { openAppStore } from "@/lib/appStore";
import { isFoodGateReject, shouldOfferInvent } from "@shared/lib/contentGate";
import { clearExtractionRequestId } from "@/lib/extractionRequestId";
import { findExistingGuestRecipe } from "@/lib/findExistingRecipe";
import {
  getGuestExtractionsRemaining,
  setGuestExtractionsRemaining,
} from "@/lib/guestExtractionUsage";
import { openRecipeEditor } from "@/lib/openRecipeEditor";
import {
  fileUriToBase64,
  pickCompressedRecipeImage,
} from "@/lib/pickCompressedImage";
import {
  pickRecipePdf,
  readRecipePdf,
  sharedRecipeFile,
  type RecipePdfRead,
} from "@/lib/recipePdf";
import { pdfRequestKey } from "@shared/lib/supabase/extractRecipe";
import { normalizeSocialUrl } from "@shared/lib/platformUrls";
import { FREE_MONTHLY_EXTRACT_LIMIT } from "@shared/lib/quotas";
import { recipePlatformProperty } from "@shared/lib/productEvents";
import {
  captureRecipeExtracted,
  type RecipeEntrySource,
} from "@/lib/analytics";
import { autoSaveRecipe } from "@/lib/autoSaveRecipe";
import { clearRecipeDraft, setRecipeDraft } from "@/lib/recipeDraft";
import { resolveShareIntentAction } from "@/lib/shareIntentGate";
import { whatsAppExportInShare } from "@/lib/whatsappImport/shareRouting";
import { recipeIsInvented } from "@shared/lib/recipeOrigin";
import { importErrorText } from "@shared/lib/serverErrors";
import type {
  ExtractResult,
  ExtractedRecipe,
} from "@/lib/supabase/extractRecipe";
import {
  extractRecipe,
  extractRecipeFromImage,
  extractRecipeFromPdf,
  extractionOutcomeIsUncertain,
  NO_RESPONSE_CODE,
} from "@/lib/supabase/extractRecipe";
import {
  inventRecipe,
  inventRecipeFromImage,
} from "@/lib/supabase/inventRecipe";
import { applyKitchenOnExtract } from "@shared/lib/supabase/kitchenAutoApply";

type Banner = {
  kind: "error" | "info" | "limit" | "credits";
  message: string;
  /**
   * A link that couldn't be read: the banner offers ways on instead of a dead end (try again, a screenshot of the
   * recipe, or Guess the recipe). A failed first try used to be where new people gave up.
   */
  failedUrl?: string;
} | null;

type InventFollowUp =
  | { kind: "photo"; base64: string; mimeType: string; source: RecipeEntrySource }
  | { kind: "url"; url: string; source: RecipeEntrySource };

type PendingShare =
  | { kind: "image"; path: string }
  | { kind: "pdf"; path: string; size: number | null }
  | { kind: "url"; url: string };

// Share → Pinch needs native share-intent code (ADR 010); Expo Go can't receive it.
const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export default function AddRecipeScreen() {
  const { t } = useTranslation();
  const { language } = useLanguagePreference();
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<SnapIntent>("extract");
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);
  const [, setGuestExtractsRemaining] = useState<number | null>(null);
  const [extractingPhoto, setExtractingPhoto] = useState(false);
  const [extractingPdf, setExtractingPdf] = useState(false);
  const [jobKind, setJobKind] = useState<"extract" | "invent">("extract");
  const [creditsOpen, setCreditsOpen] = useState(false);
  /** ADR 019: a partial import waits here for "Fill it in myself" or Cancel. */
  const [partialImport, setPartialImport] = useState<{
    missingIngredients: boolean;
  } | null>(null);
  const purchasesHere = creditPurchasesOfferedOn(Platform.OS);
  const [inventOffer, setInventOffer] = useState<{
    followUp: InventFollowUp;
    dishGuess?: string;
    allowExtract: boolean;
  } | null>(null);
  const { hasShareIntent, shareIntent, resetShareIntent } =
    useShareIntentContext();
  const { user, loading: authLoading } = useAuth();
  const pendingShareRef = useRef<PendingShare | null>(null);
  const {
    freeExtractsRemaining,
    purchasedCredits,
    totalCredits,
    refresh: refreshProfile,
  } = useProfile();
  const { colors } = useThemePreference();
  const { isMediumUp } = useBreakpoint();
  const { textAlign, writingDirection } = useRtl();
  const type = useTypography();
  const intentProgress = useSnapIntentProgress(mode);
  const reduceMotion = useReducedMotion();

  // A link pasted into the Library's search bar arrives as ?url= and starts right away.
  const { url: urlParam } = useLocalSearchParams<{ url?: string }>();
  useEffect(() => {
    if (!urlParam || authLoading) return;
    router.setParams({ url: undefined });
    setUrl(urlParam);
    void handleGetRecipe(urlParam, "extract", "url");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlParam, authLoading]);

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

  // Errors/notices land on the form after the wait screen unmounts, so focus
  // doesn't move to them — speak them for VoiceOver/TalkBack.
  useEffect(() => {
    if (banner) announce(banner.message);
  }, [banner]);

  function runSharedRecipe(share: PendingShare) {
    if (share.kind === "image") {
      void handleSharedImage(share.path);
      return;
    }
    if (share.kind === "pdf") {
      void handleSharedPdf(share.path, share.size);
      return;
    }
    setUrl(share.url);
    void handleGetRecipe(share.url, "extract", "share");
  }

  // Back on Snap still signed out means the guest closed sign-up. Drop the
  // held share so a much later sign-in doesn't start it out of nowhere.
  // Declared before the share effect so on mount it runs first and can't
  // clear a share that was just held.
  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !user) pendingShareRef.current = null;
    }, [authLoading, user]),
  );

  useEffect(() => {
    if (!hasShareIntent) {
      releaseShareClaim();
      return;
    }
    // A WhatsApp chat export opens the WhatsApp import screen (ShareIntentRouter), not Snap.
    if (whatsAppExportInShare(shareIntent.files)) return;

    const sharedFile = sharedRecipeFile(shareIntent.files);
    // Wait until the payload is present — on Android hasShareIntent can flip
    // true a tick before webUrl/text are hydrated; resetting early drops the share.
    const raw = shareIntent.webUrl ?? shareIntent.text ?? "";
    const shareKey = sharedFile
      ? `${sharedFile.kind}:${sharedFile.path}`
      : raw.trim();

    // On a cold start auth is still hydrating, so `user` is null even for a
    // signed-in user. Wait for it rather than consuming the share into a
    // sign-up prompt.
    const action = resolveShareIntentAction({
      authLoading,
      signedIn: !!user,
      hasPayload: !!shareKey,
    });
    if (action === "wait") return;

    // resetShareIntent() lands on a later render, and more than one Snap screen
    // can be mounted. The claim is app-wide so a share is only taken once.
    if (!claimShare(shareKey)) return;
    resetShareIntent();

    let share: PendingShare;
    if (sharedFile) {
      share = sharedFile;
    } else {
      const sharedUrl = normalizeSocialUrl(raw);
      if (!sharedUrl) {
        setBanner({
          kind: "error",
          message: t("snap.invalidShare"),
        });
        return;
      }
      share = { kind: "url", url: sharedUrl };
    }

    if (action === "require_account") {
      // Hold the share through sign-up; the effect below resumes it.
      pendingShareRef.current = share;
      if (share.kind === "url") setUrl(share.url);
      requireAccount();
      return;
    }

    runSharedRecipe(share);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hasShareIntent,
    shareIntent.webUrl,
    shareIntent.text,
    shareIntent.files,
    authLoading,
    user,
  ]);

  useEffect(() => {
    const share = pendingShareRef.current;
    if (!user || !share) return;
    pendingShareRef.current = null;
    runSharedRecipe(share);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  function promptGuestExtractLimit() {
    router.push("/auth?mode=signup&reason=extract_limit");
  }

  function promptCreditLimit() {
    setBanner({
      kind: "credits",
      message: t(purchasesHere ? "snap.creditLimitBody" : "snap.creditLimitBodyWeb", {
        limit: FREE_MONTHLY_EXTRACT_LIMIT,
      }),
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

    const failedUrl = followUp?.kind === "url" ? followUp.url : undefined;

    if (result.code === "video_too_long") {
      setBanner({
        kind: "error",
        message: importErrorText(result, t, language, "snap.videoTooLong"),
        failedUrl,
      });
      return false;
    }

    // Out of time: the server refunded the credit. No answer: the server's text never came, so
    // don't show the client library's English error.
    if (result.code === "extraction_timeout") {
      setBanner({ kind: "error", message: t("snap.timedOut"), failedUrl });
      return false;
    }

    if (result.code === NO_RESPONSE_CODE) {
      setBanner({ kind: "error", message: t("snap.genericError"), failedUrl });
      return false;
    }

    if (result.code === "invalid_url") {
      setBanner({ kind: "error", message: t("snap.invalidUrl") });
      return false;
    }

    if (result.code === "gate_unavailable") {
      setBanner({ kind: "error", message: t("snap.gateFailed"), failedUrl });
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
      announce(t("a11y.recipeReady"));
      router.push(`/recipe/${result.recipe.id}`);
      setUrl("");
      return true;
    }

    if (result.status === "coming_soon") {
      setBanner({
        kind: "info",
        message: importErrorText(result, t, language, "snap.comingSoon"),
      });
      return false;
    }

    if (result.status === "failed" || !result.recipe) {
      setBanner({
        kind: "error",
        // The server's words are English; show ours for its code (PIN-153).
        message: importErrorText(result, t, language, result.code ? "snap.genericError" : "snap.notFound"),
        failedUrl,
      });
      return false;
    }

    // ADR 019: a partial import isn't previewed or saved. The user fills in what's missing, or
    // cancels; either way it was free. Invented guesses keep their own banner.
    if (
      result.status === "partial" &&
      !result.cached &&
      !recipeIsInvented(result.recipe)
    ) {
      try {
        // Persisted so the editor (and a guest coming back from sign-up) can load it.
        await setRecipeDraft(
          result.recipe,
          result.request_id
            ? { url: requestKey, requestId: result.request_id }
            : undefined,
        );
      } catch (error) {
        console.warn("[recipe-draft] persistence failed", error);
      }
      setPartialImport({
        missingIngredients: result.recipe.ingredients.length === 0,
      });
      return true;
    }

    let recipeToPreview: ExtractedRecipe = result.recipe;
    captureRecipeExtracted({
      source,
      mode: recipeIsInvented(recipeToPreview) ? "invent" : "extract",
      recipe_platform: recipePlatformProperty(recipeToPreview.platform),
    });
    if (user) {
      // Shared with the web app: shared/lib/supabase/kitchenAutoApply.ts.
      const kitchen = await applyKitchenOnExtract(user.id, recipeToPreview);
      recipeToPreview = kitchen.recipe;
      if (kitchen.failed) {
        await showNotice({
          title: t("recipe.kitchenAutoApplyFailedTitle"),
          message: t("recipe.kitchenAutoApplyFailed"),
        });
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
    // Saved straight away: many people closed the preview without saving and lost the recipe.
    // If the save fails, the preview still has the draft and its Save button.
    const savedId = user ? await autoSaveRecipe(recipeToPreview) : null;
    announce(t("a11y.recipeReady"));
    if (savedId) {
      haptics.saved();
      router.push({ pathname: "/recipe/[id]", params: { id: savedId, justSaved: "1" } });
    } else {
      router.push("/recipe/preview");
    }
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

  /** A PDF is always read as a recipe: there is no Guess the recipe from a PDF (PIN-72). */
  async function runPdfExtract(base64: string, source: RecipeEntrySource) {
    if (loading) return;
    if (!requireAccount()) return;

    setBanner(null);
    setExtractingPdf(true);
    setJobKind("extract");
    setLoading(true);
    try {
      const result = await extractRecipeFromPdf(base64);
      await applyExtractResult(result, pdfRequestKey(base64), source);
    } catch {
      setBanner({ kind: "error", message: t("snap.genericError") });
    } finally {
      setLoading(false);
      setExtractingPdf(false);
    }
  }

  function showPdfReadFailure(read: Extract<RecipePdfRead, { ok: false }>, fromShare: boolean) {
    setBanner({
      kind: "error",
      message:
        read.reason === "too_large"
          ? t("snap.pdfTooLarge")
          : t(fromShare ? "snap.invalidSharePdf" : "snap.pdfUnreadable"),
    });
  }

  async function handleSharedPdf(path: string, size: number | null) {
    const pdf = await readRecipePdf(path, size);
    if (!pdf.ok) {
      showPdfReadFailure(pdf, true);
      return;
    }
    await runPdfExtract(pdf.base64, "share");
  }

  async function handlePickPdf() {
    if (loading) return;
    if (!requireAccount()) return;
    const pdf = await pickRecipePdf();
    if (!pdf) return;
    if (!pdf.ok) {
      showPdfReadFailure(pdf, false);
      return;
    }
    await runPdfExtract(pdf.base64, "pdf");
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

  /** "Choose a photo or PDF": a photo from the library, or in Snap on a phone a PDF too (PIN-72). */
  function handleChooseEntry() {
    if (mode === "invent" || Platform.OS === "web") {
      void handlePickPhoto("library");
      return;
    }
    Alert.alert(t("snapNm.choosePhotoOrPdf"), t("web.snap.photoOrPdfHint"), [
      {
        text: t("settings.chooseLibrary"),
        onPress: () => void handlePickPhoto("library"),
      },
      {
        text: t("snap.pdfAction"),
        onPress: () => {
          // The PDF had a tile of its own before PIN-177: keep its id in the Activity log.
          logTap("snap.pdf");
          void handlePickPdf();
        },
      },
      { text: t("common.cancel"), style: "cancel" },
    ]);
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
      setBanner({
        kind: "error",
        message: t("snap.genericError"),
        failedUrl: intent === "extract" ? target : undefined,
      });
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

  const signedInQuotaLabel = (() => {
    if (!user || totalCredits == null) return null;
    return t("snap.creditsRemaining", {
      count: totalCredits,
      free: freeExtractsRemaining ?? 0,
      purchased: purchasedCredits ?? 0,
    });
  })();

  if (loading) {
    return (
      <Screen tabScreen>
        <SnapExtractingView
          intent={jobKind}
          url={extractingPhoto || extractingPdf ? null : url}
          pdf={extractingPdf}
        />
      </Screen>
    );
  }

  const invent = mode === "invent";
  // PIN-72: a PDF is read as a written recipe, so it has no Guess the recipe side. The old Expo web app (being
  // replaced by web/) can't read a picked file this way, so it isn't offered there.
  const pdfOffered = !invent && Platform.OS !== "web";
  const chooseLabel = pdfOffered ? t("snapNm.choosePhotoOrPdf") : t("snapNm.choosePhoto");
  const photoHint = invent
    ? t("snap.inventPhotoHint")
    : pdfOffered
      ? t("web.snap.photoOrPdfHint")
      : t("snap.photoHint");

  return (
    <Screen tabScreen>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          layout={reduceMotion ? undefined : LinearTransition.duration(280)}
          style={[
            { gap: 16 },
            isMediumUp ? { maxWidth: FormContentWidth, width: "100%", alignSelf: "center" } : null,
          ]}
        >
          {/* The kit's PageHeader lines its actions up with the subtitle's last line; here the credits sit beside
              the title, as in the mockup, and the subtitle runs the full width under both. */}
          <View style={{ gap: 6, paddingBottom: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 }}>
              <Text variant="h1" style={{ flex: 1, minWidth: 0 }}>
                {invent ? t("snap.inventTitle") : t("snap.title")}
              </Text>
              {user && totalCredits != null ? <CreditsPill credits={totalCredits} /> : null}
            </View>
            <Text variant="bodySmall" tone="muted">
              {invent ? t("snap.inventSubtitle") : t("snap.subtitle")}
            </Text>
          </View>

          <View style={{ gap: 10 }}>
            <SnapIntentToggle
              trackId="snap.intent"
              mode={mode}
              progress={intentProgress}
              extractLabel={t("snap.modeExtract")}
              inventLabel={t("snap.modeInvent")}
              onChange={(next) => {
                setMode(next);
                if (banner) setBanner(null);
              }}
            />
            {invent ? (
              <Animated.View
                entering={reduceMotion ? undefined : FadeIn.duration(220)}
                exiting={reduceMotion ? undefined : FadeOut.duration(140)}
              >
                <Text variant="caption" tone="muted" style={{ paddingHorizontal: 4 }}>
                  {t("snap.inventDisclaimer")}
                </Text>
              </Animated.View>
            ) : null}
          </View>

          {/* The link and its button. */}
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: FIELD_HEIGHT,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  paddingStart: 14,
                  paddingEnd: 6,
                  borderRadius: Radii.inner,
                  borderWidth: HAIRLINE,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                }}
              >
                <Ionicons
                  name="link-outline"
                  size={18}
                  color={colors.textSecondary}
                  accessible={false}
                  importantForAccessibility="no"
                />
                <TextInput
                  style={[
                    type.font("body", "regular"),
                    {
                      flex: 1,
                      minWidth: 0,
                      height: FIELD_HEIGHT,
                      fontSize: 16,
                      color: colors.text,
                      textAlign,
                      // The placeholder reads in the app language; a link always reads left to right.
                      writingDirection: url ? "ltr" : writingDirection,
                    },
                  ]}
                  placeholder={invent ? t("snap.inventUrlPlaceholder") : t("snap.urlPlaceholder")}
                  placeholderTextColor={colors.textSecondary}
                  accessibilityLabel={invent ? t("snap.inventUrlLabel") : t("snap.urlLabel")}
                  value={url}
                  onChangeText={(text) => {
                    setUrl(text);
                    if (banner) setBanner(null);
                  }}
                  onSubmitEditing={() => {
                    logTap("snap.submit_keyboard", { mode });
                    if (canSubmit) void handleGetRecipe();
                  }}
                  returnKeyType="go"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
              </View>
              <Button
                trackId={`snap.submit.${mode}`}
                onPress={() => void handleGetRecipe()}
                disabled={!canSubmit}
                accessibilityLabel={invent ? t("snap.modeInvent") : t("tabs.snap")}
                style={{ minHeight: FIELD_HEIGHT, borderRadius: Radii.inner, paddingHorizontal: 18 }}
              >
                {invent ? t("snapNm.guessIt") : t("snapNm.snapIt")}
              </Button>
            </View>
            {signedInQuotaLabel ? (
              <Text variant="caption" tone="muted" style={{ paddingHorizontal: 4 }}>
                {signedInQuotaLabel}
              </Text>
            ) : null}
          </View>

          {banner ? (
            <SnapBanner
              banner={banner}
              purchasesHere={purchasesHere}
              onBuy={() => {
                if (!purchasesHere) {
                  void openAppStore();
                  return;
                }
                setCreditsOpen(true);
              }}
              onRetry={() => void handleGetRecipe(banner.failedUrl, "extract")}
              onScreenshot={handlePhotoEntry}
              onGuess={() => {
                // As on the web: the switch moves to Guess the recipe, so the screen says what's running.
                setMode("invent");
                void handleGetRecipe(banner.failedUrl, "invent");
              }}
            />
          ) : null}

          {/* A photo (or, in Snap, a PDF): take one now, or choose one already on the phone. */}
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <ActionTile
                trackId="snap.photo.camera"
                icon="camera-outline"
                label={t("snapNm.takePhoto")}
                onPress={() => void handlePickPhoto("camera")}
              />
              <ActionTile
                trackId="snap.photo.choose"
                icon={pdfOffered ? "documents-outline" : "images-outline"}
                label={chooseLabel}
                onPress={handleChooseEntry}
              />
            </View>
            <Animated.View key={`photo-hint-${mode}`} entering={reduceMotion ? undefined : FadeIn.duration(200)}>
              <Text variant="caption" tone="muted" style={{ paddingHorizontal: 4 }}>
                {photoHint}
              </Text>
            </Animated.View>
          </View>

          {/* Write a recipe (ADR 018) opens its own screen, so it sits beside Snap and Guess rather than inside the
              intent toggle, and reads the same in either mode. */}
          <Tile
            size="md"
            trackId="snap.write_recipe"
            onPress={() => openRecipeEditor({ signedIn: Boolean(user) })}
            accessibilityLabel={t("recipeEditor.entry.write")}
            accessibilityHint={t("recipeEditor.entry.writeHint")}
            style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 14, minHeight: 72 }}
          >
            <IconSquare icon="create-outline" />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text variant="h3">{t("recipeEditor.entry.write")}</Text>
              <Text variant="caption" tone="muted">
                {t("recipeEditor.entry.writeHint")}
              </Text>
            </View>
            <KitIcon icon="chevron-forward" size={18} color={colors.textSecondary} />
          </Tile>

          {/* ADR 032: many recipes at once from a WhatsApp chat export. The old Expo web app can't read the file;
              the web/ app has its own page for it. */}
          {Platform.OS !== "web" ? (
            <Tile
              size="md"
              trackId="snap.whatsapp_import"
              onPress={() => router.push("/whatsapp-import")}
              accessibilityLabel={t("whatsappImport.entryTitle")}
              accessibilityHint={t("whatsappImport.entryBody")}
              style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 14, minHeight: 72 }}
            >
              <IconSquare icon="logo-whatsapp" />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text variant="h3">{t("whatsappImport.entryTitle")}</Text>
                <Text variant="caption" tone="muted">
                  {t("whatsappImport.entryBody")}
                </Text>
              </View>
              <KitIcon icon="chevron-forward" size={18} color={colors.textSecondary} />
            </Tile>
          ) : null}

          {/* Share from another app: Pinch opens here and Snap runs by itself. */}
          <Tile
            tone="element"
            size="md"
            style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 16 }}
          >
            <Ionicons
              name="share-outline"
              size={18}
              color={colors.textSecondary}
              accessible={false}
              importantForAccessibility="no"
              style={{ marginTop: 1 }}
            />
            <Text variant="bodySmall" tone="muted" style={{ flex: 1, minWidth: 0 }}>
              {isExpoGo ? t("snap.shareBodyExpoGo") : t("snapNm.shareTip")}
            </Text>
          </Tile>
        </Animated.View>
      </ScrollView>
      <TokenPurchaseSheet
        visible={creditsOpen}
        onClose={() => setCreditsOpen(false)}
        onPurchased={() => refreshProfile()}
      />
      <ConfirmDialog
        trackId="snap.partial_import_dialog"
        visible={partialImport != null}
        title={t("snap.partialTitle")}
        message={
          partialImport?.missingIngredients
            ? t("snap.partialMissingIngredients")
            : t("snap.partialMissingSteps")
        }
        confirmLabel={t("snap.partialFillIn")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => {
          setPartialImport(null);
          setUrl("");
          router.push({ pathname: "/recipe/edit", params: { from: "import" } });
        }}
        onCancel={() => {
          setPartialImport(null);
          void clearRecipeDraft().catch((error) =>
            console.warn("[recipe-draft] clear failed", error),
          );
        }}
      />
      <ConfirmDialog
        trackId="snap.invent_offer_dialog"
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
        cancelLabel={t("common.cancel")}
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
    </Screen>
  );
}

/** The link field and its button are this tall (the mockup's 52). */
const FIELD_HEIGHT = 52;

/** An icon on a 44 primarySoft rounded square, at the start of an action tile. */
function IconSquare({ icon }: { icon: IconName }) {
  const { colors } = useThemePreference();
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{
        width: MIN_TOUCH,
        height: MIN_TOUCH,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: Radii.control,
        backgroundColor: colors.primarySoft,
      }}
    >
      <Ionicons name={icon} size={22} color={colors.primaryText} />
    </View>
  );
}

/** One of the two photo tiles: an icon square at the top, the action in Space Grotesk at the bottom. */
function ActionTile({
  trackId,
  icon,
  label,
  onPress,
}: {
  trackId: string;
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  return (
    <Tile
      size="lg"
      trackId={trackId}
      onPress={onPress}
      accessibilityLabel={label}
      style={{ flex: 1, minWidth: 0, minHeight: 140, padding: 16, justifyContent: "space-between", gap: 16 }}
    >
      <IconSquare icon={icon} />
      <Text variant="h3" numberOfLines={3}>
        {label}
      </Text>
    </Tile>
  );
}

const BANNER_ICONS: Record<NonNullable<Banner>["kind"], IconName> = {
  error: "alert-circle-outline",
  info: "information-circle-outline",
  limit: "information-circle-outline",
  credits: "wallet-outline",
};

/**
 * Why the last Snap didn't give a recipe, on a soft-coloured block: red for an error, the brand colour for a
 * notice, the accent for being out of credits (as on the web's SnapBannerView). A link that couldn't be read gets
 * ways on; out of credits gets a way to buy more.
 */
function SnapBanner({
  banner,
  purchasesHere,
  onBuy,
  onRetry,
  onScreenshot,
  onGuess,
}: {
  banner: NonNullable<Banner>;
  purchasesHere: boolean;
  onBuy: () => void;
  onRetry: () => void;
  onScreenshot: () => void;
  onGuess: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const look =
    banner.kind === "error"
      ? { bg: colors.dangerSoft, fg: colors.danger }
      : banner.kind === "credits"
        ? { bg: colors.accentSoft, fg: colors.accentText }
        : { bg: colors.primarySoft, fg: colors.primaryText };
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 12,
        borderRadius: Radii.inner,
        backgroundColor: look.bg,
        paddingHorizontal: 16,
        paddingVertical: 14,
      }}
    >
      <Ionicons
        name={BANNER_ICONS[banner.kind]}
        size={20}
        color={look.fg}
        accessible={false}
        importantForAccessibility="no"
        style={{ marginTop: 1 }}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="bodySmall" weight="medium" color={look.fg}>
          {banner.message}
        </Text>
        {banner.kind === "error" && banner.failedUrl ? (
          <FailedLinkActions onRetry={onRetry} onScreenshot={onScreenshot} onGuess={onGuess} />
        ) : null}
        {banner.kind === "credits" ? (
          <Button
            size="sm"
            trackId={purchasesHere ? "snap.credits.buy" : "snap.credits.open_app_store"}
            onPress={onBuy}
            style={{ marginTop: 12 }}
          >
            {purchasesHere ? t("credits.buyAction") : t("credits.webOnlyAction")}
          </Button>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Ways on after a link couldn't be read: try again (a failed read doesn't use a credit), snap a screenshot of the
 * recipe in the caption or comments, or Guess the recipe from the dish.
 */
function FailedLinkActions({
  onRetry,
  onScreenshot,
  onGuess,
}: {
  onRetry: () => void;
  onScreenshot: () => void;
  onGuess: () => void;
}) {
  const { t } = useTranslation();
  const actions = [
    { key: "retry", label: t("snap.failedRetry"), icon: "refresh" as const, onPress: onRetry },
    { key: "screenshot", label: t("snap.failedScreenshot"), icon: "camera-outline" as const, onPress: onScreenshot },
    { key: "guess", label: t("snap.failedGuess"), icon: "restaurant-outline" as const, onPress: onGuess },
  ];
  return (
    <View style={{ marginTop: 12, gap: 8 }}>
      <Text variant="caption" weight="semibold" tone="muted">
        {t("snap.failedWaysOn")}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {actions.map((action) => (
          <Button
            key={action.key}
            size="sm"
            variant="outline"
            icon={action.icon}
            trackId={`snap.failed.${action.key}`}
            onPress={action.onPress}
          >
            {action.label}
          </Button>
        ))}
      </View>
    </View>
  );
}
