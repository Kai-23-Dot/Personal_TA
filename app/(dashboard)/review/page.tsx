"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type WeakTopic = { topic: string; accuracy_pct: number };
type TrendPoint = { day: string; accuracy: number };

export default function ReviewPage() {
  const router = useRouter();
  const [weakTopics, setWeakTopics] = useState<WeakTopic[]>([]);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [courseId, setCourseId] = useState("");
  const [upcomingExams, setUpcomingExams] = useState<Array<{ id: string; title: string; course_id: string }>>([]);
  const [courses, setCourses] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [weakRes, trendRes, coursesRes, examsRes] = await Promise.all([
          fetch("/api/performance/weak"),
          fetch("/api/performance/trends"),
          fetch("/api/courses"),
          fetch("/api/assignments"),
        ]);
        const weakData = weakRes.ok ? await weakRes.json() : [];
        const trendData = trendRes.ok ? await trendRes.json() : [];
        const coursesData = coursesRes.ok ? await coursesRes.json() : [];
        const examsData = examsRes.ok ? await examsRes.json() : [];
        if (mounted) {
          setWeakTopics(weakData ?? []);
          setTrends(trendData ?? []);
          setCourses(coursesData ?? []);
          setUpcomingExams((examsData ?? []).filter((a: { assignment_type: string }) =>
            ["exam", "test", "quiz"].includes(a.assignment_type)
          ));
          if (!courseId && (coursesData?.length ?? 0) > 0) {
            setCourseId(coursesData[0].id);
          }
        }
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : "Failed to load review data");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  async function launchReview(topic: string, selectedCourseId: string, questionCount: number) {
    setActionMessage(null);
    setGenerating(true);
    try {
      const res = await fetch("/api/practice/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, courseId: selectedCourseId, difficulty: "adaptive", questionCount }),
      });
      const data = await res.json();
      if (res.ok && data?.sessionId) {
        router.push(`/practice/session?sessionId=${data.sessionId}`);
        return;
      }
      if (res.status === 409) {
        setActionMessage("Low retrieval confidence for this topic. Open Notes, select relevant course materials, then generate practice again.");
        return;
      }
      setActionMessage(data?.error || "Could not generate review session.");
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : "Could not generate review session.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <section className="section">
      <h2 className="animate-on-scroll">Review & Revision</h2>

      <div className="contact-info-section animate-on-scroll" style={{ maxWidth: "900px", margin: "0 auto" }}>
        <div className="contact-form-column">
          <h3 className="contact-form-title">Weak topics</h3>
          {loading ? <p style={{ color: "var(--gray)" }}>Loading review data...</p> : null}
          {error ? <p style={{ color: "#fda4af" }}>{error}</p> : null}
          {weakTopics.length === 0 ? (
            <p style={{ color: "var(--gray)" }}>No weak topics yet. Complete a practice session to see trends.</p>
          ) : (
            <ul>
              {weakTopics.map((t) => (
                <li key={t.topic} style={{ color: "var(--light)" }}>
                  {t.topic} — {Math.round(t.accuracy_pct)}% accuracy
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="contact-info-section animate-on-scroll" style={{ maxWidth: "900px", margin: "2rem auto 0" }}>
        <div className="contact-form-column">
          <h3 className="contact-form-title">Quick review session</h3>
          <div className="contact-form">
            <div className="form-field">
              <label htmlFor="course">Course</label>
              <select id="course" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                <option value="">Select course</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <button
              className="contact-submit-btn"
              type="button"
              disabled={generating || !courseId || weakTopics.length === 0}
              onClick={async () => {
                const topic = weakTopics[0]?.topic ?? "Review";
                await launchReview(topic, courseId, 6);
              }}
            >
              {generating ? "Generating..." : "Start quick review"}
            </button>
            {actionMessage ? (
              <p style={{ color: "var(--gray)", marginTop: "0.75rem" }}>{actionMessage}</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="contact-info-section animate-on-scroll" style={{ maxWidth: "900px", margin: "2rem auto 0" }}>
        <div className="contact-form-column">
          <h3 className="contact-form-title">Upcoming exams</h3>
          {upcomingExams.length === 0 ? (
            <p style={{ color: "var(--gray)" }}>No exams or tests coming up.</p>
          ) : (
            <ul>
              {upcomingExams.slice(0, 5).map((exam) => (
                <li key={exam.id} style={{ color: "var(--light)", display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                  <span>{exam.title}</span>
                  <button
                    className="btn btn-secondary"
                    onClick={async () => {
                      await launchReview(exam.title, exam.course_id, 10);
                    }}
                  >
                    Review
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="contact-info-section animate-on-scroll" style={{ maxWidth: "900px", margin: "2rem auto 0" }}>
        <div className="contact-form-column">
          <h3 className="contact-form-title">Accuracy trend (last 14 days)</h3>
          {trends.length === 0 ? (
            <p style={{ color: "var(--gray)" }}>No quiz data yet.</p>
          ) : (
            <div style={{ display: "grid", gap: "0.5rem" }}>
              {trends.map((t) => (
                <div key={t.day} style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <span style={{ width: "90px", color: "var(--gray)" }}>{t.day}</span>
                  <div style={{ flex: 1, background: "rgba(255,255,255,0.08)", borderRadius: "8px" }}>
                    <div
                      style={{
                        width: `${t.accuracy}%`,
                        background: "linear-gradient(90deg, #00ffff, #ff00ff)",
                        height: "10px",
                        borderRadius: "8px",
                      }}
                    />
                  </div>
                  <span style={{ color: "var(--light)" }}>{t.accuracy}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
