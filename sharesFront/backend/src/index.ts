import express, { Request, Response, RequestHandler, NextFunction } from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import { 
  Share, 
  SensitiveFile, 
  RootFile, 
  SensitivePattern, 
  AddPatternRequest, 
  UpdatePatternRequest 
} from './types';

import dotenv from 'dotenv';
dotenv.config();

import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { BearerStrategy } from 'passport-azure-ad';

// Add these types
interface User {
  id: number;
  username: string;
  email: string;
  password_hash?: string;
  is_admin: boolean;
}

// Add SafeUser type for responses
type SafeUser = Omit<User, 'password_hash'>;

// Add this to make TypeScript understand the user property in requests
declare global {
  namespace Express {
    interface User {
      id: number;
      username: string;
      email: string;
      password_hash?: string;
      is_admin: boolean;
    }
  }
}

// Remove session-related imports and add JWT secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-key';
const JWT_EXPIRES_IN = '24h';

const app = express();
const port = process.env.PORT || 3001;

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '5432'),
});

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('Error connecting to the database:', err.message);
    return;
  }
  console.log('Successfully connected to database');
  release();
  
  // Initialize Azure strategy after database connection is established
  initializeAzureStrategy().catch(console.error);
});

// Add CORS configuration before any routes
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  exposedHeaders: ['Set-Cookie']
}));
app.use(express.json());

// Remove session middleware and keep only passport initialization
app.use(passport.initialize());

// Passport configuration
passport.use(new LocalStrategy(
  {
    usernameField: 'username',
    passwordField: 'password',
  },
  async (username: string, password: string, done) => {
    console.log('LocalStrategy: Attempting authentication for username:', username);
    try {
      const result = await pool.query<User>(
        'SELECT * FROM users WHERE username = $1',
        [username]
      );

      const user = result.rows[0];
      console.log('LocalStrategy: User lookup result:', { userFound: !!user });

      if (!user) {
        console.log('LocalStrategy: User not found');
        return done(null, false, { message: 'Invalid username or password' });
      }

      if (!user.password_hash) {
        console.log('LocalStrategy: No password hash found');
        return done(null, false, { message: 'Invalid username or password' });
      }
      
      const isValid = await bcrypt.compare(password, user.password_hash);
      console.log('LocalStrategy: Password validation:', { isValid });

      if (!isValid) {
        console.log('LocalStrategy: Invalid password');
        return done(null, false, { message: 'Invalid username or password' });
      }

      console.log('LocalStrategy: Authentication successful');
      return done(null, user);
    } catch (err) {
      console.error('LocalStrategy: Error during authentication:', err);
      return done(err);
    }
  }
));

// Add JWT authentication middleware
const requireAuth: RequestHandler = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as User;
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }
};

// THIRD: Now add the setup endpoints
app.get('/api/setup/status', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT is_completed FROM setup_status LIMIT 1');
    res.json({ isCompleted: result.rows[0]?.is_completed || false });
  } catch (error) {
    console.error('Failed to check setup status:', error);
    res.status(500).json({ error: 'Failed to check setup status' });
  }
});

app.post('/api/setup', (async (req: Request, res: Response) => {
  const { admin, azure } = req.body;
  
  try {
    // Check if setup is already completed
    const setupResult = await pool.query(
      'SELECT is_completed FROM setup_status LIMIT 1'
    );
    
    if (setupResult.rows[0]?.is_completed) {
      return res.status(403).json({ error: 'Setup already completed' });
    }
    
    // Start transaction
    await pool.query('BEGIN');
    
    // Create admin user
    const hashedPassword = await bcrypt.hash(admin.password, 10);
    const userResult = await pool.query<User>(
      'INSERT INTO users (username, email, password_hash, is_admin) VALUES ($1, $2, $3, true) RETURNING *',
      [admin.username, admin.email, hashedPassword]
    );

    // If Azure is enabled, save Azure configuration
    if (azure?.isEnabled) {
      await pool.query(
        `INSERT INTO azure_config (
          client_id, 
          tenant_id, 
          client_secret, 
          redirect_uri, 
          is_enabled
        ) VALUES ($1, $2, $3, $4, $5)`,
        [
          azure.clientId,
          azure.tenantId,
          azure.clientSecret,
          azure.redirectUri,
          true
        ]
      );
    }
    
    // Mark setup as completed
    await pool.query(
      'INSERT INTO setup_status (is_completed, completed_at) VALUES (true, CURRENT_TIMESTAMP)'
    );
    
    await pool.query('COMMIT');

    // Create JWT token
    const user = userResult.rows[0];
    const token = jwt.sign(
      { 
        id: user.id,
        username: user.username,
        email: user.email,
        is_admin: user.is_admin 
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Return user info and token
    res.json({ 
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        is_admin: user.is_admin
      },
      token
    });
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Setup failed:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Setup failed' });
  }
}) as RequestHandler);

// Auth routes
app.post('/api/auth/login', (async (req: Request, res: Response, next: NextFunction) => {
  passport.authenticate('local', { session: false }, (err: Error | null, user: User | false, info: { message: string } | undefined) => {
    if (err) {
      return next(err);
    }
    
    if (!user) {
      return res.status(401).json({ message: info?.message || 'Invalid credentials' });
    }

    // Create JWT token
    const token = jwt.sign(
      { 
        id: user.id, 
        username: user.username, 
        email: user.email, 
        is_admin: user.is_admin 
      }, 
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    
    // Return user info and token
    res.json({ 
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        is_admin: user.is_admin
      },
      token 
    });
  })(req, res, next);
}) as RequestHandler);

app.post('/api/auth/register', 
  (async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { username, email, password } = req.body;
      
      // Check if setup is completed
      const setupResult = await pool.query(
        'SELECT is_completed FROM setup_status LIMIT 1'
      );
      
      const isSetupCompleted = setupResult.rows[0]?.is_completed;
      
      // If setup is completed, only allow admin to create new users
      if (isSetupCompleted && (!req.user || !req.user.is_admin)) {
        return res.status(403).json({ error: 'Only administrators can create new users' });
      }
      
      const hashedPassword = await bcrypt.hash(password, 10);
      
      const result = await pool.query<User>(
        `INSERT INTO users (username, email, password_hash, is_admin) 
         VALUES ($1, $2, $3, $4) 
         RETURNING *`,
        [username, email, hashedPassword, !isSetupCompleted] // First user is admin
      );
      
      // If this is the first user, mark setup as completed
      if (!isSetupCompleted) {
        await pool.query(
          `INSERT INTO setup_status (is_completed, completed_at) 
           VALUES (true, CURRENT_TIMESTAMP)`
        );
      }
      
      res.json({ user: result.rows[0] });
    } catch (err) {
      next(err);
    }
  }) as RequestHandler
);

