// Authentication Middleware
// Validates Azure AD tokens and extracts tenant/user info

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

// Extend Express Request with user info
declare global {
  namespace Express {
    interface Request {
      tenantId?: string;
      userId?: string;
      userEmail?: string;
      userName?: string;
    }
  }
}

// JWKS client for Azure AD token validation
const client = jwksClient({
  jwksUri: 'https://login.microsoftonline.com/common/discovery/v2.0/keys',
  cache: true,
  rateLimit: true,
});

// Get signing key from Azure AD
const getKey = (header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) => {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      callback(err);
    } else {
      const signingKey = key?.getPublicKey();
      callback(null, signingKey);
    }
  });
};

// Development mode - skip validation for testing
const DEV_MODE = process.env.NODE_ENV === 'development' && process.env.SKIP_AUTH === 'true';

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Development mode - use mock data
    if (DEV_MODE) {
      req.tenantId = req.headers['x-tenant-id'] as string || '00000000-0000-4000-a000-000000000001';
      req.userId = req.headers['x-user-id'] as string || '00000000-0000-4000-a000-000000000002';
      req.userEmail = req.headers['x-user-email'] as string || 'dev@localhost';
      req.userName = req.headers['x-user-name'] as string || 'Dev User';
      return next();
    }

    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);

    // Verify token
    jwt.verify(
      token,
      getKey,
      {
        algorithms: ['RS256'],
        audience: process.env.AZURE_CLIENT_ID,
      },
      (err: jwt.VerifyErrors | null, decoded: jwt.JwtPayload | string | undefined) => {
        if (err) {
          console.error('Token validation error:', err);
          return res.status(401).json({ error: 'Invalid token' });
        }

        const payload = decoded as jwt.JwtPayload;

        // Validate issuer for multi-tenant (any Azure AD tenant)
        const issuer = payload.iss || '';
        if (!issuer.startsWith('https://login.microsoftonline.com/') || !issuer.endsWith('/v2.0')) {
          return res.status(401).json({ error: 'Invalid token issuer' });
        }

        // Extract tenant and user info from token
        req.tenantId = payload.tid; // Azure tenant ID
        req.userId = payload.oid; // Azure user object ID
        req.userEmail = payload.preferred_username || payload.email;
        req.userName = payload.name;

        next();
      }
    );
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
};

// Optional: Admin-only middleware
export const adminMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Check if user has admin role in their tenant
  // This would query the database to check user role
  // For now, allow all authenticated users
  next();
};
