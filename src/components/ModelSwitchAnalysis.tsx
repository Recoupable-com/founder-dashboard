'use client';

import React, { useState, useEffect } from 'react';
import ScheduledActionsTable from './ScheduledActionsTable';
import { AlertTriangle, CheckCircle, Clock, Users, Mail, Activity, TrendingDown, TrendingUp, Minus } from 'lucide-react';

interface ModelSwitchData {
  analysisePeriod: {
    start: string;
    end: string;
    switchDate: string;
  };
  summary: {
    totalMemories: number;
    preSwitch: number;
    postSwitch: number;
    scheduledActionsTableExists: boolean;
    totalScheduledActions: number;
  };
  patterns: {
    continuationPromptsFound: number;
    scheduledActionsFound: number;
    completeActionsFound: number;
    incompleteActionsFound: number;
    suspiciousMemoriesFound: number;
  };
  examples: {
    completeActions: Array<{
      id: string;
      account_id: string;
      updated_at: string;
      excerpt: string;
      hasEmailSent: boolean;
    }>;
    incompleteActions: Array<{
      id: string;
      account_id: string;
      updated_at: string;
      excerpt: string;
      reason: string;
    }>;
    continuationPrompts: Array<{
      id: string;
      account_id: string;
      updated_at: string;
      excerpt: string;
    }>;
  };
  userImpact: Array<{
    account_id: string;
    preSwitch: number;
    postSwitch: number;
    change: number;
    percentChange: number;
    significantDrop: boolean;
  }>;
}

