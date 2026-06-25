import React from 'react';

interface Lead {
  id: string;
  email: string;
  businessName?: string;
  status: string;
  createdAt: string;
}

interface LeadTableProps {
  leads: Lead[];
}

export default function LeadTable({ leads }: LeadTableProps) {
  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>Business</th>
            <th>Email</th>
            <th>Status</th>
            <th>Found Date</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr key={lead.id}>
              <td className="bold">{lead.businessName || 'N/A'}</td>
              <td>{lead.email}</td>
              <td>
                <span className={`status-badge ${lead.status.toLowerCase()}`}>
                  {lead.status}
                </span>
              </td>
              <td>{new Date(lead.createdAt).toLocaleDateString()}</td>
              <td>
                <button className="view-btn">View Timeline</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <style jsx>{`
        .table-container {
          width: 100%;
          overflow-x: auto;
          background: #fff;
          border-radius: 8px;
          border: 1px solid #eee;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }
        th {
          background: #f9f9f9;
          padding: 15px;
          font-size: 0.85rem;
          color: #666;
          border-bottom: 1px solid #eee;
        }
        td {
          padding: 15px;
          font-size: 0.9rem;
          border-bottom: 1px solid #eee;
        }
        .bold {
          font-weight: 600;
        }
        .status-badge {
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: bold;
          text-transform: uppercase;
        }
        .status-badge.new { background: #e3f2fd; color: #1976d2; }
        .status-badge.contacted { background: #fff3e0; color: #f57c00; }
        .status-badge.replied { background: #e8f5e9; color: #2e7d32; }
        .view-btn {
          background: none;
          border: 1px solid #ddd;
          padding: 5px 10px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.8rem;
        }
        .view-btn:hover { background: #f5f5f5; }
      `}</style>
    </div>
  );
}
