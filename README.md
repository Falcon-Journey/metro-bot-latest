# Metropolitan Shuttle Bot

A Next.js-based AI-powered shuttle booking and trip retrieval assistant built with AWS Bedrock, featuring conversational AI agents, knowledge base integration, and voice interaction capabilities.

## 🚀 Features

- **Dual Agent System**
  - **Booking Agent**: Handles shuttle booking requests with natural language processing
  - **Retrieve Agent**: Answers questions about past bookings and trip details using knowledge base retrieval

- **Multiple Interaction Modes**
  - **Chat Interface** (`/chat`): Text-based conversation with speech recognition support
  - **Voice Interface** (`/voice`): Voice-first interaction with real-time audio streaming
  - **Retrieve Mode** (`/retrieve`): Dedicated interface for trip information retrieval

- **Knowledge Base Management**
  - Create and manage AWS Bedrock Knowledge Bases
  - Upload and manage documents (S3-based)
  - Vector search and semantic retrieval

- **Guardrails & Safety**
  - AWS Bedrock Guardrails integration
  - Content filtering and safety controls

- **Analytics Dashboard**
  - Real-time metrics and usage statistics
  - CloudWatch integration for monitoring

- **Admin Panel**
  - System configuration and management
  - Knowledge base administration

## 📋 Prerequisites

- Node.js 18+ and npm/yarn
- AWS Account with appropriate permissions
- AWS Bedrock access
- Environment variables configured (see Configuration section)

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd metro-bot-latest
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   Create a `.env.local` file in the root directory with the following variables:
   ```env
   # AWS Configuration
   AWS_REGION=us-east-1
   AWS_ACCESS_KEY_ID=your-access-key
   AWS_SECRET_ACCESS_KEY=your-secret-key

   # Bedrock Agent IDs
   BEDROCK_BOOKING_AGENT_ID=your-booking-agent-id
   BEDROCK_BOOKING_AGENT_ALIAS_ID=your-booking-agent-alias-id
   BEDROCK_RETRIEVE_AGENT_ID=your-retrieve-agent-id
   BEDROCK_RETRIEVE_AGENT_ALIAS_ID=your-retrieve-agent-alias-id

   # Bedrock Model
   BEDROCK_MODEL=anthropic.claude-3-5-sonnet-20241022-v2:0

   # S3 Configuration
   AWS_VOICE_BUCKET=your-voice-bucket-name
   AWS_KNOWLEDGE_BASE_BUCKET=your-kb-bucket-name

   # Admin
   NEXT_PUBLIC_ADMIN_PASSWORD=your-admin-password
   ```

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   Navigate to `http://localhost:3000`

## 📁 Project Structure

```
metro-bot-latest/
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   │   ├── bedrock-agent/          # Bedrock agent invocation
│   │   ├── bedrock-booking-agent/   # Booking agent with Lambda integration
│   │   ├── knowledge-bases/        # KB management endpoints
│   │   ├── guardrails/             # Guardrails management
│   │   ├── analytics/              # Analytics endpoints
│   │   └── s3/                     # S3 file operations
│   ├── chat/              # Chat interface page
│   ├── voice/             # Voice interface page
│   ├── retrieve/          # Retrieve mode page
│   └── admin/             # Admin panel
├── components/            # React components
│   ├── knowledge-base/   # KB management UI
│   ├── ui/               # shadcn/ui components
│   └── voice-mode-ui.tsx # Voice interaction component
├── hooks/                 # Custom React hooks
├── lib/                   # Utility libraries
│   ├── bedrock-kb-client.ts  # Knowledge base client
│   └── nova-sonic-client.ts  # Voice streaming client
└── src/                   # Core source files
    ├── client.ts         # Bedrock client utilities
    └── types.ts          # TypeScript type definitions
```

## 🔧 Configuration

### AWS Bedrock Agents

The application uses two Bedrock agents:

1. **Booking Agent**: Handles booking requests and integrates with Lambda functions for trip pricing
2. **Retrieve Agent**: Answers questions using knowledge base retrieval

### Lambda Function Integration

The booking agent integrates with the `metroAthenaQueryHandler` Lambda function for:
- Parsing trip requests using LLM
- Geocoding addresses using AWS Location Service
- Querying historical trip data from Athena
- Calculating price estimates based on historical data

See `ARCHITECTURE.md` for detailed information about the Lambda function.

## 🎯 Usage

### Chat Interface

1. Navigate to `/chat`
2. Type or speak your booking request
3. The booking agent will guide you through the booking process
4. Use quick suggestions for common queries

### Voice Interface

1. Navigate to `/voice`
2. Click the microphone to start voice interaction
3. Speak your request naturally
4. The system streams responses in real-time

### Retrieve Mode

1. Navigate to `/retrieve`
2. Ask questions about past bookings or trip details
3. The system retrieves relevant information from knowledge bases

### Admin Panel

1. Navigate to `/admin`
2. Enter admin password
3. Manage knowledge bases, guardrails, and view analytics

## 🔌 API Endpoints

### Bedrock Agent
- `POST /api/bedrock-agent` - Invoke Bedrock agent (retrieve mode)
- `POST /api/bedrock-booking-agent` - Invoke booking agent with Lambda integration

### Knowledge Bases
- `GET /api/knowledge-bases` - List all knowledge bases
- `POST /api/knowledge-bases/create` - Create a new knowledge base
- `POST /api/knowledge-bases/[kbId]/files` - Upload file to knowledge base

### Guardrails
- `GET /api/guardrails` - List all guardrails
- `GET /api/guardrails/[id]` - Get guardrail details

### Analytics
- `GET /api/analytics?range=day|week|month` - Get usage analytics

### S3
- `GET /api/s3/get?type=voice&prefix=...` - List S3 objects
- `POST /api/s3/upload` - Upload file to S3

## 🧪 Development

### Running Locally

```bash
npm run dev
```

### Building for Production

```bash
npm run build
npm start
```

### Linting

```bash
npm run lint
```

## 🔒 Security

- Admin routes are protected with password authentication
- AWS credentials should be stored securely (use AWS IAM roles in production)
- Environment variables should never be committed to version control

## 📊 Monitoring

The application integrates with AWS CloudWatch for:
- Agent invocation metrics
- Token usage tracking
- Latency monitoring
- Error tracking

View analytics in the admin panel at `/admin`.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📝 License

[Specify your license here]

## 🆘 Support

For issues and questions:
- Check the `ARCHITECTURE.md` for system design details
- Review AWS Bedrock documentation
- Contact the development team

## 🔄 Version History

- **v0.1.0** - Initial release with booking and retrieve agents
- Current version supports dual agent system, knowledge base management, and voice interaction