const ModelSwitchAnalysis: React.FC = () => {
  const [data, setData] = useState<ModelSwitchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAnalysisData();
  }, []);

  const fetchAnalysisData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/model-switch-impact-analysis');
      if (!response.ok) {
        throw new Error('Failed to fetch analysis data');
      }
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getCompletionRate = (data: ModelSwitchData) => {
    if (data.patterns.scheduledActionsFound === 0) return 0;
    return Math.round((data.patterns.completeActionsFound / data.patterns.scheduledActionsFound) * 100);
  };

  const getStatusColor = (rate: number) => {
    if (rate >= 95) return 'text-green-600 bg-green-50';
    if (rate >= 80) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const getChangeIcon = (change: number) => {
    if (change > 0) return <TrendingUp className="w-4 h-4" />;
    if (change < 0) return <TrendingDown className="w-4 h-4" />;
    return <Minus className="w-4 h-4" />;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-md p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl shadow-md p-6">
        <div className="flex items-center space-x-3 text-red-600">
          <AlertTriangle className="w-6 h-6" />
          <div>
            <h3 className="font-semibold">Analysis Error</h3>
            <p className="text-sm text-gray-600">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const completionRate = getCompletionRate(data);
  const isPostSwitch = data.summary.postSwitch > 0;
  const switchDate = new Date(data.analysisePeriod.switchDate);
  const isFutureSwitch = switchDate > new Date();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Model Switch Impact Analysis</h2>
            <p className="text-sm text-gray-600 mt-1">
              Monitoring scheduled action completion patterns
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-500">Analysis Period</div>
            <div className="text-sm font-medium">
              {formatDate(data.analysisePeriod.start)} - {formatDate(data.analysisePeriod.end)}
            </div>
          </div>
        </div>

        {/* Switch Status */}
        <div className={`flex items-center space-x-3 p-4 rounded-lg ${
          isFutureSwitch ? 'bg-blue-50 border border-blue-200' : 
          isPostSwitch ? 'bg-orange-50 border border-orange-200' : 
          'bg-green-50 border border-green-200'
        }`}>
          <Clock className={`w-5 h-5 ${
            isFutureSwitch ? 'text-blue-600' : 
            isPostSwitch ? 'text-orange-600' : 
            'text-green-600'
          }`} />
          <div>
            <div className="font-medium">
              {isFutureSwitch ? 'Pre-Switch Monitoring' : 
               isPostSwitch ? 'Post-Switch Analysis' : 
               'Baseline Established'}
            </div>
            <div className="text-sm text-gray-600">
              {isFutureSwitch ? 
                `Switch scheduled for ${formatDate(data.analysisePeriod.switchDate)} (Claude → Gemini)` :
                isPostSwitch ?
                `Switched on ${formatDate(data.analysisePeriod.switchDate)} - Monitoring impact` :
                'Currently using Claude - Ready for switch monitoring'
              }
            </div>
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-gray-500">Completion Rate</div>
              <div className={`text-2xl font-bold ${getStatusColor(completionRate).split(' ')[0]}`}>
                {completionRate}%
              </div>
            </div>
            <div className={`p-3 rounded-lg ${getStatusColor(completionRate)}`}>
              <CheckCircle className="w-6 h-6" />
            </div>
          </div>
          <div className="text-xs text-gray-500 mt-2">
            {data.patterns.completeActionsFound} of {data.patterns.scheduledActionsFound} actions
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-gray-500">Scheduled Actions</div>
              <div className="text-2xl font-bold text-gray-900">
                {data.patterns.scheduledActionsFound}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-blue-50 text-blue-600">
              <Activity className="w-6 h-6" />
            </div>
          </div>
          <div className="text-xs text-green-600 mt-2">
            {data.summary.totalScheduledActions} total in database
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-gray-500">Continuation Prompts</div>
              <div className="text-2xl font-bold text-gray-900">
                {data.patterns.continuationPromptsFound}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-yellow-50 text-yellow-600">
              <AlertTriangle className="w-6 h-6" />
            </div>
          </div>
          <div className="text-xs text-gray-500 mt-2">
            Model interruption instances
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-gray-500">Email Delivery</div>
              <div className="text-2xl font-bold text-green-600">
                {data.patterns.completeActionsFound}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-green-50 text-green-600">
              <Mail className="w-6 h-6" />
            </div>
          </div>
          <div className="text-xs text-green-600 mt-2">
            Successful deliveries
          </div>
        </div>
      </div>

      {/* Pattern Analysis */}
      <div className="bg-white rounded-2xl shadow-md p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Pattern Analysis</h3>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Detection Framework */}
          <div>
            <h4 className="font-medium text-gray-700 mb-3">Detection Framework</h4>
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <span className="text-sm">Continuation Patterns</span>
                <span className="text-sm font-medium">7 patterns monitored</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <span className="text-sm">Scheduled Action Indicators</span>
                <span className="text-sm font-medium">8 keywords tracked</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <span className="text-sm">Email Completion Signals</span>
                <span className="text-sm font-medium">5 success patterns</span>
              </div>
            </div>
          </div>

          {/* Current Status */}
          <div>
            <h4 className="font-medium text-gray-700 mb-3">Current Status</h4>
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                <span className="text-sm">Complete Actions</span>
                <span className="text-sm font-medium text-green-600">
                  {data.patterns.completeActionsFound}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                <span className="text-sm">Incomplete Actions</span>
                <span className="text-sm font-medium text-red-600">
                  {data.patterns.incompleteActionsFound}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-yellow-50 rounded-lg">
                <span className="text-sm">Suspicious Memories</span>
                <span className="text-sm font-medium text-yellow-600">
                  {data.patterns.suspiciousMemoriesFound}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Examples */}
      {(data.examples.completeActions.length > 0 || data.examples.incompleteActions.length > 0) && (
        <div className="bg-white rounded-2xl shadow-md p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Action Examples</h3>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Complete Actions */}
            {data.examples.completeActions.length > 0 && (
              <div>
                <h4 className="font-medium text-green-700 mb-3 flex items-center">
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Complete Actions ({data.examples.completeActions.length})
                </h4>
                <div className="space-y-3">
                  {data.examples.completeActions.slice(0, 3).map((action) => (
                    <div key={action.id} className="p-3 bg-green-50 rounded-lg border border-green-200">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs text-green-600 font-medium">
                          {formatDate(action.updated_at)}
                        </span>
                        <span className="text-xs bg-green-200 text-green-800 px-2 py-1 rounded">
                          Email Sent ✓
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 line-clamp-2">
                        {action.excerpt.length > 100 ? action.excerpt.substring(0, 100) + '...' : action.excerpt}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Incomplete Actions */}
            {data.examples.incompleteActions.length > 0 && (
              <div>
                <h4 className="font-medium text-red-700 mb-3 flex items-center">
                  <AlertTriangle className="w-4 h-4 mr-2" />
                  Incomplete Actions ({data.examples.incompleteActions.length})
                </h4>
                <div className="space-y-3">
                  {data.examples.incompleteActions.slice(0, 3).map((action) => (
                    <div key={action.id} className="p-3 bg-red-50 rounded-lg border border-red-200">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs text-red-600 font-medium">
                          {formatDate(action.updated_at)}
                        </span>
                        <span className="text-xs bg-red-200 text-red-800 px-2 py-1 rounded">
                          Failed
                        </span>
                      </div>
                      <p className="text-xs text-red-700 mb-1 font-medium">{action.reason}</p>
                      <p className="text-xs text-gray-600 line-clamp-2">
                        {action.excerpt.length > 100 ? action.excerpt.substring(0, 100) + '...' : action.excerpt}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* User Impact (if any significant drops) */}
      {data.userImpact.some(user => user.significantDrop) && (
        <div className="bg-white rounded-2xl shadow-md p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Users className="w-5 h-5 mr-2" />
            User Impact Analysis
          </h3>
          
          <div className="space-y-3">
              {data.userImpact.filter(user => user.significantDrop).slice(0, 5).map((user) => (
              <div key={user.account_id} className="flex justify-between items-center p-3 bg-red-50 rounded-lg border border-red-200">
                <div>
                  <span className="text-sm font-medium text-gray-900">
                    User {user.account_id.substring(0, 8)}...
                  </span>
                  <div className="text-xs text-gray-500">
                    {user.preSwitch} → {user.postSwitch} actions
                  </div>
                </div>
                <div className="flex items-center text-red-600">
                  {getChangeIcon(user.change)}
                  <span className="text-sm font-medium ml-1">
                    {user.percentChange.toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Refresh Button */}
      <div className="flex justify-center">
        <button
          onClick={fetchAnalysisData}
          disabled={loading}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Refreshing...' : 'Refresh Analysis'}
        </button>
      </div>

      {/* Scheduled Actions Table */}
      <div className="mt-8">
        <ScheduledActionsTable />
      </div>
    </div>
  );
};

export default ModelSwitchAnalysis;