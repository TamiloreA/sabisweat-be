# SabiSweat Backend

Backend API for SabiSweat built with Node.js, TypeScript, Supabase, and an MVC architecture.

## Tech Stack

- **Runtime:** Node.js
- **Language:** TypeScript
- **Framework:** Express.js
- **Database:** Supabase (PostgreSQL)
- **Documentation:** Swagger / OpenAPI
- **Formatting:** Prettier

## Project Structure

```
sabisweat-backend/
├── src/
│   ├── config/         # Configuration files (database, swagger)
│   ├── controllers/    # Request handlers
│   ├── models/         # Data models and types
│   ├── routes/         # API route definitions
│   ├── services/       # Business logic
│   ├── middleware/     # Express middleware
│   ├── utils/          # Utility functions
│   ├── types/          # Shared TypeScript types
│   ├── app.ts          # Express app configuration
│   └── server.ts       # Server entry point
├── tests/              # Test files
├── package.json
├── tsconfig.json
└── .prettierrc
```

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Copy the environment file and fill in your Supabase credentials:

```bash
cp .env.example .env
```

3. Run in development mode:

```bash
npm run dev
```

4. Open Swagger documentation at:

```
http://localhost:5000/api-docs
```

## Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Start production server
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check code formatting
- `npm test` - Run tests
