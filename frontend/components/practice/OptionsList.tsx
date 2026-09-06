"use client";

import { cn } from "@/backend/utils";

type Option = {
  value: string;
  label: string;
};

type OptionsListProps = {
  name: string;
  options: Option[];
  selected: string | null;
  correctAnswer?: string;
  showFeedback: boolean;
  onSelect: (value: string) => void;
};

export function OptionsList({
  name,
  options,
  selected,
  correctAnswer,
  showFeedback,
  onSelect,
}: OptionsListProps) {
  return (
    <fieldset className="mt-6">
      <legend className="mb-2 text-xs font-medium text-muted-foreground">
        Answer choices
      </legend>
      <div className="grid gap-2.5">
        {options.map((opt, index) => {
          const isSelected = selected === opt.value;
          const normalizedCorrect = correctAnswer?.trim().toLowerCase();
          const normalizedValue = opt.value.trim().toLowerCase();
          const isCorrect = showFeedback && normalizedCorrect ? normalizedValue === normalizedCorrect : false;
          const isWrong = showFeedback && isSelected && normalizedCorrect && normalizedValue !== normalizedCorrect;
          return (
            <label
              key={opt.value}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-colors duration-150",
                isCorrect
                  ? "border-[var(--success-ink)] bg-[var(--success-bg)] text-[#1c3829]"
                  : isWrong
                    ? "border-[var(--danger-ink)] bg-[var(--danger-bg)] text-[#6e3630]"
                    : isSelected
                      ? "border-[var(--rule)] bg-[var(--blue-wash)] text-[var(--blue)]"
                      : "border-[var(--rule)] bg-[var(--paper)] text-foreground hover:border-[var(--rule)] hover:bg-[var(--wash-hover)]"
              )}
            >
              <input
                type="radio"
                name={name}
                value={opt.value}
                checked={isSelected}
                onChange={() => onSelect(opt.value)}
                className="accent-sky-400"
              />
              <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-[var(--rule)] text-[11px] font-semibold text-muted-foreground">
                {String.fromCharCode(65 + index)}
              </span>
              <span className="flex-1">{opt.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
