import React from 'react';
import type {
  AvatarResponse,
  FinalReport,
  InterviewConfig,
  InterviewPlan,
  OrchestratorContextResponse,
  User,
} from '../../../shared/types';
import InterviewRoomLayout from './InterviewRoomLayout';

interface Props {
  config: InterviewConfig;
  plan: InterviewPlan;
  sessionId?: string;
  initialAvatar?: AvatarResponse | null;
  context?: OrchestratorContextResponse | null;
  user: User;
  onFinish: (report: FinalReport) => void;
  onBack?: () => void;
}

const InterviewRoom: React.FC<Props> = ({ config, plan, sessionId, initialAvatar, context, user, onFinish, onBack }) => {
  return (
    <InterviewRoomLayout
      config={config}
      plan={plan}
      sessionId={sessionId}
      initialAvatar={initialAvatar}
      context={context}
      user={user}
      onFinish={onFinish}
      onBack={onBack}
    />
  );
};

export default InterviewRoom;
