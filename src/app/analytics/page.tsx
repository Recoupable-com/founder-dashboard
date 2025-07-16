'use client';
import React, { useState, useEffect } from 'react';

// Placeholder metric definitions
const metricsBase = [
  { key: 'activeUsers', label: 'Active Users', value: '---' },
  { key: 'newUsers', label: 'New Users', value: '---' },
  { key: 'returningUsers', label: 'Returning Users', value: '---' },
  { key: 'retentionRate', label: 'Retention Rate', value: '---' },
  { key: 'avgActions', label: 'Avg Actions/User', value: '---' },
  { key: 'custom', label: '[Add Metric]', value: '---' },
];

// Time range options
const timeRanges = [
  { key: '24h', label: 'Last 24 Hours' },
  { key: '7d', label: 'Last 7 Days' },
  { key: '30d', label: 'Last 30 Days' },
  { key: '3m', label: 'Last 3 Months' },
  { key: '12m', label: 'Last 12 Months' },
];

// Helper to get start/end dates from selected range
function getDateRange(rangeKey: string) {
  const now = new Date();
  let start;
  switch (rangeKey) {
    case '24h':
      start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case '7d':
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '3m':
      start = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
      break;
    case '12m':
      start = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      break;
    default:
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
  return {
    start: start.toISOString(),
    end: now.toISOString(),
  };
}

export default function AnalyticsPage() {
  // State for which metric is selected
  const [selectedMetric, setSelectedMetric] = useState('activeUsers');
  // State for selected time range
  const [selectedRange, setSelectedRange] = useState('12m');
  // State for dropdown open/close
  const [dropdownOpen, setDropdownOpen] = useState(false);
  // State for metrics (only Active Users is dynamic for now)
  const [metrics, setMetrics] = useState(metricsBase);
  // State for loading active users
  const [loadingActiveUsers, setLoadingActiveUsers] = useState(false);

  // Placeholder for chart data (would be dynamic in real app)
  const getChartLabel = (key: string) => {
    const found = metrics.find(m => m.key === key);
    return found ? found.label : '';
  };

  const selectedRangeLabel = timeRanges.find(r => r.key === selectedRange)?.label || '';

  // Fetch active users when time range changes
  useEffect(() => {
    async function fetchActiveUsers() {
      setLoadingActiveUsers(true);
      const { start, end } = getDateRange(selectedRange);
      try {
        console.log('Fetching active users for range:', selectedRange, 'from', start, 'to', end);
        // Use our new dedicated analytics API endpoint
        const res = await fetch(`/api/analytics/active-users?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
        
        if (!res.ok) {
          throw new Error(`API responded with status: ${res.status}`);
        }
        
        const data = await res.json();
        console.log('Active users response:', data);
        
        // The API returns { activeUsers: number }
        const activeUsers = typeof data.activeUsers === 'number' ? data.activeUsers : '---';
        setMetrics(prev => prev.map(m => m.key === 'activeUsers' ? { ...m, value: activeUsers } : m));
      } catch (error) {
        console.error('Error fetching active users:', error);
        setMetrics(prev => prev.map(m => m.key === 'activeUsers' ? { ...m, value: 'Error' } : m));
      } finally {
        setLoadingActiveUsers(false);
      }
    }
    fetchActiveUsers();
  }, [selectedRange]);

  return (
    <div className="max-w-7xl mx-auto py-12 px-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
        <h1 className="text-4xl font-bold mb-4 sm:mb-0">Analytics Dashboard</h1>
        {/* Time Range Dropdown */}
        <div className="relative inline-block text-left">
          <button
            type="button"
            className="bg-gray-100 px-4 py-2 rounded-lg text-gray-700 font-medium shadow-sm flex items-center min-w-[160px]"
            onClick={() => setDropdownOpen((open) => !open)}
          >
            {selectedRangeLabel}
            <svg className="ml-2 h-4 w-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {dropdownOpen && (
            <ul
              className="absolute z-10 mt-2 w-full bg-white border border-gray-200 rounded-lg shadow-lg"
            >
              {timeRanges.map((range) => (
                <li
                  key={range.key}
                  className={`px-4 py-2 cursor-pointer hover:bg-gray-100 ${selectedRange === range.key ? 'bg-gray-100 font-semibold' : ''}`}
                  onClick={() => {
                    setSelectedRange(range.key);
                    setDropdownOpen(false);
                  }}
                >
                  {range.label}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Summary Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-10">
        {metrics.map(metric => (
          <button
            key={metric.key}
            onClick={() => setSelectedMetric(metric.key)}
            className={`bg-white rounded-xl shadow p-6 flex flex-col items-center transition-all border-2
              ${selectedMetric === metric.key ? 'border-blue-500 ring-2 ring-blue-200' : 'border-transparent'}
              hover:border-blue-300 focus:outline-none`}
          >
            <span className="text-lg font-semibold text-gray-700 mb-2">{metric.label}</span>
            <span className="text-3xl font-bold text-gray-900">
              {metric.key === 'activeUsers' && loadingActiveUsers ? (
                <svg className="animate-spin h-6 w-6 text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
              ) : metric.value}
            </span>
          </button>
        ))}
      </div>

      {/* Trends Chart Area (Placeholder) */}
      <div className="bg-white rounded-xl shadow p-8 mb-10 h-64 flex flex-col items-center justify-center">
        {/* Chart will go here */}
        <span className="text-gray-700 text-xl font-semibold mb-2">
          {getChartLabel(selectedMetric)} Over Time
        </span>
        <span className="text-gray-400 text-lg">[Trends Chart Placeholder]</span>
      </div>

      {/* Breakdown Panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Leaderboard Panel */}
        <div className="bg-white rounded-xl shadow p-6 min-h-[250px]">
          <span className="text-lg font-bold text-gray-700 mb-4 block">Leaderboard</span>
          <div className="text-gray-400 text-center mt-8">[Leaderboard Placeholder]</div>
        </div>
        {/* Rooms Panel */}
        <div className="bg-white rounded-xl shadow p-6 min-h-[250px]">
          <span className="text-lg font-bold text-gray-700 mb-4 block">Rooms</span>
          <div className="text-gray-400 text-center mt-8">[Rooms Placeholder]</div>
        </div>
      </div>
    </div>
  );
} 