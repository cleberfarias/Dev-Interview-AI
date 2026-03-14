import React from 'react';
import type { AvatarResponse, FinalReport, InterviewConfig, InterviewPlan, User } from '../../../shared/types';
import InterviewRoomLayout from './InterviewRoomLayout';

interface Props {
  config: InterviewConfig;
  plan: InterviewPlan;
  sessionId?: string;
  initialAvatar?: AvatarResponse | null;
  user: User;
  onFinish: (report: FinalReport) => void;
  onBack?: () => void;
}

const InterviewRoom: React.FC<Props> = ({ config, plan, sessionId, initialAvatar, onFinish, onBack }) => {
  return (
    <InterviewRoomLayout
      config={config}
      plan={plan}
      sessionId={sessionId}
      initialAvatar={initialAvatar}
      onFinish={onFinish}
      onBack={onBack}
    />
  );
};

export default InterviewRoom;
