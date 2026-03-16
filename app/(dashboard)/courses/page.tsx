export default function CoursesPage() {
  return (
    <>
      <section className="section">
        <h2 className="animate-on-scroll">Your Courses</h2>
        <div className="speakers-grid">
          <div className="speaker-card animate-on-scroll scale-up">
            <div className="speaker-avatar">ALG</div>
            <h3 className="speaker-name">Algebra II</h3>
            <div className="speaker-title">5 assignments · 82% mastery</div>
            <p className="speaker-bio">Upcoming: Quadratic functions quiz on Friday.</p>
          </div>
          <div className="speaker-card animate-on-scroll scale-up">
            <div className="speaker-avatar">BIO</div>
            <h3 className="speaker-name">Biology Honors</h3>
            <div className="speaker-title">3 assignments · 88% mastery</div>
            <p className="speaker-bio">Lab report draft due Wednesday.</p>
          </div>
          <div className="speaker-card animate-on-scroll scale-up">
            <div className="speaker-avatar">ENG</div>
            <h3 className="speaker-name">English Literature</h3>
            <div className="speaker-title">2 assignments · 91% mastery</div>
            <p className="speaker-bio">Essay outline feedback ready.</p>
          </div>
        </div>
      </section>

      <section className="section">
        <h2 className="animate-on-scroll">Course Actions</h2>
        <div className="about-stats animate-on-scroll scale-up">
          <div className="about-stat">
            <span className="about-stat-number">Sync</span>
            <span className="about-stat-label">Pull new assignments now</span>
          </div>
          <div className="about-stat">
            <span className="about-stat-number">Scan</span>
            <span className="about-stat-label">Upload teacher slides</span>
          </div>
          <div className="about-stat">
            <span className="about-stat-number">Plan</span>
            <span className="about-stat-label">Generate weekly plan</span>
          </div>
          <div className="about-stat">
            <span className="about-stat-number">Coach</span>
            <span className="about-stat-label">Get AI tutoring</span>
          </div>
        </div>
      </section>
    </>
  );
}
