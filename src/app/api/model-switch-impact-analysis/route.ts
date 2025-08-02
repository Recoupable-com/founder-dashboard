import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: NextRequest) {
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

    // Check if scheduled_actions table exists
    const { data: scheduledActions, error: scheduledError } = await supabaseAdmin
      .from('scheduled_actions')
      .select('*')
      .gte('created_at', `${startDate}T00:00:00.000Z`)
      .lte('created_at', `${endDate}T23:59:59.999Z`)
      .order('created_at', { ascending: true });

    if (scheduledError && !scheduledError.message.includes('does not exist')) {
      console.error('Error fetching scheduled actions:', scheduledError);
    }

    // Analyze memories for scheduled action patterns
    const analysis = analyzeMemories(memories || [], switchDate);
    
    // Prepare response
    const response = {
      analysisePeriod: {
        start: startDate,
        end: endDate,
        switchDate: switchDate
      },
      summary: {
        totalMemories: memories?.length || 0,
        preSwitch: analysis.preSwitchMemories.length,
        postSwitch: analysis.postSwitchMemories.length,
        scheduledActionsTableExists: !scheduledError,
        totalScheduledActions: scheduledActions?.length || 0
      },
      patterns: analysis.patterns,
      suspiciousMemories: analysis.suspiciousMemories,
      examples: {
        completeActions: analysis.completeActions,
        incompleteActions: analysis.incompleteActions,
        continuationPrompts: analysis.continuationPrompts
      },
      userImpact: analysis.userImpact,
      scheduledActions: scheduledActions || []
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

interface Memory {
  id: string;
  room_id: string;
  content: unknown;
  updated_at: string;
  rooms: {
    account_id: string;
  };
}

function analyzeMemories(memories: Memory[], switchDate: string) {
  const switchDateTime = new Date(`${switchDate}T00:00:00.000Z`);
  
  // Split memories by switch date
  const preSwitchMemories = memories.filter(m => new Date(m.created_at) < switchDateTime);
  const postSwitchMemories = memories.filter(m => new Date(m.created_at) >= switchDateTime);

  // Patterns to look for
  const continuationPatterns = [
    'would you like me to continue',
    'do you want me to continue',
    'shall i continue',
    'continue with',
    'would you like me to proceed',
    'should i proceed',
    'would you like to continue'
  ];

  const scheduledActionPatterns = [
    'scheduled',
    'report',
    'daily',
    'weekly',
    'monthly',
    'automation',
    'job',
    'task'
  ];

  const emailPatterns = [
    'sending email',
    'email sent',
    'sendgrid',
    'mailto',
    'email to',
    'sending report'
  ];

  // Analyze each memory
  const suspiciousMemories: Array<{
    id: string;
    account_id: string;
    updated_at: string;
    reason: string;
    excerpt: string;
    isPreSwitch: boolean;
  }> = [];

  const completeActions: Array<{
    id: string;
    account_id: string;
    updated_at: string;
    excerpt: string;
    hasEmailSent: boolean;
  }> = [];

  const incompleteActions: Array<{
    id: string;
    account_id: string;
    updated_at: string;
    excerpt: string;
    reason: string;
  }> = [];

  const continuationPrompts: Array<{
    id: string;
    account_id: string;
    updated_at: string;
    excerpt: string;
  }> = [];

  const userActivityCounts: { [accountId: string]: { pre: number; post: number } } = {};

  for (const memory of memories) {
    const isPreSwitch = new Date(memory.updated_at) < switchDateTime;
    
    // Handle content - could be string or object
    let contentStr: string;
    try {
      if (typeof memory.content === 'string') {
        contentStr = memory.content.toLowerCase();
      } else {
        contentStr = JSON.stringify(memory.content).toLowerCase();
      }
    } catch (error) {
      console.warn(`Error processing content for memory ${memory.id}:`, error);
      contentStr = String(memory.content || '').toLowerCase();
    }
    
    // Count user activity
    const accountId = memory.rooms.account_id;
    if (!userActivityCounts[accountId]) {
      userActivityCounts[accountId] = { pre: 0, post: 0 };
    }
    if (isPreSwitch) {
      userActivityCounts[accountId].pre++;
    } else {
      userActivityCounts[accountId].post++;
    }

    // Look for continuation prompts (major red flag for Gemini)
    const hasContinuation = continuationPatterns.some(pattern => 
      contentStr.includes(pattern)
    );

    if (hasContinuation) {
      continuationPrompts.push({
        id: memory.id,
        account_id: accountId,
        updated_at: memory.updated_at,
        excerpt: contentStr.substring(0, 200) + '...'
      });

      suspiciousMemories.push({
        id: memory.id,
        account_id: accountId,
        updated_at: memory.updated_at,
        reason: 'Contains continuation prompt - likely incomplete action',
        excerpt: contentStr.substring(0, 200) + '...',
        isPreSwitch
      });
    }

    // Look for scheduled actions
    const hasScheduledAction = scheduledActionPatterns.some(pattern => 
      contentStr.includes(pattern)
    );

    if (hasScheduledAction) {
      const hasEmailSent = emailPatterns.some(pattern => 
        contentStr.includes(pattern)
      );

      if (hasEmailSent) {
        completeActions.push({
          id: memory.id,
          account_id: accountId,
          updated_at: memory.updated_at,
          excerpt: contentStr.substring(0, 200) + '...',
          hasEmailSent
        });
      } else if (!isPreSwitch) {
        // Post-switch scheduled action without email = suspicious
        incompleteActions.push({
          id: memory.id,
          account_id: accountId,
          updated_at: memory.updated_at,
          excerpt: contentStr.substring(0, 200) + '...',
          reason: 'Scheduled action without email completion'
        });

        suspiciousMemories.push({
          id: memory.id,
          account_id: accountId,
          updated_at: memory.updated_at,
          reason: 'Post-switch scheduled action without email completion',
          excerpt: contentStr.substring(0, 200) + '...',
          isPreSwitch
        });
      }
    }
  }

  // Calculate user impact
  const userImpact = Object.entries(userActivityCounts)
    .map(([accountId, counts]) => ({
      account_id: accountId,
      preSwitch: counts.pre,
      postSwitch: counts.post,
      change: counts.post - counts.pre,
      percentChange: counts.pre > 0 ? ((counts.post - counts.pre) / counts.pre * 100) : 0,
      significantDrop: counts.pre > 5 && counts.post < counts.pre * 0.5 // 50% drop for active users
    }))
    .sort((a, b) => a.change - b.change); // Most impacted first

  return {
    preSwitchMemories,
    postSwitchMemories,
    patterns: {
      continuationPromptsFound: continuationPrompts.length,
      scheduledActionsFound: completeActions.length + incompleteActions.length,
      completeActionsFound: completeActions.length,
      incompleteActionsFound: incompleteActions.length,
      suspiciousMemoriesFound: suspiciousMemories.length
    },
    suspiciousMemories: suspiciousMemories.slice(0, 20), // Top 20 most suspicious
    completeActions: completeActions.slice(0, 10), // Examples
    incompleteActions: incompleteActions.slice(0, 10), // Examples  
    continuationPrompts: continuationPrompts.slice(0, 10), // Examples
    userImpact: userImpact.slice(0, 20) // Top 20 most impacted users
  };
}