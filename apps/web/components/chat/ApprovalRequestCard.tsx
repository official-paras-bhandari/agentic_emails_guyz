import React from 'react';

interface Draft {
  leadEmail: string;
  subject: string;
  snippet: string;
}

interface ApprovalRequestCardProps {
  draftsCount: number;
  sampleDrafts: Draft[];
  onApprove: () => void;
  onReject: () => void;
}

export default function ApprovalRequestCard({ draftsCount, sampleDrafts, onApprove, onReject }: ApprovalRequestCardProps) {
  return (
    <div className="approval-card">
      <div className="header">
        <span className="icon">📝</span>
        <div className="title">Approval Required: {draftsCount} Outreach Drafts</div>
      </div>
      
      <div className="draft-preview">
        <div className="preview-label">Sample Draft:</div>
        {sampleDrafts.map((draft, idx) => (
          <div key={idx} className="draft-item">
            <div className="to">To: {draft.leadEmail}</div>
            <div className="subject">Sub: {draft.subject}</div>
            <div className="snippet">"{draft.snippet}..."</div>
          </div>
        ))}
      </div>

      <div className="actions">
        <button className="approve-btn" onClick={onApprove}>Approve & Send All</button>
        <button className="edit-btn">Review All Drafts</button>
        <button className="reject-btn" onClick={onReject}>Cancel Job</button>
      </div>

      <style jsx>{`
        .approval-card {
          margin-top: 15px;
          background: #fff;
          border: 1px solid #0070f3;
          border-radius: 12px;
          padding: 20px;
          box-shadow: 0 4px 12px rgba(0, 112, 243, 0.1);
          width: 100%;
        }
        .header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 20px;
        }
        .icon { font-size: 1.5rem; }
        .title { font-weight: bold; color: #0070f3; }
        .draft-preview {
          background: #f9f9f9;
          padding: 15px;
          border-radius: 8px;
          margin-bottom: 20px;
        }
        .preview-label {
          font-size: 0.75rem;
          color: #8e8ea0;
          margin-bottom: 10px;
          font-weight: 600;
        }
        .draft-item {
          font-size: 0.85rem;
          color: #333;
        }
        .to { font-weight: 600; }
        .subject { color: #666; font-style: italic; }
        .snippet { margin-top: 5px; color: #444; }
        .actions {
          display: flex;
          gap: 10px;
        }
        button {
          flex: 1;
          padding: 10px;
          border-radius: 6px;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .approve-btn {
          background: #0070f3;
          color: white;
          border: none;
        }
        .edit-btn {
          background: #fff;
          border: 1px solid #ddd;
          color: #666;
        }
        .reject-btn {
          background: #fff;
          border: 1px solid #eee;
          color: #cb2431;
        }
        button:hover { opacity: 0.9; }
      `}</style>
    </div>
  );
}
