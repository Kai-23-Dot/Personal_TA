import type { ReactNode } from "react";

type PersonalTABackdropProps = {
  children: ReactNode;
};

export function PersonalTABackdrop({ children }: PersonalTABackdropProps) {
  return (
    <div>
      <div className="bg-animation">
        <div className="neural-network" id="neuralNetwork"></div>
        <div className="particles" id="particles"></div>
      </div>
      {children}
    </div>
  );
}
