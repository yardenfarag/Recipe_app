import {
  Award,
  Bell,
  BookOpen,
  Bug,
  Calendar,
  Camera,
  ChefHat,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  Clock,
  CloudDownload,
  Coffee,
  CreditCard,
  Flame,
  Gift,
  Globe,
  Hand,
  Heart,
  Info,
  Leaf,
  Lightbulb,
  Lock,
  Mail,
  Megaphone,
  MessageCircle,
  Pizza,
  RefreshCw,
  Rocket,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Smile,
  Sparkles,
  Star,
  ThumbsUp,
  TriangleAlert,
  Trophy,
  UtensilsCrossed,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import type { Tone } from "@shared/lib/inAppMessages";

/** Theme classes per tone, written out in full so Tailwind sees them. Theme tokens only (seven packs, dark mode). */
export type ToneClasses = {
  /** The filled button. */
  fill: string;
  /** Icon badge and banner background. */
  soft: string;
  /** Icon and link colour. */
  text: string;
  /** The banner's edge line. */
  border: string;
};

export const TONE_CLASSES: Record<Tone, ToneClasses> = {
  info: { fill: "bg-primary text-on-primary", soft: "bg-primary-soft", text: "text-primary", border: "border-primary" },
  success: { fill: "bg-success text-bg", soft: "bg-success-soft", text: "text-success", border: "border-success" },
  warning: { fill: "bg-warning text-bg", soft: "bg-warning-soft", text: "text-warning", border: "border-warning" },
  critical: { fill: "bg-danger text-bg", soft: "bg-danger-soft", text: "text-danger", border: "border-danger" },
};

const TONE_ICONS: Record<Tone, LucideIcon> = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  critical: CircleAlert,
};

/**
 * Admins pick Ionicons names (the mobile app's set; shared/lib/adminMessageForm.ts ICON_SUGGESTIONS). The web app
 * draws lucide icons, so the suggested names and other common ones map to their lucide match, "-outline" and
 * "-sharp" variants included. Anything else gets the tone's icon.
 */
const IONICON_TO_LUCIDE: Record<string, LucideIcon> = {
  megaphone: Megaphone,
  sparkles: Sparkles,
  gift: Gift,
  "information-circle": Info,
  information: Info,
  "checkmark-circle": CircleCheck,
  checkmark: CircleCheck,
  warning: TriangleAlert,
  "alert-circle": CircleAlert,
  alert: CircleAlert,
  "cloud-download": CloudDownload,
  download: CloudDownload,
  rocket: Rocket,
  heart: Heart,
  star: Star,
  restaurant: UtensilsCrossed,
  "fast-food": UtensilsCrossed,
  notifications: Bell,
  time: Clock,
  timer: Clock,
  calendar: Calendar,
  camera: Camera,
  book: BookOpen,
  cart: ShoppingCart,
  basket: ShoppingCart,
  flame: Flame,
  trophy: Trophy,
  happy: Smile,
  construct: Wrench,
  build: Wrench,
  refresh: RefreshCw,
  "lock-closed": Lock,
  "shield-checkmark": ShieldCheck,
  mail: Mail,
  chatbubble: MessageCircle,
  chatbubbles: MessageCircle,
  bulb: Lightbulb,
  leaf: Leaf,
  pizza: Pizza,
  cafe: Coffee,
  globe: Globe,
  "phone-portrait": Smartphone,
  card: CreditCard,
  wallet: Wallet,
  ribbon: Award,
  medal: Award,
  "thumbs-up": ThumbsUp,
  "hand-left": Hand,
  "help-circle": CircleHelp,
  bug: Bug,
  "chef-hat": ChefHat,
};

export function messageIcon(icon: string | undefined, tone: Tone): LucideIcon {
  const base = (icon ?? "").replace(/-(outline|sharp)$/, "");
  return IONICON_TO_LUCIDE[base] ?? TONE_ICONS[tone];
}
