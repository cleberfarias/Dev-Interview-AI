
import React, { useEffect } from 'react';

interface Props {
  onGetStarted: () => void;
  onInstall?: () => void;
}

// Minimal LandingPage kept as a stub to immediately redirect to Login
const LandingPage: React.FC<Props> = ({ onGetStarted }) => {
  useEffect(() => {
    onGetStarted();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
};

export default LandingPage;
