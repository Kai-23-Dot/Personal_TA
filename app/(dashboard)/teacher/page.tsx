"use client";

import { useEffect, useState } from "react";

type Course = { id: string; name: string };
type Rubric = { id: string; title: string; criteria: Array<{ criterion: string; description: string; points: number }> };

export default function TeacherPage() {
  const [role, setRole] = useState<"student" | "teacher">("student");
  const [courses, setCourses] = useState<Course[]>([]);
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [courseId, setCourseId] = useState("");
  const [title, setTitle] = useState("");
  const [criteriaText, setCriteriaText] = useState("Clarity|Clear thesis and topic sentences|4\nEvidence|Uses credible evidence|4");
  const [submissionText, setSubmissionText] = useState("");
  const [selectedRubricId, setSelectedRubricId] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const profileRes = await fetch("/api/profile");
      const profileData = profileRes.ok ? await profileRes.json() : null;
      const coursesRes = await fetch("/api/courses");
      const coursesData = coursesRes.ok ? await coursesRes.json() : [];
      const rubricsRes = await fetch("/api/rubrics");
      const rubricsData = rubricsRes.ok ? await rubricsRes.json() : [];
      if (mounted) {
        setRole(profileData?.role ?? "student");
        setCourses(coursesData ?? []);
        setRubrics(rubricsData ?? []);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  async function handleCreateRubric(e: React.FormEvent) {
    e.preventDefault();
    const criteria = criteriaText
      .split("\n")
      .map((line) => line.split("|").map((v) => v.trim()))
      .filter((parts) => parts.length >= 3)
      .map(([criterion, description, points]) => ({
        criterion,
        description,
        points: Number(points) || 0,
      }));

    const res = await fetch("/api/rubrics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        course_id: courseId || null,
        criteria,
      }),
    });
    const data = await res.json();
    if (res.ok && data?.rubric) {
      setRubrics((prev) => [data.rubric, ...prev]);
      setTitle("");
      setCriteriaText("");
    }
  }

  async function handleEvaluate(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    const res = await fetch("/api/rubrics/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rubricId: selectedRubricId,
        submissionText,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setFeedback(data?.feedback?.feedback ?? "Feedback generated.");
    }
  }

  if (role !== "teacher") {
    return (
      <section className="section">
        <h2 className="animate-on-scroll">Teacher Tools</h2>
        <p style={{ color: "var(--gray)" }}>
          Teacher tools are available when your profile role is set to Teacher in Settings.
        </p>
      </section>
    );
  }

  return (
    <section className="section">
      <h2 className="animate-on-scroll">Teacher Tools</h2>

      <div className="contact-info-section animate-on-scroll" style={{ maxWidth: "900px", margin: "0 auto" }}>
        <div className="contact-form-column">
          <h3 className="contact-form-title">Create a rubric</h3>
          <form className="contact-form" onSubmit={handleCreateRubric}>
            <div className="form-field">
              <label htmlFor="course">Course</label>
              <select id="course" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                <option value="">No course selected</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>{course.name}</option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="title">Rubric title</label>
              <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="form-field">
              <label htmlFor="criteria">Criteria (one per line: criterion|description|points)</label>
              <textarea
                id="criteria"
                rows={5}
                value={criteriaText}
                onChange={(e) => setCriteriaText(e.target.value)}
              />
            </div>
            <button className="contact-submit-btn" type="submit">Save Rubric</button>
          </form>
        </div>
      </div>

      <div className="contact-info-section animate-on-scroll" style={{ maxWidth: "900px", margin: "2rem auto 0" }}>
        <div className="contact-form-column">
          <h3 className="contact-form-title">Evaluate a submission</h3>
          <form className="contact-form" onSubmit={handleEvaluate}>
            <div className="form-field">
              <label htmlFor="rubricSelect">Rubric</label>
              <select
                id="rubricSelect"
                value={selectedRubricId}
                onChange={(e) => setSelectedRubricId(e.target.value)}
              >
                <option value="">Select a rubric</option>
                {rubrics.map((rubric) => (
                  <option key={rubric.id} value={rubric.id}>{rubric.title}</option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="submission">Student submission</label>
              <textarea
                id="submission"
                rows={6}
                value={submissionText}
                onChange={(e) => setSubmissionText(e.target.value)}
              />
            </div>
            <button className="contact-submit-btn" type="submit" disabled={!selectedRubricId}>
              Evaluate
            </button>
          </form>
          {feedback ? (
            <div className="contact-info-section" style={{ marginTop: "1rem" }}>
              <h4 className="contact-info-title">Feedback</h4>
              <p style={{ color: "var(--light)", whiteSpace: "pre-wrap" }}>{feedback}</p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
