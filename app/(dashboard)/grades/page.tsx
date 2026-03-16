export default function GradesPage() {
  return (
    <>
      <section className="section">
        <h2 className="animate-on-scroll">Grade Insights</h2>
        <div className="speakers-grid">
          <div className="speaker-card animate-on-scroll scale-up">
            <div className="speaker-avatar">A-</div>
            <h3 className="speaker-name">Algebra II</h3>
            <div className="speaker-title">Current grade: 88%</div>
            <p className="speaker-bio">PersonalTA suggests extra practice on factoring.</p>
          </div>
          <div className="speaker-card animate-on-scroll scale-up">
            <div className="speaker-avatar">B+</div>
            <h3 className="speaker-name">Biology Honors</h3>
            <div className="speaker-title">Current grade: 91%</div>
            <p className="speaker-bio">Lab reports are your strongest category.</p>
          </div>
          <div className="speaker-card animate-on-scroll scale-up">
            <div className="speaker-avatar">A</div>
            <h3 className="speaker-name">English Lit</h3>
            <div className="speaker-title">Current grade: 94%</div>
            <p className="speaker-bio">Essay feedback loop is boosting scores.</p>
          </div>
        </div>
      </section>

      <section className="section">
        <h2 className="animate-on-scroll">Growth Focus</h2>
        <div className="about-stats animate-on-scroll scale-up">
          <div className="about-stat">
            <span className="about-stat-number">+12%</span>
            <span className="about-stat-label">Quiz average improvement</span>
          </div>
          <div className="about-stat">
            <span className="about-stat-number">3</span>
            <span className="about-stat-label">Assignments boosted by AI review</span>
          </div>
          <div className="about-stat">
            <span className="about-stat-number">2</span>
            <span className="about-stat-label">Upcoming teacher check-ins</span>
          </div>
          <div className="about-stat">
            <span className="about-stat-number">4</span>
            <span className="about-stat-label">Targeted skill gaps</span>
          </div>
        </div>
      </section>
    </>
  );
}