app.post('/api/auth/logout', (_req, res) => {
  res.json({ success: true });
});

app.get('/api/auth/status', requireAuth, (req: Request, res: Response) => {
  res.json({ 
    isAuthenticated: true, 
    user: req.user 
  });
});

// Add Azure authentication endpoints BEFORE the global protection
app.get('/api/auth/azure/config', (async (_req: Request, res: Response) => {
  try {
    const config = await getAzureConfig();
    if (!config) {
      return res.json({ isEnabled: false });
    }
    
    res.json({
      isEnabled: true,
      clientId: config.client_id,
      tenantId: config.tenant_id,
      redirectUri: config.redirect_uri
    });
  } catch (err) {
    console.error('Failed to fetch Azure config:', err);
    res.status(500).json({ error: 'Failed to fetch Azure configuration' });
  }
}) as RequestHandler);

app.get('/api/auth/azure/callback', 
  (req, res, next) => {
    console.log('Azure callback hit:', {
      query: req.query,
      headers: req.headers
    });
    next();
  },
  passport.authenticate('azure-ad-bearer', { 
    session: false,
    failureRedirect: process.env.FRONTEND_URL || 'http://localhost:5173/login?error=auth_failed'  // Redirect to frontend with error
  }),
  (async (req: Request, res: Response) => {
    try {
      const { code } = req.query;
      
      if (!code) {
        return res.status(400).json({ error: 'No authorization code provided' });
      }

      // Get Azure config
      const config = await getAzureConfig();
      if (!config) {
        return res.status(500).json({ error: 'Azure configuration not found' });
      }

      // Create JWT token for the authenticated user
      const user = req.user as User;
      const token = jwt.sign(
        { 
          id: user.id,
          username: user.username,
          email: user.email,
          is_admin: user.is_admin 
        }, 
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      // Redirect to frontend with the token
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      res.redirect(`${frontendUrl}/login?token=${token}`);
    } catch (err) {
      console.error('Azure callback failed:', err);
      res.status(500).json({ error: 'Authentication callback failed' });
    }
  }) as RequestHandler
);

app.post('/api/auth/azure/token', (async (req: Request, res: Response) => {
  try {
    const { accessToken } = req.body; // Changed from token to accessToken
    
    if (!accessToken) {
      return res.status(400).json({ error: 'No access token provided' });
    }

    // Get Azure config
    const config = await getAzureConfig();
    if (!config) {
      return res.status(500).json({ error: 'Azure configuration not found' });
    }

    try {
      // Fetch user info from Microsoft Graph API
      const response = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch user info from Microsoft Graph');
      }

      const msUserInfo = await response.json();
      
      // Find or create user
      const userResult = await pool.query<User>(
        'SELECT * FROM users WHERE email = $1',
        [msUserInfo.mail || msUserInfo.userPrincipalName]
      );
      
      let user = userResult.rows[0];
      
      if (!user) {
        // Create new user
        const newUserResult = await pool.query<User>(
          `INSERT INTO users (
            username, 
            email, 
            azure_id,
            auth_provider,
            is_admin,
            is_active
          ) VALUES ($1, $2, $3, 'azure', false, true) 
          RETURNING *`,
          [
            msUserInfo.displayName || msUserInfo.userPrincipalName,
            msUserInfo.mail || msUserInfo.userPrincipalName,
            msUserInfo.id
          ]
        );
        user = newUserResult.rows[0];
      }

      // Create JWT token
      const jwtToken = jwt.sign(
        { 
          id: user.id,
          username: user.username,
          email: user.email,
          is_admin: user.is_admin 
        }, 
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      res.json({ 
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          is_admin: user.is_admin
        },
        token: jwtToken
      });
    } catch (error) {
      console.error('Error validating Azure token:', error);
      res.status(401).json({ error: 'Invalid Azure token' });
    }
  } catch (err) {
    console.error('Azure token validation failed:', err);
    res.status(500).json({ error: 'Authentication failed' });
  }
}) as RequestHandler);

// AFTER all auth routes, add the global protection
app.use('/api/*', requireAuth);

