import React from 'react';

const PublicInvite: React.FC<{ token?: string | undefined }> = ({ token }) => {
  return (
    <div className="max-w-2xl mx-auto bg-slate-900/20 p-6 rounded">
      <div className="text-sm text-slate-400">Empresa XYZ</div>
      <h2 className="text-white font-bold mt-2">Entrevista Técnica: Frontend Mid</h2>
      <p className="text-slate-300 mt-3">Duração estimada: 40 minutos</p>
      <ul className="mt-3 text-slate-300 space-y-1">
        <li>• Verifique microfone e câmera</li>
        <li>• Fale de forma clara</li>
        <li>• Tenha resolução de internet estável</li>
      </ul>
      <div className="mt-4">
        <button className="bg-indigo-600 px-4 py-2 rounded font-bold">Iniciar Entrevista</button>
      </div>
    </div>
  );
};

export default PublicInvite;
