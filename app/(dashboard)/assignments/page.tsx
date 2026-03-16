export default function AssignmentsPage() {
  return (
    <>
      <section className="section">
        <h2 className="animate-on-scroll">Assignments Inbox</h2>
        <div className="timeline">
          <div className="timeline-item animate-on-scroll">
            <div className="timeline-header">
              <div className="timeline-time">Today</div>
              <div className="timeline-info">
                <div className="timeline-title">English essay revision</div>
                <div className="timeline-speaker">Due 5:00 PM</div>
              </div>
              <div className="timeline-collapse-icon">▼</div>
            </div>
            <div className="timeline-details">
              <div className="timeline-desc">AI feedback suggests stronger thesis and two new evidence quotes.</div>
            </div>
          </div>
          <div className="timeline-item animate-on-scroll">
            <div className="timeline-header">
              <div className="timeline-time">Tomorrow</div>
              <div className="timeline-info">
                <div className="timeline-title">Biology lab report</div>
                <div className="timeline-speaker">Due 8:00 PM</div>
              </div>
              <div className="timeline-collapse-icon">▼</div>
            </div>
            <div className="timeline-details">
              <div className="timeline-desc">Draft the conclusion with AI-assisted structure and citations.</div>
            </div>
          </div>
          <div className="timeline-item animate-on-scroll">
            <div className="timeline-header">
              <div className="timeline-time">Friday</div>
              <div className="timeline-info">
                <div className="timeline-title">Geometry quiz prep</div>
                <div className="timeline-speaker">Quiz at 10:00 AM</div>
              </div>
              <div className="timeline-collapse-icon">▼</div>
            </div>
            <div className="timeline-details">
              <div className="timeline-desc">PersonalTA created 12 practice problems tailored to your last unit.</div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
