import React from 'react';
import type { AvatarResponse } from '../../shared/types';
import AvatarControls from './AvatarControls';
import AvatarRenderer from './AvatarRenderer';

type AvatarInterviewState = 'idle' | 'avatar_listening' | 'avatar_thinking' | 'avatar_speaking';

interface AvatarInterviewProps {
  avatar?: AvatarResponse | null;
  state: AvatarInterviewState;
}

const AvatarInterview: React.FC<AvatarInterviewProps> = ({ avatar, state }) => {
  return (
    <section aria-label="Avatar interview section">
      <AvatarRenderer avatar={avatar} state={state} />
      <AvatarControls state={state} />
    </section>
  );
};

export default AvatarInterview;
