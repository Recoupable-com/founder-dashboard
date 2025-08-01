import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { runKuraAnalysis } from '@/lib/kuraAnalysis';
import { conversationService } from '@/lib/conversationService';

export async function POST(request: NextRequest) {
  console.log('Starting Kura analysis API endpoint');
  
  try {
    // Check environment variables first
    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY environment variable is not set');
      return NextResponse.json({
        error: 'OpenAI API key not configured',
        details: 'OPENAI_API_KEY environment variable is missing',
        analysis: null
      }, { status: 500 });
    }
    
    const body = await request.json();
    const { 
      limit = 20, 
      excludeTestEmails = true,
      timeFilter = 'Last 7 Days' 
    } = body;

    console.log('Kura analysis parameters:', { limit, excludeTestEmails, timeFilter });

    // Fetch conversation list
    console.log('Fetching conversation list...');
    const conversationList = await conversationService.getConversationList({
      excludeTestEmails,
      timeFilter,
      limit
    });

    console.log('Conversation list result:', {
      found: conversationList.conversations?.length || 0,
      totalCount: conversationList.totalCount,
      error: conversationList.conversations ? null : 'No conversations array'
    });

    if (!conversationList.conversations || conversationList.conversations.length === 0) {
      return NextResponse.json({
        error: 'No conversations found',
        details: `Found ${conversationList.totalCount || 0} total conversations, but none matched the filters`,
        analysis: null
      });
    }

    console.log(`Found ${conversationList.conversations.length} conversations to analyze`);

    // Fetch detailed conversations for analysis
    const conversationDetails = [];
    for (const conv of conversationList.conversations.slice(0, limit)) {
      try {
        const detail = await conversationService.getConversationDetail(conv.room_id);
        if (detail && detail.messages && detail.messages.length > 0) {
          conversationDetails.push(detail);
        }
      } catch (error) {
        console.warn(`Failed to fetch details for conversation ${conv.room_id}:`, error);
      }
    }

    console.log(`Successfully fetched details for ${conversationDetails.length} conversations`);

    if (conversationDetails.length === 0) {
      return NextResponse.json({
        error: 'No conversation details could be fetched',
        analysis: null
      });
    }

    // Run Kura analysis
    console.log('Running Kura analysis...');
    const analysis = await runKuraAnalysis(conversationDetails);
    
    console.log('Kura analysis completed successfully');
    console.log(`Analysis results: ${analysis.summaries.length} summaries, ${analysis.clusters.length} clusters, ${analysis.meta_clusters.length} meta-clusters`);

    return NextResponse.json({
      success: true,
      analysis,
      metadata: {
        total_conversations_analyzed: conversationDetails.length,
        total_conversations_available: conversationList.conversations.length,
        analysis_timestamp: new Date().toISOString()
      }
    });

  } catch (error: unknown) {
    console.error('Error in Kura analysis API:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    // More detailed error information
    let errorDetails = 'Unknown error';
    if (error instanceof Error) {
      errorDetails = `${error.name}: ${error.message}`;
      if (error.stack) {
        console.error('Full stack trace:', error.stack);
      }
    } else {
      errorDetails = String(error);
    }
    
    return NextResponse.json({
      error: 'Failed to run analysis',
      details: errorDetails,
      analysis: null
    }, { status: 500 });
  }
} 