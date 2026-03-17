import React from 'react';

export const DataTable: React.FC<{ columns: string[]; rows: any[] }> = ({ columns, rows }) => {
  return (
    <div className="overflow-x-auto bg-transparent">
      <table className="w-full text-sm text-left border-collapse">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} className="p-3 text-xs text-slate-400 uppercase font-bold">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={r.id || idx} className="border-t border-white/5 hover:bg-slate-800/30">
              {columns.map((c, i) => (
                <td key={i} className="p-3 text-white">{r[Object.keys(r)[i]] ?? '-'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default DataTable;