// Get all shares with filtering
app.get('/api/shares', async (req, res) => {
  try {
    const { search, detection_type, filter_type, filter_value, session_id, page, limit } = req.query;
    
    let paramIndex = 1;
    const params: any[] = [];

    // If session_id is provided, add it as first parameter
    if (session_id && session_id !== 'all') {
      params.push(session_id);
    }

    // Add filter conditions
    let filterCondition = '';
    if (filter_type && filter_type !== 'all' && filter_value) {
      params.push(`%${filter_value}%`);
      filterCondition = `AND s.${filter_type} ILIKE $${++paramIndex}`;
    }

    let query = `
      WITH filtered_shares AS (
        ${session_id && session_id !== 'all' 
          ? `
            -- When session is specified, show all shares from that session
            SELECT * FROM shares WHERE session_id = $1
          `
          : `
            -- Otherwise show latest shares
            SELECT DISTINCT ON (hostname, share_name) *
            FROM shares
            ORDER BY hostname, share_name, scan_time DESC
          `
        }
      ),
      filtered_sensitive_files AS (
        SELECT 
          sf.share_id,
          sf.id as file_id
        FROM sensitive_files sf
        ${detection_type && detection_type !== 'all' 
          ? `WHERE sf.detection_type = $${++paramIndex}` 
          : ''}
      )
      SELECT 
        s.*,
        COUNT(DISTINCT ff.file_id) as sensitive_file_count
      FROM filtered_shares s
      LEFT JOIN filtered_sensitive_files ff ON s.id = ff.share_id
      WHERE 1=1
      ${filterCondition}
      ${search ? `
        AND (
          s.hostname ILIKE $${++paramIndex}
          OR s.share_name ILIKE $${paramIndex}
          OR EXISTS (
            SELECT 1 
            FROM sensitive_files sf 
            WHERE sf.share_id = s.id 
            AND (
              sf.file_name ILIKE $${paramIndex}
              OR sf.file_path ILIKE $${paramIndex}
            )
          )
          OR EXISTS (
            SELECT 1 
            FROM root_files rf 
            WHERE rf.share_id = s.id 
            AND rf.file_name ILIKE $${paramIndex}
          )
        )
      ` : ''}
      GROUP BY 
        s.id, 
        s.hostname,
        s.share_name,
        s.access_level,
        s.error_message,
        s.total_files,
        s.total_dirs,
        s.hidden_files,
        s.scan_time,
        s.session_id
      HAVING ${detection_type && detection_type !== 'all' 
        ? 'COUNT(DISTINCT ff.file_id) > 0'
        : '1=1'}
      ORDER BY s.hostname, s.share_name
    `;

    // Add detection_type to params if it's specified
    if (detection_type && detection_type !== 'all') {
      params.push(detection_type);
    }

    // Add search parameter if specified
    if (search) {
      params.push(`%${search}%`);
    }

    // Debug logging
    console.log('Filter type:', filter_type);
    console.log('Filter value:', filter_value);
    console.log('Detection type:', detection_type);
    console.log('Search query:', search);
    console.log('Parameters:', params);
    console.log('Generated SQL:', query);

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Failed to fetch shares:', err);
    res.status(500).json({ error: 'Failed to fetch shares' });
  }
});

