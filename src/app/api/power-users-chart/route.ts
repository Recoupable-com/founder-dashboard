import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Define cache data type
interface PowerUsersChartData {
  [key: string]: unknown;
}

// In-memory cache for power users chart data (cache for 2 minutes)
const powerUsersChartCache = new Map<string, { data: PowerUsersChartData, timestamp: number }>();
const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes

// Get cached data if still valid
function getCachedData(cacheKey: string) {
  const cached = powerUsersChartCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }
  return null;
}

// Set cached data
function setCachedData(cacheKey: string, data: PowerUsersChartData) {
  powerUsersChartCache.set(cacheKey, { data, timestamp: Date.now() });
  
  // Clean up old cache entries (simple cleanup)
  if (powerUsersChartCache.size > 50) {
    const oldestKey = powerUsersChartCache.keys().next().value;
    if (oldestKey) {
      powerUsersChartCache.delete(oldestKey);
    }
  }
}

function getPowerUserCriteria(timeFilter: string): { minDaysActive: number, minTotalActions: number } {
  switch (timeFilter) {
    case 'Last 24 Hours':
      return { minDaysActive: 1, minTotalActions: 10 }; // 10+ messages in 24 hours
    case 'Last 7 Days':
      return { minDaysActive: 5, minTotalActions: 1 }; // Active 5 out of 7 days (71.4%)
    case 'Last 30 Days':
      return { minDaysActive: 20, minTotalActions: 1 }; // Active 20 out of 30 days (66.7%)
    case 'Last 3 Months':
      return { minDaysActive: 60, minTotalActions: 1 }; // Active 60 out of 90 days (66.7%)
    case 'Last 12 Months':
      return { minDaysActive: 240, minTotalActions: 1 }; // Active 240 out of 365 days (65.8%)
    default:
      return { minDaysActive: 20, minTotalActions: 1 }; // Default to 30-day criteria
  }
}

