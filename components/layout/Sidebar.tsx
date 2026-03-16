"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  BookOpen,
  Calendar,
  MessageSquare,
  Dumbbell,
  Settings,
  Sparkles,
  GraduationCap,
  LogOut,
  Layers,
  Users,
  ListChecks,
  ClipboardList,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Profile } from "@/types";
import { toast } from "sonner";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/courses", label: "Courses", icon: ListChecks },
  { href: "/assignments", label: "Assignments", icon: ClipboardList },
  { href: "/planner", label: "Study Planner", icon: Calendar },
  { href: "/notes", label: "Notes", icon: BookOpen },
  { href: "/practice", label: "Practice", icon: Dumbbell },
  { href: "/flashcards", label: "Flashcards", icon: Layers },
  { href: "/chat", label: "TA Chat", icon: MessageSquare },
  { href: "/groups", label: "Study Groups", icon: Users },
];

interface SidebarProps {
  profile: Profile | null;
}

export function Sidebar({ profile }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
    toast.success("Signed out successfully");
  }

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : profile?.email?.[0]?.toUpperCase() ?? "U";

  return (
    <aside className="w-64 h-screen flex flex-col bg-sidebar border-r border-sidebar-border fixed left-0 top-0 z-20">
      {/* Logo */}
      <div className="px-5 py-[18px] border-b border-sidebar-border" style={{ background: "linear-gradient(180deg, rgba(139,92,246,0.08) 0%, transparent 100%)" }}>
        <Link href="/dashboard" className="flex items-center gap-2.5 group">
          {/* Logo icon — glow via CSS since shadow contains rgba */}
          <div
            className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center flex-shrink-0 transition-all duration-300 group-hover:scale-105"
            style={{ boxShadow: "0 0 16px rgba(139,92,246,0.5)" }}
          >
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-sidebar-foreground font-semibold text-sm leading-none">PersonalTA.ai</div>
            <div className="text-sidebar-foreground/60 text-[11px] mt-0.5 tracking-wide">AI Teaching Assistant</div>
          </div>
        </Link>
      </div>

      {/* Nav — using .nav-item / .nav-item.active from globals.css */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        <p className="text-[#6C5CE7]/70 text-[10px] font-semibold uppercase tracking-widest px-3 py-2">
          Menu
        </p>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn("nav-item flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium", isActive && "active")}
            >
              <Icon className={cn("nav-icon w-[15px] h-[15px] flex-shrink-0")} />
              <span className="flex-1">{item.label}</span>
          {isActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#6C5CE7] flex-shrink-0" />
              )}
            </Link>
          );
        })}

        <div className="pt-3">
          <p className="text-[#6C5CE7]/70 text-[10px] font-semibold uppercase tracking-widest px-3 py-2">
            Account
          </p>
          <Link
            href="/settings"
            className={cn("nav-item flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium", pathname === "/settings" && "active")}
          >
            <Settings className={cn("nav-icon w-[15px] h-[15px] flex-shrink-0")} />
            Settings
          </Link>
        </div>
      </nav>

      {/* User */}
      <div className="px-3 py-3 border-t border-sidebar-border">
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-[#6C5CE7]/10 transition-colors duration-150 group">
          <Avatar className="w-7 h-7 flex-shrink-0">
            <AvatarImage src={profile?.avatar_url ?? undefined} />
            <AvatarFallback className="bg-violet-600 text-white text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sidebar-foreground text-[13px] font-medium truncate leading-none">
              {profile?.full_name ?? profile?.email ?? "Student"}
            </p>
            {profile?.grade_level && (
              <p className="text-sidebar-foreground/35 text-[11px] flex items-center gap-1 mt-0.5">
                <GraduationCap className="w-3 h-3" />
                Grade {profile.grade_level}
              </p>
            )}
          </div>
          <button
            onClick={handleSignOut}
            aria-label="Sign out"
            className="text-sidebar-foreground/45 hover:text-rose-500 transition-colors duration-150 p-1 rounded opacity-0 group-hover:opacity-100"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
