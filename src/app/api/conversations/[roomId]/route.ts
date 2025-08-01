import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Define types for content processing
interface ContentPart {
  text?: string; 
  content?: string;
  type?: string;
  reasoning?: string;
  state?: string;
  parts?: ContentPart[];
  details?: Array<{text: string, type: string}>;
  [key: string]: unknown;
}

interface MemoryContent {
  role?: string;
  content?: string;
  parts?: ContentPart[];
  reasoning?: string;
  [key: string]: unknown;
}

export const dynamic = 'force-dynamic';

// Extract roomId from the path
function getRoomIdFromPath(url: string): string {
  const parts = url.split('/');
  const roomId = parts[parts.length - 1];
  return roomId;
}

// Function to check if an account is a test account
function isTestAccount(accountId: string, email: string, artistName?: string): boolean {
  // Check if email contains @example.com or +
  if (email.includes('@example.com') || email.includes('+')) {
    return true;
  }
  
  // Check for test artist name
  if (artistName === 'sweetman_eth') {
    return true;
  }
  
  // Check for specific test wallet account patterns
  const testWalletPatterns = ['3cdea198', '5ada04cd', '44b0c8fd', 'c9e86577', '496a071a', 'a3b8a5ba'];
  if (testWalletPatterns.some(pattern => accountId.includes(pattern))) {
    return true;
  }
  
  return false;
}

