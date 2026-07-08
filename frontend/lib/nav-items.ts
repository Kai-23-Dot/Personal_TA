import {
  LayoutDashboard,
  BookOpen,
  Dumbbell,
  Settings,
  Layers,
  ListChecks,
  ClipboardList,
  Brain,
  Users,
  RotateCcw,
  Timer,
  BarChart3,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

/**
 * Single source of truth for workspace navigation — shared by the desktop
 * Sidebar and the mobile nav drawer so both stay in sync.
 */
export const workspaceNavItems: NavItem[] = [
  { href: "/dashboard",   label: "Dashboard",   icon: LayoutDashboard },
  { href: "/courses",     label: "Courses",     icon: ListChecks },
  { href: "/assignments", label: "Assignments", icon: ClipboardList },
  { href: "/study",       label: "Study",       icon: Brain },
  { href: "/notes",       label: "Notes",       icon: BookOpen },
  { href: "/practice",    label: "Practice",    icon: Dumbbell },
  { href: "/flashcards",  label: "Flashcards",  icon: Layers },
  { href: "/review",      label: "Review",      icon: RotateCcw },
  { href: "/focus",       label: "Focus",       icon: Timer },
  { href: "/grades",      label: "Grades",      icon: BarChart3 },
  { href: "/groups",      label: "Groups",      icon: Users },
];

export const accountNavItems: NavItem[] = [
  { href: "/pricing",  label: "Upgrade",  icon: Sparkles },
  { href: "/settings", label: "Settings", icon: Settings },
];
