'use client';

import React, { useState, useEffect } from 'react';
import CustomTooltip from './CustomTooltip';

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
}

interface PMFSurveyReadyCardProps {
  value: number;
  percentChange?: number;
  changeDirection?: 'up' | 'down' | 'neutral';
  onClick?: () => void;
  isSelected?: boolean;
  className?: string;
  timeFilter?: string;
}

export default function PMFSurveyReadyCard({
  value,
  percentChange,
  changeDirection = 'neutral',
  onClick,
  isSelected = false,
  className,
  timeFilter = 'Last 7 Days'
}: PMFSurveyReadyCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [churnData, setChurnData] = useState<PMFChurnData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch churn data when expanded
  useEffect(() => {
    if (isExpanded && !churnData) {
      fetchChurnData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpanded]);

  const fetchChurnData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/pmf-churn-users?excludeTest=true');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch churn data: ${response.status}`);
      }
      
      const result = await response.json();
      setChurnData(result);
    } catch (err) {
      console.error('Error fetching PMF churn data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch churn data');
    } finally {
      setLoading(false);
    }
  };

  // Helper function to format date ranges for clarity
  const getDateRanges = () => {
    const now = new Date();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const twentyEightDaysAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);

    const formatDate = (date: Date) => date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });

    return {
      currentPeriod: `${formatDate(fourteenDaysAgo)} - ${formatDate(now)}`,
      previousPeriod: `${formatDate(twentyEightDaysAgo)} - ${formatDate(fourteenDaysAgo)}`,
      churnPeriod: `${formatDate(twentyEightDaysAgo)} - ${formatDate(fourteenDaysAgo)}`
    };
  };

  const handleCardClick = () => {
    // Toggle expansion
    setIsExpanded(!isExpanded);
    // Also call the original onClick if provided
    if (onClick) {
      onClick();
    }
  };

  const getBadgeStyles = () => {
    switch (changeDirection) {
      case 'up':
        return 'bg-green-50 text-green-700 border border-green-200';
      case 'down':
        return 'bg-red-50 text-red-700 border border-red-200';
      default:
        return 'bg-gray-50 text-gray-600 border border-gray-200';
    }
  };

  const getChangeSymbolAndPrefix = () => {
    switch (changeDirection) {
      case 'up':
        return { symbol: '▲', prefix: '+' };
      case 'down':
        return { symbol: '▼', prefix: '' };
      default:
        return { symbol: '', prefix: '' };
    }
  };

  const getCardClasses = () => {
    let baseClasses = 'bg-white rounded-2xl shadow-md p-6 text-left transition-all hover:shadow-lg cursor-pointer';
    
    if (isSelected) {
      baseClasses += ' ring-2 ring-blue-500 border-2 border-blue-500';
    } else {
      baseClasses += ' hover:ring-1 hover:ring-blue-300';
    }
    
    return `${baseClasses} ${className || ''}`;
  };

  const formatDate = (dateString: string) => {
    if (dateString === 'Unknown') return 'Unknown';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  const icon = (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );

  const cardContent = (
    <div className={getCardClasses()} onClick={handleCardClick}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-sm font-medium text-gray-500">PMF Survey Ready</h3>
          <p className="text-xs text-gray-400 mt-1">{getDateRanges().currentPeriod}</p>
        </div>
        <div className="flex items-center gap-2 ml-2">
          {/* Icon */}
          <div className="text-blue-600 flex-shrink-0">{icon}</div>
          {/* Expand/Collapse indicator */}
          <div className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
          {/* Selection indicator */}
          {isSelected && (
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
          )}
        </div>
      </div>
      
      <div className="flex items-center gap-3 mb-1">
        <div className="text-3xl font-bold text-gray-900">{value}</div>
        {/* Percentage Change Badge */}
        {typeof percentChange === 'number' && (
          <div className="flex flex-col items-end">
            <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-semibold min-w-20 text-center ${getBadgeStyles()}`}>
              {getChangeSymbolAndPrefix().symbol && (
                <span className="mr-1 text-xs leading-none">{getChangeSymbolAndPrefix().symbol}</span>
              )}
              {getChangeSymbolAndPrefix().prefix}{Math.abs(percentChange)}%
            </span>
            <span className="text-xs text-gray-400 mt-1">vs {getDateRanges().previousPeriod}</span>
          </div>
        )}
      </div>
      
      {/* Churn summary when expanded */}
      {isExpanded && churnData && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <div className="text-sm text-gray-600 mb-2">
            <span className="font-medium text-red-600">{churnData.summary.churnedUsers} users churned</span>
            {' '}({churnData.summary.churnRate}% churn rate)
          </div>
          <div className="text-xs text-gray-500">
            Since {getDateRanges().churnPeriod} → {getDateRanges().currentPeriod.split(' - ')[0]}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="relative">
      {/* Tooltip */}
      <CustomTooltip
        text={`Users with 2+ sessions and recent activity (${getDateRanges().currentPeriod}). Ready for product-market fit surveys. Click to filter leaderboard and see churn details.`}
      >
        {cardContent}
      </CustomTooltip>

      {/* Dropdown Content */}
      {isExpanded && (
        <div className="absolute top-full left-0 right-0 z-10 mt-2 bg-white rounded-xl shadow-lg border border-gray-200 p-4 max-h-96 overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium text-gray-900">PMF User Churn Details</h4>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(false);
              }}
              className="text-gray-400 hover:text-gray-600"
              title="Close churn details"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              <span className="ml-2 text-sm text-gray-600">Loading churn data...</span>
            </div>
          )}

          {error && (
            <div className="text-red-600 text-sm py-4">
              <p>Error: {error}</p>
              <button
                onClick={fetchChurnData}
                className="mt-2 px-3 py-1 bg-red-50 text-red-700 rounded hover:bg-red-100"
              >
                Retry
              </button>
            </div>
          )}

          {churnData && !loading && (
            <div className="space-y-3">
              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center p-2 bg-red-50 rounded">
                  <div className="text-lg font-bold text-red-600">{churnData.summary.churnedUsers}</div>
                  <div className="text-xs text-red-800">Churned</div>
                </div>
                <div className="text-center p-2 bg-blue-50 rounded">
                  <div className="text-lg font-bold text-blue-600">{churnData.summary.previousPeriodPMF}</div>
                  <div className="text-xs text-blue-800">Previous</div>
                  <div className="text-xs text-blue-600 mt-0.5">{getDateRanges().previousPeriod}</div>
                </div>
                <div className="text-center p-2 bg-green-50 rounded">
                  <div className="text-lg font-bold text-green-600">{churnData.summary.currentPeriodPMF}</div>
                  <div className="text-xs text-green-800">Current</div>
                  <div className="text-xs text-green-600 mt-0.5">{getDateRanges().currentPeriod}</div>
                </div>
              </div>

              {/* Churned Users List */}
              {churnData.churnedUsers.length === 0 ? (
                <div className="text-center py-4 text-gray-500">
                  <div className="text-2xl mb-1">🎉</div>
                  <div className="text-sm">No PMF churn detected!</div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-gray-700 mb-2">Churned Users (last activity):</div>
                  {churnData.churnedUsers.slice(0, 5).map((user) => (
                    <div
                      key={user.email}
                      className="flex items-center justify-between p-2 bg-gray-50 rounded text-xs"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 truncate">{user.email}</div>
                        <div className="text-gray-600">
                          {user.totalSessions} sessions • {user.roomCount} rooms
                        </div>
                      </div>
                      <div className="text-right ml-2">
                        <div className="text-gray-900">{getDaysSinceText(user.daysSinceLastActivity)}</div>
                        <div className="text-gray-500">{formatDate(user.lastActivityDate)}</div>
                      </div>
                    </div>
                  ))}
                  
                  {churnData.churnedUsers.length > 5 && (
                    <div className="text-center py-2">
                      <span className="text-xs text-gray-500">
                        +{churnData.churnedUsers.length - 5} more churned users
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}