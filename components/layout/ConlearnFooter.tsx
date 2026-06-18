export function ConlearnFooter() {
  return (
    <footer>
      <div className="footer-content">
        <p className="footer-brand">Conlearn</p>
        <p>
          © 2026 Conlearn. All rights reserved. | Crafted for students and educators.
        </p>

        {/* Legal / third-party trademark notices */}
        <div style={{
          marginTop: "1.5rem",
          paddingTop: "1.25rem",
          borderTop: "1px solid rgba(255, 255, 255, 0.07)",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          maxWidth: "720px",
          margin: "1.5rem auto 0",
        }}>
          <p style={{ fontSize: "0.72rem", color: "rgba(138, 138, 138, 0.7)", lineHeight: 1.65, margin: 0 }}>
            Canvas® is a registered trademark of Instructure, Inc. Conlearn is not affiliated with, sponsored by, or endorsed by Instructure, Inc.
          </p>
          <p style={{ fontSize: "0.72rem", color: "rgba(138, 138, 138, 0.7)", lineHeight: 1.65, margin: 0 }}>
            Google Classroom™ is a trademark of Google LLC. Conlearn is not affiliated with, sponsored by, or endorsed by Google LLC.
          </p>
          <p style={{ fontSize: "0.72rem", color: "rgba(138, 138, 138, 0.7)", lineHeight: 1.65, margin: 0 }}>
            All other trademarks, product names, and company names or logos referenced herein are the property of their respective owners.
          </p>
        </div>
      </div>
    </footer>
  );
}
