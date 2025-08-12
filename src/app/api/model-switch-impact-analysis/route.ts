import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  try {
    // Define our analysis period - looking at recent data to understand current patterns
    // Since July 28, 2025 is in the future, let's analyze recent memory patterns first
    const now = new Date();
    const endDate = now.toISOString().split('T')[0];   // Today
    const start = new Date(now);
    start.setDate(start.getDate() - 14); // Last 14 days
    const startDate = start.toISOString().split('T')[0];
    
    // We'll still prepare for the July 28 analysis framework
    const switchDate = '2025-07-28';
    
    console.log(`🔍 Analyzing recent memory patterns from ${startDate} to ${endDate}`);
    console.log(`📅 Framework prepared for switch date: ${switchDate} (when it happens)`);
    console.log(`📊 This will help us understand current scheduled action patterns`);

    // Get all memories in our analysis period, joining with rooms to get account_id
    const { data: memories, error: memoriesError } = await supabaseAdmin
      .from('memories')
      .select(`
        id, 
        room_id, 
        content, 
        updated_at,
        rooms!inner(account_id)
      `)
      .gte('updated_at', `${startDate}T00:00:00.000Z`)
      .lte('updated_at', `${endDate}T23:59:59.999Z`)
      .order('updated_at', { ascending: true });

    if (memoriesError) {
      console.error('Error fetching memories:', memoriesError);
      return NextResponse.json({ 
        error: 'Failed to fetch memories',
        details: memoriesError 
      }, { status: 500 });
    }

    console.log(`📊 Found ${memories?.length || 0} memories in analysis period`);

    // If no memories found, let's check what date ranges actually exist
    if (memories?.length === 0) {
      console.log('🔍 No memories found in target period, checking what dates actually exist...');
      
      const { data: sampleMemories, error: sampleError } = await supabaseAdmin
        .from('memories')
        .select('updated_at')
        .order('updated_at', { ascending: false })
        .limit(10);
        
      if (!sampleError && sampleMemories?.length > 0) {
        console.log('📅 Recent memory dates found:', sampleMemories.map(m => m.updated_at));
      }
    }

    // Get all scheduled actions
    const { data: scheduledActions, error: scheduledError } = await supabaseAdmin
      .from('scheduled_actions')
      .select('*')
      .order('last_run', { ascending: false, nullsFirst: false });

    // Get account emails
    const { data: accountEmails } = await supabaseAdmin
      .from('account_emails')
      .select('account_id, email');

    // Get artist/account wallet names  
    const { data: artistNames } = await supabaseAdmin
      .from('account_wallets')
      .select('account_id, name');

    if (scheduledError) {
      console.error('Error fetching scheduled actions:', scheduledError);
      return NextResponse.json({ 
        error: 'Failed to fetch scheduled actions',
        details: scheduledError 
      }, { status: 500 });
    }

    console.log(`📋 Found ${scheduledActions?.length || 0} total scheduled actions`);

    // Filter to actions that ran in our analysis period
    const actionsInPeriod = scheduledActions?.filter(action => {
      if (!action.last_run) return false;
      const lastRun = new Date(action.last_run);
      const start = new Date(`${startDate}T00:00:00.000Z`);
      const end = new Date(`${endDate}T23:59:59.999Z`);
      return lastRun >= start && lastRun <= end;
    }) || [];

    console.log(`📊 Found ${actionsInPeriod.length} scheduled actions that ran in analysis period`);

    // Create lookup maps for emails and artist names
    const emailMap = new Map(accountEmails?.map(e => [e.account_id, e.email]) || []);
    const artistMap = new Map(artistNames?.map(a => [a.account_id, a.name]) || []);

    // Enrich scheduled actions with user emails and artist names
    const enrichedScheduledActions = scheduledActions?.map(action => ({
      ...action,
      user_email: emailMap.get(action.account_id) || null,
      artist_name: artistMap.get(action.artist_account_id) || null
    })) || [];

    // Analyze scheduled actions with proper room/memory tracking
    const analysis = await analyzeScheduledActions(actionsInPeriod, switchDate, supabaseAdmin);
    
    // Prepare response
    const response = {
      analysisePeriod: {
        start: startDate,
        end: endDate,
        switchDate: switchDate
      },
      summary: {
        totalMemories: memories?.length || 0,
        preSwitch: analysis.preSwitchActions.length,
        postSwitch: analysis.postSwitchActions.length,
        scheduledActionsTableExists: true,
        totalScheduledActions: scheduledActions?.length || 0,
        actionsInPeriod: actionsInPeriod.length
      },
      patterns: analysis.patterns,
      suspiciousMemories: analysis.suspiciousMemories,
      examples: {
        completeActions: analysis.completeActions,
        incompleteActions: analysis.incompleteActions,
        continuationPrompts: analysis.continuationPrompts
      },
      userImpact: analysis.userImpact,
      scheduledActions: enrichedScheduledActions,
      actionsInPeriod: actionsInPeriod,
      actionDetails: analysis.actionDetails
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Error in model switch analysis:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Removed unused Memory interface

interface ScheduledAction {
  id: string;
  title: string;
  prompt: string;
  schedule: string;
  account_id: string;
  artist_account_id: string;
  enabled: boolean;
  last_run: string;
  next_run: string;
  created_at: string;
  updated_at: string;
}

type ActionDetail = {
  action: ScheduledAction;
  room_id?: string;
  completion_status: 'complete' | 'incomplete' | 'no_room_found';
  email_sent: boolean;
  has_continuation_prompt: boolean;
  memory_count: number;
  last_message_excerpt?: string;
  account_email?: string;
  artist_name?: string;
};

async function analyzeScheduledActions(
  actions: ScheduledAction[],
  switchDate: string,
  supabaseClient: SupabaseClient
) {
  const switchDateTime = new Date(`${switchDate}T00:00:00.000Z`);
  
  console.log(`🔍 Analyzing ${actions.length} scheduled actions`);
  
  // Split actions by switch date
  const preSwitchActions = actions.filter(action => {
    return action.last_run && new Date(action.last_run) < switchDateTime;
  });
  const postSwitchActions = actions.filter(action => {
    return action.last_run && new Date(action.last_run) >= switchDateTime;
  });

  console.log(`📊 Pre-switch actions: ${preSwitchActions.length}, Post-switch: ${postSwitchActions.length}`);

  // Analysis arrays
  const actionDetails: Array<{
    action: ScheduledAction;
    room_id?: string;
    completion_status: 'complete' | 'incomplete' | 'no_room_found';
    email_sent: boolean;
    has_continuation_prompt: boolean;
    memory_count: number;
    last_message_excerpt?: string;
    account_email?: string;
    artist_name?: string;
  }> = [];

  const completeActions: Array<{
    id: string;
    account_id: string;
    updated_at: string;
    excerpt: string;
    hasEmailSent: boolean;
    title: string;
    account_email?: string;
  }> = [];

  const incompleteActions: Array<{
    id: string;
    account_id: string;
    updated_at: string;
    excerpt: string;
    reason: string;
    title: string;
  }> = [];

  const continuationPrompts: Array<{
    id: string;
    account_id: string;
    updated_at: string;
    excerpt: string;
    title: string;
  }> = [];

  const suspiciousMemories: Array<{
    id: string;
    account_id: string;
    updated_at: string;
    reason: string;
    excerpt: string;
    isPreSwitch: boolean;
  }> = [];

  // Email patterns for completion detection
  const emailPatterns = [
    'sending email',
    'email sent',
    'sendgrid',
    'mailto',
    'email to',
    'sending report'
  ];

  // Continuation patterns for issues
  const continuationPatterns = [
    'would you like me to continue',
    'do you want me to continue',
    'shall i continue',
    'continue with',
    'would you like me to proceed',
    'should i proceed',
    'would you like to continue'
  ];

  // Get account emails for better reporting
  const { data: accountEmails, error: emailError } = await supabaseClient
    .from('account_emails')
    .select('account_id, email');

  if (emailError) {
    console.warn('Could not fetch account emails:', emailError);
  }

  const emailMap = new Map(accountEmails?.map(e => [e.account_id, e.email]) || []);

  // Analyze each scheduled action
  for (const action of actions) {
    console.log(`🔍 Analyzing action: ${action.title} (last run: ${action.last_run})`);
    
    if (!action.last_run) {
      console.log(`⚠️ Action ${action.id} has never run`);
      continue;
    }

    // Find room created around the time this action ran (within 5 minutes)
    const lastRunTime = new Date(action.last_run);
    const timeWindow = 5 * 60 * 1000; // 5 minutes in milliseconds
    const startTime = new Date(lastRunTime.getTime() - timeWindow);
    const endTime = new Date(lastRunTime.getTime() + timeWindow);

    const { data: rooms, error: roomError } = await supabaseClient
      .from('rooms')
      .select('id, account_id, updated_at')
      .eq('account_id', action.account_id)
      .gte('updated_at', startTime.toISOString())
      .lte('updated_at', endTime.toISOString())
      .order('updated_at', { ascending: false })
      .limit(1);

    if (roomError) {
      console.error(`Error finding room for action ${action.id}:`, roomError);
      continue;
    }

    const actionDetail: ActionDetail = {
      action: action,
      completion_status: 'no_room_found' as const,
      email_sent: false,
      has_continuation_prompt: false,
      memory_count: 0,
      account_email: emailMap.get(action.account_id)
    };

    if (rooms && rooms.length > 0) {
      const room = rooms[0];
      actionDetail.room_id = room.id;

      // Get memories from this room
      const { data: memories, error: memoryError } = await supabaseClient
        .from('memories')
        .select('id, content, updated_at')
        .eq('room_id', room.id)
        .order('updated_at', { ascending: true });

      if (!memoryError && memories) {
        actionDetail.memory_count = memories.length;
        
        // Analyze memories for completion and issues
        let emailSent = false;
        let hasContinuation = false;
        let lastMemoryContent = '';

        for (const memory of memories) {
          const contentStr = typeof memory.content === 'string' 
            ? memory.content.toLowerCase()
            : JSON.stringify(memory.content).toLowerCase();
          
          lastMemoryContent = contentStr;

          // Check for email completion
          if (emailPatterns.some(pattern => contentStr.includes(pattern))) {
            emailSent = true;
          }

          // Check for continuation prompts
          if (continuationPatterns.some(pattern => contentStr.includes(pattern))) {
            hasContinuation = true;
            
            const isPreSwitch = new Date(action.last_run) < switchDateTime;
            
            continuationPrompts.push({
              id: memory.id,
              account_id: action.account_id,
              updated_at: memory.updated_at,
              excerpt: contentStr.substring(0, 200) + '...',
              title: action.title
            });

            suspiciousMemories.push({
              id: memory.id,
              account_id: action.account_id,
              updated_at: memory.updated_at,
              reason: 'Contains continuation prompt during scheduled action',
              excerpt: contentStr.substring(0, 200) + '...',
              isPreSwitch
            });
          }
        }

        actionDetail.email_sent = emailSent;
        actionDetail.has_continuation_prompt = hasContinuation;
        actionDetail.last_message_excerpt = lastMemoryContent.substring(0, 300) + '...';
        actionDetail.completion_status = emailSent ? 'complete' : 'incomplete';

        // Add to appropriate arrays
        if (emailSent) {
          completeActions.push({
            id: action.id,
            account_id: action.account_id,
            updated_at: action.last_run,
            excerpt: lastMemoryContent.substring(0, 200) + '...',
            hasEmailSent: true,
            title: action.title,
            account_email: emailMap.get(action.account_id)
          });
        } else {
          incompleteActions.push({
            id: action.id,
            account_id: action.account_id,
            updated_at: action.last_run,
            excerpt: lastMemoryContent.substring(0, 200) + '...',
            reason: hasContinuation ? 'Action stopped at continuation prompt' : 'No email sent confirmation found',
            title: action.title
          });
        }
      }
    }

    actionDetails.push(actionDetail);
  }

  // Calculate user impact (accounts with significant completion rate drops)
  const accountStats = new Map<string, { pre: number; post: number; preComplete: number; postComplete: number }>();
  
  for (const detail of actionDetails) {
    const accountId = detail.action.account_id;
    const isPreSwitch = new Date(detail.action.last_run) < switchDateTime;
    
    if (!accountStats.has(accountId)) {
      accountStats.set(accountId, { pre: 0, post: 0, preComplete: 0, postComplete: 0 });
    }
    
    const stats = accountStats.get(accountId)!;
    if (isPreSwitch) {
      stats.pre++;
      if (detail.completion_status === 'complete') stats.preComplete++;
    } else {
      stats.post++;
      if (detail.completion_status === 'complete') stats.postComplete++;
    }
  }

  const userImpact = Array.from(accountStats.entries()).map(([accountId, stats]) => {
    const preRate = stats.pre > 0 ? stats.preComplete / stats.pre : 0;
    const postRate = stats.post > 0 ? stats.postComplete / stats.post : 0;
    const change = postRate - preRate;
    const significantDrop = stats.pre > 0 && stats.post > 0 && change < -0.3; // 30% drop
    
    return {
      account_id: accountId,
      preSwitch: stats.pre,
      postSwitch: stats.post,
      preCompleteRate: preRate,
      postCompleteRate: postRate,
      change: change,
      percentChange: preRate > 0 ? (change / preRate * 100) : 0,
      significantDrop
    };
  }).filter(u => u.preSwitch > 0 || u.postSwitch > 0)
    .sort((a, b) => a.change - b.change);

  console.log(`✅ Analysis complete: ${completeActions.length} complete, ${incompleteActions.length} incomplete, ${continuationPrompts.length} continuation prompts`);

  return {
    preSwitchActions,
    postSwitchActions,
    patterns: {
      continuationPromptsFound: continuationPrompts.length,
      scheduledActionsFound: actions.length,
      completeActionsFound: completeActions.length,
      incompleteActionsFound: incompleteActions.length,
      suspiciousMemoriesFound: suspiciousMemories.length
    },
    suspiciousMemories: suspiciousMemories.slice(0, 20),
    completeActions: completeActions.slice(0, 10),
    incompleteActions: incompleteActions.slice(0, 10),
    continuationPrompts: continuationPrompts.slice(0, 10),
    userImpact: userImpact.slice(0, 20),
    actionDetails
  };
}