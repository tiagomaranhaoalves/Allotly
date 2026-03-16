# Allotly — The AI Spend Control Plane

## Overview
Allotly is a SaaS platform designed for managing and distributing AI API access with real-time budget controls. It operates on a unified v4 proxy architecture, routing both team-based and voucher-based access through a single proxy. The platform issues unique `allotly_sk_` keys to users and handles all metering per-request at the proxy layer, eliminating the need for provider Admin API provisioning or usage polling. Key features include monthly resetting budgets for teams and fixed, expiring budgets for vouchers. The project's vision is to provide a robust, self-serve spend control plane for AI API consumption, targeting businesses and individual developers seeking efficient budget management and granular control over AI resource usage.

## User Preferences
- Detailed explanations preferred
- Iterative development
- Ask before making major changes
- Do not make changes to the folder `Z`
- Do not make changes to the file `Y`

## System Architecture
Allotly utilizes a React 18 frontend with Vite, wouter for routing, TanStack Query v5, Shadcn/ui, and Tailwind CSS. The backend is built with Express.js and uses PostgreSQL via Drizzle ORM. The core of the system is the v4 Unified Proxy, which enforces real-time, per-request budget controls by reserving budget before forwarding requests and refunding overages. Pricing is calculated as `costCents = ceil(tokens * pricePerMTok / 1_000_000)`. UI/UX design follows a dark mode theme with Indigo and Cyan as primary colors, Inter for UI text, and JetBrains Mono for code. All monetary values are handled in integer cents to prevent floating-point inaccuracies. The system incorporates robust Role-Based Access Control (RBAC) across all routes, Zod validation for inputs, and an append-only audit log for comprehensive event tracking. Key entity operations (Organizations, Teams, Members, Vouchers) support full CRUD, including sophisticated cascade delete logic to ensure data integrity and atomicity via database transactions. Advanced member management features include transfers, role changes, bulk suspend/reactivate/delete, and invite resending. Voucher lifecycle management supports bulk creation, extension, top-up, enhanced revocation, and CSV export.

## External Dependencies
- **Payments**: Stripe (for subscriptions and one-time payments)
- **Email**: Resend (with `allotly.ai` domain verification and `onboarding@resend.dev` fallback)
- **AI Providers**: OpenAI, Anthropic, Google (API keys encrypted with AES-256-GCM)
- **Cache/Realtime**: Redis (for budget counters, concurrency, rate limiting, with in-memory Map fallback)