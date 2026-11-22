/**
 * The front door (pinch-app.io/app), decided before the page paints (PIN-174).
 *
 * The session lives in localStorage (ADR 026), so the server can't tell who is signed in, and the app's own check
 * (RequireAuth) only runs once the JavaScript has loaded. For a first-time visitor that meant a blank "Loading" page,
 * then the welcome page as a second load: about 2 s before anything showed. This script runs in <head>, reads the
 * same storage synchronously, and sends a signed-out visitor on before the page has drawn anything or fetched its
 * scripts. Signed-in visitors are never sent anywhere by it: only the absence of a stored session moves them on, so a
 * signed-in person can't see the welcome page by mistake. When storage can't be read, the script does nothing and
 * RequireAuth decides, as before.
 *
 * It also tells the welcome page, which the server draws in English, to stay hidden while the app works out that
 * it shouldn't show it as is: a stored session (the page then forwards to the app) or another language (the page
 * repaints in that language first). See `WELCOME_WAIT_ATTRIBUTE`.
 *
 * Kept small and dependency-free; it is inlined as a string in app/layout.tsx, next to the theme's boot script.
 */
import { APP_LANGUAGES } from "@shared/lib/appLanguages";
import { ONBOARDING_COMPLETE_KEY } from "@shared/lib/onboardingStorage";

import { LANGUAGE_STORAGE_KEY } from "@/lib/theme";
import { WELCOME_PATH } from "@/lib/onboarding/paths";

/** The app's base path (next.config.ts). */
export const BASE_PATH = "/app";

/** On <html> while the welcome page must not show yet. globals.css hides the page under it; WelcomeScreen removes it. */
export const WELCOME_WAIT_ATTRIBUTE = "data-welcome-wait";

/** supabase-js keeps the session under `sb-<project>-auth-token` (lib/supabase.ts uses its default key). */
const SESSION_KEY_PATTERN = /^sb-.+-auth-token$/;

export function frontDoorScript(): string {
  const codes = JSON.stringify(APP_LANGUAGES.map((language) => language.code));
  return `(function(){try{
var s=localStorage,d=document.documentElement,b=${JSON.stringify(BASE_PATH)};
var signedIn=false;for(var i=0;i<s.length;i++){var k=s.key(i);if(k&&${SESSION_KEY_PATTERN.toString()}.test(k)){signedIn=true;break;}}
var p=location.pathname.replace(/\\/+$/,"");
if(p===b&&!signedIn){
var q=location.search.length>1?location.search:"";
var to=s.getItem(${JSON.stringify(ONBOARDING_COMPLETE_KEY)})==="true"
?b+"/auth?mode=signin"+(q?"&next="+encodeURIComponent("/"+q):"")
:b+${JSON.stringify(WELCOME_PATH)};
d.style.visibility="hidden";if(window.stop)window.stop();location.replace(to);return;}
if(p===b+${JSON.stringify(WELCOME_PATH)}){
var l=s.getItem(${JSON.stringify(LANGUAGE_STORAGE_KEY)});
if(${codes}.indexOf(l)<0){l=(navigator.language||"").toLowerCase().split("-")[0];if(${codes}.indexOf(l)<0)l="en";}
if(signedIn||l!=="en")d.setAttribute(${JSON.stringify(WELCOME_WAIT_ATTRIBUTE)},"");}
}catch(e){}})();`;
}
