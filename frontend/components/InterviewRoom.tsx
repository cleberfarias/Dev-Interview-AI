import React from 'react';
import type { InterviewConfig, InterviewPlan, FinalReport, User } from '../types';
import InterviewRoomLayout from './InterviewRoomLayout';

interface Props {
  config: InterviewConfig;
  plan: InterviewPlan;
  user: User;
  onFinish: (report: FinalReport) => void;
}

const InterviewRoom: React.FC<Props> = ({ config, plan, onFinish }) => {
  return <InterviewRoomLayout config={config} plan={plan} onFinish={onFinish} />;
};

export default InterviewRoom;
