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

1. **Apply existing migration files to the production DB:**
   ```bash
   npx prisma migrate deploy
   ```
2. **Generate the Prisma Client optimized for production:**
   This command should be executed during your multi-stage Docker container build phase (`Containerfile` / `Dockerfile`).
   ```bash
   npx prisma generate
   ```

---

## 🔑 Global Authentication Policy

All protected endpoints in this API require Bearer Token authentication. You must include your JSON Web Token (JWT) in the request headers.

*   **Header Key:** `Authorization`
*   **Header Value:** `Bearer <your_jwt_token>`

### Example Request Header
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## 🛣️ API Endpoints

### 📝 1. User Registration (Signup)
Register a new user account with default security counters initialized.

*   **URL:** `/api/v1/auth/register`
*   **Method:** `POST`
*   **Headers:** 
    *   `Content-Type: application/json`

#### Request Body
```json
{
  "username": "myusername",
  "email": "my@e.mail",
  "password": "mypassword",
  "name": "John Doe"
}
```

#### Response (201 Created)
```json
{
    "success": true,
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjbXFwcHZleHkwMDAwMmhtaHI0bGdwZmM2IiwidXNlcm5hbWUiOiJqb2huMyIsInJvbGUiOiJ1c2VyIiwiZXhwIjoxNzgyMTY2NjYxLCJ0b2tlblVlcm5hbWUiOiIwIn0.D_5__W5ic60-m_qPVpAk0dIMC1ObXW4-PSdK5Oeb_9U",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjbXFwcHZleHkwMDAwMmhtaHI0bGdwZmM2IiwidXNlcm5hbWUiOiJqb2huMyIsInJvbGUiOiJ1c2VyIiwiZXhwIjoxNzgyNzY3ODYxLCJyZWZyZXNoVG9rZW5WZXJzaW9uIjowfQ.-7_cLK8NmkCb9UJZ3DG79mY6FYfNsz5aTanseNy5cM8"
}
```

---

### 🔐 2. Authenticate User (Login)
Submit user credentials to receive authentication and refresh tokens. Features automatic account locking after 5 failed attempts.

*   **URL:** `/api/v1/auth/login`
*   **Method:** `POST`
*   **Headers:** 
    *   `Content-Type: application/json`

#### Request Body
```json
{
  "identifier": "my-username-or-email",
  "password": "mypassword"
}
```

#### Responses
*   **200 OK (Success):**
    ```json
    {
        "success": true,
        "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjbXFwbHpseXUwMDAybTlueXowOXN4N2RpIiwidXNlcm5hbWUiOiJ0ZXN0Iiwicm9sZSI6InVzZXIiLCJleHAiOjE3ODIxNjY2MDEsInRva2VuVmVyc2lvbiI6MTF9.jkkrItAMo1zLpdDXdmv_Psj9ZW7a4UFNU1sYFGeCOR8",
        "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjbXFwbHpseXUwMDAybTlueXowOXN4N2RpIiwidXNlcm5hbWUiOiJ0ZXN0Iiwicm9sZSI6InVzZXIiLCJleHAiOjE3ODI3Njc4MDEsInJlZnJlc2hUb2tlblZlcnNpb24iOjB9.tqxQKCIpFOGl7-FndwRFFiDyz3GwD8WVmKINodY9i84"
    }
    ```
*   **401 Unauthorized (Invalid Credentials):**
    ```json
    {
      "success": false,
      "message": "Incorrect password. You have 3 attempts remaining."
    }
    ```
*   **429 Too Many Requests (Lockout Triggered):**
    ```json
    {
      "success": false,
      "message": "Too many failed attempts. Account locked for 15 minutes."
    }
    ```
*   **423 Locked (Active Timeout Block):**
    ```json
    {
      "success": false,
      "message": "Account is temporarily locked. Please try again in 12 minutes."
    }
    ```

---

### 🛡️ 3. Validate JWT & Get User Session (`/me`)
Check the validity of the current session token and determine if a frontend proactive token refresh is required.

*   **URL:** `/api/v1/auth/me`
*   **Method:** `GET`
*   **Headers:** 
    *   `Authorization: Bearer <your_jwt_token>`

#### Response (200 OK)
```json
{
    "valid": true,
    "refresh": false
}
```

---

### 🔄 4. Refresh Authentication Token
Submit a valid refresh token to rotate or obtain a brand new short-lived access token (`accessToken`) without requiring full re-authentication.

*   **URL:** `/api/v1/auth/refresh`
*   **Method:** `POST`
*   **Headers:** 
    *   `Content-Type: application/json`
    *   `Authorization: Bearer <your_jwt_token>`

#### Request Body
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### Response (200 OK)
```json
{
    "success": true,
    "rotated": false,
    "accessToken": "ey..."
}
```
