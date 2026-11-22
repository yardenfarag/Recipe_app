"use client";

import { BookOpen } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { cookbookPageSizeForLocale, type CookbookPageSize } from "@shared/lib/cookbook/buildCookbookHtml";
import { filterAndSortRecipes } from "@shared/lib/recipeListQuery";
import { showToast } from "@shared/lib/toast";
import type { Recipe } from "@shared/types/recipe";

import { BookPanel, COOKBOOK_TITLE_FIELD } from "@/components/cookbook/BookPanel";
import { BuildDialog } from "@/components/cookbook/BuildDialog";
import { RecipePicker } from "@/components/cookbook/RecipePicker";
import { SnapLink } from "@/components/shell/ComingSoon";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import { Tile } from "@/components/ui/Tile";
import { addAllToBook, moveInBook, readDraft, removeFromBook, writeDraft } from "@/lib/cookbook/bookSelection";
import { useCookbookBuild } from "@/lib/cookbook/useCookbookBuild";
import { useCollections } from "@/lib/library/useCollections";
import { useRecipes } from "@/lib/library/useRecipes";

/**
 * PDF cookbook: pick saved recipes (by hand, or a whole collection at once), set the cover title, paper and photos,
 * put them in order, and download the book as a PDF (made on the web app's server), or print it. The same book the
 * mobile app makes from the same recipes.
 *
 * `/cookbook?collection=<id>` starts with that collection's recipes and its name as the title (the Library's
 * collection menu links here); `?recipe=<id>` (repeatable) starts with those recipes. Otherwise the book this tab
 * was putting together comes back.
 */
