# Deployment Guide

## Prerequisites
- Node.js 18+
- npm
- Vercel CLI
- GitHub account

## Local Development Setup
```bash
npm install
npm run dev
```

## Environment Variables
Create a `.env.local` file:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
API_KEY=your_secret_key
```

## Vercel CLI Deployment Steps
```bash
npm i -g vercel
vercel
```

## GitHub Integration
1. Push your code to GitHub.
2. Go to Vercel Dashboard.
3. Import your repository.
4. Vercel automatically deploys every push to the `main` branch.

## Custom Domain Setup
In Vercel project settings, go to "Domains" and add your custom domain.

## Monitoring and Logs
Vercel provides real-time logs in the "Deployments" tab.

## Troubleshooting Common Issues
- **Build Failures**: Check Node.js version in Vercel settings.
- **API Errors**: Ensure environment variables are set correctly in the Vercel dashboard.
