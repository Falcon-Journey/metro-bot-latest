# Metropolitan Shuttle Bot - Architecture Documentation

## Overview

The Metropolitan Shuttle Bot is a Next.js application that provides an AI-powered interface for shuttle booking and trip information retrieval. It leverages AWS Bedrock agents, Lambda functions, and various AWS services to deliver a conversational experience.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Layer                            │
├─────────────────────────────────────────────────────────────────┤
│  Next.js Frontend (React/TypeScript)                            │
│  ├── /chat          - Booking chat interface                   │
│  ├── /voice         - Voice interaction interface              │
│  ├── /retrieve      - Trip retrieval interface                 │
│  └── /admin         - Administration panel                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Next.js API Routes                          │
├─────────────────────────────────────────────────────────────────┤
│  /api/bedrock-agent              - Retrieve agent invocation    │
│  /api/bedrock-booking-agent      - Booking agent with Lambda    │
│  /api/knowledge-bases/*          - KB management                 │
│  /api/guardrails/*               - Guardrails management         │
│  /api/analytics                  - Metrics & monitoring         │
│  /api/s3/*                       - File operations              │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┴─────────────────────┐
        ▼                                           ▼
┌───────────────────────┐              ┌───────────────────────┐
│   AWS Bedrock Agents  │              │   AWS Lambda          │
├───────────────────────┤              ├───────────────────────┤
│ Booking Agent         │              │ metroAthenaQueryHandler│
│ - Converse API        │◄─────────────┤ - Trip parsing        │
│ - Tool integration    │              │ - Geocoding           │
│ - State management    │              │ - Athena queries      │
│                       │              │ - Price estimation    │
│ Retrieve Agent        │              └───────────────────────┘
│ - Knowledge Base      │                        │
│ - Vector search       │                        │
│ - RAG retrieval       │                        ▼
└───────────────────────┘              ┌───────────────────────┐
        │                               │   AWS Services        │
        │                               ├───────────────────────┤
        ▼                               │ - Athena (Glue DB)    │
┌───────────────────────┐              │ - Location Service    │
│   AWS Services        │              │ - S3 (Data Storage)    │
├───────────────────────┤              │ - CloudWatch          │
│ - Bedrock Runtime     │              └───────────────────────┘
│ - Knowledge Bases     │
│ - Guardrails          │
│ - S3 (KB Storage)     │
└───────────────────────┘
```

## Core Components

### 1. Frontend Application

**Technology Stack:**
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **UI Library**: React 18
- **Styling**: Tailwind CSS
- **Components**: shadcn/ui, Radix UI
- **Voice**: Web Speech API, Nova Sonic (AWS)

**Key Pages:**
- **`/chat`**: Text-based booking interface with speech recognition
- **`/voice`**: Voice-first interaction with real-time audio streaming
- **`/retrieve`**: Dedicated retrieval interface for trip information
- **`/admin`**: Administrative dashboard for system management

### 2. API Layer

#### Bedrock Agent Routes

**`/api/bedrock-agent`** (Retrieve Mode)
- Handles knowledge base retrieval queries
- Uses Bedrock Agent Runtime API
- Streams responses to client
- Supports session management

**`/api/bedrock-booking-agent`** (Booking Mode)
- Integrates with Bedrock Converse API
- Manages conversation state
- Invokes Lambda functions for tool execution
- Handles complex booking workflows

#### Knowledge Base Management

**`/api/knowledge-bases`**
- List, create, and manage Bedrock Knowledge Bases
- File upload and management
- S3 integration for document storage

#### Guardrails Management

**`/api/guardrails`**
- List and configure AWS Bedrock Guardrails
- Content filtering and safety controls

#### Analytics

**`/api/analytics`**
- CloudWatch metrics integration
- Token usage tracking
- Latency monitoring
- Invocation statistics

### 3. AWS Bedrock Agents

#### Booking Agent

**Purpose**: Handle shuttle booking requests through natural conversation

**Capabilities**:
- Natural language understanding
- Multi-turn conversation management
- Tool invocation (Lambda functions)
- State tracking (passenger count, dates, locations, etc.)

**Tool Integration**:
- `metroAthenaQueryHandler` Lambda function for price estimation
- Extracts trip details from conversation
- Queries historical data for pricing

**Conversation Flow**:
1. User initiates booking request
2. Agent extracts booking parameters
3. Invokes Lambda for price estimation
4. Presents pricing and booking options
5. Collects additional information as needed
6. Confirms booking details

#### Retrieve Agent

**Purpose**: Answer questions about past bookings and trip information

**Capabilities**:
- Knowledge base retrieval (RAG)
- Vector similarity search
- Context-aware responses
- Source citation

**Knowledge Base Integration**:
- Queries Bedrock Knowledge Bases
- Retrieves relevant documents
- Synthesizes answers from multiple sources

### 4. Lambda Function: metroAthenaQueryHandler

**Location**: AWS Lambda (Python 3.x)

**Purpose**: Process trip queries, geocode addresses, and estimate pricing based on historical data

#### Architecture Flow

```
User Query
    │
    ▼
┌─────────────────────────────────────┐
│ 1. LLM Trip Parser                  │
│    - Uses Bedrock Claude model     │
│    - Extracts structured data:      │
│      • pickup_address              │
│      • dropoff_address             │
│      • passengers                  │
│      • trip_type                   │
│      • days                        │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ 2. Geocoding Service                │
│    - AWS Location Service           │
│    - Converts addresses to lat/lng │
│    - Handles geocoding errors      │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ 3. Athena Query                     │
│    - Queries Glue database          │
│    - Calculates distance using     │
│      Haversine formula              │
│    - Filters by distance threshold │
│    - Orders by proximity           │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ 4. Price Estimation                 │
│    - Filters by passenger count    │
│    - Calculates average price      │
│    - Provides price range          │
│    - Falls back to distance calc   │
│      if no matches found           │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ 5. Response Formatting              │
│    - Structures response for agent  │
│    - Includes metadata             │
│    - Error handling                │
└─────────────────────────────────────┘
```

#### Key Functions

**`parse_trip(user_query)`**
- Uses Bedrock Claude model to extract structured trip information
- Returns JSON with pickup/dropoff addresses, passenger count, trip type, and days

**`geocode(address)`**
- Uses AWS Location Service `search_place_index_for_text`
- Returns latitude/longitude coordinates
- Handles geocoding failures gracefully

**`run_athena(sql)`**
- Executes SQL queries against AWS Glue database
- Polls for query completion
- Returns result rows
- Handles timeouts and errors

**`calculate_fallback_estimate(pickup_lat, pickup_lng, drop_lat, drop_lng)`**
- Calculates distance using Haversine formula
- Applies base fare + per-mile pricing
- Returns estimated price with range

#### Environment Variables

```python
GLUE_DATABASE          # AWS Glue database name
GLUE_TABLE             # Glue table name for trip data
ATHENA_OUTPUT          # S3 bucket for Athena query results
LOCATION_INDEX         # AWS Location Service place index name
BEDROCK_MODEL          # Bedrock model ID (e.g., anthropic.claude-3-5-sonnet-20241022-v2:0)
```

#### Distance Calculation

The function uses the Haversine formula to calculate distances between coordinates:

```sql
3959 * ACOS(
    LEAST(1,
        COS(RADIANS(pickup_lat)) *
        COS(RADIANS({pickup_lat})) *
        COS(RADIANS(pickup_lng) - RADIANS({pickup_lng})) +
        SIN(RADIANS(pickup_lat)) *
        SIN(RADIANS({pickup_lat}))
    )
) AS pickup_distance_miles
```

#### Filtering Logic

1. **Distance Threshold**: 30 miles maximum (configurable via `MAX_DISTANCE_THRESHOLD`)
2. **Passenger Similarity**: Prioritizes trips with similar passenger counts
3. **Sorting**: Orders by:
   - Total distance (pickup + dropoff)
   - Passenger count difference

#### Response Format

**Success Response**:
```json
{
  "success": true,
  "query": "user query text",
  "pickup_address": "address",
  "dropoff_address": "address",
  "passengers": "15",
  "trip_type": "one-way",
  "average_estimated_price": 450.00,
  "price_range": {
    "min": 400.00,
    "max": 500.00
  },
  "estimated_distance": 120.5,
  "historical_records_used": 5,
  "currency": "USD",
  "estimation_method": "historical",
  "max_distance_threshold": 30,
  "historical_trips": [...],
  "note": "Estimate based on 5 historical trips...",
  "disclaimer": "Final pricing may vary..."
}
```

**Fallback Response** (no historical matches):
```json
{
  "success": true,
  "estimation_method": "calculated",
  "average_estimated_price": 300.00,
  "price_range": {...},
  "historical_records_used": 0,
  "note": "No similar trips found. Estimate based on distance."
}
```

### 5. Data Flow

#### Booking Flow

```
User Input (Chat/Voice)
    │
    ▼
Next.js API Route (/api/bedrock-booking-agent)
    │
    ▼
Bedrock Converse API
    │
    ├─► Conversation State Management
    │
    └─► Tool Invocation (Lambda)
            │
            ▼
        metroAthenaQueryHandler
            │
            ├─► LLM Parsing (Bedrock)
            ├─► Geocoding (Location Service)
            ├─► Data Query (Athena/Glue)
            └─► Price Calculation
            │
            ▼
        Response to Agent
            │
            ▼
        Streamed to Client
```

#### Retrieve Flow

```
User Query (/retrieve)
    │
    ▼
Next.js API Route (/api/bedrock-agent)
    │
    ▼
Bedrock Agent Runtime (Retrieve Agent)
    │
    ├─► Knowledge Base Query
    │   ├─► Vector Search
    │   ├─► Semantic Retrieval
    │   └─► Document Ranking
    │
    └─► Response Generation
        │
        ▼
    Streamed to Client
```

### 6. AWS Services Integration

#### AWS Bedrock
- **Runtime API**: Model inference
- **Agent Runtime**: Agent orchestration
- **Converse API**: Multi-turn conversations
- **Knowledge Bases**: RAG capabilities
- **Guardrails**: Content safety

#### AWS Lambda
- **metroAthenaQueryHandler**: Trip query processing
- Invoked by Bedrock agent as a tool
- Returns structured JSON responses

#### AWS Athena
- Queries historical trip data
- Uses AWS Glue Data Catalog
- Results stored in S3

#### AWS Glue
- Data catalog for trip history
- Table schema management
- Query optimization

#### AWS Location Service
- Address geocoding
- Place index for text search
- Coordinate conversion

#### AWS S3
- Knowledge base document storage
- Athena query results
- Voice audio files
- File uploads

#### AWS CloudWatch
- Metrics collection
- Logging
- Monitoring and alerting

### 7. State Management

#### Booking Agent State

The booking agent tracks conversation state including:
- Customer name and email
- Group size category (small/medium/large)
- Number of passengers
- Pickup and dropoff locations
- Service date
- Trip direction (one-way/round trip)
- Return date and time

State is maintained across conversation turns using Bedrock's conversation management.

### 8. Error Handling

#### Frontend
- Graceful error messages
- Retry mechanisms
- Fallback UI states

#### API Routes
- Try-catch blocks
- Error logging
- Structured error responses

#### Lambda Function
- Exception handling
- Validation checks
- Fallback calculations
- Error response formatting

### 9. Security Considerations

- **Authentication**: Admin routes protected with password
- **AWS Credentials**: Environment variables (use IAM roles in production)
- **API Security**: Next.js API route protection
- **Guardrails**: Content filtering via Bedrock Guardrails
- **Data Privacy**: Secure handling of customer information

### 10. Performance Optimization

- **Streaming**: Real-time response streaming for better UX
- **Caching**: Session-based caching where appropriate
- **Connection Pooling**: AWS SDK connection reuse
- **Query Optimization**: Athena query optimization
- **CDN**: Static asset delivery (if deployed on Vercel/CloudFront)

### 11. Monitoring & Analytics

- **CloudWatch Metrics**: Agent invocations, token usage, latency
- **Custom Analytics**: Application-level metrics
- **Error Tracking**: Comprehensive error logging
- **Usage Statistics**: User interaction tracking

### 12. Deployment Considerations

#### Environment Variables
All sensitive configuration should be stored as environment variables:
- AWS credentials
- Agent IDs and aliases
- S3 bucket names
- Database names

#### Production Best Practices
- Use AWS IAM roles instead of access keys
- Enable CloudWatch logging
- Set up monitoring alerts
- Implement rate limiting
- Use HTTPS everywhere
- Regular security audits

## Future Enhancements

- Multi-language support
- Advanced analytics dashboard
- Integration with booking systems
- Mobile app support
- Enhanced voice capabilities
- Real-time booking confirmation
- Payment processing integration

