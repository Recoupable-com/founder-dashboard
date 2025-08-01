import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

interface ErrorLog {
  id: string;
  error_timestamp: string;
  error_type: string;
  tool_name: string;
  error_message: string;
  [key: string]: unknown;
}

interface OutlierCluster {
  start_time: string;
  end_time: string;
  error_count: number;
  duration_minutes: number;
  dominant_error_type: string;
  reason: string;
}

interface ErrorSummary {
  totalErrors: number;
  rawTotalErrors: number;
  removedOutliers: number;
  outlierClusters: OutlierCluster[];
  errorBreakdown: Record<string, number>;
  errors: ErrorLog[];
  timeRange: string;
}

function detectOutlierClusters(errorLogs: ErrorLog[]): OutlierCluster[] {
  const clusters: OutlierCluster[] = [];
  
  // Group errors by minute
  const errorsByMinute = new Map<string, ErrorLog[]>();
  
  errorLogs.forEach(error => {
    const minute = error.error_timestamp.slice(0, 16); // YYYY-MM-DDTHH:MM
    if (!errorsByMinute.has(minute)) {
      errorsByMinute.set(minute, []);
    }
    errorsByMinute.get(minute)!.push(error);
  });
  
  // Sort minutes chronologically
  const sortedMinutes = Array.from(errorsByMinute.keys()).sort();
  
  // Detect clusters: >10 errors per minute OR >50 identical errors in 10-minute window
  for (let i = 0; i < sortedMinutes.length; i++) {
    const minute = sortedMinutes[i];
    const errorsInMinute = errorsByMinute.get(minute)!;
    
    // Threshold 1: High error rate per minute
    if (errorsInMinute.length >= 10) {
      // Find the extent of this cluster
      let clusterStart = minute;
      let clusterEnd = minute;
      let totalErrors = errorsInMinute.length;
      
      // Look backwards
      for (let j = i - 1; j >= 0 && sortedMinutes[j] >= addMinutes(minute, -5); j--) {
        const prevMinute = sortedMinutes[j];
        const prevErrors = errorsByMinute.get(prevMinute)!;
        if (prevErrors.length >= 5) {
          clusterStart = prevMinute;
          totalErrors += prevErrors.length;
        } else {
          break;
        }
      }
      
      // Look forwards  
      for (let j = i + 1; j < sortedMinutes.length && sortedMinutes[j] <= addMinutes(minute, 5); j++) {
        const nextMinute = sortedMinutes[j];
        const nextErrors = errorsByMinute.get(nextMinute)!;
        if (nextErrors.length >= 5) {
          clusterEnd = nextMinute;
          totalErrors += nextErrors.length;
        } else {
          break;
        }
      }
      
      // Calculate duration and dominant error type
      const durationMinutes = getMinutesDifference(clusterStart, clusterEnd);
      const allClusterErrors: ErrorLog[] = [];
      
      for (const min of sortedMinutes) {
        if (min >= clusterStart && min <= clusterEnd) {
          allClusterErrors.push(...(errorsByMinute.get(min) || []));
        }
      }
      
      const errorTypeCount = new Map<string, number>();
      allClusterErrors.forEach(error => {
        const type = error.tool_name || error.error_type || 'Unknown';
        errorTypeCount.set(type, (errorTypeCount.get(type) || 0) + 1);
      });
      
      const dominantType = Array.from(errorTypeCount.entries())
        .sort(([,a], [,b]) => b - a)[0]?.[0] || 'Unknown';
      
      clusters.push({
        start_time: clusterStart + ':00.000Z',
        end_time: clusterEnd + ':59.999Z', 
        error_count: totalErrors,
        duration_minutes: durationMinutes,
        dominant_error_type: dominantType,
        reason: `High error rate: ${totalErrors} errors in ${durationMinutes} minutes`
      });
      
      // Skip ahead to avoid double-counting
      i += Math.max(0, sortedMinutes.findIndex(m => m === clusterEnd) - i);
    }
  }
  
  return clusters;
}

function addMinutes(timeString: string, minutes: number): string {
  const date = new Date(timeString + ':00.000Z');
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString().slice(0, 16);
}

function getMinutesDifference(start: string, end: string): number {
  const startDate = new Date(start + ':00.000Z');
  const endDate = new Date(end + ':59.999Z');
  return Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60)));
}