export async function GET(request: Request) {
  const startTime = Date.now();
  console.log('🔄 [POWER-USERS-CHART-API] Starting power users chart fetch');
  
  try {
    const { searchParams } = new URL(request.url);
    const timeFilter = searchParams.get('timeFilter') || 'Last 7 Days';
    const excludeTest = searchParams.get('excludeTest') === 'true';
    
    // Create cache key (round time to nearest hour for consistency)
    const now = new Date();
    const cacheEnd = new Date(now);
    cacheEnd.setMinutes(0, 0, 0);
    const cacheKey = `power-users-chart-${timeFilter}-${excludeTest}-${cacheEnd.toISOString()}`;
    console.log(`🔍 [POWER-USERS-CHART-API] Cache key: ${cacheKey}`);
    
    // Check cache first
    const cachedData = getCachedData(cacheKey);
    if (cachedData) {
      const endTime = Date.now();
      console.log(`⚡ [POWER-USERS-CHART-API] COMPLETED (CACHED) in ${endTime - startTime}ms`);
      return NextResponse.json(cachedData);
    }
    
    console.log(`🔍 [POWER-USERS-CHART-API] Cache miss, fetching from database`);
    console.log('Power Users Chart API: Generating chart data for period:', timeFilter);
    
    // Calculate date ranges and granularity based on time filter
    const intervals: { start: Date, end: Date, label: string }[] = [];
    
    switch (timeFilter) {
      case 'Last 24 Hours':
        // Hourly intervals for last 24 hours
        for (let i = 23; i >= 0; i--) {
          const end = new Date(now.getTime() - i * 60 * 60 * 1000);
          const start = new Date(end.getTime() - 60 * 60 * 1000);
          intervals.push({
            start,
            end,
            label: end.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
          });
        }
        break;
        
      case 'Last 7 Days':
        // Daily intervals for last 7 days
        for (let i = 6; i >= 0; i--) {
          const start = new Date(now);
          start.setDate(now.getDate() - i);
          start.setHours(0, 0, 0, 0);
          const end = new Date(start);
          end.setHours(23, 59, 59, 999);
          intervals.push({
            start,
            end,
            label: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          });
        }
        break;
        
      case 'Last 30 Days':
        // Daily intervals for last 30 days
        for (let i = 29; i >= 0; i--) {
          const start = new Date(now);
          start.setDate(now.getDate() - i);
          start.setHours(0, 0, 0, 0);
          const end = new Date(start);
          end.setHours(23, 59, 59, 999);
          intervals.push({
            start,
            end,
            label: start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
          });
        }
        break;
        
      case 'Last 3 Months':
        // Weekly intervals for last 3 months
        for (let i = 12; i >= 0; i--) {
          const end = new Date(now);
          end.setDate(now.getDate() - i * 7);
          const start = new Date(end);
          start.setDate(end.getDate() - 6);
          start.setHours(0, 0, 0, 0);
          end.setHours(23, 59, 59, 999);
          intervals.push({
            start,
            end,
            label: `Week of ${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
          });
        }
        break;
        
      case 'Last 12 Months':
        // Monthly intervals for last 12 months
        for (let i = 11; i >= 0; i--) {
          const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
          intervals.push({
            start,
            end,
            label: start.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
          });
        }
        break;
        
      default:
        // Default to last 30 days
        for (let i = 29; i >= 0; i--) {
          const start = new Date(now);
          start.setDate(now.getDate() - i);
          start.setHours(0, 0, 0, 0);
          const end = new Date(start);
          end.setHours(23, 59, 59, 999);
          intervals.push({
            start,
            end,
            label: start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
          });
        }
    }

    // Get test emails if excluding test accounts
    let testEmailsList: string[] = [];
    if (excludeTest) {
      const { data: testEmailsData } = await supabaseAdmin
        .from('test_emails')
        .select('email');
      testEmailsList = testEmailsData?.map(row => row.email) || [];
    }

    // Calculate power users for each interval
    const data = await Promise.all(intervals.map(async (interval) => {
      const { minDaysActive, minTotalActions } = getPowerUserCriteria(timeFilter);
      
      // For chart data, we use cumulative calculation up to each interval
      const cumulativeStart = new Date(now.getTime());
      switch (timeFilter) {
        case 'Last 24 Hours':
          cumulativeStart.setHours(interval.end.getHours() - 24);
          break;
        case 'Last 7 Days':
          cumulativeStart.setDate(interval.end.getDate() - 7);
          break;
        case 'Last 30 Days':
          cumulativeStart.setDate(interval.end.getDate() - 30);
          break;
        case 'Last 3 Months':
          cumulativeStart.setMonth(interval.end.getMonth() - 3);
          break;
        case 'Last 12 Months':
          cumulativeStart.setFullYear(interval.end.getFullYear() - 1);
          break;
        default:
          cumulativeStart.setDate(interval.end.getDate() - 30);
      }
      
      // Get message counts by user for the cumulative period ending at this interval
      const { data: messageData } = await supabaseAdmin.rpc('get_message_counts_by_user', { 
        start_date: cumulativeStart.toISOString(), 
        end_date: interval.end.toISOString() 
      });
      
      if (!messageData) {
        return {
          label: interval.label,
          value: 0,
          date: interval.start.toISOString()
        };
      }

      // Filter out test emails if needed
      const filteredMessageData = excludeTest 
        ? messageData.filter((row: { account_email: string }) => {
            const email = row.account_email;
            if (!email) return false;
            if (testEmailsList.includes(email)) return false;
            if (email.includes('@example.com')) return false;
            if (email.includes('+')) return false;
            return true;
          })
        : messageData;

      // Get segment reports for this cumulative period and count them by user
      const { data: reportData } = await supabaseAdmin
        .from('segment_reports')
        .select('account_email')
        .gte('updated_at', cumulativeStart.toISOString())
        .lte('updated_at', interval.end.toISOString());
      
      // Count reports per user
      const reportCountByUser = new Map<string, number>();
      (reportData || [])
        .filter(report => {
          if (!excludeTest) return true;
          const email = report.account_email;
          if (!email) return false;
          if (testEmailsList.includes(email)) return false;
          if (email.includes('@example.com')) return false;
          if (email.includes('+')) return false;
          return true;
        })
        .forEach(report => {
          const email = report.account_email;
          if (email) {
            reportCountByUser.set(email, (reportCountByUser.get(email) || 0) + 1);
          }
        });

      // Get all unique user emails
      const allUserEmails = new Set<string>();
      filteredMessageData.forEach((row: { account_email: string }) => {
        allUserEmails.add(row.account_email);
      });
      reportCountByUser.forEach((_, email) => {
        allUserEmails.add(email);
      });

      if (allUserEmails.size === 0) {
        return {
          label: interval.label,
          value: 0,
          date: interval.start.toISOString()
        };
      }

      // Calculate consistency (days active) for each user
      const userConsistency = new Map<string, number>();
      
      for (const email of allUserEmails) {
        try {
          // Get account_id for this email
          const { data: emailData } = await supabaseAdmin
            .from('account_emails')
            .select('account_id')
            .eq('email', email)
            .single();
          
          if (!emailData) continue;
          
          const accountId = emailData.account_id;
          const userDays = new Set<string>();

          // Get both messages and reports in parallel
          const [roomsData, reportRoomsData] = await Promise.all([
            // Get rooms for messages
            supabaseAdmin
              .from('rooms')
              .select('id')
              .eq('account_id', accountId),
            
            // Get segment report rooms
            supabaseAdmin
              .from('rooms')
              .select('updated_at, topic')
              .eq('account_id', accountId)
              .gte('updated_at', cumulativeStart.toISOString())
              .lte('updated_at', interval.end.toISOString())
          ]);

          const roomIds = (roomsData.data || []).map(r => r.id);

          // Get messages for this user's rooms
          if (roomIds.length > 0) {
            const { data: msgRows } = await supabaseAdmin
              .from('memories')
              .select('updated_at')
              .in('room_id', roomIds)
              .gte('updated_at', cumulativeStart.toISOString())
              .lte('updated_at', interval.end.toISOString());

            if (msgRows) {
              msgRows.forEach((row: { updated_at: string }) => {
                const day = row.updated_at.slice(0, 10);
                userDays.add(day);
              });
            }
          }

          // Process segment reports
          if (reportRoomsData.data) {
            reportRoomsData.data.forEach((row: { updated_at: string, topic: string }) => {
              // Only count rooms with topics starting with "segment:" (case insensitive)
              if (row.topic?.toLowerCase?.().startsWith('segment:')) {
                const day = row.updated_at.slice(0, 10);
                userDays.add(day);
              }
            });
          }

          userConsistency.set(email, userDays.size);
        } catch (error) {
          console.error('Error calculating consistency for user', email, ':', error);
          userConsistency.set(email, 0);
        }
      }

      // Combine users who sent messages or created reports with their total activity
      const userActivityMap = new Map<string, number>();
      
      // Add message counts
      filteredMessageData.forEach((row: { account_email: string, message_count: number }) => {
        userActivityMap.set(row.account_email, row.message_count);
      });

      // Add report counts to existing users or create new entries
      reportCountByUser.forEach((reportCount, email) => {
        const existingActivity = userActivityMap.get(email) || 0;
        userActivityMap.set(email, existingActivity + reportCount);
      });

      // Count power users (must meet BOTH criteria: consistency AND volume)
      let powerUsers = 0;
      userActivityMap.forEach((totalActions, email) => {
        const daysActive = userConsistency.get(email) || 0;
        if (daysActive >= minDaysActive && totalActions >= minTotalActions) {
          powerUsers++;
        }
      });

      // Collect power user emails for tooltip
      const powerUserEmails: string[] = [];
      userActivityMap.forEach((totalActions, email) => {
        const daysActive = userConsistency.get(email) || 0;
        if (daysActive >= minDaysActive && totalActions >= minTotalActions) {
          powerUserEmails.push(email);
        }
      });

      return {
        label: interval.label,
        value: powerUsers,
        date: interval.start.toISOString(),
        users: powerUserEmails
      };
    }));

    const result = {
      labels: data.map(d => d.label),
      data: data.map(d => d.value),
      users: data.map(d => d.users),
      timeFilter,
      excludeTest
    };

    console.log('Power Users Chart API: Generated', data.length, 'data points');
    
    // Cache the result
    setCachedData(cacheKey, result);
    
    const endTime = Date.now();
    console.log(`⚡ [POWER-USERS-CHART-API] COMPLETED in ${endTime - startTime}ms`);
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('Power Users Chart API: Error:', error);
    return NextResponse.json({ error: 'Failed to fetch Power Users chart data' }, { status: 500 });
  }
} 