import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const timeFilter = searchParams.get('timeFilter') || 'Last 30 Days';
    const excludeTest = searchParams.get('excludeTest') === 'true';
    
    console.log('Active Users Chart API: Generating chart data for period:', timeFilter);
    
    // Debug timezone information
    console.log('Active Users Chart API: Timezone debug info:', {
      serverTime: new Date().toString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      utcTime: new Date().toISOString(),
      localTime: new Date().toLocaleString()
    });
    
    // Calculate date ranges and granularity based on time filter (FORCE UTC for consistency)
    const now = new Date();
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
        // Daily intervals for last 7 days - USE UTC CONSISTENT LOGIC
        for (let i = 6; i >= 0; i--) {
          const endTime = now.getTime() - i * 24 * 60 * 60 * 1000;
          const startTime = endTime - 24 * 60 * 60 * 1000;
          const start = new Date(startTime);
          const end = new Date(endTime);
          intervals.push({
            start,
            end,
            label: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          });
        }
        break;
        
      case 'Last 30 Days':
        // Daily intervals for last 30 days - USE UTC CONSISTENT LOGIC
        for (let i = 29; i >= 0; i--) {
          const endTime = now.getTime() - i * 24 * 60 * 60 * 1000;
          const startTime = endTime - 24 * 60 * 60 * 1000;
          const start = new Date(startTime);
          const end = new Date(endTime);
          intervals.push({
            start,
            end,
            label: start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
          });
        }
        break;
        
      case 'Last 3 Months':
        // Weekly intervals for last 3 months - USE UTC CONSISTENT LOGIC
        for (let i = 12; i >= 0; i--) {
          const endTime = now.getTime() - i * 7 * 24 * 60 * 60 * 1000;
          const startTime = endTime - 7 * 24 * 60 * 60 * 1000;
          const start = new Date(startTime);
          const end = new Date(endTime);
          intervals.push({
            start,
            end,
            label: `Week of ${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
          });
        }
        break;
        
      case 'Last 12 Months':
        // Monthly intervals for last 12 months - USE UTC CONSISTENT LOGIC
        for (let i = 11; i >= 0; i--) {
          const endTime = now.getTime() - i * 30 * 24 * 60 * 60 * 1000; // Approximate 30 days per month
          const startTime = endTime - 30 * 24 * 60 * 60 * 1000;
          const start = new Date(startTime);
          const end = new Date(endTime);
          intervals.push({
            start,
            end,
            label: start.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
          });
        }
        break;
        
      default:
        // Default to last 30 days - USE UTC CONSISTENT LOGIC
        for (let i = 29; i >= 0; i--) {
          const endTime = now.getTime() - i * 24 * 60 * 60 * 1000;
          const startTime = endTime - 24 * 60 * 60 * 1000;
          const start = new Date(startTime);
          const end = new Date(endTime);
          intervals.push({
            start,
            end,
            label: start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
          });
        }
    }

    console.log('Active Users Chart API: Generated intervals (UTC):', {
      count: intervals.length,
      firstInterval: intervals[0] ? {
        start: intervals[0].start.toISOString(),
        end: intervals[0].end.toISOString(),
        label: intervals[0].label
      } : null,
      lastInterval: intervals[intervals.length - 1] ? {
        start: intervals[intervals.length - 1].start.toISOString(),
        end: intervals[intervals.length - 1].end.toISOString(),
        label: intervals[intervals.length - 1].label
      } : null
    });

    // Get test emails list if excluding test accounts
    let testEmailsList: string[] = [];
    
    if (excludeTest) {
      const { data: testEmailsData } = await supabaseAdmin
        .from('test_emails')
        .select('email');
      testEmailsList = (testEmailsData?.map(item => item.email) || []) as string[];
    }

    // Calculate active users for each interval with breakdown of interactive vs scheduled activity
    const data = await Promise.all(intervals.map(async (interval) => {
      // Get interactive users (those who sent messages)
      const { data: messageData } = await supabaseAdmin.rpc('get_message_counts_by_user', {
        start_date: interval.start.toISOString(),
        end_date: interval.end.toISOString()
      });
      
      // Get scheduled action users for this interval
      const { data: scheduledActionsData } = await supabaseAdmin
        .from('scheduled_actions')
        .select('account_id, created_at')
        .gte('created_at', interval.start.toISOString())
        .lte('created_at', interval.end.toISOString());
      
      const interactiveUsers = new Set<string>();
      const scheduledActionUsers = new Set<string>();
      
      // Process interactive users (messages)
      if (messageData) {
        messageData.forEach((row: { account_email: string; message_count: number }) => {
          if (!row.account_email) return;
          
          if (excludeTest) {
            if (testEmailsList.includes(row.account_email)) return;
            if (row.account_email.includes('@example.com')) return;
            if (row.account_email.includes('+')) return;
          }
          
          interactiveUsers.add(row.account_email);
        });
      }
      
      // Process scheduled action users
      if (scheduledActionsData) {
        // Get all account_ids to fetch emails in batch
        const accountIds = [...new Set(scheduledActionsData.map(action => action.account_id))];
        
        if (accountIds.length > 0) {
          const { data: emailData } = await supabaseAdmin
            .from('account_emails')
            .select('account_id, email')
            .in('account_id', accountIds);
          
          const accountToEmailMap = new Map();
          (emailData || []).forEach(row => {
            accountToEmailMap.set(row.account_id, row.email);
          });
          
          scheduledActionsData.forEach(action => {
            const email = accountToEmailMap.get(action.account_id);
            if (email) {
              if (excludeTest) {
                if (testEmailsList.includes(email)) return;
                if (email.includes('@example.com')) return;
                if (email.includes('+')) return;
              }
              
              scheduledActionUsers.add(email);
            }
          });
        }
      }
      
      // Create breakdown: interactive only, scheduled only, both
      const interactiveOnly = new Set([...interactiveUsers].filter(user => !scheduledActionUsers.has(user)));
      const scheduledOnly = new Set([...scheduledActionUsers].filter(user => !interactiveUsers.has(user)));
      const mixedUsers = new Set([...interactiveUsers].filter(user => scheduledActionUsers.has(user)));
      
      // Total unique active users
      const allActiveUsers = new Set([...interactiveUsers, ...scheduledActionUsers]);
      
      return {
        label: interval.label,
        value: allActiveUsers.size,
        date: interval.start.toISOString(),
        users: Array.from(allActiveUsers),
        interactiveUsers: Array.from(interactiveOnly),
        scheduledUsers: Array.from(scheduledOnly),
        mixedUsers: Array.from(mixedUsers)
      };
    }));

    const result = {
      labels: data.map(d => d.label),
      data: data.map(d => d.value),
      users: data.map(d => d.users),
      interactiveUsers: data.map(d => d.interactiveUsers),
      scheduledUsers: data.map(d => d.scheduledUsers),
      mixedUsers: data.map(d => d.mixedUsers)
    };

    console.log('Active Users Chart API: Generated', data.length, 'data points');
    
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('Active Users Chart API: Error:', error);
    return NextResponse.json({ error: 'Failed to fetch active users chart data' }, { status: 500 });
  }
} 