// API route for fetching conversation details by room ID
export async function GET(request: Request) {
  try {
    // Extract roomId from URL path instead of using params
    const url = request.url;
    const roomId = getRoomIdFromPath(url);

    if (!roomId) {
      return NextResponse.json({ error: 'Room ID is required' }, { status: 400 });
    }

    console.log('API: Fetching conversation detail for room:', roomId);
    
    // Step 1: Get the room details
    const { data: roomData, error: roomError } = await supabaseAdmin
      .from('rooms')
      .select('id, account_id, artist_id, updated_at, topic')
      .eq('id', roomId)
      .single();
    
    if (roomError) {
      console.error('API: Error fetching room:', roomError);
      return NextResponse.json(createFallbackConversationDetail(roomId));
    }
    
    if (!roomData) {
      console.log('API: Room not found:', roomId);
      return NextResponse.json(createFallbackConversationDetail(roomId));
    }
    
    // Get user name from accounts table
    console.log('API: Fetching account name');
    const { data: accountData, error: accountError } = await supabaseAdmin
      .from('accounts')
      .select('name')
      .eq('id', roomData.account_id)
      .single();
    
    if (accountError) {
      console.error('API: Error fetching account name:', accountError);
    }
    
    // Get real email from account_emails table
    console.log('API: Fetching account email');
    const { data: emailData, error: emailError } = await supabaseAdmin
      .from('account_emails')
      .select('email')
      .eq('account_id', roomData.account_id)
      .single();
    
    if (emailError) {
      console.error('API: Error fetching account email:', emailError);
    }
    
    // Use the account name or a default placeholder
    const accountName = accountData?.name || roomData.account_id.substring(0, 8);
    // Use real email if available, otherwise create a placeholder
    const accountEmail = emailData?.email || `${accountName}@example.com`;
    
    // Get artist name from accounts table using the artist_id directly from the room
    const artistId = roomData.artist_id || 'Unknown Artist';
    let artistName = artistId;
    
    if (artistId !== 'Unknown Artist') {
      console.log('API: Fetching artist name from accounts table');
      const { data: artistAccount, error: artistAccountError } = await supabaseAdmin
        .from('accounts')
        .select('name')
        .eq('id', artistId)
        .single();
        
      if (artistAccountError) {
        console.error('API: Error fetching artist account:', artistAccountError);
      } else if (artistAccount) {
        artistName = artistAccount.name;
      }
    }
    
    // CHECK IF THIS IS A TEST ACCOUNT AND RETURN 404 IF SO (after getting artist name)
    if (isTestAccount(roomData.account_id, accountEmail, artistName)) {
      console.log('API: Blocking test account conversation:', roomData.account_id, accountEmail, 'artist:', artistName);
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }
    
    // Step 1.5: Check if this is a segment room
    const { data: segmentRoom } = await supabaseAdmin
      .from('segment_rooms')
      .select('segment_id')
      .eq('room_id', roomId)
      .single();

    let segmentReport = null;
    let segmentReportTimestamp = null;
    if (segmentRoom && segmentRoom.segment_id) {
      // Fetch the segment report
      const { data: reportData } = await supabaseAdmin
        .from('segment_reports')
        .select('report, next_steps, updated_at')
        .eq('id', segmentRoom.segment_id)
        .single();
      if (reportData) {
        segmentReport = reportData;
        segmentReportTimestamp = reportData.updated_at;
      }
    }

    // Step 4: Get messages for this room
    let messagesData = [];
    let messagesError = null;
    if (segmentReport && segmentReportTimestamp) {
      // Only fetch messages after the segment report
      const result = await supabaseAdmin
        .from('memories')
        .select('id, content, updated_at')
        .eq('room_id', roomId)
        .gt('updated_at', segmentReportTimestamp)
        .order('updated_at', { ascending: true });
      messagesData = result.data || [];
      messagesError = result.error;
    } else {
      // Regular room: fetch all messages
      const result = await supabaseAdmin
        .from('memories')
        .select('id, content, updated_at')
        .eq('room_id', roomId)
        .order('updated_at', { ascending: true });
      messagesData = result.data || [];
      messagesError = result.error;
    }
    
    if (messagesError) {
      console.error('API: Error fetching messages:', messagesError);
    }
    
    // Map messages to the expected format but set a default role since it doesn't exist in DB
    // Also properly handle the JSONB content field
    let messages = messagesData ? messagesData.map(msg => {
      // Extract the appropriate text from the JSONB content field
      let messageText = 'Empty message';
      let messageRole = 'assistant';
      let reasoningText = '';
      
      // Format tool names as code in messages and reasoning
      const formatToolNames = (text: string): string => {
        // List of tool names to format as code
        const toolNames = [
          'perplexity_ask', 
          'perplexity_reason', 
          'get_artist_fans', 
          'get_artist_posts',
          'supabase'
        ];
        
        // Replace each tool name with the backtick-wrapped version
        let formattedText = text;
        for (const tool of toolNames ?? []) {
          // Use regex to match the tool name as a whole word
          const regex = new RegExp(`\b${tool}\b`, 'g');
          formattedText = formattedText.replace(regex, `\`${tool}\``);
        }
        
        return formattedText;
      };
      
      // Handle different content formats
      if (msg.content) {
        // If content is a simple string, use it directly
        if (typeof msg.content === 'string') {
          messageText = msg.content;
        } 
        // Handle complex object structure
        else if (typeof msg.content === 'object') {
          // Extract role if available
          if (msg.content.role && typeof msg.content.role === 'string') {
            messageRole = msg.content.role;
          }
          
          // First, try to extract reasoning text if available
          if (msg.content.reasoning && typeof msg.content.reasoning === 'string') {
            reasoningText = msg.content.reasoning;
          }
          // Also check for reasoning in parts array (AISDK V5 structure)
          else if (msg.content.parts && Array.isArray(msg.content.parts)) {
            // Enhanced recursive reasoning extraction for complex nested structures
            const extractReasoningFromParts = (parts: ContentPart[]): string[] => {
              const reasoningTexts: string[] = [];
              
              for (const part of parts) {
                if (typeof part === 'object' && part !== null) {
                  // Direct reasoning from type="reasoning" parts
                  if (part.type === 'reasoning' && part.text && typeof part.text === 'string') {
                    reasoningTexts.push(part.text);
                  }
                  // Reasoning from state="done" parts
                  else if (part.type === 'reasoning' && part.state === 'done' && part.text && typeof part.text === 'string') {
                    reasoningTexts.push(part.text);
                  }
                  // Recursively search nested parts arrays
                  else if (part.parts && Array.isArray(part.parts)) {
                    reasoningTexts.push(...extractReasoningFromParts(part.parts));
                  }
                }
              }
              
              return reasoningTexts;
            };
            
            const extractedReasoning = extractReasoningFromParts(msg.content.parts);
            
            if (extractedReasoning.length > 0) {
              reasoningText = extractedReasoning.join('\n\n');
            }
          }
          
          // Check if content is corrupted with "[object Object]" and force enhanced extraction
          if (typeof msg.content.content === 'string' && msg.content.content.includes('[object Object]')) {
            // Force enhanced extraction for corrupted content
            if (msg.content.parts && Array.isArray(msg.content.parts)) {
              const extractAllText = (obj: unknown): string[] => {
                const texts: string[] = [];
                
                if (typeof obj === 'string' && obj !== '[object Object]' && obj.trim().length > 0) {
                  texts.push(obj);
                } else if (Array.isArray(obj)) {
                  for (const item of obj) {
                    texts.push(...extractAllText(item));
                  }
                } else if (typeof obj === 'object' && obj !== null) {
                  // Look for text fields specifically
                  if (obj.text && typeof obj.text === 'string' && obj.text !== '[object Object]') {
                    texts.push(obj.text);
                  }
                  if (obj.content && typeof obj.content === 'string' && obj.content !== '[object Object]') {
                    texts.push(obj.content);
                  }
                  
                  // Recursively search all object properties
                  for (const value of Object.values(obj)) {
                    texts.push(...extractAllText(value));
                  }
                }
                
                return texts;
              };
              
              const allTexts = extractAllText(msg.content.parts);
              // Filter out very short texts, URLs, IDs, and duplicates
              const meaningfulTexts = [...new Set(allTexts)]
                .filter(text => 
                  text.length > 10 && 
                  !text.includes('spotify:') && 
                  !text.includes('https://') &&
                  !text.includes('api.spotify.com') &&
                  !text.includes('"id":') &&
                  !text.includes('"href":') &&
                  !text.startsWith('tool-') &&
                  !text.match(/^[a-f0-9-]{36}$/) // Filter out UUIDs
                );
              
              if (meaningfulTexts.length > 0) {
                messageText = meaningfulTexts.slice(0, 3).join('\n\n'); // Use enhanced extraction
              }
            }
          }
          // First try: Direct content field (usually clean user-facing text)
          else if (typeof msg.content.content === 'string' && 
              !msg.content.content.includes('perplexity_ask')) {
            messageText = msg.content.content;
          }
          // Second try: Look for text-type parts that aren't reasoning
          else if (msg.content.parts && Array.isArray(msg.content.parts)) {
            // Enhanced recursive text extraction for complex nested structures
            const extractTextFromParts = (parts: ContentPart[]): string[] => {
              const texts: string[] = [];
              
              for (const part of parts) {
                if (typeof part === 'string') {
                  texts.push(part);
                } else if (typeof part === 'object' && part !== null) {
                  // Direct text from type="text" parts
                  if (part.type === 'text' && part.text && typeof part.text === 'string') {
                    texts.push(part.text);
                  }
                  // Text from state="done" parts
                  else if (part.type === 'text' && part.state === 'done' && part.text && typeof part.text === 'string') {
                    texts.push(part.text);
                  }
                  // Recursively search nested parts arrays
                  else if (part.parts && Array.isArray(part.parts)) {
                    texts.push(...extractTextFromParts(part.parts));
                  }
                  // Handle other text fields
                  else if (part.content && typeof part.content === 'string') {
                    texts.push(part.content);
                  }
                }
              }
              
              return texts;
            };
            
            const extractedTexts = extractTextFromParts(msg.content.parts);
            
            if (extractedTexts.length > 0) {
              messageText = extractedTexts.join('\n\n');
            }
          }
          // Third try: Enhanced extraction as fallback
          else if (!messageText) {
            // For corrupted content fields, try to extract text from any available structure
            if (msg.content.parts && Array.isArray(msg.content.parts)) {
              const extractAllText = (obj: unknown): string[] => {
                const texts: string[] = [];
                
                if (typeof obj === 'string' && obj !== '[object Object]' && obj.trim().length > 0) {
                  texts.push(obj);
                } else if (Array.isArray(obj)) {
                  for (const item of obj) {
                    texts.push(...extractAllText(item));
                  }
                } else if (typeof obj === 'object' && obj !== null) {
                  // Look for text fields specifically
                  if (obj.text && typeof obj.text === 'string' && obj.text !== '[object Object]') {
                    texts.push(obj.text);
                  }
                  if (obj.content && typeof obj.content === 'string' && obj.content !== '[object Object]') {
                    texts.push(obj.content);
                  }
                  
                  // Recursively search all object properties
                  for (const value of Object.values(obj)) {
                    texts.push(...extractAllText(value));
                  }
                }
                
                return texts;
              };
              
              const allTexts = extractAllText(msg.content.parts);
              // Filter out very short texts, URLs, IDs, and duplicates
              const meaningfulTexts = [...new Set(allTexts)]
                .filter(text => 
                  text.length > 10 && 
                  !text.includes('spotify:') && 
                  !text.includes('https://') &&
                  !text.includes('api.spotify.com') &&
                  !text.includes('"id":') &&
                  !text.includes('"href":') &&
                  !text.startsWith('tool-') &&
                  !text.match(/^[a-f0-9-]{36}$/) // Filter out UUIDs
                );
              
              if (meaningfulTexts.length > 0) {
                messageText = meaningfulTexts.slice(0, 3).join('\n\n'); // Limit to first 3 meaningful texts
              }
            }
          }
          // If still no text found, try JSON stringification as last resort
          if (!messageText && Object.keys(msg.content).length > 0) {
            messageText = JSON.stringify(msg.content);
          }
        }
      }
      
      return {
        id: msg.id,
        room_id: roomId,
        content: formatToolNames(messageText), // Format tool names in content
        role: messageRole, // Use extracted role or default
        reasoning: formatToolNames(reasoningText), // Format tool names in reasoning
        created_at: msg.updated_at // Using updated_at as the timestamp
      };
    }) : [];
    
    // If this is a segment room, prepend the segment report as a special message
    if (segmentReport && segmentReportTimestamp) {
      messages = [
        {
          id: 'segment-report',
          room_id: roomId,
          content: `${segmentReport.report}${segmentReport.next_steps ? `\n\nNext Steps:\n${segmentReport.next_steps}` : ''}`,
          role: 'report',
          reasoning: '',
          created_at: segmentReportTimestamp
        },
        ...messages
      ];
    }
    
    // Build the conversation detail
    const conversationDetail = {
      room_id: roomId,
      account_email: accountEmail, // Using email from accounts table
      account_name: accountName, // Add account name to the response
      artist_name: artistName, // Using actual artist name now
      artist_reference: artistId !== 'Unknown Artist' ? `REF-${artistId.substring(0, 5)}` : 'REF-UNKNOWN',
      topic: roomData.topic || 'New Conversation',
      is_test_account: false,
      messages: messages
    };
    
    return NextResponse.json(conversationDetail);
  } catch (error) {
    console.error('API: Error processing request:', error);
    // Use a safe fallback since we don't have params
    const url = request.url || '';
    const parts = url.split('/');
    const safeRoomId = parts[parts.length - 1] || 'unknown';
    return NextResponse.json(createFallbackConversationDetail(safeRoomId));
  }
}

