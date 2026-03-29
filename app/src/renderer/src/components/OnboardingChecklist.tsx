export interface OnboardingStep {
  id: string
  title: string
  detail: string
  status: 'ready' | 'pending'
}

interface OnboardingChecklistProps {
  steps: OnboardingStep[]
}

function getLabel(status: OnboardingStep['status']): string {
  return status === 'ready' ? 'Ready' : 'Next'
}

export function OnboardingChecklist({ steps }: OnboardingChecklistProps): JSX.Element {
  return (
    <section className="card stack-lg">
      <div className="stack-sm">
        <p className="eyebrow">Onboarding</p>
        <h2 className="section-title">Getting Started</h2>
        <p className="muted">Complete these steps to start capturing and analyzing your screen activity.</p>
      </div>

      <ol className="step-list">
        {steps.map((step) => (
          <li key={step.id} className="step-item">
            <span className={`step-marker step-marker--${step.status}`}>{getLabel(step.status)}</span>
            <div className="stack-xs">
              <strong>{step.title}</strong>
              <p className="muted">{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
