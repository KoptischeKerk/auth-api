# Boilerplate Authentication API Documentation

This base repository contains a rock-solid, production-ready authentication loop built with Hono, Prisma, and TypeScript. It features case-insensitive user lookups, global JWT middleware verification, and an automated Fort Knox brute-force protection system with scaling lockouts.

---

## 🚀 Getting Started with Prisma

Prisma is used as the Object-Relational Mapper (ORM) to interact with the database. Follow these guides to manage your database schema and migrations across environments.

### 🛠️ 1. Development Environment

In development, your database runs inside a local Docker container (`docker-compose`). Use prototyping commands to rapidly iterate on your schema.

1. **Start your infrastructure containers:**
   ```bash
    docker compose -f compose.yml -f compose.dev.yml up --build
   ```

2. **Run migrations or push schema changes:**
   * **For prototyping (fast, non-production sync):**
     ```bash
     npx prisma db push
     ```
   * **To create a structured SQL migration file (recommended):**
     ```bash
     npx prisma migrate dev --name init_auth_system
     ```

3. **Open Prisma Studio (GUI data browser):**
   ```bash
   npx prisma studio
   ```

### 📦 2. Production Environment

In production, you never run `migrate dev` or `db push` as they can cause accidental data loss. Instead, use automated deployment migrations via multi-stage Docker builds or your CI/CD pipeline.

1. **Start your infrastructure containers:**
   ```bash
   docker compose up -d
   ```

2. **Apply existing migration files to the production DB:**
   ```bash
   npx prisma migrate deploy
   ```

3. **Generate the Prisma Client optimized for production:**
   This command should be executed during your multi-stage Docker container build phase (`Containerfile` / `Dockerfile`).
   ```bash
   npx prisma generate
   ```

---
