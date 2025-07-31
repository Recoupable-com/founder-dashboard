'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import MetricCard from '@/components/MetricCard';

interface TemplateUsageData {
  template_id: string;
  template_title: string;
  template_prompt: string;
  usage_count: number;
  unique_users: number;
  unique_artists: number;
  first_used: string | null;
  last_used: string | null;
  sample_rooms: Array<{
    room_id: string;
    account_id: string;
    artist_id: string;
    created_at: string;
    user_email?: string | null;
    artist_name?: string | null;
  }>;
}

interface UsageSummary {
  total_templates: number;
  total_usage: number;
  unique_users: number;
  unique_artists: number;
  time_range: string;
  analyzed_rooms: number;
  analyzed_messages: number;
}

interface AgentTemplateResponse {
  templates: TemplateUsageData[];
  summary: UsageSummary;
}

export default function AgentTemplatesPage() {
  const [data, setData] = useState<AgentTemplateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState('Last 30 Days');
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  const toggleCardExpansion = (templateId: string) => {
    const newExpanded = new Set(expandedCards);
    if (newExpanded.has(templateId)) {
      newExpanded.delete(templateId);
    } else {
      newExpanded.add(templateId);
    }
    setExpandedCards(newExpanded);
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      console.log('🔍 Fetching agent template usage data...');
      const response = await fetch(`/api/agent-template-usage?timeFilter=${encodeURIComponent(timeFilter)}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('✅ Received agent template data:', result);
      setData(result);
    } catch (err) {
      console.error('❌ Error fetching agent template data:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [timeFilter]);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString();
  };

  const truncatePrompt = (prompt: string, maxLength: number = 100) => {
    if (prompt.length <= maxLength) return prompt;
    return prompt.substring(0, maxLength) + '...';
  };

  if (loading) {
    return (
      <div className="p-4 sm:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Agent Template Analytics</h1>
            <p className="text-gray-600">Track how users are using agent templates</p>
          </div>
          
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-4 text-gray-600">Analyzing template usage...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 sm:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Agent Template Analytics</h1>
            <p className="text-gray-600">Track how users are using agent templates</p>
          </div>
          
          <Card className="p-6">
            <div className="text-center text-red-600">
              <p className="text-lg font-semibold mb-2">Error Loading Data</p>
              <p className="text-sm">{error}</p>
              <button 
                onClick={fetchData}
                className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Try Again
              </button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 sm:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Agent Template Analytics</h1>
            <p className="text-gray-600">Track how users are using agent templates</p>
          </div>
          
          <Card className="p-6">
            <p className="text-center text-gray-600">No data available</p>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Agent Template Analytics</h1>
          <p className="text-gray-600">Track how users are using agent templates</p>
        </div>

        {/* Time Filter */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Time Period</label>
          <select
            value={timeFilter}
            onChange={(e) => setTimeFilter(e.target.value)}
            title="Select time period for analysis"
            className="border border-gray-300 rounded-md px-3 py-2 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="Last 24 Hours">Last 24 Hours</option>
            <option value="Last 7 Days">Last 7 Days</option>
            <option value="Last 30 Days">Last 30 Days</option>
            <option value="Last 90 Days">Last 90 Days</option>
          </select>
        </div>

        {/* Summary Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <MetricCard
            title="Total Template Usage"
            value={data.summary.total_usage.toString()}
            description={`Across ${data.summary.analyzed_rooms} rooms`}
          />
          <MetricCard
            title="Active Templates"
            value={data.templates.filter(t => t.usage_count > 0).length.toString()}
            description={`of ${data.summary.total_templates} total`}
          />
          <MetricCard
            title="Unique Users"
            value={data.summary.unique_users.toString()}
            description="Using templates"
          />
          <MetricCard
            title="Unique Artists"
            value={data.summary.unique_artists.toString()}
            description="Template interactions"
          />
        </div>

        {/* Template Usage Table */}
        <Card className="overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Template Usage Details</h2>
            <p className="text-sm text-gray-600">Sorted by popularity (most used first)</p>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Template
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Usage Count
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Unique Users
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Unique Artists
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    First Used
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Used
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.templates.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                      No templates found for the selected time period
                    </td>
                  </tr>
                ) : (
                  data.templates.map((template) => {
                    const isExpanded = expandedCards.has(template.template_id);
                    return (
                      <React.Fragment key={template.template_id}>
                        <tr 
                          className="hover:bg-gray-50 cursor-pointer transition-colors"
                          onClick={() => toggleCardExpansion(template.template_id)}
                        >
                          <td className="px-6 py-4">
                            <div className="max-w-xs">
                              <div className="flex items-center gap-2">
                                <div className="text-sm font-medium text-gray-900">
                                  {template.template_title}
                                </div>
                                <div className="text-gray-400">
                                  {isExpanded ? '▼' : '▶'}
                                </div>
                              </div>
                              <div className="text-xs text-gray-500 mt-1" title={template.template_prompt}>
                                {truncatePrompt(template.template_prompt)}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              template.usage_count > 0 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {template.usage_count}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {template.unique_users}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {template.unique_artists}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {formatDate(template.first_used)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {formatDate(template.last_used)}
                          </td>
                        </tr>

                        {/* Expanded Details Row */}
                        {isExpanded && template.usage_count > 0 && (
                          <tr className="bg-gray-50">
                            <td colSpan={6} className="px-6 py-4">
                              <div className="space-y-4">
                                <h4 className="text-sm font-semibold text-gray-900">Recent Usage Details</h4>
                                
                                {/* Usage Summary */}
                                <div className="grid grid-cols-3 gap-4 text-sm">
                                  <div>
                                    <span className="text-gray-500">Last Used:</span>
                                    <div className="font-medium text-gray-900">
                                      {formatDate(template.last_used)}
                                    </div>
                                  </div>
                                  <div>
                                    <span className="text-gray-500">Times Used:</span>
                                    <div className="font-medium text-gray-900">
                                      {template.usage_count}
                                    </div>
                                  </div>
                                  <div>
                                    <span className="text-gray-500">Unique Users:</span>
                                    <div className="font-medium text-gray-900">
                                      {template.unique_users}
                                    </div>
                                  </div>
                                </div>

                                                                {/* Scrollable User List */}
                                {template.sample_rooms.length > 0 && (
                                  <div>
                                    <h5 className="text-xs font-medium text-gray-700 mb-2">
                                  Recent Uses ({template.sample_rooms.length} of {template.usage_count} total):
                                </h5>
                                    <div className="max-h-64 overflow-y-auto border rounded-lg bg-white">
                                      <div className="divide-y divide-gray-100">
                                        {template.sample_rooms.map((room, index) => (
                                          <div key={index} className="px-3 py-2 hover:bg-gray-50 transition-colors">
                                            <div className="flex items-center justify-between">
                                              <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                  <div className={`w-2 h-2 rounded-full ${room.user_email ? 'bg-blue-500' : 'bg-gray-300'}`}></div>
                                                  <div className="text-sm font-medium text-gray-900 truncate">
                                                    {room.user_email || 'Wallet User'}
                                                  </div>
                                                </div>
                                                <div className="text-xs text-gray-500 mt-1">
                                                  {room.account_id ? room.account_id.substring(0, 8) + '...' : 'Unknown ID'}
                                                  {room.artist_name && (
                                                    <div className="text-blue-600 font-medium mt-1">🎵 {room.artist_name}</div>
                                                  )}
                                                </div>
                                              </div>
                                              <div className="text-xs text-gray-400 ml-4 flex-shrink-0">
                                                {formatDate(room.created_at)}
                                              </div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Sample Rooms for Popular Templates */}
        {data.templates.filter(t => t.usage_count > 0 && t.sample_rooms.length > 0).length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Sample Usage Examples</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {data.templates
                .filter(t => t.usage_count > 0 && t.sample_rooms.length > 0)
                .slice(0, 4) // Show top 4 templates
                .map((template) => (
                  <Card key={template.template_id} className="p-4">
                    <h3 className="font-medium text-gray-900 mb-2">{template.template_title}</h3>
                    <p className="text-xs text-gray-600 mb-3">
                      {truncatePrompt(template.template_prompt, 80)}
                    </p>
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-gray-700">Recent Usage:</h4>
                      {template.sample_rooms.slice(0, 3).map((room, index) => (
                        <div key={index} className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
                          <div>Room: {room.room_id ? room.room_id.substring(0, 8) + '...' : 'Unknown'}</div>
                          <div>
                            Email: 
                            <span className={`ml-1 ${room.user_email ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>
                              {room.user_email || 'No email found'}
                            </span>
                          </div>
                          <div>User ID: {room.account_id ? room.account_id.substring(0, 8) + '...' : 'Unknown'}</div>
                          <div>Artist: 
                            <span className="text-blue-600 font-medium ml-1">
                              {room.artist_name || 'Unknown Artist'}
                            </span>
                          </div>
                          <div>Date: {formatDate(room.created_at)}</div>
                        </div>
                      ))}
                      {template.sample_rooms.length > 3 && (
                        <div className="text-xs text-gray-400">
                          +{template.sample_rooms.length - 3} more usage examples
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
            </div>
          </div>
        )}

        {/* Analysis Info */}
        <div className="mt-8 p-4 bg-blue-50 rounded-lg">
          <h3 className="text-sm font-medium text-blue-800 mb-2">Analysis Details</h3>
          <div className="text-xs text-blue-600 space-y-1">
            <p>• Analyzed {data.summary.analyzed_rooms} rooms and {data.summary.analyzed_messages} first messages</p>
            <p>• Time period: {data.summary.time_range}</p>
            <p>• Matching algorithm uses text normalization and 80% word overlap similarity</p>
            <p>• Only first user message in each room is analyzed (where template prompts appear)</p>
          </div>
        </div>
      </div>
    </div>
  );
} 