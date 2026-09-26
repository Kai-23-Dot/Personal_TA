import {
  House,
  FileText,
  Target,
  Settings,
  Layers,
  GraduationCap,
  Library,
  ClipboardList,
  Users,
  History,
  Timer,
  BarChart3,
  Sparkles,
  MessageCircleQuestion,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

/**
 * Single source of truth for workspace navigation — shared by the desktop
 * Sidebar and the mobile nav drawer so both stay in sync.
 */
/* Each icon names the thing the page actually is. The five that changed were
   metaphor mismatches: a course is not a checklist, practice is not a gym, and
   spaced repetition is revisiting over time rather than an undo. */
export const workspaceNavItems: NavItem[] = [
  { href: "/dashboard",   label: "Dashboard",   icon: House },          // your home surface
  { href: "/courses",     label: "Courses",     icon: GraduationCap },  // a class you are enrolled in
  { href: "/assignments", label: "Assignments", icon: ClipboardList },  // work with a due date
  { href: "/notes",       label: "Notes",       icon: FileText },       // pages you write
  { href: "/notebooks",   label: "Notebooks",   icon: Library },        // sources you import
  { href: "/practice",    label: "Practice",    icon: Target },         // practice aimed at a weak topic
  { href: "/flashcards",  label: "Flashcards",  icon: Layers },         // a stack of cards
  { href: "/review",      label: "Review",      icon: History },        // revisiting on a schedule
  { href: "/focus",       label: "Focus",       icon: Timer },          // a timed session
  { href: "/grades",      label: "Grades",      icon: BarChart3 },      // performance over time
  { href: "/groups",      label: "Groups",      icon: Users },          // classmates
];

export const accountNavItems: NavItem[] = [
  { href: "/pricing",  label: "Upgrade",  icon: Sparkles },
  { href: "/settings", label: "Settings", icon: Settings },
];

/**
 * The icon a destination is drawn with, anywhere in the app.
 *
 * Quick links on the dashboard, the ⌘K results and the rail all point at the
 * same routes, and they had drifted apart — /flashcards was a stack of layers
 * in the rail and a sparkle in Quick links, /notes a document in one place and
 * a book in the other. Looking a destination up here means a route has one icon
 * by construction rather than by everyone remembering.
 */
const EXTRA_DESTINATIONS: NavItem[] = [
  { href: "/chat", label: "Ask Smartlearn", icon: MessageCircleQuestion },
];

const ICON_BY_HREF = new Map<string, LucideIcon>(
  [...workspaceNavItems, ...accountNavItems, ...EXTRA_DESTINATIONS].map(
    (item) => [item.href, item.icon] as const
  )
);

export function iconForHref(href: string): LucideIcon {
  return ICON_BY_HREF.get(href) ?? Sparkles;
}

export { EXTRA_DESTINATIONS };
