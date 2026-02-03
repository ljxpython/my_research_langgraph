import React from 'react';

// ==================== AI 查询（sql_agent） ====================
// 复用现有 sql_agent 工作台界面：支持 threadId 深链、snapshot 恢复、继续对话。
import SqlAgentWorkbenchPage from '@/pages/sql-agent/workbench';

const DbQueryAiPage: React.FC = () => {
  return <SqlAgentWorkbenchPage />;
};

export default DbQueryAiPage;
