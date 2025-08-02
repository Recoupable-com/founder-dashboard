/**
 * MetricsSection component: displays the three main metrics cards
 */
import React from 'react';
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';
import MetricCard from './MetricCard';
import PMFSurveyReadyCard from './PMFSurveyReadyCard';

export interface MetricData {
  percentChange: number;
  changeDirection: 'up' | 'down' | 'neutral';
}

export interface ActiveUsersData extends MetricData {
  activeUsers: number;
  previousActiveUsers: number;
}

export interface PowerUsersData extends MetricData {
  powerUsers: number;
  previousPowerUsers: number;
}

export interface PmfSurveyReadyData extends MetricData {
  pmfSurveyReady: number;
  previousPmfSurveyReady: number;
}

export type MetricType = 'activeUsers' | 'pmfSurveyReady' | 'powerUsers';

export interface MetricsSectionProps {
  activeUsersData: ActiveUsersData;
  powerUsersData: PowerUsersData;
  pmfSurveyReadyData: PmfSurveyReadyData;
  timeFilter: string;
  onMetricClick?: (metricType: MetricType) => void;
  selectedMetric?: MetricType | null;
}

const MetricsSection: React.FC<MetricsSectionProps> = ({
  activeUsersData,
  powerUsersData,
  pmfSurveyReadyData,
  timeFilter,
  onMetricClick,
  selectedMetric
}) => {
  const getActiveUsersTitle = (timeFilter: string): string => {
    switch (timeFilter) {
      case 'Last 24 Hours':
        return 'Daily Active Users';
      case 'Last 7 Days':
        return 'Weekly Active Users';
      case 'Last 30 Days':
        return 'Monthly Active Users';
      case 'Last 3 Months':
        return 'Quarterly Active Users';
      case 'Last 12 Months':
        return 'Annual Active Users';
      default:
        return 'Active Users';
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      <MetricCard
        title={getActiveUsersTitle(timeFilter)}
        value={activeUsersData.activeUsers}
        description="Active Users are users who have sent at least one message or created at least one segment report during the selected time period."
        icon={<ChatBubbleLeftRightIcon className="h-5 w-5" />}
        percentChange={activeUsersData.percentChange}
        changeDirection={activeUsersData.changeDirection}
        onClick={onMetricClick ? () => onMetricClick('activeUsers') : undefined}
        isSelected={selectedMetric === 'activeUsers'}
      />

      <PMFSurveyReadyCard
        value={pmfSurveyReadyData.pmfSurveyReady}
        percentChange={pmfSurveyReadyData.percentChange}
        changeDirection={pmfSurveyReadyData.changeDirection}
        onClick={onMetricClick ? () => onMetricClick('pmfSurveyReady') : undefined}
        isSelected={selectedMetric === 'pmfSurveyReady'}
        timeFilter={timeFilter}
      />

      <MetricCard
        title="Power Users"
        value={powerUsersData.powerUsers}
        description="Highly consistent users: 10+ messages daily, or active ~67% of days (5/7 days, 20/30 days, 60/90 days)."
        icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>}
        percentChange={powerUsersData.percentChange}
        changeDirection={powerUsersData.changeDirection}
        onClick={onMetricClick ? () => onMetricClick('powerUsers') : undefined}
        isSelected={selectedMetric === 'powerUsers'}
      />
    </div>
  );
};

export default MetricsSection;