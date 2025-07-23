/**
 * ActiveUsersChart component: displays a chart of active users over time
 * @param chartData - Chart data with labels and data points
 * @param loading - Whether the chart is loading
 * @param error - Error message if any
 * @param isUserTrend - Whether the chart is displaying user trends
 * @param metricType - The type of metric being displayed
 */
import React from 'react';
import { Line } from 'react-chartjs-2';
import type { TooltipItem } from 'chart.js';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

export interface ActiveUsersChartData {
  labels: string[];
  data: number[];
  users?: string[][];
  interactiveUsers?: string[][];
  scheduledUsers?: string[][];
  mixedUsers?: string[][];
}

export interface ActiveUsersChartProps {
  chartData: ActiveUsersChartData | null;
  loading: boolean;
  error: string | null;
  isUserTrend?: boolean;
  metricType?: 'activeUsers' | 'pmfSurveyReady' | 'powerUsers';
}

const ActiveUsersChart: React.FC<ActiveUsersChartProps> = ({
  chartData,
  loading,
  error,
  isUserTrend = false,
  metricType = 'activeUsers'
}) => {
  const getChartTitle = () => {
    if (isUserTrend) return 'User Activity Trend';
    
    switch (metricType) {
      case 'pmfSurveyReady':
        return 'PMF Survey Ready Users Trend';
      case 'powerUsers':
        return 'Power Users Trend';
      case 'activeUsers':
      default:
        return 'Active Users Trend';
    }
  };

  const getDatasetLabel = () => {
    if (isUserTrend) return 'Messages';
    
    switch (metricType) {
      case 'pmfSurveyReady':
        return 'PMF Survey Ready Users';
      case 'powerUsers':
        return 'Power Users';
      case 'activeUsers':
      default:
        return 'Active Users';
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-md p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">{getChartTitle()}</h2>
        <div className="text-center text-gray-500 py-8">Loading chart...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl shadow-md p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">{getChartTitle()}</h2>
        <div className="text-center text-red-500 py-8">{error}</div>
      </div>
    );
  }

  if (!chartData) {
    return (
      <div className="bg-white rounded-2xl shadow-md p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">{getChartTitle()}</h2>
        <div className="text-center text-gray-500 py-8">No chart data available</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-md p-6 mb-8">
      <h2 className="text-xl font-semibold mb-4">{getChartTitle()}</h2>
      <div className="h-64">
        <Line
          data={{
            labels: chartData.labels,
            datasets: [{
              label: getDatasetLabel(),
              data: chartData.data,
              borderColor: 'rgb(59, 130, 246)',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              tension: 0.1
            }]
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              title: { display: false },
              tooltip: {
                callbacks: {
                  label: (context: TooltipItem<'line'>) => {
                    const label = getDatasetLabel();
                    const count = context.parsed.y;
                    const dataIndex = context.dataIndex;
                    const users = chartData.users?.[dataIndex] || [];
                    
                    // Create the main label
                    const mainLabel = `${label}: ${count}`;
                    
                    // If there are users, add them to the tooltip
                    if (users.length > 0) {
                      const maxUsersToShow = 10;
                      const usersToShow = users.slice(0, maxUsersToShow);
                      const tooltipLines = [mainLabel, 'Users:'];
                      
                      // Add each user email on its own line
                      usersToShow.forEach(user => {
                        tooltipLines.push(`• ${user}`);
                      });
                      
                      // Add "more" indicator if needed
                      if (users.length > maxUsersToShow) {
                        tooltipLines.push(`• (+${users.length - maxUsersToShow} more)`);
                      }
                      
                      return tooltipLines;
                    }
                    
                    return mainLabel;
                  }
                }
              }
            },
            scales: {
              x: {
                ticks: {
                  callback: function(value) {
                    // Return the label as-is since API already provides formatted labels
                    const label = chartData.labels?.[value as number];
                    return label || '';
                  }
                }
              },
              y: { beginAtZero: true }
            }
          }}
        />
      </div>
    </div>
  );
};

export default ActiveUsersChart; 