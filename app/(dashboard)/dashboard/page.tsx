"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  parseISO,
} from "date-fns";

type CourseRef = { name: string; color: string | null } | null;

type AssignmentRow = {
  id: string;
  title: string;
  due_date: string | null;
  is_completed: boolean;
  course?: CourseRef;
};

type LmsConnection = {
  id: string;
  platform: string;
  canvas_domain: string | null;
  last_synced_at: string | null;
  is_active: boolean;
};

type Course = {
  id: string;
  name: string;
  color: string | null;
};

type Profile = {
  full_name: string | null;
};

export default function DashboardPage() {
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [connections, setConnections] = useState<LmsConnection[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseIds, setSelectedCourseIds] = useState<Set<string>>(new Set());
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [autoSyncTried, setAutoSyncTried] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      try {
        const [assignmentsRes, connectionsRes, coursesRes, profileRes] = await Promise.all([
          fetch("/api/assignments"),
          fetch("/api/lms/connections"),
          fetch("/api/courses"),
          fetch("/api/profile"),
        ]);

        const assignmentsData = assignmentsRes.ok ? await assignmentsRes.json() : [];
        const connectionsData = connectionsRes.ok ? await connectionsRes.json() : [];
        const coursesData = coursesRes.ok ? await coursesRes.json() : [];
        const profileData = profileRes.ok ? await profileRes.json() : null;

        if (mounted) {
          setAssignments(assignmentsData ?? []);
          setConnections(connectionsData ?? []);
          setCourses(coursesData ?? []);
          setProfile(profileData);
          if (coursesData && coursesData.length > 0) {
            setSelectedCourseIds(new Set(coursesData.map((c: Course) => c.id)));
          }
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const canvasConnection = connections.find((c) => c.platform === "canvas");

  function toggleCourse(courseId: string) {
    setSelectedCourseIds((prev) => {
      const next = new Set(prev);
      if (next.has(courseId)) {
        next.delete(courseId);
      } else {
        next.add(courseId);
      }
      return next;
    });
  }

  function selectAllCourses() {
    setSelectedCourseIds(new Set(courses.map((course) => course.id)));
  }

  function clearCourses() {
    setSelectedCourseIds(new Set());
  }

  async function handleSync({ silent = false }: { silent?: boolean } = {}) {
    if (!canvasConnection) {
      if (!silent) setSyncMessage("No Canvas connection found. Connect Canvas in Settings.");
      return;
    }
    if (!silent) setSyncMessage(null);
    setSyncing(true);

    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: canvasConnection.id }),
      });
      const data = await res.json();
      if (!res.ok || data?.success === false) {
        if (!silent) setSyncMessage(data?.error || "Sync failed.");
      } else {
        if (!silent) setSyncMessage("Canvas sync completed.");
        const [refreshedAssignments, refreshedCourses, refreshedConnections] = await Promise.all([
          fetch("/api/assignments"),
          fetch("/api/courses"),
          fetch("/api/lms/connections"),
        ]);
        const refreshedData = refreshedAssignments.ok ? await refreshedAssignments.json() : [];
        const refreshedCoursesData = refreshedCourses.ok ? await refreshedCourses.json() : [];
        const refreshedConnectionsData = refreshedConnections.ok ? await refreshedConnections.json() : [];
        setAssignments(refreshedData ?? []);
        setCourses(refreshedCoursesData ?? []);
        setConnections(refreshedConnectionsData ?? []);
      }
    } catch (err) {
      if (!silent) setSyncMessage((err as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    if (!canvasConnection || autoSyncTried) return;
    setAutoSyncTried(true);
    handleSync({ silent: true });
  }, [canvasConnection, autoSyncTried]);

  const filteredAssignments = useMemo(() => {
    if (selectedCourseIds.size === 0) return [];
    return assignments.filter((a) => selectedCourseIds.has(a.course?.id ?? ""));
  }, [assignments, selectedCourseIds]);

  const upcomingAssignments = useMemo(() => {
    const now = new Date();
    return filteredAssignments
      .filter((a) => a.due_date && !a.is_completed)
      .map((a) => ({ ...a, due: parseISO(a.due_date as string) }))
      .filter((a) => a.due >= now)
      .sort((a, b) => a.due.getTime() - b.due.getTime())
      .slice(0, 8);
  }, [filteredAssignments]);

  const calendarDays = useMemo(() => {
    const today = new Date();
    const monthStart = startOfMonth(today);
    const monthEnd = endOfMonth(today);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

    const days: Date[] = [];
    let cursor = calendarStart;
    while (cursor <= calendarEnd) {
      days.push(cursor);
      cursor = addDays(cursor, 1);
    }
    return { days, monthStart, today };
  }, []);

  const assignmentsByDay = useMemo(() => {
    const map = new Map<string, AssignmentRow[]>();
    filteredAssignments.forEach((assignment) => {
      if (!assignment.due_date) return;
      const key = format(parseISO(assignment.due_date), "yyyy-MM-dd");
      const list = map.get(key) ?? [];
      list.push(assignment);
      map.set(key, list);
    });
    return map;
  }, [filteredAssignments]);

  return (
    <>
      <section className="section">
        <h2 className="animate-on-scroll">
          Welcome back{profile?.full_name ? `, ${profile.full_name}` : ""}.
        </h2>
        <div className="about-content">
          <div className="about-text animate-on-scroll slide-left">
            <p>Stay on top of your Canvas workload with a live calendar and upcoming due dates.</p>
            <p>Sync anytime to pull new courses and assignments from Canvas.</p>
            <div className="cta-buttons" style={{ marginTop: "1.5rem", justifyContent: "flex-start" }}>
              <button className="btn btn-primary" onClick={handleSync} disabled={syncing}>
                {syncing ? "Syncing..." : "Sync Canvas"}
              </button>
              <a className="btn btn-secondary" href="/settings/setup/canvas">
                Connect Canvas
              </a>
            </div>
            {syncMessage ? (
              <p style={{ marginTop: "1rem", color: "var(--gray)" }}>{syncMessage}</p>
            ) : null}
          </div>
          <div className="about-visual animate-on-scroll slide-right">
            <div className="about-stat" style={{ textAlign: "left" }}>
              <span className="about-stat-number">{filteredAssignments.length}</span>
              <span className="about-stat-label">Total assignments tracked</span>
            </div>
            <div className="about-stat" style={{ marginTop: "1rem", textAlign: "left" }}>
              <span className="about-stat-number">{canvasConnection ? "Connected" : "Not connected"}</span>
              <span className="about-stat-label">Canvas status</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <h2 className="animate-on-scroll">Calendar Filters</h2>
        <div className="contact-info-section animate-on-scroll" style={{ padding: "2rem" }}>
          {courses.length === 0 ? (
            <p style={{ color: "var(--gray)" }}>No courses yet. Sync Canvas to load your classes.</p>
          ) : (
            <>
              <div className="cta-buttons" style={{ justifyContent: "flex-start", marginBottom: "1.5rem" }}>
                <button className="btn btn-secondary" type="button" onClick={selectAllCourses}>
                  Select All
                </button>
                <button className="btn btn-secondary" type="button" onClick={clearCourses}>
                  Clear
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem" }}>
                {courses.map((course) => (
                  <label
                    key={course.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.6rem",
                      padding: "0.7rem 0.9rem",
                      borderRadius: "12px",
                      background: "rgba(255, 255, 255, 0.06)",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedCourseIds.has(course.id)}
                      onChange={() => toggleCourse(course.id)}
                      style={{ accentColor: course.color ?? "var(--primary)" }}
                    />
                    <span style={{ color: "var(--light)" }}>{course.name}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      <section className="section">
        <h2 className="animate-on-scroll">Monthly Calendar</h2>
        <div className="contact-info-section animate-on-scroll" style={{ padding: "2rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "0.75rem" }}>
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day) => (
              <div key={day} style={{ color: "var(--gray)", fontSize: "0.85rem", textAlign: "center" }}>{day}</div>
            ))}
            {calendarDays.days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const dayAssignments = assignmentsByDay.get(key) ?? [];
              const isCurrentMonth = isSameMonth(day, calendarDays.monthStart);
              const isToday = isSameDay(day, calendarDays.today);
              return (
                <div
                  key={key}
                  style={{
                    minHeight: "90px",
                    borderRadius: "12px",
                    padding: "0.5rem",
                    background: isToday ? "rgba(0, 255, 255, 0.12)" : "rgba(255, 255, 255, 0.04)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    opacity: isCurrentMonth ? 1 : 0.4,
                  }}
                >
                  <div style={{ fontSize: "0.85rem", color: "var(--light)" }}>{format(day, "d")}</div>
                  {dayAssignments.slice(0, 2).map((assignment) => (
                    <div key={assignment.id} style={{ fontSize: "0.75rem", color: "var(--primary)", marginTop: "0.35rem" }}>
                      {assignment.title}
                    </div>
                  ))}
                  {dayAssignments.length > 2 ? (
                    <div style={{ fontSize: "0.7rem", color: "var(--gray)" }}>+{dayAssignments.length - 2} more</div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="section">
        <h2 className="animate-on-scroll">Upcoming Due Dates</h2>
        {loading ? (
          <p style={{ color: "var(--gray)" }}>Loading assignments...</p>
        ) : upcomingAssignments.length === 0 ? (
          <p style={{ color: "var(--gray)" }}>No upcoming assignments. Sync Canvas to pull due dates.</p>
        ) : (
          <div className="timeline">
            {upcomingAssignments.map((assignment) => (
              <div key={assignment.id} className="timeline-item animate-on-scroll">
                <div className="timeline-header">
                  <div className="timeline-time">
                    {assignment.due_date ? format(parseISO(assignment.due_date), "MMM d") : "TBD"}
                  </div>
                  <div className="timeline-info">
                    <div className="timeline-title">{assignment.title}</div>
                    <div className="timeline-speaker">{assignment.course?.name ?? "Canvas"}</div>
                  </div>
                  <div className="timeline-collapse-icon">▼</div>
                </div>
                <div className="timeline-details">
                  <div className="timeline-desc">
                    Due {assignment.due_date ? format(parseISO(assignment.due_date), "PPpp") : "Date not set"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
