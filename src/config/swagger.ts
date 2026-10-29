import swaggerJsdoc from 'swagger-jsdoc';
import { Application } from 'express';
import swaggerUi from 'swagger-ui-express';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'SabiSweat API',
      version: '1.0.0',
      description: 'API documentation for the SabiSweat backend',
    },
    servers: [
      {
        url: 'https://sabisweat-be.onrender.com/api/v1',
        description: 'Production Server (/api/v1)',
      },
      {
        url: 'http://localhost:4000/api/v1',
        description: 'Local Development Server (/api/v1)',
      },
      {
        url: 'https://sabisweat-be.onrender.com',
        description: 'Production Server (Root)',
      },
      {
        url: 'http://localhost:4000',
        description: 'Local Development Server (Root)',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter the accessToken from /auth/login response',
        },
      },
      schemas: {
        ChallengeProgress: {
          type: 'object',
          properties: {
            steps: { type: 'integer', example: 45000 },
            distanceMeters: { type: 'integer', example: 36000 },
            percent: { type: 'number', example: 45 },
            todaySteps: { type: 'integer', example: 8500 },
            daysCompleted: { type: 'integer', example: 5 },
            daysCompletedRaw: { type: 'integer', example: 5 },
            bonusDaysAdded: { type: 'integer', example: 0 },
            challengeTotalDays: { type: 'integer', example: 30 },
            evaluatedDays: { type: 'integer', example: 10 },
            daysRemaining: { type: 'integer', example: 20 },
          },
        },
        ChallengeHost: {
          type: 'object',
          properties: {
            name: { type: 'string', example: 'Ekò Runners Club' },
            logoUrl: { type: 'string', nullable: true, example: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b' },
            clubId: { type: 'string', nullable: true, example: '43bf4206-8d65-4f35-985e-5bb49dfa68c0' },
          },
        },
        Challenge: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', example: 'd3b07384-d113-4a0b-a63e-6d9b3a3d2427' },
            title: { type: 'string', example: 'ERC 5K Daily Run' },
            subtitle: { type: 'string', example: 'Keep moving and log your 5K daily' },
            description: { type: 'string', example: 'Complete a 5K run daily for a week hosted by Ekò Runners Club.' },
            rewardText: { type: 'string', example: '500 Sabi Coins' },
            rewardId: { type: 'string', nullable: true, example: 'badge_01' },
            heroImageBase64: { type: 'string', nullable: true, example: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b', description: 'Hero image URL' },
            challengeImage: { type: 'string', nullable: true },
            rules: {
              type: 'array',
              items: { type: 'string' },
              example: ['Must complete at least 5,000 steps per day', 'Steps tracked via the app only'],
            },
            goals: {
              type: 'array',
              items: { type: 'string' },
              example: ['Complete 5,000 steps every day for 7 consecutive days'],
            },
            host: { $ref: '#/components/schemas/ChallengeHost' },
            sponsorText: { type: 'string', nullable: true },
            cityTag: { type: 'string', nullable: true, example: 'Lagos' },
            country: { type: 'string', nullable: true, example: 'Nigeria' },
            region: { type: 'string', nullable: true, example: 'Lagos' },
            startAt: { type: 'string', format: 'date-time', example: '2026-10-10T00:00:00.000Z' },
            endAt: { type: 'string', format: 'date-time', example: '2026-10-17T23:59:59.000Z' },
            goalType: { type: 'string', example: 'steps' },
            goalValue: { type: 'integer', example: 5000 },
            participantsCount: { type: 'integer', example: 42 },
            maxParticipants: { type: 'integer', nullable: true, example: 500 },
            joined: { type: 'boolean', example: false },
            joinedAt: { type: 'string', format: 'date-time', nullable: true },
            eligible: { type: 'boolean', example: false },
            canClaim: { type: 'boolean', example: false },
            claimedAt: { type: 'string', format: 'date-time', nullable: true },
            progress: { $ref: '#/components/schemas/ChallengeProgress' },
            whoCanJoin: { type: 'string', enum: ['everyone', 'club_members'], example: 'everyone' },
            leaderboardVisibility: { type: 'string', enum: ['public', 'private'], example: 'public' },
          },
        },
        ClubCountry: {
          type: 'object',
          properties: {
            country: { type: 'string', example: 'Nigeria' },
            countryCode: { type: 'string', example: 'NG' },
            regions: {
              type: 'array',
              items: { type: 'string' },
              example: ['Lagos', 'Abuja, FCT'],
            },
          },
        },
        Club: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', example: 'd3b07384-d113-4a0b-a63e-6d9b3a3d2427' },
            clubId: { type: 'string', example: '@the_movers' },
            name: { type: 'string', example: 'The Movers' },
            description: { type: 'string', example: 'A community for weekend runners and fitness enthusiasts.' },
            tag: { type: 'string', example: 'brand' },
            locationScope: { type: 'string', enum: ['single', 'multiple', 'global'], example: 'single' },
            locationText: { type: 'string', example: 'Lagos, Nigeria' },
            country: { type: 'string', nullable: true, example: 'Nigeria' },
            countryCode: { type: 'string', nullable: true, example: 'NG' },
            regions: {
              type: 'array',
              items: { type: 'string' },
              example: ['Lagos', 'Abuja, FCT'],
            },
            countries: {
              type: 'array',
              nullable: true,
              items: { $ref: '#/components/schemas/ClubCountry' },
            },
            coverImageUrl: { type: 'string', nullable: true },
            profileImageUrl: { type: 'string', nullable: true },
            theme: { type: 'string', example: 'green' },
            status: { type: 'string', example: 'approved' },
            membersCount: { type: 'integer', example: 12 },
            joinStatus: { type: 'string', enum: ['joined', 'pending', 'none'], example: 'joined' },
            isAdmin: { type: 'boolean', example: false },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        WeeklyReportReportingPeriod: {
          type: 'object',
          properties: {
            weekStartDate: { type: 'string', example: '2026-10-18' },
            weekEndDate: { type: 'string', example: '2026-10-24' },
            isCurrentWeek: { type: 'boolean', example: false },
            daysElapsed: { type: 'integer', example: 7 },
          },
        },
        WeeklyReportSummary: {
          type: 'object',
          properties: {
            totalSteps: { type: 'integer', example: 68420 },
            totalDistanceKm: { type: 'number', example: 48.2 },
            totalActiveCalories: { type: 'number', example: 2450 },
            dailyGoalSteps: { type: 'integer', example: 8000 },
            daysGoalAchieved: { type: 'integer', example: 5 },
          },
        },
        WeeklyReportComparison: {
          type: 'object',
          properties: {
            stepsChangePercent: { type: 'number', example: 12.5 },
            distanceChangePercent: { type: 'number', example: 8.3 },
            caloriesChangePercent: { type: 'number', example: 15.0 },
            hasPriorWeekBaseline: { type: 'boolean', example: true },
          },
        },
        WeeklyReportCommunityRank: {
          type: 'object',
          properties: {
            topPercentage: { type: 'integer', nullable: true, example: 28 },
            totalEligibleUsers: { type: 'integer', example: 142 },
          },
        },
        WeeklyReportDailyBreakdown: {
          type: 'object',
          properties: {
            date: { type: 'string', example: '2026-10-18' },
            dayOfWeek: { type: 'string', example: 'Sun' },
            steps: { type: 'integer', example: 9200 },
            distanceKm: { type: 'number', example: 6.5 },
            activeCalories: { type: 'number', example: 340 },
            isGoalMet: { type: 'boolean', example: true },
          },
        },
        WeeklyReportHighlights: {
          type: 'object',
          properties: {
            bestDay: {
              type: 'object',
              properties: {
                date: { type: 'string', example: '2026-10-20' },
                dayOfWeek: { type: 'string', example: 'Tue' },
                steps: { type: 'integer', example: 12400 },
              },
            },
            dailyAverageSteps: { type: 'integer', example: 9774 },
          },
        },
        WeeklyReportResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'success' },
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                reportingPeriod: { $ref: '#/components/schemas/WeeklyReportReportingPeriod' },
                summary: { $ref: '#/components/schemas/WeeklyReportSummary' },
                comparison: { $ref: '#/components/schemas/WeeklyReportComparison' },
                communityRank: { $ref: '#/components/schemas/WeeklyReportCommunityRank' },
                dailyBreakdown: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/WeeklyReportDailyBreakdown' },
                },
                highlights: { $ref: '#/components/schemas/WeeklyReportHighlights' },
              },
            },
          },
        },
      },
    },
  },
  apis: ['./src/routes/*.ts'],
};

const specs = swaggerJsdoc(options);

export const setupSwagger = (app: Application): void => {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));
};

export default setupSwagger;