// Get sensitive files for a share with pagination
app.get('/api/shares/:id/sensitive-files', async (req, res) => {
  try {
    const { id } = req.params;
    const { detection_type, search, page = '1', limit = '100' } = req.query;
    
    // Calculate offset
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;
    
    // Get total count first (counting unique files)
    let countQuery = `
      SELECT COUNT(DISTINCT file_path) 
      FROM sensitive_files 
      WHERE share_id = $1
    `;
    const countParams: any[] = [id];
    
    if (detection_type && detection_type !== 'all') {
      countParams.push(detection_type);
      countQuery += ` AND detection_type = $${countParams.length}`;
    }
    
    if (search) {
      countParams.push(`%${search}%`);
      countQuery += ` AND (file_name ILIKE $${countParams.length} OR file_path ILIKE $${countParams.length})`;
    }
    
    const countResult = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);
    
    // Get paginated data with aggregated detection types
    let query = `
      SELECT 
        MIN(id) as id,
        share_id,
        file_name,
        file_path,
        array_agg(DISTINCT detection_type)::text[] as detection_types,
        MIN(created_at) as created_at
      FROM sensitive_files 
      WHERE share_id = $1
    `;
    const params: any[] = [id];
    
    if (detection_type && detection_type !== 'all') {
      params.push(detection_type);
      query += ` AND detection_type = $${params.length}`;
    }
    
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (file_name ILIKE $${params.length} OR file_path ILIKE $${params.length})`;
    }
    
    query += `
      GROUP BY share_id, file_name, file_path
      ORDER BY MIN(created_at) DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    params.push(limitNum, offset);
    
    const result = await pool.query(query, params);
    
    res.json({
      data: result.rows,
      pagination: {
        total: totalCount,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalCount / limitNum)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch sensitive files' });
  }
});

// Get root files for a share
app.get('/api/shares/:id/root-files', async (req, res) => {
  try {
    const { id } = req.params;
    const { page = '1', limit = '20' } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    // Get total count
    const countQuery = 'SELECT COUNT(*) FROM root_files WHERE share_id = $1';
    const countResult = await pool.query(countQuery, [id]);
    const totalCount = parseInt(countResult.rows[0].count);

    // Get paginated data
    const query = `
      SELECT * 
      FROM root_files 
      WHERE share_id = $1 
      ORDER BY file_size DESC
      LIMIT $2 OFFSET $3
    `;
    
    const result = await pool.query(query, [id, limit, offset]);
    
    res.json({
      data: result.rows,
      pagination: {
        total: totalCount,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        totalPages: Math.ceil(totalCount / parseInt(limit as string))
      }
    });
  } catch (err) {
    console.error('Failed to fetch root files:', err);
    res.status(500).json({ error: 'Failed to fetch root files' });
  }
});

// Add this new endpoint
app.get('/api/stats', async (req, res) => {
  try {
    // Get unique shares across all sessions
    const uniqueSharesQuery = `
      SELECT COUNT(DISTINCT concat(hostname, '/', share_name)) as count
      FROM shares
    `;
    const sharesResult = await pool.query(uniqueSharesQuery);
    const uniqueShares = parseInt(sharesResult.rows[0].count);

    // Get total shares (non-unique)
    const totalSharesQuery = 'SELECT COUNT(*) FROM shares';
    const totalSharesResult = await pool.query(totalSharesQuery);
    const totalShares = parseInt(totalSharesResult.rows[0].count);

    // Get unique sensitive files across all sessions
    const uniqueSensitiveQuery = `
      SELECT COUNT(DISTINCT concat(s.hostname, '/', s.share_name, '/', sf.file_path, '/', sf.file_name)) as count
      FROM sensitive_files sf
      JOIN shares s ON sf.share_id = s.id
    `;
    const sensitiveResult = await pool.query(uniqueSensitiveQuery);
    const uniqueSensitiveFiles = parseInt(sensitiveResult.rows[0].count);

    // Get total sensitive files (non-unique)
    const totalSensitiveQuery = 'SELECT COUNT(*) FROM sensitive_files';
    const totalSensitiveResult = await pool.query(totalSensitiveQuery);
    const totalSensitiveFiles = parseInt(totalSensitiveResult.rows[0].count);

    // Get unique hidden files count
    const uniqueHiddenQuery = `
      SELECT COUNT(DISTINCT concat(hostname, '/', share_name)) as count
      FROM shares
      WHERE hidden_files > 0
    `;
    const hiddenResult = await pool.query(uniqueHiddenQuery);
    const uniqueHiddenFiles = parseInt(hiddenResult.rows[0].count);

    // Get total hidden files
    const totalHiddenResult = await pool.query('SELECT SUM(hidden_files) FROM shares');
    const totalHiddenFiles = parseInt(totalHiddenResult.rows[0].sum || '0');

    // Calculate risk score (using unique counts)
    const riskQuery = `
      SELECT 
        ROUND(
          (
            (COUNT(DISTINCT concat(s.hostname, '/', s.share_name, '/', sf.file_path, '/', sf.file_name))::float / 
             NULLIF(COUNT(DISTINCT concat(s.hostname, '/', s.share_name)), 0)::float) * 50 +
            (COUNT(DISTINCT CASE WHEN s.hidden_files > 0 THEN concat(s.hostname, '/', s.share_name) END)::float / 
             NULLIF(COUNT(DISTINCT concat(s.hostname, '/', s.share_name)), 0)::float) * 50
          )::numeric,
          1
        ) as risk_score
      FROM shares s
      LEFT JOIN sensitive_files sf ON s.id = sf.share_id
    `;
    const riskResult = await pool.query(riskQuery);
    const riskScore = parseFloat(riskResult.rows[0].risk_score || '0');

    res.json({
      uniqueShares,
      totalShares,
      uniqueSensitiveFiles,
      totalSensitiveFiles,
      uniqueHiddenFiles,
      totalHiddenFiles,
      riskScore,
    });
  } catch (err) {
    console.error('Failed to fetch stats:', err);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Get detailed share information with pagination
app.get('/api/shares/details', async (req, res) => {
  try {
    const { page = '1', limit = '20' } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
    
    // Get total count
    const countResult = await pool.query('SELECT COUNT(*) FROM shares');
    const totalCount = parseInt(countResult.rows[0].count);
    
    // Get paginated shares with details
    const query = `
      SELECT 
        s.*,
        COUNT(DISTINCT sf.id) as sensitive_file_count
      FROM shares s
      LEFT JOIN sensitive_files sf ON s.id = sf.share_id
      GROUP BY s.id
      ORDER BY s.hostname, s.share_name
      LIMIT $1 OFFSET $2
    `;
    
    const result = await pool.query(query, [limit, offset]);
    
    res.json({
      data: result.rows,
      pagination: {
        total: totalCount,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        totalPages: Math.ceil(totalCount / parseInt(limit as string))
      }
    });
  } catch (err) {
    console.error('Failed to fetch share details:', err);
    res.status(500).json({ error: 'Failed to fetch share details' });
  }
});

// Add or update the getSensitiveFileDetails endpoint
app.get('/api/sensitive-files/details', async (req, res) => {
  try {
    const { page = '1', limit = '20' } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    // Get total count of unique files
    const countQuery = `
      SELECT COUNT(DISTINCT file_path) 
      FROM sensitive_files
    `;
    const countResult = await pool.query(countQuery);
    const totalCount = parseInt(countResult.rows[0].count);

    // Get paginated data with aggregated detection types
    const query = `
      SELECT 
        MIN(sf.id) as id,
        sf.file_name,
        sf.file_path,
        s.hostname,
        s.share_name,
        array_agg(DISTINCT sf.detection_type)::text[] as detection_types,
        MIN(sf.created_at) as created_at
      FROM sensitive_files sf
      JOIN shares s ON sf.share_id = s.id
      GROUP BY sf.file_name, sf.file_path, s.hostname, s.share_name
      ORDER BY MIN(sf.created_at) DESC
      LIMIT $1 OFFSET $2
    `;

    const result = await pool.query(query, [limit, offset]);

    res.json({
      data: result.rows,
      pagination: {
        total: totalCount,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        totalPages: Math.ceil(totalCount / parseInt(limit as string))
      }
    });
  } catch (err) {
    console.error('Failed to fetch sensitive file details:', err);
    res.status(500).json({ error: 'Failed to fetch sensitive file details' });
  }
});

// Get hidden file statistics with pagination
app.get('/api/shares/hidden-stats', async (req, res) => {
  try {
    const { page = '1', limit = '20' } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
    
    // Get total count
    const countResult = await pool.query('SELECT COUNT(*) FROM shares WHERE hidden_files > 0');
    const totalCount = parseInt(countResult.rows[0].count);
    
    // Get paginated hidden file stats
    const query = `
      SELECT 
        hostname,
        share_name,
        hidden_files,
        total_files,
        ROUND((hidden_files::float / NULLIF(total_files, 0) * 100)::numeric, 2) as hidden_percentage
      FROM shares
      WHERE hidden_files > 0
      ORDER BY hidden_files DESC
      LIMIT $1 OFFSET $2
    `;
    
    const result = await pool.query(query, [limit, offset]);
    
    res.json({
      data: result.rows,
      pagination: {
        total: totalCount,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        totalPages: Math.ceil(totalCount / parseInt(limit as string))
      }
    });
  } catch (err) {
    console.error('Failed to fetch hidden file stats:', err);
    res.status(500).json({ error: 'Failed to fetch hidden file stats' });
  }
});

// Get recent scan information with pagination
app.get('/api/scans/recent', async (req, res) => {
  try {
    const { page = '1', limit = '20' } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
    
    // Get total count
    const countResult = await pool.query('SELECT COUNT(*) FROM shares WHERE scan_time IS NOT NULL');
    const totalCount = parseInt(countResult.rows[0].count);
    
    // Get paginated scan info
    const query = `
      SELECT 
        s.*,
        COUNT(DISTINCT sf.id) as issues_found
      FROM shares s
      LEFT JOIN sensitive_files sf ON s.id = sf.share_id
      WHERE s.scan_time IS NOT NULL
      GROUP BY s.id
      ORDER BY s.scan_time DESC
      LIMIT $1 OFFSET $2
    `;
    
    const result = await pool.query(query, [limit, offset]);
    
    res.json({
      data: result.rows,
      pagination: {
        total: totalCount,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        totalPages: Math.ceil(totalCount / parseInt(limit as string))
      }
    });
  } catch (err) {
    console.error('Failed to fetch recent scans:', err);
    res.status(500).json({ error: 'Failed to fetch recent scans' });
  }
});

// Add this type at the top with other types
interface Activity {
  id: number;
  type: string;
  message: string;
  details: string;
  location: string;
  timestamp: string;
  severity: string;
}

// Add the activities endpoint
app.get('/api/activities', async (req, res) => {
  try {
    const { page = '1', limit = '5' } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
    
    // Query to get activities from various sources
    const query = `
      WITH combined_activities AS (
        -- Sensitive file detections
        SELECT 
          sf.id,
          'sensitive' as type,
          'New sensitive file detected' as message,
          CONCAT(sf.file_name, ' in ', s.share_name) as details,
          CONCAT(s.hostname, '/', s.share_name) as location,
          sf.created_at as timestamp,
          CASE 
            WHEN s.access_level = 'Full' THEN 'high'
            WHEN s.access_level = 'Write' THEN 'medium'
            ELSE 'low'
          END as severity
        FROM sensitive_files sf
        JOIN shares s ON sf.share_id = s.id
        
        UNION ALL
        
        -- Share scans
        SELECT 
          s.id,
          'scan' as type,
          'Share scan completed' as message,
          CONCAT(s.share_name, ' share analyzed') as details,
          CONCAT(s.hostname, '/', s.share_name) as location,
          s.scan_time as timestamp,
          'info' as severity
        FROM shares s
        WHERE s.scan_time IS NOT NULL
      )
      SELECT * FROM combined_activities
      ORDER BY timestamp DESC
      LIMIT $1 OFFSET $2
    `;

    // Get total count
    const countQuery = `
      WITH combined_activities AS (
        SELECT 1 FROM sensitive_files
        UNION ALL
        SELECT 1 FROM shares WHERE scan_time IS NOT NULL
      )
      SELECT COUNT(*) FROM combined_activities
    `;
    
    const [activities, countResult] = await Promise.all([
      pool.query(query, [limit, offset]),
      pool.query(countQuery)
    ]);

    const totalCount = parseInt(countResult.rows[0].count);
    
    res.json({
      data: activities.rows,
      pagination: {
        total: totalCount,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        totalPages: Math.ceil(totalCount / parseInt(limit as string))
      }
    });
  } catch (err) {
    console.error('Failed to fetch activities:', err);
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
});

app.get('/api/trends/detections', async (req, res) => {
  try {
    const query = `
      WITH RECURSIVE dates AS (
        SELECT 
          CURRENT_DATE - INTERVAL '29 days' AS date
        UNION ALL
        SELECT 
          date + INTERVAL '1 day'
        FROM 
          dates
        WHERE 
          date < CURRENT_DATE
      ),
      daily_counts AS (
        SELECT 
          DATE(created_at) as detection_date,
          detection_type,
          COUNT(*) as count
        FROM 
          sensitive_files
        WHERE 
          created_at >= CURRENT_DATE - INTERVAL '29 days'
        GROUP BY 
          DATE(created_at),
          detection_type
      )
      SELECT 
        dates.date::date as date,
        COALESCE(SUM(CASE WHEN detection_type = 'credential' THEN count ELSE 0 END), 0) as "credential",
        COALESCE(SUM(CASE WHEN detection_type = 'pii' THEN count ELSE 0 END), 0) as "pii",
        COALESCE(SUM(CASE WHEN detection_type = 'financial' THEN count ELSE 0 END), 0) as "financial",
        COALESCE(SUM(CASE WHEN detection_type = 'hr' THEN count ELSE 0 END), 0) as "hr",
        COALESCE(SUM(CASE WHEN detection_type = 'security' THEN count ELSE 0 END), 0) as "security",
        COALESCE(SUM(CASE WHEN detection_type = 'sensitive' THEN count ELSE 0 END), 0) as "sensitive"
      FROM 
        dates
      LEFT JOIN 
        daily_counts ON dates.date = daily_counts.detection_date
      GROUP BY 
        dates.date
      ORDER BY 
        dates.date ASC;
    `;

    const result = await pool.query(query);
    
    // Format the data for the chart
    const data = result.rows.map(row => ({
      date: row.date.toISOString().split('T')[0],
      credential: parseInt(row.credential),
      pii: parseInt(row.pii),
      financial: parseInt(row.financial),
      hr: parseInt(row.hr),
      security: parseInt(row.security),
      sensitive: parseInt(row.sensitive)
    }));

    res.json(data);
  } catch (err) {
    console.error('Failed to fetch detection trends:', err);
    res.status(500).json({ error: 'Failed to fetch detection trends' });
  }
});

// Add the scan sessions endpoints
app.get('/api/scan-sessions', async (req, res) => {
  try {
    const query = `
      SELECT * 
      FROM scan_sessions 
      ORDER BY start_time DESC
    `;
    
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error('Failed to fetch scan sessions:', err);
    res.status(500).json({ error: 'Failed to fetch scan sessions' });
  }
});

interface ScanSessionQuery {
  session1?: string;
  session2?: string;
}

interface FileChange {
  file_name: string;
  file_path: string;
  old_detection_type: string | null;
  new_detection_type: string | null;
  change_type: 'added' | 'removed' | 'modified';
}

const compareSessions: RequestHandler<{}, any, any, ScanSessionQuery> = async (req, res) => {
  try {
    const { session1, session2 } = req.query;
    
    if (!session1 || !session2) {
      res.status(400).json({ error: 'Both session IDs are required' });
      return;
    }

    // Get shares comparison
    const sharesQuery = `
      WITH session1_shares AS (
        SELECT 
          s.id as share_id,
          s.hostname,
          s.share_name,
          s.access_level,
          COUNT(DISTINCT sf.file_path) as sensitive_files,
          s.hidden_files,
          s.total_files
        FROM shares s
        LEFT JOIN sensitive_files sf ON s.id = sf.share_id
        WHERE s.session_id = $1
        GROUP BY s.id
      ),
      session2_shares AS (
        SELECT 
          s.id as share_id,
          s.hostname,
          s.share_name,
          s.access_level,
          COUNT(DISTINCT sf.file_path) as sensitive_files,
          s.hidden_files,
          s.total_files
        FROM shares s
        LEFT JOIN sensitive_files sf ON s.id = sf.share_id
        WHERE s.session_id = $2
        GROUP BY s.id
      )
      SELECT 
        COALESCE(s1.hostname, s2.hostname) as hostname,
        COALESCE(s1.share_name, s2.share_name) as share_name,
        s1.share_id as session1_share_id,
        s2.share_id as session2_share_id,
        s1.access_level as session1_access_level,
        s2.access_level as session2_access_level,
        s1.sensitive_files as session1_sensitive_files,
        s2.sensitive_files as session2_sensitive_files,
        s1.hidden_files as session1_hidden_files,
        s2.hidden_files as session2_hidden_files,
        s1.total_files as session1_total_files,
        s2.total_files as session2_total_files,
        CASE 
          WHEN s1.hostname IS NULL THEN 'added'
          WHEN s2.hostname IS NULL THEN 'removed'
          WHEN s1.sensitive_files != s2.sensitive_files OR 
               s1.hidden_files != s2.hidden_files OR 
               s1.total_files != s2.total_files OR
               s1.access_level != s2.access_level THEN 'modified'
          ELSE 'unchanged'
        END as change_type
      FROM session1_shares s1
      FULL OUTER JOIN session2_shares s2 
        ON s1.hostname = s2.hostname 
        AND s1.share_name = s2.share_name
      WHERE s1.hostname IS NULL 
        OR s2.hostname IS NULL 
        OR s1.sensitive_files != s2.sensitive_files
        OR s1.hidden_files != s2.hidden_files
        OR s1.total_files != s2.total_files
        OR s1.access_level != s2.access_level
      ORDER BY 
        CASE 
          WHEN s1.hostname IS NULL THEN 1
          WHEN s2.hostname IS NULL THEN 2
          ELSE 3
        END,
        hostname,
        share_name
    `;

    const sharesResult = await pool.query(sharesQuery, [session1, session2]);

    // Get file-level changes for modified shares
    const fileChangesPromises = sharesResult.rows.map(async (share) => {
      if (share.change_type === 'modified') {
        // Compare sensitive files
        const sensitiveFilesQuery = `
          WITH session1_files AS (
            SELECT 
              sf.file_name, 
              sf.file_path,
              array_agg(DISTINCT sf.detection_type) as detection_types
            FROM sensitive_files sf
            JOIN shares s ON sf.share_id = s.id
            WHERE s.id = $1
            GROUP BY sf.file_name, sf.file_path
          ),
          session2_files AS (
            SELECT 
              sf.file_name, 
              sf.file_path,
              array_agg(DISTINCT sf.detection_type) as detection_types
            FROM sensitive_files sf
            JOIN shares s ON sf.share_id = s.id
            WHERE s.id = $2
            GROUP BY sf.file_name, sf.file_path
          )
          SELECT 
            COALESCE(f1.file_name, f2.file_name) as file_name,
            COALESCE(f1.file_path, f2.file_path) as file_path,
            f1.detection_types as old_detection_types,
            f2.detection_types as new_detection_types,
            CASE 
              WHEN f1.file_name IS NULL THEN 'added'
              WHEN f2.file_name IS NULL THEN 'removed'
              WHEN f1.detection_types != f2.detection_types THEN 'modified'
            END as change_type
          FROM session1_files f1
          FULL OUTER JOIN session2_files f2 
            ON f1.file_name = f2.file_name 
            AND f1.file_path = f2.file_path
          WHERE f1.file_name IS NULL 
            OR f2.file_name IS NULL 
            OR f1.detection_types != f2.detection_types
        `;
        
        const fileChanges = await pool.query(
          sensitiveFilesQuery, 
          [share.session1_share_id, share.session2_share_id]
        );
        
        return {
          ...share,
          file_changes: fileChanges.rows
        };
      }
      return share;
    });

    const sharesWithFileChanges = await Promise.all(fileChangesPromises);

    // Get session details
    const sessionsQuery = `
      SELECT id, start_time, end_time, total_hosts, total_shares, 
             total_sensitive_files, scan_status
      FROM scan_sessions
      WHERE id IN ($1, $2)
    `;
    const sessionsResult = await pool.query(sessionsQuery, [session1, session2]);

    res.json({
      sessions: sessionsResult.rows,
      differences: sharesWithFileChanges,
      summary: {
        total_differences: sharesResult.rows.length,
        added: sharesResult.rows.filter(r => r.change_type === 'added').length +
               sharesWithFileChanges.reduce((acc, share) => 
                 acc + (share.file_changes?.filter((f: FileChange) => f.change_type === 'added').length || 0), 0),
        removed: sharesResult.rows.filter(r => r.change_type === 'removed').length +
                sharesWithFileChanges.reduce((acc, share) => 
                  acc + (share.file_changes?.filter((f: FileChange) => f.change_type === 'removed').length || 0), 0),
        modified: sharesResult.rows.filter(r => r.change_type === 'modified').length,
        files_added: sharesWithFileChanges.reduce((acc, share) => 
          acc + (share.file_changes?.filter((f: FileChange) => f.change_type === 'added').length || 0), 0),
        files_removed: sharesWithFileChanges.reduce((acc, share) => 
          acc + (share.file_changes?.filter((f: FileChange) => f.change_type === 'removed').length || 0), 0),
        files_modified: sharesWithFileChanges.reduce((acc, share) => 
          acc + (share.file_changes?.filter((f: FileChange) => f.change_type === 'modified').length || 0), 0)
      }
    });
  } catch (err) {
    console.error('Failed to compare scan sessions:', err);
    res.status(500).json({ error: 'Failed to compare scan sessions' });
  }
};

app.get('/api/scan-sessions/compare', compareSessions);

// Get share structure with files
app.get('/api/shares/:id/structure', async (req, res) => {
  try {
    const { id } = req.params;
    const { page = '1', limit = '10' } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    // Get share statistics with a single query
    const statsQuery = `
      SELECT 
        COUNT(DISTINCT rf.id) as total_files,
        COUNT(DISTINCT sf.id) as total_sensitive
      FROM shares s
      LEFT JOIN root_files rf ON s.id = rf.share_id
      LEFT JOIN sensitive_files sf ON s.id = sf.share_id
      WHERE s.id = $1
    `;
    
    // Get paginated files with a LIMIT clause
    const filesQuery = `
      WITH combined_files AS (
        SELECT 
          rf.id,
          rf.file_name,
          '' as file_path,
          false as is_sensitive,
          ARRAY[]::text[] as detection_types,
          rf.file_size,
          rf.created_time
        FROM root_files rf
        WHERE rf.share_id = $1
        
        UNION ALL
        
        SELECT 
          sf.id,
          sf.file_name,
          sf.file_path,
          true as is_sensitive,
          array_agg(DISTINCT sf.detection_type)::text[] as detection_types,
          0 as file_size,
          sf.created_at as created_time
        FROM sensitive_files sf
        WHERE sf.share_id = $1
        GROUP BY sf.id, sf.file_name, sf.file_path, sf.created_at
      )
      SELECT * FROM combined_files
      ORDER BY created_time DESC
      LIMIT $2 OFFSET $3
    `;

    const [statsResult, filesResult] = await Promise.all([
      pool.query(statsQuery, [id]),
      pool.query(filesQuery, [id, limit, offset])
    ]);

    res.json({
      files: filesResult.rows,
      total_files: parseInt(statsResult.rows[0].total_files),
      total_sensitive: parseInt(statsResult.rows[0].total_sensitive)
    });
  } catch (err) {
    console.error('Failed to fetch share structure:', err);
    res.status(500).json({ error: 'Failed to fetch share structure' });
  }
});

// Get all sensitive patterns
app.get('/api/settings/sensitive-patterns', async (req, res) => {
  try {
    const query = `
      SELECT id, pattern, type, description, enabled, 
             created_at, updated_at
      FROM sensitive_patterns
      ORDER BY type, pattern
    `;
    console.log('Executing query:', query); // Debug log
    const result = await pool.query(query);
    console.log('Query result:', result.rows); // Debug log
    res.json(result.rows);
  } catch (err) {
    console.error('Failed to fetch sensitive patterns:', err);
    res.status(500).json({ error: 'Failed to fetch sensitive patterns' });
  }
});

// Add new sensitive pattern
app.post('/api/settings/sensitive-patterns', async (req: Request<{}, {}, AddPatternRequest>, res: Response) => {
  try {
    const { pattern, type, description } = req.body;
    const query = `
      INSERT INTO sensitive_patterns (pattern, type, description)
      VALUES ($1, $2, $3)
      RETURNING id, pattern, type, description, enabled, created_at, updated_at
    `;
    const result = await pool.query<SensitivePattern>(query, [pattern, type, description]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Failed to add sensitive pattern:', err);
    res.status(500).json({ error: 'Failed to add sensitive pattern' });
  }
});

// Update sensitive pattern
app.put('/api/settings/sensitive-patterns/:id', async (req: Request<{id: string}, {}, UpdatePatternRequest>, res: Response) => {
  try {
    const { id } = req.params;
    const { pattern, type, description, enabled } = req.body;
    const query = `
      UPDATE sensitive_patterns 
      SET pattern = $1, type = $2, description = $3, enabled = $4, 
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING id, pattern, type, description, enabled, created_at, updated_at
    `;
    const result = await pool.query<SensitivePattern>(query, [pattern, type, description, enabled, id]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Failed to update sensitive pattern:', err);
    res.status(500).json({ error: 'Failed to update sensitive pattern' });
  }
});

// Delete sensitive pattern
app.delete('/api/settings/sensitive-patterns/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const query = 'DELETE FROM sensitive_patterns WHERE id = $1';
    await pool.query(query, [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete sensitive pattern:', err);
    res.status(500).json({ error: 'Failed to delete sensitive pattern' });
  }
});

// Add these imports at the top if not already present
import { createWriteStream, createReadStream } from 'fs';
import { join } from 'path';
import archiver from 'archiver';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';

// Define the interface for export query parameters
interface ExportQuery {
  session_id?: string;
  include_sensitive?: string;
  include_root?: string;
  include_shares?: string;
}

// Update the export endpoint with proper typing
const handleExport: RequestHandler<{}, any, any, ExportQuery> = async (req, res, next) => {
  try {
    const { 
      session_id, 
      include_sensitive, 
      include_root, 
      include_shares 
    } = req.query;

    if (!session_id) {
      res.status(400).json({ error: 'Session ID is required' });
      return;
    }

    // Create temporary directory
    const tempDir = await mkdtemp(join(tmpdir(), 'export-'));
    const archive = archiver('zip', { zlib: { level: 9 } });
    const zipPath = join(tempDir, `export_${session_id}_${Date.now()}.zip`);
    const output = createWriteStream(zipPath);

    // Set up archive events and promise to track completion
    const archiveFinished = new Promise((resolve, reject) => {
      output.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(output);
    });

    // Get session info for metadata
    const sessionQuery = `
      SELECT * FROM scan_sessions WHERE id = $1
    `;
    const sessionResult = await pool.query(sessionQuery, [session_id]);
    const session = sessionResult.rows[0];

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // Add metadata file
    const metadata = {
      exported_at: new Date().toISOString(),
      session_id: session_id,
      session_start: session.start_time,
      session_end: session.end_time,
      included_data: {
        sensitive_files: include_sensitive === 'true',
        root_files: include_root === 'true',
        shares: include_shares === 'true'
      }
    };
    archive.append(JSON.stringify(metadata, null, 2), { name: 'metadata.json' });

    // Export shares if requested
    if (include_shares === 'true') {
      const sharesQuery = `
        SELECT * FROM shares WHERE session_id = $1
      `;
      const sharesResult = await pool.query(sharesQuery, [session_id]);
      archive.append(JSON.stringify(sharesResult.rows, null, 2), { name: 'shares.json' });
    }

    // Export sensitive files if requested
    if (include_sensitive === 'true') {
      const sensitiveQuery = `
        SELECT 
          sf.*,
          s.hostname,
          s.share_name,
          CONCAT(s.hostname, '/', s.share_name, '/', sf.file_path, '/', sf.file_name) as full_path
        FROM sensitive_files sf
        JOIN shares s ON sf.share_id = s.id
        WHERE s.session_id = $1
        ORDER BY s.hostname, s.share_name, sf.file_path, sf.file_name
      `;
      const sensitiveResult = await pool.query(sensitiveQuery, [session_id]);
      
      // Transform the data to include hierarchical path information
      const sensitiveFiles = sensitiveResult.rows.map(row => ({
        id: row.id,
        hostname: row.hostname,
        share_name: row.share_name,
        file_path: row.file_path,
        file_name: row.file_name,
        full_path: row.full_path,
        detection_type: row.detection_type,
        created_at: row.created_at,
        updated_at: row.updated_at
      }));
      
      archive.append(JSON.stringify(sensitiveFiles, null, 2), { name: 'sensitive_files.json' });
    }

    // Export root files if requested
    if (include_root === 'true') {
      const rootQuery = `
        SELECT 
          rf.*,
          s.hostname,
          s.share_name,
          CONCAT(s.hostname, '/', s.share_name, '/', rf.file_name) as full_path
        FROM root_files rf
        JOIN shares s ON rf.share_id = s.id
        WHERE s.session_id = $1
        ORDER BY s.hostname, s.share_name, rf.file_name
      `;
      const rootResult = await pool.query(rootQuery, [session_id]);
      
      // Transform the data to include hierarchical path information
      const rootFiles = rootResult.rows.map(row => ({
        id: row.id,
        hostname: row.hostname,
        share_name: row.share_name,
        file_name: row.file_name,
        file_type: row.file_type,
        file_size: row.file_size,
        attributes: row.attributes,
        full_path: row.full_path,
        created_time: row.created_time,
        modified_time: row.modified_time
      }));
      
      archive.append(JSON.stringify(rootFiles, null, 2), { name: 'root_files.json' });
    }

    // Finalize archive
    archive.finalize();

    // Wait for archive to finish
    await archiveFinished;

    // Set response headers
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=export_${session_id}_${Date.now()}.zip`);

    // Stream the file to response
    const readStream = createReadStream(zipPath);
    readStream.pipe(res);

    // Clean up after sending
    res.on('finish', async () => {
      try {
        await rm(tempDir, { recursive: true });
      } catch (error) {
        console.error('Error cleaning up temp directory:', error);
      }
    });

  } catch (err) {
    console.error('Export failed:', err);
    res.status(500).json({ error: 'Failed to export data' });
    return;
  }
};

// Register the endpoint
app.get('/api/export', handleExport);

// Add these types
interface AzureConfig {
  client_id: string;
  tenant_id: string;
  client_secret: string;
  redirect_uri: string;
  is_enabled: boolean;
  allowed_groups: string;
}

// Add this after the pool connection test and before the CORS configuration
// Function to get Azure config from database
async function getAzureConfig(): Promise<AzureConfig | null> {
  try {
    const result = await pool.query<AzureConfig>(
      'SELECT * FROM azure_config WHERE is_enabled = true LIMIT 1'
    );
    return result.rows[0] || null;
  } catch (err) {
    console.error('Error fetching Azure config:', err);
    return null;
  }
}

// Initialize Azure AD Bearer Strategy
async function initializeAzureStrategy() {
  const azureConfig = await getAzureConfig();
  
  if (!azureConfig) {
    console.warn('Azure AD authentication is not configured');
    return;
  }

  const bearerStrategy = new BearerStrategy({
    identityMetadata: `https://login.microsoftonline.com/${azureConfig.tenant_id}/v2.0/.well-known/openid-configuration`,
    clientID: azureConfig.client_id,
    validateIssuer: true,
    issuer: `https://login.microsoftonline.com/${azureConfig.tenant_id}/v2.0`,
    passReqToCallback: false,
    scope: ['user.read', 'GroupMember.Read.All']
  }, async (token: any, done: any) => {
    try {
      // Check if user exists in database
      const result = await pool.query<User>(
        'SELECT * FROM users WHERE azure_id = $1 OR email = $2',
        [token.oid, token.email]
      );

      let user = result.rows[0];

      if (!user) {
        // Verify user's group membership using Microsoft Graph API
        const graphResponse = await fetch('https://graph.microsoft.com/v1.0/me/memberOf', {
          headers: {
            'Authorization': `Bearer ${token.access_token}`,
            'Content-Type': 'application/json'
          }
        });

        if (!graphResponse.ok) {
          console.error('Failed to fetch group membership');
          return done(null, false, { message: 'Failed to verify group membership' });
        }

        const groups = await graphResponse.json();
        const allowedGroup = azureConfig.allowed_groups?.split(',').map(g => g.trim());
        const isInAllowedGroup = groups.value.some((group: any) => 
          allowedGroup?.includes(group.id) || allowedGroup?.includes(group.displayName)
        );

        if (!isInAllowedGroup) {
          console.log('User not in allowed group:', token.email);
          return done(null, false, { message: 'User not in allowed group' });
        }

        // Auto-create user account since they're in the allowed group
        const newUserResult = await pool.query<User>(
          `INSERT INTO users (
            username, 
            email, 
            azure_id, 
            auth_provider,
            is_admin,
            is_active
          ) VALUES ($1, $2, $3, 'azure', false, true) 
          RETURNING *`,
          [
            token.preferred_username || token.email,
            token.email,
            token.oid
          ]
        );
        user = newUserResult.rows[0];
        console.log('Created new user account for:', token.email);
      }

      return done(null, user, token);
    } catch (err) {
      console.error('Azure authentication error:', err);
      return done(err);
    }
  });

  passport.use('azure-ad-bearer', bearerStrategy);
  console.log('Azure AD Bearer Strategy initialized successfully');
}

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
}); 