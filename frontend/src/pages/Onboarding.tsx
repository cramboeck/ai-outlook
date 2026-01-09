import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { OnboardingWizard, isOnboardingComplete } from '../components/onboarding/OnboardingWizard';

export const Onboarding = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // If onboarding is already complete, redirect to dashboard
    if (isOnboardingComplete()) {
      navigate('/dashboard', { replace: true });
    }
  }, [navigate]);

  // Show the wizard if onboarding is not complete
  if (isOnboardingComplete()) {
    return null; // Will redirect
  }

  return <OnboardingWizard />;
};
