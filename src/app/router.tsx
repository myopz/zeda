import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { ComboCircuitDetailPage } from '@/features/combo-circuits/pages/ComboCircuitDetailPage'
import { ComboCircuitListPage } from '@/features/combo-circuits/pages/ComboCircuitListPage'
import { FlipFlopDetailPage } from '@/features/flip-flops/pages/FlipFlopDetailPage'
import { FlipFlopListPage } from '@/features/flip-flops/pages/FlipFlopListPage'
import { LogicGateDetailPage } from '@/features/logic-gates/pages/LogicGateDetailPage'
import { LogicGateListPage } from '@/features/logic-gates/pages/LogicGateListPage'
import { SequentialDetailPage } from '@/features/sequential-circuits/pages/SequentialDetailPage'
import { SequentialListPage } from '@/features/sequential-circuits/pages/SequentialListPage'
import { CpuDetailPage } from '@/features/cpu/pages/CpuDetailPage'
import { CpuListPage } from '@/features/cpu/pages/CpuListPage'

export function AppRouter() {
  return (
    <BrowserRouter basename="/zeda">
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/lgc" replace />} />
          <Route path="lgc" element={<LogicGateListPage />} />
          <Route path="lgc/:id" element={<LogicGateDetailPage />} />
          <Route path="clc" element={<ComboCircuitListPage />} />
          <Route path="clc/:id" element={<ComboCircuitDetailPage />} />
          <Route path="ff" element={<FlipFlopListPage />} />
          <Route path="ff/:id" element={<FlipFlopDetailPage />} />
          <Route path="seq" element={<SequentialListPage />} />
          <Route path="seq/:id" element={<SequentialDetailPage />} />
          <Route path="cpu" element={<CpuListPage />} />
          <Route path="cpu/:id" element={<CpuDetailPage />} />
          <Route path="*" element={<Navigate to="/lgc" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