// Helper function to create fallback conversation detail
function createFallbackConversationDetail(roomId: string) {
  return {
    room_id: roomId,
    account_email: 'user@example.com',
    account_name: 'Demo Account', // Add account name to fallback data
    artist_name: 'Demo Artist',
    artist_reference: 'REF-123',
    topic: 'Fallback Conversation',
    messages: [
      {
        id: 'msg-1',
        room_id: roomId,
        content: 'Hello, how can I help you today?',
        role: 'user',
        reasoning: '',
        created_at: new Date(Date.now() - 3600000).toISOString() // 1 hour ago
      },
      {
        id: 'msg-2',
        room_id: roomId,
        content: 'I can help answer questions about your music and provide guidance on your career.',
        role: 'assistant',
        reasoning: 'The user has started a conversation. I should introduce myself and explain my capabilities. I can use `perplexity_ask` and other tools to provide helpful information.',
        created_at: new Date(Date.now() - 3500000).toISOString() // 58 minutes ago
      },
      {
        id: 'msg-3',
        room_id: roomId,
        content: 'Can you tell me more about streaming platforms?',
        role: 'user',
        reasoning: '',
        created_at: new Date(Date.now() - 1800000).toISOString() // 30 minutes ago
      },
      {
        id: 'msg-4',
        room_id: roomId,
        content: 'Spotify, Apple Music, and other major streaming platforms offer artists various ways to distribute and monetize their music. Each platform has different payout rates and audience demographics.',
        role: 'assistant',
        reasoning: 'The user is asking about streaming platforms. I should provide a high-level overview of the major platforms and their differences. I can use `perplexity_ask` to get data on streaming platforms if needed.',
        created_at: new Date(Date.now() - 1700000).toISOString() // 28 minutes ago
      }
    ]
  };
} 