export async function GET(request: Request) {
  const startTime = Date.now();
  console.log('🔄 [ERROR-LOGS-API] Starting error logs fetch');
  
  try {
    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '7')
    const filterOutliers = searchParams.get('filterOutliers') === 'true'
    
    console.log(`🔄 [ERROR-LOGS-API] Starting error logs fetch`)
    
    // Initialize Supabase client with SERVICE ROLE KEY for admin access
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    
    if (!supabaseServiceKey) {
      console.error('❌ [ERROR-LOGS API] Missing SUPABASE_SERVICE_ROLE_KEY')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    // Calculate time range
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)
    
    const { data: errorLogs, error: errorLogsError } = await supabase
      .from('error_logs')
      .select('*')
      .gte('error_timestamp', startDate.toISOString())
      .order('error_timestamp', { ascending: false })
      .limit(10000) // Reasonable limit to avoid overwhelming
    
    if (errorLogsError) {
      console.error('❌ [ERROR-LOGS API] Error fetching error logs:', errorLogsError)
      return NextResponse.json({ error: 'Failed to fetch error logs', details: errorLogsError.message }, { status: 500 })
    }


    
    // 2. Detect outlier clusters
    const outlierClusters = detectOutlierClusters(errorLogs || []);

    
    // 3. Filter out outliers if requested
    let filteredErrors = errorLogs || [];
    let removedErrorsCount = 0;
    
    if (filterOutliers && outlierClusters.length > 0) {
      filteredErrors = (errorLogs || []).filter(error => {
        const isInCluster = outlierClusters.some(cluster => 
          error.error_timestamp >= cluster.start_time && 
          error.error_timestamp <= cluster.end_time
        );
        
        if (isInCluster) {
          removedErrorsCount++;
          return false;
        }
        return true;
      });
      

    }

    // 4. Fetch all rooms for those room_ids to get account_id
    const roomIds = Array.from(new Set((filteredErrors || []).map(log => log.room_id).filter(Boolean)))


    let roomsById: Record<string, { id: string, account_id: string | null }> = {}
    if (roomIds.length > 0) {

      const { data: rooms, error: roomsError } = await supabase
        .from('rooms')
        .select('id, account_id')
        .in('id', roomIds)
      if (roomsError) {
        console.error(`❌ [ERROR-LOGS API] Error fetching rooms:`, roomsError)
        throw new Error(`Supabase error: ${roomsError.message}`)
      }
      roomsById = Object.fromEntries((rooms || []).map(room => [room.id, room]))

    } else {

    }

    // 5. Fetch all account_emails for those account_ids
    const accountIds = Array.from(new Set(Object.values(roomsById).map(room => room.account_id).filter(Boolean)))

    
    let emailsByAccountId: Record<string, string> = {}
    if (accountIds.length > 0) {

      const { data: accountEmails, error: emailsError } = await supabase
        .from('account_emails')
        .select('account_id, email')
        .in('account_id', accountIds)
      if (emailsError) {
        console.error(`❌ [ERROR-LOGS API] Error fetching account emails:`, emailsError)
        throw new Error(`Supabase error: ${emailsError.message}`)
      }
      emailsByAccountId = Object.fromEntries((accountEmails || []).map(ae => [ae.account_id, ae.email]))

    } else {

    }

    // 6. Attach user_email to each error log

    const logsWithEmail = (filteredErrors || []).map(log => {
      let user_email = null
      const room = roomsById[log.room_id]
      if (room && room.account_id) {
        user_email = emailsByAccountId[room.account_id] || null
      }
      return { ...log, user_email }
    })

    // 7. Generate error breakdown by tool
    const errorBreakdown: Record<string, number> = {}
    logsWithEmail.forEach(log => {
      const toolName = log.tool_name || 'Unknown'
      errorBreakdown[toolName] = (errorBreakdown[toolName] || 0) + 1
    })



         const summary: ErrorSummary = {
      totalErrors: logsWithEmail.length,
      rawTotalErrors: (errorLogs || []).length,
      removedOutliers: removedErrorsCount,
      outlierClusters,
      errorBreakdown,
      errors: logsWithEmail,
      timeRange: `${days} days`
    }

    const endTime = Date.now();
    const duration = endTime - startTime;
    console.log(`⚡ [ERROR-LOGS-API] COMPLETED in ${duration}ms - processed ${(errorLogs || []).length} errors, returning ${logsWithEmail.length}`);

    return NextResponse.json(summary)
    
  } catch (error) {
    console.error('❌ [ERROR-LOGS API] Fatal error:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch error data' 
    }, { status: 500 })
  }
}

// GET detailed error logs with pagination
export async function POST(request: Request) {
  try {
    const { 
      days = 7, 
      limit = 50, 
      offset = 0,
      toolName = null,
      userEmail = null 
    } = await request.json()
    
    // Initialize Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Calculate time range
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)
    
    // Build query
    let query = supabase
      .from('error_logs')
      .select('*')
      .gte('error_timestamp', startDate.toISOString())
      .order('error_timestamp', { ascending: false })
      .range(offset, offset + limit - 1)

    // Add filters
    if (toolName) {
      query = query.eq('tool_name', toolName)
    }
    
    if (userEmail) {
      query = query.eq('user_email', userEmail)
    }

    const { data: errorLogs, error } = await query

    if (error) {
      throw new Error(`Supabase error: ${error.message}`)
    }

    return NextResponse.json({
      errors: errorLogs || [],
      total: errorLogs?.length || 0,
      limit,
      offset
    })
    
  } catch (error) {
    console.error('Error fetching detailed error logs:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch detailed error data' 
    }, { status: 500 })
  }
} 