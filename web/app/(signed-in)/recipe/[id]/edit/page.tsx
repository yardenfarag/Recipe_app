"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { LoadingState } from "@/components/ui/States";

/** An older or hand-typed address for Edit recipe. The editor lives at `/recipe/edit?id=<id>`, as on mobile. */
export default function RecipeEditRedirect() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  useEffect(() => {
    router.replace(`/recipe/edit?id=${encodeURIComponent(id)}`);
  }, [id, router]);

  return <LoadingState label={t("a11y.loadingRecipe")} />;
}
