import React from 'react';
import { Outlet } from 'react-router-dom';
import TopBar from './TopBar';

export default function AppShell() {
  return (
    <div className="app-shell">
      <TopBar />
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
