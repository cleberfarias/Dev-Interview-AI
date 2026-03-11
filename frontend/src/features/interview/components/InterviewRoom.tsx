import React from 'react';
import type { FinalReport, InterviewConfig, InterviewPlan, User } from '../../../shared/types';
import InterviewRoomLayout from './InterviewRoomLayout';

interface Props {
  config: InterviewConfig;
  plan: InterviewPlan;
  user: User;
  onFinish: (report: FinalReport) => void;
  onBack?: () => void;
}

const InterviewRoom: React.FC<Props> = ({ config, plan, onFinish, onBack }) => {
  return <InterviewRoomLayout config={config} plan={plan} onFinish={onFinish} onBack={onBack} />;
};

export default InterviewRoom;
