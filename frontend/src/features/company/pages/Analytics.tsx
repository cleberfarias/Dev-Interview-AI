import React from 'react';

const Analytics: React.FC = () => {
  return (
    <div className="space-y-4">
      <h2 className="text-white font-bold">Analytics</h2>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-900/20 p-4 rounded">
          <h4 className="text-white">Entrevistas por período</h4>
          <div className="h-40 bg-slate-800 rounded mt-2" />
        </div>
        <div className="bg-slate-900/20 p-4 rounded">
          <h4 className="text-white">Média por template</h4>
          <div className="h-40 bg-slate-800 rounded mt-2" />
        </div>
      </div>
    </div>
  );
};

export default Analytics;
