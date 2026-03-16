import Link from "next/link";
import { PersonalTABackdrop } from "@/components/layout/PersonalTABackdrop";
import { PersonalTAHeader } from "@/components/layout/PersonalTAHeader";
import { PersonalTAFooter } from "@/components/layout/PersonalTAFooter";

const navLinks = [
  { label: "Home", href: "#home" },
  { label: "Features", href: "#features" },
  { label: "How It Works", href: "#how" },
  { label: "About", href: "/about" },
  { label: "Website", href: "/website" },
  { label: "Contact", href: "/contact" },
];

export default function HomePage() {
  return (
    <PersonalTABackdrop>
      <PersonalTAHeader links={navLinks} showSignIn />

      <section id="home" className="hero">
        <div className="hero-content">
          <h1>PersonalTA.ai</h1>
          <p>Sync your classes, upload your notes, and get a personal AI that knows your curriculum.</p>

          <div className="hero-stats">
            <div className="stat">
              <span className="stat-number" data-target="1200">0</span>
              <span className="stat-label">Students Supported</span>
            </div>
            <div className="stat">
              <span className="stat-number" data-target="480">0</span>
              <span className="stat-label">Hours Saved / Week</span>
            </div>
            <div className="stat">
              <span className="stat-number" data-target="86">0</span>
              <span className="stat-label">Courses Synced</span>
            </div>
            <div className="stat">
              <span className="stat-number" data-target="12">0</span>
              <span className="stat-label">School Integrations</span>
            </div>
          </div>

          <div className="countdown" id="countdown" data-date="2026-01-15T09:00:00">
            <div className="countdown-item">
              <span className="countdown-number" id="days">00</span>
              <span className="countdown-label">Days to Beta</span>
            </div>
            <div className="countdown-item">
              <span className="countdown-number" id="hours">00</span>
              <span className="countdown-label">Hours</span>
            </div>
            <div className="countdown-item">
              <span className="countdown-number" id="minutes">00</span>
              <span className="countdown-label">Minutes</span>
            </div>
            <div className="countdown-item">
              <span className="countdown-number" id="seconds">00</span>
              <span className="countdown-label">Seconds</span>
            </div>
          </div>

          <div className="cta-buttons">
            <Link href="/login" className="btn btn-primary">Sign In</Link>
          </div>
        </div>
      </section>

      <section id="features" className="section">
        <h2 className="animate-on-scroll">Everything You Need to Study Smarter</h2>
        <div className="about-content">
          <div className="about-text animate-on-scroll slide-left">
            <p>PersonalTA becomes the AI brain for your classes. Upload notes, handouts, and recordings and the assistant answers from your material before it replies.</p>
            <p>Build customized study plans, generate adaptive quizzes, and get instant explanations when you are stuck. Everything is mapped to your actual schedule and deadlines.</p>
            <p>Teachers and parents can stay in the loop with progress snapshots that show where students are thriving and where they need help.</p>
          </div>
          <div className="about-visual animate-on-scroll slide-right">
            <div className="blockchain-visual">
              <div className="block">Notes</div>
              <div className="block">Chat</div>
              <div className="block">Quiz</div>
              <div className="block">Plans</div>
              <div className="block">Rubric</div>
              <div className="block">Grades</div>
              <div className="block">Focus</div>
              <div className="block">Review</div>
              <div className="block">Goals</div>
            </div>
          </div>
        </div>

        <div className="about-stats animate-on-scroll scale-up">
          <div className="about-stat">
            <span className="about-stat-number">4x</span>
            <span className="about-stat-label">Faster Study Prep</span>
          </div>
          <div className="about-stat">
            <span className="about-stat-number">92%</span>
            <span className="about-stat-label">Homework Completion</span>
          </div>
          <div className="about-stat">
            <span className="about-stat-number">24/7</span>
            <span className="about-stat-label">Instant Help</span>
          </div>
          <div className="about-stat">
            <span className="about-stat-number">15+</span>
            <span className="about-stat-label">Smart Assist Tools</span>
          </div>
        </div>
      </section>

      <section id="how" className="section">
        <h2 className="animate-on-scroll">How PersonalTA Works</h2>
        <div className="speakers-grid">
          <div className="speaker-card animate-on-scroll scale-up">
            <div className="speaker-avatar">1</div>
            <h3 className="speaker-name">Connect Classes</h3>
            <div className="speaker-title">Sync Google Classroom, Canvas, or Schoology</div>
            <p className="speaker-bio">Pull assignments, due dates, and materials automatically so nothing slips.</p>
          </div>
          <div className="speaker-card animate-on-scroll scale-up">
            <div className="speaker-avatar">2</div>
            <h3 className="speaker-name">Upload Your Notes</h3>
            <div className="speaker-title">Slides, PDFs, audio, and handwritten scans</div>
            <p className="speaker-bio">PersonalTA grounds every answer in your actual course content.</p>
          </div>
          <div className="speaker-card animate-on-scroll scale-up">
            <div className="speaker-avatar">3</div>
            <h3 className="speaker-name">Get Adaptive Help</h3>
            <div className="speaker-title">Chat, quizzes, and study plans</div>
            <p className="speaker-bio">Instant explanations, confidence-building practice, and smart review loops.</p>
          </div>
        </div>
      </section>

      <section id="integrations" className="section">
        <h2 className="animate-on-scroll">Integrations Built for Schools</h2>
        <div className="sponsors-section animate-on-scroll">
          <div className="sponsor-tiers">
            <div className="sponsor-tier">
              <h3 className="tier-title platinum">Learning Platforms</h3>
              <div className="sponsors-grid platinum">
                <div className="sponsor-card platinum animate-on-scroll scale-up">
                  <div className="sponsor-logo">GC</div>
                  <h4 className="sponsor-name">Google Classroom</h4>
                  <p className="sponsor-description">Assignments, announcements, and materials synced automatically.</p>
                </div>
                <div className="sponsor-card platinum animate-on-scroll scale-up">
                  <div className="sponsor-logo">CN</div>
                  <h4 className="sponsor-name">Canvas</h4>
                  <p className="sponsor-description">Gradebook insights and module pacing in one view.</p>
                </div>
              </div>
            </div>

            <div className="sponsor-tier">
              <h3 className="tier-title gold">Productivity Tools</h3>
              <div className="sponsors-grid gold">
                <div className="sponsor-card gold animate-on-scroll scale-up">
                  <div className="sponsor-logo">DR</div>
                  <h4 className="sponsor-name">Google Drive</h4>
                  <p className="sponsor-description">Centralize notes and assignments in your existing folders.</p>
                </div>
                <div className="sponsor-card gold animate-on-scroll scale-up">
                  <div className="sponsor-logo">NT</div>
                  <h4 className="sponsor-name">Notion</h4>
                  <p className="sponsor-description">Turn outlines into study trackers with one click.</p>
                </div>
              </div>
            </div>

            <div className="sponsor-tier">
              <h3 className="tier-title silver">Wellness & Focus</h3>
              <div className="sponsors-grid silver">
                <div className="sponsor-card silver animate-on-scroll scale-up">
                  <div className="sponsor-logo">FT</div>
                  <h4 className="sponsor-name">FocusTimer</h4>
                  <p className="sponsor-description">Pomodoro sessions tied to your actual tasks.</p>
                </div>
                <div className="sponsor-card silver animate-on-scroll scale-up">
                  <div className="sponsor-logo">CL</div>
                  <h4 className="sponsor-name">Calm</h4>
                  <p className="sponsor-description">Reset your mind before big tests and presentations.</p>
                </div>
                <div className="sponsor-card silver animate-on-scroll scale-up">
                  <div className="sponsor-logo">TZ</div>
                  <h4 className="sponsor-name">TimeZone Sync</h4>
                  <p className="sponsor-description">Automatic timezone handling for remote classes.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="stories" className="section">
        <h2 className="animate-on-scroll">Student Success Stories</h2>
        <div className="schedule-tabs">
          <button className="tab-btn active" data-schedule-tab data-target="story1">Freshman Focus</button>
          <button className="tab-btn" data-schedule-tab data-target="story2">AP Power</button>
          <button className="tab-btn" data-schedule-tab data-target="story3">Exam Week</button>
        </div>

        <div id="story1" className="schedule-content active">
          <div className="timeline">
            <div className="timeline-item animate-on-scroll">
              <div className="timeline-header">
                <div className="timeline-time">Week 1</div>
                <div className="timeline-info">
                  <div className="timeline-title">Assignment reminders set automatically</div>
                  <div className="timeline-speaker">Freshman onboarding</div>
                </div>
                <div className="timeline-collapse-icon">▼</div>
              </div>
              <div className="timeline-details">
                <div className="timeline-desc">PersonalTA pulled in the full schedule and highlighted due dates with smart reminders.</div>
              </div>
            </div>
            <div className="timeline-item animate-on-scroll">
              <div className="timeline-header">
                <div className="timeline-time">Week 3</div>
                <div className="timeline-info">
                  <div className="timeline-title">First quiz score jumped +18%</div>
                  <div className="timeline-speaker">Adaptive practice</div>
                </div>
                <div className="timeline-collapse-icon">▼</div>
              </div>
              <div className="timeline-details">
                <div className="timeline-desc">Micro-quizzes built directly from their teacher slides closed knowledge gaps quickly.</div>
              </div>
            </div>
          </div>
        </div>

        <div id="story2" className="schedule-content">
          <div className="timeline">
            <div className="timeline-item animate-on-scroll">
              <div className="timeline-header">
                <div className="timeline-time">AP Biology</div>
                <div className="timeline-info">
                  <div className="timeline-title">Notes turned into a 3-week plan</div>
                  <div className="timeline-speaker">Study plan builder</div>
                </div>
                <div className="timeline-collapse-icon">▼</div>
              </div>
              <div className="timeline-details">
                <div className="timeline-desc">PersonalTA created daily checkpoints with bite-sized tasks and timed reviews.</div>
              </div>
            </div>
            <div className="timeline-item animate-on-scroll">
              <div className="timeline-header">
                <div className="timeline-time">APUSH</div>
                <div className="timeline-info">
                  <div className="timeline-title">Essay feedback in minutes</div>
                  <div className="timeline-speaker">Rubric coach</div>
                </div>
                <div className="timeline-collapse-icon">▼</div>
              </div>
              <div className="timeline-details">
                <div className="timeline-desc">AI feedback flagged missing evidence and suggested stronger thesis options.</div>
              </div>
            </div>
          </div>
        </div>

        <div id="story3" className="schedule-content">
          <div className="timeline">
            <div className="timeline-item animate-on-scroll">
              <div className="timeline-header">
                <div className="timeline-time">Day -7</div>
                <div className="timeline-info">
                  <div className="timeline-title">Auto-generated review guide</div>
                  <div className="timeline-speaker">Exam prep</div>
                </div>
                <div className="timeline-collapse-icon">▼</div>
              </div>
              <div className="timeline-details">
                <div className="timeline-desc">Summaries and flashcards from every unit delivered in one click.</div>
              </div>
            </div>
            <div className="timeline-item animate-on-scroll">
              <div className="timeline-header">
                <div className="timeline-time">Day -1</div>
                <div className="timeline-info">
                  <div className="timeline-title">Confidence check</div>
                  <div className="timeline-speaker">Last-minute quiz</div>
                </div>
                <div className="timeline-collapse-icon">▼</div>
              </div>
              <div className="timeline-details">
                <div className="timeline-desc">Adaptive testing focused on weak spots only, saving hours of review time.</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="section">
        <div className="register-section animate-on-scroll">
          <div className="register-content">
            <h2 className="register-title">Start Your PersonalTA Plan</h2>
            <p className="register-subtitle">Free during beta. Upgrade later for team analytics and instructor tools.</p>
            <div className="cta-buttons">
              <Link href="/signup" className="btn btn-primary">Start Free</Link>
              <Link href="/login" className="btn btn-secondary">Sign In</Link>
            </div>
          </div>
        </div>

        <div className="contact-info-section animate-on-scroll">
          <div className="contact-container">
            <div className="contact-form-column">
              <h3 className="contact-form-title">Talk to the Team</h3>
              <form className="contact-form" data-contact-form>
                <div className="form-field">
                  <label htmlFor="contactName">Name</label>
                  <input type="text" id="contactName" placeholder="Student or educator name" required />
                </div>
                <div className="form-field">
                  <label htmlFor="contactEmail">Email</label>
                  <input type="email" id="contactEmail" placeholder="you@school.edu" required />
                </div>
                <div className="form-field">
                  <label htmlFor="contactSubject">Subject</label>
                  <input type="text" id="contactSubject" placeholder="How can we help?" required />
                </div>
                <div className="form-field">
                  <label htmlFor="contactMessage">Message</label>
                  <textarea id="contactMessage" placeholder="Tell us about your class goals" required></textarea>
                </div>
                <button type="submit" className="contact-submit-btn">Send Message</button>
                <div className="form-message" id="contactFormMessage"></div>
              </form>
            </div>

            <div className="contact-info-column">
              <h3 className="contact-info-title">PersonalTA HQ</h3>
              <div className="contact-info-grid">
                <div className="contact-item">
                  <div className="contact-icon">
                    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                    </svg>
                  </div>
                  <div className="contact-details">
                    <span className="contact-label">Remote First</span>
                    <span className="contact-value">Built with students across the US.</span>
                  </div>
                </div>
                <div className="contact-item">
                  <div className="contact-icon">
                    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                    </svg>
                  </div>
                  <div className="contact-details">
                    <span className="contact-label">Email</span>
                    <span className="contact-value">hello@personalta.ai</span>
                  </div>
                </div>
                <div className="contact-item">
                  <div className="contact-icon">
                    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
                    </svg>
                  </div>
                  <div className="contact-details">
                    <span className="contact-label">Text Us</span>
                    <span className="contact-value">(888) 555-0123</span>
                  </div>
                </div>
                <div className="contact-item">
                  <div className="contact-icon">
                    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/>
                    </svg>
                  </div>
                  <div className="contact-details">
                    <span className="contact-label">Support Hours</span>
                    <span className="contact-value">Mon - Fri · 8 AM - 8 PM ET</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <PersonalTAFooter />
    </PersonalTABackdrop>
  );
}
