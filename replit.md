# Allotly — The AI Spend Control Plane

## Overview
Allotly is a SaaS platform designed to manage and distribute AI API access with robust budget controls. Its primary purpose is to empower organizations with granular control over their AI spending. The platform offers two core functionalities: Allotly Teams, which provides scoped AI Provider API keys with polling-based budget monitoring, and Allotly Vouchers, which enforces real-time, per-request budget limits through a thin proxy. Allotly aims to provide a comprehensive solution for managing AI resource consumption, optimizing costs, and ensuring compliance within various organizational structures.

## User Preferences
I prefer detailed explanations.
I want iterative development.
Ask before making major changes.
Do not make changes to the folder `Z`.
Do not make changes to the file `Y`.

## System Architecture
Allotly employs a modern web architecture. The frontend is built with React 18, Vite, wouter for routing, TanStack Query v5 for data fetching, and a design system leveraging Shadcn/ui and Tailwind CSS. Key UI/UX decisions include a primary color scheme of Indigo with Cyan as a secondary accent, specific colors for different AI providers (OpenAI, Anthropic, Google), and distinct status colors. The application supports dark mode and utilizes Inter and JetBrains Mono fonts. Brand components are modularized for reusability.

The backend is an Express.js application, utilizing express-session for session management and connect-pg-simple for PostgreSQL session storage. PostgreSQL serves as the primary database, managed through Drizzle ORM. Authentication is session-based with scrypt for password hashing. AI Provider API keys are secured using AES-256-GCM encryption. Stripe is integrated for payment processing via a custom `stripe-replit-sync` integration.

Core features include:
- **AI Provider Management**: Connections to various AI providers (OpenAI, Anthropic, Google) with different provisioning methods (full-auto, semi-auto, guided). Max 3 connections per plan.
- **Team and Member Management**: Role-based access control (ROOT_ADMIN, TEAM_ADMIN, MEMBER) enforced across all API routes. Functionality for adding, suspending, reactivating, and deleting members and teams, including budget allocation and tracking.
- **Voucher System**: Generation and management of voucher codes with customizable limits on redemptions, recipient budgets, proxy requests, and expiry. Supports different tiers (FREE, TEAM, BUNDLE) with varying capacities.
- **Budget Control & Enforcement**: Polling-based usage monitoring with plan-based intervals. Automatic budget alerts at 80%, 90%, and 100% thresholds, leading to key revocation upon budget exhaustion. A 110% safety net budget is provisioned on OpenAI to ensure Allotly's system triggers before provider-side limits.
- **Real-time Proxy**: A 12-step proxy lifecycle handling authentication, concurrency, rate limiting, request parsing, cost estimation, token clamping, budget reservation, forwarding to AI providers, response processing, and async logging. Includes request/response translation between different AI provider formats and SSE streaming passthrough.
- **Background Jobs**: A scheduler manages tasks such as usage polling, budget resets, voucher and bundle expiry, and Redis-Postgres reconciliation for budget consistency.
- **Audit Logging**: Comprehensive audit trail with filtering and export capabilities.
- **Stripe Integration**: Handles subscription and one-time purchases for Team Plans and Voucher Bundles, including webhook processing for lifecycle events like subscription updates and deletions.

All money values are handled in integer cents to avoid floating-point inaccuracies.

## External Dependencies
- **PostgreSQL**: Primary database for all application data.
- **Stripe**: Payment gateway for handling subscriptions (Team Plan) and one-time purchases (Voucher Bundles). Integrated via `stripe-replit-sync`.
- **OpenAI API**: For AI provider integration and usage.
- **Anthropic API**: For AI provider integration and usage.
- **Google AI API**: For AI provider integration and usage.
- **Redis**: Used for real-time budget counters, concurrency control, and rate limiting within the proxy. Falls back to an in-memory Map if not available.
- **Resend**: Integrated for sending transactional emails, with a console.log fallback for development.