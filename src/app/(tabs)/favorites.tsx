import { Redirect } from 'expo-router';

/** Favorites is a Library filter now — keep route for old deep links. */
export default function FavoritesRedirect() {
  return <Redirect href="/?favorites=1" />;
}
