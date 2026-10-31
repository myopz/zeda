import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { LogicGateDetailPage } from '@/features/logic-gates/pages/LogicGateDetailPage'
import { LogicGateListPage } from '@/features/logic-gates/pages/LogicGateListPage'

export function AppRouter() {
  return (
    <BrowserRouter basename="/zeda">
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/lgc" replace />} />
          <Route path="lgc" element={<LogicGateListPage />} />
          <Route path="lgc/:id" element={<LogicGateDetailPage />} />
          <Route path="*" element={<Navigate to="/lgc" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
