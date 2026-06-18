import type { ReactNode } from "react";

type ConlearnBackdropProps = {
  children: ReactNode;
};

export function ConlearnBackdrop({ children }: ConlearnBackdropProps) {
  return (
    <div className="premium-backdrop">
      <div className="bg-animation" aria-hidden="true">
        <div className="neural-network" id="neuralNetwork"></div>
        <div className="particles" id="particles"></div>
      </div>
      {children}
    </div>
  );
}
