import React from 'react'
import { ConnectionStatus } from '@/components/ConnectionStatus'
import { getMonthlyFinancials } from '@/lib/finance'
import { FinancialMetricsProvider } from '@/components/dashboard/FinancialMetricsProvider'
import { PipelineProvider } from '@/context/PipelineContext'
import { ResponsivePipelineBoard } from '@/components/responsive/ResponsivePipelineBoard'
import { RevenueDisplayProvider } from '@/context/RevenueDisplayContext'
import { RevenueToggle } from '@/components/dashboard/RevenueToggle'


// Force dynamic rendering to ensure fresh data on each request
export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  // Fetch financial data
  const financials = await getMonthlyFinancials();

  return (
    <main className="p-4 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8">
        <RevenueDisplayProvider>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Dashboard</h1>
            <div className="flex items-center gap-4">
              <RevenueToggle />
              <ConnectionStatus className="w-auto" />
            </div>
          </div>
          
          {/* All Financial Metrics - 3 cards in a row */}
          <FinancialMetricsProvider 
            developmentCost={financials.expenses.development}
            operationalCost={financials.expenses.operational}
          />
        </RevenueDisplayProvider>
        
        {/* Sales Pipeline */}
        <div className="mt-8 bg-white rounded-lg shadow-sm p-4 sm:p-6 border">
          <div className="mb-6">
            <h2 className="text-2xl font-bold">Sales Pipeline</h2>
          </div>
          <PipelineProvider>
            <ResponsivePipelineBoard />
          </PipelineProvider>
        </div>


      </div>
    </main>
  )
} 