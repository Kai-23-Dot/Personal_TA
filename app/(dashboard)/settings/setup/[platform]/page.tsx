type SetupPageProps = {
  params: Promise<{ platform: string }>;
};

export default async function SetupPlatformPage({ params }: SetupPageProps) {
  const { platform } = await params;
  const platformLabel = platform
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

  return (
    <section className="section">
      <h2 className="animate-on-scroll">Connect {platformLabel}</h2>
      <div className="contact-info-section animate-on-scroll" style={{ maxWidth: "720px", margin: "0 auto" }}>
        <div className="contact-form-column">
          <h3 className="contact-form-title">Bring your classes into PersonalTA</h3>
          <form className="contact-form">
            <div className="form-field">
              <label htmlFor="schoolDomain">School domain</label>
              <input id="schoolDomain" type="text" placeholder="district.edu" />
            </div>
            <div className="form-field">
              <label htmlFor="accessCode">Access code</label>
              <input id="accessCode" type="text" placeholder="Optional" />
            </div>
            <button type="button" className="contact-submit-btn">Authorize Connection</button>
          </form>
        </div>
      </div>
    </section>
  );
}
