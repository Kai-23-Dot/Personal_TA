"use client";

type NavigationControlsProps = {
  onPrev: () => void;
  onNext: () => void;
  onSubmit: () => void;
  isFirst: boolean;
  isLast: boolean;
  submitting: boolean;
};

export function NavigationControls({
  onPrev,
  onNext,
  onSubmit,
  isFirst,
  isLast,
  submitting,
}: NavigationControlsProps) {
  return (
    <div className="cta-buttons" style={{ justifyContent: "space-between", marginTop: "2rem" }}>
      <button className="btn btn-secondary" type="button" onClick={onPrev} disabled={isFirst}>
        Previous
      </button>
      {isLast ? (
        <button className="btn btn-primary" type="button" onClick={onSubmit} disabled={submitting}>
          {submitting ? "Submitting..." : "Submit Test"}
        </button>
      ) : (
        <button className="btn btn-primary" type="button" onClick={onNext}>
          Next
        </button>
      )}
    </div>
  );
}
