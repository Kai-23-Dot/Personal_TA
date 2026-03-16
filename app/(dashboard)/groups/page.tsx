export default function GroupsPage() {
  return (
    <section className="section">
      <h2 className="animate-on-scroll">Study Groups</h2>
      <div className="speakers-grid">
        <div className="speaker-card animate-on-scroll scale-up">
          <div className="speaker-avatar">Bio</div>
          <h3 className="speaker-name">Biology Lab Team</h3>
          <div className="speaker-title">4 members · Meets Wed</div>
          <p className="speaker-bio">Shared notes, lab checklist, and practice quiz.</p>
        </div>
        <div className="speaker-card animate-on-scroll scale-up">
          <div className="speaker-avatar">AP</div>
          <h3 className="speaker-name">APUSH Study Pod</h3>
          <div className="speaker-title">6 members · Meets Sun</div>
          <p className="speaker-bio">Debate prompts and timeline flashcards.</p>
        </div>
        <div className="speaker-card animate-on-scroll scale-up">
          <div className="speaker-avatar">Alg</div>
          <h3 className="speaker-name">Algebra II Boost</h3>
          <div className="speaker-title">3 members · Meets Fri</div>
          <p className="speaker-bio">Practice sets created from teacher homework.</p>
        </div>
      </div>
    </section>
  );
}
