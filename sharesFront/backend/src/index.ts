import express from 'express';
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
    
    // Rest of the query remains the same
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
    
    // Get total count first
    let countQuery = 'SELECT COUNT(*) FROM sensitive_files WHERE share_id = $1';
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
    
    // Get paginated data
    let query = 'SELECT * FROM sensitive_files WHERE share_id = $1';
    const params: any[] = [id];
    
    if (detection_type && detection_type !== 'all') {
      params.push(detection_type);
      query += ` AND detection_type = $${params.length}`;
    }
    
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (file_name ILIKE $${params.length} OR file_path ILIKE $${params.length})`;
    }
    
    query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
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
    // Get total shares
    const sharesResult = await pool.query('SELECT COUNT(*) FROM shares');
    const totalShares = parseInt(sharesResult.rows[0].count);

    // Get total sensitive files
    const sensitiveResult = await pool.query('SELECT COUNT(*) FROM sensitive_files');
    const totalSensitiveFiles = parseInt(sensitiveResult.rows[0].count);

    // Get total hidden files
    const hiddenResult = await pool.query('SELECT SUM(hidden_files) FROM shares');
    const totalHiddenFiles = parseInt(hiddenResult.rows[0].sum || '0');

    // Calculate risk score
    const riskQuery = `
      SELECT 
        ROUND(
          (
            (COUNT(DISTINCT sf.share_id)::float / NULLIF(COUNT(DISTINCT s.id), 0)::float) * 50 +
            (SUM(s.hidden_files)::float / NULLIF(SUM(s.total_files), 0)::float) * 50
          )::numeric,
          1
        ) as risk_score
      FROM shares s
      LEFT JOIN sensitive_files sf ON s.id = sf.share_id
    `;
    const riskResult = await pool.query(riskQuery);
    const riskScore = parseFloat(riskResult.rows[0].risk_score || '0');

    // Get recent scans count (last 24 hours)
    const scansQuery = `
      SELECT COUNT(*) 
      FROM shares 
      WHERE scan_time > NOW() - INTERVAL '24 hours'
    `;
    const scansResult = await pool.query(scansQuery);
    const recentScans = parseInt(scansResult.rows[0].count);

    res.json({
      totalShares,
      totalSensitiveFiles,
      totalHiddenFiles,
      riskScore,
      recentScans,
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

// Get sensitive file details with pagination
app.get('/api/sensitive-files/details', async (req, res) => {
  try {
    const { page = '1', limit = '20' } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
    
    // Get total count
    const countResult = await pool.query('SELECT COUNT(*) FROM sensitive_files');
    const totalCount = parseInt(countResult.rows[0].count);
    
    // Get paginated sensitive files with share info
    const query = `
      SELECT 
        sf.*,
        s.hostname,
        s.share_name
      FROM sensitive_files sf
      JOIN shares s ON sf.share_id = s.id
      ORDER BY sf.created_at DESC
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

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
}); 