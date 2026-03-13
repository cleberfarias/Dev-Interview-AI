import React from 'react';
import type { FinalReport, InterviewConfig, InterviewPlan, User } from '../../../shared/types';
import InterviewRoomLayout from './InterviewRoomLayout';

interface Props {
  config: InterviewConfig;
  plan: InterviewPlan;
  sessionId?: string;
  user: User;
  onFinish: (report: FinalReport) => void;
  onBack?: () => void;
}

const InterviewRoom: React.FC<Props> = ({ config, plan, sessionId, onFinish, onBack }) => {
  return <InterviewRoomLayout config={config} plan={plan} sessionId={sessionId} onFinish={onFinish} onBack={onBack} />;
};

export default InterviewRoom;
