import React from 'react';

// ==================== 智能数据库查询（sql_agent） ====================
// 该模块复用此前的 sql_agent 工作台界面（包含 SQL 面板）。
import SqlAgentWorkbenchPage from '@/pages/sql-agent/workbench';

const DbQueryPage: React.FC = () => {
  return <SqlAgentWorkbenchPage />;
};

export default DbQueryPage;
