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
                // ENHANCED: Beautiful, professional tooltip design
                displayColors: false,
                backgroundColor: 'rgba(15, 23, 42, 0.95)', // slate-900 with transparency
                titleColor: '#f8fafc', // slate-50
                bodyColor: '#e2e8f0', // slate-200
                borderColor: 'rgba(100, 116, 139, 0.3)', // slate-500 with transparency
                borderWidth: 1,
                cornerRadius: 12,
                padding: 16,
                titleFont: {
                  size: 14,
                  weight: 600
                },
                bodyFont: {
                  size: 12,
                  weight: 400
                },
                caretPadding: 8,
                caretSize: 6,
                yAlign: 'top', // Keep tooltip at top to prevent cutoff
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
                      // FIXED: Show all users for PMF chart, limit others to prevent overwhelming tooltips
                      const maxUsersToShow = metricType === 'pmfSurveyReady' ? users.length : 15;
                      const usersToShow = users.slice(0, maxUsersToShow);
                      
                      if (metricType === 'pmfSurveyReady' && users.length > 10) {
                        // ENHANCED: Beautiful multi-column layout for PMF charts
                        const tooltipLines = [
                          mainLabel, 
                          '', // Empty line for spacing
                          '👥 PMF Survey Ready Users:'
                        ];
                        
                        // Group users into columns (3 columns with better spacing)
                        const usersPerColumn = Math.ceil(usersToShow.length / 3);
                        const columns = [];
                        
                        for (let i = 0; i < 3; i++) {
                          const columnStart = i * usersPerColumn;
                          const columnEnd = Math.min(columnStart + usersPerColumn, usersToShow.length);
                          const columnUsers = usersToShow.slice(columnStart, columnEnd);
                          columns.push(columnUsers);
                        }
                        
                        // Create side-by-side columns with better formatting
                        const columnWidth = 28; // Fixed width for better alignment
                        
                        for (let row = 0; row < usersPerColumn; row++) {
                          let rowText = '';
                          columns.forEach((column, colIndex) => {
                            if (column[row]) {
                              const email = column[row];
                              // Use a more elegant bullet and truncate long emails
                              const displayEmail = email.length > 26 ? email.substring(0, 23) + '...' : email;
                              const formattedEmail = `◦ ${displayEmail}`.padEnd(columnWidth);
                              rowText += formattedEmail;
                            } else if (colIndex < 2) {
                              // Add spacing for empty cells (except last column)
                              rowText += ''.padEnd(columnWidth);
                            }
                          });
                          if (rowText.trim()) {
                            tooltipLines.push(rowText);
                          }
                        }
                        
                        // Add a subtle separator and total count
                        tooltipLines.push('');
                        tooltipLines.push(`📊 Total: ${users.length} users ready for PMF surveys`);
                        
                        return tooltipLines;
                      } else {
                        // ENHANCED: Beautiful single-column layout for smaller lists
                        const userLabel = metricType === 'pmfSurveyReady' ? '👥 PMF Survey Ready Users:' : '👤 Users:';
                        const tooltipLines = [
                          mainLabel,
                          '', // Empty line for spacing
                          userLabel
                        ];
                        
                        // Add each user email with elegant formatting
                        usersToShow.forEach(user => {
                          const displayEmail = user.length > 35 ? user.substring(0, 32) + '...' : user;
                          tooltipLines.push(`◦ ${displayEmail}`);
                        });
                        
                        // Add "more" indicator if needed (only for non-PMF charts)
                        if (users.length > maxUsersToShow && metricType !== 'pmfSurveyReady') {
                          tooltipLines.push('');
                          tooltipLines.push(`📋 (+${users.length - maxUsersToShow} more users)`);
                        }
                        
                        // Add total count for PMF
                        if (metricType === 'pmfSurveyReady') {
                          tooltipLines.push('');
                          tooltipLines.push(`📊 Total: ${users.length} users ready for PMF surveys`);
                        }
                        
                        return tooltipLines;
                      }
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