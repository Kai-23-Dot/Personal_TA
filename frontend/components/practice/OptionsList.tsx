"use client";

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
    <fieldset className="options-fieldset">
      <legend className="options-legend">Answer choices</legend>
      <div className="options-grid">
        {options.map((opt, index) => {
          const isSelected = selected === opt.value;
          const normalizedCorrect = correctAnswer?.trim().toLowerCase();
          const normalizedValue = opt.value.trim().toLowerCase();
          const isCorrect = showFeedback && normalizedCorrect ? normalizedValue === normalizedCorrect : false;
          const isWrong = showFeedback && isSelected && normalizedCorrect && normalizedValue !== normalizedCorrect;
          return (
            <label
              key={opt.value}
              className={`option-card${isSelected ? " option-card--selected" : ""}${
                isCorrect ? " option-card--correct" : ""
              }${isWrong ? " option-card--wrong" : ""}`}
            >
              <input
                type="radio"
                name={name}
                value={opt.value}
                checked={isSelected}
                onChange={() => onSelect(opt.value)}
              />
              <span className="option-letter">{String.fromCharCode(65 + index)}</span>
              <span className="option-text">{opt.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
