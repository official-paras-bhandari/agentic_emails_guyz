"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <Link href="/" className="logo-link">
        <div className="logo-container">
          <span className="logo-icon">🚀</span>
          <span className="logo-text">AI Outreach</span>
        </div>
      </Link>
      
      <nav className="nav-group">
        <div className="nav-label">Main</div>
        <Link href="/" className={`nav-item ${pathname === '/' ? 'active' : ''}`}>
          <span className="icon">💬</span> Chat
        </Link>
        <Link href="/leads" className={`nav-item ${pathname === '/leads' ? 'active' : ''}`}>
          <span className="icon">👥</span> Leads
        </Link>
        <Link href="/campaigns" className={`nav-item ${pathname === '/campaigns' ? 'active' : ''}`}>
          <span className="icon">📈</span> Campaigns
        </Link>
      </nav>

      <div className="history-group">
        <div className="nav-label">Recent Chats</div>
        <div className="history-item">Sydney Salon Outreach</div>
        <div className="history-item">Real Estate Agents...</div>
        <div className="history-item">Tech Startups SEO</div>
      </div>

      <div className="sidebar-footer">
        <Link href="/settings" className={`nav-item settings ${pathname === '/settings' ? 'active' : ''}`}>
          <span className="icon">⚙️</span> Settings
        </Link>
      </div>

      <style jsx>{`
        .sidebar {
          width: 260px;
          height: 100vh;
          background: #202123;
          color: #fff;
          display: flex;
          flex-direction: column;
          padding: 15px;
          border-right: 1px solid #444;
        }
        .logo-link {
          text-decoration: none;
          color: inherit;
        }
        .logo-container {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px;
          margin-bottom: 30px;
        }
        .logo-icon {
          font-size: 1.5rem;
        }
        .logo-text {
          font-weight: bold;
          font-size: 1.1rem;
        }
        .nav-group, .history-group {
          display: flex;
          flex-direction: column;
          gap: 5px;
          margin-bottom: 25px;
        }
        .nav-label {
          font-size: 0.75rem;
          text-transform: uppercase;
          color: #8e8ea0;
          padding: 10px;
          font-weight: bold;
        }
        :global(.nav-item) {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: transparent;
          border: none;
          color: #ececf1;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.9rem;
          text-align: left;
          transition: background 0.2s;
          text-decoration: none;
        }
        :global(.nav-item:hover) {
          background: #2d2f39;
        }
        :global(.nav-item.active) {
          background: #343541;
        }
        .history-item {
          padding: 10px;
          font-size: 0.85rem;
          color: #ececf1;
          cursor: pointer;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          border-radius: 6px;
        }
        .history-item:hover {
          background: #2d2f39;
        }
        .sidebar-footer {
          margin-top: auto;
          border-top: 1px solid #444;
          padding-top: 10px;
        }
      `}</style>
    </aside>
  );
}
