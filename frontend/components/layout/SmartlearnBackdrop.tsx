import type { ReactNode } from "react";

type SmartlearnBackdropProps = {
  children: ReactNode;
};

export function SmartlearnBackdrop({ children }: SmartlearnBackdropProps) {
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
