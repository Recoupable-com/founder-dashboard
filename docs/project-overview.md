# CEO Dashboard - Project Overview

## Architecture Overview

The CEO Dashboard is a Next.js application that provides real-time analytics and error monitoring for the Recoup AI platform. It tracks user activity, conversation metrics, sales pipeline, and error logs through direct Supabase integration.

## Key Components

### Error Logging System
- `/src/lib/supabase/errorLogger.ts`: Direct Supabase error logging helper that logs to the new error_logs table structure (without user_email column)
- `/src/app/api/error-logs/route.ts`: Primary error log aggregation and analytics API that joins error_logs → rooms → account_emails to get user emails for dashboard display
- `/src/app/api/telegram-errors/route.ts`: Legacy endpoint updated to use error_logs table for backward compatibility
- `/src/app/api/add-errors-manual/route.ts`: Manual error insertion API for backfilling historical errors
- `/src/app/api/log-error-direct/route.ts`: Direct error logging endpoint that bypasses Telegram API, updated to work with new table structure
- `/src/app/api/sync-telegram-errors/route.ts`: Enhanced Telegram error sync with comprehensive debugging and support for channels/supergroups
- `/src/app/api/telegram-debug/route.ts`: Comprehensive Telegram bot diagnostics with connection testing and configuration validation

### Analytics & Metrics
- `/src/app/api/active-users/route.ts`: Active user tracking and analytics
- `/src/app/api/conversations/route.ts`: Conversation analytics and message counting with account_id and artist_id tracking, enhanced search through message content
- `/src/app/api/export-chat-history/route.ts`: User chat history export endpoint that generates comprehensive JSON exports of all conversations and messages for individual users
- `/src/app/api/youtube-connections/route.ts`: YouTube connections tracking endpoint that maps youtube_tokens to user emails and provides connection counts and status information
- `/src/app/api/artist-counts-by-email/route.ts`: Artist counts tracking endpoint that maps account_artist_ids to user emails and provides artist count information for leaderboard display
- `/src/app/api/segment-actions/route.ts`: Segment actions tracking endpoint that counts scheduled actions containing "segment" or "segments" in the prompt field for specialized analytics
- `/src/app/api/segment-actions-debug/route.ts`: Debug endpoint for segment actions that shows detailed information including actual prompts, matched text snippets, and user breakdowns for verification
- `/src/components/dashboard/ErrorReport.tsx`: Real-time error reporting component
- `/src/components/MetricsChart.tsx`: General-purpose metrics visualization component
- `/src/components/ConversationList.tsx`: Enhanced conversation management cards displaying account_id and artist_id for better room identification

### Sales Pipeline
- `/src/components/pipeline/PipelineBoard.tsx`: Main sales pipeline visualization
- `/src/components/pipeline/CustomerCard.tsx`: Individual customer card component
- `/src/context/PipelineContext.tsx`: Pipeline state management
- `/src/hooks/useSalesPipelineMRR.ts`: MRR calculations for pipeline customers

### Database Integration
- `/src/lib/supabase.ts`: Supabase client configuration
- `/supabase/migrations/001_create_error_logs_table.sql`: Error logs table schema
- `/migrations/001_create_tables.sql`: Main application tables

## Error Logging Flow

### Automatic Logging (Recommended)
1. **Recoup App** → `sendErrorNotification()` → **CEO Dashboard Supabase**
2. Direct database insertion with `logErrorToSupabase()` helper
3. Immediate tracking without Telegram API limitations
4. Duplicate prevention and proper error categorization

### Manual/Fallback Options
1. **Telegram Sync**: `/api/sync-telegram-errors` (limited by Telegram API)
2. **Manual Addition**: `/api/add-errors-manual` for historical data
3. **Direct API**: `/api/log-error-direct` for external integrations

## Integration Guide

### For Recoup App Integration
1. Install the `errorLogger.ts` helper in your Recoup app
2. Add CEO Dashboard Supabase credentials to environment variables
3. Update existing error notification calls to use dual logging
4. Errors will immediately appear in CEO Dashboard analytics

### Environment Variables Required
```bash
# In Recoup App
CEO_DASHBOARD_SUPABASE_URL=your_ceo_dashboard_url
CEO_DASHBOARD_SUPABASE_ANON_KEY=your_ceo_dashboard_key

# In CEO Dashboard
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_key
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
```

## Key Features

### Real-time Error Tracking
- Immediate error logging to dashboard
- Tool-specific error categorization
- User email and room ID tracking
- Stack trace preservation
- Duplicate prevention

### Analytics Dashboard
- Error rate calculations
- Tool failure analysis
- User activity metrics
- Conversation analytics
- Sales pipeline MRR tracking
- Individual user chat history export as JSON
- YouTube connections tracking and leaderboard sorting

### Responsive Design
- Mobile-friendly pipeline views
- Adaptive customer cards
- Responsive metrics charts
- Touch-friendly interfaces

## Recent Improvements (Sidney/ErrorFix3)

### Error Logging Enhancements
- ✅ Direct Supabase logging to bypass Telegram limitations
- ✅ Enhanced duplicate prevention
- ✅ Comprehensive error categorization
- ✅ Improved debugging and diagnostics
- ✅ Fallback mechanisms for reliability
- ✅ Error loading states when time period changes

### Infrastructure
- ✅ Enhanced Telegram webhook support
- ✅ Comprehensive error parsing
- ✅ Manual error addition capabilities
- ✅ Detailed logging and monitoring

### Conversation Management
- ✅ Enhanced conversation cards with account_id and artist_id display
- ✅ Improved room identification for easier debugging and user tracking
- ✅ Updated API responses to include account_id information
- ✅ Advanced search functionality that searches through user message content in addition to emails, topics, and artist names

### UI/UX Improvements
- ✅ Error dropdown shows loading spinner when time period changes
- ✅ Error rate and breakdown display loading states during data fetch
- ✅ Improved user feedback for error data loading
- ✅ Removed duplicate error dropdown from Product Usage header (kept the one in conversation details section)
- ✅ Leaderboard defaults to "Sort by Errors" for better error visibility
- ✅ Centered modal popup shows detailed error information when clicking any error badge (tool name, error type, timestamp, error message)
- ✅ Modal features dimmed background overlay, scrollable content, and responsive design
- ✅ Both small circular error badges and "Sort by Errors" badges trigger the same modal for consistent UX

## File Structure

```
src/
├── app/
│   ├── api/                    # API endpoints
│   ├── analytics/             # Analytics pages
│   ├── conversations/         # Conversation management
│   └── sales-pipeline/        # Sales pipeline interface
├── components/
│   ├── dashboard/             # Dashboard-specific components
│   ├── pipeline/              # Pipeline components
│   └── ui/                    # Reusable UI components
├── lib/
│   ├── supabase/              # Supabase utilities
│   └── utils.ts               # General utilities
└── types/                     # TypeScript type definitions
```

**Current Status**: System migrated to use new error_logs table structure. Table exists but is empty - needs to be populated with error data to show results in dashboard.



