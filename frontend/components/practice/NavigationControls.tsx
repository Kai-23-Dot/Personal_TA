"use client";

import { Button } from "@/frontend/components/ui/button";

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
    <div className="mt-8 flex items-center justify-between">
      <Button variant="secondary" type="button" onClick={onPrev} disabled={isFirst}>
        Previous
      </Button>
      {isLast ? (
        <Button type="button" onClick={onSubmit} disabled={submitting}>
          {submitting ? "Submitting..." : "Submit Test"}
        </Button>
      ) : (
        <Button type="button" onClick={onNext}>
          Next
        </Button>
      )}
    </div>
  );
}
