import {
  LayoutDashboard,
  BookOpen,
  Dumbbell,
  Settings,
  Layers,
  ListChecks,
  ClipboardList,
  Users,
  RotateCcw,
  Timer,
  BarChart3,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };
export type NavGroup = { label: string; items: NavItem[] };

/**
 * Single source of truth for workspace navigation — shared by the desktop
 * Sidebar and the mobile nav drawer so both stay in sync.
 */
export const workspaceNavGroups: NavGroup[] = [
  {
    label: "Home",
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Learn",
    items: [
      { href: "/courses", label: "Courses", icon: ListChecks },
      { href: "/assignments", label: "Assignments", icon: ClipboardList },
      { href: "/notes", label: "Notes", icon: BookOpen },
    ],
  },
  {
    label: "Study",
    items: [
      { href: "/practice", label: "Practice", icon: Dumbbell },
      { href: "/flashcards", label: "Flashcards", icon: Layers },
      { href: "/review", label: "Review", icon: RotateCcw },
      { href: "/focus", label: "Focus", icon: Timer },
    ],
  },
  {
    label: "Progress",
    items: [{ href: "/grades", label: "Grades", icon: BarChart3 }],
  },
  {
    label: "Community",
    items: [{ href: "/groups", label: "Groups", icon: Users }],
  },
];

export const workspaceNavItems: NavItem[] = workspaceNavGroups.flatMap((group) => group.items);

export const accountNavItems: NavItem[] = [
  { href: "/pricing",  label: "Manage plan",  icon: Sparkles },
  { href: "/settings", label: "Settings", icon: Settings },
];
