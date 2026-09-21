import { PrismaClient } from '@prisma/client'

export const prisma = new PrismaClient(
  process.env.DATABASE_URL ? { datasourceUrl: process.env.DATABASE_URL } : undefined
)
