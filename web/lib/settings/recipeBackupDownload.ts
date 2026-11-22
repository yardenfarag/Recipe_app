import { recipeBackupFileName } from "@shared/lib/recipeBackup";
import { fetchRecipeBackup } from "@shared/lib/supabase/recipeBackup";

/**
 * Downloads every recipe on the account as the backup file both apps restore (PIN-75). "empty" when there is nothing
 * to back up, so no file is made. Throws when the recipes can't be read.
 */
export async function downloadRecipeBackup(): Promise<"downloaded" | "empty"> {
  const backup = await fetchRecipeBackup();
  if (backup.recipes.length === 0) return "empty";
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = recipeBackupFileName();
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}
