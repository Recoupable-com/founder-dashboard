# CEO Dashboard - Project Overview

This dashboard helps track active users, conversations, and business metrics for the Recoup platform.

## Features

1. **Active Users Tracking**: Monitor daily, weekly, and monthly active users
2. **Conversation Analytics**: Track room conversations, message counts, and user engagement
3. **Sales Pipeline**: Manage customer pipeline with MRR tracking and forecasting
4. **Error Logging**: Track and analyze system errors from Telegram integration
5. **User Analysis**: Deep dive into individual user behavior and engagement patterns
6. **Agent Template Analytics**: Track usage of agent templates and user adoption

## Architecture

- **Frontend**: Next.js 15.2.4 with TypeScript and React 18.3.1
- **Backend**: Next.js API routes connecting to Supabase
- **Database**: Supabase (PostgreSQL)
- **Styling**: Tailwind CSS with custom UI components
- **Authentication**: Privy integration

## Key Files and Components

### Pages
- `/`: Main dashboard with metrics overview
- `/conversations`: Detailed conversation analytics and user activity
- `/sales-pipeline`: Customer pipeline management
- `/agent-templates`: Agent template usage analytics and tracking
- `/analytics`: Analytics dashboard with PMF churn and model switch analysis
- `/model-switch-analysis`: Dedicated page for monitoring scheduled action completion patterns and model switch impact

### API Routes

#### Core Analytics
- `/api/active-users`: Get active user counts for different time periods
- `/api/active-users-chart`: Chart data for active users over time
- `/api/conversations`: Paginated conversation listings with filters
- `/api/conversations/[roomId]`: Individual conversation details
- `/api/conversations/leaderboard`: User activity leaderboard
- `/api/conversations/message-counts`: Message count aggregations

#### Agent Template Tracking
- `/api/agent-template-usage`: Analyze which agent templates are being used by matching prompts from user memories to template prompts. Provides usage statistics, user adoption, and timeline data.

#### Error Management
- `/api/error-logs`: Retrieve and analyze system error logs
- `/api/telegram-webhook`: Webhook endpoint for Telegram error reporting
- `/api/sync-telegram-errors`: Manual sync of errors from Telegram

#### User Analytics
- `/api/power-users`: Identify and track power users based on activity
- `/api/power-users-chart`: Chart data for power user trends
- `/api/pmf-survey-ready`: Users ready for PMF surveys
- `/api/pmf-churn-users`: Track users who were PMF-ready but are no longer (PMF churn analysis)
- `/api/model-switch-impact-analysis`: Analyzes the impact of the July 28th Claude→Gemini model switch on scheduled actions and user behavior. Enhanced to include user emails and artist names for comprehensive scheduled action tracking
- `/api/user-activity-details`: Detailed user activity breakdown
- `/api/user-activity-trend`: User activity trends over time

#### Sales Pipeline
- `/api/customers/update`: Update customer information in pipeline

### Components

#### Dashboard Components
- `MetricCard`: Reusable metric display with tooltip support
- `ActiveUsersChart`: Chart component for active user visualization
- `PMFChurnAnalysis`: Component for analyzing and displaying PMF user churn with sorting and detailed user information
- `ModelSwitchAnalysis`: Comprehensive dashboard for monitoring scheduled action completion patterns, continuation prompts, and model switch impact analysis
- `ScheduledActionsTable`: Table component displaying all scheduled actions with user emails, artist names, prompts, schedules, and execution status
- `AutoRefresh`: Automatic data refresh functionality
- `ConnectionStatus`: Database connection monitoring

#### Conversation Components
- `ConversationList`: Paginated conversation listings
- `ConversationDetail`: Individual conversation view
- `ConversationFilters`: Filter controls for conversations
- `UserFilter`: User-specific filtering
- `SearchAndFilters`: Combined search and filter interface

#### Pipeline Components
- `PipelineBoard`: Kanban-style pipeline view
- `PipelineColumn`: Individual pipeline columns
- `CustomerCard`: Customer information display
- `CustomerFormModal`: Customer editing interface

#### UI Components
- `Navigation`: Main navigation bar
- `Modal`: Reusable modal component
- `Switch`: Toggle component
- Various form components (Button, Input, Select, etc.)

### Data Services

#### Database Functions
- `src/lib/supabase.ts`: Supabase client configuration and connection
- `src/lib/databaseFunctions.ts`: Database utility functions
- `src/lib/customerService.ts`: Customer-related database operations

#### Business Logic
- `src/lib/conversationService.ts`: Conversation data processing
- `src/lib/kuraAnalysis.ts`: User behavior analysis
- `src/lib/userOrgMatcher.ts`: User organization matching
- `src/lib/finance.ts`: Financial calculations and MRR tracking

### Types and Interfaces
- `src/lib/types.ts`: Shared TypeScript interfaces
- `src/types/customer.ts`: Customer-specific type definitions

## Agent Template Tracking System

### Overview
The agent template tracking system analyzes user behavior to identify when users are using predefined agent templates vs. creating custom prompts. This provides valuable insights into template adoption and user preferences.

### How It Works
1. **Template Identification**: Fetches all templates from the `agent_templates` table
2. **Prompt Matching**: Analyzes the first user message in each room to identify template usage
3. **Matching Algorithm**: Uses text normalization and 80% word overlap similarity to match user input to template prompts
4. **Analytics**: Provides usage statistics, user adoption rates, and timeline data

### Key Features
- **Usage Statistics**: Count of how many times each template has been used
- **User Adoption**: Track unique users and artists using templates
- **Timeline Analysis**: First and last usage dates for each template
- **Sample Data**: Example rooms where templates were used
- **Time Filtering**: Analyze usage over different time periods
- **Caching**: 5-minute cache for performance optimization

### Technical Implementation
- **API Endpoint**: `/api/agent-template-usage`
- **Frontend Page**: `/agent-templates`
- **Matching Logic**: Handles various content formats (string, JSONB, arrays)
- **Performance**: Batched queries and reasonable limits to protect production database

## Database Schema

### Core Tables
- `active_users`: User activity tracking
- `rooms`: Conversation rooms with user and artist associations
- `memories`: Individual messages within rooms
- `accounts`: User account information
- `account_emails`: User email mappings
- `artists`: Artist profile information

### Agent Template Tables
- `agent_templates`: Predefined agent template prompts and metadata
  - Used for tracking which templates users are adopting
  - Contains template titles, prompts, categories, and creation dates

### Pipeline Tables
- `sales_pipeline_customers`: Customer pipeline management
- `error_logs`: System error tracking and analysis

## Configuration

### Environment Variables
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key for admin operations
- `NEXT_PUBLIC_PRIVY_APP_ID`: Privy application ID
- `PRIVY_API_KEY`: Privy API key

### Development Setup
1. Install dependencies: `npm install`
2. Configure environment variables
3. Set up Supabase connection
4. Run development server: `npm run dev`

## Recent Updates
- Added agent template usage tracking and analytics
- Implemented comprehensive prompt matching algorithm
- Created dedicated agent templates dashboard page
- Added navigation support for agent template analytics
- Enhanced caching for better performance
- Integrated time-based filtering for template usage analysis



