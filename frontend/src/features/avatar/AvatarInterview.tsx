import React from 'react';
import type { AvatarResponse } from '../../shared/types';
import AvatarRenderer from './AvatarRenderer';

type AvatarInterviewState = 'idle' | 'avatar_listening' | 'avatar_thinking' | 'avatar_speaking';

interface AvatarInterviewProps {
  avatar?: AvatarResponse | null;
  state: AvatarInterviewState;
  mouthOpen?: number;
}

const AvatarInterview: React.FC<AvatarInterviewProps> = ({ avatar, state, mouthOpen }) => {
  return (
    <section aria-label="Avatar interview section">
      <AvatarRenderer avatar={avatar} state={state} liveMouthOpen={mouthOpen} />
    </section>
  );
};

export default AvatarInterview;
