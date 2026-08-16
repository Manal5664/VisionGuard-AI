export default function StepIndicator({ steps, current }) {
  return (
    <ol className="steps" aria-label="Workflow progress">
      {steps.map((step, index) => {
        const state = index < current ? "step-done" : index === current ? "step-active" : "step-pending";
        return (
          <li className={`step ${state}`} key={step.id}>
            <span className="step-num" aria-hidden="true">
              {index < current ? "✓" : index + 1}
            </span>
            <span className="step-label">
              <strong>{step.label}</strong>
              {step.sub && <small>{step.sub}</small>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
