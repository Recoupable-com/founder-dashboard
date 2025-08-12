'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';

interface ChurnedPMFUser {
  email: string;
  totalSessions: number;
  roomCount: number;
  activeDays: number;
  reportCount: number;
  lastActivityDate: string;
  lastMessageDate: string | null;
  lastReportDate: string | null;
  reasonForChurn: 'no_recent_activity' | 'insufficient_sessions';
  daysSinceLastActivity: number;
}

interface PMFChurnData {
  summary: {
    previousPeriodPMF: number;
    currentPeriodPMF: number;
    churnedUsers: number;
    churnRate: number;
  };
  churnedUsers: ChurnedPMFUser[];
  periodInfo: {
    currentPeriodStart: string;
    currentPeriodEnd: string;
    previousPeriodStart: string;
    previousPeriodEnd: string;
  };
}

export default function PMFChurnAnalysis() {
  const [data, setData] = useState<PMFChurnData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'activity' | 'sessions' | 'email'>('activity');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/pmf-churn-users?excludeTest=true');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status}`);
      }
      
      const result = await response.json();
      setData(result);
    } catch (err) {
      console.error('Error fetching PMF churn data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    if (dateString === 'Unknown') return 'Unknown';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'Invalid date';
    }
  };

  const getDaysSinceText = (days: number) => {
    if (days === 999) return 'Unknown';
    if (days === 0) return 'Today';
    if (days === 1) return '1 day ago';
    return `${days} days ago`;
  };

  const getChurnReasonBadge = (reason: string) => {
    const badges = {
      'no_recent_activity': (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-orange-100 text-orange-800">
          📴 Inactive
        </span>
      ),
      'insufficient_sessions': (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-red-100 text-red-800">
          📉 Low Usage
        </span>
      )
    };
    return badges[reason as keyof typeof badges] || reason;
  };

  const sortedUsers = data?.churnedUsers.slice().sort((a, b) => {
    switch (sortBy) {
      case 'activity':
        return a.daysSinceLastActivity - b.daysSinceLastActivity;
      case 'sessions':
        return b.totalSessions - a.totalSessions;
      case 'email':
        return a.email.localeCompare(b.email);
      default:
        return 0;
    }
  });

  const displayedUsers = showAll ? sortedUsers : sortedUsers?.slice(0, 10);

  if (loading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-6"></div>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 rounded"></div>
            ))}
          </div>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-6">
        <div className="text-red-600">
          <h3 className="font-semibold mb-2">Error Loading PMF Churn Data</h3>
          <p className="text-sm">{error}</p>
          <button 
            onClick={fetchData}
            className="mt-3 px-4 py-2 bg-red-50 text-red-700 rounded hover:bg-red-100"
          >
            Retry
          </button>
        </div>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <Card className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">PMF User Churn Analysis</h3>
          <p className="text-sm text-gray-600">Users who were PMF-ready but are no longer</p>
        </div>
        <button
          onClick={fetchData}
          className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded transition-colors"
        >
          🔄 Refresh
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-red-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-red-600">{data.summary.churnedUsers}</div>
          <div className="text-sm text-red-800">Churned Users</div>
        </div>
        <div className="bg-red-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-red-600">{data.summary.churnRate}%</div>
          <div className="text-sm text-red-800">Churn Rate</div>
        </div>
        <div className="bg-blue-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-blue-600">{data.summary.previousPeriodPMF}</div>
          <div className="text-sm text-blue-800">Previous Period</div>
        </div>
        <div className="bg-green-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-green-600">{data.summary.currentPeriodPMF}</div>
          <div className="text-sm text-green-800">Current Period</div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Sort by:</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'activity' | 'sessions' | 'email')}
            className="px-3 py-1 border border-gray-300 rounded text-sm"
            title="Sort churned PMF users by"
          >
            <option value="activity">Days Since Activity</option>
            <option value="sessions">Total Sessions</option>
            <option value="email">Email</option>
          </select>
        </div>
        
        {data.churnedUsers.length > 10 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded transition-colors"
          >
            {showAll ? 'Show Less' : `Show All ${data.churnedUsers.length}`}
          </button>
        )}
      </div>

      {/* Churned Users List */}
      <div className="space-y-3">
        {displayedUsers?.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <div className="text-4xl mb-2">🎉</div>
            <div className="font-medium">No PMF churn detected!</div>
            <div className="text-sm">All PMF users remained active</div>
          </div>
        ) : (
          displayedUsers?.map((user) => (
            <div
              key={user.email}
              className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <span className="font-medium text-gray-900">{user.email}</span>
                  {getChurnReasonBadge(user.reasonForChurn)}
                </div>
                <div className="text-sm text-gray-600">
                  {user.totalSessions} sessions • {user.roomCount} rooms • {user.activeDays} active days
                  {user.reportCount > 0 && ` • ${user.reportCount} reports`}
                </div>
              </div>
              
              <div className="text-right">
                <div className="text-sm font-medium text-gray-900">
                  {getDaysSinceText(user.daysSinceLastActivity)}
                </div>
                <div className="text-xs text-gray-500">
                  {formatDate(user.lastActivityDate)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Period Info */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <div className="text-xs text-gray-500">
          <div>Previous Period: {formatDate(data.periodInfo.previousPeriodStart)} - {formatDate(data.periodInfo.previousPeriodEnd)}</div>
          <div>Current Period: {formatDate(data.periodInfo.currentPeriodStart)} - {formatDate(data.periodInfo.currentPeriodEnd)}</div>
        </div>
      </div>
    </Card>
  );
}