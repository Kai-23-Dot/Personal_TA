export default function PlannerPage() {
  return (
    <>
      <section className="section">
        <h2 className="animate-on-scroll">Study Planner</h2>
        <div className="schedule-tabs">
          <button className="tab-btn active" data-schedule-tab data-target="plan-today">Today</button>
          <button className="tab-btn" data-schedule-tab data-target="plan-week">This Week</button>
          <button className="tab-btn" data-schedule-tab data-target="plan-exams">Exam Prep</button>
        </div>

        <div id="plan-today" className="schedule-content active">
          <div className="timeline">
            <div className="timeline-item animate-on-scroll">
              <div className="timeline-header">
                <div className="timeline-time">4:00 PM</div>
                <div className="timeline-info">
                  <div className="timeline-title">Math warm-up</div>
                  <div className="timeline-speaker">20 minutes</div>
                </div>
                <div className="timeline-collapse-icon">▼</div>
              </div>
              <div className="timeline-details">
                <div className="timeline-desc">Solve five quadratic problems tailored to your weak areas.</div>
              </div>
            </div>
            <div className="timeline-item animate-on-scroll">
              <div className="timeline-header">
                <div className="timeline-time">5:00 PM</div>
                <div className="timeline-info">
                  <div className="timeline-title">English essay edits</div>
                  <div className="timeline-speaker">45 minutes</div>
                </div>
                <div className="timeline-collapse-icon">▼</div>
              </div>
              <div className="timeline-details">
                <div className="timeline-desc">Apply AI feedback and finalize the conclusion paragraph.</div>
              </div>
            </div>
          </div>
        </div>

        <div id="plan-week" className="schedule-content">
          <div className="timeline">
            <div className="timeline-item animate-on-scroll">
              <div className="timeline-header">
                <div className="timeline-time">Tue</div>
                <div className="timeline-info">
                  <div className="timeline-title">Biology lab prep</div>
                  <div className="timeline-speaker">Read & annotate</div>
                </div>
                <div className="timeline-collapse-icon">▼</div>
              </div>
              <div className="timeline-details">
                <div className="timeline-desc">Review photosynthesis notes and answer guided questions.</div>
              </div>
            </div>
            <div className="timeline-item animate-on-scroll">
              <div className="timeline-header">
                <div className="timeline-time">Thu</div>
                <div className="timeline-info">
                  <div className="timeline-title">History timeline review</div>
                  <div className="timeline-speaker">Flashcards</div>
                </div>
                <div className="timeline-collapse-icon">▼</div>
              </div>
              <div className="timeline-details">
                <div className="timeline-desc">Focus on Reconstruction through early 1900s events.</div>
              </div>
            </div>
          </div>
        </div>

        <div id="plan-exams" className="schedule-content">
          <div className="timeline">
            <div className="timeline-item animate-on-scroll">
              <div className="timeline-header">
                <div className="timeline-time">Day -14</div>
                <div className="timeline-info">
                  <div className="timeline-title">Build exam blueprint</div>
                  <div className="timeline-speaker">AI review map</div>
                </div>
                <div className="timeline-collapse-icon">▼</div>
              </div>
              <div className="timeline-details">
                <div className="timeline-desc">PersonalTA clusters your weak topics into a daily plan.</div>
              </div>
            </div>
            <div className="timeline-item animate-on-scroll">
              <div className="timeline-header">
                <div className="timeline-time">Day -3</div>
                <div className="timeline-info">
                  <div className="timeline-title">Mock exam check</div>
                  <div className="timeline-speaker">Adaptive test</div>
                </div>
                <div className="timeline-collapse-icon">▼</div>
              </div>
              <div className="timeline-details">
                <div className="timeline-desc">Take a 30-minute practice exam and get instant feedback.</div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
