'use client';

import React, { useState, useEffect } from 'react';

interface ScheduledAction {
  id: string;
  title: string;
  prompt: string;
  schedule: string;
  account_id: string;
  artist_account_id: string;
  enabled: boolean;
  last_run: string;
  next_run: string;
  created_at: string;
  updated_at: string;
  user_email: string | null;
  artist_name: string | null;
}

interface ScheduledActionsData {
  scheduledActions: ScheduledAction[];
  summary: {
    totalScheduledActions: number;
    actionsInPeriod: number;
  };
}

export default function ScheduledActionsTable() {
  const [data, setData] = useState<ScheduledActionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedPrompts, setExpandedPrompts] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/model-switch-impact-analysis');
      if (!response.ok) throw new Error('Failed to fetch data');
      
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const togglePrompt = (actionId: string) => {
    const newExpanded = new Set(expandedPrompts);
    if (newExpanded.has(actionId)) {
      newExpanded.delete(actionId);
    } else {
      newExpanded.add(actionId);
    }
    setExpandedPrompts(newExpanded);
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  const formatSchedule = (schedule: string) => {
    // Basic cron format interpretation
    const parts = schedule.split(' ');
    if (parts.length >= 5) {
      const [minute, hour, day, month, weekday] = parts;
      if (weekday !== '*') {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return `${days[parseInt(weekday)]} at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
      }
      return `Daily at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
    }
    return schedule;
  };

  const truncatePrompt = (prompt: string, maxLength: number = 150) => {
    if (prompt.length <= maxLength) return prompt;
    return prompt.substring(0, maxLength) + '...';
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center">
          <div className="text-gray-600">Loading scheduled actions...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-medium">Error</h3>
          <p className="text-red-600">{error}</p>
          <button 
            onClick={fetchData}
            className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Scheduled Actions</h2>
        <div className="mt-2 flex gap-4 text-sm text-gray-600">
          <span>Total Actions: <strong>{data.summary.totalScheduledActions}</strong></span>
          <span>Recent Runs: <strong>{data.summary.actionsInPeriod}</strong></span>
        </div>
      </div>

      <div className="bg-white shadow-lg rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Title
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Artist
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Schedule
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Run
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Prompt
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.scheduledActions.map((action) => (
                <tr key={action.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {action.title || 'Untitled'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {action.user_email || 'No email'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {action.artist_name || 'Unknown'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {formatSchedule(action.schedule)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {formatDate(action.last_run)}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">
                      {expandedPrompts.has(action.id) ? (
                        <div>
                          <div className="whitespace-pre-wrap break-words max-w-md">
                            {action.prompt}
                          </div>
                          <button
                            onClick={() => togglePrompt(action.id)}
                            className="mt-2 text-blue-600 hover:text-blue-800 text-xs font-medium"
                          >
                            Show Less
                          </button>
                        </div>
                      ) : (
                        <div>
                          <div className="max-w-md">
                            {truncatePrompt(action.prompt)}
                          </div>
                          {action.prompt.length > 150 && (
                            <button
                              onClick={() => togglePrompt(action.id)}
                              className="mt-1 text-blue-600 hover:text-blue-800 text-xs font-medium"
                            >
                              Show More
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      action.enabled 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {action.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 text-sm text-gray-500">
        Last updated: {new Date().toLocaleString()}
      </div>
    </div>
  );
}