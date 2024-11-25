import express, { Request, Response, RequestHandler } from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import { Share, SensitiveFile, RootFile } from './types';

import dotenv from 'dotenv';
dotenv.config();

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
});

app.use(cors());
app.use(express.json());

// Get all shares with filtering
app.get('/api/shares', async (req, res) => {
  try {
    const { search, detection_type } = req.query;
    
    // First, let's check if there are any matching root files
    if (search) {
      const debugQuery = `
        SELECT COUNT(*) as count 
        FROM root_files 
        WHERE file_name ILIKE $1
      `;
      const debugResult = await pool.query(debugQuery, [`%${search}%`]);
      console.log(`Debug: Found ${debugResult.rows[0].count} matching root files for search "${search}"`);
    }
    
    // Build the base query
    let query = `
      SELECT 
        s.*,
        COUNT(DISTINCT CASE 
          WHEN ${detection_type ? `sf.detection_type = $3 AND` : ''} 
          sf.id IS NOT NULL THEN sf.id 
          END
        ) as sensitive_file_count
      FROM shares s
      LEFT JOIN sensitive_files sf ON s.id = sf.share_id
      WHERE 1=1
    `;
    
    const params: any[] = [];
    let paramIndex = 1;

    if (search) {
      query += ` AND (
        s.hostname ILIKE $${paramIndex} OR 
        s.share_name ILIKE $${paramIndex} OR
        EXISTS (
          SELECT 1 FROM sensitive_files sf2 
          WHERE sf2.share_id = s.id 
          AND (sf2.file_name ILIKE $${paramIndex} OR sf2.file_path ILIKE $${paramIndex})
        ) OR
        EXISTS (
          SELECT 1 FROM root_files rf 
          WHERE rf.share_id = s.id 
          AND rf.file_name ILIKE $${paramIndex}
        )
      )`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (detection_type && detection_type !== 'all') {
      params.push(detection_type);
    }

    query += ` GROUP BY s.id ORDER BY s.hostname, s.share_name`;

    // Add LIMIT clause if a positive limit is specified
    const limit = parseInt(req.query.limit as string);
    const page = parseInt(req.query.page as string) || 1;
    if (limit && limit > 0) {
      const offset = (page - 1) * limit;
      query += ` LIMIT ${limit} OFFSET ${offset}`;
    }

    console.log('Executing query:', query, 'with params:', params);
    const result = await pool.query(query, params);
    console.log(`Found ${result.rows.length} shares`);
    
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

const compareSessions: RequestHandler<{}, any, any, ScanSessionQuery> = async (req, res, next) => {
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
        added: sharesResult.rows.filter(r => r.change_type === 'added').length,
        removed: sharesResult.rows.filter(r => r.change_type === 'removed').length,
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

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
}); 