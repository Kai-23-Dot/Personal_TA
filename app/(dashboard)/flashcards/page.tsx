export default function FlashcardsPage() {
  return (
    <>
      <section className="section">
        <h2 className="animate-on-scroll">Flashcards</h2>
        <div className="speakers-grid">
          <div className="speaker-card animate-on-scroll scale-up">
            <div className="speaker-avatar">BIO</div>
            <h3 className="speaker-name">Cell Biology Set</h3>
            <div className="speaker-title">28 cards · 10 min review</div>
            <p className="speaker-bio">Auto-generated from last week’s slides.</p>
          </div>
          <div className="speaker-card animate-on-scroll scale-up">
            <div className="speaker-avatar">ENG</div>
            <h3 className="speaker-name">Literary Terms</h3>
            <div className="speaker-title">20 cards · 8 min review</div>
            <p className="speaker-bio">Definitions with examples from your class notes.</p>
          </div>
          <div className="speaker-card animate-on-scroll scale-up">
            <div className="speaker-avatar">HIS</div>
            <h3 className="speaker-name">Unit 3 Dates</h3>
            <div className="speaker-title">32 cards · 12 min review</div>
            <p className="speaker-bio">Timeline facts and key events.</p>
          </div>
        </div>
      </section>
    </>
  );
}