export function CookbookScreen() {
  const { t } = useTranslation();
  const params = useSearchParams();
  const router = useRouter();
  const { recipes, loading, loadingMore, hasMore, error, refresh, ensureAllLoaded } = useRecipes();
  const { collections, loading: collectionsLoading } = useCollections();
  const { state, build, print, retry, close, downloadAgain, openInTab } = useCookbookBuild();

  const [title, setTitle] = useState<string | null>(null);
  const [ids, setIds] = useState<string[]>([]);
  const [pageSize, setPageSize] = useState<CookbookPageSize>("a4");
  const [includePhotos, setIncludePhotos] = useState(true);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [startCollectionId, setStartCollectionId] = useState<string | null>(null);

  // Picking from the whole library, not only its first page.
  useEffect(() => {
    if (hasMore && !error) void ensureAllLoaded();
  }, [ensureAllLoaded, error, hasMore]);

  const libraryReady = !loading && !collectionsLoading && (!hasMore || Boolean(error));

  // Once everything is in: start from the link (a collection, some recipes) or from this tab's draft.
  useEffect(() => {
    if (started || !libraryReady) return;
    const known = new Set(recipes.map((recipe) => recipe.id));
    const collectionId = params.get("collection");
    const recipeIds = params.getAll("recipe").filter((id) => known.has(id));
    const fromLink = Boolean(collectionId) || params.getAll("recipe").length > 0;
    const draft = fromLink ? null : readDraft();

    let nextIds: string[] = [];
    let nextTitle: string | null = null;
    const collection = collectionId ? collections.find((c) => c.id === collectionId) : undefined;
    if (collection) {
      nextIds = filterAndSortRecipes(recipes, { sort: "title_asc", recipeIdAllowlist: new Set(collection.recipeIds) }).map((recipe) => recipe.id);
      nextTitle = collection.name;
    }
    nextIds = addAllToBook(nextIds, recipeIds);
    if (draft) {
      nextIds = draft.ids.filter((id) => known.has(id));
      nextTitle = draft.title;
    }

    // Applying where the page started, once its data has arrived.
    /* eslint-disable react-hooks/set-state-in-effect */
    setIds(nextIds);
    setTitle(nextTitle);
    setPageSize(draft?.pageSize ?? cookbookPageSizeForLocale(navigator.language));
    setIncludePhotos(draft?.includePhotos ?? true);
    setStartCollectionId(collection?.id ?? null);
    setStarted(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    // The address has done its job; a reload now brings back the draft, with whatever was changed since.
    if (fromLink) router.replace("/cookbook");
  }, [collections, libraryReady, params, recipes, router, started]);

  useEffect(() => {
    if (started) writeDraft({ title, ids, pageSize, includePhotos });
  }, [ids, includePhotos, pageSize, started, title]);

  const byId = useMemo(() => new Map(recipes.map((recipe) => [recipe.id, recipe])), [recipes]);
  const book = useMemo(() => ids.map((id) => byId.get(id)).filter((recipe): recipe is Recipe => Boolean(recipe)), [byId, ids]);
  const shownTitle = title ?? t("cookbook.defaultTitle");

  const changeIds = useCallback((next: string[]) => {
    setIds(next);
    if (next.length > 0) setCreateError(null);
  }, []);

  function create() {
    const bookTitle = shownTitle.trim();
    if (!bookTitle) {
      setTitleError(t("cookbook.titleRequired"));
      document.querySelector<HTMLInputElement>(`#${COOKBOOK_TITLE_FIELD} input`)?.focus();
      return;
    }
    if (book.length === 0) {
      setCreateError(t("cookbook.pickRecipes"));
      return;
    }
    void build({ title: bookTitle, recipes: book, pageSize, includePhotos });
  }

  const busy = state.step === "making" || state.step === "photos" || state.step === "pages";
  const header = <PageHeader title={t("cookbook.title")} subtitle={t("settings.cookbookHint")} />;

  if (loading || (!started && !error)) {
    return (
      <>
        {header}
        <LoadingState label={t("a11y.loadingRecipes")} />
      </>
    );
  }
  if (error && recipes.length === 0) {
    return (
      <>
        {header}
        <ErrorState title={t("library.loadFailedTitle")} trackId="cookbook.load_error" onRetry={() => void refresh()} />
      </>
    );
  }
  if (recipes.length === 0) {
    return (
      <>
        {header}
        <EmptyState icon={<BookOpen aria-hidden />} title={t("cookbook.title")} body={t("cookbook.emptyLibrary")} action={<SnapLink trackId="cookbook.empty.add_recipe" />} />
      </>
    );
  }

  const countText = book.length === 1 ? t("cookbook.recipeCountOne", { count: 1 }) : t("cookbook.recipeCountOther", { count: book.length });

  return (
    <>
      {header}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(21rem,25rem)]">
        <div className="min-w-0">
          <Tile as="section" aria-labelledby="cookbook-pick-heading" className="p-5 sm:p-6">
            <h2 id="cookbook-pick-heading" className="text-[26px] leading-tight font-bold text-text">
              {t("cookbook.pickStepTitle")}
            </h2>
            <p className="mt-1.5 mb-5 text-[15px] text-muted">{t("web.cookbook.pickHint")}</p>
            <RecipePicker
              recipes={recipes}
              collections={collections}
              selectedIds={ids}
              onChange={changeIds}
              loadingMore={loadingMore}
              initialCollectionId={startCollectionId}
            />
          </Tile>
          {book.length > 0 ? (
            // Phones and tablets: the book is below the list, so its button stays in reach while picking. The bar
            // floats over the list's tile, so it keeps a shadow.
            <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 mt-4 flex items-center gap-3 rounded-[22px] border border-border bg-surface/95 p-2 ps-5 shadow-lift backdrop-blur md:bottom-6 lg:hidden">
              <a href="#cookbook-book" data-track="cookbook.jump_to_book" className="min-w-0 flex-1 truncate text-sm font-semibold text-text hover:underline">
                {t("web.cookbook.yourBook")} · <span className="tabular-nums">{countText}</span>
              </a>
              <Button trackId="cookbook.create_bar" busy={busy} onClick={create}>
                {t("cookbook.generate")}
              </Button>
            </div>
          ) : null}
        </div>

        <aside id="cookbook-book" aria-labelledby="cookbook-book-heading" className="scroll-mt-20 lg:sticky lg:top-7 lg:self-start">
          <BookPanel
            title={shownTitle}
            onTitleChange={(next) => {
              setTitle(next);
              if (next.trim()) setTitleError(null);
            }}
            titleError={titleError}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
            includePhotos={includePhotos}
            onIncludePhotosChange={setIncludePhotos}
            recipes={book}
            onMove={(from, to) => setIds(moveInBook(book.map((recipe) => recipe.id), from, to))}
            onRemove={(id) => setIds((previous) => removeFromBook(previous, [id]))}
            onClear={() => setIds([])}
            onCreate={create}
            createError={createError}
            busy={busy}
          />
        </aside>
      </div>

      <BuildDialog
        state={state}
        onClose={close}
        onRetry={retry}
        onPrint={() => void print()}
        onDownloadAgain={downloadAgain}
        onOpenInTab={() => {
          if (!openInTab()) showToast(t("web.cookbook.tabBlocked"), "info");
        }}
      />
    </>
  );
}
